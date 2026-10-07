#!/usr/bin/env node
// BROWSE YOURSELF (B-6ae8, docs/design-browse-yourself.md + the owner's decisions of 2026-09-28 — "我其实也相当于是一个agent
// 而已"): the USER is one more holder of a profile's browser, on HIS OWN pinned tab. The fast gate (the chrome one is
// test-browser-human-ui):
//   ① PURE src/browser-human.js — the key (derived, never a browser key), browseYourselfVerdict (every refusal in its
//      order, both orders where two apply; "Who can use it" is not an input; a join never counts the ceiling), the
//      lifecycle table (his own tab never lapses by the idle clock; the keep while away), the attach verdict (the window
//      his press opened claims; another live window keeps it; else take), the two end buttons (Close / Quit the whole
//      browser + the confirm naming the conversations), the address row (web only), THE ACTS (a click, a drag, a chord,
//      a typing burst as a LENGTH — never the text —, a paste, a scroll, a touch tap), the digest's holder row;
//      patched-copy CONTROLS (scripts/mutant-copy.mjs): a verdict that asks "Who can use it", one that counts the
//      ceiling on a join, one that allows a paired machine's profile, a lifecycle whose idle clock lapses his tab, an act
//      step that keeps the typed text;
//   ② the REAL keeper + routes over a fake agent-browser 0.38.1 (per-session daemons, a profile lock): Browse on a stopped
//      profile ⇒ ONE launch, his session joins over CDP (never the directory), `tab new` under vs-hu-…; Browse on a
//      profile an agent runs ⇒ no second launch, and the agent is NOT paused (its /resolve answers, no takeover event, no
//      card, no notice — the owner's 2); the address row (open / back / forward / reload / tab) under HIS session only,
//      `file:` / `chrome:` refused by name; Close ⇒ his tabs close under his session, the browser stays, the idle clock
//      starts; Quit ⇒ the browser stops, he ends `stopped`; the keep (a fake clock): he launched ⇒ 12 h, the browser never
//      idles out meanwhile, then `left`; he joined ⇒ 10 min; a narrowing of "Who can use it", Delete…, a backend switch
//      (a proposal), a mediated profile (no grant for his key — a spy on the mediator), the ceiling, the refusals;
//      CONTROL: a keeper copy whose idle clock reads the leases only stops the browser under his page;
//   ②b the REAL bridge over a fake upstream: `?browse=` resolves his target; the window his press opened takes the
//      controls; a second window watches (`elsewhere`), its input refused, its "Continue here" (`claim`) moves them; the
//      holder's window closing ⇒ he is away (no agent touched); a tab change on his window forwards input (NO anchor)
//      while the same change on an agent takeover relay is refused `tab_switched` (the control); his ACTS reach the
//      recorder's tap (one click = one pair, typing = a length) and never a viewer; `human-end` tells every window why;
//   ③ CENSUSES: no chat card / notice / delivery / inbox item for a human lifecycle (a spy on every seam; CONTROL: an
//      onSession that matches by profile); recorded like an agent's by default — his entries carry holder:user, never
//      the typed words (a scan of every trace file), the opt-out writes none (CONTROL: the default writes some); the
//      holder census over every `reg.leases` site of the keeper; no agent route or agent CLI reaches his browsing;
//   ④ the words: every new key in en through the module and in zh + ja from the dictionaries.
// ~6 s, port 0, scratch dirs only, no real browser, no vendor call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const HM = require('../src/browser-human.js');
const B = require('../src/browser-profiles.js');
const BS = require('../src/browser-sessions.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const S = require('../src/browser-stream.js');
const T = require('../src/browser-takeover.js');
const express = require('express');
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(15); } return !!(await f()); };
const J = (x) => JSON.stringify(x);

const ROOT = scratch('browser-human');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const servers = [];
function cleanup() {
  for (const s of servers) { try { s.close(); } catch { } }
  try { for (const l of fs.readFileSync(path.join(ROOT, 'ab', 'daemons.log'), 'utf8').trim().split('\n').filter(Boolean)) { try { process.kill(JSON.parse(l).pid, 'SIGKILL'); } catch { } } } catch { /* none */ }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const M = mutantCopies('browser-human', REPO);

const P1 = 'bp-0000e001', HU1 = 'hu-0000e001';
const KA = 'bk-0000e0a1', KB = 'bk-0000e0a2';

// ═══ ① PURE ═══════════════════════════════════════════════════════════════════
console.log('— ① PURE: the key, the verdict, the lifecycle, the attach, the end buttons, the address row, the acts, the row');
function pureLegs(H, tag = '') {
  const legs = [];
  const leg = (c, n, extra) => legs.push({ c: !!c, n: tag + n, extra });
  // the key
  leg(H.humanKeyFor(P1) === HU1 && H.humanKeyFor('bk-0000e001') === null && H.humanKeyFor('../x') === null && H.isHumanKey(HU1) && !H.isHumanKey('hu-0000E001') && H.profileOfHumanKey(HU1) === P1 && H.profileOfHumanKey(KA) === null && H.humanSyncId(P1) === 'win-bhuman-' + P1,
    'the key is DERIVED from the profile id (hu- + its 8 hex), the sync id is deterministic (two clients, one window)');
  leg(!B.BROWSER_KEY_RE.test(HU1) && !B.CHILD_KEY_RE.test(HU1) && !B.isBrowserKey(HU1) && !B.isChildKey(HU1) && BS.chatCardsFor([{ id: 'bs-00000001', browserKey: HU1, startAt: 1, endAt: 2, holder: 'user' }], HU1).length === 0,
    'a human key NEVER matches a browser key or a child key — every path that gates on one rejects it by construction (the chat cards too)');
  // the verdict
  const P = (x = {}) => ({ id: P1, label: 'Work', provider: 'chromium', owner: { kind: 'instance', id: null }, ...x });
  const base = { profile: P(), row: { starts: true }, control: { ok: true }, switching: false, closed: null, live: false, human: null, running: 0, cap: 6 };
  const V = (x = {}) => H.browseYourselfVerdict({ ...base, ...x });
  const rows = [
    ['not-found', { profile: null }],
    ['not_attachable', { profile: P({ ephemeral: true }) }],
    ['remote_profile', { profile: P({ host: 'dev-1' }), hostKnown: false }], // lane remote-profile-start: a machine no longer paired (a known one is browsed)
    ['not_ours', { row: { starts: false } }],
    ['not_ours', { row: { starts: true, leaseKind: 'window-target' } }],
    ['backend_unavailable', { control: { ok: false, error: 'cloakbrowser is not installed' } }],
    ['browser_restarting', { switching: true }],
    ['profile_locked', { closed: { code: 'profile_locked', holderPid: 4242 } }],
    ['browser_unstable', { closed: { code: 'browser_unstable' } }],
    ['cap', { running: 6 }],
  ];
  const bad = rows.filter(([code, x]) => V(x).ok || V(x).code !== code).map(([code, x]) => [code, V(x)]);
  leg(!bad.length && H.REFUSAL_CODES.join() === 'not-found,not_attachable,remote_profile,not_ours,backend_unavailable,browser_restarting,profile_locked,browser_unstable,cap', `every refusal code, each named (${rows.length} rows)`, bad);
  const order = [
    ['an ephemeral record on a paired machine ⇒ not_attachable', { profile: P({ ephemeral: true, host: 'dev-1' }) }, 'not_attachable'],
    ['a no-longer-paired machine\'s profile at the ceiling ⇒ remote_profile', { profile: P({ host: 'dev-1' }), hostKnown: false, running: 9 }, 'remote_profile'],
    ['a cdp profile whose control refuses ⇒ not_ours', { row: { starts: false }, control: { ok: false } }, 'not_ours'],
    ['mid-switch and locked ⇒ browser_restarting', { switching: true, closed: { code: 'profile_locked', holderPid: 1 } }, 'browser_restarting'],
    ['locked while he drives it from a live window ⇒ profile_locked (never a focus on a browser another program holds)', { closed: { code: 'profile_locked', holderPid: 1 }, human: { state: 'driving', alive: true }, live: true }, 'profile_locked'],
    ['unstable at the ceiling ⇒ browser_unstable', { closed: { code: 'browser_unstable' }, running: 9 }, 'browser_unstable'],
  ];
  const badOrder = order.filter(([, x, want]) => V(x).code !== want).map(([n, x]) => [n, V(x).code]);
  leg(!badOrder.length, `the ORDER is the decision — both orders where two apply (${order.length})`, badOrder);
  const pid = V({ closed: { code: 'profile_locked', holderPid: 4242 } });
  leg(pid.pid === 4242 && /pid 4242/.test(pid.error) && /your own Chrome/.test(pid.error) && /Close it first/.test(pid.error), 'profile_locked names the pid and says it may be his own Chrome', pid.error);
  const onlyX = V({ profile: P({ owner: { kind: 'only', who: [{ kind: 'session', id: KA }] } }) });
  leg(onlyX.ok && onlyX.how === 'launch' && onlyX.key === HU1 && onlyX.syncId === 'win-bhuman-' + P1, '"Who can use it" is NOT an input — a profile kept to "Only chat X" is still his to browse (launch)', onlyX);
  leg(V({ live: true, running: 6 }).ok && V({ live: true, running: 6 }).how === 'join' && V({ live: false, running: 6 }).code === 'cap' && V({ live: false, running: 5 }).how === 'launch', 'a JOIN at 6/6 is ok (a join never counts the ceiling); a LAUNCH at 6/6 is `cap`, at 5/6 it launches');
  leg(V({ live: true, human: { state: 'driving', alive: true } }).how === 'focus' && V({ live: true, human: { state: 'driving', alive: false } }).how === 'rejoin' && V({ live: true, human: { state: 'away', alive: false } }).how === 'rejoin', 'a live window of his drives it ⇒ focus (not an error); away / a dead window ⇒ rejoin (his tab kept)');
  leg(!('interrupts' in V()) && !('confirm' in V()), 'no `interrupts`, no confirm — browsing his own tab pauses nobody (the owner, 2)');
  // the lifecycle
  const st = (s, e) => { const r = H.humanStep(s, e); return r.state + ':' + r.effects.join('+'); };
  const TABLE = [
    ['away', 'attach', 'driving:take'], ['away', { kind: 'attach', fresh: true }, 'driving:take'],
    ['driving', { kind: 'attach', fresh: true }, 'driving:claim'], ['driving', { kind: 'attach', held: true }, 'driving:watch'], ['driving', { kind: 'attach', held: false }, 'driving:take'],
    ['driving', 'viewer-left', 'away:away-clock'], ['away', 'viewer-left', 'away:'],
    ['driving', 'idle', 'driving:'], ['driving', { kind: 'idle', siblingWaits: true }, 'driving:'], ['away', 'idle', 'away:'],
    ['away', 'away-timeout', 'ended:close-tab+end:left'], ['driving', 'away-timeout', 'driving:'],
    ['driving', 'close', 'ended:close-tab+end:released'], ['away', 'close', 'ended:close-tab+end:released'],
    ['driving', 'stop', 'ended:end:stopped'], ['away', 'stop', 'ended:end:stopped'], ['ended', 'attach', 'ended:'],
  ];
  const badStep = TABLE.filter(([s, e, want]) => st(s, e) !== want).map(([s, e, want]) => `${s} + ${J(e)} ⇒ ${st(s, e)} (want ${want})`);
  leg(!badStep.length && H.endReasonOf(H.humanStep('away', 'away-timeout')) === 'left' && H.endReasonOf(H.humanStep('driving', 'idle')) === null, `every cell of the lifecycle (${TABLE.length}) — his own tab NEVER lapses by the idle clock (nobody to give it back to), the keep ends it only while away`, badStep);
  leg(H.awayExpired({ state: 'away', awaySince: 0, now: 12 * 3600e3, keepMs: 12 * 3600e3 }) && !H.awayExpired({ state: 'away', awaySince: 0, now: 12 * 3600e3 - 1, keepMs: 12 * 3600e3 }) && !H.awayExpired({ state: 'driving', awaySince: 0, now: 99e9, keepMs: 1 }) && !H.awayExpired({ state: 'away', awaySince: 0, now: 99e9, keepMs: 0 }), 'the keep: away ≥ keep ⇒ expired; driving never; 0 = never');
  leg(H.keepFor({ launched: true, keepMs: 43200000, joinKeepMs: 600000 }) === 43200000 && H.keepFor({ launched: false, keepMs: 43200000, joinKeepMs: 600000 }) === 600000 && H.humanKeepMs(undefined) === 12 * 3600e3 && H.humanKeepMs('x') === 12 * 3600e3 && H.humanKeepMs(0) === 0 && H.humanKeepMs(5) === 60000 && H.HUMAN_KEEP_SETTING === 'browser.humanKeepMs', 'the owner\'s 8: he LAUNCHED the browser ⇒ browser.humanKeepMs (12 h default, 0 = never, ≥ 1 min); he JOINED one an agent launched ⇒ the 10-min takeover idle');
  // the attach
  const A = (x) => { const v = H.humanAttachVerdict(x); return `${v.take}:${v.how}`; };
  leg(A({ fresh: true, driving: false }) === 'true:take' && A({ fresh: true, driving: true, holderAlive: true }) === 'true:claim' && A({ fresh: false, driving: true, holderAlive: true }) === 'false:watch' && A({ fresh: false, driving: true, holderAlive: false }) === 'true:take' && A({ fresh: false, driving: false }) === 'true:take',
    'the attach: the window his press opened takes (or CLAIMS from his other live window); another live window keeps them (this one watches); a dead holder or nobody ⇒ take');
  // the end buttons
  const e0 = H.humanEndChoices({ conversations: 0, idleMs: 15 * 60000 }), e2 = H.humanEndChoices({ conversations: 2, names: ['Fix login', 'Report'], idleMs: 15 * 60000 });
  leg(e0.close.label === 'Close' && e0.quit.label === 'Quit the whole browser' && e0.line === 'After Close, it closes by itself in 15 min if nothing uses it.' && e0.confirm === null
    && e2.line === 'Fix login, Report also uses this browser — Close leaves it running for them.' && e2.confirm && e2.confirm.title === 'Quit the whole browser?' && /Fix login, Report also uses this browser\. Quitting closes their pages too/.test(e2.confirm.message) && e2.confirm.danger === true,
    'the two ends (the owner, 5): Close (his tab; the browser stays and idles out) + Quit the whole browser — its ONE confirm names the conversations that lose their pages; none on it ⇒ no confirm', { e0, e2 });
  // the address row
  const AD = [['https://example.com/a?b=1', 'https://example.com/a?b=1'], ['example.com', 'https://example.com/'], ['localhost:3000/x', 'http://localhost:3000/x'], ['127.0.0.1:8080', 'http://127.0.0.1:8080/'], ['about:blank', 'about:blank'], ['HTTP://Example.COM', 'http://example.com/']];
  const REF = ['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'data:text/html,x', 'view-source:https://x.com', 'about:version', 'hello world', 'intranet', '', 'devtools://devtools/x'];
  const badAd = AD.filter(([i, want]) => { const v = H.addressVerdict(i); return !v.ok || v.url !== want; }).map(([i]) => [i, H.addressVerdict(i)]);
  const badRef = REF.filter((i) => { const v = H.addressVerdict(i); return v.ok || v.code !== 'not_web' || v.error !== 'Only web addresses'; });
  leg(!badAd.length && !badRef.length, `the address row: web addresses only (${AD.length} kept, a bare host gains its scheme) — file: / chrome: / javascript: / data: / view-source: / about:version and words refused by name (${REF.length})`, { badAd, badRef });
  const nv = (x) => H.navArgv(x, { pinTab: true });
  leg(J(nv({ url: 'example.com' }).argv) === J(['--pin-tab', 'open', 'https://example.com/']) && J(nv({ verb: 'back' }).argv) === J(['--pin-tab', 'back']) && J(nv({ tab: '3C29E2367925ACAEF6C7D270B4F3EF05' }).argv) === J(['tab', '3C29E2367925ACAEF6C7D270B4F3EF05']) && J(nv({ tab: 't5' }).argv) === J(['tab', 't5']) && nv({ verb: 'close' }).code === 'bad-request' && nv({ tab: 'x; rm -rf' }).code === 'bad-request' && nv({ url: 'file:///x' }).code === 'not_web',
    'navArgv: open / back / forward / reload under --pin-tab, a tab by its t<N> or target id — nothing else');
  // the acts
  const run = (recs, { now0 = 1000, flushAt = null } = {}) => { let s = H.newActState(); const acts = []; let t = now0; for (const r of recs) { t += 50; const x = H.humanActStep(s, r, t); s = x.state; acts.push(...x.acts); } if (flushAt !== null) { const f = H.humanActFlush(s, t + flushAt); s = f.state; acts.push(...f.acts); } return { acts, state: s }; };
  const click = run([S.mouseRecord({ kind: 'move', pt: { x: 1, y: 1 } }), S.mouseRecord({ kind: 'down', pt: { x: 120, y: 340 } }), S.mouseRecord({ kind: 'up', pt: { x: 122, y: 341 } })]);
  const drag = run([S.mouseRecord({ kind: 'down', pt: { x: 10, y: 10 } }), S.mouseRecord({ kind: 'move', pt: { x: 60, y: 10 }, held: 0 }), S.mouseRecord({ kind: 'up', pt: { x: 200, y: 10 } })]);
  const secret = 'hunter2!';
  const typing = run([...Array.from(secret).map((c) => S.keyRecord({ kind: 'down', key: c })), S.keyRecord({ kind: 'down', key: 'Backspace' }), S.keyRecord({ kind: 'up', key: 'a' })], { flushAt: H.TYPE_IDLE_MS });
  const chord = run([S.keyRecord({ kind: 'down', key: 'x' }), S.keyRecord({ kind: 'down', key: 'a', modifiers: 2 }), S.keyRecord({ kind: 'down', key: 'Enter' }), S.keyRecord({ kind: 'down', key: 'Shift', modifiers: 8 })]);
  const paste = run([{ type: 'input_text', text: 'my password 😀' }]);
  const wheel = run([S.wheelRecord({ pt: { x: 5, y: 6 }, deltaY: 100 }), S.wheelRecord({ pt: { x: 5, y: 6 }, deltaY: 140 })], { flushAt: H.WHEEL_IDLE_MS });
  const tap = run([S.touchRecord({ kind: 'start', pt: { x: 30, y: 40 } }), S.touchRecord({ kind: 'end', pt: { x: 30, y: 40 } })]);
  const all = [click, drag, typing, chord, paste, wheel, tap].flatMap((x) => x.acts);
  leg(J(click.acts) === J([{ action: 'mouseclick', params: { x: 120, y: 340, button: 'left' } }]), 'a press + a release within 5 px ⇒ ONE `mouseclick` at the page point (a move is no act)', click.acts);
  leg(J(drag.acts.map((a) => a.action)) === J(['mousedown', 'mouseup']) && drag.acts[1].params.x === 200, 'farther ⇒ a drag, two points (`mousedown` / `mouseup`)', drag.acts);
  leg(typing.acts.length === 1 && typing.acts[0].action === 'type' && typing.acts[0].params.text === '•'.repeat(secret.length) && !J(typing).includes('hunter'), 'a burst of typing (Backspace part of it) ⇒ ONE `type` whose text is placeholders of the typed LENGTH — the words never leave the step', typing.acts);
  leg(J(chord.acts) === J([{ action: 'type', params: { text: '•' } }, { action: 'press', params: { key: 'Control+A' } }, { action: 'press', params: { key: 'Enter' } }]), 'a chord closes the typing burst and is `press Control+A`; a named key `press Enter`; a modifier alone is nothing', chord.acts);
  leg(paste.acts.length === 1 && paste.acts[0].action === 'type' && paste.acts[0].params.text === '•'.repeat(Array.from('my password 😀').length) && !J(paste.acts).includes('password'), 'a paste / an IME commit ⇒ ONE `type` of its length (code points), never its text', paste.acts);
  leg(J(wheel.acts) === J([{ action: 'scroll', params: { direction: 'down', amount: 240, x: 5, y: 6 } }]) && H.humanActDueIn(run([S.wheelRecord({ pt: { x: 1, y: 1 }, deltaY: 3 })]).state, 0) !== null, 'a burst of wheel ⇒ ONE `scroll` (direction + amount) once it goes quiet; an open burst says when its flush is due', wheel.acts);
  leg(J(tap.acts) === J([{ action: 'mouseclick', params: { x: 30, y: 40, button: 'left' } }]), 'a touch tap is a click at its point', tap.acts);
  const T0 = require('../src/browser-trace.js');
  leg(all.every((a) => T0.classifyAction(a.action) !== null) && T0.redactParams('type', { text: '••••' }).text === '«4 chars»', 'every act is an action the recorder TRACES (src/browser-trace.js), a typed length is kept as «N chars»', all.map((a) => a.action));
  // the row
  const h = { key: HU1, profileId: P1, since: 5, state: 'away', awaySince: 9, launched: true, keepMs: 43200000 };
  const row = H.humanHolderRow(h, { viewers: 2 });
  leg(row && row.human === true && row.holder === 'user' && row.sessionId === null && row.browserKey === HU1 && row.input === 'agent' && row.state === 'away' && row.awaySince === 9 && row.launched === true && row.viewers === 2 && H.humanHolderRow({ ...h, key: 'hu-0000e002' }) === null && H.humanHolderRow({ ...h, key: KA }) === null, 'the digest row: human, holder user, NO session id, his state; a key that is not this profile\'s ⇒ no row', row);
  const hr = B.holderRows({ leases: [{ profileId: P1, browserKey: KA, sessionId: 's1' }], profiles: [{ id: P1, label: 'Work', owner: { kind: 'instance' } }, { id: 'bp-0000e0ee', label: '(ephemeral) x', ephemeral: true, owner: { kind: 'conversation', id: KB } }], browsers: {}, humans: [row, { ...row, profileId: 'bp-0000e0ee', browserKey: 'hu-0000e0ee' }, { ...row, profileId: 'bp-0000dead', browserKey: 'hu-0000dead' }] });
  leg(hr.length === 2 && hr[1].human && hr[1].sessionId === null && hr[0].browserKey === KA, 'holderRows: the conversations\' leases + HIS row on a named profile (never on an ephemeral record, never on a profile that is gone)', hr);
  leg(H.recordsMine({}) === true && H.recordsMine({ recordMine: false }) === false && H.recordsMine(null) === false, '"Also record my own actions" is an opt-OUT: absent = ON (the owner, 4)');
  return legs;
}
{
  const legs = pureLegs(HM);
  for (const l of legs) ok(l.c, l.n, l.c ? undefined : l.extra);
  // CONTROLS — each patched copy of the PURE module turns its leg red
  const src = fs.readFileSync(path.join(REPO, 'src/browser-human.js'), 'utf8');
  const controls = [
    ['asks-who-list', "  if (!key) return no('not-found');", "  if (!key) return no('not-found');\n  if (p.owner && p.owner.kind === 'only') return no('not_ours');", /Who can use it/],
    ['join-counts-ceiling', "  if (!live && num(running) >= (num(cap) || 6)) return no('cap', { n: num(running) });", "  if (num(running) >= (num(cap) || 6)) return no('cap', { n: num(running) });", /JOIN at 6\/6/],
    ['allows-remote', "  if (p.host && hostKnown === false) return no('remote_profile', { machine: str(p.host) });", '', /every refusal code|ORDER is the decision/],
    ['idle-lapses-his-tab', "    case 'idle': return { state: s, effects: [] };", "    case 'idle': return s === 'driving' ? { state: 'away', effects: ['away-clock'] } : { state: s, effects: [] };", /NEVER lapses by the idle clock/],
    ['keeps-the-text', "const PLACEHOLDER = '•';", "const PLACEHOLDER = '•';\nconst __keep = true;", null],
  ];
  for (const [name, needle, repl, mustRed] of controls) {
    if (!src.includes(needle)) { ok(false, `CONTROL ${name}: its needle is gone from src/browser-human.js`); continue; }
    if (name === 'keeps-the-text') {
      // the typed words must never survive the step: a copy that carries the real text reddens the typing / paste legs
      const Hk = M.load('src/browser-human.js', src.replace("  if (r.type === 'input_text') { flushWheel(st, acts); flushTyping(st, acts); const n = Array.from(str(r.text)).length; if (n) acts.push({ action: 'type', params: { text: PLACEHOLDER.repeat(Math.min(20000, n)) } }); return done(); }", "  if (r.type === 'input_text') { flushWheel(st, acts); flushTyping(st, acts); if (str(r.text)) acts.push({ action: 'type', params: { text: str(r.text) } }); return done(); }"), name);
      const red = pureLegs(Hk, `[${name}] `).filter((x) => !x.c);
      ok(red.some((x) => /paste/.test(x.n)), `CONTROL ${name}: a step that keeps a paste's TEXT turns the paste leg red`, red.map((x) => x.n));
      continue;
    }
    const Hm = M.load('src/browser-human.js', src.replace(needle, repl), name);
    const red = pureLegs(Hm, `[${name}] `).filter((x) => !x.c);
    ok(red.some((x) => mustRed.test(x.n)), `CONTROL ${name}: the patched copy turns its leg RED (${red.map((x) => x.n.replace(/^\[[^\]]+\] /, '').slice(0, 60)).join(' | ')})`);
  }
}

// verify r1 (H2): what the trace keeps of his keys and his URLs — PURE, each with a patched-copy control
{
  const T0 = require('../src/browser-trace.js');
  const keys = (H, key, mods) => { const r = H.humanActStep(null, { type: 'input_keyboard', eventType: 'keyDown', key, code: 'KeyQ', text: key, modifiers: mods }); return r.acts.concat(H.humanActFlush(r.state, 1e12, { force: true }).acts).map((a) => T0.redactParams(a.action, a.params)); };
  const shown = (H) => J([keys(H, '@', 3), keys(H, '€', 3), keys(H, '™', 1), keys(H, 'å', 1)]);
  ok(!/[@€™å]/.test(shown(HM)) && J(keys(HM, 'a', 2)) === J([{ key: 'Control+A' }]) && J(keys(HM, 'c', 4)) === J([{ key: 'Meta+C' }]),
    'verify r1 (H2): a character made WITH Alt — AltGr on Windows (Ctrl+Alt: "@", "€"), a Mac\'s Option ("™", "å") — is typed text, recorded as its LENGTH; a Ctrl / ⌘ chord stays a chord (Control+A, Meta+C)', shown(HM));
  const hsrc = fs.readFileSync(path.join(REPO, 'src/browser-human.js'), 'utf8');
  const hneedle = "    const typed = printable && (!chord || ((mods & MOD.alt) !== 0 && (mods & MOD.meta) === 0));";
  const Hc = M.load('src/browser-human.js', hsrc.replace(hneedle, '    const typed = printable && !chord;'), 'alt-chars-as-chords');
  ok(hsrc.includes(hneedle) && /Control\+Alt\+@/.test(shown(Hc)) && /Alt\+™/.test(shown(Hc)), 'CONTROL: the pre-fix act step names the AltGr / Option character in the chord (`press Control+Alt+@`, `press Alt+™`) — red', shown(Hc));
  const cred = { id: 'tr-000000000001', at: 1, browserKey: 'hu-0000e001', profileId: P1, command: { action: 'open', params: { url: 'https://alice:hunter2pw@bank.example/login?session=abc' } }, result: { success: false, error: 'net::ERR_ABORTED at https://alice:hunter2pw@bank.example/login' }, position: T0.positionOf({ kind: 'navigation', params: { url: 'https://alice:hunter2pw@bank.example/login?session=abc' } }), url: 'https://alice:hunter2pw@bank.example/home', holder: 'user' };
  const e0 = T0.entryFor(cred);
  ok(!J(e0).includes('hunter2pw') && e0.params.url === 'https://bank.example/login?«cut»' && e0.url === 'https://bank.example/home' && /bank\.example/.test(e0.error) && T0.withoutUserinfo('mailto:a@b.example') === 'mailto:a@b.example' && T0.withoutUserinfo('http://h.example/p@q') === 'http://h.example/p@q',
    'verify r1 (H2): a URL\'s credentials never reach a trace entry — params, text, the page url and the error say the page without `user:pass@` (a mailto, an @ in a path untouched)', e0);
  const tsrc = fs.readFileSync(path.join(REPO, 'src/browser-trace.js'), 'utf8');
  const Tc = M.load('src/browser-trace.js', tsrc.replace("function withoutUserinfo(v) { return typeof v === 'string' ?", "function withoutUserinfo(v) { return v; return typeof v === 'string' ?"), 'userinfo-kept');
  ok(J(Tc.entryFor(cred)).includes('hunter2pw'), 'CONTROL: a trace copy that keeps URLs as typed stores the password — red');
  // verify r2 (#7, r1's HELD query secrets re-judged — cut): a URL whose query / fragment NAMES a credential-shaped key keeps
  // its scheme, host and path and loses the whole query (fragment) — for EVERY navigation, an agent's too; by the key's
  // WORDS (allowlist-free), so `postcode` / `keyword` / `next` stay
  const QS = [
    ['https://a.example/cb?code=4%2F0AXq&state=xyz', 'https://a.example/cb?«cut»'], // an OAuth redirect (code + state)
    ['https://a.example/cb#access_token=ya29.Z&token_type=Bearer', 'https://a.example/cb#«cut»'], // the implicit flow
    ['https://app.example/magic?token=eyJhbGci', 'https://app.example/magic?«cut»'], // a magic link
    ['https://s3.example/b/o.pdf?X-Amz-Credential=AKIA%2F&X-Amz-Signature=9f3c', 'https://s3.example/b/o.pdf?«cut»'], // a presigned URL
    ['https://maps.example/api?key=AIzaSyQ&q=pizza', 'https://maps.example/api?«cut»'], ['https://h.example/p?apiKey=123', 'https://h.example/p?«cut»'],
    ['https://bank.example/in?session=abc', 'https://bank.example/in?«cut»'], ['https://h.example/r?client_secret=s&x=1', 'https://h.example/r?«cut»'],
    ['https://shop.example/find?postcode=94107&keyword=shoes', 'https://shop.example/find?postcode=94107&keyword=shoes'], // no key of that shape
    ['https://x.test/login?next=%2F', 'https://x.test/login?next=%2F'], ['https://h.example/doc#section-2', 'https://h.example/doc#section-2'],
    ['net::ERR_ABORTED at https://a.example/cb?code=Z1 (a redirect)', 'net::ERR_ABORTED at https://a.example/cb?«cut» (a redirect)'], // inside an error
    ['https://alice:pw@h.example/cb?token=t', 'https://h.example/cb?«cut»'], // both cuts
    // verify r3 (#6): a redirector's VALUE carrying a magic link / an OAuth callback percent-encoded (an email click-tracker,
    // an SSO `continue=`) names a credential too; a value that is no address, or one naming none, stays
    ['https://mail.example/click?url=https%3A%2F%2Fapp.example%2Fmagic%3Ftoken%3DSECRET1', 'https://mail.example/click?«cut»'],
    ['https://sso.example/login?continue=https%3A%2F%2Fapp.example%2Fcb%3Fcode%3DSECRET2%26state%3Dx', 'https://sso.example/login?«cut»'],
    ['https://sso.example/login?next=%2Fcb%3Foob_code%3DSECRET3', 'https://sso.example/login?«cut»'], ['https://h.example/r?to=https%3A%2F%2Fa.example%2Fdone%23access_token%3DZ', 'https://h.example/r?«cut»'],
    // verify r3 (the revert table: each stayed green reverted alone): a camelCase key that is not itself a word of the set, an
    // encoded key NAME (the server decodes it), the `;` separator
    ['https://h.example/p?accessToken=Z9', 'https://h.example/p?«cut»'], ['https://h.example/p?%63ode=Z9', 'https://h.example/p?«cut»'], ['https://h.example/p?a=1;token=Z9', 'https://h.example/p?«cut»'],
    ['https://x.example/?next=%2Fhome&tab=2', 'https://x.example/?next=%2Fhome&tab=2'], ['https://x.example/go?url=https%3A%2F%2Fdocs.example%2Fp%3Fq%3Dpizza', 'https://x.example/go?url=https%3A%2F%2Fdocs.example%2Fp%3Fq%3Dpizza'],
    // verify r4 (the revert table: each stayed green reverted alone): the value rule's own BOUNDS — two levels deep (a
    // third is not decoded), 4 KiB of a value at most (a name past it is not read) — and a malformed escape in a value
    // is kept as typed (never a throw out of the recorder)
    ['https://x.example/a?u=%2Fb%3Fv%3D%252Fc%253Fw%253D%25252Fd%25253Ftoken%25253DDEEP3', 'https://x.example/a?u=%2Fb%3Fv%3D%252Fc%253Fw%253D%25252Fd%25253Ftoken%25253DDEEP3'],
    ['https://x.example/a?u=%2Fb%3Fv%3D%252Fc%253Ftoken%253DDEEP2', 'https://x.example/a?«cut»'],
    [`https://x.example/g?u=%2F${'p'.repeat(4100)}%3Ftoken%3DFAR`, `https://x.example/g?u=%2F${'p'.repeat(4100)}%3Ftoken%3DFAR`],
    ['https://x.example/p?q=100%&next=%2Fhome', 'https://x.example/p?q=100%&next=%2Fhome'],
  ];
  const qbad = QS.filter(([i, o]) => T0.withoutUrlSecrets(i) !== o).map(([i, o]) => ({ i, want: o, got: T0.withoutUrlSecrets(i) }));
  const agentOpen = T0.entryFor({ id: 'tr-000000000002', at: 2, browserKey: 'bk-0000e0a1', sessionId: 'sess-a', profileId: P1, command: { action: 'open', params: { url: 'https://a.example/cb?code=SECRETCODE42&state=s' } }, result: { success: true }, position: T0.positionOf({ kind: 'navigation', params: { url: 'https://a.example/cb?code=SECRETCODE42&state=s' } }), url: 'https://a.example/cb?code=SECRETCODE42&state=s' });
  ok(!qbad.length && !J(agentOpen).includes('SECRETCODE42') && agentOpen.params.url === 'https://a.example/cb?«cut»' && /a\.example\/cb\?«cut»/.test(agentOpen.text), `verify r2 (#7): a URL whose query / fragment names a credential-shaped key loses its query in every trace entry — ${QS.length} shapes (OAuth code, the implicit flow's fragment, a magic link, a presigned URL, an API key, a session, a client secret; postcode / keyword / next kept) — an AGENT's open too (params, text, position, page url)`, { qbad, agentOpen: agentOpen.params });
  // verify r3 (the revert table): the ERROR field of an entry went through entryFor unpinned for the query cut
  const errE = T0.entryFor({ id: 'tr-0000000000e1', at: 4, browserKey: 'bk-0000e0a1', profileId: P1, command: { action: 'open', params: { url: 'https://a.example/x' } }, result: { success: false, error: 'net::ERR_ABORTED at https://a.example/cb?code=ERRCODE9&state=s' } });
  ok(!J(errE).includes('ERRCODE9') && /a\.example\/cb\?«cut»/.test(errE.error), 'verify r3: an entry\'s ERROR naming a callback loses its query too (entryFor, not only the PURE cut)', errE.error);
  const Tq = M.load('src/browser-trace.js', tsrc.replace('function cutSecretQuery(u) {\n', 'function cutSecretQuery(u) {\n  return u;\n'), 'query-kept');
  ok(tsrc.includes('function cutSecretQuery(u) {\n') && J(Tq.entryFor({ id: 'tr-000000000003', at: 3, browserKey: 'bk-0000e0a1', profileId: P1, command: { action: 'open', params: { url: 'https://a.example/cb?code=SECRETCODE42' } }, result: { success: true } })).includes('SECRETCODE42'), 'CONTROL: a trace copy that keeps queries as typed stores the OAuth code — red');
  const vneedle0 = "  if (eq < 0 || depth >= 2) return false;\n";
  const Tv = M.load('src/browser-trace.js', tsrc.replace(vneedle0, '  return false;\n'), 'query-value-kept');
  ok(tsrc.includes(vneedle0) && Tv.withoutUrlSecrets('https://mail.example/click?url=https%3A%2F%2Fapp.example%2Fmagic%3Ftoken%3DSECRET1').includes('SECRET1'), 'CONTROL (verify r3): a trace copy that judges only the keys keeps a redirector\'s encoded magic link — red');
  // verify r2 (the revert table): the ARRAY branch of the params (a batch's lines, a list of urls) had no gate — reverted to
  // keep its strings as typed, the whole fast tier stayed green
  const arr = T0.redactParams('batch', { lines: ['open https://alice:hunter2pw@h.example/in?token=ARRTOKEN9', 'click #a'] });
  const aneedle = "v.map((x) => withoutUrlSecrets(String(x)).slice(0, 200))";
  const Ta = M.load('src/browser-trace.js', tsrc.replace(aneedle, 'v.map((x) => String(x).slice(0, 200))'), 'array-kept');
  ok(!J(arr).includes('hunter2pw') && !J(arr).includes('ARRTOKEN9') && arr.lines[0] === 'open https://h.example/in?«cut»' && arr.lines[1] === 'click #a' && tsrc.includes(aneedle) && J(Ta.redactParams('batch', { lines: ['open https://alice:hunter2pw@h.example/in?token=ARRTOKEN9'] })).includes('hunter2pw'),
    'verify r2: a list param (a batch\'s lines) is cut like a string — no password, no token; CONTROL the copy that keeps list items as typed stores both — red', arr);
}

// verify r2 (the owner's decision on r1's held question — option A, "有提醒就行"): the SHARED-TABS LINE — PURE, DOM-free
{
  const EN = 'Agents on this profile can also see and drive this tab';
  const rows = (H) => [
    H.humanShareLine({ id: P1, label: 'Work', mediated: false }), // a profile whose tabs its conversations share ⇒ the line
    H.humanShareLine({ id: P1, label: 'Work' }), // no `mediated` field (an older digest) — its tabs are shared ⇒ the line
    H.humanShareLine({ id: P1, label: 'Work', mediated: true }), // "separate tabs" (each conversation fenced to its own) ⇒ none
    H.humanShareLine(null), // the digest not read yet ⇒ nothing claimed
    H.humanShareLine({ id: P1, ephemeral: true }), // a conversation's own temporary browser (never browsed by him) ⇒ none
    H.humanShareLine({ id: P1, host: 'dev-1' }), // a paired machine's (not browsable in v1) ⇒ none
  ];
  ok(J(rows(HM)) === J([EN, EN, null, null, null, null]), 'verify r2 (option A): the shared-tabs line — shown on a profile whose tabs its agents share, never on "separate tabs", never before the digest, never on a temporary or remote record', rows(HM));
  const zhT = (s) => ({ [EN]: '这个配置的 agent 也能看到并操作这个标签页' })[s] || s;
  ok(HM.humanShareLine({ id: P1, mediated: false }, zhT) === '这个配置的 agent 也能看到并操作这个标签页', 'the line goes through the device\'s t() (the owner\'s zh words)');
  const ssrc = fs.readFileSync(path.join(REPO, 'src/browser-human.js'), 'utf8');
  const sneedle = "  if (profile.mediated === true || profile.ephemeral === true || profile.host) return null;\n";
  const Hs = M.load('src/browser-human.js', ssrc.replace(sneedle, "  if (profile.ephemeral === true || profile.host) return null;\n"), 'share-line-ignores-mediated');
  ok(ssrc.includes(sneedle) && J(rows(Hs)) !== J([EN, EN, null, null, null, null]), 'CONTROL: a copy that ignores `mediated` shows the line on a "separate tabs" profile — the leg above can go red', rows(Hs));
  // the WIRING: the window builds ONE keyed chip (never a toast) under the address row and patches its text / visibility
  // from the PURE line on every render of his ends (the digest's broadcast included)
  const wsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/shareLine\.dataset\.key = 'share'/.test(wsrc) && /root\.append\(strip, tabRow, watchLine, bar, addrRow, shareLine, endLine,/.test(wsrc) && /const words = H\.ended \|\| st\.stopped \? null : humanShareLine\(profileRowOf\(\), t\);/.test(wsrc) && /endLine\.style\.display = line \? '' : 'none';\n    renderShare\(\);/.test(wsrc) && !/showToast\([^)]*humanShareLine/.test(wsrc) && /if \(H\) \{ renderEnds\(\); renderTitle\(\); \}/.test(wsrc),
    'PIN: his window carries ONE keyed chip under the address row, patched in place from humanShareLine at every render of his ends (never a toast) — the digest\'s broadcast re-renders them (verify r3: that call reverted stayed green on the fast tier; the heavy leg (a) flips the SAME node)');
}

// ═══ the fake agent-browser (0.38.1's measured shape: per-session daemons, a CDP-attached session never launches) ═══
const BIN = path.join(ROOT, 'bin'), AB = path.join(ROOT, 'ab'), HOME = path.join(ROOT, 'home'), DATA = path.join(ROOT, 'data'), XDG = path.join(ROOT, 'x');
for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), DATA, XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const prof = process.env.AGENT_BROWSER_PROFILE || null, cdp = process.env.AGENT_BROWSER_CDP || null;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const log = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const raw = process.argv.slice(2);
const argv = raw.filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const daemon = (by) => {
  let s = read(); if (s && alive(s.pid)) return s;
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); log('daemons.log', { pid: c.pid });
  if (cdp) { s = { pid: c.pid, cdp, tabs: 0 }; fs.writeFileSync(f, JSON.stringify(s)); log('connects.log', { ns, sess, cdp, by }); return s; }
  const lock = prof ? path.join(prof, 'SingletonLock.fake') : null;
  if (lock) { let h = null; try { h = Number(fs.readFileSync(lock, 'utf8')); } catch { } if (h && alive(h)) { try { process.kill(c.pid, 'SIGKILL'); } catch { } log('refused.log', { ns, sess, by, prof }); return { refused: 'Chrome exited early (exit code: 21) ... SingletonLock: File exists (17)' }; } }
  s = { pid: c.pid, profile: prof, tabs: 0 }; fs.writeFileSync(f, JSON.stringify(s)); if (lock) fs.writeFileSync(lock, String(c.pid));
  log('launches.log', { ns, sess, by, profile: prof, pid: c.pid });
  return s;
};
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s0 = read(); if (!(s0 && alive(s0.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } if (s && s.profile) { try { fs.unlinkSync(path.join(s.profile, 'SingletonLock.fake')); } catch { } } out({ success: true, data: { closed: 1 } }); process.exit(0); }
log('cmds.log', { argv: raw, ns, sess, cdp, profile: prof });
if (a === 'close') { out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const s = daemon('stream status'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { enabled: true, connected: true, port: 21000 + (sess.length * 7) % 900, screencasting: false } }); process.exit(0); }
const s = daemon(a); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); }
if (a === 'tab' && b === 'new' && fs.existsSync(path.join(st, 'fail-tabnew-' + sess))) { out({ success: false, error: 'fake: tab new refused' }); process.exit(1); }
if (a === 'tab' && b === 'new') { const n = (s.tabs || 0) + 1; s.tabs = n; fs.writeFileSync(f, JSON.stringify(s)); out({ success: true, data: { tabId: 't' + n, targetId: ('ab' + String(n).padStart(4, '0')).padEnd(32, 'c').toUpperCase(), label: null } }); process.exit(0); }
if (process.env.FAKE_AB_FAIL_OPEN && a === 'open') { out({ success: false, error: 'fake: navigation refused' }); process.exit(1); }
out({ success: true, data: { ok: true } }); process.exit(0);
`, { mode: 0o755 });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
const env = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
const logOf = (n) => { try { return fs.readFileSync(path.join(AB, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const cmdsOf = (sess) => logOf('cmds.log').filter((c) => c.sess === sess).map((c) => c.argv.join(' '));
const quiet = { log() { }, warn() { }, error() { } };
const settings = {};
let clock = 1_900_000_000_000;
const live = new Set([KA, KB]);
const names = { [KA]: 'Fix login', [KB]: 'Report' };
const mkKeeper = (Kmod, extra = {}) => Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: (k) => settings[k], liveKeys: () => live, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: quiet, install: false, now: () => clock, conversationFacts: (bk) => ({ turn: 'idle', name: names[bk] || null }), ...extra });
// verify r1 (H6): the browser's page targets with their OPENER (the real keeper reads CDP Target.getTargets; the fake has
// no CDP) — the legs set what the browser holds: HIS tab (the fake's first `tab new` answer), a popup it opened, an agent's
const OWN_TAB = 'AB0001CCCCCCCCCCCCCCCCCCCCCCCCCC', POP_TAB = 'D0D0000000000000000000000000000A', AGENT_TAB = 'E0E0000000000000000000000000000B';
const fakeTargets = { list: [], reads: 0, fail: false };
const readTargets = async () => { fakeTargets.reads++; return fakeTargets.fail ? { ok: false, error: 'fake: no CDP' } : { ok: true, targets: fakeTargets.list.map((x) => ({ ...x })) }; };
const k = mkKeeper(K, { readTargets });
await k._facts.probeVersion();
const inputEvents = [], leaseEvents = [];
k.onInput((ev) => inputEvents.push(ev));
k.onLease((ev) => { leaseEvents.push(ev); return null; });
// the REAL announcer with a spy on every seam it can speak through — a human lifecycle must reach NONE of them
const spy = { deliver: [], stash: [], cards: [], notices: [], todos: [], peer: [] };
const tok = (c) => 'vsst_' + String(c).repeat(24);
const sA = { agentToken: tok('a'), _browserKey: KA, name: 'Fix login', webuiName: 'Fix login', mode: 'chat', claudeSessionId: 'conv-a' };
const sB = { agentToken: tok('b'), _browserKey: KB, name: 'Report', webuiName: 'Report', mode: 'chat', claudeSessionId: 'conv-b' };
const active = new Map([['sess-a', sA], ['sess-b', sB]]);
const ann = require('../src/server/browser-handback.js').create({ keeper: k, activeSessions: active, sessionKeyFor: (s, id) => id, log: quiet,
  deliver: { deliverToConversation: async (...a) => { spy.deliver.push(a); return { ok: true }; }, stashFor: (...a) => { spy.stash.push(a); return { stored: true }; }, emitPeerCard: (...a) => spy.peer.push(a) },
  emitCard: (...a) => { spy.cards.push(a); return true; }, notice: (...a) => spy.notices.push(a), userTodos: { add: (...a) => { spy.todos.push(a); return { id: 'x' }; } } });
ann.install();
const spyCount = () => Object.values(spy).reduce((n, x) => n + x.length, 0);
const R = require('../src/routes/browser.js');
R.setup({ keeper: k, activeSessions: active, notice: (sid, s, n) => spy.notices.push(['route', sid, n]), tasksForSession: () => [] });
const TR = require('../src/routes/browser-trace.js');
// the recorder's session hook, as the WIRING has it (src/server/mounts-plugins-wiring.js onSession: a marker becomes a card
// in the live conversation that OWNS its browser key) — every marker is kept, and each card it would show
const markersSeen = [], sessionCards = [];
const wiringOnSession = (m) => { markersSeen.push(m); for (const [, s] of active) if (s && s._browserKey === m.browserKey) sessionCards.push({ key: s._browserKey, m }); };
const trace = require('../src/server/browser-trace.js').create({ dataDir: DATA, homeDir: HOME, keeper: k, bridge: null, serverSetting: (x) => settings[x], broadcast: () => { }, log: quiet, onSession: wiringOnSession });
trace.install();
TR.setup({ keeper: k, trace, activeSessions: active, releaseProfile: (id) => R.releaseProfile(id), unpinProfile: (id) => R.unpinProfile(id), notice: () => { }, keyForPickedSession: (id) => R.keyForPickedSession(id) });
const app = express(); app.use(express.json()); app.use(R.router); app.use(TR.router);
const srv = http.createServer(app); servers.push(srv);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });

console.log('— ② the real keeper + routes over a fake 0.38.1: one launch, his own tab, no pause, the address row, Close, Quit, the keep, the rest');
let work, solo, shop;
{
  work = (await j('POST', '/api/browser/profiles', { label: 'Work' })).json.profile;
  const HW = HM.humanKeyFor(work.id);
  let r = await j('POST', `/api/browser/profiles/${work.id}/browse`, {});
  const tabNew = cmdsOf('vs-' + HW).filter((c) => /^--pin-tab tab new$/.test(c));
  ok(r.status === 200 && r.json.ok && r.json.how === 'launch' && r.json.key === HW && r.json.syncId === 'win-bhuman-' + work.id && /^[0-9a-f]{16}$/.test(r.json.fresh || '') && logOf('launches.log').length === 1 && logOf('launches.log')[0].profile === work.dir, 'Browse yourself on a STOPPED profile: ONE launch (the keeper\'s start, on the profile directory) — the answer names his key, the window\'s sync id and a fresh token', r.json);
  ok(logOf('connects.log').some((c) => c.sess === 'vs-' + HW && c.cdp.startsWith(`ws://127.0.0.1:${DEAD_CDP}/`)) && !logOf('refused.log').length && tabNew.length === 1, 'his session joins over the keeper browser\'s CDP url (never the directory — no SingletonLock) and opens HIS OWN pinned tab: `--pin-tab tab new` under vs-hu-…', { connects: logOf('connects.log'), tabNew });
  const h = k.humanOf(work.id);
  ok(h && h.state === 'away' && h.launched === true && h.keepMs === 12 * 3600e3 && h.sessionId === null && h.human === true, 'he is a HOLDER (away until a window of his takes his tab), he LAUNCHED it ⇒ kept 12 h while away', h);
  const dig = k.list().leases.filter((l) => l.profileId === work.id);
  ok(dig.length === 1 && dig[0].human === true && dig[0].holder === 'user' && dig[0].sessionId === null && dig[0].browserKey === HW, 'the digest\'s holder rows carry his row (sessionId null — no reader that needs a conversation takes it for one)', dig);
  const sess = leaseEvents.filter((e) => e.kind === 'human-start' && e.key === HW);
  ok(sess.length === 1 && sess[0].launched === true && sess[0].recordMine === true, 'ONE `human-start` on the lease seam (the recorder\'s session marker; recording on by default — the owner, 3/4)', sess);
  // an agent on the same profile — NOT paused, not told (the owner, 2)
  const ev0 = inputEvents.length;
  r = await j('POST', '/api/agent/browser/use', { profile: 'Work' }, as(sA));
  ok(r.status === 200 && logOf('launches.log').length === 1 && r.json.others === 0, 'conversation "Fix login" `use Work` JOINS the browser he browses (still one launch; `others` counts conversations only)', r.json);
  const tk = k.humanTake({ key: HW, viewerId: 11 });
  ok(tk.ok && k.humanOf(work.id).state === 'driving' && k.inputStateFor(KA, work.id).input === 'agent', 'a window of his takes HIS tab\'s controls — the agent\'s own input side is untouched');
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://x.example'] }, as(sA));
  ok(r.status === 200 && r.json.kind === 'attachment' && r.json.code === undefined, 'while he browses, the agent\'s next command RESOLVES (never browser_paused, never browser_busy) — one more holder, its own tab', r.json);
  const convEvents = inputEvents.slice(ev0).filter((e) => !e.human);
  ok(convEvents.length === 0 && inputEvents.slice(ev0).some((e) => e.human && e.kind === 'takeover' && e.browserKey === HW) && spyCount() === 0 && !sessionCards.some((c) => c.m.holder === 'user' || HM.isHumanKey(c.m.browserKey)) && markersSeen.some((m) => m.holder === 'user' && m.browserKey === HW), 'NO takeover / handback event for any conversation, no card, no notice, no delivery (his window\'s own event is `human` and the announcer ignores it); his session marker reached the hook and became NO card', { convEvents, spy: Object.fromEntries(Object.entries(spy).map(([a, b]) => [a, b.length])), cards: sessionCards.map((c) => c.key + ':' + c.m.phase) });
  // the address row + the Tabs pane
  const before = cmdsOf('vs-' + HW).length;
  fakeTargets.list = [{ targetId: OWN_TAB, type: 'page', openerId: null }, { targetId: POP_TAB, type: 'page', openerId: OWN_TAB }, { targetId: AGENT_TAB, type: 'page', openerId: null }];
  for (const b of [{ url: 'example.com' }, { verb: 'back' }, { verb: 'forward' }, { verb: 'reload' }, { tab: POP_TAB }]) { r = await j('POST', `/api/browser/browse/${HW}/navigate`, b); if (r.status !== 200) break; }
  const nav = cmdsOf('vs-' + HW).slice(before);
  ok(r.status === 200 && J(nav) === J(['--pin-tab open https://example.com/', '--pin-tab back', '--pin-tab forward', '--pin-tab reload', 'tab ' + POP_TAB]) && !cmdsOf('vs-' + KA).some((c) => /example\.com|back|forward|reload/.test(c)), 'the address row: open / back / forward / reload / a tab HIS tab opened (a login popup) — the daemon\'s own verbs under HIS session only (the agent\'s session saw none of them)', nav);
  // verify r1 (H6): the boundary is the tab's OWNER — a conversation's tab (and anything not proven his) is never his to switch
  // to: measured on the real 0.38.1 before the fix, the switch went through, his address row then navigated the AGENT's tab
  // and Close closed it (that conversation's next command: `tab_gone`)
  {
    const n0 = cmdsOf('vs-' + HW).length;
    const rA = await j('POST', `/api/browser/browse/${HW}/navigate`, { tab: AGENT_TAB });
    const rT = await j('POST', `/api/browser/browse/${HW}/navigate`, { tab: 't3' });
    fakeTargets.fail = true;
    const rU = await j('POST', `/api/browser/browse/${HW}/navigate`, { tab: POP_TAB });
    fakeTargets.fail = false;
    ok(rA.status === 403 && rA.json.code === 'not_your_tab' && /take over/.test(rA.json.error) && rT.status === 403 && rT.json.code === 'not_your_tab' && rU.status === 503 && rU.json.code === 'tabs_unreadable' && cmdsOf('vs-' + HW).length === n0 && k.inputStateFor(KA, work.id).input === 'agent',
      'verify r1 (H6): his Tabs pane naming a CONVERSATION\'s tab is refused `not_your_tab` (its way out: that conversation\'s live view + take over), a `t<N>` ref too (not provably his), an unreadable tab list fails CLOSED (`tabs_unreadable`) — nothing ran under his session, the agent untouched', { rA: rA.json, rT: rT.json, rU: rU.json });
    const HT = HM.humanTabSet([{ targetId: OWN_TAB, type: 'page' }, { targetId: POP_TAB, type: 'page', openerId: OWN_TAB }, { targetId: 'F0F0000000000000000000000000000C', type: 'page', openerId: POP_TAB }, { targetId: AGENT_TAB, type: 'page' }, { targetId: 'A1A1000000000000000000000000000D', type: 'page', openerId: AGENT_TAB }, { targetId: 'B2B2000000000000000000000000000E', type: 'service_worker', openerId: OWN_TAB }], OWN_TAB);
    ok([...HT].sort().join() === [OWN_TAB, POP_TAB, 'F0F0000000000000000000000000000C'].sort().join() && HM.humanTabSet([{ targetId: AGENT_TAB, type: 'page' }], OWN_TAB).size === 0 && HM.humanTabSet([{ targetId: OWN_TAB, type: 'page' }], null).size === 0,
      'PURE humanTabSet: his tab + what it opened, transitively (a popup\'s popup) — never an agent\'s tab or ITS popup, never a non-page target; his tab gone ⇒ nothing is his', [...HT]);
    // CONTROL: a keeper copy whose navigate admits ANY tab (the pre-fix shape) switches his session to the agent's tab — red
    const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const needle = "    let tv = null;\n    if (v.act === 'tab') {";
    ok(src.includes(needle), 'the tab verdict needle (the control below removes it)');
    const Kt = M.load('src/server/browser-keeper.js', src.replace(needle, "    let tv = null;\n    if (false) {"), 'any-tab');
    const kt = mkKeeper(Kt, { dataDir: path.join(ROOT, 'data-t'), readTargets });
    const tp = kt.createProfile({ label: 'T' }, { owner: { kind: 'instance', id: null } });
    await kt.browse(tp.id);
    const HTk = HM.humanKeyFor(tp.id);
    let cr = null; try { cr = await kt.navigateHuman(HTk, { tab: AGENT_TAB }); } catch (e) { cr = { code: e.code }; }
    ok(cr && cr.ok === true && cmdsOf('vs-' + HTk).includes('tab ' + AGENT_TAB), 'CONTROL: the pre-fix keeper copy runs `tab <the agent\'s tab>` under his session — the leg above can go red', cr);
    await kt.stop(tp.id, { why: 'user' });
  }
  // verify r2 (the revert table): the REAL read behind his tab set — browser-viewport `browserTargets`, CDP Target.getTargets
  // over the keeper browser's own endpoint — carried `openerId` through with no gate (every leg above injects readTargets):
  // reverted to drop it, the whole fast tier stayed green while his popups stopped being his (refused, never closed). A
  // fake CDP endpoint answers Target.getTargets; a keeper WITHOUT an injected reader derives his set through the real read
  {
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => wss.on('listening', r));
    const infos = [{ targetId: OWN_TAB, type: 'page', url: 'https://mine.example/', attached: true }, { targetId: POP_TAB, type: 'page', url: 'https://login.example/', openerId: OWN_TAB, attached: false }, { targetId: AGENT_TAB, type: 'page', url: 'https://agent.example/' }, { targetId: 'B0B0000000000000000000000000000F', type: 'service_worker', url: 'https://mine.example/sw.js', openerId: OWN_TAB }];
    wss.on('connection', (sock) => sock.on('message', (d) => { const m = JSON.parse(String(d)); if (m.method === 'Target.getTargets') sock.send(JSON.stringify({ id: m.id, result: { targetInfos: infos } })); }));
    const CDP = `ws://127.0.0.1:${wss.address().port}/devtools/browser/fake-cdp`;
    const VP = require('../src/server/browser-viewport.js');
    const r0 = await VP.browserTargets(CDP);
    ok(r0.ok && r0.targets.find((x) => x.targetId === POP_TAB).openerId === OWN_TAB && r0.targets.length === 4, 'the REAL read (browserTargets over CDP Target.getTargets) carries each target\'s opener', r0);
    const kv = mkKeeper(K, { dataDir: path.join(ROOT, 'data-vp') }); // no injected reader: the keeper's own default
    await kv._facts.probeVersion();
    const vp = kv.createProfile({ label: 'Vp' }, { owner: { kind: 'instance', id: null } });
    const HV = HM.humanKeyFor(vp.id);
    await kv.browse(vp.id);
    kv._reg().browsers[vp.id].cdpUrl = CDP;
    await kv.attach({ profileId: vp.id, browserKey: KA, sessionId: 'sess-a', by: 'user' }); // a conversation holds it (its tab is not an orphan)
    let sw = null; try { sw = await kv.navigateHuman(HV, { tab: POP_TAB }); } catch (e) { sw = { refused: e.code }; }
    let sa = null; try { sa = await kv.navigateHuman(HV, { tab: AGENT_TAB }); } catch (e) { sa = { refused: e.code }; }
    ok(sw && sw.ok === true && sa && sa.refused === 'not_your_tab', 'through the keeper\'s OWN reader: his popup (opener = his tab) is his to switch to; the agent\'s tab is refused', { sw, sa });
    const vsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-viewport.js'), 'utf8');
    const vneedle = 'openerId: t.openerId ? String(t.openerId) : null';
    const VPx = M.load('src/server/browser-viewport.js', vsrc.replace(vneedle, 'openerId: null'), 'no-opener');
    const rx = await VPx.browserTargets(CDP);
    ok(vsrc.includes(vneedle) && rx.ok && !HM.humanTabSet(rx.targets, OWN_TAB).has(POP_TAB), 'CONTROL: a read that drops the opener makes his popup nobody\'s (refused, never closed by his Close) — the legs above can go red');
    try { await kv.stop(vp.id, { why: 'user' }); } catch { }
    kv.shutdown(); wss.close();
  }
  // verify r2 — ORPHAN TABS (the judge: "may he click into them? yes, and they become his; an agent's later `tab new` never
  // takes his"). Reproduced on the real 0.38.1 + Chrome 154 (verify/repro-r2-orphan): a conversation that ENDED (its lease
  // dropped by the tick's carrier grace) left its page in the browser; his Tabs pane refused it `not_your_tab` ("open that
  // conversation's live view" — there is none) and his Close left it: a page nobody could reach but through Quit.
  {
    const orphanLeg = async (Kmod, dir) => {
      const ko = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
      await ko._facts.probeVersion();
      const op = ko.createProfile({ label: 'Orph' }, { owner: { kind: 'instance', id: null } });
      const HO = HM.humanKeyFor(op.id), KO = 'bk-0000e0c1';
      live.add(KO);
      await ko.attach({ profileId: op.id, browserKey: KO, sessionId: 'sess-orph', by: 'user' });
      live.delete(KO); // the conversation ENDED — the tick drops its lease after the carrier grace (its page stays)
      await ko.tick(); clock += 3 * 60e3; await ko.tick();
      const out = { dropped: !ko.leasesOn(op.id).some((l) => l.browserKey === KO), left: !!(ko._reg().leftTabs[op.id] || {})[KO] };
      await ko.browse(op.id);
      const ORPHAN = 'C0C0000000000000000000000000000D';
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: ORPHAN, type: 'page' }];
      try { out.take = await ko.navigateHuman(HO, { tab: ORPHAN }); } catch (e) { out.take = { refused: e.code }; }
      out.ran = cmdsOf('vs-' + HO).includes('tab ' + ORPHAN);
      out.adopted = ((ko._reg().humans || {})[op.id] || {}).adopted || [];
      out.marked = !!ko._reg().tabClosed[`${op.id}|${KO}`];
      // the conversation comes BACK: its session would return to its bound tab (0.38.1 restores it) — it binds a NEW one first
      live.add(KO);
      const n0 = cmdsOf('vs-' + KO).filter((c) => /tab new/.test(c)).length;
      await ko.attach({ profileId: op.id, browserKey: KO, sessionId: 'sess-orph', by: 'user' });
      out.backNewTab = cmdsOf('vs-' + KO).filter((c) => /tab new/.test(c)).length - n0;
      // …now a conversation holds the browser: another tab outside his set is NOT adoptable (its other tabs are invisible)
      const OTHER = 'C0C0000000000000000000000000000E';
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: ORPHAN, type: 'page' }, { targetId: OTHER, type: 'page' }];
      try { out.whileLeased = await ko.navigateHuman(HO, { tab: OTHER }); } catch (e) { out.whileLeased = { refused: e.code }; }
      // Close takes the tab he adopted with his own
      const c0 = cmdsOf('vs-' + HO).length;
      await ko.closeHuman(HO);
      out.closed = cmdsOf('vs-' + HO).slice(c0);
      fakeTargets.list = [];
      live.delete(KO);
      try { await ko.stop(op.id, { why: 'user' }); } catch { }
      ko.shutdown();
      return out;
    };
    const ol = await orphanLeg(K, 'data-orph');
    ok(ol.dropped && ol.left && ol.take && ol.take.ok === true && ol.take.adopted === true && ol.ran && ol.adopted.includes('C0C0000000000000000000000000000D') && ol.marked && ol.backNewTab === 1 && ol.whileLeased && ol.whileLeased.refused === 'not_your_tab' && ol.closed.includes('tab close C0C0000000000000000000000000000D') && ol.closed.includes('tab close ' + OWN_TAB),
      'verify r2 (orphan tabs): with NO conversation holding the browser, the tab a conversation that ended left behind is his to TAKE (it becomes his — persisted with his holder, closed by his Close); that conversation, if it comes back, binds a NEW tab first (never his); while a conversation holds the browser a tab outside his set stays refused (fail closed)', ol);
    ok(J([...HM.humanTabSet([{ targetId: OWN_TAB, type: 'page' }, { targetId: 'C0C0000000000000000000000000000D', type: 'page' }, { targetId: 'C0C0000000000000000000000000000F', type: 'page', openerId: 'C0C0000000000000000000000000000D' }], OWN_TAB, ['C0C0000000000000000000000000000D'])].sort()) === J([OWN_TAB, 'C0C0000000000000000000000000000D', 'C0C0000000000000000000000000000F'].sort()) && HM.orphanTabSet([{ targetId: OWN_TAB, type: 'page' }, { targetId: AGENT_TAB, type: 'page' }], new Set([OWN_TAB]), { leased: true }).size === 0 && HM.orphanTabSet([{ targetId: OWN_TAB, type: 'page' }, { targetId: AGENT_TAB, type: 'page' }], new Set([OWN_TAB]), { leased: false }).has(AGENT_TAB) && HM.orphanTabSet([], null, { leased: false }).size === 0,
      'PURE: an adopted tab is a root of his set (with what it opens); orphans exist only when nobody holds the browser, never when his tabs are unreadable');
    const osrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const oneedle = "orphans: view ? HM.orphanTabSet(view.targets, view.own, { leased: reg.leases.some((l) => l.profileId === p.id) }) : null";
    ok(osrc.includes(oneedle), 'the orphan needle (the control below removes it)');
    const Ko = M.load('src/server/browser-keeper.js', osrc.replace(oneedle, 'orphans: null'), 'no-orphans');
    const oc = await orphanLeg(Ko, 'data-orph-c');
    ok(oc.take && oc.take.refused === 'not_your_tab' && !oc.ran && !oc.closed.includes('tab close C0C0000000000000000000000000000D'), 'CONTROL: the keeper copy without the orphan rule refuses the tab nobody holds (`not_your_tab`, its way out a live view that does not exist) and his Close leaves it — the leg above can go red', oc);
    // verify r3 (#3, the conversation comes BACK while he holds its old tab): r2 remembered a lease that LEFT its page only
    // where the tick drops a parent key. Reproduced on the real 0.38.1 + Chrome 154 (verify/repro-r3-detach, `--child`): a
    // DETACH (the agent's verb, the UI's Detach, a pin that moves — the conversation alive, its session bound to its tab) and
    // a helper's handle (a child key — the next helper of the same conversation mints the SAME handle) left the page
    // unrecorded; nobody leased the browser, he took that tab, and the returning session's next command landed IN HIS PAGE.
    // Every way a lease leaves its page is recorded now (noteLeftTab): the returning session binds a NEW tab first.
    const leftLeg = async (Kmod, dir, how, { failBind = false } = {}) => {
      const kd = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
      await kd._facts.probeVersion();
      const dp = kd.createProfile({ label: 'Left' }, { owner: { kind: 'instance', id: null } });
      const HD = HM.humanKeyFor(dp.id), PK = 'bk-0000e0d1';
      live.add(PK);
      let DK = PK;
      if (how === 'child') DK = kd.newChild({ browserKey: PK, sessionId: 'sess-left' }).handle;
      await kd.attach({ profileId: dp.id, browserKey: DK, sessionId: 'sess-left', by: 'agent' });
      if (how === 'detach') kd.detach({ profileId: dp.id, browserKey: DK, by: 'agent' }); // alive — its session still bound to its tab
      else { live.delete(PK); await kd.tick(); clock += 3 * 60e3; await kd.tick(); live.add(PK); } // the helper's handle reaped with its lease
      const out = { key: DK, gone: !kd.leasesOn(dp.id).some((l) => l.browserKey === DK), left: !!(kd._reg().leftTabs[dp.id] || {})[DK] };
      await kd.browse(dp.id);
      const THEIRS = 'C0C0000000000000000000000000001D';
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: THEIRS, type: 'page' }];
      try { out.take = await kd.navigateHuman(HD, { tab: THEIRS }); } catch (e) { out.take = { refused: e.code }; }
      out.marked = !!kd._reg().tabClosed[`${dp.id}|${DK}`];
      if (how === 'child') out.again = kd.newChild({ browserKey: PK, sessionId: 'sess-left' }).handle;
      if (failBind) {
        // verify r3: the bind itself fails (a busy daemon, a timeout) — its session is still bound to the tab he took
        const ff = path.join(AB, 'fail-tabnew-vs-' + DK);
        fs.writeFileSync(ff, '1');
        try { out.failedBind = await kd.attach({ profileId: dp.id, browserKey: DK, sessionId: 'sess-left', by: 'agent' }); out.failedBind = { attached: true }; } catch (e) { out.failedBind = { refused: e.code, error: e.message }; }
        out.stillMarked = !!kd._reg().tabClosed[`${dp.id}|${DK}`];
        fs.unlinkSync(ff);
      }
      const n0 = cmdsOf('vs-' + DK).filter((c) => /tab new/.test(c)).length;
      await kd.attach({ profileId: dp.id, browserKey: DK, sessionId: 'sess-left', by: 'agent' });
      out.backNewTab = cmdsOf('vs-' + DK).filter((c) => /tab new/.test(c)).length - n0;
      fakeTargets.list = [];
      live.delete(PK);
      try { await kd.stop(dp.id, { why: 'user' }); } catch { }
      kd.shutdown();
      return out;
    };
    const lDet = await leftLeg(K, 'data-left-d', 'detach'), lCh = await leftLeg(K, 'data-left-c', 'child');
    ok([lDet, lCh].every((x) => x.gone && x.left && x.take && x.take.adopted === true && x.marked && x.backNewTab === 1) && lCh.again === lCh.key && /\.1$/.test(lCh.key),
      'verify r3: a lease that left its page by a DETACH (the conversation alive) or a HELPER\'s handle (the next helper mints the same handle) is remembered like the tick\'s drop — he may take that tab, and the returning session binds a NEW tab first (never lands in his page)', { lDet, lCh });
    const lsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const lneedles = ["    noteLeftTab(id, browserKey); // verify r3", "    for (const l of reg.leases) if (l.browserKey === handle) noteLeftTab(l.profileId, handle);", " || !(B.isBrowserKey(browserKey) || B.isChildKey(browserKey))) return false;"];
    ok(lneedles.every((n) => lsrc.includes(n)), 'the left-tab needles (the control below puts r2\'s shape back)');
    const Kl = M.load('src/server/browser-keeper.js', lsrc.replace(lneedles[0], '    // (r2: no record at a detach)').replace(lneedles[1], '').replace(lneedles[2], ' || !B.isBrowserKey(browserKey)) return false;'), 'left-tick-parent-only');
    const cDet = await leftLeg(Kl, 'data-left-dc', 'detach'), cCh = await leftLeg(Kl, 'data-left-cc', 'child');
    ok([cDet, cCh].every((x) => !x.left && !x.marked && x.backNewTab === 0 && x.take && x.take.adopted === true), 'CONTROL: r2\'s shape (only the tick\'s parent-key drop recorded) — he takes the tab, nothing is marked, the returning session binds nothing (its next command lands in his page) — the leg above can go red', { cDet, cCh });
    // verify r3 (#3, "prove its next command never lands in his tab"): the returning session's bind (`tab new`) FAILS — a busy
    // daemon, a timeout. Its session is still bound to the tab he took: the attach went through with a warning and the
    // command ran IN HIS PAGE (reproduced below with the fake's refused `tab new`). Now the attach is refused `tab_unbound`
    // while his holder keeps a tab he took (fail closed — the mark stays, the next command binds again)
    // verify r3 (the revert table): r2's orphan state crosses a RESTART on disk — `leftTabs` (normalizeRegistry) and his
    // `adopted` tabs (normalizeRegistry + load()) — and nothing noticed reverting either (the legs above ran in one process).
    // A restart between the conversation's exit and his take: the returning session must still bind a new tab; a restart
    // after his take: his Close must still close the tab he took.
    const restartLeftLeg = async (Kmod, dir) => {
      const kr1 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
      await kr1._facts.probeVersion();
      const rp = kr1.createProfile({ label: 'LeftR' }, { owner: { kind: 'instance', id: null } });
      const HR = HM.humanKeyFor(rp.id), RK = 'bk-0000e0d5', THEIRS = 'C0C0000000000000000000000000002D';
      live.add(RK);
      await kr1.attach({ profileId: rp.id, browserKey: RK, sessionId: 'sess-lr', by: 'agent' });
      kr1.detach({ profileId: rp.id, browserKey: RK, by: 'agent' });
      kr1.shutdown(); // an Update restarts the server
      const kr2 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets }); await kr2.boot();
      const out = { leftAfterRestart: !!(kr2._reg().leftTabs[rp.id] || {})[RK] };
      await kr2.browse(rp.id);
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: THEIRS, type: 'page' }];
      try { out.take = await kr2.navigateHuman(HR, { tab: THEIRS }); } catch (e) { out.take = { refused: e.code }; }
      out.marked = !!kr2._reg().tabClosed[`${rp.id}|${RK}`];
      kr2.shutdown(); // …and again, after his take
      const kr3 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets }); await kr3.boot();
      out.adoptedAfterRestart = ((kr3.humanOf(rp.id) && kr3._reg().humans[rp.id]) || {}).adopted || [];
      const c0 = cmdsOf('vs-' + HR).length;
      await kr3.closeHuman(HR);
      out.closed = cmdsOf('vs-' + HR).slice(c0);
      fakeTargets.list = [];
      live.delete(RK);
      try { await kr3.stop(rp.id, { why: 'user' }); } catch { }
      kr3.shutdown();
      return out;
    };
    const lr = await restartLeftLeg(K, 'data-left-r');
    ok(lr.leftAfterRestart && lr.take && lr.take.adopted === true && lr.marked && lr.adoptedAfterRestart.includes('C0C0000000000000000000000000002D') && lr.closed.includes('tab close C0C0000000000000000000000000002D'),
      'verify r3: the orphan state crosses a RESTART — a conversation that left before it is still marked when he takes its tab after it (its return binds a new tab), and the tab he took is still his after the next restart (his Close closes it)', lr);
    const rsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const rn1 = "    try { rawDoc = JSON.parse(fs.readFileSync(storeFile, 'utf8')); reg = B.normalizeRegistry(rawDoc); }"; // (lane profile-lock-roll verify r7: the raw document is kept for the token dedupe's report)
    const rn2 = 'adopted: Array.isArray(r.adopted) ? r.adopted.slice() : [], fresh: null';
    ok(rsrc.includes(rn1) && rsrc.includes(rn2), 'the restart needles (the controls below remove each layer)');
    const Kr1 = M.load('src/server/browser-keeper.js', rsrc.replace(rn1, rn1.replace('; }', '; reg.leftTabs = {}; }')), 'left-not-loaded');
    const Kr2 = M.load('src/server/browser-keeper.js', rsrc.replace(rn2, 'adopted: [], fresh: null'), 'adopted-not-loaded');
    const cr1 = await restartLeftLeg(Kr1, 'data-left-rc1'), cr2 = await restartLeftLeg(Kr2, 'data-left-rc2');
    ok(!cr1.leftAfterRestart && !cr1.marked && cr2.leftAfterRestart && cr2.marked && !cr2.closed.includes('tab close C0C0000000000000000000000000002D'), 'CONTROLS: a keeper that loads no leftTabs marks nothing after the restart; one that loads no adopted tabs leaves the tab he took open at his Close — the leg above can go red', { cr1: { left: cr1.leftAfterRestart, marked: cr1.marked }, cr2: { closed: cr2.closed } });
    const RN = B.normalizeRegistry({ leftTabs: { 'bp-0000e0d5': { 'bk-0000e0d5': 5, 'bk-0000e0d6.2': 6, 'xx': 7 } }, humans: { 'bp-0000e0d5': { key: 'hu-0000e0d5', adopted: ['C0C0000000000000000000000000002D', 'nope'], state: 'away' } } });
    const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
    const bn = 'leftTabs: Object.fromEntries(Object.entries(obj(d.leftTabs))';
    const Bx = M.load('src/browser-profiles.js', bsrc.replace(bn, 'leftTabs: Object.fromEntries(Object.entries(obj(null))').replace("adopted: (Array.isArray(v.adopted) ? v.adopted : [])", 'adopted: ([])'), 'normalize-drops-orphans');
    const RX = Bx.normalizeRegistry({ leftTabs: { 'bp-0000e0d5': { 'bk-0000e0d5': 5 } }, humans: { 'bp-0000e0d5': { key: 'hu-0000e0d5', adopted: ['C0C0000000000000000000000000002D'], state: 'away' } } });
    ok(J(RN.leftTabs) === J({ 'bp-0000e0d5': { 'bk-0000e0d5': 5, 'bk-0000e0d6.2': 6 } }) && J(RN.humans['bp-0000e0d5'].adopted) === J(['C0C0000000000000000000000000002D']) && bsrc.includes(bn) && !Object.keys(RX.leftTabs).length && !RX.humans['bp-0000e0d5'].adopted.length,
      'PURE normalizeRegistry keeps leftTabs (a helper\'s child key with its suffix) and his adopted tab ids, drops what is malformed; CONTROL a normalizer copy that drops both', { left: RN.leftTabs, adopted: RN.humans['bp-0000e0d5'] && RN.humans['bp-0000e0d5'].adopted });
    const lFail = await leftLeg(K, 'data-left-f', 'detach', { failBind: true });
    ok(lFail.marked && lFail.failedBind && lFail.failedBind.refused === 'tab_unbound' && lFail.stillMarked && lFail.backNewTab === 1,
      'verify r3: the returning session\'s bind FAILS ⇒ its attach is refused `tab_unbound` (never a command in the page he took), the mark stays and its next command binds a new tab', lFail);
    const fneedle = "      if (!bound && hu && Array.isArray(hu.adopted) && hu.adopted.length) throw namedError('tab_unbound',";
    const fsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const Kf = M.load('src/server/browser-keeper.js', fsrc.replace(fneedle, "      if (false) throw namedError('tab_unbound',"), 'bind-fails-open');
    const cFail = await leftLeg(Kf, 'data-left-fc', 'detach', { failBind: true });
    ok(fsrc.includes(fneedle) && cFail.failedBind && cFail.failedBind.attached === true, 'CONTROL: the keeper copy that only warns on a failed bind attaches (the command would run in his page) — the leg above can go red', cFail);
    // verify r4 (the tab-release census / THE BOUND): noteLeftTab keeps 64 keys per profile and DROPPED the oldest silently —
    // a forgotten conversation whose page he takes later runs its next command IN HIS PAGE (reproduced over this fake,
    // verify/repro-r4-cap: 65 conversations leave a page, he takes one, the oldest's return bound nothing). The bound fails
    // CLOSED now: an evicted key is marked `tabClosed` (its return binds a new tab first)
    const capLeg = async (Kmod, dir) => {
      const kc = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
      await kc._facts.probeVersion();
      const cp = kc.createProfile({ label: 'Busy' }, { owner: { kind: 'instance', id: null } });
      const HC = HM.humanKeyFor(cp.id), THEIRS = 'C0C0000000000000000000000000003D';
      const keys = Array.from({ length: 65 }, (_, i) => 'bk-' + (0xc0000000 + i).toString(16));
      for (const bk of keys) live.add(bk);
      for (const bk of keys) { await kc.attach({ profileId: cp.id, browserKey: bk, sessionId: 's-' + bk, by: 'agent' }); clock += 1000; kc.detach({ profileId: cp.id, browserKey: bk, by: 'agent' }); }
      const out = { kept: Object.keys(kc._reg().leftTabs[cp.id] || {}).length };
      await kc.browse(cp.id);
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: THEIRS, type: 'page' }];
      try { out.take = await kc.navigateHuman(HC, { tab: THEIRS }); } catch (e) { out.take = { refused: e.code }; }
      const n0 = cmdsOf('vs-' + keys[0]).filter((c) => /tab new/.test(c)).length;
      await kc.attach({ profileId: cp.id, browserKey: keys[0], sessionId: 's-' + keys[0], by: 'agent' });
      out.oldestBackNewTab = cmdsOf('vs-' + keys[0]).filter((c) => /tab new/.test(c)).length - n0;
      fakeTargets.list = [];
      for (const bk of keys) live.delete(bk);
      try { await kc.stop(cp.id, { why: 'user' }); } catch { }
      kc.shutdown();
      return out;
    };
    const capL = await capLeg(K, 'data-left-cap');
    ok(capL.kept === 64 && capL.take && capL.take.adopted === true && capL.oldestBackNewTab === 1, 'verify r4: the left-tab bound (64 per profile) FAILS CLOSED — 65 conversations leave a page, he takes one, the one the bound evicted binds a NEW tab on its return (never lands in his page)', capL);
    const csrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const cneedle = "{ markTabLost(pd.id, x, 'closed'); delete m[x]; }"; // lane profile-lock-roll: the ONE mark pair (verify r1 F6: the needle follows the rename)
    const capC = await capLeg(M.load('src/server/browser-keeper.js', csrc.replace(cneedle, 'delete m[x];'), 'left-bound-forgets'), 'data-left-capc');
    ok(csrc.includes(cneedle) && capC.kept === 64 && capC.oldestBackNewTab === 0, 'CONTROL: a keeper copy whose bound only forgets (r3) binds the evicted conversation nothing on its return — the leg above can go red', capC);
    // verify r4 (the tab-release census / THE TAKE IS MADE WHERE IT IS JUDGED): r3 adopted AFTER his `tab <id>` returned — a
    // conversation that came back inside that window cleared its own leftTabs entry ("back on its own tab") before the
    // adoption marked, and its next command ran in the page he had just taken (reproduced on the real 0.38.1 + Chrome 154,
    // verify/repro-r4-real race, 5–10 ms gaps). His switch is held in flight here (a gate in the runtime) while it comes back
    const takeRaceLeg = async (Kmod, dir) => {
      const base = F.createBrowserRuntime({ env });
      const TR = 'C0C0000000000000000000000000004D', TF = 'C0C0000000000000000000000000004E';
      let started = null, release = null; const startedP = new Promise((r) => { started = r; }); const gate = new Promise((r) => { release = r; });
      const runtime = { ...base, exec: async (ns, argv, o) => {
        if (argv.includes('tab') && argv.includes(TR)) { started(); await gate; }
        if (argv.includes('tab') && argv.includes(TF)) return { ok: false, stderr: 'fake: Target.activateTarget failed: No target with given id found' };
        return base.exec(ns, argv, o);
      } };
      const kr = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets, runtime });
      await kr._facts.probeVersion();
      const rp = kr.createProfile({ label: 'Race' }, { owner: { kind: 'instance', id: null } });
      const HR = HM.humanKeyFor(rp.id), RK = 'bk-0000e0e1', RK2 = 'bk-0000e0e2';
      live.add(RK); live.add(RK2);
      for (const bk of [RK, RK2]) { await kr.attach({ profileId: rp.id, browserKey: bk, sessionId: 'sess-' + bk, by: 'agent' }); kr.detach({ profileId: rp.id, browserKey: bk, by: 'agent' }); } // their `close`: alive, pages kept
      await kr.browse(rp.id);
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: TR, type: 'page' }, { targetId: TF, type: 'page' }];
      const take = kr.navigateHuman(HR, { tab: TR }).then((x) => x, (e) => ({ refused: e.code }));
      await startedP; // his switch is in flight — the conversation comes back now
      const n0 = cmdsOf('vs-' + RK).filter((c) => /tab new/.test(c)).length;
      await kr.attach({ profileId: rp.id, browserKey: RK, sessionId: 'sess-' + RK, by: 'agent' });
      const out = { backNewTab: cmdsOf('vs-' + RK).filter((c) => /tab new/.test(c)).length - n0 };
      release(); out.take = await take;
      out.adopted = (((kr._reg().humans || {})[rp.id] || {}).adopted || []).slice();
      // a take whose switch FAILS gives the tab back (never his to close) — the marks it made stay (fail closed)
      kr.detach({ profileId: rp.id, browserKey: RK, by: 'agent' });
      try { out.failTake = await kr.navigateHuman(HR, { tab: TF }); } catch (e) { out.failTake = { refused: e.code }; }
      out.adoptedAfterFail = (((kr._reg().humans || {})[rp.id] || {}).adopted || []).slice();
      out.markedAfterFail = !!kr._reg().tabClosed[`${rp.id}|${RK}`];
      fakeTargets.list = [];
      live.delete(RK); live.delete(RK2);
      try { await kr.stop(rp.id, { why: 'user' }); } catch { }
      kr.shutdown();
      return out;
    };
    const tr1 = await takeRaceLeg(K, 'data-left-race');
    ok(tr1.take && tr1.take.adopted === true && tr1.backNewTab === 1 && J(tr1.adopted) === J(['C0C0000000000000000000000000004D']) && tr1.failTake && tr1.failTake.refused === 'nav_failed' && !tr1.adoptedAfterFail.includes('C0C0000000000000000000000000004E') && tr1.markedAfterFail,
      'verify r4: the take is made where it is judged — a conversation that comes back WHILE his switch to its page is in flight binds a NEW tab (never lands in the page he takes); a take whose switch fails gives the tab back (not his to close) and its marks stay', tr1);
    const rsrc4 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const rn4a = '      if (tv.adopt) adoptOrphan(h, tv.targetId);\n    }\n', rn4b = "    return { ok: true, act: v.act, url: v.url || null, ...(tv && tv.adopt ? { adopted: true } : {}) };";
    const tr0 = await takeRaceLeg(M.load('src/server/browser-keeper.js', rsrc4.replace(rn4a, '    }\n').replace(rn4b, '    if (tv && tv.adopt) adoptOrphan(h, tv.targetId);\n' + rn4b), 'take-after-switch'), 'data-left-racec');
    ok(rsrc4.includes(rn4a) && rsrc4.includes(rn4b) && tr0.take && tr0.take.adopted === true && tr0.backNewTab === 0, 'CONTROL: r3\'s order (the adoption after his switch returned) binds the returning conversation nothing — its next command would run in the page he took — the leg above can go red', tr0);
    // verify r4 (the revert table): r3's `tab_unbound` reached the agent through its ROUTE unpinned — the STATUS row removed
    // answered the refusal as a 500 and the whole fast list stayed green. Through the agent's own route: 503 by name
    {
      const up = (await j('POST', '/api/browser/profiles', { label: 'Unbound' })).json.profile;
      const HU2 = HM.humanKeyFor(up.id), TU = 'C0C0000000000000000000000000006D';
      await j('POST', '/api/agent/browser/use', { profile: 'Unbound' }, as(sA));
      k.detach({ profileId: up.id, browserKey: KA, by: 'agent' }); // its `close`: alive, its page kept
      await k.browse(up.id);
      fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: TU, type: 'page' }];
      const tk = await k.navigateHuman(HU2, { tab: TU });
      const ff = path.join(AB, 'fail-tabnew-vs-' + KA); fs.writeFileSync(ff, '1'); // its bind fails (a busy daemon, a timeout)
      const ru = await j('POST', '/api/agent/browser/use', { profile: 'Unbound' }, as(sA));
      const usrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
      const Ru = M.load('src/routes/browser.js', usrc.replace('  tab_unbound: 503,\n', ''), 'tab-unbound-500');
      Ru.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [] });
      const au = express(); au.use(express.json()); au.use(Ru.router);
      const su = http.createServer(au); servers.push(su); await new Promise((r) => su.listen(0, '127.0.0.1', r));
      const rc = await fetch(`http://127.0.0.1:${su.address().port}/api/agent/browser/use`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...as(sA) }, body: JSON.stringify({ profile: 'Unbound' }) });
      fs.unlinkSync(ff);
      ok(tk.adopted === true && ru.status === 503 && ru.json && ru.json.code === 'tab_unbound' && usrc.includes('  tab_unbound: 503,\n') && rc.status === 500,
        'verify r4: the returning conversation whose new tab cannot be bound while the tab it had is his hears `tab_unbound` through its own route as a 503 (retry), never a 500; CONTROL the routes copy without the STATUS row answers 500 — red', { ru: ru.status, code: ru.json && ru.json.code, control: rc.status });
      fakeTargets.list = [];
      try { await k.closeHuman(HU2); } catch { }
      try { k.detach({ profileId: up.id, browserKey: KA, by: 'agent' }); } catch { }
      await k.stop(up.id, { why: 'user' });
    }
    // verify r2 (the revert table): the CLIENT's words for a refused tab were unpinned — reverted to "Could not open it: <the
    // server's English>" the whole fast tier stayed green. His window words `not_your_tab` / `tabs_unreadable` (and
    // `not_browsing`) through PURE humanRefusalText in the device's language
    const wl = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
    const pinW = (x) => /\['not_browsing', 'not_your_tab', 'tabs_unreadable'\]\.includes\(r\.code\) \? humanRefusalText\(r\.code, \{ label: humanLabel\(\) \}, t\)/.test(x);
    ok(pinW(wl) && !pinW(wl.replace("['not_browsing', 'not_your_tab', 'tabs_unreadable'].includes(r.code) ? humanRefusalText(r.code,", "r.code === 'not_browsing' ? humanRefusalText('not_browsing',")), 'PIN: his window words a refused tab (`not_your_tab`, `tabs_unreadable`) in the device\'s language through humanRefusalText — never the server\'s English; CONTROL the pre-fix toast fails the pin');
  }
  const fileR = await j('POST', `/api/browser/browse/${HW}/navigate`, { url: 'file:///etc/passwd' });
  const chromeR = await j('POST', `/api/browser/browse/${HW}/navigate`, { url: 'chrome://settings' });
  const verbR = await j('POST', `/api/browser/browse/${HW}/navigate`, { verb: 'close' });
  ok(fileR.status === 400 && fileR.json.code === 'not_web' && fileR.json.error === 'Only web addresses' && chromeR.status === 400 && chromeR.json.code === 'not_web' && verbR.status === 400 && cmdsOf('vs-' + HW).slice(before).length === 5, 'file: / chrome: refused by name (`not_web`, "Only web addresses"), an unknown verb 400 — nothing ran', { fileR, chromeR, verbR });
  // verify r3 (#6): the query cut is the RECORD's only — a signed download link he needs to USE reaches the daemon as typed
  // (his address row's argv), while the entry the recorder keeps of that very command loses its query
  {
    const SIGNED = 'https://bucket.s3.example/f/o.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20260928&X-Amz-Expires=900&X-Amz-Signature=9f3c1a0b';
    const n1 = cmdsOf('vs-' + HW).length;
    const rs = await j('POST', `/api/browser/browse/${HW}/navigate`, { url: SIGNED });
    const ran = cmdsOf('vs-' + HW).slice(n1);
    const TT = require('../src/browser-trace.js');
    const ent = TT.entryFor({ id: 'tr-0000000000f1', at: 1, browserKey: HW, profileId: work.id, holder: 'user', command: { action: 'open', params: { url: SIGNED } }, result: { success: true }, url: SIGNED });
    ok(rs.status === 200 && J(ran) === J(['--pin-tab open ' + SIGNED]) && ent.params.url === 'https://bucket.s3.example/f/o.pdf?«cut»' && ent.url === 'https://bucket.s3.example/f/o.pdf?«cut»' && !J(ent).includes('9f3c1a0b'),
      'verify r3 (#6): a signed download link opens AS TYPED (his session\'s argv carries the signature) — the cut is only in the recorded entry of that command', { ran, entry: { params: ent.params, url: ent.url } });
  }
  const badKey = await j('POST', `/api/browser/browse/bk-0000e0a1/navigate`, { url: 'example.com' });
  const gone = await j('POST', `/api/browser/browse/hu-0000beef/navigate`, { url: 'example.com' });
  ok(badKey.status === 400 && gone.status === 409 && gone.json.code === 'not_browsing', 'the key is his: a browser key is refused 400, a stale human key `not_browsing`', { badKey, gone });
  // "Who can use it": a narrowing that keeps the profile from every conversation leaves HIM untouched
  const p0 = k.profile(work.id);
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'session', key: KB }] }, base: B.useStamp(p0) });
  ok(r.status === 200 && k.humanOf(work.id) && k.humanOf(work.id).state === 'driving' && !k.leasesOn(work.id).some((l) => l.browserKey === KA), 'a "Who can use it" narrowing detaches the conversation it no longer admits — HE keeps browsing (the owner may browse every profile)', r.json);
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'all' }, base: B.useStamp(k.profile(work.id)) });
  // Quit the whole browser with a conversation on it ⇒ the browser stops for everyone, he ends `stopped`
  r = await j('POST', '/api/agent/browser/use', { profile: 'Work' }, as(sA));
  const lq = leaseEvents.length;
  r = await j('POST', `/api/browser/browse/${HW}/quit`, {});
  const endEv = leaseEvents.slice(lq).find((e) => e.kind === 'human-end');
  ok(r.status === 200 && r.json.stopped === true && r.json.conversations === 1 && k.browserOf(work.id).state === 'stopped' && !k.humanOf(work.id) && endEv && endEv.reason === 'stopped' && k.leasesOn(work.id).some((l) => l.browserKey === KA), 'Quit the whole browser: it STOPS for everyone (one conversation lost its page — the count the confirm named), he ends `stopped`, the conversation keeps its lease (its next command starts the browser again)', { r: r.json, endEv });
  // …the conversation lost its tab with the browser: its NEXT command binds a new one first (never `tab_gone` — the real
  // 0.38.1's answer the heavy leg (e) caught)
  const markedQ = k._reg().tabClosed[`${work.id}|${KA}`];
  const tq = cmdsOf('vs-' + KA).length;
  const rq = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://x.example'] }, as(sA));
  const boundQ = cmdsOf('vs-' + KA).slice(tq).filter((c) => /tab new$/.test(c));
  ok(Number.isFinite(markedQ) && rq.status === 200 && boundQ.length === 1 && k._reg().tabClosed[`${work.id}|${KA}`] === undefined, 'the conversation\'s next command after the Quit: the browser starts again and binds it a NEW tab first (the mark the stop set), then drops the mark (the owner, 5: "they reopen with `tab new` on their next command")', { markedQ, rq: rq.json, boundQ });
  ok(spyCount() === 0 && !sessionCards.some((c) => c.m.holder === 'user' || HM.isHumanKey(c.m.browserKey)) && sessionCards.length > 0 && sessionCards.every((c) => c.key === KA) && sessionCards.some((c) => c.m.phase === 'end' && c.m.reason === 'stopped'), '…and nothing of HIS reached any chat: a Quit is a Stop — the one card is the conversation\'s own session ending `stopped` (its lease session), a stop with no takeover delivers nothing', { spy: Object.fromEntries(Object.entries(spy).map(([a, b]) => [a, b.length])), cards: sessionCards.map((c) => c.key + ':' + c.m.phase + ':' + (c.m.reason || '')) });
}
{
  // Close on a profile nobody else uses: his tabs close under HIS session, the browser stays, the idle clock starts now
  solo = (await j('POST', '/api/browser/profiles', { label: 'Solo' })).json.profile;
  const HS = HM.humanKeyFor(solo.id);
  let r = await j('POST', `/api/browser/profiles/${solo.id}/browse`, {});
  clock += 60000;
  fakeTargets.list = [{ targetId: AGENT_TAB, type: 'page', openerId: null }, { targetId: OWN_TAB, type: 'page', openerId: null }, { targetId: POP_TAB, type: 'page', openerId: OWN_TAB }]; // his tab (the fake's first `tab new` answer), a popup it opened, an agent's tab beside them
  const c0 = cmdsOf('vs-' + HS).length;
  r = await j('POST', `/api/browser/browse/${HS}/close`, {});
  const closes = cmdsOf('vs-' + HS).slice(c0);
  const rec = k.browserOf(solo.id);
  ok(r.status === 200 && r.json.ended === 'released' && J(closes) === J(['tab close ' + POP_TAB, 'tab close ' + OWN_TAB, 'close']) && !closes.includes('tab close') && rec.state === 'ready' && rec.lastLeaseDroppedAt === clock && !k.humanOf(solo.id), 'Close: HIS tabs only, each BY ID — the popup his tab opened, then his own tab — then his session; never the bare `tab close` (his session\'s current tab), never `--all`, never the agent\'s tab beside them; the browser STAYS (ready) and its idle clock starts now (the last holder left)', { closes, rec: { state: rec.state, lastLeaseDroppedAt: rec.lastLeaseDroppedAt } });
  // the keep: he launched it ⇒ 12 h away; the browser NEVER idles out meanwhile; then `left`, then it idles out
  await k.stop(solo.id, { why: 'user' });
  r = await j('POST', `/api/browser/profiles/${solo.id}/browse`, {});
  ok(r.json.how === 'launch' && k.humanOf(solo.id).launched, 'Browse again on the stopped Solo: he launches it (the 12 h keep)');
  k.humanTake({ key: HS, viewerId: 21 });
  k.humanRelease({ key: HS, viewerId: 21, cause: 'viewer-left' });
  ok(k.humanOf(solo.id).state === 'away', 'his window closes ⇒ AWAY (his tab kept)');
  clock += 11 * 3600e3; await k.tick();
  ok(k.humanOf(solo.id) && k.browserOf(solo.id).state === 'ready', '11 h away: he is still kept and the browser has NOT idled out (15 min idle — his holder row counts)', k.browserOf(solo.id).state);
  const c1 = cmdsOf('vs-' + HS).length;
  clock += 3600e3 + 1000; await k.tick();
  ok(!k.humanOf(solo.id) && k.browserOf(solo.id).state === 'ready' && cmdsOf('vs-' + HS).slice(c1).includes('close') && leaseEvents.some((e) => e.kind === 'human-end' && e.key === HS && e.reason === 'left'), 'past 12 h: he ends `left` (his tab closes), the browser stays one more idle period');
  clock += 16 * 60000; await k.tick(); await sleep(50);
  ok(k.browserOf(solo.id).state === 'stopped' && k.browserOf(solo.id).stoppedBy === 'idle', '…and then idles out by the keeper\'s rule (nobody holds it)', k.browserOf(solo.id));
}
{
  // he JOINED a browser an agent launched ⇒ the 10-min keep; the browser follows its other holders
  shop = (await j('POST', '/api/browser/profiles', { label: 'Shop' })).json.profile;
  const HP = HM.humanKeyFor(shop.id);
  let r = await j('POST', '/api/agent/browser/use', { profile: 'Shop' }, as(sB));
  const L0 = logOf('launches.log').length;
  r = await j('POST', `/api/browser/profiles/${shop.id}/browse`, {});
  ok(r.json.how === 'join' && logOf('launches.log').length === L0 && k.humanOf(shop.id).launched === false && k.humanOf(shop.id).keepMs === 10 * 60000, 'Browse yourself on a browser an AGENT runs: JOINED (no second launch) ⇒ kept 10 min while away', r.json);
  k.humanTake({ key: HP, viewerId: 31 }); k.humanRelease({ key: HP, viewerId: 31 });
  clock += 9 * 60000; await k.tick();
  ok(!!k.humanOf(shop.id), '9 min away: kept');
  clock += 2 * 60000; await k.tick();
  ok(!k.humanOf(shop.id) && k.browserOf(shop.id).state === 'ready', 'past 10 min: he ends `left`; the browser stays (the agent holds it)');
  // browse again, then Delete… (the panel's release) — verify r1 (H4): REFUSED BY NAME while he browses (before, it
  // stopped the browser under his page — a Delete from another device named only the conversations in its confirm)
  r = await j('POST', `/api/browser/profiles/${shop.id}/browse`, {});
  const ld = leaseEvents.length;
  let de = null; try { await k.releaseAll(shop.id); } catch (e) { de = e; }
  ok(de && de.code === 'browsing_yourself' && /browsing “Shop” yourself/.test(de.message) && /Close/.test(de.message) && k.humanOf(shop.id) && k.browserOf(shop.id).state === 'ready' && k.leasesOn(shop.id).some((l) => l.browserKey === KB) && !leaseEvents.slice(ld).some((e) => e.kind === 'human-end' || e.kind === 'detach'),
    'verify r1 (H4): Delete… (releaseAll) while he browses it himself is REFUSED BY NAME (`browsing_yourself`: "press Close … first") before anything is released — his page, the browser and the conversation\'s lease untouched', { code: de && de.code, msg: de && de.message });
  // …his Close, then Delete… goes through (the conversation released, the browser stopped)
  await k.closeHuman(HP);
  const rel = await k.releaseAll(shop.id);
  ok(rel && k.browserOf(shop.id).state === 'stopped' && !k.leasesOn(shop.id).length, '…after his Close, Delete… releases and stops as before', rel);
  // CONTROL: the keeper copy without the refusal stops the browser under his page
  {
    const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const needle = "    if (humans.has(profileId)) throw namedError('browsing_yourself', HM.humanRefusalText('browsing_yourself', { label: p.label }));";
    ok(src.includes(needle), 'the Delete refusal needle');
    const Kd = M.load('src/server/browser-keeper.js', src.replace(needle, ''), 'delete-under-him');
    const kd = mkKeeper(Kd, { dataDir: path.join(ROOT, 'data-del'), readTargets });
    const dp = kd.createProfile({ label: 'Del' }, { owner: { kind: 'instance', id: null } });
    await kd.browse(dp.id);
    let ce = null; try { await kd.releaseAll(dp.id); } catch (e) { ce = e; }
    ok(!ce && kd.browserOf(dp.id).state === 'stopped', 'CONTROL: the keeper copy without the refusal STOPS his browser on Delete… — the leg above can go red', ce && ce.code);
  }
  // verify r2 (the revert table): the Delete… refusal's ROUTE status and the panel's own words were unpinned — the STATUS row
  // `browsing_yourself: 409` removed answered 500 and the panel's at-once refusal removed sent the delete, both green
  {
    const dp2 = k.createProfile({ label: 'Del2' }, { owner: { kind: 'instance', id: null } });
    await k.browse(dp2.id); k.humanTake({ key: HM.humanKeyFor(dp2.id), viewerId: 'del2', holderAlive: false });
    const rd = await j('POST', `/api/browser/profiles/${dp2.id}/forget`, { release: true, unpin: true });
    ok(rd.status === 409 && rd.json.code === 'browsing_yourself' && k.browserOf(dp2.id).state === 'ready' && k.humanOf(dp2.id), 'verify r2: Delete… through its ROUTE (POST …/forget {release}) while he browses answers 409 `browsing_yourself` — nothing released, nothing stopped', rd.json);
    const trsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
    const TRd = M.load('src/routes/browser-trace.js', trsrc.replace('browsing_yourself: 409, ', ''), 'delete-500');
    TRd.setup({ keeper: k, trace, activeSessions: active, releaseProfile: (id) => R.releaseProfile(id), unpinProfile: (id) => R.unpinProfile(id), notice: () => { }, keyForPickedSession: (id) => R.keyForPickedSession(id) });
    const ad = express(); ad.use(express.json()); ad.use(TRd.router);
    const sd = http.createServer(ad); servers.push(sd); await new Promise((r) => sd.listen(0, '127.0.0.1', r));
    const rdc = await fetch(`http://127.0.0.1:${sd.address().port}/api/browser/profiles/${dp2.id}/forget`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: true, unpin: true }) });
    ok(trsrc.includes('browsing_yourself: 409, ') && rdc.status === 500, 'CONTROL: the trace routes copy without the STATUS row answers the refusal as a 500 — red', rdc.status);
    const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
    const pinD = (x) => /delete: async \(r\) => \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(r\.human\) \{ showToast\(humanRefusalText\('browsing_yourself', \{ label: String\(r\.label \|\| r\.id\) \}, t\)/.test(x);
    ok(pinD(tv) && !pinD(tv.replace('      if (r.human) { showToast(', '      if (false) { showToast(')), 'PIN: the panel\'s Delete… says the refusal AT ONCE in the device\'s words from the row\'s `human` fact (before any confirm or request); CONTROL the pre-fix handler fails the pin');
    await k.closeHuman(HM.humanKeyFor(dp2.id)); await k.stop(dp2.id, { why: 'user' });
  }
}
// the refusals: remote, cdp, an ephemeral record, the ceiling, the lock
{
  let e = null;
  let paired = true; // lane remote-profile-start: a KNOWN machine's profile is browsed (test-remote-profile-start) — this one is unpaired after its create
  const kr = mkKeeper(K, { dataDir: path.join(ROOT, 'data-r'), hostKnown: () => paired });
  const rp = kr.createProfile({ label: 'Remote', host: 'dev-1' }, { owner: { kind: 'instance', id: null } });
  paired = false;
  try { await kr.browse(rp.id); } catch (x) { e = x; }
  ok(e && e.code === 'remote_profile' && /saved on dev-1/.test(e.message), 'a machine this VibeSpace no longer knows: remote_profile by name', e && e.message);
  const cp = kr.createProfile({ label: 'Ext', provider: 'cdp', cdpPort: 9333 }, { owner: { kind: 'instance', id: null } });
  e = null; try { await kr.browse(cp.id); } catch (x) { e = x; }
  ok(e && e.code === 'not_ours', 'a browser VibeSpace only connects to (cdp): not_ours', e && e.message);
  e = null; try { await kr.browse('bp-0000dead'); } catch (x) { e = x; }
  ok(e && e.code === 'not-found', 'no such profile: not-found');
  // the ceiling: a LAUNCH at the machine ceiling is refused; a JOIN is not
  const lim = { ...require('../src/keeper-limits.js'), CONCURRENT_CAP: 1 };
  const kc = mkKeeper(K, { dataDir: path.join(ROOT, 'data-c'), limits: lim });
  const c1 = kc.createProfile({ label: 'C1' }, { owner: { kind: 'instance', id: null } }), c2 = kc.createProfile({ label: 'C2' }, { owner: { kind: 'instance', id: null } });
  await kc.start(c1.id, { why: 'test' });
  e = null; try { await kc.browse(c2.id); } catch (x) { e = x; }
  const jn = await kc.browse(c1.id);
  ok(e && e.code === 'cap' && /1 browsers are running/.test(e.message) && jn.how === 'join', 'the ceiling: a LAUNCH at 1/1 is refused `cap` ("Stop one"), a JOIN at 1/1 goes through', { e: e && e.message, jn });
  const rr = await j('POST', `/api/browser/profiles/${work.id}/browse`, { host: 'dev-1' });
  ok(rr.status === 400 && rr.json.code === 'unsupported-host', 'the route refuses `host` (local-only, the /api/browser/* rule)');
  await kc.stop(c1.id, { why: 'user' });
}
// verify r1 (H4): A SERVER RESTART INSIDE HIS KEEP — the holder lived in keeper memory only, so the restarted keeper adopted
// his browser with NO holder and its idle clock (from the launch) stopped it at the first tick under his page; his window's
// re-attach answered `browser_stopped` and Browse yourself launched a second browser + a second tab (reproduced first:
// verify/repro-f2). The holder is persisted now, restored AWAY; a browser that did not survive drops him `stopped`.
{
  const restartLeg = async (Kmod, dir) => {
    const k1 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
    const p = k1.createProfile({ label: 'Kept' }, { owner: { kind: 'instance', id: null } });
    const HK = HM.humanKeyFor(p.id);
    await k1.browse(p.id);
    k1.humanTake({ key: HK, viewerId: 51 });
    clock += 40 * 60000; // he browses 40 min, then the server restarts (an Update)
    k1.shutdown();
    const k2 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
    const ev = []; k2.onLease((e) => { ev.push(e); return null; });
    const boot = await k2.boot();
    await k2.tick(); await sleep(60);
    const out = { boot, browser: k2.browserOf(p.id).state, stoppedBy: k2.browserOf(p.id).stoppedBy || null, human: k2.humanOf(p.id), target: k2.humanTargetFor(HK) };
    const t0 = cmdsOf('vs-' + HK).filter((c) => /tab new/.test(c)).length;
    let b = null; try { b = await k2.browse(p.id); } catch (e) { b = { code: e.code }; }
    out.browse = b && (b.how || b.code);
    out.tabNews = cmdsOf('vs-' + HK).filter((c) => /tab new/.test(c)).length - t0;
    if (b && b.fresh) { k2.humanAttach({ key: HK, viewerId: 52, token: b.fresh }); out.reopened = ev.filter((e) => e.kind === 'human-start' && e.key === HK && e.restored === true).length; }
    out.k2 = k2; out.p = p;
    return out;
  };
  const r = await restartLeg(K, 'data-rs');
  ok(r.browser === 'ready' && r.human && r.human.state === 'away' && r.human.launched === true && r.human.keepMs === 12 * 3600e3 && r.boot.humans === 1 && r.target.ok === true,
    'verify r1 (H4): a restart 40 min into his browsing — the browser is ADOPTED and SURVIVES the first tick (his holder row counts for the idle clock), he is restored AWAY with his 12 h keep, his window\'s re-attach finds his target', { browser: r.browser, stoppedBy: r.stoppedBy, human: r.human, target: r.target && r.target.code });
  ok(r.browse === 'rejoin' && r.tabNews === 0 && r.reopened === 1, 'Browse yourself after the restart CONTINUES his tab (rejoin — no second `tab new`, nothing orphaned), and the first take re-opens his session marker (the old one ended `restart`)', { browse: r.browse, tabNews: r.tabNews, reopened: r.reopened });
  await r.k2.stop(r.p.id, { why: 'user' }); r.k2.shutdown();
  // a browser that did NOT survive the restart (its daemon gone) ⇒ he is dropped `stopped`, never a holder on a dead Chrome
  const kd = mkKeeper(K, { dataDir: path.join(ROOT, 'data-rd'), readTargets });
  const pd = kd.createProfile({ label: 'Dead' }, { owner: { kind: 'instance', id: null } });
  await kd.browse(pd.id);
  const dpid = kd._reg().browsers[pd.id].pid; kd.shutdown();
  try { process.kill(dpid, 'SIGKILL'); } catch { /* gone */ }
  await sleep(80);
  const kd2 = mkKeeper(K, { dataDir: path.join(ROOT, 'data-rd'), readTargets });
  const bd = await kd2.boot();
  ok(bd.humans === 0 && !kd2.humanOf(pd.id) && !B.isLiveBrowser(kd2.browserOf(pd.id)) && !(kd2._reg().humans || {})[pd.id], 'a restart whose browser did NOT survive drops his holder `stopped` (disk too) — never a Continue on a dead Chrome', { humans: bd.humans, state: kd2.browserOf(pd.id).state });
  kd2.shutdown();
  // CONTROL: the keeper copy that restores nothing (the pre-fix memory-only holder) — the browser idles out at the first tick
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = '    for (const r of Object.values(reg.humans || {})) {';
  ok(src.includes(needle), 'the restore needle (the control below removes it)');
  const Kr = M.load('src/server/browser-keeper.js', src.replace(needle, '    for (const r of []) {'), 'memory-only-human');
  const rc = await restartLeg(Kr, 'data-rc');
  ok(rc.browser === 'stopped' && rc.stoppedBy === 'idle' && !rc.human, 'CONTROL: the memory-only keeper copy stops his browser at the first tick after the restart (`idle`) — the legs above can go red', { browser: rc.browser, stoppedBy: rc.stoppedBy });
  try { await rc.k2.stop(rc.p.id, { why: 'user' }); } catch { } rc.k2.shutdown();
  // verify r2 (the revert table): two parts of the restore were unpinned — (a) a holder AWAY at the restart keeps the keep of
  // his ORIGINAL close (the brief: "the 12 h keep across a restart still 12 h from the ORIGINAL close, not from the
  // restart"); restoring `awaySince: now()` stayed green; (b) PURE normalizeRegistry drops a holder whose key does not name
  // its profile; dropping the check stayed green
  const awayLeg = async (Kmod, dir) => {
    const k1 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
    const p = k1.createProfile({ label: 'Away' }, { owner: { kind: 'instance', id: null } });
    const HK = HM.humanKeyFor(p.id);
    await k1.browse(p.id); k1.humanTake({ key: HK, viewerId: 61 }); k1.humanRelease({ key: HK, viewerId: 61 }); // his window closes: AWAY
    clock += 11 * 3600e3; // 11 h away, then the server restarts
    k1.shutdown();
    const k2 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
    await k2.boot();
    clock += 30 * 60e3; await k2.tick(); await sleep(40);
    const at1130 = k2.humanOf(p.id) && k2.humanOf(p.id).state;
    clock += 31 * 60e3; await k2.tick(); await sleep(40); // 12 h 01 min after his ORIGINAL close (1 h 01 after the restart)
    const at1201 = k2.humanOf(p.id) ? k2.humanOf(p.id).state : null;
    try { await k2.stop(p.id, { why: 'user' }); } catch { }
    k2.shutdown();
    return { at1130, at1201 };
  };
  const aw = await awayLeg(K, 'data-aw');
  ok(aw.at1130 === 'away' && aw.at1201 === null, 'verify r2: AWAY 11 h when the server restarted — still kept at 11 h 30, ended `left` at 12 h 01 after his ORIGINAL close (never a fresh 12 h from the restart)', aw);
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const aneedle = "awaySince: r.state === 'away' && r.awaySince ? r.awaySince : now(),";
  const awc = await awayLeg(M.load('src/server/browser-keeper.js', ksrc.replace(aneedle, 'awaySince: now(),'), 'keep-from-restart'), 'data-awc');
  ok(ksrc.includes(aneedle) && awc.at1201 === 'away', 'CONTROL: a keeper copy that restarts the keep at the restart still keeps him at 12 h 01 — the leg above can go red', awc);
  const doc = { humans: { 'bp-0000aaa1': { key: 'hu-0000aaa1', since: 1 }, 'bp-0000aaa2': { key: 'hu-0000bbb2', since: 1 }, 'x': { key: 'hu-0000aaa3' } } };
  const kept = Object.keys(B.normalizeRegistry(doc).humans);
  const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
  const bneedle = " && v.key === 'hu-' + k.slice(3)).map(";
  const Bn = M.load('src/browser-profiles.js', bsrc.replace(bneedle, ').map('), 'human-key-unchecked');
  ok(J(kept) === J(['bp-0000aaa1']) && bsrc.includes(bneedle) && Object.keys(Bn.normalizeRegistry(doc).humans).includes('bp-0000aaa2'), 'verify r2: a persisted holder is kept only when its key names its profile (a hand-edited or foreign row is dropped); CONTROL the copy without the check keeps the mismatched row — red', { kept });
}
// verify r2 (KILL CLASS / the heal): his Chrome dies under his page and a NEW one runs on the directory (the tick's heal, or
// 0.38.1's in-place relaunch). Measured on the real 0.38.1 + Chrome 154 (verify/repro-r2-heal): every pinned session then
// answered `tab_gone` — his address row and Continue, Browse yourself only FOCUSED his window on the dead tab, the
// conversation's next command. The fake has no Chrome: the module's own process facts are swapped for this leg only (the
// identified browser dead, a new one under the same daemon — its cmdline naming the directory), and the REAL tick runs.
{
  const healLeg = async (Kmod, dir, { twoStep = false, samePid = false } = {}) => {
    const kh = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
    await kh._facts.probeVersion();
    const hp = kh.createProfile({ label: 'Heal' }, { owner: { kind: 'instance', id: null } });
    const HH = HM.humanKeyFor(hp.id), KH = 'bk-0000e0f1';
    const evs = []; kh.onLease((ev) => { evs.push(ev); return null; });
    live.add(KH);
    await kh.browse(hp.id);
    kh.humanTake({ key: HH, viewerId: 41, holderAlive: false });
    await kh.attach({ profileId: hp.id, browserKey: KH, sessionId: 'sess-heal', by: 'user' });
    const rec = kh._reg().browsers[hp.id];
    rec.browser = samePid ? { pid: process.pid, starttime: 1, dir: hp.dir, devtoolsPort: 1 } : { pid: 2 ** 22 - 7, starttime: 1, dir: hp.dir, devtoolsPort: 1 }; // the Chrome the keeper had identified — gone (verify r3 `samePid`: a recycled pid number, another starttime)
    const saved = { browserOfDaemon: F.browserOfDaemon, lockHolderFacts: F.lockHolderFacts, procCmdline: F.procCmdline };
    F.lockHolderFacts = () => ({ lock: null, holder: null, devtoolsPort: null });
    let asks = 0; // verify r3 `twoStep`: the tick first sees NO browser (a recorded loss), then its heal's relaunch — the real 0.38.1 order
    F.browserOfDaemon = () => (twoStep && asks++ === 0 ? null : { pid: process.pid, starttime: F.procStart(process.pid), dir: hp.dir }); // a NEW one under the same daemon
    F.procCmdline = (x) => (x === process.pid ? `chrome\0--user-data-dir=${hp.dir}\0` : saved.procCmdline(x));
    const out = {};
    try {
      await kh.tick(); await sleep(50);
      out.replaced = !!(rec.browser && rec.browser.pid === process.pid) && rec.state === 'ready';
      out.human = kh.humanOf(hp.id) ? kh.humanOf(hp.id).state : null;
      out.ended = evs.filter((e) => e.kind === 'human-end' && e.key === HH).map((e) => e.reason);
      out.marked = !!kh._reg().tabClosed[`${hp.id}|${KH}`];
      const n0 = cmdsOf('vs-' + KH).filter((c) => /tab new/.test(c)).length;
      await kh.attach({ profileId: hp.id, browserKey: KH, sessionId: 'sess-heal', by: 'user' }); // its next command (/resolve attaches first)
      out.convNewTab = cmdsOf('vs-' + KH).filter((c) => /tab new/.test(c)).length - n0;
      const t0 = cmdsOf('vs-' + HH).filter((c) => /tab new/.test(c)).length;
      out.browse = await kh.browse(hp.id).then((x) => x.how, (x) => x.code);
      out.hisNewTab = cmdsOf('vs-' + HH).filter((c) => /tab new/.test(c)).length - t0;
      out.keepMs = kh.humanOf(hp.id) ? kh.humanOf(hp.id).keepMs : null; // verify r3: the browser HE launched stays his launch across the heal
    } finally { Object.assign(F, saved); }
    try { await kh.stop(hp.id, { why: 'user' }); } catch { }
    kh.shutdown(); live.delete(KH);
    return out;
  };
  const hl = await healLeg(K, 'data-heal');
  // verify r3 (the revert table): r2's `replaced` has two arms the one-step leg never reached — a replacement AFTER a recorded
  // loss (the tick sees the Chrome gone, then its heal relaunches: the real 0.38.1 order — the heavy leg's only) and a
  // recycled pid number with another starttime; each reverted alone stayed green on the fast tier
  {
    const h2 = await healLeg(K, 'data-heal-2', { twoStep: true }), h3 = await healLeg(K, 'data-heal-3', { samePid: true });
    ok([h2, h3].every((x) => x.replaced && x.human === null && J(x.ended) === J(['stopped']) && x.browse === 'join' && x.hisNewTab === 1), 'verify r3 (the heal): he ends `stopped` when the tick first records the loss and the heal then relaunches (two steps), and when the new Chrome carries a recycled pid number with another starttime', { h2, h3 });
    const hsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const Kb = M.load('src/server/browser-keeper.js', hsrc.replace(': !!rec.browserLost);', ': false);'), 'replaced-no-loss-arm');
    const Kc = M.load('src/server/browser-keeper.js', hsrc.replace('!(next.pid === b.pid && next.starttime === b.starttime)', '!(next.pid === b.pid)'), 'replaced-pid-only');
    const c2 = await healLeg(Kb, 'data-heal-2c', { twoStep: true }), c3 = await healLeg(Kc, 'data-heal-3c', { samePid: true });
    ok(hsrc.includes(': !!rec.browserLost);') && c2.human !== null && c3.human !== null, 'CONTROLS: a copy without the recorded-loss arm keeps him on the dead tab after a two-step heal; a pid-only copy keeps him after a recycled pid — the leg above can go red', { c2: c2.human, c3: c3.human });
  }
  ok(hl.keepMs === HM.DEFAULT_HUMAN_KEEP_MS, 'verify r3 (the heal): Browse again after the heal JOINS the browser HE launched (the same daemon run — its Chrome relaunched by the keeper) and keeps his page 12 h while away, never the 10 min of a browser an agent launched (the owner, 8)', { keepMs: hl.keepMs });
  {
    const lsrc0 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const ln = "      const launched = v.how === 'launch' || (v.how === 'join' && !!rec && rec.startedBy === BROWSE_WHY);";
    const Kl0 = M.load('src/server/browser-keeper.js', lsrc0.replace(ln, "      const launched = v.how === 'launch';"), 'launch-by-press-only');
    const hc = await healLeg(Kl0, 'data-heal-keep');
    ok(lsrc0.includes(ln) && hc.browse === 'join' && hc.keepMs === 10 * 60e3, 'CONTROL: the copy that counts only THIS press as his launch keeps his page 10 min after the heal — the leg above can go red', { keepMs: hc.keepMs });
  }
  // lane profile-lock-roll (L2; verify r1 F6 restated): a conversation's lease on the REPLACED browser is marked (`life`) and its
  // next command binds it a tab FIRST and is TOLD (`rebound` → `[tab_rebound]`) — never a silent blank tab, never `tab_gone`
  ok(hl.replaced && hl.human === null && J(hl.ended) === J(['stopped']) && hl.marked && hl.convNewTab === 1 && hl.browse === 'join' && hl.hisNewTab === 1,
    'verify r2 (the heal): a NEW Chrome replaced the one under his page — his browsing ends `stopped` (his window says so; Browse yourself JOINS with a new tab, never focuses a window on the dead tab); a conversation\'s lease is marked and its next command binds a tab first and is told (lane profile-lock-roll L2 — the agent learns its page is gone from the note, never a silent blank tab)', hl);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = '    if (replaced) tabsWentWithBrowser(rec, seenBy);\n';
  ok(src.includes(needle), 'the replaced-browser needle (the control below removes it)');
  const Kh = M.load('src/server/browser-keeper.js', src.replace(needle, ''), 'relaunch-keeps-dead-tabs');
  const hc = await healLeg(Kh, 'data-heal-c');
  ok(hc.human === 'driving' && hc.browse === 'focus' && hc.hisNewTab === 0, 'CONTROL: the keeper copy that ignores the replacement keeps him "driving" a dead tab (Browse yourself = focus, no new tab) — the leg above can go red', hc);
}
// a backend switch while he browses is a PROPOSAL (never a stop under his page)
{
  const W = await import('./fixtures/browser-switcher-views.mjs');
  const ks = mkKeeper(K, { dataDir: path.join(ROOT, 'data-s'), providers: W.wiredCloak, serverSetting: (x) => (x === 'browser.cloak.executablePath' ? '/bin/true' : settings[x]), keys: { keyFor: () => ({ source: 'user', values: { licenseKey: 'k' } }), sourceOf: () => ({ source: 'user' }) } });
  const sp = ks.createProfile({ label: 'Sw' }, { owner: { kind: 'instance', id: null } });
  await ks.browse(sp.id);
  const row = ks.switcherView(sp.id).rows.find((x) => x.id === 'cloak');
  const r = await ks.switchBackend({ profileId: sp.id, target: 'cloak', by: { kind: 'user' }, confirmDowngrade: true }).catch((x) => ({ code: x.code, error: x.message }));
  ok(row && row.state === 'in-use-by-hand' && row.facts.driver === HM.humanKeyFor(sp.id) && r.mode === 'proposal' && ks.browserOf(sp.id).state === 'ready' && ks.humanOf(sp.id), 'a switch while he browses: the dialog\'s row is in-use-by-hand (driver = his key: "Close my browsing"), the switch itself a PROPOSAL — the Chrome under his page never stops', { state: row && row.state, driver: row && row.facts.driver, r });
  await ks.stop(sp.id, { why: 'user' });
}
// a MEDIATED profile: his session is raw — the mediator never grants his key
{
  const grants = [];
  const fakeMed = { available: () => true, port: () => 1, list: () => [], grantFor: async (o) => { grants.push(o.browserKey); return { url: 'ws://127.0.0.1:1/m/' + o.browserKey }; }, repoint() { }, revoke() { }, interrupt: () => ({ aborted: [] }), urlFor: () => null, creditInput: () => null, admitTarget() { }, interruptionOf: () => null, shutdown() { } };
  const km = mkKeeper(K, { dataDir: path.join(ROOT, 'data-m'), mediator: fakeMed });
  const mp = km.createProfile({ label: 'Med', sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
  const HMd = HM.humanKeyFor(mp.id);
  await km.browse(mp.id);
  const port = await km.streamPortFor(km.humanTargetFor(HMd));
  ok(km.isMediated(km.profile(mp.id)) && port.ok && grants.every((g) => !HM.isHumanKey(g)) && cmdsOf('vs-' + HMd).some((c) => /tab new/.test(c)) && logOf('connects.log').some((c) => c.sess === 'vs-' + HMd && c.cdp.includes(`:${DEAD_CDP}/`)), 'a MEDIATED profile: his session goes over the RAW url (his tab outside every agent grant) — no grant is ever minted for his key, his live view\'s port too', { grants, port });
  await km.stop(mp.id, { why: 'user' });
}
// verify r1 (H3): QUIT THE WHOLE BROWSER on a MEDIATED profile — measured on the real 0.38.1 + the real mediator
// (verify/repro-h3-mediated): the conversation's session (its own namespace over its scoped url) answered `tab_gone` to
// every command after the Quit (the stop's tab mark excluded mediated leases). Now its next attach binds a NEW tab under
// ITS session, in ITS namespace, over ITS grant's url (the env its CLI runs with) — its own tab, through the mediator.
{
  const medLeg = async (Kmod, dir) => {
    const url = (bk) => 'ws://127.0.0.1:1/m/' + ('g' + bk.replace(/[^0-9a-z]/g, '')).padEnd(32, 'x') + '/devtools/browser';
    const med = { available: () => true, port: () => 1, list: () => [], grantFor: async (o) => ({ url: url(o.browserKey) }), repoint() { }, revoke() { }, interrupt: () => ({ aborted: [] }), urlFor: (pid, bk) => url(bk), creditInput: () => null, admitTarget() { }, interruptionOf: () => null, shutdown() { } };
    const kq = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), mediator: med, readTargets });
    const qp = kq.createProfile({ label: 'MedQ', sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
    await kq.attach({ profileId: qp.id, browserKey: KA, sessionId: 'sess-a', by: 'user' });
    const b = await kq.browse(qp.id);
    await kq.quitHuman(b.key);
    const marked = Number.isFinite(kq._reg().tabClosed[`${qp.id}|${KA}`]);
    const c0 = logOf('cmds.log').length;
    await kq.attach({ profileId: qp.id, browserKey: KA, sessionId: 'sess-a', by: 'user' }); // the conversation's next command (/resolve's attach)
    const bound = logOf('cmds.log').slice(c0).filter((c) => /tab new$/.test(c.argv.join(' ')) && c.ns === `vs-${qp.id}-${KA}` && c.sess === 'vs-' + KA && c.cdp === url(KA));
    const out = { marked, bound: bound.length, left: kq._reg().tabClosed[`${qp.id}|${KA}`] };
    await kq.stop(qp.id, { why: 'user' }); kq.shutdown();
    return out;
  };
  const m = await medLeg(K, 'data-mq');
  ok(m.marked && m.bound === 1 && m.left === undefined, 'verify r1 (H3): after Quit on a MEDIATED profile the conversation\'s tab is marked gone, and its next attach binds ONE new tab under ITS session in ITS namespace over ITS grant\'s url (never the raw endpoint, never another\'s namespace), then drops the mark', m);
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = "      if (p && !isEph(p) && why !== 'switch') for (const l of reg.leases) if (l.profileId === profileId) markTabLost(profileId, l.browserKey, 'closed');"; // lane profile-lock-roll: the ONE mark pair (verify r1 F6)
  ok(src.includes(needle), 'the stop\'s tab-mark needle');
  const Kq = M.load('src/server/browser-keeper.js', src.replace(needle, needle.replace("!isEph(p) && why", "!isEph(p) && !isMediated(p) && why")), 'mediated-unmarked');
  const mc = await medLeg(Kq, 'data-mqc');
  ok(!mc.marked && mc.bound === 0, 'CONTROL: the keeper copy that leaves mediated leases unmarked binds nothing — the conversation keeps its gone tab (the real binary answered `tab_gone`) — red', mc);
}
// CONTROL: a keeper whose idle clock reads the leases only stops the browser under his kept page
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = '      const idle = B.browserIdle(rec, holdersOn(rec.profileId), t, idleMs());';
  ok(src.includes(needle), 'the idle clock reads holdersOn (the census needle)');
  const Kc = M.load('src/server/browser-keeper.js', src.replace(needle, '      const idle = B.browserIdle(rec, reg.leases, t, idleMs());'), 'idle-leases-only');
  const kx = mkKeeper(Kc, { dataDir: path.join(ROOT, 'data-x') });
  const xp = kx.createProfile({ label: 'X' }, { owner: { kind: 'instance', id: null } });
  await kx.browse(xp.id);
  const HX = HM.humanKeyFor(xp.id);
  kx.humanTake({ key: HX, viewerId: 41 }); kx.humanRelease({ key: HX, viewerId: 41 });
  clock += 2 * 3600e3; await kx.tick(); await sleep(50);
  ok(kx.browserOf(xp.id).state === 'stopped', 'CONTROL: a keeper copy whose idle clock reads the leases only STOPS the browser 2 h into his 12 h keep — the keep leg above can go red', kx.browserOf(xp.id).state);
}

// ═══ ②b the REAL bridge over a fake upstream + ③ the REAL recorder on his relay ═══
console.log('— ②b the bridge: ?browse=, the window his press opened drives, Continue here, no anchor, his acts to the tap only, the end said');
const jpeg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]).toString('base64');
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function fakeUpstream() {
  const port = await freePort();
  const got = []; const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  let frameTimer = null;
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(J({ type: 'status', connected: true, engine: 'chrome', viewportWidth: 1280, viewportHeight: 720 }));
    ws.send(J({ type: 'tabs', tabs: [{ tabId: 't1', targetId: 'AAAA0000AAAA0000AAAA0000AAAA0001', active: true, url: 'https://x.test/a', title: 'A' }] }));
    ws.send(J({ type: 'url', url: 'https://x.test/a' }));
    ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type !== 'config') got.push(m); } catch { } });
    ws.on('close', () => clients.delete(ws));
    if (!frameTimer) { frameTimer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(J({ type: 'frame', data: jpeg(1280, 720), metadata: { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, scrollOffsetX: 0, scrollOffsetY: 0 } })); }, 100); frameTimer.unref(); }
  });
  return { port, got, send(o) { for (const c of clients) if (c.readyState === 1) c.send(J(o)); }, close() { if (frameTimer) clearInterval(frameTimer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}
function viewer(port, q) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${S.STREAM_PATH}?${q}`);
  const v = { ws, msgs: [], closed: null };
  ws.on('message', (d) => { try { const m = JSON.parse(d); if (m.type !== 'frame') v.msgs.push(m); } catch { } });
  ws.on('close', (c) => { v.closed = c; });
  ws.on('error', () => { });
  v.by = (t) => v.msgs.filter((m) => m.type === t);
  v.last = (t) => v.by(t).at(-1) || null;
  v.send = (o) => ws.send(J(o));
  v.until = (p, ms = 4000) => until(() => p(v), ms);
  return v;
}
const BTR = require('../src/server/browser-trace.js');
const BR = require('../src/server/browser-stream.js');
const DATA2 = path.join(ROOT, 'data-b');
const kb = mkKeeper(K, { dataDir: DATA2 });
await kb._facts.probeVersion();
const up = await fakeUpstream(), up2 = await fakeUpstream();
const kbView = { ...kb, streamPortFor: async (t) => (t && t.kind === 'human' ? { ok: true, port: up.port } : t && t.kind === 'attachment' ? { ok: true, port: up2.port } : kb.streamPortFor(t)) };
const activeB = new Map([['sess-a', sA]]);
const bridge = BR.create({ keeper: kbView, activeSessions: activeB, requestAuthed: () => true, log: quiet });
const bsrv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
bsrv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
servers.push(bsrv);
await new Promise((r) => bsrv.listen(0, '127.0.0.1', r));
const BP = bsrv.address().port;
const markers2 = [], cards2 = [];
const trace2 = BTR.create({ dataDir: DATA2, homeDir: HOME, keeper: kb, bridge, serverSetting: (x) => settings[x], broadcast: () => { }, log: quiet, onSession: (m) => { markers2.push(m); for (const [, s] of activeB) if (s._browserKey === m.browserKey) cards2.push(m); } });
trace2.install();
const liveP = kb.createProfile({ label: 'Live' }, { owner: { kind: 'instance', id: null } });
const HL = HM.humanKeyFor(liveP.id);
const ev2 = [];
kb.onInput((e) => ev2.push(e));
const b1 = await kb.browse(liveP.id);
await until(() => [...bridge._relays.values()].some((r) => r.target.kind === 'human' && r.taps.size > 0 && r.upstream && r.upstream.readyState === 1));
ok(bridge._relays.has('human:' + HL) && bridge._relays.get('human:' + HL).taps.size === 1, 'the recorder armed ITS tap on his relay at `human-start` (recording is on by default — the owner, 3/4)');
const v1 = viewer(BP, `browse=${HL}&fresh=${b1.fresh}`);
await v1.until((v) => v.last('hello') && v.last('mode') && v.last('mode').mine === true);
ok(v1.last('hello').human === true && v1.last('hello').target.kind === 'human' && v1.last('mode').mode === 'takeover' && kb.humanOf(liveP.id).state === 'driving', '`?browse=<key>&fresh=<token>` — the window his press opened TAKES his tab\'s controls at once (mode takeover, mine)', { hello: v1.last('hello'), mode: v1.last('mode') });
// verify r1 (H1): an agent's token never opens a browsing window of his (an auth-off instance lets every upgrade through)
{
  const code = await new Promise((resolve) => { const w = new WebSocket(`ws://127.0.0.1:${BP}${S.STREAM_PATH}?browse=${HL}`, { headers: { Authorization: 'Bearer vsst_' + 'q'.repeat(24) } }); w.on('unexpected-response', (_q, r) => resolve(r.statusCode)); w.on('open', () => { w.close(); resolve('open'); }); w.on('error', () => resolve('error')); });
  ok(code === 403 && kb.humanOf(liveP.id).state === 'driving', 'an agent\'s session token on `?browse=` is refused 403 before the upgrade — his window stays his', code);
  // verify r2 (#5): the guard judged the RAW url (`/[?&]browse=/`) while the handler reads the PARSED query — a name the
  // parser decodes (`?%62rowse=`, `?brows%65=`) opened his window to an agent's token; and a job token (jbt_) too
  const tryUp = (q, tokn) => new Promise((resolve) => { const w = new WebSocket(`ws://127.0.0.1:${BP}${S.STREAM_PATH}?${q}`, { headers: { Authorization: 'Bearer ' + tokn } }); w.on('unexpected-response', (_q, r) => resolve(r.statusCode)); w.on('open', () => { w.close(); resolve('open'); }); w.on('error', () => resolve('error')); });
  const upg = {};
  for (const [q, tokn] of [[`%62rowse=${HL}`, 'vsst_' + 'q'.repeat(24)], [`brows%65=${HL}`, 'vsst_' + 'q'.repeat(24)], [`browse=${HL}`, 'jbt_' + 'q'.repeat(24)], [`%62rowse=${HL}`, 'jbt_' + 'q'.repeat(24)]]) upg[q + ' ' + tokn.slice(0, 5)] = await tryUp(q, tokn);
  ok(Object.values(upg).every((c) => c === 403) && kb.humanOf(liveP.id).state === 'driving', 'verify r2: the upgrade is judged on the PARSED query — an encoded name (`%62rowse=`, `brows%65=`) and a job token (jbt_) are refused 403 before the upgrade too', upg);
}
const v2 = viewer(BP, `browse=${HL}`);
await v2.until((v) => v.last('mode') && v.last('mode').cause === 'elsewhere');
v2.send({ type: 'input_mouse', eventType: 'mouseMoved', x: 1, y: 1 });
await v2.until((v) => v.by('refused').length >= 1);
ok(v2.last('mode').mine === false && v2.last('refused').code === 'watch-mode' && kb.humanOf(liveP.id).state === 'driving', 'a SECOND window of his (a reload, the pushed layout on another client) watches — "You\'re browsing this in another window" — its input refused', v2.last('refused'));
v2.send({ type: 'claim' });
await v2.until((v) => v.last('mode-ack') && v.last('mode-ack').mine === true);
await v1.until((v) => v.by('mode').some((m) => m.mine === false));
const hid2 = v2.last('hello').you;
ok((kb.humanInputState(HL).takenBy || {}).viewerId === hid2 && v1.last('mode').mine === false, '"Continue here" (claim) moves his controls to THIS window — one holder always (the other now watches)');
await until(() => (trace2._taps.get('human:' + HL) || { frames: [] }).frames.length > 0); // the page has painted (a before frame exists — as it does for the person looking at it)
const n0 = up.got.length;
v2.send({ type: 'input_mouse', eventType: 'mousePressed', x: 120, y: 340, button: 'left', clickCount: 1 });
v2.send({ type: 'input_mouse', eventType: 'mouseReleased', x: 120, y: 340, button: 'left', clickCount: 1 });
await until(() => up.got.length >= n0 + 2);
ok(up.got.slice(n0).map((m) => m.eventType).join() === 'mousePressed,mouseReleased', 'his input reaches his tab\'s stream (the holder\'s records, forwarded as they are)');
// NO ANCHOR on his window: the browser shows another tab (a login popup he opened) — his input still goes through
up.send({ type: 'tabs', tabs: [{ tabId: 't1', targetId: 'AAAA0000AAAA0000AAAA0000AAAA0001', active: false, url: 'https://x.test/a' }, { tabId: 't2', targetId: 'BBBB0000BBBB0000BBBB0000BBBB0002', active: true, url: 'https://login.test/', title: 'Login' }] });
await sleep(150);
const n1 = up.got.length;
v2.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', rid: 77 });
await v2.until((v) => v.by('input-receipt').some((x) => x.rid === 77));
ok(bridge._relays.get('human:' + HL).anchor === null && up.got.length === n1 + 1 && v2.by('input-receipt').find((x) => x.rid === 77).ok === true, 'NO ANCHOR on his window: after the browser moved to another tab (his popup), his input is still forwarded (receipt ok)', v2.by('input-receipt'));
// …while the SAME change on an AGENT takeover relay is refused tab_switched (the control that the anchor rule is still there)
await kb.attach({ profileId: liveP.id, browserKey: KA, sessionId: 'sess-a', by: 'user' });
const c1 = viewer(BP, `session=sess-a&profile=${liveP.id}`);
await c1.until((v) => v.last('hello') && v.by('status').some((m) => m.state === 'upstream-open'));
await sleep(80);
c1.send({ type: 'takeover' });
await c1.until((v) => v.last('mode') && v.last('mode').mine === true);
await sleep(120);
up2.send({ type: 'tabs', tabs: [{ tabId: 't9', targetId: 'CCCC0000CCCC0000CCCC0000CCCC0009', active: true, url: 'https://agent.test/' }] });
await sleep(150);
c1.send({ type: 'input_keyboard', eventType: 'keyDown', key: 'a', code: 'KeyA', text: 'a', rid: 91 });
await c1.until((v) => v.by('input-receipt').some((x) => x.rid === 91));
ok(v1.by('mode').every((m) => m.human !== false) && c1.by('input-receipt').find((x) => x.rid === 91).code === 'tab_switched', 'CONTROL: on an AGENT\'s takeover relay the same tab change still refuses the input `tab_switched` (the anchor rule stands where it belongs)', c1.by('input-receipt'));
c1.send({ type: 'handback' });
await c1.until((v) => v.last('mode') && v.last('mode').mode === 'watch');
c1.ws.close();
// verify r1 (H2): his address row's own command mirror carries the URL AS TYPED — with a password in it
up.send({ type: 'command', action: 'open', id: 'nav-cred', params: { url: 'https://alice:hunter2pw@x.test/login?next=%2F' }, timestamp: Date.now() });
up.send({ type: 'url', url: 'https://alice:hunter2pw@x.test/login?next=%2F' });
up.send({ type: 'result', action: 'open', id: 'nav-cred', success: true, data: { url: 'https://alice:hunter2pw@x.test/login?next=%2F' }, timestamp: Date.now() });
// verify r2 (#7): an OAuth redirect his address row opened — the code in its query reaches no file (the byte census below)
up.send({ type: 'command', action: 'open', id: 'nav-code', params: { url: 'https://x.test/cb?code=SECRETCODE77&state=s1' }, timestamp: Date.now() });
up.send({ type: 'url', url: 'https://x.test/cb?code=SECRETCODE77&state=s1' });
up.send({ type: 'result', action: 'open', id: 'nav-code', success: true, data: { url: 'https://x.test/cb?code=SECRETCODE77&state=s1' }, timestamp: Date.now() });
// his ACTS reach the recorder's tap — never a viewer
const secret = 'topsecretword';
for (const ch of secret) v2.send({ type: 'input_keyboard', eventType: 'keyDown', key: ch, code: 'Key' + ch.toUpperCase(), text: ch });
await sleep(HM.TYPE_IDLE_MS + 900);
const idx = () => { try { return fs.readFileSync(path.join(DATA2, 'browser-trace', liveP.id, 'index.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
await until(() => idx().some((e) => e.action === 'type') && idx().filter((e) => e.action === 'open').length >= 2, 5000);
const entries = idx();
const clickE = entries.find((e) => e.action === 'mouseclick'), typeE = entries.find((e) => e.action === 'type');
ok(clickE && clickE.holder === 'user' && clickE.browserKey === HL && clickE.sessionId === null && clickE.position.kind === 'point' && clickE.position.x === 120 && clickE.text === 'you: mouseclick 120 340' && clickE.before && clickE.before.file, 'RECORDED like an agent\'s (the owner, 3): his click is ONE trace entry — holder user, his key, no conversation, the page point, a before frame, "you: mouseclick 120 340"', clickE);
ok(typeE && typeE.params.text === `«${secret.length} chars»` && typeE.holder === 'user', 'his typing is ONE entry of its LENGTH («13 chars»)', typeE && typeE.params);
const leaks = [];
const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else { const b = fs.readFileSync(f); if (b.includes(secret) || b.includes('hunter2pw') || b.includes('SECRETCODE77')) { const t = b.toString('utf8'); const i = Math.max(t.indexOf(secret), t.indexOf('hunter2pw'), t.indexOf('SECRETCODE77')); leaks.push(f.split('/').slice(-1)[0] + ': …' + t.slice(Math.max(0, i - 200), i + 40)); } } } };
walk(path.join(DATA2, 'browser-trace'));
const openE = entries.find((e) => e.action === 'open');
const codeE = entries.find((e) => e.action === 'open' && /x\.test\/cb/.test(String(e.params && e.params.url)));
ok(codeE && codeE.params.url === 'https://x.test/cb?«cut»' && codeE.url === 'https://x.test/cb?«cut»' && leaks.length === 0, 'verify r2 (#7): the OAuth redirect his address row opened is recorded as `https://x.test/cb?«cut»` (params and page url) — its code in NO file (the byte census)', codeE && { params: codeE.params, url: codeE.url, leaks });
ok(leaks.length === 0 && openE && openE.params.url === 'https://x.test/login?next=%2F' && /^you: open https:\/\/x\.test\/login/.test(openE.text), 'CENSUS: the typed words — and the PASSWORD in a URL his address row opened (verify r1, H2: `https://alice:<pw>@…` was stored whole in params, text and url) — appear in NO file under data/browser-trace (index, entries, markers); the page stays named (host, path, query)', { leaks, open: openE && { params: openE.params, text: openE.text, url: openE.url } });
ok(![...v1.msgs, ...v2.msgs].some((m) => (m.type === 'command' || m.type === 'result') && /^hu-act-/.test(String(m.id || ''))), 'the synthetic act records reach the TAP only — never a viewer ("Running a command" is the agent\'s)');
const hs = trace2.sessions({ profileId: liveP.id }).find((x) => x.holder === 'user');
ok(hs && hs.browserKey === HL && hs.open && hs.recorded === true && hs.count >= 2 && entries.filter((e) => e.holder === 'user').every((e) => e.browserSession === hs.id) && !cards2.some((m) => m.holder === 'user' || HM.isHumanKey(m.browserKey)) && markers2.some((m) => m.holder === 'user'), 'his session: ONE open `bs-` session of the profile\'s scope (holder user, recorded), every entry of his tagged with it; its marker reached the hook and became NO card (no conversation owns his key)', hs);
// the Sessions list and the replay window find his session BY HIS KEY (the routes take `browserKey=hu-…`)
{
  const byKey = trace2.sessions({ browserKey: HL });
  const acts = trace2.list({ browserKey: HL, anyOf: true });
  ok(byKey.length === 1 && byKey[0].id === hs.id && acts.length >= 2 && acts.every((e) => e.holder === 'user'), 'his key finds his session and only his acts (`/api/browser/sessions?browserKey=hu-…` + `/actions` — the replay window of his browsing)', { sessions: byKey.map((x) => x.id), acts: acts.length });
  const rt = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
  ok((rt.match(/!B\.isBrowserKey\(givenKey\) && !HM\.isHumanKey\(givenKey\)/g) || []).length === 2, 'PIN: both trace routes (`/actions`, `/sessions`) accept his `hu-` key beside a conversation\'s');
  // verify r2 (#5) — THE HUMAN-ROUTE WALK: EVERY cookie route that starts, drives, ends or reads HIS browsing, derived from
  // the two routers' own text (a handler that names `/browse`, `isHumanKey` or a `holder === 'user'` entry), walked with an
  // agent's session token (vsst_) AND a job token (jbt_) over his REAL recorded entries — each refused `agent_forbidden`,
  // nothing moved. r1 pinned the vsst_ token on six of them; `/actions/:id`, its frames and every jbt_ read were unpinned
  // (a revert of each was green on the whole fast tier — the r2 revert table)
  {
    const rb = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
    const humanRoutesOf = (src) => { const out = []; const re = /router\.(get|post|patch|delete)\('([^']+)'/g; const ms = [...src.matchAll(re)]; ms.forEach((m, i) => { const body = src.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : src.length); if (!/^\/api\/agent\//.test(m[2]) && (/\/browse\b/.test(m[2]) || /isHumanKey|holder === 'user'|refuseAgentBearer|isAgentBearer/.test(body))) out.push(m[1].toUpperCase() + ' ' + m[2]); }); return out; };
    const derived = [...humanRoutesOf(rb), ...humanRoutesOf(rt)].sort();
    const WALK_H = [
      ['POST', '/api/browser/profiles/:id/browse', `/api/browser/profiles/${liveP.id}/browse`, {}],
      ['POST', '/api/browser/browse/:key/navigate', `/api/browser/browse/${HL}/navigate`, { url: 'https://evil.example/' }],
      ['POST', '/api/browser/browse/:key/close', `/api/browser/browse/${HL}/close`, {}],
      ['POST', '/api/browser/browse/:key/quit', `/api/browser/browse/${HL}/quit`, {}],
      ['POST', '/api/browser/profiles/:id/stop', `/api/browser/profiles/${liveP.id}/stop`, {}], // the row's Stop ends his page too: while he browses, never an agent's token
      // the .197 integration: lane browser-stuck's two human Restart routes refuse a restart under HIS page (`browsing_yourself`) — so they name him and are walked (THE one guard, RESTART_IS_USERS)
      ['POST', '/api/browser/profiles/:id/restart', `/api/browser/profiles/${liveP.id}/restart`, {}],
      ['POST', '/api/browser/session/:sessionId/restart', '/api/browser/session/sess-any/restart', { ref: 'b1' }],
      // lane browser-resume (§3.9): the KEPT browsers — every conversation's kept tab titles + urls, and their Forget, are the user's
      ['GET', '/api/browser/kept', '/api/browser/kept'],
      ['DELETE', '/api/browser/kept/:browserKey', '/api/browser/kept/bk-0000a001'],
      // lane browser-resume B (ruling 2): Resume (the live view / the end card, the panel's kept row) and "Hand back and
      // continue" are the user's acts — an agent resumes ITS OWN browser through `/api/agent/browser/resume`
      ['POST', '/api/browser/session/:sessionId/resume', '/api/browser/session/sess-any/resume', { ref: '~ephemeral' }],
      ['POST', '/api/browser/kept/:browserKey/resume', '/api/browser/kept/bk-0000a001/resume', {}],
      ['POST', '/api/browser/session/:sessionId/hand-back', '/api/browser/session/sess-any/hand-back', { ref: '~ephemeral', note: 'continue from the cart' }],
      ['GET', '/api/browser/actions', `/api/browser/actions?browserKey=${HL}`],
      ['GET', '/api/browser/sessions', `/api/browser/sessions?browserKey=${HL}`],
      ['GET', '/api/browser/actions/:id', `/api/browser/actions/${clickE.id}`],
      ['GET', '/api/browser/actions/:id/frame/:which', `/api/browser/actions/${clickE.id}/frame/before`],
      // lane browser-propose (2026-09-30): the user's Approve / Reject of an agent's browser proposal — THE same guard (an agent
      // never decides its own proposal; PROPOSAL_IS_USERS), walked like his own browsing
      ['POST', '/api/browser/proposals/:id/approve', '/api/browser/proposals/bl-0000abcd/approve', { shown: 'pd-00000000' }],
      ['POST', '/api/browser/proposals/:id/reject', '/api/browser/proposals/bl-0000abcd/reject', {}],
      ['GET', '/api/browser/proposals/:id', '/api/browser/proposals/bl-0000abcd'],
      // lane browser-admin 2a: which Chrome build a profile runs is the user's choice — Change build… (it restarts the browser
      // under HIS page too: refused `browsing_yourself` while he browses), and a create / adopt that names a build (BUILD_IS_USERS)
      ['POST', '/api/browser/profiles/:id/build', `/api/browser/profiles/${liveP.id}/build`, { choice: { kind: 'build', version: '151.0.7922.34' } }],
      ['POST', '/api/browser/profiles', '/api/browser/profiles', { label: 'An agent-chosen build', browser: { kind: 'build', version: '151.0.7922.34' } }],
      ['POST', '/api/browser/adopt', '/api/browser/adopt', { sessionId: 'sess-any', label: 'An agent-chosen build', browser: { kind: 'build', version: '151.0.7922.34' } }],
      // verify r3 (Y4): the adopt route is the user's WHOLE (a bare {sessionId, label} from an agent's token moved a
      // conversation's kept browser into a shared profile — test-browser-new-profile walks that body); the dialog's GET too
      ['GET', '/api/browser/adopt', '/api/browser/adopt?sessionId=sess-any'],
      // verify r1 F6 (lane browser-admin): "Who can use it" is the user's — the PATCH with a list (USE_IS_USERS; the create / adopt
      // above refuse a list the same way, walked through their build rows)
      ['PATCH', '/api/browser/profiles/:id', `/api/browser/profiles/${liveP.id}`, { use: { mode: 'all' } }],
      // lane browser-admin 2b: a download is the user's act — both installs of the ONE slot (CloakBrowser, the browser CLI)
      ['POST', '/api/browser/install', '/api/browser/install', {}],
      ['POST', '/api/browser/cli/install', '/api/browser/cli/install', { version: '0.38.1' }],
      // lane chrome-builds-download (design 004): the list Google offers, a download and a removal are the user's (BUILDS_DOWNLOAD_IS_USERS)
      ['GET', '/api/browser/builds/available', '/api/browser/builds/available'],
      ['POST', '/api/browser/builds/download', '/api/browser/builds/download', { version: '151.0.7922.34' }],
      ['DELETE', '/api/browser/builds/:version', '/api/browser/builds/151.0.7922.34'],
    ];
    const table = WALK_H.map(([m, p]) => m + ' ' + p).sort();
    ok(J(derived) === J(table), `the human-route census: the routes that serve HIS browsing, derived from the routers (${derived.length}), are exactly the walk's table — a new one is RED until it is walked`, { derived, table });
    const Rw = M.load('src/routes/browser.js', rb, 'walk-routes'); Rw.setup({ keeper: kb, activeSessions: activeB, notice: () => { }, tasksForSession: () => [] });
    const TRw = M.load('src/routes/browser-trace.js', rt, 'walk-trace'); TRw.setup({ keeper: kb, trace: trace2, activeSessions: activeB, releaseProfile: () => null, unpinProfile: () => null, notice: () => { }, keyForPickedSession: () => null });
    const serveW = async (routers) => { const a = express(); a.use(express.json()); for (const r0 of routers) a.use(r0); const s0 = http.createServer(a); servers.push(s0); await new Promise((r) => s0.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${s0.address().port}`; };
    const W = await serveW([Rw.router, TRw.router]);
    const hit = async (base, m, p, body, auth) => { const res = await fetch(base + p, { method: m, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); let js = null; try { js = await res.json(); } catch { } return { status: res.status, code: js && js.code }; };
    const stateNow = () => J({ h: kb.humanOf(liveP.id) && kb.humanOf(liveP.id).state, b: kb.browserOf(liveP.id).state, n: cmdsOf('vs-' + HL).length });
    const s0 = stateNow();
    const rows = [];
    for (const tokn of ['vsst_' + 'w'.repeat(24), 'jbt_' + 'w'.repeat(24)]) for (const [m, , p, body] of WALK_H) { const x = await hit(W, m, p, body, tokn); rows.push([tokn.slice(0, 5), m + ' ' + p.replace(HL, 'hu-…').replace(clickE.id, ':id'), x.status, x.code]); }
    const bad = rows.filter(([, , st, c]) => !(st === 403 && c === 'agent_forbidden'));
    ok(!bad.length && stateNow() === s0, `every human route × {vsst_, jbt_} (${rows.length}) refused 403 agent_forbidden over his REAL recorded entries — nothing started, drove, ended or answered`, bad);
    const mine = await hit(W, 'GET', `/api/browser/actions/${clickE.id}`), frame = await fetch(`${W}/api/browser/actions/${clickE.id}/frame/before`);
    ok(mine.status === 200 && frame.status === 200 && /image\/jpeg/.test(frame.headers.get('content-type') || ''), '…the cookie path (no bearer) reads his entry and its frame as before', { entry: mine.status, frame: frame.status });
    // CONTROLS: a trace-routes copy whose guard is blind (the pre-r1 routes) answers his entry + frame to an agent token; a
    // copy whose guard knows only vsst_ answers them to a job token — the walk above can go red on each
    const TRx = M.load('src/routes/browser-trace.js', rt.replace("const isAgentBearer = (req) => /^Bearer\\s+(vsst_|jbt_)/i.test(", "const isAgentBearer = (req) => false && /^Bearer\\s+(vsst_|jbt_)/i.test("), 'trace-guard-blind'); TRx.setup({ keeper: kb, trace: trace2, activeSessions: activeB, releaseProfile: () => null, unpinProfile: () => null, notice: () => { }, keyForPickedSession: () => null });
    const TRj = M.load('src/routes/browser-trace.js', rt.replace("/^Bearer\\s+(vsst_|jbt_)/i", "/^Bearer\\s+(vsst_)/i"), 'trace-guard-vsst-only'); TRj.setup({ keeper: kb, trace: trace2, activeSessions: activeB, releaseProfile: () => null, unpinProfile: () => null, notice: () => { }, keyForPickedSession: () => null });
    const X = await serveW([TRx.router]), Jb = await serveW([TRj.router]);
    const cx = [await hit(X, 'GET', `/api/browser/actions/${clickE.id}`, undefined, 'vsst_' + 'w'.repeat(24)), await hit(X, 'GET', `/api/browser/actions/${clickE.id}/frame/before`, undefined, 'vsst_' + 'w'.repeat(24)), await hit(Jb, 'GET', `/api/browser/sessions?browserKey=${HL}`, undefined, 'jbt_' + 'w'.repeat(24)), await hit(Jb, 'GET', `/api/browser/actions/${clickE.id}`, undefined, 'jbt_' + 'w'.repeat(24))];
    ok(cx.every((x) => x.status === 200), 'CONTROLS: a blind trace guard answers his entry and its frame to vsst_; a vsst_-only guard answers his sessions and his entry to jbt_ — the walk above can go red on each', cx);
  }
  const rw = fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8');
  ok(/\^\(bk\|hu\)-\[0-9a-f\]\{8\}\$/.test(rw), 'PIN: the replay window\'s target accepts his key (Replay on his session opens it)');
}
// the opt-out: "Also record my own actions" off ⇒ his tap goes, nothing more is written
const upd = kb.updateProfile(liveP.id, { recordMine: false });
await sleep(50);
const nE = idx().length;
for (let i = 0; i < 10; i++) { v2.send({ type: 'input_mouse', eventType: 'mousePressed', x: 10 + i, y: 10, button: 'left', clickCount: 1 }); v2.send({ type: 'input_mouse', eventType: 'mouseReleased', x: 10 + i, y: 10, button: 'left', clickCount: 1 }); }
await sleep(HM.TYPE_IDLE_MS + 600);
ok(upd.changed.recordMine && upd.changed.recordMine.now === false && upd.profile.recordMine === false && bridge._relays.get('human:' + HL).taps.size === 0 && idx().length === nE, 'the OPT-OUT (the owner, 4): "Also record my own actions" off ⇒ the tap on his relay is gone, 20 forwarded inputs write ZERO entries (CONTROL: the same clicks with it on wrote entries, above)', { changed: upd.changed, taps: bridge._relays.get('human:' + HL).taps.size, n: idx().length - nE });
kb.updateProfile(liveP.id, { recordMine: true });
await until(() => bridge._relays.get('human:' + HL).taps.size === 1);
ok(bridge._relays.get('human:' + HL).taps.size === 1, '…on again ⇒ the tap is back while a window of his drives');
// the holder's window closes ⇒ he is AWAY; no conversation hears anything
const evN = ev2.length;
v2.ws.close();
await until(() => kb.humanOf(liveP.id) && kb.humanOf(liveP.id).state === 'away');
await until(() => bridge._relays.get('human:' + HL) && bridge._relays.get('human:' + HL).taps.size === 0);
ok(kb.humanOf(liveP.id).state === 'away' && ev2.slice(evN).every((e) => e.human) && bridge._relays.get('human:' + HL).taps.size === 0, 'the holder\'s window closes ⇒ he is AWAY (his tab kept), his tap disarmed; no conversation event (viewer-left is his alone)', ev2.slice(evN).map((e) => e.kind + ':' + e.browserKey));
// Close ⇒ every window of his is told why, typed
const r3 = await kb.closeHuman(HL);
await v1.until((v) => v.by('status').some((m) => m.state === 'human-ended'));
ok(r3.ended === 'released' && v1.by('status').find((m) => m.state === 'human-ended').reason === 'released' && hs && trace2.sessions({ profileId: liveP.id }).find((x) => x.id === hs.id).reason === 'released', 'Close ⇒ every window of his gets `human-ended` (reason released) and his session ends `released`', v1.by('status').filter((m) => m.state === 'human-ended'));
const v3 = viewer(BP, `browse=${HL}`);
await v3.until((v) => v.by('status').some((m) => m.state === 'error'));
const L0 = logOf('launches.log').length;
await kb.stop(liveP.id, { why: 'user' });
const v4 = viewer(BP, `browse=${HL}`);
await v4.until((v) => v.by('status').some((m) => m.state === 'error'));
ok(v3.last('status').code === 'not_browsing' && v4.last('status').code === 'browser_stopped' && logOf('launches.log').length === L0, 'a window of browsing that ended: `not_browsing`; of a stopped browser: `browser_stopped` — a view NEVER starts a browser (the window offers Browse again)', { v3: v3.last('status'), v4: v4.last('status') });
bridge.shutdown(); trace2.shutdown(); await up.close(); await up2.close();

{
  // verify r2 (#5) CONTROL — run after every ②b leg (its viewer on the SAME keeper would disturb them): the r1 bridge (the
  // guard a regex over the RAW url) lets the encoded name through — the parsed-query leg above can go red
  const bsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const gneedle = "    if (browse && /^Bearer\\s+(vsst_|jbt_)/i.test(";
  ok(bsrc.includes(gneedle), 'the parsed-query guard needle (the control below restores the raw-url regex)');
  const BRx = M.load('src/server/browser-stream.js', bsrc.replace(gneedle, "    if (/[?&]browse=/.test(String(req.url || '')) && /^Bearer\\s+(vsst_|jbt_)/i.test("), 'raw-url-guard');
  const bridgeX = BRx.create({ keeper: { ...kbView, setViewerAlive() { } }, activeSessions: activeB, requestAuthed: () => true, log: quiet }); // (its own viewer fact never replaces the real bridge's in the keeper)
  const bsrvX = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  bsrvX.on('upgrade', (req, socket, head) => bridgeX.handleUpgrade(req, socket, head)); servers.push(bsrvX);
  await new Promise((r) => bsrvX.listen(0, '127.0.0.1', r));
  const cx = await new Promise((resolve) => { const w = new WebSocket(`ws://127.0.0.1:${bsrvX.address().port}${S.STREAM_PATH}?%62rowse=${HL}`, { headers: { Authorization: 'Bearer vsst_' + 'q'.repeat(24) } }); w.on('unexpected-response', (_q, r) => resolve(r.statusCode)); w.on('open', () => { w.close(); resolve('open'); }); w.on('error', () => resolve('error')); });
  ok(cx === 'open', 'CONTROL: the raw-url guard (r1) opens `?%62rowse=<his key>` to an agent\'s token — red', cx);
  try { bridgeX.shutdown?.(); } catch { }
}
// ═══ ③ CENSUSES ═══════════════════════════════════════════════════════════════
console.log('— ③ censuses: no card for him (+ control), the holder readers, no agent path to his browsing');
{
  // CONTROL for the card census: an onSession that matched by PROFILE (every conversation on the browser) would show his markers
  const byProfile = markersSeen.filter((m) => m.holder === 'user' && [...active.values()].some((s) => k.leasesFor(s._browserKey).some((l) => l.profileId === m.profileId) || m.profileId === work.id));
  ok(byProfile.length > 0, `CONTROL: an onSession that matched by PROFILE would have shown ${byProfile.length} of his markers as cards — the key rule is what keeps them out of every chat`);
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/const onSession = \(m\) => \{ for \(const \[, s\] of activeSessions\) \{ if \(s && s\._browserKey === m\.browserKey\)/.test(wiring), 'PIN: the wiring\'s onSession matches a marker to a conversation by its OWN browser key (the rule the census above models)');
  const hb = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
  ok(/if \(ev && ev\.human\) return;/.test(hb), 'PIN: the announcer ignores his window\'s own events (no card, notice, stale sweep, inbox, delivery)');
}
{
  // THE HOLDER CENSUS: every `reg.leases` site of the keeper, by the function it sits in — a reader that asks whether a
  // browser is USED goes through holdersOn; one that needs a CONVERSATION reads the leases. A new site is RED until classified.
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const lines = src.split('\n');
  const fnAt = (i) => { for (let x = i; x >= 0; x--) { const m = /^  (?:async )?function (\w+)\(|^  const (\w+) = (?:\(|async|\w+ =>|\{)/.exec(lines[x]); if (m) return m[1] || m[2]; } return '(top)'; };
  const sites = {};
  lines.forEach((l, i) => { if (/^\s*(\*|\/\/|\/\*)/.test(l)) return; const n = (l.replace(/\/\/.*$/, '').match(/reg\.leases/g) || []).length; if (n) { const f = fnAt(i); sites[f] = (sites[f] || 0) + n; } });
  // conversation-only: admission, caps, pins, the takeover's siblings, the re-judge, the ephemeral records, the timers, the
  // log lines that count conversations — each needs a CONVERSATION (his row has no session, no key an agent could hold)
  const CONVERSATION = { ephEventFields: 1, ephemerals: 1, leasesFor: 1, leasesOn: 1, removeVerdict: 1, updateProfileNow: 1, knownKeysOf: 1, rejudgeLeases: 1, ceilingNow: 1, ownsLive: 1, ownLive: 1, ensureEphemeral: 2, retireEphemeral: 1,
    keepRebound: 1, takeRebound: 1, // verify r3 (F4): the rebound note rides the CONVERSATION's lease until an answer carries it (his row binds no tab of ours)
    attach: 7 /* lane browser-resume C: + the rebind's new tab as its lease's root; verify r2 F2: the queued rebind re-asks for ITS OWN lease after the wait (conversation-only) */, detach: 3, stop: 1, releaseAll: 1, browse: 1, endHuman: 1, quitHuman: 1, navigateHuman: 1, mirrorLeaseInput: 1, takeover: 1, siblingLeases: 1, noteLeaseUrl: 1, inputSummaryFor: 1, handBackOnStop: 1, statusFor: 3 /* + lane jobs-browser: a job's window is its conversation's helper row (the 2.369.202 integration) */, liveHoldingFor: 1, setFor: 1, driveHolderFacts: 1, noteDrive: 1, dropChild: 3, switcherView: 1, switchBackend: 1, reconcile: 3, boot: 1, tick: 1, ensureTimer: 1, api: 1,
    releaseJobHandle: 1, // lane jobs-browser (the 2.369.202 integration): a job's handle lets go of the leases IT holds — a job is a conversation's child, never his row
    rejudgeAll: 1, // the .197 integration: identity r4's Task Group re-judge asks "does a CONVERSATION lease this profile" (his row belongs to no Task Group)
    // lane browser-propose: a proposal's plan counts the OTHER conversations on the profile it would switch; the approved
    // new profile's page opens in THIS conversation's own lease (his row is no conversation's)
    proposalTargetFor: 1, openInLease: 1,
    // lane browser-admin 2a: Change build… tells every CONVERSATION leased on the browser it restarts (his own browsing is
    // refused `browsing_yourself` before it — never restarted under his page) and its view counts them; verify r1 F1: the
    // second site of each is the DRIVEN check (SW.holdOf over the conversations' leases + their input states, humans excluded
    // — his own browsing is refused by name a line earlier): a conversation driving it by hand ⇒ `browser_driven`, never a
    // restart under the user's hands
    buildsView: 2, setBrowserChoice: 2,
    restartProfile: 1, // int220 (lane browser-unresponsive): a hung browser's Restart tells every OTHER CONVERSATION leased on it (his own row holds no lease)
    // verify r2 (B5): the fall-back from a build that closed within seconds tells every CONVERSATION it told "changed" (his own
    // browsing was refused before the change; a takeover meanwhile is refused browser_restarting by the H2 rule)
    fallBackFromChange: 1,
    // lane browser-resume B: a Resume of an attachment needs THIS conversation's lease (never widened; decideAttach judges);
    // the hand-back names a browser THIS conversation holds (his `hu-` row is never a conversation's to hand back)
    resumeAttachment: 1, continueState: 1,
    // lane browser-resume C: whose tab it is — the conversations' tab ROOTS are their leases' (his own tab is added from
    // `humans`, never a lease); the agent's own tab verbs need ITS lease; the user's row judges a CONVERSATION's tab; the
    // orphan rule (adoptable) asks whether any conversation leases the browser; the rebind's new tab is its lease's root
    tabHoldersOf: 1, keepTabRoots: 1, bootstrapTabRoot: 1, agentTabAct: 4, tabOwnersFor: 1, userTabAct: 1, whoseOf: 1, // accept-fixes-strip F8: another holder's tab is named by ITS lease's conversation (a conversation reader)
    // lane site-reset verify r3 #2: the PERSISTED WITNESS lives on a CONVERSATION's lease (`l.tabs` — the tabs the dialog watch
    // saw born of its verbs); his row holds no lease — his tabs are his row's own (`ownTab` / `adopted`)
    noteOwnTab: 1, forgetOwnTab: 1, dropLeaseTabs: 1, pruneOwnTabs: 1, // r4 #3: pruned to the browser's tabs at a watch's connect
    tabsLost: 1, // lane profile-lock-roll L2: every CONVERSATION lease of a replaced browser is marked `life` (his row holds no lease — his tab ends with the browser, said by his window)
    holderTabs: 1, // lane site-reset verify r1: a CONVERSATION lease's pinned tab (+ r3's persisted witness); his tabs are read off his row, by his key, before this loop
    // lane browser-windows: a CONVERSATION lease's own window (its `windowIn` / roots at attach — his tab opens in his own window
    // through openOwnTab, never a lease), the WINDOW MATES a takeover of a conversation's window takes with it (conversation
    // leases only: his row is never a mate — his window is his own), and agentTabAct's 4th site (the lease that records the
    // new tab's window + its label)
    ownWindowAtAttach: 2, windowMatesOf: 1,
    // verify r1 T2 ⑧ (one window per holder): openOwnTab reads the CONVERSATION lease's `windowId` + roots to open a later tab IN
    // its window (his key names no lease ⇒ his first tab is a new window of his own, his popups stay in it by Chrome's rule)
    openOwnTab: 1,
    // verify r2 ⑦: sharedWindowOf reads the CONVERSATION lease's windowIn (is its tab in the shared window of an older run?) for
    // the takeover / handback / paused words — his key names no lease, so his own takeover is never worded as "shared" through it
    sharedWindowOf: 1,
  };
  // holder: "who holds this browser / is it used" — through holdersOn (the conversations' leases + his row)
  const HOLDER = { list: 1, holdersOn: 1 };
  const want = { ...CONVERSATION, ...HOLDER };
  const unclassified = Object.keys(sites).filter((f) => !(f in want)).map((f) => `${f}: ${sites[f]}`);
  const moved = Object.keys(sites).filter((f) => f in want && want[f] !== sites[f]).map((f) => `${f}: ${sites[f]} (table ${want[f]})`);
  ok(!unclassified.length && !moved.length, `the HOLDER census: every \`reg.leases\` site of browser-keeper.js (${Object.values(sites).reduce((a, b) => a + b, 0)} in ${Object.keys(sites).length} functions) is classified conversation-only or holder — a new or moved site is RED until the table says which it is`, { unclassified, moved });
  ok(/const leasedNow = \(profileId\) => holdersOn\(profileId\)\.length > 0;/.test(src) && /B\.browserIdle\(rec, holdersOn\(rec\.profileId\), t, idleMs\(\)\)/.test(src) && /humans: humanRowsOn\(p\.id\)/.test(src), 'the holder readers go through holdersOn: the idle clock, the heal, the switch\'s hold');
  // lane browser-windows verify r5 ⑥: "does the USER drive any window of this browser" is a HOLDER question (the conversations'
  // leases + his row) — r4 read reg.leases by hand and was classified conversation-only; it goes through holdersOn now (each
  // conversation's drive off the in-memory inputs, his off his row) and has no reg.leases site to classify
  ok(/const userDrivesAnyWindowOf = \(profileId\) => \{ const pid = String\(profileId \|\| ''\); return holdersOn\(pid\)\.some\(\(h\) => h\.human \? h\.input === 'user' : \(\(inputs\.get\(inputKey\(h\.browserKey, pid\)\) \|\| \{\}\)\.input === 'user'\)\); \};/.test(src) && !('userDrivesAnyWindowOf' in sites), 'verify r5 ⑥ (lane browser-windows): userDrivesAnyWindowOf — a HOLDER question — goes through holdersOn (the conversations\' leases + his row), never reg.leases by hand');
}
{
  // verify r4 — THE TAB-RELEASE CENSUS (r3's MED class: a conversation's page he takes must never receive that conversation's
  // next command). The orphan rule is only as good as ONE record — `reg.leftTabs`, written by ONE recorder `noteLeftTab` —
  // so, grep-derived over browser-keeper.js: (a) every statement that RELEASES a lease (the lease set shrinks or is
  // replaced, a helper's handle is forgotten) sits in a function that calls the recorder, or is declared with its reason;
  // (b) every statement that FORGETS a left key is declared with its reason (the bound: an evicted key is marked first);
  // (c) every keeper act that CLOSES a conversation's tab marks `tabClosed` (its next attach binds a new tab first), or is
  // declared. A new site is RED until the tables say what it is; a row that names no site is RED (dead). Every path the
  // brief names is walked to its site through the call it makes. Then the paths are driven over the fake 0.38.1.
  const census = (text) => {
    const lines = text.split('\n');
    const head = /^  (?:async )?function (\w+)\(|^  const (\w+) = (?:\(|async|\w+ =>|\{)/;
    const fnAt = (i) => { for (let x = i; x >= 0; x--) { const m = head.exec(lines[x]); if (m) return m[1] || m[2]; } return '(top)'; };
    const code = (l) => (/^\s*(\*|\/\/|\/\*)/.test(l) ? '' : l.replace(/\/\/.*$/, ''));
    const at = (re) => { const out = {}; lines.forEach((l, i) => { const n = (code(l).match(re) || []).length; if (n) { const f = /^\s*let reg\s*=/.test(l) ? '(declaration)' : fnAt(i); out[f] = (out[f] || 0) + n; } }); return out; };
    const body = (name) => { const s = lines.findIndex((l) => { const m = head.exec(l); return m && (m[1] || m[2]) === name; }); if (s < 0) return ''; let e = lines.length; for (let x = s + 1; x < lines.length; x++) if (head.test(lines[x])) { e = x; break; } return lines.slice(s, e).map(code).join('\n'); };
    return {
      releases: at(/reg\.leases\s*=(?!=)(?!\s*reg\.leases\.map\()|reg\.leases\.(?:splice|pop|shift)\(|reg\.leases\.length\s*=(?!=)|delete reg\.children\[|\breg\s*=(?!=)\s*B\./g),
      forgets: at(/delete reg\.leftTabs\[|reg\.leftTabs\s*=(?!=)|delete m\[/g),
      ends: at(/'tab', 'close'|closeAll\(/g),
      body,
    };
  };
  const RECORDS = { detach: 'the agent\'s detach (its CLI `close`), the UI\'s Detach, a pin that moves, a re-judge (narrowing / verb-time / a Task Group change), Delete…, a conversation found on another machine', dropChild: 'a helper\'s handle dropped', reconcile: 'the tick\'s carrier drop (a conversation that ended, a killed session) and the boot\'s (a restart without it); a helper\'s lease with its parent' };
  const RELEASE_DECLARED = { '(declaration)': 'the empty registry before the first load', load: 'the normalizer drops only a MALFORMED row — a well-formed lease never leaves at load' };
  const FORGETS = { removeProfile: 'the record is gone (removal needs no lease and a stopped browser)', stop: 'the browser stopped — every page went with it (a lease held at the stop is marked tabClosed; a key that left before answers the binary\'s own tab_gone, never another tab)', attach: 'the key is back — it holds a lease on its own tab again', adoptOrphan: 'moved into tabClosed first: every left key is marked', noteLeftTab: 'the bound — an evicted key is marked tabClosed first (fail closed, verify r4)' };
  const ENDS = { closeLeaseSession: 'the tab a narrowing took closes under its session — marked when the close went through', stop: 'every lease of a stopped browser is marked (never a switch: it re-opens each lease\'s own tab under its session)' };
  const ENDS_DECLARED = { endHuman: 'HIS tabs, each by id — never a conversation\'s',
    // lane browser-resume C (§3.9, the owner's ruling 3) — each judged by PURE src/browser-tabs.js BEFORE it runs:
    agentTabAct: 'the agent\'s own `tab close` of its OWN tab (the verdict first — another holder\'s tab is not_your_tab, nothing runs); its session answers the binary\'s own tab_gone after its current tab, said in the answer',
    userTabAct: 'the user\'s ✕ on the viewed agent\'s tab while HE drives it (never its last; its current tab first moves to a neighbour of its own) — recorded on the takeover\'s cycle, said at the handback; never another conversation\'s',
    closeHumanTab: 'HIS tab by id, never his last (his current tab first moves to another of his) — never a conversation\'s' };
  // the paths the brief names, each walked to the site it releases through (caller → callee, both in the keeper)
  const PATHS = [
    ['the tick\'s drop / a session kill (the carrier grace)', 'tick', 'reconcile'], ['a restore (a restart without the conversation)', 'boot', 'reconcile'],
    ['detach (the agent, the UI, the CLI\'s close)', 'detach', 'noteLeftTab'], ['a helper\'s handle', 'dropChild', 'noteLeftTab'],
    ['a lease revoked by a narrowing / a Task Group change', 'rejudgeLeases', 'detach'], ['…its tab closed', 'rejudgeLeases', 'closeLeaseSession'],
    ['a Task Group change re-judged AT ONCE (identity r4\'s hook — the .197 integration adds its row)', 'rejudgeAll', 'rejudgeLeases'],
    ['a conversation on another machine', 'attach', 'detach'], ['Delete…', 'releaseAll', 'detach'],
    ['Quit the whole browser', 'quitHuman', 'stop'], ['a backend switch', 'switchBackend', 'stop'],
    ['a heal (a NEW Chrome — every tab went: his browsing ends, a conversation answers the binary\'s own tab_gone, lane H r4)', 'recaptureBrowser', 'tabsWentWithBrowser'],
  ];
  // declared, no keeper site: a fork's parent keeps its key and its lease (the fork gets a NEW key — a new session, its own
  // tab: measured on the real 0.38.1, verify/repro-r4-real newkey); the agent's own `tab close` keeps its lease and its
  // session answers the binary's tab_gone (measured: never another tab); the row / strip Stop = stop()
  // the .197 integration: lane browser-stuck's human RESTART (both routes) releases through the keeper's stop() — the
  // ENDS row above marks every lease of the stopped browser — and never under HIS page (409 browsing_yourself); pinned below
  const judge = (text) => {
    const c = census(text), bad = [];
    for (const [f, n] of Object.entries(c.releases)) { if (f in RECORDS) { if (!c.body(f).includes('noteLeftTab(')) bad.push(`release in ${f} without the recorder`); } else if (!(f in RELEASE_DECLARED)) bad.push(`release in ${f} (${n}) not in the census`); }
    for (const f of Object.keys(RECORDS)) if (!(f in c.releases)) bad.push(`dead row: ${f} releases nothing`);
    for (const f of Object.keys(c.forgets)) if (!(f in FORGETS)) bad.push(`forget in ${f} not in the census`);
    for (const f of Object.keys(FORGETS)) if (!(f in c.forgets)) bad.push(`dead row: ${f} forgets nothing`);
    if (!c.body('noteLeftTab').includes("{ markTabLost(pd.id, x, 'closed'); delete m[x]; }")) bad.push('the bound forgets without marking'); // the ONE mark pair (lane profile-lock-roll)
    for (const f of Object.keys(c.ends)) { if (f in ENDS) { if (!/reg\.tabClosed\[|markTabLost\(/.test(c.body(f))) bad.push(`${f} closes a conversation's tab without the mark`); } else if (!(f in ENDS_DECLARED)) bad.push(`tab close in ${f} not in the census`); }
    for (const f of Object.keys(ENDS)) if (!(f in c.ends)) bad.push(`dead row: ${f} closes nothing`);
    for (const [, from, to] of PATHS) if (!c.body(from).includes(to + '(')) bad.push(`path ${from} → ${to} gone`);
    return { bad, c };
  };
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const J0 = judge(ksrc);
  {
    const rbR = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
    const restartBodies = ['/api/browser/profiles/:id/restart', '/api/browser/session/:sessionId/restart'].map((r) => { const i = rbR.indexOf(`router.post('${r}'`); return i < 0 ? '' : rbR.slice(i, rbR.indexOf('\nrouter.', i + 1)); });
    ok(restartBodies.every((b) => b && /await k\.stop\(/.test(b) && /k\.humanOf\(/.test(b) && /code: 'browsing_yourself'/.test(b) && b.indexOf('k.humanOf(') < b.indexOf('await k.stop(')), 'THE TAB-RELEASE CENSUS (the .197 integration): both human Restart routes release through the keeper\'s stop() (its marks) and refuse BEFORE it while he browses the profile');
  }
  ok(!J0.bad.length && Object.keys(J0.c.releases).length >= 5, `THE TAB-RELEASE CENSUS: every lease release of browser-keeper.js (${Object.values(J0.c.releases).reduce((a, b) => a + b, 0)} in ${Object.keys(J0.c.releases).join(', ')}) calls the ONE recorder or is declared; every forget of a left key (${Object.keys(J0.c.forgets).join(', ')}) is declared (the bound marks first); every tab the keeper closes (${Object.keys(J0.c.ends).join(', ')}) marks tabClosed or is declared; the ${PATHS.length} named paths reach their sites`, J0.bad);
  const cut = (f, s, r) => { if (!ksrc.includes(s)) return null; return judge(ksrc.replace(s, r)).bad; };
  const controls = [
    ['detach without the recorder', cut('detach', "    noteLeftTab(id, browserKey); // verify r3", "    // (control)"), /release in detach without the recorder/],
    ['dropChild without the recorder', cut('dropChild', '    for (const l of reg.leases) if (l.browserKey === handle) noteLeftTab(l.profileId, handle);', '    // (control)'), /release in dropChild without the recorder/],
    ['the tick without the recorder', cut('reconcile', '      noteLeftTab(d.lease.profileId, d.lease.browserKey);\n', ''), /release in reconcile without the recorder/],
    ['a NEW release site', judge(ksrc.replace('  function dropChild(handle) {', '  function dropAllLeases() { reg.leases = []; }\n  function dropChild(handle) {')).bad, /release in dropAllLeases \(1\) not in the census/],
    ['the bound forgetting without the mark', cut('noteLeftTab', "{ markTabLost(pd.id, x, 'closed'); delete m[x]; }", 'delete m[x];'), /the bound forgets without marking/],
    ['a NEW forget site', judge(ksrc.replace('  function dropChild(handle) {', '  function forgetLeft(id) { delete reg.leftTabs[id]; }\n  function dropChild(handle) {')).bad, /forget in forgetLeft not in the census/],
    ['closeLeaseSession without the mark', cut('closeLeaseSession', "      if (t && t.ok) { markTabLost(p.id, browserKey, 'closed'); commit(); }", '      if (t && t.ok) { commit(); }'), /closeLeaseSession closes a conversation's tab without the mark/],
    ['a NEW tab-close site (lane browser-resume C)', judge(ksrc.replace('  function dropChild(handle) {', "  async function closeAnyTab(id) { return rt.exec(null, ['tab', 'close', id]); }\n  function dropChild(handle) {")).bad, /tab close in closeAnyTab not in the census/],
    ['a re-judge that no longer detaches', cut('rejudgeLeases', "      try { detach({ profileId, browserKey: l.browserKey, by: 'user' }); out.detached", "      try { (() => {})({ profileId, browserKey: l.browserKey, by: 'user' }); out.detached"), /path rejudgeLeases → detach gone/],
  ];
  const cbad = controls.filter(([, b, re]) => !(Array.isArray(b) && b.some((x) => re.test(x)))).map(([n, b]) => ({ n, b }));
  ok(!cbad.length, `CONTROLS (${controls.length}): the census reddens a copy that skips each recorder site (detach, dropChild, the tick), a new release site, the bound that forgets without marking, a new forget site, a closed tab without its mark, a NEW tab-close site (lane browser-resume C), a path that no longer reaches its site`, cbad);

  // …then EACH path, driven over the fake 0.38.1: he takes the page the conversation left (where one stays) and the
  // conversation's return binds a NEW tab first — its next command never runs in his page
  const pathLeg = async (Kmod, dir, how) => {
    const kp = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets });
    await kp._facts.probeVersion();
    const pp = kp.createProfile({ label: 'Rel' }, { owner: { kind: 'instance', id: null } });
    const HP2 = HM.humanKeyFor(pp.id), PK = 'bk-0000e0f1', OTHER = 'bk-0000e0f2', THEIRS = 'C0C0000000000000000000000000005D';
    live.add(PK); live.add(OTHER);
    let CK = PK, k2 = kp;
    if (how === 'dropChild') CK = kp.newChild({ browserKey: PK, sessionId: 'sess-rel' }).handle;
    await kp.attach({ profileId: pp.id, browserKey: CK, sessionId: 'sess-rel', by: 'agent' });
    const out = { how, key: CK };
    if (how === 'ui-detach') kp.detach({ profileId: pp.id, browserKey: CK, by: 'user' });
    else if (how === 'dropChild') kp.dropChild(CK);
    else if (how === 'narrow') {
      kp.updateProfile(pp.id, { use: { mode: 'only', who: [{ kind: 'session', key: OTHER }] }, base: B.useStamp(kp.profile(pp.id)) });
      out.closedMark = await until(() => !!kp._reg().tabClosed[`${pp.id}|${CK}`], 3000); // the keeper's own `tab close` under its session
    } else if (how === 'boot') { kp.shutdown(); live.delete(PK); k2 = mkKeeper(Kmod, { dataDir: path.join(ROOT, dir), readTargets }); await k2.boot(); }
    else if (how === 'stop') await kp.stop(pp.id, { why: 'user' });
    out.left = !!(k2._reg().leftTabs[pp.id] || {})[CK];
    await k2.browse(pp.id);
    fakeTargets.list = [{ targetId: OWN_TAB, type: 'page' }, { targetId: THEIRS, type: 'page' }];
    if (how !== 'stop') { try { out.take = await k2.navigateHuman(HP2, { tab: THEIRS }); } catch (e) { out.take = { refused: e.code }; } }
    if (how === 'narrow') k2.updateProfile(pp.id, { use: { mode: 'all' }, base: B.useStamp(k2.profile(pp.id)) }); // re-admitted
    live.add(PK);
    if (how === 'dropChild') out.again = k2.newChild({ browserKey: PK, sessionId: 'sess-rel' }).handle;
    const n0 = cmdsOf('vs-' + CK).filter((c) => /tab new/.test(c)).length;
    await k2.attach({ profileId: pp.id, browserKey: CK, sessionId: 'sess-rel', by: 'agent' });
    out.backNewTab = cmdsOf('vs-' + CK).filter((c) => /tab new/.test(c)).length - n0;
    fakeTargets.list = [];
    live.delete(PK); live.delete(OTHER);
    try { await k2.closeHuman(HP2); } catch { }
    try { await k2.stop(pp.id, { why: 'user' }); } catch { }
    k2.shutdown();
    return out;
  };
  const legs = [];
  for (const how of ['ui-detach', 'dropChild', 'narrow', 'boot', 'stop']) legs.push(await pathLeg(K, 'data-rel-' + how, how));
  const took = (x) => x.how === 'stop' || (x.take && x.take.adopted === true);
  ok(legs.every((x) => took(x) && x.backNewTab === 1) && legs.filter((x) => x.how !== 'stop').every((x) => x.left) && legs.find((x) => x.how === 'narrow').closedMark && legs.find((x) => x.how === 'dropChild').again === legs.find((x) => x.how === 'dropChild').key,
    'THE PATHS over the fake 0.38.1 (beside ②\'s tick drop, agent detach, a helper\'s tick drop, Quit, the heal, the bound and the race): the UI\'s Detach, a helper\'s handle dropped (the next helper gets the SAME handle), a narrowing (its tab closed and marked), a restart without the conversation (the boot\'s drop), the row\'s Stop — each time the returning session binds a NEW tab first, never lands in the page he took', legs);
  const dropC = await pathLeg(M.load('src/server/browser-keeper.js', ksrc.replace('    for (const l of reg.leases) if (l.browserKey === handle) noteLeftTab(l.profileId, handle);', '    // (control)'), 'drop-child-unrecorded'), 'data-rel-dropc', 'dropChild');
  const bootC = await pathLeg(M.load('src/server/browser-keeper.js', ksrc.replace('      noteLeftTab(d.lease.profileId, d.lease.browserKey);\n', ''), 'tick-unrecorded'), 'data-rel-bootc', 'boot');
  ok(dropC.take && dropC.take.adopted === true && dropC.backNewTab === 0 && bootC.take && bootC.take.adopted === true && bootC.backNewTab === 0, 'CONTROLS: a keeper copy whose dropChild records nothing, one whose reconcile records nothing — he takes the page and the returning session binds NO new tab (its next command would run in his page) — the legs above can go red', { dropC, bootC });
}
{
  // THE AGENT CAN NEVER REACH HIS BROWSING: no /api/agent/ route and no agent CLI names his key, his routes or his verbs
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const agentPart = routes.slice(routes.indexOf("const AGENT_PREFIX = '/api/agent/browser';"));
  const FORBID = /\bhu-|\/browse\b|browse\/|humanTake|humanAttach|humanRelease|closeHuman|quitHuman|navigateHuman|\bbrowse\(|humanOf|humanTargetFor/;
  ok(agentPart.length > 5000 && !FORBID.test(agentPart), 'no /api/agent/browser/* handler names his key, his routes or his verbs');
  const agentRoutes = [...routes.matchAll(/router\.(?:get|post|patch|delete)\('(\/api\/agent\/[^']+)'/g)].map((m) => m[1]);
  ok(agentRoutes.length > 8 && !agentRoutes.some((p) => /\/browse(\/|$)|human/.test(p)) && /router\.post\('\/api\/browser\/profiles\/:id\/browse'/.test(routes) && ![...routes.matchAll(/router\.\w+\('([^']+)'/g)].some((m) => /^\/api\/agent\/.*\bbrowse\b/.test(m[1])), 'his four routes are /api/browser/* (cookie only) — no /api/agent/… twin');
  const clis = fs.readdirSync(path.join(REPO, 'data/bin')).filter((n) => /^vibespace-/.test(n) && fs.statSync(path.join(REPO, 'data/bin', n)).isFile());
  const hits = clis.filter((n) => /\bhu-[0-9a-f]|\/api\/browser\/browse|profiles\/[^'"`]*\/browse|humanKeyFor/.test(fs.readFileSync(path.join(REPO, 'data/bin', n), 'utf8')));
  ok(clis.length > 5 && hits.length === 0, `no agent CLI (${clis.length} data/bin/vibespace-*) names his key or his routes`, hits);
}
{
  // verify r1 (H1): an agent's OWN bearer on his cookie routes (an auth-off instance answers every cookie route — reproduced
  // first, verify/repro-f4: browse / navigate / close / quit and his sessions + acts all answered 200 to a vsst_ token) —
  // refused `agent_forbidden` (the house rule of every human-only surface), the cookie path unchanged
  const gp = (await j('POST', '/api/browser/profiles', { label: 'Guard' })).json.profile;
  const HG = HM.humanKeyFor(gp.id);
  const L0 = logOf('launches.log').length;
  const asA = as(sA), asJob = { Authorization: 'Bearer jbt_' + 'z'.repeat(24) };
  const denied = [];
  for (const [m, p, body, h] of [['POST', `/api/browser/profiles/${gp.id}/browse`, {}, asA], ['POST', `/api/browser/profiles/${gp.id}/browse`, {}, asJob]]) { const x = await j(m, p, body, h); denied.push([p, x.status, x.json && x.json.code]); }
  ok(denied.every(([, st, c]) => st === 403 && c === 'agent_forbidden') && logOf('launches.log').length === L0 && !k.humanOf(gp.id), 'an agent\'s session token (vsst_) or job token (jbt_) cannot START his browsing — 403 agent_forbidden, nothing launched', denied);
  const b = await j('POST', `/api/browser/profiles/${gp.id}/browse`, {});
  ok(b.status === 200 && b.json.key === HG, '…the cookie path (no bearer) browses as before');
  const n0 = cmdsOf('vs-' + HG).length;
  const rows = [];
  for (const [m, p, body] of [['POST', `/api/browser/browse/${HG}/navigate`, { url: 'https://evil.example/' }], ['POST', `/api/browser/browse/${HG}/close`, {}], ['POST', `/api/browser/browse/${HG}/quit`, {}], ['GET', `/api/browser/sessions?browserKey=${HG}`], ['GET', `/api/browser/actions?browserKey=${HG}`]]) { const x = await j(m, p, body, asA); rows.push([m + ' ' + p.split('?')[0], x.status, x.json && x.json.code]); }
  const listed = await j('GET', `/api/browser/sessions?profile=${gp.id}`, undefined, asA), mine = await j('GET', `/api/browser/sessions?profile=${gp.id}`);
  ok(rows.every(([, st, c]) => st === 403 && c === 'agent_forbidden') && cmdsOf('vs-' + HG).length === n0 && k.humanOf(gp.id) && k.browserOf(gp.id).state === 'ready' && !listed.json.sessions.some((x) => x.holder === 'user') && mine.json.sessions.some((x) => x.holder === 'user'),
    'an agent token can neither DRIVE (navigate), END (close / quit) nor READ (his sessions, his acts) his browsing — each 403 agent_forbidden, nothing ran; a profile-wide listing to it carries no session of his (the cookie\'s does)', { rows, listed: listed.json.sessions.map((x) => x.holder || 'conv'), mine: mine.json.sessions.map((x) => x.holder || 'conv') });
  // CONTROL: a routes copy without the guard starts his browsing for an agent token — red
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const needle = '  if (refuseAgentBearer(req, res)) return;\n';
  ok((rsrc.split(needle).length - 1) === 4, 'the guard sits on the four routes (the control removes it)');
  const Rx = M.load('src/routes/browser.js', rsrc.split(needle).join(''), 'no-agent-guard');
  Rx.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [] });
  const ax = express(); ax.use(express.json()); ax.use(Rx.router);
  const sx = http.createServer(ax); servers.push(sx); await new Promise((r) => sx.listen(0, '127.0.0.1', r));
  const gp2 = k.createProfile({ label: 'Guard2' }, { owner: { kind: 'instance', id: null } });
  const rx = await fetch(`http://127.0.0.1:${sx.address().port}/api/browser/profiles/${gp2.id}/browse`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...asA }, body: '{}' });
  ok(rx.status === 200 && k.humanOf(gp2.id), 'CONTROL: the unguarded routes copy lets an agent token start his browsing (200) — the legs above can go red', rx.status);
  // verify r2 (KILL CLASS): the panel row's Stop route ended his page for an agent's token too (verify/kill-paths: 200 on the
  // 16065c65 tree) — while he browses, only HIS Stop (a cookie) ends it; both tokens refused, the row's cookie Stop unchanged
  const stopA = await j('POST', `/api/browser/profiles/${gp.id}/stop`, {}, asA), stopJ = await j('POST', `/api/browser/profiles/${gp.id}/stop`, {}, asJob);
  ok(stopA.status === 403 && stopA.json.code === 'agent_forbidden' && stopJ.status === 403 && stopJ.json.code === 'agent_forbidden' && k.browserOf(gp.id).state === 'ready' && k.humanOf(gp.id), 'verify r2: an agent token (vsst_ / jbt_) on the row\'s Stop route while he browses is refused `agent_forbidden` — his page and the browser untouched', { stopA: stopA.status, stopJ: stopJ.status });
  const Rz = M.load('src/routes/browser.js', rsrc.replace("  if (typeof k.humanOf === 'function' && k.humanOf(req.params.id) && refuseAgentBearer(req, res)) return;\n", ''), 'stop-for-agent-token');
  Rz.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [] });
  const az = express(); az.use(express.json()); az.use(Rz.router);
  const sz = http.createServer(az); servers.push(sz); await new Promise((r) => sz.listen(0, '127.0.0.1', r));
  const rz = await fetch(`http://127.0.0.1:${sz.address().port}/api/browser/profiles/${gp.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...asA }, body: '{}' });
  ok(rsrc.includes("k.humanOf(req.params.id) && refuseAgentBearer(req, res)") && rz.status === 200 && k.browserOf(gp.id).state === 'stopped' && !k.humanOf(gp.id), 'CONTROL: the routes copy without it lets an agent token stop the browser under his page (200, his browsing ended) — the leg above can go red', rz.status);
  await k.stop(gp.id, { why: 'user' }); await k.stop(gp2.id, { why: 'user' });
}
{
  // verify r2 (KILL CLASS): a CONVERSATION's live-view strip "Stop" (POST /api/browser/session/:id/stop) stopped the browser
  // under his page, naming nobody (reproduced: verify/kill-paths — 200, his browsing ended `stopped`); only Quit in his own
  // window and the panel row's Stop may end it, both naming him. Refused by name (like `shared`); the strip's list says so
  const sp = k.createProfile({ label: 'Strip' }, { owner: { kind: 'instance', id: null } });
  const HS = HM.humanKeyFor(sp.id);
  const browseTake = async () => { await k.browse(sp.id); k.humanTake({ key: HS, viewerId: 'strip-v', holderAlive: false }); };
  await browseTake();
  await k.attach({ profileId: sp.id, browserKey: KB, sessionId: 'sess-b', by: 'user' }); // conversation B holds it too
  const r1 = await j('POST', '/api/browser/session/sess-b/stop', { ref: sp.id });
  ok(r1.status === 409 && r1.json.code === 'browsing_yourself' && /Quit the whole browser/.test(r1.json.error) && /stop it from your browsing window/.test(r1.json.error) && !/then delete it/.test(r1.json.error) && /* verify r3 (revert table): the STOP sentence, never Delete's */ k.browserOf(sp.id).state === 'ready' && k.humanOf(sp.id) && k.humanOf(sp.id).state === 'driving',
    'verify r2 (KILL CLASS): a conversation\'s strip Stop on a profile he browses is REFUSED by name (`browsing_yourself`: stop it from his window or the panel row) — his page and the browser untouched', r1.json);
  const L0 = require('../src/lib/live-strip-layout.js');
  const rowsB = S.browserListFor({ ...k.statusFor(KB), helperNames: {} });
  const his = new Set(k.list().leases.filter((l) => l.human).map((l) => l.profileId));
  const item = L0.stoppableRows(rowsB, { browsing: his }).find((x) => x.ref === sp.id);
  ok(item && item.yours === true && !L0.stoppableRows(rowsB).find((x) => x.ref === sp.id).yours, 'PURE: the strip\'s list marks that row his ("you are browsing it yourself") from the digest\'s human rows — no Stop button there', item);
  await k.closeHuman(HS);
  const r2 = await j('POST', '/api/browser/session/sess-b/stop', { ref: sp.id });
  ok(r2.status === 200 && k.browserOf(sp.id).state === 'stopped', '…after his Close, the strip\'s Stop stops it as before (only the conversation held it)', r2.json);
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const needle = "    if (row.profileId && typeof k.humanOf === 'function' && k.humanOf(row.profileId)) return res.status(409)";
  ok(rsrc.includes(needle), 'the strip-stop needle (the control below removes it)');
  const Rs = M.load('src/routes/browser.js', rsrc.replace(needle, '    if (false) return res.status(409)'), 'strip-stops-his-page');
  Rs.setup({ keeper: k, activeSessions: active, notice: () => { }, tasksForSession: () => [] });
  const as2 = express(); as2.use(express.json()); as2.use(Rs.router);
  const ss = http.createServer(as2); servers.push(ss); await new Promise((r) => ss.listen(0, '127.0.0.1', r));
  await browseTake();
  await k.attach({ profileId: sp.id, browserKey: KB, sessionId: 'sess-b', by: 'user' });
  const rc = await fetch(`http://127.0.0.1:${ss.address().port}/api/browser/session/sess-b/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: sp.id }) });
  ok(rc.status === 200 && k.browserOf(sp.id).state === 'stopped' && !k.humanOf(sp.id), 'CONTROL: the routes copy without the refusal stops the browser under his page from a conversation\'s strip (200, his browsing ended) — the leg above can go red', rc.status);
  try { k.detach({ profileId: sp.id, browserKey: KB, by: 'user' }); } catch { }
  const wsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/stoppableRows\(st\.rows, \{ browsing: \(\(app\._browserProfiles && app\._browserProfiles\.leases\) \|\| \[\]\)\.filter\(\(l\) => l && l\.human\)\.map\(\(l\) => l\.profileId\) \}\)/.test(wsrc) && /if \(x\.yours\) \{/.test(wsrc) && /r\.code === 'browsing_yourself' \? humanRefusalText\('browsing_yourself', \{ label: x\.label \|\| '', act: 'stop' \}, t\)/.test(wsrc),
    'PIN: the strip reads the digest\'s human rows (his row says so, no Stop) and words a `browsing_yourself` refusal in the device\'s language');
}

// ═══ ④ THE WORDS ══════════════════════════════════════════════════════════════
console.log('— ④ the words: en through the module, zh + ja from the dictionaries');
{
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const lit = (f) => [...fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/\bt\((['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  const keys = [...new Set(lit('src/browser-human.js'))];
  const missing = keys.filter((x) => !zh[x] || !ja[x]);
  ok(keys.length >= 25 && missing.length === 0, `every key of src/browser-human.js (${keys.length}) is in zh AND ja`, missing);
  const OWNER = {
    'Browse yourself': ['自己浏览', '自分で閲覧'], 'Open your browsing window': ['打开你的浏览窗口', '閲覧ウィンドウを開く'], 'You are browsing': ['你正在浏览', 'あなたが閲覧中'],
    'You are browsing it': ['你正在浏览它', 'あなたが閲覧中です'], 'You were browsing it — Continue': ['你刚才在浏览 — 继续', '閲覧の途中です — 続ける'], 'Type an address': ['输入网址', 'アドレスを入力'],
    'Only web addresses': ['只能输入网页地址', 'ウェブのアドレスのみ'], 'Continue browsing': ['继续浏览', '閲覧を続ける'], 'Browse again': ['再次浏览', 'もう一度閲覧'],
    "You're browsing this in another window": ['你正在另一个窗口里浏览它', '別のウィンドウで閲覧中です'], 'Continue here': ['在这里继续', 'ここで続ける'], Keyboard: ['键盘', 'キーボード'],
    'You · {time} · {dur}': ['你 · {time} · {dur}', 'あなた · {time} · {dur}'], 'Open it yourself': ['自己打开', '自分で開く'], 'Quit the whole browser': ['退出整个浏览器', null],
  };
  const bad = Object.entries(OWNER).filter(([k0, [z, a]]) => (z && zh[k0] !== z) || (a && ja[k0] !== a) || !zh[k0] || !ja[k0]).map(([k0]) => k0);
  ok(bad.length === 0, 'the design\'s own words in zh and ja (§6\'s table; "退出整个浏览器" is the owner\'s)', bad);
  const tZh = (s, p) => String(zh[s] || s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const tJa = (s, p) => String(ja[s] || s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const rendered = [tZh, tJa].flatMap((tt) => [...HM.REFUSAL_CODES, 'not_browsing', 'not_web'].map((c) => HM.humanRefusalText(c, { label: 'Work', machine: 'dev-1', pid: 7, n: 6 }, tt)).concat(Object.values(HM.humanEndChoices({ conversations: 2, names: ['A'] }, tt)).flatMap((x) => (x && typeof x === 'object' ? Object.values(x) : [x])).filter((x) => typeof x === 'string')));
  ok(rendered.every((x) => x && !/\{\w+\}/.test(x)) && rendered.filter((x, i) => i >= rendered.length / 2).every((x) => !/[“”]/.test(x)), 'every refusal and end-button sentence renders in zh and ja with no {param} left; ja never carries “ ”', rendered.filter((x) => !x || /\{\w+\}/.test(x)));
}

for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 5 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

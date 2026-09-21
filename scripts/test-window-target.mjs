#!/usr/bin/env node
// WINDOW TARGET — agent browser P9 second half: leases + the three modes on
// a window (docs/design-agent-browser-v2 §4.3 / §4.9 / §5.1.1 / §6.6, the §9
// `test-window-target` row; 2026-09-21).
//   §1 PURE: the RFB sieve's `strip` (a refused KeyEvent / PointerEvent is cut
//      OUT of the chunk and the FramebufferUpdateRequest beside it still
//      relays; allowed ⇒ byte-identical; a message split across chunks; an
//      opaque stream is all-or-nothing; `feed` unchanged), the window NOUN in
//      the shared takeover model (window_paused, no URL line, the browser
//      strings byte-identical), the window-live mode arithmetic, the ENGINE
//      over a fake keeper (the lease PERSISTS across an engine rebuild, an
//      orphaned holder is freed at attach, reconcile grace with an injected
//      clock, dropSession, takeover / handback / inputPolicy / viewerLeft /
//      the idle sweep, the audit lines carry `origin`, the broadcast fires),
//      the ONE announcer taking a window handback (delivered under
//      'browser-handback' with the window text; idle ⇒ inbox item, nothing
//      delivered).
//   §2 THE BRIDGE over a fake RFB tcp server + real ws, policy = the engine:
//      in Watch a KeyEvent never reaches the server while the update request
//      does; after viewer A takes over A's input relays and B's is `held`;
//      A's socket closing hands back (viewer-left) and B is refused again.
//   §3 REAL (SKIP with evidence without python3-gi / Xvfb / x11vnc / a
//      session bus): the desktop-app keeper launches the GTK fixture on ITS
//      Xvfb + x11vnc, the WIRING module composes the engine + bridge + both
//      route families on an express app, and `data/bin/vibespace-window` is
//      driven AS A CHILD PROCESS by two fake sessions: open → snapshot →
//      click @ref (count read back from the app's own tree); the second
//      session's attach is `window_leased` and its click `not_attached`; a
//      viewer on the REAL bridge in Watch sends 'a' and the fixture's key
//      witness stays "key none"; the user's takeover through the desktop
//      route ⇒ the agent's click is `window_paused` (exit 1, "do NOT retry")
//      and the same 'a' now lands ("key a"); the explicit handback is
//      announced with the window text; a new engine over the same data dir
//      (a restart) still holds the lease and the CLI snapshots without
//      re-attaching; the audit has takeover/handback lines with origin.
// Registered heavy (boots Xvfb + x11vnc + a GTK app). Per-pid scratch.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { windowLiveMode, windowModeBadge, leaseTransition, newViewerId } from '../src/lib/window-live-mode.js';

const require = createRequire(import.meta.url);
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⚠ SKIP: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(step); } return false; };
const run = (bin, args, env = process.env, timeout = 8000) => new Promise((res) => execFile(bin, args, { env, timeout, encoding: 'utf8' }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const S = require('../src/server/desktop-stream.js');
const T = require('../src/browser-takeover.js');
const WT = require('../src/window-targets.js');
const D = require('../src/desktop-display.js');
const ENGINE = require('../src/server/window-targets-engine.js');
const HB = require('../src/server/browser-handback.js');
const WIRING = require('../src/server/window-live-wiring.js');
const AROUTES = require('../src/routes/window-targets.js');
const dir = scratch('window-target');
fs.mkdirSync(dir, { recursive: true });
const children = new Set();
const keepers = [];
const cleanup = () => { for (const k of keepers) { try { k.shutdown(); } catch { } } for (const c of children) { try { c.kill('SIGKILL'); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// RFB client message shapes (the noVNC we ship): FramebufferUpdateRequest,
// KeyEvent (keysym 'a' down / up), PointerEvent (move to x,y).
const FBUR = Buffer.from([3, 1, 0, 0, 0, 0, 0x04, 0x00, 0x03, 0x00]);
const KEY_DOWN = Buffer.from([4, 1, 0, 0, 0, 0, 0, 0x61]);
const KEY_UP = Buffer.from([4, 0, 0, 0, 0, 0, 0, 0x61]);
const PTR = (x, y) => Buffer.from([5, 0, (x >> 8) & 255, x & 255, (y >> 8) & 255, y & 255]);
const HS = [Buffer.from('RFB 003.008\n'), Buffer.from([1]), Buffer.from([1])];

// ─────────────────────────────────────────────────────────────────────────────
console.log('§1 PURE: the sieve\'s strip, the window noun, the mode arithmetic, the engine, the announcer');
{
  // strip: watch cuts the input out and relays the rest
  const s = S.rfbInputSieve();
  const relayed = [];
  for (const b of HS) { const r = s.strip(b, false); if (r.relay) relayed.push(r.relay); }
  ok(Buffer.concat(relayed).equals(Buffer.concat(HS)), 'the handshake relays whole in strip mode (it is not input)');
  const r1 = s.strip(Buffer.concat([FBUR, KEY_DOWN, PTR(1, 2), KEY_UP]), false);
  ok(r1.inputs === 3 && r1.dropped === 3 && r1.relay && r1.relay.equals(FBUR), 'a frame carrying an update request + KeyEvent + PointerEvent + KeyEvent in Watch: the three inputs are cut out, the update request alone relays (the picture never freezes on a refused click)');
  const s2 = S.rfbInputSieve();
  for (const b of HS) s2.strip(b, true);
  const mix = Buffer.concat([FBUR, KEY_DOWN, PTR(3, 4), Buffer.from([2, 0, 0, 1, 0, 0, 0, 7]), KEY_UP, FBUR]);
  const r2 = s2.strip(mix, true);
  ok(r2.inputs === 3 && r2.dropped === 0 && r2.relay.equals(mix), 'allowed ⇒ byte-identical relay (SetEncodings, update requests and inputs in their order)');
  ok(s2.feed(KEY_DOWN) === 1 && s2.feed(FBUR) === 0, '`feed` still answers the idle clock\'s count on the same parser');
  // a message split across chunks: nothing relays until it completes, then the verdict applies to the whole message
  const s3 = S.rfbInputSieve();
  for (const b of HS) s3.strip(b, true);
  const a = s3.strip(KEY_DOWN.subarray(0, 3), false);
  const b = s3.strip(Buffer.concat([KEY_DOWN.subarray(3), FBUR]), false);
  ok(a.inputs === 0 && a.relay === null && b.inputs === 1 && b.dropped === 1 && b.relay.equals(FBUR), 'a KeyEvent split across two chunks is judged once it is complete — dropped whole, the update request behind it relays');
  const s3b = S.rfbInputSieve();
  for (const b2 of HS) s3b.strip(b2, true);
  const c1 = s3b.strip(FBUR.subarray(0, 4), true), c2 = s3b.strip(FBUR.subarray(4), true);
  ok(c1.relay === null && c2.relay && c2.relay.equals(FBUR), 'a NON-input message split across chunks relays once complete, whole (the server never sees half a message)');
  // opaque: all-or-nothing
  const s4 = S.rfbInputSieve();
  const o1 = s4.strip(Buffer.from('GET / HTTP/1.1\r\n'), false);
  const o2 = s4.strip(Buffer.from('more'), true);
  ok(o1.inputs === 1 && o1.dropped === 1 && o1.relay === null && s4.state().opaque && o2.relay && o2.relay.toString() === 'more', 'a stream the sieve cannot follow is opaque: a refused chunk is dropped WHOLE, an allowed one relays raw');
  ok(S.viewerOf('/api/desktop/da-1/stream?viewer=wl-abc.1') === 'wl-abc.1' && S.viewerOf('/api/desktop/da-1/stream') === null && S.viewerOf('/x?viewer=bad%20id') === null && S.viewerOf('/x?viewer=' + 'a'.repeat(65)) === null, 'viewerOf: the ?viewer= id, validated (charset + length), else null');

  // the window noun in the shared model — the browser strings byte-identical
  const browserPaused = T.browserPausedRefusal({ state: { takenAt: 1000, lastUserInputAt: 1000 }, label: 'work', now: 31000 });
  const windowPaused = T.browserPausedRefusal({ state: { takenAt: 1000, lastUserInputAt: 1000 }, label: 'Notes', now: 31000, target: 'window' });
  ok(browserPaused.code === 'browser_paused' && browserPaused.error === 'the user took over the "work" browser 30 s ago — your command did NOT run. Wait for the handback (the live view hands back explicitly, or by itself after 10 min without input); it names the page they left you on. Do not retry in a loop.', 'the browser refusal is byte-identical to P3\'s');
  ok(windowPaused.code === 'window_paused' && /the "Notes" window 30 s ago/.test(windowPaused.error) && /snapshot the window again/.test(windowPaused.error) && !/page/.test(windowPaused.error) && windowPaused.target === 'window', 'the window refusal: window_paused, the window noun, "snapshot again" instead of a page — and never a URL');
  const bt = T.handbackText({ cause: 'explicit', label: 'work', url: 'https://a.example/x', heldMs: 65000 });
  ok(bt === 'The user handed the "work" browser back to you after 65 s of driving it. Current URL: https://a.example/x. Re-orient before continuing — the page may have changed (a login, a captcha, a navigation).', 'the browser handback text is byte-identical to P3\'s');
  const wtx = T.handbackText({ cause: 'explicit', label: 'Notes', heldMs: 65000, target: 'window', handle: 'da-9' });
  ok(/^The user handed the "Notes" window back to you after 65 s of driving it\. Snapshot it before continuing \(`vibespace-window snapshot da-9`\)/.test(wtx) && !/URL/.test(wtx) && /refs from before the takeover are stale/.test(wtx), 'the window handback text names the handle to snapshot and says the refs are stale — no URL line');
  ok(/lapsed \(no input for 10 min\)/.test(T.handbackText({ cause: 'idle', label: 'Notes', target: 'window' })) && /closed the live view that held the "Notes" window/.test(T.handbackText({ cause: 'viewer-left', label: 'Notes', target: 'window' })), 'idle / viewer-left causes keep their heads with the window noun');
  const wn = T.handbackNotice({ cause: 'idle', label: 'Notes', target: 'window', handle: 'da-9', at: 5 });
  ok(wn.kind === 'browser-handback' && wn.target === 'window' && wn.handle === 'da-9' && /the "Notes" window/.test(T.renderHandbackNotice(wn)) && !('target' in T.handbackNotice({ cause: 'idle' })), 'the zero-spend notice carries target+handle for a window (and nothing new for a browser) and renders with the window noun');
  const wi = T.idleInboxItem({ label: 'Notes', target: 'window', sessionName: 'alpha' });
  ok(/the "Notes" window \(alpha\)/.test(wi.text) && /next window command/.test(wi.detail) && /the "x" browser/.test(T.idleInboxItem({ label: 'x' }).text), 'the idle inbox item says window / browser by target');
  ok(T.TARGETS.length === 2 && T.handbackText({ cause: 'explicit', label: 'z', target: 'bogus' }).includes('the "z" browser'), 'an unknown target falls to the browser noun (the closed set holds)');

  // the mode arithmetic
  ok(windowLiveMode({}).leased === false && windowLiveMode({}).viewOnly === false, 'no lease ⇒ not leased, never view-only (the user\'s own app, as before)');
  ok(windowLiveMode({ lease: { input: 'agent' }, viewerTag: 't1' }).mode === 'watch' && windowLiveMode({ lease: { input: 'agent' }, viewerTag: 't1' }).viewOnly === true, 'an agent lease ⇒ Watch, view-only');
  const mineM = windowLiveMode({ lease: { input: 'user', takenBy: { tag: 't1' } }, viewerTag: 't1' });
  const otherM = windowLiveMode({ lease: { input: 'user', takenBy: { tag: 't2' } }, viewerTag: 't1' });
  ok(mineM.mode === 'takeover' && mineM.mine && !mineM.viewOnly && otherM.mode === 'takeover' && !otherM.mine && otherM.viewOnly && otherM.holder === 't2', 'taken over: mine ⇒ input flows; somebody else\'s ⇒ view-only for me, the holder named by its OPAQUE tag');
  ok(windowModeBadge(mineM) === 'You are driving — agent asked to pause' && windowModeBadge(otherM) === 'Another viewer is driving — agent asked to pause' && windowModeBadge(windowLiveMode({ lease: { input: 'agent' } })) === 'Agent is driving' && windowModeBadge(windowLiveMode({})) === null, 'the badge uses the browser live view\'s exact three phrases (T.modeBadge\'s words), none without a lease');
  ok(leaseTransition({ input: 'agent' }, { input: 'user', takenBy: { tag: 't1' } }, 't1') === 'took-over' && leaseTransition({ input: 'user', takenBy: { tag: 't1' } }, { input: 'agent', handbackCause: 'explicit' }, 't1') === 'handed-back' && leaseTransition({ input: 'user', takenBy: { tag: 't1' } }, { input: 'agent', handbackCause: 'idle' }, 't1') === 'lapsed' && leaseTransition({ input: 'user', takenBy: { tag: 't1' } }, { input: 'agent', handbackCause: 'viewer-left' }, 't1') === 'lapsed' && leaseTransition({ input: 'agent' }, { input: 'user', takenBy: { tag: 't2' } }, 't1') === 'other-took' && leaseTransition(null, { input: 'agent' }, 't1') === 'agent-attached' && leaseTransition({ input: 'agent' }, null, 't1') === 'agent-left' && leaseTransition({ input: 'agent' }, { input: 'agent' }, 't1') === null, 'leaseTransition names every change the person looking at the pane must hear about, and nothing else');
  ok(/^wl-[a-z0-9]+$/.test(newViewerId()) && S.VIEWER_RE.test(newViewerId()) && newViewerId() !== newViewerId(), 'a viewer id fits the bridge\'s charset and differs per pane');

  // the engine over a fake keeper (no display): persistence, orphans, reconcile, the input side, the policy
  const edir = path.join(dir, 'engine'); fs.mkdirSync(edir, { recursive: true });
  const records = new Map();
  const mk = (id, extra = {}) => ({ id, label: `App ${id}`, exec: 'x', state: 'ready', display: ':77', pids: { app: 4242 }, starts: {}, backend: 'vnc-display', startedAt: 1, ...extra });
  records.set('da-one', mk('da-one')); records.set('da-two', mk('da-two'));
  const keeper = { listApps: () => [...records.values()], get: (id) => records.get(id) || null, sessionPids: (rec) => Object.values(rec.pids).filter(Boolean), x11EnvFor: () => null, launch: async () => { throw new Error('not here'); } };
  const sessions = new Map([['s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-11111111', name: 'alpha', backendSessionId: 'conv-1' }], ['s2', { agentToken: 'vsst_bbbb', _browserKey: 'bk-22222222', name: 'beta', backendSessionId: 'conv-2' }]]);
  let clock = 1_000_000;
  const now = () => clock;
  const bcasts = [];
  const settings = { 'browser.takeoverIdleMs': 60000 };
  const mkEngine = () => ENGINE.create({ keeper, dataDir: edir, env: () => process.env, activeSessions: sessions, now, broadcast: (m) => bcasts.push(m), serverSetting: (k) => settings[k], log: { warn() { }, log() { } } });
  const e1 = mkEngine();
  const f1 = e1.factsForToken('vsst_aaaa'), f2 = e1.factsForToken('vsst_bbbb');
  const a1 = e1.attach('da-one', f1);
  ok(a1.lease.origin === 'vibespace' && a1.lease.input === 'agent' && a1.lease.sessionName === 'alpha' && a1.lease.orphaned === false, 'a lease view carries origin (§6.6\'s class marker), input, the holder\'s name, orphaned');
  ok(fs.existsSync(e1.leaseFile) && JSON.parse(fs.readFileSync(e1.leaseFile, 'utf8')).leases['da-one'].sessionId === 's1', 'the lease is written to data/window-leases.json at once');
  ok(bcasts.length >= 1 && bcasts[bcasts.length - 1].type === 'window-leases-updated' && bcasts[bcasts.length - 1].leases[0].handle === 'da-one', 'window-leases-updated is broadcast with the views');
  const e2 = mkEngine();
  ok(e2.leaseOf('da-one').sessionId === 's1' && e2.leaseOf('da-one').input === 'agent', 'a second engine over the same data dir (a restart) still says s1 holds da-one — with a FRESH input side (a restart is a handback by construction)');
  let err = null; try { e2.attach('da-one', f2); } catch (e) { err = e; }
  ok(err && err.code === 'window_leased' && err.holder === 's1', 'and refuses s2 window_leased after the restart');
  // an orphaned holder: s1 vanishes ⇒ s2 may attach, the audit names the previous holder
  sessions.delete('s1');
  ok(e2.leaseOf('da-one').orphaned === true, 'a lease whose session is gone reads orphaned');
  const a2 = e2.attach('da-one', f2);
  ok(a2.orphanedFrom === 's1' && a2.lease.sessionId === 's2' && a2.resumed === false, 'the next session takes an orphaned lease (orphanedFrom names the previous holder)');
  sessions.set('s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-11111111', name: 'alpha', backendSessionId: 'conv-1' });
  // reconcile: grace at the tick, at once at boot; a gone window drops at once
  e2.attach('da-two', f1);
  sessions.delete('s1');
  let r = e2.reconcile({ graceMs: 60000 });
  ok(r.stamped.includes('da-two') && r.dropped.length === 0 && e2.leaseOf('da-two'), 'a holder that just vanished is STAMPED, not dropped (the grace)');
  clock += 61000;
  r = e2.reconcile({ graceMs: 60000 });
  ok(r.dropped.some((d) => d.handle === 'da-two') && e2.leaseOf('da-two') === null, 'past the grace it is dropped');
  sessions.set('s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-11111111', name: 'alpha', backendSessionId: 'conv-1' });
  e2.attach('da-two', f1);
  records.get('da-two').state = 'exited';
  r = e2.reconcile({ graceMs: 60000 });
  ok(r.dropped.some((d) => d.handle === 'da-two' && d.why === 'window gone') && e2.leaseOf('da-two') === null, 'a window that is gone loses its lease at once, grace or not');
  records.get('da-two').state = 'ready';
  ok(e2.dropSession('s2') === 1 && e2.leaseOf('da-one') === null, 'dropSession (the kill path) drops the session\'s leases');
  // the input side + the policy
  const events = [];
  e2.onInput((ev) => events.push(ev));
  e2.attach('da-one', f1);
  ok(e2.inputPolicy('da-two', 'v1').relay === true, 'no lease ⇒ the bridge relays (a human\'s own app)');
  ok(e2.inputPolicy('da-one', 'v1').relay === false && e2.inputPolicy('da-one', 'v1').code === 'watch-mode', 'an agent lease ⇒ watch-mode: the viewer\'s input is refused');
  ok(e2.takeover({ handle: 'da-two', viewerId: 'v1' }).code === 'no_lease', 'takeover on a window no agent holds ⇒ no_lease (nothing to take)');
  ok(e2.takeover({ handle: 'da-one', viewerId: '' }).code === 'bad-request', 'a takeover needs a viewer');
  const tk = e2.takeover({ handle: 'da-one', viewerId: 'v1' });
  ok(tk.ok && tk.lease.input === 'user' && /^tk-[0-9a-f]{16}$/.test(tk.lease.takenBy.tag) && !('viewerId' in tk.lease.takenBy) && !JSON.stringify(tk.lease).includes('"v1"') && events.at(-1).kind === 'takeover' && events.at(-1).target === 'window' && events.at(-1).handle === 'da-one', 'the user takes over: input user, the takeover named by an OPAQUE tag (the viewer id is in no lease view), an input event with target window');
  ok(e2.takeover({ handle: 'da-one', viewerId: 'v1' }).already === true, 'the same viewer again is idempotent');
  ok(e2.inputPolicy('da-one', 'v1').relay === true && e2.inputPolicy('da-one', 'v2').code === 'held', 'taken over: the holder relays, another viewer is held');
  ok(e2.takeover({ handle: 'da-one', viewerId: 'v2' }).code === 'held', 'a second viewer cannot take over while the holder\'s socket is alive (no probe ⇒ alive)');
  e2.setViewerProbe(() => false);
  ok(e2.takeover({ handle: 'da-one', viewerId: 'v2' }).ok === true && e2.inputPolicy('da-one', 'v2').relay === true && e2.inputPolicy('da-one', 'v1').code === 'held', 'when the bridge says the holder\'s socket is gone, another viewer may take over');
  e2.setViewerProbe(null);
  let paused = null; try { await e2.snapshot('da-one', f1); } catch (e) { paused = e; }
  ok(paused && paused.code === 'window_paused' && /the "App da-one" window/.test(paused.message) && /snapshot the window again/.test(paused.message) && /^tk-[0-9a-f]{16}$/.test(paused.viewer) && paused.viewer !== 'v2', 'every agent verb is refused window_paused with the shared wording while the user drives (§6.6: nothing is injected) — the refusal names the takeover by its opaque tag, never the viewer id');
  ok(e2.noteUserInput('da-one', clock + 5) === true && e2.inputStateFor('da-one').lastUserInputAt === clock + 5, 'the bridge\'s input note restarts the idle clock');
  ok(e2.viewerLeft('da-one', 'v9') === false && e2.inputStateFor('da-one').input === 'user', 'a non-holder viewer leaving changes nothing');
  ok(e2.viewerLeft('da-one', 'v2') === true && e2.inputStateFor('da-one').input === 'agent' && events.at(-1).kind === 'handback' && events.at(-1).cause === 'viewer-left', 'the holder\'s socket closing hands back (viewer-left)');
  e2.takeover({ handle: 'da-one', viewerId: 'v1' });
  clock += 30000;
  ok(e2.sweepIdleTakeovers(clock) === 0 && e2.inputStateFor('da-one').input === 'user', 'within the idle window (browser.takeoverIdleMs — the same setting as a tab) nothing lapses');
  clock += 31000;
  ok(e2.sweepIdleTakeovers(clock) === 1 && e2.inputStateFor('da-one').input === 'agent' && events.at(-1).cause === 'idle', 'past it the takeover lapses (idle)');
  ok(e2.handback({ handle: 'da-one', cause: 'explicit' }).code === 'not_taken', 'a handback when nobody drives ⇒ not_taken');
  e2.takeover({ handle: 'da-one', viewerId: 'v1' });
  const hb = e2.handback({ handle: 'da-one', viewerId: 'v1', cause: 'explicit' });
  ok(hb.ok && hb.cause === 'explicit' && hb.byHolder === true && hb.lease.input === 'agent' && hb.lease.handbackCause === 'explicit', 'an explicit handback flips it back and says by whom');
  e2.takeover({ handle: 'da-one', viewerId: 'v1' });
  e2.detach('da-one', f1);
  ok(e2.inputStateFor('da-one').input === 'agent' && events.at(-1).kind === 'handback' && events.at(-1).cause === 'detach', 'detaching a taken-over window hands back first (detach — a state change, never a delivery)');
  const audit = fs.readFileSync(e2.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(audit.every((l) => l.origin === 'vibespace'), `every audit line carries origin:'vibespace' (${audit.length} lines)`);
  ok(audit.some((l) => l.verb === 'takeover' && l.by === 'user' && l.viewer === 'v1') && audit.some((l) => l.verb === 'handback' && l.by === 'user' && l.cause === 'idle') && audit.some((l) => l.verb === 'attach' && l.orphanedFrom === 's1') && audit.some((l) => l.verb === 'lease-dropped'), 'the audit names takeover (viewer), handback (cause), the orphaned attach and the dropped lease');
  ok(e2.inputSummaryFor('s1') === null && (e2.attach('da-one', f1), e2.inputSummaryFor('s1').input === 'agent') && (e2.takeover({ handle: 'da-one', viewerId: 'v1' }), e2.inputSummaryFor('s1').input === 'user'), 'inputSummaryFor: null / agent / user for one session');
  e2.detach('da-one', f1);
  ok(e2.boot().leases === 0 && typeof e2.tick().idle === 'number', 'boot and tick answer their counts');
  e2.shutdown();

  // the ONE announcer taking a window handback
  const delivered = [];
  const notices = [];
  const inbox = [];
  const ann = HB.create({ keeper: null, deliver: { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return { ok: true, via: 'test' }; }, stashFor: () => { } }, serverSetting: () => undefined, activeSessions: sessions,
    userTodos: { add: (k, item) => inbox.push({ k, item }) }, sessionKeyFor: (s, id) => id, notice: (id, s, n) => notices.push(n), log: { log() { }, warn() { } } });
  const e3 = mkEngine();
  ok(ann.installWindow(e3) === true && ann.installWindow(e3) === false, 'installWindow hangs once on the engine\'s input seam');
  e3.attach('da-one', f1);
  e3.takeover({ handle: 'da-one', viewerId: 'v1' });
  e3.handback({ handle: 'da-one', viewerId: 'v1', cause: 'explicit' });
  await sleep(20);
  ok(delivered.length === 1 && delivered[0].cid === 'conv-1' && delivered[0].opts.spendReason === 'browser-handback' && delivered[0].opts.kind === 'notification' && /the "App da-one" window back to you/.test(delivered[0].text) && /vibespace-window snapshot da-one/.test(delivered[0].text), 'an explicit window handback is delivered through the ONE ladder under the ONE reason (browser-handback) with the window text');
  e3.takeover({ handle: 'da-one', viewerId: 'v1' });
  clock += 61000;
  e3.sweepIdleTakeovers(clock);
  await sleep(20);
  ok(delivered.length === 1 && notices.length === 1 && notices[0].target === 'window' && notices[0].handle === 'da-one' && inbox.length === 1 && /the "App da-one" window/.test(inbox[0].item.text), 'an idle window handback delivers NOTHING (zero-spend): the notice with target window rides the next message, one inbox item names the window');
  ann.shutdown(); e3.shutdown();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§2 THE BRIDGE over a fake RFB server, policy = the engine');
{
  // a fake RFB server: sends the banner, records every byte it receives
  const got = [];
  const rfbSrv = net.createServer((sock) => { sock.write('RFB 003.008\n'); sock.on('data', (d) => got.push(Buffer.from(d))); });
  const rfbPort = await freePort();
  await new Promise((r) => rfbSrv.listen(rfbPort, '127.0.0.1', r));
  const edir = path.join(dir, 'bridge'); fs.mkdirSync(edir, { recursive: true });
  const keeper = { listApps: () => [{ id: 'da-b', label: 'B', exec: 'x', state: 'ready', display: ':78', pids: { app: 1 }, starts: {}, backend: 'vnc-display', startedAt: 1 }], get: (id) => (id === 'da-b' ? { id: 'da-b', label: 'B', state: 'ready', display: ':78', pids: { app: 1 } } : null), sessionPids: () => [1], x11EnvFor: () => null, launch: async () => { throw new Error('no'); } };
  const sessions = new Map([['s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-1', name: 'alpha' }]]);
  const engine = ENGINE.create({ keeper, dataDir: edir, env: () => process.env, activeSessions: sessions, log: { warn() { }, log() { } } });
  const inputs = [];
  const stream = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => (id === 'da-b' ? { kind: 'rfb', port: rfbPort } : null), onInput: (id, v) => { inputs.push(v); engine.noteUserInput(id); }, inputPolicy: (id, v) => engine.inputPolicy(id, v), onViewerLeft: (id, v) => engine.viewerLeft(id, v), log: { log() { }, warn() { } } });
  engine.setViewerProbe((id, v) => stream.viewerAlive(id, v));
  const srv = http.createServer((req, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => { const id = S.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } stream.handleUpgrade(req, socket, head, id); });
  const port = await freePort();
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const WebSocket = require('ws');
  const open = (viewer) => new Promise((resolve, reject) => { const ws = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/da-b/stream?viewer=${viewer}`); ws.on('open', () => resolve(ws)); ws.on('error', reject); });
  const seen = () => Buffer.concat(got);
  const reset = () => { got.length = 0; };
  const f1 = engine.factsForToken('vsst_aaaa');
  const A = await open('vA'), B = await open('vB');
  ok(stream.viewersOf('da-b').sort().join(',') === 'vA,vB' && stream.viewerAlive('da-b', 'vA') && !stream.viewerAlive('da-b', 'vZ'), 'the bridge knows its viewers by id');
  // 2026-09-21 (the verifier's finding): a second socket claiming a LIVE id used to REPLACE the holder's socket in the map
  const dup = await open('vA').then(() => 'opened', (e) => String(e && e.message));
  ok(/409/.test(dup) && stream.viewersOf('da-b').sort().join(',') === 'vA,vB' && stream.viewerAlive('da-b', 'vA') && stream.stats().held === 1, `a SECOND socket claiming a LIVE viewer id is refused 409 (bound to its socket; the holder keeps it; stats.held counts it) — got ${dup}`);
  for (const ws of [A, B]) for (const b of HS) ws.send(b);
  await until(() => seen().length >= 2 * 14, 3000);
  // no lease yet: a human's own app — input relays
  reset(); A.send(Buffer.concat([FBUR, KEY_DOWN])); await sleep(150);
  ok(seen().equals(Buffer.concat([FBUR, KEY_DOWN])) && inputs.includes('vA'), 'no agent lease: a viewer\'s KeyEvent relays (the desktop-app window behaves as before) and is reported as input');
  engine.attach('da-b', f1);
  reset(); A.send(Buffer.concat([FBUR, KEY_DOWN, KEY_UP])); await sleep(150);
  ok(seen().equals(FBUR), 'an agent holds it: in Watch the KeyEvents never reach the server, the update request beside them does');
  const n0 = inputs.length;
  reset(); A.send(PTR(5, 5)); await sleep(150);
  ok(seen().length === 0 && inputs.length === n0 && stream.stats().dropped >= 3, 'a PointerEvent in Watch is dropped and NOT reported as input (a refused click is nobody at the keyboard); stats count the drops');
  const tk = engine.takeover({ handle: 'da-b', viewerId: 'vA' });
  ok(tk.ok && tk.lease.input === 'user', 'viewer A takes over (the bridge says its socket is alive)');
  await sleep(2100); // the bridge reports input to onInput at most once per 2 s per socket (INPUT_REPORT_MS) — A reported at the no-lease step above
  reset(); A.send(Buffer.concat([KEY_DOWN, KEY_UP])); await sleep(150);
  ok(seen().equals(Buffer.concat([KEY_DOWN, KEY_UP])), 'the holder\'s KeyEvents now relay');
  ok(inputs.length > n0 && inputs.at(-1) === 'vA', 'and are reported as input (the idle clock restarts; the refused ones above never were)');
  reset(); B.send(Buffer.concat([FBUR, KEY_DOWN])); await sleep(150);
  ok(seen().equals(FBUR) && engine.takeover({ handle: 'da-b', viewerId: 'vB' }).code === 'held', 'viewer B is held: its KeyEvent is dropped, its update request relays, its takeover is refused held');
  A.close();
  await until(() => engine.inputStateFor('da-b').input === 'agent', 3000);
  ok(engine.inputStateFor('da-b').input === 'agent' && engine.inputStateFor('da-b').handbackCause === 'viewer-left' && !stream.viewerAlive('da-b', 'vA'), 'A\'s socket closing hands back (viewer-left) through the bridge\'s onViewerLeft');
  reset(); B.send(KEY_DOWN); await sleep(150);
  ok(seen().length === 0, 'and B is back in Watch: its KeyEvent is dropped again');
  ok(engine.takeover({ handle: 'da-b', viewerId: 'vB' }).ok === true, 'B may now take over (the holder is gone)');
  const A2 = await open('vA').then((ws) => ws, () => null);
  ok(A2 && stream.viewerAlive('da-b', 'vA'), 'once the holder\'s socket is gone its id may be claimed again (a reconnect after a drop)');
  if (A2) A2.close();
  B.close();
  await sleep(100);
  await new Promise((r) => srv.close(r)); rfbSrv.close();
  engine.shutdown();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('§3 REAL: the keeper\'s Xvfb + x11vnc + the GTK fixture, the wiring, the CLI as a child process');
{
  const base = { ...process.env };
  const py = await run('python3', ['-c', "import gi; gi.require_version('Atspi','2.0'); gi.require_version('Gtk','3.0'); from gi.repository import Atspi, Gtk; print('ok')"], base, 20000);
  const facts = await D.hostFacts({});
  const a11y = py.err ? null : await WT.probeA11y({ env: base, wallMs: 10000 });
  const python = D.binOnPath('python3', { env: base });
  const fixture = path.join(REPO, 'scripts', 'fixtures', 'window-target-app.py');
  if (py.err) skip(`python3 gi Atspi/Gtk not importable: ${(py.stderr || py.err.message).trim().split('\n').pop()}`);
  else if (!facts.bins.Xvfb || !facts.bins.x11vnc) skip(`Xvfb (${!!facts.bins.Xvfb}) and x11vnc (${!!facts.bins.x11vnc}) are both needed for the keeper's vnc-display rung`);
  else if (!base.DBUS_SESSION_BUS_ADDRESS && !base.XDG_RUNTIME_DIR) skip('no session bus in this environment — the a11y bus is unreachable');
  else if (!a11y || !a11y.ok) skip(`the accessibility bus did not answer: ${a11y && a11y.why}`);
  else {
    console.log(`  a11y probe: ${a11y.apps} apps on the bus in ${a11y.ms} ms; backends: Xvfb ${facts.bins.Xvfb}, x11vnc ${facts.bins.x11vnc}`);
    const dataDir = path.join(dir, 'real'); fs.mkdirSync(dataDir, { recursive: true });
    const K = require('../src/server/desktop-app-keeper.js');
    const bcasts = [];
    const keeper = K.create({ dataDir, env: () => ({ ...base }), broadcast: (m) => bcasts.push(m), serverSetting: () => undefined, log: { log() { }, warn() { }, error() { } } });
    keepers.push(keeper);
    await keeper.adoptAll(); keeper.start();
    const sessions = new Map([['s1', { agentToken: 'vsst_aaaa', _browserKey: 'bk-11111111', name: 'alpha', backendSessionId: 'conv-1' }], ['s2', { agentToken: 'vsst_bbbb', _browserKey: 'bk-22222222', name: 'beta', backendSessionId: 'conv-2' }]]);
    const delivered = [];
    const announcer = HB.create({ keeper: null, deliver: { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return { ok: true }; } }, serverSetting: () => undefined, activeSessions: sessions, log: { log() { }, warn() { } } });
    const express = require('express');
    const app = express();
    app.use(express.json());
    const wired = WIRING.install({ app, auth: { requestAuthed: () => true }, vnc: { port: 0 }, keeper, DESKTOP_SINGLETON_ID: 'desktop-singleton', dataDir, env: () => ({ ...base }), activeSessions: () => sessions, serverSetting: () => undefined, broadcast: (m) => bcasts.push(m), browserHandback: announcer, log: { log() { }, warn() { } } });
    ok(wired.announced === true && wired.windowEngine && wired.desktopStream, 'the wiring composes the engine, the bridge and the announcer\'s window seam');
    const srv = http.createServer(app);
    srv.on('upgrade', (req, socket, head) => { const id = wired.desktopStream.upgradeId(req.url.split('?')[0]); if (!id) { socket.destroy(); return; } wired.desktopStream.handleUpgrade(req, socket, head, id); });
    const port = await freePort();
    await new Promise((r) => srv.listen(port, '127.0.0.1', r));
    const API = `http://127.0.0.1:${port}`;
    const cli = (token, ...args) => new Promise((res) => { const c = spawn(process.execPath, [path.join(REPO, 'data', 'bin', 'vibespace-window'), ...args], { env: { ...base, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => res({ code, out, err })); });
    const api = async (method, p, body) => { const r = await fetch(API + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };
    const engine = wired.windowEngine;
    const f1 = engine.factsForToken('vsst_aaaa');
    // the agent (session 1) opens the fixture through the CLI
    const opened = await cli('vsst_aaaa', 'open', '--exec', python, '--args', fixture, '--title', 'vs window fixture', '--json');
    let handle = null; try { handle = JSON.parse(opened.out).handle; } catch { }
    ok(opened.code === 0 && handle && /^da-/.test(handle), `vibespace-window open (as a child process) starts the fixture through the keeper and answers a handle (${handle}) — ${opened.err.trim().split('\n').pop() || 'no stderr'}`);
    if (!handle) { console.log(opened.out, opened.err); }
    else {
      const ready = await until(() => { const r = keeper.get(handle); return r && r.state === 'ready'; }, 30000, 200);
      const rec = keeper.get(handle);
      ok(ready && rec.backend === 'vnc-display', `the keeper brings it up on ${rec && rec.display} via ${rec && rec.via} (state ${rec && rec.state})`);
      // wait for the app on the a11y bus, then snapshot through the CLI
      let snap = null;
      const onBus = await until(async () => { const r = await cli('vsst_aaaa', 'snapshot', handle, '--json'); if (r.code === 0) { try { const j = JSON.parse(r.out); if (j.nodes && j.nodes.length) { snap = j; return true; } } catch { } } return false; }, 30000, 500);
      ok(onBus && snap && snap.census.nodes > 5, `snapshot through the CLI: ${snap && snap.census.nodes} nodes from the real tree (Action ${snap && snap.census.action}, EditableText ${snap && snap.census.editableText})`);
      const listed = await cli('vsst_aaaa', 'list');
      ok(listed.code === 0 && listed.out.includes(`* ${handle}`) && /held by me/.test(listed.out) && /only windows VibeSpace started/.test(listed.out), 'list marks the window as held by me and states the scope');
      const countBtn = snap && snap.nodes.find((n) => n.role === 'push button' || n.role === 'button') && snap.nodes.find((n) => (n.role === 'push button' || n.role === 'button') && n.name === 'Count');
      const countLabel = () => snap && snap.nodes.find((n) => n.role === 'label' && /^count \d+/.test(n.name || ''));
      ok(!!countBtn && countBtn.actions && countBtn.actions.length > 0 && countLabel() && countLabel().name === 'count 0', 'the Count button (with Action) and the count label are in the snapshot');
      if (countBtn) {
        const clicked = await cli('vsst_aaaa', 'click', handle, countBtn.ref);
        const again = await cli('vsst_aaaa', 'snapshot', handle, '--json');
        try { snap = JSON.parse(again.out); } catch { }
        ok(clicked.code === 0 && /click/.test(clicked.out) && countLabel() && countLabel().name === 'count 1', `click @ref through the CLI changed the app's state, read back from ITS OWN tree (${countLabel() && countLabel().name})`);
      }
      // the second session is refused by the lease — attach and act alike, typed, exit 1
      const at2 = await cli('vsst_bbbb', 'attach', handle);
      ok(at2.code === 1 && /window_leased/.test(at2.err) && /alpha/.test(at2.err) && /one holder per window/.test(at2.err), 'a SECOND session\'s attach is refused window_leased naming the holder (exit 1)');
      const act2 = await cli('vsst_bbbb', 'click', handle, countBtn ? countBtn.ref : '@e1');
      ok(act2.code === 1 && /not_attached/.test(act2.err), 'and its click is refused not_attached — two agents never fight one pointer');
      const snap2 = await cli('vsst_bbbb', 'snapshot', handle);
      ok(snap2.code === 1 && /not_attached/.test(snap2.err), 'nor may it read the tree');
      // the user's live view on the REAL bridge: a viewer in Watch sends 'a' — the key witness stays "key none"
      const WebSocket = require('ws');
      const keyLabel = async () => { const r = await cli('vsst_aaaa', 'snapshot', handle, '--json'); try { const j = JSON.parse(r.out); const n = j.nodes.find((x) => x.role === 'label' && /^key /.test(x.name || '')); return n ? n.name : null; } catch { return null; } };
      const viewerId = 'wl-user1';
      const rfb = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/api/desktop/${handle}/stream?viewer=${viewerId}`);
        let buf = Buffer.alloc(0), phase = 'version';
        const st = { ws, ready: false };
        ws.on('error', reject);
        ws.on('message', (m) => {
          buf = Buffer.concat([buf, Buffer.from(m)]);
          for (;;) {
            if (phase === 'version') { if (buf.length < 12) return; buf = buf.subarray(12); ws.send(Buffer.from('RFB 003.008\n')); phase = 'security'; }
            else if (phase === 'security') { if (buf.length < 1) return; const n = buf[0]; if (n === 0) { reject(new Error('server refused: ' + buf.subarray(5).toString())); return; } if (buf.length < 1 + n) return; const types = [...buf.subarray(1, 1 + n)]; buf = buf.subarray(1 + n); if (!types.includes(1)) { reject(new Error('no None security type: ' + types)); return; } ws.send(Buffer.from([1])); phase = 'result'; }
            else if (phase === 'result') { if (buf.length < 4) return; const r = buf.readUInt32BE(0); buf = buf.subarray(4); if (r !== 0) { reject(new Error('security result ' + r)); return; } ws.send(Buffer.from([1])); phase = 'serverinit'; }
            else if (phase === 'serverinit') { if (buf.length < 24) return; const nl = buf.readUInt32BE(20); if (buf.length < 24 + nl) return; buf = buf.subarray(24 + nl); phase = 'done'; st.ready = true; resolve(st); }
            else { buf = Buffer.alloc(0); return; }
          }
        });
        setTimeout(() => reject(new Error('RFB handshake did not finish in 8 s')), 8000);
      }).catch((e) => ({ error: e.message }));
      ok(rfb && !rfb.error, `a viewer completes the RFB handshake with the keeper's x11vnc through the bridge${rfb && rfb.error ? ' — ' + rfb.error : ''}`);
      if (rfb && !rfb.error) {
        const pressA = () => { rfb.ws.send(Buffer.concat([PTR(60, 60), KEY_DOWN, KEY_UP])); };
        ok((await keyLabel()) === 'key none', 'before anything: the fixture\'s key witness reads "key none"');
        pressA(); await sleep(600);
        ok((await keyLabel()) === 'key none', 'in Watch the viewer\'s pointer move + KeyEvent \'a\' are dropped by the bridge: the witness still reads "key none" (the agent is driving)');
        // the user takes over through the desktop route (the live view's Take over)
        const lease0 = await api('GET', `/api/desktop/apps/${handle}/lease`);
        ok(lease0.status === 200 && lease0.j.lease && lease0.j.lease.sessionId === 's1' && lease0.j.lease.input === 'agent' && lease0.j.origin === 'vibespace', 'GET …/lease says the agent holds it (input agent, origin vibespace)');
        const tk = await api('POST', `/api/desktop/apps/${handle}/takeover`, { viewerId });
        ok(tk.status === 200 && tk.j.ok && tk.j.lease.input === 'user' && /^tk-[0-9a-f]{16}$/.test(tk.j.lease.takenBy.tag) && !JSON.stringify(tk.j.lease).includes(viewerId), 'POST …/takeover flips the lease to the user and answers the taker its OPAQUE tag — the viewer id is not in the lease');
        ok(bcasts.some((m) => m.type === 'window-leases-updated' && m.leases.some((l) => l.handle === handle && l.input === 'user')), 'window-leases-updated was broadcast with input user');
        ok(!bcasts.some((m) => m.type === 'window-leases-updated' && JSON.stringify(m).includes(viewerId)) && bcasts.some((m) => m.type === 'window-leases-updated' && m.leases.some((l) => l.handle === handle && l.takenBy && /^tk-/.test(l.takenBy.tag))), 'the broadcast names the takeover by its tag and carries the viewer id (the socket\'s secret) NOWHERE — another client cannot drive or hand back with it');
        const pausedClick = await cli('vsst_aaaa', 'click', handle, countBtn ? countBtn.ref : '@e1');
        ok(pausedClick.code === 1 && /window_paused/.test(pausedClick.err) && /do NOT retry/.test(pausedClick.err), 'the agent\'s click is refused window_paused (exit 1, "do NOT retry") — nothing was injected');
        const pausedKey = await cli('vsst_aaaa', 'key', handle, 'ctrl+s');
        ok(pausedKey.code === 1 && /window_paused/.test(pausedKey.err), 'a chord too: §6.6 — a takeover stops injection of every kind');
        ok((await api('POST', `/api/desktop/apps/${handle}/takeover`, { viewerId: 'wl-other' })).j.code === 'held', 'another viewer is refused held (409) while this one drives');
        pressA(); await sleep(800);
        const afterKey = await (async () => { const r = await fetch(API + '/api/agent/window/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_aaaa' }, body: JSON.stringify({ handle }) }); return r.status; })();
        ok(afterKey === 409, 'the agent cannot even snapshot while the user drives (409 window_paused)');
        const hb = await api('POST', `/api/desktop/apps/${handle}/handback`, { viewerId });
        ok(hb.status === 200 && hb.j.ok && hb.j.cause === 'explicit' && hb.j.byHolder === true && hb.j.lease.input === 'agent', 'POST …/handback returns it to the agent (explicit, by the holder)');
        ok((await keyLabel()) === 'key a', 'the \'a\' the user sent WHILE driving landed: the witness reads "key a" (their input relayed only while they held the window)');
        await sleep(50);
        ok(delivered.length === 1 && delivered[0].cid === 'conv-1' && delivered[0].opts.spendReason === 'browser-handback' && /the "vs window fixture" window back to you/.test(delivered[0].text) && delivered[0].text.includes(`vibespace-window snapshot ${handle}`), 'the explicit handback was announced into the holder\'s conversation through the ONE ladder, with the window text');
        const snapHb = await cli('vsst_aaaa', 'snapshot', handle, '--json');
        let btn2 = null; try { snap = JSON.parse(snapHb.out); btn2 = snap.nodes.find((n) => (n.role === 'push button' || n.role === 'button') && n.name === 'Count'); } catch { }
        const afterHb = btn2 ? await cli('vsst_aaaa', 'click', handle, btn2.ref) : { code: -1, err: 'no Count button after the handback snapshot' };
        const snapHb2 = await cli('vsst_aaaa', 'snapshot', handle, '--json');
        try { snap = JSON.parse(snapHb2.out); } catch { }
        ok(snapHb.code === 0 && afterHb.code === 0 && countLabel() && countLabel().name === 'count 2', `after the handback the agent snapshots and clicks again (${countLabel() && countLabel().name}) — the window is theirs once more`);
        const w = await cli('vsst_aaaa', 'watch', handle);
        ok(w.code === 0 && /window-live/.test(w.out) && /origin vibespace/.test(w.out) && /Take over/.test(w.out), 'watch names the window-live form, the origin and the three moves');
        rfb.ws.close();
      }
      // a RESTART: a new engine over the same data dir + keeper still holds the lease; the CLI snapshots without re-attaching
      const engine2 = ENGINE.create({ keeper, dataDir, env: () => ({ ...base }), activeSessions: sessions, log: { log() { }, warn() { } } });
      const boot = engine2.boot();
      ok(boot.leases === 1 && engine2.leaseOf(handle).sessionId === 's1' && engine2.leaseOf(handle).input === 'agent', 'a new engine over the same data dir (a restart) boots with the lease kept and the input side fresh');
      AROUTES.setup({ engine: engine2 });
      const snapAfter = await cli('vsst_aaaa', 'snapshot', handle, '--json');
      ok(snapAfter.code === 0 && JSON.parse(snapAfter.out).nodes.length > 5, 'after the restart the CLI snapshots without re-attaching (the persisted lease)');
      const at2b = await cli('vsst_bbbb', 'attach', handle);
      ok(at2b.code === 1 && /window_leased/.test(at2b.err), 'and the second session is still refused');
      const audit = fs.readFileSync(engine2.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      ok(audit.some((l) => l.verb === 'takeover' && l.by === 'user' && l.viewer === 'wl-user1' && l.origin === 'vibespace') && audit.some((l) => l.verb === 'handback' && l.cause === 'explicit' && l.origin === 'vibespace') && audit.some((l) => l.verb === 'click' && l.by === 'node' && l.node && l.node.action) && !audit.some((l) => 'text' in l), 'the audit carries the takeover (viewer) and handback (cause) lines with origin, the node click with its action, and never typed text');
      engine2.shutdown();
      const det = await cli('vsst_aaaa', 'detach', handle);
      ok(det.code === 0 && /detached/.test(det.out), 'detach through the CLI');
      await keeper.stop(handle);
    }
    await new Promise((r) => srv.close(r));
    wired.shutdown(); announcer.shutdown(); keeper.shutdown();
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
cleanup();
process.exit(fail ? 1 : 0);

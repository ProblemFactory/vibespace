#!/usr/bin/env node
// AGENT BROWSER P6 — HARD MEDIATION (docs/design-agent-browser-v2.md §6.2 /
// §6.5 / D6; the §10 P6 row). Heavy tier since B-f4cb (10 s — THE TIER RULE in ci.mjs).
//
//   ① the §6.2 SHARING verdict (PURE, src/browser-profiles.js): `owner` always,
//      `instance` only where a mediating proxy exists AND on this machine —
//      refused BY NAME otherwise; `validateProfileInput` threads it; the
//      legacy record is never mediated;
//   ② the CDP MEDIATION RULES (PURE, src/browser-mediation.js) over literal
//      messages: target scoping (attach / activate / close / getTargetInfo
//      refused out of scope; getTargets FILTERED), the session gate, the
//      whole-browser acts refused outright, the `browser_interrupted` refusal of
//      Input.* + the navigation family + script evaluation while the user drives
//      (reads still answer — the owner's ruling of 2026-09-27), the scope GROWING from replies and events
//      (createTarget / attachToTarget / a tab a scoped page opened / an
//      auto-attached child / an owned context) and SHRINKING (destroyed /
//      detached / disposed), the measured Chrome ordering (targetCreated BEFORE
//      the createTarget reply ⇒ replayed), the refusal shape, the path parser,
//      the url/env composition (no profile dir, a per-session namespace, an
//      explicit idle), the grant view carrying no secret;
//   ③ the REAL proxy (src/server/cdp-mediator.js) over a FAKE CDP upstream on
//      loopback: two grants on one browser — the second cannot see, attach,
//      activate or close the first's tab through its url; /json/version and
//      /json/list re-pointed and filtered; an unknown token 404 on every path;
//      a page endpoint out of scope 403; the paused reader read LIVE per
//      message; revoke closes 1008 AND closes the lease's tabs upstream;
//      repoint closes 1012 / null answers 503; a raw endpoint never in any
//      answer or view;
//   ③b a client socket PARKED while its upstream opens: a reset is no uncaught
//      error (the hub's exit — the desktop bridge's verify r2 F1, same shape),
//      a client gone before the upstream opened closes that upstream (CONTROL:
//      the pre-fix copy through scripts/mutant-copy.mjs).
//   ③c (verify r3 M3) a grant that MOVES while its client is parked on the
//      upstream open: revoked ⇒ 503 (never 101), no upstream left open; re-
//      pointed ⇒ 503, then the same url reaches the NEW browser; shut down ⇒
//      503, no uncaught error — each fix layer alone refuses, and the pre-fix
//      copy (both removed) upgrades the client (CONTROLS via mutant-copy).
//   ⑥ (verify S2 r4) THE CENSUS: src/cdp-census.js has ONE row per method of the
//      pinned /json/protocol (scripts/fixtures/cdp-protocol-<chrome>/), every row
//      obeys its class (input / view / page-mutation refused while paused, lease-wide
//      — the owner's ruling of 2026-09-27 retired the r4 switch, a passed `fenceScripts`
//      changes nothing; read / session / harmless never; refused always), an unknown
//      method is refused BY NAME while paused; CONTROLS: a row demoted, the unknown
//      rule dropped, the old D6 open script door (mutant-copy).
//   ⑦ (the owner's ruling, 2026-09-27 — "直接打断所有脚本和agent操作") THE TAKEOVER
//      INTERRUPTS: the PURE plan (what is aborted, which sessions get a
//      Runtime.terminateExecution); the REAL keeper + the REAL proxy over the fake
//      upstream — a Runtime.evaluate and an Input.insertText the agent has in flight
//      when the user takes over are answered browser_interrupted within 50 ms, a read
//      in flight is left to finish, terminateExecution reaches the evaluate's session,
//      the browser's late answer is swallowed, a createTarget cut mid-flight still
//      joins the scope (the revoke closes it), a new script call while the user drives
//      is refused and a read answers, the takeover event carries the interruption;
//      the retired `browser.fenceScriptsWhileDriven` stored as false is IGNORED and said
//      once; CONTROL: a mediator copy whose interrupt is the old pause (nothing in
//      flight is touched) leaves the call waiting past 50 ms.
// The real-chrome exit proof is test-browser-mediation-chrome (heavy).
// cdp-protocol-under-test — every 'Page.navigate' here is a CDP message judged by
// the proxy, never a navigation of VibeSpace's own page (§47's declared exemption).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import net from 'node:net';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const M = require('../src/browser-mediation.js');
const MED = require('../src/server/cdp-mediator.js');
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 3000, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const TOK = 'a'.repeat(32);

// ═══ ① the sharing verdict ═══════════════════════════════════════════════════
console.log('— ① sharing: owner always, instance only where the proxy exists and on this machine (PURE)');
{
  ok(B.sharingVerdict({}).ok && B.sharingVerdict({}).value === 'owner' && B.sharingVerdict({ sharing: 'owner', mediation: false }).value === 'owner', 'owner is the default and never needs the proxy');
  const no = B.sharingVerdict({ sharing: 'instance', mediation: false });
  ok(!no.ok && no.code === 'sharing_refused' && no.why === 'mediation_unavailable' && /D6/.test(no.error) && /no mediating CDP proxy/.test(no.error), 'instance without a proxy: refused with D6\'s sentence naming the missing proxy (the pre-P6 world)');
  const yes = B.sharingVerdict({ sharing: 'instance', mediation: true });
  ok(yes.ok && yes.value === 'instance', 'instance with a proxy: a value');
  const host = B.sharingVerdict({ sharing: 'instance', mediation: true, host: 'lab-1' });
  ok(!host.ok && host.why === 'host' && /lab-1/.test(host.error) && /keep "owner"/.test(host.error), 'instance on a paired machine: refused BY NAME (the proxy serves this machine), never a silent downgrade');
  const bad = B.sharingVerdict({ sharing: 'everyone', mediation: true });
  ok(!bad.ok && bad.why === 'unknown' && /owner, instance/.test(bad.error), 'an unknown value names the two');
  const v0 = B.validateProfileInput({ label: 'Team', sharing: 'instance' });
  ok(!v0.ok && v0.code === 'sharing_refused' && v0.why === 'mediation_unavailable', 'validateProfileInput without `mediation` refuses instance exactly as before P6 (the default is the pre-P6 world)');
  const v1 = B.validateProfileInput({ label: 'Team', sharing: 'instance' }, { mediation: true });
  ok(v1.ok && v1.value.sharing === 'instance', 'with `mediation:true` the validator accepts instance');
  ok(B.validateProfileInput({ label: 'Solo' }, { mediation: true }).value.sharing === 'owner', 'the proxy being available changes no default: owner stays the default');
  const rec = B.newProfileRecord({ id: 'bp-00000001', label: 'Team', dir: '/p', sharing: 'instance', now: 1 });
  ok(rec.sharing === 'instance' && B.isMediatedProfile(rec), 'the record carries instance and is MEDIATED');
  ok(!B.isMediatedProfile(B.newProfileRecord({ id: 'bp-00000002', label: 'Solo', dir: '/p', now: 1 })), 'an owner profile is not mediated');
  const legacy = B.newProfileRecord({ id: 'bp-00000003', label: 'Shared (legacy)', dir: '/p', legacy: true, now: 1 });
  ok(legacy.sharing === 'instance' && !B.isMediatedProfile(legacy), 'the legacy record keeps sharing:instance for admission but is NOT mediated (cooperative, pre-P6, labelled legacy)');
  ok(B.newProfileRecord({ id: 'bp-00000004', label: 'X', dir: '/p', sharing: 'bogus', now: 1 }).sharing === 'owner', 'a record never carries a third value');
}

// ═══ ② the CDP rules over literal messages ══════════════════════════════════
console.log('— ② the mediation rules: scope, session gate, paused, whole-browser acts, growth and shrinkage (PURE)');
{
  const sc = M.newScope({ targets: ['T-A'] });
  const j = (m, o) => M.judge(m, sc, o);
  const code = (v) => (v.kind === 'refuse' ? M.refusalCodeOf(v.reply) : v.kind);
  ok(code(j({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'T-B' } })) === 'target_out_of_scope', 'attachToTarget on another lease\'s tab: target_out_of_scope');
  ok(code(j({ id: 2, method: 'Target.activateTarget', params: { targetId: 'T-B' } })) === 'target_out_of_scope' && code(j({ id: 3, method: 'Target.closeTarget', params: { targetId: 'T-B' } })) === 'target_out_of_scope' && code(j({ id: 4, method: 'Target.getTargetInfo', params: { targetId: 'T-B' } })) === 'target_out_of_scope' && code(j({ id: 5, method: 'Browser.getWindowForTarget', params: { targetId: 'T-B' } })) === 'target_out_of_scope', 'activate / close / getTargetInfo / getWindowForTarget too');
  ok(code(j({ id: 6, method: 'Target.attachToTarget', params: { targetId: 'T-A', flatten: true } })) === 'forward', 'the lease\'s own tab attaches');
  ok(code(j({ id: 7, method: 'Page.navigate', params: { url: 'https://x' }, sessionId: 'S-foreign' })) === 'session_out_of_scope', 'a message on a CDP session the proxy never handed out is refused');
  ok(code(j({ id: 8, method: 'Browser.close' })) === 'method_refused' && code(j({ id: 9, method: 'Browser.crash' })) === 'method_refused' && code(j({ id: 10, method: 'Target.exposeDevToolsProtocol', params: { targetId: 'T-A' } })) === 'method_refused' && code(j({ id: 11, method: 'Target.sendMessageToTarget', params: {} })) === 'method_refused', 'Browser.close / crash / exposeDevToolsProtocol / sendMessageToTarget are refused outright — a shared browser is nobody\'s to kill through a session url');
  // the scope grows from an attach reply
  const at = M.admitReply({ id: 6, result: { sessionId: 'S-A' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-A' } }, sc);
  ok(at.reply.result.sessionId === 'S-A' && at.emit.length === 0 && sc.sessions.get('S-A') === 'T-A', 'the attach reply admits the session (→ its target)');
  ok(code(j({ id: 12, method: 'Page.navigate', params: { url: 'https://x' }, sessionId: 'S-A' })) === 'forward' && code(j({ id: 13, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 1, y: 1 }, sessionId: 'S-A' })) === 'forward', 'while the agent holds input: navigate and input pass on an owned session');
  const P = { paused: true };
  ok(code(j({ id: 14, method: 'Page.navigate', params: { url: 'https://x' }, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 15, method: 'Input.dispatchMouseEvent', params: {}, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 16, method: 'Input.insertText', params: { text: 'x' }, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 17, method: 'Page.reload', params: {}, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 18, method: 'DOM.setFileInputFiles', params: {}, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 19, method: 'Target.createTarget', params: { url: 'about:blank' } }, P)) === 'browser_interrupted', 'while the USER drives: every Input.*, the navigation family, a file upload and a new tab are browser_interrupted');
  ok(code(j({ id: 20, method: 'Runtime.evaluate', params: { expression: 'document.title' }, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 22, method: 'Runtime.callFunctionOn', params: {}, sessionId: 'S-A' }, P)) === 'browser_interrupted' && code(j({ id: 21, method: 'Page.captureScreenshot', params: {}, sessionId: 'S-A' }, P)) === 'forward' && code(j({ id: 23, method: 'DOM.getDocument', params: {}, sessionId: 'S-A' }, P)) === 'forward', 'the owner\'s ruling (2026-09-27): script evaluation (Runtime.evaluate / callFunctionOn) is refused while the user drives too — reads (captureScreenshot / DOM.getDocument) still answer');
  const pr = j({ id: 14, method: 'Page.navigate', params: {}, sessionId: 'S-A' }, P).reply;
  ok(pr.id === 14 && pr.sessionId === 'S-A' && pr.error.code === M.CDP_REFUSAL_CODE && /^browser_interrupted: The user took over this browser — your operation was interrupted \(Page\.navigate\)\. Wait for the handback, then run it again\.$/.test(pr.error.message), 'a refusal is a CDP error by id on the same session: -32000, the typed code as the message prefix, the takeover, the interruption and the way out named (THE sentence, src/browser-interrupt.js)', pr.error.message);
  ok(M.judge({ method: 'Target.getTargets' }, sc).kind === 'drop' && M.judge('x', sc).kind === 'drop' && M.refusalCodeOf(M.judge({ id: 1 }, sc).reply) === 'bad_message', 'no id ⇒ dropped silently; no method with an id ⇒ bad_message');
  // createTarget: the measured Chrome ordering (targetCreated BEFORE the reply)
  const sc2 = M.newScope({});
  ok(M.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-N', type: 'page', url: 'about:blank' } } }, sc2) === null && sc2.recent.has('T-N'), 'a targetCreated for a tab not (yet) in scope is withheld and REMEMBERED');
  ok(M.judge({ id: 30, method: 'Target.createTarget', params: { url: 'about:blank' } }, sc2).kind === 'forward', 'createTarget passes');
  const cr = M.admitReply({ id: 30, result: { targetId: 'T-N' } }, { method: 'Target.createTarget', params: { url: 'about:blank' } }, sc2);
  ok(sc2.targets.has('T-N') && cr.emit.length === 1 && cr.emit[0].method === 'Target.targetCreated' && cr.emit[0].params.targetInfo.targetId === 'T-N' && !sc2.recent.has('T-N'), 'the createTarget reply admits the tab AND replays the withheld targetCreated before it (0.32.0\'s target registry needs it; measured)');
  ok(M.admitReply({ id: 31, result: { targetId: 'T-M' } }, { method: 'Target.createTarget', params: {} }, sc2).emit.length === 0 && sc2.targets.has('T-M'), 'a createTarget whose announcement has not come yet replays nothing (the real event follows, in scope)');
  ok(M.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-M', type: 'page' } } }, sc2) !== null, '…and that later announcement is forwarded');
  // growth by opener / context / auto-attach
  ok(M.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-POP', type: 'page', openerId: 'T-N' } } }, sc2) !== null && sc2.targets.has('T-POP'), 'a tab OPENED BY a scoped page (window.open) joins the scope');
  ok(M.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-X', type: 'page', openerId: 'T-ELSE' } } }, sc2) === null && !sc2.targets.has('T-X'), 'a tab opened by somebody else\'s page does not');
  ok(M.judge({ id: 32, method: 'Target.createTarget', params: { url: 'about:blank', browserContextId: 'C-foreign' } }, sc2).kind === 'refuse' && M.refusalCodeOf(M.judge({ id: 32, method: 'Target.createTarget', params: { url: 'about:blank', browserContextId: 'C-foreign' } }, sc2).reply) === 'context_out_of_scope', 'creating into a context this lease did not make: context_out_of_scope');
  M.admitReply({ id: 33, result: { browserContextId: 'C-1' } }, { method: 'Target.createBrowserContext', params: {} }, sc2);
  ok(sc2.contexts.has('C-1') && M.judge({ id: 34, method: 'Target.createTarget', params: { url: 'about:blank', browserContextId: 'C-1' } }, sc2).kind === 'forward' && M.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'T-C1', type: 'page', browserContextId: 'C-1' } } }, sc2) !== null, 'a context this lease created admits creation into it and the tabs born in it');
  ok(M.admitReply({ id: 35, result: { browserContextIds: ['C-1', 'C-other'] } }, { method: 'Target.getBrowserContexts', params: {} }, sc2).reply.result.browserContextIds.join() === 'C-1', 'getBrowserContexts lists only the lease\'s contexts');
  ok(M.refusalCodeOf(M.judge({ id: 36, method: 'Target.disposeBrowserContext', params: { browserContextId: 'C-other' } }, sc2).reply) === 'context_out_of_scope', 'disposing another context is refused');
  M.admitReply({ id: 37, result: { sessionId: 'S-N' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-N' } }, sc2);
  ok(M.filterEvent({ method: 'Target.attachedToTarget', sessionId: 'S-N', params: { sessionId: 'S-IFRAME', targetInfo: { targetId: 'T-IFRAME', type: 'iframe' } } }, sc2) !== null && sc2.sessions.get('S-IFRAME') === 'T-IFRAME' && sc2.targets.has('T-IFRAME'), 'an auto-attached child under an owned session (iframe/worker) joins with its session');
  ok(M.filterEvent({ method: 'Target.attachedToTarget', sessionId: 'S-ELSE', params: { sessionId: 'S-Z', targetInfo: { targetId: 'T-Z', type: 'page' } } }, sc2) === null && !sc2.sessions.has('S-Z'), 'an attach announced under somebody else\'s session is withheld');
  // getTargets filtered (+ admits the admissible)
  const gt = M.admitReply({ id: 38, result: { targetInfos: [{ targetId: 'T-N', type: 'page' }, { targetId: 'T-ELSE', type: 'page' }, { targetId: 'T-POP2', type: 'page', openerId: 'T-N' }] } }, { method: 'Target.getTargets', params: {} }, sc2);
  ok(gt.reply.result.targetInfos.map((t) => t.targetId).sort().join() === 'T-N,T-POP2' && sc2.targets.has('T-POP2'), 'getTargets lists only the scope — and a tab opened by a scoped page seen there for the first time joins');
  // events gated by session; browser-level events pass
  ok(M.filterEvent({ method: 'Page.frameNavigated', sessionId: 'S-N', params: {} }, sc2) !== null && M.filterEvent({ method: 'Page.frameNavigated', sessionId: 'S-ELSE', params: {} }, sc2) === null && M.filterEvent({ method: 'Browser.downloadProgress', params: {} }, sc2) !== null, 'a session event reaches the lease only on its own session; a browser-level event passes');
  // shrinkage
  ok(M.filterEvent({ method: 'Target.targetDestroyed', params: { targetId: 'T-ELSE' } }, sc2) === null, 'another tab\'s destruction is not announced');
  ok(M.filterEvent({ method: 'Target.targetDestroyed', params: { targetId: 'T-N' } }, sc2) !== null && !sc2.targets.has('T-N') && !sc2.sessions.has('S-N'), 'the lease\'s own tab destroyed: announced, target AND its session leave the scope');
  ok(M.filterEvent({ method: 'Target.detachedFromTarget', params: { sessionId: 'S-IFRAME' } }, sc2) !== null && !sc2.sessions.has('S-IFRAME') && M.filterEvent({ method: 'Target.detachedFromTarget', params: { sessionId: 'S-nobody' } }, sc2) === null, 'detachedFromTarget removes an owned session; a foreign one is withheld');
  M.admitReply({ id: 39, result: { success: true } }, { method: 'Target.closeTarget', params: { targetId: 'T-POP' } }, sc2);
  ok(!sc2.targets.has('T-POP'), 'a closeTarget reply removes the tab');
  ok(M.admitReply({ id: 40, result: { sessionId: 'S-B' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-ELSE' } }, sc2).reply.result.sessionId === 'S-B' && !sc2.sessions.has('S-B'), 'an attach reply for a target NOT in scope admits no session (the judge refused it before; belt and braces)');
  // recent is bounded
  const sc3 = M.newScope({});
  for (let i = 0; i < M.RECENT_MAX + 10; i++) M.filterEvent({ method: 'Target.targetCreated', params: { targetInfo: { targetId: 'R' + i, type: 'page' } } }, sc3);
  ok(sc3.recent.size === M.RECENT_MAX && !sc3.recent.has('R0') && sc3.recent.has('R' + (M.RECENT_MAX + 9)), `the withheld-announcement memory is bounded (${M.RECENT_MAX}, oldest out)`);
  // the path / url / env / view
  ok(M.parseMediatedPath(`/m/${TOK}/json/version`).kind === 'version' && M.parseMediatedPath(`/m/${TOK}/json/list`).kind === 'list' && M.parseMediatedPath(`/m/${TOK}/json`).kind === 'list' && M.parseMediatedPath(`/m/${TOK}/devtools/browser`).kind === 'browser' && M.parseMediatedPath(`/m/${TOK}/devtools/page/ABC-1?x=1`).targetId === 'ABC-1', 'the five paths parse');
  ok(M.parseMediatedPath('/json/version') === null && M.parseMediatedPath(`/m/${TOK.slice(0, 31)}/json/version`) === null && M.parseMediatedPath(`/m/${TOK}/devtools/browser/extra`) === null && M.parseMediatedPath(`/m/${TOK}/other`) === null, 'a tokenless path, a short token, an unknown tail: null');
  ok(M.mediatedBrowserUrl({ port: 4321, token: TOK }) === `ws://127.0.0.1:4321/m/${TOK}/devtools/browser` && M.mediatedBrowserUrl({ port: 0, token: TOK }) === null && M.mediatedBrowserUrl({ port: 80, token: 'short' }) === null, 'the ws url form (agent-browser connects a ws url directly; an http one has its path dropped — measured 0.32.0)');
  const va = M.versionAnswer({ Browser: 'Chrome/153', 'Protocol-Version': '1.3', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/raw' }, { port: 4321, token: TOK });
  ok(va.Browser === 'Chrome/153' && va.webSocketDebuggerUrl === M.mediatedBrowserUrl({ port: 4321, token: TOK }) && !JSON.stringify(va).includes('9222'), '/json/version keeps the browser facts and re-points the endpoint — the raw one never appears');
  const la = M.listAnswer([{ id: 'T-N', type: 'page', url: 'u', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/T-N', devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/T-N' }, { id: 'T-ELSE', type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/T-ELSE' }], M.newScope({ targets: ['T-N'] }), { port: 4321, token: TOK });
  ok(la.length === 1 && la[0].id === 'T-N' && la[0].webSocketDebuggerUrl === `ws://127.0.0.1:4321/m/${TOK}/devtools/page/T-N` && !('devtoolsFrontendUrl' in la[0]) && !JSON.stringify(la).includes('9222'), '/json/list: the scope only, page endpoints re-pointed, the frontend url (raw endpoint inside) dropped');
  const env = M.mediatedEnvFor({ browserKey: 'bk-0000000b', profileId: 'bp-00000001', url: M.mediatedBrowserUrl({ port: 4321, token: TOK }), idleMs: 600000 });
  ok(env.includes('AGENT_BROWSER_SESSION=vs-bk-0000000b') && env.includes('AGENT_BROWSER_NAMESPACE=vs-bp-00000001-bk-0000000b') && env.includes(`AGENT_BROWSER_CDP=ws://127.0.0.1:4321/m/${TOK}/devtools/browser`) && env.includes('AGENT_BROWSER_IDLE_TIMEOUT_MS=600000') && !env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')), 'a mediated attachment: its session, a PER-SESSION namespace (its own daemon over its own url), the scoped url, an EXPLICIT idle — and no profile directory');
  ok(M.mediatedEnvFor({ browserKey: 'bk-0000000b', profileId: 'bp-00000001', url: 'ws://127.0.0.1:9222/devtools/browser/raw' }).length === 0 && M.mediatedEnvFor({ browserKey: 'bk-0000000b', profileId: 'bp-00000001', url: `ws://10.0.0.1:4321/m/${TOK}/devtools/browser` }).length === 0, 'a raw or non-loopback url composes NO env (never handed out by mistake)');
  ok(B.isCdpPair(env[2]), 'the CDP pair is the one `use --print` withholds (§5.1), mediated or not');
  const gv = M.grantView({ token: TOK, profileId: 'bp-00000001', browserKey: 'bk-0000000b', upstream: 'ws://127.0.0.1:9222/devtools/browser/raw', scope: M.newScope({ targets: ['T-N'] }), conns: new Set([1]), createdAt: 5, lastUsedAt: 6 });
  ok(gv.targets === 1 && gv.connections === 1 && gv.upstreamKnown === true && !JSON.stringify(gv).includes(TOK) && !JSON.stringify(gv).includes('9222'), 'a grant\'s view carries counts, never the token or the upstream');
  ok(/mediated CDP url/.test(M.mediationSentence({ profileLabel: 'Team', others: 2 })) && /2 other sessions/.test(M.mediationSentence({ profileLabel: 'Team', others: 2 })), 'the one-line sentence names the confinement and the others');
  // 2026-09-21 (the verifier's finding): the sentence promised "input and navigation are refused" while Runtime.evaluate passes — the words now match the fence
  const sent = M.mediationSentence({ profileLabel: 'Team' });
  ok(/everything but reads is refused \(browser_interrupted\)/.test(sent) && /interrupted — wait for the handback, then run it again/.test(sent) && !/script evaluation and reads are not/.test(sent) && M.mediationSentence({ profileLabel: 'Team', fenceScripts: false }) === sent, 'the sentence names the fence\'s REAL scope (the owner\'s ruling): everything but reads refused, what was running interrupted, the way out — the retired switch changes nothing');
  ok(M.isPausedMethod('Runtime.evaluate') && M.isPausedMethod('Runtime.callFunctionOn') && !M.isPausedMethod('DOM.getDocument') && M.isPausedMethod('Page.navigate') && M.isPausedMethod('Input.insertText'), '…and the table agrees: evaluate / callFunctionOn / navigate / Input.* are refused while paused, DOM reads are not');
  { const REPO_DIR = new URL('..', import.meta.url).pathname; const wrapperTxt = fs.readFileSync(path.join(REPO_DIR, 'data/bin/vibespace-browser'), 'utf8'); const manual = fs.readFileSync(path.join(REPO_DIR, 'docs/agent/browser-manual.md'), 'utf8');
    ok(/Taking over INTERRUPTS you/.test(wrapperTxt) && /browser_interrupted/.test(wrapperTxt) && !/not script evaluation/.test(wrapperTxt) && /Taking over interrupts you/.test(manual) && /browser_interrupted/.test(manual) && !/which is NOT fenced/.test(manual) && !/fenceScriptsWhileDriven/.test(wrapperTxt + manual), 'the CLI\'s `watch` and the manual say the same: a takeover interrupts (browser_interrupted) — no surface still says scripts pass or names the retired switch'); }
}

// ═══ ②r3 (verify S2 r3, 2026-09-26): the input side's OTHER doors ═══════════
console.log('— ②r3 verify r3: Input.setIgnoreInputEvents refused on every lease (a pre-armed deaf page), DOM.focus paused, Page.bringToFront deliberately not; CONTROL = a rules copy without the entries');
{
  const REPO_R3 = path.resolve(new URL('..', import.meta.url).pathname);
  const sc = M.newScope({ targets: ['T-A'] }); M.admitReply({ id: 1, result: { sessionId: 'S-A' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-A' } }, sc);
  const code = (mod, m, o) => { const v = mod.judge(m, sc, o); return v.kind === 'refuse' ? mod.refusalCodeOf(v.reply) : v.kind; };
  const IGN = { id: 40, method: 'Input.setIgnoreInputEvents', params: { ignore: true }, sessionId: 'S-A' };
  const r0 = M.judge(IGN, sc, {});
  ok(code(M, IGN, {}) === 'method_refused' && code(M, IGN, { paused: true }) === 'method_refused' && /ignore every input/.test(r0.reply.error.message) && /every lease/.test(r0.reply.error.message), '②r3 Input.setIgnoreInputEvents is refused on every lease, paused or not, and says why (measured on 0.38.1 + Chrome: armed before a takeover, Chrome answered ok to every one of the user\'s credited dispatches while the page received none)', r0.reply.error.message);
  ok(code(M, { id: 41, method: 'DOM.focus', params: { nodeId: 3 }, sessionId: 'S-A' }, { paused: true }) === 'browser_interrupted' && code(M, { id: 42, method: 'DOM.focus', params: { nodeId: 3 }, sessionId: 'S-A' }, {}) === 'forward', '②r3 DOM.focus is refused (browser_interrupted) while the user drives (measured: it moved their next key into another field) and passes otherwise');
  ok(code(M, { id: 43, method: 'Target.activateTarget', params: { targetId: 'T-A' } }, { paused: true }) === 'browser_interrupted' && code(M, { id: 44, method: 'Target.closeTarget', params: { targetId: 'T-A' } }, { paused: true }) === 'browser_interrupted' && code(M, { id: 45, method: 'Page.navigateToHistoryEntry', params: { entryId: 1 }, sessionId: 'S-A' }, { paused: true }) === 'browser_interrupted', '②r3 activateTarget / closeTarget / navigateToHistoryEntry on the lease\'s OWN tab are refused while the user drives');
  ok(code(M, { id: 46, method: 'Page.bringToFront', params: {}, sessionId: 'S-A' }, { paused: true }) === 'forward' && !M.PAUSED_METHODS.has('Page.bringToFront'), '②r3 Page.bringToFront is deliberately NOT fenced (measured r2 + r3 on 0.38.1: refusing it does not stop the daemon\'s `tab <n>` and leaves the switched-to tab HIDDEN — no frames, mouse input never answered, the stream dead after the handback; the switch is refused at the live view\'s anchor instead — test-browser-fact ③/⑤)');
  // verify r4: the two r3 entries are ROWS of the census now (src/cdp-census.js) — the control demotes the rows and loads a
  // rules copy bound to that census copy (mutant-copy: an absolute require path in the copy's source reaches it)
  const MUT2 = mutantCopies('mediation-r3-rules', REPO_R3);
  const censusSrc = fs.readFileSync(path.join(REPO_R3, 'src/cdp-census.js'), 'utf8');
  const medSrc = fs.readFileSync(path.join(REPO_R3, 'src/browser-mediation.js'), 'utf8');
  const n1 = "setIgnoreInputEvents: { cls: 'refused', since: '2026-09-26', why:", n2 = "focus: 'input',";
  ok(censusSrc.split(n1).length === 2 && censusSrc.split(n2).length === 2 && medSrc.split("require('./cdp-census.js')").length === 2, '②r3 control setup: both r3 rows are found once in src/cdp-census.js, the rules module requires the census once');
  const demoted = MUT2.write('src/cdp-census.js', censusSrc.replace(n1, "setIgnoreInputEvents: { cls: 'harmless', since: '2026-09-26', why:").replace(n2, "focus: 'read',"), 'no-r3');
  const mut = MUT2.load('src/browser-mediation.js', medSrc.replace("require('./cdp-census.js')", `require(${JSON.stringify(demoted)})`), 'no-r3');
  ok(code(mut, IGN, {}) === 'forward' && code(mut, { id: 41, method: 'DOM.focus', params: { nodeId: 3 }, sessionId: 'S-A' }, { paused: true }) === 'forward', '②r3 CONTROL (the two rows demoted in a census copy): the deaf-page arm and DOM.focus while paused are ADMITTED — the holes the rows close');
  for (const r of copiesCensus(MUT2.files, MUT2.dir, REPO_R3, { minCopies: 2, label: '②r3 ' })) ok(r.pass, r.name, r.detail);
}

// ═══ ⑥ THE CENSUS (verify S2 r4, 2026-09-26): the paused fence is a table over the vendor's own method list ═══
console.log('— ⑥ the CDP census: every method of the pinned protocol has a row, the class rules, unknown = refused by name, the retired switch changes nothing; three patched-copy controls');
{
  const REPO6 = path.resolve(new URL('..', import.meta.url).pathname);
  const C = M.CENSUS;
  const fixtureFile = path.join(REPO6, 'scripts/fixtures', `cdp-protocol-${C.CENSUS_CHROME}`, 'protocol.json');
  ok(fs.existsSync(fixtureFile), `⑥ the protocol fixture the census names exists (Chrome ${C.CENSUS_CHROME}: scripts/fixtures/cdp-protocol-${C.CENSUS_CHROME}/protocol.json — scripts/cdp-protocol-fetch.mjs writes it)`);
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  ok(C.validate().length === 0, '⑥ the table validates: a closed class vocabulary, dated rows, the one anchor-fenced row is a paused class', C.validate().slice(0, 5).join('; '));
  const cmp = C.compare(fixture);
  const cn = C.census();
  console.log(`  (census: Chrome ${cn.chrome}, protocol ${fixture.protocolVersion}, ${fixture.domains.length} domains, ${cmp.listed} methods listed / ${cmp.rows} rows — ${Object.entries(cn.byClass).map(([k, v]) => k + ' ' + v).join(', ')})`);
  if (cmp.unclassified.length) console.error('  UNCLASSIFIED (the protocol lists these, the census does not — write their rows in src/cdp-census.js):\n    ' + cmp.unclassified.join('\n    '));
  if (cmp.stale.length) console.error('  STALE (rows naming no method of the pinned protocol):\n    ' + cmp.stale.join('\n    '));
  ok(cmp.sameSet && cmp.listed >= 600, `⑥ the census covers EVERY method the pinned protocol lists and names none it lacks (${cmp.listed} = ${cmp.rows}; ${cmp.unclassified.length} unclassified, ${cmp.stale.length} stale)`);
  ok(fixture.domains.every((d) => Array.isArray(d.commands) && d.commands.every((c) => c && typeof c.name === 'string')) && !JSON.stringify(fixture).includes('"parameters"'), '⑥ the fixture is the names-only listing (no parameter schemas — the census classes methods)');
  // the class rules over the whole table: a scope with the anchor's tab A (S-A) and another tab B (S-B), paused / not, switch on / off
  const sc = M.newScope({ targets: ['T-A', 'T-B'] });
  M.admitReply({ id: 1, result: { sessionId: 'S-A' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-A' } }, sc);
  M.admitReply({ id: 2, result: { sessionId: 'S-B' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-B' } }, sc);
  M.admitReply({ id: 3, result: { browserContextId: 'C-1' } }, { method: 'Target.createBrowserContext', params: {} }, sc);
  const paramsFor = (m) => (M.TARGET_METHODS.has(m) ? { targetId: 'T-A' } : m === 'Target.detachFromTarget' ? { sessionId: 'S-B' } : M.CONTEXT_METHODS.has(m) ? { browserContextId: 'C-1' } : {});
  const verdict = (mod, m, sid, o) => { const v = mod.judge({ id: 9, method: m, params: paramsFor(m), sessionId: sid }, sc, o); return v.kind === 'refuse' ? mod.refusalCodeOf(v.reply) + ':' + (v.why || '') : v.kind; };
  const rows = C.rows(); const name = (r) => r.domain + '.' + r.method;
  const wrong = [];
  for (const r of rows) {
    const m = name(r);
    // the retired r4 switch passed either way (a stale caller) must change NOTHING — `sw` / `swFree` are the proof
    const onA = verdict(M, m, 'S-A', { paused: true }), onB = verdict(M, m, 'S-B', { paused: true }), free = verdict(M, m, 'S-A', {}), sw = verdict(M, m, 'S-A', { paused: true, fenceScripts: false }), swFree = verdict(M, m, 'S-A', { fenceScripts: true });
    let want;
    if (r.cls === 'refused') want = ['method_refused:refused', 'method_refused:refused', 'method_refused:refused', 'method_refused:refused', 'method_refused:refused'];
    else if ((r.cls === 'input' || r.cls === 'view' || r.cls === 'page-mutation') && r.fence === 'mediator') want = [`browser_interrupted:${r.cls}`, `browser_interrupted:${r.cls}`, 'forward', `browser_interrupted:${r.cls}`, 'forward'];
    else want = ['forward', 'forward', 'forward', 'forward', 'forward'];
    const got = [onA, onB, free, sw, swFree];
    if (got.join() !== want.join()) wrong.push(`${m} [${r.cls}${r.fence === 'anchor' ? ', anchor' : ''}]: got ${got.join(' | ')} want ${want.join(' | ')}`);
  }
  const n = (cls) => rows.filter((r) => r.cls === cls).length;
  ok(wrong.length === 0, `⑥ every row obeys its class: ${n('input')} input + ${n('view')} view + ${n('page-mutation')} page-mutation refused browser_interrupted while paused — on the anchor's tab AND on the lease's other tab alike (LEASE-WIDE: the mediator cannot tell a tab from a frame under the driven tab, the CLI rung refuses every page verb while the user drives anyway, the daemon's own tab switch moves "the other tab") — and forwarded when not paused, the retired switch passed either way changing nothing; ${n('read')} read + ${n('session')} session + ${n('harmless')} harmless never refused; ${n('refused')} refused always`, wrong.slice(0, 8).join('\n    '));
  const btf = C.rowOf('Page.bringToFront');
  ok(btf && btf.cls === 'view' && btf.fence === 'anchor' && /anchor/.test(btf.why) && verdict(M, 'Page.bringToFront', 'S-A', { paused: true }) === 'forward' && rows.filter((r) => r.fence === 'anchor').length === 1, '⑥ exactly ONE row is anchor-fenced — Page.bringToFront, class view, forwarded here, refused at the live view\'s anchor (its row says why)');
  // the old lists map to rows (a control that drops one goes red on ② above)
  const P6_REFUSED = ['Browser.close', 'Browser.crash', 'Browser.crashGpuProcess', 'Target.exposeDevToolsProtocol', 'Target.setRemoteLocations', 'Target.sendMessageToTarget', 'Input.setIgnoreInputEvents'];
  const P6_PAUSED = ['Page.navigate', 'Page.reload', 'Page.navigateToHistoryEntry', 'Page.close', 'Page.stopLoading', 'Page.setDocumentContent', 'Page.handleJavaScriptDialog', 'DOM.setFileInputFiles', 'Target.createTarget', 'Target.closeTarget', 'Target.activateTarget', 'DOM.focus'];
  ok(P6_REFUSED.every((m) => C.classOf(m) === 'refused' && M.ALWAYS_REFUSED.has(m)) && P6_PAUSED.every((m) => ['input', 'view'].includes(C.classOf(m)) && M.PAUSED_METHODS.has(m)) && [...M.ALWAYS_REFUSED].every((m) => C.classOf(m) === 'refused') && rows.filter((r) => r.domain === 'Input' && r.method !== 'setIgnoreInputEvents').every((r) => r.cls === 'input'), '⑥ every pre-census refusal maps to a row (the 7 always-refused, the 12 paused-while-driven), the derived sets are views of the census, every Input.* but the deaf-page arm is class input');
  ok(P6_REFUSED.slice(0, 6).concat(P6_PAUSED.slice(0, 11)).every((m) => C.rowOf(m).since === '2026-09-21') && C.rowOf('DOM.focus').since === '2026-09-26' && C.rowOf('Input.setIgnoreInputEvents').since === '2026-09-26' && C.rowOf('Runtime.evaluate').since === C.SINCE, '⑥ rows carry their date: the P6 list 2026-09-21, the r3 doors 2026-09-26, the census itself SINCE');
  // unknown ⇒ refused by name while paused, forwarded otherwise
  const unk = M.judge({ id: 10, method: 'Page.zzzFutureMethod', params: {}, sessionId: 'S-A' }, sc, { paused: true });
  ok(unk.kind === 'refuse' && unk.why === 'unclassified' && M.refusalCodeOf(unk.reply) === 'browser_interrupted' && /Page\.zzzFutureMethod/.test(unk.reply.error.message) && /src\/cdp-census\.js/.test(unk.reply.error.message) && new RegExp(C.CENSUS_CHROME.replace(/\./g, '\\.')).test(unk.reply.error.message) && /handback/.test(unk.reply.error.message) && /took over/.test(unk.reply.error.message), '⑥ a method the census does not list (a newer Chrome\'s) is refused browser_interrupted while the user drives, NAMED with the census file and the censused Chrome, the takeover and the way out said', unk.reply && unk.reply.error.message);
  ok(M.judge({ id: 11, method: 'Zzz.newDomainMethod', params: {} }, sc, { paused: true }).why === 'unclassified' && M.judge({ id: 12, method: 'Page.zzzFutureMethod', params: {}, sessionId: 'S-A' }, sc, {}).kind === 'forward' && M.isPausedMethod('Page.zzzFutureMethod') === true && M.pausedVerdict('Page.zzzFutureMethod').why === 'unclassified', '⑥ a whole unknown domain the same; when the agent drives, an unknown method is forwarded (Chrome answers it) — the fence is about the takeover');
  // a page-mutation refusal's words (no setting named any more — the switch is retired) + the sentence
  const swv = M.judge({ id: 13, method: 'Runtime.evaluate', params: { expression: '1' }, sessionId: 'S-A' }, sc, { paused: true, fenceScripts: false });
  ok(swv.kind === 'refuse' && swv.why === 'page-mutation' && M.refusalCodeOf(swv.reply) === 'browser_interrupted' && !/fenceScriptsWhileDriven/.test(swv.reply.error.message) && /took over this browser/.test(swv.reply.error.message) && /run it again/.test(swv.reply.error.message), '⑥ a page-mutation refusal (even with the retired switch passed OFF) names the takeover and the way out — never a setting', swv.reply && swv.reply.error.message);
  ok(M.mediationSentence({ profileLabel: 'Team', fenceScripts: true }) === M.mediationSentence({ profileLabel: 'Team' }) && !/fenceScripts/.test(M.mediationSentence({ profileLabel: 'Team' })), '⑥ the one-line sentence is ONE sentence (the retired option changes nothing)');
  ok(M.grantView({ token: TOK, profileId: 'p', browserKey: 'k', scope: M.newScope({}), conns: new Set(), unclassified: new Set(['Page.zzz']) }).unclassified.join() === 'Page.zzz' && M.grantView({ token: TOK, profileId: 'p', browserKey: 'k', scope: M.newScope({}), conns: new Set() }).unclassified.length === 0, '⑥ a grant\'s view lists the methods it refused for lacking a row (the operator\'s signal)');
  // THREE CONTROLS (scripts/mutant-copy.mjs): a row demoted to read; the unknown rule dropped; the switch ignored
  const MUT6 = mutantCopies('mediation-census', REPO6);
  const censusSrc = fs.readFileSync(path.join(REPO6, 'src/cdp-census.js'), 'utf8');
  const medSrc = fs.readFileSync(path.join(REPO6, 'src/browser-mediation.js'), 'utf8');
  const rowAnchor = "dispatchKeyEvent: ['input', '2026-09-21'],", unkAnchor = "  if (!row) return { refuse: true, why: 'unclassified', row: null };\n", swAnchor = "'page-mutation': 'refuse',";
  ok(censusSrc.split(rowAnchor).length === 2 && medSrc.split(unkAnchor).length === 2 && censusSrc.split(swAnchor).length === 2, '⑥ control setup: the dispatchKeyEvent row, the unknown rule and the page-mutation rule are each spelled once');
  const bound = (censusPath) => medSrc.replace("require('./cdp-census.js')", `require(${JSON.stringify(censusPath)})`);
  const demotedCensus = MUT6.write('src/cdp-census.js', censusSrc.replace(rowAnchor, "dispatchKeyEvent: ['read', '2026-09-21'],"), 'demoted');
  const c1 = MUT6.load('src/browser-mediation.js', bound(demotedCensus), 'demoted');
  ok(verdict(c1, 'Input.dispatchKeyEvent', 'S-A', { paused: true }) === 'forward' && verdict(M, 'Input.dispatchKeyEvent', 'S-A', { paused: true }) === 'browser_interrupted:input', '⑥ CONTROL 1 (Input.dispatchKeyEvent demoted to read in a census copy): the agent\'s key is ADMITTED while the user drives — the row is the fence');
  const c2 = MUT6.load('src/browser-mediation.js', medSrc.replace(unkAnchor, "  if (!row) return { refuse: false, why: null, row: null };\n"), 'no-unknown-rule');
  ok(verdict(c2, 'Page.zzzFutureMethod', 'S-A', { paused: true }) === 'forward' && verdict(M, 'Page.zzzFutureMethod', 'S-A', { paused: true }) === 'browser_interrupted:unclassified', '⑥ CONTROL 2 (the unknown rule dropped): a method with no row is ADMITTED while the user drives — the hole a newer Chrome would open');
  // CONTROL 3 = the OLD D6 PAUSE (script evaluation open while the user drives — the r4 default): a census copy whose
  // page-mutation rule is back to 'allow' admits the agent's Runtime.evaluate / DOM edit on the page the user drives
  const d6Census = MUT6.write('src/cdp-census.js', censusSrc.replace(swAnchor, "'page-mutation': 'allow',"), 'old-d6');
  const c3 = MUT6.load('src/browser-mediation.js', bound(d6Census), 'old-d6');
  ok(verdict(c3, 'Runtime.evaluate', 'S-A', { paused: true }) === 'forward' && verdict(c3, 'DOM.setOuterHTML', 'S-A', { paused: true }) === 'forward' && verdict(M, 'Runtime.evaluate', 'S-A', { paused: true }) === 'browser_interrupted:page-mutation' && verdict(M, 'DOM.setOuterHTML', 'S-A', { paused: true }) === 'browser_interrupted:page-mutation', '⑥ CONTROL 3 (the old D6 pause — page-mutation open while the user drives, in a census copy): Runtime.evaluate and DOM.setOuterHTML pass on the page the user drives — the row rule is what interrupts them');
  for (const r of copiesCensus(MUT6.files, MUT6.dir, REPO6, { minCopies: 4, label: '⑥ ' })) ok(r.pass, r.name, r.detail);
  // the REAL proxy reads the switch live and lists the unknown method it refused
  const fake6 = await fakeBrowser();
  const logs6 = [];
  const med6 = MED.create({ log: { log: (l) => logs6.push(String(l)), warn: (l) => logs6.push('W ' + String(l)) } });
  const st = { paused: false, fence: false };
  // the retired switch: a stale caller still handing `fenceScripts` (reading OFF) — the grant ignores it
  const g6 = await med6.grantFor({ profileId: 'bp-00000006', browserKey: 'bk-00000006', upstream: fake6.url, targetIds: ['T-A'], paused: () => st.paused, fenceScripts: () => st.fence });
  const c6 = cdpClient(g6.url); await c6.open;
  const s6 = (await c6.call('Target.attachToTarget', { targetId: 'T-A', flatten: true })).result.sessionId;
  ok((await c6.call('Runtime.evaluate', { expression: 'document.title' }, s6)).result.result.value === 'title-of-' + s6, '⑥ real proxy, the agent drives: Runtime.evaluate answers');
  st.paused = true;
  const r6 = await c6.call('Runtime.evaluate', { expression: 'document.title' }, s6);
  ok(M.refusalCodeOf(r6) === 'browser_interrupted' && !/fenceScriptsWhileDriven/.test(r6.error.message), '⑥ …the user drives (the paused reader read on the NEXT message): Runtime.evaluate is browser_interrupted although the stale switch callback reads OFF — nothing re-opens the script door');
  ok((await c6.call('Page.captureScreenshot', {}, s6)).result !== undefined && M.refusalCodeOf(await c6.call('Page.captureScreenshot', {}, s6)) === null, '⑥ …while a read (Page.captureScreenshot) still answers');
  const u6 = await c6.call('Page.zzzFutureMethod', {}, s6);
  ok(M.refusalCodeOf(u6) === 'browser_interrupted' && /cdp-census/.test(u6.error.message) && med6.list()[0].unclassified.join() === 'Page.zzzFutureMethod' && logs6.some((l) => /Page\.zzzFutureMethod has no row in the CDP census/.test(l)) && logs6.filter((l) => /has no row/.test(l)).length === 1, '⑥ an unknown method through the real proxy while the user drives: refused by name, listed on the grant\'s view, logged ONCE', JSON.stringify(logs6.slice(-2)));
  await c6.call('Page.zzzFutureMethod', {}, s6);
  ok(logs6.filter((l) => /has no row/.test(l)).length === 1 && !logs6.some((l) => l.includes(g6.token) || l.includes('RAW-ID')), '⑥ …a second refusal of the same method logs nothing more; no log line carries a token or the raw url');
  st.paused = false;
  ok((await c6.call('Page.zzzFutureMethod', {}, s6)).result !== undefined, '⑥ …handed back, the unknown method is forwarded (the fake answers it)');
  c6.ws.close(); med6.shutdown(); fake6.close();
}

// ═══ ③ the real proxy over a fake CDP upstream ══════════════════════════════
console.log('— ③ the real proxy over a fake CDP upstream: two grants, cross-scope refusals, the http twins, paused live, revoke, repoint');
/** A fake browser: /json/version + /json/list over http, a CDP-shaped ws
 *  endpoint that answers getTargets with THREE tabs, mints ids on
 *  createTarget (announcing targetCreated BEFORE the reply — Chrome's order),
 *  attaches with a sessionId, closes with success + targetDestroyed, echoes
 *  {} for the rest; every `Target.closeTarget` it receives is recorded. */
function fakeBrowser() {
  const targets = new Map([['T-A', { targetId: 'T-A', type: 'page', url: 'about:a' }], ['T-B', { targetId: 'T-B', type: 'page', url: 'about:b' }], ['T-Z', { targetId: 'T-Z', type: 'page', url: 'about:z' }]]);
  const closes = [], socks = new Set(), seen = [], held = [];
  let nextT = 1, nextS = 1, port = 0;
  const srv = http.createServer((req, res) => {
    const j = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/json/version') return j({ Browser: 'Fake/1.0', 'Protocol-Version': '1.3', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/RAW-ID` });
    if (req.url === '/json/list' || req.url === '/json') return j([...targets.values()].map((t) => ({ id: t.targetId, type: t.type, url: t.url, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${t.targetId}`, devtoolsFrontendUrl: `/devtools/inspector.html?ws=127.0.0.1:${port}/devtools/page/${t.targetId}` })));
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  srv.on('upgrade', (req, socket, head) => {
    if (!/^\/devtools\/(browser\/RAW-ID|page\/[A-Za-z0-9-]+)$/.test(req.url)) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      socks.add(ws); ws.on('close', () => socks.delete(ws));
      const send = (o) => { try { ws.send(JSON.stringify(o)); } catch { /* gone */ } };
      const answer = (m) => {
        const rep = (result) => send({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), result });
        switch (m.method) {
          case 'Target.getTargets': return rep({ targetInfos: [...targets.values()] });
          case 'Target.createTarget': { const id = 'T-NEW' + (nextT++); const info = { targetId: id, type: 'page', url: m.params.url || 'about:blank', ...(m.params.browserContextId ? { browserContextId: m.params.browserContextId } : {}) }; targets.set(id, info); for (const s of socks) { try { s.send(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: info } })); } catch { /* gone */ } } return rep({ targetId: id }); }
          case 'Target.attachToTarget': { const sid = 'S-' + (nextS++); send({ method: 'Target.attachedToTarget', params: { sessionId: sid, targetInfo: targets.get(m.params.targetId) || { targetId: m.params.targetId, type: 'page' }, waitingForDebugger: false } }); return rep({ sessionId: sid }); }
          case 'Target.closeTarget': { closes.push(m.params.targetId); const had = targets.delete(m.params.targetId); for (const s of socks) { try { s.send(JSON.stringify({ method: 'Target.targetDestroyed', params: { targetId: m.params.targetId } })); } catch { /* gone */ } } return rep({ success: had }); }
          case 'Target.createBrowserContext': return rep({ browserContextId: 'C-' + (nextS++) });
          case 'Page.navigate': { const t = [...targets.values()][0]; return rep({ frameId: 'F1', loaderId: 'L1', url: m.params.url, target: t ? t.targetId : null }); }
          case 'Browser.getVersion': return rep({ product: 'Fake/1.0', protocolVersion: '1.3' });
          case 'Runtime.evaluate': return rep({ result: { type: 'string', value: 'title-of-' + (m.sessionId || 'browser') } });
          default: return rep({});
        }
      };
      ws.on('message', (d) => {
        const m = JSON.parse(String(d));
        seen.push({ id: m.id, method: m.method, sessionId: m.sessionId || null, at: Date.now() });
        // ⑦: a call marked `__hold` is answered only when the suite releases it (a script the page is still running)
        if (m.params && m.params.__hold) { held.push(() => answer(m)); return; }
        answer(m);
      });
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; resolve({ port, url: `ws://127.0.0.1:${port}/devtools/browser/RAW-ID`, targets, closes, seen, held, release: () => { const hs = held.splice(0); for (const h of hs) h(); return hs.length; }, emit: (o) => { for (const s of socks) s.send(JSON.stringify(o)); }, close: () => { for (const s of socks) { try { s.terminate(); } catch { /* none */ } } srv.close(); } }); }));
}
function cdpClient(url) {
  const ws = new WebSocket(url); let id = 0; const waits = new Map(); const events = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id != null && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } else if (m.id == null) events.push(m); });
  const call = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waits.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const closed = new Promise((r) => ws.on('close', (c, reason) => r({ code: c, reason: String(reason) })));
  return { ws, call, events, closed, open: new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }) };
}
const getJson = (url) => new Promise((res) => http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { j = null; } res({ status: r.statusCode, json: j, raw: b }); }); }).on('error', (e) => res({ status: 0, error: e.message })));
const upgradeStatus = (url) => new Promise((res) => { const w = new WebSocket(url); w.on('unexpected-response', (_, r) => { res(r.statusCode); w.terminate(); }); w.on('open', () => { res('open'); w.close(); }); w.on('error', (e) => res('err ' + e.message)); });
{
  const fake = await fakeBrowser();
  const logs = [];
  const med = MED.create({ log: { log: (s) => logs.push(String(s)), warn: (s) => logs.push('W ' + String(s)) } });
  ok(med.port() === null && med.list().length === 0, 'a fresh mediator listens on nothing (lazy)');
  const paused = { a: false, b: false };
  const gA = await med.grantFor({ profileId: 'bp-00000001', browserKey: 'bk-0000000a', upstream: fake.url, targetIds: ['T-A'], paused: () => paused.a });
  const gB = await med.grantFor({ profileId: 'bp-00000001', browserKey: 'bk-0000000b', upstream: fake.url, targetIds: ['T-B'], paused: () => paused.b });
  ok(Number.isInteger(med.port()) && med.port() > 0 && gA.url.startsWith(`ws://127.0.0.1:${med.port()}/m/`) && gA.url !== gB.url && M.parseMediatedPath(new URL(gA.url).pathname).kind === 'browser', 'the first grant starts the listener; every lease gets its OWN url');
  ok(!logs.some((l) => l.includes(gA.token) || l.includes(fake.url)), 'no log line carries a token or the raw url');
  const again = await med.grantFor({ profileId: 'bp-00000001', browserKey: 'bk-0000000a', upstream: fake.url });
  ok(again.token === gA.token && again.url === gA.url && med.list().length === 2, 'asking again for the same (profile, conversation) is the SAME grant (token minted once)');
  ok(!JSON.stringify(med.list()).includes(gA.token) && !JSON.stringify(med.list()).includes('RAW-ID'), 'the grant list carries no token and no raw url');
  // http twins
  const v = await getJson(gB.httpBase + '/json/version');
  ok(v.status === 200 && v.json.Browser === 'Fake/1.0' && v.json.webSocketDebuggerUrl === gB.url && !v.raw.includes('RAW-ID'), '/json/version through B\'s url: the fake\'s facts, the endpoint re-pointed at B\'s url, the raw endpoint absent');
  const l = await getJson(gB.httpBase + '/json/list');
  ok(l.status === 200 && l.json.length === 1 && l.json[0].id === 'T-B' && l.json[0].webSocketDebuggerUrl === gB.url.replace('/devtools/browser', '/devtools/page/T-B') && !l.raw.includes('RAW-ID') && !l.raw.includes('T-A'), '/json/list through B\'s url: only B\'s tab, its page endpoint re-pointed');
  ok((await getJson(`http://127.0.0.1:${med.port()}/m/${'x'.repeat(32)}/json/version`)).status === 404 && (await getJson(`http://127.0.0.1:${med.port()}/json/version`)).status === 404 && (await getJson(gB.httpBase + '/devtools/other')).status === 404, 'an unknown token, a tokenless path and an unknown tail: 404 (never 403 — nothing is confirmed)');
  ok((await upgradeStatus(gB.url.replace('/devtools/browser', '/devtools/page/T-A'))) === 403 && (await upgradeStatus(`ws://127.0.0.1:${med.port()}/m/${'x'.repeat(32)}/devtools/browser`)) === 404, 'a page endpoint out of scope: 403 by name; an unknown token on the ws side: 404');
  // through B: cannot see / touch A
  const cB = cdpClient(gB.url); await cB.open;
  const tg = await cB.call('Target.getTargets');
  ok(tg.result.targetInfos.map((t) => t.targetId).join() === 'T-B', 'B sees only its own tab');
  ok(M.refusalCodeOf(await cB.call('Target.attachToTarget', { targetId: 'T-A', flatten: true })) === 'target_out_of_scope' && M.refusalCodeOf(await cB.call('Target.activateTarget', { targetId: 'T-A' })) === 'target_out_of_scope' && M.refusalCodeOf(await cB.call('Target.closeTarget', { targetId: 'T-A' })) === 'target_out_of_scope', 'B cannot attach, activate or close A\'s tab — and the fake never received those');
  ok(fake.closes.length === 0, 'no closeTarget reached the browser');
  const att = await cB.call('Target.attachToTarget', { targetId: 'T-B', flatten: true });
  const sid = att.result.sessionId;
  ok(!!sid && cB.events.some((e) => e.method === 'Target.attachedToTarget' && e.params.sessionId === sid), 'B attaches its own tab and sees the attachedToTarget for it');
  ok(M.refusalCodeOf(await cB.call('Runtime.evaluate', { expression: '1' }, 'S-foreign')) === 'session_out_of_scope', 'a message on a session B was never handed: session_out_of_scope');
  ok((await cB.call('Page.navigate', { url: 'about:nav' }, sid)).result.frameId === 'F1', 'B navigates its own tab');
  paused.b = true;
  ok(M.refusalCodeOf(await cB.call('Page.navigate', { url: 'about:nav2' }, sid)) === 'browser_interrupted' && M.refusalCodeOf(await cB.call('Input.dispatchKeyEvent', { type: 'keyDown' }, sid)) === 'browser_interrupted' && M.refusalCodeOf(await cB.call('Runtime.evaluate', { expression: 'document.title' }, sid)) === 'browser_interrupted', 'the paused reader is read LIVE: the moment the user holds B\'s input, B\'s navigate, input AND script evaluation are browser_interrupted');
  ok((await cB.call('Page.captureScreenshot', {}, sid)).result !== undefined, '…while a read still answers');
  paused.b = false;
  ok((await cB.call('Page.navigate', { url: 'about:nav3' }, sid)).result.frameId === 'F1', 'handed back: navigation works again');
  const created = await cB.call('Target.createTarget', { url: 'about:new' });
  const tNew = created.result.targetId;
  ok(!!tNew && cB.events.some((e) => e.method === 'Target.targetCreated' && e.params.targetInfo.targetId === tNew), 'B creates a tab and sees its targetCreated (replayed from before the reply — Chrome\'s order, reproduced by the fake)');
  ok((await cB.call('Target.getTargets')).result.targetInfos.map((t) => t.targetId).sort().join() === ['T-B', tNew].sort().join(), 'B now sees two tabs: its own');
  ok(M.refusalCodeOf(await cB.call('Browser.close')) === 'method_refused', 'Browser.close through a session url: method_refused');
  // an event about A never reaches B
  fake.emit({ method: 'Target.targetInfoChanged', params: { targetInfo: { targetId: 'T-A', type: 'page', url: 'about:a2' } } });
  fake.emit({ method: 'Target.targetInfoChanged', params: { targetInfo: { targetId: 'T-B', type: 'page', url: 'about:b2' } } });
  await until(() => cB.events.some((e) => e.method === 'Target.targetInfoChanged' && e.params.targetInfo.targetId === 'T-B'));
  ok(!cB.events.some((e) => e.method === 'Target.targetInfoChanged' && e.params.targetInfo.targetId === 'T-A'), 'a change on A\'s tab is withheld from B; a change on B\'s reaches it');
  // through A: cannot touch B either (symmetry), and its own page endpoint works
  const cA = cdpClient(gA.url); await cA.open;
  ok(M.refusalCodeOf(await cA.call('Target.closeTarget', { targetId: 'T-B' })) === 'target_out_of_scope' && M.refusalCodeOf(await cA.call('Target.closeTarget', { targetId: tNew })) === 'target_out_of_scope', 'A cannot close B\'s tabs (the one it was minted with or the one it created)');
  const pA = cdpClient(gA.url.replace('/devtools/browser', '/devtools/page/T-A')); await pA.open;
  ok((await pA.call('Runtime.evaluate', { expression: '1' })).result.result.value === 'title-of-browser', 'A\'s page endpoint for its own tab answers');
  ok(M.refusalCodeOf(await pA.call('Browser.close')) === 'method_refused', 'the same rules on a page endpoint');
  // views
  const views = med.list();
  const vb = views.find((x) => x.browserKey === 'bk-0000000b');
  ok(vb.targets === 2 && vb.sessions === 1 && vb.connections === 1 && views.find((x) => x.browserKey === 'bk-0000000a').connections === 2, 'the views count targets / sessions / connections per grant');
  // repoint: the browser restarted ⇒ connections close 1012, the url survives; null ⇒ 503
  med.repoint('bp-00000001', fake.url + '?restarted');
  const c1 = await cB.closed;
  ok(c1.code === 1012 && c1.reason === 'browser_restarting', 'a restart re-points every grant on the profile and closes live connections 1012 browser_restarting');
  ok((await med.grantFor({ profileId: 'bp-00000001', browserKey: 'bk-0000000b' })).url === gB.url, '…the url is the SAME after the restart (the session reconnects through it)');
  med.repoint('bp-00000001', null);
  ok((await getJson(gB.httpBase + '/json/version')).status === 503 && (await upgradeStatus(gB.url)) === 503, 'a stopped browser: 503 browser_stopped on the http side and the upgrade');
  med.repoint('bp-00000001', fake.url);
  // revoke closes 1008 AND closes the lease's tabs in the browser
  const cB2 = cdpClient(gB.url); await cB2.open;
  const rv = med.revoke({ profileId: 'bp-00000001', browserKey: 'bk-0000000b' });
  const c2 = await cB2.closed;
  ok(rv.revoked && c2.code === 1008 && c2.reason === 'lease_gone', 'revoke closes the lease\'s connections 1008 lease_gone');
  const closing = await rv.closing;
  ok(closing.closed === 2 && fake.closes.sort().join() === ['T-B', tNew].sort().join() && !fake.targets.has('T-B') && fake.targets.has('T-A'), 'revoke closes the lease\'s OWN tabs in the browser (Browser.close is refused through a session url, so a mediated close --all would have left them) — A\'s tab untouched');
  ok((await getJson(gB.httpBase + '/json/version')).status === 404 && med.list().length === 1, 'the revoked url is gone (404) and the list shrank');
  ok(med.revoke({ profileId: 'bp-00000001', browserKey: 'bk-0000000b' }).revoked === false, 'revoking twice is a no-op');
  ok(med.revokeWhere((g) => g.profileId === 'bp-00000001', { closeTargets: false }) === 1 && med.list().length === 0 && fake.targets.has('T-A'), 'revokeWhere with closeTargets:false leaves the tabs (a stop that closes the browser anyway)');
  // bad JSON from a client is refused, not fatal
  const g3 = await med.grantFor({ profileId: 'bp-00000001', browserKey: 'bk-0000000c', upstream: fake.url, paused: () => { throw new Error('reader broke'); } });
  const c3 = cdpClient(g3.url); await c3.open;
  const badReply = await new Promise((res) => { c3.ws.once('message', (d) => res(JSON.parse(String(d)))); c3.ws.send('not json'); });
  ok(M.refusalCodeOf(badReply) === 'bad_message' && c3.ws.readyState === WebSocket.OPEN, 'a non-JSON frame answers bad_message and the connection lives');
  ok((await c3.call('Browser.getVersion')).result.product === 'Fake/1.0' && logs.some((l) => /paused\(\) threw/.test(l)), 'a paused reader that throws is logged and read as NOT paused (the cooperative CLI refusal still stands; a broken reader never wedges the browser)');
  await cA.closed.then(() => {}, () => {}); // (still open — closed on shutdown)
  med.shutdown();
  const cs = await c3.closed;
  ok(cs.code === 1001 && med.port() === null && med.list().length === 0, 'shutdown closes every connection 1001 and forgets every grant');
  fake.close();
}

// ═══ ③b a client that RESETS while its upstream opens (the desktop bridge's verify r2 F1, the same shape here) ═══
console.log('— ③b a client socket parked on the upstream open: a reset is no uncaught error, a client gone first closes that upstream');
{
  const MUT = mutantCopies('mediation', path.resolve(new URL('..', import.meta.url).pathname));
  const REPO = path.resolve(new URL('..', import.meta.url).pathname);
  /** A CDP upstream whose handshake takes 300 ms; the client resets (or half-closes) 60 ms into it. */
  const parked = async (Mod, how) => {
    const upWss = new WebSocketServer({ noServer: true });
    const st = { opened: 0, closed: 0 };
    const up = http.createServer((q, r) => r.end('{}'));
    up.on('upgrade', (req, sock, head) => { sock.on('error', () => { }); setTimeout(() => upWss.handleUpgrade(req, sock, head, (ws) => { st.opened++; ws.on('close', () => st.closed++); }), 300); });
    await new Promise((r) => up.listen(0, '127.0.0.1', r));
    const med = Mod.create({ log: { log() { }, warn() { } } });
    const g = await med.grantFor({ profileId: 'bp-00000009', browserKey: 'bk-00000009', upstream: `ws://127.0.0.1:${up.address().port}/devtools/browser/RAW-ID` });
    const u = new URL(g.url);
    const uncaught = []; const trap = (e) => uncaught.push(String((e && (e.code || e.message)) || e));
    process.on('uncaughtException', trap);
    const c = net.connect(Number(u.port), '127.0.0.1'); c.on('error', () => { });
    await new Promise((r) => c.once('connect', r));
    c.write(`GET ${u.pathname} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    await sleep(60);
    if (how === 'rst') c.resetAndDestroy(); else c.end();
    await sleep(700);
    process.removeListener('uncaughtException', trap);
    try { c.destroy(); } catch { /* gone */ }
    const conns = med.list()[0].connections;
    med.shutdown(); up.close();
    return { uncaught, ...st, conns };
  };
  const r1 = await parked(MED, 'rst'), r2 = await parked(MED, 'half');
  ok(r1.uncaught.length === 0 && r1.opened === r1.closed && r1.conns === 0, `a client that RESETS while its upstream opens ⇒ no uncaught error (the hub lives: ${JSON.stringify(r1.uncaught)}), no upstream left open (${r1.opened} opened / ${r1.closed} closed)`, JSON.stringify(r1));
  ok(r2.uncaught.length === 0 && r2.opened === r2.closed && r2.conns === 0, `a client that HALF-CLOSES while its upstream opens ⇒ that upstream is closed, not left reading nobody (${r2.opened} opened / ${r2.closed} closed)`, JSON.stringify(r2));
  const src = fs.readFileSync(path.join(REPO, 'src/server/cdp-mediator.js'), 'utf8');
  const a = "    socket.on('error', parkedError);\n", b = "    socket.once('close', parkedGone);\n", c2 = "      if (socket.destroyed || !socket.readable || !socket.writable) { try { up.close(); } catch { /* none */ } try { socket.destroy(); } catch { /* gone */ } return; } // half-closed: ws would drop it without its callback\n";
  ok(src.split(a).length === 2 && src.split(b).length === 2 && src.split(c2).length === 2, 'CONTROL setup: the parked listeners and the half-closed guard are spelled once');
  const pre = MUT.load('src/server/cdp-mediator.js', src.replace(a, '\n').replace(b, '\n').replace(c2, '\n'), 'parked');
  const m1 = await parked(pre, 'rst'), m2 = await parked(pre, 'half');
  ok(m1.uncaught.some((x) => /ECONNRESET/.test(x)), `CONTROL: the pre-fix mediator lets the reset escape as an uncaught ${JSON.stringify(m1.uncaught)} — the hub's exit`, JSON.stringify(m1));
  ok(m2.opened > m2.closed, `CONTROL: the pre-fix mediator leaves the half-closed client's upstream OPEN (${m2.opened} opened / ${m2.closed} closed)`, JSON.stringify(m2));
  for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 1 })) ok(r.pass, '③b tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
}

// ═══ ③c a grant that moves while its client is parked on the upstream open (verify r3 M3) ═══
console.log('— ③c a lease revoked / re-pointed / shut down while its client waits on the upstream open: 503 by name, never a connection no grant owns');
{
  const REPO = path.resolve(new URL('..', import.meta.url).pathname);
  const MUT3 = mutantCopies('mediation-r3', REPO);
  /** A CDP upstream whose handshake takes `delay` ms; every message answered, every open / close / message counted. */
  const slowUp = async (delay) => {
    const upWss = new WebSocketServer({ noServer: true });
    const st = { opened: 0, closed: 0, msgs: 0 };
    const srv = http.createServer((q, r) => r.end('{}'));
    srv.on('upgrade', (req, sock, head) => { sock.on('error', () => { }); setTimeout(() => upWss.handleUpgrade(req, sock, head, (ws) => { st.opened++; ws.on('error', () => { }); ws.on('close', () => st.closed++); ws.on('message', (d) => { st.msgs++; const m = JSON.parse(String(d)); ws.send(JSON.stringify({ id: m.id, result: { product: 'Fake/1.0' } })); }); }), delay); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { st, url: `ws://127.0.0.1:${srv.address().port}/devtools/browser/RAW-ID`, close: () => { for (const c of upWss.clients) { try { c.terminate(); } catch { /* gone */ } } srv.close(); } };
  };
  /** A raw client that sends the upgrade and reads the status line the mediator answers. */
  const rawClient = async (url) => {
    const u = new URL(url);
    const c = net.connect(Number(u.port), '127.0.0.1'); c.on('error', () => { });
    let resp = ''; c.on('data', (d) => { resp += d.toString('latin1'); });
    await new Promise((r) => c.once('connect', r));
    c.write(`GET ${u.pathname} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    return { status: () => (resp.split('\r\n')[0] || '').replace(/^HTTP\/1\.1 /, ''), destroy: () => { try { c.destroy(); } catch { /* gone */ } } };
  };
  const trapped = async (fn) => { const uncaught = []; const trap = (e) => uncaught.push(String((e && (e.message || e.code)) || e).slice(0, 120)); process.on('uncaughtException', trap); try { return { ...(await fn()), uncaught }; } finally { process.removeListener('uncaughtException', trap); } };
  // the lease ends (revoke) 100 ms into a 300 ms upstream handshake
  const revokeLeg = (Mod) => trapped(async () => {
    const U = await slowUp(300); const med = Mod.create({ log: { log() { }, warn() { } } });
    const g = await med.grantFor({ profileId: 'bp-0000000c', browserKey: 'bk-0000000c', upstream: U.url });
    const c = await rawClient(g.url);
    await sleep(100); med.revoke({ profileId: 'bp-0000000c', browserKey: 'bk-0000000c', closeTargets: false });
    await sleep(600);
    const status = c.status(), grantsLeft = med.list().length;
    med.shutdown(); await sleep(150);
    const r = { status, grantsLeft, ...U.st }; c.destroy(); U.close(); return r;
  });
  // the profile's browser restarts (repoint) 100 ms into the old upstream's handshake; the client then reconnects
  const repointLeg = (Mod) => trapped(async () => {
    const U1 = await slowUp(300), U2 = await slowUp(10); const med = Mod.create({ log: { log() { }, warn() { } } });
    const g = await med.grantFor({ profileId: 'bp-0000000d', browserKey: 'bk-0000000d', upstream: U1.url });
    const first = { status: null, reply: null };
    const w1 = new WebSocket(g.url); w1.on('error', (e) => { const m = /Unexpected server response: (\d+)/.exec(e && e.message); if (m) first.status = Number(m[1]); });
    w1.on('open', () => { first.status = 101; w1.send(JSON.stringify({ id: 8, method: 'Browser.getVersion', params: {} })); }); w1.on('message', (d) => { first.reply = JSON.parse(String(d)); });
    await sleep(100); med.repoint('bp-0000000d', U2.url);
    await sleep(600);
    let second = null;
    if (first.status !== 101) {
      const w2 = new WebSocket(g.url); w2.on('error', () => { });
      second = await new Promise((resolve) => { const t = setTimeout(() => resolve({ timeout: true }), 3000); w2.on('open', () => w2.send(JSON.stringify({ id: 9, method: 'Browser.getVersion', params: {} }))); w2.on('message', (d) => { clearTimeout(t); resolve(JSON.parse(String(d))); }); });
      try { w2.close(); } catch { /* gone */ }
    }
    med.shutdown(); await sleep(150);
    const r = { first, second, old: { ...U1.st }, now: { ...U2.st } }; try { w1.terminate(); } catch { /* gone */ } U1.close(); U2.close(); return r;
  });
  // the mediator shuts down 100 ms into the handshake (L7: the nulled wss was an uncaught TypeError)
  const shutdownLeg = (Mod) => trapped(async () => {
    const U = await slowUp(300); const med = Mod.create({ log: { log() { }, warn() { } } });
    const g = await med.grantFor({ profileId: 'bp-0000000e', browserKey: 'bk-0000000e', upstream: U.url });
    const c = await rawClient(g.url);
    await sleep(100); med.shutdown(); await sleep(600);
    const r = { status: c.status(), ...U.st }; c.destroy(); U.close(); return r;
  });
  const rv = await revokeLeg(MED);
  ok(/^503 /.test(rv.status) && rv.grantsLeft === 0 && rv.opened === rv.closed && rv.msgs === 0 && !rv.uncaught.length, `a lease REVOKED while its client waits on the upstream open ⇒ "${rv.status}" (never 101), no grant left, the upstream never left open (${rv.opened} opened / ${rv.closed} closed)`, JSON.stringify(rv));
  const rp = await repointLeg(MED);
  ok(rp.first.status === 503 && rp.second && rp.second.id === 9 && rp.now.msgs === 1 && rp.old.msgs === 0 && rp.old.opened === rp.old.closed && !rp.uncaught.length, `a browser RE-POINTED while its client waits ⇒ that client is refused 503 (never wired to the OLD browser: old ${rp.old.msgs} message(s), ${rp.old.opened} opened / ${rp.old.closed} closed), the same url then reaches the NEW one (${rp.now.msgs} message)`, JSON.stringify(rp));
  const sd = await shutdownLeg(MED);
  ok(/^503 /.test(sd.status) && sd.opened === sd.closed && !sd.uncaught.length, `the mediator SHUT DOWN while a client waits ⇒ "${sd.status}", no uncaught error (${JSON.stringify(sd.uncaught)}), no upstream left open`, JSON.stringify(sd));
  // CONTROLS (scripts/mutant-copy.mjs): the fix is two layers — the parked upstream terminated by closeConns, and the
  // grant re-checked at the open. Each alone refuses; both removed (the pre-fix mediator) wires the parked client.
  const src = fs.readFileSync(path.join(REPO, 'src/server/cdp-mediator.js'), 'utf8');
  const termLine = src.split('\n').find((l) => l.includes('for (const pk of [...g.pendingUps])')) + '\n';
  const checkLines = src.split('\n').filter((l) => l.startsWith('      const why = park.why ||') || l.startsWith('      if (why) { try { up.close(); }')).map((l) => l + '\n');
  ok(src.split(termLine).length === 2 && checkLines.length === 2 && checkLines.every((l) => src.split(l).length === 2), 'CONTROL setup: the parked-upstream termination and the open-time grant check are spelled once each');
  const noTerm = MUT3.load('src/server/cdp-mediator.js', src.replace(termLine, '\n'), 'noterm');
  const noCheck = MUT3.load('src/server/cdp-mediator.js', checkLines.reduce((t, l) => t.replace(l, '\n'), src), 'nocheck');
  const preFix = MUT3.load('src/server/cdp-mediator.js', checkLines.reduce((t, l) => t.replace(l, '\n'), src.replace(termLine, '\n')), 'prefix');
  const [a1, a2] = [await revokeLeg(noTerm), await revokeLeg(noCheck)];
  ok(/^503 /.test(a1.status) && a1.opened === a1.closed && /^503 /.test(a2.status) && a2.opened === a2.closed, `each layer ALONE refuses the revoked lease's parked client (check only: "${a1.status}", ${a1.opened}/${a1.closed}; termination only: "${a2.status}", ${a2.opened}/${a2.closed})`, JSON.stringify({ a1, a2 }));
  const [p1, p2, p3] = [await revokeLeg(preFix), await repointLeg(preFix), await shutdownLeg(preFix)];
  ok(/^101 /.test(p1.status) && p1.opened > p1.closed, `CONTROL: the pre-fix mediator UPGRADES the revoked lease's client ("${p1.status}") and its upstream outlives even shutdown (${p1.opened} opened / ${p1.closed} closed)`, JSON.stringify(p1));
  ok(p2.first.status === 101 && p2.old.msgs === 1 && p2.now.msgs === 0, `CONTROL: the pre-fix mediator wires the re-pointed lease's client to the OLD browser (old ${p2.old.msgs} / new ${p2.now.msgs} message(s))`, JSON.stringify(p2));
  ok(p3.uncaught.some((x) => /handleUpgrade/.test(x)), `CONTROL: the pre-fix mediator throws past a shutdown mid-connect (${JSON.stringify(p3.uncaught)})`, JSON.stringify(p3));
  for (const r of copiesCensus(MUT3.files, MUT3.dir, REPO, { minCopies: 3 })) ok(r.pass, '③c tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
}

// ═══ ④ the real keeper with the proxy injected ══════════════════════════════
console.log('— ④ the real keeper over the fake agent-browser: instance sharing created / refused, a mediated attach, scope across two conversations, takeover, edits, detach, stop, drop, shutdown');
const ROOT = scratch('browser-mediation');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const DATA2 = path.join(ROOT, 'data2'); fs.mkdirSync(DATA2, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
// The FAKE agent-browser (the pin suite's shape): its daemon is a real `sleep`,
// `get cdp-url` answers FAKE_CDP_URL — the fake CDP upstream's real url.
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
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, cdp: process.env.AGENT_BROWSER_CDP || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, pid: c.pid, env: { profile: s.profile, cdp: s.cdp, session: process.env.AGENT_BROWSER_SESSION || null } }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: process.env.FAKE_CDP_URL || 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
function reapAll() { for (const l of launches()) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } } }
process.on('exit', () => { reapAll(); fs.rmSync(ROOT, { recursive: true, force: true }); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { reapAll(); fs.rmSync(ROOT, { recursive: true, force: true }); process.exit(130); });
{
  const fake = await fakeBrowser();
  const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b', KEY_C = 'bk-0000000c';
  const rtEnv = { FAKE_AB_STATE: AB_STATE, FAKE_CDP_URL: fake.url, PATH: PATH_ENV, HOME };
  const live = new Set([KEY_A, KEY_B, KEY_C]);
  const broadcasts = [];
  const settings = { 'browser.idleTimeoutMs': 600000, 'browser.takeoverIdleMs': 30000 };
  let clock = 1_000_000; const now = () => clock;
  const mkKeeper = (dataDir, mediator) => K.create({
    dataDir, homeDir: HOME, env: () => rtEnv, broadcast: (m) => broadcasts.push(m), serverSetting: (k) => settings[k], serverNotice: null, getTelemetry: () => null,
    liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), hostKnown: (h) => h === 'lab-1',
    log: { log() { }, warn() { }, error() { } }, now, install: false, mediator,
  });
  const med = MED.create({ log: { log() { }, warn() { } } });
  const keeper = mkKeeper(DATA, med);
  const bare = mkKeeper(DATA2, null);
  // ─ create / refuse
  const team = keeper.createProfile({ label: 'Team', sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
  ok(team.sharing === 'instance' && team.mediated === true && keeper.list().profiles.find((p) => p.id === team.id).mediated === true, 'a keeper WITH the proxy creates an instance-shared profile, marked mediated in every view');
  let refused = null; try { bare.createProfile({ label: 'Team', sharing: 'instance' }, { owner: { kind: 'instance', id: null } }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'sharing_refused' && refused.why === 'mediation_unavailable' && bare.list().mediation.available === false, 'a keeper WITHOUT the proxy refuses it with the pre-P6 sentence — the control');
  refused = null; try { keeper.createProfile({ label: 'Far', sharing: 'instance', host: 'lab-1' }, { owner: { kind: 'instance', id: null } }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'sharing_refused' && refused.why === 'host', 'instance sharing on a paired-machine profile is refused by name even with the proxy');
  const solo = keeper.createProfile({ label: 'Solo' }, { owner: { kind: 'session', id: KEY_C } });
  ok(solo.sharing === 'owner' && solo.mediated === false && keeper.list().mediation.available === true && keeper.list().mediation.port === null, 'an owner profile beside it; the digest says the proxy is available and (lazy) not yet listening');
  // ─ a mediated attach
  const atA = await keeper.attach({ profileId: team.id, browserKey: KEY_A, sessionId: 'sess-a' });
  ok(atA.mediated === true && atA.lease.mediated === true && /^ws:\/\/127\.0\.0\.1:\d+\/m\/[A-Za-z0-9_-]{32}\/devtools\/browser$/.test(atA.cdpUrl) && atA.cdpUrl !== fake.url, 'the attach answer is MEDIATED: the wrapper\'s cdpUrl is the scoped url, never the raw one');
  ok(atA.env.includes(`AGENT_BROWSER_CDP=${atA.cdpUrl}`) && atA.env.includes(`AGENT_BROWSER_NAMESPACE=vs-${team.id}-${KEY_A}`) && atA.env.includes(`AGENT_BROWSER_SESSION=vs-${KEY_A}`) && atA.env.includes('AGENT_BROWSER_IDLE_TIMEOUT_MS=600000') && !atA.env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')), 'the env: the scoped url, a PER-SESSION namespace, the session name, the explicit idle, no profile directory');
  ok(typeof atA.note === 'string' && /own tabs/.test(atA.note), 'the answer carries the one-line sentence the CLI prints');
  const atB = await keeper.attach({ profileId: team.id, browserKey: KEY_B, sessionId: 'sess-b' });
  ok(atB.mediated && atB.cdpUrl !== atA.cdpUrl && atB.others === 1, 'a second conversation gets its OWN url on the same browser');
  const dump = JSON.stringify([keeper.list(), broadcasts, keeper.statusFor(KEY_A), keeper.leasesFor(KEY_A)]);
  ok(!dump.includes(fake.url) && !dump.includes('RAW-ID') && !dump.includes(atA.cdpUrl.split('/m/')[1].slice(0, 32)), 'the raw url and the tokens reach no digest, broadcast, status or lease view');
  ok(keeper.list().mediation.port === med.port() && keeper.list().mediation.grants.length === 2 && keeper.list().mediation.grants.every((g) => !('token' in g)), 'the digest carries the proxy\'s port and two grant views (no token)');
  const atC = await keeper.attach({ profileId: solo.id, browserKey: KEY_C, sessionId: 'sess-c' });
  // naive study 2: an owner profile is NOT mediated — its lease reaches the keeper's browser over that browser's OWN url
  // (never a scoped /m/ url), and never its directory (the keeper is the only launcher; was: the directory, no CDP pair)
  ok(atC.mediated === false && !atC.env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && atC.env.some((kv) => kv.startsWith('AGENT_BROWSER_CDP=') && !kv.includes('/m/') && kv.slice('AGENT_BROWSER_CDP='.length) === keeper.browserOf(solo.id).cdpUrl), 'NEGATIVE CONTROL: an owner profile attaches unmediated — its browser\'s own CDP url, no scoped url, no directory');
  // ─ scope across the two conversations, through the keeper's own grants
  const cA = cdpClient(atA.cdpUrl); await cA.open;
  const cB = cdpClient(atB.cdpUrl); await cB.open;
  ok((await cA.call('Target.getTargets')).result.targetInfos.length === 0, 'a fresh lease sees no tabs (its scope starts empty; the fake browser holds three)');
  const tA = (await cA.call('Target.createTarget', { url: 'about:a' })).result.targetId;
  ok(!!tA && (await cA.call('Target.getTargets')).result.targetInfos.map((t) => t.targetId).join() === tA, 'A creates a tab and sees exactly it');
  ok((await cB.call('Target.getTargets')).result.targetInfos.length === 0 && M.refusalCodeOf(await cB.call('Target.attachToTarget', { targetId: tA, flatten: true })) === 'target_out_of_scope', 'B sees nothing and cannot attach A\'s tab through its own url');
  const sA = (await cA.call('Target.attachToTarget', { targetId: tA, flatten: true })).result.sessionId;
  ok((await cA.call('Page.navigate', { url: 'about:a2' }, sA)).result.frameId === 'F1', 'A navigates its tab');
  // ─ the takeover flips A's url (the keeper's input side is the paused reader)
  keeper.takeover({ browserKey: KEY_A, profileId: team.id, viewerId: 7, sessionId: 'sess-a' });
  ok(M.refusalCodeOf(await cA.call('Page.navigate', { url: 'about:a3' }, sA)) === 'browser_interrupted' && M.refusalCodeOf(await cA.call('Input.insertText', { text: 'x' }, sA)) === 'browser_interrupted' && M.refusalCodeOf(await cA.call('Runtime.evaluate', { expression: '1' }, sA)) === 'browser_interrupted', 'the keeper\'s takeover makes A\'s url refuse navigate, Input.* and script evaluation (browser_interrupted) — the same state the CLI\'s cooperative refusal reads');
  // verify r6 (S2): a takeover is of the BROWSER — B (another conversation on the same Chrome) is taken WITH A: its own url refuses too
  ok(M.refusalCodeOf(await cB.call('Target.createTarget', { url: 'about:b' })) === 'browser_interrupted' && keeper.inputStateFor(KEY_B, team.id).input === 'user' && keeper.inputStateFor(KEY_B, team.id).takenBy.viewerId === 7, 'r6: B IS paused by A\'s takeover (one Chrome, one user driving it) — its url refuses a new tab too, its lease reads user by the same viewer');
  keeper.handback({ browserKey: KEY_A, profileId: team.id, viewerId: 7, cause: 'explicit' });
  ok((await cA.call('Page.navigate', { url: 'about:a3' }, sA)).result.frameId === 'F1' && !!(await cB.call('Target.createTarget', { url: 'about:b' })).result.targetId && keeper.inputStateFor(KEY_B, team.id).input === 'agent', 'the handback lets A drive again — and B with it');
  // ─ edits: sharing cannot flip while leased, never on the legacy record
  refused = null; try { keeper.updateProfile(team.id, { sharing: 'owner' }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'leased' && /2 session/.test(refused.message), 'sharing cannot flip while sessions hold leases (their env names the kind of attachment)', refused && (refused.code + ': ' + refused.message));
  refused = null; try { keeper.updateProfile(solo.id, { sharing: 'bogus' }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'sharing_refused' && refused.why === 'unknown', 'an unknown value is refused by the verdict through PATCH too');
  refused = null; try { keeper.updateProfile(solo.id, { sharing: 'instance' }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'leased', 'Solo is leased by C, so its flip to instance is refused `leased` too');
  keeper.detach({ profileId: solo.id, browserKey: KEY_C });
  ok(keeper.updateProfile(solo.id, { sharing: 'instance' }).changed.sharing.now === 'instance' && keeper.list().profiles.find((p) => p.id === solo.id).mediated === true, 'once unleased, an owner profile flips to instance (mediated from its next attach)');
  ok(keeper.updateProfile(solo.id, { sharing: 'owner' }).changed.sharing.now === 'owner' && keeper.list().profiles.find((p) => p.id === solo.id).mediated === false, '…and back to owner');
  ok(bare.list().profiles.length === 0 && (() => { try { bare.updateProfile(team.id, { sharing: 'owner' }); return false; } catch (e) { return e.code === 'not-found'; } })(), '(the proxy-less keeper never saw Team — separate stores)');
  const legacyDir = path.join(HOME, '.agent-browser', 'legacy-shared'); fs.mkdirSync(legacyDir, { recursive: true });
  const legacy = keeper.adoptDirectory({ label: 'Shared (legacy)', dir: legacyDir, legacy: true, owner: { kind: 'instance', id: null } });
  refused = null; try { keeper.updateProfile(legacy.profile.id, { sharing: 'owner' }); } catch (e) { refused = e; }
  ok(legacy.profile.sharing === 'instance' && legacy.profile.mediated === false && refused && refused.code === 'bad-request' && /legacy/.test(refused.message), 'the legacy record: sharing:instance, NOT mediated, and its sharing cannot be edited (adopt it as a new profile instead)');
  // ─ OWNER RULING A (2026-09-26): a pin is a DEFAULT ATTACHMENT, never a directory — so a mediated profile is pinned like
  // any other (P6 refused it only because a pin used to hand the next launch the profile's DIRECTORY); the pin's first
  // bare command attaches it through the keeper, which hands the lease its own scoped url
  refused = null; let pinned0 = null; try { pinned0 = keeper.setPin(KEY_C, team.id); } catch (e) { refused = e; }
  ok(!refused && pinned0 && pinned0.profileId === team.id && keeper.setFor(KEY_C).pinId === team.id, 'owner ruling A: pinning a conversation to a mediated profile is ACCEPTED (the pin names the profile; nothing hands out its directory)', refused && refused.message);
  settings['browser.defaultProfile'] = team.id;
  const pick = keeper.pinForCreate({});
  ok(pick.profileId === team.id && pick.origin === 'instance' && !pick.refused, 'owner ruling A: an instance default naming a mediated profile is HONOURED at spawn (the spawn gets no directory — ws-create hands pinnedDir null)');
  delete settings['browser.defaultProfile'];
  { const tg = keeper.pinForCreate({ taskGroupDefault: team.id }); ok(tg.profileId === team.id && tg.origin === 'task-group' && !tg.refused, 'owner ruling A: a Task-Group default naming one is honoured the same way'); }
  keeper.setPin(KEY_C, solo.id);
  refused = null; try { keeper.updateProfile(solo.id, { sharing: 'instance' }); } catch (e) { refused = e; }
  ok(!refused && keeper.profile(solo.id).sharing === 'instance', 'owner ruling A: a profile that is somebody\'s pin MAY become separate-tabs (mediated) — the pin is an attachment default, so there is no directory to protect', refused && refused.message);
  keeper.updateProfile(solo.id, { sharing: 'owner' });
  keeper.setPin(KEY_C, null);
  // ─ detach revokes: A's connection closes 1008 and A's tab is closed in the browser
  keeper.detach({ profileId: team.id, browserKey: KEY_A });
  const cl = await cA.closed;
  await until(() => fake.closes.includes(tA), 3000);
  ok(cl.code === 1008 && cl.reason === 'lease_gone' && fake.closes.includes(tA) && !fake.targets.has(tA) && fake.targets.has('T-Z'), 'detach revokes A\'s grant: its connection closes lease_gone and ITS tab is closed in the browser (the browser\'s other tabs stay)');
  ok(keeper.list().mediation.grants.length === 1 && keeper.list().mediation.grants[0].browserKey === KEY_B, 'one grant remains: B\'s');
  // ─ stop repoints: B's live connection closes browser_stopped; the next attach re-points the SAME url
  await keeper.stop(team.id, { why: 'user' });
  const cl2 = await cB.closed;
  ok(cl2.code === 1012 && cl2.reason === 'browser_stopped', 'stopping the browser closes B\'s mediated connection 1012 browser_stopped');
  ok((await getJson(M.mediatedHttpBase({ port: med.port(), token: new URL(atB.cdpUrl).pathname.split('/')[2] }) + '/json/version')).status === 503, '…and its url answers 503 until the browser is back');
  const atB2 = await keeper.attach({ profileId: team.id, browserKey: KEY_B, sessionId: 'sess-b' });
  ok(atB2.cdpUrl === atB.cdpUrl && atB2.resumed === false && atB2.created === false && (await getJson(M.mediatedHttpBase({ port: med.port(), token: new URL(atB.cdpUrl).pathname.split('/')[2] }) + '/json/version')).status === 200, 're-attaching after a restart hands B the SAME url, live again');
  // ─ a dropped lease loses its grant
  live.delete(KEY_B);
  const r = keeper.reconcile({ graceMs: 0 });
  ok(r.dropped.some((d) => d.lease.browserKey === KEY_B) && keeper.list().mediation.grants.length === 0, 'a lease nobody carries is dropped and its grant revoked with it');
  // ─ the keeper's shutdown ends the proxy
  keeper.shutdown();
  ok(med.port() === null && med.list().length === 0, 'the keeper\'s shutdown shuts the proxy down (it is the keeper\'s to end)');
  bare.shutdown();
  fake.close();
}

// ═══ ⑦ THE TAKEOVER INTERRUPTS (the owner's ruling, 2026-09-27) ═══════════════
console.log('— ⑦ the owner\'s ruling ("直接打断所有脚本和agent操作"): a takeover interrupts what the agent has in flight — browser_interrupted ≤ 50 ms, a running script asked to stop, a read left alone, the late answers swallowed; the retired switch ignored; CONTROL = the old pause');
{
  const REPO7 = path.resolve(new URL('..', import.meta.url).pathname);
  // the PURE plan
  const plan = M.interruptPlan([{ id: 1, method: 'Runtime.evaluate', sessionId: 'S1' }, { id: 2, method: 'DOM.getDocument', sessionId: 'S1' }, { id: 3, method: 'Input.insertText', sessionId: 'S1' }, { id: 4, method: 'Runtime.callFunctionOn', sessionId: 'S1' }, { id: 5, method: 'Runtime.evaluate', sessionId: 'S2' }, { id: 6, method: 'Page.zzzFuture', sessionId: 'S1' }, { id: 7, method: 'Target.getTargets' }, { id: 8, method: 'Runtime.evaluate', sessionId: 'S1', aborted: true }, { id: 9, method: 'Page.enable', sessionId: 'S1' }, { id: 10, method: 'Page.navigate', sessionId: 'S3' }]);
  ok(plan.abort.map((a) => a.id).join() === '1,3,4,5,6,10' && plan.terminate.join() === 'S1,S2', '⑦ PURE interruptPlan: every call in flight of a class refused while the user drives is aborted (script, key, navigation, an unknown method) — a read, a session call, a harmless enable and an already-aborted call are not; ONE terminateExecution per session that was running a script (not for a navigation)', JSON.stringify(plan));
  ok(M.interruptPlan([{ id: 1, method: 'Runtime.evaluate', sessionId: null }], { pageConn: true }).terminate.length === 1 && M.interruptPlan([{ id: 1, method: 'Runtime.evaluate', sessionId: null }]).terminate.length === 0 && M.interruptPlan([]).abort.length === 0, '⑦ a page endpoint\'s own script (no sessionId) is asked to stop on that connection; the browser target has no script to stop; nothing in flight ⇒ nothing');
  // the REAL keeper + the REAL proxy over the fake upstream
  const fake7 = await fakeBrowser();
  const rtEnv7 = { FAKE_AB_STATE: AB_STATE, FAKE_CDP_URL: fake7.url, PATH: PATH_ENV, HOME };
  const logs7 = [];
  const set7 = { 'browser.idleTimeoutMs': 600000, 'browser.takeoverIdleMs': 30000, 'browser.fenceScriptsWhileDriven': false };
  const KEY7 = 'bk-0000007a', KEY7C = 'bk-0000007c';
  const mk7 = (medImpl, dataDir, env = rtEnv7) => { fs.mkdirSync(dataDir, { recursive: true }); return K.create({ dataDir, homeDir: HOME, env: () => env, broadcast: () => { }, serverSetting: (k) => set7[k], serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY7, KEY7C]), runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log: (l) => logs7.push(String(l)), warn: (l) => logs7.push('W ' + String(l)), error() { } }, install: false, mediator: medImpl }); };
  const med7 = MED.create({ log: { log: (l) => logs7.push(String(l)), warn: (l) => logs7.push('W ' + String(l)) } });
  const k7 = mk7(med7, path.join(ROOT, 'data7'));
  ok(logs7.filter((l) => /browser\.fenceScriptsWhileDriven \(stored: false\) is retired/.test(l) && /ignored/.test(l)).length === 1, '⑦ the retired `browser.fenceScriptsWhileDriven` stored as false is said ONCE at the keeper\'s birth — and ignored (below: scripts are interrupted anyway)', JSON.stringify(logs7.filter((l) => /retired/.test(l))));
  const team7 = k7.createProfile({ label: 'Team7', sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
  const at7 = await k7.attach({ profileId: team7.id, browserKey: KEY7, sessionId: 'sess-7' });
  ok(logs7.filter((l) => /is retired/.test(l)).length === 1, '⑦ …a mediated grant says nothing more (once is once)');
  const ev7 = []; k7.onInput((e) => ev7.push(e));
  const c7 = cdpClient(at7.cdpUrl); await c7.open;
  const raw7 = []; c7.ws.on('message', (d) => { try { raw7.push(JSON.parse(String(d))); } catch { /* not json */ } });
  const t7 = (await c7.call('Target.createTarget', { url: 'about:t7' })).result.targetId;
  const s7 = (await c7.call('Target.attachToTarget', { targetId: t7, flatten: true })).result.sessionId;
  // four calls in flight at the browser: a script, a key, a READ, a new tab
  const stamp = (p) => p.then((r) => ({ r, at: Date.now() }));
  const pEval = stamp(c7.call('Runtime.evaluate', { expression: 'for(;;){}', __hold: true }, s7));
  const pKey = stamp(c7.call('Input.insertText', { text: 'hunter2', __hold: true }, s7));
  let readDone = null; c7.call('DOM.getDocument', { depth: 1, __hold: true }, s7).then((r) => { readDone = { r, at: Date.now() }; });
  const pNew = stamp(c7.call('Target.createTarget', { url: 'about:t7b', __hold: true }));
  await until(() => fake7.held.length === 4, 3000);
  ok(fake7.held.length === 4, '⑦ four calls sit in flight at the browser (a script, a key, a read, a new tab)');
  const tTake = Date.now();
  const tk7 = k7.takeover({ browserKey: KEY7, profileId: team7.id, viewerId: 71, sessionId: 'sess-7' });
  const [e1, e2, e4] = await Promise.all([pEval, pKey, pNew]);
  const took = Math.max(e1.at, e2.at, e4.at) - tTake;
  ok(tk7.ok && M.refusalCodeOf(e1.r) === 'browser_interrupted' && M.refusalCodeOf(e2.r) === 'browser_interrupted' && M.refusalCodeOf(e4.r) === 'browser_interrupted' && took <= 50, `⑦ the takeover ABORTS the script, the key and the new tab the agent had in flight: browser_interrupted in ${took} ms (≤ 50 — the browser never answered them)`, JSON.stringify([e1.r, e2.r, e4.r]).slice(0, 400));
  ok(e1.r.error.message === 'browser_interrupted: The user took over this browser — your operation was interrupted (Runtime.evaluate). Wait for the handback, then run it again.' && e1.r.sessionId === s7 && e4.r.sessionId === undefined, '⑦ the words: THE sentence naming the method, on the call\'s own session', e1.r.error.message);
  await sleep(60);
  ok(readDone === null, '⑦ a READ in flight (DOM.getDocument) is left to finish — not aborted (the live view\'s own stream rides reads)');
  const term = fake7.seen.filter((x) => x.method === 'Runtime.terminateExecution');
  ok(term.length === 1 && term[0].sessionId === s7 && term[0].id > MED.INTERNAL_ID_BASE - 100 && term[0].id < MED.INTERNAL_ID_BASE && term[0].at - tTake <= 50, `⑦ ONE Runtime.terminateExecution reached the browser on the script's session, under the proxy's own id, ${term[0] ? term[0].at - tTake : '?'} ms after the takeover (a running script is asked to stop; the key and the tab need none)`, JSON.stringify(term));
  const tkEv = ev7.find((e) => e.kind === 'takeover');
  ok(tkEv && tkEv.interruption && tkEv.interruption.fresh === true && tkEv.interruption.n === 3 && tkEv.interruption.verbs.join() === 'Runtime.evaluate,Input.insertText,Target.createTarget' && tkEv.interruption.aborted === 3, '⑦ the takeover event carries the interruption (fresh; with no trace of this browser the aborted methods name what was cut)', JSON.stringify(tkEv && tkEv.interruption));
  ok(logs7.some((l) => /the user took over — 3 call\(s\) in flight interrupted \(Runtime\.evaluate, Input\.insertText, Target\.createTarget; browser_interrupted\), Runtime\.terminateExecution on 1 session/.test(l)) && !logs7.some((l) => l.includes(at7.cdpUrl.split('/m/')[1].slice(0, 32)) || l.includes(fake7.url)), '⑦ the proxy journals it by count and method (never a token, a url or a param)');
  // while the user drives: a new script refused, a read answers
  ok(M.refusalCodeOf(await c7.call('Runtime.evaluate', { expression: '1' }, s7)) === 'browser_interrupted' && (await c7.call('Page.captureScreenshot', {}, s7)).result !== undefined, '⑦ while the user drives: a new script call is refused browser_interrupted, a read answers');
  // the browser's late answers: the read answers the client now; the three aborted ids get NO second reply; the cut tab joined the scope
  const abortedIds = [e1.r.id, e2.r.id, e4.r.id];
  const targetsBefore = k7.list().mediation.grants[0].targets;
  {
    const u = med7.interruptionOf(team7.id, KEY7);
    const t0 = Date.now(); const waited = await k7.awaitInterruptionSettled({ browserKey: KEY7, profileId: team7.id, maxMs: 120 });
    ok(u && u.unsettled === 3 && u.landed === 0 && waited >= 100 && waited <= 400 && Date.now() - t0 <= 400 && k7.interruptionFor({ browserKey: KEY7, profileId: team7.id, since: tTake - 5 }).landed === 0 && k7.interruptionFor({ browserKey: KEY7, profileId: team7.id, since: tTake - 5 }).unsettled === 3, `⑦ r6: before the browser answers, the three aborted calls are UNSETTLED (landed 0) and the audit's settle-wait is BOUNDED (${waited} ms of 120); r7: the keeper's audit answer SAYS so (unsettled 3 — the CLI words the uncertainty, never a definite cut)`, JSON.stringify(u));
  }
  ok(fake7.release() === 4, '⑦ (the browser answers the four held calls late)');
  await until(() => readDone !== null, 2000); await sleep(100);
  ok(readDone && readDone.r.result !== undefined && abortedIds.every((id) => raw7.filter((m) => m.id === id).length === 1), '⑦ the late answers: the read answers now, the three aborted calls get NO second reply (swallowed — the agent was told once)');
  ok(k7.list().mediation.grants[0].targets === targetsBefore + 1, `⑦ the tab the cut createTarget made still JOINS the lease's scope (${targetsBefore} → ${k7.list().mediation.grants[0].targets}) — the revoke will close it, it is never an orphan nobody owns`);
  const li = k7.list().mediation.grants[0].lastInterrupt;
  ok(li && li.aborted === 3 && li.terminated === 1 && li.methods.join() === 'Runtime.evaluate,Input.insertText,Target.createTarget' && li.terminateAnswers.join() === 'ok' && !JSON.stringify(li).includes('hunter2'), '⑦ the grant\'s view says what the last takeover interrupted and the browser\'s answer to terminateExecution — never a param', JSON.stringify(li));
  // verify r6: an aborted call the browser still answered with a SUCCESS had reached it and took effect — `landed` (the fake
  // answers every held call with a success: all three landed); the keeper's audit answer carries it after a bounded settle-wait
  ok(li.landed === 3 && li.landedMethods.join() === 'Runtime.evaluate,Input.insertText,Target.createTarget' && med7.interruptionOf(team7.id, KEY7).unsettled === 0, '⑦ r6: the late SUCCESS replies to the three aborted calls mark them LANDED (the agent is told they took effect), none unsettled once answered', JSON.stringify(li));
  ok(k7.interruptionFor({ browserKey: KEY7, profileId: team7.id, since: tTake - 5 }).landed === 3 && k7.interruptionFor({ browserKey: KEY7, profileId: team7.id, since: tTake - 5 }).unsettled === 0 && (await k7.awaitInterruptionSettled({ browserKey: KEY7, profileId: team7.id })) === 0, '⑦ r6: interruptionFor carries `landed` (3, unsettled 0 once answered) and the settle-wait returns at once when nothing is unsettled');
  // a refused verb goes on the re-run list; a SECOND takeover before the handback merges (no double count)
  const rz = k7.resolveFor({ browserKey: KEY7, verb: 'click' });
  ok(!rz.ok && rz.code === 'browser_paused', '⑦ the agent\'s next verb is refused browser_paused at /resolve (it did not run)');
  k7.takeover({ browserKey: KEY7, profileId: team7.id, viewerId: 72, sessionId: 'sess-7', holderAlive: false });
  const tk2 = ev7.filter((e) => e.kind === 'takeover')[1];
  ok(tk2 && tk2.interruption.fresh === false && tk2.interruption.n === 3 && tk2.interruption.takeovers === 2 && k7.list().mediation.grants[0].lastInterrupt.aborted === 0, '⑦ a second viewer\'s takeover before the handback MERGES into the cycle (not fresh, nothing counted twice) — and finds nothing in flight', JSON.stringify(tk2 && tk2.interruption));
  const hb7 = k7.handback({ browserKey: KEY7, profileId: team7.id, viewerId: 72, cause: 'explicit', url: 'https://x.test/after', sessionId: 'sess-7' });
  const hbEv = ev7.find((e) => e.kind === 'handback');
  ok(hb7.ok && hbEv && hbEv.rerun.join() === 'Runtime.evaluate,Input.insertText,Target.createTarget,click' && hb7.rerun.join() === hbEv.rerun.join(), '⑦ the handback carries the RE-RUN list once: what the takeover cut, then what the agent tried meanwhile', JSON.stringify(hbEv && hbEv.rerun));
  const iv = k7.interruptionFor({ browserKey: KEY7, profileId: team7.id, since: tTake - 5 });
  ok(iv && iv.code === 'browser_interrupted' && iv.aborted === true && iv.input === 'agent' && iv.takenAt >= tTake && k7.interruptionFor({ browserKey: KEY7, profileId: team7.id, since: Date.now() + 5 }) === null, '⑦ interruptionFor: a command whose /resolve answered before the takeover WAS interrupted (and cut: aborted), one resolved after it was not');
  ok((await c7.call('Runtime.evaluate', { expression: '1' }, s7)).result !== undefined, '⑦ handed back: the agent\'s script runs again');
  // VERIFY r6 (S2): the SIBLING conversation on the same mediated browser — its call in flight is cut by the primary's
  // takeover (the same viewer takes it WITH the primary), its tab switch is refused (the r3 anchor rule holds across
  // conversations), and the handback frees both
  const at7c = await k7.attach({ profileId: team7.id, browserKey: KEY7C, sessionId: 'sess-7c' });
  const c7c = cdpClient(at7c.cdpUrl); await c7c.open;
  const t7c = (await c7c.call('Target.createTarget', { url: 'about:t7c' })).result.targetId;
  const s7c = (await c7c.call('Target.attachToTarget', { targetId: t7c, flatten: true })).result.sessionId;
  const pSib = stamp(c7c.call('Input.insertText', { text: 'sibling-typing', __hold: true }, s7c));
  await until(() => fake7.held.length === 1, 3000);
  const tSib = Date.now();
  k7.takeover({ browserKey: KEY7, profileId: team7.id, viewerId: 75, sessionId: 'sess-7' });
  const eSib = await pSib;
  ok(M.refusalCodeOf(eSib.r) === 'browser_interrupted' && eSib.at - tSib <= 50 && k7.inputStateFor(KEY7C, team7.id).input === 'user', `⑦ r6: the SIBLING conversation's Input.insertText in flight on the same browser is cut by the primary's takeover (browser_interrupted in ${eSib.at - tSib} ms) and its lease reads user`, JSON.stringify(eSib.r).slice(0, 300));
  ok(M.refusalCodeOf(await c7c.call('Target.activateTarget', { targetId: t7c }, undefined)) === 'browser_interrupted' && M.refusalCodeOf(await c7c.call('Runtime.evaluate', { expression: '1' }, s7c)) === 'browser_interrupted' && (await c7c.call('Page.captureScreenshot', {}, s7c)).result !== undefined, '⑦ r6: while the user drives, the sibling cannot switch the tab the user looks at nor run a script — a read still answers');
  const rSib = k7.resolveFor({ browserKey: KEY7C, verb: 'type' });
  ok(!rSib.ok && rSib.code === 'browser_paused', '⑦ r6: the sibling\'s next verb is refused browser_paused at /resolve');
  const hbSib = k7.handback({ browserKey: KEY7, profileId: team7.id, viewerId: 75, cause: 'explicit', url: 'https://x.test/sib', sessionId: 'sess-7' });
  const hbEvSib = ev7.filter((e) => e.kind === 'handback' && e.browserKey === KEY7C).at(-1);
  ok(hbSib.ok && hbEvSib && hbEvSib.rerun.join() === 'Input.insertText,type' && !hbSib.rerun.includes('type') && k7.inputStateFor(KEY7C, team7.id).input === 'agent' && (await c7c.call('Runtime.evaluate', { expression: '1' }, s7c)).result !== undefined, '⑦ r6: the handback frees the sibling too, with ITS OWN re-run list (what was cut, then what it tried) — nothing of it in the primary\'s', JSON.stringify({ sib: hbEvSib && hbEvSib.rerun, primary: hbSib.rerun }));
  fake7.release(); c7c.ws.close();
  // CONTROL — THE OLD PAUSE (the r4 world: a takeover only refuses what comes NEXT): a mediator copy whose interrupt touches nothing
  const MUT7 = mutantCopies('mediation-interrupt', REPO7);
  const medSrc7 = fs.readFileSync(path.join(REPO7, 'src/server/cdp-mediator.js'), 'utf8');
  const anchor7 = "  function interrupt({ profileId, browserKey } = {}) {\n    const g = grantOf(profileId, browserKey);\n";
  ok(medSrc7.split(anchor7).length === 2, '⑦ control setup: the interrupt is spelled once');
  const OLD = MUT7.load('src/server/cdp-mediator.js', medSrc7.replace(anchor7, anchor7 + "    return { aborted: [], terminated: 0, at: now() }; // CONTROL: the old pause — nothing in flight is touched\n"), 'old-pause');
  const fake7c = await fakeBrowser();
  const medC = OLD.create({ log: { log() { }, warn() { } } });
  const kC = mk7(medC, path.join(ROOT, 'data7c'), { ...rtEnv7, FAKE_CDP_URL: fake7c.url, FAKE_AB_STATE: AB_STATE });
  const teamC = kC.createProfile({ label: 'Team7c', sharing: 'instance' }, { owner: { kind: 'instance', id: null } });
  const atC = await kC.attach({ profileId: teamC.id, browserKey: KEY7C, sessionId: 'sess-7c' });
  const cc = cdpClient(atC.cdpUrl); await cc.open;
  const tc = (await cc.call('Target.createTarget', { url: 'about:c' })).result.targetId;
  const sc7 = (await cc.call('Target.attachToTarget', { targetId: tc, flatten: true })).result.sessionId;
  let ctrlDone = null; cc.call('Runtime.evaluate', { expression: 'for(;;){}', __hold: true }, sc7).then((r) => { ctrlDone = r; });
  await until(() => fake7c.held.length === 1, 3000);
  kC.takeover({ browserKey: KEY7C, profileId: teamC.id, viewerId: 73, sessionId: 'sess-7c' });
  await sleep(120);
  ok(ctrlDone === null && !fake7c.seen.some((x) => x.method === 'Runtime.terminateExecution') && M.refusalCodeOf(await cc.call('Runtime.evaluate', { expression: '1' }, sc7)) === 'browser_interrupted', '⑦ CONTROL (the old pause — interrupt a no-op in a mediator copy): the script the agent had in flight is STILL waiting 120 ms after the takeover and no terminateExecution was sent (only the next call is refused) — the interrupt is what cuts it');
  fake7c.release(); await sleep(50);
  for (const r of copiesCensus(MUT7.files, MUT7.dir, REPO7, { minCopies: 1, label: '⑦ ' })) ok(r.pass, r.name, r.detail);
  cc.ws.close(); c7.ws.close();
  kC.shutdown(); k7.shutdown(); fake7c.close(); fake7.close();
}

// ═══ ⑤ takeover C3 (design-browser-takeover §3.2 / §5.3, I2 / I3) ═══════════
console.log('— ⑤ the one door: raw CDP refused before any server call; the takeover pauses the MANAGED EPHEMERAL browser and an attachment alike');
{
  const V = require('../src/browser-verbs.js');
  const CDP_FORMS = [['connect', '9222'], ['connect', 'ws://127.0.0.1:9222/devtools/browser/x'], ['get', 'cdp-url'], ['--cdp', '9222', 'snapshot'], ['open', 'https://example.com', '--auto-connect'], ['--', 'get', 'cdp-url']];
  for (const argv of CDP_FORMS) { const c = V.classify(argv, { ours: true }); ok(c.kind === 'refused' && c.code === 'raw_cdp_refused' && !!c.remedy, `the router refuses \`${argv.join(' ')}\` raw_cdp_refused with a remedy`); }
  // the SHIPPED CLI against a counting server: the refusal is LOCAL (zero calls)
  let calls = 0;
  const counter = http.createServer((req, res) => { calls++; res.writeHead(500); res.end('{}'); });
  await new Promise((r) => counter.listen(0, '127.0.0.1', r));
  const CLI = path.join(new URL('..', import.meta.url).pathname, 'data/bin/vibespace-browser');
  const env = { PATH: PATH_ENV, HOME, VIBESPACE_API: `http://127.0.0.1:${counter.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_' + 'm'.repeat(24) };
  const { execFile } = await import('node:child_process');
  const run = (args) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 20000 }, (err, stdout, stderr) => resolve({ status: err ? err.code : 0, stderr: String(stderr || '') })));
  for (const argv of [['connect', '9222'], ['get', 'cdp-url'], ['--cdp', '9222', 'snapshot'], ['snapshot', '--auto-connect']]) {
    const r = await run(argv);
    ok(r.status === 1 && /\[raw_cdp_refused\]/.test(r.stderr) && /remedy: /.test(r.stderr), `\`vibespace-browser ${argv.join(' ')}\` ⇒ raw_cdp_refused, exit 1`, r.stderr);
  }
  ok(calls === 0, `…and not one of them reached the server (${calls} calls)`);
  counter.close();
  // the REAL keeper: a takeover pauses resolveFor for the ephemeral browser AND for an attachment
  const DATA5 = path.join(ROOT, 'data5'); fs.mkdirSync(DATA5, { recursive: true });
  const KEY_E = 'bk-000000ee', KEY_T = 'bk-000000ef';
  const rtEnv5 = { FAKE_AB_STATE: AB_STATE, PATH: PATH_ENV, HOME };
  const k5 = K.create({ dataDir: DATA5, homeDir: HOME, env: () => rtEnv5, serverSetting: (k) => ({ 'browser.idleTimeoutMs': 600000 })[k], liveKeys: () => new Set([KEY_E, KEY_T]), runtime: F.createBrowserRuntime({ env: rtEnv5 }), facts: F.createBrowserFacts({ env: rtEnv5 }), log: { log() { }, warn() { }, error() { } }, install: false });
  const pairsE = B.browserEnvFor({ browserKey: KEY_E, variant: B.VARIANTS.N, idleMs: 600000 });
  const eph = await k5.ensureEphemeral({ browserKey: KEY_E, sessionId: 'sess-e', envPairs: pairsE, sessionName: 'e' });
  ok(eph.created && eph.browser.state === 'ready' && eph.profile.ephemeral === true && eph.profile.mediated === false, 'a managed ephemeral browser (sharing owner — not CDP-mediated, one conversation)');
  ok(k5.resolveFor({ browserKey: KEY_E }).kind === 'none', 'before a takeover a bare verb resolves to it (kind none ⇒ the managed ephemeral one)');
  k5.takeover({ browserKey: KEY_E, profileId: null, viewerId: 'v-e', sessionId: 'sess-e' });
  const pe = k5.resolveFor({ browserKey: KEY_E });
  ok(!pe.ok && pe.code === 'browser_paused', 'the user takes over the EPHEMERAL browser ⇒ the page verb `click` resolves browser_paused (the `<bk>|ephemeral` key, unchanged)', pe);
  const solo = k5.createProfile({ label: 'Solo5' }, { owner: { kind: 'session', id: KEY_T } });
  await k5.attach({ profileId: solo.id, browserKey: KEY_T, sessionId: 'sess-t' });
  k5.takeover({ browserKey: KEY_T, profileId: solo.id, viewerId: 'v-t', sessionId: 'sess-t' });
  const pt = k5.resolveFor({ browserKey: KEY_T });
  ok(!pt.ok && pt.code === 'browser_paused', '…and over an ATTACHMENT the same verb resolves browser_paused', pt);
  k5.handback({ browserKey: KEY_E, profileId: null, viewerId: 'v-e', cause: 'explicit' });
  k5.handback({ browserKey: KEY_T, profileId: solo.id, viewerId: 'v-t', cause: 'explicit' });
  ok(k5.resolveFor({ browserKey: KEY_E }).ok && k5.resolveFor({ browserKey: KEY_T }).ok && k5.resolveFor({ browserKey: KEY_T }).kind === 'attachment', 'handed back, both resolve again');
  for (const e of k5.ephemerals()) await k5.stop(e.profileId).catch(() => { });
  await k5.stop(solo.id).catch(() => { });
  k5.shutdown();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

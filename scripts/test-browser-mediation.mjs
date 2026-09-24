#!/usr/bin/env node
// AGENT BROWSER P6 — HARD MEDIATION (docs/design-agent-browser-v2.md §6.2 /
// §6.5 / D6; the §10 P6 row). Fast tier.
//
//   ① the §6.2 SHARING verdict (PURE, src/browser-profiles.js): `owner` always,
//      `instance` only where a mediating proxy exists AND on this machine —
//      refused BY NAME otherwise; `validateProfileInput` threads it; the
//      legacy record is never mediated;
//   ② the CDP MEDIATION RULES (PURE, src/browser-mediation.js) over literal
//      messages: target scoping (attach / activate / close / getTargetInfo
//      refused out of scope; getTargets FILTERED), the session gate, the
//      whole-browser acts refused outright, the `browser_paused` refusal of
//      Input.* + the navigation family while the user drives (Runtime.evaluate
//      NOT refused — stated), the scope GROWING from replies and events
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
//      answer or view.
// The real-chrome exit proof is test-browser-mediation-chrome (heavy).
// cdp-protocol-under-test — every 'Page.navigate' here is a CDP message judged by
// the proxy, never a navigation of VibeSpace's own page (§47's declared exemption).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
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
  ok(code(j({ id: 14, method: 'Page.navigate', params: { url: 'https://x' }, sessionId: 'S-A' }, P)) === 'browser_paused' && code(j({ id: 15, method: 'Input.dispatchMouseEvent', params: {}, sessionId: 'S-A' }, P)) === 'browser_paused' && code(j({ id: 16, method: 'Input.insertText', params: { text: 'x' }, sessionId: 'S-A' }, P)) === 'browser_paused' && code(j({ id: 17, method: 'Page.reload', params: {}, sessionId: 'S-A' }, P)) === 'browser_paused' && code(j({ id: 18, method: 'DOM.setFileInputFiles', params: {}, sessionId: 'S-A' }, P)) === 'browser_paused' && code(j({ id: 19, method: 'Target.createTarget', params: { url: 'about:blank' } }, P)) === 'browser_paused', 'while the USER drives: every Input.*, the navigation family, a file upload and a new tab are browser_paused');
  ok(code(j({ id: 20, method: 'Runtime.evaluate', params: { expression: 'document.title' }, sessionId: 'S-A' }, P)) === 'forward' && code(j({ id: 21, method: 'Page.captureScreenshot', params: {}, sessionId: 'S-A' }, P)) === 'forward', 'reads (Runtime.evaluate / captureScreenshot) are NOT refused while paused — stated, not a DOM-level fence');
  const pr = j({ id: 14, method: 'Page.navigate', params: {}, sessionId: 'S-A' }, P).reply;
  ok(pr.id === 14 && pr.sessionId === 'S-A' && pr.error.code === M.CDP_REFUSAL_CODE && /^browser_paused: /.test(pr.error.message) && /handback/.test(pr.error.message), 'a refusal is a CDP error by id on the same session: -32000, the typed code as the message prefix, the way out named');
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
  ok(/page-navigation commands are refused \(browser_paused\)/.test(sent) && /script evaluation and reads are not/.test(sent) && !/input and navigation are refused/.test(sent), 'the sentence names the fence\'s REAL scope: input + page-navigation COMMANDS refused, script evaluation and reads not (a script can navigate — said, not promised away)');
  ok(!M.isPausedMethod('Runtime.evaluate') && !M.isPausedMethod('Runtime.callFunctionOn') && !M.isPausedMethod('DOM.getDocument') && M.isPausedMethod('Page.navigate') && M.isPausedMethod('Input.insertText'), '…and the table agrees: evaluate / callFunctionOn / DOM reads pass while paused, navigate and Input.* do not');
  { const REPO_DIR = new URL('..', import.meta.url).pathname; const wrapperTxt = fs.readFileSync(path.join(REPO_DIR, 'data/bin/vibespace-browser'), 'utf8'); const manual = fs.readFileSync(path.join(REPO_DIR, 'docs/agent/browser-manual.md'), 'utf8');
    ok(/not script evaluation/.test(wrapperTxt) && /script evaluation \(`eval`\), which is NOT fenced/.test(manual), 'the CLI\'s `watch` and the manual say the same (no surface promises a DOM-level fence)'); }
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
  const closes = [], socks = new Set();
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
      ws.on('message', (d) => {
        const m = JSON.parse(String(d));
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
      });
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => { port = srv.address().port; resolve({ port, url: `ws://127.0.0.1:${port}/devtools/browser/RAW-ID`, targets, closes, emit: (o) => { for (const s of socks) s.send(JSON.stringify(o)); }, close: () => { for (const s of socks) { try { s.terminate(); } catch { /* none */ } } srv.close(); } }); }));
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
  ok(M.refusalCodeOf(await cB.call('Page.navigate', { url: 'about:nav2' }, sid)) === 'browser_paused' && M.refusalCodeOf(await cB.call('Input.dispatchKeyEvent', { type: 'keyDown' }, sid)) === 'browser_paused', 'the paused reader is read LIVE: the moment the user holds B\'s input, B\'s navigate and input are browser_paused');
  ok((await cB.call('Runtime.evaluate', { expression: 'document.title' }, sid)).result.result.value === 'title-of-' + sid, '…while a read still answers');
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
  ok(atC.mediated === false && atC.env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && !atC.env.some((kv) => kv.startsWith('AGENT_BROWSER_CDP=')), 'NEGATIVE CONTROL: an owner profile attaches exactly as before (the directory, no CDP pair)');
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
  ok(M.refusalCodeOf(await cA.call('Page.navigate', { url: 'about:a3' }, sA)) === 'browser_paused' && M.refusalCodeOf(await cA.call('Input.insertText', { text: 'x' }, sA)) === 'browser_paused', 'the keeper\'s takeover makes A\'s url refuse navigate and Input.* (browser_paused) — the same state the CLI\'s cooperative refusal reads');
  ok((await cB.call('Target.createTarget', { url: 'about:b' })).result.targetId, 'B is not paused by A\'s takeover');
  keeper.handback({ browserKey: KEY_A, profileId: team.id, viewerId: 7, cause: 'explicit' });
  ok((await cA.call('Page.navigate', { url: 'about:a3' }, sA)).result.frameId === 'F1', 'the handback lets A drive again');
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
  // ─ the pin: a mediated profile is attached, never pinned (a pin hands the next launch a DIRECTORY)
  refused = null; try { keeper.setPin(KEY_C, team.id); } catch (e) { refused = e; }
  ok(refused && refused.code === 'pin_refused' && /use bp-/.test(refused.message), 'pinning a conversation to a mediated profile is refused by name (attach it with `use`)');
  settings['browser.defaultProfile'] = team.id;
  const pick = keeper.pinForCreate({});
  ok(pick.profileId === '' && pick.origin === 'harness' && /shared instance-wide/.test(pick.refused) && /instance default/.test(pick.refused), 'an instance default naming a mediated profile is SKIPPED at spawn with its reason (the spawn env never carries a shared browser\'s directory)');
  delete settings['browser.defaultProfile'];
  ok(keeper.pinForCreate({ taskGroupDefault: team.id }).refused && /taskGroup|task/.test(keeper.pinForCreate({ taskGroupDefault: team.id }).refused), 'a Task-Group default naming one is skipped the same way');
  keeper.setPin(KEY_C, solo.id);
  refused = null; try { keeper.updateProfile(solo.id, { sharing: 'instance' }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'pinned' && new RegExp(KEY_C).test(refused.message), 'a profile that is somebody\'s pin cannot become instance-shared (unpin first — named)');
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

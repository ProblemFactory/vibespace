#!/usr/bin/env node
// THE LENT PASSKEY'S CLEAN-UP — split from test-browser-passkey (B-e601, lane bl-ci, 2026-11-19, the coordinator's ruling: the fast tier
// keeps at most 12 rows over 10 s, and test-browser-passkey read 11.8 s alone on the test machine with lg-leak-census' B-1327 legs).
// Its last part moved here VERBATIM — everything after ⑨r11's own block in the ⑨r2 block: B-d981 (1) + (4) on the person's road,
// ⑨r9's give-back exits, the B-97ae walks (a document gone mid-ceremony; a clean-up the browser refused is said, never believed; a
// Cancel ends only what was pending) and B-97ae rounds 2 and 3 (what is said about a leftover is true for as long as it is said).
// Only what those legs read came with them: the fake realm, the fake CDP world (sock2 / world2), the lent-store and chrome fakes,
// the clean-up helpers. The checker: the suite's own ok(), guarded — a swapped call (a name that is not a string) throws.
// In-process, no network, no real browser.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PK = require(path.join(REPO, 'src/browser-passkey.js'));
let pass = 0, fail = 0;
const keepAlive = setInterval(() => {}, 1000); // the watch's timers are unref'd — the suite holds the loop
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const SENT = 'This page is waiting for a passkey (vercel.com) and nothing in VibeSpace answers it — cancel it (`vibespace-browser passkey cancel`) and use the page\'s other way in (a recovery code, a password), or ask the user to sign in on their own device.';


function fakeRealm({ any = true, one = false } = {}) {
  const calls = [], sent = [], busyRefused = [];
  class CredentialsContainer {}
  // `one` (⑨r4): Chrome as MEASURED (acceptance r3, S11c) — ONE WebAuthn request per page: a second while one is open is refused
  // with OperationError at once, the open one untouched; an aborted one is gone (the next one is taken)
  let open = null;
  const native = (kind) => ({ [kind](opts, ...rest) {
    calls.push({ kind, self: this, opts, rest });
    if (!opts || !opts.publicKey) return Promise.resolve({ type: 'password' });
    const sig = opts.signal;
    if (one && open) { busyRefused.push(kind); return Promise.reject(new DOMException('A request is already pending.', 'OperationError')); }
    const pr = new Promise((res, rej) => {
      if (opts.publicKey.answer) return res({ type: 'public-key' });
      if (sig) { if (sig.aborted) return rej(sig.reason); sig.addEventListener('abort', () => rej(sig.reason), { once: true }); }
    });
    if (one) { open = pr; const free = () => { if (open === pr) open = null; }; pr.then(free, free); }
    return pr;
  } })[kind];
  for (const k of ['get', 'create', 'store']) Object.defineProperty(CredentialsContainer.prototype, k, { value: native(k), writable: true, enumerable: true, configurable: true });
  const AS = any ? AbortSignal : new Proxy(AbortSignal, { get: (t, p) => (p === 'any' ? undefined : Reflect.get(t, p)) });
  // lane passkey-binding-isolated: the main world reports through a SECRET-named CustomEvent on `document`; the real binding
  // lives in the ISOLATED-WORLD reporter (a separate global sharing this document). Here: one EventTarget shared by both halves.
  const doc = new EventTarget();
  const binding = 'vs' + 'b'.repeat(24), chan = 'vspc' + 'c'.repeat(32);
  const G = { CredentialsContainer, AbortController, AbortSignal: AS, CustomEvent, EventTarget, document: doc, location: { hostname: 'vercel.com' }, JSON, Promise, Object, Reflect, Map, String, Date };
  const box = {}; // lane passkey-prewrap-fix: the hook's ctl (the watch reaches it through the private field; here: cfg.expose)
  const cfg = { chan, key: 'k'.repeat(32), expose: (c) => { box.ctl = c; } };
  const RG = { document: doc, EventTarget, [binding]: (s) => sent.push(JSON.parse(s)) }; // the isolated-world reporter half: its own global, the same document
  PK.installReporter(RG, { binding, chan });
  return { G, cfg, calls, sent, nav: new CredentialsContainer(), box, doc, binding, chan, RG, busyRefused };
}

console.log('⑩ the lent passkey\'s clean-up (moved from test-browser-passkey ⑨r2\'s block, B-e601): B-d981, ⑨r9\'s give-back exits, B-97ae walks and rounds 2–3');
{
  const PID = 'bp-0000b002', HK = 'hu-0000b002', CK = 'bk-0000c002';
  const crypto2 = require('crypto'), PS2 = require(path.join(REPO, 'src/browser-passkey-store.js'));
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  const until2 = async (pred, ms = 2000) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await sleep2(2); return pred(); }; // r8: every 2 ms (was 5) — the waits end nearer their facts
  const verbOf = (m) => (m.params && m.params.arguments && m.params.arguments[1] ? m.params.arguments[1].value : null);
  function sock2(world) {
    let slotOf = null, cur = null, n = 0; const log = [];
    class FakeWS {
      constructor() { this.readyState = 0; this.h = {}; cur = this; world.sockets++; setTimeout(() => { if (world.refuse) { this.readyState = 3; if (this.h.error) this.h.error(new Error('connect ECONNREFUSED 127.0.0.1:9')); if (this.h.close) this.h.close(); } else { this.readyState = 1; if (this.h.open) this.h.open(); } }, 0); }
      on(ev, fn) { this.h[ev] = fn; }
      close() { if (this.readyState === 3) return; this.readyState = 3; setTimeout(() => this.h.close && this.h.close(), 0); }
      send(raw) {
        const m = JSON.parse(raw); log.push(m);
        const sid = m.sessionId || null; let result = {}, error = null;
        // ⑨r6: `world.trace` = what was sent ('>') and answered ('<', '!' = an error), in order; `world.rtt` = the answer's delay;
        // `world.hold` = methods whose answers wait in `world.held` until the leg sends them; `world.chrome` = Chromium's WebAuthn environment (below)
        const tag = m.method + (m.method === 'Runtime.callFunctionOn' && verbOf(m) ? ':' + verbOf(m) : '') + (m.params && m.params.authenticatorId ? '(' + m.params.authenticatorId + ')' : '');
        if (world.trace) world.trace.push('>' + tag);
        if (world.onSend) world.onSend(m);
        const failMsg = world.fail && world.fail.has(m.method) ? (typeof world.fail.get(m.method) === 'function' ? world.fail.get(m.method)(m) : world.fail.get(m.method)) : null; // round 3: a function refuses by its params (one credential)
        if (failMsg) error = { message: failMsg }; // B-97ae walk (b): the browser REFUSES this method (its state unchanged)
        else if (m.method === 'Target.getTargets') result = { targetInfos: [{ targetId: 'T1', type: 'page', url: 'https://vercel.com/login', title: 'Use Your Passkey', browserContextId: 'CTX1' }, ...(world.two ? [{ targetId: 'T2', type: 'page', url: 'https://example.test/', title: 'Two', browserContextId: 'CTX1' }] : []) /* ⑨r8 */, ...(world.print ? [{ targetId: 'PR', type: 'page', url: 'chrome://print/', title: 'Print', browserContextId: 'CTX1' }] : [])] };
        else if (m.method === 'Target.attachToTarget') result = { sessionId: 'S-' + m.params.targetId };
        else if (m.method === 'Browser.getVersion') result = { userAgent: 'Mozilla/5.0 Chrome/154.0.0.0' };
        else if (m.method === 'Runtime.addBinding' && sid === 'S-T3') error = { message: 'no binding here' };
        else if (m.method === 'Page.addScriptToEvaluateOnNewDocument') { if (!m.params.worldName) slotOf = (String(m.params.source).match(/#(vs[0-9a-f]{32})\b/) || [])[1] || null; result = { identifier: '1' }; }
        else if (m.method === 'Runtime.evaluate' && m.params.expression === 'CredentialsContainer.prototype') result = { result: { type: 'object', objectId: 'P-' + m.params.contextId } };
        else if (m.method === 'Runtime.evaluate' && world.docSlots && /#(vs[0-9a-f]{32})\b/.test(String(m.params.expression))) { world.docSlots.push(String(m.params.expression).match(/#(vs[0-9a-f]{32})\b/)[1]); world.installs = (world.installs || 0) + 1; result = { result: { type: 'boolean', value: true } }; } // ⑨r3: a hook evaluated into the LIVE document (none of ours found there)
        else if (m.method === 'Runtime.evaluate') result = { result: { type: 'string', value: 'released' } };
        else if (m.method === 'Runtime.getProperties') result = { result: [], privateProperties: (world.docSlots || (slotOf ? [slotOf] : [])).map((s, i) => ({ name: '#' + s, value: { type: 'function', objectId: 'CTL-' + (i + 1) } })) };
        else if (m.method === 'Runtime.callFunctionOn' && world.hook && m.params.functionDeclaration === PK.CTL_FN) { const v = world.hook(m.params.arguments.map((a) => a.value)); result = { result: { type: typeof v === 'number' ? 'number' : 'object', value: v } }; } // ⑨r3: the watch's verbs reach a REAL hook
        else if (m.method === 'Runtime.callFunctionOn') result = { result: verbOf(m) === 'pending' ? { type: 'object', value: world.pending } : m.params.functionDeclaration === PK.REARM_FN ? { type: 'object', value: { displaced: [], kept: [] } } : { type: 'number', value: 1 } };
        else if (m.method === 'Page.createIsolatedWorld') result = { executionContextId: 70 };
        else if (world.chrome && m.method === 'WebAuthn.enable') world.chrome.env = true; // ⑨r6 Chromium: enable makes the environment (a no-op when there is one)
        else if (world.chrome && m.method === 'WebAuthn.disable') { world.chrome.env = false; world.chrome.auths.clear(); world.chrome.creds.clear(); world.chrome.uv.clear(); } // … disable drops it and every authenticator in it
        else if (world.chrome && m.method === 'WebAuthn.addVirtualAuthenticator' && !world.chrome.env) error = { message: 'The Virtual Authenticator Environment has not been enabled for this session' };
        else if (world.chrome && m.method === 'WebAuthn.removeVirtualAuthenticator') { world.chrome.auths.delete(m.params.authenticatorId); world.chrome.creds.delete(m.params.authenticatorId); world.chrome.uv.delete(m.params.authenticatorId); }
        else if (world.chrome && m.method === 'WebAuthn.addCredential') { const a = m.params.authenticatorId, cid = m.params.credential && m.params.credential.credentialId, cs = world.chrome.creds.get(a) || new Set(); if (!world.chrome.auths.has(a)) error = { message: 'Could not find a Virtual Authenticator matching the ID' }; else if (cs.has(cid)) error = { message: 'Could not add the credential: its id is already registered' }; else { world.chrome.keys.push(a); world.chrome.creds.set(a, cs.add(cid)); } } // ⑨r7: a credential id already in it is refused
        else if (world.chrome && /^WebAuthn\.(getCredentials|removeCredential|setUserVerified)$/.test(m.method)) { // ⑨r7: each authenticator's credentials and UV
          const a = m.params.authenticatorId, cs = world.chrome.creds.get(a) || new Set();
          if (!world.chrome.auths.has(a)) error = { message: 'Could not find a Virtual Authenticator matching the ID' };
          else if (m.method === 'WebAuthn.getCredentials') result = { credentials: [...cs].map((credentialId) => ({ credentialId })) };
          else if (m.method === 'WebAuthn.removeCredential') { if (!cs.delete(m.params.credentialId)) error = { message: 'Could not find a credential matching the ID' }; }
          else world.chrome.uv.set(a, !!m.params.isUserVerified);
        }
        else if (m.method === 'WebAuthn.addVirtualAuthenticator') result = { authenticatorId: 'AUTH-' + (++n) };
        else if (m.method === 'WebAuthn.getCredentials') result = { credentials: [] };
        if (m.method === 'Runtime.enable' && (sid === 'S-T1' || (world.two && sid === 'S-T2'))) setTimeout(() => this.h.message && this.h.message(JSON.stringify({ method: 'Runtime.executionContextCreated', sessionId: sid, params: { context: { id: 7, auxData: { isDefault: true, frameId: sid.slice(2) } } } })), 0);
        if (world.chrome && m.method === 'WebAuthn.addVirtualAuthenticator' && !error) world.chrome.auths.add(result.authenticatorId);
        const answer = () => { if (world.trace) world.trace.push('<' + tag + (error ? '!' : '')); if (this.h.message) this.h.message(JSON.stringify(error ? { id: m.id, error } : { id: m.id, result })); };
        if (world.hold && world.hold.has(m.method)) { world.held.push(answer); return; }
        setTimeout(answer, world.rtt || 0);
      }
    }
    return { FakeWS, log, push: (o) => cur.h.message(JSON.stringify(o)), sock: () => cur };
  }
  function world2({ modPath = null, holders = 'human', store = null, hostId = null, print = true, rearmMs = 20, url = 'ws://fake', ep = null, drainMs = null, beatMs = null, holdMaxMs = null, two = false /* ⑨r8: a second tab T2 */, callTimeoutMs = null, leftMax = null /* B-97ae round 2 */ } = {}) {
    const world = { sockets: 0, refuse: false, pending: [], print, two, said: [], ended: [] /* ⑨r10: forYou.ended */, H: { human: holders !== 'agent', agent: holders !== 'human' } };
    const f = sock2(world);
    let clock = 1_000_000;
    const listeners = new Set(), items = [], events = [];
    const keeper = { profile: () => ({ id: PID, label: 'Mine' }), cdpEndpointFor: async (pid, o) => { (world.eps = world.eps || []).push(!!(o && o.fresh)); return ep || (hostId ? { ok: false, code: 'remote', error: 'the browser runs on another machine' } : { ok: true, url }); }, viewersFor: () => world.viewers || 0 /* B-346d: the live views watching it now */ /* the keeper's own answers (its hostId branch is ITS — the machine handle's) */, onLease: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      browserOf: () => ({ state: 'ready', launch: 'attach', displaySession: { id: 'da-0000x2', display: ':1' }, ...(hostId ? { hostId } : {}) }), setFor: (bk) => (bk === CK ? { attachments: [{ profileId: PID }] } : null), ephemeralFor: () => null };
    const holdersOf = () => [...(world.H.agent ? [{ browserKey: CK, sessionId: 's-c', ephemeral: false }] : []), ...(world.H.human ? [{ browserKey: HK, sessionId: null, ephemeral: false, human: true, input: 'user' }] : [])];
    const passkeys = store ? { read: () => store.file, write: (o) => { store.file = JSON.parse(JSON.stringify(o)); }, cipher: store.cipher } : null;
    const mkD = () => { const d = require(modPath || path.join(REPO, 'src/server/browser-dialogs.js')).create({ keeper, WebSocketImpl: f.FakeWS, log: { warn: (l) => world.said.push(String(l)), log() {} }, now: () => clock, holdersOf, ...(drainMs != null ? { drainMs } : {}), ...(beatMs != null ? { holdBeatMs: beatMs } : {}), ...(holdMaxMs != null ? { holdMaxMs } : {}), ...(callTimeoutMs != null ? { callTimeoutMs } : {}), ...(leftMax != null ? { leftMax } : {}), leaseCountOf: () => holdersOf().length, passkeys,
      tabsOf: ({ browserKey }) => (browserKey === HK || browserKey === CK ? (two ? ['T1', 'T2'] : ['T1']) : []), rearmMs, forYou: { add: (pid, it) => { const same = it.itemKey ? items.findIndex((x) => x.itemKey === it.itemKey) : -1; if (same >= 0) { items[same] = { ...it, status: 'open', id: items[same].id }; return items[same].id; } items.push({ ...it, status: 'open', id: 'todo-' + (items.length + 1) }); return 'todo-' + items.length; } /* B-97ae round 2: the store's identity — an itemKey re-file is the same item, reopened */, resolve: (id) => { (world.resolved = world.resolved || []).push(id); const x = items.find((i) => i.id === id); if (x) x.status = 'done'; }, sweep: (prefix) => { (world.swept = world.swept || []).push(prefix); return 0; }, ended: (id, fact) => world.ended.push({ id, fact }) } }); d.onChange((ev) => events.push(ev)); return d; };
    let D = mkD();
    const lease = async (ev) => { const out = []; for (const fn of listeners) { const r = fn(ev); if (r && typeof r.then === 'function') out.push(r); } await Promise.allSettled(out); };
    const w = () => D._watches.get(PID) || null;
    const calls = (method, pred = () => true) => f.log.filter((m) => m.method === method && pred(m));
    const bind = () => { const b = [...f.log].reverse().find((x) => x.method === 'Runtime.addBinding' && x.sessionId === 'S-T1'); return b ? b.params.name : 'x'; };
    const say = (o, ctx = 7) => f.push({ method: 'Runtime.bindingCalled', sessionId: 'S-T1', params: { name: bind(), executionContextId: ctx, payload: JSON.stringify(o) } });
    const start = (id, rp = 'vercel.com', ctx = 7) => say({ ev: 'start', id, kind: 'get', rpId: rp, origin: 'https://' + rp }, ctx);
    const end = (id) => say({ ev: 'end', id, outcome: 'ok' });
    const armed = () => { const t = w() && w().targets.get('T1'); return !!t && t.pk.armed && !t.pk.arming && t.pk.ctl.has(7); }; // ⑨r6: the person's tab's hook armed and reached in its document — the fact, never a fixed 30 ms
    const opened = async () => { await lease({ kind: 'human-start', profileId: PID, key: HK, launched: true }); await until2(() => w() && w().state === 'open'); await until2(armed, 500); await sleep2(5); };
    return { get D() { return D; }, restart: () => { D.shutdown(); D = mkD(); }, f, world, items, events, lease, w, calls, start, end, opened, armed, say, now: () => clock, step: (ms) => { clock += ms; } };
  }
  const released = (X) => X.calls('Runtime.callFunctionOn', (m) => verbOf(m) === 'release').length;
  const hookRealm = (host = 'github.com', o = {}) => { const r = fakeRealm(o); let hc = 5_000_000; r.G.DOMException = DOMException; r.G.btoa = btoa; r.G.location = { hostname: host, origin: 'https://' + host }; r.G.Date = { now: () => hc }; r.cfg.hold = true; r.cfg.holdMs = 60000; PK.installHook(r.G, r.cfg); return Object.assign(r, { step: (ms) => { hc += ms; }, ctl: (verb, id) => r.box.ctl(r.cfg.key, verb, id) }); };
  const lentStore = () => { const cipher = PS2.cipherOf(crypto2, crypto2.randomBytes(32)); return { file: PS2.withRow(null, PID, { credentialId: 'Kvault097', rpId: 'vercel.com', userName: 'me', displayName: 'Me', keySealed: cipher.seal('pkcs8-key-text'), signCount: 1, createdBy: 'human', createdAt: 1, lastUsedAt: 0, uses: 0, policy: 'yes' }), cipher }; }; // the person's kept key, «always» (S11b's)
  const chrome97 = () => ({ env: false, auths: new Set(), creds: new Map(), uv: new Map(), keys: [] }); // Chromium's WebAuthn environment (⑨r6's model; `keys` = the authenticator each addCredential loaded into — without it the fake refuses the load)
  const atRest97 = async (X, quietMs = 20) => {
    const t0 = Date.now(); let n = -1, since = 0, turns = 0;
    while (Date.now() - t0 < 3000) {
      const tr = X.world.trace, open = tr.filter((x) => x[0] === '>').length - tr.filter((x) => x[0] === '<').length;
      if (tr.length !== n) { n = tr.length; since = Date.now(); turns = 0; } else if (open === 0 && turns >= 5 && Date.now() - since >= quietMs) return true;
      turns++; await sleep2(2);
    }
    return false;
  };
  const cancelRun = async (order, { modPath = null, next = false } = {}) => {
    const X = world2({ holders: 'human', print: false, store: lentStore(), modPath });
    X.world.chrome = chrome97(); X.world.trace = [];
    await X.opened();
    const opening = X.world.said.slice(); // what the watch says opening on this fake (a browser with no VibeSpace surfaces) — nothing more may be said from the lend on
    X.start(1, 'vercel.com'); await until2(() => released(X) > 0); await atRest97(X);
    const T = () => X.w().targets.get('T1').pk;
    const auth1 = T().auth || null, ch = X.world.chrome;
    const lent = { auth: !!auth1 && ch.auths.has(auth1), keys: [...(ch.creds.get(auth1) || [])], uv: ch.uv.get(auth1) === true };
    let reported = order === 'never-reported';
    const endOf = () => { reported = true; X.say({ ev: 'end', id: 1, outcome: 'cancelled', name: 'AbortError' }); };
    X.world.hook = (args) => { if (args[1] === 'cancel') { if (order === 'report-first') endOf(); else if (order === 'answer-first') setTimeout(endOf, 5); } return 1; };
    const cn = await X.D.cancelPasskey({ profileId: PID, browserKey: HK, ephemeral: false }, { by: 'user' });
    X.world.hook = null;
    let auth2 = null;
    if (next) { X.start(2, 'vercel.com'); await until2(() => released(X) > 1, 1000); auth2 = T().auth || null; } // their NEXT sign-in starts at once
    await until2(() => reported, 500); const rest = await atRest97(X); // the Cancel answered, the page's report landed (when it comes), the link quiet
    const on1 = (method) => X.calls(method, (m) => m.params.authenticatorId === auth1);
    const after = { rest, removedIds: X.calls('WebAuthn.removeVirtualAuthenticator').map((m) => m.params.authenticatorId), keyRemoved: on1('WebAuthn.removeCredential').map((m) => m.params.credentialId), uvOff: on1('WebAuthn.setUserVerified').filter((m) => m.params.isUserVerified === false).length,
      auth: T().auth || null, chromeAuths: [...ch.auths], keysOn1: [...(ch.creds.get(auth1) || [])], uvOn: [...ch.uv].filter(([, v]) => v).map(([a]) => a), keysOn2: auth2 ? [...(ch.creds.get(auth2) || [])] : [], opening, said: X.world.said.slice(opening.length) };
    X.D.shutdown();
    return { order, lent, cn: { ok: cn.ok, n: cn.n }, auth1, auth2, after };
  };
  const VAULT5 = () => { const cipher = PS2.cipherOf(crypto2, crypto2.randomBytes(32)); return { file: PS2.withRow(null, PID, { credentialId: 'Kvault005', rpId: 'vercel.com', userName: 'me', displayName: 'Me', keySealed: cipher.seal('pkcs8-key-text'), signCount: 1, createdBy: 'human', createdAt: 1, lastUsedAt: 0, uses: 0, policy: 'yes' }), cipher }; };
  const authOf5 = (X) => X.w().targets.get('T1').pk.auth || null;
  const at6 = (tr, s, from = 0) => { for (let i = from; i < tr.length; i++) if (tr[i] === s) return i; return -1; };
  const chrome6 = () => ({ env: false, auths: new Set(), keys: [], creds: new Map() /* ⑨r7 */, uv: new Map() });
  const rec6 = (X, n) => X.w().targets.get('T1').pk.records.find((r) => r.n === n) || {};
  const doc6 = (X, ctx, frame = 'T1') => X.f.push({ method: 'Runtime.executionContextCreated', sessionId: 'S-T1', params: { context: { id: ctx, auxData: { isDefault: true, frameId: frame } } } });
  const keys7 = (X, a) => [...(X.world.chrome.creds.get(a) || [])].map((s) => String(s).replace(/=+$/, ''));
  const uv7 = (X, a) => X.world.chrome.uv.get(a) === true;
  const free7 = (X) => { X.world.hold = null; X.world.held.splice(0).forEach((f) => f()); };
  // B-d981 (1) + (4), on the person's road (the person's own registration: the vault authenticator paired for it, its «once» taken):
  //   (1) outranked() — a «no» answered while it loads (setUserVerified held) — CLEARS its marks (rec.loaded / rec.uvSet, set as its
  //       load went out — r11) as it releases to Chrome's own window: its end never unloads through a hold already gone. RED with the
  //       clear dropped (the r11 verdict's mutant ran 235 / 0);
  //   (4) the r11 verdict's race (UNVERIFIED there): the window handed to an AGENT between the checks — toAgent keeps the ceremony's
  //       authenticator as the agent's — then the «no»: the person's registration is never released into the agent's authenticator;
  //       refused instead (what went in leaves at its end). RED on the base: released.
  {
    const sceneD = async (modPath, { toAgentMid = false } = {}) => {
      const X = world2({ modPath, holders: 'human', store: VAULT5(), print: false });
      await X.opened(); X.world.chrome = chrome6();
      const untilD = async (pred, ms = 400) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setImmediate(r)); return pred(); };
      const vD = (id, verb) => X.calls('Runtime.callFunctionOn', (m) => verbOf(m) === verb && m.params.arguments[2] && m.params.arguments[2].value === id).length;
      const idleD = () => !X.w().targets.get('T1').pk.draining;
      const answerD = async (choice) => { const reg = await X.D.passkeyRegister({ profileId: PID, browserKey: null, rpId: 'example.test', user: 'me' }); return X.D.answerPasskey(reg.proposal.id, { choice, shown: reg.proposal.shown }).ok; };
      const once = await answerD('once');
      X.world.hold = new Set(['WebAuthn.setUserVerified']); X.world.held = [];
      X.say({ ev: 'start', id: 9, kind: 'create', rpId: 'example.test', origin: 'https://example.test' }); const held = await untilD(() => X.world.held.length === 1);
      if (toAgentMid) { X.world.H.human = false; X.world.H.agent = true; await X.lease({ kind: 'human-end', profileId: PID, key: HK, reason: 'released' }); await X.lease({ kind: 'attach', browserKey: CK, profileId: PID, sessionId: 's-c' }); await untilD(() => X.w().mode === 'agent'); }
      const no = await answerD('no');
      free7(X); await untilD(() => vD(9, 'release') + vD(9, 'refuse') > 0 && idleD());
      const r = rec6(X, 9);
      const out = { once, held, no, mode: X.w().mode, rel: vD(9, 'release'), ref: vD(9, 'refuse'), loaded: r.loaded === undefined ? 'undefined' : JSON.stringify(r.loaded), uvSet: r.uvSet === undefined ? 'undefined' : r.uvSet, why: r.why || null };
      X.say({ ev: 'end', id: 9, outcome: 'error', name: 'NotAllowedError' }); await untilD(() => idleD());
      out.uvLeft = [...((X.world.chrome && X.world.chrome.uv) || new Map()).values()].some(Boolean);   // the review: what went in leaves at its end
      X.D.shutdown(); return out;
    };
    const dsD = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
    const MWD = mutantCopies('browser-passkey-d981-14', REPO);
    const p1 = await sceneD(null);
    ok(p1.once && p1.held && p1.no && p1.mode === 'person' && p1.rel === 1 && p1.ref === 0 && p1.loaded === 'null' && p1.uvSet === null,
      'B-d981 (1): the person\'s registration, a «no» answered while it loads ⇒ released to Chrome\'s own window AND its marks cleared (loaded / uvSet null)', p1);
    const clearCut = " rec.loaded = rec.uvSet = null; await pkOnceGone(w, e, rec); return pkCtl(w, e, rec, 'release'); }";
    ok(dsD.includes(clearCut), 'control setup (B-d981 (1)): the clear is where the control cuts');
    const m1 = await sceneD(MWD.write('src/server/browser-dialogs.js', anchored(dsD, clearCut, " await pkOnceGone(w, e, rec); return pkCtl(w, e, rec, 'release'); }", 'no-person-clear'), 'no-person-clear'));
    ok(m1.rel === 1 && m1.loaded !== 'null', 'CONTROL (B-d981 (1)): the clear dropped ⇒ the released ceremony keeps its marks (RED for the leg above)', m1);
    const p4 = await sceneD(null, { toAgentMid: true });
    ok(p4.once && p4.held && p4.mode === 'agent' && p4.rel === 0 && p4.ref === 1 && p4.why === 'answered-again' && p4.uvLeft === false,
      'B-d981 (4): the window handed to an agent while the person\'s registration loads, then «no» ⇒ refused answered-again — never released into the authenticator that is now the agent\'s', p4);
    const modeCut = "      if (person && w.mode === 'person') { e.pk.holds.delete(rec);";
    ok(dsD.includes(modeCut), 'control setup (B-d981 (4)): the mode check is where the control cuts');
    const m4 = await sceneD(MWD.write('src/server/browser-dialogs.js', anchored(dsD, modeCut, "      if (person) { e.pk.holds.delete(rec);", 'person-branch-any-mode'), 'person-branch-any-mode'), { toAgentMid: true });   // stale-pins: kept — the base's line, written back by this RED control
    ok(m4.rel === 1 && m4.ref === 0, 'CONTROL (B-d981 (4)): the base\'s branch (any mode) RELEASES the «no»\'d registration into the agent\'s authenticator — the race is real (RED for the leg above)', m4);
  }
  // ⑨r9 MINOR — the give-back's two other exits, on the person's road (the person's own registration: the vault authenticator paired for it); RED with back() dropped at that exit alone
  {
    const X = world2({ holders: 'human', store: VAULT5(), print: false });
    await X.opened();
    X.world.chrome = chrome6();
    const until9 = async (pred, ms = 300) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setImmediate(r)); return pred(); };
    const grant9 = async () => { const reg = await X.D.passkeyRegister({ profileId: PID, browserKey: null, rpId: 'example.test', user: 'me' }); return X.D.answerPasskey(reg.proposal.id, { choice: 'once', shown: reg.proposal.shown }).ok; };
    const create9 = (id) => X.say({ ev: 'start', id, kind: 'create', rpId: 'example.test', origin: 'https://example.test' });
    const v9 = (id, verb) => X.calls('Runtime.callFunctionOn', (m) => verbOf(m) === verb && m.params.arguments[2] && m.params.arguments[2].value === id).length;
    const pairs9 = () => X.calls('WebAuthn.addVirtualAuthenticator').length, idle9 = () => !X.w().targets.get('T1').pk.draining;
    // exit (2): the person's page gives up while the vault authenticator is pairing for it (the gate race) — the grant comes back
    const g1 = await grant9(), p0 = pairs9();
    create9(1); X.say({ ev: 'end', id: 1, outcome: 'error', name: 'NotAllowedError' });
    await until9(() => X.calls('WebAuthn.removeVirtualAuthenticator').length > 0 && idle9());
    const over = { paired: pairs9() - p0, rel1: v9(1, 'release'), auth: authOf5(X) };
    create9(2); await until9(() => v9(2, 'release') > 0 && idle9());
    const E2 = { g1, over, paired: pairs9() - p0, rel2: v9(2, 'release'), by2: rec6(X, 2).createdBy || null };
    ok(g1 && over.paired === 1 && over.rel1 === 0 && !over.auth && E2.paired === 2 && E2.rel2 === 1 && E2.by2 === 'human',
      '⑨r9 MINOR (exit 2, over after the person\'s pairing): the person\'s registration\'s page gives up while the vault authenticator pairs for it — nothing released, the authenticator gone, the grant GIVEN BACK: the person\'s next registration pairs the vault again (created by the person), never Chrome\'s own window for want of a grant', E2);
    X.say({ ev: 'end', id: 2, outcome: 'ok' }); await until9(() => idle9() && !authOf5(X));
    // exit (3): no authenticator (the pairing refused) — Chrome's own window for it, the grant comes back
    let once = true; X.world.onSend = (m) => { if (once && m.method === 'WebAuthn.addVirtualAuthenticator') { once = false; X.world.chrome.env = false; } };
    const g2 = await grant9(), p1 = pairs9();
    create9(3); await until9(() => v9(3, 'release') > 0 && idle9());
    const none = { tried: pairs9() - p1, rel3: v9(3, 'release'), auth: authOf5(X), by3: rec6(X, 3).createdBy || null };
    X.say({ ev: 'end', id: 3, outcome: 'error', name: 'NotAllowedError' });
    create9(4); await until9(() => v9(4, 'release') > 0 && idle9());
    const E3 = { g2, none, paired: pairs9() - p1, rel4: v9(4, 'release'), by4: rec6(X, 4).createdBy || null };
    ok(g2 && none.tried === 1 && none.rel3 === 1 && !none.auth && !none.by3 && E3.paired === 2 && E3.rel4 === 1 && E3.by4 === 'human',
      '⑨r9 MINOR (exit 3, no authenticator): the vault authenticator refused for the person\'s registration — released to Chrome\'s own window, the grant GIVEN BACK: the person\'s next registration pairs the vault (created by the person)', E3);
    X.say({ ev: 'end', id: 4, outcome: 'ok' });
    // ⑨r10 MAJOR on the person's road: a «no» answered while the vault authenticator pairs for the person's registration — caught right before the release
    const answer10 = async (choice) => { const reg = await X.D.passkeyRegister({ profileId: PID, browserKey: null, rpId: 'example.test', user: 'me' }); return X.D.answerPasskey(reg.proposal.id, { choice, shown: reg.proposal.shown }).ok; };
    await until9(() => idle9() && !authOf5(X));
    const g3 = await grant9(), p2 = pairs9();
    X.world.hold = new Set(['WebAuthn.addVirtualAuthenticator']); X.world.held = [];
    create9(5); await until9(() => X.world.held.length === 1);
    const no10 = await answer10('no');
    free7(X); await until9(() => v9(5, 'release') + v9(5, 'refuse') > 0 && idle9());
    const mid10 = { paired: pairs9() - p2, rel5: v9(5, 'release'), ref5: v9(5, 'refuse'), auth: authOf5(X), by5: rec6(X, 5).createdBy || null };
    X.say({ ev: 'end', id: 5, outcome: 'error', name: 'NotAllowedError' }); await until9(() => idle9());
    create9(6); await until9(() => v9(6, 'release') > 0 && idle9());
    const E4 = { g3, no10, mid10, paired: pairs9() - p2, rel6: v9(6, 'release'), by6: rec6(X, 6).createdBy || null };
    ok(g3 && no10 && mid10.paired === 1 && mid10.rel5 === 1 && mid10.ref5 === 0 && !mid10.auth && !mid10.by5 && E4.paired === 1 && E4.rel6 === 1 && !E4.by6,
      '⑨r10 MAJOR (the person\'s road, right before the release): the person answers «no» while the vault authenticator pairs for the person\'s registration — the authenticator paired for it goes and the page gets Chrome\'s own window (never refused for the vault\'s sake), not created by the person; the person\'s next registration: Chrome\'s own window at once, no pairing (f9fc15aa4: created by the person in the vault)', E4);
    X.say({ ev: 'end', id: 6, outcome: 'ok' });
    X.D.shutdown();
  }
  // B-97ae walk (a): A DOCUMENT GONE MID-CEREMONY ends its ceremonies through THE ONE END, on BOTH roads. The agent's tab keeps
  // its authenticator (it lives with the tab) but never the key or the UV an ended ceremony loaded into it; the person's
  // once-authenticator leaves with its ceremony. Before: pkPageGone removed only the person's once-authenticator — on the agent's
  // tab the loaded key and UV stayed until that tab's next ceremony ended (the acceptance's walk). Judged at rest, nothing said.
  const gone97 = (X, how) => X.f.push(how === 'destroyed' ? { method: 'Runtime.executionContextDestroyed', sessionId: 'S-T1', params: { executionContextId: 7 } } : { method: 'Runtime.executionContextsCleared', sessionId: 'S-T1', params: {} });
  const lendOn97 = async (road, store) => {
    const X = world2({ holders: road === 'agent' ? 'agent' : 'human', store, print: false });
    X.world.chrome = chrome6(); X.world.trace = [];
    if (road === 'agent') { await X.D.arm(PID); await until2(() => X.w() && X.w().state === 'open'); await until2(X.armed, 500); await sleep2(5); } else await X.opened();
    const opening = X.world.said.slice();
    X.start(1, 'vercel.com'); await until2(() => released(X) > 0); await atRest97(X);
    const A = authOf5(X);
    return { X, A, opening, lent: { A, keys: A ? keys7(X, A) : [], uv: A ? uv7(X, A) : false } };
  };
  for (const [road, how] of [['agent', 'destroyed'], ['agent', 'cleared'], ['person', 'destroyed'], ['person', 'cleared']]) {
    const { X, A, opening, lent } = await lendOn97(road, VAULT5());
    gone97(X, how);
    const rest = await atRest97(X);
    const r = { road, how, lent, rest, auth: authOf5(X), alive: !!A && X.world.chrome.auths.has(A), keys: A ? keys7(X, A) : [], uv: A ? uv7(X, A) : false, outcome: rec6(X, 1).outcome || null, keyRemoved: X.calls('WebAuthn.removeCredential', (m) => m.params.authenticatorId === A).length, said: X.world.said.slice(opening.length) };
    X.D.shutdown();
    const kept = road === 'agent' ? r.alive && r.auth === A && r.keyRemoved === 1 : !r.alive && !r.auth;
    ok(!!lent.A && lent.keys.join() === 'Kvault005' && lent.uv && rest && /aborted/.test(String(r.outcome)) && !r.keys.length && !r.uv && kept && !r.said.length,
      `B-97ae walk (a) the ${road}'s document ${how} mid-ceremony ⇒ its ceremony ends through the one end: at rest the key ${road === 'agent' ? 'removed once and UV off, the tab\'s own authenticator kept' : 'and UV gone with its once-authenticator'}, not one line said`, r);
  }
  {
    // … and never the NEXT document's: the page navigated (its context gone) and asked again at once in the new document
    const { X, A, opening, lent } = await lendOn97('agent', VAULT5());
    gone97(X, 'destroyed'); doc6(X, 8); X.start(2, 'vercel.com', 8);
    await until2(() => released(X) > 1, 1000); const rest = await atRest97(X);
    const r = { lent, rest, auth: authOf5(X), keys: keys7(X, A), uv: uv7(X, A), rec1: rec6(X, 1).outcome || null, rec2: rec6(X, 2).outcome || null, released: released(X), said: X.world.said.slice(opening.length) };
    X.D.shutdown();
    ok(lent.keys.join() === 'Kvault005' && rest && /aborted/.test(String(r.rec1)) && r.rec2 === 'pending' && r.released === 2 && r.auth === A && r.keys.join() === 'Kvault005' && r.uv && !r.said.length,
      'B-97ae walk (a) … never the next document\'s: a sign-in asked at once in the new document waits for the clean-up, loads its key and UV and keeps them', r);
  }
  // B-97ae walk (b): A CLEAN-UP THE BROWSER REFUSED IS SAID, NEVER BELIEVED. A step answered with an error while the tab's session
  // is live leaves the key (or the UV) where VibeSpace believed it gone: said by name in the server log, the tab named to the
  // person in the For-you tray (resolved when the tab closes — a closed tab takes its authenticator). A refused step the later
  // steps make up for (the authenticator removed) leaves nothing: not said. A session that went (its errors name it) took its
  // authenticators with it — measured on real Chrome (S12): not said.
  const refuseRun = async (road, fail) => {
    const { X, A, opening, lent } = road === 'person-cancel'
      ? await (async () => { const X = world2({ holders: 'human', print: false, store: lentStore() }); X.world.chrome = chrome97(); X.world.trace = []; await X.opened(); const opening = X.world.said.slice(); X.start(1, 'vercel.com'); await until2(() => released(X) > 0); await atRest97(X); const A = authOf5(X); return { X, A, opening, lent: { A, keys: keys7(X, A), uv: uv7(X, A) } }; })()
      : await lendOn97('agent', VAULT5());
    X.world.fail = new Map(fail);
    if (road === 'person-cancel') { X.world.hook = (args) => { if (args[1] === 'cancel') setTimeout(() => X.say({ ev: 'end', id: 1, outcome: 'cancelled', name: 'AbortError' }), 5); return 1; }; await X.D.cancelPasskey({ profileId: PID, browserKey: HK, ephemeral: false }, { by: 'user' }); X.world.hook = null; }
    else gone97(X, 'destroyed');
    await until2(() => false, 30); const rest = await atRest97(X);
    const r = { road, fail: fail.map(([m]) => m), lent, rest, keys: A ? keys7(X, A) : [], said: X.world.said.slice(opening.length), items: X.items.map((it) => it.text), fy: X.items.map((it) => it.i18n && it.i18n.text && it.i18n.text.key) };
    X.world.fail = null;
    return { X, r };
  };
  const REFUSED = 'Internal error', GONE = 'Session with given id not found.';
  {
    const { X, r } = await refuseRun('person-cancel', [['WebAuthn.removeCredential', REFUSED], ['WebAuthn.removeVirtualAuthenticator', REFUSED], ['WebAuthn.disable', REFUSED]]);
    X.f.push({ method: 'Target.targetDestroyed', params: { targetId: 'T1' } }); await sleep2(5);
    const resolved = (X.world.resolved || []).slice(); X.D.shutdown();
    ok(r.lent.keys.join() && r.rest && r.keys.length === 1 && r.said.length === 1 && /the passkey lent to the tab «Use Your Passkey» could not be taken back \(1 key\) — removeCredential: refused \(Internal error\); removeVirtualAuthenticator: refused \(Internal error\); disable: refused \(Internal error\)$/.test(r.said[0]) && r.items.length === 1 && typeof PK.leftForYouItem === 'function' && r.items[0] === PK.leftForYouItem({ tab: 'Use Your Passkey' }).text && r.fy[0] === (PK.LEFT_WORDS || {}).text && resolved.length === 1,
      'B-97ae walk (b) the browser refuses the key\'s removal, the authenticator\'s and the environment\'s on a live session ⇒ said by name ONCE (the server log names the steps), the tab named to the person in the For-you tray, resolved when the tab closes', { ...r, resolved });
  }
  {
    const { X, r } = await refuseRun('person-cancel', [['WebAuthn.removeCredential', REFUSED]]); X.D.shutdown();
    ok(r.rest && !r.keys.length && !r.said.length && !r.items.length, 'B-97ae walk (b) … ONE refused step the later steps make up for (the authenticator removed, the key with it) ⇒ nothing left, nothing said', r);
  }
  {
    const { X, r } = await refuseRun('agent', [['WebAuthn.removeCredential', REFUSED]]); X.D.shutdown();
    ok(r.rest && r.keys.join() === 'Kvault005' && r.said.length === 1 && /could not be taken back \(1 key\) — removeCredential: refused \(Internal error\)$/.test(r.said[0]) && r.items.length === 1,
      'B-97ae walk (b) … on the agent\'s road the tab\'s authenticator stays by design: a refused key removal leaves the key ⇒ said, the tab named', r);
  }
  {
    const { X, r } = await refuseRun('person-cancel', [['WebAuthn.getCredentials', GONE], ['WebAuthn.removeCredential', GONE], ['WebAuthn.setUserVerified', GONE], ['WebAuthn.removeVirtualAuthenticator', GONE], ['WebAuthn.disable', GONE]]); X.D.shutdown();
    ok(r.rest && !r.said.length && !r.items.length, 'B-97ae walk (b) … a session that went (its errors name it) took its authenticators with it — measured on real Chrome (S12) ⇒ not said', r);
  }
  // ── B-97ae ROUND 2 (the acceptance of 0723db7e0): WHAT IS SAID ABOUT A LEFTOVER IS TRUE FOR AS LONG AS IT IS SAID ──
  const leftOf = (X, tid = 'T1') => (X.w() && X.w().targets.get(tid) ? X.w().targets.get(tid).pk.left : null) || null;
  const openFy = (X) => X.items.filter((i) => i.status === 'open');
  const lend97 = async (road, opts = {}) => {
    const X = world2({ holders: road, store: VAULT5(), print: false, ...opts });
    X.world.chrome = chrome6(); X.world.trace = [];
    if (road !== 'human') { await X.D.arm(PID); await until2(() => X.w() && X.w().state === 'open'); await until2(X.armed, 500); await sleep2(5); } else await X.opened();
    const opening = X.world.said.slice();
    X.start(1, 'vercel.com'); await until2(() => released(X) > 0); await atRest97(X);
    return { X, A: authOf5(X), opening };
  };
  const leaveKey97 = async (X) => { X.world.fail = new Map([['WebAuthn.removeCredential', 'Internal error']]); gone97(X, 'destroyed'); await atRest97(X); X.world.fail = null; }; // the agent's ceremony ends with its document; the browser refuses the key's removal
  // MUST 1: THE ITEM LIVES EXACTLY AS LONG AS THE LEFTOVER — a later clean-up that finds the tab clean ends it (resolved, said),
  // the once-key goes with it (a NEW leftover on the tab is said again), and nothing untrue is said meanwhile («not loaded»)
  {
    const { X, A, opening } = await lend97('agent');
    await leaveKey97(X);
    const filed = { left: !!leftOf(X), open: openFy(X).length, said: X.world.said.slice(opening.length) };
    doc6(X, 8); X.start(2, 'vercel.com', 8); await until2(() => released(X) > 1, 1000); await atRest97(X);
    X.say({ ev: 'end', id: 2, outcome: 'ok' }, 8); await atRest97(X);
    const after = { left: leftOf(X), keys: keys7(X, A), open: openFy(X).length, resolved: (X.world.resolved || []).slice(), said: X.world.said.slice(opening.length) };
    X.start(3, 'vercel.com', 8); await until2(() => released(X) > 2, 1000); await atRest97(X);
    X.world.fail = new Map([['WebAuthn.removeCredential', 'Internal error']]); X.say({ ev: 'end', id: 3, outcome: 'ok' }, 8); await atRest97(X); X.world.fail = null;
    const again = { open: openFy(X).length, lines: X.world.said.slice(opening.length).filter((l) => /could not be taken back/.test(l)).length };
    X.D.shutdown();
    ok(filed.left && filed.open === 1 && filed.said.length === 1 && !after.left && !after.keys.length && after.open === 0 && after.resolved.length === 1 && after.said.length === 2 && /the passkey left on the tab «Use Your Passkey» is gone now \(a later clean-up found the tab clean\)$/.test(after.said[1]) && again.open === 1 && again.lines === 2,
      'B-97ae round 2 MUST 1: a later clean-up that finds the tab clean ENDS the leftover — its item resolved, said once; the once-key let go (a new leftover there is said again); the next sign-in that meets the leftover key says nothing untrue («not loaded»)', { filed, after, again });
  }
  for (const how of ['socket', 'detached', 'restart']) {
    const { X } = await lend97('agent');
    await leaveKey97(X);
    const id = (openFy(X)[0] || {}).id || null;
    if (how === 'socket') { X.f.sock().close(); await until2(() => !X.w() || X.w().state !== 'open', 500); await sleep2(10); }
    else if (how === 'detached') { X.f.push({ method: 'Target.detachedFromTarget', params: { sessionId: 'S-T1', targetId: 'T1' } }); await sleep2(10); }
    else { X.restart(); await sleep2(10); }
    const r = { how, id, resolved: (X.world.resolved || []).slice(), open: openFy(X).length, swept: (X.world.swept || []).filter((p) => p === 'pk-left:').length };
    X.D.shutdown();
    ok(!!id && r.resolved.includes(id) && r.open === 0 && r.swept === (how === 'restart' ? 2 : 1),
      `B-97ae round 2 MUST 1 … the ${how === 'socket' ? 'browser\'s socket closing' : how === 'detached' ? 'tab\'s session detaching' : 'hub restarting (shutdown, then a new hub that sweeps a past life\'s items: forYou.sweep(«pk-left:»))'} ends the leftover — it took the authenticator (S12): the item resolved`, r);
  }
  // MUST 2: «REFUSED» IS SAID ONLY OF A REFUSAL — a missed step is LOOKED at; what is said is what was seen
  {
    const { X, A, opening } = await lend97('agent', { callTimeoutMs: 60 });
    X.world.hold = new Set(['WebAuthn.removeCredential']); X.world.held = [];
    gone97(X, 'destroyed'); await until2(() => X.world.held.length > 0, 500); await sleep2(300);
    const r = { keys: keys7(X, A), left: !!leftOf(X), said: X.world.said.slice(opening.length), items: openFy(X).length };
    free7(X); await sleep2(10); X.D.shutdown();
    ok(!r.keys.length && !r.left && !r.said.length && !r.items, 'B-97ae round 2 MUST 2: a removal the browser DID but answered after callTimeoutMs is looked at — the key is gone ⇒ nothing said, no item (never «refused»)', r);
  }
  {
    const { X, opening } = await lend97('agent', { callTimeoutMs: 60 });
    X.world.hold = new Set(['WebAuthn.getCredentials']); X.world.held = [];
    gone97(X, 'destroyed'); await sleep2(400);
    const r = { left: leftOf(X), said: X.world.said.slice(opening.length), items: openFy(X).map((i) => i.text) };
    free7(X); await sleep2(10); X.D.shutdown();
    ok(!!r.left && r.left.unchecked && r.said.length === 1 && /whether the passkey lent to the tab «Use Your Passkey» was taken back could not be checked — the browser did not answer \(getCredentials: did not answer\)$/.test(r.said[0]) && r.items.length === 1 && typeof PK.leftForYouItem === 'function' && r.items[0] === PK.leftForYouItem({ tab: 'Use Your Passkey', unchecked: true }).text,
      'B-97ae round 2 MUST 2 … the look itself got no answer on a live session ⇒ «could not be checked — the browser did not answer», the item «could not check», never «refused»', r);
  }
  // MUST 3(ii): THE HANDOVER agent → person judges its removal as (b) does — refused on a live session ⇒ said, the tab named
  for (const refuse of [true, false]) {
    const { X, A, opening } = await lend97('both');
    const was = X.w().mode;
    if (refuse) X.world.fail = new Map([['WebAuthn.removeVirtualAuthenticator', 'Internal error'], ['WebAuthn.disable', 'Internal error']]);
    X.world.H.agent = false; await X.lease({ kind: 'detach', browserKey: CK, profileId: PID, sessionId: 's-c' }); await until2(() => X.w().mode === 'person', 500); await atRest97(X);
    X.world.fail = null;
    const r = { refuse, was, mode: X.w().mode, alive: X.world.chrome.auths.has(A), keys: keys7(X, A), said: X.world.said.slice(opening.length), items: openFy(X).length };
    X.D.shutdown();
    ok(was === 'agent' && r.mode === 'person' && (refuse ? r.alive && r.keys.join() === 'Kvault005' && r.said.length === 1 && /could not be taken back \(1 key\) — removeVirtualAuthenticator: refused \(Internal error\); disable: refused \(Internal error\)$/.test(r.said[0]) && r.items === 1 : !r.alive && !r.said.length && !r.items),
      `B-97ae round 2 MUST 3(ii): the agent → person handover ${refuse ? 'whose removal the browser refuses on a live session ⇒ said by name, the tab named (before: nothing — the key and UV stayed, the watch believed them gone)' : 'done ⇒ the authenticator gone, nothing said'}`, r);
  }
  // smaller 1: ONE name for the tab — the title cleaned (no bidi / invisible characters, no line breaks), else the ORIGIN, never
  // the address's path or query (a sign-in address can carry a code or an e-mail address)
  for (const [title, url, want] of [['‮evil\nline', 'https://vercel.com/login', 'evil line'], ['', 'https://vercel.com/login?token=abc123&email=me%40x.test', 'https://vercel.com']]) {
    const { X, opening } = await lend97('agent');
    const e = X.w().targets.get('T1'); e.title = title; e.url = url;
    await leaveKey97(X);
    const said = X.world.said.slice(opening.length), item = openFy(X)[0] || null, m = /the tab «([^»]*)»/.exec(said[0] || '');
    X.D.shutdown();
    ok(!!m && !!item && m[1] === want && item.i18n.text.params.tab === want && !/token|email|\?|‮|\n/.test(said[0] + item.text),
      `B-97ae round 2 (smaller 1): the tab is named the same in the log and the item — ${title ? 'its title cleaned' : 'no title ⇒ its ORIGIN'} («${want}»), never the raw title or the address's query`, { said, item: item && item.text });
  }
  // smaller 2: a cap — past `leftMax` tabs of one browser, ONE item counts the rest
  {
    const X = world2({ holders: 'agent', store: VAULT5(), print: false, two: true, leftMax: 1 });
    X.world.chrome = chrome6(); X.world.trace = [];
    await X.D.arm(PID); await until2(() => X.w() && X.w().state === 'open'); await until2(X.armed, 500); await sleep2(5);
    const sayT2 = (o, ctx = 7) => { const b = [...X.f.log].reverse().find((x) => x.method === 'Runtime.addBinding' && x.sessionId === 'S-T2'); X.f.push({ method: 'Runtime.bindingCalled', sessionId: 'S-T2', params: { name: b ? b.params.name : 'x', executionContextId: ctx, payload: JSON.stringify(o) } }); };
    X.start(1, 'vercel.com'); sayT2({ ev: 'start', id: 1, kind: 'get', rpId: 'vercel.com', origin: 'https://vercel.com' }); await until2(() => released(X) > 1, 1000); await atRest97(X);
    X.world.fail = new Map([['WebAuthn.removeCredential', 'Internal error']]);
    gone97(X, 'destroyed'); X.f.push({ method: 'Runtime.executionContextDestroyed', sessionId: 'S-T2', params: { executionContextId: 7 } }); await atRest97(X); X.world.fail = null;
    const two = openFy(X).map((i) => i.text);
    X.f.push({ method: 'Target.targetDestroyed', params: { targetId: 'T2' } }); X.f.push({ method: 'Target.targetDestroyed', params: { targetId: 'T1' } }); await sleep2(10);
    const closed = openFy(X).length;
    X.D.shutdown();
    ok(two.length === 2 && two.filter((t) => typeof PK.leftMoreItem === 'function' && t === PK.leftMoreItem({ n: 1 }).text).length === 1 && closed === 0,
      'B-97ae round 2 (smaller 2): past the cap (here 1) the next tab\'s leftover is ONE item that counts the rest — both resolved when their tabs close', { two, closed });
  }
  // smaller 3: a cancel the page did not take says so — never «No passkey request is waiting» while one is
  {
    const X = world2({ holders: 'human', print: false, store: lentStore() }); X.world.chrome = chrome97(); X.world.trace = [];
    await X.opened();
    X.start(1, 'vercel.com'); await until2(() => released(X) > 0); await atRest97(X);
    X.world.hook = (args) => (args[1] === 'cancel' ? 0 : 1);
    const cn = await X.D.cancelPasskey({ profileId: PID, browserKey: HK, ephemeral: false }, { by: 'user' });
    X.world.hook = null;
    const r = { n: cn.n, failed: cn.failed, text: cn.text, rec1: rec6(X, 1).outcome };
    X.D.shutdown();
    ok(cn.ok && r.n === 0 && r.failed === 1 && r.text === "VibeSpace could not cancel the page's passkey request (vercel.com) — the page did not take the cancel, so it is still waiting. Closing the tab ends it." && r.rec1 === 'pending',
      'B-97ae round 2 (smaller 3): a cancel the page did not take (its hook answered 0) says it could not be cancelled — never «No passkey request is waiting» while one is', r);
  }
  // MUST 3(i): A CRASHED PAGE is a page that went — measured on real Chrome (S13): Target.targetCrashed, no context event until a
  // reload, the lent key SURVIVING the crash and the reload. The crash itself ends the ceremony: at rest the key gone, nothing said;
  // the reload after it (contexts cleared, a new one) and the next sign-in there load cleanly and keep their key
  for (const road of ['agent', 'human']) {
    const { X, A, opening } = await lend97(road);
    X.f.push({ method: 'Target.targetCrashed', params: { targetId: 'T1', status: 'crashed', errorCode: 139 } });
    const rest = await atRest97(X);
    const r = { road, rest, outcome: rec6(X, 1).outcome || null, alive: !!A && X.world.chrome.auths.has(A), keys: A ? keys7(X, A) : [], uv: A ? uv7(X, A) : false, said: X.world.said.slice(opening.length) };
    X.f.push({ method: 'Runtime.executionContextsCleared', sessionId: 'S-T1', params: {} }); doc6(X, 8); X.start(2, 'vercel.com', 8);
    await until2(() => released(X) > 1, 1000); await atRest97(X);
    const A2 = authOf5(X), next = { auth: A2, keys: A2 ? keys7(X, A2) : [], rec2: rec6(X, 2).outcome || null, said: X.world.said.slice(opening.length) };
    X.D.shutdown();
    const kept = road === 'agent' ? r.alive : !r.alive;
    ok(rest && /aborted/.test(String(r.outcome)) && kept && !r.keys.length && !r.uv && !r.said.length && next.rec2 === 'pending' && next.keys.join() === 'Kvault005' && !next.said.length,
      `B-97ae round 2 MUST 3(i): the ${road === 'agent' ? "agent's" : "person's"} page CRASHES mid-ceremony (Target.targetCrashed) ⇒ its ceremony ends through the one end — at rest the key and UV gone${road === 'agent' ? ', the tab\'s authenticator kept' : ' with the once-authenticator'}, nothing said; the reload and the next sign-in there load cleanly`, { r, next });
  }
  // ── B-97ae ROUND 3 (the acceptance of 09d06e499): three places where what is said was still not what is so ──
  // MUST 1: USER VERIFICATION LEFT ON IS A LEFTOVER TOO — the key removed, the UV-off refused ⇒ said «0 keys, user verification
  // on», filed with the UV words; a later clean-up that turns it off ends it. The UV-off unanswered ⇒ «could not be checked».
  {
    const { X, A, opening } = await lend97('agent');
    X.world.fail = new Map([['WebAuthn.setUserVerified', (m) => (m.params.isUserVerified === false ? 'Internal error' : null)]]);
    gone97(X, 'destroyed'); await atRest97(X); X.world.fail = null;
    const filed = { left: leftOf(X), keys: keys7(X, A), uv: uv7(X, A), said: X.world.said.slice(opening.length), items: openFy(X).map((i) => i.text) };
    doc6(X, 8); X.start(2, 'vercel.com', 8); await until2(() => released(X) > 1, 1000); await atRest97(X);
    X.say({ ev: 'end', id: 2, outcome: 'ok' }, 8); await atRest97(X);
    const after = { left: leftOf(X), uv: uv7(X, A), open: openFy(X).length, resolved: (X.world.resolved || []).length };
    X.D.shutdown();
    ok(!!filed.left && !filed.keys.length && filed.uv && filed.said.length === 1 && /the passkey lent to the tab «Use Your Passkey» could not be taken back \(0 keys, user verification on\) — setUserVerified: refused \(Internal error\)$/.test(filed.said[0]) && filed.items.length === 1 && typeof PK.leftForYouItem === 'function' && filed.items[0] === PK.leftForYouItem({ tab: 'Use Your Passkey', uvOnly: true }).text && filed.items[0] !== PK.leftForYouItem({ tab: 'Use Your Passkey' }).text && !after.left && !after.uv && after.open === 0 && after.resolved === 1,
      'B-97ae round 3 MUST 1: the key removed but the browser refused to turn user verification off ⇒ a leftover — said «0 keys, user verification on», filed with the UV words; a later clean-up that turns it off ends it', { filed, after });
  }
  {
    const { X, opening } = await lend97('agent', { callTimeoutMs: 60 });
    X.world.hold = new Set(['WebAuthn.setUserVerified']); X.world.held = [];
    gone97(X, 'destroyed'); await sleep2(400);
    const r = { left: leftOf(X), said: X.world.said.slice(opening.length), items: openFy(X).map((i) => i.text) };
    free7(X); await sleep2(10); X.D.shutdown();
    ok(!!r.left && r.said.length === 1 && /whether user verification on the tab «Use Your Passkey» was turned off could not be checked — the browser did not answer \(setUserVerified: did not answer\)$/.test(r.said[0]) && r.items.length === 1 && typeof PK.leftForYouItem === 'function' && r.items[0] === PK.leftForYouItem({ tab: 'Use Your Passkey', unchecked: 'silent' }).text,
      'B-97ae round 3 MUST 1 … the UV-off got no answer (the key gone) ⇒ «whether user verification … was turned off could not be checked», the item «could not check» — never «it is still on that tab»', r);
  }
  // MUST 2: THE PERSON'S OWN CANCEL — the bridge carries `failed` (never `ended`), the live window says the cancel did not go through
  {
    const http = require('http'), WSm = require('ws');
    const SB = require(path.join(REPO, 'src/server/browser-stream.js')), BHS = require(path.join(REPO, 'src/browser-stream.js'));
    const target = BHS.humanTarget({ key: HK, profileId: PID, label: 'Mine' });
    const known = { humanTargetFor: () => target, humanAttach: () => ({ ok: true, take: true }), streamPortFor: async () => ({ ok: true, port: 9 }) };
    const keeper = new Proxy(known, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' ? () => undefined : undefined) });
    const OPEN1 = { state: 'passkey', passkey: { state: 'passkey_open', id: 'T1:7:1', rpId: 'vercel.com', text: 'x' }, headed: false, since: 1, profileId: PID };
    const dl = new Set();
    const dialogs = { arm: async () => ({ ok: true, watched: true }), passkeyFactOf: () => OPEN1, onChange: (fn) => { dl.add(fn); return () => dl.delete(fn); }, cancelPasskey: async () => ({ ok: true, n: 0, failed: 1, rpId: 'vercel.com', text: PK.cancelText({ n: 0, rpId: 'vercel.com', failed: 1 }) }), openOn: () => null };
    class Up { constructor() { this.readyState = 0; this.h = {}; setTimeout(() => { this.readyState = 1; if (this.h.open) this.h.open(); }, 0); } on(ev, fn) { this.h[ev] = fn; return this; } send() {} ping() {} close() { this.readyState = 3; } terminate() { this.readyState = 3; } }
    const bridge = SB.create({ keeper, activeSessions: new Map(), requestAuthed: () => true, log: { warn() {}, log() {} }, dialogs, WebSocketImpl: Up, keepaliveMs: 60000 });
    const srv = http.createServer(); srv.on('upgrade', (req, s, h) => bridge.handleUpgrade(req, s, h));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const ws = new WSm.WebSocket(`ws://127.0.0.1:${srv.address().port}${bridge.STREAM_PATH}?browse=${HK}`); const got = [];
    ws.on('message', (d) => { try { got.push(JSON.parse(String(d))); } catch { /* */ } }); await new Promise((r) => ws.on('open', r));
    await until2(() => got.some((m) => m.type === 'status' && m.state === 'upstream-open')); await sleep2(40);
    ws.send(JSON.stringify({ type: 'passkey-cancel' })); await until2(() => got.some((m) => m.type === 'passkey-ack'));
    const ack = got.find((m) => m.type === 'passkey-ack') || null;
    try { ws.close(); } catch { /* */ } bridge.shutdown(); await new Promise((r) => srv.close(() => r()));
    // the window's own passkey-ack case, sliced and run over a stub scope (as ⑨r2 MAJOR 2 does)
    const src = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8'), i0 = src.indexOf("      case 'passkey-ack':"), ackCase = i0 >= 0 ? src.slice(i0, src.indexOf('\n', i0)) : '';
    const toasts = [], st = { passkeyCancelling: true, pkRelay: { relay: 1 } };
    let run = null; try { run = new Function('st', 't', 'renderDialog', 'showToast', `return (m) => { switch (m.type) { ${ackCase}\n } };`)(st, (k) => k, () => {}, (m, o) => toasts.push({ m, o })); } catch { run = null; } // eslint-disable-line no-new-func
    if (run && ack) run(ack);
    const toast = toasts[toasts.length - 1] || null;
    ok(!!ack && ack.ok && ack.n === 0 && ack.failed === 1 && ack.ended === undefined && !!run && !!toast && toast.m === "VibeSpace could not cancel the page's passkey request — the page did not take the cancel, so it is still waiting. Closing the tab ends it." && toast.o && toast.o.type === 'error' && st.passkeyCancelling === false && !!st.pkRelay,
      'B-97ae round 3 MUST 2: the PERSON\'s Cancel the page did not take — the bridge answers `failed` (never `ended`), and the live window says it could not be cancelled and keeps the banner (never «The passkey wait had already ended»)', { ack, toast, relay: !!st.pkRelay });
  }
  // MUST 3: A TITLE THAT IS AN ADDRESS IS AN ADDRESS (an untitled page's TargetInfo.title is its URL — measured, S14): named by the
  // tab's ORIGIN; a page naming itself as another site's address is named by its own origin
  {
    const D97 = require(path.join(REPO, 'src/server/browser-dialogs.js')), U = 'https://login.example/untitled?token=abc123&email=me%40x.test'; // (the untitled form itself is measured on real Chrome: S14)
    const cases = typeof D97.tabName === 'function' ? [
      [{ title: U, url: U }, 'https://login.example'], [{ title: U.replace('https://', ''), url: U }, 'https://login.example'],
      [{ title: 'https://bank.example/login', url: 'https://vercel.com/login' }, 'https://vercel.com'], [{ title: 'vercel.com/login?next=/x', url: 'https://vercel.com/login?next=/x' }, 'https://vercel.com'],
      [{ title: 'Use Your Passkey', url: U }, 'Use Your Passkey'], [{ title: '', url: U }, 'https://login.example'], [{ title: '', url: 'data:text/html,x' }, 'this tab'],
    ].map(([inp, want]) => ({ inp, want, got: D97.tabName(inp) })) : [];
    const { X, opening } = await lend97('agent');
    const e = X.w().targets.get('T1'); e.title = 'https://vercel.com/login?token=abc123&email=me%40x.test'; e.url = e.title;
    await leaveKey97(X);
    const said = X.world.said.slice(opening.length), item = openFy(X)[0] || null;
    X.D.shutdown();
    ok(cases.length === 7 && cases.every((c) => c.got === c.want) && /the tab «https:\/\/vercel\.com» could not be taken back/.test(said[0] || '') && !!item && item.i18n.text.params.tab === 'https://vercel.com' && !/token|email/.test((said[0] || '') + item.text),
      'B-97ae round 3 MUST 3: a title that IS an address (the tab\'s own — an untitled page — or one that parses as one) is named by the tab\'s ORIGIN, in the line and the item; a real title stays', { cases: cases.filter((c) => c.got !== c.want), said, item: item && item.text });
  }
  // smaller 1: a look the browser REFUSED is not one it did not answer — two facts, two words (the line and the item)
  {
    const { X, opening } = await lend97('agent');
    X.world.fail = new Map([['WebAuthn.removeCredential', 'Internal error']]);
    X.world.onSend = (m) => { if (m.method === 'WebAuthn.removeCredential') X.world.fail.set('WebAuthn.getCredentials', 'Not allowed'); };
    gone97(X, 'destroyed'); await atRest97(X); X.world.fail = null; X.world.onSend = null;
    const said = X.world.said.slice(opening.length), item = openFy(X)[0] || null;
    X.D.shutdown();
    ok(said.length === 1 && /could not be checked — the browser refused to show what the tab holds \(removeCredential: refused \(Internal error\); getCredentials: refused \(Not allowed\)\)$/.test(said[0]) && !!item && item.detail === (PK.LEFT_WORDS || {}).refusedLookDetail,
      'B-97ae round 3 (smaller 1): a look the browser refused is said «refused to show what the tab holds» — never «did not answer» — and the item\'s detail says the same', { said, detail: item && item.detail });
  }
  // smaller 2: only what was LENT is counted as lent — a key the PAGE made, left behind, is said as what it is (the log), never filed
  {
    const { X, A, opening } = await lend97('agent');
    X.world.chrome.creds.get(A).add('UGFnZU1hZGUx'); // the page registered a passkey of its own during the ceremony
    X.world.fail = new Map([['WebAuthn.removeCredential', (m) => (String(m.params.credentialId) === 'UGFnZU1hZGUx' ? 'Internal error' : null)]]);
    gone97(X, 'destroyed'); await atRest97(X); X.world.fail = null;
    const r = { keys: keys7(X, A), said: X.world.said.slice(opening.length), items: openFy(X).length, left: !!leftOf(X) };
    X.D.shutdown();
    ok(r.keys.join() === 'UGFnZU1hZGUx' && !r.left && r.items === 0 && r.said.length === 1 && /a passkey the page made on the tab «Use Your Passkey» could not be removed from it — removeCredential: refused \(Internal error\)$/.test(r.said[0]),
      'B-97ae round 3 (smaller 2): the lent key removed, a key the PAGE made refused ⇒ never «the passkey VibeSpace lent» (no item) — said as what it is in the log', r);
  }
  // smaller 3: after a page went (a crash here), its drain sends no call that would look for its dead context
  for (const how of ['crash', 'destroyed']) {
    const { X, opening } = await lend97('human');
    const n0 = X.calls('Runtime.callFunctionOn', (m) => verbOf(m) === 'drained').length;
    if (how === 'crash') X.f.push({ method: 'Target.targetCrashed', params: { targetId: 'T1', status: 'crashed', errorCode: 139 } }); else gone97(X, 'destroyed');
    await atRest97(X);
    const r = { how, drained: X.calls('Runtime.callFunctionOn', (m) => verbOf(m) === 'drained').length - n0, said: X.world.said.slice(opening.length) };
    X.D.shutdown();
    ok(r.drained === 0 && !r.said.length, `B-97ae round 3 (smaller 3): a page that went (${how}) gets no «drained» call — its dead context is never looked for (the next sign-in waits out no callTimeoutMs)`, r);
  }
  // smaller 4: the handover's look sees the user verification like the others
  {
    const { X, opening } = await lend97('both');
    X.world.fail = new Map([['WebAuthn.removeVirtualAuthenticator', 'Internal error'], ['WebAuthn.disable', 'Internal error'], ['WebAuthn.setUserVerified', (m) => (m.params.isUserVerified === false ? 'Internal error' : null)]]);
    X.world.H.agent = false; await X.lease({ kind: 'detach', browserKey: CK, profileId: PID, sessionId: 's-c' }); await until2(() => X.w().mode === 'person', 500); await atRest97(X);
    X.world.fail = null;
    const said = X.world.said.slice(opening.length);
    X.D.shutdown();
    ok(said.length === 1 && /could not be taken back \(1 key, user verification on\) — removeVirtualAuthenticator: refused \(Internal error\); disable: refused \(Internal error\); setUserVerified: refused \(Internal error\)$/.test(said[0]),
      'B-97ae round 3 (smaller 4): the handover\'s look sees the user verification too — «1 key, user verification on»', said);
  }
  // B-97ae walk (c): THE CANCEL ENDS WHAT WAS PENDING WHEN IT WAS SENT. A sign-in whose start lands in the same socket read as
  // the cancel's answer (the page asked again at once; ws runs both frames before the await continues — measured by the
  // acceptance) is not the cancel's: it is gated and released as any other. Before: marked «cancelled» by the person, never
  // released — the page waited out its hold.
  {
    const X = world2({ holders: 'human', print: false, store: lentStore() });
    X.world.chrome = chrome97(); X.world.trace = [];
    await X.opened();
    const opening = X.world.said.slice();
    X.start(1, 'vercel.com'); await until2(() => released(X) > 0); await atRest97(X);
    X.world.hook = (args) => { if (args[1] === 'cancel') setTimeout(() => { X.say({ ev: 'end', id: 1, outcome: 'cancelled', name: 'AbortError' }); X.start(2, 'vercel.com'); }, 0); return 1; }; // both frames before the answer
    const cn = await X.D.cancelPasskey({ profileId: PID, browserKey: HK, ephemeral: false }, { by: 'user' });
    X.world.hook = null;
    await until2(() => released(X) > 1, 1000); const rest = await atRest97(X);
    const r = { cn: { ok: cn.ok, n: cn.n }, rest, rec1: rec6(X, 1).outcome || null, rec2: rec6(X, 2).outcome || null, by2: rec6(X, 2).by || null, released: released(X), said: X.world.said.slice(opening.length) };
    X.D.shutdown();
    ok(r.cn.ok && r.cn.n === 1 && rest && r.rec1 === 'cancelled' && r.rec2 === 'pending' && r.by2 === 'human' && r.released === 2 && !r.said.length,
      'B-97ae walk (c) the Cancel ends only what was pending when it was sent: a sign-in that started in the same socket read as its answer is gated and released as any other (never marked «cancelled» by the person)', r);
  }
}

clearInterval(keepAlive);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

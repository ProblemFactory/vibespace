#!/usr/bin/env node
// THE FAKE KERNEL (lane engine-plugin, 2026-10-25) — a browser program that is not a browser: the custom kernel's CDP face for
// our suites (design-custom-browser-plugin §6.1 — the fast tier's oracle). Shaped after the kernel side's own stub (their main
// 2adc2cf: Target.* with flattened sessions, VibeSpace.getVersion), written here so no suite needs their checkout.
//   as a PROGRAM (what agent-browser or the keeper's attach road launches as «chrome»): `--version` prints FAKE_KERNEL_VERSION;
//     else it serves CDP on 127.0.0.1:<--remote-debugging-port> (0 = any), says «DevTools listening on ws://…» on stderr and
//     writes <--user-data-dir>/DevToolsActivePort (Chrome's two lines); its argv lands in <dir>/fake-kernel-argv.json and every
//     CDP method it was asked in <dir>/fake-kernel-calls.log (one JSON line each)
//   as a MODULE: startFakeKernel({port, dir}) → {port, wsUrl, calls(), close(), + the surface hands below}
// lane browser-surfaces (P1, design §2): THE SURFACE PROTOCOL — `VibeSpace.enable {surfaces:true}` per PAGE SESSION (Q2: every
// VibeSpace.* event rides that flattened session — the frame's top-level `sessionId` AND `params.targetId`), `listSurfaces
// {targetId?}`, `answerSurface {surfaceId, answerId, values?, files?, expectedOrigin?}` with the kernel's six error codes (as a
// result `{ok:false, code}` like their stub — or as a CDP error naming the code: `mode.errorsAs = 'cdp'`), `cancelSurface`.
// Q3/Q10: a session that enabled surfaces is never sent `Page.javascriptDialogOpening` (a js-dialog surface goes NATIVE only to a
// session with Page enabled and surfaces off — agent-browser's own; its `Page.handleJavaScriptDialog` answers the surface);
// `mode.leakNative` breaks that rule on purpose (the watch's belt is tested against it). Module hands: openSurface(spec),
// updateSurface(id, patch), closeSurface(id, {how, by}), surfaces(), answers() (every answerSurface asked), failNext(code).
// As a PROGRAM: a navigation to a url whose fragment says `#vs-surface=<kind>[:<dialogType>]` opens that surface on its tab and
// HOLDS the page (no load events) until the surface closes — then the page "continues" (its load events fire).
// Two more modes: `mode.holdEnable` (a Set of target ids whose Page.enable never answers — a held tab; its surfaces still list)
// and `mode.standard` (every VibeSpace.* method is not found — standard Chrome's answer; a js-dialog goes native to every page session).
// lane passkey-sink (P2, design §3): THE WEBAUTHN LEGS — `triggerWebAuthn(spec)` raises a ceremony the way the kernel side's stub does
// (their v0.1.1 e92cc2c field names): a HELD `webauthn` surface, then `VibeSpace.webauthnRequest {surfaceId, requestId, targetId, kind,
// op, origin, rpId, challenge, clientDataJSON, clientDataHash, user, pubKeyCredParams, allowCredentials, excludeCredentials,
// userVerification, residentKey, mediation, timeoutMs}` on the tab's page sessions → `{request, answerPromise}`; the promise is what
// THE PAGE gets: `VibeSpace.webauthnAnswer {surfaceId|requestId, get | create | error}` lands `{outcome:'completed', get|create}` or
// `{outcome:'cancelled', error}`; `cancelSurface` (and any answerSurface) on it lands `{outcome:'cancelled', error:'NotAllowedError'}`
// (Q4); `abortWebAuthn(requestId)` = the page's own abort (`AbortError`, the surface closed by the page). An unknown id answers
// `no_such_request`. `spec.noClientDataJSON` sends the hash alone (a kernel that keeps the JSON); `mode.features` overrides the
// three features (a kernel with surfaces but no `webauthn`). Hands: triggerWebAuthn, webauthnAnswers(), abortWebAuthn.
// lane browser-login (P3, design §4): THE CREDENTIAL LEGS in the kernel side's stub's field names (their main): `detectCredentialForm(spec)`
// raises `VibeSpace.credentialFormDetected {surfaceId, formId, targetId, frameId, origin, pageOrigin, frameOrigin, actionOrigin, kind,
// fields[{fieldId, type, role, name, label, constraints?}], hasSubmit}` on the tab's page sessions (`spec.kind` 'signup' ⇒ a user name +
// a new-password field with constraints — Q5b); `VibeSpace.fillCredential {surfaceId|formId, values, expectedOrigin, submit}` refuses
// another origin (`stale_origin`) and an unknown field id (`invalid_values`) and records `{surfaceId, count, expectedOrigin, submit}` in
// `filledCredentials()` — NEVER a value (the fake page keeps what was typed only to submit it); `submit: true` ⇒ the page takes the form:
// `VibeSpace.credentialSubmitted {surfaceId, formId, targetId, origin, pageOrigin, frameOrigin, usernameHint, password, outcome}` with what
// was filled. `submitCredentialForm(spec)` = a submission the page typed itself (the suite hands its `password`). As a PROGRAM:
// `#vs-login=<kind>` on a navigation detects a form of that kind (its origin = the url's); `#vs-typed=<user>:<password>` submits a signup
// the page typed itself.
// lane engine-distribution (主开发 with the kernel side, 2026-10-25): `mode.omitFilledPassword` = THE REAL KERNEL — no `password` in
// credentialSubmitted while the box still holds the value fillCredential wrote (its kernel-private filledByVibeSpaceValue); a value
// anyone else typed rides as before (`typeCredential({surfaceId, fieldId, value})` = someone typing over the box). Default false =
// the echo the P3 suites were written on. `submissions()` = every credentialSubmitted sent: {surfaceId, hasPassword} — never a value.
// lane vault-login-chrome r2c: every call heard carries `seq` (1, 2, … in the order this stub heard it, across its sockets) and `mark()` =
// the last one heard — a leg scopes the socket to the window it measures by its own marks (never a clock: a slow box moves calls in
// time, never in order). r2d: + `id` (the CDP id its sender gave it — a leg finds its OWN call by it, never by its look) and `tab`
// (the tab it rides: its session's target, a browser-level Target.* call's params.targetId, null = none — WHO a call is for, never
// its method's name).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');

export const FAKE_KERNEL_VERSION = 'Chromium 150.0.7871.186 vibespace-fake-kernel';
export const KINDS = Object.freeze(['js-dialog', 'http-auth', 'client-cert', 'permission', 'file-chooser', 'download', 'print', 'popup', 'select-popup', 'webauthn', 'credential', 'payment-request', 'external-protocol', 'interstitial', 'fullscreen', 'pointer-lock', 'media-picker', 'device-chooser', 'native-picker', 'suppressed']);
export const FEATURES = Object.freeze(['surfaces', 'webauthn', 'credentials']);
export const ERROR_CODES = Object.freeze(['no_such_surface', 'invalid_action', 'stale_origin', 'no_such_request', 'invalid_values', 'eval_failed']);
const PRODUCT = 'Chrome/150.0.7871.186';

/** A js-dialog surface as the kernel raises it (the bridge's shape: answers + actions, blocking, detail.dialogType). */
export function jsDialogSpec(type = 'confirm', { message = 'Are you sure?', origin = 'https://example.test', defaultPrompt = '' } = {}) {
  const prompt = type === 'prompt';
  return { kind: 'js-dialog', origin, frameOrigin: origin, title: `${type} dialog`, message,
    fields: prompt ? [{ fieldId: 'promptText', type: 'text', label: message, required: false, defaultValue: defaultPrompt }] : [],
    answers: [{ id: 'accept', label: 'OK', kind: prompt ? 'text' : 'accept' }, ...(type !== 'alert' ? [{ id: 'dismiss', label: 'Cancel', kind: 'dismiss' }] : [])],
    blocking: true, modality: 'tab-modal', detail: { dialogType: type, message, defaultPrompt } };
}

export async function startFakeKernel({ port = 0, dir = null, firstUrl = 'about:blank', mode = {} } = {}) {
  const browserId = crypto.randomUUID();
  const targets = new Map(); // targetId → {targetId, url, title, sessions:Set, held:null|surfaceId}
  const sessions = new Map(); // sessionId → {targetId, ws, page:false, vs:false}
  const surfaces = new Map(); // surfaceId → the surface as raised (+ targetId)
  const answered = [];        // every answerSurface / cancelSurface asked (the suites read it)
  const waPending = new Map(); // lane passkey-sink: surfaceId / requestId → the ceremony the page waits on
  const waAnswered = [];      // every webauthnAnswer asked
  const forms = new Map();     // lane browser-login: surfaceId → the form as detected (+ what the page holds typed: never exposed)
  const filled = [];           // every fillCredential the kernel took: {surfaceId, count, expectedOrigin, submit} — never a value
  const submitted = [];        // lane engine-distribution: every credentialSubmitted sent: {surfaceId, hasPassword} — never a value
  const feats = () => [...(Array.isArray(mode.features) ? mode.features : FEATURES)];
  const calls = [];
  let heard = 0; // lane vault-login-chrome r2c: the sequence number of the last call heard (mark())
  const logFile = dir ? path.join(dir, 'fake-kernel-calls.log') : null;
  const sockets = new Set();
  let seq = 0, sseq = 0;
  const failQueue = [];
  const info = (t) => ({ targetId: t.targetId, type: 'page', title: t.title, url: t.url, attached: t.sessions.size > 0, canAccessOpener: false, browserContextId: 'ctx-1' });
  const send = (ws, o) => { try { ws.send(JSON.stringify(o)); } catch { /* gone */ } };
  const all = (o) => { for (const ws of sockets) send(ws, o); };
  const newTarget = (url) => { const t = { targetId: 'T' + (++seq).toString(16).padStart(8, '0').toUpperCase(), url: String(url || 'about:blank'), title: String(url || 'about:blank'), sessions: new Set(), held: null }; targets.set(t.targetId, t); return t; };
  const attach = (ws, t) => { const sid = 'S' + crypto.randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase(); sessions.set(sid, { targetId: t.targetId, ws, page: false, vs: false }); t.sessions.add(sid); send(ws, { method: 'Target.attachedToTarget', params: { sessionId: sid, targetInfo: info(t), waitingForDebugger: false } }); return sid; };
  let autoAttach = false;
  newTarget(firstUrl);
  const frameOf = (t) => ({ id: t.targetId, loaderId: 'L' + t.targetId, url: t.url, domainAndRegistry: '', securityOrigin: 'null', mimeType: 'text/html', adFrameStatus: { adFrameType: 'none' }, secureContextType: 'InsecureScheme', crossOriginIsolatedContextType: 'NotIsolated', gatedAPIFeatures: [] });
  // ── the surface protocol ──
  const onTarget = (tid, fn) => { for (const [sid, s] of sessions) if (s.targetId === tid) fn(sid, s); };
  /** A VibeSpace.* event on every session of the tab that enabled surfaces (Q2: the frame's sessionId + params.targetId). */
  const vsEvent = (tid, method, params) => onTarget(tid, (sid, s) => { if (s.vs) send(s.ws, { method, params: { ...params, targetId: tid }, sessionId: sid }); });
  const loaded = (t) => { const ev = (sid, s, method, params) => send(s.ws, { method, params, sessionId: sid }); onTarget(t.targetId, (sid, s) => { ev(sid, s, 'Page.frameNavigated', { frame: frameOf(t), type: 'Navigation' }); ev(sid, s, 'Page.domContentEventFired', { timestamp: Date.now() / 1000 }); ev(sid, s, 'Page.loadEventFired', { timestamp: Date.now() / 1000 }); for (const name of ['DOMContentLoaded', 'load', 'networkIdle']) ev(sid, s, 'Page.lifecycleEvent', { frameId: t.targetId, loaderId: 'L' + t.targetId, name, timestamp: Date.now() / 1000 }); }); };
  function openSurface(spec = {}) {
    const t = targets.get(spec.targetId) || [...targets.values()][0];
    if (!t) return null;
    const surfaceId = spec.surfaceId || `surf-${spec.kind || 'generic'}-${++sseq}`;
    const now = Date.now();
    const answers = spec.answers || [{ id: 'accept', label: 'OK', kind: 'accept' }, { id: 'dismiss', label: 'Cancel', kind: 'dismiss' }];
    const s = { surfaceId, targetId: t.targetId, frameId: spec.frameId || t.targetId, kind: spec.kind || 'js-dialog', origin: spec.origin || 'https://example.test', frameOrigin: spec.frameOrigin || spec.origin || 'https://example.test',
      title: spec.title || `${spec.kind || 'js-dialog'} surface`, message: spec.message || '', fields: spec.fields || [], answers, actions: spec.actions || answers.map((a) => a.id),
      blocking: spec.blocking ?? true, blocksInput: spec.blocksInput ?? spec.blocking ?? true, modality: spec.modality || 'tab-modal', createdAt: spec.createdAt || now, openedAt: spec.openedAt || now, expiresAt: spec.expiresAt || null, detail: spec.detail || {}, ...(spec.extra || {}) };
    surfaces.set(surfaceId, s);
    if (spec.hold) t.held = surfaceId;
    vsEvent(t.targetId, 'VibeSpace.surfaceOpened', s);
    // Q3: a js-dialog goes NATIVE only to a session with Page on and surfaces off (agent-browser's own); `leakNative` = the broken kernel
    if (s.kind === 'js-dialog') onTarget(t.targetId, (sid, ss) => { if (ss.page && (!ss.vs || mode.leakNative)) send(ss.ws, { method: 'Page.javascriptDialogOpening', params: { url: t.url, message: s.message, type: (s.detail && s.detail.dialogType) || 'alert', hasBrowserHandler: true, defaultPrompt: (s.detail && s.detail.defaultPrompt) || '' }, sessionId: sid }); });
    return s;
  }
  function updateSurface(surfaceId, patch = {}) {
    const s = surfaces.get(surfaceId);
    if (!s) return { ok: false, code: 'no_such_surface' };
    const clean = {};
    for (const k of ['message', 'fields', 'answers', 'detail', 'expiresAt']) if (patch[k] !== undefined) { s[k] = patch[k]; clean[k] = patch[k]; }
    if (patch.title !== undefined) clean.title = patch.title; // a kernel that sends more than the five keys (the watch drops the rest)
    vsEvent(s.targetId, 'VibeSpace.surfaceUpdated', { surfaceId, patch: clean });
    return { ok: true };
  }
  function closeSurface(surfaceId, { how = 'answered', by = 'vibespace', outcome = null, silent = false } = {}) {
    const s = surfaces.get(surfaceId);
    if (!s) return false;
    surfaces.delete(surfaceId);
    if (!silent) vsEvent(s.targetId, 'VibeSpace.surfaceClosed', { surfaceId, how, by, reason: how === 'dismissed' ? 'cancelled' : how, outcome });
    if (s.kind === 'js-dialog') onTarget(s.targetId, (sid, ss) => { if (ss.page && (!ss.vs || mode.leakNative)) send(ss.ws, { method: 'Page.javascriptDialogClosed', params: { result: how === 'answered', userInput: '' }, sessionId: sid }); });
    const t = targets.get(s.targetId);
    if (t && t.held === surfaceId) { t.held = null; setTimeout(() => loaded(t), 5); } // the page continues
    return true;
  }
  const refuse = (code, error) => (mode.errorsAs === 'cdp' ? { __error: { code: -32000, message: `${code}: ${error}`, data: { code } } } : { ok: false, code, error });
  function answerSurface(p) {
    answered.push({ ...p, at: Date.now() });
    if (failQueue.length) { const code = failQueue.shift(); return refuse(code, `forced ${code}`); }
    const s = surfaces.get(p.surfaceId);
    if (!s) return refuse('no_such_surface', `No such surface: ${p.surfaceId}`);
    if (p.expectedOrigin && s.origin && p.expectedOrigin !== s.origin) return refuse('stale_origin', `Origin mismatch: expected ${p.expectedOrigin}, actual ${s.origin}`);
    const act = p.answerId || p.action;
    const allowed = (s.answers || []).map((a) => a.id).concat(s.actions || []);
    if (!allowed.includes(act)) return refuse('invalid_action', `Invalid answer "${act}"`);
    if (p.values && typeof p.values === 'object' && Object.keys(p.values).some((k) => !(s.fields || []).some((f) => f.fieldId === k))) return refuse('invalid_values', 'a value names no field');
    const a = (s.answers || []).find((x) => x.id === act);
    if (s.kind === 'webauthn') waEnd(s.surfaceId, { outcome: 'cancelled', error: 'NotAllowedError' }); // lane passkey-sink: a surface answer never carries a credential
    closeSurface(s.surfaceId, { how: a && a.kind === 'dismiss' ? 'dismissed' : 'answered', by: 'vibespace', outcome: { answerId: act, values: p.values || null, files: p.files || null } });
    return { ok: true, surfaceId: s.surfaceId, outcome: { answerId: act } };
  }
  // ── lane passkey-sink: the webauthn legs ──
  /** The page's promise settles (once): the ceremony leaves the pending map by both its ids. */
  function waEnd(key, result) {
    const entry = waPending.get(key);
    if (!entry) return null;
    waPending.delete(entry.surfaceId); waPending.delete(entry.requestId);
    entry.resolve(result);
    return entry;
  }
  function triggerWebAuthn(spec = {}) {
    const t = targets.get(spec.targetId) || [...targets.values()][0];
    if (!t) return null;
    const op = spec.op || spec.kind || 'get';
    const requestId = spec.requestId || `wa-fake-${++sseq}`;
    const surfaceId = spec.surfaceId || `surf-webauthn-${requestId}`;
    const origin = spec.origin || 'https://example.test';
    const challenge = spec.challenge || crypto.randomBytes(32).toString('base64url');
    const clientDataJSON = spec.clientDataJSON || Buffer.from(JSON.stringify({ type: op === 'create' ? 'webauthn.create' : 'webauthn.get', challenge, origin: spec.clientOrigin || origin, crossOrigin: false })).toString('base64url');
    const clientDataHash = spec.clientDataHash || crypto.createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest('base64url');
    const req = { surfaceId, requestId, targetId: t.targetId, frameId: t.targetId, kind: op, op, origin, rpId: spec.rpId || new URL(origin).hostname, rpName: spec.rpName || 'Example', challenge,
      ...(spec.noClientDataJSON ? {} : { clientDataJSON }), clientDataHash, user: spec.user || null, pubKeyCredParams: spec.pubKeyCredParams || [{ type: 'public-key', alg: -7 }],
      allowCredentials: spec.allowCredentials || [], excludeCredentials: spec.excludeCredentials || [], userVerification: spec.userVerification || 'preferred', residentKey: spec.residentKey || 'preferred', mediation: spec.mediation || 'optional', timeoutMs: spec.timeoutMs || 60000 };
    const answerPromise = new Promise((resolve) => { const entry = { surfaceId, requestId, req, resolve }; waPending.set(surfaceId, entry); waPending.set(requestId, entry); });
    openSurface({ surfaceId, targetId: t.targetId, kind: 'webauthn', origin, title: `Passkey ${op} (${req.rpId})`, message: `Relying party ${req.rpId} requested Passkey ${op}`, blocking: true,
      answers: [{ id: 'select', label: 'Use Passkey', kind: 'credential' }, { id: 'cancel', label: 'Cancel', kind: 'dismiss' }], detail: { requestId, op, rpId: req.rpId, userVerification: req.userVerification } });
    if (!spec.noRequest) vsEvent(t.targetId, 'VibeSpace.webauthnRequest', req);
    return { request: req, answerPromise };
  }
  function webauthnAnswer(p) {
    waAnswered.push({ ...p, at: Date.now() });
    const key = p.surfaceId || p.requestId;
    const entry = waPending.get(key);
    if (!entry) return refuse('no_such_request', `No pending webauthn request: ${key}`);
    const ok = !!(p.get || p.create);
    waEnd(key, ok ? { outcome: 'completed', ...(p.get ? { get: p.get } : {}), ...(p.create ? { create: p.create } : {}) } : { outcome: 'cancelled', error: String(p.error || 'NotAllowedError') });
    closeSurface(entry.surfaceId, { how: ok ? 'answered' : 'dismissed', by: 'vibespace', outcome: { outcome: ok ? 'completed' : 'cancelled' } });
    return { ok: true, surfaceId: entry.surfaceId, requestId: entry.requestId };
  }
  // ── lane browser-login: the credential legs ──
  const originOfUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch { return null; } };
  function detectCredentialForm(spec = {}) {
    const t = targets.get(spec.targetId) || [...targets.values()][0];
    if (!t) return null;
    const surfaceId = spec.surfaceId || spec.formId || `surf-cred-${++sseq}`;
    const origin = spec.origin || originOfUrl(t.url) || 'https://example.test';
    const kind = spec.kind || 'login';
    const fields = spec.fields || (kind === 'signup'
      ? [{ fieldId: 'f-1-1', type: 'username', role: 'username', name: 'email', label: 'Email' }, { fieldId: 'f-1-2', type: 'new-password', role: 'new-password', name: 'password', label: 'Password', constraints: spec.constraints || { minLength: 8, maxLength: 64, pattern: null, required: true } }]
      : [{ fieldId: 'f-1-1', type: 'username', role: 'username', name: 'username', label: 'Username' }, { fieldId: 'f-1-2', type: 'password', role: 'current-password', name: 'password', label: 'Password', constraints: { minLength: 8, maxLength: 128, pattern: null, required: true } }, ...(spec.otp ? [{ fieldId: 'f-1-3', type: 'otp', role: 'otp', name: 'code', label: 'Code' }] : [])]);
    const form = { surfaceId, formId: surfaceId, targetId: t.targetId, frameId: spec.frameId || 'main', origin, pageOrigin: spec.pageOrigin || origin, frameOrigin: spec.frameOrigin || origin, actionOrigin: spec.actionOrigin || origin, kind, fields, hasSubmit: spec.hasSubmit ?? true };
    forms.set(surfaceId, { form, typed: new Map(), filledBy: new Map() });
    vsEvent(t.targetId, 'VibeSpace.credentialFormDetected', form);
    return form;
  }
  function submitCredentialForm(spec = {}) {
    const f = forms.get(spec.surfaceId || spec.formId || '') || null;
    const t = targets.get((f && f.form.targetId) || spec.targetId) || [...targets.values()][0];
    if (!t) return null;
    const origin = spec.origin || (f && f.form.pageOrigin) || originOfUrl(t.url) || 'https://example.test';
    // the real kernel: the box still holds the vault's own value ⇒ no password in the event (mode.omitFilledPassword)
    const echo = spec.password && !(mode.omitFilledPassword && f && [...f.filledBy].some(([id, v]) => v === spec.password && f.typed.get(id) === v));
    submitted.push({ surfaceId: spec.surfaceId || (f && f.form.surfaceId) || null, hasPassword: !!echo });
    const ev = { surfaceId: spec.surfaceId || (f && f.form.surfaceId) || `surf-cred-${++sseq}`, formId: spec.surfaceId || (f && f.form.surfaceId) || undefined, targetId: t.targetId, origin, pageOrigin: origin, frameOrigin: origin, usernameHint: spec.usernameHint || '', ...(echo ? { password: spec.password } : {}), outcome: spec.outcome || 'navigated' };
    vsEvent(t.targetId, 'VibeSpace.credentialSubmitted', ev);
    return { surfaceId: ev.surfaceId, origin, usernameHint: ev.usernameHint, outcome: ev.outcome };
  }
  function fillCredential(p) {
    const key = p.surfaceId || p.formId || '';
    const f = forms.get(key);
    if (p.expectedOrigin && f && f.form.pageOrigin && p.expectedOrigin !== f.form.pageOrigin) return refuse('stale_origin', `Origin mismatch: expected ${p.expectedOrigin}, actual ${f.form.pageOrigin}`);
    const entries = p.values && typeof p.values === 'object' ? Object.entries(p.values) : [];
    if (!entries.length) return refuse('invalid_values', 'values required');
    if (f) for (const [id] of entries) if (!f.form.fields.some((x) => x.fieldId === id)) return refuse('invalid_values', `Unknown kernel fieldId: ${id}`);
    filled.push({ surfaceId: key || null, count: entries.length, expectedOrigin: p.expectedOrigin || null, submit: !!p.submit });
    if (f) for (const [id, v] of entries) { f.typed.set(id, String(v)); f.filledBy.set(id, String(v)); }
    if (p.submit && f) {
      const typeOf = (id) => (f.form.fields.find((x) => x.fieldId === id) || {}).type;
      const user = [...f.typed].find(([id]) => typeOf(id) === 'username');
      const pw = [...f.typed].find(([id]) => typeOf(id) === 'new-password') || [...f.typed].find(([id]) => typeOf(id) === 'password');
      setTimeout(() => submitCredentialForm({ surfaceId: key, usernameHint: user ? user[1] : '', password: pw ? pw[1] : undefined }), 5);
    }
    return { ok: true, filled: entries.length, surfaceId: key || null };
  }
  /** The page aborts its own ceremony (its AbortSignal, its timeout, a navigation): the surface closes by the page. */
  function abortWebAuthn(key) {
    const entry = waEnd(key, { outcome: 'aborted', error: 'AbortError' });
    if (entry) closeSurface(entry.surfaceId, { how: 'dismissed', by: 'page' });
    return !!entry;
  }
  function answer(ws, m) {
    const p = m.params || {};
    const ss = m.sessionId ? sessions.get(m.sessionId) : null;
    const t = ss ? targets.get(ss.targetId) : null;
    const ev = (method, params) => send(ws, { method, params, ...(m.sessionId ? { sessionId: m.sessionId } : {}) });
    if (mode.standard && /^VibeSpace\./.test(String(m.method))) return { __error: { code: -32601, message: `'${m.method}' wasn't found` } };
    switch (m.method) {
      case 'Browser.getVersion': return { protocolVersion: '1.3', product: PRODUCT, revision: '@fake', userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ${PRODUCT} Safari/537.36`, jsVersion: '15.0' };
      case 'Browser.close': setTimeout(() => close().then(() => { if (asProgram) process.exit(0); }), 10); return {};
      case 'Target.setDiscoverTargets': if (p.discover) for (const x of targets.values()) send(ws, { method: 'Target.targetCreated', params: { targetInfo: info(x) } }); return {};
      case 'Target.getTargets': return { targetInfos: [...targets.values()].map(info) };
      case 'Target.getTargetInfo': { const x = targets.get(p.targetId) || t || [...targets.values()][0]; return x ? { targetInfo: info(x) } : { targetInfo: { targetId: browserId, type: 'browser', title: '', url: '', attached: true } }; }
      case 'Target.setAutoAttach': if (!m.sessionId && p.autoAttach && !autoAttach) { autoAttach = true; for (const x of targets.values()) attach(ws, x); } return {};
      case 'Target.createTarget': { const x = newTarget(p.url); all({ method: 'Target.targetCreated', params: { targetInfo: info(x) } }); if (autoAttach) attach(ws, x); return { targetId: x.targetId }; }
      case 'Target.attachToTarget': { const x = targets.get(p.targetId); if (!x) return { __error: { code: -32602, message: 'No target with given id found' } }; return { sessionId: attach(ws, x) }; }
      case 'Target.detachFromTarget': { const sid = p.sessionId || m.sessionId; const x = targets.get((sessions.get(sid) || {}).targetId); if (x) x.sessions.delete(sid); sessions.delete(sid); return {}; }
      case 'Target.closeTarget': { const x = targets.get(p.targetId); if (!x) return { success: false }; targets.delete(x.targetId); for (const s of [...surfaces.values()]) if (s.targetId === x.targetId) surfaces.delete(s.surfaceId); all({ method: 'Target.targetDestroyed', params: { targetId: x.targetId } }); return { success: true }; }
      case 'Page.enable': if (ss) ss.page = true; if (t && mode.holdEnable && mode.holdEnable.has(t.targetId)) return { __noreply: true }; return {};
      case 'Page.getFrameTree': return { frameTree: { frame: frameOf(t || [...targets.values()][0]) } };
      case 'Page.navigate': if (t) {
        t.url = String(p.url || 'about:blank'); t.title = t.url;
        const want = /#vs-surface=([a-z-]+)(?::([a-z]+))?/.exec(t.url);
        const login = /#vs-login=([a-z-]+)/.exec(t.url), typed = /#vs-typed=([^:#]+):([^#]+)/.exec(t.url); // lane browser-login
        if (want) setTimeout(() => openSurface(want[1] === 'js-dialog' ? { ...jsDialogSpec(want[2] || 'confirm', { message: 'Leave this page?', origin: 'https://example.test' }), targetId: t.targetId, hold: true } : { kind: want[1], targetId: t.targetId, hold: true }), 30);
        else { setTimeout(() => loaded(t), 5); if (login) setTimeout(() => detectCredentialForm({ targetId: t.targetId, kind: login[1] }), 20); if (typed) { const [who, pw] = [typed[1], typed[2]].map(decodeURIComponent); setTimeout(() => submitCredentialForm({ targetId: t.targetId, usernameHint: who, password: pw }), 20); } }
      } return { frameId: t ? t.targetId : 'F', loaderId: t ? 'L' + t.targetId : 'L' };
      case 'Page.handleJavaScriptDialog': { // agent-browser's own session (surfaces off) answering the native face of a js-dialog surface
        const s = t ? [...surfaces.values()].find((x) => x.targetId === t.targetId && x.kind === 'js-dialog') : null;
        if (!s) return { __error: { code: -32602, message: 'No dialog is showing' } };
        closeSurface(s.surfaceId, { how: p.accept ? 'answered' : 'dismissed', by: 'page' });
        return {};
      }
      case 'Runtime.enable': if (t) setTimeout(() => ev('Runtime.executionContextCreated', { context: { id: 1, origin: '', name: '', uniqueId: 'U' + t.targetId, auxData: { isDefault: true, type: 'default', frameId: t.targetId } } }), 1); return {};
      case 'Runtime.evaluate': return { result: { type: 'string', value: t ? (/title/.test(String(p.expression)) ? t.title : t.url) : '' } };
      case 'VibeSpace.getVersion': return { protocol: 1, kinds: [...KINDS], features: feats() };
      case 'VibeSpace.enable': {
        if (p.expectedProtocol !== undefined && p.expectedProtocol !== null && Number(p.expectedProtocol) !== 1) return { ok: false, code: 'protocol_mismatch', protocol: 1, expectedProtocol: p.expectedProtocol };
        if (ss && p.surfaces !== false) ss.vs = true;
        return { ok: true, protocol: 1, kinds: [...KINDS], features: feats() };
      }
      case 'VibeSpace.disable': if (ss) ss.vs = false; return { ok: true };
      case 'VibeSpace.listSurfaces': return { surfaces: [...surfaces.values()].filter((s) => !p.targetId || s.targetId === p.targetId) };
      case 'VibeSpace.answerSurface': return answerSurface(p);
      case 'VibeSpace.webauthnAnswer': return webauthnAnswer(p); // lane passkey-sink
      case 'VibeSpace.fillCredential': return fillCredential(p); // lane browser-login
      case 'VibeSpace.cancelSurface': { answered.push({ ...p, cancel: true, at: Date.now() }); const s = surfaces.get(p.surfaceId); if (!s) return refuse('no_such_surface', `No such surface: ${p.surfaceId}`); if (s.kind === 'webauthn') waEnd(s.surfaceId, { outcome: 'cancelled', error: 'NotAllowedError' }); closeSurface(s.surfaceId, { how: 'dismissed', by: 'vibespace', outcome: { cancelled: true, ...(s.kind === 'webauthn' ? { error: 'NotAllowedError' } : {}) } }); return { ok: true, surfaceId: s.surfaceId }; }
      default: return {};
    }
  }
  const server = http.createServer((req, res) => {
    const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const host = `127.0.0.1:${server.address().port}`;
    if (req.url === '/json/version') return json({ Browser: PRODUCT, 'Protocol-Version': '1.3', 'User-Agent': `Mozilla/5.0 ${PRODUCT}`, 'V8-Version': '15.0', webSocketDebuggerUrl: `ws://${host}/devtools/browser/${browserId}` });
    if (req.url === '/json' || req.url === '/json/list') return json([...targets.values()].map((x) => ({ id: x.targetId, type: 'page', title: x.title, url: x.url, webSocketDebuggerUrl: `ws://${host}/devtools/page/${x.targetId}` })));
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, (ws) => {
    sockets.add(ws);
    ws.on('close', () => { sockets.delete(ws); for (const [sid, s] of [...sessions]) if (s.ws === ws) { sessions.delete(sid); const x = targets.get(s.targetId); if (x) x.sessions.delete(sid); } });
    ws.on('message', (d) => {
      let m; try { m = JSON.parse(String(d)); } catch { return; }
      const on = m.sessionId ? sessions.get(m.sessionId) : null, tab = on ? on.targetId : !m.sessionId && /^Target\./.test(String(m.method)) && m.params && m.params.targetId ? String(m.params.targetId) : null;
      calls.push({ seq: ++heard, id: Number.isInteger(m.id) ? m.id : null, method: m.method, session: !!m.sessionId, sessionId: m.sessionId || null, tab, params: m.params || {} });
      if (logFile) { try { fs.appendFileSync(logFile, JSON.stringify({ method: m.method, session: m.sessionId || null, params: m.params || {} }) + '\n'); } catch { /* best effort */ } }
      const r = answer(ws, m);
      if (r && r.__noreply) return;
      send(ws, r && r.__error ? { id: m.id, error: r.__error, ...(m.sessionId ? { sessionId: m.sessionId } : {}) } : { id: m.id, result: r || {}, ...(m.sessionId ? { sessionId: m.sessionId } : {}) });
    });
  }));
  await new Promise((r, j) => { server.once('error', j); server.listen(Number(port) || 0, '127.0.0.1', r); });
  const bound = server.address().port;
  const wsPath = `/devtools/browser/${browserId}`;
  if (dir) { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'DevToolsActivePort'), `${bound}\n${wsPath}`); } catch { /* the caller reads stderr then */ } }
  async function close() { for (const ws of sockets) { try { ws.terminate(); } catch { /* gone */ } } await new Promise((r) => server.close(() => r())); }
  return { port: bound, wsUrl: `ws://127.0.0.1:${bound}${wsPath}`, calls: () => calls.slice(), mark: () => heard, close, // lane vault-login-chrome r2c: + mark()
    // lane browser-surfaces: the suites' hands on the surface protocol
    mode, targets: () => [...targets.values()].map(info), addTarget: (url) => { const x = newTarget(url); all({ method: 'Target.targetCreated', params: { targetInfo: info(x) } }); return x.targetId; },
    openSurface, updateSurface, closeSurface, surfaces: () => [...surfaces.values()], answers: () => answered.slice(), failNext: (code) => failQueue.push(String(code)),
    triggerWebAuthn, webauthnAnswers: () => waAnswered.slice(), abortWebAuthn, // lane passkey-sink
    detectCredentialForm, submitCredentialForm, filledCredentials: () => filled.map((x) => ({ ...x })), // lane browser-login (never a value)
    submissions: () => submitted.map((x) => ({ ...x })), typeCredential: ({ surfaceId, fieldId, value }) => { const f = forms.get(surfaceId || ''); if (f) f.typed.set(String(fieldId), String(value)); return !!f; }, // lane engine-distribution: the no-echo kernel
    navigate: (tid, url) => { const x = targets.get(tid); if (!x) return false; x.url = String(url); x.title = x.url; loaded(x); return true; }, // lane browser-login: a page's own navigation (a new document)
    dropSockets: () => { for (const ws of sockets) { try { ws.terminate(); } catch { /* gone */ } } } };
}

const asProgram = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (asProgram) {
  const argv = process.argv.slice(2);
  if (argv.includes('--version')) { process.stdout.write(FAKE_KERNEL_VERSION + '\n'); process.exit(0); }
  const flag = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
  if (argv.includes('--remote-debugging-pipe')) { process.stderr.write('fake kernel: --remote-debugging-pipe is not served (a port only)\n'); process.exit(2); }
  const dir = flag('user-data-dir');
  if (dir) { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'fake-kernel-argv.json'), JSON.stringify(argv)); } catch { /* best effort */ } }
  const first = argv.filter((x) => !x.startsWith('-')).pop() || 'about:blank';
  const k = await startFakeKernel({ port: flag('remote-debugging-port') || 0, dir, firstUrl: first });
  process.stderr.write(`\nDevTools listening on ${k.wsUrl}\n`);
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => k.close().then(() => process.exit(0)));
}

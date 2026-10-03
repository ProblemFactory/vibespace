#!/usr/bin/env node
// LANE BROWSER-ADMIN chunk 1 — THE NEW PROFILE… DIALOG (the owner, 2026-09-30: "不能手动创建profile"; the only create was
// a conversation's card menu, a label and nothing else). Fast, in-process, no browser, no binary, port 0, scratch only.
//
//   ① the PURE model (src/lib/browser-new-profile-model.js): every provider is a ROW (never hidden) with its state for the
//      chosen machine and its words; CloakBrowser not installed offers Install…; a machine a provider cannot run on is
//      greyed WITH its reason; the ONE body; a refusal worded by its CODE — in en / zh / ja;
//   ② the REAL keeper: "Who can use it" chosen AT the create is judged before anything is minted (a refusal writes
//      nothing) and the record is born with its list — ONE write;
//   ③ the REAL routes over in-process express: POST /api/browser/profiles with `use` (a picked live session resolved to
//      its conversation's key by THE one resolver), the adopt route with the dialog's fields, refusals by code;
//   ④ wiring pins: the panel's New profile… and the picker's adopt rows open THE dialog (no label-only prompt left);
//   ⑤ patched copies (scripts/mutant-copy.mjs) as controls: a model that hides the rows it cannot pick, a body that
//      sends a list for "All my conversations", a keeper that judges the list after the record is minted.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : ''}`); } return !!c; };

const M = await import('../src/lib/browser-new-profile-model.js');
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;
const mkT = (dict) => (k, p) => { let s = (dict && dict[k]) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };
const tEn = mkT(null), tZh = mkT(zh), tJa = mkT(ja);
const B = require('../src/browser-profiles.js');
const ROOT = scratch('badm');
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* gone */ } });

// ═══ ① the PURE model ══════════════════════════════════════════════════════
console.log('— ① the PURE model: provider rows, machine rows, the body, the refusal words (en / zh / ja)');
const ROWS = B.providerRows({ host: null, desktopConsent: false });
const HOST_ROWS = B.providerRows({ host: 'dev-1', desktopConsent: false });
const NOT_INSTALLED = { ok: true, npm: true, state: { running: false, failed: false } };
function judgeProviders(MM) {
  const bad = [];
  const local = MM.providerChoices({ providers: ROWS, install: NOT_INSTALLED, host: null, t: tEn });
  if (local.length !== ROWS.length) bad.push(`HIDDEN: ${ROWS.length} provider rows in, ${local.length} out`);
  const by = Object.fromEntries(local.map((c) => [c.id, c]));
  const want = { chromium: 'ready', cloak: 'needs-install', cdp: 'needs-port', 'local-window': 'not-a-profile', 'cloud:browserbase': 'needs-key', 'cloud:agentcore': 'unavailable' };
  for (const [id, st] of Object.entries(want)) if (!by[id] || by[id].state !== st) bad.push(`${id}: ${by[id] && by[id].state} ≠ ${st}`);
  if (by.cloak && by.cloak.offer !== 'install') bad.push('cloak not installed offers no Install…');
  if (by.cloak && by.cloak.pickable) bad.push('cloak not installed is pickable');
  for (const c of local) if (c.pickable !== M.PICKABLE.includes(c.state)) bad.push(`${c.id}: pickable ${c.pickable} for ${c.state}`);
  for (const c of local) if (!c.pickable && !c.note) bad.push(`${c.id}: not pickable and says no reason`);
  return bad;
}
{
  ok(judgeProviders(M).length === 0, 'every provider row comes out (never hidden), each in its state, a row that cannot be picked says why, CloakBrowser not installed offers Install… and is not pickable', judgeProviders(M));
  const pc = (install) => M.providerChoices({ providers: ROWS, install, t: tEn }).find((c) => c.id === 'cloak');
  ok(pc({ code: 'already_installed', ok: false }).state === 'ready' && pc({ ok: true, npm: true, state: { running: true } }).state === 'installing' && pc({ ok: true, npm: true, state: { failed: true } }).offer === 'install-again'
    && pc({ ok: true, npm: false, state: {} }).state === 'unavailable' && pc({ ok: true, npm: false, state: {} }).offer === null && pc(null).state === 'ready',
  'CloakBrowser: installed ⇒ ready · running ⇒ installing · failed ⇒ Install again… · no npm ⇒ no button (the words say who can) · no verdict (an old server) ⇒ its row as the server says');
  const onHost = Object.fromEntries(M.providerChoices({ providers: HOST_ROWS, install: NOT_INSTALLED, host: 'dev-1', t: tEn }).map((c) => [c.id, c]));
  ok(onHost.cloak.state === 'other-machine' && onHost['cloud:browserbase'].state === 'other-machine' && onHost.chromium.state === 'ready' && onHost.cdp.state === 'needs-port',
    'on a paired machine: a key-bearing / local-only provider is that machine\'s "runs only here" (shown, not pickable), chromium and cdp stay', Object.values(onHost).map((c) => c.id + ':' + c.state));
  const consent = M.providerChoices({ providers: B.providerRows({ host: null, desktopConsent: true }), t: tEn }).find((c) => c.id === 'local-window');
  ok(consent.state === 'not-a-profile', 'tier 3 is NOT a profile even with the desktop consent on (a window target)');
  // machines
  const mach = M.machineChoices({ machines: [{ hostId: 'local' }, { hostId: 'mac', label: 'Mac', connected: false }, { hostId: 'old', label: 'Old', connected: true, capabilities: ['probe'] }, { hostId: 'dev', label: 'Dev', connected: true, capabilities: ['browser-serve'] }], t: tEn });
  ok(mach.length === 4 && mach[0].hostId === null && mach[0].pickable && mach[1].state === 'offline' && mach[2].state === 'no-browser' && mach[3].state === 'ready' && mach.filter((m) => !m.pickable).every((m) => m.note),
    'machines: this computer first; offline / an agent without the browser op greyed WITH the reason; a capable one pickable');
  const mach2 = M.machineChoices({ machines: [{ hostId: 'local' }, { hostId: 'dev', label: 'Dev', connected: true, capabilities: ['browser-serve'] }], providerOnHost: { ok: false, code: 'provider_needs_local_key' }, t: tEn });
  ok(mach2[1].state === 'provider-here-only' && !mach2[1].pickable && mach2[1].note === 'This browser runs only on the computer VibeSpace runs on.', 'a provider that runs only here greys every paired machine with that sentence (P4\'s rule)');
  ok(M.machineChoices({ machines: [], t: tEn }).length === 1, 'no machine list (the desktop route absent) ⇒ this computer alone');
  // the body
  const b0 = M.createBody({ label: '  Work  ' });
  ok(b0.ok && JSON.stringify(b0.body) === JSON.stringify({ label: 'Work', provider: 'chromium' }), 'the body: the trimmed name + the browser; "All my conversations" sends NO list (the server\'s default)', b0);
  ok(M.createBody({ label: ' ' }).code === 'label_required' && M.createBody({ label: 'x', provider: 'cdp', cdpPort: '0' }).field === 'cdpPort' && M.createBody({ label: 'x', provider: 'cdp', cdpPort: ' 9222 ' }).body.cdpPort === 9222,
    'the body: an empty name / a cdp port out of range are said beside their field, nothing sent; a good port rides as a number');
  ok(M.createBody({ label: 'x', mode: 'only', who: [] }).code === 'empty_list' && M.createBody({ label: 'x', mode: 'only', who: [{ kind: 'task', id: 'T-1' }] }).body.use.who.length === 1, '"Only these" with nobody is refused in place; with rows it carries them');
  ok(M.createBody({ label: 'x', host: 'dev', provider: 'chromium' }).body.host === 'dev' && !('host' in M.createBody({ label: 'x' }).body), 'a paired machine rides as `host`; this computer sends none');
  // verify r1 (F7): the form the picker's door draws is the SERVER's plan (rung D keeps too); only an unanswered ask falls back to the rung
  const forms = [M.adoptFormOf(null), M.adoptFormOf({ browserVariant: 'D', adoptKeeps: true }), M.adoptFormOf({ browserVariant: 'C', adoptKeeps: false }), M.adoptFormOf({ browserVariant: 'C' }), M.adoptFormOf({ browserVariant: 'D' })];
  ok(JSON.stringify(forms) === JSON.stringify([null, 'keep', 'empty', 'keep', 'empty']), 'adoptFormOf: the panel\'s own dialog ⇒ no adopt; the server\'s plan decides keep / empty; no plan ⇒ the rung (C keeps)', forms);
  const keep = M.createBody({ label: 'x', provider: 'cloak', host: 'dev', adopt: 'keep' });
  ok(keep.ok && !('provider' in keep.body) && !('host' in keep.body), 'a conversation\'s kept browser (the adopt rung) sends no browser / machine — they are its own');
  const fk = M.createBody({ label: 'x', adopt: 'keep' }), fe = M.createBody({ label: 'x', adopt: 'empty' }), fn = M.createBody({ label: 'x' });
  ok(fk.body.form === 'keep' && fe.body.form === 'empty' && !('form' in fn.body), 'verify r2 (B4): the picker\'s door names the FORM it drew (keep | empty); the panel\'s own create names none', [fk.body, fe.body, fn.body]);
  // the refusal words: every code the create / adopt routes can answer has a sentence, in all three languages
  const CODES = ['label_required', 'label_taken', 'cdp_port_required', 'unsupported-host', 'provider_needs_local_key', 'provider_local_only', 'provider_unavailable', 'provider_unknown', 'provider_needs_consent', 'tier3_is_a_window_target', 'sharing_refused', 'dir_unwritable', 'empty_list', 'no_browser_key', 'session-gone', 'unknown_task', 'unknown_conversation', 'too_many', 'adopt_failed', 'adopt_keeps_browser', 'adopt_form_changed', 'agent_forbidden'];
  const missing = CODES.filter((c) => !M.createRefusalWords({ code: c, name: 'n' }, tEn));
  ok(!missing.length && M.createRefusalWords({ code: 'something_new' }, tEn) === null, 'every refusal code of the create has its sentence; an unknown one is null (the caller adds the server\'s own — never silence)', missing);
  // i18n: every sentence the model can say exists in zh and ja (the dictionary IS the census — a missing key falls back to English silently)
  const said = new Set();
  const recT = (k) => { said.add(k); return k; };
  M.providerChoices({ providers: ROWS, install: NOT_INSTALLED, t: recT }); M.providerChoices({ providers: HOST_ROWS, install: NOT_INSTALLED, host: 'h', t: recT });
  for (const ins of [{ ok: true, npm: true, state: { running: true } }, { ok: true, npm: true, state: { failed: true } }, { ok: true, npm: false, state: {} }]) M.providerChoices({ providers: ROWS, install: ins, t: recT });
  M.providerChoices({ providers: B.providerRows({ host: null, desktopConsent: false }).map((r) => (r.id === 'local-window' ? { ...r, leaseKind: 'tab' } : r)), t: recT });
  M.machineChoices({ machines: [{ hostId: 'local' }, { hostId: 'a', connected: false }, { hostId: 'b', connected: true }, { hostId: 'c', connected: true, capabilities: ['browser-serve'] }], providerOnHost: { ok: false }, t: recT });
  for (const c of CODES) M.createRefusalWords({ code: c, why: 'remote' }, recT), M.createRefusalWords({ code: c }, recT);
  const noZh = [...said].filter((k) => !(k in zh)), noJa = [...said].filter((k) => !(k in ja));
  ok(said.size > 30 && !noZh.length && !noJa.length, `every sentence the model says (${said.size}) has a zh and a ja entry`, { noZh, noJa });
  const zhLocal = M.providerChoices({ providers: ROWS, install: NOT_INSTALLED, t: tZh }).find((c) => c.id === 'cloak');
  ok(/安装/.test(zhLocal.note) && /インストール/.test(M.providerChoices({ providers: ROWS, install: NOT_INSTALLED, t: tJa }).find((c) => c.id === 'cloak').note), 'the device\'s own language: zh / ja words, never the server\'s English');
}

// ═══ ② the REAL keeper ══════════════════════════════════════════════════════
console.log('— ② the keeper: "Who can use it" at the create — judged before the mint, born with its list, ONE write');
const K = require('../src/server/browser-keeper.js');
const KEY_A = 'bk-0000a001', KEY_B = 'bk-0000b002';
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(HOME, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
function mkKeeper(dataDir, extra = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  let notifies = 0;
  const k = K.create({ dataDir, homeDir: HOME, env: () => ({ PATH: '/usr/bin:/bin', HOME }), broadcast: () => { notifies++; }, serverSetting: () => undefined, liveKeys: () => new Set([KEY_A, KEY_B]), install: false, tickMs: 3600e3, log: quiet,
    taskInfo: (id) => (id === 'T-1' ? { title: 'Ops', archived: false } : null), hostKnown: () => false, ...extra });
  return { k, notifies: () => notifies };
}
{
  const D = path.join(ROOT, 'data-2');
  const { k, notifies } = mkKeeper(D);
  const file = path.join(D, K.STORE_FILE);
  const n0 = notifies();
  const p = k.createProfile({ label: 'Ops browser' }, { owner: { kind: 'instance', id: null }, use: { mode: 'only', who: [{ kind: 'task', id: 'T-1' }, { kind: 'session', key: KEY_A }] }, knownKeys: [KEY_A] });
  const U = B.whoMayUse(p);
  ok(U.mode === 'only' && U.who.length === 2 && U.who.some((w) => w.kind === 'task' && w.id === 'T-1') && U.who.some((w) => w.kind === 'session' && w.id === KEY_A), 'the record is BORN with its list (a Task Group + a picked conversation)', U);
  ok(notifies() - n0 === 1, 'ONE write, ONE broadcast for the create with its list (never create-then-PATCH)', notifies() - n0);
  const before = fs.readFileSync(file, 'utf8');
  const thr = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  const e1 = thr(() => k.createProfile({ label: 'Ghost' }, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-9' }] } }));
  const e2 = thr(() => k.createProfile({ label: 'Ghost' }, { use: { mode: 'only', who: [{ kind: 'session', key: KEY_B }] }, knownKeys: [] }));
  const e3 = thr(() => k.createProfile({ label: 'Ghost' }, { use: { mode: 'only', who: [] } }));
  ok(e1 && e1.code === 'unknown_task' && e2 && e2.code === 'unknown_conversation' && e3 && e3.code === 'empty_list', 'an unknown Task Group / a conversation nobody picked / an empty list ⇒ refused BY NAME (the PATCH\'s own verdict)', [e1 && e1.code, e2 && e2.code, e3 && e3.code]);
  ok(fs.readFileSync(file, 'utf8') === before && !k.list().profiles.some((x) => x.label === 'Ghost') && !fs.readdirSync(path.join(HOME, '.agent-browser')).some((d) => !k.list().profiles.some((x) => x.dir && path.basename(x.dir) === d)),
    '…and a refusal writes NOTHING: the registry byte-identical, no record, no directory minted');
  const all = k.createProfile({ label: 'Everyone' }, { owner: { kind: 'instance', id: null }, use: { mode: 'all' } });
  ok(B.whoMayUse(all).mode === 'all', '{mode:"all"} ⇒ every conversation (owner ruling A)');
}

/** verify r1 (F7): the adopt door over a rung-D conversation that kept its own directory (`R` = the routes module, or a
 *  patched copy for the control). → the answers + what moved. */
async function adoptKeepLeg(R) {
  const express = require('express');
  const D = path.join(ROOT, 'data-keep-' + Math.random().toString(36).slice(2, 8));
  const { k } = mkKeeper(D, { hostKnown: (h) => h === 'dev-1' });
  const KEY_D = 'bk-0000d0d1';
  const SCR = path.join(D, 'browser-profiles'); const kept = path.join(SCR, KEY_D); fs.mkdirSync(kept, { recursive: true });
  fs.writeFileSync(path.join(kept, 'Last Version'), '151.0.7922.34');
  const bdir = path.join(HOME, '.agent-browser', 'browsers', 'chrome-146.0.7680.153'); fs.mkdirSync(bdir, { recursive: true }); fs.writeFileSync(path.join(bdir, 'chrome'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const be = { scratchDirFor: (key) => path.join(SCR, key), resolvedProfileDir: (key) => path.join(SCR, key) };
  const active = new Map([['sess-d', { agentToken: 'vsst_' + 'd'.repeat(24), _browserKey: KEY_D, webuiName: 'Kept one', _browserVariant: 'D' }], ['sess-e', { agentToken: 'vsst_' + 'e'.repeat(24), _browserKey: 'bk-0000e0e1', webuiName: 'Empty one', _browserVariant: 'N' }]]);
  const app = express(); app.use(express.json()); R.setup({ keeper: k, activeSessions: active, browserEnv: () => be }); app.use(R.router);
  const srv = await new Promise((rr) => { const sv = app.listen(0, '127.0.0.1', () => rr(sv)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const jj = async (method, p, body) => { const res = await fetch(API + p, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const n0 = k.list().profiles.length;
  const plan = await jj('GET', '/api/browser/adopt?sessionId=sess-d'), planN = await jj('GET', '/api/browser/adopt?sessionId=sess-e');
  const refused = [];
  refused.push(await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d', label: 'Old build', provider: 'chromium', browser: { kind: 'build', version: '146.0.7680.153' } }));
  refused.push(await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d', label: 'Cloaked', provider: 'cloak' }));
  refused.push(await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d', label: 'On dev', provider: 'chromium', host: 'dev-1' }));
  const made = k.list().profiles.length - n0, dirStill = fs.existsSync(kept);
  const plain = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d', label: 'Kept as is' });
  const plainProfile = plain.json && plain.json.profile ? k.profile(plain.json.profile.id) : null;
  const emptyHost = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-e', label: 'Empty on dev', provider: 'chromium', host: 'dev-1' });
  await new Promise((rr) => srv.close(rr));
  return { plan, planN, refused, made, dirStill, plain, plainProfile, emptyHost };
}

/** verify r3 (Y4): the adopt route under an AGENT's token (an auth-off instance answers every cookie route): a bare
 *  {sessionId, label} — its own conversation, then ANOTHER conversation's id — and the dialog's GET; `R` = the routes
 *  module, or a patched copy for the control. → statuses + whether the kept directories (the user's logins) still exist. */
async function agentAdoptLeg(R) {
  const express = require('express');
  const D = path.join(ROOT, 'data-agent-adopt-' + Math.random().toString(36).slice(2, 8));
  const { k } = mkKeeper(D);
  const KD1 = 'bk-0000d1d1', KD2 = 'bk-0000d2d2', KE = 'bk-0000e1e1';
  const SCR = path.join(D, 'browser-profiles');
  for (const key of [KD1, KD2]) { const kept = path.join(SCR, key); fs.mkdirSync(kept, { recursive: true }); fs.writeFileSync(path.join(kept, 'Last Version'), '151.0.7922.34'); fs.writeFileSync(path.join(kept, 'Cookies'), 'the user signed in here'); }
  const be = { scratchDirFor: (key) => path.join(SCR, key), resolvedProfileDir: (key) => path.join(SCR, key) };
  const TOK = { d1: 'vsst_' + '1'.repeat(24), e: 'vsst_' + '2'.repeat(24) };
  const active = new Map([['sess-d1', { agentToken: TOK.d1, _browserKey: KD1, webuiName: 'Kept one', _browserVariant: 'D' }], ['sess-d2', { agentToken: 'vsst_' + '3'.repeat(24), _browserKey: KD2, webuiName: 'Kept two', _browserVariant: 'D' }], ['sess-e', { agentToken: TOK.e, _browserKey: KE, webuiName: 'Empty one', _browserVariant: 'N' }]]);
  const app = express(); app.use(express.json()); R.setup({ keeper: k, activeSessions: active, browserEnv: () => be }); app.use(R.router);
  const srv = await new Promise((rr) => { const sv = app.listen(0, '127.0.0.1', () => rr(sv)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const jj = async (method, p, body, bearer) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, code: json && json.code, adopted: json && json.adopted }; };
  const kept = (key) => fs.existsSync(path.join(SCR, key, 'Cookies'));
  const out = {};
  out.get = await jj('GET', '/api/browser/adopt?sessionId=sess-d1', undefined, TOK.d1);
  out.own = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d1', label: 'Mine, shared' }, TOK.d1);
  out.other = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d2', label: 'Theirs, shared' }, TOK.e);
  out.keptStill = [kept(KD1), kept(KD2)];
  out.made = k.list().profiles.length;
  out.user = kept(KD2) ? await jj('POST', '/api/browser/adopt', { sessionId: 'sess-d2', form: 'keep', label: 'By the user' }) : null;
  await new Promise((rr) => srv.close(rr));
  return out;
}
/** verify r2 (B4): the dialog drew the form GET answered; the conversation's rung changes before Create (keep ⇒ empty, empty
 *  ⇒ keep). `R` = the routes module or a patched copy. → each POST + what moved. */
async function adoptFlipLeg(R) {
  const express = require('express');
  const D = path.join(ROOT, 'data-flip-' + Math.random().toString(36).slice(2, 8));
  const { k } = mkKeeper(D);
  const SCR = path.join(D, 'browser-profiles'); const KD = 'bk-0000f4d1', KE = 'bk-0000f4e1';
  for (const key of [KD, KE]) { fs.mkdirSync(path.join(SCR, key), { recursive: true }); fs.writeFileSync(path.join(SCR, key, 'Last Version'), '151.0.7922.34'); }
  const be = { scratchDirFor: (key) => path.join(SCR, key), resolvedProfileDir: (key) => path.join(SCR, key) };
  const sD = { agentToken: 'vsst_' + 'f'.repeat(24), _browserKey: KD, webuiName: 'Keeps', _browserVariant: 'D' };
  const sE = { agentToken: 'vsst_' + 'g'.repeat(24), _browserKey: KE, webuiName: 'Empty', _browserVariant: 'N' };
  const app = express(); app.use(express.json()); R.setup({ keeper: k, activeSessions: new Map([['sess-fd', sD], ['sess-fe', sE]]), browserEnv: () => be }); app.use(R.router);
  const srv = await new Promise((rr) => { const sv = app.listen(0, '127.0.0.1', () => rr(sv)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const jj = async (method, p2, body) => { const res = await fetch(API + p2, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const out = {};
  const n0 = k.list().profiles.length;
  const g1 = await jj('GET', '/api/browser/adopt?sessionId=sess-fd'); sD._browserVariant = 'N';
  out.keepThenEmpty = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-fd', label: 'Said keep', form: g1.json.keep ? 'keep' : 'empty' });
  const g2 = await jj('GET', '/api/browser/adopt?sessionId=sess-fe'); sE._browserVariant = 'D';
  out.emptyThenKeep = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-fe', label: 'Said empty', provider: 'chromium', form: g2.json.keep ? 'keep' : 'empty' });
  out.made = k.list().profiles.length - n0; out.dirsStill = [fs.existsSync(path.join(SCR, KD)), fs.existsSync(path.join(SCR, KE))];
  out.gets = [g1.json.keep, g2.json.keep];
  // the form it drew still holds ⇒ applied as drawn
  out.same = await jj('POST', '/api/browser/adopt', { sessionId: 'sess-fe', label: 'Kept now', form: 'keep' });
  await new Promise((rr) => srv.close(rr));
  return out;
}

// ═══ ③ the REAL routes ══════════════════════════════════════════════════════
console.log('— ③ the routes: POST /api/browser/profiles with `use`, the adopt route with the dialog\'s fields');
let srv = null;
{
  const express = require('express');
  const R = require('../src/routes/browser.js');
  const { k } = mkKeeper(path.join(ROOT, 'data-3'));
  const active = new Map([
    ['sess-1', { agentToken: 'vsst_' + 'a'.repeat(24), _browserKey: KEY_A, webuiName: 'Mail triage' }],
    ['sess-r', { agentToken: 'vsst_' + 'r'.repeat(24), _browserKey: KEY_B, hostId: 'dev-1', webuiName: 'Remote one' }],
    ['sess-n', { agentToken: 'vsst_' + 'n'.repeat(24), _browserKey: 'bk-0000c003', webuiName: 'Fresh', _browserVariant: 'N' }],
  ]);
  const app = express(); app.use(express.json());
  R.setup({ keeper: k, activeSessions: active, browserEnv: () => null });
  app.use(R.router);
  srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body) => { const res = await fetch(API + p, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  let r = await j('POST', '/api/browser/profiles', { label: 'Vendor', provider: 'chromium', use: { mode: 'only', who: [{ kind: 'session', session: 'sess-1' }] } });
  ok(r.status === 200 && r.json.profile.owner.kind === 'only' && r.json.profile.owner.who[0].id === KEY_A, 'a picked live session (its webui id) is resolved to its conversation\'s browser key by THE one resolver, and the record is born with it', r.json);
  const n1 = k.list().profiles.length;
  r = await j('POST', '/api/browser/profiles', { label: 'Remote', use: { mode: 'only', who: [{ kind: 'session', session: 'sess-r' }] } });
  ok(r.status === 409 && r.json.code === 'no_browser_key' && r.json.why === 'remote' && k.list().profiles.length === n1, 'a conversation on another machine ⇒ refused by name (no_browser_key · remote), nothing created');
  r = await j('POST', '/api/browser/profiles', { label: 'Gone', use: { mode: 'only', who: [{ kind: 'session', session: 'sess-x' }] } });
  ok(r.status === 410 && r.json.code === 'session-gone' && k.list().profiles.length === n1, 'a conversation that stopped since the dialog drew it ⇒ session-gone (410), nothing created');
  r = await j('POST', '/api/browser/profiles', { label: 'vendor' });
  ok(r.status === 409 && r.json.code === 'label_taken', 'the same name twice ⇒ label_taken (409) — the dialog says it beside the name');
  r = await j('POST', '/api/browser/profiles', { label: 'Port', provider: 'cdp' });
  ok(r.status === 400 && r.json.code === 'cdp_port_required', 'cdp without its port ⇒ cdp_port_required');
  r = await j('POST', '/api/browser/profiles', { label: 'Elsewhere', host: 'dev-9' });
  ok(r.status === 400 && r.json.code === 'unsupported-host', 'a machine that is not paired ⇒ unsupported-host by name (never a silent local fallback)');
  r = await j('POST', '/api/browser/profiles', { label: 'Desk', provider: 'local-window' });
  ok(r.status >= 400 && ['tier3_is_a_window_target', 'provider_needs_consent'].includes(r.json.code), 'tier 3 is never a profile', r.json);
  // the picker's door: the adopt route takes the dialog's list and (an EMPTY profile — no kept directory) its fields
  r = await j('POST', '/api/browser/adopt', { sessionId: 'sess-n', label: 'Fresh profile', provider: 'chromium', use: { mode: 'only', who: [{ kind: 'session', session: 'sess-n' }, { kind: 'task', id: 'T-1' }] } });
  ok(r.status === 200 && r.json.adopted === false && r.json.profile.owner.kind === 'only' && r.json.profile.owner.who.length === 2 && r.json.pin && r.json.pin.profileId === r.json.profile.id,
    'the adopt route (the picker\'s "New persistent profile…"): the dialog\'s list rides it, the empty profile is created and the conversation pinned to it', r.json);
  r = await j('POST', '/api/browser/adopt', { sessionId: 'sess-n', label: 'Bad list', use: { mode: 'only', who: [{ kind: 'task', id: 'T-9' }] } });
  ok(r.status === 400 && r.json.code === 'unknown_task' && !k.list().profiles.some((p) => p.label === 'Bad list'), 'the adopt route refuses a bad list by name before anything is created');
  // verify r1 (F7): a rung-D conversation that KEEPS its own browser (the default since lane browser-resume) — the picker asks
  // THE plan first (GET), the dialog draws the keep form; a stale "empty" form's browser / machine / build is refused BY NAME,
  // nothing moves — never adopted with them dropped in silence (the reproduction: CloakBrowser ⇒ Chromium, Chrome 146 ⇒ default)
  const keepLeg = await adoptKeepLeg(R);
  ok(keepLeg.plan.status === 200 && keepLeg.plan.json.keep === true && keepLeg.planN.json.keep === false, 'GET /api/browser/adopt: THE plan — a rung-D conversation that keeps its browser ⇒ keep, an N one ⇒ empty (the dialog draws that form)', { d: keepLeg.plan.json, n: keepLeg.planN.json });
  ok(keepLeg.refused.every((x) => x.status === 409 && x.json.code === 'adopt_keeps_browser') && keepLeg.dirStill && keepLeg.made === 0,
    'a kept browser asked to be another build / CloakBrowser / a paired machine ⇒ 409 adopt_keeps_browser by name — the directory not moved, no profile (never a silent drop)', keepLeg.refused.map((x) => [x.status, x.json && x.json.code]));
  ok(keepLeg.plain.status === 200 && keepLeg.plain.json.adopted === true && keepLeg.plainProfile && keepLeg.plainProfile.provider === 'chromium' && !keepLeg.plainProfile.browser, '…and as it is (Chromium, this computer, its build) it is adopted with its logins', keepLeg.plain.json);
  ok(keepLeg.emptyHost.status === 200 && keepLeg.emptyHost.json.adopted === false && keepLeg.emptyHost.json.profile && keepLeg.emptyHost.json.profile.host === 'dev-1', 'an EMPTY profile from the picker on a paired machine is made there (the create\'s own verdict) — never "browser profiles are local-only" for a machine the dialog offered', keepLeg.emptyHost.json);
  // verify r2 (B4): the conversation's rung changes while the dialog is open ⇒ the POST re-judges the FORM it drew and refuses
  // by name, nothing moved (reproduced: keep ⇒ empty made an EMPTY profile under "Keeps this conversation's browser and its
  // logins"; empty ⇒ keep moved the conversation's kept directory into a profile every conversation may use)
  const flip = await adoptFlipLeg(R);
  ok(flip.gets.join() === 'true,false' && flip.keepThenEmpty.status === 409 && flip.keepThenEmpty.json.code === 'adopt_form_changed' && flip.emptyThenKeep.status === 409 && flip.emptyThenKeep.json.code === 'adopt_form_changed' && flip.made === 0 && flip.dirsStill.every(Boolean),
    'a dialog drawn keep (or empty) whose conversation changed rung before Create ⇒ 409 adopt_form_changed by name — no profile, the kept directory not moved', { k: [flip.keepThenEmpty.status, flip.keepThenEmpty.json && flip.keepThenEmpty.json.code], e: [flip.emptyThenKeep.status, flip.emptyThenKeep.json && flip.emptyThenKeep.json.code], made: flip.made, dirs: flip.dirsStill });
  ok(flip.same.status === 200 && flip.same.json.adopted === true, '…and a form that still holds is applied as drawn (the keep adopts the kept browser)', flip.same.status);
  const pkw = read('src/lib/browser-profile-picker.js'); const ZH = (await import('../src/lib/i18n-zh.js')).default, JA = (await import('../src/lib/i18n-ja.js')).default;
  ok(pkw.includes("export function adoptLabel(browserVariant) { // eslint-disable-line no-unused-vars\n  return t('New persistent profile from this conversation…');\n}") && !pkw.includes("t('New empty persistent profile (reopens the browser)…')") && ZH['New persistent profile from this conversation…'] && JA['New persistent profile from this conversation…'],
    'verify r2 (H3): the picker\'s row claims neither keep nor empty (rung D keeps too) — the dialog says which from the server\'s plan');
  // verify r3 (Y4): an AGENT's token on the adopt route — bare, with no who-list and no build (verify r1 F6 refused only those)
  // — moved its own conversation's kept browser, and by naming another session's id ANOTHER conversation's, into a profile
  // every conversation may use (reproduced: 200, the directory with the user's logins gone); the whole route is the user's
  const ag = await agentAdoptLeg(R);
  ok(ag.get.status === 403 && ag.get.code === 'agent_forbidden' && ag.own.status === 403 && ag.own.code === 'agent_forbidden' && ag.other.status === 403 && ag.other.code === 'agent_forbidden' && ag.keptStill.every(Boolean) && ag.made === 0,
    'an agent\'s token on GET / POST /api/browser/adopt — bare, its own conversation or another\'s — ⇒ 403 agent_forbidden; the kept directories stay, no profile', ag);
  ok(ag.user && ag.user.status === 200 && ag.user.adopted === true, '…and the user\'s own door (no token) still adopts the kept browser', ag.user);
  const dlw = read('src/lib/browser-new-profile.js'); const EMPTYW = "A new, empty profile — this conversation's own browser is not moved; you sign in once in the new one.";
  ok(dlw.includes(`if (adopt === 'empty') body.appendChild(el('div', 'bnew-keep chat-status-dim', t("${EMPTYW}")));`) && ZH[EMPTYW] && JA[EMPTYW], '…and the EMPTY form says it in plain words, as the keep form does (zh / ja)');
  r = await j('POST', '/api/agent/browser/new', { label: 'Agent made', use: { mode: 'only', who: [{ kind: 'task', id: 'T-1' }] } });
  ok(r.status === 401, 'the agent\'s `new` needs its token (unchanged)');
  // verify r1 (F6): "Who can use it" is the USER's — an agent's own token (an auth-off instance answers every cookie route)
  // on the create / adopt / PATCH with a list ⇒ refused by name, nothing created, nothing widened
  const RT = require('../src/routes/browser-trace.js');
  RT.setup({ keeper: k, activeSessions: active, browserEnv: () => null, serverSetting: () => undefined }); app.use(RT.router);
  const ja = async (method, p, body) => { const res = await fetch(API + p, { method, headers: { Authorization: 'Bearer vsst_' + 'a'.repeat(24), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const n6 = k.list().profiles.length;
  const a6 = await ja('POST', '/api/browser/profiles', { label: 'Agent list', use: { mode: 'only', who: [{ kind: 'task', id: 'T-1' }] } });
  const b6 = await ja('POST', '/api/browser/adopt', { sessionId: 'sess-n', label: 'Agent adopt', use: { mode: 'all' } });
  const vendor = k.list().profiles.find((p) => p.label === 'Vendor');
  const c6 = await ja('PATCH', '/api/browser/profiles/' + vendor.id, { use: { mode: 'all' } });
  ok([a6, b6, c6].every((x) => x.status === 403 && x.json && x.json.code === 'agent_forbidden') && k.list().profiles.length === n6 && k.profile(vendor.id).owner.kind === 'only',
    '"Who can use it" is the user\'s: an agent\'s token on the create / adopt / PATCH with `use` ⇒ 403 agent_forbidden — nothing created, nothing widened', { a: [a6.status, a6.json && a6.json.code], b: [b6.status, b6.json && b6.json.code], c: [c6.status, c6.json && c6.json.code] });
  // verify r1 (A6 revert table): a BUILD named by an agent's token on the create and on the adopt — refused by name, nothing
  // created (the adopt's refusal had no gate: reverting it left every suite green)
  const n7 = k.list().profiles.length;
  const a7 = await ja('POST', '/api/browser/profiles', { label: 'Agent build', browser: { kind: 'build', version: '151.0.7922.34' } });
  const b7 = await ja('POST', '/api/browser/adopt', { sessionId: 'sess-n', label: 'Agent build adopt', browser: { kind: 'build', version: '151.0.7922.34' } });
  ok([a7, b7].every((x) => x.status === 403 && x.json && x.json.code === 'agent_forbidden') && k.list().profiles.length === n7, 'which Chrome build a profile runs is the user\'s: an agent\'s token naming a build on the create / the adopt ⇒ 403 agent_forbidden, nothing created', { a: [a7.status, a7.json && a7.json.code], b: [b7.status, b7.json && b7.json.code] });
  const d6 = await ja('POST', '/api/browser/profiles', { label: 'Plain by token' });
  ok(d6.status === 200 && d6.json.profile && d6.json.profile.owner.kind === 'instance', '…a create with NO list still answers (every conversation — what the agent\'s own `new` makes too)');
}
if (srv) await new Promise((r) => srv.close(r));

// ═══ ④ wiring pins ═══════════════════════════════════════════════════════════
console.log('— ④ wiring: the panel\'s New profile… and the picker\'s adopt rows open THE dialog');
{
  const tv = read('src/lib/browser-trace-view.js');
  ok(/newBtn = el\('button', 'file-tool-btn bprof-btn bprof-new', t\('New profile…'\)\)/.test(tv) && /newBtn\.onclick = \(\) => openNewProfileDialog\(app, \{ onCreated: \(p\) => \{ if \(p && p\.id\) st\.focus = p\.id; load\(\); \} \}\)/.test(tv) && /bar\.append\(summary, spacer, newBtn,/.test(tv),
    'the Agent browser panel\'s bar carries New profile…, which opens the dialog and focuses the new row in place');
  const pk = read('src/lib/browser-profile-picker.js');
  ok(/App\.prototype\.adoptBrowserProfile = function \(s\) \{[\s\S]{0,1200}openNewProfileDialog\(this, \{ label: name, fromSession,/.test(pk) && !/showInputDialog/.test(pk), 'the picker\'s two "New persistent profile…" rows open the SAME dialog with the conversation\'s name prefilled (the label-only prompt is gone)');
  ok(/fetchJson\('\/api\/browser\/adopt\?sessionId=' \+ encodeURIComponent\(s\.webuiId\)\)\.then\(\(plan\) => [\s\S]{0,200}\{ \.\.\.s, adoptKeeps: plan\.keep \}/.test(pk) && /const adopt = adoptFormOf\(fromSession\);/.test(read('src/lib/browser-new-profile.js')),
    'verify r1 (F7): the picker asks THE plan before the dialog opens, and the dialog draws the form it names (adoptFormOf) — never the rung\'s guess');
  const dl = read('src/lib/browser-new-profile.js');
  const posts = dl.match(/fetchJson\('\/api\/browser\/(profiles|adopt)'/g) || [];
  ok(posts.length === 2 && /const r = fromSession\s*\? await fetchJson\('\/api\/browser\/adopt'[\s\S]{0,120}: await fetchJson\('\/api\/browser\/profiles', jsonPost\(c\.body\)\)/.test(dl), 'the dialog makes ONE POST per create (adopt from a conversation, else the profiles route) with the ONE body');
  // verify r3 (Y4): a 409 adopt_form_changed REOPENS the dialog on the form the server names now (the name kept, the doors
  // kept, a handoff — no dismissal), never a dialog left on a form every Create refuses again
  ok(/if \(r && r\.code === 'adopt_form_changed' && fromSession && \(r\.now === 'keep' \|\| r\.now === 'empty'\)\) \{[\s\S]{0,400}st\.handoff = true; shell\.close\(\);\s*openNewProfileDialog\(app, \{ label: nameInput\.value, fromSession: \{ \.\.\.fromSession, adoptKeeps: r\.now === 'keep' \}, onCreated, onDismissed \}\);/.test(dl) && /if \(!st\.created && !st\.handoff\) \{ try \{ onDismissed\?\.\(\); \}/.test(dl),
    'verify r3 (Y4): 409 adopt_form_changed ⇒ the dialog is reopened on the server\'s current form with the typed name and the same callbacks (a handoff, not a dismissal)');
  { const W2 = "This conversation's browser changed since this dialog opened — nothing was created; the dialog was reopened with the form that applies now."; const ZH2 = (await import('../src/lib/i18n-zh.js')).default, JA2 = (await import('../src/lib/i18n-ja.js')).default;
    ok(M.createRefusalWords({ code: 'adopt_form_changed' }) === W2 && ZH2[W2] && JA2[W2], '…and the sentence says the dialog was reopened (zh / ja)'); }
  ok(/createRefusalWords\(r, t\) \|\| buildRefusalWords\(r, t\) \|\| \(t\('Could not create the profile'\)/.test(dl), 'a refusal is said by its code (the create\'s, then the build\'s), and an unknown code still says the server\'s sentence (never silence)');
}

// ═══ ⑤ controls ═════════════════════════════════════════════════════════════
console.log('— ⑤ controls: patched copies the gates above must turn red');
{
  const MUT = mutantCopies('badm-newprof', REPO);
  const src = read('src/lib/browser-new-profile-model.js');
  const hide = src.replace("    out.push({ id, name, blurb, state, pickable: PICKABLE.includes(state), note, offer });", "    if (PICKABLE.includes(state)) out.push({ id, name, blurb, state, pickable: true, note, offer });");
  ok(hide !== src, 'control (a): the patch (a model that HIDES the rows it cannot pick) applies');
  const Mh = await import(MUT.write('src/lib/browser-new-profile-model.js', hide, 'hide'));
  ok(judgeProviders(Mh).length > 0, 'control (a): …and ① goes red on it (rows hidden)', judgeProviders(Mh));
  const allList = src.replace("  if (mode === 'only') {", "  if (mode === 'only' || mode === 'all') {");
  const Ma = await import(MUT.write('src/lib/browser-new-profile-model.js', allList, 'all-list'));
  const ba = Ma.createBody({ label: 'x', mode: 'all', who: [{ kind: 'task', id: 'T-1' }] });
  ok(allList !== src && (!ba.ok || 'use' in ba.body), 'control (b): a body that sends a list for "All my conversations" is caught by ①\'s body assertion', ba);
  const ks = read('src/server/browser-keeper.js');
  const late = ks.replace("    if (use != null) owner = ownerFromUse(use, { knownKeys, label: v.value.label });\n", '').replace("    reg.profiles.push(rec);\n    commit();\n    log.log?.(`[browser] profile ${id} \"${rec.label}\" created", "    reg.profiles.push(rec);\n    commit();\n    if (use != null) { rec.owner = ownerFromUse(use, { knownKeys, label: rec.label }); commit(); }\n    log.log?.(`[browser] profile ${id} \"${rec.label}\" created");
  ok(late !== ks, 'control (c): the patch (the list judged AFTER the record is minted) applies');
  const Kl = MUT.load('src/server/browser-keeper.js', late, 'late');
  const D = path.join(ROOT, 'data-c');
  fs.mkdirSync(D, { recursive: true });
  const kl = Kl.create({ dataDir: D, homeDir: HOME, env: () => ({ PATH: '/usr/bin:/bin', HOME }), broadcast: () => { }, liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: quiet, taskInfo: () => null, hostKnown: () => false });
  let threw = null; try { kl.createProfile({ label: 'Late' }, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-9' }] } }); } catch (e) { threw = e; }
  ok(threw && threw.code === 'unknown_task' && kl.list().profiles.some((p) => p.label === 'Late'), 'control (c): …the refusal still comes, but the record was written first — exactly what ②\'s "a refusal writes NOTHING" catches');
  // verify r1 (F6): a create that takes an agent's list
  const rs = read('src/routes/browser.js');
  const open = rs.replace("  if (use !== undefined && refuseAgentBearer(req, res, USE_IS_USERS)) return;\n", '');
  ok(open !== rs, 'control (d): the patch (a create that takes an agent\'s who-list) applies');
  const Ro = MUT.load('src/routes/browser.js', open, 'use-open');
  const { k: ko } = mkKeeper(path.join(ROOT, 'data-co'));
  const express = require('express');
  const appo = express(); appo.use(express.json()); Ro.setup({ keeper: ko, activeSessions: new Map(), browserEnv: () => null }); appo.use(Ro.router);
  const so = await new Promise((r) => { const s = appo.listen(0, '127.0.0.1', () => r(s)); });
  const ro = await fetch(`http://127.0.0.1:${so.address().port}/api/browser/profiles`, { method: 'POST', headers: { Authorization: 'Bearer vsst_' + 'a'.repeat(24), 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Opened', use: { mode: 'all' } }) });
  ok(ro.status === 200 && ko.list().profiles.some((p) => p.label === 'Opened'), 'control (d): …the agent\'s token wrote a who-list — exactly what ③ catches', ro.status);
  await new Promise((r) => so.close(r));
  // verify r1 (F7): the adopt door that keeps a directory and drops the dialog's browser / build in silence (the pre-fix shape)
  const silent = rs.replace("      const kr = adoptKeepRefusal(req.body); // verify r1 (F7): the dialog's browser / machine / build are never dropped in silence\n      if (kr) return res.status(409).json({ error: kr.error, code: kr.code, asks: kr.asks });\n", '');
  ok(silent !== rs, 'control (e): the patch (a kept directory adopted with the dialog\'s browser / build dropped) applies');
  const ce = await adoptKeepLeg(MUT.load('src/routes/browser.js', silent, 'keep-silent'));
  ok(ce.refused.some((x) => x.status === 200 && x.json && x.json.adopted === true), 'control (e): …the kept browser is adopted with the build / CloakBrowser the user picked dropped — exactly what ③\'s keep leg catches', ce.refused.map((x) => [x.status, x.json && (x.json.code || x.json.adopted)]));
  // verify r2 (B4): an adopt door that never re-judges the form it was shown (the pre-fix shape) applies the other form
  const blindForm = rs.replace("    if (form && (form === 'keep') !== !!(plan.keep && be)) return res.status(409)", "    if (false) return res.status(409)");
  ok(blindForm !== rs, 'control (f): the patch (an adopt that ignores the form the dialog drew) applies');
  const cf = await adoptFlipLeg(MUT.load('src/routes/browser.js', blindForm, 'blind-form'));
  ok(cf.keepThenEmpty.status === 200 && cf.keepThenEmpty.json.adopted === false && cf.emptyThenKeep.status === 200 && cf.emptyThenKeep.json.adopted === true && !cf.dirsStill[1], 'control (f): …"keeps its logins" made an EMPTY profile and "empty" took the conversation\'s kept directory — exactly what ③\'s flip leg catches', { k: cf.keepThenEmpty.json && cf.keepThenEmpty.json.adopted, e: cf.emptyThenKeep.json && cf.emptyThenKeep.json.adopted });
  // verify r3 (Y4): the adopt door with verify r1 (F6)'s CONDITIONAL agent gate (the pre-fix shape): a bare body passes
  const bareAgent = rs.replace("  if (refuseAgentBearer(req, res, ADOPT_IS_USERS)) return;\n", "  if (req.body && req.body.browser != null && refuseAgentBearer(req, res, BUILD_IS_USERS)) return;\n  if (req.body && req.body.use !== undefined && refuseAgentBearer(req, res, USE_IS_USERS)) return;\n");
  ok(bareAgent !== rs, 'control (g): the patch (an agent token refused only with a who-list or a build) applies');
  const cg = await agentAdoptLeg(MUT.load('src/routes/browser.js', bareAgent, 'bare-agent'));
  ok(cg.own.status === 200 && cg.own.adopted === true && cg.other.status === 200 && cg.other.adopted === true && !cg.keptStill[0] && !cg.keptStill[1], 'control (g): …an agent\'s bare adopt took its own AND another conversation\'s kept browser (the logins moved) — exactly what the r3 (Y4) leg catches', cg);
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

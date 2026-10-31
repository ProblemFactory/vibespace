#!/usr/bin/env node
/**
 * LANE vault-standing-request ROUND 7 — «ALLOW FOR 1 HOUR» WHERE THE HUB CANNOT READ THE DESTINATION (the owner 2026-10-31, on a
 * run card that offered no «Always» because the hub could not read where `bash -c '… curl … -H "Authorization: Bearer $KEY" …'`
 * sends the key: 「以后对于这种情况，不清楚发往何处的话，就允许我直接给agent … 1个小时授权吧 … 如果攻击者通过钓鱼我的agent来让它发送密钥到未知地
 * 方，那得正好是我给了授权之后一个小时之内攻击才行，我此时也大概率能发现。你可以每次自动允许也弹个notification，但不常驻到inbox。」).
 * FAST — a real vault engine (scratch, set up + unlocked), a real grants store on disk, the ONE writer (src/server/vault-use-grants.js),
 * the run door, the For-you store, ONE clock for the door, the writer and the store (moved by hand); fake tools in a read-only
 * folder; the door's notice road is a stub that de-dupes BY KEY per boot as server.js serverNotice does. Every rule a named leg:
 *   Ⓐ THE CARD: where it offers no hosts «Always» (a shell's inline code, a script), it offers a THIRD answer «Allow for 1 hour»
 *     (`action.window`, `facts.window`) — its own row says what the press writes, its words beside it, in every client (the tray /
 *     chat row and the For-you window's verdict, 中文); a card WITH a hosts «Always» has none; «Always (this command)» stays beside it;
 *   Ⓑ THE PRESS: 验证是你 first; it writes exactly ONE window scope — the press + WINDOW_MS, source card — on this conversation's
 *     member; the record says «allowed this conversation for 1 hour · until HH:MM · take it back in the Vault window» (the chat
 *     card's stamp, the tray's and the window's words alike); the audit line `vault-run-window`;
 *   Ⓒ THE HOUR: another command inside it (any shape, any destination) runs with NO card and files NOTHING in For you (+0 items);
 *     its run line says `scope: 'window'` + the minutes left, its use line names the grant and says the window in its purpose;
 *   Ⓓ THE NOTICE: every use pops ONE notice — a key unique per use (two uses ⇒ two payloads), level 1, worded on each device
 *     (`i18n`), the minutes left by the server's clock, «destination unknown» where it cannot be read, the hosts where it can;
 *     a use a hosts scope ALSO admits is named by the NARROWER scope (hosts) — no notice;
 *   Ⓔ THE END: past the hour the next run draws the card again (the window offered anew, its row saying the old one ended);
 *   Ⓕ A LATE CARD offers neither answer that writes: no `window`, no «允许 1 小时», the door refuses it `window_not_offered`;
 *   Ⓖ THE REDRAW (r4's law): a window written since the card was drawn ⇒ the press writes nothing, the card is drawn again
 *     (marked, its row naming the window it replaces), the next press writes;
 *   Ⓗ ✕ (revoke) takes the member back — the next run asks; Ⓘ a LOCKED vault at the press ⇒ `vault_locked`, nothing written;
 *   Ⓙ FAIL CLOSED: a window scope with no end in the store (a writer that dropped it) admits NOTHING — the next run asks;
 *   Ⓚ THE OWNER'S SAVE keeps a window exactly as it is and never mints or moves one (`window_card_only`); the CLI's words;
 *   Ⓛ ALL-OR-NOTHING across a two-entry run: the press writes the window on BOTH entries.
 * RED control: this file over 8e771b675 (r6 — no window): every leg fails BY NAME (a leg that throws is a failed leg, never a
 * crash). Mutants: r7/mutants.py (the report).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const VR = require(path.join(REPO, 'src/vault-run.js'));
const FA = require(path.join(REPO, 'src/foryou-actions.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const UG = require(path.join(REPO, 'src/server/vault-use-grants.js'));
const DOOR = require(path.join(REPO, 'src/server/vault-run-door.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const ROW = await import(new URL('../src/lib/user-todos-row.js', import.meta.url).href).catch(() => null);
const VUR = await import(new URL('../src/lib/vault-use-row.js', import.meta.url).href).catch(() => null);
const LAYOUT = await import(new URL('../src/lib/inbox-window-layout.js', import.meta.url).href).catch(() => null);
const ZH = (await import(new URL('../src/lib/i18n-zh.js', import.meta.url).href)).default;

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function leg(name, fn) { try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} — threw: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`); } }

const ROOT = scratch('vault-hour-grant');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const PW = 'second password for the window suite';
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
for (const t of ['curl', 'python3', 'sh', 'bash']) fs.writeFileSync(path.join(BIN, t), `#!/bin/sh\nif [ -n "$T" ]; then w='with T'; else w='without T'; fi\nprintf '%s ran %s\\n' '${t}' "$w"\n`, { mode: 0o555 });
fs.chmodSync(BIN, 0o555);   // read-only, declared root-owned below (programWritable false)
// the r6 rule: restore THEN remove — the read-only folder made writable first (prepended: before scratch's own exit hook)
process.prependListener('exit', () => { try { fs.chmodSync(BIN, 0o755); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) process.once(sig, () => process.exit(code));
const VALUE = ['tts', 'api', 'key', crypto.randomBytes(8).toString('hex')].join('-');   // built at runtime (never a literal secret)
const CID = 'cid-narrator-1';
const WINDOW_MS = 3600e3;   // the ruling's hour (the model's own constant is read where it exists — a base tree has none)
const MIN = 60e3;

let worldN = 0;
async function world({ timers } = {}) {
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(work, 'transcribe.py'), 'print("segment")\n');
  const clock = { at: Date.now() };
  const now = () => clock.at;
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false, bcast: () => {} });
  await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 0, now });
  const grants = GS.create({ dataDir });
  const logs = [];
  const useGrants = UG.create({ grants: () => grants, vault, dataDir, now, log: (m) => logs.push(String(m)) });
  const sources = { secrets: () => VC.secretSource({ vault }) };
  const facts = (caller) => ({ conversationKeys: [caller.conversationId], groupIds: [] });
  // the notice road as server.js serverNotice is: ONE payload per key per boot (a reused key is silent), → clients reached
  const notices = [], sent = new Map();
  const notice = (key, text, o = {}) => { if (sent.has(key)) return sent.get(key); notices.push({ key, text, ...o }); sent.set(key, 1); return 1; };
  const door = DOOR.create({ dataDir, vault, userTodos, sources, instanceKind: () => 'cluster', runRoot: () => runRoot, home: os.homedir(), agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), killGraceMs: 400, pipeGraceMs: 300, liveOf: () => true, log: (m) => logs.push(String(m)), useGrants, useFacts: facts, now, notice, isRootOwned: (p) => p === BIN || String(p).startsWith(BIN + '/'), ...(timers ? { timers } : {}) });
  const caller = (cid = CID, name = 'Narrator') => ({ conversationId: cid, sessionKey: `claude:${cid}`, name, cwd: work, scope: cid });
  const e = entryOf({ vault }, 'TTS API key');
  door.setRunnable({ id: e.id, on: true, reauthed: true });   // the owner's switch: the card asks per command (his screenshot)
  return { dir, dataDir, work, vault, userTodos, grants, useGrants, door, logs, notices, caller, e, clock, now };
}
const entryOf = (w, label) => { const name = 'secret:' + crypto.randomBytes(5).toString('hex'); const put = w.vault.secretPut(name, VALUE, { prov: 'owner', label, kind: 'api-key', hosts: [] }); if (!put.ok) throw new Error('secretPut ' + put.code); return { name, id: `secrets:${name}#secret`, ref: `vault://secrets/${name}/secret` }; };
const cardsOf = (w) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-run-ask');
const itemsOf = (w) => { const s = w.userTodos.snapshot(); return (s.open || []).length + (s.resolved || []).length; };
const recordOf = (w, askId) => (w.userTodos.snapshot().resolved || []).find((i) => i.action && i.action.askId === askId) || null;
// the brief's run: a shell whose inline code sends the key — the hub cannot read where (no hosts «Always»)
const SHELL = (ref, host = 'api.tts.example') => ['--env', `T=${ref}`, '--', 'bash', '-c', `curl -s -H "Authorization: Bearer $T" https://${host}/v1/asr`];
const CURL = (ref, host) => ['--env', `T=${ref}`, '--', 'curl', '-s', `https://${host}/v1`];
async function cardAfter(w, before, until) { const t = Date.now(); while (Date.now() - t < 3000 && !until()) { const c = cardsOf(w).filter((x) => !before.has(x.id)); if (c.length) return c[c.length - 1]; await sleep(5); } return null; }
/** a run, its card (as DRAWN — the store's item is live), the answer pressed on it (or none: denied after), the run's answer */
async function runAnswered(w, args, { answer = null, reauthed = true, caller = w.caller(), deny = true } = {}) {
  let settled = false;
  const before = new Set(cardsOf(w).map((c) => c.id));
  const p = w.door.run({ caller, args, cwd: w.work }).then((r) => { settled = true; return r; });
  const card = await cardAfter(w, before, () => settled);
  const drawn = card ? JSON.parse(JSON.stringify(card)) : null;
  let a = null;
  if (card && answer) a = w.door.answer(card.action.askId, { answer, reauthed, person: true });
  if (card && deny && (!answer || (a && !a.ok))) w.door.answer(card.action.askId, { answer: 'deny' });
  return { r: await p, card, drawn, a };
}
const rowOf = (w, id = w.e.id) => { const [r] = w.grants.rowsFor('vault-use', id); return r || null; };
const memberRaw = (w, id = w.e.id, cid = CID) => { const r = rowOf(w, id); return r ? (r.to || []).find((m) => m.key === cid) || null : null; };
const windowsOf = (m) => (m && Array.isArray(m.scopes) ? m.scopes.filter((s) => s && s.kind === 'window') : []);
const auditOf = (w, event) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === event); } catch { return []; } };
const tFor = (d) => (s, p) => { let x = (d && d[s]) || s; if (p) x = x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)); return x; };
const tZH = tFor(ZH), tEN = tFor(null);
const textOf = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const drawnHtml = (item, t = tEN, opts) => (ROW && typeof ROW.runFactsHtml === 'function' && item ? ROW.runFactsHtml(item, t, opts) : '');
const answersIn = (html) => [...String(html).matchAll(/data-answer="([a-z]+)"/g)].map((m) => m[1]);
const changeRowIn = (html) => { const m = /<div class="ut-run-changes"[^>]*>([\s\S]*?)<\/div>/.exec(String(html || '')); return m ? textOf(m[1].replace(/<\/span><span/g, '</span>\n<span')) : null; };
const changeRowOf = (item, t = tZH) => changeRowIn(drawnHtml(item, t));
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

console.log('Ⓐ THE CARD — where it offers no hosts «Always», a THIRD answer «Allow for 1 hour»; its row says what the press writes');
await leg('Ⓐ the card', async () => {
  const w = await world();
  const { card, drawn } = await runAnswered(w, SHELL(w.e.ref));
  const f = drawn && drawn.facts && drawn.facts.window;
  ok(!!(drawn && drawn.action.window === true && f && f.offered === true && Math.abs(Number(f.until) - (w.now() + WINDOW_MS)) < 5 * MIN && drawn.facts.always && drawn.facts.always.offered === false), 'Ⓐa a `bash -c \'… curl … $T …\'` run (no hosts «Always»: where it sends the key cannot be read) files its card with `action.window` + `facts.window` {offered, until ≈ the draw + 1 h}', drawn && { action: drawn.action, window: f, always: drawn.facts && drawn.facts.always });
  const html = drawnHtml(drawn, tZH), v = drawn && FA.runCardOf(drawn, { t: tZH });
  ok(answersIn(html).join() === 'once,window,deny' && /允许一次/.test(textOf(html)) && /允许 1 小时/.test(textOf(html)) && /拒绝/.test(textOf(html)), 'Ⓐb the tray / chat row (中文) draws THREE answers — 允许一次 · 允许 1 小时 · 拒绝', { answers: answersIn(html), text: textOf(html).slice(0, 400) });
  const row = changeRowIn(html);
  ok(!!(row && row.includes(`「允许 1 小时」：到 ${hhmm(f.until)} 为止，这个对话可以在任何运行中使用“TTS API key”。`) && textOf(html).includes('1 小时内这个对话用这把密钥不再问你；每次使用都会弹一条提示（不进「待你处理」）；到期后再问。') && v && v.window && v.window.offered === true), 'Ⓐc its OWN row above the answers says what the press writes («到 HH:MM 为止 … 在任何运行中使用“TTS API key”»), the words beside it («1 小时内 … 每次使用都会弹一条提示（不进「待你处理」）…») — and the base\'s «No «Always»: why» stays', { row, text: textOf(html).slice(0, 600) });
  const lay = LAYOUT && LAYOUT.itemView ? LAYOUT.itemView(drawn, {}) : null;
  const acts = lay && Array.isArray(lay.actions) ? lay.actions : (LAYOUT && typeof LAYOUT.paneView === 'function' ? (LAYOUT.paneView(drawn, {}) || {}).actions : null);
  ok(!!(acts && acts.includes('hub-once') && acts.includes('shape-window') && acts.includes('hub-deny') && !acts.includes('shape-always')), 'Ⓐd the For-you window\'s action row: Allow once · Allow for 1 hour · Deny (its verdict, inbox-window-layout)', acts);
  const k = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'));
  ok(!!(k.drawn && k.drawn.action.always === true && !k.drawn.action.window && !(k.drawn.facts && k.drawn.facts.window) && !answersIn(drawnHtml(k.drawn)).includes('window')), 'Ⓐe a card WITH a hosts «Always» (curl to a host it reads) offers NO «Allow for 1 hour»', k.drawn && { action: k.drawn.action, answers: answersIn(drawnHtml(k.drawn)) });
  const c = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--', 'python3', 'transcribe.py', 'part01.mp3']);
  ok(!!(c.drawn && c.drawn.action.command === true && c.drawn.action.window === true && answersIn(drawnHtml(c.drawn)).join() === 'once,window,always,deny' && /Always \(this command\)/.test(textOf(drawnHtml(c.drawn)))), 'Ⓐf a script card keeps «Always (this command)» and the 1-hour answer sits beside it — Allow once · Allow for 1 hour · Always (this command) · Deny', c.drawn && { action: c.drawn.action, answers: answersIn(drawnHtml(c.drawn)) });
  ok(!!(card && /«Allow for 1 hour»: this conversation will be able to use “TTS API key” in any run until /.test(drawn.detail) && drawn.detail.includes('For 1 hour this conversation uses this secret without asking; each use shows a notice (never filed in For you); then it asks again.')), 'Ⓐg the card\'s prose (an older client, THE BELT\'s text) says the same two lines', drawn && drawn.detail.slice(-700));
});

console.log('Ⓑ THE PRESS — 验证是你 first; exactly ONE window scope, the press + 1 h; the record says it in every client');
await leg('Ⓑ the press', async () => {
  const w = await world();
  let settled = false;
  const before = new Set();
  const p = w.door.run({ caller: w.caller(), args: SHELL(w.e.ref), cwd: w.work }).then((r) => { settled = true; return r; });
  const card = await cardAfter(w, before, () => settled);
  const noPw = card && w.door.answer(card.action.askId, { answer: 'window', reauthed: false, person: true });
  ok(!!(noPw && noPw.ok === false && noPw.code === 'reveal_needs_password' && !memberRaw(w)), 'Ⓑa «Allow for 1 hour» without 验证是你 ⇒ reveal_needs_password, nothing written (it writes a standing grant, as «Always» does)', noPw);
  w.clock.at += 7000;   // the owner reads for 7 s, then presses
  const T = w.now();
  const yes = card && w.door.answer(card.action.askId, { answer: 'window', reauthed: true, person: true });
  if (card && !(yes && yes.ok)) w.door.answer(card.action.askId, { answer: 'deny' });   // a tree without the answer: the run settles, the leg fails by name
  const r = await p;
  const wins = windowsOf(memberRaw(w));
  ok(!!(yes && yes.ok && yes.outcome === 'window' && wins.length === 1 && wins[0].until === T + WINDOW_MS && wins[0].source === 'card' && wins[0].at === T && memberRaw(w).scopes.length === 1), 'Ⓑb the press writes EXACTLY one window scope {kind: window, until: the press + 1 h, source: card} on this conversation\'s member — nothing else', { yes, member: memberRaw(w) });
  ok(!!(r && r.ok && r.by === 'window'), 'Ⓑc the run whose card was pressed runs (by: window)', r && { ok: r.ok, code: r.code, by: r.by });
  const rec = card && recordOf(w, card.action.askId);
  const f = rec && rec.resolvedFact;
  ok(!!(rec && rec.resolvedBy === 'always' && f && f.windowFor === '1h' && f.until === T + WINDOW_MS && f.decidedBy === 'person'), 'Ⓑd the record: resolvedBy always + {windowFor: 1h, until} (the grant\'s facts, as an «always» record carries alwaysFor / until)', rec && { by: rec.resolvedBy, fact: f });
  const want = `已允许这个对话 1 小时 · 至 ${hhmm(T + WINDOW_MS)} · 可在保险库窗口收回`;
  const stamp = rec && FA.decidedStamp(rec, { t: tZH, now: T + MIN }), settled2 = rec && FA.settledWords(rec, tZH), tray = rec && ROW && ROW.resolvedByText ? ROW.resolvedByText(rec.resolvedBy, tZH, rec) : null;
  ok(!!(stamp && stamp.text === want && `${stamp.verb} · ${stamp.time}` === want && settled2 === want && tray === want), `Ⓑe the record's tail is «${want}» — the chat card's stamp (verb · time), the tray's and the For-you window's words (resolvedByText) and the quiet line (settledWords): the SAME words`, { stamp, settled2, tray });
  const ended = rec && FA.decidedStamp(rec, { t: tZH, now: T + WINDOW_MS + MIN });
  const endedWant = `已允许这个对话 1 小时 · ${tZH('ended {time}', { time: hhmm(T + WINDOW_MS) })}`;
  ok(!!(ended && ended.text === endedWant && ended.ended === 'ended'), `Ⓑf past its hour the record says it ended — «${endedWant}» (its grant's life — never «until» a time gone)`, ended);
  const au = auditOf(w, 'vault-run-window');
  ok(au.length === 1 && au[0].until === T + WINDOW_MS && au[0].conv === CID && Array.isArray(au[0].grants) && /^vg-/.test(au[0].grants[0]) && !JSON.stringify(au).includes(VALUE), 'Ⓑg ONE audit line `vault-run-window` {by, conv, shapeId, until, grants, changes} — never a value', au);
});

console.log('Ⓒ Ⓓ THE HOUR — any other run goes with NO card, files NOTHING; each use pops ONE notice (a key per use, the minutes left)');
await leg('Ⓒ Ⓓ the hour', async () => {
  const w = await world();
  const first = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
  const T = w.now();
  ok(!!(first.a && first.a.ok && first.r.ok && w.notices.length === 0), 'Ⓒa (the pressed run itself pops no notice — the owner just answered it)', { a: first.a, notices: w.notices });
  const n0 = itemsOf(w);
  w.clock.at = T + 1000;
  const u1 = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--', 'sh', '-c', 'curl -s -d @- https://elsewhere.example <<< "$T"']);
  w.clock.at = T + 30 * MIN + 1000;
  const u2 = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--', 'python3', 'transcribe.py', 'part02.mp3']);
  ok(!!(u1.r.ok && !u1.card && u2.r.ok && !u2.card && u1.r.by === 'grant' && u2.r.by === 'grant' && itemsOf(w) === n0), 'Ⓒb two OTHER commands inside the hour (another shell, a script) run with NO card — For you +0 items (no action, no notice filed)', { u1: { ok: u1.r.ok, by: u1.r.by, code: u1.r.code, card: !!u1.card }, u2: { ok: u2.r.ok, by: u2.r.by, code: u2.r.code, card: !!u2.card }, items: [n0, itemsOf(w)] });
  const runs = auditOf(w, 'vault-run').filter((l) => l.outcome === 'ran' && l.scope === 'window');
  const uses = auditOf(w, 'vault-use').filter((l) => l.door === 'run' && l.outcome === 'ok').slice(-2);
  ok(runs.length === 2 && runs[0].windowLeft === 60 && runs[1].windowLeft === 30 && runs.every((l) => Array.isArray(l.grants) && /^vg-/.test(l.grants[0])) && uses.length === 2 && uses.every((l) => /^vg-[0-9a-f]{8}$/.test(String(l.grant)) && /1-hour approval · \d+ min left/.test(String(l.purpose))) && !JSON.stringify([runs, uses]).includes(VALUE), 'Ⓒc each use: its run line says scope window + the minutes left (60, 30), its use line names the grant and says «under the 1-hour approval · N min left» (the use line\'s keys stay closed)', { runs: runs.map((l) => ({ scope: l.scope, left: l.windowLeft, grants: l.grants })), uses: uses.map((l) => ({ grant: l.grant, purpose: l.purpose })) });
  const ns = w.notices;
  const R1 = runs[0] && runs[0].receipt, R2 = runs[1] && runs[1].receipt;
  ok(ns.length === 2 && ns[0].key === `vault-window-use:${R1}` && ns[1].key === `vault-window-use:${R2}` && R1 !== R2, 'Ⓓa two uses ⇒ TWO notices, each keyed by its own run (`vault-window-use:<receipt>`) — the road de-dupes by key, so a reused key would silence the second', ns.map((n) => n.key));
  const p1 = ns[0] && ns[0].i18n && ns[0].i18n.params, p2 = ns[1] && ns[1].i18n && ns[1].i18n.params;
  ok(!!(ns.length === 2 && ns.every((n) => n.level === 1 && n.i18n && n.i18n.key === '{who} used “{entry}” under your 1-hour approval ({left} min left) — {program} → destination unknown') && p1 && p1.left === 60 && p2 && p2.left === 30 && p1.who === 'Narrator' && p1.entry === 'TTS API key' && p1.program === 'sh' && p2.program === 'python3' && /^Narrator used “TTS API key” under your 1-hour approval \(60 min left\) — sh → destination unknown$/.test(ns[0].text)), 'Ⓓb each: level 1, worded on each device ({key, params}: who, entry, the minutes LEFT by the server\'s clock — 60 then 30, the program, «destination unknown»)', ns);
  const zh = p1 && tZH(ns[0].i18n.key, p1);
  ok(zh === 'Narrator 在你的 1 小时授权下用了“TTS API key”（还剩 60 分钟）— sh → 去向未知', 'Ⓓc …in 中文: «Narrator 在你的 1 小时授权下用了“TTS API key”（还剩 60 分钟）— sh → 去向未知»', zh);
  w.clock.at = T + 40 * MIN;
  const u3 = await runAnswered(w, CURL(w.e.ref, 'upload.tts.example'));
  const n3 = w.notices[2];
  ok(!!(u3.r.ok && !u3.card && n3 && n3.i18n.key === '{who} used “{entry}” under your 1-hour approval ({left} min left) — {program} → {where}' && n3.i18n.params.where === 'upload.tts.example' && n3.i18n.params.left === 20), 'Ⓓd a use whose destination IS read (curl to a host no hosts scope holds) goes under the window too — its notice names the host (→ upload.tts.example, 20 min left)', { r: u3.r && { ok: u3.r.ok, by: u3.r.by }, n3 });
  const uses2 = w.door.usesFor(w.caller());
  const st = uses2 && Array.isArray(uses2.standing) ? uses2.standing.find((s) => s.grant) : null;
  ok(!!(st && Array.isArray(st.scopes) && st.scopes.some((s) => s.kind === 'window' && s.scope === 'any run (the 1-hour approval)' && s.until === new Date(T + WINDOW_MS).toISOString())), 'Ⓓf `vibespace-vault uses` / `list` say the window: «any run (the 1-hour approval)» with its end', st);
});

console.log('Ⓓe THE NARROWER SCOPE — a run a hosts scope ALSO admits is named by it: no window line, no notice');
await leg('Ⓓe narrowest', async () => {
  const w = await world();
  const k = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'), { answer: 'always' });   // a hosts scope first (its card's «Always»)
  const first = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
  const u4 = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'));
  const last = auditOf(w, 'vault-run').filter((l) => l.outcome === 'ran').pop();
  const u5 = await runAnswered(w, CURL(w.e.ref, 'upload.tts.example'));
  const last5 = auditOf(w, 'vault-run').filter((l) => l.outcome === 'ran').pop();
  ok(!!(k.a && k.a.ok && first.a && first.a.ok && u4.r.ok && !u4.card && last && last.scope === undefined && last.allowedBy === 'grant' && u5.r.ok && !u5.card && last5 && last5.scope === 'window' && w.notices.length === 1 && w.notices[0].key === `vault-window-use:${last5.receipt}`), 'Ⓓe the member holds api.tts.example (hosts) AND a window: a curl to api.tts.example is named by its HOSTS scope (no window line, no notice); a curl to another host goes under the window (its line, ONE notice)', { always: k.a, window: first.a, u4: last && { scope: last.scope, allowedBy: last.allowedBy }, u5: last5 && { scope: last5.scope }, notices: w.notices.map((n) => n.key) });
});

console.log('Ⓔ THE END — past the hour the next run draws the card again; its row says the old window ended');
await leg('Ⓔ the end', async () => {
  const w = await world();
  const first = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
  const T = w.now();
  w.clock.at = T + WINDOW_MS + MIN;
  const again = await runAnswered(w, SHELL(w.e.ref, 'other.tts.example'));
  const row = again.drawn && changeRowIn(drawnHtml(again.drawn, tZH));
  ok(!!(first.a && first.a.ok && again.card && again.drawn.action.window === true && row && row.includes(`这个对话在“TTS API key”上的 1 小时授权已于 ${hhmm(T + WINDOW_MS)} 结束`)), 'Ⓔ an hour and a minute later the next run draws its card again — «Allow for 1 hour» offered anew, its row saying the old window ended at HH:MM', { card: !!again.card, row, code: again.r && again.r.code });
});

console.log('Ⓕ A LATE CARD offers neither answer that writes — no `window`, no «允许 1 小时», refused by the door');
await leg('Ⓕ late card', async () => {
  const held = new Map(); let hn = 0;
  const manual = { set: (fn, ms) => { if (ms !== VR.ASK_TTL_MS) return setTimeout(fn, ms); const h = { n: ++hn, fn }; held.set(h.n, h); return h; }, clear: (h) => { if (h && h.fn) held.delete(h.n); else clearTimeout(h); } };
  const w = await world({ timers: manual });
  const p = w.door.run({ caller: w.caller(), args: SHELL(w.e.ref), cwd: w.work });
  const card = await cardAfter(w, new Set(), () => false);
  const was = card && card.action.window === true;
  for (const h of [...held.values()]) { held.delete(h.n); h.fn(); }   // its 60 s lapse
  const r = await p;
  const it = card && w.userTodos.get(card.id);
  const html = it ? drawnHtml(it, tZH) : '';
  const a = card && w.door.answer(card.action.askId, { answer: 'window', reauthed: true, person: true });
  ok(!!(was && r && r.code === 'ask_expired' && it && it.action.late === true && it.action.window === undefined && !answersIn(html).includes('window') && !/允许 1 小时/.test(textOf(html)) && changeRowIn(html) === null && a && a.code === 'window_not_offered' && !memberRaw(w)), 'Ⓕ the card gone late: its action has no `window`, the row draws 允许一次 / 拒绝 only (no «允许 1 小时», no row of what it writes), and the door refuses the press window_not_offered — nothing written', { was, r: r && r.code, action: it && it.action, answers: answersIn(html), a });
  if (card) w.door.answer(card.action.askId, { answer: 'deny' });
});

console.log('Ⓖ THE REDRAW — a window written since the card was drawn ⇒ nothing written, the card drawn again; the next press writes');
await leg('Ⓖ redraw', async () => {
  const w = await world();
  let doneA = false, doneB = false;
  const pA = w.door.run({ caller: w.caller(), args: SHELL(w.e.ref, 'a.tts.example'), cwd: w.work }).then((r) => { doneA = true; return r; });
  const cA = await cardAfter(w, new Set(), () => doneA);
  const pB = w.door.run({ caller: w.caller(), args: ['--env', `T=${w.e.ref}`, '--', 'sh', '-c', 'curl -s https://b.tts.example -H "X: $T"'], cwd: w.work }).then((r) => { doneB = true; return r; });
  const cB = await cardAfter(w, new Set([cA && cA.id]), () => doneB);
  const face0 = cB && changeRowOf(cB);
  const aA = cA && w.door.answer(cA.action.askId, { answer: 'window', reauthed: true, person: true });
  const wA = windowsOf(memberRaw(w))[0];
  w.clock.at += 2000;
  const aB1 = cB && w.door.answer(cB.action.askId, { answer: 'window', reauthed: true, person: true });
  const it = cB && w.userTodos.get(cB.id);
  const face1 = it && changeRowIn(drawnHtml(it, tZH));
  const still = windowsOf(memberRaw(w))[0];
  ok(!!(aA && aA.ok && aB1 && aB1.code === 'ask_redrawn' && still && wA && still.until === wA.until && it && it.status === 'open' && face1 && /^已于 \S+ 重新绘制/.test(face1) && face1.includes(`「允许 1 小时」会替换这个对话在“TTS API key”上到 ${hhmm(wA.until)} 为止的 1 小时授权`) && face1 !== face0), 'Ⓖa card B drawn before A\'s window was written: its press writes NOTHING (ask_redrawn), the card is drawn again — marked, its row naming the window it would replace', { aA, aB1, face0, face1 });
  const aB2 = cB && w.door.answer(cB.action.askId, { answer: 'window', reauthed: true, person: true });
  const now2 = windowsOf(memberRaw(w));
  ok(!!(aB2 && aB2.ok && now2.length === 1 && now2[0].until === w.now() + WINDOW_MS), 'Ⓖb the next press writes — ONE window, its end the new press + 1 h', { aB2, now2 });
  for (const c of [cA, cB]) if (c) w.door.answer(c.action.askId, { answer: 'deny' });   // a tree without the answer: both runs settle
  await pA; await pB;
});

console.log('Ⓗ Ⓘ ✕ TAKES IT BACK; A LOCKED VAULT AT THE PRESS WRITES NOTHING');
await leg('Ⓗ revoke', async () => {
  const w = await world();
  const first = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
  const rv = w.useGrants.revoke(w.e.id, `conversation:${CID}`);
  const next = await runAnswered(w, SHELL(w.e.ref, 'x.tts.example'));
  ok(!!(first.a && first.a.ok && rv && rv.ok && rv.removed && next.card && !memberRaw(w)), 'Ⓗ ✕ (the row\'s revoke) takes the member back, its window with it — the next run asks (its card)', { first: first.a, rv, card: !!next.card });
});
await leg('Ⓘ locked', async () => {
  const w = await world();
  let done = false;
  const p = w.door.run({ caller: w.caller(), args: SHELL(w.e.ref), cwd: w.work }).then((r) => { done = true; return r; });
  const card = await cardAfter(w, new Set(), () => done);
  const lockedGet = w.vault.state;
  w.vault.state = () => 'locked';   // the vault locks between the draw and the press (the door reads the engine's state)
  const a = card && w.door.answer(card.action.askId, { answer: 'window', reauthed: true, person: true });
  w.vault.state = lockedGet;
  if (card && !(a && a.code === 'vault_locked')) w.door.answer(card.action.askId, { answer: 'deny' });
  const r = await p;
  ok(!!(a && a.code === 'vault_locked' && !memberRaw(w) && r && r.code === 'vault_locked'), 'Ⓘ the vault locked at the press ⇒ vault_locked by name, NOTHING written, the run refused', { a, r: r && r.code, member: memberRaw(w) });
});

console.log('Ⓙ FAIL CLOSED — a window with no end in the store admits NOTHING; the next run asks');
await leg('Ⓙ no end', async () => {
  const w = await world();
  const snap = { ok: true, row: { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: [{ kind: 'window', source: 'card', at: w.now() }] }], except: [] } };   // a writer that dropped the end (stamped by the ONE writer's raw road — a valid mark)
  const put = w.useGrants.restoreRow(w.e.id, snap);
  const held = windowsOf(memberRaw(w));
  const next = await runAnswered(w, SHELL(w.e.ref));
  ok(!!(put && put.ok && held.length === 1 && held[0].until === undefined && next.card && !w.notices.length), 'Ⓙ a stored window scope with NO end (a writer that dropped it) admits nothing — the next run draws its card, no notice', { put, held, card: !!next.card, code: next.r && next.r.code });
});

console.log('Ⓚ THE OWNER\'S SAVE keeps a window as it is — never mints or moves one; the chip says it');
await leg('Ⓚ the Save', async () => {
  const w = await world();
  const first = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
  const win = windowsOf(memberRaw(w))[0];
  const pub = w.useGrants.publicFor(w.e.id);
  const pm = pub && (pub.to || []).find((m) => m.key === CID);
  const plan = VUR && VUR.saveScopesOf ? VUR.saveScopesOf({ was: pm, hosts: ['api.tts.example'], cmds: [], endId: '30d', now: w.now() }) : null;
  const kept = plan && plan.scopes.find((s) => s.kind === 'window');
  const host = plan && plan.scopes.find((s) => s.host === 'api.tts.example');
  ok(!!(first.a && first.a.ok && pm && pm.window === win.until && pm.scopes.some((s) => s.kind === 'window' && s.until === win.until && s.expired === false) && kept && kept.until === win.until && host && host.until === w.now() + 30 * 86400e3), 'Ⓚa the row lists the window (its own end); «Who may use it…»\'s Save keeps it EXACTLY as it is whatever end is chosen (a new host there takes the chosen 30 days, the window keeps its hour)', { pm: pm && { window: pm.window, scopes: pm.scopes }, plan });
  const keep = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: plan ? plan.scopes : [] }], except: [] }, { reauthed: true });
  const after = windowsOf(memberRaw(w))[0];
  const mint = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: [{ kind: 'window', until: w.now() + 50 * 86400e3 }, { host: 'api.tts.example', until: w.now() + 30 * 86400e3 }] }], except: [] }, { reauthed: true });
  const other = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: 'cid-other', name: 'Other', scopes: [{ kind: 'window', until: w.now() + WINDOW_MS }] }], except: [] }, { reauthed: true });
  ok(!!(keep && keep.ok && after && after.until === win.until && after.source === 'card' && mint && mint.code === 'window_card_only' && other && other.code === 'window_card_only' && windowsOf(memberRaw(w))[0].until === win.until), 'Ⓚb the Save that keeps it lands (its end and writer unchanged); a Save that MOVES its end, or gives another conversation one, is refused window_card_only — a window is written from the card only', { keep, after, mint: mint && mint.code, other: other && other.code });
});

console.log('Ⓛ ALL-OR-NOTHING — a two-entry run\'s press writes the window on BOTH entries');
await leg('Ⓛ two entries', async () => {
  const w = await world();
  const E2 = entryOf(w, 'Upload key');
  w.door.setRunnable({ id: E2.id, on: true, reauthed: true });
  const r = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--env', `U=${E2.ref}`, '--', 'bash', '-c', 'curl -s -H "A: $T" -H "B: $U" https://api.tts.example'], { answer: 'window' });
  const a1 = windowsOf(memberRaw(w)), a2 = windowsOf(memberRaw(w, E2.id));
  const html = r.drawn && drawnHtml(r.drawn, tZH);
  ok(!!(r.a && r.a.ok && a1.length === 1 && a2.length === 1 && a1[0].until === a2[0].until && changeRowIn(html) && changeRowIn(html).includes('“TTS API key”, “Upload key”')), 'Ⓛ the two-entry card names both («“TTS API key”, “Upload key”»), its press writes ONE window on EACH entry, the same end', { a: r.a, a1, a2, row: changeRowIn(html) });
});

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * LANE vault-standing-request ROUND 7 — «ALLOW FOR 1 HOUR» WHERE THE HUB CANNOT READ THE DESTINATION (the owner 2026-10-31, on a
 * run card that offered no «Always» because the hub could not read where `bash -c '… curl … -H "Authorization: Bearer $KEY" …'`
 * sends the key: 「以后对于这种情况，不清楚发往何处的话，就允许我直接给agent … 1个小时授权吧 … 如果攻击者通过钓鱼我的agent来让它发送密钥到未知地
 * 方，那得正好是我给了授权之后一个小时之内攻击才行，我此时也大概率能发现。你可以每次自动允许也弹个notification，但不常驻到inbox。」).
 * IN-PROCESS (1.5 s — the heavy tier since r8: the fast sum's cap) — a real vault engine (scratch, set up + unlocked), a real grants store on disk, the ONE writer (src/server/vault-use-grants.js),
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
 * ROUND 8 (主开发's adversarial acceptance of r7 e19220cc7) — EVERY DOOR LEG RUNS TWICE: as a LOCAL instance (the owner's own
 * hub: no instance name, no presets — a local instance allows a shape it saw allowed, `seen`) and as a CLUSTER (each leg's name
 * says which, «[local]» / «[cluster]»); r7 built cluster doors only, so the owner's path was the unmeasured one:
 *   Ⓜ (MAJOR 1) the press writes NO `seen` mark; the APPROVED command itself, run again inside the hour, is a window use (no
 *     card, ONE notice); past the hour it asks again; a shape a local instance had let through ONCE is a window use inside the
 *     hour too (the window is judged before the seen pass) — on both kinds;
 *   Ⓝ (除了) a conversation the owner EXCEPTED from the entry's Task Group grant is not offered «Allow for 1 hour» — the card
 *     says why («you excluded this conversation from “X” in the Vault window»), the door refuses the press, the one writer
 *     refuses a window for it (`window_excepted`), the exception stays and the group never admits it; another conversation is
 *     offered it (control);
 *   Ⓞ (MINOR 3) the window's words ride facts.window (their own bound), never the card's detail: the bisect of the longest
 *     command that still draws ends at the DETAIL bound with the window offered (a run the base drew a card for draws one); a
 *     card whose facts the store dropped offers no «Allow for 1 hour» (no words, no press);
 *   Ⓟ (MINOR 4) the window's OWN ✕ takes back the window only — the member's other scopes stay, the next run asks, the press's
 *     record says «revoked HH:MM»; a dialog drawn before the ✕ saves without bringing it back (an older page that re-sends it is
 *     refused by name); a window-only member goes with it;
 *   Ⓠ (MINOR 5) an ENDED window is pruned at the next write of its row (a press, the owner's Save) and at the hour's end
 *     (`pruneWindows`); the writer refuses a window past the press + 1 h, the reader admits none ending more than 24 h out;
 *   Ⓡ (MINOR 6) a run whose entries a hosts scope and a window admit: the notice names only the window's entry;
 *   Ⓢ (MINOR 7, PURE) the Vault chip: a live window has its own ✕, an ended one is drawn as the other ended scopes (its «ended
 *     HH:MM» title, no warning accent), the member's source says «“Allow for 1 hour” on a card».
 * ROUND 9 (主开发's acceptance of r8 df027a971), on both door kinds:
 *   Ⓣ (MAJOR A) a 除了 list outlives the hour — the hour-end prune, the window's ✕ and the member's ✕ keep the row's except
 *     (an except-only row `{to: [], except: [...]}` is kept, the Vault window reads it; the probe's three shapes);
 *   Ⓤ (MAJOR B) the press writes ONLY the window — no host pass: the agent's own value (minted for h1) sent to h2 is a window use
 *     inside the hour (by grant, one notice) and asks after it; h3 never pressed the same; h1 by own (controls);
 *   Ⓥ (MINOR C) a Save over a window that ENDED unswept is not refused (that member sent with no scope, the hub prunes it) — a
 *     refusal that remains names the member;
 *   Ⓦ (MINOR D) a Save that leaves out a member holding a LIVE window tells the press's record («revoked HH:MM»); a Save that
 *     keeps it tells nothing (control).
 * RED control: r7's legs over 8e771b675 (r6 — no window) fail BY NAME; r8's over e19220cc7 (r7) fail BY NAME — Ⓜ on the LOCAL
 * door; r9's over df027a971 (r8) BY NAME (a leg that throws is a failed leg, never a crash). Mutants: r8/mutants8.py, r9/mutants9.py (the report).
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
let TAG = '', KIND = 'cluster';   // r8: the door's instance kind of this pass — every leg name says it
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n + TAG); } else { fail++; console.error('  ✗ ' + n + TAG + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function leg(name, fn) { try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name}${TAG} — threw: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`); } }

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
async function world({ timers, kind = KIND, groups = null } = {}) {
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
  const facts = (caller) => ({ conversationKeys: [caller.conversationId], groupIds: (groups && groups[caller.conversationId]) || [] });   // r8: a Task Group the conversation is in (Ⓝ)
  // the notice road as server.js serverNotice is: ONE payload per key per boot (a reused key is silent), → clients reached
  const notices = [], sent = new Map();
  const notice = (key, text, o = {}) => { if (sent.has(key)) return sent.get(key); notices.push({ key, text, ...o }); sent.set(key, 1); return 1; };
  const door = DOOR.create({ dataDir, vault, userTodos, sources, instanceKind: () => kind, runRoot: () => runRoot, home: os.homedir(), agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), killGraceMs: 400, pipeGraceMs: 300, liveOf: () => true, log: (m) => logs.push(String(m)), useGrants, useFacts: facts, now, notice, isRootOwned: (p) => p === BIN || String(p).startsWith(BIN + '/'), ...(timers ? { timers } : {}) });   // r8: local (the owner's hub) AND cluster
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
// r8: a page as small as a row and a chip need (createElement / createTextNode, className, textContent, innerHTML, title, append)
class Txt { constructor(s) { this.nodeType = 3; this.data = String(s); } get textContent() { return this.data; } }
class El {
  constructor(tag) { this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.children = []; this.className = ''; this.dataset = {}; this.attrs = {}; this.title = ''; this.hidden = false; this.style = {}; this.innerHTML = ''; }
  append(...ns) { for (const n of ns) this.children.push(typeof n === 'string' ? new Txt(n) : n); }
  set textContent(v) { this.children = v === '' || v == null ? [] : [new Txt(v)]; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const walk = (n, out = []) => { if (n && n.nodeType === 1) { out.push(n); for (const c of n.children) walk(c, out); } return out; };
async function onPage(fn) { const had = globalThis.document; globalThis.document = { createElement: (t) => new El(t), createTextNode: (s) => new Txt(s) }; try { return await fn(); } finally { if (had === undefined) delete globalThis.document; else globalThis.document = had; } }
/** THE TRAY ROW as the panel builds it (renderRow — the prose road too, where a card's facts were dropped) → its markup */
const trayRowHtml = (item, t = tZH) => onPage(() => (ROW && typeof ROW.renderRow === 'function' ? ROW.renderRow({ item, resolved: false }, { t, lang: 'zh', wordsOf: (i) => i.text, detailOf: (i) => i.detail, nameFor: (i) => i.sessionName || '', optionsOf: () => [] }).innerHTML : ''));   // the panel's ctx, as small as a row needs

// r8 (主开发's acceptance of r7, MAJOR 1 — the suite built every door as a cluster, so the owner's own hub, a LOCAL instance, was
// the unmeasured path): EVERY door leg below runs twice, as a local instance and as a cluster — each leg's name says which
for (const K of ['local', 'cluster']) {
  KIND = K; TAG = ` [${K}]`;
  console.log(`\n══ THE DOOR AS A ${K.toUpperCase()} INSTANCE ══`);
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
    // r8 (MINOR 3): the window's words ride facts.window ONLY — the prose (THE BELT's text, an older client's) is the base's
    ok(!!(card && f && f.offered === true && !/1 hour|1-hour/.test(String(drawn.detail)) && /«Always» is not offered/.test(String(drawn.detail))), 'Ⓐg (r8, MINOR 3) the card\'s prose carries NONE of the window\'s words (they ride facts.window — their own bound, never the DETAIL bound); its base lines stay', drawn && drawn.detail.slice(-500));
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
    ok(!!(k.a && k.a.ok && first.a && first.a.ok && u4.r.ok && !u4.card && last && last.scope === undefined && last.allowedBy === (KIND === 'local' ? 'seen' : 'grant') && u5.r.ok && !u5.card && last5 && last5.scope === 'window' && w.notices.length === 1 && w.notices[0].key === `vault-window-use:${last5.receipt}`), `Ⓓe the member holds api.tts.example (hosts) AND a window: a curl to api.tts.example is named by its HOSTS scope (no window line, no notice${KIND === 'local' ? ' — a local instance lets the very shape its «Always» answered through by `seen`' : ''}); a curl to another host goes under the window (its line, ONE notice)`, { always: k.a, window: first.a, u4: last && { scope: last.scope, allowedBy: last.allowedBy }, u5: last5 && { scope: last5.scope }, notices: w.notices.map((n) => n.key) });
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
    w.clock.at += 5 * MIN;
    const T = w.now();
    const rv = typeof w.door.takeBack === 'function' ? w.door.takeBack({ id: w.e.id, principal: `conversation:${CID}` }) : w.useGrants.revoke(w.e.id, `conversation:${CID}`);   // r8: the route goes through the door (a tree without it: the store's revoke)
    const next = await runAnswered(w, SHELL(w.e.ref, 'x.tts.example'));
    ok(!!(first.a && first.a.ok && rv && rv.ok && rv.removed && next.card && !memberRaw(w)), 'Ⓗa ✕ (the row\'s revoke) takes the member back, its window with it — the next run asks (its card)', { first: first.a, rv, card: !!next.card });
    const rec = first.card && recordOf(w, first.card.action.askId), st = rec && FA.decidedStamp(rec, { t: tZH, now: T + MIN });
    ok(!!(rec && rec.resolvedFact && rec.resolvedFact.endedBy === 'revoked' && rec.resolvedFact.endedAt === T && st && st.text === `已允许这个对话 1 小时 · 已于 ${hhmm(T)} 撤销`), `Ⓗb (r8, MINOR 4) the press's record is TOLD — «已允许这个对话 1 小时 · 已于 ${hhmm(T)} 撤销» (never «至 HH:MM» for a window taken back)`, rec && { fact: rec.resolvedFact, stamp: st });
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
    const sent = plan && plan.scopes.find((s) => s.kind === 'window'), kept = plan && Array.isArray(plan.kept) ? plan.kept.find((s) => s.kind === 'window') : null;
    const host = plan && plan.scopes.find((s) => s.host === 'api.tts.example');
    ok(!!(first.a && first.a.ok && pm && pm.window === win.until && pm.scopes.some((s) => s.kind === 'window' && s.until === win.until && s.expired === false) && !sent && kept && kept.until === win.until && host && host.until === w.now() + 30 * 86400e3), 'Ⓚa the row lists the window (its own end); «Who may use it…»\'s Save SENDS no window (r8 — the hub keeps the live one; `kept` is what its preview names «(kept)»), whatever end is chosen (a new host there takes the chosen 30 days)', { pm: pm && { window: pm.window, scopes: pm.scopes }, plan });
    const keep = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: plan ? plan.scopes : [] }], except: [] }, { reauthed: true });
    const after = windowsOf(memberRaw(w))[0];
    const mint = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: [{ kind: 'window', until: w.now() + 50 * 86400e3 }, { host: 'api.tts.example', until: w.now() + 30 * 86400e3 }] }], except: [] }, { reauthed: true });
    const other = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: 'cid-other', name: 'Other', scopes: [{ kind: 'window', until: w.now() + WINDOW_MS }] }], except: [] }, { reauthed: true });
    ok(!!(keep && keep.ok && after && after.until === win.until && after.source === 'card' && mint && mint.code === 'window_card_only' && other && other.code === 'window_card_only' && windowsOf(memberRaw(w))[0].until === win.until), 'Ⓚb the Save lands and the hub KEEPS the window (its end and writer unchanged); a Save that MOVES its end, or gives another conversation one, is refused window_card_only — a window is written from the card only', { keep, after, mint: mint && mint.code, other: other && other.code });
    // r8: a member that holds ONLY the window, saved by a dialog that names no scope for it — the hub keeps it (never hosts_required)
    const w2 = await world();
    const f2 = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window' });
    const win2 = windowsOf(memberRaw(w2))[0];
    const only = w2.useGrants.setRow(w2.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: [] }], except: [] }, { reauthed: true });
    ok(!!(f2.a && f2.a.ok && only && only.ok && windowsOf(memberRaw(w2)).length === 1 && windowsOf(memberRaw(w2))[0].until === win2.until), 'Ⓚc (r8) a window-ONLY member, saved by a dialog that sends no scope for it: the Save lands and the hub keeps its window (never hosts_required)', { only, member: memberRaw(w2) });
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

  console.log('Ⓜ (r8, MAJOR 1) THE APPROVED COMMAND ITSELF — no `seen` mark: inside the hour a window use (one notice), past it the card');
  await leg('Ⓜ the approved command', async () => {
    const w = await world();
    const first = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
    const T = w.now();
    const marks = [...((w.door._seen && w.door._seen.keys()) || [])].filter((k) => String(k).startsWith(CID + '\n'));
    ok(!!(first.a && first.a.ok && first.r.ok && marks.length === 0), 'Ⓜa the press writes NO `seen` mark (the window IS the memory — its end is the law)', { a: first.a, marks: marks.length });
    w.clock.at = T + 10 * MIN;
    const same = await runAnswered(w, SHELL(w.e.ref));
    const line = auditOf(w, 'vault-run').filter((l) => l.outcome === 'ran').pop();
    ok(!!(same.r.ok && !same.card && same.r.by === 'grant' && line && line.scope === 'window' && line.windowLeft === 50 && w.notices.length === 1 && w.notices[0].key === `vault-window-use:${line.receipt}` && w.notices[0].i18n.params.left === 50), 'Ⓜb the SAME command at +10 min is a WINDOW use — no card, by grant · scope window (50 min left), ONE notice keyed by its run', { r: same.r && { ok: same.r.ok, by: same.r.by, code: same.r.code }, card: !!same.card, line: line && { scope: line.scope, left: line.windowLeft, allowedBy: line.allowedBy }, notices: w.notices.map((n) => n.key) });
    w.clock.at = T + 65 * MIN;
    const after = await runAnswered(w, SHELL(w.e.ref));
    ok(!!(after.card && after.drawn.action.window === true && w.notices.length === 1), 'Ⓜc past the hour the SAME command asks again — its card («Allow for 1 hour» offered anew), no notice', { card: !!after.card, code: after.r && after.r.code, by: after.r && after.r.by, notices: w.notices.length });
  });
  await leg('Ⓜd seen first', async () => {
    const w = await world();
    const S = ['--env', `T=${w.e.ref}`, '--', 'sh', '-c', 'curl -s https://s.tts.example -H "X: $T"'];
    const once = await runAnswered(w, S, { answer: 'once' });   // «Allow once» — a local instance lets this shape through again this unlock (`seen`)
    const win = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
    const T = w.now();
    w.clock.at = T + 5 * MIN;
    const again = await runAnswered(w, S);
    const line = auditOf(w, 'vault-run').filter((l) => l.outcome === 'ran').pop();
    ok(!!(once.a && once.a.ok && win.a && win.a.ok && again.r.ok && !again.card && line && line.scope === 'window' && w.notices.length === 1), 'Ⓜd a shape this conversation was let run ONCE (a local instance\'s `seen`) is a WINDOW use inside the hour — one notice: the window is judged before the seen pass', { r: again.r && { ok: again.r.ok, by: again.r.by }, card: !!again.card, scope: line && line.scope, notices: w.notices.length });
    w.clock.at = T + 65 * MIN;
    const late = await runAnswered(w, S);
    if (KIND === 'local') ok(!!(late.r.ok && late.r.by === 'seen' && !late.card), 'Ⓜe (control) past the hour a local instance lets that shape through by its «Allow once» (`seen`, this unlock — the base\'s rule, no window), no notice', { r: late.r && { ok: late.r.ok, by: late.r.by }, card: !!late.card });
    else ok(!!late.card, 'Ⓜe (control) past the hour a cluster asks again', { card: !!late.card });
  });

  console.log('Ⓝ (r8, 除了) A CONVERSATION THE OWNER EXCEPTED — no «Allow for 1 hour», the card says why; the exception stays');
  await leg('Ⓝ except', async () => {
    const w = await world({ groups: { [CID]: ['g-team'], 'cid-other': [] } });
    const put = w.useGrants.setRow(w.e.id, { to: [{ kind: 'group', id: 'g-team', name: 'Team', scopes: [{ host: 'api.tts.example', until: w.now() + 30 * 86400e3 }] }], except: [{ kind: 'conversation', key: CID }] }, { reauthed: true });
    const c = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
    const f = c.drawn && c.drawn.facts && c.drawn.facts.window;
    const html = c.drawn && drawnHtml(c.drawn, tZH);
    const LINE = '不提供「允许 1 小时」：你在保险库窗口里把这个对话排除在“TTS API key”之外了。';
    ok(!!(put && put.ok && c.card && c.drawn.action.window === undefined && f && f.offered === false && Array.isArray(f.excepted) && f.excepted[0] === 'TTS API key' && !answersIn(html).includes('window') && textOf(html).includes(LINE)), `Ⓝa the conversation the owner excepted from the entry's Task Group grant: its card offers NO «Allow for 1 hour» and says why — «${LINE}»`, { put, action: c.drawn && c.drawn.action, window: f, answers: html && answersIn(html), text: html && textOf(html).slice(-300) });
    const row = rowOf(w);
    ok(!!(c.a && c.a.ok === false && c.a.code === 'window_not_offered' && row && (row.except || []).some((x) => x.key === CID) && !memberRaw(w)), 'Ⓝb the door refuses the press (window_not_offered) — nothing written, the exception stays', { a: c.a, except: row && row.except });
    const wr = w.useGrants.addMember(w.e.id, { kind: 'conversation', key: CID, name: 'Narrator' }, { window: w.now() + WINDOW_MS, source: 'card' });
    ok(!!(wr && wr.ok === false && wr.code === 'window_excepted' && (rowOf(w).except || []).some((x) => x.key === CID) && !memberRaw(w)), 'Ⓝc the ONE writer refuses a window for an excepted conversation (window_excepted) — a 除了 entry is never silently lost', wr);
    w.clock.at += 2 * WINDOW_MS;
    const later = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'));
    ok(!!(later.card && (rowOf(w).except || []).some((x) => x.key === CID)), 'Ⓝd two hours later the Task Group grant still does not admit it (its curl to the group\'s host draws its card) — the exception holds', { card: !!later.card, code: later.r && later.r.code });
    const o = await runAnswered(w, SHELL(w.e.ref), { caller: w.caller('cid-other', 'Other') });
    ok(!!(o.drawn && o.drawn.action.window === true && o.drawn.facts.window.offered === true), 'Ⓝe (control) another conversation, not excepted, is offered «Allow for 1 hour» on the same entry', o.drawn && { action: o.drawn.action });
  });

  console.log('Ⓞ (r8, MINOR 3) THE CARD BUDGET — the window\'s words ride their own bound; a card the base drew is drawn');
  await leg('Ⓞ budget', async () => {
    const w = await world();
    fs.writeFileSync(path.join(w.work, 'cfg.tpl'), `token=$VAULT{secrets/${w.e.name}/secret}\n`.padEnd(4000, 'x'));   // a 4000-byte template (the acceptance's probe)
    const drawAt = async (pad) => { const r = await runAnswered(w, ['--file', 'CFG=@cfg.tpl', '--', 'bash', '-c', `cat "$VAULT_FILE{CFG}" >/dev/null; echo ${'p'.repeat(pad)}`]); return { pad, card: !!r.card, len: r.drawn ? String(r.drawn.detail).length : null, window: !!(r.drawn && r.drawn.action.window === true && r.drawn.facts && r.drawn.facts.window && r.drawn.facts.window.offered === true), code: r.card ? null : r.r && r.r.code, detail: r.drawn ? String(r.drawn.detail) : '' }; };
    let lo = 10, hi = 4000;
    const L = await drawAt(lo), H = await drawAt(hi);
    if (L.card && !H.card) while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((await drawAt(mid)).card) lo = mid; else hi = mid; }
    const atLo = await drawAt(lo), atHi = await drawAt(hi);
    console.log(`    the bisect: the longest pad that draws = ${lo} (detail ${atLo.len} chars; scratch root ${ROOT.length} chars), ${hi} ⇒ ${atHi.code}`);
    ok(!!(L.card && atLo.card && atLo.window && atLo.len > DOOR.DETAIL_MAX - 3 && atLo.len <= DOOR.DETAIL_MAX && !/1 hour|1-hour/.test(atLo.detail) && !atHi.card && atHi.code === 'card_too_long'), `Ⓞa the longest command that still draws (a 4000-byte template + a ${lo}-char pad) draws its card at the DETAIL bound (${atLo.len} of ${DOOR.DETAIL_MAX}) WITH «Allow for 1 hour» — the window's words cost the detail nothing (one more char ⇒ card_too_long, as on the base)`, { lo, hi, atLo: { len: atLo.len, window: atLo.window }, atHi: { code: atHi.code } });
    // a card whose facts the store dropped (its words were not filed): no «Allow for 1 hour» in any client, and the door refuses it
    let done = false;
    const before = new Set(cardsOf(w).map((x) => x.id));   // read BEFORE the run (its card may be filed before the next line)
    const p = w.door.run({ caller: w.caller(), args: SHELL(w.e.ref), cwd: w.work }).then((r) => { done = true; return r; });
    const card = await cardAfter(w, before, () => done);
    if (card) w.userTodos.reshapeItems((it) => { if (it.id !== card.id) return false; it.facts = { dropped: 'too-large', cut: ['facts'] }; return true; });
    const it = card && w.userTodos.get(card.id);
    const lay = it && LAYOUT && LAYOUT.itemView ? LAYOUT.itemView(it, {}) : null;
    const a = card && w.door.answer(card.action.askId, { answer: 'window', reauthed: true, person: true });
    const row = it ? await trayRowHtml(it) : '';
  ok(!!(card && card.action.window === true && it && it.facts && it.facts.dropped && /data-answer="once"/.test(row) && !answersIn(row).includes('window') && lay && !lay.actions.includes('shape-window') && a && a.code === 'window_not_offered' && !memberRaw(w)), 'Ⓞb a card whose facts the store dropped (its words not filed): no «Allow for 1 hour» in the tray row (its prose road: Allow once / Deny) or the For-you window, and the door refuses the press (window_not_offered) — never a press without its words', { answers: answersIn(row), acts: lay && lay.actions, a });
    if (card) w.door.answer(card.action.askId, { answer: 'deny' });
    await p;
  });

  console.log('Ⓟ (r8, MINOR 4) THE WINDOW\'S OWN ✕ — only the window goes; the next run asks; its record is told');
  await leg('Ⓟ window ✕', async () => {
    const w = await world();
    const PY = (part) => ['--env', `T=${w.e.ref}`, '--', 'python3', 'transcribe.py', part];
    const cmd = await runAnswered(w, PY('part01.mp3'), { answer: 'always' });   // «Always (this command)» — a command scope, no end
    const win = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
    const pm0 = (w.useGrants.publicFor(w.e.id).to || []).find((m) => m.key === CID);   // the dialog, drawn BEFORE the ✕
    const until0 = windowsOf(memberRaw(w))[0] && windowsOf(memberRaw(w))[0].until;
    w.clock.at += 3 * MIN;
    const T = w.now();
    const tb = typeof w.door.takeBack === 'function' ? w.door.takeBack({ id: w.e.id, principal: `conversation:${CID}`, scope: 'window' }) : { ok: false, code: 'no door.takeBack' };
    const m = memberRaw(w);
    ok(!!(cmd.a && cmd.a.ok && win.a && win.a.ok && tb && tb.ok && tb.removed && tb.until === until0 && m && windowsOf(m).length === 0 && m.scopes.length === 1 && m.scopes[0].command), 'Ⓟa the window\'s OWN ✕ (POST …/revoke {scope: window}) takes back ONLY the window — the member keeps its «Always (this command)» scope', { tb, member: m });
    const next = await runAnswered(w, SHELL(w.e.ref, 'y.tts.example'));
    const py = await runAnswered(w, PY('part02.mp3'));
    ok(!!(next.card && next.drawn.action.window === true && py.r.ok && !py.card && py.r.by === 'grant' && !w.notices.length), 'Ⓟb the next shell run asks (its card — the window offered anew); the trusted script still runs by its command scope, no notice', { next: !!next.card, py: py.r && { ok: py.r.ok, by: py.r.by, code: py.r.code } });
    const rec = win.card && recordOf(w, win.card.action.askId), st = rec && FA.decidedStamp(rec, { t: tZH, now: T + MIN });
    ok(!!(rec && rec.resolvedFact && rec.resolvedFact.endedBy === 'revoked' && rec.resolvedFact.endedAt === T && st && st.text === `已允许这个对话 1 小时 · 已于 ${hhmm(T)} 撤销`), `Ⓟc the press's record is told — «已允许这个对话 1 小时 · 已于 ${hhmm(T)} 撤销»`, rec && { fact: rec.resolvedFact, stamp: st });
    const plan = VUR && VUR.saveScopesOf && pm0 ? VUR.saveScopesOf({ was: pm0, hosts: [], cmds: pm0.commands || [], endId: 'keep', now: w.now() }) : null;
    const save = plan && w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: plan.scopes }], except: [] }, { reauthed: true });
    const staleOld = w.useGrants.setRow(w.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: [...(plan ? plan.scopes.filter((s) => s.kind !== 'window') : []), { kind: 'window', until: until0 }] }], except: [] }, { reauthed: true });
    ok(!!(plan && !plan.scopes.some((s) => s.kind === 'window') && save && save.ok && windowsOf(memberRaw(w)).length === 0 && memberRaw(w).scopes.length === 1 && staleOld && staleOld.code === 'window_card_only' && windowsOf(memberRaw(w)).length === 0), 'Ⓟd a dialog drawn BEFORE the ✕: its Save sends no window and lands — the window stays gone; an older page that re-sends it is refused window_card_only (never revived)', { plan, save, staleOld: staleOld && staleOld.code, member: memberRaw(w) });
    const w2 = await world();
    const only = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window' });
    const tb2 = typeof w2.door.takeBack === 'function' ? w2.door.takeBack({ id: w2.e.id, principal: `conversation:${CID}`, scope: 'window' }) : null;
    ok(!!(only.a && only.a.ok && tb2 && tb2.ok && tb2.memberGone === true && !memberRaw(w2)), 'Ⓟe a member that held ONLY the window goes with it', { tb2, member: memberRaw(w2) });
  });

  console.log('Ⓠ (r8, MINOR 5) AN ENDED WINDOW IS PRUNED — at the next write of its row and at the hour\'s end; the caps');
  await leg('Ⓠ prune', async () => {
    const w = await world();
    const a = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
    const T = w.now();
    w.clock.at = T + 61 * MIN;
    const two = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--', 'python3', 'transcribe.py', 'two.mp3'], { answer: 'always', caller: w.caller('cid-two', 'Second') });
    ok(!!(a.a && a.a.ok && two.a && two.a.ok && !memberRaw(w) && memberRaw(w, w.e.id, 'cid-two')), 'Ⓠa the next write of the row (another conversation\'s press, an hour and a minute later) prunes the ENDED window — the member that held only it goes', { a: a.a, two: two.a, row: rowOf(w) && rowOf(w).to.map((m) => [m.key, (m.scopes || []).map((s) => s.kind || (s.host ? 'host' : 'command'))]) });
    const w2 = await world();
    const c2 = await runAnswered(w2, ['--env', `T=${w2.e.ref}`, '--', 'python3', 'transcribe.py', 'part01.mp3'], { answer: 'always' });
    const a2 = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window' });
    w2.clock.at = w2.now() + 61 * MIN;
    const pm = (w2.useGrants.publicFor(w2.e.id).to || []).find((m) => m.key === CID);
    const plan = VUR && VUR.saveScopesOf && pm ? VUR.saveScopesOf({ was: pm, hosts: [], cmds: pm.commands || [], endId: 'keep', now: w2.now() }) : null;
    const save = plan && w2.useGrants.setRow(w2.e.id, { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: plan.scopes }], except: [] }, { reauthed: true });
    ok(!!(c2.a && c2.a.ok && a2.a && a2.a.ok && save && save.ok && windowsOf(memberRaw(w2)).length === 0 && memberRaw(w2).scopes.length === 1 && memberRaw(w2).scopes[0].command), 'Ⓠb the owner\'s Save after the hour prunes the ended window — the command scope stays', { save, member: memberRaw(w2) });
    const w3 = await world();
    const a3 = await runAnswered(w3, SHELL(w3.e.ref), { answer: 'window' });
    const pr0 = typeof w3.useGrants.pruneWindows === 'function' ? w3.useGrants.pruneWindows(w3.e.id) : null;
    w3.clock.at = w3.now() + 61 * MIN;
    const pr1 = typeof w3.useGrants.pruneWindows === 'function' ? w3.useGrants.pruneWindows(w3.e.id) : null;
    ok(!!(a3.a && a3.a.ok && pr0 && pr0.ok && pr0.swept === 0 && pr1 && pr1.ok && pr1.swept === 1 && !rowOf(w3)), 'Ⓠc the hour-end prune (the door arms it at the press): nothing ended ⇒ nothing written; past the hour the window goes (the row with it)', { pr0, pr1, row: rowOf(w3) });
    const w4 = await world();
    const over = w4.useGrants.addMember(w4.e.id, { kind: 'conversation', key: CID, name: 'Narrator' }, { window: w4.now() + WINDOW_MS + MIN, source: 'card' });
    const edge = w4.useGrants.addMember(w4.e.id, { kind: 'conversation', key: 'cid-edge', name: 'Edge' }, { window: w4.now() + WINDOW_MS, source: 'card' });
    ok(!!(over && over.ok === false && over.code === 'window_too_long' && !memberRaw(w4) && edge && edge.ok), 'Ⓠd the writer caps a window at the press + 1 hour (a minute more ⇒ window_too_long, nothing written; exactly an hour lands)', { over, edge: edge && edge.ok });
    const far = w4.useGrants.restoreRow(w4.e.id, { ok: true, row: { to: [{ kind: 'conversation', key: CID, name: 'Narrator', scopes: [{ kind: 'window', until: w4.now() + 25 * 3600e3, source: 'card', at: w4.now() }] }], except: [] } });   // a valid mark (the raw road) — a window a day out
    const rf = await runAnswered(w4, SHELL(w4.e.ref));
    ok(!!(far && far.ok && rf.card && !w4.notices.length), 'Ⓠe the reader admits no window ending more than 24 h out (a marked row with a 25-hour window: the run draws its card, no notice)', { far, card: !!rf.card, code: rf.r && rf.r.code });
  });

  console.log('Ⓡ (r8, MINOR 6) THE NOTICE NAMES ONLY WHAT THE WINDOW ADMITTED');
  await leg('Ⓡ notice entries', async () => {
    const w = await world();
    const E2 = entryOf(w, 'Upload key');
    w.door.setRunnable({ id: E2.id, on: true, reauthed: true });
    const k = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'), { answer: 'always' });   // TTS API key: a hosts scope (api.tts.example)
    const win = await runAnswered(w, ['--env', `U=${E2.ref}`, '--', 'bash', '-c', 'curl -s -H "B: $U" https://q.example'], { answer: 'window' });   // Upload key: a window
    const both = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--env', `U=${E2.ref}`, '--', 'curl', '-s', 'https://api.tts.example/v1']);
    const n = w.notices[0], p = n && n.i18n && n.i18n.params;
    ok(!!(k.a && k.a.ok && win.a && win.a.ok && both.r.ok && !both.card && w.notices.length === 1 && p && p.entry === 'Upload key' && p.where === 'api.tts.example' && !/TTS API key/.test(n.text)), 'Ⓡ a run whose «TTS API key» its hosts scope admits and whose «Upload key» its window admits: ONE notice, naming only «Upload key» (the receipts and the notice agree)', { r: both.r && { ok: both.r.ok, by: both.r.by, code: both.r.code }, notices: w.notices.map((x) => x.text) });
  });
  console.log('Ⓣ (r9, MAJOR A) A 除了 LIST OUTLIVES THE HOUR — the prune, the window\'s ✕ and the member\'s ✕ keep the row\'s except');
  await leg('Ⓣ except kept', async () => {
    const C = 'cid-left-out', D = 'cid-d', MONTH = 30 * 86400e3;
    const exKept = (r) => !!(r && (r.except || []).some((x) => x.key === C));
    const shape = (r) => r && { to: (r.to || []).map((m) => m.key || m.kind), except: (r.except || []).map((x) => x.key) };
    // (A) the probe: to [All agents · x.example] except [C]; D presses the window; the owner ✕'s All agents; the hour ends
    const w = await world();
    const put = w.useGrants.setRow(w.e.id, { to: [{ kind: 'everyone', scopes: [{ host: 'x.example', until: w.now() + MONTH }] }], except: [{ kind: 'conversation', key: C }] }, { reauthed: true });
    const d = await runAnswered(w, SHELL(w.e.ref), { answer: 'window', caller: w.caller(D, 'Dee') });
    const x = w.door.takeBack({ id: w.e.id, principal: 'everyone' });
    const mid = rowOf(w);
    w.clock.at = w.now() + 61 * MIN;
    const pr = typeof w.useGrants.pruneWindows === 'function' ? w.useGrants.pruneWindows(w.e.id) : null;
    const after = rowOf(w);
    ok(!!(put.ok && d.a && d.a.ok && x && x.ok && mid && mid.to.length === 1 && mid.to[0].key === D && exKept(mid) && pr && pr.ok && pr.swept === 1 && after && after.to.length === 0 && exKept(after)), 'Ⓣa (the probe\'s A) All agents excepting C, D\'s 1-hour press, the owner ✕\'s All agents, the hour ends: the prune sweeps D\'s ended window and KEEPS the row\'s 除了 — an except-only row {to: [], except: [C]} (r8 wrote {to: [], except: []})', { put: put.ok, a: d.a, mid: shape(mid), pr, after: shape(after) });
    const pub = w.useGrants.publicFor(w.e.id);
    const again = w.useGrants.setRow(w.e.id, { to: [{ kind: 'everyone', scopes: [{ host: 'x.example', until: w.now() + MONTH }] }], except: pub.except || [] }, { reauthed: true });
    const c = await runAnswered(w, CURL(w.e.ref, 'x.example'), { caller: w.caller(C, 'Left out') });
    ok(!!((pub.to || []).length === 0 && (pub.except || []).some((x) => x.key === C) && again.ok && c.card && exKept(rowOf(w))), 'Ⓣb the Vault window reads it (no member, «除了 Left out»); the owner\'s next «All agents» Save carries the 除了 the dialog shows — the conversation the owner excluded still draws its card', { pub: { to: (pub.to || []).length, except: (pub.except || []).map((x) => x.key) }, again: again.ok, card: !!c.card, by: c.r && c.r.by });
    // (B) the probe: an except-only row the owner saved, another conversation's window, the hour ends
    const w2 = await world();
    const p2 = w2.useGrants.setRow(w2.e.id, { to: [], except: [{ kind: 'conversation', key: C }] }, { reauthed: true });
    const d2 = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window', caller: w2.caller(D, 'Dee') });
    w2.clock.at = w2.now() + 61 * MIN;
    const pr2 = typeof w2.useGrants.pruneWindows === 'function' ? w2.useGrants.pruneWindows(w2.e.id) : null;
    ok(!!(p2.ok && d2.a && d2.a.ok && pr2 && pr2.swept === 1 && rowOf(w2) && rowOf(w2).to.length === 0 && exKept(rowOf(w2))), 'Ⓣc (the probe\'s B) an except-only row, another conversation\'s 1-hour press, the hour ends: the prune keeps the row and its 除了 (r8 deleted the row)', { p2: p2.ok, a: d2.a, pr2, row: shape(rowOf(w2)) });
    // the window's own ✕ and the member's ✕ on the row's LAST member
    const tw = w2.door.takeBack({ id: w2.e.id, principal: `conversation:${D}`, scope: 'window' });
    const d3 = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window', caller: w2.caller(D, 'Dee') });
    const tw3 = w2.door.takeBack({ id: w2.e.id, principal: `conversation:${D}`, scope: 'window' });
    const r3 = rowOf(w2);
    const d4 = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window', caller: w2.caller(D, 'Dee') });
    const tm = w2.door.takeBack({ id: w2.e.id, principal: `conversation:${D}` });
    const r4 = rowOf(w2);
    ok(!!(tw && tw.ok && d3.a && d3.a.ok && tw3 && tw3.ok && tw3.memberGone === true && r3 && r3.to.length === 0 && exKept(r3) && d4.a && d4.a.ok && tm && tm.ok && tm.removed && r4 && r4.to.length === 0 && exKept(r4)), 'Ⓣd the window\'s own ✕ and the member\'s ✕ on the row\'s LAST member keep its 除了 (withoutWindow / withoutMember — r8 dropped it with the member)', { tw3, r3: shape(r3), tm, r4: shape(r4) });
    // (C) the probe: a Task Group member + D's window that ENDED unpruned, except [C]; the owner ✕'s the group
    const w5 = await world();
    w5.useGrants.setRow(w5.e.id, { to: [{ kind: 'group', id: 'g-team', name: 'Team', scopes: [{ host: 'x.example', until: w5.now() + MONTH }] }], except: [{ kind: 'conversation', key: C }] }, { reauthed: true });
    const d5 = await runAnswered(w5, SHELL(w5.e.ref), { answer: 'window', caller: w5.caller(D, 'Dee') });
    w5.clock.at = w5.now() + 61 * MIN;
    const tg = w5.door.takeBack({ id: w5.e.id, principal: 'group:g-team' });
    ok(!!(d5.a && d5.a.ok && tg && tg.ok && tg.removed && rowOf(w5) && rowOf(w5).to.length === 0 && exKept(rowOf(w5))), 'Ⓣe (the probe\'s C) a Task Group and D\'s ended (unpruned) window, except [C]; the owner ✕\'s the group: D\'s ended window is pruned with it and the 除了 stays', { tg, row: shape(rowOf(w5)) });
  });

  console.log('Ⓤ (r9, MAJOR B) THE PRESS WRITES ONLY THE WINDOW — no host pass: the agent\'s own value sent to another host is a window use inside the hour, a card after it');
  await leg('Ⓤ no host pass', async () => {
    const w = await world();
    const mint = w.vault.agentMint(`agent:${CID}/tok`, { length: 32, forHost: 'h1.example', actor: 'Narrator' });
    const p = await runAnswered(w, CURL(mint && mint.ref, 'h2.example'), { answer: 'window' });
    const T = w.now();
    ok(!!(mint && mint.ref && p.drawn && p.drawn.action.window === true && p.a && p.a.ok && p.r.ok), 'Ⓤa the agent\'s OWN value (minted for h1.example) sent by curl to h2.example draws its card with «Allow for 1 hour»; the press lets that run go', { mint: !!(mint && mint.ref), action: p.drawn && p.drawn.action, a: p.a, r: p.r && { ok: p.r.ok, by: p.r.by, code: p.r.code } });
    w.clock.at = T + 10 * MIN;
    const i0 = itemsOf(w);
    const n0 = w.notices.length, h2 = await runAnswered(w, CURL(mint && mint.ref, 'h2.example')), n2 = w.notices.length;
    const last2 = w.notices[w.notices.length - 1];
    ok(!!(h2.r.ok && !h2.card && h2.r.by === 'grant' && n2 === n0 + 1 && last2 && last2.i18n && last2.i18n.params.where === 'h2.example'), 'Ⓤb h2.example again at +10 min is a WINDOW use — by grant, no card, ONE notice naming h2.example (r8 kept a host pass: by own, no notice)', { r: h2.r && { ok: h2.r.ok, by: h2.r.by, code: h2.r.code }, card: !!h2.card, notices: w.notices.slice(n0).map((n) => n.i18n && n.i18n.params) });
    const h3 = await runAnswered(w, CURL(mint && mint.ref, 'h3.example')), n3 = w.notices.length;
    const h1 = await runAnswered(w, CURL(mint && mint.ref, 'h1.example')), n1 = w.notices.length;
    ok(!!(h3.r.ok && !h3.card && h3.r.by === 'grant' && n3 === n2 + 1 && h1.r.ok && !h1.card && h1.r.by === 'own' && n1 === n3 && itemsOf(w) === i0), 'Ⓤc (controls) h3.example — never pressed — is a window use too (by grant, one notice); h1.example, the host it was minted for, runs by own with no notice; nothing filed in For you', { h3: h3.r && { ok: h3.r.ok, by: h3.r.by }, h1: h1.r && { ok: h1.r.ok, by: h1.r.by }, notices: [n2, n3, n1], items: [i0, itemsOf(w)] });
    w.clock.at = T + 66 * MIN;
    const late2 = await runAnswered(w, CURL(mint && mint.ref, 'h2.example')), late3 = await runAnswered(w, CURL(mint && mint.ref, 'h3.example'));
    ok(!!(late2.card && late3.card && w.notices.length === n1), 'Ⓤd at +66 min h2.example asks again — its card (r8 ran it by own, silently, until the lock); h3.example asks too; no notice', { h2: !!late2.card, by2: late2.r && late2.r.by, h3: !!late3.card, notices: w.notices.length - n1 });
  });

  console.log('Ⓥ (r9, MINOR C) A SAVE OVER AN ENDED WINDOW THE HUB HAD NOT SWEPT — saved, the window gone; a refusal names the member');
  await leg('Ⓥ save over an ended window', async () => {
    const w = await world();
    const k = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'), { answer: 'always', caller: w.caller('cid-e', 'Eve') });   // another member: a hosts scope
    const win = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });   // Narrator: the window only
    w.clock.at = w.now() + 61 * MIN;   // the hour ended — and no prune ran (a restart or a lock inside the hour drops its timer)
    const held = windowsOf(memberRaw(w));
    const pub = w.useGrants.publicFor(w.e.id);
    // the dialog's Save with the hosts field EMPTY («each keeps its own»): each member planned as planOf plans it
    const plans = (pub.to || []).map((m) => ({ m, plan: VUR && VUR.saveScopesOf ? VUR.saveScopesOf({ was: m, hosts: m.hosts || [], cmds: m.commands || [], endId: 'keep', now: w.now() }) : null }));
    const pn = plans.find((x) => x.m.key === CID), pe = plans.find((x) => x.m.key === 'cid-e');
    const refused = plans.some((x) => !x.plan || x.plan.refused);
    const save = refused ? { ok: false, code: 'the dialog refused it' } : w.useGrants.setRow(w.e.id, { to: plans.map((x) => ({ kind: x.m.kind, key: x.m.key, name: x.m.name, scopes: x.plan.scopes })), except: [] }, { reauthed: false });
    ok(!!(k.a && k.a.ok && win.a && win.a.ok && held.length === 1 && pn && pn.plan && pn.plan.pruned === true && pn.plan.refused === false && pn.plan.scopes.length === 0 && pe && pe.plan && pe.plan.refused === false && save.ok && !memberRaw(w) && memberRaw(w, w.e.id, 'cid-e')), 'Ⓥa a member whose only scope is a 1-hour window that ENDED unswept: the owner\'s Save of the row (hosts left empty) is not refused — that member is sent with no scope (`pruned`), the hub prunes it: saved, the ended window gone, the other member kept as it was (a narrowing — no 验证是你)', { held: held.length, pn: pn && pn.plan, pe: pe && pe.plan && { refused: pe.plan.refused }, save });
    const nothing = VUR && VUR.saveScopesOf ? VUR.saveScopesOf({ was: null, hosts: [], cmds: [], endId: 'keep', now: w.now() }) : null;
    const src = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8');
    const KEY = 'Name the hosts {name} may use it for — a host name or address each (never «any host»)';
    ok(!!(nothing && nothing.refused === true && nothing.pruned === false && /if \(plan\.refused\) return \{ error: t\('Name the hosts \{name\} may use it for/.test(src) && /^请写明 \{name\} 可用于哪些主机/.test(String(ZH[KEY]))), 'Ⓥb a member with nothing to send and no window is still refused — and the refusal NAMES it («请写明 {name} 可用于哪些主机…», the hub\'s `principal` too)', { nothing, zh: ZH[KEY] });
  });

  console.log('Ⓦ (r9, MINOR D) A SAVE THAT LEAVES OUT A MEMBER HOLDING A LIVE WINDOW TELLS THE PRESS\'S RECORD');
  await leg('Ⓦ save tells the record', async () => {
    const w = await world();
    const k = await runAnswered(w, CURL(w.e.ref, 'api.tts.example'), { answer: 'always', caller: w.caller('cid-e', 'Eve') });
    const win = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
    w.clock.at += 4 * MIN;
    const T = w.now();
    const saveVia = (ww, row) => (typeof ww.door.saveRow === 'function' ? ww.door.saveRow(ww.e.id, row, { reauthed: false }) : ww.useGrants.setRow(ww.e.id, row, { reauthed: false }));   // the route's road (src/routes/vault.js)
    const eveOf = (ww) => { const m = (ww.useGrants.publicFor(ww.e.id).to || []).find((x) => x.key === 'cid-e'); const plan = VUR.saveScopesOf({ was: m, hosts: m.hosts || [], cmds: m.commands || [], endId: 'keep', now: ww.now() }); return { kind: 'conversation', key: 'cid-e', name: 'Eve', scopes: plan.scopes }; };
    const save = saveVia(w, { to: [eveOf(w)], except: [] });
    const rec = win.card && recordOf(w, win.card.action.askId), st = rec && FA.decidedStamp(rec, { t: tZH, now: T + MIN });
    const route = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
    ok(!!(k.a && k.a.ok && win.a && win.a.ok && save.ok && !memberRaw(w) && rec && rec.resolvedFact && rec.resolvedFact.endedBy === 'revoked' && rec.resolvedFact.endedAt === T && st && st.text === `已允许这个对话 1 小时 · 已于 ${hhmm(T)} 撤销` && /run\.saveRow\(String\(b\.id/.test(route)), `Ⓦa the owner's Save that leaves out the member holding a LIVE window (the Save route → the door's saveRow): the window goes and the press's record says «已允许这个对话 1 小时 · 已于 ${hhmm(T)} 撤销» — as both ✕ roads do`, { save, fact: rec && rec.resolvedFact, stamp: st && st.text });
    const w2 = await world();
    await runAnswered(w2, CURL(w2.e.ref, 'api.tts.example'), { answer: 'always', caller: w2.caller('cid-e', 'Eve') });
    const win2 = await runAnswered(w2, SHELL(w2.e.ref), { answer: 'window' });
    const keep = saveVia(w2, { to: [eveOf(w2), { kind: 'conversation', key: CID, name: 'Narrator', scopes: [] }], except: [] });   // the dialog's member with its live window (sent with no scope — the hub keeps it)
    const rec2 = win2.card && recordOf(w2, win2.card.action.askId);
    ok(!!(keep.ok && windowsOf(memberRaw(w2)).length === 1 && rec2 && rec2.resolvedFact && !rec2.resolvedFact.endedAt), 'Ⓦb (control) a Save that keeps that member: its live window rides it, the record says nothing new', { keep, fact: rec2 && rec2.resolvedFact });
  });
}

console.log('Ⓢ (r8, MINOR 7) THE VAULT CHIP — a live window has its own ✕; an ended one is drawn as the others; the source says the hour');
await leg('Ⓢ the chip', async () => {
  KIND = 'cluster'; TAG = '';
  const w = await world();
  const cmd = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--', 'python3', 'transcribe.py', 'part01.mp3'], { answer: 'always' });
  w.clock.at += 2000;
  const win = await runAnswered(w, SHELL(w.e.ref), { answer: 'window' });
  const at = w.now(), until = at + WINDOW_MS;
  await onPage(async () => {
    const chipOf = (pub) => { const ex = VUR && typeof VUR.useExtras === 'function' ? VUR.useExtras({ id: w.e.id, label: 'TTS API key', run: { use: { ...pub, entryHosts: [], used: { uses: 0, convs: 0 } } } }) : null; const els = ex ? walk(ex.box) : []; const chip = els.find((e) => / vw-use-chip|^vw-ak-chip vw-use-chip/.test(e.className) && /Narrator/.test(e.textContent)); return { chip, els: chip ? walk(chip) : [] }; };
    const live = chipOf(w.useGrants.publicFor(w.e.id));
    const wspan = live.els.find((e) => e.tagName === 'SPAN' && /\bvw-use-scope\b/.test(e.className) && /any destination/.test(e.textContent));
    const wx = live.els.find((e) => e.tagName === 'BUTTON' && /\bvw-use-window-x\b/.test(e.className));
    const mx = live.els.filter((e) => e.tagName === 'BUTTON' && /\bvw-use-x\b/.test(e.className));
    ok(!!(cmd.a && cmd.a.ok && win.a && win.a.ok && wspan && /\bvw-use-scope-window\b/.test(wspan.className) && /^any destination · until \d\d:\d\d · (60 min|1 h)$/.test(wspan.textContent) && wspan.textContent.includes(hhmm(until)) && wx && /1-hour approval only/.test(wx.title) && mx.length === 1), 'Ⓢa a LIVE window: «any destination · until HH:MM · 60 min» in the warning accent, its OWN ✕ beside it («Take back the 1-hour approval only…»), the member\'s ✕ apart', { span: wspan && { cls: wspan.className, text: wspan.textContent }, wx: wx && wx.title, mx: mx.length });
    ok(!!(live.chip && live.chip.textContent.includes(`«Allow for 1 hour» on a card · ${hhmm(at)}`) && !live.chip.textContent.includes('«Always» on a card')), 'Ⓢb the member written last by the 1-hour press says «“Allow for 1 hour” on a card · HH:MM» — never «“Always” on a card»', live.chip && live.chip.textContent);
    w.clock.at = until + MIN;
    const gone = chipOf(w.useGrants.publicFor(w.e.id));
    const espan = gone.els.find((e) => e.tagName === 'SPAN' && /\bvw-use-scope\b/.test(e.className) && /any destination/.test(e.textContent));
    const ex2 = gone.els.find((e) => e.tagName === 'BUTTON' && /\bvw-use-window-x\b/.test(e.className));
    ok(!!(espan && /\bvw-use-scope-ended\b/.test(espan.className) && !/\bvw-use-scope-window\b/.test(espan.className) && espan.title === `ended ${hhmm(until)}` && !ex2), `Ⓢc an ENDED window is drawn as the other ended scopes — line-through, NO warning accent, its title «ended ${hhmm(until)}» (never «✕ takes it back now»), no ✕ of its own`, espan && { cls: espan.className, title: espan.title, text: espan.textContent, x: !!ex2 });
    // r9 (MAJOR A): an except-only row (a prune or a ✕ left no member) is DRAWN — the owner sees the 除了 the next grant carries
    const w9 = await world();
    const s9 = w9.useGrants.setRow(w9.e.id, { to: [], except: [{ kind: 'conversation', key: 'cid-left-out', name: 'Left out' }] }, { reauthed: true });
    const ex9 = VUR && typeof VUR.useExtras === 'function' ? VUR.useExtras({ id: w9.e.id, label: 'TTS API key', run: { use: { ...w9.useGrants.publicFor(w9.e.id), entryHosts: [], used: { uses: 0, convs: 0 } } } }) : null;
    const els9 = ex9 ? walk(ex9.box) : [];
    const to9 = els9.find((e) => /\bvw-use-to\b/.test(e.className)), xs9 = els9.filter((e) => /\bvw-use-except\b/.test(e.className));
    ok(!!(s9 && s9.ok && to9 && to9.textContent === 'Used with no card by: nobody' && xs9.length === 1 && /^except /.test(xs9[0].textContent)), 'Ⓢd (r9, MAJOR A) an except-only row is drawn: «Used with no card by: nobody» and its «except …» chip (r8 drew nothing — the 除了 out of sight)', { s9: s9 && s9.ok, to: to9 && to9.textContent, except: xs9.map((e) => e.textContent) });
  });
});

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

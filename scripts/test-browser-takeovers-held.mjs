#!/usr/bin/env node
// test-browser-takeovers-held — data/browser-takeovers.json UNDER THE STORE-READ LAW (主开发 r3261, its second unit; lane
// bl-machines-b's census of the stores, «37 more»). FAST, in-process: the REAL keeper (src/server/browser-keeper.js — the request
// record's ONE writer) over a scratch data folder, two requests a person was asked for (two leases, two conversations), then a
// RESTART over the same folder with the refusal PLACED on the read (a store that does not parse; one this process may not read —
// said, not judged, where a run reads mode 0000).
// THE HARM it judges (the release): `loadRequests` read ANY failure as an empty queue, and the next write — an agent's ask, the
// person's Done, a For-you item's note, a lease's end — wrote the file over: EVERY OPEN REQUEST WAITING FOR A PERSON LOST, and an
// agent's page verbs ran on a browser a person had been asked to take over (the `human_asked` gate saw no request).
import './scratch.mjs';
import { scratch, deadPort } from './scratch.mjs';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';   // the tree's fake CLI: its daemons are `sleep`s this suite reaps
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
let STH = null; try { STH = require('../src/store-read-hold.js'); } catch { STH = null; }   // the tree's one hold (not in the release)
let pass = 0, fail = 0;
const ok = (c, title, detail) => { if (typeof title !== 'string') throw new TypeError('ok(cond, title): the title is no string — a swapped call'); if (c) { pass++; console.log(`  ✓ ${title}`); } else { fail++; console.log(`  ✗ ${title}`); if (detail !== undefined) console.log(`    ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 900)); } return !!c; };
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('takeovers-held');
const fake = writeFakeAgentBrowser(path.join(ROOT, 'bin'), path.join(ROOT, 'ab-state'));
process.on('exit', () => fake.reap());   // only the daemons the fake started (their pids in its own launch log)
const DEAD_CDP = await deadPort();   // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const PATH_ENV = `${path.join(ROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
process.env.PATH = PATH_ENV;
const KEY_C = 'bk-0000000c', KEY_D = 'bk-0000000d';
const until = async (fn, ms = 4000) => { const t = Date.now() + ms; while (Date.now() < t) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return !!fn(); };
const codeOf = (fn) => { try { const v = fn(); return v && typeof v === 'object' && !Array.isArray(v) && v.ok === false ? { code: v.code, error: v.error } : { value: v }; } catch (e) { return { code: e && e.code, error: e && e.message, threw: true }; } };
const heldCode = (x) => !!x && x.code === 'takeovers_unread' && /could not be read/.test(String(x.error || ''));
const placements = [
  { name: 'a takeover store that does not parse', slug: 'torn', torn: true, place: (f, good) => fs.writeFileSync(f, good.slice(0, Math.floor(good.length / 2))), holds: () => true },
  { name: 'a takeover store this process may not read', slug: 'mode', torn: false, place: (f) => fs.chmodSync(f, 0o000), holds: (f) => { try { fs.readFileSync(f); return false; } catch (e) { return e.code === 'EACCES'; } } },
];

for (const pl of placements) {
  console.log(`— ${pl.name}`);
  const dir = path.join(ROOT, pl.slug), home = path.join(dir, 'home'), data = path.join(dir, 'data');
  fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true }); fs.mkdirSync(data, { recursive: true });
  let clock = 5_000_000;
  const rtEnv = { PATH: PATH_ENV, HOME: home, FAKE_AB_STATE: path.join(ROOT, 'ab-state'), FAKE_AB_CDP_PORT: String(DEAD_CDP) };
  const mk = () => K.create({ dataDir: data, homeDir: home, env: () => rtEnv, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: null, getTelemetry: () => null, liveKeys: () => new Set([KEY_C, KEY_D]), log: quiet, now: () => clock, tickMs: 3600e3, install: false });
  // FIRST LIFE: two conversations, each on its own profile, each asked a person to take over
  const k1 = mk();
  const p1 = k1.createProfile({ label: 'Bank' }, { owner: { kind: 'session', id: KEY_C } }), p2 = k1.createProfile({ label: 'Mail' }, { owner: { kind: 'session', id: KEY_D } });
  await k1.attach({ profileId: p1.id, browserKey: KEY_C, sessionId: 'sess-c' }); await k1.attach({ profileId: p2.id, browserKey: KEY_D, sessionId: 'sess-d' });
  const a1 = k1.requestTakeover({ browserKey: KEY_C, profileId: p1.id, sessionId: 'sess-c', conversationName: 'Bank reconcile', text: 'Log in to the bank and solve the captcha' });
  clock += 1000;
  const a2 = k1.requestTakeover({ browserKey: KEY_D, profileId: p2.id, sessionId: 'sess-d', conversationName: 'Mail sort', text: 'Approve the sign-in on your phone' });
  const id1 = a1 && a1.request && a1.request.id, id2 = a2 && a2.request && a2.request.id;
  const gate1 = codeOf(() => k1.resolveFor({ browserKey: KEY_C }));
  k1.shutdown?.();
  const file = path.join(data, 'browser-takeovers.json');
  const good = fs.readFileSync(file, 'utf8');
  let disk = null; try { disk = JSON.parse(good); } catch { disk = null; }
  ok(!!a1.ok && !!a2.ok && !!disk && Array.isArray(disk.requests) && disk.requests.filter((r) => r.state === 'waiting').length === 2 && gate1.code === 'human_asked',
    'PREMISE: two requests WAIT for a person on disk (two leases, two conversations), and a page verb on the asked browser is refused human_asked', { a1: a1.ok || a1.code, a2: a2.ok || a2.code, gate: gate1.code, n: disk && disk.requests && disk.requests.length });
  pl.place(file, good);
  if (!pl.holds(file)) { fs.chmodSync(file, 0o600); console.log(`  (${pl.name}: this run reads a mode-0000 file — SAID, not judged)`); continue; }
  const s0 = fs.statSync(file), b0 = pl.torn ? fs.readFileSync(file) : null;   // a mode-0000 file is judged by its stat (this process may not read it)
  // THE RESTART over the refused read: every road asks before any wait (a torn store is held until its copy is made)
  clock += 1000;
  const k = mk();
  const queue = codeOf(() => k.takeoverRequests());
  ok(heldCode(queue), `${pl.name}: the owner's queue says THE HOLD by name (takeovers_unread) — never an empty «No browser is waiting for you»`, queue.value !== undefined ? { queue: Array.isArray(queue.value) ? queue.value.length : queue.value } : queue);
  const byId = codeOf(() => k.takeoverRequest(id1));
  ok(heldCode(byId), `${pl.name}: a request by its id says THE HOLD — never «no such request» (the person's Done, the agent's --status and its wait)`, byId.value !== undefined ? { found: byId.value } : byId);
  const gate = codeOf(() => k.resolveFor({ browserKey: KEY_C }));
  ok(heldCode(gate), `${pl.name}: a page verb on a browser a person may have been asked to take over is refused BY NAME while it cannot be told (fail closed) — never run as if nobody was asked`, gate.code ? gate : { ran: gate.value && gate.value.kind });
  const ask = codeOf(() => k.requestTakeover({ browserKey: KEY_C, profileId: p1.id, sessionId: 'sess-c', conversationName: 'Bank reconcile', text: 'Asked again after the restart' }));
  ok(heldCode(ask), `${pl.name}: the agent's ask is refused BY NAME before anything is filed`, ask.value !== undefined ? { filed: ask.value && ask.value.request && ask.value.request.id } : ask);
  const done = codeOf(() => k.resolveTakeoverRequest(id2, 'done'));
  ok(heldCode(done), `${pl.name}: the person's Done is refused BY NAME — never «not found»`, done);
  const s1 = fs.statSync(file);
  ok(s1.ino === s0.ino && (s1.mode & 0o777) === (s0.mode & 0o777) && s1.size === s0.size && s1.mtimeMs === s0.mtimeMs && (!b0 || fs.readFileSync(file).equals(b0)), `${pl.name}: after every press the store is NEVER written over — the same file, its bytes and mode (the two open requests kept)`, { ino: [s0.ino, s1.ino], mode: [(s0.mode & 0o777).toString(8), (s1.mode & 0o777).toString(8)] });
  const listed = !!STH && typeof STH.holds === 'function' && STH.holds().some((h) => h && h.held && path.basename(String(h.file || '')) === 'browser-takeovers.json');
  ok(listed, `${pl.name}: the family's ONE notice sees it (the helper's live holds list browser-takeovers.json while held)`);
  const hold = k._takeoverHold || null;
  if (!pl.torn) {
    fs.chmodSync(file, 0o600);   // the store reads again
    if (hold) await hold.again();
    await until(() => !hold || !hold.held());
    const back = codeOf(() => [k.takeoverRequest(id1), k.takeoverRequest(id2)]);
    const rs = Array.isArray(back.value) ? back.value : [];
    ok(rs.length === 2 && rs.every((r) => r && r.state === 'waiting'), `${pl.name}: once the store reads again, with NO restart, BOTH requests answer — still waiting for the person`, back.value ? rs.map((r) => r && r.state) : back);
    const gate2 = codeOf(() => k.resolveFor({ browserKey: KEY_C }));
    ok(gate2.code === 'human_asked', `${pl.name}: …and the asked browser's page verb is refused human_asked again (the request is known)`, gate2);
  } else {
    await until(() => !hold || !hold.held());
    const copies = fs.readdirSync(data).filter((n) => n.startsWith('browser-takeovers.json.corrupt-'));
    const copy = copies[0] ? path.join(data, copies[0]) : null;
    ok(copies.length === 1 && fs.readFileSync(copy).equals(b0) && (fs.statSync(copy).mode & 0o777) === 0o600, `${pl.name}: the torn bytes are kept aside ONCE, byte for byte, mode 0600`, { copies });
    const dmg = codeOf(() => (typeof k.takeoversDamaged === 'function' ? k.takeoversDamaged() : null));
    let live = null; try { live = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { live = { unread: e.code }; }
    ok(!!dmg.value && dmg.value.copy === copies[0] && !!live && !!live.damaged && live.damaged.copy === copies[0], `${pl.name}: then it starts EMPTY with the DAMAGED mark — in the new file and in the queue's answer (the copy's name)`, { said: dmg.value || dmg, file: live && live.damaged });
    k.shutdown?.();
    const k3 = mk();
    const d3 = codeOf(() => (typeof k3.takeoversDamaged === 'function' ? k3.takeoversDamaged() : null));
    ok(!!d3.value && d3.value.copy === copies[0], `${pl.name}: a RESTART still says the queue was damaged, with the copy's name (the mark lives in the file)`, d3.value || d3);
    k3.shutdown?.();
    continue;
  }
  k.shutdown?.();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

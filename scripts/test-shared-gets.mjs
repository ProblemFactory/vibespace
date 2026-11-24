#!/usr/bin/env node
// A GET IN FLIGHT IS SHARED (B-360d part 1, 主开发 r2197; lane bl-loop-a). src/lib/shared-gets.js over a counting stand-in fetch
// (node's own Response): its four laws, each with its RED (a copy of the module with that law cut):
//  ① TWO CALLERS WHILE IN FLIGHT: ONE request; each gets the whole answer, readable (its own copy). RED: the join cut ⇒ two requests
//  ② A LATER ASK, after it landed: a NEW request (nothing kept). RED: the entry kept past its landing ⇒ the later ask answered stale
//  ③ A FAILED SHARED READ tells EVERY caller: a rejection rejects both; a refusal (503) reaches both, its body whole. RED: the
//     joiners never told of a failure ⇒ the second caller never answers
//  ④ OTHER WORDS are another read: a query, a header, a body, a signal, a Request object — each its own request; a relative URL
//     is resolved against the page's address AS THE KEY IS MADE. REDs: the headers left out of the key ⇒ the two scopes share; the
//     address read at install ⇒ one request for two pages' reads
//  ⑤ WRITES ARE NEVER SHARED: two POSTs (and a PUT, a DELETE) at once ⇒ each its own request. RED: the method check cut ⇒ the
//     DELETE and the bodiless post share
//  ⑥ THE PAGE INSTALLS IT at its boot, over window.fetch, before the exit hop and the App (src/client.js, by text; the imports run
//     before it: a fetch at a module's top level goes unshared). CONTROL: a copy without it is named
// A green leg waits GENEROUSLY (3 s) for its answers; a RED's «never answers» is read at 400 ms (a hung promise never answers)
// Run: node scripts/test-shared-gets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratch, anchored, endScratchAtExit } from './scratch.mjs';   // §113: the first import after node's own

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const SRC = path.join(REPO, 'src/lib/shared-gets.js');
const src = fs.readFileSync(SRC, 'utf8');
const TMP = scratch('shared-gets'); fs.mkdirSync(TMP, { recursive: true }); endScratchAtExit(TMP);   // the module's copies (each law cut) live here
let seq = 0;
const load = async (text, tag) => { const f = path.join(TMP, `shared-gets-${tag}-${++seq}.mjs`); fs.writeFileSync(f, text); return import(f); };
const BASE = 'http://127.0.0.1:1/';
// a stand-in fetch: counts its calls, answers after a turn (in flight while the test asks again), by the url
function stand({ fail = null, status = 200 } = {}) {
  const calls = [];
  const fetch = (input, init) => { calls.push({ input: String(input), method: (init && init.method) || 'GET' });
    return new Promise((resolve, reject) => setTimeout(() => (fail ? reject(fail) : resolve(new Response(JSON.stringify({ url: String(input), n: calls.length }), { status, headers: { 'Content-Type': 'application/json' } }))), 15)); };
  return { fetch, calls };
}
const GREEN_MS = 3000, HUNG_MS = 400;
const settle = (p, ms = GREEN_MS) => Promise.race([p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String((e && e.message) || e) })), new Promise((r) => setTimeout(() => r({ hung: true }), ms))]);

try {
  const M = await load(src, 'base');
  const cutJoin = await load(anchored(src, '    if (had && age >= 0 && age < joinMs && had.era === era && writesOut === 0) return new Promise((resolve, reject) => { had.joiners.push({ resolve, reject }); });   // (e) young, (f) no write since it began: joined\n', '', 'shared-gets-join-cut'), 'join-cut');
  const keptEntry = await load(anchored(src, "      if (inflight.get(key) === entry) inflight.delete(key);   // (a) nothing kept after it lands\n", '', 'shared-gets-kept'), 'kept');
  const deafJoiners = await load(anchored(src, '      for (const j of entry.joiners) j.reject(err);   // (b) a failure reaches every caller that shared it\n', '', 'shared-gets-deaf'), 'deaf');
  const noHeads = await load(anchored(src, "  return JSON.stringify([url, heads, o.credentials || '', o.cache || '']);\n", "  return JSON.stringify([url, [], o.credentials || '', o.cache || '']);\n", 'shared-gets-no-heads'), 'no-heads');
  const anyMethod = await load(anchored(src, "  if (method !== 'GET') return null;\n", '', 'shared-gets-any-method'), 'any-method');
  const noWindow = await load(anchored(src, '    if (had && age >= 0 && age < joinMs && had.era', '    if (had && had.era', 'shared-gets-no-window'), 'no-window');
  const noWrites = await load(anchored(src, ' && had.era === era && writesOut === 0) return new Promise(', ') return new Promise(', 'shared-gets-no-writes'), 'no-writes');
  const answerStill = await load(anchored(src, '  const writeAnswered = () => { writesOut--; era++; };\n', '  const writeAnswered = () => { writesOut--; };\n', 'shared-gets-answer-still'), 'answer-still');
  const everyUnshared = await load(anchored(src, "      if (methodOf(input, init) === 'GET') return fetchImpl(input, init);", '      if (false) return fetchImpl(input, init);', 'shared-gets-every-unshared'), 'every-unshared');
  const negJoins = await load(anchored(src, 'if (had && age >= 0 && age < joinMs', 'if (had && age < joinMs', 'shared-gets-negative-age'), 'negative-age');
  const lateMark = await load(anchored(src, '      p.then(writeAnswered, writeAnswered);', '      Promise.resolve().then(() => p.then(writeAnswered, writeAnswered));', 'shared-gets-late-mark'), 'late-mark');
  const frozenClock = await load(anchored(src, "const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());", 'const clock = () => 0;', 'shared-gets-frozen-clock'), 'frozen-clock');
  const baseAtInstall = await load(anchored(src, 'export function sharedGets(fetchImpl, { base = null, joinMs = JOIN_MS, now = clock } = {}) {', "export function sharedGets(fetchImpl, { base = (typeof location !== 'undefined' ? location.href : 'http://localhost/'), joinMs = JOIN_MS, now = clock } = {}) {", 'shared-gets-base-at-install'), 'base-at-install');

  console.log('① two callers while in flight: one request');
  const run1 = async (mod) => { const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE }); const [a, b] = await Promise.all([f('/api/tasks'), f('/api/tasks')]); const [ja, jb] = await Promise.all([a.json(), b.json()]); return { calls: s.calls.length, ja, jb, left: f.inflightCount() }; };
  const g1 = await run1(M), r1 = await run1(cutJoin);
  ok(g1.calls === 1 && g1.ja.url === g1.jb.url && g1.ja.n === 1 && g1.jb.n === 1 && g1.left === 0, `two callers of /api/tasks while it is in flight: ${g1.calls} request; each reads the whole answer (its own copy); nothing left in flight after it`, g1);
  ok(r1.calls === 2, `RED: the join cut ⇒ ${r1.calls} requests`, r1);

  console.log('② a later ask, after it landed: a new request (nothing kept)');
  const run2 = async (mod, ms) => { const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE }); const a = await f('/api/user-todos'); await a.json(); const b = await settle(f('/api/user-todos'), ms); const jb = b.ok ? await b.v.json() : null; return { calls: s.calls.length, second: jb && jb.n, b: b.hung ? 'hung' : 'answered' }; };
  const g2 = await run2(M), r2 = await run2(keptEntry, HUNG_MS);
  ok(g2.calls === 2 && g2.second === 2, `an ask after the first landed is a NEW request (${g2.calls} in all; its answer is the second read's)`, g2);
  ok(r2.calls === 1, `RED: the entry kept past its landing ⇒ the later ask never reaches the hub (${r2.calls} request: ${r2.b})`, r2);

  console.log('③ a failed shared read tells every caller');
  const run3 = async (mod, ms) => { const s = stand({ fail: new Error('the hub did not answer') }); const f = mod.sharedGets(s.fetch, { base: BASE }); const [a, b] = await Promise.all([settle(f('/api/hosts'), ms), settle(f('/api/hosts'), ms)]); return { calls: s.calls.length, a, b }; };
  const g3 = await run3(M), r3 = await run3(deafJoiners, HUNG_MS);
  ok(g3.calls === 1 && g3.a.ok === false && g3.b.ok === false && g3.a.e === 'the hub did not answer' && g3.b.e === 'the hub did not answer', 'a rejected read rejects BOTH callers with its own error (one request)', g3);
  ok(r3.b.hung === true, `RED: the joiners never told of a failure ⇒ the second caller never answers (${JSON.stringify(r3.b)})`, r3);
  { const s = stand({ status: 503 }); const f = M.sharedGets(s.fetch, { base: BASE }); const [a, b] = await Promise.all([f('/api/vault/state'), f('/api/vault/state')]); const [ja, jb] = await Promise.all([a.json(), b.json()]);
    ok(s.calls.length === 1 && a.status === 503 && b.status === 503 && ja.url === jb.url, `a refusal (503) reaches both callers as its own copy, the body whole (${s.calls.length} request)`, { a: a.status, b: b.status }); }

  console.log('④ other words are another read');
  { const run4 = async (mod) => { const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE }); const ac = new AbortController();
      const rs = await Promise.all([f('/api/x?a=1'), f('/api/x?a=2'), f('/api/x?a=1', { headers: { 'X-Scope': 'one' } }), f('/api/x?a=1', { headers: { 'X-Scope': 'two' } }), f('/api/x?a=1', { signal: ac.signal }), f(new Request(BASE + 'api/x?a=1'))]);
      await Promise.all(rs.map((r) => r.text())); return s.calls.map((c) => c.input); };
    const g4 = await run4(M), r4 = await run4(noHeads);
    ok(g4.length === 6, `a query, a header (each its own), a signal and a Request object are each another read: ${g4.length} requests for 6 asks`, g4);
    ok(r4.length < 6, `RED: the headers left out of the key ⇒ the two scopes share one read (${r4.length} requests for 6 asks)`, r4); }
  { const run4b = async (mod) => { const s = stand(); globalThis.location = { href: 'http://page.test/a/' };
      try { const f = mod.sharedGets(s.fetch); const p1 = f('api/x'); globalThis.location.href = 'http://page.test/b/'; const p2 = f('api/x'); await Promise.all([p1, p2].map((p) => p.then((r) => r.text()))); return s.calls.length; }
      finally { delete globalThis.location; } };
    const g4b = await run4b(M), r4b = await run4b(baseAtInstall);
    ok(g4b === 2, `a relative URL is resolved against the page's address AS THE KEY IS MADE: «api/x» under /a/ and then /b/ is two reads (${g4b} requests)`);
    ok(r4b === 1, `RED: the address read at install ⇒ the read under /b/ joins the one under /a/ (${r4b} request)`); }
  { const s = stand(); const f = M.sharedGets(s.fetch, { base: BASE }); const rs = await Promise.all([f('/api/x', { headers: { 'X-A': '1', 'X-B': '2' } }), f('/api/x', { headers: { 'x-b': '2', 'x-a': '1' } })]); await Promise.all(rs.map((r) => r.text()));
    ok(s.calls.length === 1, `the same headers in another order and case are the same read (${s.calls.length} request)`, s.calls); }

  console.log('⑤ writes are never shared');
  { const run5 = async (mod) => { const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE });
      const rs = await Promise.all([f('/api/x', { method: 'DELETE' }), f('/api/x', { method: 'post' }), f('/api/x', { method: 'POST', body: '{}' }), f('/api/x', { method: 'POST', body: '{}' }), f('/api/x', { method: 'PUT', body: '{}' })]);   // the two bodiless first: in the red copy they are asked before any write is out (law f)
      await Promise.all(rs.map((r) => r.text())); return s.calls.map((c) => c.method); };
    const g5 = await run5(M), r5 = await run5(anyMethod);
    ok(g5.length === 5, `two POSTs, a PUT, a DELETE and a lower-case post at once: ${g5.length} requests (none shared)`, g5);
    ok(r5.length === 4, `RED: the method check cut ⇒ the DELETE and the bodiless post share one request (${r5.length} for 5)`, r5); }

  console.log('⑦ a read that HANGS is joined only while it is young (主开发 r3683)');
  {
    const run7 = async (mod, lateMs) => {
      let T = 5000, n = 0; const calls = [];
      const fetch = (input) => { calls.push(String(input)); n++; const k = n; return k === 1 ? new Promise(() => { }) : Promise.resolve(new Response(JSON.stringify({ n: k }), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
      const f = mod.sharedGets(fetch, { base: BASE, now: () => T });
      void f('/api/chat-tail');   // the first read: it never replies (a stalled connection, a hub slow to reply)
      T += 200; const young = settle(f('/api/chat-tail'), HUNG_MS);   // inside the window: it joins the young read
      T += 2000; const late = await settle(f('/api/chat-tail'), lateMs);   // past the window: its own request
      const lateN = late.ok ? (await late.v.json()).n : null, y = await young;
      return { calls: calls.length, lateN, youngHung: !!y.hung, late: late.hung ? 'hung' : late.ok ? 'answered' : late.e };
    };
    const [g7, r7] = await Promise.all([run7(M, GREEN_MS), run7(noWindow, HUNG_MS)]);   // side by side: the two waits overlap
    ok(g7.calls === 2 && g7.lateN === 2 && g7.youngHung, `a read that never replies: an ask ${200} ms after it JOINS it (no request), an ask past the window (${M.JOIN_MS} ms) is its OWN request and its reply lands (${g7.calls} requests; the late ask ${g7.late})`, g7);
    ok(r7.calls === 1 && r7.late === 'hung', `RED: a join at any age ⇒ the later ask joins the hung read and never answers (${r7.calls} request; the late ask ${r7.late})`, r7);
  }

  console.log('⑧ a read asked after a WRITE of the page never joins a read begun before that write was answered (主开发 r3697, law f)');
  {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const held = () => {   // a fetch whose every request waits for the leg to answer it, by its order
      const calls = [];
      const fetch = (input, init) => new Promise((resolve, reject) => { calls.push({ url: String(input), method: (init && init.method) || 'GET', resolve, reject }); });
      const answer = (i, body) => { if (calls[i]) calls[i].resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
      return { fetch, calls, answer };
    };
    const listOf = async (p) => { const g = await settle(p, HUNG_MS); return g.ok ? (await g.v.json()).list : g.hung ? 'hung' : g.e; };
    const gets = (h) => h.calls.filter((c) => c.method === 'GET').length;
    // (1) a read in flight; a write sent and ANSWERED; the same read asked again
    const run8a = async (mod) => {
      const h = held(), f = mod.sharedGets(h.fetch, { base: BASE });
      const r1 = f('/api/tasks'); await tick();
      const w = f('/api/tasks', { method: 'POST', body: '{}' }); await tick();
      h.answer(1, { saved: true }); await w;
      const r2 = f('/api/tasks'); await tick();
      const n = gets(h); h.answer(0, { list: 'before' }); h.answer(2, { list: 'after' });
      const list = await listOf(r2); await r1;
      return { gets: n, list };
    };
    // (2) a write sent; a read begun WHILE it is out; the write answered; the same read asked again
    const run8b = async (mod) => {
      const h = held(), f = mod.sharedGets(h.fetch, { base: BASE });
      const w = f('/api/tasks', { method: 'POST', body: '{}' }); await tick();
      const r1 = f('/api/tasks'); await tick();
      h.answer(0, { saved: true }); await w;
      const r2 = f('/api/tasks'); await tick();
      const n = gets(h); h.answer(1, { list: 'before' }); h.answer(2, { list: 'after' });
      const list = await listOf(r2); await r1;
      return { gets: n, list };
    };
    // (3) two reads with NO write between (an unshared READ, its own signal, sent and answered between them)
    const run8c = async (mod) => {
      const h = held(), f = mod.sharedGets(h.fetch, { base: BASE });
      const r1 = f('/api/tasks'); await tick();
      const u = f('/api/tasks', { signal: new AbortController().signal }); await tick();
      h.answer(1, { list: 'own' }); await u;
      const r2 = f('/api/tasks'); await tick();
      const n = h.calls.length; h.answer(0, { list: 'one' }); h.answer(2, { list: 'two' });
      const list = await listOf(r2); await r1;
      return { requests: n, list };
    };
    const [a, aR, b, bR, c, cR] = await Promise.all([run8a(M), run8a(noWrites), run8b(M), run8b(answerStill), run8c(M), run8c(everyUnshared)]);
    ok(a.gets === 2 && a.list === 'after', `a read in flight, a write sent and answered, the same read asked again: TWO requests and the later ask gets the reply after the write (${a.gets} reads; «${a.list}»)`, a);
    ok(aR.gets === 1 && aR.list === 'before', `RED: no write law ⇒ the later ask joins the read begun before the write and shows the list from before it (${aR.gets} read; «${aR.list}»)`, aR);
    ok(b.gets === 2 && b.list === 'after', `a read begun WHILE the write was out, asked again after the write got its reply: its own request (${b.gets} reads; «${b.list}»)`, b);
    ok(bR.gets === 1 && bR.list === 'before', `RED: the write's answer not counted ⇒ that later ask joins the read begun before the answer (${bR.gets} read; «${bR.list}»)`, bR);
    ok(c.requests === 2 && c.list === 'one', `two reads with no write between (an unshared read between them): still ONE request for the two (${c.requests} requests in all; «${c.list}»)`, c);
    ok(cR.requests === 3 && cR.list === 'two', `RED: every unshared ask counted as a write ⇒ the second read is a request of its own (${cR.requests} requests; «${cR.list}»)`, cR);
  }

  console.log('⑨ a negative age never joins (the clock stepped back) · the DEFAULT clock bounds the window (主开发 r3697)');
  {
    const run9 = async (mod) => { let T = 5000; const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE, now: () => T }); const p1 = f('/api/neg'); T = 4000; const p2 = f('/api/neg'); await Promise.all([p1, p2]); return s.calls.length; };
    const run10 = async (mod, lateMs) => {
      let n = 0; const fetch = () => (++n === 1 ? new Promise(() => { }) : Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
      const f = mod.sharedGets(fetch, { base: BASE, joinMs: 60 });   // no clock handed: the module's own
      void f('/api/clock'); const young = settle(f('/api/clock'), HUNG_MS);
      await new Promise((r) => setTimeout(r, 150));
      const late = await settle(f('/api/clock'), lateMs), y = await young;
      return { requests: n, youngHung: !!y.hung, late: late.hung ? 'hung' : late.ok ? 'answered' : late.e };
    };
    const [n9, n9R, d, dR] = await Promise.all([run9(M), run9(negJoins), run10(M, GREEN_MS), run10(frozenClock, HUNG_MS)]);
    ok(n9 === 2, `an age below zero (the clock read back 1000 ms) never joins: its own request (${n9} requests)`, { n9 });
    ok(n9R === 1, `RED: a negative age taken as young ⇒ joined (${n9R} request)`, { n9R });
    ok(d.requests === 2 && d.youngHung && d.late === 'answered', `the DEFAULT clock: an ask at once joins the hung read, an ask 150 ms later (a 60 ms window) is its own request and its reply lands (${d.requests} requests; the late ask ${d.late})`, d);
    ok(dR.requests === 1 && dR.late === 'hung', `RED: a clock that never moves ⇒ the late ask joins the hung read and hangs (${dR.requests} request; ${dR.late})`, dR);
  }

  console.log('⑩ a write whose fetch hands back a THENABLE that is not native: its answer is marked before the caller goes on (主开发 r3707)');
  {
    const runT = async (mod) => {
      const calls = [];
      const fetch = (input, init) => {
        calls.push((init && init.method) || 'GET');
        if (init && init.method === 'POST') return { then(res) { setTimeout(() => res(new Response('{}', { status: 200 })), 5); } };   // a thenable, not a native promise
        return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify({ n: calls.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })), 15));
      };
      const f = mod.sharedGets(fetch, { base: BASE });   // the default road: the module's own clock and window
      await f('/api/tasks', { method: 'POST', body: '{}' });
      const a = f('/api/tasks'), b = f('/api/tasks');   // asked at once, right after the write's answer
      await Promise.all([a, b]);
      return calls.filter((m) => m === 'GET').length;
    };
    const [gT, rT] = await Promise.all([runT(M), runT(lateMark)]);
    ok(gT === 1, `a write answered by a thenable: two reads asked at once right after its answer share ONE request (${gT}) — the answer's mark ran before the caller went on`, { gT });
    ok(rT === 2, `RED: the mark registered after the caller's own ⇒ the write still counts as out when the caller reads: the two reads go unshared (${rT} requests)`, { rT });
  }

  console.log('⑥ the page installs it at its boot, before the exit hop and the App (by text)');
  { const cl = fs.readFileSync(path.join(REPO, 'src/client.js'), 'utf8');
    const installed = (t) => { const i = t.indexOf('window.fetch = sharedGets(window.fetch.bind(window))'), j = t.indexOf('continueExit()'), k = t.indexOf('new App('); return i > 0 && /import \{ sharedGets \} from '\.\/lib\/shared-gets\.js';/.test(t) && (j < 0 || i < j) && (k < 0 || i < k); };
    ok(installed(cl), 'src/client.js wraps window.fetch with sharedGets before the exit hop and the App (the first fetches of the load)');
    ok(!installed(cl.replace('window.fetch = sharedGets(window.fetch.bind(window))', 'void 0')), 'CONTROL: a copy without the wrap is named'); }
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

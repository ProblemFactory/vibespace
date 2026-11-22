#!/usr/bin/env node
// THE PAGE ASKS EACH ROUTE ONCE (B-360d part 1, 主开发 r2197; lane bl-loop-a). src/lib/shared-gets.js over a counting stand-in fetch
// (node's own Response): its four laws, each with its RED (a copy of the module with that law cut):
//  ① TWO CALLERS WHILE IN FLIGHT: ONE request; each gets the whole answer, readable (its own copy). RED: the join cut ⇒ two requests
//  ② A LATER ASK, after it landed: a NEW request (nothing kept). RED: the entry kept past its landing ⇒ the later ask answered stale
//  ③ A FAILED SHARED READ tells EVERY caller: a rejection rejects both; a refusal (503) reaches both, its body whole. RED: the
//     joiners never told of a failure ⇒ the second caller never answers
//  ④ OTHER WORDS are another read: a query, a header, a body, a signal, a Request object — each its own request
//  ⑤ WRITES ARE NEVER SHARED: two POSTs (and a PUT, a DELETE) at once ⇒ each its own request
//  ⑥ THE PAGE INSTALLS IT at its boot, over window.fetch, before anything fetches (src/client.js, by text). CONTROL: a copy without
//     it is named
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
const settle = (p, ms = 400) => Promise.race([p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String((e && e.message) || e) })), new Promise((r) => setTimeout(() => r({ hung: true }), ms))]);

try {
  const M = await load(src, 'base');
  const cutJoin = await load(anchored(src, '    if (had) return new Promise((resolve, reject) => { had.joiners.push({ resolve, reject }); });\n', '', 'shared-gets-join-cut'), 'join-cut');
  const keptEntry = await load(anchored(src, "      if (inflight.get(key) === entry) inflight.delete(key);   // (a) nothing kept after it lands\n", '', 'shared-gets-kept'), 'kept');
  const deafJoiners = await load(anchored(src, '      for (const j of entry.joiners) j.reject(err);   // (b) a failure reaches every caller that shared it\n', '', 'shared-gets-deaf'), 'deaf');

  console.log('① two callers while in flight: one request');
  const run1 = async (mod) => { const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE }); const [a, b] = await Promise.all([f('/api/tasks'), f('/api/tasks')]); const [ja, jb] = await Promise.all([a.json(), b.json()]); return { calls: s.calls.length, ja, jb, left: f.inflightCount() }; };
  const g1 = await run1(M), r1 = await run1(cutJoin);
  ok(g1.calls === 1 && g1.ja.url === g1.jb.url && g1.ja.n === 1 && g1.jb.n === 1 && g1.left === 0, `two callers of /api/tasks while it is in flight: ${g1.calls} request; each reads the whole answer (its own copy); nothing left in flight after it`, g1);
  ok(r1.calls === 2, `RED: the join cut ⇒ ${r1.calls} requests`, r1);

  console.log('② a later ask, after it landed: a new request (nothing kept)');
  const run2 = async (mod) => { const s = stand(); const f = mod.sharedGets(s.fetch, { base: BASE }); const a = await f('/api/user-todos'); await a.json(); const b = await settle(f('/api/user-todos')); const jb = b.ok ? await b.v.json() : null; return { calls: s.calls.length, second: jb && jb.n, b: b.hung ? 'hung' : 'answered' }; };
  const g2 = await run2(M), r2 = await run2(keptEntry);
  ok(g2.calls === 2 && g2.second === 2, `an ask after the first landed is a NEW request (${g2.calls} in all; its answer is the second read's)`, g2);
  ok(r2.calls === 1, `RED: the entry kept past its landing ⇒ the later ask never reaches the hub (${r2.calls} request: ${r2.b})`, r2);

  console.log('③ a failed shared read tells every caller');
  const run3 = async (mod) => { const s = stand({ fail: new Error('the hub did not answer') }); const f = mod.sharedGets(s.fetch, { base: BASE }); const [a, b] = await Promise.all([settle(f('/api/hosts')), settle(f('/api/hosts'))]); return { calls: s.calls.length, a, b }; };
  const g3 = await run3(M), r3 = await run3(deafJoiners);
  ok(g3.calls === 1 && g3.a.ok === false && g3.b.ok === false && g3.a.e === 'the hub did not answer' && g3.b.e === 'the hub did not answer', 'a rejected read rejects BOTH callers with its own error (one request)', g3);
  ok(r3.b.hung === true, `RED: the joiners never told of a failure ⇒ the second caller never answers (${JSON.stringify(r3.b)})`, r3);
  { const s = stand({ status: 503 }); const f = M.sharedGets(s.fetch, { base: BASE }); const [a, b] = await Promise.all([f('/api/vault/state'), f('/api/vault/state')]); const [ja, jb] = await Promise.all([a.json(), b.json()]);
    ok(s.calls.length === 1 && a.status === 503 && b.status === 503 && ja.url === jb.url, `a refusal (503) reaches both callers as its own copy, the body whole (${s.calls.length} request)`, { a: a.status, b: b.status }); }

  console.log('④ other words are another read');
  { const s = stand(); const f = M.sharedGets(s.fetch, { base: BASE }); const ac = new AbortController();
    const rs = await Promise.all([f('/api/x?a=1'), f('/api/x?a=2'), f('/api/x?a=1', { headers: { 'X-Scope': 'one' } }), f('/api/x?a=1', { headers: { 'X-Scope': 'two' } }), f('/api/x?a=1', { signal: ac.signal }), f(new Request(BASE + 'api/x?a=1'))]);
    await Promise.all(rs.map((r) => r.text()));
    ok(s.calls.length === 6, `a query, a header (each its own), a signal and a Request object are each another read: ${s.calls.length} requests for 6 asks`, s.calls.map((c) => c.input)); }
  { const s = stand(); const f = M.sharedGets(s.fetch, { base: BASE }); const rs = await Promise.all([f('/api/x', { headers: { 'X-A': '1', 'X-B': '2' } }), f('/api/x', { headers: { 'x-b': '2', 'x-a': '1' } })]); await Promise.all(rs.map((r) => r.text()));
    ok(s.calls.length === 1, `the same headers in another order and case are the same read (${s.calls.length} request)`, s.calls); }

  console.log('⑤ writes are never shared');
  { const s = stand(); const f = M.sharedGets(s.fetch, { base: BASE });
    const rs = await Promise.all([f('/api/x', { method: 'POST', body: '{}' }), f('/api/x', { method: 'POST', body: '{}' }), f('/api/x', { method: 'PUT', body: '{}' }), f('/api/x', { method: 'DELETE' }), f('/api/x', { method: 'post' })]);
    await Promise.all(rs.map((r) => r.text()));
    ok(s.calls.length === 5, `two POSTs, a PUT, a DELETE and a lower-case post at once: ${s.calls.length} requests (none shared)`, s.calls.map((c) => c.method)); }

  console.log('⑥ the page installs it at its boot, before anything fetches (by text)');
  { const cl = fs.readFileSync(path.join(REPO, 'src/client.js'), 'utf8');
    const installed = (t) => { const i = t.indexOf('window.fetch = sharedGets(window.fetch.bind(window))'), j = t.indexOf('continueExit()'), k = t.indexOf('new App('); return i > 0 && /import \{ sharedGets \} from '\.\/lib\/shared-gets\.js';/.test(t) && (j < 0 || i < j) && (k < 0 || i < k); };
    ok(installed(cl), 'src/client.js wraps window.fetch with sharedGets before the exit hop and the App (the first fetches of the load)');
    ok(!installed(cl.replace('window.fetch = sharedGets(window.fetch.bind(window))', 'void 0')), 'CONTROL: a copy without the wrap is named'); }
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * The remote "Recent" zone kept showing a terminated session as live until the
 * user pressed ⟳: the server dropped ITS discovery cache and told nobody, and
 * the client's per-host list has no TTL. This pins the notification to the one
 * invalidation entry point — the bug existed precisely because one call site
 * (/api/kill-pid) had a hand-wired refresh and the ws terminate path did not.
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';   // B-574d (lane nl-paired): the cache's red control loads a copy
const require = createRequire(import.meta.url);
const { HostManager } = require('../src/hosts.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const h = new HostManager({ dataDir: scratch('disc-dirty') });
const seen = [];
h.onDiscoveryDirty = (id) => seen.push(id);

h._discoveryCache.set('h1', { at: Date.now(), sessions: [{ id: 'a' }] });
h.invalidateDiscovery('h1');
ok(!h._discoveryCache.has('h1'), 'invalidateDiscovery drops the cached list');
ok(seen.length === 1 && seen[0] === 'h1', 'invalidateDiscovery notifies with the host id');

// no hook installed must never throw (server may not have wired it yet at boot)
h.onDiscoveryDirty = null;
let threw = false;
try { h.invalidateDiscovery('h2'); } catch { threw = true; }
ok(!threw, 'a missing hook is harmless');
h.onDiscoveryDirty = () => { throw new Error('boom'); };
threw = false;
try { h.invalidateDiscovery('h3'); } catch { threw = true; }
ok(!threw, 'a throwing consumer cannot break invalidation');

// DRIFT GUARD: every other site must route through invalidateDiscovery, or the
// next feature silently reintroduces "server knows, client does not".
const src = readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf-8');
const raw = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('_discoveryCache.delete'));
// allowed: inside invalidateDiscovery itself, and host REMOVAL (the record is
// gone; a dirty signal for a host that no longer exists is meaningless —
// hosts-updated covers that case)
ok(raw.length <= 2, `raw _discoveryCache.delete confined to invalidate+remove (found ${raw.length}: lines ${raw.map(([n]) => n).join(',')})`);

// The client must react to the broadcast — and must NOT fan out ssh scans for
// hosts nobody is displaying.
const wb = readFileSync(new URL('../src/lib/sidebar-workbench.js', import.meta.url), 'utf-8');
ok(verdictOf(/'remote-sessions'/.test(wb)), 'client applies the pushed session list');
ok(!/_loadRemoteHost\(id, \{ fresh: true \}\)[\s\S]{0,80}remote-sessions/.test(wb) && !/remote-discovery-dirty/.test(wb),
   'client does NOT re-fetch on the signal (the computation is not the orchestrator-side clients\' job)');
ok(verdictOf(/msg\.error[\s\S]{0,200}sessions: cur\?\.sessions \|\| null/.test(wb)), 'an unreachable machine degrades to the labelled last-known list');
const srv = readFileSync(new URL('../server.js', import.meta.url), 'utf-8');
ok(verdictOf(/onDiscoveryDirty[\s\S]{0,900}discoverSessions[\s\S]{0,300}remote-sessions/.test(srv)), 'server computes once and pushes the RESULT');
ok(verdictOf(/onDiscoveryDirty[\s\S]{0,700}wss\.clients\.size/.test(srv)), 'no computation when nobody is connected');

// ── SWR cold start (2.320.0, inc-msp2srj2): a cold discoverSessions with a
// persisted last-known list returns it INSTANTLY (stale-marked) and kicks the
// background refresh through the same dirty→push channel; an explicit ⟳
// (ttlMs 0) still blocks for the real scan.
{
  const h2 = new HostManager({ dataDir: scratch('disc-swr') });
  h2._state.hosts.push({ id: 'hX', name: 'X' });
  h2._persistedDisc['hX'] = { at: Date.now() - 3600e3, sessions: [{ sessionId: 'aaa', status: 'remote-running' }] };
  let kicked = null; h2.onDiscoveryDirty = (id) => { kicked = id; };
  // "instantly" is EVIDENCE (lane mirror-flake-hardening): the call settles before the event loop turns — no scan, no
  // round trip stood in front of the persisted list — never a wall-clock bound
  const t0 = Date.now();
  const pr = h2.discoverSessions('hX', {});
  const now = await Promise.race([pr.then(() => true, () => true), new Promise((res) => setImmediate(() => res(false)))]);
  const r = await pr;
  ok(gateOf(now) && r.length === 1 && r[0].stale === true, `cold call serves the persisted list instantly — before the loop turned (${Date.now() - t0} ms) — stale-marked`);
  ok(kicked === 'hX', 'and kicks the background refresh through the dirty channel');
  // ttlMs 0 must NOT serve stale (the ⟳ contract) — it runs the real ladder,
  // which for a fake host fails into the stale-cache rung of the ladder
  // itself (a different, labelled path) or throws; either way NOT the 1ms
  // instant return (we assert it does not return the instant-stale shape
  // by checking the SWR branch is gated on ttlMs > 0 in source).
  const src2 = readFileSync(new URL('../src/hosts.js', import.meta.url), 'utf-8');
  ok(verdictOf(/ttlMs > 0 && !hit && this\._persistedDisc/.test(src2)), 'SWR branch is gated on ttlMs > 0 (explicit ⟳ still scans)');
}

// B-574d (lane nl-paired, 主开发 r4752): THE LAST-KNOWN SESSIONS GO THROUGH THE STORE WRITER — a write at a cadence (after every
// discovery result) never on the hub's loop: ONE hand-off per result under its row's name, the bytes made AT the write (the latest
// lists), no synchronous write of the file; through the real writer the file lands and the next start reads it.
// RED: a copy with the release's 2 s timer and its writeFileSync + renameSync on the loop — nothing handed to the writer, and its
// timer (fired at once inside the scene: setTimeout stubbed for the two calls) writes the file synchronously.
{
  const fsm = require('fs');
  const REPO = require('path').resolve(new URL('..', import.meta.url).pathname);
  const scene = (HM, tag) => {
    const dd = scratch('disc-cache-writer-' + tag); fsm.mkdirSync(dd, { recursive: true });   // a data folder that exists, as the hub's does
    const hm = new HM({ dataDir: dd });
    const handed = []; hm._storeWriter = { dirty: (f, o) => handed.push([f, o]) };
    const w0 = fsm.writeFileSync, r0 = fsm.renameSync; let syncWrites = 0;
    fsm.writeFileSync = function (f, ...a) { if (String(f).startsWith(hm._discFile)) syncWrites++; return w0.call(this, f, ...a); };
    fsm.renameSync = function (f, ...a) { if (String(f).startsWith(hm._discFile)) syncWrites++; return r0.call(this, f, ...a); };
    const st0 = globalThis.setTimeout; globalThis.setTimeout = (fn) => { fn(); return { unref() { } }; };   // a timer fires at once: a write it holds is seen here
    try { hm._persistDiscovery('hA', [{ sessionId: 'sA' }]); hm._persistDiscovery('hB', [{ sessionId: 'sB' }]); } finally { fsm.writeFileSync = w0; fsm.renameSync = r0; globalThis.setTimeout = st0; }
    hm._discPersistTimer = null;   // a copy's stand-in timer (no real one was made)
    const last = handed[handed.length - 1];
    let bytes = null; try { bytes = last && JSON.parse(last[1].produce()); } catch { bytes = null; }
    return { handed: handed.length, file: !!last && last[0] === hm._discFile, name: last && last[1].name, both: !!(bytes && bytes.hA && bytes.hB && bytes.hB.sessions[0].sessionId === 'sB'), syncWrites };
  };
  const r = scene(HostManager, 'real');
  ok(r.handed === 2 && gateOf(r.file) && r.name === 'remote-sessions-cache.write' && gateOf(r.both) && r.syncWrites === 0, 'B-574d: the last-known sessions are handed to THE STORE WRITER under their row\'s name at every result (the bytes made at the write: both lists), with no synchronous write of the file on the loop — ' + JSON.stringify(r));
  const dir = scratch('disc-cache-landed'); fsm.mkdirSync(dir, { recursive: true });   // the writer writes into the data folder; the hub's always exists
  const hm1 = new HostManager({ dataDir: dir });
  hm1._persistDiscovery('hC', [{ sessionId: 'sC' }]);
  const landed = await require('../src/store-writer.js').storeWriter().durable(hm1._discFile);
  const hm2 = new HostManager({ dataDir: dir });
  ok(landed === true && !!hm2._persistedDisc.hC && hm2._persistedDisc.hC.sessions[0].sessionId === 'sC', 'B-574d: through the real writer the cache lands (durable answers true) and the next start reads the last-known list back');
  const X = mutantCopies('disc-cache-timer', REPO).load('src/hosts.js', anchored(src, "    const W = this._storeWriter || require('./store-writer.js').storeWriter();\n    W.dirty(this._discFile, { name: 'remote-sessions-cache.write', debounceMs: 2000, produce: () => JSON.stringify(this._persistedDisc) });\n", "    if (this._discPersistTimer) return;\n    this._discPersistTimer = setTimeout(() => { this._discPersistTimer = null; try { const tmp = this._discFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this._persistedDisc)); fs.renameSync(tmp, this._discFile); } catch { } }, 2000);   // MUTANT: the release's timer on the loop\n", 'disc-cache-timer'), 'disc-cache-timer').HostManager;
  const x = scene(X, 'red');
  ok(x.handed === 0 && x.syncWrites > 0, 'CONTROL (the release\'s 2 s timer and its synchronous write, in a copy): nothing is handed to the writer, and its timer writes the file on the loop — red ' + JSON.stringify(x));
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

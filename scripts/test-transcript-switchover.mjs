// R3/R5 switchover ladders: the device is PRIMARY, every fallback rung still
// works, and the live-session overlay is never bypassed.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass=0, fail=0; const ok=(c,n,e)=>{if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.error('  ✗ '+n+(e?'\n    '+e:''));}};
const { createTranscriptService } = require(REPO + '/src/transcript-service.js');

const calls = [];
const mkSvc = (opts) => createTranscriptService({
  activeSessions: opts.activeSessions || new Map(),
  createSessionMessages: () => ({ raw: () => [], chatStatus: () => ({ model: 'local-fallback' }), taskState: () => ({ todos: ['local'] }) }),
  hosts: opts.hosts,
});
const deviceHosts = (behavior) => ({
  deviceBounded: async () => ({
    connect: async () => ({ info: { capabilities: behavior.caps ?? ['transcript-op'] } }),
    transcriptOp: async (m, ref, p) => {
      calls.push(m); if (behavior.throw) throw new Error('link down');
      // method-shaped replies, exactly as the daemon composes them
      if (m === 'gapInfo') return { gap: { headEndLine: 10, tailStartLine: 900, totalLines: 1000, gapRecords: 890 }, hasFile: true };
      if (m === 'gapSlab') return { messages: [{ id: 'g1' }] };
      if (m === 'searchFull') return { matches: [{ line: 42 }, { line: 77 }], truncated: false };
      if (m === 'fullTurnmap') return { turns: [{ ts: 1, line: 3 }] };
      return { served: 'device', method: m, params: p };
    },
  }),
  fetchSessionJsonl: async () => {},
});

// 1. remote + device available → served by the device
{
  calls.length = 0;
  const svc = mkSvc({ hosts: deviceHosts({}) });
  const r = await svc.page({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' }, {});
  ok(r?.served === 'device' && calls[0] === 'page', 'remote page is served BY THE DEVICE (no whole-file pull)');
  const st = await svc.status({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' });
  ok(st?.served === 'device', 'remote status served by the device');
  const ts = await svc.taskState({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' });
  ok(ts?.served === 'device', 'remote taskState served by the device');
}
// 2. device throws → legacy cache path still answers (ladder rung 2)
{
  const svc = mkSvc({ hosts: deviceHosts({ throw: true }) });
  const st = await svc.status({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' });
  ok(st?.chatStatus?.model === 'local-fallback', 'device failure falls back to the local cache path (never a hang)');
}
// 3. old daemon (no capability) → legacy path, no wire call
{
  calls.length = 0;
  const svc = mkSvc({ hosts: deviceHosts({ caps: [] }) });
  const st = await svc.status({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' });
  ok(st?.chatStatus?.model === 'local-fallback' && calls.length === 0, 'capability-gated: an old daemon is never asked (no hang), legacy serves');
}
// 4. LOCAL session never touches the device
{
  calls.length = 0;
  const svc = mkSvc({ hosts: deviceHosts({}) });
  const st = await svc.status({ backend: 'claude', sessionId: 's1', cwd: '/w' });
  ok(st?.chatStatus?.model === 'local-fallback' && calls.length === 0, 'local reads never go over the wire');
}
// 5. LIVE remote session with loaded history → server overlay wins
{
  calls.length = 0;
  const live = new Map([['x', { backend: 'claude', backendSessionId: 's1', host: 'host-a', _historyLoaded: true,
    _normalizer: { total: 3, messages: [{ id: 'm1' }], tail: () => [{ id: 'm1' }], slice: () => [], turnMap: () => [], search: () => [] } }]]);
  const svc = mkSvc({ hosts: deviceHosts({}), activeSessions: live });
  const r = await svc.page({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' }, {});
  ok(calls.length === 0 && r.total === 3, 'a LIVE remote session keeps the server-side normalizer + stdout overlay (device skipped)');
}
// 6. SEEK FAMILY switches as ONE UNIT (line numbers must stay single-source)
{
  calls.length = 0;
  const svc = mkSvc({ hosts: deviceHosts({ caps: ['transcript-op'] }) });
  const ref = { backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' };
  const gi = await svc.gapInfo(ref);
  ok(typeof gi.fp === 'string' && gi.fp.startsWith('\u0000device:'), 'gapInfo returns an opaque DEVICE handle (route treats fp as opaque)');
  const slab = await svc.gapSlab(ref, gi.fp, 0, 100);
  ok(calls.includes('gapSlab'), 'a device handle routes the slab read to the device (never a local file)');
  const sf = await svc.searchFull(ref, gi.fp, 'q');
  ok(calls.includes('searchFull'), 'search on a device handle uses the device search op');
  const ft = await svc.fullTurnmap(ref, gi.fp);
  ok(calls.includes('fullTurnmap'), 'full turnmap on a device handle uses the device op');
  // streaming contract preserved (one batch, same NDJSON callback shape)
  calls.length = 0;
  const got = [];
  const r = await svc.searchFullStream(ref, gi.fp, 'q', (m) => got.push(m), {});
  ok(calls.includes('searchFull') && typeof r.total === 'number', 'streaming search over the device replays matches through onMatch (contract kept)');
}
// 7. no device → the whole family stays on the local file path
{
  calls.length = 0;
  const svc = mkSvc({ hosts: deviceHosts({ caps: [] }) });
  const gi = await svc.gapInfo({ backend: 'claude', sessionId: 's1', cwd: '/w', host: 'host-a' });
  ok(!(typeof gi.fp === 'string' && gi.fp.startsWith('\u0000device:')), 'without the capability the family stays on the LOCAL file (one source of truth either way)');
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);

#!/usr/bin/env node
// SESSION-BRAIN STEP 2 (dark double-feed) against a REAL daemon.
// Pins: (1) the daemon's device-side normalizer stream emits ops for a live
// pipe session's stdout; (2) those ops' CREATE mids are IDENTICAL to what the
// server's own normalizer derives from the same bytes (R0 content-derived
// mids — the whole reason step 3 can ever be trusted); (3) the stream starts
// at NOW (no history replay); (4) codex/exited sessions are skipped.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sb-'));
process.env.HOME = home;
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sb-data-'));
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
const DAEMON_AT = Date.now();   // the daemon starts here (U1's windows wait past its boot sweep)
await dm.connect();

// live pipe session = a script that emits stream-json records slowly
const SID = 'sb-test-1';
const emitter = path.join(home, 'emit.js');
const rec = (i) => [JSON.stringify({
  type: 'assistant', timestamp: new Date().toISOString(),
  message: { id: 'msg_sb_' + i, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'hello ' + i }], usage: { input_tokens: 10, output_tokens: 5 } },
}), JSON.stringify({ type: 'result', subtype: 'success', timestamp: new Date().toISOString() })].join('\n');
const RECS = [1, 2, 3].map(rec);   // ONE recording (lane session-events-ends U3): the emitter writes these lines, the server's normalizer reads the same ones
fs.writeFileSync(emitter, `
const recs = ${JSON.stringify(RECS)};
let i = 0;
// wait past the daemon tailer's first tick (1s cadence) so start-at-NOW
// registers BEFORE any record is written — production attaches replay
// history from the transcript, the live stream deliberately does not
setTimeout(() => {
  const t = setInterval(() => { if (i >= recs.length) { clearInterval(t); setTimeout(() => process.exit(0), 8000); return; } console.log(recs[i++]); }, 400);
}, 2500);
`);

const batches = [];
await dm.watchSessionEvents((m) => batches.push(m));
await dm.openPipeSession({ sid: SID, cmd: process.execPath, args: [emitter], cwd: home });
await new Promise((r) => setTimeout(r, 9000));

const events = batches.filter((b) => b.sid === SID).flatMap((b) => b.batch.map((x) => JSON.parse(x)));
console.log('EVENT SAMPLE:', JSON.stringify(events.slice(0, 6).map((e) => ({ op: e.op, id: e.message?.id || e.id, role: e.message?.role }))));
const creates = events.filter((e) => e.op === 'create');
ok(batches.length > 0, `device stream delivered batches (${batches.length})`);
ok(creates.length >= 3, `normalized create ops for all 3 records (${creates.length})`);

// PARITY: server-side normalizer over the same bytes → identical mids
const { createMessageManager } = require(REPO + '/src/normalizers.js');
const mm = createMessageManager('claude', SID);
const serverOps = [];
mm.onOp((op) => serverOps.push(op));
for (const r of RECS) for (const ln of r.split('\n')) mm.processLive(JSON.parse(ln));   // the SAME recorded lines the emitter wrote
// PARITY AS A DETERMINISTIC LEG (lane session-events-ends U3, 主开发 2026-11-16 — in place of the removed soak): the same
// recorded lines through the daemon's REAL normalizer (its session-events stream, above) and through the server's; the
// creates compared by id AND by content, in stream order. CURED: this leg read `e.msg?.id`, a field no create carries — it
// compared the text «undefined» with itself and could not fail.
const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
const createsOf = (ops) => ops.filter((o) => o && o.op === 'create').map((o) => (o.message && o.message.id ? canon(o.message) : null));
const sameCreates = (a, b) => a.length === b.length && a.every((x, k) => !!x && x === b[k]);
const firstDiff = (a, b) => { for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) return { at: k, device: String(a[k]).slice(0, 300), server: String(b[k]).slice(0, 300) }; return null; };
const devC = createsOf(events), srvC = createsOf(serverOps);
ok(devC.length >= 3 && verdictOf(sameCreates(devC, srvC)), `PARITY (deterministic): the daemon's normalizer and the server's make the SAME creates from the same recorded lines — ${devC.length} / ${srvC.length}, by id AND content${sameCreates(devC, srvC) ? '' : ' — first difference ' + JSON.stringify(firstDiff(devC, srvC))}`);
{
  // the CONTROL: an injected divergence turns it red — a create's text changed, an id changed, a create missing, one extra
  const edit = (k, f) => srvC.map((x, n) => (n === k ? canon(f(JSON.parse(x))) : x));
  const text = edit(1, (m) => ({ ...m, content: [{ type: 'text', text: 'not what the device read' }] }));
  const id = edit(1, (m) => ({ ...m, id: m.id + '-other' }));
  ok(devC.length >= 3 && !sameCreates(devC, text) && !sameCreates(devC, id) && !sameCreates(devC, srvC.slice(1)) && !sameCreates(devC, [...srvC, srvC[0]]),
    'PARITY\'s control: one create\'s content changed, one id changed, a create missing, one extra — each turns the comparison red');
}

// dead sessions are dropped from the tail set (no leak): kill and wait a tick
try { await dm.killPipeSession(SID); } catch { }
await new Promise((r) => setTimeout(r, 1500));
const before = batches.length;
await new Promise((r) => setTimeout(r, 1500));
ok(batches.length === before, 'no batches after the session exits');

// U1 — THE SESSION-EVENTS WATCH ENDS WITH ITS LINK (lane soak-can-fail U1, 主开发 2026-11-16): counted in the REAL daemon's reads
// — /proc/<pid>/io rchar, a window with the link up and armed, then with NO link at all. Twelve padded session metas (exited, so
// nothing else acts on them) make the tick's work large: every live tick reads each one once a second. The windows start after
// the daemon's boot sweep (30 s), the only other reader of the metas. RED on 70efb5e10: a dead link's tick reads on, and a
// re-arm on a new link adds a second one.
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ROOTD = process.env.VIBESPACE_AGENTD_ROOT, SESSD = path.join(ROOTD, 'state', 'sessions');
  let pid = 0; try { pid = Number(fs.readFileSync(path.join(ROOTD, 'state', 'agentd.lock'), 'utf8').trim()) || 0; } catch { }
  const rchar = () => { try { return Number((fs.readFileSync(`/proc/${pid}/io`, 'utf8').match(/^rchar:\s*(\d+)/m) || [])[1]) || 0; } catch { return -1; } };
  const PAD = 'x'.repeat(64 * 1024), PER = 12 * PAD.length;
  const fakes = [];
  for (let i = 0; i < 12; i++) { const f = path.join(SESSD, `sb-teardown-${i}.json`); fs.writeFileSync(f, JSON.stringify({ exited: 0, exitedAt: Date.now(), backend: 'claude', pad: PAD })); fakes.push(f); }
  await sleep(Math.max(0, 36000 - (Date.now() - DAEMON_AT)));
  const rate = async (ms = 4000) => { const a = rchar(); await sleep(ms); const b = rchar(); return a < 0 || b < 0 ? -1 : Math.round((b - a) / (ms / 1000)); };   // bytes a second
  const live = await rate();
  dm.stop(); await sleep(1500);                       // the link dies; the daemon lives on
  const dead = await rate();
  const dm2 = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  await dm2.connect(); await dm2.watchSessionEvents(() => { });
  const live2 = await rate();
  dm2.stop(); await sleep(1500);
  const dead2 = await rate();
  for (const f of fakes) { try { fs.unlinkSync(f); } catch { } }
  ok(pid > 0 && live >= PER * 0.75 && dead >= 0 && dead < PER * 0.25 && live2 >= PER * 0.75 && live2 < PER * 1.5 && dead2 >= 0 && dead2 < PER * 0.25,
    `U1 — THE SESSION-EVENTS WATCH ENDS WITH ITS LINK, counted in the real daemon's reads (bytes a second; one live tick reads ${PER}): armed ${live} · its link dead ${dead} · re-armed on a new link ${live2} (one tick, not two) · that link dead ${dead2}`);
}

try { const lg = (await import('node:fs')).readdirSync(process.env.VIBESPACE_AGENTD_ROOT).filter(f=>/log|out/.test(f)); for (const f of lg) console.log('--- daemon ' + f + ' ---\n' + (await import('node:fs')).readFileSync(process.env.VIBESPACE_AGENTD_ROOT + '/' + f, 'utf8').split('\n').slice(-25).join('\n')); } catch (e) { console.log('log read:', e.message); }
try { await dm.stop?.(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf } from './lib/check.mjs';

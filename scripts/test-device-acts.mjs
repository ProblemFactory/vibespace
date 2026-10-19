#!/usr/bin/env node
// A HUB ACT ON A DEVICE IS NEVER ANONYMOUS (lane device-act-audit, design q-042 §3 D4 + D10, 2026-10-19) — FAST.
//   ① the layer table: every op the client sends and the daemon answers (every action of the action ops) is in exactly
//      one layer; an op without a row is `act` (fail closed) and RED here; CLIENT_ACT_METHODS = the client's act methods
//   ② the summary redaction: a planted token in argv / output / a placed secret / typed keys / a posted text never
//      reaches a line (sizes only)
//   ③ THE ONE SEND POINT through a fake daemon link: one audit line per act op (a write-stream ONE, a stream at its end),
//      none for a read; an act without `by` is refused `act_without_by` and NOTHING is sent; the upgrade = a `code` line
//   ④ the device's own state/acts.log through a REAL local daemon (one line per act, `by` as the hub said it)
//   ⑤ the hub's store: the ring, the filters, a hand-planted secret judged on the way out
//   ⑥ the routes + `vibespace-remote audit`: the owner reads every line; an agent its own only (`human_only` for others')
//   ⑦ the three URGENT For-you items: filed once per event (dedup across a restart), the hub's own daemon never; a new
//      dial address once (IPv4 / IPv6 /64, loopback never, the pre-lane address seeded)
//   ⑧ the census: every act call in the hub passes `by`; MUTANT hosts.js run-cmd without it ⇒ RED
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { endDaemonsAndWait } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-device-acts-'));
const DA = require('../src/device-acts.js');
const DAU = require('../src/device-audit.js');
const ALERTS = require('../src/server/device-alerts.js');
const { DeviceManager } = require('../src/agentd/client.js');
const { censusActCalls } = await import('./device-acts-census.mjs');

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// planted secrets are BUILT at run time (split inside the vendor prefix) — a literal token shape in the tree reds the secret scan
const GH = ['gh', 'p_'].join('') + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';

console.log('— ① the layer table');
{
  const client = read('src/agentd/client.js'), daemon = read('src/agentd/agentd.js');
  const sentOps = [...new Set([...client.matchAll(/\bop: '([a-z][a-z-]*)'/g)].map((m) => m[1]))];
  const handled = [...new Set([...daemon.matchAll(/msg\.op === '([a-z][a-z-]*)'/g)].map((m) => m[1]))];
  const plain = [...new Set([...sentOps, ...handled])].filter((op) => !DA.ACTION_OPS.includes(op));
  const unlayered = (ops) => ops.filter((op) => !Object.prototype.hasOwnProperty.call(DA.TABLE, op === 'tcp-connect' ? 'tcp-connect' : op));
  ok(sentOps.length >= 40 && handled.length >= 45 && unlayered(plain).length === 0, `${plain.length} ops (client sends ${sentOps.length}, the daemon answers ${handled.length}), each a row`, unlayered(plain));
  ok(DA.TABLE['tcp-connect'] === 'act' && DA.TABLE['tcp-connect:loopback'] === 'read' && DA.layerOf({ op: 'tcp-connect', port: 5900 }) === 'read' && DA.layerOf({ op: 'tcp-connect', port: 22, host: '10.0.0.2' }) === 'act' && DA.layerOf({ op: 'tcp-connect', port: 1, host: '127.0.0.1' }) === 'read', 'tcp-connect: the loopback is a read, another host an act');
  // every action of the action ops
  const fsActs = [...new Set([...daemon.matchAll(/msg\.action === '([a-z-]+)'/g), ...client.matchAll(/action: '([a-z-]+)'/g)].map((m) => m[1]))];
  const dfs = [...(read('src/design-fs.js').split('const ACTIONS = Object.freeze({')[1] || '').split('});')[0].matchAll(/(?:^|[{,])\s*'?([a-z][a-z-]*)'?:/g)].map((m) => m[1]);
  const dsv = require('../src/desktop-serve.js').DESKTOP_SERVE_OPS, bsv = require('../src/browser-serve.js').BROWSER_SERVE_OPS;
  const miss = [...fsActs.map((a) => 'fs-op:' + a), ...dfs.map((a) => 'design-fs:' + a), ...dsv.map((a) => 'desktop-serve:' + a), ...bsv.map((a) => 'browser-serve:' + a)].filter((k) => !Object.prototype.hasOwnProperty.call(DA.TABLE, k));
  ok(fsActs.length >= 12 && dfs.length >= 4 && dsv.length >= 15 && bsv.length >= 6 && miss.length === 0, `every action of fs-op (${fsActs.length}), design-fs (${dfs.length}), desktop-serve (${dsv.length}), browser-serve (${bsv.length}) is a row`, miss);
  ok(Object.values(DA.TABLE).every((l) => DA.LAYERS.includes(l)), `every row's layer is one of ${DA.LAYERS.join(' / ')}`);
  const tableSrc = read('src/device-acts.js').split('const TABLE = Object.freeze({')[1].split('\n});')[0];
  const keys = [...tableSrc.matchAll(/'([a-z][a-z:-]*)': '(read|session|act|code)'/g)].map((m) => m[1]);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  ok(keys.length === Object.keys(DA.TABLE).length && dup.length === 0, `${keys.length} rows, each key once (a duplicate key would silently re-layer an op)`, dup);
  ok(DA.layerOf({ op: 'brand-new-op' }) === 'act' && DA.needsBy({ op: 'brand-new-op' }) && DA.layerOf({ op: 'fs-op', action: 'shred' }) === 'act', 'an op (or an action) without a row is an act — fail closed: it needs a by and is audited');
  const mutant = client.replace("op: 'serve-socks', by", "op: 'serve-socks-again', by");
  const mOps = [...new Set([...mutant.matchAll(/\bop: '([a-z][a-z-]*)'/g)].map((m) => m[1]))];
  ok(mutant !== client && unlayered(mOps.filter((o) => !DA.ACTION_OPS.includes(o))).join() === 'serve-socks-again', 'MUTANT: a client op with no row ⇒ RED (named)');
  // CLIENT_ACT_METHODS = the methods whose body can send an act / code op
  const methods = {};
  const re = /^ {2}(?:async )?([a-zA-Z_]\w*)\(([^)]*)\) \{/gm;
  const heads = [...client.matchAll(re)];
  heads.forEach((h, i) => { methods[h[1]] = client.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : client.length); });
  const canAct = (body) => {
    // an act send that names its OWN subject (`by: <x> || 'system:…'` — a re-arm re-pinning in the name of who pinned) is
    // not the caller's to name: only a send whose `by` is the caller's makes the method a census method
    for (const m of body.matchAll(/\{\s*op: '([a-z-]+)'(?:[^}]*?\baction(?:: (?:'([a-z-]+)'|(\w+))|(?=([,\s}]))))?[^}]*\}/g)) {
      const op = m[1];
      if (/\bby: [^,}]*\|\| '(?:system|agent|human|job):/.test(m[0])) continue;
      if (op === 'tcp-connect') return true;
      if (DA.ACTION_OPS.includes(op)) { if (m[2] ? DA.needsBy({ op, action: m[2] }) : (m[3] || m[4]) ? Object.keys(DA.TABLE).some((k) => k.startsWith(op + ':') && ['act', 'code'].includes(DA.TABLE[k])) : false) return true; }
      else if (DA.needsBy({ op })) return true;
    }
    for (const m of body.matchAll(/_fsPortable\(\{ action: '([a-z-]+)'/g)) if (DA.needsBy({ op: 'fs-op', action: m[1] })) return true;
    return false;
  };
  const derived = Object.keys(methods).filter((n) => !n.startsWith('_') && canAct(methods[n])).sort();
  ok(derived.join(' ') === [...DA.CLIENT_ACT_METHODS].sort().join(' '), `CLIENT_ACT_METHODS (${DA.CLIENT_ACT_METHODS.length}) = the client's methods that can send an act / code op`, { derived, listed: [...DA.CLIENT_ACT_METHODS].sort() });
}

console.log('— ② the summary redaction (sizes, never bytes)');
{
  const TOK = GH;
  const SK = 'sk-ant-api03-' + 'x'.repeat(40);
  const lines = [
    DA.lineOf({ at: 1, payload: { op: 'run-cmd', cmd: 'sh', args: ['-c', `curl -H "Authorization: Bearer ${TOK}" https://api.github.com`], env: { GITHUB_TOKEN: TOK } }, by: 'agent:claude:c1', ok: true, outHead: DA.outHeadOf({ stdout: `GITHUB_TOKEN=${TOK}\nANTHROPIC_API_KEY=${SK}\n` }) }),
    DA.lineOf({ at: 1, payload: { op: 'run-cmd', shell: `export TOKEN=${TOK}; echo ${SK}` }, by: 'system:x' }),
    DA.lineOf({ at: 1, payload: { op: 'place-secret', path: '/home/u/.vibespace/bin/.tok-1', data: Buffer.from('vsst_' + TOK).toString('base64') }, by: 'system:spawn' }),
    DA.lineOf({ at: 1, payload: { op: 'fs-op', action: 'write', path: '/home/u/state/dial.json', data64: Buffer.from(JSON.stringify({ token: TOK })).toString('base64') }, by: 'human:abc' }),
    DA.lineOf({ at: 1, payload: { op: 'input-events', events: [{ t: 'text', text: 'hunter2-password' }, { t: 'key', code: 'KeyA' }, { t: 'move', x: 1, y: 2 }] }, by: 'agent:claude:c1' }),
    DA.lineOf({ at: 1, payload: { op: 'peer-post', cid: 'c2', text: `here is the key ${SK}` }, by: 'agent:claude:c1' }),
    DA.lineOf({ at: 1, payload: { op: 'desktop-serve', action: 'app-fetch', params: { url: `https://x.example/a.AppImage?token=${TOK}` } }, by: 'agent:claude:c1' }),
  ];
  const all = JSON.stringify(lines);
  ok(!all.includes(TOK) && !all.includes(SK) && !all.includes('hunter2') && !all.includes(Buffer.from('vsst_' + TOK).toString('base64')), 'a planted token in argv / a shell line / output / a placed secret / a written file / typed keys / a posted text / a URL never reaches a line', all.slice(0, 600));
  ok(lines[2].summary.includes('B') && /\d+ B/.test(lines[3].summary) && /3 input event/.test(lines[4].summary) && /\d+ chars/.test(lines[5].summary), 'their SIZES are said (bytes, events, characters)', lines.map((l) => l.summary));
  ok(lines[0].summary.length <= DA.SUMMARY_MAX && Buffer.byteLength(lines[0].outHead) <= DA.OUT_HEAD_BYTES + 3 && lines[0].outHead.includes('«redacted»'), `bounded: summary ≤ ${DA.SUMMARY_MAX} chars, output head ≤ ${DA.OUT_HEAD_BYTES} B, redacted`, lines[0]);
  const big = DA.lineOf({ at: 1, payload: { op: 'run-cmd', cmd: 'sh', args: ['-c', 'x'.repeat(10000) + '\u202e\u0000'] }, by: 'system:x', outHead: DA.outHeadOf({ stdout: 'é'.repeat(500) }) });
  ok(big.summary.length <= DA.SUMMARY_MAX && !/[\u202e\u0000]/.test(big.summary) && Buffer.byteLength(big.outHead) <= DA.OUT_HEAD_BYTES + 3 && !big.outHead.includes('�'), 'a huge argv is cut, hidden characters folded, a multi-byte head never cut mid-character');
  ok(DA.validBy('human:abc123def456') && DA.validBy('agent:claude:6f1e-22') && DA.validBy('system:usage-harvest') && !DA.validBy('root') && !DA.validBy('agent:') && !DA.validBy('human:x y') && !DA.validBy(null), 'by: human / agent / job / system + an id (nothing else)');
}

console.log('— ③ THE ONE SEND POINT (a fake daemon link)');
const CAPS = ['run-shell', 'fs-portable', 'fs-write-stream', 'place-secret', 'input-events', 'desktop-serve', 'app-install', 'browser-serve', 'design-fs', 'peer-post', 'pool-orders', 'settings-open', 'window-pin', 'proc-list', 'sysinfo', 'display-facts', 'desktop-grab', 'desktop-input']; // int315: + lane desktop-handover's two
function fakeDm() {
  const lines = [], sent = [], logs = [];
  const dm = new DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'no-bundle.js'), version: '0', log: (...a) => logs.push(a.join(' ')), onAct: (l) => lines.push(l) });
  const conn = { nextId: 1, nextChan: 1, pending: new Map(), sessions: new Map(), info: { capabilities: CAPS, platform: 'linux', posixShells: ['sh'], daemonVersion: '0' } };
  const answer = (m, extra) => { const r = conn.pending.get(m.id); if (r) { conn.pending.delete(m.id); r({ id: m.id, ...extra }); } };
  conn.mux = {
    control: (m) => {
      sent.push(m);
      setImmediate(() => {
        if (m.op === 'run-stream') { answer(m, {}); const h = conn.sessions.get(m.chan); const b = Buffer.from(`streamed GITHUB_${'TOK' + 'EN'}=${GH}\n`); h.onData(b); h.onExitMsg({ code: 3, sent: b.length }); return; }
        if (m.op === 'run-cmd') return answer(m, { code: 0, stdout: 'hi\n', stderr: '' });
        if (m.op === 'serve-socks' || m.op === 'serve-folder') return answer(m, { port: 4242 });
        if (m.op === 'fs-op' && m.action === 'write-stream') return answer(m, m.step === 'end' ? { size: 5, sha256: 'x' } : { ok: true });
        if (m.op === 'fs-op' && m.action === 'stat') return answer(m, { stat: { size: 1 } });
        if (m.op === 'place-secret') return answer(m, { path: m.path });
        return answer(m, { ok: true, result: { ok: true } });
      });
    },
    data: () => true, closeChan: () => { },
  };
  dm.connect = async () => conn; dm._conn = conn;
  return { dm, lines, sent, logs, conn };
}
{
  const BY = 'system:test-device-acts';
  const acts = [
    ['runCmd', (dm) => dm.runCmd('sh', ['-c', 'echo hi'], { by: BY }), 'run-cmd'],
    ['runShell', (dm) => dm.runShell('echo hi', { by: BY }), 'run-cmd'],
    ['runStream', (dm) => dm.runStream('sh', ['-c', 'x'], { by: BY }), 'run-stream'],
    ['fsWrite', (dm) => dm.fsWrite('/t/a', Buffer.from('xyz'), { by: BY }), 'fs-op:write'],
    ['fsRename', (dm) => dm.fsRename('/t/a', '/t/b', { by: BY }), 'fs-op:rename'],
    ['fsMkdir', (dm) => dm.fsMkdir('/t/d', { by: BY }), 'fs-op:mkdir'],
    ['fsRm', (dm) => dm.fsRm('/t/d', true, { by: BY }), 'fs-op:rm'],
    ['fsCopy', (dm) => dm.fsCopy('/t/a', '/t/c', { by: BY }), 'fs-op:copy'],
    ['fsMove', (dm) => dm.fsMove('/t/a', '/t/m', { by: BY }), 'fs-op:move'],
    ['fsWriteStream', (dm) => dm.fsWriteStream('/t/s', { source: Readable.from([Buffer.from('hello')]), size: 5, by: BY }), 'fs-op:write-stream'],
    ['placeSecret', (dm) => dm.placeSecret('/t/.tok', Buffer.from('vsst_x'), { by: BY }), 'place-secret'],
    ['inputEvents', (dm) => dm.inputEvents([{ t: 'key', code: 'KeyA' }], { by: BY }), 'input-events'],
    ['tcpForward (a LAN host)', (dm) => dm.tcpForward(22, '10.0.0.2', { by: BY }), 'tcp-connect'],
    ['serveSocks', (dm) => dm.serveSocks({ by: BY }), 'serve-socks'],
    ['serveFolder', (dm) => dm.serveFolder('/t', { by: BY }), 'serve-folder'],
    ['desktopServe app-install', (dm) => dm.desktopServe('app-install', { kind: 'registered', name: 'x' }, { by: BY }), 'desktop-serve:app-install'],
    ['browserServe start', (dm) => dm.browserServe('start', { profileId: 'p1' }, { by: BY }), 'browser-serve:start'],
    ['designFs write-user', (dm) => dm.designFs('write-user', { dir: '/d', text: '{}' }, { by: BY }), 'design-fs:write-user'],
    ['peerPost', (dm) => dm.peerPost({ cid: 'c2', text: 'hello', by: BY }), 'peer-post'],
    ['poolOrders', (dm) => dm.poolOrders({ clearPool: 'p' }, null, { by: BY }), 'pool-orders'],
    ['settingsOpen', (dm) => dm.settingsOpen('accessibility', { by: BY }), 'settings-open'],
    ['windowPin', (dm) => dm.windowPin('w1', true, { by: BY }), 'window-pin'],
    ['desktopGrab', (dm) => dm.desktopGrab('s1', { by: BY }), 'desktop-grab'], // int315: lane desktop-handover's two acts (.313)
    ['desktopInput', (dm) => dm.desktopInput('s1', [{ t: 'kd', c: 'KeyA' }], { by: BY }), 'desktop-input'],
  ];
  const bad = [];
  for (const [name, fn, op] of acts) {
    const { dm, lines } = fakeDm();
    try { await fn(dm); } catch (e) { bad.push(`${name}: threw ${e.message}`); continue; }
    await sleep(5);
    if (lines.length !== 1 || lines[0].op !== op || lines[0].by !== BY || lines[0].ok !== (op === 'run-stream' ? false : true)) bad.push(`${name}: ${JSON.stringify(lines)}`);
  }
  ok(bad.length === 0 && acts.length === DA.CLIENT_ACT_METHODS.length, `${acts.length} act methods (= CLIENT_ACT_METHODS): each call = ONE audit line with its op, its by and the verdict (a write-stream's three requests = one line)`, bad);
  {
    const { dm, lines } = fakeDm();
    await dm.runStream('sh', ['-c', 'x'], { by: BY });
    ok(lines.length === 1 && lines[0].code === 3 && lines[0].ok === false && /streamed GITHUB_TOKEN=«redacted»/.test(lines[0].outHead), 'a stream is ONE line at its END: the exit code, the first bytes (redacted)', lines);
  }
  const reads = [
    ['fsStat', (dm) => dm.fsStat('/')], ['sysinfo', (dm) => dm.sysinfo()], ['tcpForward (its loopback)', (dm) => dm.tcpForward(5900)],
    ['desktopServe status', (dm) => dm.desktopServe('status', {})], ['browserServe status', (dm) => dm.browserServe('status', {})], ['designFs read', (dm) => dm.designFs('read', { dir: '/d' })],
  ];
  const rbad = [];
  for (const [name, fn] of reads) { const { dm, lines } = fakeDm(); try { await fn(dm); } catch (e) { rbad.push(`${name}: ${e.message}`); } await sleep(2); if (lines.length) rbad.push(`${name}: ${JSON.stringify(lines)}`); }
  ok(rbad.length === 0, `${reads.length} reads: no by needed, no line`, rbad);
  // an act WITHOUT a by: refused in-process, said, NEVER sent
  const nb = [];
  for (const [name, fn] of [['runCmd', (dm) => dm.runCmd('sh', ['-c', 'rm -rf ~'])], ['fsWrite', (dm) => dm.fsWrite('/t/x', 'y')], ['placeSecret', (dm) => dm.placeSecret('/t/k', 'v')], ['tcpForward', (dm) => dm.tcpForward(22, '10.0.0.9')], ['fsWriteStream', (dm) => dm.fsWriteStream('/t/s', { source: Readable.from([Buffer.from('a')]), size: 1 })], ['runStream', (dm) => dm.runStream('sh', ['-c', 'x'])], ['by: "root"', (dm) => dm.runCmd('sh', [], { by: 'root' })]]) {
    const { dm, lines, sent, logs } = fakeDm();
    let code = null; try { await fn(dm); } catch (e) { code = e.code; }
    const sentActs = sent.filter((m) => DA.needsBy(m));
    if (code !== 'act_without_by' || sentActs.length || lines.length !== 1 || lines[0].code !== 'act_without_by' || lines[0].by !== null || !logs.some((l) => /REFUSED/.test(l))) nb.push(`${name}: code ${code} sent ${JSON.stringify(sentActs)} lines ${JSON.stringify(lines)}`);
  }
  ok(nb.length === 0, 'an act without a (valid) by: refused act_without_by in-process, one line + a journal line, NOTHING sent to the device', nb);
  // the upgrade = the code layer's one send
  {
    const { dm, lines, sent } = fakeDm();
    const bundle = path.join(tmp, 'bundle.js'); fs.writeFileSync(bundle, '// a bundle\n');
    dm._bundlePath = bundle;
    const mux = { onControl: () => { }, control: (m) => { sent.push(m); if (m.op === 'upgrade') setImmediate(() => mux.onControl({ op: 'upgrade-done' })); }, data: () => true };
    await dm._upgrade(mux, { from: '2.369.311' });
    ok(sent.length === 1 && sent[0].by === 'system:device-upgrade' && lines.length === 1 && lines[0].layer === 'code' && lines[0].op === 'upgrade' && /2\.369\.311 →/.test(lines[0].summary) && lines[0].ok === true, 'an agent upgrade carries its by (the version-drift rule) and is ONE code line (from → to, the size)', { sent, lines });
  }
}

console.log('— ④ the device\'s own state/acts.log (a REAL local daemon)');
{
  const root = path.join(tmp, 'agentd');
  process.env.VIBESPACE_AGENTD_ROOT = root;
  process.env.VIBESPACE_NODE_MODULES = path.join(REPO, 'node_modules');
  const bundle = path.join(tmp, 'agentd.js');
  require('esbuild').buildSync({ entryPoints: [path.join(REPO, 'src/agentd/agentd.js')], bundle: true, platform: 'node', outfile: bundle, logLevel: 'silent', external: ['node-pty'] });
  const lines = [];
  const dm = new DeviceManager({ dataDir: path.join(tmp, 'data'), bundlePath: bundle, version: require('../package.json').version, log: () => { }, onAct: (l) => lines.push(l) });
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  try {
    dm.installLocal();
    await dm.connect();
    const r = await dm.runCmd('sh', ['-c', 'echo device-acts-ok'], { by: 'system:test-device-acts' });
    await dm.fsStat('/');
    let refused = null; try { await dm.runCmd('sh', ['-c', 'echo never']); } catch (e) { refused = e.code; }
    const log = path.join(root, 'state', 'acts.log');
    let text = '';
    for (let i = 0; i < 100 && !text.includes('run-cmd'); i++) { await sleep(20); try { text = fs.readFileSync(log, 'utf8'); } catch { } }
    const got = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    ok(String(r.stdout).includes('device-acts-ok') && refused === 'act_without_by', 'the act ran on the daemon; the one without a by never left the hub');
    ok(got.length === 1 && got[0].op === 'run-cmd' && got[0].by === 'system:test-device-acts' && got[0].layer === 'act' && /echo device-acts-ok/.test(got[0].summary) && !('outHead' in got[0]), 'the DEVICE wrote ONE line in its own state/acts.log: op, layer, by as the hub said it, the summary (the read wrote none)', text);
    ok((fs.statSync(log).mode & 0o777) === 0o600, 'acts.log is 0600');
    ok(lines.length === 2 && lines[0].ok === true && lines[0].code === 0 && lines[1].code === 'act_without_by' && lines[1].by === null, 'and the hub\'s lines: the act (exit 0) + the refusal (named, by nobody)', lines);
    ok(/ACTS_LOG_MAX = 2 \* 1024 \* 1024/.test(read('src/agentd/agentd.js')) && /rename\(ACTS_LOG, ACTS_LOG \+ '\.1'\)/.test(read('src/agentd/agentd.js')), 'the device\'s log is a ring of two files at 2 MiB (acts.log → acts.log.1)');
  } catch (e) { ok(false, 'the local daemon leg ran', e && e.stack); }
  finally { try { dm.stop(); } catch { } endDaemonsAndWait(root); }
}

console.log('— ⑤ the hub\'s store (data/device-audit.jsonl)');
{
  const dir = path.join(tmp, 'store');
  let bc = [];
  const st = DAU.create({ dataDir: dir, maxBytes: 64 * 1024, onLine: (r) => bc.push(r) });
  for (let i = 0; i < 400; i++) st.append(DA.lineOf({ at: 1000 + i, hostId: i % 2 ? 'h1' : 'h2', payload: { op: 'run-cmd', cmd: 'echo', args: ['x'.repeat(200), String(i)] }, by: i % 3 ? 'system:x' : 'agent:claude:c1', ok: true, ms: 1 }));
  const size = fs.statSync(path.join(dir, DAU.AUDIT_FILE)).size, size1 = fs.statSync(path.join(dir, DAU.AUDIT_FILE + '.1')).size;
  ok(size <= 64 * 1024 && size1 <= 64 * 1024 && bc.length === 400 && bc.every((r) => /^[0-9a-f]{12}$/.test(r.id)), `a ring of two files at the bound (${size} + ${size1} B), every line broadcast with its own id`);
  const t1 = st.tail({ hostId: 'h1', limit: 10 });
  ok(t1.length === 10 && t1.every((r) => r.hostId === 'h1') && t1[0].at > t1[9].at, 'tail: one machine, newest first');
  const t2 = st.tail({ bys: ['agent:claude:c1'], limit: 500 });
  ok(t2.length > 0 && t2.every((r) => r.by === 'agent:claude:c1'), 'tail: by a list of subjects (an agent\'s own)');
  ok(st.tail({ kind: 'system', limit: 5 }).every((r) => r.by.startsWith('system:')) && st.tail({ since: 1395, limit: 50 }).length === 5, 'tail: by kind, since');
  ok(st.tail({ bys: [] }).length === 0 && st.tail({ bys: ['root'] }).length === 0, 'an empty / invalid subject list reads nothing (never everything)');
  fs.appendFileSync(path.join(dir, DAU.AUDIT_FILE), JSON.stringify({ at: 99999, hostId: 'h9', op: 'run-cmd', layer: 'act', by: 'system:x', summary: `cat ${'TOK' + 'EN'}=${GH}`, outHead: `${'PASS' + 'WORD'}=hunter2\u202e` }) + '\n');
  const h9 = st.tail({ hostId: 'h9' });
  ok(h9.length === 1 && !JSON.stringify(h9).includes('ghp_A1b2') && !JSON.stringify(h9).includes('hunter2') && !h9[0].outHead.includes('\u202e'), 'a hand-planted line on disk is judged on the way out (re-redacted, folded)', h9);
  ok(DAU.durationMs('15m') === 900000 && DAU.durationMs('2h') === 7200000 && DAU.durationMs('3d') === 259200000 && DAU.durationMs('90s') === 90000 && DAU.durationMs('soon') === null, 'durations: 90s / 15m / 2h / 3d');
  const a = DAU.byOfReq({ headers: { cookie: ['vs_', 'tok', 'en='].join('') + 'abcdef0123456789' } }), b = DAU.byOfReq({ headers: {} });
  ok(/^human:[0-9a-f]{12}$/.test(a) && !a.includes('abcdef0123') && b === 'human:local' && DA.validBy(a), 'a cookie request\'s subject = a 12-hex handle of its sign-in (never the cookie); no cookie = human:local');
}

console.log('— ⑥ the routes + vibespace-remote audit');
{
  const express = require('express');
  const { HostManager } = require('../src/hosts.js');
  const dataDir = path.join(tmp, 'rdata'); fs.mkdirSync(dataDir, { recursive: true });
  const hosts = new HostManager({ dataDir });
  hosts.setDialToken('mac1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('mac1').id;
  const app = express();
  const activeSessions = new Map([['w1', { agentToken: 'vsst_testtoken1', backend: 'claude', claudeSessionId: 'c1', name: 's1' }], ['w2', { agentToken: 'vsst_testtoken2', backend: 'claude', claudeSessionId: 'c2', name: 's2' }]]);
  const bc = [];
  require('../src/server/exit-routes.js').create({ app, rootDir: REPO, AGENT_BIN_DIR: path.join(REPO, 'data/bin'), activeSessions, auth: null, wss: { clients: new Set() }, WS_OPEN: 1, bcastAll: (m) => bc.push(m), integrationEnabled: () => true, unpairDialDevice: () => { }, hosts, getExitProxy: () => null, getMounts: () => null, getPortForwards: () => null });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const now = Date.now();
  hosts.noteAct(hid, DA.lineOf({ at: now - 5000, payload: { op: 'run-cmd', cmd: 'uname' }, by: 'agent:claude:c1', ok: true, ms: 3 }));
  hosts.noteAct(hid, DA.lineOf({ at: now - 4000, payload: { op: 'place-secret', path: '/x/.tok', data: 'eHh4' }, by: 'agent:claude:c2', ok: true }));
  hosts.noteAct(hid, DA.lineOf({ at: now - 3000, payload: { op: 'fs-op', action: 'write', path: '/x/f', data64: 'eA==' }, by: 'human:abcabcabcabc', ok: true }));
  hosts.noteAct(hid, DA.lineOf({ at: now - 7 * 86400000, payload: { op: 'run-cmd', cmd: 'old' }, by: 'agent:claude:c1', ok: true }));
  ok(bc.filter((m) => m.type === 'device-audit').length === 4 && bc[0].line.machine === 'mac1', 'every stored line is broadcast (the card patches in place), named by the machine');
  const own = await (await fetch(`${base}/api/hosts/${hid}/device-acts`)).json();
  ok(Array.isArray(own.acts) && own.acts.length === 4 && own.machine.id === hid, 'the owner (cookie) reads every line of the machine', own);
  const kindH = await (await fetch(`${base}/api/hosts/${hid}/device-acts?kind=human`)).json();
  ok(kindH.acts.length === 1 && kindH.acts[0].by === 'human:abcabcabcabc', 'filtered by who asked (people)');
  const agentHit = await fetch(`${base}/api/hosts/${hid}/device-acts`, { headers: { Authorization: 'Bearer vsst_testtoken1' } });
  ok(agentHit.status === 403 && (await agentHit.json()).code === 'human_only', 'an agent token on the owner\'s list ⇒ 403 human_only');
  const cli = (args, token = 'vsst_testtoken1') => new Promise((r) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-remote'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: base, VIBESPACE_SESSION_TOKEN: token } }, (e, so, se) => r({ code: e ? e.code : 0, out: String(so), err: String(se) })));
  const c1 = await cli(['audit']);
  ok(c1.code === 0 && /uname/.test(c1.out) && /old/.test(c1.out) && !/\.tok/.test(c1.out) && !/\/x\/f/.test(c1.out) && /by agent:claude:c1/.test(c1.out), 'vibespace-remote audit: THIS conversation\'s own acts only', c1);
  const c2 = await cli(['audit', '--since', '1h', '--machine', 'mac1']);
  ok(c2.code === 0 && /uname/.test(c2.out) && !/old/.test(c2.out), '--since 1h --machine mac1', c2);
  const c3 = await cli(['audit', '--by', 'agent:claude:c2']);
  ok(c3.code === 3 && /only the user reads/.test(c3.err), 'another conversation\'s acts ⇒ human_only (exit 3), nothing listed', c3);
  const c4 = await cli(['audit', '--by', 'human:abcabcabcabc']);
  ok(c4.code === 3, 'a person\'s acts ⇒ human_only (exit 3)', c4);
  const c5 = await cli(['audit'], 'vsst_testtoken2');
  ok(c5.code === 0 && /\.tok/.test(c5.out) && !/uname/.test(c5.out), 'the other conversation reads ITS own (the placed secret: path + size, never the bytes)', c5);
  const c6 = await cli(['audit', '--machine', 'nope']);
  ok(c6.code === 1 && /no machine/.test(c6.err), 'an unknown machine is said', c6);
  const c7 = await cli(['audit', '--since', 'soon']);
  ok(c7.code === 1 && /duration/.test(c7.err), 'a bad --since is said', c7);
  const c8 = await cli([]);
  ok(c8.code === 2 && /vibespace-remote audit/.test(c8.out), 'no verb ⇒ the usage (exit 2)', c8);
  server.close();
}

console.log('— ⑦ the three URGENT For-you items');
{
  const dir = path.join(tmp, 'alerts'); fs.mkdirSync(dir, { recursive: true });
  const filed = [];
  const userTodos = { add: (k, o) => { filed.push({ k, ...o }); return { id: 'i' + filed.length, text: o.text }; } };
  const al = ALERTS.create({ userTodos, dataDir: dir });
  const p1 = al.file('pairing-minted', { hostKey: 'host-dial-mac', machine: 'Mac', deviceId: 'mac', by: 'human:abcabcabcabc', from: '192.168.1.5', generation: 4 });
  const p2 = al.file('pairing-minted', { hostKey: 'host-dial-mac', machine: 'Mac', deviceId: 'mac', by: 'human:abcabcabcabc', from: '192.168.1.5', generation: 4 });
  const p3 = al.file('pairing-minted', { hostKey: 'host-dial-mac', machine: 'Mac', deviceId: 'mac', by: 'system:graduate', generation: 5 });
  ok(p1.filed && !p2.filed && p3.filed && filed.length === 2 && filed.every((f) => f.urgency === 'urgent' && f.origin === 'machines' && f.k === 'machines') && /made by human:abcabcabcabc from 192\.168\.1\.5/.test(filed[0].text), 'a pairing minted: ONE urgent item per mint (who, from which address); the same mint again files nothing', filed.map((f) => f.text));
  const al2 = ALERTS.create({ userTodos, dataDir: dir });
  ok(!al2.file('pairing-minted', { hostKey: 'host-dial-mac', machine: 'Mac', deviceId: 'mac', generation: 4 }).filed && filed.length === 2, 'the dedup outlives a hub restart (data/device-alerts.json)');
  const W = await import(path.join(REPO, 'src/server/device-upgrade-watch.js'));
  const uw = (W.default || W).create({ userTodos: { add: () => ({}), get: () => null, setStatus: () => { } }, dataDir: dir, tickMs: 0, alerts: al });
  uw.begun({ hostKey: 'h1', machine: 'Box', from: '2.369.311', to: '2.369.312' }); uw.begun({ hostKey: 'h1', machine: 'Box', from: '2.369.311', to: '2.369.312' });
  uw.begun({ hostKey: 'local', machine: 'hub', from: '2.369.311', to: '2.369.312' });
  const ups = filed.filter((f) => /update/.test(f.text));
  ok(ups.length === 1 && /Agent update pushed to Box: 2\.369\.311 → 2\.369\.312/.test(ups[0].text) && /system:device-upgrade/.test(ups[0].detail), 'an update pushed: ONE item per (device, from → to) — three attempts are one; the hub\'s own daemon never', ups.map((u) => u.text));
  const bad = al.file('upgrade-pushed', { hostKey: 'h1', machine: 'Box', from: '2.369.311', to: '2.369.312', code: 'bad-signature' });
  ok(bad.filed && /refused an agent update with a bad signature/.test(filed[filed.length - 1].text), 'a bad-signature refusal = the same kind, its own words and key (lane device-bundle-signing only sets the code)');
  ok(filed.every((f) => f.i18n && f.i18n.text && f.i18n.text.key && Array.isArray(f.i18n.detail)), 'the words ride as structure (the tray words them in the device\'s language)');
  // the first dial from a new address (hosts.noteDial's known set)
  const { HostManager } = require('../src/hosts.js');
  const hd = path.join(tmp, 'hdial'); fs.mkdirSync(hd, { recursive: true });
  const hosts = new HostManager({ dataDir: hd });
  hosts.setDialToken('mbp', 'y'.repeat(64));
  const seen = []; hosts.onDeviceAlert = (k, f) => seen.push({ k, ...f });
  for (const from of ['203.0.113.5', '203.0.113.5', '::ffff:203.0.113.5', '127.0.0.1', '2001:db8:1:2::10', '2001:db8:1:2::99', '198.51.100.7']) hosts.noteDial('mbp', 'accepted', { from });
  ok(seen.length === 3 && seen.map((s) => s.address).join(',') === '203.0.113.5,2001:db8:1:2::10,198.51.100.7' && seen[0].first === true && seen[1].first === false, 'a new dial address: ONE item per address (IPv4; an IPv6 /64; the IPv4-mapped spelling is the same; loopback = a relay, never)', seen);
  const hd2 = path.join(tmp, 'hdial2'); fs.mkdirSync(hd2, { recursive: true });
  const hosts2 = new HostManager({ dataDir: hd2 });
  hosts2.setDialToken('old', 'z'.repeat(64));
  hosts2.findByDeviceId('old').dial = { lastAccept: { at: 1, from: '192.0.2.44' }, firstConnectAt: 1 };
  const seen2 = []; hosts2.onDeviceAlert = (k, f) => seen2.push(f);
  hosts2.noteDial('old', 'accepted', { from: '192.0.2.44' });
  ok(seen2.length === 0, 'a device paired before this lane: its last accepted address is known (no item at the first restart)');
  const w1 = ALERTS.itemOf('new-address', { hostKey: 'h', machine: 'Mac', address: '198.51.100.7', addressKey: '198.51.100.7' });
  ok(/Mac connected from a new address: 198\.51\.100\.7/.test(w1.text), 'the new-address words name the machine and the address');
  ok(/hosts\.onDeviceAlert\?\.\('pairing-minted'/.test(read('src/server/dial-pairing.js')) && /function agentdMintDialPair\(deviceId, \{[^}]*by = 'system:dial-pairing', from = ''/.test(read('src/server/dial-pairing.js')), 'the ONE minter files the pairing item (by + from)');
}

console.log('— ⑧ the census: every hub act call names who asked');
{
  const r = censusActCalls({ root: REPO });
  ok(r.missing.length === 0 && r.calls.length >= 60, `${r.calls.length} act calls in ${new Set(r.calls.map((c) => c.file)).size} files, each with its by`, r.missing);
  const h = read('src/hosts.js');
  const cut = h.replace("const r = await dm.runCmd('sh', ['-c', script], { timeoutMs, by });", "const r = await dm.runCmd('sh', ['-c', script], { timeoutMs });");
  const m = censusActCalls({ root: REPO, files: ['src/hosts.js'], override: { 'src/hosts.js': cut } });
  ok(cut !== h && m.missing.length === 1 && m.missing[0].method === 'runCmd', 'MUTANT: hosts.js _hostShell run-cmd without by ⇒ RED', m.missing);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// SEALED-ORDERS emergency reflex (design §Pool management) vs a REAL daemon:
// the device executes a LOCAL pool fallback switch ONLY under the double
// condition (limit banner observed in live session stdout AND no orchestrator
// connection), logs it, and reports on reconnect. Single-brain preserved:
// with a server CONNECTED the reflex must NOT fire.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-so-'));
const ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = ROOT;
process.env.HOME = path.join(tmp, 'home'); fs.mkdirSync(process.env.HOME, { recursive: true });
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fake pool: link → dirA; ranked fallback = B
const subs = path.join(tmp, 'subs'); fs.mkdirSync(path.join(subs, 'sub-a'), { recursive: true }); fs.mkdirSync(path.join(subs, 'sub-b'), { recursive: true });
fs.writeFileSync(path.join(subs, 'sub-a', '.credentials.json'), '{}');
fs.writeFileSync(path.join(subs, 'sub-b', '.credentials.json'), '{}');
const link = path.join(subs, 'pool-x');
fs.symlinkSync(path.join(subs, 'sub-a'), link);

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const mk = () => { const d = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} }); d.installLocal(); return d; };
const dm1 = mk();
const conn = await dm1.connect();
check('hello-ack advertises pool-orders', conn.info.capabilities.includes('pool-orders'));

const orders = { poolId: 'pool-x', linkPath: link, currentId: 'sub-a',
  ranked: [{ id: 'sub-a', dir: path.join(subs, 'sub-a'), creds: path.join(subs, 'sub-a', '.credentials.json') },
           { id: 'sub-b', dir: path.join(subs, 'sub-b'), creds: path.join(subs, 'sub-b', '.credentials.json') }] };
await dm1.poolOrders(orders, undefined, { by: 'system:test' });
check('orders accepted + persisted', fs.existsSync(path.join(ROOT, 'state', 'pool-orders.json')));

// a fake LIVE pipe session the tailer will scan
const SESS = path.join(ROOT, 'state', 'sessions'); fs.mkdirSync(SESS, { recursive: true });
// the meta's spawn line must reference the pool credential dir — that is how
// the daemon tells "this session bills the pool" from "some other session"
fs.writeFileSync(path.join(SESS, 'sess-t1.json'), JSON.stringify({ childPid: process.pid, startedAt: Date.now(),
  cmd: ['sh', '-lc', `exec env CLAUDE_SECURESTORAGE_CONFIG_DIR=${link} claude`] }));
// …and a FOREIGN session (its own credentials) must never trigger the reflex
fs.writeFileSync(path.join(SESS, 'sess-foreign.json'), JSON.stringify({ childPid: process.pid, startedAt: Date.now(),
  cmd: ['sh', '-lc', 'exec env CLAUDE_SECURESTORAGE_CONFIG_DIR=/somewhere/else claude'] }));
fs.writeFileSync(path.join(SESS, 'sess-foreign.out'), 'quiet\n');
fs.writeFileSync(path.join(SESS, 'sess-t1.out'), 'normal output line\n');
await sleep(3200); // let the tailer register the current size

// ── CONNECTED server: banner must NOT trigger the reflex (single-brain) ──
fs.appendFileSync(path.join(SESS, 'sess-t1.out'), JSON.stringify({ type: 'user', text: "You've reached your 5-hour limit" }) + '\n');
await sleep(4000);
check('with a server CONNECTED the reflex does NOT fire', fs.readlinkSync(link).endsWith('sub-a'));

// ── server goes away → the double condition is met ──
await dm1.stop?.();
await sleep(2500);
fs.appendFileSync(path.join(SESS, 'sess-t1.out'), JSON.stringify({ type: 'user', text: "You've hit your session limit · resets 3am" }) + '\n');
let flipped = false;
for (let i = 0; i < 24 && !flipped; i++) { await sleep(500); flipped = fs.readlinkSync(link).endsWith('sub-b'); }
check('server down + banner ⇒ the device re-points the pool symlink to the ranked fallback', flipped);
// a FOREIGN session's banner must NOT move the pool (adversarial review)
{
  const before2 = fs.readlinkSync(link);
  fs.appendFileSync(path.join(SESS, 'sess-foreign.out'), JSON.stringify({ type: 'user', text: "You've reached your 5-hour limit" }) + '\n');
  await sleep(5000);
  check('a banner from a session that does NOT bill this pool is ignored', fs.readlinkSync(link) === before2);
}
check('execution logged for the reconnect report', fs.existsSync(path.join(ROOT, 'state', 'pool-orders-log.ndjson')));

// ── reconnect: the executed report arrives + ack clears the log ──
const dm2 = mk();
const reported = [];
await dm2.connect();
// the server re-pushes orders at boot/eval — the report rides that reply
await dm2.poolOrders(orders, (evs) => { reported.push(...evs); dm2.ackPoolOrdersLog(); }, { by: 'system:test' });
check('the next orders push delivers the executed report', reported.length === 1 && reported[0].to === 'sub-b' && reported[0].poolId === 'pool-x');
for (let i = 0; i < 20 && fs.existsSync(path.join(ROOT, 'state', 'pool-orders-log.ndjson')); i++) await sleep(300);
check('ack clears the execution log (no duplicate reports)', !fs.existsSync(path.join(ROOT, 'state', 'pool-orders-log.ndjson')));

// ── MULTI-POOL (adversarial review): two pools must BOTH stay armed, and with
// several armed the device must refuse to guess which pool a banner belongs to
{
  const link2 = path.join(subs, 'pool-y');
  fs.symlinkSync(path.join(subs, 'sub-a'), link2);
  const orders2 = { poolId: 'pool-y', linkPath: link2, currentId: 'sub-a', ranked: orders.ranked };
  await dm2.poolOrders(orders, undefined, { by: 'system:test' });      // re-arm pool-x
  await dm2.poolOrders(orders2, undefined, { by: 'system:test' });     // arm pool-y — must NOT evict pool-x
  const stored = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'pool-orders.json'), 'utf8'));
  check('both pools are stored (single-slot bug fixed)', !!(stored['pool-x'] && stored['pool-y']), Object.keys(stored).join(','));
  // clear one → the other survives
  await dm2.poolOrders({ clearPool: 'pool-y' }, undefined, { by: 'system:test' });
  const stored2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'pool-orders.json'), 'utf8'));
  check('clearPool disarms ONLY that pool', !!stored2['pool-x'] && !stored2['pool-y'], Object.keys(stored2).join(','));
}

// ── THE PROVIDER (lane pool-provider-latents, design q-055 M1): a TWO-PROVIDER order — the default link on a Claude
// subscription member, a per-session link on a DeepSeek member (a conversation the owner allowed onto it). Server down +
// a limit banner from the DeepSeek conversation ⇒ the device NEVER moves it onto a Claude member (its reflex is a HOT
// re-point; another provider is the hub's cold move or the owner's card), and says why; the Claude conversation still
// falls back (the control that the daemon is armed). MUTANT: a bundle whose src/sealed-orders.js drops the provider
// filter ⇒ the device moves the DeepSeek conversation onto the Claude member ⇒ RED.
const PK = 'pv-claude-subscription', QK = 'pv-deepseek';
async function twoProvider(bundlePath, tag, { control = true } = {}) {
  const R2 = path.join(tmp, 'agentd-' + tag);
  process.env.VIBESPACE_AGENTD_ROOT = R2; // its own daemon (the client reads the root at construction)
  const D2 = path.join(tmp, 'data-' + tag); fs.mkdirSync(D2, { recursive: true });
  const subs2 = path.join(tmp, 'subs-' + tag);
  for (const s of ['sub-a', 'sub-c', 'sub-q']) { fs.mkdirSync(path.join(subs2, s), { recursive: true }); fs.writeFileSync(path.join(subs2, s, '.credentials.json'), '{}'); }
  const def = path.join(subs2, 'pool-z'); fs.symlinkSync(path.join(subs2, 'sub-a'), def);
  const linksDir = path.join(tmp, 'links-' + tag, 'pool-z'); fs.mkdirSync(linksDir, { recursive: true });
  const lq = path.join(linksDir, 'sess-q'); fs.symlinkSync(path.join(subs2, 'sub-q'), lq);
  const row = (id) => ({ id, dir: path.join(subs2, id), creds: path.join(subs2, id, '.credentials.json'), provider: PK });
  const ord = { poolId: 'pool-z', linkPath: def, currentId: 'sub-a', ranked: [row('sub-a'), row('sub-c')], linkPaths: [], provider: PK,
    links: [{ path: lq, provider: QK }], members: { 'sub-a': PK, 'sub-c': PK, 'sub-q': QK } };
  const d = new DeviceManager({ dataDir: D2, bundlePath, version, log: () => {} }); d.installLocal();
  await d.connect();
  await d.poolOrders(ord, undefined, { by: 'system:test' });
  const S2 = path.join(R2, 'state', 'sessions'); fs.mkdirSync(S2, { recursive: true });
  const sess = (sid, lp) => { fs.writeFileSync(path.join(S2, sid + '.json'), JSON.stringify({ childPid: process.pid, startedAt: Date.now(), cmd: ['sh', '-lc', `exec env CLAUDE_SECURESTORAGE_CONFIG_DIR=${lp} claude`] })); fs.writeFileSync(path.join(S2, sid + '.out'), 'normal output line\n'); };
  sess('sess-q', lq); sess('sess-p', def);
  await sleep(3200); // the tailer registers the current sizes
  await d.stop?.();
  await sleep(2500);
  fs.appendFileSync(path.join(S2, 'sess-q.out'), JSON.stringify({ type: 'user', text: "You've reached your 5-hour limit" }) + '\n');
  let qNow = fs.readlinkSync(lq);
  for (let i = 0; i < 16 && qNow.endsWith('sub-q'); i++) { await sleep(500); qNow = fs.readlinkSync(lq); }
  let pMoved = null;
  if (control) {
    fs.appendFileSync(path.join(S2, 'sess-p.out'), JSON.stringify({ type: 'user', text: "You've hit your session limit · resets 3am" }) + '\n');
    for (let i = 0; i < 24 && !pMoved; i++) { await sleep(500); if (fs.readlinkSync(def).endsWith('sub-c')) pMoved = fs.readlinkSync(def); }
  }
  let logTail = ''; try { logTail = fs.readFileSync(path.join(R2, 'state', 'agentd.log'), 'utf8').slice(-4000); } catch { }
  return { qNow, pMoved, logTail };
}
{
  const real = await twoProvider(bundle, 'two');
  check('TWO-PROVIDER order, server down + a banner from the DeepSeek conversation ⇒ the device NEVER moves it onto a Claude member', real.qNow.endsWith('sub-q'), real.qNow);
  check('…and its log says why (no fallback member of its own provider: pv-deepseek)', /no usable fallback member of its own provider \(no-same-provider: pv-deepseek\)/.test(real.logTail), real.logTail.slice(-600));
  check('CONTROL: the Claude conversation\'s banner on the same daemon still falls back to the next Claude member (the reflex is armed)', !!real.pMoved && real.pMoved.endsWith('sub-c'), String(real.pMoved));
  // MUTANT: the same daemon bundled with a src/sealed-orders.js whose provider filter is dropped (a copy outside the tree)
  const esbuild = require('esbuild');
  const soSrc = fs.readFileSync(path.join(repo, 'src/sealed-orders.js'), 'utf8');
  const SOA = 'const next = ranked.find((m) => m.provider != null && String(m.provider) === provider) || null;';
  check('mutant: the anchor (the device\'s provider filter) hits once', soSrc.split(SOA).length === 2);
  const mutFile = path.join(tmp, 'sealed-orders-filter-dropped.js');
  fs.writeFileSync(mutFile, soSrc.replace(SOA, 'const next = ranked[0] || null; // PATCHED: the provider filter dropped'));
  const mutBundle = path.join(tmp, 'agentd-mut.js');
  await esbuild.build({ entryPoints: [path.join(repo, 'src/agentd/agentd.js')], bundle: true, platform: 'node', outfile: mutBundle, logLevel: 'silent',
    plugins: [{ name: 'sealed-orders-mutant', setup(b) { b.onResolve({ filter: /sealed-orders\.js$/ }, () => ({ path: mutFile })); } }] });
  const mut = await twoProvider(mutBundle, 'mut', { control: false });
  check('mutant RED: the filter dropped ⇒ the device moves the DeepSeek conversation onto the Claude member (the cross-provider reflex the order forbids)', mut.qNow.endsWith('sub-a'), mut.qNow);
}

if (failed) { try { console.error('--- daemon log ---\n' + fs.readFileSync(path.join(ROOT, 'state', 'agentd.log'), 'utf8').slice(-1200)); } catch { } }
try { await dm2.stop?.(); } catch { }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `FAIL (${failed})` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);

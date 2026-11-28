#!/usr/bin/env node
// test-tailnet-reach-chrome — A TAILNET NAME LOADS IN A REAL CHROME (lane tailnet-names, 2026-11-05; userW: «装了 Tailscale 插件，
// https://<host>:8006/ 无法解析»). Heavy: real Chrome (headless) + loopback «devices» under a MINTED table (two peers + Self;
// no real tailnet). ROUND 2: THE ROAD IS ADDED, NEVER A GATE — the PAC lists the current devices only:
//   ① KERNEL mode — Chrome started with the ATTACH road's exact builder argv (src/browser-attach.js attachArgv) carrying the
//      ONE switch the keeper stamps (--proxy-pac-url=http://127.0.0.1:<the door>/tailnet-<token>.pac): a peer's bare name, its FQDN and
//      `https://` (CONNECT) load through the hub's door, which answers the name from the table; THIS machine's own name (Self)
//      loads too; a Funnel / other-tailnet name and a public host load DIRECT (the door never sees them); a device that is
//      DOWN — what the person sees: `https://` Chrome's own tunnel error (screenshotted; the agent's note names the cause —
//      the door saw the refused port), `http://` the door's LAW 2 page by the cause (screenshotted); r3: a device with a
//      SELF-SIGNED certificate in a Chrome that checks certificates — Chrome's own warning (screenshotted), the agent's note
//      «Chrome shows a certificate warning: accept it in the live view, or give the device a trusted certificate»;
//   ② USERSPACE mode — the same switch; the PAC sends the devices' names AND addresses to the plugin's SOCKS5 (a loopback
//      stub: it records ONLY them); a Funnel name and the public URL go DIRECT;
//   ③ THE DRIVER'S ROAD — the real agent-browser (when installed) launching Chrome with a config whose ONE args line carries
//      the switch (the keeper's derived file shape): the device loads, the public host DIRECT;
//   ④ LAW 2's page in the in-page browser (/proxy — the real node-unblocker + the door), AFTER the ordinary road failed: the
//      person's own device with the plugin off (en / zh / ja), a name no device holds, a device with a SELF-SIGNED certificate
//      (the user's :8006 shape — r3: «answered, but with a certificate the in-page browser does not trust (self-signed?) — it
//      cannot open it from here: give the device a trusted certificate (tailscale cert)», the detail line the code + plain
//      words, no Node hint) — screenshotted; r5: the person's own device with «Reach tailnet hosts from browsers» OFF
//      (en / zh / ja) — «reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers»…» —
//      screenshotted (VS_SHOT_DIR=<dir> keeps the PNGs);
//   ⑤ NOTHING LEAVES LOOPBACK: a 4 Hz socket sampler over this suite's Chrome process trees — no non-loopback peer.
// The suite's own names resolve by --host-resolver-rules (the attach road: «public.example» + the Funnel name → loopback, every
// other name «not found» (scratch.mjs's names rule); the driver's ONE line: every name → loopback) — the test's DNS, not the product's road; every Chrome
// runs without background networking. SKIPs by name: no Chrome (everything), no openssl (the https legs), no agent-browser (③).
// r5: NEVER A HANG — every CDP call answers within its bound (a reply lost at Chrome's exit: Browser.close waited for ever, 300 s
// under the heavy lock), a Chrome that does not exit is killed by its pid, and the whole suite is bounded (a named ✗, not a hang).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { scratch, ONBOARDED_SOURCE, CHROME_STORE, CHROME_QUIET, chromeNames, driverArgs } from './scratch.mjs';
import { DRIVER } from './scratch.mjs';   // the ONE sentence a driver-less skip begins with (主开发 r2095)

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0, skipped = 0;
const ok = (name, cond, detail) => { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1400) : ''}`); } return !!cond; };
const skip = (why) => { skipped++; console.log(`  - SKIP ${why}`); };
const done = () => { console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`); process.exit(fail ? 1 : 0); };
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { skip('no chrome/chromium'); done(); }
let DOOR = null, TR = null;
try { DOOR = require('../src/server/tailnet-door.js'); TR = require('../src/tailnet-reach.js'); } catch { DOOR = null; }
if (!DOOR) { ok('src/server/tailnet-door.js + src/tailnet-reach.js exist', false, 'missing — a tailnet name cannot load in a browser here'); done(); }
const AT = require('../src/browser-attach.js');
const V = require('../src/browser-verbs.js');

const ROOT = scratch('tailnet-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const SHOTS = process.env.VS_SHOT_DIR || path.join(ROOT, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const servers = new Set(), kids = new Set();
let sampler = null;
const cleanup = () => { if (sampler) clearInterval(sampler); for (const c of kids) { try { process.kill(c.pid, 'SIGKILL'); } catch { } } for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
const listen = (srv) => new Promise((r) => { servers.add(srv); srv.listen(0, '127.0.0.1', () => r(srv.address().port)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SUITE_MS = 180 * 1000; // ~5 s here: a run past this is a hang, said by name
const watchdog = setTimeout(() => { fail++; console.log(`  ✗ the suite finished within ${SUITE_MS / 1000} s — it did not (a CDP reply or a Chrome that never came): its Chromes killed`); done(); }, SUITE_MS); if (watchdog.unref) watchdog.unref();
const quietLog = { log() { }, warn() { }, error() { } };

// ── ⑤ the sampler: every socket a Chrome of THIS suite holds (its process trees: the spawned ones + the driver's daemon) ──
// B-8695 (主开发 r4630): OFF THE SUITE's LOOP. At the release each sample read /proc/<pid>/stat of EVERY process on the machine and
// ran `ss` by execFileSync, both on the loop that also reads the browsers' CDP messages: on a full box every message reached the suite
// about a second late (the timed row 920: Page.enable ~1 s, events 0.78 s apart) and the 180 s watchdog fired mid-suite, at the
// release as on every tree since (a test that followed the machine's load, never a commit's). Now:
//   - the walk covers only the suite's OWN trees (each root's /proc/<pid>/task/*/children, async), never every process;
//   - `ss` runs by execFile (async: a child, never on the loop);
//   - ONE sample at a time: a sample due while one runs is SKIPPED and counted;
//   - its cost is printed at ⑤ (per sample: count, median, p95, the longest five) beside the loop's longest turn while it ran
//     (perf_hooks monitorEventLoopDelay, the loop meter scripts/test-boot-loop-hold.mjs reads too);
//   - the LAST sample, after the browsers' last act, is never skipped (⑤ awaits the running one, then takes one more).
// ⑥ places its red: the release's sampler (kept verbatim below, for the control only) and this one, each over a stand-in `ss` held
// for a set time: the release's makes the loop's turns that long, this one leaves them short.
const roots = new Set(), outside = [];
const loopPeer = (a) => /^(127\.|\[::1\]|\[::ffff:127\.|\*|0\.0\.0\.0|\[::\])/.test(a);
const parseSs = (out, mine, into) => { for (const l of out.split('\n')) { const f = l.trim().split(/\s+/); const peer = f[5] || ''; const pids = [...l.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])); if (pids.some((p) => mine.has(p)) && peer && !loopPeer(peer)) into.push(`${(/users:\(\("([^"]+)"/.exec(l) || [])[1] || '?'} ${f[0]} ${f[4]} → ${peer}`); } };
function makeSampler({ roots: rs, outside: into, ssBin = 'ss', everyMs = 250 } = {}) {
  const fsp = fs.promises;
  const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { encoding: 'utf8', timeout: 2000, maxBuffer: 32 * 1024 * 1024 }, (e, so) => res(e ? null : String(so || ''))));
  const kidsOf = async (pid) => { const out = []; let tasks = []; try { tasks = await fsp.readdir(`/proc/${pid}/task`); } catch { return out; } for (const t of tasks) { try { for (const c of (await fsp.readFile(`/proc/${pid}/task/${t}/children`, 'utf8')).trim().split(/\s+/)) if (c) out.push(Number(c)); } catch { } } return out; };
  const treeOf = async () => { const all = new Set(), q = [...rs]; while (q.length) { const pid = q.pop(); if (all.has(pid)) continue; all.add(pid); for (const k of await kidsOf(pid)) q.push(k); } return all; };
  const st = { n: 0, skipped: 0, ms: [], maxTree: 0, maxKids: 0, read: 0, failed: 0, finalRead: null }; let running = null;
  const one = async () => { const t0 = Date.now(); try { if (!rs.size) return; const mine = await treeOf(); if (mine.size > st.maxTree) st.maxTree = mine.size; if (mine.size - rs.size > st.maxKids) st.maxKids = mine.size - rs.size; const out = await run(ssBin, ['-tunpH']); if (out === null) { st.failed++; return false; } st.read++; parseSs(out, mine, into); return true; } finally { st.n++; st.ms.push(Date.now() - t0); } };   // r4685 M2: a listing that failed is COUNTED, never silent
  const tick = () => { if (running) { st.skipped++; return; } running = one().finally(() => { running = null; }); };
  const iv = setInterval(tick, everyMs); if (iv.unref) iv.unref();
  return { interval: iv, stop: () => clearInterval(iv), stats: () => st, async final() { if (running) await running; st.finalRead = (await one()) === true; return st.finalRead; } };
}
const LOOP = monitorEventLoopDelay({ resolution: 10 }); LOOP.enable();   // the loop's longest turn while the sampler runs (ms at ⑤)
const SAMPLER = makeSampler({ roots, outside });
// r4704: EVERY final sample the suite judges on goes through this ONE door: a final whose socket listing failed is a FAILING LINE by
// name, never a silent «none seen» (③ before the driver's close, ⑤ before its verdict, the positive control's two). the judgement is turned
// off for the placed red control alone, and ⑥ reads this file's own text so that a third place cannot take a final sample around the door.
const finalVerdict = (read, where) => ({ pass: read === true, name: `the final sample ${where} READ its socket listing (a failed listing is never «none seen»)` });
const finalSample = async (where, s = SAMPLER, { judge = true } = {}) => { const read = await s.final(); if (judge) { const v = finalVerdict(read, where); ok(v.name, verdictOf(v.pass), { where, read, failed: s.stats().failed }); } return read; };
sampler = SAMPLER.interval;

// ── the minted tailnet ──
const SUF = 'tail-mint.ts.net', PEER_IP = '100.101.1.2', BETA_IP = '100.101.1.3', SELF_IP = '100.101.1.1', FUNNEL = 'app.tail9999.ts.net';
const hits = [];
const page = (tag) => (req, res) => { hits.push({ tag, host: req.headers.host }); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><title>${tag}</title><body>${tag}-OK ${req.headers.host}</body>`); };
const PEER_PORT = await listen(http.createServer(page('PEER')));
const SELF_PORT = await listen(http.createServer(page('SELF')));
const PUB_PORT = await listen(http.createServer(page('PUBLIC')));
const CLOSED = await (async () => { const s = net.createServer(); const p = await new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port))); await new Promise((r) => s.close(r)); return p; })();
let TLS_PORT = 0;
try {
  const key = path.join(ROOT, 'k.pem'), crt = path.join(ROOT, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=peer-alpha', '-addext', `subjectAltName=DNS:peer-alpha,DNS:peer-alpha.${SUF}`], { stdio: 'ignore', timeout: 20000 });
  TLS_PORT = await listen(https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, page('PEERTLS')));
} catch { TLS_PORT = 0; }
// the plugin's SOCKS5 (userspace) — a stub: no auth, CONNECT, records the target as Chrome names it, tunnels to the device
const socksSeen = [];
const socks = net.createServer((c) => {
  c.on('error', () => { });
  c.once('data', () => {
    c.write(Buffer.from([5, 0]));
    c.once('data', (q) => {
      let host = '', off = 0;
      if (q[3] === 3) { const n = q[4]; host = q.subarray(5, 5 + n).toString(); off = 5 + n; } else if (q[3] === 1) { host = [...q.subarray(4, 8)].join('.'); off = 8; } else { c.destroy(); return; }
      const port = q.readUInt16BE(off);
      socksSeen.push(`${host}:${port}`);
      const up = net.connect(port === TLS_PORT ? TLS_PORT : PEER_PORT, '127.0.0.1', () => { c.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0])); up.pipe(c); c.pipe(up); });
      up.on('error', () => c.destroy());
    });
  });
});
const SOCKS_PORT = await listen(socks);
const PEERS = [{ name: `peer-alpha.${SUF}`, short: 'peer-alpha', ips: [PEER_IP] }, { name: `peer-beta.${SUF}`, short: 'peer-beta', ips: [BETA_IP] }];
const SELF = { name: `hub.${SUF}`, short: 'hub', ips: [SELF_IP] };
const UP = { up: true, state: 'Running', loggedIn: true, browsers: true, peers: PEERS, self: SELF, suffix: SUF, known: [...PEERS, SELF], ports: { socks: SOCKS_PORT, http: 0 } };
let reach = null;
const dialed = [];
// the suite's tunnel: every tailnet address IS a loopback server (the port picks it); a name the door dials by DNS is recorded
const dial = (h) => { dialed.push(h); return [PEER_IP, BETA_IP, SELF_IP].includes(h) ? '127.0.0.1' : h; };
const RULES = chromeNames({ map: { 'public.example': '127.0.0.1', [FUNNEL]: '127.0.0.1' } });  // B-9dd0 r3727: scratch.mjs's ONE names rule, with the suite's own names;  the attach road carries ','
const QUIET = ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings', '--disable-domain-reliability', '--disable-default-apps', '--no-first-run', '--metrics-recording-only'];

// ── a headless Chrome over raw CDP ──
async function chrome(argv, tag) {
  const ud = argv.find((a) => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
  const c = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', '--no-sandbox', '--disable-gpu', ...QUIET, ...argv.filter((a) => a !== '--ozone-platform=x11')], { stdio: ['ignore', 'ignore', 'pipe'], detached: false });
  kids.add(c); roots.add(c.pid);
  let err = ''; c.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  const pf = path.join(ud, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(pf); i++) await sleep(100);
  const p = AT.parsePortFile(fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : '');
  if (!p) throw new Error(`${tag}: Chrome wrote no DevToolsActivePort (${err.slice(-300)})`);
  const list = await (await fetch(`http://127.0.0.1:${p.port}/json/list`)).json();
  const tgt = list.find((t) => t.type === 'page');
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), events = [];
  ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && wait.has(j.id)) { wait.get(j.id)(j); wait.delete(j.id); } else if (j.method) events.push(j); };
  ws.onclose = () => { for (const [n, r] of wait) { wait.delete(n); r({ error: { message: 'the DevTools socket closed' } }); } }; // r5: a reply lost at exit
  // r5: every call answers within its bound — a reply that never comes is an error, never a wait for ever
  const call = (method, params = {}, ms = 30000) => new Promise((r) => {
    const n = ++id;
    const t = setTimeout(() => { wait.delete(n); r({ error: { message: `${method}: no reply in ${ms} ms` } }); }, ms);
    wait.set(n, (j) => { clearTimeout(t); r(j); });
    try { ws.send(JSON.stringify({ id: n, method, params })); } catch (e) { clearTimeout(t); wait.delete(n); r({ error: { message: String((e && e.message) || e) } }); }
  });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // the chrome-suite census (no VibeSpace page here — harmless)
  return {
    // A READ OF A PAGE IS TIED TO ITS OWN NAVIGATION (主开发 r110, 2026-11-20 — the release mirror 44726884611 read '' on ④'s
    // first leg): the wait ended on ANY load event, and a fresh Chrome's first page can still send its own load into the
    // emptied list, so the text was read from a document not parsed yet. Now the document we leave is MARKED before the
    // navigate; the read counts only in a document without that mark whose load has completed (readyState 'complete'), and
    // polls inside its bound (10 s after the navigate's reply, the old wait's) until the body SAYS something. A text still
    // empty at the bound comes back with `said`: red BY NAME with the bound in it (each leg prints what open() returned).
    // A failed navigation (errorText: Chrome's own error page) waits for its document alone; its legs judge the error.
    // `plantStale` and `anyLoad` are the CONTROL's (④ end): a stale load event planted in the emptied list, the old rule.
    async open(url, { boundMs = 10000, plantStale = false, anyLoad = false } = {}) {
      events.length = 0;
      if (plantStale) events.push({ method: 'Page.loadEventFired', params: { planted: true } });
      await call('Runtime.evaluate', { expression: 'document.__vsLeft = true', returnByValue: true });
      const nav = await call('Page.navigate', { url });
      const errorText = nav.result && nav.result.errorText;
      const read = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true }); const o = r.result && !r.result.exceptionDetails && r.result.result; return o && o.type === 'string' ? o.value : null; };   // a string, or null (not this document yet, a context gone mid-navigation, no reply)
      if (anyLoad) {   // THE OLD RULE, for the control only: any load event ends the wait, one read
        for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
        return { text: String((await read('document.body ? document.body.innerText : ""')) || ''), errorText, rule: 'any load event' };
      }
      const t0 = Date.now();
      let v = null;
      while (Date.now() - t0 < boundMs) {
        v = await read(`document.__vsLeft || document.readyState !== 'complete' ? null : (document.body ? document.body.innerText : '')`);
        if (v !== null && (v !== '' || errorText)) break;
        await sleep(v === null ? 50 : 100);
      }
      const text = String(v || '');
      return { text, errorText, ms: Date.now() - t0, ...(text || errorText ? {} : { said: `the page of ${url} said nothing within ${boundMs / 1000} s (${v === null ? 'its document never finished loading' : 'its document loaded with an empty body'})` }) };
    },
    async shot(file) { const r = await call('Page.captureScreenshot', { format: 'png' }); if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); return fs.existsSync(file) ? fs.statSync(file).size : 0; },
    // r5: Browser.close bounded (2 s), then 3 s for the exit, then the pid we hold is killed
    async close() { try { await call('Browser.close', {}, 2000); } catch { } try { ws.close(); } catch { } for (let i = 0; i < 30 && c.exitCode === null; i++) await sleep(100); if (c.exitCode === null) { try { process.kill(c.pid, 'SIGKILL'); } catch { } } kids.delete(c); },
  };
}
/** a Chrome the way the ATTACH road spawns a profile's: the builder's argv with the keeper's stamped switch IN it */
async function profileChrome(tag, door, extra = []) {
  const v = await door.launch({ label: tag });
  const ud = path.join(ROOT, 'ud-' + tag); fs.mkdirSync(ud, { recursive: true });
  const av = AT.attachArgv({ profileDir: ud, mark: '--vibespace-keeper=' + tag, extra: [...extra, ...(v.arg ? [v.arg] : [])] });
  if (!av.ok) throw new Error(`${tag}: ${av.error}`);
  return { v, av, br: await chrome(av.argv.filter((a) => a !== 'about:blank'), tag) };
}

console.log('① KERNEL mode — the attach road\'s argv + the PAC → the hub\'s door answers a device\'s name from the table');
{
  reach = { ...UP, mode: 'kernel' };
  fs.mkdirSync(path.join(ROOT, 'dk'), { recursive: true });
  const door = DOOR.create({ dataDir: path.join(ROOT, 'dk'), reach: () => reach, dial, cacheMs: 0, log: quietLog });
  const { v, av, br } = await profileChrome('kernel', door, [RULES, '--ignore-certificate-errors']);
  ok('the profile\'s argv carries THE switch whole (the builder\'s census passed it; r3: the PAC on its token path)', gateOf(v.on) && gateOf(av.argv.includes(v.arg)) && verdictOf(/^--proxy-pac-url=http:\/\/127\.0\.0\.1:\d+\/tailnet-[0-9a-f]{32}\.pac$/.test(v.arg)), v);
  const a = await br.open(`http://peer-alpha:${PEER_PORT}/`);
  const b = await br.open(`http://peer-alpha.${SUF}:${PEER_PORT}/`);
  ok('`http://peer-alpha:<port>/` and its FQDN LOAD (the door resolved the name from the plugin\'s table — no resolver knows it)', a.text === `PEER-OK peer-alpha:${PEER_PORT}` && b.text === `PEER-OK peer-alpha.${SUF}:${PEER_PORT}`, { a, b });
  if (TLS_PORT) { const t = await br.open(`https://peer-alpha:${TLS_PORT}/`); ok('`https://peer-alpha:<port>/` LOADS (CONNECT through the door, TLS end to end)', t.text === `PEERTLS-OK peer-alpha:${TLS_PORT}`, t); } else skip('no openssl: the https leg');
  const s = await br.open(`http://hub.${SUF}:${SELF_PORT}/`);
  ok('N2 — THIS machine\'s own name (Self — the https-tailscale road, a dev server here) LOADS through the door: it is a device too', s.text === `SELF-OK hub.${SUF}:${SELF_PORT}`, s);
  const d0 = dialed.length;
  const f = await br.open(`http://${FUNNEL}:${PUB_PORT}/`);
  const p = await br.open(`http://public.example:${PUB_PORT}/`);
  ok('N2 — a Funnel / other-tailnet name and a public host load DIRECT (the PAC lists only the devices — the door never sees them)', f.text === `PUBLIC-OK ${FUNNEL}:${PUB_PORT}` && p.text === `PUBLIC-OK public.example:${PUB_PORT}` && !dialed.slice(d0).some((h) => h === FUNNEL || h === 'public.example'), { f, p, dialed: dialed.slice(d0) });
  if (TLS_PORT) {
    const dn = await br.open(`https://peer-beta:${CLOSED}/`);
    const size = await br.shot(path.join(SHOTS, 'kernel-peer-down-https.png'));
    const told = door.missFor(`https://peer-beta:${CLOSED}/`, { failed: true, cause: dn.errorText, launched: { arg: v.arg, mode: 'kernel', why: null } });
    ok('N7 — a device that is DOWN over https: the person sees Chrome\'s own tunnel error (screenshotted); the agent\'s note names the cause the door saw — «peer-beta answered through Tailscale, but refused the connection on port N»',
      dn.errorText === 'net::ERR_TUNNEL_CONNECTION_FAILED' && size > 1000 && !!told && told.why === 'refused' && verdictOf(told.text.startsWith(`peer-beta answered through Tailscale, but refused the connection on port ${CLOSED}`)), { dn, told });
  }
  const dh = await br.open(`http://peer-beta:${CLOSED}/`);
  const sizeH = await br.shot(path.join(SHOTS, 'kernel-peer-down-http.png'));
  ok('N7 — the same over http: the door\'s answer IS LAW 2\'s page by the cause, rendered by Chrome (screenshotted)', gateOf(dh.text.startsWith(`peer-beta answered through Tailscale, but refused the connection on port ${CLOSED}`)) && sizeH > 1000, dh);
  await br.close();
  if (TLS_PORT) {
    // r3 N6: a Chrome that CHECKS certificates (no --ignore-certificate-errors — the person's live view) on the self-signed device
    const { v: vc, br: bc } = await profileChrome('kernel-cert', door, [RULES, '--window-size=900,600']);
    const cw = await bc.open(`https://peer-alpha:${TLS_PORT}/`);
    const sizeC = await bc.shot(path.join(SHOTS, 'kernel-cert-warning-chrome.png'));
    const toldC = door.missFor(`https://peer-alpha:${TLS_PORT}/`, { failed: true, cause: cw.errorText, launched: { arg: vc.arg, mode: 'kernel', why: null } });
    ok('r3 N6 — a self-signed device in a Chrome that checks certificates: Chrome\'s OWN warning (net::ERR_CERT_*; screenshotted — the person can accept it in the live view); the agent\'s note says exactly that — «Chrome shows a certificate warning: accept it in the live view, or give the device a trusted certificate (tailscale cert)», never «this browser opens only…»',
      gateOf(/^net::ERR_CERT_/.test(String(cw.errorText))) && sizeC > 1000 && !!toldC && toldC.why === 'cert-warning' && verdictOf(toldC.text.startsWith('peer-alpha answered through Tailscale, but with a certificate Chrome does not trust (self-signed?) — Chrome shows a certificate warning: accept it in the live view, or give the device a trusted certificate (tailscale cert)')), { cw, toldC });
    await bc.close();
  } else skip('no openssl: the certificate-warning leg');
  await door.close();
}

console.log('② USERSPACE mode — the PAC sends ONLY the devices (names + addresses) to the plugin\'s SOCKS5');
{
  reach = { ...UP, mode: 'userspace' };
  const door = DOOR.create({ dataDir: null, reach: () => reach, cacheMs: 0, log: quietLog });
  const { v, br } = await profileChrome('userspace', door, [RULES, '--ignore-certificate-errors']);
  const s0 = socksSeen.length;
  const a = await br.open(`http://peer-alpha:${PEER_PORT}/`);
  ok('`http://peer-alpha:<port>/` LOADS through the plugin\'s SOCKS5 (the stub was handed the NAME — tailscaled resolves it)', gateOf(v.on) && gateOf(/^PEER-OK /.test(a.text)) && verdictOf(socksSeen.slice(s0).includes(`peer-alpha:${PEER_PORT}`)), { a, seen: socksSeen.slice(s0) });
  const ad = await br.open(`http://${PEER_IP}:${PEER_PORT}/`);
  ok('a device\'s tailnet ADDRESS loads through it too (the PAC lists the devices\' addresses — never all of 100.64/10)', gateOf(/^PEER-OK /.test(ad.text)) && verdictOf(socksSeen.includes(`${PEER_IP}:${PEER_PORT}`)), ad);
  if (TLS_PORT) { const t = await br.open(`https://peer-alpha.${SUF}:${TLS_PORT}/`); ok('`https://<device FQDN>:<port>/` LOADS through it too', gateOf(/^PEERTLS-OK /.test(t.text)) && verdictOf(socksSeen.includes(`peer-alpha.${SUF}:${TLS_PORT}`)), t); }
  const s1 = socksSeen.length;
  const f = await br.open(`http://${FUNNEL}:${PUB_PORT}/`);
  const p = await br.open(`http://public.example:${PUB_PORT}/`);
  ok('a Funnel name and the public URL went DIRECT — the SOCKS5 stub saw ONLY the devices', f.text === `PUBLIC-OK ${FUNNEL}:${PUB_PORT}` && p.text === `PUBLIC-OK public.example:${PUB_PORT}` && socksSeen.slice(s1).length === 0 && verdictOf(socksSeen.every((x) => x.startsWith('peer-alpha') || x.startsWith(PEER_IP))), { f, p, seen: socksSeen });
  await br.close(); await door.close();
}

console.log('③ THE DRIVER\'S ROAD — the real agent-browser launches Chrome with the switch on its ONE args line');
{
  let ab = null;
  try { ab = require('../src/browser-facts.js').binaryResolver('agent-browser', process.env)() || null; } catch { ab = null; } // the REAL binary (data/bin's is VibeSpace's refusing shim)
  if (!ab) skip(`${DRIVER.skip} no real agent-browser installed (the driver's road)`);
  else {
    reach = { ...UP, mode: 'userspace' };
    const door = DOOR.create({ dataDir: null, reach: () => reach, cacheMs: 0, log: quietLog });
    const v = await door.launch({ label: 'driver' });
    // B-8695 (主开发 r4617): the suite's own driver line and the harness's rule as ONE line built in ONE place (scratch.mjs driverArgs: the PAC
    // switch whole, DRIVER_NAMES — every name to the loopback — last); a --config file is the driver's line too (§47e)
    let line; try { line = { ok: true, args: driverArgs('--no-sandbox', ...QUIET, v.arg) }; } catch (e) { line = { ok: false, args: '', error: String((e && e.message) || e) }; } const cfgFile = path.join(ROOT, 'driver.json'); fs.writeFileSync(cfgFile, JSON.stringify({ args: line.args }));   // r4685: a refused line reads red by name below
    const sock = fs.mkdtempSync('/tmp/vs-tn-' + process.pid + '-'); // short: a unix socket path — /tmp itself, never TMPDIR; per pid (test-ci-gate-tiers §6)
    const home = path.join(ROOT, 'abhome'); fs.mkdirSync(home, { recursive: true });
    const env = { PATH: process.env.PATH, HOME: home, TMPDIR: ROOT, AGENT_BROWSER_SOCKET_DIR: sock, AGENT_BROWSER_SESSION: 'tn-driver', AGENT_BROWSER_CONFIG: cfgFile, AGENT_BROWSER_EXECUTABLE_PATH: CHROME, AGENT_BROWSER_IDLE_TIMEOUT_MS: '60000', AGENT_BROWSER_JSON: '1' };
    // ASYNC: the door and the SOCKS5 stub live in THIS process — a sync exec would block them while Chrome fetches its PAC
    const run = (args) => new Promise((res) => execFile(ab, args, { env, encoding: 'utf8', timeout: 60000 }, (e, so, se) => res({ ok: !e, out: String(so || '') + (e ? String(se || e.message) : '') })));
    // THIS leg's driver processes (the daemon and its Chrome): their environment names this leg's own socket dir (a mkdtemp) —
    // never a pid by pattern alone
    // r4685: ASYNC reads (the same kind of loop hold as the sampler's, named by the round): the door and the SOCKS5 stub answer on this loop
    const daemons = async () => { const out = []; for (const x of await fs.promises.readdir('/proc')) { if (!/^\d+$/.test(x) || Number(x) === process.pid) continue; try { if ((await fs.promises.readFile(`/proc/${x}/cmdline`, 'utf8')).includes(sock) || (await fs.promises.readFile(`/proc/${x}/environ`, 'utf8')).split('\0').includes(`AGENT_BROWSER_SOCKET_DIR=${sock}`)) out.push(Number(x)); } catch { } } return out; };
    const r0 = roots.size;
    const s0 = socksSeen.length;
    const opening = run(['open', `http://peer-alpha:${PEER_PORT}/`]);
    for (let i = 0; i < 40 && !(await daemons()).length; i++) await sleep(50); // the sampler watches the daemon's tree from its start
    for (const d of await daemons()) roots.add(d);
    const o = await opening;
    for (const d of await daemons()) roots.add(d);
    const t = await run(['get', 'text', 'body']);
    for (const d of await daemons()) roots.add(d);
    const s1 = socksSeen.length;
    const o2 = await run(['open', `http://public.example:${PUB_PORT}/`]);
    const t2 = await run(['get', 'text', 'body']);
    await finalSample("of the driver's Chrome, after its last act and before its close");   // B-8695 / r4704: never skipped, and its listing must READ
    await run(['close', '--all']);
    // the daemon this leg started: only a process whose cmdline names THIS leg's socket dir (never a pid by pattern alone)
    for (const d of await daemons()) { try { process.kill(d, 'SIGKILL'); } catch { } }
    ok('the driver reads its ONE args line back with the switch whole (comma-free)', gateOf(line.ok) && verdictOf(V.driverArgsList(line.args).includes(v.arg)), line);
    ok('the real agent-browser\'s Chrome LOADS `http://peer-alpha:<port>/` — through the plugin\'s SOCKS5 (it saw the name)', gateOf(o.ok) && gateOf(t.ok) && gateOf(/PEER-OK peer-alpha/.test(t.out)) && verdictOf(socksSeen.slice(s0, s1).includes(`peer-alpha:${PEER_PORT}`)), { o: o.out.slice(0, 300), t: t.out.slice(0, 300), seen: socksSeen.slice(s0) });
    ok('…and the public URL DIRECT (the SOCKS5 stub saw nothing more)', gateOf(o2.ok) && gateOf(/PUBLIC-OK/.test(t2.out)) && socksSeen.length === s1, { o2: o2.out.slice(0, 300), t2: t2.out.slice(0, 300) });
    ok('⑤ the sampler watched the driver\'s daemon + its Chrome (found by this leg\'s socket dir in their environment)', roots.size > r0, { roots: roots.size, r0 });
    try { fs.rmSync(sock, { recursive: true, force: true }); } catch { }
    await door.close();
  }
}

console.log('④ LAW 2\'s page in the in-page browser (/proxy) AFTER the ordinary road failed — screenshotted');
{
  const express = require('express');
  const Unblocker = require('unblocker');
  let lang = 'en';
  // the in-page browser's ordinary road resolves nothing here (the suite's DNS): a name nobody resolves fails as ENOTFOUND
  const lookup = (h, o, cb) => cb(Object.assign(new Error(`getaddrinfo ENOTFOUND ${h}`), { code: 'ENOTFOUND', hostname: h }));
  reach = { ...UP, up: false, mode: null, loggedIn: false, peers: [], self: null };
  const door = DOOR.create({ reach: () => reach, cacheMs: 0, log: quietLog, lang: () => lang, dial, lookup });
  const app = express(); app.use(door.embedded(new Unblocker({ prefix: '/proxy/', ...door.agents() })));
  const EMB = await listen(http.createServer(app));
  const ud = path.join(ROOT, 'ud-embedded'); fs.mkdirSync(ud, { recursive: true });
  const br = await chrome(['--remote-debugging-port=0', `--user-data-dir=${ud}`, RULES, '--window-size=900,300'], 'embedded');
  const want = { en: 'peer-alpha is a Tailscale name — the Tailscale plugin is off', zh: 'peer-alpha 是 Tailscale 里的名字 — Tailscale 插件没有开', ja: 'peer-alpha は Tailscale の名前です — Tailscale プラグインがオフです' };
  for (const l of ['en', 'zh', 'ja']) {
    lang = l;
    const r = await br.open(`http://127.0.0.1:${EMB}/proxy/https://peer-alpha:8006/`);
    const size = await br.shot(path.join(SHOTS, `embedded-plugin-off-${l}.png`));
    ok(`the in-page browser, the person's own device with the plugin off (${l}): «${want[l]}…» — by name, never «cannot resolve»; the error's own text under it`, gateOf(r.text.startsWith(want[l])) && gateOf(r.text.includes('ENOTFOUND')) && !/cannot resolve|无法解析|解決できません/.test(r.text) && size > 1000, r);
  }
  // r5: the person's own device with «Reach tailnet hosts from browsers» OFF (the plugin up): the row's words — the person's
  const rowOff = { en: 'peer-alpha is a Tailscale name — reaching Tailscale devices from browsers is off: turn on «Reach tailnet hosts from browsers» in ⚙ → Plugins → Tailscale', zh: 'peer-alpha 是 Tailscale 里的名字 — 从浏览器访问 Tailscale 设备已关闭：在 ⚙ → 插件 → Tailscale 打开「从浏览器访问 tailnet 里的机器」', ja: 'peer-alpha は Tailscale の名前です — ブラウザーから Tailscale のデバイスへの接続がオフです：⚙ → プラグイン → Tailscale で「ブラウザーから tailnet のマシンに接続」をオンにしてください' };
  reach = { ...UP, mode: 'kernel', browsers: false };
  for (const l of ['en', 'zh', 'ja']) {
    lang = l;
    const r = await br.open(`http://127.0.0.1:${EMB}/proxy/https://peer-alpha:8006/`);
    const size = await br.shot(path.join(SHOTS, `embedded-row-off-${l}.png`));
    ok(`r5 — the in-page browser, the person's own device with «Reach tailnet hosts from browsers» OFF (${l}): «${rowOff[l]}» — the row by its own label, no jargon, never «online»; the error's own text under it (screenshotted)`, gateOf(r.text.startsWith(rowOff[l])) && gateOf(r.text.includes('ENOTFOUND')) && !/road|的路|経路|online|在线|オンライン/.test(r.text.split('\n')[0]) && size > 1000, r);
  }
  lang = 'en';
  reach = { ...UP, mode: 'userspace' };
  const r2 = await br.open(`http://127.0.0.1:${EMB}/proxy/https://ghost.${SUF}/`);
  await br.shot(path.join(SHOTS, 'embedded-not-a-device-en.png'));
  ok('the in-page browser, a name no device holds (the ordinary road failed first): «ghost.… is not a device on your tailnet (known: peer-alpha, peer-beta, hub)» — the list on the owner\'s own page', verdictOf(r2.text.startsWith(`ghost.${SUF} is not a device on your tailnet (known: peer-alpha, peer-beta, hub)`)), r2);
  if (TLS_PORT) {
    reach = { ...UP, mode: 'kernel' };
    const r3 = await br.open(`http://127.0.0.1:${EMB}/proxy/https://peer-alpha:${TLS_PORT}/`);
    await br.shot(path.join(SHOTS, 'embedded-untrusted-cert-en.png'));
    ok('N5 + r3 N6 — the user\'s own shape (a self-signed certificate): «peer-alpha answered through Tailscale, but with a certificate the in-page browser does not trust (self-signed?) — it cannot open it from here: give the device a trusted certificate (tailscale cert)»; the detail line the code + plain words (no Node hint, no backticks) — never «is that device online?»',
      gateOf(r3.text.startsWith('peer-alpha answered through Tailscale, but with a certificate the in-page browser does not trust (self-signed?) — it cannot open it from here: give the device a trusted certificate (tailscale cert)')) && gateOf(/DEPTH_ZERO_SELF_SIGNED_CERT — self-signed certificate/.test(r3.text)) && !/use-system-ca|Node\.js|`|online\?/.test(r3.text), r3);
  }
  {
    // ④ CONTROL (open()'s tie to its own navigation): a page whose words come 1.5 s after its first bytes, opened with a STALE
    // load event planted in the emptied list (the race of the release mirror, made). The OLD rule (any load event, one read)
    // ends on the plant and never reads the words; open() over the same plant reads them; a page whose body stays empty is
    // red BY NAME with its bound.
    const late = await listen(http.createServer((q, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.write('<!doctype html><title>late</title><body>'); if (q.url.startsWith('/empty')) return res.end('</body>'); setTimeout(() => res.end('LATE-OK</body>'), 1500); }));
    const old = await br.open(`http://127.0.0.1:${late}/old`, { plantStale: true, anyLoad: true });
    ok('CONTROL (the plant is real): the OLD wait, over a planted stale load event, reads before the page said its words', old.text !== 'LATE-OK', old);
    const tied = await br.open(`http://127.0.0.1:${late}/tied`, { plantStale: true });
    ok('…open(), tied to its own navigation, reads the page\'s words over the same plant', tied.text === 'LATE-OK' && !tied.said, tied);
    const mute = await br.open(`http://127.0.0.1:${late}/empty`, { boundMs: 2000 });
    ok('…and a page whose body stays empty is red BY NAME with its bound', mute.text === '' && mute.said === `the page of http://127.0.0.1:${late}/empty said nothing within 2 s (its document loaded with an empty body)`, mute);
  }
  await br.close(); await door.close();
  if (process.env.VS_SHOT_DIR) console.log(`  (screenshots kept in ${SHOTS})`);
}

console.log('⑤ nothing left loopback');
{
  await finalSample("after the browsers' last act");   // B-8695 / r4704: never skipped, and its listing must READ
  SAMPLER.stop(); LOOP.disable();   // r4685: the figures below are exactly «while it ran»; ⑥ runs on a quiet loop
  const st = SAMPLER.stats(), srt = st.ms.slice().sort((x, y) => x - y), q = (f) => srt.length ? srt[Math.min(srt.length - 1, Math.floor(f * srt.length))] : 0;
  console.log(`  · the sampler (B-8695): ${st.n} samples, ${st.skipped} skipped while one ran; per sample median ${q(0.5)} ms, p95 ${q(0.95)} ms, the longest five ${srt.slice(-5).reverse().join(' / ')} ms; ${st.read} listings read, ${st.failed} failed (each counted); the largest tree it walked ${st.maxTree} processes (${st.maxKids} beyond the roots); the loop's longest turn while it ran ${Math.round(LOOP.max / 1e6)} ms`);
  ok(`the sampler walked the browsers' own trees, children included (at most ${st.maxKids} processes beyond the roots in one sample), and took its last sample after their last act — that last listing READ (r4685: a failed listing is never «none seen»)`, st.n > 0 && st.maxKids > 0 && st.read > 0 && st.finalRead === true, { n: st.n, maxTree: st.maxTree, maxKids: st.maxKids, roots: roots.size, read: st.read, failed: st.failed, finalRead: st.finalRead });
  ok(`no Chrome of this suite held a non-loopback socket (${roots.size} process trees sampled at 4 Hz; every Chrome without background networking)`, outside.length === 0, [...new Set(outside)].slice(0, 20));
}

console.log('⑥ CONTROL: the sampler with its sample HELD (a stand-in `ss` that sleeps a set time: placed, never load) — the release\'s against this one');
{
  // THE RELEASE's SAMPLER, verbatim but for the program's path (kept for this control only): a sync walk of EVERY process, a sync `ss`
  const releaseSample = (rs, into, ssBin) => {
    if (!rs.size) return;
    const kidsOf = new Map(), all = new Set();
    for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const pp = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); if (!kidsOf.has(pp)) kidsOf.set(pp, []); kidsOf.get(pp).push(Number(d)); } catch { } }
    const walk = (pid) => { if (all.has(pid)) return; all.add(pid); for (const k of kidsOf.get(pid) || []) walk(k); };
    for (const r of rs) walk(r);
    let out = ''; try { out = execFileSync(ssBin, ['-tunpH'], { encoding: 'utf8', timeout: 2000 }); } catch { return; }
    parseSs(out, all, into);
  };
  const HOLD_MS = 600, dir = path.join(ROOT, 'ss-held'); fs.mkdirSync(dir, { recursive: true });
  const standIn = path.join(dir, 'ss'); fs.writeFileSync(standIn, `#!/bin/sh\nsleep ${HOLD_MS / 1000}\n`, { mode: 0o700 });
  const held = async (kind) => {
    const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
    const rs = new Set([process.pid]), into = [];
    let stop = () => { };
    if (kind === 'release') { const iv = setInterval(() => releaseSample(rs, into, standIn), 250); stop = () => clearInterval(iv); }
    else { const sm = makeSampler({ roots: rs, outside: into, ssBin: standIn }); stop = sm.stop; }
    await sleep(2500); stop(); await sleep(HOLD_MS + 200); h.disable();
    return Math.round(h.max / 1e6);
  };
  const baseline = await (async () => { const h = monitorEventLoopDelay({ resolution: 10 }); h.enable(); await sleep(2500 + HOLD_MS + 200); h.disable(); return Math.round(h.max / 1e6); })();   // r4685: the loop with NO sampler, the same window
  const relMax = await held('release'), curMax = await held('cured');
  console.log(`  · the loop's longest turn over the same window: with no sampler ${baseline} ms · the release's held sampler ${relMax} ms · this sampler held ${curMax} ms`);
  ok(`RED CONTROL: the release's sampler with its sample held ${HOLD_MS} ms makes the suite's loop turns that long (its longest ${relMax} ms)`, relMax >= HOLD_MS * 0.8, { relMax });
  ok(`…and this sampler with the SAME hold leaves the loop's turns short (its longest ${curMax} ms): its work is a child's and async reads, never the loop's`, curMax < relMax / 3, { curMax, relMax, baseline });
  // r4685 M2: THE POSITIVE CONTROL — a child of the suite's own holds a CONNECTED UDP socket to a documentation address (TEST-NET-1,
  // 192.0.2.1: a datagram socket's connect sends no packet). The sampler whose roots hold that child must SEE it outside the loopback;
  // one whose roots do not must not (red when the walk or the parse misses it)
  const kid = spawn(process.execPath, ['-e', "const d = require('dgram').createSocket('udp4'); d.connect(9, '192.0.2.1', (e) => { process.stdout.write(e ? 'no route\\n' : 'held\\n'); }); setTimeout(() => process.exit(0), 20000);"], { stdio: ['ignore', 'pipe', 'ignore'] });
  const other = spawn('sleep', ['20'], { stdio: 'ignore' });
  kids.add(kid); kids.add(other);   // the suite's own cleanup ends them on any road out
  const said = await new Promise((r) => { let b = ''; kid.stdout.on('data', (d) => { b += d; if (/held|no route/.test(b)) r(b.trim()); }); setTimeout(() => r(b.trim() || 'silent'), 5000); });
  const seen = [], unseen = [];
  const withKid = makeSampler({ roots: new Set([kid.pid]), outside: seen }), withoutKid = makeSampler({ roots: new Set([other.pid]), outside: unseen });
  withKid.stop(); withoutKid.stop();
  const readWith = await finalSample('of the positive control (its roots hold the child)', withKid), readWithout = await finalSample('of the negative control (its roots do not hold the child)', withoutKid);
  try { process.kill(kid.pid, 'SIGKILL'); } catch { } try { process.kill(other.pid, 'SIGKILL'); } catch { }
  ok(`POSITIVE CONTROL: a child of the suite holding a socket connected to 192.0.2.1 (a documentation address; no packet sent) is SEEN outside the loopback by the sampler whose roots hold it (${said})`, said === 'held' && readWith === true && verdictOf(seen.some((x) => x.includes('192.0.2.1'))), { said, readWith, seen: seen.slice(0, 3) });
  ok('…and NOT by a sampler whose roots do not hold that child (the walk decides what is the suite\'s)', readWithout === true && !unseen.some((x) => x.includes('192.0.2.1')), { readWithout, unseen: unseen.slice(0, 3) });
  // r4704 RED: a final sample whose listing FAILS (a stand-in `ss` that exits 1: placed, never load) is a failing line by the same verdict
  const failSs = path.join(dir, 'ss-fails'); fs.writeFileSync(failSs, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  const failing = makeSampler({ roots: new Set([process.pid]), outside: [], ssBin: failSs }); failing.stop();
  const failRead = await finalSample('placed to fail', failing, { judge: false }), fv = finalVerdict(failRead, 'placed to fail');
  ok(`RED CONTROL: a final sample whose socket listing FAILED (a stand-in ss that exits 1) is a failing line by the same verdict — «${fv.name}» reads ${fv.pass ? 'green' : 'red'}`, fv.pass === false && failing.stats().failed >= 1, { failRead, failed: failing.stats().failed });
  // r4704: ONE door — the file's own text takes a final sample only inside finalSample, and only the placed control skips its judgement
  const ownText = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'), finalsTaken = ownText.split('.fin' + 'al()').length - 1, unjudged = ownText.split('judge: ' + 'false').length - 1;
  ok(`every final sample goes through finalSample: the file's one call that takes a final sample is the door's (${finalsTaken}), and the judgement is turned off once, in the placed red (${unjudged})`, finalsTaken === 1 && unjudged === 1, { finalsTaken, unjudged });
}
done(); import { verdictOf, gateOf } from './lib/check.mjs';

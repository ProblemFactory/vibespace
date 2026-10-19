#!/usr/bin/env node
// test-apps-ops-door — THE OPERATOR'S REFRESH (lane app-persist-layer1; docs/design-app-persistence.zh.md §3.2 "安全更新的
// 归属", owner D5): `vibespace-app refresh [--all]` with NO session — the fleet's `runuser -u <user> -- … refresh --all` —
// over this account's unix socket (src/server/apps-ops-door.js), into THE SAME engine.run as the user's Refresh press.
// In process: the REAL engine (src/server/apps-engine.js) over the apps stub (scripts/fixtures/apps-stub.cjs — nothing runs
// apt), the REAL CLI (data/bin/vibespace-app) spawned as node with a scratch HOME. Sections:
//   §1 PURE — parseRequest's refusals by name (the closed op set), planView's words
//   §2 THE DOOR: the socket opens only when asked (the wiring asks after listen), 0600 in a 0700 directory of this account;
//      `refresh` = the plan (its updates, its layer, the host apps it leaves alone), `refresh --all` = the slot's run
//      (`app:refresh:refresh`, the plan's digest, the log streamed, the record), a busy slot = exit 75, inside a
//      conversation = refused before any connection, no VibeSpace = exit 3 naming the path; raw: an install op, an
//      oversize line, garbage, silence — each refused by name, nothing ran
//   §3 THE PATH'S OTHER OCCUPANTS: a stale socket (a server SIGKILLed) is replaced; a LIVE socket of another server, a
//      plain file, a directory link — left alone, the door off by name; close() removes only its own socket; a HOME so
//      long the socket path passes the platform's bound (src/sock-path.js) — off by name, nothing made
//   §4 THE WIRING: install() opens nothing; afterListen() opens the door beside the replay (never on the boot path)
//   §5 CONTROLS — patched copies (the CLI without its conversation refusal, the door without its 0600) caught above
// Run: node scripts/test-apps-ops-door.mjs
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(repo, 'src/server/apps-ops-door.js'));
const E = require(path.join(repo, 'src/server/apps-engine.js'));
const STUB = require(path.join(repo, 'scripts/fixtures/apps-stub.cjs'));
const CLI = path.join(repo, 'data/bin/vibespace-app');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 2000) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const leg = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} ran to its end`, e && e.stack); } };
const MUT = mutantCopies('apps-ops-door', repo);

const root = scratch('apps-ops-door');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
const quiet = { log() { }, warn() { }, error() { } };
const homeOf = (tag) => { const h = path.join(root, tag, 'home'); fs.mkdirSync(path.join(h, '.vibespace', 'apps'), { recursive: true }); return h; };
/** the engine over the apps stub; the stub's Refresh plan gains the words a real one carries (updates, layer, skippedHost) */
function world(tag) {
  const d = path.join(root, tag, 'data'); fs.mkdirSync(d, { recursive: true });
  const access = STUB.create({ log: quiet, delayMs: 30 });
  const call0 = access.call;
  access.call = async (h, op, p) => { const r = await call0(h, op, p); if (op === 'app-plan' && p && p.kind === 'refresh' && r.plan) r.plan = { ...r.plan, layer: 'sys', updates: [{ package: 'hello', from: '2.10-2', to: '2.10-3', origin: null }, { package: 'xterm', from: '379-1', to: '379-1+deb12u1', origin: null }], skippedHost: [{ id: 'gimp', label: 'GIMP' }] }; return r; };
  const runs = [];
  const ip0 = access.installPackage;
  access.installPackage = async (h, o) => { runs.push({ what: o.what, kind: o.planOpts && o.planOpts.kind, digest: o.expectDigest }); return ip0(h, o); };
  const engine = E.create({ access, dataDir: d, log: quiet });
  return { access, engine, runs };
}
const lines = [];
const seen = { log: (m) => lines.push(String(m)), warn: (m) => lines.push(String(m)), error: () => { } };
function cli(home, args, extraEnv = {}, file = CLI) {
  return new Promise((resolve) => {
    const env = { PATH: process.env.PATH, HOME: home, ...extraEnv };
    const c = spawn(process.execPath, [file, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), 15000);
    c.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
  });
}
/** a raw client: write `text`, collect the answer lines until the door closes */
function raw(sock, text, { wait = 4000 } = {}) {
  return new Promise((resolve) => {
    const c = net.connect(sock);
    let buf = '';
    const t = setTimeout(() => { c.destroy(); resolve({ lines: buf.split('\n').filter(Boolean), timedOut: true }); }, wait);
    c.setEncoding('utf8');
    c.on('connect', () => { if (text != null) c.write(text); });
    c.on('data', (d) => { buf += d; });
    c.on('close', () => { clearTimeout(t); resolve({ lines: buf.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return l; } }) }); });
    c.on('error', (e) => { clearTimeout(t); resolve({ error: e.code || e.message, lines: [] }); });
  });
}
const mode = (p) => fs.lstatSync(p).mode & 0o777;
const CONV_TOKEN = ['vsst', 'conversation'].join('_'); // a conversation's session token (built at runtime: the secret scan reads a TOKEN: '…' literal as a secret)

await leg('§1', async () => {
  console.log('§1 PURE — the closed op set, refusals by name');
  const P = D.parseRequest;
  const codes = ['{', '[]', '{"op":"refresh"}', '{"v":2,"op":"refresh"}', '{"v":1,"op":"install","packages":["gimp"]}', '{"v":1,"op":"remove"}', '{"v":1,"op":"exec","argv":["sh"]}', '{"v":1,"op":"refresh","apply":"yes"}'].map((l) => P(l).code);
  ok(JSON.stringify(codes) === JSON.stringify(['bad-request', 'bad-request', 'bad-version', 'bad-version', 'bad-op', 'bad-op', 'bad-op', 'bad-request']), `refused by name: ${codes.join(' · ')}`, codes);
  ok(P('{"v":1,"op":"refresh"}').ok && P('{"v":1,"op":"refresh"}').apply === false && P('{"v":1,"op":"refresh","apply":true}').apply === true && JSON.stringify(D.OPS) === '["refresh"]', 'the ONE op: refresh (apply false = the plan, true = the run)');
  const v = D.planView({ ok: true, canRun: true, layer: 'sys', updates: [{ package: 'hello', from: '1', to: '2', origin: 'x', extra: 'y' }], skippedHost: [{ id: 'gimp', label: 'L' }] });
  ok(v.layer === 'sys' && v.count === 1 && JSON.stringify(v.updates[0]) === '{"package":"hello","from":"1","to":"2"}' && JSON.stringify(v.skippedHost) === '["gimp"]' && D.planView({}).layer === 'host', 'planView: the layer, each update (package / from / to), the host apps left alone — by id, never a label');
});

await leg('§2', async () => {
  console.log('§2 THE DOOR — the operator\'s CLI over the socket, into the user\'s own Refresh run');
  const home = homeOf('door'), w = world('door');
  const door = D.create({ engine: w.engine, access: w.access, home, log: seen, lineMs: 300 });
  const sock = D.socketPath(home);
  ok(!fs.existsSync(sock) && door.state().open === false, 'created: nothing listens yet (the wiring opens it after listen)');
  const st = await door.open();
  ok(st.open === true && fs.lstatSync(sock).isSocket() && mode(sock) === 0o600 && mode(path.dirname(sock)) === 0o700 && fs.lstatSync(path.dirname(sock)).uid === process.getuid() && lines.some((l) => l.startsWith('[apps] operator door: ')), `open: ${path.relative(home, sock)} — the socket 0600 in a 0700 directory of this account (only this account and root connect)`, { st, sock: mode(sock).toString(8), dir: mode(path.dirname(sock)).toString(8) });
  const p = await cli(home, ['refresh']);
  ok(p.code === 0 && /^2 known update\(s\) in the app system:$/m.test(p.stdout) && /^ {2}hello 2\.10-2 → 2\.10-3$/m.test(p.stdout) && /not upgraded by this Refresh .*: gimp$/m.test(p.stdout) && w.runs.length === 0, '`refresh` (no session): the plan — 2 updates in the app system, the host app it leaves alone; nothing ran', p);
  const a = await cli(home, ['refresh', '--all']);
  ok(a.code === 0 && /^\+ apt-get update$/m.test(a.stdout) && /^refreshed the app system: /m.test(a.stdout), '`refresh --all`: the run\'s log streamed, then "refreshed the app system"', a);
  ok(w.runs.length === 1 && w.runs[0].what === 'app:refresh:refresh' && w.runs[0].kind === 'refresh' && /^[0-9a-f]{16,}$/.test(String(w.runs[0].digest)), 'it went through THE package slot as the user\'s Refresh does: what app:refresh:refresh, the plan\'s digest named (the plan run is the plan just taken)', w.runs);
  const stt = await w.access.call('local', 'app-status', {});
  ok(stt.status && stt.status.state && stt.status.state.refreshedAt > T0 && lines.some((l) => /^\[apps\] operator door: refresh — 2 known update\(s\) in the app system, through the package slot$/.test(l)) && lines.some((l) => /^\[apps\] operator door: refresh done — ok/.test(l)), 'recorded (last refreshed now) and journaled — who asked: the operator door', { state: stt.status && stt.status.state, lines });
  const j = await cli(home, ['refresh', '--all', '--json']);
  let jj = null; try { jj = JSON.parse(j.stdout); } catch { /* not json */ }
  ok(j.code === 0 && jj && jj.ok === true && jj.done === true && jj.layer === 'sys', '--json: the final answer as JSON (the fleet script reads it)', j);
  w.access.installBusy = () => ({ pid: 4242, since: Date.now() - 5000 });
  const b = await cli(home, ['refresh', '--all']);
  w.access.installBusy = () => null;
  ok(b.code === 75 && /the package slot is running another install .*\[busy\]/.test(b.stderr) && w.runs.length === 2, 'a busy slot: exit 75 (EX_TEMPFAIL — the script retries), nothing started', { b, runs: w.runs.length });
  const n0 = w.runs.length, l0 = lines.length;
  const conv = await cli(home, ['refresh', '--all'], { VIBESPACE_API: 'http://127.0.0.1:9', VIBESPACE_SESSION_TOKEN: CONV_TOKEN });
  ok(conv.code === 2 && /the machine OPERATOR's verb .* not a conversation's/.test(conv.stderr) && w.runs.length === n0 && lines.length === l0, 'inside a conversation (a session token): refused before any connection — the rule says the user\'s Refresh', conv);
  const nod = await cli(path.join(root, 'nobody-home'), ['refresh']);
  ok(nod.code === 3 && nod.stderr.includes(path.join(root, 'nobody-home', '.vibespace', 'apps', 'operator', 'ops.sock')), 'no VibeSpace for this account: exit 3, the path named', nod);
  const bad = await cli(home, ['refresh', '--everything']);
  ok(bad.code === 2 && /usage: vibespace-app refresh \[--all\] \[--json\]/.test(bad.stderr), 'an unknown flag: usage, exit 2', bad);
  const r1 = await raw(sock, '{"v":1,"op":"install","packages":["gimp"]}\n');
  const r2 = await raw(sock, 'x'.repeat(5000));
  const r3 = await raw(sock, 'not json\n');
  const r4 = await raw(sock, null, { wait: 3000 });
  const code = (r) => (r.lines.find((x) => x && typeof x === 'object' && 'ok' in x) || {}).code;
  ok(code(r1) === 'bad-op' && code(r2) === 'too-long' && code(r3) === 'bad-request' && code(r4) === 'timeout' && w.runs.length === n0, `raw: an install op → bad-op · a 5000-byte line → too-long · garbage → bad-request · silence → timeout; nothing ran`, [r1, r2, r3, r4].map(code));
  await door.close();
  ok(!fs.existsSync(sock) && door.state().open === false, 'close(): its own socket removed');
});

await leg('§3', async () => {
  console.log('§3 THE PATH\'S OTHER OCCUPANTS');
  const w = world('occ');
  { // a stale socket: its server was SIGKILLed (no close ⇒ the file stays)
    const home = homeOf('stale'), sock = D.socketPath(home);
    fs.mkdirSync(path.dirname(sock), { recursive: true, mode: 0o700 });
    await new Promise((resolve) => { const c = spawn(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(sock)}, () => process.kill(process.pid, 'SIGKILL'))`]); c.on('close', resolve); });
    const was = fs.existsSync(sock) && fs.lstatSync(sock).isSocket();
    const door = D.create({ engine: w.engine, access: w.access, home, log: quiet });
    const st = await door.open();
    const r = await raw(sock, '{"v":1,"op":"refresh"}\n');
    ok(was && st.open === true && r.lines.some((x) => x && x.ok === true && x.plan), 'a stale socket (its server SIGKILLed) is replaced — the door answers', { was, st, r });
    await door.close();
  }
  { // a LIVE socket of another server
    const home = homeOf('live'), sock = D.socketPath(home);
    fs.mkdirSync(path.dirname(sock), { recursive: true, mode: 0o700 });
    let hits = 0;
    const other = net.createServer((c) => { hits++; c.on('error', () => { }); c.resume(); c.end('other\n'); }); // the door's probe hangs up at once; a paused socket never sees its EOF (close would wait forever)
    await new Promise((r) => other.listen(sock, r));
    const l0 = lines.length;
    const door = D.create({ engine: w.engine, access: w.access, home, log: seen });
    const st = await door.open();
    const r = await raw(sock, '{"v":1,"op":"refresh"}\n');
    ok(st.open === false && st.why === 'in-use' && r.lines[0] === 'other' && lines.slice(l0).some((l) => /operator door: off — another VibeSpace answers on /.test(l)), 'a LIVE door of another server: left alone (it still answers), this door off by name', { st, r, said: lines.slice(l0) });
    await door.close();
    ok(fs.existsSync(sock), 'close() of the door that never opened leaves the other server\'s socket');
    await new Promise((r) => other.close(r));
  }
  { // a HOME so long the socket path passes the platform's bound
    const deep = path.join(root, 'deep', 'h'.repeat(80)); fs.mkdirSync(path.join(deep, '.vibespace', 'apps'), { recursive: true });
    const st = await D.create({ engine: w.engine, access: w.access, home: deep, log: quiet }).open();
    ok(st.open === false && st.why === 'path-too-long' && !fs.existsSync(path.dirname(D.socketPath(deep))), 'a HOME so long its socket path passes the platform\'s bound: off by name (path-too-long), nothing made — never a truncated path', st);
  }
  { // a plain file, a directory link
    const home = homeOf('file'), sock = D.socketPath(home);
    fs.mkdirSync(path.dirname(sock), { recursive: true, mode: 0o700 });
    fs.writeFileSync(sock, 'mine\n');
    const st = await D.create({ engine: w.engine, access: w.access, home, log: quiet }).open();
    const home2 = homeOf('dirlink'), elsewhere = path.join(root, 'dirlink', 'elsewhere');
    fs.mkdirSync(elsewhere, { recursive: true });
    fs.symlinkSync(elsewhere, path.join(home2, '.vibespace', 'apps', 'operator'));
    const st2 = await D.create({ engine: w.engine, access: w.access, home: home2, log: quiet }).open();
    ok(st.open === false && st.why === 'not-a-socket' && fs.readFileSync(sock, 'utf8') === 'mine\n' && st2.open === false && st2.why === 'door-dir' && fs.readdirSync(elsewhere).length === 0, 'a plain file at the path: untouched (not-a-socket); the directory a link elsewhere: nothing made there (door-dir)', { st, st2 });
  }
});

await leg('§4', async () => {
  console.log('§4 THE WIRING — the door opens after listen, beside the replay');
  const W = require(path.join(repo, 'src/server/apps-wiring.js'));
  const home = homeOf('wiring'), sock = D.socketPath(home);
  const prev = process.env.HOME;
  process.env.HOME = home;
  let a;
  try { a = W.install({ app: { use() { } }, access: STUB.create({ log: quiet, delayMs: 5 }), dataDir: path.join(root, 'wiring'), log: quiet, throwawayRoot: false, env: {} }); } finally { process.env.HOME = prev; }
  ok(a.door && a.door.path === sock && !fs.existsSync(sock), 'install() (server.js runs it BEFORE listen): the door exists, nothing listens');
  await a.afterListen();
  await sleep(50);
  ok(a.door.state().open === true && fs.lstatSync(sock).isSocket(), 'afterListen(): the operator door is open (server.js calls it 2.5 s after listen)');
  await a.door.close();
  const srv = fs.readFileSync(path.join(repo, 'server.js'), 'utf8');
  ok(/setTimeout\(\(\) => appsWiring\.afterListen\(\), 2500\)/.test(srv) && !/apps-ops-door/.test(srv), 'server.js unchanged: the door rides the apps wiring\'s afterListen (no second boot-path line)');
});

await leg('§5', async () => {
  console.log('§5 CONTROLS');
  const home = homeOf('ctl'), w = world('ctl');
  const door = D.create({ engine: w.engine, access: w.access, home, log: quiet });
  await door.open();
  const cliSrc = fs.readFileSync(CLI, 'utf8');
  const noRule = cliSrc.replace("  if (TOKEN) { console.error('vibespace-app refresh: the machine OPERATOR", "  if (false) { console.error('vibespace-app refresh: the machine OPERATOR");
  const cliCopy = path.join(MUT.dir, 'vibespace-app-no-rule'); fs.writeFileSync(cliCopy, noRule);
  const n0 = w.runs.length;
  const c = await cli(home, ['refresh', '--all'], { VIBESPACE_API: 'http://127.0.0.1:9', VIBESPACE_SESSION_TOKEN: CONV_TOKEN }, cliCopy);
  ok(noRule !== cliSrc && c.code === 0 && w.runs.length === n0 + 1, 'CONTROL: a CLI without the conversation rule reaches the door from a conversation and runs — §2\'s refusal is that line', { code: c.code, runs: w.runs.length - n0 });
  await door.close();
  const doorSrc = fs.readFileSync(path.join(repo, 'src/server/apps-ops-door.js'), 'utf8');
  const looseSrc = doorSrc.replace('await fsp.chmod(sock, 0o600);', 'await fsp.chmod(sock, 0o666);').replace('await fsp.chmod(dir, 0o700);', 'await fsp.chmod(dir, 0o755);');
  if (looseSrc === doorSrc) throw new Error('the chmod lines moved — the control edits nothing');
  const LD = MUT.load('src/server/apps-ops-door.js', looseSrc, 'loose');
  const home2 = homeOf('ctl-loose');
  const d2 = LD.create({ engine: w.engine, access: w.access, home: home2, log: quiet });
  await d2.open();
  const s2 = LD.socketPath(home2);
  ok(mode(s2) !== 0o600 && mode(path.dirname(s2)) !== 0o700, 'CONTROL: a door copy without its chmods leaves a socket other accounts can reach — §2\'s 0600 / 0700 check reads exactly that', { sock: mode(s2).toString(8), dir: mode(path.dirname(s2)).toString(8) });
  await d2.close();
});

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);

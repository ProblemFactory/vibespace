#!/usr/bin/env node
// B-2ca0 (commit 1) — AN ALIAS OF THE HUB'S SSH CONFIG KEEPS ITS OWN PORT AND USER. Typing an alias of the hub user's ~/.ssh/config
// in the pairing address field worked only by accident: the hub passes no -F, so ssh resolved the alias — but the argv always said
// `-p <port>` (the form holds 22) and `<user>@`, which OVERRIDE the config: an entry on port 2222 was dialled on 22, its User
// replaced. Now the add route asks `ssh -G <address>` (it dials nothing) and a record that is an alias is `viaConfig`; its argv
// omits `-p` while the port was left EMPTY (a typed one, 22 too, is the person's) and `user@` while no user was given. Pinned here:
//   ① parseSshG (ssh -G's «key value» lines → alias / hostname / user / port; the first key wins; no hostname → null);
//   ② the REAL HostManager: an alias record's argv (sshArgs, sshCmd, dest) — no -p at 22, the person's port kept, no user@ when
//      none was given; a plain address unchanged; no user and no alias still refused;
//   ③ resolveAlias over a stand-in ssh on PATH (an alias, a plain name, a name that is an option — never asked);
//   ④ the add route asks resolveAlias and never takes `viaConfig` from the body;
//   RED CONTROL: hosts.js compiled with the release's argv — the alias record is dialled on -p 22 (its config's 2222 overridden).
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { ok, report } = checker();
const SCR = scratch('ssh-alias'); fs.mkdirSync(SCR, { recursive: true });
const HM = require(path.join(REPO, 'src/hosts.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══ ① parseSshG ═══
console.log('① ssh -G\'s lines read');
{
  const a = HM.parseSshG('user me\nhostname 203.0.113.10\nport 2222\nhostname 198.51.100.1\n', 'my-vm');
  const p = HM.parseSshG('user me\nhostname build.example\nport 22\n', 'build.example');
  const dflt = HM.parseSshG('hostname gpu\nidentityfile ~/.ssh/id_rsa\nidentityfile ~/.ssh/id_ed25519\n', 'g'), named = HM.parseSshG('hostname gpu\nidentityfile ~/.ssh/work_key\n', 'g');
  ok(dflt.identityFile === null && named.identityFile === '~/.ssh/work_key', '① its read 3: ssh\'s DEFAULT key list (the entry names none) is no identity file; a key the entry NAMES is kept', { dflt, named });
  ok(same(a, { alias: true, hostname: '203.0.113.10', user: 'me', port: 2222, identityFile: null, proxied: false }) && p.alias === false && HM.parseSshG('user me\n', 'x') === null && HM.parseSshG('Hostname Box\nconstructor y\n', 'box').alias === false,
    '① an alias resolves to another hostname (the first «hostname» line wins), a plain address resolves to itself, no hostname is no answer; keys are case-blind', { a, p });
}

// ═══ ② the REAL HostManager's argv ═══
console.log('② a configured record\'s argv');
const world = (n) => { const dataDir = path.join(SCR, 'w' + n); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, 'hosts.json'), JSON.stringify({ hosts: [] })); return new HM.HostManager({ dataDir }); };
{
  const hm = world(1);
  const [A, A22, B, C, D] = [
    { name: 'vm', user: 'me', host: 'my-vm', port: '', viaConfig: true },          // the port left to the config
    { name: 'vm22', user: 'me', host: 'my-vm22', port: '22', viaConfig: true },    // its read 2: a TYPED 22 wins over the config
    { name: 'vm2', user: '', host: 'my-vm2', port: '', viaConfig: true },          // the user left to the config
    { name: 'vm3', user: 'me', host: 'my-vm3', port: '2200', viaConfig: true },    // a typed port
    { name: 'plain', user: 'me', host: 'build.example', port: '22' },               // a plain address
  ].map((r) => hm.get(hm.add(r)));
  const argv = (h) => hm.sshArgs(h), hasP = (x) => x.includes('-p');
  ok(A.viaConfig === true && A.port === null && !hasP(argv(A)) && argv(A).at(-1) === 'me@my-vm' && !/ -p /.test(hm.sshCmd(A)),
    '② a CONFIGURED name whose port was left empty: no `-p` (the config\'s Port holds), the person\'s user kept — sshArgs and sshCmd alike', { argv: argv(A), cmd: hm.sshCmd(A) });
  ok(argv(A22).join(' ').includes('-p 22'), '② its read 2: a TYPED 22 on a configured name is the person\'s (a hub-wide `Host *` Port never overrules it)', argv(A22));
  ok(argv(B).at(-1) === 'my-vm2' && hm.dest(B) === 'my-vm2' && !hasP(argv(B)), '② no user given: the destination is the name alone (the config\'s User holds)', argv(B));
  ok(argv(C).join(' ').includes('-p 2200'), '② a typed port is said', argv(C));
  ok(!D.viaConfig && D.port === 22 && argv(D).join(' ').includes('-p 22') && argv(D).at(-1) === 'me@build.example', '② a plain address: unchanged (`-p 22`, user@host)', argv(D));
  let refused = ''; try { hm.add({ name: 'nouser', user: '', host: 'x.example', port: '22' }); } catch (e) { refused = e.message; }
  ok(refused === 'user required', '② no user and no config entry is still refused', refused);
  const dashOf = (r) => { try { hm.add(r); return ''; } catch (e) { return e.message; } };
  ok(/may not start with/.test(dashOf({ name: 'd1', user: '-oProxyCommand=/bin/false', host: 'x.example', port: '22' })) && /may not start with/.test(dashOf({ name: 'd2', user: 'me', host: '-oProxyCommand=/bin/false', port: '22' })),
    '② a user OR an address that starts with «-» is refused (never an ssh option)');
}

// ═══ ②b the add route's verdict (pure — the route asks it) ═══
console.log('②b the route\'s verdict');
{
  const V = HM.configVerdict, home = '/home/hub';
  const cfg = (o) => ({ alias: false, configured: true, userIsDefault: true, hostname: 'h', user: 'hubuser', port: 22, identityFile: null, ...o });
  const rows = [
    ['a plain name, a blank user', V(null, { user: '', port: '' }, home), { refuse: 'user required' }],
    ['a configured name whose entry names NO user, a blank user (ssh would dial as the hub\'s own)', V(cfg({}), { user: '  ', port: '' }, home), { refuse: 'user required' }],
    ['a configured name whose entry names a user, a blank user', V(cfg({ userIsDefault: false, user: 'ubuntu', port: 2222, identityFile: '~/.ssh/id_x' }), { user: ' ', port: '' }, home),
      { viaConfig: true, user: '', port: null, sshConfig: { host: 'h', user: 'ubuntu', port: 2222, identityFile: '/home/hub/.ssh/id_x' } }],
    ['a configured name, a typed 22', V(cfg({ alias: true, port: 2222 }), { user: 'me', port: '22' }, home), { viaConfig: true, user: 'me', port: 22, sshConfig: { host: 'h', user: 'hubuser', port: 2222, identityFile: null } }],
    ['a plain name, an empty port', V({ alias: false, configured: false, userIsDefault: true, hostname: 'x', user: 'hubuser', port: 22 }, { user: 'me', port: '' }, home), { viaConfig: false, user: 'me', port: 22 }],
    ['B-2ca0 follow-up: a typed port that is no port («abc», 70000) is refused by code — never 22 in silence', [V(null, { user: 'me', port: 'abc' }, home), V(null, { user: 'me', port: '70000' }, home)],
      [{ refuse: 'the port is a whole number from 1 to 65535', code: 'port-form' }, { refuse: 'the port is a whole number from 1 to 65535', code: 'port-form' }]],
  ];
  const bad = rows.filter(([, got, want]) => !same(got, want));
  ok(bad.length === 0, `②b the route's verdict — ${rows.map((r) => r[0]).join(' · ')}`, bad.map(([n, got]) => [n, got]));
}

// ═══ ③ resolveAlias over a stand-in ssh ═══
console.log('③ resolveAlias asks ssh -G');
{
  const bin = path.join(SCR, 'bin'); fs.mkdirSync(bin, { recursive: true });
  const asked = path.join(SCR, 'asked.txt');
  fs.writeFileSync(path.join(bin, 'ssh'), `#!/bin/sh\necho "$*" >> '${asked}'\n[ "$1" = "-G" ] || exit 9\ncase "$2" in my-vm) printf 'user me\\nhostname 203.0.113.10\\nport 2222\\nidentityfile ~/.ssh/work_key\\n' ;; gpu01.example.com) printf 'user %s\\nhostname gpu01.example.com\\nport 2222\\n' "$(id -un)" ;; jump.example.com) printf 'user %s\\nhostname jump.example.com\\nport 22\\nproxyjump me@bastion.example.com\\n' "$(id -un)" ;; *) printf 'user %s\\nhostname %s\\nport 22\\n' "$(id -un)" "$2" ;; esac\n`, { mode: 0o755 });
  const PATH0 = process.env.PATH; process.env.PATH = bin + path.delimiter + PATH0;
  try {
    const hm = world(2);
    const a = await hm.resolveAlias('my-vm'), p = await hm.resolveAlias('build.example'), o = await hm.resolveAlias('-oProxyCommand=/bin/false'), sp = await hm.resolveAlias('a b'), g = await hm.resolveAlias('gpu01.example.com');
    const lines = fs.existsSync(asked) ? fs.readFileSync(asked, 'utf8').trim().split('\n') : [];
    ok(!!a && a.alias === true && a.configured === true && a.port === 2222 && a.identityFile === '~/.ssh/work_key' && !!p && p.alias === false && p.configured === false && p.userIsDefault === true && o === null && sp === null && lines.length === 3 && lines.every((l) => l.startsWith('-G ')),
      '③ resolveAlias asks `ssh -G <name>` (it dials nothing): an alias is one, a plain name is not; a name that is an option (no space in it) or holds a space is never asked', { a, p, lines });
    ok(!!g && g.alias === false && g.configured === true && g.userIsDefault === true, '③ its read: an entry with NO HostName but its own Port (`Host gpu01.example.com` + `Port 2222`) is CONFIGURED — its port is the config\'s', g);
    const j = await hm.resolveAlias('jump.example.com');   // asked after `lines` was read
    ok(!!j && j.alias === false && j.proxied === true && j.configured === true && j.userIsDefault === true,
      '③ commit 2: an entry that dials THROUGH another host (its own ProxyJump; no HostName, port 22, the hub\'s user) is CONFIGURED and proxied — the SFTP road reads it', j);
  } finally { process.env.PATH = PATH0; }
}

// ═══ ③b the lookup's own timer ═══
console.log('③b B-2ca0 follow-up: resolveAlias answers by its own timer');
{
  // a copy whose ssh -G child never calls back (a killed child whose stdout a grandchild still holds) — the stall placed IN the window
  let src = read('src/hosts.js');
  const a = 'cp = execFile(', t = "const tm = setTimeout(() => { try { if (cp && cp.stdout) cp.stdout.destroy(); if (cp && cp.stderr) cp.stderr.destroy(); } catch { /* gone */ } resolve(null); }, ms + graceMs);";
  if (src.split(a).length !== 2 || src.split(t).length !== 2) ok(false, '③b the lookup\'s anchors moved in src/hosts.js — update this suite');
  else {
    const file = path.join(REPO, 'src/hosts.js');
    const load = (s) => { const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(s, file); return m.exports; };
    const stalled = anchored(src, a, 'cp = ((..._) => globalThis.__stallChild)(', 'the lookup child');   // a child that never calls back; its pipes count their release
    let released = 0; globalThis.__stallChild = { stdout: { destroy() { released++; } }, stderr: { destroy() { released++; } } };
    const mk = (H, n) => { const dataDir = path.join(SCR, 'tm' + n); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, 'hosts.json'), JSON.stringify({ hosts: [] })); return new H.HostManager({ dataDir }); };
    const marker = (ms) => new Promise((r) => setTimeout(() => r('still waiting'), ms));
    const [own, ctl] = await Promise.all([Promise.race([mk(load(stalled), 1).resolveAlias('my-vm', { ms: 20, graceMs: 30 }), marker(200)]),
      Promise.race([mk(load(anchored(stalled, t, 'const tm = null;', 'the lookup timer')), 2).resolveAlias('my-vm', { ms: 20, graceMs: 30 }), marker(200)])]);
    ok(own === null && released === 2, '③b a lookup whose child never answers is answered by the lookup\'s OWN timer (as «not an alias») — the add route never waits on it — and the timer lets go of the child\'s two pipes', { own, released });
    ok(ctl === 'still waiting', 'CONTROL (RED): the same stall without the timer — the lookup (and the add route awaiting it) never answers', ctl);
  }
}

// ═══ ④ the add route ═══
console.log('④ the add route asks, never takes it from the body');
{
  const R = read('src/server/exit-routes.js');
  const iDel = R.indexOf('delete b.viaConfig;'), iAsk = R.indexOf('const a = await hosts.resolveAlias(b.host).catch(() => null);'), iV = R.indexOf("const v = require('../hosts.js').configVerdict(a, b, require('os').homedir());"), iAdd = R.indexOf('const id = hosts.add({ ...b, replaces: old ? old.id : null });');
  ok(iDel > 0 && iDel < iAsk && iAsk < iV && iV < iAdd && R.includes('delete b.sshConfig;') && R.includes('if (v.refuse) throw Object.assign(new Error(v.refuse), v.code ? { code: v.code } : {});') && R.includes('b.user = v.user; b.port = v.port; if (v.viaConfig) { b.viaConfig = true; b.sshConfig = v.sshConfig; }'),
    '④ POST /api/hosts drops a body\'s viaConfig / sshConfig, THEN asks resolveAlias, takes the pure verdict (②b), THEN adds (in that order)');
}

// ═══ RED CONTROL ═══
console.log('RED CONTROL');
{
  const file = path.join(REPO, 'src/hosts.js');
  let src = read('src/hosts.js');
  const a1 = '...portArgsOf(h),', a2 = 'args.push(destOf(h));';
  if (src.split(a1).length !== 3 || src.split(a2).length !== 2) ok(false, 'CONTROL: the argv anchors moved in src/hosts.js — update this suite');
  else {
    src = src.split(a1).join("'-p', String(h.port || 22),").replace(a2, 'args.push(`${h.user}@${h.host}`);');   // stale-pins: kept — the release's argv, compiled back in as the red control
    const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file);
    const dataDir = path.join(SCR, 'ctl'); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, 'hosts.json'), JSON.stringify({ hosts: [] }));
    const hm = new m.exports.HostManager({ dataDir });
    const h = hm.get(hm.add({ name: 'vm', user: 'me', host: 'my-vm', port: '', viaConfig: true }));   // the port left to the config
    const a = hm.sshArgs(h);
    ok(a.join(' ').includes('-p 22') && a.at(-1) === 'me@my-vm', 'CONTROL (RED): the release\'s argv — the alias is dialled on `-p 22`, overriding its config\'s Port', a);
  }
}

report();

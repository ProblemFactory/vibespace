#!/usr/bin/env node
// B-2ca0 (commit 2) — A PASTED SSH CONFIG BLOCK FILLS THE ADD MACHINE FORM, AND EVERY LINE IT DOES NOT USE IS NAMED. A person pastes the
// Host entry VS Code's Remote-SSH wrote; the PURE src/ssh-config-block.js reads it (a fixed field table: Host, HostName, User, Port,
// IdentityFile, IdentitiesOnly, ONE ProxyJump), the paste step beside the form shows what it understood — each field with its line —
// and every line it does not use with why, and «Fill the form» fills the form; nothing is added before the form's own Add machine.
// A jump host is a record field (`jump`, ssh -J) asked again wherever it reaches ssh; a key file of the hub is its own key source.
//   ① readSshBlock: a VS Code block's fields (case-blind keys, Key=value, quotes); no HostName ⇒ the Host name; comments skipped;
//   ② EVERY LINE ACCOUNTED FOR: over a block of every kind of line, each line is used or NAMED with its why — nothing dropped;
//   ②b its read: a ProxyJump naming another Host of the paste is read as that entry (its key file said); ProxyJump none, a lone
//      IdentitiesOnly, a Host starting with «-» are named; each block knows its last line;
//   ③ the size bound: one character or one line over is refused whole (never cut);
//   ④ jumpVerdict: one host [user@]host[:port] passes; a chain, an option, a shell word, a port out of range are refused;
//   ⑤ formOf / confirmRows: what the form gets (a field the block does not name is absent) and what the confirm step shows;
//   ⑥ the REAL HostManager: a jump record's argv (-J before the destination, sshCmd too); a jump that does not read is refused at
//      the add (nothing saved), refuses the road by name on a hand-edited record and is skipped at an import; a key file of the hub
//      is keySource «file» (VibeSpace's own key stays «app»); ssh -G's ProxyJump / ProxyCommand ⇒ proxied, kept in sshConfig;
//      its read: a key file BatchMode cannot use (a passphrase, not a key) is refused at the add by code (keyFileVerdict over a
//      stand-in ssh-keygen; the route asks it before anything); a jump record's shared connection has its own socket;
//   ⑦ THE PAGE, DRIVEN (src/lib/sidebar-mounts.js bundled by esbuild over a small DOM stand-in): the paste step reads as it is typed
//      — the fields with their lines, every line not used, a pick among several Host entries, the size refusal — and «Fill the form»
//      fills the form's inputs (the jump's fold opened; a field the block does not name keeps what was typed); the form refuses a
//      jump that does not read before anything is sent, sends a good one and a key file's path; «Add it again» keeps both; a
//      machine reached through another host offers no read-write (SFTP) mount; its read: the step is TIED to its form (raised as
//      it is, ended by another form's press and by its form's close; a closed form is never filled), a later fill clears an earlier
//      one's jump / port / key file, nothing is sent at the fill, the other Host blocks are listed, a hub refusal of a key file is
//      worded, the SFTP storage prefill says a machine reached through another host instead of filling it;
//   ⑧ B-2ca0 follow-up (主开发 19:23Z): THE CONFIG IMPORT JUDGES A MACHINE RECORD AS THE ADD DOES — a hostile bundle (a user or a
//      port that would be an ssh option, a control character, no user, a key path that is no path, a lying key source) is skipped by
//      name or derived again; no kept record puts an option-shaped word on ssh's argv; the add's port rule; the parser's line pattern
//      bounded and linear; a target whose HostName line was refused is SAID (no address filled), never the bare Host name;
//   RED CONTROLS (one patched copy each, a flag per cut): the parser dropping an unknown line silently, not resolving a jump of the
//      paste, keeping the bare name of an entry whose address does not read; hosts.js's argv without the hop and its import keeping any
//      jump; the page listing only the machine's own block, sending an unread jump, offering SFTP, filling a closed form, a step
//      outliving its form, the prefill filling a jump machine, a later fill keeping the old key choice, another form's press not
//      ending the open step (run alone: it rewires every later step).
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { ok, report } = checker();
const SCR = scratch('ssh-config-block'); fs.mkdirSync(SCR, { recursive: true });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** rsync's -e splitter, as its manual states it: words split on spaces; '…' and "…" keep a word together; a doubled quote inside the
 *  same quotes is one quote; a backslash is NO escape */
const rsyncSplit = (cmd) => {
  const out = []; let w = null, q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) { if (cmd[i + 1] === q) { w += q; i++; } else q = null; } else w += c; continue; }
    if (c === ' ') { if (w !== null) { out.push(w); w = null; } continue; }
    if (c === "'" || c === '"') { q = c; if (w === null) w = ''; continue; }
    w = (w || '') + c;
  }
  if (w !== null) out.push(w);
  return out;
};
const compileAt = (rel, src) => { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; };
const SB = require(path.join(REPO, 'src/ssh-config-block.js'));
const HM = require(path.join(REPO, 'src/hosts.js'));

const VSCODE = ['# Read more about SSH config files: https://linux.die.net/man/5/ssh_config', 'Host gpu-01', '    HostName 203.0.113.10', '    User ubuntu',
  '    Port 2222', '    IdentityFile ~/.ssh/work_key', '    IdentitiesOnly yes', '    ProxyJump me@bastion.example.com:2200', '    ForwardAgent yes', ''].join('\n');
// every kind of line, by its number (② reads the whys line by line)
const EVERY = ['ForwardAgent yes', 'Include ~/.ssh/extra.conf', 'Host *', '  ServerAliveInterval 30', 'Host gpu-03 gpu-03-alias', '  HostName 198.51.100.7',
  '  HostName 198.51.100.8', '  User -oProxyCommand=touch', '  User me', '  Port 70000', '  IdentityFile ~/.ssh/%h_key', '  IdentityFile ~/.ssh/second',
  '  ProxyJump a.example.com,b.example.com', '  IdentitiesOnly no', '  LocalForward 8080 db.example.com:5432', '  HostName', '  User "unclosed', 'Match host gpu-04',
  '  User other', '# a comment', '', 'Host gpu-05', '  HostName 198.51.100.9'].join('\n');
const EVERY_WHY = [[1, 'before-host'], [2, 'include'], [3, 'pattern'], [4, 'pattern'], [5, 'more-names'], [7, 'repeat'], [8, 'value'], [9, 'repeat'], [10, 'value'],
  [11, 'token'], [12, 'more-keys'], [13, 'chain'], [14, 'identities-no'], [15, 'unknown'], [16, 'syntax'], [17, 'syntax'], [18, 'match'], [19, 'match']];
const named = (r) => [...r.hosts.flatMap((h) => h.notUsed), ...r.outside].map((u) => [u.line, u.why]).sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])));
const accounted = (r, text) => {   // every line that is not blank or a comment: used (a Host line, a field's line) or named
  const used = new Set(r.hosts.flatMap((h) => [h.line, ...Object.values(h.from)])), nm = new Set(named(r).map((x) => x[0]));
  return text.split('\n').map((l, i) => [i + 1, l.trim()]).filter(([, t]) => t && !t.startsWith('#')).filter(([n]) => !used.has(n) && !nm.has(n)).map(([n]) => n);
};

// ═══ ① the field table ═══
console.log('① a VS Code block read');
{
  const r = SB.readSshBlock(VSCODE), h = r.hosts && r.hosts[0];
  ok(r.ok && r.hosts.length === 1 && h.name === 'gpu-01' && h.line === 2 && same(h.fields, { host: '203.0.113.10', user: 'ubuntu', port: 2222, keyFile: '~/.ssh/work_key', identitiesOnly: true, jump: 'me@bastion.example.com:2200' })
    && same(h.from, { host: 2, hostname: 3, user: 4, port: 5, identityfile: 6, identitiesonly: 7, proxyjump: 8 }) && same(h.notUsed, [{ line: 9, text: 'ForwardAgent yes', why: 'unknown' }]) && r.outside.length === 0,
    '① the Host entry VS Code writes: name, address, user, port, key file, IdentitiesOnly and ONE jump host, each with its line; ForwardAgent named (line 9), the comment skipped', r);
  const k = SB.readSshBlock('Host build\n  HOSTNAME=203.0.113.11\n  user = "ci"\n  Port=22\n'), b = k.hosts[0];
  const n = SB.readSshBlock('Host gpu-02.example.com\r\n  Port 2200\r\n'), c = n.hosts[0];
  ok(same(b.fields, { host: '203.0.113.11', user: 'ci', port: 22 }) && same(c.fields, { port: 2200, host: 'gpu-02.example.com' }) && c.from.hostname === undefined,
    '① keys are case-blind; `Key=value`, `Key = "quoted"` read; CRLF read; no HostName ⇒ the address is the Host name (ssh\'s rule)', { b, c });
}

// ═══ ② every line accounted for ═══
console.log('② every line used or named');
{
  const r = SB.readSshBlock(EVERY);
  ok(r.ok && r.hosts.length === 2 && same(named(r), EVERY_WHY) && accounted(r, EVERY).length === 0,
    '② a block of every kind of line: before any Host, Include, a Host pattern and its lines, the Host line\'s other names, a key again, a value that is an option, a port out of range, a %-token, a second key file, a jump chain, IdentitiesOnly no, an unknown key, two lines that are not «key value», a Match block — each NAMED with its why; the rest used', { named: named(r), missing: accounted(r, EVERY) });
  const g3 = r.hosts[0], g5 = r.hosts[1];
  ok(same(g3.fields, { host: '198.51.100.7' }) && g3.notUsed[0].part === 'gpu-03-alias' && same(g5.fields, { host: '198.51.100.9' }) && g5.notUsed.length === 0,
    '② the first value wins (ssh\'s rule) and nothing unread is kept: gpu-03 keeps its FIRST HostName only (no user — its first User is an option), gpu-05 is the second machine', { g3, g5 });
}

// ═══ ②b its read: a jump of the paste, the new names, the ends ═══
console.log('②b a jump that names another Host of the paste; the lines its read found unnamed');
const JUMPS = ['Host bastion', '  HostName 198.51.100.20', '  User jump', '  Port 2200', '  IdentityFile ~/.ssh/bastion_key', 'Host gpu-06', '  HostName 10.20.0.6',
  '  ProxyJump bastion', '  IdentitiesOnly yes', 'Host gpu-07', '  ProxyJump none', 'Host -oProxyCommand=x', '  User me', 'Host gpu-06', '  HostName 10.20.0.66'].join('\n');
const jumpLegs = (M) => {
  const r = M.readSshBlock(JUMPS), g6 = r.hosts[1], g7 = r.hosts[2], o = M.readSshBlock('Host b\n  HostName 198.51.100.21\n  User jump\nHost g\n  ProxyJump ops@b:2222\n').hosts[1];
  const v6 = M.readSshBlock('Host b6\n  HostName 2001:db8::5\nHost g6\n  ProxyJump b6\n').hosts[1], ux = M.readSshBlock('Host bx\n  User a+b\nHost gx\n  ProxyJump bx\n').hosts[1];
  const uz = M.readSshBlock('Host bz\n  HostName %h.corp.example\nHost gz\n  ProxyJump bz\n').hosts[1];
  const rt = ['Host bp\n  HostName 10.0.0.5\n  ProxyCommand aws ssm start-session\nHost gp\n  ProxyJump bp\n', 'Host bc\n  HostName 10.0.0.5\n  ProxyJump x,y\nHost gc\n  ProxyJump bc\n',
    'Host bn\n  HostName 10.0.0.6\n  ProxyJump none\nHost gn\n  ProxyJump bn\n', 'Host bastion bastion.corp\n  HostName 10.0.0.7\nHost g2\n  ProxyJump bastion.corp\n'].map((t) => M.readSshBlock(t).hosts[1]);
  return { r, g6, g7, o, v6, ux, uz, rt };
};
{
  const { r, g6, g7, o, v6, ux, uz, rt } = jumpLegs(SB);
  const [gp, gc, gn, g2] = rt;
  ok(gp.fields.jump === undefined && same(gp.notUsed.map((u) => [u.line, u.why]), [[5, 'chain']]) && gc.fields.jump === undefined && same(gc.notUsed.map((u) => [u.line, u.why]), [[5, 'chain']])
    && gn.fields.jump === '10.0.0.6' && g2.fields.jump === '10.0.0.7' && g2.jumpVia.name === 'bastion' && SB.jumpTargetOk('::1') && SB.jumpTargetOk('gpu_1.example.com') && !SB.jumpTargetOk("evil'host"),
    '②b its fourth read: a bastion that is itself reached THROUGH something (a ProxyCommand, a refused chain) is never dialled directly as the jump — a chain, said; its own ProxyJump none is no route; a jump may name the Host line\'s second name; an address behind a jump may be IPv6 from «:»', { gp: gp.notUsed, gc: gc.notUsed, gn: gn.fields, g2: g2.fields });
  ok(v6.fields.jump === '[2001:db8::5]' && v6.jumpVia.name === 'b6' && ux.fields.jump === undefined && same(ux.notUsed.map((u) => [u.line, u.why]), [[4, 'jump-unread']])
    && uz.fields.jump === undefined && same(uz.notUsed.map((u) => [u.line, u.why]), [[4, 'jump-unread']]) && same(SB.jumpParts('me@[2001:db8::1]:22'), { user: 'me', host: '2001:db8::1', port: '22' }),
    '②b its delta read: the paste\'s bastion at a bare IPv6 address is bracketed; one whose address cannot be ONE jump host (a user «a+b») — or whose own HostName line was refused (a %-token) — clears the jump and SAYS so; never the bare name, which the hub would resolve by its own config', { v6: v6.fields, ux, uz });
  ok(g6.fields.jump === 'jump@198.51.100.20:2200' && same(g6.jumpVia, { name: 'bastion', line: 1 }) && same(g6.notUsed.map((u) => [u.line, u.why]), [[5, 'jump-key'], [9, 'identities-alone']]) && g6.fields.identitiesOnly === undefined
    && o.fields.jump === 'ops@198.51.100.21:2222' && same(SB.confirmRows(g6).find((x) => x.field === 'jump').via, { name: 'bastion', line: 1 }),
    '②b `ProxyJump bastion` naming the paste\'s own `Host bastion` is read as ITS address, user and port (the hub would resolve the bare name by its own config / DNS); a user or port in the jump wins; the bastion\'s key file is said (the jump uses this server\'s keys); IdentitiesOnly with no IdentityFile is said, not shown as used', { g6, o });
  ok(same(g7.notUsed.map((u) => [u.line, u.why]), [[11, 'jump-none']]) && same(r.outside.map((u) => [u.line, u.why]), [[12, 'bad-host'], [13, 'bad-host']]) && same(r.hosts.map((h) => [h.name, h.line, h.end]), [['bastion', 1, 5], ['gpu-06', 6, 9], ['gpu-07', 10, 11], ['gpu-06', 14, 15]]),
    '②b ProxyJump none is said (no jump host); a Host whose name starts with «-» is no machine (it and its lines named); each block knows its last line; two entries may share a name', { g7: g7.notUsed, outside: r.outside, ends: r.hosts.map((h) => [h.name, h.line, h.end]) });
}

// ═══ ③ the size bound ═══
console.log('③ the size bound');
{
  const big = SB.readSshBlock('x'.repeat(SB.MAX_CHARS + 1)), lines = SB.readSshBlock('\n'.repeat(SB.MAX_LINES)), edge = SB.readSshBlock('Host a\n' + '#'.repeat(SB.MAX_CHARS - 7));
  ok(big.ok === false && big.code === 'too-big' && big.maxChars === SB.MAX_CHARS && lines.ok === false && lines.code === 'too-big' && edge.ok === true && edge.hosts.length === 1,
    `③ ${SB.MAX_CHARS} characters and ${SB.MAX_LINES} lines at most — one over is refused whole (never cut); exactly the bound reads`, { big, lines: lines.code, edge: edge.ok });
}

// ═══ ④ the jump verdict ═══
console.log('④ ONE jump host');
{
  const pass = ['bastion', 'me@bastion.example.com', 'me@bastion.example.com:2200', 'me@[2001:db8::1]:22'].map((x) => SB.jumpVerdict(x));
  const none = ['', 'none', null, undefined].map((x) => SB.jumpVerdict(x));
  const refused = { chain: 'a.example.com,b.example.com', option: '-oProxyCommand=touch', semi: 'me@host;touch', sub: '$(id)', zero: 'host:0', big: 'host:70000', space: 'me@host x', uri: 'ssh://me@host' };
  const got = Object.fromEntries(Object.entries(refused).map(([k, v]) => [k, SB.jumpVerdict(v)]));
  ok(pass.every((v, i) => v.ok && v.jump === ['bastion', 'me@bastion.example.com', 'me@bastion.example.com:2200', 'me@[2001:db8::1]:22'][i]) && none.every((v) => v.ok && v.jump === null)
    && got.chain.code === 'chain' && Object.entries(got).filter(([k]) => k !== 'chain').every(([, v]) => v.ok === false && v.code === 'form'),
    '④ [user@]host[:port] in plain host characters passes (an IPv6 in brackets too); empty / none is no jump; a chain is refused as a chain; an option, a shell word, port 0 or 70000, a space, a URI are refused', got);
}

// ═══ ⑤ the form's values and the confirm rows ═══
console.log('⑤ formOf and confirmRows');
{
  const h = SB.readSshBlock(VSCODE).hosts[0], c = SB.readSshBlock('Host gpu-02.example.com\n  Port 2200\n').hosts[0];
  ok(same(SB.formOf(h), { name: 'gpu-01', host: '203.0.113.10', user: 'ubuntu', port: '2222', jump: 'me@bastion.example.com:2200', keyFile: '~/.ssh/work_key', keyChoice: 'file' })
    && same(SB.formOf(c), { name: 'gpu-02.example.com', host: 'gpu-02.example.com', port: '2200', jump: '', keyFile: '' }),
    '⑤ formOf: the block\'s fields as the form\'s values (an IdentityFile ⇒ the key-file choice); its port, jump and key file always (empty when the block has none — an earlier fill\'s are not left behind); a User the block does not name is ABSENT, so the form keeps what was typed', [SB.formOf(h), SB.formOf(c)]);
  const rows = SB.confirmRows(c), user = rows.find((r) => r.field === 'user'), host = rows.find((r) => r.field === 'host');
  ok(same(SB.confirmRows(h).map((r) => [r.field, r.from, r.line]), [['name', 'Host', 2], ['host', 'HostName', 3], ['user', 'User', 4], ['port', 'Port', 5], ['keyFile', 'IdentityFile', 6], ['identitiesOnly', 'IdentitiesOnly', 7], ['jump', 'ProxyJump', 8]])
    && user.value === null && user.line === null && host.from === 'Host' && host.line === 1,
    '⑤ confirmRows: each field with the keyword and the line it came from; the user the block does not name is said (value null); an address from the Host name says so', rows);
}

// ═══ ⑥ the REAL HostManager ═══
console.log('⑥ the record, its argv, its import');
const world = (n, H = HM) => { const dataDir = path.join(SCR, 'w' + n); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, 'hosts.json'), JSON.stringify({ hosts: [] })); return new H.HostManager({ dataDir }); };
const hostLegs = (H, tag) => {
  const hm = world(tag, H);
  const id = hm.add({ name: 'gpu-01', user: 'ubuntu', host: '203.0.113.10', port: '2222', jump: 'me@bastion.example.com:2200', keyPath: '/home/me/.ssh/work_key' });
  const h = hm.get(id), a = hm.sshArgs(h), cmd = hm.sshCmd(h), j = a.findIndex((x) => x.startsWith('ProxyCommand='));
  const v6 = hm.sshArgs(hm.get(hm.add({ name: 'six', user: 'u', host: 'h6.example.com', jump: 'me@[2001:db8::1]:22' }))).find((x) => x.startsWith('ProxyCommand=')) || '';
  const refused = ['a.example.com,b.example.com', '-oProxyCommand=touch', 'me@host;touch'].map((jump) => { try { hm.add({ name: 'x-' + jump.length, user: 'u', host: 'h.example.com', jump }); return null; } catch (e) { return e.code || e.message; } });
  const count = hm._state.hosts.filter((x) => x.name !== 'six').length;
  let tgt = null; try { hm.add({ name: 'q', user: 'u', host: "evil'host", jump: 'me@bastion.example.com' }); } catch (e) { tgt = e.code || e.message; }
  let roadTgt = null; try { hm.sshArgs({ ...h, host: "evil'host" }); } catch (e) { roadTgt = e.message; }
  const bad = { ...h, jump: '-oProxyCommand=touch' };
  let road = null; try { hm.sshArgs(bad); } catch (e) { road = e.message; }
  const imp = world(tag + 'i', H);
  const res = imp.importBundle({ hosts: [{ id: 'host-a', name: 'a', user: 'u', host: 'a.example.com', port: 22, jump: 'me@bastion.example.com' }, { id: 'host-b', name: 'b', user: 'u', host: 'b.example.com', port: 22, jump: '-oProxyCommand=touch' }, { id: 'host-c', name: 'c', user: 'u', host: 'c.example.com', port: 22, jump: 'none' }, { id: 'host-d', name: 'd', user: 'u', host: "d'x.example.com", port: 22, jump: 'me@bastion.example.com' }], keys: {} });
  const app = hm.add({ name: 'app', user: 'u', host: 'h2.example.com', keyPath: path.join(hm._sshDir, 'id_ed25519') });
  return { h, a, cmd, j, v6, refused, count, road, tgt, roadTgt, imported: imp._state.hosts.map((x) => [x.id, x.jump === undefined ? '-' : x.jump]), warnings: res.warnings, keySource: [h.keySource, hm.get(app).keySource] };
};
const real = hostLegs(HM, 1);
{
  const pc = real.a[real.j] || '';
  ok(real.h.jump === 'me@bastion.example.com:2200' && real.j > 0 && real.a[real.j - 1] === '-o' && real.j < real.a.length - 1 && real.a.at(-1) === 'ubuntu@203.0.113.10' && !real.a.includes('-J')
    && pc.startsWith('ProxyCommand=ssh -o BatchMode=yes') && pc.includes(' -o StrictHostKeyChecking=accept-new') && pc.includes(' -o ConnectTimeout=') && pc.endsWith(" -l me -p 2200 -W '[%h]:%p' bastion.example.com")
    && rsyncSplit(real.cmd).includes(pc) && real.v6.endsWith(" -l me -p 22 -W '[%h]:%p' 2001:db8::1"),
    '⑥ a jump record: the hop is OUR ssh (`-o ProxyCommand=ssh <the same BatchMode / accept-new / timeout options> -l -p -W [%h]:%p <host>` — ssh\'s own -J hop takes none of them) before the destination, and in sshCmd (rsync -e) too; an IPv6 jump host without its brackets', { a: real.a, v6: real.v6 });
}
ok(same(real.refused, ['jump-chain', 'jump-form', 'jump-form']) && real.count === 1 && /its jump host is not one \[user@\]host\[:port\] — add the machine again/.test(String(real.road)),
  '⑥ a jump that does not read: refused at the add by code (a chain, an option, a shell word — nothing saved); a hand-edited record\'s refuses the road by name (never a dial around it, never an option)', { refused: real.refused, road: real.road });
ok(same(real.imported, [['host-a', 'me@bastion.example.com'], ['host-c', '-']]) && real.warnings.some((w) => /^b: skipped — the jump host is not one/.test(w)) && real.warnings.some((w) => /^d: skipped — a machine behind a jump host has an address of plain host characters/.test(w)),
  '⑥ an import asks the jump again: a good one kept, one that does not read skipped by name, «none» is no jump, a jump machine whose own address is not plain host characters skipped by name', { imported: real.imported, warnings: real.warnings });
ok(real.tgt === 'jump-target-form' && /a machine behind a jump host has an address of plain host characters/.test(String(real.roadTgt)),
  '⑥ its third read: the hop carries the record\'s OWN address as ssh\'s %h — behind a jump host it is plain host characters: refused at the add by code, and a hand-edited record refuses the road by name', { tgt: real.tgt, road: real.roadTgt });
ok(same(real.keySource, ['file', 'app']), '⑥ a key file of the hub the person named is keySource «file» (its row says so); VibeSpace\'s own key stays «app»', real.keySource);
{
  const pj = HM.parseSshG('hostname gpu\nproxyjump me@b.example.com\n', 'g'), pc = HM.parseSshG('hostname gpu\nproxycommand ssh -W %h:%p b\n', 'g'), no = HM.parseSshG('hostname gpu\nproxycommand none\n', 'g');
  const v = HM.configVerdict({ configured: true, userIsDefault: false, hostname: 'gpu', user: 'me', port: null, identityFile: null, proxied: true }, { user: '' }, '/home/me');
  ok(pj.proxied === true && pc.proxied === true && no.proxied === false && v.sshConfig && v.sshConfig.proxied === true,
    '⑥ ssh -G\'s ProxyJump or ProxyCommand ⇒ proxied (none ⇒ not); the add\'s verdict keeps it in sshConfig — the SFTP road reads it', { pj, pc, no, v });
}

{
  const bin = path.join(SCR, 'kbin'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'ssh-keygen'), `#!/bin/sh\nf=""\nwhile [ $# -gt 0 ]; do [ "$1" = "-f" ] && { f="$2"; shift; }; shift; done\ncase "$f" in *enc*|pass) echo "Load key \\"$f\\": incorrect passphrase supplied to decrypt private key" >&2; exit 255 ;; *open*) echo "Permissions 0644 for '$f' are too open." >&2; exit 255 ;; *ok*) echo 'ssh-ed25519 AAAA-stand-in test'; exit 0 ;; *) echo "Load key \\"$f\\": invalid format" >&2; exit 255 ;; esac\n`, { mode: 0o755 });
  const PATH0 = process.env.PATH; process.env.PATH = bin + path.delimiter + PATH0;
  let v = [];
  try { const hm = world(5); v = [await hm.keyFileVerdict('/k/ok_key'), await hm.keyFileVerdict('/k/enc_key'), await hm.keyFileVerdict('/k/notes.txt'), await hm.keyFileVerdict('/k/open_key'), await hm.keyFileVerdict('/k/passphrase-free/notes.txt'), await hm.keyFileVerdict('pass')]; } finally { process.env.PATH = PATH0; }
  ok(same(v, [{ ok: true }, { ok: false, code: 'key-file-encrypted' }, { ok: false, code: 'key-file-unusable' }, { ok: false, code: 'key-file-open' }, { ok: false, code: 'key-file-unusable' }, { ok: false, code: 'key-file-encrypted' }]),
    '⑥ its read: keyFileVerdict (one bounded ssh-keygen -y child, the public half only) — a usable key passes; a key with a passphrase is key-file-encrypted (BatchMode never types one); not a key is key-file-unusable; a key others can read is key-file-open (ssh refuses it too); the words of the PATH never decide («passphrase-free/…»), and a short path is never cut out of ssh-keygen\'s own words («pass»)', v);
  const R = read('src/server/exit-routes.js');
  const iK = R.indexOf('const kv = await hosts.keyFileVerdict(b.keyPath);'), iAsk = R.indexOf('const a = await hosts.resolveAlias(b.host)'), iAdd = R.indexOf('const id = hosts.add({ ...b, replaces');
  ok(iK > 0 && iK < iAsk && iAsk < iAdd && R.includes("String(b.keyPath) !== hosts.keyInfo().path") && R.includes("if (!kv.ok) throw Object.assign(new Error(") && R.includes('{ code: kv.code }'),
    '⑥ its read: POST /api/hosts asks keyFileVerdict for a key file the person named (not VibeSpace\'s own key, not a pasted key) and refuses by code BEFORE it adds');
  const hm = world(6), j = hm.get(hm.add({ name: 'j', user: 'u', host: 'h.example.com', jump: 'me@bastion.example.com' })), p0 = hm.get(hm.add({ name: 'p', user: 'u', host: 'h.example.com' }));
  const pa = hm.get(hm.add({ name: 'pa', user: '', host: 'jumpalias', viaConfig: true, sshConfig: { host: '10.0.0.9', proxied: true } }));
  const hpa = (await import('node:crypto')).createHash('sha1').update('config:jumpalias').digest('hex').slice(0, 8);
  const cp = (h) => hm.sshArgs(h, { multiplex: true }).find((x) => x.startsWith('ControlPath=')) || '';
  const h8 = (await import('node:crypto')).createHash('sha1').update('me@bastion.example.com').digest('hex').slice(0, 8);
  ok((cp(j).endsWith('/%C-j' + h8) && cp(p0).endsWith('/%C') && cp(pa).endsWith('/%C-j' + hpa) && hm.sshCmd(j).includes('%C-j' + h8)) || (!cp(j) && !!hm._cmRefused),
    '⑥ its read: a jump record\'s shared connection has a socket of its own (%C-j<its jump\'s hash>), and so has an alias its ssh config proxies — never another record\'s to the same address', [cp(j), cp(p0), cp(pa)]);
}

// ═══ ⑧ the follow-up: the import judged as the add; the line pattern; a refused HostName ═══
console.log('⑧ the config import judges a machine record as the add does');
const HOSTILE = [
  { id: 'host-u', name: 'u', user: '-oProxyCommand=touch', host: 'u.example.com', port: 22 },
  { id: 'host-c', name: 'c', user: 'me\nx', host: 'c.example.com', port: 22 },
  { id: 'host-p', name: 'p', user: 'me', host: 'p.example.com', port: '-oX' },
  { id: 'host-q', name: 'q', user: 'me', host: 'q.example.com', port: 70000 },
  { id: 'host-n', name: 'n', user: '', host: 'n.example.com', port: 22 },
  { id: 'host-k', name: 'k', user: 'me', host: 'k.example.com', port: 22, keyPath: '/k\nx', keySource: 'file' },
  { id: 'host-l', name: 'l', user: 'me', host: 'l.example.com', port: 22, keyPath: '/home/me/.ssh/k', keySource: 'imported' },
  { id: 'host-g', name: 'g', user: 'me', host: 'g.example.com', port: '2222' },
  { id: 'host-a', name: 'a', user: '', host: 'my-vm', port: null, viaConfig: true },
  { id: 'host-kq', name: 'kq', user: 'me', host: 'kq.example.com', port: 22, keyPath: '/x" -oProxyCommand=touch -i "/y' },
  { id: 'host-dr', name: 'dr', user: 'me', host: 'dr.example.com', port: 22, dialRoot: '$HOME/..' },
  { id: 'host-d2', name: 'd2', user: 'me', host: 'd2.example.com', port: 22, dialRoot: '$HOME//' },
  { id: 'host-d3', name: 'd3', user: 'me', host: 'd3.example.com', port: 22, dialRoot: '$HOME/.ssh' },
  { id: 'host-d4', name: 'd4', user: 'me', host: 'd4.example.com', port: 22, dialRoot: '$HOME/.vibespace/device@hub.example.com' },
  { id: 'host-dial-d1', name: 'dev', transport: 'dial', deviceId: 'd1' },
];
const importLegs = (H, tag) => {
  const w = world(tag, H), res = w.importBundle({ hosts: JSON.parse(JSON.stringify(HOSTILE)), keys: {} });
  const kept = w._state.hosts.map((x) => x.id);
  const optionWords = w._state.hosts.filter((x) => x.transport !== 'dial').map((x) => { try { const a = w.sshArgs(x); return a.at(-1).startsWith('-') ? x.id : null; } catch { return null; } }).filter(Boolean);
  const kq = w._state.hosts.find((x) => x.id === 'host-kq'), kqWords = kq ? rsyncSplit(w.sshCmd(kq)) : [];
  return { kept, warnings: res.warnings, optionWords, kqWords, rec: Object.fromEntries(w._state.hosts.map((x) => [x.id, x])) };
};
{
  const I = importLegs(HM, 7), wn = (n, why) => I.warnings.some((x) => x.startsWith(`${n}: skipped — ${why}`));
  const dropped = (n) => I.warnings.some((x) => x.startsWith(`${n}: its install folder is not one this hub writes`));
  ok(same(I.kept, ['host-l', 'host-g', 'host-a', 'host-kq', 'host-dr', 'host-d2', 'host-d3', 'host-d4', 'host-dial-d1']) && wn('u', 'the address and the user may not start with «-»') && wn('c', 'the address and the user hold no control character')
    && wn('p', 'the port is a whole number') && wn('q', 'the port is a whole number') && wn('n', 'user required') && wn('k', 'its key path holds a control character')
    && ['dr', 'd2', 'd3'].every(dropped) && !dropped('d4') && ['host-dr', 'host-d2', 'host-d3'].every((id) => I.rec[id].dialRoot === undefined) && I.rec['host-d4'].dialRoot === '$HOME/.vibespace/device@hub.example.com'
    && I.optionWords.length === 0 && I.kqWords.length > 0 && !I.kqWords.includes('-oProxyCommand=touch') && I.kqWords.includes('/x" -oProxyCommand=touch -i "/y'),
    '⑧ a hostile bundle: a user that would be an ssh option, a control character, a port that is no port (an option word, 70000), no user, a key path that is not absolute — each skipped BY NAME; a key path holding a quote is a file name (kept, as the add takes one) and stays ONE word of rsync\'s -e; an install folder that is not EXACTLY the graduation\'s shape («$HOME/..», «$HOME//», «$HOME/.ssh» — the removal\'s rm -rf) dropped by name, the hub\'s own kept; no kept record puts an option-shaped word on ssh\'s argv', { kept: I.kept, warnings: I.warnings, kq: I.kqWords });
  ok(read('src/server/mounts-plugins-wiring.js').includes("if (root && require('../hosts.js').dialRootOk(root)) {") && !read('src/server/mounts-plugins-wiring.js').includes("/^\\$HOME\\/[\\w@.\\/-]+$/")
    && read('src/server/mounts-plugins-wiring.js').includes("const root = require('../hosts.js').dialRootOf(base);"),
    '⑧ its reads: the removal\'s guard asks THE install-folder rule (dialRootOk), the graduation writes by THE derivation (dialRootOf) — never their own patterns');
  // its delta read: the hub derives a graduated machine's install folder AS THE INSTALLER DOES (sed «://» up to the first / : ?, tr -cd A-Za-z0-9.-)
  const installer = (url) => { const m = /^[a-z]+:\/\/([^/:?]+)/.exec(url); const h = (m ? m[1] : url).replace(/[^A-Za-z0-9.-]/g, ''); return `$HOME/.vibespace/device@${h || 'dial'}`; };
  const bases = ['https://hub.example.com:8443', 'http://[fd00::1]:8443', 'http://[::2]:8443/x', 'http://10.0.0.5', 'wss://hub.example.com/p?q=1'];
  const HMd = HM;
  ok(bases.every((b) => HMd.dialRootOf(b) === installer(b) && HMd.dialRootOk(HMd.dialRootOf(b))) && HMd.dialRootOf('http://[fd00::1]:8443') === '$HOME/.vibespace/device@fd00' && !HMd.dialRootOk('$HOME/.vibespace/device@..'),
    '⑧ its delta read: the hub derives the install folder as the installer does — an IPv6 base names the SAME folder (fd00, never fd001), so the removal tears down the real install; every derived folder passes the rule, «device@..» does not', bases.map((b) => [HMd.dialRootOf(b), installer(b)]));
  ok(I.rec['host-l'].keySource === 'file' && I.rec['host-g'].port === 2222 && I.rec['host-a'].port === null && I.rec['host-dial-d1'].transport === 'dial',
    '⑧ what is kept is the ADD\'s: the key source derived again (a bundle that says «imported» for a path of its own reads «file» here), the port a number (an alias left to its config: null), a dial record as it was', I.rec);
  const hm = world(8); const port = (p, via) => { try { return hm.get(hm.add({ name: 'x' + Math.random(), user: via ? '' : 'me', host: via ? 'my-vm' : 'h.example.com', port: p, viaConfig: via })).port; } catch (e) { return e.code; } };
  ok(same([port(''), port('2222'), port('abc'), port('70000'), port('', true)], [22, 2222, 'port-form', 'port-form', null]),
    '⑧ the add\'s port rule (the import\'s too): empty ⇒ 22, a whole number 1–65535, anything else refused by code — never 22 in silence; an alias left empty ⇒ the config\'s', [port(''), port('abc')]);
}
{
  const longLine = SB.readSshBlock('Host g\n  User' + ' '.repeat(SB.MAX_LINE_CHARS) + 'x\n'), sep = SB.readSshBlock('Host g\n  HostName 10.0.0.1\u2028x\n');
  const lu = longLine.hosts[0].notUsed[0], su = sep.hosts[0].notUsed[0];
  ok(lu.why === 'long' && lu.text.length === 61 && su.why === 'value' && su.line === 2,
    '⑧ the line pattern: a line over the bound is NAMED (never matched; its text cut for the step); a line separator inside a line is read as part of it (the pattern\'s `.` takes it — linear), so a long run of spaces before one never backtracks', { lu, su });
  const r = SB.readSshBlock('Host gx\n  HostName %h.example\n  User me\n'), h = r.hosts[0], row = SB.confirmRows(h).find((x) => x.field === 'host');
  ok(h.hostRefused === 2 && h.fields.host === undefined && !('host' in SB.formOf(h)) && row.value === null && row.refused === true && row.line === 2 && same(h.notUsed.map((u) => [u.line, u.why]), [[2, 'token']]),
    '⑧ a target whose HostName line was refused (a %-token) is SAID: no address filled (formOf names none), the confirm row says its line is not used — never the bare Host name in silence', { h, row });
  // its read: a HostName that does not READ (an unclosed quote, no value, a line over the bound) is a refused one too; a Host line over the
  // bound ends the block before it (its lines never fill the machine before)
  const q = ['Host ga\n  HostName "10.0.0.5\n', 'Host gb\n  HostName=\n', 'Host gc\n  HostName ' + 'h'.repeat(SB.MAX_LINE_CHARS) + '\n'].map((t) => SB.readSshBlock(t).hosts[0]);
  const lh = SB.readSshBlock('Host g1\n  HostName 10.0.0.1\nHost ' + 'x'.repeat(SB.MAX_LINE_CHARS) + '\n  User intruder\n  Port 2222\n');
  ok(q.every((x) => x.hostRefused === 2 && !('host' in SB.formOf(x))) && lh.hosts.length === 1 && lh.hosts[0].fields.user === undefined && lh.hosts[0].fields.port === undefined && lh.hosts[0].end === 2
    && same(lh.outside.map((u) => [u.line, u.why]), [[3, 'long'], [4, 'bad-host'], [5, 'bad-host']]),
    '⑧ its read: a HostName that does not read (an unclosed quote, no value, over the bound) is REFUSED — said, no address, never the bare Host name; a Host line over the bound ends the block before it (its User / Port never fill g1)', { q: q.map((x) => [x.hostRefused, x.fields]), lh: lh.outside });
  // its read: the import's other inputs — a bundle's «viaConfig: 'yes'» is no alias (a user is asked), an id that is not this hub's shape is refused
  const w = world(11), res = w.importBundle({ hosts: [{ id: 'host-v', name: 'v', user: '', host: 'v.example.com', port: 22, viaConfig: 'yes' }, { id: '../../x', name: 'dots', user: 'me', host: 'x.example.com', port: 22 }], keys: { '../../x': 'k' } });
  ok(w._state.hosts.length === 0 && res.warnings.some((x) => /^v: skipped — user required/.test(x)) && res.warnings.some((x) => /^dots: skipped — its id is not one this hub makes/.test(x)),
    '⑧ its read: a bundle\'s «viaConfig: \'yes\'» is no alias (its empty user refused); an id that is not one this hub makes («../../x» would name a key file outside the ssh folder) is refused by name', res.warnings);
}

// ═══ ⑧b sshCmd is read by rsync's own rule (its -e splitter) ═══
console.log('⑧b the rsync -e string reads back as the argv');
{
  const qh = world(12), base = qh.get(qh.add({ name: 'q', user: 'me', host: 'q.example.com', jump: 'me@bastion.example.com' }));
  const evil = { ...base, keyPath: '/x" -oProxyCommand=touch -i "/y' }, spacey = { ...base, keyPath: "/home/me/my 'key" };
  const back = (h) => rsyncSplit(qh.sshCmd(h)), want = (h) => ['ssh', ...qh.sshArgs(h, { multiplex: true }).slice(0, -1)];
  ok([base, evil, spacey].every((h) => same(back(h), want(h))) && !back(evil).includes('-oProxyCommand=touch'),
    '⑧b its read: sshCmd is quoted by RSYNC\'s rule (\'…\', a doubled quote inside, no backslash escape) — read back as rsync splits it, it is EXACTLY the argv: the jump\'s hop, a key path with a space or a quote stays ONE word (never an `-oProxyCommand` of its own)', { evil: back(evil) });
  const src = read('src/hosts.js'), a = "args.map((a) => (/[\\s\"'\\\\]/.test(a) ? `'${a.replace(/'/g, \"''\")}'` : a))";
  if (src.split(a).length !== 2) ok(false, 'CONTROL: the sshCmd anchor moved — update this suite');
  else {
    const C = compileAt('src/hosts.js', src.replace(a, "args.map((a) => (/[\\s\"']/.test(a) ? JSON.stringify(a) : a))"));
    const ch = world(13, C), cb = ch.get(ch.add({ name: 'q', user: 'me', host: 'q.example.com' }));
    ok(rsyncSplit(ch.sshCmd({ ...cb, keyPath: '/x" -oProxyCommand=touch -i "/y' })).includes('-oProxyCommand=touch'), 'CONTROL (RED): the release\'s JSON quoting — rsync reads the key path\'s `\\"` as the quote\'s end: `-oProxyCommand=touch` becomes an ssh option of its own');
  }
}

// ═══ ⑦ the page, driven ═══
console.log('⑦ the page: the paste step and the form');
const noop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : noop), apply: () => noop, construct: () => noop, set: () => true, has: () => true });
class Nd {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.style = {}; this.dataset = {}; this._text = ''; this._ls = {}; this.className = ''; this.hidden = false; this.id = ''; this.value = ''; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v ?? ''); }
  _drop(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); }
  appendChild(n) { if (n.parentNode) n.parentNode._drop(n); this.children.push(n); n.parentNode = this; return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? txt(n) : n); }
  prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === 'string' ? txt(n) : n, this.children[0] || null); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode._drop(n); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentNode = this; return n; }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...ns); }
  remove() { if (this.parentNode) this.parentNode._drop(this); this.parentNode = null; }
  addEventListener(t, f) { (this._ls[t] ||= []).push(f); }
  removeEventListener() {}
  dispatchEvent(ev) { for (const f of [...(this._ls[ev.type] || [])]) f(ev); return true; }
  get classList() { const n = this; const list = () => String(n.className).split(/\s+/).filter(Boolean); return { add: (...c) => { n.className = [...new Set([...list(), ...c])].join(' '); }, remove: (...c) => { n.className = list().filter((x) => !c.includes(x)).join(' '); }, contains: (c) => list().includes(c), toggle() {} }; }
  setAttribute(k, v) { this[k === 'class' ? 'className' : k] = String(v); }
  querySelectorAll(sel) { const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(String(sel).trim()); const out = []; const walk = (n) => { for (const c of n.children) { if (m && (!m[1] || c.tagName === m[1].toUpperCase()) && m[2].split('.').filter(Boolean).every((k) => c.classList.contains(k))) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() {} blur() {}
}
class Sel extends Nd {
  get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }
  get value() { const o = this.options; return o.some((x) => x.value === this._v) ? this._v : (o[0] ? o[0].value : ''); }
  set value(v) { this._v = String(v); }
}
// unknown DOM members answer a harmless stand-in (a toast's own calls), the known ones are the stand-in's
const tolerant = (n) => new Proxy(n, { get: (t, k) => { if (k in t) { const v = t[k]; return typeof v === 'function' && k !== 'constructor' ? v.bind(t) : v; } return typeof k === 'symbol' ? undefined : noop; }, set: (t, k, v) => { t[k] = v; return true; } });
const mk = (tag) => tolerant(String(tag).toLowerCase() === 'select' ? new Sel(tag) : new Nd(tag));
const txt = (s) => { const n = new Nd('#text'); n._text = String(s); return n; };
const DOC = new Nd('#document'); DOC.body = mk('body');
DOC.createElement = mk; DOC.createTextNode = txt;
DOC.getElementById = (id) => { const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(DOC.body); };
for (const g of ['window', 'localStorage', 'sessionStorage', 'location', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'navigator']) {
  try { Object.defineProperty(globalThis, g, { value: noop, configurable: true, writable: true }); } catch { }
}
globalThis.document = tolerant(DOC);
const calls = [];
let HOSTS_ANSWER = null;   // a leg's own answer for POST /api/hosts (a refusal), else a saved machine
globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null }); if (String(url) === '/api/hosts' && HOSTS_ANSWER) { const a = HOSTS_ANSWER; return { ok: false, status: 400, json: async () => a }; } const j = String(url) === '/api/hosts' ? { success: true, id: 'h9' } : { ok: true }; return { ok: true, status: 200, json: async () => j }; };
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const SMF = path.join(REPO, 'src/lib/sidebar-mounts.js');
const bundle = async (src, tag) => {
  const out = path.join(SCR, `sidebar-mounts.${tag}.mjs`);
  await esbuild.build({ stdin: { contents: src, resolveDir: path.dirname(SMF), sourcefile: SMF }, bundle: true, format: 'esm', platform: 'browser', outfile: out, logLevel: 'silent', loader: { '.css': 'empty' },
    plugins: [{ name: 'bv', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'bv' })); b.onLoad({ filter: /.*/, namespace: 'bv' }, () => ({ contents: "export const BUILD_VERSION = '0';" })); } }] });
  return (await import(pathToFileURL(out).href)).installSidebarMounts;
};
const page = async (install) => {
  function S() { this._hostsData = { key: { exists: true, path: '/k' }, hosts: [] }; }
  install(S);
  const s = new S(); let dlg = null; const out = {};
  s._renderMounts = () => {}; s._offlineMountNeed = () => {};
  // the shell's own rule, modelled: a form of the same id and key that is open is RAISED (the same ctx back, nothing new drawn);
  // close() fires its onClose (createModalShell calls it on every path)
  const open = new Map();
  s._mountsDialog = (title, fields, submitLabel, onSubmit, opts = {}) => {
    const k = `${opts.id}|${opts.key || ''}`;
    if (open.has(k)) { out.raised = (out.raised || 0) + 1; return open.get(k); }
    const body = mk('div'), err = mk('div'); err.className = 'cfg-err'; body.appendChild(err);
    const d = { title, fields, submitLabel, onSubmit, opts, body, closed: 0 };
    const ctx = { body, live: () => d.closed === 0, close: () => { if (d.closed++) return; open.delete(k); if (typeof opts.onClose === 'function') opts.onClose(); } };
    d.ctx = ctx; dlg = d; open.set(k, ctx); return ctx;
  };
  // the paste step, beside a form stand-in (the form's inputs as the real form names them)
  const form = () => { const ins = Object.fromEntries(['name', 'host', 'user', 'port', 'keyFile', 'jump'].map((k) => [k, mk('input')])); ins.keyChoice = mk('select'); for (const v of ['default', 'app', 'paste', 'file']) { const o = mk('option'); o.value = v; ins.keyChoice.appendChild(o); } const body = mk('div'), adv = mk('details'); adv.className = 'mounts-advanced'; body.appendChild(adv); const f = { inputs: ins, body, adv, conds: 0, alive: true }; f.live = () => f.alive; f.applyConds = () => { f.conds++; }; return f; };
  const step = (f) => { s._showSshBlockDialog(f); const d = dlg; return { d, ta: d.body.querySelector('textarea'), sel: d.body.querySelector('select'), out: d.body.querySelector('div.ssh-block-read') }; };
  const type = (st, text) => { st.ta.value = text; st.ta.dispatchEvent(new Event('input')); return st.out.textContent; };
  {
    const f = form(), st = step(f);
    out.title = st.d.title; out.id = st.d.opts.id;
    out.vscode = type(st, VSCODE);
    calls.length = 0;
    await st.d.onSubmit({}, { close: st.d.ctx.close });
    out.filled = Object.fromEntries(Object.entries(f.inputs).map(([k, el]) => [k, el.value])); out.adv = f.adv.open === true; out.conds = f.conds; out.closed = st.d.closed; out.sentAtFill = calls.length;
    // its read: a later fill of a block with no jump / port / key file clears the earlier one's
    const st2 = step(f); type(st2, 'Host gpu-02.example.com\n'); await st2.d.onSubmit({}, { close: st2.d.ctx.close });
    out.refill = [f.inputs.jump.value, f.inputs.port.value, f.inputs.keyFile.value, f.inputs.keyChoice.value, f.inputs.user.value];
    // follow-up: a block whose HostName line was refused fills no address — the earlier fill's is cleared, the step says why
    const st3 = step(f); out.refusedText = type(st3, 'Host gx\n  HostName %h.example\n  User me\n'); await st3.d.onSubmit({}, { close: st3.d.ctx.close });
    out.refusedHost = [f.inputs.host.value, f.inputs.name.value];
  }
  {
    const f = form(), st = step(f);
    out.every = type(st, EVERY); out.selShown = st.sel.parentNode && st.sel.parentNode.hidden === false; out.opts = st.sel.options.map((o) => o.value);
    st.sel.value = '1'; st.sel.dispatchEvent(new Event('change')); out.second = st.out.textContent;
    out.big = type(st, 'x'.repeat(SB.MAX_CHARS + 1)); try { await st.d.onSubmit({}, { close() {} }); out.bigSubmit = 'filled'; } catch (e) { out.bigSubmit = e.message; }
    type(st, ''); try { await st.d.onSubmit({}, { close() {} }); out.emptySubmit = 'filled'; } catch (e) { out.emptySubmit = e.message; }
    // its read: the pick is by position (two entries share a name), a jump of the paste is shown as that entry, the other blocks listed
    out.jumps = type(st, JUMPS); out.jopts = st.sel.options.map((o) => [o.value, o.textContent]);
    st.sel.value = '1'; st.sel.dispatchEvent(new Event('change')); out.g6 = st.out.textContent;
    st.sel.value = '3'; st.sel.dispatchEvent(new Event('change')); out.g6b = st.out.textContent;
    st.d.ctx.close();   // its third read: no step of this block left open for the legs below
  }
  // its read: the step is TIED to its form — raised as it is from the same form; another form's press ends it; a closed form is never
  // filled; the form's close ends it
  {
    const fa = form(), fb = form();
    const a1 = step(fa); out.raised = 0; s._showSshBlockDialog(fa); out.oneBox = a1.d.body.querySelectorAll('textarea').length; out.raisedSame = out.raised;
    const b1 = step(fb); out.endedByOther = a1.d.closed === 1 && b1.d !== a1.d;
    out.tieDiag = { a1closed: a1.d.closed, sameStep: b1.d === a1.d, raised: out.raised, boxes: b1.d.body.querySelectorAll('textarea').length };
    type(b1, VSCODE); await b1.d.onSubmit({}, { close: b1.d.ctx.close }); out.filledOther = [fa.inputs.host.value, fb.inputs.host.value];
    const fc = form(); const c1 = step(fc); type(c1, VSCODE); fc.alive = false;
    try { await c1.d.onSubmit({}, { close: c1.d.ctx.close }); out.deadForm = 'filled'; } catch (e) { out.deadForm = e.message; }
    out.deadInputs = fc.inputs.host.value;
    c1.d.ctx.close();
  }
  {
    const f = form(); f.inputs.user.value = 'typed-user';
    const st = step(f); type(st, 'Host gpu-02.example.com\n  Port 2200\n'); await st.d.onSubmit({}, { close: st.d.ctx.close });
    out.kept = [f.inputs.user.value, f.inputs.host.value, f.inputs.port.value, f.inputs.keyChoice.value];
  }
  // the form: its fields, a jump refused before anything is sent, a good one sent, a key file's path sent, «Add it again»
  s._showAddHostDialog(s._hostsData);
  const add = dlg; out.fields = add.fields.map((x) => x.key);
  { const st = step(add.ctx); add.ctx.close(); out.endedWithForm = st.d.closed === 1; }   // its read: the form's close ends its step
  s._showAddHostDialog(s._hostsData);
  const add2 = dlg;
  const kf = add.fields.find((x) => x.key === 'keyFile'), jf = add.fields.find((x) => x.key === 'jump'), kc = add.fields.find((x) => x.key === 'keyChoice');
  out.keyFile = kf && { auto: kf.autocomplete, kind: kf.pathKind, on: kf.when({ keyChoice: 'file' }), off: kf.when({ keyChoice: 'app' }) }; out.jumpAdv = !!(jf && jf.advanced); out.choices = kc && kc.options.map((o) => o[0]);
  const press = async (v) => { calls.length = 0; try { await add2.onSubmit({ name: 'gpu-01', user: 'ubuntu', host: '203.0.113.10', port: '2222', keyChoice: 'default', ...v }, { close() {}, err: { isConnected: true } }); return { posts: calls.filter((c) => c.url === '/api/hosts') }; } catch (e) { return { err: e.message, posts: calls.filter((c) => c.url === '/api/hosts') }; } };
  out.chain = await press({ jump: 'a.example.com,b.example.com' }); out.optj = await press({ jump: '-oProxyCommand=touch' }); out.tgt = await press({ jump: 'me@bastion.example.com', host: "evil'host" });
  out.good = await press({ jump: 'me@bastion.example.com' }); out.file = await press({ keyChoice: 'file', keyFile: '/home/me/.ssh/work_key' }); out.fileEmpty = await press({ keyChoice: 'file', keyFile: '' });
  HOSTS_ANSWER = { error: 'x', code: 'key-file-encrypted' }; out.fileEnc = await press({ keyChoice: 'file', keyFile: '/home/me/.ssh/enc_key' });
  HOSTS_ANSWER = { error: 'x', code: 'key-file-unusable' }; out.fileBad = await press({ keyChoice: 'file', keyFile: '/home/me/notes.txt' });
  HOSTS_ANSWER = { error: 'x', code: 'key-file-open' }; out.fileOpen = await press({ keyChoice: 'file', keyFile: '/home/me/.ssh/open_key' }); HOSTS_ANSWER = null;
  add2.ctx.close();
  s._showAddHostDialog(s._hostsData, { id: 'h1', name: 'gpu-01', user: 'ubuntu', host: '203.0.113.10', port: 2222, keySource: 'file', keyPath: '/home/me/.ssh/work_key', jump: 'me@bastion.example.com' });
  const again = dlg; const val = (k) => (again.fields.find((x) => x.key === k) || {}).value;
  out.again = [val('keyChoice'), val('keyFile'), val('jump')];
  // a machine reached through another host: no read-write (SFTP) road
  const pull = (h) => { s._showMachinePullDialog(h); return dlg.fields.map((x) => x.key); };
  out.pull = { plain: pull({ id: 'h1', name: 'a', user: 'u', host: 'a.example.com' }), jump: pull({ id: 'h2', name: 'b', user: 'u', host: 'b.example.com', jump: 'me@bastion.example.com' }), proxied: pull({ id: 'h3', name: 'c', user: 'u', host: 'c', viaConfig: true, sshConfig: { host: 'c.example.com', proxied: true } }) };
  out.note = (dlg.fields.find((x) => x.key === 'accessNote') || {}).value || '';
  // its read: the SFTP storage form's «From registered host» — a machine reached through another host is said, never filled in
  {
    s._hostsData = { key: { exists: true, path: '/k' }, hosts: [{ id: 'hj', name: 'gpu-j', user: 'u', host: '10.20.0.9', jump: 'me@bastion.example.com' }, { id: 'hp', name: 'gpu-p', user: 'u', host: '10.20.0.8', port: 22 }, { id: 'hk', name: 'gpu-k', user: 'u', host: '10.20.0.7', port: 22, keyPath: '/home/me/.ssh/k' }] };
    const ins = Object.fromEntries(['sshHost', 'sshUser', 'sshPort', 'keyPath', 'name'].map((k) => [k, mk('input')])); ins.fromHost = mk('select');
    for (const v of ['', 'hj', 'hp', 'hk']) { const o = mk('option'); o.value = v; ins.fromHost.appendChild(o); }
    const body = mk('div'), err = mk('div'); err.className = 'cfg-err'; body.appendChild(err);
    s._wireHostPrefill({ inputs: ins, body });
    ins.fromHost.value = 'hk'; ins.fromHost.dispatchEvent(new Event('change')); out.prefKey = ins.keyPath.value;
    ins.fromHost.value = 'hp'; ins.fromHost.dispatchEvent(new Event('change')); out.prefPlain = [ins.sshHost.value, err.textContent, ins.keyPath.value];
    ins.fromHost.value = 'hj'; ins.fromHost.dispatchEvent(new Event('change')); out.prefJump = [ins.sshHost.value, err.textContent, ins.sshUser.value];
  }
  return out;
};
const pageSrc = read('src/lib/sidebar-mounts.js');
let P = null;
try { P = await page(await bundle(pageSrc, 'tree')); } catch (e) { ok(false, '⑦ the page bundles and its paste step runs over the DOM stand-in', String(e && e.stack || e).slice(0, 800)); }
if (P) {
  ok(P.title === 'Paste an ssh config block' && P.id === 'host-paste-dialog' && /Address203\.0\.113\.10HostName, line 3/.test(P.vscode) && /Jump hostme@bastion\.example\.com:2200ProxyJump, line 8/.test(P.vscode)
    && /Lines not used: 1/.test(P.vscode) && /line 9: ForwardAgent yes — a setting VibeSpace does not read/.test(P.vscode) && /IdentityFile is a path on this server/.test(P.vscode),
    '⑦ the paste step (its own id, beside the form) reads the block AS IT IS TYPED: each field with the keyword and line it came from, every line not used with why, the key file said to be the hub\'s', P.vscode);
  ok(same(P.filled, { name: 'gpu-01', host: '203.0.113.10', user: 'ubuntu', port: '2222', keyFile: '~/.ssh/work_key', jump: 'me@bastion.example.com:2200', keyChoice: 'file' }) && P.adv && P.conds > 0 && P.closed === 1 && P.sentAtFill === 0,
    '⑦ «Fill the form» fills the form\'s inputs (the key-file choice picked and the form\'s conditions applied again, the jump\'s fold opened), closes the step and SENDS NOTHING', { filled: P.filled, adv: P.adv, conds: P.conds, sent: P.sentAtFill });
  ok(same(P.refusedHost, ['', 'gx']) && /Addressits HostName line is not used — type the address in the formHostName, line 2/.test(P.refusedText),
    '⑦ follow-up: a block whose HostName line was refused fills NO address (the earlier fill\'s cleared) and the step says so, by its line', { host: P.refusedHost, text: P.refusedText });
  ok(same(P.refill, ['', '', '', 'default', '']), '⑦ its reads: a later fill of a block with no jump, port, key file or User clears what the earlier FILL wrote (the key choice back to the form\'s first); a User the person typed stays (the «kept» leg)', P.refill);
  ok(same(P.jopts.map((o) => o[1]), ['bastion, line 1', 'gpu-06, line 6', 'gpu-07, line 10', 'gpu-06, line 14']) && /Jump hostjump@198\.51\.100\.20:2200ProxyJump, line 8 — the Host bastion of this paste, line 1/.test(P.g6)
    && /lines 1–5: Host bastion — read as the jump host/.test(P.g6) && /line 5: IdentityFile ~\/\.ssh\/bastion_key — the jump host’s key file/.test(P.g6) && /line 9: IdentitiesOnly yes — IdentitiesOnly with no IdentityFile/.test(P.g6)
    && /Address10\.20\.0\.66HostName, line 15/.test(P.g6b),
    '⑦ its read: the pick is by POSITION (two «gpu-06» both reachable); a jump naming the paste\'s bastion shows its address and where it came from, the bastion block is «read as the jump host», its key file and a lone IdentitiesOnly are said', { opts: P.jopts, g6: P.g6 });
  ok(P.oneBox === 1 && P.raisedSame === 1 && P.endedByOther && same(P.filledOther, ['', '203.0.113.10']) && /form this step fills was closed — nothing was filled/.test(P.deadForm) && P.deadInputs === '' && P.endedWithForm,
    '⑦ its read: the step is TIED to its form — a second press raises it as it is (one box); another form\'s press ends it and fills only that form; a closed form is refused by words, never filled; the form\'s close ends its step', { oneBox: P.oneBox, raised: P.raisedSame, other: P.filledOther, dead: P.deadForm, withForm: P.endedWithForm });
  ok(/line 1: ForwardAgent yes — before any Host line/.test(P.every) && /line 18: Match host gpu-04 — a Match block/.test(P.every) && /line 3: Host \* — a Host pattern/.test(P.every) && /line 5: gpu-03-alias — the Host line’s other names/.test(P.every)
    && /line 15: LocalForward 8080 db\.example\.com:5432 — a setting VibeSpace does not read/.test(P.every) && /Other Host entries of this paste:lines 22–23: Host gpu-05 — another machine of this paste/.test(P.every) && /Lines not used: 18/.test(P.every),
    '⑦ the lines OUTSIDE the machine\'s block are listed too (before any Host, a pattern, a Match block) — 18 lines named for the first machine; the paste\'s OTHER Host entry under its own heading, by its lines', P.every);
  ok(P.selShown && same(P.opts, ['0', '1']) && /Address198\.51\.100\.9HostName, line 23/.test(P.second),
    '⑦ several Host entries: a pick is shown, and the step reads the one picked', { opts: P.opts, second: P.second });
  ok(/at most 16384 characters, 400 lines/.test(P.big) && /at most 16384 characters/.test(P.bigSubmit) && /No Host entry for one machine/.test(P.emptySubmit),
    '⑦ a block over the bound is refused by its words (on the step and at «Fill the form»); an empty one fills nothing', { big: P.big, bigSubmit: P.bigSubmit, emptySubmit: P.emptySubmit });
  ok(same(P.kept, ['typed-user', 'gpu-02.example.com', '2200', 'default']), '⑦ a field the block does not name keeps what was typed (the user); no IdentityFile ⇒ the key choice untouched', P.kept);
  ok(P.fields.includes('sshBlock') && P.keyFile && P.keyFile.auto === 'local' && P.keyFile.kind === 'file' && P.keyFile.on === true && P.keyFile.off === false && P.jumpAdv && same(P.choices, ['default', 'app', 'paste', 'file']),
    '⑦ the form: the paste door, a fourth key choice («a key file on this server») whose path field is THIS server\'s file field, shown only when picked; the jump host in the advanced fold', { fields: P.fields, keyFile: P.keyFile, choices: P.choices });
  ok(/One jump host only/.test(P.chain.err) && P.chain.posts.length === 0 && /reads as \[user@\]host\[:port\]/.test(P.optj.err) && P.optj.posts.length === 0
    && P.good.posts.length === 1 && P.good.posts[0].body.jump === 'me@bastion.example.com' && P.file.posts[0].body.keyPath === '/home/me/.ssh/work_key' && P.file.posts[0].body.jump === undefined
    && /Give the key file’s path on this server/.test(P.fileEmpty.err) && P.fileEmpty.posts.length === 0 && /Behind a jump host, the address is a plain name or IP address/.test(P.tgt.err) && P.tgt.posts.length === 0,
    '⑦ the form refuses a jump chain or an option-shaped jump BEFORE anything is sent; a good jump is sent; a key file is sent as its path; an empty key-file path is refused', { chain: P.chain, optj: P.optj, good: P.good.posts, file: P.file.posts });
  ok(same(P.again, ['file', '/home/me/.ssh/work_key', 'me@bastion.example.com']), '⑦ «Add it again» keeps the key file choice, its path and the jump host', P.again);
  ok(/That key file is protected by a passphrase/.test(P.fileEnc.err) && /This server cannot use that key file/.test(P.fileBad.err) && /Other users of this server can read that key file/.test(P.fileOpen.err) && P.fileEnc.posts.length === 1,
    '⑦ its read: the hub\'s refusal of a key file is WORDED by its code (a passphrase; not readable / not a key)', { enc: P.fileEnc.err, bad: P.fileBad.err });
  ok(P.prefJump[0] === '' && P.prefJump[2] === '' && /“gpu-j” is reached through another host, and SFTP dials the machine directly/.test(P.prefJump[1]) && P.prefPlain[0] === '10.20.0.8' && P.prefPlain[1] === '' && P.prefKey === '/home/me/.ssh/k' && P.prefPlain[2] === '',
    '⑦ its reads: Connect storage › SFTP › «From registered host» — a direct machine fills (one with no key leaves no earlier pick\'s key path — ALSO CURED); one reached through another host is SAID and not filled in (SFTP would dial its address directly), the earlier pick\'s address and user cleared', { jump: P.prefJump, plain: P.prefPlain });
  ok(P.pull.plain.includes('access') && !P.pull.jump.includes('access') && P.pull.jump.includes('accessNote') && !P.pull.proxied.includes('access') && /reached through another host/.test(P.note),
    '⑦ a machine reached through another host (its jump, or its ssh config\'s proxy) offers no read-write (SFTP) mount — it says why; a direct one keeps the choice', P.pull);
}

// ═══ RED CONTROLS ═══
console.log('RED CONTROLS');
{
  const src = read('src/ssh-config-block.js'), a = "if (!FIELDS[key]) return note(n, t, 'unknown');";
  if (src.split(a).length !== 2) ok(false, 'CONTROL: the parser\'s anchor moved — update this suite');
  else {
    const C = compileAt('src/ssh-config-block.js', src.replace(a, 'if (!FIELDS[key]) return;'));
    const r = C.readSshBlock(EVERY);
    ok(accounted(r, EVERY).includes(15), 'CONTROL (RED): the parser dropping an unknown key silently — line 15 (LocalForward) is neither used nor named, and ② sees it', accounted(r, EVERY));
  }
  const b = '    h.fields.jump = v.jump;';
  if (src.split(b).length !== 2) ok(false, 'CONTROL: the parser\'s jump anchor moved — update this suite');
  const d1 = 'if (refusedOwn || !v.ok || !v.jump) {', d2 = '    if (routed) {';
  if (src.split(d1).length !== 2 || src.split(d2).length !== 2) ok(false, 'CONTROL: the parser\'s fourth-read anchors moved — update this suite');
  else {
    const { uz } = jumpLegs(compileAt('src/ssh-config-block.js', src.replace(d1, 'if (!v.ok || !v.jump) {')));
    ok(uz.fields.jump === 'bz', 'CONTROL (RED): the parser not asking whether the bastion\'s own HostName was refused — the bare name «bz» is dialled by the hub\'s own config', uz.fields);
    const { rt } = jumpLegs(compileAt('src/ssh-config-block.js', src.replace(d2, '    if (false) {')));
    ok(rt[0].fields.jump === '10.0.0.5', 'CONTROL (RED): the parser not asking whether the bastion is itself routed — a bastion behind its own ProxyCommand is dialled directly', rt[0].fields);
  }
  const c = '      delete h.fields.jump; delete h.from.proxyjump;\n      continue;';
  if (src.split(c).length !== 2) ok(false, 'CONTROL: the parser\'s unread-jump anchor moved — update this suite');
  else { const { ux } = jumpLegs(compileAt('src/ssh-config-block.js', src.replace(c, '      h.notUsed.pop();\n      continue;'))); ok(ux.fields.jump === 'bx', 'CONTROL (RED): the parser keeping the bare name of a paste entry whose address does not read — the hub would dial «bx» by its own config (②b sees it)', ux.fields); }
  if (src.split(b).length !== 2) ok(false, 'CONTROL: the parser\'s jump anchor moved — update this suite');
  else { const { g6 } = jumpLegs(compileAt('src/ssh-config-block.js', src.replace(b, '    continue;'))); ok(g6.fields.jump === 'bastion', 'CONTROL (RED): the parser not resolving a jump of the paste — gpu-06 would be dialled through the bare name «bastion» (②b sees it)', g6.fields.jump); }
}
{
  const src = read('src/hosts.js'), a = "const why = refusal ? refusal.message : po.refuse ? po.refuse.message : badKey ? (typeof rec.keyPath === 'string' && CONTROL_RE.test(rec.keyPath) ? 'its key path holds a control character' : 'its key path is not an absolute path') : null;";
  if (src.split(a).length !== 2) ok(false, 'CONTROL: the import verdict\'s anchor moved — update this suite');
  else {
    const C = importLegs(compileAt('src/hosts.js', src.replace(a, 'const why = null;')), 10);
    ok(C.kept.includes('host-u') && C.optionWords.includes('host-u'), 'CONTROL (RED): an import that does not judge its records — the user «-oProxyCommand=touch» is kept, and its argv\'s destination is an option word', { kept: C.kept, optionWords: C.optionWords });
  }
}
{
  const src = read('src/ssh-config-block.js'), e1 = '      if (cur && cur.kind === \'host\' && FIELDS[kw] && kw !== \'host\' && !cur.h.seen[kw]) cur.h.seen[kw] = n;';
  if (src.split(e1).length !== 2) ok(false, 'CONTROL: the unread-keyword anchor moved — update this suite');
  else { const x = compileAt('src/ssh-config-block.js', src.replace(e1, '')).readSshBlock('Host ga\n  HostName "10.0.0.5\n').hosts[0]; ok(!x.hostRefused && x.fields.host === 'ga', 'CONTROL (RED): an unread HostName not counted as refused — the bare Host name «ga» fills the address in silence', x.fields); }
}
{
  const src = read('src/ssh-config-block.js'), b1 = "    if (t.length > MAX_LINE_CHARS) return unread('long', t.slice(0, 60) + '…');\n", b2 = '(.*)$/s.exec(t);';
  if (src.split(b1).length !== 2 || src.split(b2).length !== 2) ok(false, 'CONTROL: the line pattern\'s anchors moved — update this suite');
  else {
    const L1 = compileAt('src/ssh-config-block.js', src.replace(b1, '')).readSshBlock('Host g\n  User' + ' '.repeat(SB.MAX_LINE_CHARS) + 'x\n').hosts[0].notUsed[0] || {};
    const L2 = compileAt('src/ssh-config-block.js', src.replace(b2, '(.*)$/.exec(t);')).readSshBlock('Host g\n  HostName 10.0.0.1\u2028x\n').hosts[0].notUsed[0] || {};
    ok(L1.why !== 'long' && L2.why === 'syntax', 'CONTROL (RED): the line pattern unbounded (the long line is matched, not named) and without `s` (`.` stops at a line separator — the pattern fails there and backtracks over the run before it)', { L1: L1.why, L2: L2.why });
  }
}
{
  let src = read('src/hosts.js');
  const a1 = ', ...jumpArgsOf(h)];', a2 = "        const why = refusal ? refusal.message : po.refuse ? po.refuse.message : badKey ? (typeof rec.keyPath === 'string' && CONTROL_RE.test(rec.keyPath) ? 'its key path holds a control character' : 'its key path is not an absolute path') : null;";
  if (src.split(a1).length !== 3 || src.split(a2).length !== 2) ok(false, 'CONTROL: the hosts.js anchors moved — update this suite');
  else {
    src = src.split(a1).join('];').replace(a2, '        const why = null;   // CONTROL');
    const C = hostLegs(compileAt('src/hosts.js', src), 9);
    ok(C.j === -1 && !C.cmd.includes('ProxyCommand='), 'CONTROL (RED): hosts.js\'s argv without the jump — the jump record is dialled directly', C.a);
    ok(C.imported.some(([id]) => id === 'host-b'), 'CONTROL (RED): an import that keeps any jump — the option-shaped one survives', C.imported);
  }
}
{
  // one flag per cut (globalThis.__SSHB_CUTS), so no cut masks another; the cut page runs twice: the «another form ends the step» cut
  // rewires every later step, so it runs alone
  const on = (k) => `(globalThis.__SSHB_CUTS && globalThis.__SSHB_CUTS.has('${k}'))`;
  const cuts = [["const unused = [...(h ? h.notUsed : []), ...read.outside]", `const unused = [...(h ? h.notUsed : []), ...(${on('outside')} ? [] : read.outside)]`],
    ['        const jv = jumpVerdict(v.jump);', `        const jv = ${on('jump')} ? { ok: true, jump: v.jump } : jumpVerdict(v.jump);`],
    ['      const proxied = !isDial && !!(h.jump || (h.sshConfig && h.sshConfig.proxied));', `      const proxied = ${on('proxied')} ? false : !isDial && !!(h.jump || (h.sshConfig && h.sshConfig.proxied));`],
    ['        if (!live(formCtx)) throw new Error(', `        if (!${on('live')} && !live(formCtx)) throw new Error(`],
    ["{ id: 'host-add-dialog', onClose: () => this._endSshBlockStep(formCtx) }", `{ id: 'host-add-dialog', onClose: () => (${on('onclose')} ? null : this._endSshBlockStep(formCtx)) }`],
    ['        if (h.jump || (h.sshConfig && h.sshConfig.proxied)) {', `        if (!${on('prefill')} && (h.jump || (h.sshConfig && h.sshConfig.proxied))) {`],
    ["        if (!vals.keyChoice && ins.keyChoice && ins.keyChoice.value === 'file') vals.keyChoice = 'default';", `        if (!${on('refill')} && !vals.keyChoice && ins.keyChoice && ins.keyChoice.value === 'file') vals.keyChoice = 'default';`],
    ['        this._endSshBlockStep();', `        if (!${on('other')}) this._endSshBlockStep();`]];
  if (!cuts.every(([a]) => pageSrc.split(a).length === 2)) ok(false, 'CONTROL: the page\'s anchors moved — update this suite', cuts.filter(([a]) => pageSrc.split(a).length !== 2).map(([a]) => a));
  else {
    let C = null, D = null;
    try {
      const install = await bundle(cuts.reduce((s, [a, b]) => s.replace(a, b), pageSrc), 'cut');
      globalThis.__SSHB_CUTS = new Set(['outside', 'jump', 'proxied', 'live', 'onclose', 'prefill', 'refill']); C = await page(install);
      globalThis.__SSHB_CUTS = new Set(['other']); D = await page(install);
    } catch (e) { ok(false, 'CONTROL: the cut page runs', String(e && e.message)); }
    globalThis.__SSHB_CUTS = null;
    if (C) {
      ok(!/line 18: Match host gpu-04/.test(C.every) && !/line 1: ForwardAgent yes/.test(C.every), 'CONTROL (RED): the step listing only the machine\'s own block — the Match block and the line before any Host are silent', C.every);
      ok(C.chain.posts.length === 1 && C.optj.posts.length === 1 && C.optj.posts[0].body.jump === '-oProxyCommand=touch', 'CONTROL (RED): the form not asking the jump — an option-shaped jump is SENT', C.optj);
      ok(C.pull.jump.includes('access'), 'CONTROL (RED): the mount dialog not asking — a jump machine is offered read-write (SFTP), which would dial it directly', C.pull);
      ok(C.deadForm === 'filled' && C.deadInputs === '203.0.113.10', 'CONTROL (RED): Fill not asking whether its form lives — a closed form is filled (and «filled» said)', { dead: C.deadForm });
      ok(C.endedWithForm === false, 'CONTROL (RED): the form\'s close not ending its step — the step outlives its form (a later Fill writes into a form that is gone)', C.endedWithForm);
      ok(C.prefJump[0] === '10.20.0.9', 'CONTROL (RED): the SFTP prefill not asking — a jump machine\'s address behind the bastion is filled in', C.prefJump);
      ok(C.refill[3] === 'file', 'CONTROL (RED): a later fill not clearing the earlier fill\'s key-file choice — a block with no key still logs in with the old file', C.refill);
    }
    if (D) ok(D.endedByOther === false, 'CONTROL (RED): another form\'s press not ending the open step — ⑦\'s «another form\'s press ends it» goes red', { ended: D.endedByOther, filled: D.filledOther, diag: D.tieDiag });
  }
}

report();

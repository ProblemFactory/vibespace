#!/usr/bin/env node
// The sysinfo device op (2.314.0, CS separation): local and remote machine
// snapshots share ONE implementation (src/sysinfo.js) — the daemon bundles it
// and runs it where the facts live. This was a missed twin-set: the local
// panel and the ssh script each interpreted "used memory" separately, and the
// interpretations DRIFTED (the false-100% incident: raw memory.current vs
// working set). Pins: (1) the op returns the module's own shape byte-
// compatible with the local read; (2) the capability gates an old daemon;
// (3) the ssh-script fallback's parse still yields the same field names. (4c) B-460d's remainder: a paired machine's
// conversation starts below its machine's agent — this real agent, the started process's niceness read from /proc.
import { endDaemonsAndWait, DAEMON_ROOT_ENV, DAEMON_ARGV, DAEMON_COMM } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
// B-69a7 (主开发 r1056 3): the left-behind legs' DETACHED GRANDCHILDREN (a stand-in for what a tool leaves behind) are HELD by the
// identity their own parent read while it still held them (pid + start time from /proc, the boot's id), and ended at the leg's end
// through src/proc-identity.js signalIdentity — judged again at the signal — never by a pid and a name read back
const PI = require(REPO + '/src/proc-identity.js');
const HELD_KIDS = [];
const detachedHeld = (sid) => {
  const [pid, starttime] = String(execFileSync(process.execPath, ['-e', "const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { detached: true, stdio: 'ignore', env: process.env }); c.unref(); const s = require('fs').readFileSync('/proc/' + c.pid + '/stat', 'utf8'); console.log(c.pid + ' ' + s.slice(s.lastIndexOf(')') + 2).split(' ')[19]);"], { env: { PATH: process.env.PATH, CLAUDE_WEBUI_SESSION_ID: sid } })).trim().split(' ').map(Number);
  HELD_KIDS.push({ pid, starttime, bootId: PI.bootIdOf() });
  return pid;
};
const endHeldKids = () => { for (const id of HELD_KIDS.splice(0)) PI.signalIdentity(id, 'SIGKILL'); };

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sysop-'));
process.env.HOME = home;
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sysop-data-'));

const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
// B-b403: the daemon is ended ONCE — by the leg after the ops, else at exit (a red, a throw) — by the IDENTITY of this run's own
// unique root (endDaemonsAndWait: a daemon whose VIBESPACE_AGENTD_ROOT lies under the mkdtemp root above), never a pid by name.
// The ender takes a /tmp scratch root only (scratch.mjs endDaemonsOf); the leg follows that rule (a TMPDIR elsewhere is said)
const enderTakes = path.resolve(String(process.env.VIBESPACE_AGENTD_ROOT || '')).startsWith('/tmp/');
// B-b403 cure 2 (主开发 06:13Z): OFF /tmp the ender refuses the root (endDaemonsOf's rule), so the daemon is ended by ITS OWN pid —
// the one it wrote in <root>/state/agentd.pid, taken only while that process names this very root (VIBESPACE_DEVICE_ROOT /
// VIBESPACE_AGENTD_ROOT, as the ender reads them) and is a daemon (comm or argv); anything else is refused by name, never signalled.
// The identity is the ender's own (scratch.mjs DAEMON_ROOT_ENV / DAEMON_COMM / DAEMON_ARGV, cure 3), never a copy. Said limit: only
// the pid in the pid file is ended — a self-upgrade re-exec child that has not yet written its pid would be missed; this suite runs
// bundle 0.0.0-t against the version it expects, so its daemon never self-upgrades
const endOwnDaemonByPid = (root, { waitMs = 5000 } = {}) => {
  const r = path.resolve(String(root || '')), under = (v) => !!v && (path.resolve(v) === r || path.resolve(v).startsWith(r + '/'));
  const tmpR = path.resolve(os.tmpdir());
  if (tmpR === '/') return { pid: null, why: 'the temp folder is / — no root can be told from a person\'s own here: refused' };
  if (!r.startsWith(tmpR + '/')) return { pid: null, why: `root ${r} is not under this process's temp folder — refused` };   // never a person's own root
  let pid = 0; try { pid = Number(fs.readFileSync(path.join(r, 'state', 'agentd.pid'), 'utf8').trim()); } catch { return { pid: null, why: 'no pid file' }; }
  const gone = () => { try { return /^\d+ \([^)]*\) [ZX]/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; } };
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return { pid, why: 'not a pid' };
  if (gone()) return { pid, gone: true, why: 'already gone' };
  let env = [], comm = '', argv = []; try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0'); comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { }
  const mine = DAEMON_ROOT_ENV.some((n) => under((env.find((kv) => kv.startsWith(n + '=')) || '').slice(n.length + 1)));
  if (!mine || !(comm.startsWith(DAEMON_COMM) || argv.some((a) => DAEMON_ARGV.test(a)))) return { pid, why: `pid ${pid} is not this root's daemon — refused, not signalled` };
  try { process.kill(pid, 'SIGKILL'); } catch { }
  const end = Date.now() + waitMs; while (!gone() && Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  return { pid, gone: gone() };
};
let daemonEnded = false;
process.on('exit', () => { if (!daemonEnded) try { daemonEnded = true; if (enderTakes) endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); else endOwnDaemonByPid(process.env.VIBESPACE_AGENTD_ROOT); } catch { } });
await dm.connect();   // after the exit hook: a throw here no longer leaks the daemon (cure 2, the reader's note)

// 1. capability advertised + op works against a REAL daemon
const conn = await dm.connect();
ok(conn.info?.capabilities?.includes?.('sysinfo'), 'daemon advertises the sysinfo capability');
const r = await dm.sysinfo();
ok(r && r.mem && Number.isFinite(r.mem.used) && Number.isFinite(r.mem.limit), `op returns mem used/limit (${Math.round((r?.mem?.used || 0) / 1048576)}M / ${Math.round((r?.mem?.limit || 0) / 1073741824)}Gi)`);
ok(Number.isFinite(r.mem.pct), 'mem.pct computed');
ok(Array.isArray(r.load) && r.load.length === 3, 'loadavg triple');
ok(Number.isFinite(r.cpus) && r.cpus > 0, 'cpu count');
ok(Array.isArray(r.procs) && r.procs.length > 0 && r.procs.every((p) => p.pid && Number.isFinite(p.rss)), 'top procs with pid+rss');

// 2. SAME implementation: the op's numbers come from the module the server
// itself runs — mem.limit must agree exactly (same cgroup/host source).
const sysinfo = require(REPO + '/src/sysinfo.js');
const local = await sysinfo.read(process.cwd());
ok(r.mem.limit === local.mem.limit, `op limit === local module limit (one source: ${r.mem.source})`);
ok(r.mem.source === local.mem.source, `same source tag both sides (${r.mem.source})`);

// 3. drift guard: the ssh fallback script must keep producing the SAME field
// names the route serves, or a daemon-less host silently changes shape.
const srv = fs.readFileSync(path.join(REPO, 'src/server/sysinfo-wiring.js'), 'utf-8'); // moved in decomposition #3
ok(/REMOTE_SYSINFO_SCRIPT[\s\S]{0,200}FALLBACK RUNG/i.test(srv) || /fallback rung/i.test(srv.slice(srv.indexOf('REMOTE_SYSINFO_SCRIPT') - 800, srv.indexOf('REMOTE_SYSINFO_SCRIPT'))), 'script is documented as the fallback rung');
ok(/dm\.sysinfo\(\)/.test(srv), 'remoteSysinfo tries the device op first');
const cli = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf-8');
ok(/daemon lacks sysinfo \(capabilities gate\)/.test(cli), 'client refuses old daemons via the capability gate');

// 4. proc-list op (2.354.0, the process manager): capability + full-table
// shape + the same-module parity that keeps local and remote in one truth.
ok(conn.info?.capabilities?.includes?.('proc-list'), 'daemon advertises the proc-list capability');
const pl = await dm.procList();
ok(Array.isArray(pl.procs) && pl.procs.length > 5, `proc-list returns a real table (${pl.procs?.length} rows of ${pl.total})`);
ok(pl.procs.every((p) => Number.isFinite(p.pid) && typeof p.user === 'string' && Number.isFinite(p.rss) && typeof p.cmd === 'string' && typeof p.state === 'string'), 'rows carry pid/user/rss/cmd/state');
ok(Number.isFinite(pl.total) && pl.total >= pl.procs.length, 'total count >= transported rows');
const localPl = await sysinfo.listProcs();
const localKeys = Object.keys(localPl.procs[0] || {}).filter((k) => k !== 'pcpuNow').sort().join(',');
const opKeys = Object.keys(pl.procs[0] || {}).filter((k) => k !== 'pcpuNow').sort().join(',');
ok(localKeys === opKeys && localKeys.length > 0, `op row shape === local module row shape (${opKeys})`);
// second call gives sampleProcCpu its delta baseline → live CPU% appears
const pl2 = await dm.procList();
ok(pl2.sampled === true && pl2.procs.some((p) => p.pcpuNow != null), 'second call carries live-sampled CPU% (linux delta)');
ok(/daemon lacks proc-list \(capabilities gate\)/.test(cli), 'proc-list client method is capability-gated');

// 4b. B-69a7 (round wz421di05, MUST 1): the left-behind op's reply is ROUTED back to its request — the client's id-routed reply
// list must name left-behind-result, or every read on a paired machine times out after 15 s. Driven through the hub's own
// DeviceManager against the REAL daemon; the conversation's chain known by the keeper's record in the daemon's own HOME
{
  ok(conn.info?.capabilities?.includes?.('left-behind'), 'daemon advertises the left-behind capability');
  const lbSid = `lb-op-${process.pid}`, lbMark = `CLAUDE_WEBUI_SESSION_ID=${lbSid}`;
  const detachedMarked = () => detachedHeld(lbSid);
  try {
    const keeper = detachedMarked();
    const leftover = detachedMarked();
    const attach = detachedMarked();   // a reconnect's attach client: known by the keeper's `.attach` record only
    fs.mkdirSync(path.join(home, '.vibespace', 'run'), { recursive: true });
    fs.writeFileSync(path.join(home, '.vibespace', 'run', lbSid + '.json'), JSON.stringify({ keeperPid: keeper }));
    fs.writeFileSync(path.join(home, '.vibespace', 'run', lbSid + '.attach'), JSON.stringify({ pid: attach }));
    const t = await dm.leftBehind({ mark: lbMark, ageMs: 5000, sid: lbSid });
    ok(Array.isArray(t.left) && t.left.some((x) => x.pid === leftover) && !t.left.some((x) => x.pid === keeper || x.pid === attach) && !t.unread, `left-behind answers through the hub's DeviceManager (its reply routed by id, never a 15 s time-out): the leftover named, the keeper's recorded processes (its meta, its attach client's record) not (${JSON.stringify(t.left.map((x) => x.pid))} · ${t.unread || 'read'})`);
    ok(t.left.every((x) => JSON.stringify(Object.keys(x).sort()) === '["comm","pid","start","startedAt"]'), 'the op\'s rows carry pid, command name and start time only');
    const u = await dm.leftBehind({ mark: lbMark, ageMs: 5000 });
    ok(u.unread === 'own-unknown' && Array.isArray(u.left) && u.left.length === 0, 'with no keeper sid the device knows no chain of the conversation: own-unknown, nothing named');
  } finally { endHeldKids(); }
}

// 4e. B-69a7 (b): THE END DOOR ON A PAIRED MACHINE — a person's press is the agent's own act (op left-behind-end), driven through the
// hub's DeviceManager against the REAL agent: the leftover its read named is ended THERE (its pid alone, after its start time and
// the conversation's mark are read again); a row whose start is not the process's own (a reused pid) is never signalled; the
// keeper's recorded process is held even when a row names it; no keeper sid = the chain not known: nothing ended. It reads process
// facts (Linux /proc).
{
  ok(conn.info?.capabilities?.includes?.('left-behind-end'), 'daemon advertises the left-behind-end capability');
  const sid = `lb-end-${process.pid}`, mark = `CLAUDE_WEBUI_SESSION_ID=${sid}`;
  const spawnMarked = () => detachedHeld(sid);
  const statOf = (p) => { try { return fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ').pop().split(' '); } catch { return null; } };
  const alive = (p) => { const s = statOf(p); return !!s && s[0] !== 'Z'; };
  try {
    const keeper = spawnMarked();
    const leftover = spawnMarked();
    const reused = spawnMarked();
    fs.mkdirSync(path.join(home, '.vibespace', 'run'), { recursive: true });
    fs.writeFileSync(path.join(home, '.vibespace', 'run', sid + '.json'), JSON.stringify({ keeperPid: keeper }));
    const t = await dm.leftBehind({ mark, ageMs: 5000, sid });
    const named = (p) => (Array.isArray(t.left) ? t.left : []).find((x) => x.pid === p);
    ok(t.canEnd === true && !!named(leftover) && !!named(reused) && !named(keeper), `the read says this agent ends a press's rows (canEnd) and names both leftovers, never the keeper (${JSON.stringify((t.left || []).map((x) => x.pid))})`);
    const rows = [named(leftover) || { pid: leftover, start: 0 }, { ...(named(reused) || { pid: reused, start: 0 }), start: Number((named(reused) || {}).start) + 1 }, { pid: keeper, start: Number((statOf(keeper) || [])[19]), comm: 'node' }].map(({ pid, start, comm }) => ({ pid, start, comm }));
    const e = await dm.leftBehindEnd({ mark, rows, sid, by: 'human:test' });
    console.log(`    (the press there: ${JSON.stringify(e)} · leftover ${alive(leftover) ? 'RUNS' : 'gone'} · reused ${alive(reused) ? 'runs' : 'GONE'} · keeper ${alive(keeper) ? 'runs' : 'GONE'})`);
    ok(e.ok === true && e.ended.length === 1 && e.gone === 1 && e.held === 1 && !alive(leftover) && alive(reused) && alive(keeper), 'left-behind-end ends the listed leftover ON the machine (its reply routed by id); a reused pid (another start) is never signalled; the keeper\'s recorded process is held');
    const nm = await dm.leftBehindEnd({ mark: 'PATH=/usr/bin', rows: [rows[1]], sid, by: 'human:test' });
    const blind = await dm.leftBehindEnd({ mark, rows: [{ ...rows[1], start: Number((statOf(reused) || [])[19]) }], by: 'human:test' });
    ok(nm.ok === false && nm.reason === 'no-mark' && blind.ok === false && blind.reason === 'own-unknown' && alive(reused) && alive(keeper), 'the op refuses any variable but a conversation\'s mark, and with no keeper sid (the chain not known) it ends nothing — even a row whose start is right');
  } finally { endHeldKids(); }
}

// 4c. B-460d's remainder (主开发 r486 / r494): A PAIRED MACHINE'S CONVERSATION STARTS BELOW ITS MACHINE'S AGENT — this REAL agent
// (the built bundle) is the stand-in paired machine. Its hello names its own nice program (the shared look, src/nice-program.js);
// the dial road's spec (src/spawn/line.js withPriority + src/server/spawn-priority.js devicePriorityFor — the SAME verdict the
// hub's own starts take) is opened as a pipe session, and the started process and its child are read from THEIR OWN process
// entries (/proc/<pid>/stat, the niceness field): the agent's own + 5. The setting off and an older agent's hello (no nicePath)
// = the release's spec byte for byte, at the agent's own; the same judge on the spec with the prefix dropped is RED (the
// control). It reads process facts (Linux /proc). nice and sleep run by their own names, never a copy under another name (a
// multi-call program decides what it is by its file name). The leg ends its own sleep child, by pid, after its parent is
// proven the session's shell; the shell then exits by itself.
{
  const SPRI = require(REPO + '/src/server/spawn-priority.js'), NP = require(REPO + '/src/nice-program.js'), { withPriority } = require(REPO + '/src/spawn/line.js');
  const hello = (() => { try { return dm.helloInfo(); } catch { return null; } })() || conn.info || {};
  const own = NP.niceProgram();
  ok(typeof own === 'string' && hello.nicePath === own && NP.NICE_DIRS.includes(path.dirname(own)), `the REAL agent's hello names its own nice program — the shared look's answer on this machine (${hello.nicePath})`);
  const statOf = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.lastIndexOf(')') + 2).split(' '); } catch { return null; } };
  const niceOf = (pid) => { const f = statOf(pid); return f ? Number(f[16]) : NaN; };
  const ppidOf = (pid) => { const f = statOf(pid); return f ? Number(f[1]) : NaN; };
  const gone = (pid) => { const f = statOf(pid); return !f || f[0] === 'Z' || f[0] === 'X'; };
  const agentPid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8').trim());
  const agentNice = niceOf(agentPid), want = Math.min(19, agentNice + 5);
  const tag = `vs460-${process.pid}`, started = [];
  const scriptOf = () => `: ${tag}; sleep 30 & echo $! > "$VS460_PID"; wait`;   // the pid file's path rides the session's env (any TMPDIR spelling)
  const openRead = async (pri, n) => {   // the spec the dial road builds, opened on the real agent → its words + [the started process's niceness, its child's]
    const spec = withPriority({ cmd: 'sh', args: ['-lc', scriptOf(n)] }, pri.priority), pidFile = path.join(home, `${tag}-${n}.pid`);
    const h = await dm.openPipeSession({ sid: `${tag}-${n}`, ...spec, cwd: home, env: { VS460_PID: pidFile } });
    const r = await h.ready;
    let child = 0;
    { const end = Date.now() + 10000; while (!(child = Number((() => { try { return fs.readFileSync(pidFile, 'utf8').trim(); } catch { return ''; } })())) && Date.now() < end) await new Promise((res) => setTimeout(res, 20)); }   // the child's pid written: the condition, not a clock
    started.push({ sh: r.pid, child, h });
    return { spec, nice: [niceOf(r.pid), child && ppidOf(child) === r.pid ? niceOf(child) : NaN] };
  };
  try {
    const lowP = SPRI.devicePriorityFor({ hello }), low = await openRead(lowP, 'low');
    const offP = SPRI.devicePriorityFor({ serverSetting: (k) => (k === SPRI.SETTING ? false : undefined), hello }), off = await openRead(offP, 'off');
    const oldP = SPRI.devicePriorityFor({ hello: { ...hello, nicePath: undefined } }), old = await openRead(oldP, 'old');
    const release = (n) => JSON.stringify({ cmd: 'sh', args: ['-lc', scriptOf(n)] });   // the spec the release sends
    const lowered = (x) => x.nice.length === 2 && x.nice.every((v) => v === want);
    // r598: judged at ANY niceness — min(19, the agent's + 5); at 19 itself no step can be shown: a judged PREMISE row, said by name
    const premise = agentNice >= 19;
    ok(lowP.priority && lowP.fact.by === 5 && low.spec.cmd === own && JSON.stringify(low.spec.args.slice(0, 4)) === JSON.stringify(['-n', '5', 'sh', '-lc']) && (premise ? low.nice.length === 2 && low.nice.every((v) => v === 19) : lowered(low)),
      premise ? `PREMISE (judged): the agent runs at niceness 19, the cap — the dial road's spec still starts with ITS nice (${low.spec.cmd} -n 5 sh -lc …), and no step below 19 can be shown (read ${JSON.stringify(low.nice)})`
        : `REAL agent: the dial road's spec starts with ITS nice (${low.spec.cmd} -n 5 sh -lc …); the started process and its child, each read from its own /proc entry, run at niceness ${want} — the agent's ${agentNice} + 5, at most 19 (read ${JSON.stringify(low.nice)})`);
    ok(offP.priority === null && offP.fact.why === 'off' && JSON.stringify(off.spec) === release('off') && off.nice.every((v) => v === agentNice),
      `the setting off: the release's spec byte for byte, both at the agent's own niceness ${agentNice} (read ${JSON.stringify(off.nice)}), the fact «off in Settings» (r705 (1))`);
    ok(oldP.priority === null && oldP.fact.why === 'remote' && JSON.stringify(old.spec) === release('old') && old.nice.every((v) => v === agentNice),
      `an OLDER agent (a hello with no nicePath): the release's spec byte for byte, never asked anything new, at its own niceness (read ${JSON.stringify(old.nice)})`);
    if (!premise) ok(!lowered(off) && !lowered(old), 'RED CONTROL: the same judge on the spec with the prefix dropped (the release\'s) reads NOT lowered — this leg can go red');
  } finally {
    for (const s of started) {
      if (s.child && ppidOf(s.child) === s.sh) { try { process.kill(s.child, 'SIGKILL'); } catch { } }   // this leg's own sleep (its parent: the session's shell)
      try { s.h.kill(); } catch { }
    }
    const end = Date.now() + 5000;
    while (started.some((s) => !gone(s.sh) || (s.child && !gone(s.child))) && Date.now() < end) await new Promise((res) => setTimeout(res, 20));   // gone: the condition
    ok(started.every((s) => gone(s.sh) && (!s.child || gone(s.child))), `the leg's own processes are gone (${started.length} shells and their children)`);
  }
}

// 4d. B-e7c0 (r723): a subscription pick's merge of the person's own settings file, made ON the device by its agent — driven through
// the hub's own DeviceManager against the REAL daemon (a scratch HOME stands in for the paired machine)
{
  ok(conn.info?.capabilities?.includes?.('settings-merge'), 'daemon advertises the settings-merge capability');
  const proj = path.join(home, 'proj'); fs.mkdirSync(proj, { recursive: true });
  const KEY = ['sk', 'ant', 'api03', 'stand-in'].join('-');   // built at run time
  fs.writeFileSync(path.join(proj, 'my-settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo checked' }] }] }, permissions: { deny: ['Bash(rm -rf:*)'] }, env: { ANTHROPIC_BASE_URL: 'https://elsewhere.example', ANTHROPIC_API_KEY: KEY, MINE: 'yes' } }));
  const layer = { apiKeyHelper: '', outputStyle: 'Concise' }, sid = `sm-${process.pid}`;
  const r = await dm.settingsMerge({ sid, cwd: proj, ownFile: 'my-settings.json', layer, by: 'system:test' });
  let merged = {}, mode = 0;
  try { merged = JSON.parse(fs.readFileSync(r.path, 'utf8')); mode = fs.statSync(r.path).mode & 0o777; } catch { }
  console.log(`    (the device wrote ${r.path || r.reason} · mode ${mode.toString(8)} · keys ${Object.keys(merged).join(', ')} · env ${Object.keys(merged.env || {}).join(', ')} · dropped ${(r.dropped || []).join(', ')})`);
  ok(r.ok === true && r.path === path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'settings', `${sid}.settings`) && mode === 0o600,
    'settings-merge answers through the hub\'s DeviceManager (its reply routed by id): the device wrote <its state>/settings/<sid>.settings, 0600 — a path it made itself');
  ok(merged.hooks && JSON.stringify(merged.permissions) === JSON.stringify({ deny: ['Bash(rm -rf:*)'] }) && merged.env.MINE === 'yes' && !('ANTHROPIC_BASE_URL' in merged.env) && !('ANTHROPIC_API_KEY' in merged.env) && merged.apiKeyHelper === '' && merged.outputStyle === 'Concise'
    && r.dropped.includes('ANTHROPIC_BASE_URL') && r.dropped.includes('ANTHROPIC_API_KEY') && !JSON.stringify(r).includes(KEY),
    'the device\'s merge: the person\'s hooks and deny rules KEPT, the route and the credential DROPPED (their names said, never a value), the start\'s layer LAST — the file\'s text never in the answer');
  const bad = await dm.settingsMerge({ sid: '../escape', cwd: proj, ownFile: 'my-settings.json', layer, by: 'system:test' });
  const big = await dm.settingsMerge({ sid, cwd: proj, ownFile: 'my-settings.json', layer: { k: 'x'.repeat(70000) }, by: 'system:test' });
  const unplaced = await dm.settingsMerge({ sid, cwd: proj, ownFile: '~bob/x.json', layer, by: 'system:test' });
  ok(bad.ok === false && bad.reason === 'bad-sid' && !fs.existsSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'escape.settings')) && big.reason === 'layer-too-large' && unplaced.reason === 'own-file-unplaced',
    'the device refuses BY NAME: an id outside its closed alphabet (nothing written), a layer over its bound, a file its own placement rule cannot place', { bad, big, unplaced });
  const { DeviceManager: DMC } = require(REPO + '/src/agentd/client.js');
  let asked = false, oldErr = null;
  try { await DMC.prototype.settingsMerge.call({ connect: async () => ({ info: { capabilities: ['probe', 'sysinfo'] } }), _request: async () => { asked = true; return {}; } }, { sid, layer, by: 'system:test' }); } catch (e) { oldErr = e; }
  ok(!!oldErr && oldErr.code === 'host_needs_daemon' && asked === false, 'an OLD agent (no settings-merge in its hello) is NEVER asked: the client refuses before any request (an unknown op would hang)', oldErr && oldErr.message);
}

// 5. the shared parser + cap (the ssh fallback rung's interpretation)
// the probe must never list ITSELF (owner report: a 200% `ps` topped the CPU
// sort forever — ps computes %CPU over its own ~10ms lifetime and its pid is
// new every poll, so the live-delta correction never applies)
const withProbe = sysinfo.parsePsProcs(`me 50 1 200 0.0 6000 R+ 00:00 ps axo ${sysinfo.PS_COLUMNS}\nme 51 1 150 0.0 2000 S+ 00:00 sh -c ps axo ${sysinfo.PS_COLUMNS}\nme 52 1 1.0 0.0 3000 S+ 05:00 ps aux\n`);
ok(withProbe.length === 1 && withProbe[0].pid === 52, 'own probe rows (incl. sh -c wrapper) are dropped; a user ps aux stays');
const livePl = await sysinfo.listProcs();
ok(!livePl.procs.some((p) => p.cmd.includes(sysinfo.PS_COLUMNS)), 'live table carries no self-probe row');
const parsed = sysinfo.parsePsProcs('root     1     0  0.1  0.2  1234 Ss   10:33 /sbin/init splash\nme   22 1 99.5 1.0 2048 R+ 1-02:03:04 node server.js --flag\n\nbadline\n');
ok(parsed.length === 2 && parsed[0].pid === 1 && parsed[0].user === 'root' && parsed[0].rss === 1234 * 1024, 'parsePsProcs: fields land (pid/user/rss)');
ok(parsed[1].pcpu === 99.5 && parsed[1].etime === '1-02:03:04' && parsed[1].cmd === 'node server.js --flag', 'parsePsProcs: cpu/etime/multi-word cmd');
const many = Array.from({ length: 500 }, (_, i) => ({ pid: i + 1, rss: i, pcpu: i === 3 ? 99 : 0 }));
const capped = sysinfo.capProcs(many, 100);
ok(capped.length === 100 && capped.some((p) => p.pid === 4), 'capProcs keeps the CPU-hot row even when RSS-cold');
// review pins (2.354.0): a LIVE-hot process must survive the cap even when
// its lifetime pcpu is flatlined at 0 — pcpuNow participates in the rank
const live = Array.from({ length: 500 }, (_, i) => ({ pid: i + 1, rss: i, pcpu: 0, pcpuNow: i === 7 ? 98 : 0 }));
ok(sysinfo.capProcs(live, 100).some((p) => p.pid === 8), 'capProcs ranks by live pcpuNow, not just the flatlined lifetime average');
ok(sysinfo.capProcs(many, -5).length > 0 && sysinfo.capProcs(many, 3.7).length >= 20, 'capProcs clamps a hostile max');
const siSrc = fs.readFileSync(path.join(REPO, 'src/sysinfo.js'), 'utf-8');
ok(siSrc.indexOf('sampleProcCpu(all)') !== -1 && siSrc.indexOf('sampleProcCpu(all)') < siSrc.indexOf('capProcs(all, max)'), 'listProcs samples the WHOLE table before capping (cap-by-flatlined-pcpu bug)');
// THE `ps` READ IS BOUNDED BY A THING THAT ONLY GROWS (2026-09-07). node's
// `maxBuffer` overflow is an ERROR, not a truncation, and `topProcs` reads that
// error as "no --sort, this must be BSD ps" — so on a busy machine the primary
// read overflowed, the fallback overflowed on the SAME bytes, and it resolved
// `[]`. The daemon op then reported NO processes, which is indistinguishable
// from a machine with nothing running. Measured on this host: 2574 processes =
// 4.64 MB, over the old 4 MiB cap; the op assert above is what caught it.
{
  const cap = /const PS_MAX_BUFFER = (\d+) \* 1024 \* 1024;/.exec(siSrc);
  ok(!!cap && Number(cap[1]) >= 32, `the ps reads declare ONE bound, and it is not the 4 MiB a busy machine passes (${cap ? cap[1] : '?'} MiB)`);
  // BOTH reads of the same table share it: one being able to answer while the
  // other cannot is a difference with no meaning.
  ok((siSrc.match(/maxBuffer: PS_MAX_BUFFER/g) || []).length === 3
    && !/maxBuffer: \d+ \* 1024 \* 1024/.test(siSrc.replace(/const PS_MAX_BUFFER[^\n]*\n/, '')),
    'every ps read uses that ONE bound — no per-call number left to drift');
  // …and the failure MODE is the reason the number matters: prove that an
  // overflow really does surface as an error the BSD fallback cannot tell from
  // a missing `--sort`, so a future reader cannot decide the cap is cosmetic.
  const { execFile } = await import('node:child_process');
  const overflow = await new Promise((res) => {
    execFile('ps', ['aux'], { timeout: 5000, maxBuffer: 4096 }, (e, out) => res({ code: e && e.code, killed: e && e.killed, bytes: (out || '').length }));
  });
  ok(overflow.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' && !overflow.killed,
    'an over-cap `ps` FAILS (it does not truncate) — which is why the fallback rung cannot tell it apart from a BSD `ps`, and why the bound must fit the table',
    JSON.stringify(overflow));
  // POSITIVE CONTROL, against the real machine: the shipped read answers here.
  const live = await sysinfo.read(process.cwd());
  ok(Array.isArray(live.procs) && live.procs.length > 0 && live.procs.every((x) => x.pid && Number.isFinite(x.rss)),
    `the local read really answers on THIS machine's process table (${live.procs.length} rows)`,
    JSON.stringify((live.procs || []).slice(0, 1)));
}
// THE SIGNAL VERDICT'S EXISTENCE PROBE (B-3185 r6). It used to be spelled
// `ps -p ${pid}` at BOTH sites, pinned here as "never kill -0" — and that pin
// was half a truth: a BARE `kill -0` really would report every
// permission-denied kill as "no such process" (kill(2) with sig 0 runs the
// same permission check), but `ps -p` has no `-p` under busybox at all, so on
// such a host the post-signal aliveness check answered OK-GONE for a LIVE
// process and signalProc returned `{ok:true, gone:true}` — a manufactured
// success, not a mislabel. Both sites now call the SHARED `vs_alive` ladder
// (src/cli-identity.js), in which a `kill -0` FAILURE is handed to
// `[ -d /proc/N ]` and then `ps -p N` rather than believed. The functional
// legs (busybox, live pids, negative controls) are test-writer-sweep §17;
// these are the structural pins that keep this file's copy honest.
const { signalVerdictScript } = require(REPO + '/src/server/sysinfo-wiring.js');
const sigText = signalVerdictScript(4242, 'TERM');
ok(!/else if kill -0 \d/.test(sigText) && !/if kill -0 \d/.test(sigText),
  'signal verdict never uses a BARE kill -0 as the EPERM/ESRCH split (its failure is ambiguous)');
ok(!/ps -p \d+/.test(sigText) && !/ps -p \$\{pid\}/.test(srv),
  'signal verdict carries no bare `ps -p <pid>` existence test (busybox `ps` has no -p)');
ok(sigText.includes(require(REPO + '/src/cli-identity.js').pidAliveShellFn()),
  'signal verdict embeds the SHARED vs_alive ladder verbatim — one probe, one author, no per-site reason to get wrong');

// ── A BUSY MACHINE MUST NOT PRODUCE AN EMPTY PROCESS LIST (2026-09-07) ────
// Found by this very suite going red on the dev box: `ps aux` output is ~1.8 KB
// per process once command lines are long, and at 2,404 processes it measured
// 4,258,412 bytes — past topProcs()'s old 4 MiB maxBuffer. execFile then kills
// `ps`, both legs error, and the old code `resolve([])`d SILENTLY, so
// `read().procs` was empty exactly on the machines whose process list matters
// (it also feeds the memory-pressure alert's "top: …" line, which is printed
// *because* the box is under pressure). Proven here with a fake `ps` on PATH
// that emits more than the old buffer, in a child process so PATH never leaks
// into the rest of the suite — plus the pre-fix buffer as the NEGATIVE
// CONTROL, because an assert that cannot fail is not an assert.
{
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fakeps-'));
  // ~6 MiB of plausible `ps aux` / `ps axo` output: over the old 4 MiB
  // topProcs cap, under the new 64 MiB one.
  fs.writeFileSync(path.join(bin, 'ps'), `#!/usr/bin/env node
const n = 3000, pad = 'x'.repeat(2000);
const rows = [];
for (let i = 0; i < n; i++) rows.push(\`me \${1000 + i} 0.1 0.2 123456 \${5000 + i} ?  Sl  09:00 0:01 /usr/bin/thing-\${i} --flag \${pad}\`);
process.stdout.write('USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND\\n' + rows.join('\\n') + '\\n');
`);
  fs.chmodSync(path.join(bin, 'ps'), 0o755);
  const probe = path.join(bin, 'probe.mjs');
  fs.writeFileSync(probe, `import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(REPO + '/x.js')});
const s = require(${JSON.stringify(REPO + '/src/sysinfo.js')});
const r = await s.read(process.cwd());
console.log(JSON.stringify({ procs: (r.procs || []).length, ok: (r.procs || []).every((p) => p.pid && Number.isFinite(p.rss)) }));
`);
  const run = (env) => {
    const r = spawnSync(process.execPath, [probe], { encoding: 'utf-8', timeout: 60000, env });
    try { return JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { return { procs: -1, ok: false, raw: (r.stdout || '') + (r.stderr || '') }; }
  };
  const withFake = { ...process.env, PATH: bin + ':' + process.env.PATH };
  const got = run(withFake);
  ok(got.procs > 0 && got.ok, `a ps table BIGGER than the pre-fix 4 MiB buffer still yields processes (${got.procs} rows)`);
  // NEGATIVE CONTROL: the same fake `ps` against a copy of sysinfo.js with the
  // pre-fix buffer spliced back in must produce the empty list this fixes.
  const src = fs.readFileSync(path.join(REPO, 'src/sysinfo.js'), 'utf-8');
  const before = editAnchor(src, /const PS_MAX_BUFFER = [^;]+;/, 'const PS_MAX_BUFFER = 4 * 1024 * 1024;', "src/sysinfo.js");
  ok(before !== src, 'NEGATIVE CONTROL patch applied (the buffer constant is where the fix lives)');
  // THE COPY THROUGH scripts/mutant-copy.mjs (B-f276 slice resource-history, lane nl-paired): its require bound to the real
  // file's place, so the module's relative requires resolve (./store-read.js since that slice) — a copy written bare into the
  // temp folder failed to load, and the probe read «-1 rows»
  const patched = mutantCopies('sysinfo-op-prefix', REPO).write('src/sysinfo.js', before, 'prefix-buffer');
  fs.writeFileSync(probe, fs.readFileSync(probe, 'utf-8').replace(JSON.stringify(REPO + '/src/sysinfo.js'), JSON.stringify(patched)));
  const ctl = run(withFake);
  ok(ctl.procs === 0, `NEGATIVE CONTROL: with the pre-fix 4 MiB buffer the SAME table yields an EMPTY list (${ctl.procs} rows${ctl.procs < 0 ? ` — the copy did not run: ${String(ctl.raw || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300)}` : ''}) — silently, which is what this fixes`);
  try { fs.rmSync(bin, { recursive: true, force: true }); } catch {}
}

try { await dm.stop?.(); } catch { }
// B-b403 (lane bl-scratch, 2026-11-17): the daemon is setsid-detached by design (it outlives a hub), and dm.stop() drops the link
// only — so it outlived every run, adopted by the user manager. The suite ends the daemon of its own root, and waits.
{
  if (!enderTakes) { daemonEnded = true; const e = endOwnDaemonByPid(process.env.VIBESPACE_AGENTD_ROOT); ok(e.gone === true, `B-b403: the daemon root ${process.env.VIBESPACE_AGENTD_ROOT} lies outside /tmp, where endDaemonsOf refuses a root by its rule — so the suite ends its daemon by its own pid, identity-checked (${JSON.stringify(e)})`); }
  else {
    let e = null; daemonEnded = true; try { e = endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); } catch (err) { e = { error: err.message }; }
    ok(!!e && e.pids?.length >= 1 && e.gone === true, `B-b403: the suite ends its device daemon (by its own root's identity) before it ends (${JSON.stringify(e)})`);
  }
}
// B-b403 cure 2: the pid road, proven on every box (the test machines' TMPDIR is /tmp, so the real daemon never takes it there) —
// a stand-in daemon (node running a file named agentd.js, its root in its env), alive and named by its root's pid file, ends. RED
// CONTROLS, each planted in that file, refused and alive: a stranger of another root (the root check), a process of this root that
// is not a daemon (the comm / argv check); and a root outside the temp folder is refused before anything is read. The stand-ins
// share the suite's group and end when their stdin closes, so a signal to the suite never leaves them behind
{
  const { spawn: spawnSD } = await import('node:child_process');
  const sd = path.join(home, 'pid-road'), rootA = path.join(sd, 'root-a'), rootB = path.join(sd, 'root-b');
  fs.mkdirSync(path.join(rootA, 'state'), { recursive: true });
  const STAND_IN = "process.stdin.on('end', () => process.exit(0)); process.stdin.on('error', () => process.exit(0)); process.stdin.resume();\n";
  for (const f of ['agentd.js', 'helper.js']) fs.writeFileSync(path.join(sd, f), STAND_IN);
  const start = (root, file) => spawnSD(process.execPath, [path.join(sd, file)], { env: { PATH: process.env.PATH, VIBESPACE_AGENTD_ROOT: root }, stdio: ['pipe', 'ignore', 'ignore'] });
  const a = start(rootA, 'agentd.js'), b = start(rootB, 'agentd.js'), c = start(rootA, 'helper.js');
  const endSD = () => { for (const k of [a, b, c]) { try { if (k.exitCode === null && k.signalCode === null) k.kill('SIGKILL'); } catch { } } };
  process.once('exit', endSD);
  const execd = (k, f) => { try { return fs.readFileSync(`/proc/${k.pid}/cmdline`, 'utf8').includes(f); } catch { return false; } };
  { const end = Date.now() + 5000; while (!(execd(a, 'agentd.js') && execd(b, 'agentd.js') && execd(c, 'helper.js')) && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); }   // the condition, not a clock
  const lives = (p) => { try { return !/^\d+ \([^)]*\) [ZX]/.test(fs.readFileSync(`/proc/${p}/stat`, 'utf8')); } catch { return false; } };
  const plant = (k) => { fs.writeFileSync(path.join(rootA, 'state', 'agentd.pid'), String(k.pid)); return endOwnDaemonByPid(rootA); };
  const stranger = plant(b), notDaemon = plant(c), outside = endOwnDaemonByPid(path.resolve(os.tmpdir(), '..', `vs-outside-root-${process.pid}`));
  const aliveBefore = lives(a.pid), ended = plant(a);
  ok(aliveBefore && ended.gone === true && !ended.why, `B-b403 cure 2: off /tmp the daemon is ended by its own pid, identity-checked — the root's daemon, alive, ends (${JSON.stringify(ended)})`);
  ok(/refused/.test(stranger.why || '') && lives(b.pid) && /refused/.test(notDaemon.why || '') && lives(c.pid) && /not under this process's temp folder/.test(outside.why || ''),
    `B-b403 cure 2 CONTROLS: refused and alive — a stranger of another root (${stranger.why}), this root's process that is not a daemon (${notDaemon.why}); a root outside the temp folder (${outside.why})`);
  endSD();
}
// ── 2.369.68: `ps` output past 4 MiB must not empty the top-procs list ──
{
  const os = await import('node:os'); const fs = await import('node:fs'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-fatps-'));
  const fake = path.join(dir, 'ps');
  // a fake `ps` printing 5.5 MB: 25k rows of ~220 chars in `ps aux` shape
  fs.writeFileSync(fake, `#!/usr/bin/env node
const hdr = 'USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND';
const rows = [hdr];
for (let i = 1; i <= 25000; i++) rows.push('u ' + i + ' 0.1 0.2 100000 ' + (900000 - i) + ' ? S 18:00 0:00 /bin/proc-' + i + ' ' + 'x'.repeat(180));
process.stdout.write(rows.join('\\n') + '\\n');
`, { mode: 0o755 });
  const src = fs.readFileSync(new URL('../src/sysinfo.js', import.meta.url), 'utf8');
  ok(/PS_MAX_BUFFER = (32|64) \* 1024 \* 1024/.test(src) && !/maxBuffer: [48] \* 1024 \* 1024/.test(src), 'every ps call carries the shared ≥32 MiB bound (64 MiB since the gate-split merge; the 4/8 MiB literals are gone)');
  const { execFileSync } = await import('node:child_process');
  const run = (buf) => execFileSync(process.execPath, ['-e', `
    const cp = require('node:child_process'); const orig = cp.execFile;
    cp.execFile = (cmd, args, opts, cb) => orig(cmd, args, { ...opts, maxBuffer: ${buf} }, cb);
    const si = require(${JSON.stringify(path.resolve('src/sysinfo.js'))});
    si.read(process.cwd()).then((r) => { console.log(JSON.stringify({ n: (r.procs || []).length, pid: r.procs?.[0]?.pid, rss: r.procs?.[0]?.rss })); });
  `], { env: { ...process.env, PATH: dir + ':' + process.env.PATH }, encoding: 'utf8', timeout: 60000 }).trim();
  const fixed = JSON.parse(run(32 * 1024 * 1024));
  ok(fixed.n > 0 && Number.isFinite(fixed.rss) && fixed.pid === 1, `a 5.5 MB ps table still yields top procs (${fixed.n} rows, top pid ${fixed.pid})`);
  const old = JSON.parse(run(4 * 1024 * 1024));
  ok(old.n === 0, 'NEGATIVE CONTROL: the old 4 MiB bound turns the same table into an EMPTY list (the gate-red shape)');
  fs.rmSync(dir, { recursive: true, force: true });
}

// lane ledger-dedup-law F5: THE command-line reader is the shared module's — the memory notice names its stranger with it,
// the bundled daemon carries the same function, and it reads the same command line the process table shows
{
  const si = require(REPO + '/src/sysinfo.js');
  const bundle = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-agentd.js'), 'utf8');
  ok(typeof si.cmdlineHead === 'function' && /function cmdlineHeadOf\(/.test(bundle), 'F5: cmdlineHead lives in src/sysinfo.js — the daemon bundle carries the same reader (one implementation)');
  const table = await si.listProcs({ max: 2000 });
  const me = table.procs.find((p) => p.pid === process.pid);
  const head = await si.cmdlineHead(process.pid);
  ok(me && head && me.cmd.startsWith(head.replace(/…$/, '').slice(0, 60)), `F5 parity: /proc/<pid>/cmdline's head = the process table's command for the same pid ("${head && head.slice(0, 50)}…")`, { head, cmd: me && me.cmd.slice(0, 120) });
  ok(head && head.length <= si.CMDLINE_HEAD && (await si.cmdlineHead(2 ** 22 + 7)) === null, `F5: bounded (≤ ${si.CMDLINE_HEAD} chars); a pid that is gone answers null, never throws`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

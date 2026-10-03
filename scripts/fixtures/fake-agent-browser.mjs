// A FAKE `agent-browser` for the in-process browser suites of lane browser-propose (test-browser-env,
// test-browser-propose) — the shape of test-browser-backend's fake (whose daemons are real `sleep`s, reaped by the
// suite), plus what these two suites judge: the CONFIG a launch ran with (the file `AGENT_BROWSER_CONFIG` names, read at
// the launch) and the launch-view env pair (`AGENT_BROWSER_ARGS` / `AGENT_BROWSER_EXECUTABLE_PATH` — cloak's). Its
// shebang is THIS node; it touches nothing outside `state`. NOT a test-*.mjs (the tier census would demand a tier).
import fs from 'node:fs';
import path from 'node:path';

/** Write the fake into `binDir` (as `agent-browser`) and a fake CloakBrowser `chrome` beside it; returns readers over
 *  the logs the fake writes into `stateDir` (launches / opens / closes). */
export function writeFakeAgentBrowser(binDir, stateDir) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const raw = process.argv.slice(2);
const prefix = { exe: process.env.AGENT_BROWSER_EXECUTABLE_PATH || null, args: process.env.AGENT_BROWSER_ARGS || null, pinTab: raw.includes('--pin-tab') };
const argv = raw.filter((x) => x !== '--pin-tab');
// verify r2 (H1): the version THIS client is (FAKE_AB_VERSION — a wrapper standing for another install sets it); the
// daemon it launches records it, and a client of ANOTHER version restarts that daemon (a new pid) the way the real 0.38.x
// does ("Daemon version mismatch detected, restarting..." — measured) — except --version and session info, which never do
const MYV = process.env.FAKE_AB_VERSION || '0.38.1';
// lane browser-admin 2a: EVERY call's launch view, so a suite can judge that a pinned build rides each one
fs.appendFileSync(path.join(st, 'calls.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, verb: argv.slice(0, 2).join(' '), exe: prefix.exe, v: MYV }) + '\\n');
const [a, b] = argv;
const cfgOf = () => { const p = process.env.AGENT_BROWSER_CONFIG; if (!p) return null; try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { unreadable: p }; } };
if (a === '--version') { console.log('agent-browser ' + MYV); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? (s.version || '0.38.1') : null } }); process.exit(0); }
{ const s = read(); if (s && alive(s.pid) && s.version && s.version !== MYV) { process.stderr.write('⚠ Daemon version mismatch detected, restarting...\\n'); try { process.kill(s.pid, 'SIGKILL'); } catch { } const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); fs.appendFileSync(path.join(st, 'restarts.log'), JSON.stringify({ ns, from: s.version, to: MYV, oldPid: s.pid, pid: c.pid }) + '\\n'); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s, pid: c.pid, version: MYV, restart: true }) + '\\n'); fs.writeFileSync(f, JSON.stringify({ ...s, pid: c.pid, version: MYV })); } }
const tabNew = a === 'tab' && b === 'new';
if (a === 'open' || tabNew) {
  const url = tabNew ? argv[2] : b;
  let s = read();
  if (!(s && alive(s.pid))) {
    if (fs.existsSync(path.join(st, prefix.exe ? 'fail-cloak' : 'fail-plain'))) { process.stderr.write('fake: the browser did not start\\n'); process.exit(1); }
    const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref();
    s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, ...prefix, session: process.env.AGENT_BROWSER_SESSION || null, config: cfgOf(), version: MYV };
    fs.writeFileSync(f, JSON.stringify(s));
    fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n');
  }
  const n = (Number((read() || {}).opens) || 0) + 1; const cur = read() || s; cur.opens = n; fs.writeFileSync(f, JSON.stringify(cur));
  const targetId = 't-' + ns + '-' + n;
  fs.appendFileSync(path.join(st, 'opens.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, url, targetId, pinTab: prefix.pinTab, verb: tabNew ? 'tab new' : 'open' }) + '\\n');
  // the page's title: a suite names it per url in <state>/titles.json (lane browser-propose: the sign-in hint reads url + title)
  let title = ''; try { title = String((JSON.parse(fs.readFileSync(path.join(st, 'titles.json'), 'utf8')) || {})[url] || ''); } catch { title = ''; }
  out({ success: true, data: { url, targetId, title } }); process.exit(0);
}
// lane site-reset verify r4 #1: tab list --json — every tab opened in this namespace, the session's last-opened one active
if (a === 'tab' && b === 'list') { const opens = (() => { try { return fs.readFileSync(path.join(st, 'opens.log'), 'utf8').trim().split('\\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } })().filter((o) => o.ns === ns); const sess = process.env.AGENT_BROWSER_SESSION || null; const mine = opens.filter((o) => o.session === sess); const act = mine.length ? mine[mine.length - 1].targetId : null; out({ success: true, data: { tabs: opens.map((o, i) => ({ active: o.targetId === act, label: null, tabId: 't' + (i + 1), targetId: o.targetId, title: '', type: 'page', url: o.url })) } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + (process.env.FAKE_AB_CDP_PORT || '19222') + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, session: process.env.AGENT_BROWSER_SESSION || null, closed }) + '\\n'); out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + raw.join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const cloakExe = path.join(binDir, 'cloak-chrome');
  fs.writeFileSync(cloakExe, `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o755 });
  const readLog = (name) => { try { return fs.readFileSync(path.join(stateDir, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return {
    bin: path.join(binDir, 'agent-browser'), cloakExe,
    launches: () => readLog('launches.log'), opens: () => readLog('opens.log'), closes: () => readLog('closes.log'), calls: () => readLog('calls.log'), restarts: () => readLog('restarts.log'),
    /** SIGKILL every daemon the fake started (the suite's exit hook). */
    reap: () => { for (const l of readLog('launches.log')) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } } },
  };
}

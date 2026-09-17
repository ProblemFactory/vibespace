// THE RAW /usage PROBE LOG (2.369.109, owner 2026-09-17: "把最近一段时间的所有的
// /usage的raw返回结果和对应的parse结果保存起来方便debug"). Every probe that asks the
// vendor for a quota panel — the `claude -p /usage` panel rung and the live
// session's control:get_usage rung — leaves ONE line in
// data/usage-probe-log.ndjson with what was sent, what came back verbatim, what
// the parser made of it and what the write did. This suite: §1 the PURE ring
// (clip, rotate, read back, the machine-wide oauthAccount reader); §2 the
// PANEL rung driven through the REAL setupUsage with a fake `claude`
// (written / spawn-failed / no-buckets); §3 the CONTROL rung driven through
// the REAL engine with a fake chat session answering the way the stdout
// consumer does (written / timeout / unparsed); §4 wiring pins.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '\n      ' + d : '')); } };
const tmp = [];
const mkd = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); tmp.push(d); return d; };
process.on('exit', () => { for (const d of tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });

const L = require(path.join(REPO, 'src/server/usage-probe-log.js'));

// ── §1 the PURE ring ─────────────────────────────────────────────────────────
{
  ok('clip: short strings pass through, long ones are cut with a visible marker', L.clip('abc', 5) === 'abc' && /^aaaaa\n…\[\+5 chars clipped\]$/.test(L.clip('a'.repeat(10), 5)) && L.clip(null, 5) === '');
  const dir = mkd('vs-probelog-');
  for (let i = 0; i < 5; i++) ok(`append #${i + 1} returns true`, L.appendProbeLog(dir, { rung: 'panel', key: 'sub-a', i }) === true);
  const rows = L.readProbeLog(dir);
  ok('readProbeLog returns them oldest-first with `at` stamped', rows.length === 5 && rows.every((r, i) => r.i === i && typeof r.at === 'number'), JSON.stringify(rows.map((r) => r.i)));
  ok('…limit keeps the NEWEST n', JSON.stringify(L.readProbeLog(dir, { limit: 2 }).map((r) => r.i)) === '[3,4]');
  L.appendProbeLog(dir, { rung: 'control', key: 'sub-b', i: 9 });
  ok('…key and rung filter', L.readProbeLog(dir, { key: 'sub-b' }).length === 1 && L.readProbeLog(dir, { rung: 'panel' }).length === 5 && L.readProbeLog(dir, { key: 'sub-a', rung: 'control' }).length === 0);
  // rotation: a tiny maxBytes forces the roll; the rolled file is still read
  const d2 = mkd('vs-probelog-rot-');
  for (let i = 0; i < 6; i++) L.appendProbeLog(d2, { rung: 'panel', key: 'k', i, rawStdout: 'x'.repeat(200) }, { maxBytes: 600 });
  const files = fs.readdirSync(d2).sort();
  ok('rotation: the live file rolled to .1 at maxBytes (two files, never more)', files.length === 2 && files.includes(L.FILE) && files.includes(L.FILE + '.1'), JSON.stringify(files));
  const all = L.readProbeLog(d2, { limit: 100 });
  ok('…and the reader stitches .1 + live in order (nothing lost inside the ring)', all.length >= 4 && all.every((r, j) => j === 0 || r.i > all[j - 1].i) && all[all.length - 1].i === 5, JSON.stringify(all.map((r) => r.i)));
  ok('rawStdout/rawStderr are clipped at the caps on the way in', (() => { const d3 = mkd('vs-probelog-cap-'); L.appendProbeLog(d3, { rung: 'panel', key: 'k', rawStdout: 'y'.repeat(L.RAW_CAP + 10), rawStderr: 'z'.repeat(L.ERR_CAP + 10) }); const r = L.readProbeLog(d3)[0]; return r.rawStdout.length < L.RAW_CAP + 40 && /clipped/.test(r.rawStdout) && r.rawStderr.length < L.ERR_CAP + 40; })());
  ok('appendProbeLog never throws: no dataDir ⇒ false', L.appendProbeLog(null, { rung: 'panel' }) === false && L.readProbeLog(mkd('vs-probelog-empty-')).length === 0);
  const home = mkd('vs-probelog-home-');
  ok('machineOauthAccount: no ~/.claude.json ⇒ null', L.machineOauthAccount(home) === null);
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'userA@example.com', organizationUuid: '11111111-2222-4333-8444-555555555555', organizationName: 'Org A' }, projects: {} }));
  const m = L.machineOauthAccount(home);
  ok('…present ⇒ {email, orgUuid, orgName} and nothing else (no tokens ever)', m && m.email === 'userA@example.com' && m.orgUuid === '11111111-2222-4333-8444-555555555555' && m.orgName === 'Org A' && Object.keys(m).length === 3, JSON.stringify(m));
}

// ── §2 the PANEL rung through the REAL setupUsage with a fake `claude` ───────
{
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const usageMod = require(path.join(REPO, 'src/usage-routes.js'));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const at = (ms) => { const d = new Date(Date.now() + ms); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours() % 12 || 12}${d.getUTCHours() < 12 ? 'am' : 'pm'} (UTC)`; };
  const panelText = `Current session: 20% used · resets ${at(3 * 3600e3)}\nCurrent week (all models): 40% used · resets ${at(3 * 86400e3)}\nCurrent week (Fable): 10% used · resets ${at(3 * 86400e3)}\n`;
  const mkWorld = () => {
    const root = mkd(`vs-probelog-panel-${process.pid}-`);
    const dataDir = path.join(root, 'data');
    const am = new AccountManager({ dataDir });
    const id = am.createSubscription({ name: 'Panel Acct' }).id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const bin = path.join(root, 'fake-claude');
    const say = (script) => fs.writeFileSync(bin, script, { mode: 0o755 });
    const u = usageMod.setupUsage({
      app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
      accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
      serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
      USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
      CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
      AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
      probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
    });
    return { root, dataDir, am, id, cacheDir, u, say, bin, log: () => L.readProbeLog(dataDir) };
  };
  const w = mkWorld();
  w.say(`#!/bin/sh\ncat <<'EOF'\n${panelText}EOF\n`);
  const ok1 = await w.u.refreshViaCliPanel(w.id);
  let rows = w.log();
  const r = rows[0];
  ok('a written panel leaves ONE record: rung panel, the account key + name, outcome written', ok1 === true && rows.length === 1 && r.rung === 'panel' && r.key === w.id && r.name === 'Panel Acct' && r.outcome === 'written', JSON.stringify(r));
  ok('…what was SENT: argv[0] is the binary, the creds dir is the account\'s own, the machine-wide oauthAccount was read before and after', r && Array.isArray(r.argv) && r.argv[0] === w.bin && r.argv[1] === '-p' && r.argv[2] === '/usage' && r.credsDir === w.am.subDir(w.id) && 'machineOrgBefore' in r && 'machineOrgAfter' in r, JSON.stringify(r && { argv: r.argv, credsDir: r.credsDir }));
  ok('…what came BACK verbatim: the panel text, exit 0, a duration', r && r.rawStdout === panelText && r.exitCode === 0 && typeof r.ms === 'number' && r.rawStderr === '', JSON.stringify(r && { raw: r.rawStdout, exit: r.exitCode }));
  ok('…what the parser MADE of it: 5h 20 %, 7d 40 %, Fable 10 %', r && r.parsed && Math.round(r.parsed.fiveHour.utilization * 100) === 20 && Math.round(r.parsed.sevenDay.utilization * 100) === 40 && r.parsed.scopedWeekly.some((s) => /fable/i.test(s.name) && Math.round(s.utilization * 100) === 10), JSON.stringify(r && r.parsed));
  ok('…what the write DID: the window it filed the reading under (7d reset = the parse\'s)', r && r.window && r.window.sevenDay === r.parsed.sevenDay.resetsAt && r.why === null, JSON.stringify(r && r.window));
  // a failing binary: exit code + stderr are kept, outcome spawn-failed, nothing written
  w.say('#!/bin/sh\necho "boom: not logged in" >&2\nexit 1\n');
  const ok2 = await w.u.refreshViaCliPanel(w.id);
  rows = w.log();
  const r2 = rows[rows.length - 1];
  ok('a failing probe: returns false, records exitCode 1 + the stderr verbatim + outcome spawn-failed', ok2 === false && rows.length === 2 && r2.outcome === 'spawn-failed' && r2.exitCode === 1 && /boom: not logged in/.test(r2.rawStderr) && r2.parsed === null, JSON.stringify(r2 && { outcome: r2.outcome, exit: r2.exitCode, err: r2.rawStderr }));
  // garbage stdout: exit 0 but no buckets ⇒ no-buckets-parsed, raw kept for the debugger
  w.say('#!/bin/sh\necho "Usage unavailable right now"\n');
  const ok3 = await w.u.refreshViaCliPanel(w.id);
  rows = w.log();
  const r3 = rows[rows.length - 1];
  ok('an unparseable panel: returns false, outcome no-buckets-parsed, the raw text is what the debugger reads', ok3 === false && rows.length === 3 && r3.outcome === 'no-buckets-parsed' && r3.exitCode === 0 && /Usage unavailable/.test(r3.rawStdout), JSON.stringify(r3 && { outcome: r3.outcome, raw: r3.rawStdout }));
  ok('the ring lives beside usage-cache/ in data/ (data/usage-probe-log.ndjson)', fs.existsSync(path.join(w.dataDir, L.FILE)));
}

// ── §3 the CONTROL rung through the REAL engine ──────────────────────────────
{
  const dir = mkd(`vs-probelog-ctl-${process.pid}-`);
  const cacheDir = path.join(dir, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const sessions = new Map();
  const ROSTER = { 'sub-1': { id: 'sub-1', name: 'Personal', type: 'subscription' } };
  const accounts = {
    get(id) { return ROSTER[id] || null; }, list() { return { accounts: Object.values(ROSTER) }; },
    poolCurrentFor() { return null; }, poolCurrent() { return null; }, poolMembers() { return []; },
    subCredsPath(id) { return path.join(dir, 'nope', id); }, sessionPoolLinkPath() { return path.join(dir, 'nope-link'); },
  };
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const eng = engMod.create({
    app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: dir, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting() { return undefined; }, getAccounts() { return accounts; }, getHosts() { return null; },
    getUsageHistory() { return null; }, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } },
    getAutoResume: () => null, getOtelIngest: () => null, getQuotaProbe: () => null,
  });
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = { rate_limits: { five_hour: { utilization: 0.31, resets_at: nowSec + 3600 }, seven_day: { utilization: 0.52, resets_at: nowSec + 3 * 86400 } } };
  // the session answers exactly the way src/server/stdout/claude-stream-json.js does: raw first, then the parse
  const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-ctl', _accountId: 'sub-1', pty: { write(line) {
    let req = null; try { req = JSON.parse(line); } catch { } if (!req) return;
    const pend = eng._vsuPending.get(req.request_id); if (!pend) return;
    eng._vsuPending.delete(req.request_id); clearTimeout(pend.timer);
    pend.raw = payload; pend.resolve(ClaudeCodeAdapter.parseGetUsageResponse(payload));
  } } };
  sessions.set('sess-ctl', s);
  const parsed = await eng.probeUsageForAccountKey('sub-1');
  const rows = L.readProbeLog(path.join(dir, 'data'));
  const r = rows[0];
  ok('a control probe leaves ONE record: rung control, the asked key, the answering session, the VERBATIM payload and its parse', parsed && rows.length === 1 && r.rung === 'control' && r.key === 'sub-1' && r.sessionId === 'sess-ctl' && JSON.stringify(r.raw) === JSON.stringify(payload) && Math.round(r.parsed.sevenDay.utilization * 100) === 52, JSON.stringify(r));
  ok('…and the write verdict: written for the asked key with the window it was filed under', r && r.outcome === 'written' && r.target === 'sub-1' && r.window && r.window.sevenDay === nowSec + 3 * 86400, JSON.stringify(r && { outcome: r.outcome, target: r.target, window: r.window }));
  // a session that never answers ⇒ timeout, recorded with the timeout it waited
  const mute = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-mute', _accountId: 'sub-1', pty: { write() { } } };
  const t = await eng.probeUsageViaSession(mute, 40);
  const rows2 = L.readProbeLog(path.join(dir, 'data'));
  const r2 = rows2[rows2.length - 1];
  ok('a silent session ⇒ null + a timeout record naming the session and the wait', t === null && rows2.length === 2 && r2.rung === 'control' && r2.outcome === 'timeout' && r2.sessionId === 'sess-mute' && r2.timeoutMs === 40, JSON.stringify(r2));
  // an unparseable reply ⇒ 'unparsed' with the raw kept
  const junk = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-junk', _accountId: 'sub-1', pty: { write(line) {
    let req = null; try { req = JSON.parse(line); } catch { } const pend = req && eng._vsuPending.get(req.request_id); if (!pend) return;
    eng._vsuPending.delete(req.request_id); clearTimeout(pend.timer); pend.raw = { error: 'nope' }; pend.resolve(null);
  } } };
  const j = await eng.probeUsageViaSession(junk, 500);
  const rows3 = L.readProbeLog(path.join(dir, 'data'));
  const r3 = rows3[rows3.length - 1];
  ok('an unparseable reply ⇒ null + an unparsed record carrying the raw reply', j === null && rows3.length === 3 && r3.outcome === 'unparsed' && r3.raw && r3.raw.error === 'nope', JSON.stringify(r3));
}

// ── §4 wiring pins (a pure module nobody calls is the 2.355.0 class) ─────────
{
  const ur = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const con = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  ok('usage-routes: the panel rung appends through the ONE module, beside usage-cache/, at the written/refused site', /probeLog\.appendProbeLog\(path\.dirname\(USAGE_CACHE_DIR\)/.test(ur) && /logProbe\(wrote\.ok \? 'written' : 'write-refused'/.test(ur) && /logProbe\(probeRec\.exitCode === 0 \? 'no-buckets-parsed' : 'spawn-failed'\)/.test(ur));
  ok('usage-routes: the reader route exists', /app\.get\('\/api\/usage\/probe-log'/.test(ur));
  ok('engine: the control rung logs with the raw reply looked up from the parse', /logControlProbe\(s, key, parsed, _vsuRawOf\.get\(parsed\) \|\| null, target \? 'written' : 'refused-by-window-guard'/.test(eng) && /'timeout', \{ timeoutMs \}/.test(eng));
  ok('stdout consumer: the verbatim control reply is stashed on the pending entry BEFORE it resolves', /pend\.raw = msg\.response\.response;[\s\S]{0,80}pend\.resolve\(parsed\)/.test(con));
  ok('§ban-safety: the log module makes no vendor call (no http/https/fetch/child_process)', !/require\(['"](https?|child_process|net)['"]\)|fetch\(/.test(fs.readFileSync(path.join(REPO, 'src/server/usage-probe-log.js'), 'utf8')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

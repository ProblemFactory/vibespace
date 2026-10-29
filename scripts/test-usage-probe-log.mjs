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
// consumer does (written / timeout / unparsed); §4 wiring pins; §5 a failed
// probe's reason on the door's verdict and the account record (lane
// auto-cli-oat-unprobeable).
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
  const argvFile = path.join(w.root, 'argv.txt');
  w.say(`#!/bin/sh\nprintf '%s\\n' "$@" > '${argvFile}'\ncat <<'EOF'\n${panelText}EOF\n`);
  const ok1 = await w.u.refreshViaCliPanel(w.id);
  let rows = w.log();
  const r = rows[0];
  ok('a written panel leaves ONE record: rung panel, the account key + name, outcome written', ok1 === true && rows.length === 1 && r.rung === 'panel' && r.key === w.id && r.name === 'Panel Acct' && r.outcome === 'written', JSON.stringify(r));
  ok('…what was SENT: argv[0] is the binary, the creds dir is the account\'s own, the machine-wide oauthAccount was read before and after', r && Array.isArray(r.argv) && r.argv[0] === w.bin && r.argv[1] === '-p' && r.argv[2] === '/usage' && r.credsDir === w.am.subDir(w.id) && 'machineOrgBefore' in r && 'machineOrgAfter' in r, JSON.stringify(r && { argv: r.argv, credsDir: r.credsDir }));
  // B-9b40: what the BINARY received — claude 2.1.288 print mode loads the account's claude.ai connectors
  // (one mcp-proxy connect each) unless the MCP config is strict; the probe loads none
  const got = (() => { try { return fs.readFileSync(argvFile, 'utf-8').split('\n').filter(Boolean); } catch { return null; } })();
  ok('B-9b40: the spawned CLI got -p /usage --strict-mcp-config (no MCP server loaded, no --mcp-config) and the log names that same argv',
    JSON.stringify(got) === JSON.stringify(['-p', '/usage', '--strict-mcp-config']) && r && JSON.stringify(r.argv.slice(1)) === JSON.stringify(got), JSON.stringify({ got, logged: r && r.argv }));
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
    getAutoResume: () => null, getQuotaProbe: () => null,
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

// ── §5 A FAILED PROBE NAMES ITS REASON WHERE THE OWNER LOOKS (lane auto-cli-oat-unprobeable) ──────────────────────
// The REAL door (setupUsage's refreshViaCliPanel) with a fake `claude` and the REAL AccountManager: a probeable account's
// failure leaves its reason — the class + the CLI's first line, bounded and secret-shapes-redacted — on the door's verdict
// AND on the account RECORD (`probe: {at, ok: false, why}`, accounts.json through the one atomic writer), the roster row
// carries it, a written answer drops it; an oat-only row is PROBED through the token in its folder when its token carries
// user:profile on a measured CLI (the addendum), else refused by name with NO spawn and no failure recorded (the row says
// which fact failed) — RED controls: the verdict with its profile / measured check cut spawns that row. A planted token-shaped line (built at runtime) never reaches the verdict, the record or the file.
{
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const usageMod = require(path.join(REPO, 'src/usage-routes.js'));
  const OAT = ['sk-ant-', 'oat01-', 'Wd4Kp8'.repeat(14)].join('');
  const root = mkd(`vs-probelog-why-${process.pid}-`), dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  const id = am.createSubscription({ name: 'Why Acct' }).id;
  fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 29 * 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const bin = path.join(root, 'fake-claude'), ran = path.join(root, 'ran.txt');
  const say = (script) => fs.writeFileSync(bin, `#!/bin/sh\necho run >> '${ran}'\n${script}`, { mode: 0o755 });
  const runs = () => { try { return fs.readFileSync(ran, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
  const u = usageMod.setupUsage({
    app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
    accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
    serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
    CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
    AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
    probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
  });
  const rowOf = () => (am.list().accounts || []).find((a) => a.id === id);
  ok('§5 a logged-in row is probeable (the roster row carries the verdict the loop reads) and holds no failure yet', rowOf().probeEligibility === 'probeable' && rowOf().probe === undefined, JSON.stringify(rowOf()));
  // ① the CLI fails with the stdin warning first and a token-shaped error line after it
  say(`printf 'Warning: no stdin data received in 3s, proceeding without it.\\n' >&2\nprintf 'Error: token ${OAT} was rejected\\n' >&2\nexit 1\n`);
  const t1 = Date.now();
  const r1 = await u.refreshViaCliPanel(id);
  const pv1 = u.panelVerdictFor(id), rec1 = rowOf().probe;
  ok('§5 ① a failing CLI: false, the door\'s verdict names the class (exit) and the CLI\'s first line — the Warning skipped, the token «redacted»',
    r1 === false && pv1 && pv1.code === 'exit' && pv1.outcome === 'spawn-failed' && pv1.at >= t1 && pv1.why === 'exit 1: Error: token sk-«redacted» was rejected', JSON.stringify(pv1));
  ok('§5 ① …the account RECORD keeps it: probe {at, ok: false, why} on the roster row', rec1 && rec1.ok === false && rec1.at === pv1.at && rec1.why === pv1.why && Object.keys(rec1).join() === 'at,ok,why', JSON.stringify(rec1));
  const disk = fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8');
  ok('§5 ① …written through accounts.json (the one atomic writer), and the planted token is in NEITHER the verdict, the row nor the file',
    JSON.parse(disk).accounts.find((a) => a.id === id).probe.why === pv1.why && !disk.includes(OAT.slice(14)) && !JSON.stringify(pv1).includes(OAT.slice(14)) && !JSON.stringify(rowOf()).includes(OAT.slice(14)));
  ok('§5 ① …while the raw probe ring keeps the CLI\'s bytes verbatim (2.369.109: the owner\'s debugger log, data/ only — never a row, a line or a broadcast)', L.readProbeLog(dataDir).slice(-1)[0].rawStderr.includes('was rejected'));
  // ② an answer with no quota line (the measured 152-row shape)
  say(`printf 'You are currently using your subscription to power your Claude Code usage\\n'\n`);
  const r2 = await u.refreshViaCliPanel(id);
  ok('§5 ② an answer with no quota line: the class parse and its first line', r2 === false && u.panelVerdictFor(id).code === 'parse' && rowOf().probe.why === 'no quota lines in its answer: You are currently using your subscription to power your Claude Code usage', JSON.stringify(rowOf().probe));
  // ③ a written answer drops the failure
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const at = (ms) => { const d = new Date(Date.now() + ms); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCHours() % 12 || 12}${d.getUTCHours() < 12 ? 'am' : 'pm'} (UTC)`; };
  say(`cat <<'EOF'\nCurrent session: 20% used · resets ${at(3 * 3600e3)}\nCurrent week (all models): 40% used · resets ${at(3 * 86400e3)}\nEOF\n`);
  const r3 = await u.refreshViaCliPanel(id);
  ok('§5 ③ the next WRITTEN answer drops the record\'s failure (the row says nothing about a probe that works)', r3 === true && rowOf().probe === undefined && !('probe' in JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8')).accounts.find((a) => a.id === id)), JSON.stringify(rowOf().probe));
  // ④ THE ADDENDUM at the door: an oat-only row is probed through the token in its folder when the token carries
  // user:profile, the hub's CLI is measured with it, and it is written there — else refused by name, NO spawn, no failure
  // recorded. The facts ride the row (accounts.list); the door asks probeEligibility on them before the spawn.
  const SCOPES = ['user:file_upload', 'user:inference', 'user:mcp_servers', 'user:plugins', 'user:profile', 'user:sessions:claude_code'];
  const OAT_LS = { state: 'oat-only', login: 'none', oatFile: true, msLeft: 300 * 86400e3, refreshExpiresAt: Date.now() - 86400e3, oatValidUntil: Date.now() + 300 * 86400e3 };
  const PROBEABLE_FACTS = { oat: true, loginState: OAT_LS, oatScopes: SCOPES, oatCli: { cli: '2.1.306', measured: true }, oatFile: { state: 'written', cli: '2.1.306' } };
  const realList = am.list.bind(am);
  const { probeEligibility } = require(path.join(REPO, 'src/auto-cli-model.js'));
  // the row with these facts, its verdict recomputed exactly as accounts.list() computes it from its own facts
  const withFacts = (acc, facts) => { acc.list = () => { const l = realList(); l.accounts = l.accounts.map((r) => { if (r.id !== id) return r; const x = { ...r, ...facts }; x.probeEligibility = probeEligibility(x); return x; }); return l; }; };
  const envFile = path.join(root, 'env.txt');
  const PANEL = `cat <<'EOF'\nCurrent session: 20% used · resets ${at(3 * 3600e3)}\nCurrent week (all models): 40% used · resets ${at(3 * 86400e3)}\nEOF\n`;
  say(`printf '%s\\n' "$CLAUDE_SECURESTORAGE_CONFIG_DIR" > '${envFile}'\n${PANEL}`);
  const tries = [
    ['④a a token WITHOUT user:profile', { ...PROBEABLE_FACTS, oatScopes: SCOPES.filter((x) => x !== 'user:profile') }, 'unprobeable:oat-no-profile', /without the user:profile scope/],
    ['④b the hub\'s claude unmeasured with a token in the folder', { ...PROBEABLE_FACTS, oatCli: { cli: '2.1.308', measured: false }, oatFile: { state: 'held', reason: 'cli-unmeasured', cli: '2.1.308' } }, 'unprobeable:cli-unmeasured', /claude 2\.1\.308 is not measured/],
    ['④b\' the token not in its folder (a write that failed)', { ...PROBEABLE_FACTS, loginState: { ...OAT_LS, oatFile: undefined, login: 'expired' }, oatFile: { state: 'refused', reason: 'write-failed' } }, 'unprobeable:oat-not-in-folder', /not written to the account's folder \(write-failed\)/],
  ];
  for (const [label, facts, el, re] of tries) {
    withFacts(am, facts);
    const before = runs();
    const r = await u.refreshViaCliPanel(id), pv = u.panelVerdictFor(id);
    ok(`§5 ${label}: refused by name (code unprobeable, «${el}»), NO spawn, NO failure on its record; the row says ${el}`,
      r === false && runs() === before && pv.code === 'unprobeable' && pv.el === el && pv.why.includes(el) && re.test(pv.why) && rowOf().probe === undefined && rowOf().probeEligibility === el, JSON.stringify({ runs: runs() - before, why: pv.why, el: rowOf().probeEligibility }));
  }
  withFacts(am, PROBEABLE_FACTS);
  const b4 = runs();
  const r4 = await u.refreshViaCliPanel(id), pv4 = u.panelVerdictFor(id);
  // R3 (lane pool-silent-members, inc-mvsjhna7): THE ADDENDUM'S PREMISE DOES NOT HOLD — every probe of a token-in-folder row
  // in the owner's log since 10-26 (on 2.1.308 too) answered the subscription header with no quota line. The panel serves
  // live logins only; such a row is read passively (a session on it) or by the owner's own session.
  ok('§5 ④c R3: an oat-only row whose token (user:profile, a measured CLI) IS written in its folder is NOT probed — the panel prints no quota line for a folder-token login — refused by name (unprobeable:oat-folder-no-panel), NO spawn, no failure on its record',
    r4 === false && runs() === b4 && pv4.code === 'unprobeable' && pv4.outcome === 'not-probed' && !/re-login/.test(pv4.why) && pv4.why.includes('unprobeable:oat-folder-no-panel') && /prints no quota lines for a folder-token login/.test(pv4.why) && rowOf().probeEligibility === 'unprobeable:oat-folder-no-panel' && rowOf().probe === undefined, JSON.stringify({ r4, runs: runs() - b4, why: pv4.why, el: rowOf().probeEligibility }));
  am.list = realList;
  // ④d THE ⟳ DOOR AT 12:58:18 PT (R3): a row the loop calls `unprobeable:no-login` (its folder EMPTY — the take-back's shape)
  // is refused by the SAME predicate — 90c995a3 refused only oat-only rows, spawned it, and booked the CLI's non-subscriber
  // cost summary as «no quota lines in its answer: Total cost: $0.0000»
  const COST = `printf 'Total cost:            $0.0000\\nTotal duration (API):  0s\\nTotal duration (wall): 1s\\nTotal code changes:    0 lines added, 0 lines removed\\nUsage:                 0 input, 0 output, 0 cache read, 0 cache write\\n'\n`;
  const NOLOGIN_FACTS = { loggedIn: false, loginState: { state: 'unknown' } };
  say(COST);
  withFacts(am, NOLOGIN_FACTS);
  const b5 = runs();
  const r5 = await u.refreshViaCliPanel(id), pv5 = u.panelVerdictFor(id);
  ok('§5 ④d R3: the ⟳ door refuses a no-login row by the loop\'s own predicate (unprobeable:no-login) — NO spawn, no parse failure booked on its record',
    r5 === false && runs() === b5 && pv5.code === 'unprobeable' && pv5.why.includes('unprobeable:no-login') && /not logged in/.test(pv5.why) && rowOf().probe === undefined, JSON.stringify({ r5, runs: runs() - b5, why: pv5.why }));
  am.list = realList;
  // ④e THE ROUTE'S LADDER FIRST (acceptance r2): the door's refusal skips only the panel's spawn — the ⟳ route tries its
  // same-account fallback (2.181.0: the machine's own login is the same Anthropic account) BEFORE it refuses by name, as
  // 90c995a3 did for both rows (9d53db09 answered «needs re-login» with no fallback tried). The vendor call is answered
  // IN-PROCESS (https.request stubbed: no socket, no vendor request); HOME is a scratch dir holding a FAKE login.
  {
    const https = require('node:https'); const { EventEmitter } = require('node:events');
    const routes = {}, LOC = {}; // (r3 ④g) the engine's lapsed reader rides app.locals
    usageMod.setupUsage({
      app: { get() { }, post(p, fn) { routes[p] = fn; }, put() { }, delete() { }, use() { }, locals: LOC },
      accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
      serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
      USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
      CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
      AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
      probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
    });
    const EMAIL = 'fold' + '@example.invalid'; // built at runtime: no address-shaped literal in the tree
    const GTOK = ['GLOBAL', 'fake', 'login'].join('-'); // the machine login's FAKE token, built at runtime
    const home = mkd(`vs-probelog-home-${process.pid}-`); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    const globalLogin = (on) => { const f = path.join(home, '.claude', '.credentials.json'); if (on) fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: GTOK, expiresAt: Date.now() + 36e5 } })); else fs.rmSync(f, { force: true }); };
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: EMAIL } }));
    const calls = [], realReq = https.request, realHome = process.env.HOME;
    https.request = (url, opts, cb) => {
      calls.push({ url: String(url), bearer: String((opts && opts.headers && opts.headers.authorization) || '').replace(/^Bearer /, '') });
      const res = new EventEmitter(); res.statusCode = 200; res.headers = {};
      const req = new EventEmitter(); req.setTimeout = () => req; req.destroy = () => { };
      req.end = () => setImmediate(() => { cb(res); res.emit('data', JSON.stringify({ five_hour: { utilization: 12, resets_at: new Date(Date.now() + 3 * 3600e3).toISOString() }, seven_day: { utilization: 40, resets_at: new Date(Date.now() + 3 * 86400e3).toISOString() } })); res.emit('end'); });
      return req;
    };
    process.env.HOME = home;
    const call = (account) => new Promise((resolve) => routes['/api/usage/refresh']({ body: { account }, headers: {} }, { status() { return this; }, json: (j) => resolve(j) }));
    try {
      // the folder-token row (our token written in its folder, a measured CLI), the same account as the machine's login
      say(`printf 'You are currently using your subscription to power your Claude Code usage\\n'\n`);
      const idF = am.createSubscription({ name: 'Fold One' }).id; // no login file of its own: only the fallback can serve it
      const realL0 = am.list.bind(am);
      am.list = () => { const l = realL0(); l.accounts = l.accounts.map((r) => { if (r.id !== idF) return r; const x = { ...r, ...PROBEABLE_FACTS, email: EMAIL }; x.probeEligibility = probeEligibility(x); return x; }); return l; };
      globalLogin(true);
      const b = runs(); const j1 = await call(idF);
      am.list = realL0;
      ok('§5 ④e (acceptance r2): ⟳ on a folder-token member that is the SAME account as the machine\'s login is REFRESHED through the route\'s same-account fallback — the ladder first, no panel spawn, the machine login\'s token (a stubbed fetch, in-process)',
        j1 && j1.success === true && runs() === b && calls.length >= 1 && calls[0].bearer === GTOK && /\/api\/oauth\/usage$/.test(calls[0].url), JSON.stringify({ j1, calls: calls.length, spawns: runs() - b }));
      // nothing serves it: refused BY NAME, the row's own remedy — a folder-token row is never told to re-login
      const id2 = am.createSubscription({ name: 'Fold Two' }).id, id3 = am.createSubscription({ name: 'Bare Three' }).id;
      globalLogin(false);
      const realL = am.list.bind(am);
      am.list = () => { const l = realL(); l.accounts = l.accounts.map((r) => { const f = r.id === id2 ? { ...PROBEABLE_FACTS, email: 'other' + '@example.invalid' } : r.id === id3 ? NOLOGIN_FACTS : null; if (!f) return r; const x = { ...r, ...f }; x.probeEligibility = probeEligibility(x); return x; }); return l; };
      const n0 = calls.length, b2 = runs();
      const j2 = await call(id2), j3 = await call(id3);
      ok('§5 ④e: …with no fallback token, the folder-token row is refused BY NAME — «not refreshed — not probed (unprobeable:oat-folder-no-panel …)», never «re-login», no loginNeeded',
        j2 && !j2.success && /^not refreshed — not probed \(unprobeable:oat-folder-no-panel: /.test(j2.error) && !/re-login/.test(j2.error) && !j2.loginNeeded, JSON.stringify(j2));
      ok('§5 ④e: …and the empty folder (no login) is refused by name with loginNeeded — «needs re-login to refresh usage — not probed (unprobeable:no-login …)»; neither spawned the panel nor made a fetch',
        j3 && j3.loginNeeded === true && /^needs re-login to refresh usage — not probed \(unprobeable:no-login: /.test(j3.error) && runs() === b2 && calls.length === n0, JSON.stringify({ j3, fetches: calls.length - n0 }));
      // ── acceptance r3 ──
      // ④f THE ⟳ DOOR IS HUMAN-GATED (§ban-safety, claim 1 F1): an agent's session / job bearer is refused 403 human_only
      // BEFORE anything is read — b552c972 (and master) answered 200 and made the ladder's vendor requests
      const callAs = (account, auth) => new Promise((resolve) => { let st = 200; routes['/api/usage/refresh']({ body: { account }, headers: { authorization: auth } }, { status(c) { st = c; return this; }, json: (j) => resolve({ st, ...j }) }); });
      globalLogin(true);
      const n4 = calls.length, b4 = runs();
      const jv = await callAs(idF, 'Bearer ' + ['vsst', 'fakeagent0000'].join('_')), jj = await callAs(idF, 'Bearer ' + ['jbt', 'fakejob00000'].join('_'));
      ok('§5 ④f (acceptance r3): ⟳ with an agent\'s vsst_ / jbt_ bearer ⇒ 403 human_only, the bearer never echoed — 0 vendor requests, 0 panel spawns (b552c972: 200 + 2 requests through the ladder)',
        jv.st === 403 && jv.code === 'human_only' && jj.st === 403 && jj.code === 'human_only' && calls.length === n4 && runs() === b4 && !JSON.stringify([jv, jj]).includes('fakeagent'), JSON.stringify({ jv, jj, fetches: calls.length - n4 }));
      globalLogin(false);
      // ④g A REFUSAL BY NAME BEFORE THE LAPSED SENTENCE (confirmed 1): a lapsed row the door refused asked nothing — it is
      // told what was refused and its remedy; «the subscription still does not answer» only when a panel RAN
      LOC.memberServeLapsed = (k) => k === id2 || k === id3;
      const j2l = await call(id2), j3l = await call(id3);
      LOC.memberServeLapsed = undefined;
      ok('§5 ④g (acceptance r3): ⟳ on a LAPSED row the door refused ⇒ the refusal by name with its remedy (the empty folder: «needs re-login …», loginNeeded; the folder token: «not refreshed — not probed …») — never «the subscription still does not answer» (b552c972: that, with no loginNeeded, 0 panels)',
        j3l.loginNeeded === true && /^needs re-login to refresh usage — not probed \(unprobeable:no-login: /.test(j3l.error) && !j3l.lapsed && /^not refreshed — not probed \(unprobeable:oat-folder-no-panel: /.test(j2l.error) && !j2l.lapsed && !j2l.loginNeeded, JSON.stringify({ j2l, j3l }));
      // ④h ONE FACT, ONE SENTENCE (F2): a token the LOCKED vault keeps is told as the roster and the gather tell it
      const id4 = am.createSubscription({ name: 'Locked Four' }).id;
      const realL4 = am.list.bind(am);
      am.list = () => { const l = realL4(); l.accounts = l.accounts.map((r) => { if (r.id !== id4) return r; const x = { ...r, oat: true, loginState: OAT_LS, oatScopes: SCOPES, oatCli: { cli: '2.1.306', measured: true }, oatFile: { state: 'refused', reason: 'key-unreadable', cli: '2.1.306', code: 'vault_locked' } }; x.probeEligibility = probeEligibility(x); return x; }); return l; };
      const j4 = await call(id4);
      am.list = realL4;
      ok('§5 ④h (acceptance r3): ⟳ on a member whose token the LOCKED vault keeps ⇒ «not refreshed — the vault is locked — … (Unlock… …; For you names what is waiting on it)», no loginNeeded, never «re-login» — the roster\'s own sentence (b552c972: «needs re-login …»)',
        /^not refreshed — the vault is locked — /.test(j4.error) && /Unlock…/.test(j4.error) && !/re-login/.test(j4.error) && !j4.loginNeeded, JSON.stringify(j4));
      // ④i THE USAGE BEARER LAW (F4): an oat-shaped token planted in a member's folder WITHOUT our mark is never a Bearer —
      // refused by name, 0 vendor requests (b552c972 sent it to /api/oauth/usage and /roles)
      const id5 = am.createSubscription({ name: 'Planted Five' }).id;
      const PLANTED = ['sk', '-ant-oat01-'].join('') + 'PLANTEDfake_' + 'q7'.repeat(24);
      fs.writeFileSync(path.join(am.subDir(id5), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: PLANTED, expiresAt: Date.now() + 300 * 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
      const n5 = calls.length;
      const j5 = await call(id5);
      ok('§5 ④i (acceptance r3): an oat-shaped token in the folder without our mark ⇒ never sent as a usage bearer — «not refreshed — the account\'s folder holds a long-lived token …», 0 vendor requests, usageToken() null',
        /^not refreshed — the account's folder holds a long-lived token, and a long-lived token is never sent as a usage bearer/.test(j5.error) && calls.length === n5 && !calls.some((c) => c.bearer === PLANTED) && am.usageToken(id5) === null && am.usageTokenRefusal(id5) === 'long-lived', JSON.stringify({ j5, fetches: calls.length - n5 }));
    } finally { https.request = realReq; process.env.HOME = realHome; am.list = realList; }
  }
  // RED CONTROLS at the door: the same door over the verdict with ONE check cut — the profile-less token / the unmeasured
  // CLI (the boot shape: no version known yet, the folder door still «written») is SPAWNED
  {
    const SRC = path.join(REPO, 'src'), scratch = mkd('vs-probelog-mut-');
    const modelTxt = fs.readFileSync(path.join(SRC, 'auto-cli-model.js'), 'utf8').replace(/require\('\.\/([\w.-]+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(SRC, f))})`);
    const routesTxt = fs.readFileSync(path.join(SRC, 'usage-routes.js'), 'utf8');
    const doorWith = (name, cut) => {
      if (!modelTxt.includes(cut)) throw new Error('mutant anchor missing: ' + cut.slice(0, 60));
      const m = path.join(scratch, name + '-model.js'); fs.writeFileSync(m, modelTxt.replace(cut, '    // CUT\n'));
      const r = path.join(scratch, name + '-routes.js');
      fs.writeFileSync(r, routesTxt.replace(/require\('\.\/([\w./-]+)'\)/g, (_, f) => `require(${JSON.stringify(f === 'auto-cli-model.js' ? m : path.join(SRC, f))})`));
      return require(r);
    };
    // (R3: the profile / measured checks keep their refusals — ④a/④b — but no single cut of them spawns any more: the row
    // still ends at oat-folder-no-panel. The control is the 2.369.342 premise itself, restored)
    const MUT = [
      ['the 2.369.342 premise restored — a folder token probed', "    return OAT_FOLDER_NO_PANEL; // the folder holds the token the CLI spends — but the panel prints no quota line for it (R3)\n", PROBEABLE_FACTS],
    ];
    for (const [label, cut, facts] of MUT) {
      const mod = doorWith(label.replace(/\W+/g, '-'), cut);
      const um = mod.setupUsage({
        app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
        accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
        serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
        USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
        CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
        AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
        probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
      });
      withFacts(am, facts);
      const b0 = runs(); await u.refreshViaCliPanel(id); const realRuns = runs() - b0;
      const b1 = runs(); await um.refreshViaCliPanel(id); const mutRuns = runs() - b1;
      ok(`§5 RED CONTROL (${label}): the real door spawns NOTHING for that row, the same door over the cut verdict SPAWNS it`, realRuns === 0 && mutRuns === 1, JSON.stringify({ realRuns, mutRuns }));
      // …and what such a spawn answered on the owner's hub (the bare subscription header) is CLASSED, never «parse» (R3)
      say(`printf 'You are currently using your subscription to power your Claude Code usage\\n'\n`);
      am.noteCliVersion('2.1.312 (Claude Code)');
      await um.refreshViaCliPanel(id);
      const pvF = um.panelVerdictFor(id);
      ok('§5 R3: …the folder-token row\'s header-only answer is classed by name — «the CLI prints no quota lines for a folder-token login on 2.1.312» (code folder-token), never a parse failure', pvF.code === 'folder-token' && /^the CLI prints no quota lines for a folder-token login on 2\.1\.312: You are currently using your subscription/.test(pvF.why) && L.readProbeLog(dataDir).slice(-1)[0].why === pvF.why, JSON.stringify(pvF));
      am.list = realList;
    }
    // RED CONTROL for ④d: the 90c995a3 door (it refused ONLY an oat-only row) spawns the no-login row — and even then the
    // answer is CLASSED: «no login in the folder — the CLI answered as a non-subscriber», code login, no failure booked
    {
      const oldDoor = 'if (acctMeta.loginState && acctMeta.loginState.state === \'oat-only\' && isUnprobeable(el)) {';
      if (!routesTxt.includes('    if (isUnprobeable(el)) {\n')) throw new Error('mutant anchor missing: the door\'s refusal');
      const r = path.join(scratch, 'door-360-routes.js');
      fs.writeFileSync(r, routesTxt.replace('    if (isUnprobeable(el)) {\n', '    ' + oldDoor + '\n').replace(/require\('\.\/([\w./-]+)'\)/g, (_, f) => `require(${JSON.stringify(path.join(SRC, f))})`));
      const um = require(r).setupUsage({
        app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} },
        accounts: am, hosts: null, usageHistory: null, activeSessions: new Map(),
        serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
        USAGE_CACHE_FILE: path.join(dataDir, 'usage-cache.json'), USAGE_CACHE_DIR: cacheDir,
        CODEX_SESSIONS_DIR: path.join(root, 'codex-sessions'), META_DIR: path.join(dataDir, 'session-meta'),
        AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(dataDir, 'session-buffers'),
        probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: bin,
      });
      say(COST);
      withFacts(am, NOLOGIN_FACTS);
      const probeBefore = JSON.stringify(rowOf().probe ?? null);
      const b6 = runs(); await um.refreshViaCliPanel(id); const pv6 = um.panelVerdictFor(id);
      ok('§5 RED CONTROL (④d, the 90c995a3 door: only oat-only refused): the no-login row IS spawned — the 12:58:18 probe', runs() === b6 + 1, JSON.stringify({ runs: runs() - b6 }));
      ok('§5 R3: …its non-subscriber cost summary is classed — «no login in the folder — the CLI answered as a non-subscriber: Total cost: $0.0000» (code login, nothing booked on the record), never «no quota lines in its answer»', pv6.code === 'login' && pv6.why === 'no login in the folder — the CLI answered as a non-subscriber: Total cost: $0.0000' && JSON.stringify(rowOf().probe ?? null) === probeBefore, JSON.stringify({ pv6, probe: rowOf().probe }));
      am.list = realList;
    }
  }
  // ⑤ the FACTS come from accounts.list itself (no wrapper): the recorded shape's scopes, the hub's CLI verdict (oatFileCaps)
  {
    const a = am._state.accounts.find((x) => x.id === id);
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() - 36e5, refreshTokenExpiresAt: Date.now() - 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
    a.oatEnc = 'not-a-real-ciphertext'; a.oatMintedAt = Date.now() - 86400e3; a.oatShape = { scopes: SCOPES, subscriptionType: 'max' };
    am.noteCliVersion('2.1.306 (Claude Code)'); await am.oatFileSettled();
    const r1 = rowOf();
    ok('§5 ⑤ list(): an expired login + a token on record ⇒ oat-only; oatScopes = the recorded shape\'s; oatCli = {cli, measured} from oatFileCaps; not in its folder (the token does not even decrypt here) ⇒ oat-not-in-folder',
      r1.loginState.state === 'oat-only' && JSON.stringify(r1.oatScopes) === JSON.stringify(SCOPES) && r1.oatCli.cli === '2.1.306' && r1.oatCli.measured === true && r1.probeEligibility === 'unprobeable:oat-not-in-folder', JSON.stringify({ ls: r1.loginState.state, scopes: r1.oatScopes, cli: r1.oatCli, file: r1.oatFile, el: r1.probeEligibility }));
    am.noteCliVersion('2.1.999'); await am.oatFileSettled();
    ok('§5 ⑤ …the hub\'s CLI moves to a version the fixture never measured ⇒ cli-unmeasured, the version named', rowOf().oatCli.measured === false && rowOf().oatCli.cli === '2.1.999' && rowOf().probeEligibility === 'unprobeable:cli-unmeasured', JSON.stringify(rowOf().oatCli));
    a.oatShape = { scopes: ['user:inference'], subscriptionType: 'max' };
    ok('§5 ⑤ …a recorded shape without user:profile ⇒ oat-no-profile (named first)', rowOf().probeEligibility === 'unprobeable:oat-no-profile');
    delete a.oatEnc; delete a.oatMintedAt; delete a.oatShape;
    ok('§5 ⑤ …the token gone, the expired login is a login again (probeable; its own probe says why it fails)', rowOf().probeEligibility === 'probeable' && rowOf().oatScopes === undefined);
  }
  ok('§5 accounts.noteProbe refuses a fact with no instant or no reason, and an unknown account', (() => { try { am.noteProbe(id, { at: 0, why: 'x' }); return false; } catch { } try { am.noteProbe(id, { at: 1, why: '' }); return false; } catch { } try { am.noteProbe('nope', null); return false; } catch { return true; } })());
  ok('§5 the export bundle never carries the probe fact (a reason is this hub\'s, not the account\'s)', (() => { am.noteProbe(id, { at: Date.now(), why: 'exit 1: x' }); const b = am.exportBundle(); return !JSON.stringify(b.accounts.find((a) => a.id === id)).includes('"probe"'); })());
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// lane setting-doors pick 0 (主开发 2026-11-14) — THE SPENDING ROWS CHANGE ONLY BY THE OWNER'S PRESS.
// MEASURED on a scratch hub of d64075ba4 with sign-in OFF: a conversation's shell wrote spend.unattendedPerInstanceDay by four roads
// (no header at all, forged browser headers, the whole-file POST, its own Bearer token). THE MODEL (the kb's words): the spending
// ceilings guard against a loop and against an agent that helps itself when it is blocked — accident and eagerness, not a
// determined adversary. So (a) a write of a spend.* row that carries a bearer is refused by name on every road, sign-in on or off;
// (b1) a write with no mark of the owner's page is refused too; (b3) Settings › Spending says the truth on a sign-in-off instance.
// In-process: the REAL persistence router (no auth layer = an instance with sign-in off), every road × every caller.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { ownerPageHeaders } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const express = require(path.join(REPO, 'node_modules/express'));
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 900)); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-spend-owner-'));
const servers = new Set();
process.on('exit', () => { for (const s of servers) { try { s.close(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

/** one REAL persistence router over its own data dir → {port, base, dir, file, read()} */
async function hub(PR, tag) {
  const dir = path.join(ROOT, tag); fs.mkdirSync(dir, { recursive: true });
  PR.setup({ dataDir: dir, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => {} });
  const app = express(); app.use(express.json()); app.use(PR.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); servers.add(srv);
  const port = srv.address().port, base = `http://127.0.0.1:${port}`, file = path.join(dir, 'settings.json');
  return { port, base, dir, file, bytes: () => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }, read: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } } };
}
const send = (h, method, p, body, headers = {}) => new Promise((resolve) => {
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const q = http.request({ host: '127.0.0.1', port: h.port, method, path: p, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => { let b = ''; res.on('data', (x) => { b += x; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, json: j, body: b }); }); });
  q.on('error', (e) => resolve({ status: 0, body: e.message })); if (data) q.write(data); q.end();
});
const DAY = 'spend.unattendedPerInstanceDay', HOUR = 'spend.unattendedPerIdentityHour', OVER = 'spend.allowOverageTurns', OTHER = 'browser.headed';
const importOf = (settings) => ({ file: { app: 'vibespace-config', sections: { settings } }, sections: ['settings'] });

const PR = require(path.join(REPO, 'src/routes/persistence.js'));
const H = await hub(PR, 'real');
const page = ownerPageHeaders(H.base);
const CALLERS = {
  'the owner\'s page (Sec-Fetch-Site same-origin + its Origin)': { headers: page, writes: true },
  'a page that sends only its Origin (a browser without Sec-Fetch-Site)': { headers: { Origin: H.base }, writes: true },
  'an agent\'s token (vsst_)': { headers: { Authorization: 'Bearer vsst_fixture_agent' }, writes: false, why: 'bearer' },
  'a Background Work job\'s token (jbt_)': { headers: { Authorization: 'Bearer jbt_fixture_job' }, writes: false, why: 'bearer' },
  'an automation key (vsak_)': { headers: { Authorization: 'Bearer vsak_fixture_key' }, writes: false, why: 'bearer' },
  'the owner\'s page marks WITH a bearer': { headers: { ...page, Authorization: 'Bearer vsst_fixture_agent' }, writes: false, why: 'bearer' },
  'a plain request — no mark of the page, no token': { headers: {}, writes: false, why: 'no-browser' },
};

console.log('① every write road × every caller (sign-in OFF: no auth layer before the router)');
{
  let n = 100;
  for (const [who, c] of Object.entries(CALLERS)) {
    // seed as the owner, then try each road
    await send(H, 'PATCH', '/api/settings', { [DAY]: 800, [HOUR]: 30, [OVER]: false }, page);
    const roads = {
      'PATCH sets a ceiling': () => send(H, 'PATCH', '/api/settings', { [DAY]: ++n }, c.headers),
      'PATCH drops a ceiling (null)': () => send(H, 'PATCH', '/api/settings', { [HOUR]: null }, c.headers),
      'the whole-file POST changes one': () => send(H, 'POST', '/api/settings', { ...H.read(), [OVER]: true }, c.headers),
      'the whole-file POST that omits them (= drops them)': () => send(H, 'POST', '/api/settings', { [OTHER]: true }, c.headers),
      'a config import\'s settings section changes one': () => send(H, 'POST', '/api/config/import', importOf({ ...H.read(), [DAY]: ++n }), c.headers),
    };
    for (const [road, go] of Object.entries(roads)) {
      const before = H.bytes(), r = await go(), after = H.bytes();
      if (c.writes) ok(r.status === 200 && after !== before, `${who} — ${road} ⇒ written`, { status: r.status, body: r.body.slice(0, 200) });
      else ok(r.status === 403 && gateOf(r.json) && r.json.code === 'spend_row_owner_only' && r.json.why === c.why && after === before
        && gateOf(/change only by the owner's press on the owner's own page/.test(r.json.error)) && gateOf(new RegExp(`vibespace://settings/spend\\.`).test(r.json.error)) && gateOf(/^vibespace:\/\/settings\/spend\./.test(r.json.door)) && gateOf(Array.isArray(r.json.rows)) && verdictOf(r.json.rows.every((k) => /^spend\./.test(k))),   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
        `${who} — ${road} ⇒ 403 spend_row_owner_only (${c.why}), the file's bytes unchanged, the rule + the row + its link named`, { status: r.status, json: r.json });
    }
  }
}

console.log('② what is NOT fenced: other rows, and spending rows carried verbatim');
{
  await send(H, 'PATCH', '/api/settings', { [DAY]: 800, [HOUR]: 30 }, page);
  const a = await send(H, 'PATCH', '/api/settings', { [OTHER]: false }, { Authorization: 'Bearer vsst_fixture_agent' });
  const b = await send(H, 'PATCH', '/api/settings', { [OTHER]: true }, {});
  const c = await send(H, 'POST', '/api/settings', { ...H.read(), [OTHER]: false }, { Authorization: 'Bearer vsst_fixture_agent' });
  ok(a.status === 200 && b.status === 200 && c.status === 200 && H.read()[DAY] === 800 && H.read()[HOUR] === 30,
    'a row that is not a spending row is written as before by any caller; a whole-file POST carrying the spending rows VERBATIM is no change of them ⇒ 200', { a: a.status, b: b.status, c: c.status });
  const i = await send(H, 'POST', '/api/config/import', importOf({ ...H.read(), [DAY]: 1 }), {});
  ok(i.status === 403 && H.read()[DAY] === 800 && H.read()[OTHER] === false, 'a refused import is refused WHOLE — no section of it is applied (as the engine rows)', { status: i.status });
  const f = await send(H, 'PATCH', '/api/settings', { [DAY]: 801 }, { Origin: H.base, 'Sec-Fetch-Site': 'same-origin' });
  ok(f.status === 200 && H.read()[DAY] === 801, 'THE SAID LIMIT: a request that KNOWINGLY dresses as the owner\'s page is written — the model guards against a loop and an eager agent, not a determined one (and the refusal it met first told it whose press this is)');
  // f2: a refused spend key that is NO row names a REAL door (the limits' first row) and says the key is no setting
  const nr = await send(H, 'PATCH', '/api/settings', { 'spend.dayCeiling': 9 }, { Authorization: 'Bearer vsst_fixture_agent' });
  ok(nr.status === 403 && gateOf(nr.json) && nr.json.door === 'vibespace://settings/spend.unattendedPerIdentityHour' && gateOf(/«spend\.dayCeiling» is no setting/.test(nr.json.error)) && H.read()['spend.dayCeiling'] === undefined,
    'f2: a key that is no row (spend.dayCeiling) is refused with a REAL door — the limits\' first row — and «is no setting» said', nr.json);
  // f4: the judge's daily dollar cap (drawn under Settings › Spending) is ONE more owner-only row — its own door
  const BUD = 'plugin.llm.dailyBudgetUsd';
  const b1 = await send(H, 'PATCH', '/api/settings', { [BUD]: 50 }, { Authorization: 'Bearer vsst_fixture_agent' }), b2 = await send(H, 'PATCH', '/api/settings', { [BUD]: 51 }, {});
  const b3 = await send(H, 'POST', '/api/config/import', importOf({ ...H.read(), [BUD]: 52 }), { Authorization: 'Bearer jbt_fixture_job' });
  ok(b1.status === 403 && b1.json.door === `vibespace://settings/${BUD}` && b2.status === 403 && b2.json.why === 'no-browser' && b3.status === 403 && H.read()[BUD] === undefined,   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
    'f4: the judge\'s daily dollar cap — a bearer, a request with no page mark, a bearer\'s import: each refused, its OWN door named, nothing written', { b1: b1.json, b2: b2.status, b3: b3.status });
  const b4 = await send(H, 'PATCH', '/api/settings', { [BUD]: 2.5 }, page);
  ok(b4.status === 200 && H.read()[BUD] === 2.5, 'f4: the owner\'s page changes it');
  const wiring = read('src/server/mounts-plugins-wiring.js');
  ok(verdictOf(/app\.post\('\/api\/plugins\/:id\/config', \(req, res\) => \{[\s\S]{0,900}ownerPageWhy\(req\)[\s\S]{0,1600}code: 'spend_row_owner_only'[\s\S]{0,700}const call = \(\) => plugins\.setConfig\(req\.params\.id, b\);\n  try \{ res\.json\(require\('\.\.\/write-origin\.js'\)\.pressBearer\(req\.headers\) && typeof persistenceRouter\.asMachineCall === 'function' \? persistenceRouter\.asMachineCall\(call\) : call\(\)\); \}/.test(wiring)),   // r5185: the plugin's write runs in the machine scope for a bearer (its settings write unsynced)
    'f4: the old /api/plugins/llm/config door asks the SAME verdict before the plugin writes its budget (the plugin\'s own rename and migration write through the store — server acts, ④)');
  const x = await send(H, 'PATCH', '/api/settings', { [DAY]: 5 }, { Origin: 'http://elsewhere.example', 'Sec-Fetch-Site': 'cross-site' });
  ok(x.status === 403 && H.read()[DAY] === 801, 'a page of ANOTHER site is not the owner\'s page (the router\'s own verdict; the auth layer refuses it before, too)', { status: x.status, body: x.body.slice(0, 160) });
}

console.log('③ red controls — a patched copy of the router');
{
  const src = read('src/routes/persistence.js'), M = mutantCopies('spend-owner', REPO);
  const callP = "    if (refuseSpendRows(req, res, merged)) return; // lane setting-doors pick 0: the spending rows are the owner's press\n";
  const markA = "  const spendWriteWhy = (req) => require('../write-origin.js').ownerPageWhy(req);   // null = the owner's page\n";
  const cmpA = "const same = (k) => Object.hasOwn(cur, k) === Object.hasOwn(nxt, k) && (JSON.stringify(cur[k]) === JSON.stringify(nxt[k]) || (nothing(k, cur[k]) && nothing(k, nxt[k])));";   // B-0a33 cure 2: a cap's null and blank are one «nothing»
  ok(gateOf(src.includes(callP)) && gateOf(src.includes(markA)) && verdictOf(src.includes(cmpA)), 'the anchors the controls patch are in this tree');
  const run = async (patched, tag, go) => { const P = M.load('src/routes/persistence.js', patched, tag); const h = await hub(P, `mut-${tag}`); await send(h, 'PATCH', '/api/settings', { [DAY]: 800, [HOUR]: 30 }, ownerPageHeaders(h.base)); const r = await go(h); return { r, s: h.read() }; };
  const noPatch = await run(src.replace(callP, ''), 'no-patch-fence', (h) => send(h, 'PATCH', '/api/settings', { [DAY]: 9999 }, { Authorization: 'Bearer vsst_fixture_agent' }));
  ok(noPatch.r.status === 200 && noPatch.s[DAY] === 9999, 'control (a): PATCH without the spending fence — an agent\'s token raises the day ceiling (what ① catches)', noPatch.r.status);
  const noMark = await run(src.replace(markA, "  const spendWriteWhy = (req) => (require('../write-origin.js').pressBearer((req && req.headers) || {}) ? 'bearer' : null);\n"), 'no-mark', (h) => send(h, 'PATCH', '/api/settings', { [DAY]: 9999 }, {}));
  ok(noMark.r.status === 200 && noMark.s[DAY] === 9999, 'control (b1): judging only the bearer — a plain shell request raises it (the measurement\'s first road)', noMark.r.status);
  const names = await run(src.replace(cmpA, 'const same = (k) => !Object.hasOwn(nxt, k) || JSON.stringify(cur[k]) === JSON.stringify(nxt[k]);'), 'names-only', (h) => send(h, 'POST', '/api/settings', { [OTHER]: true }, { Authorization: 'Bearer vsst_fixture_agent' }));
  ok(names.r.status === 200 && names.s[DAY] === undefined, 'control: judging only the keys a body NAMES — a bearer\'s whole-file POST that omits the ceilings ERASES them (the default 800 returns silently)', names.r.status);
}

console.log('④ EVERY WRITER of the settings file — a grep-derived census, printed (a writer it does not know is red)');
{
  const ROWS = [
    { file: 'src/routes/persistence.js', re: /^const SETTINGS_FILE = path\.join\(dataDir, 'settings\.json'\);/, road: 'the settings file itself (data/settings.json)', spend: 'only through the roads below' },
    { file: 'src/routes/persistence.js', re: /^try \{ settingsHold\.write\(data, undefined, \{ sync: MACHINE_CALL\.getStore\(\) !== true \}\); \}/, road: 'THE ONE WRITER (writeSettings: atomic write — its temp synced, r5185, unless a machine caller\'s config call — + the settings-updated broadcast)', spend: 'only as its callers allow' },
    { file: 'src/plugins.js', fn: '_writeSettings', re: /this\._settings\.patch\(out\);/, road: 'the plugin manager\'s row writer (its keys = PS.rowPath of PLUGIN_SETTINGS rows; an unknown key throws)', spend: 'the judge\'s budget row only: through the owner\'s page (/api/settings) or the old /config door — both ask ownerPageWhy' },
    { file: 'src/plugins.js', fn: 'migrateConfigToSettings', re: /this\._settings\.patch\(patch\);/, road: 'the plugin manager\'s one-time config → settings move (a boot migration)', spend: 'a server act: moves the stored config as it was — no request' },
    { file: 'src/plugins.js', fn: 'renamePlugin', re: /this\._settings\.patch\(patch\);/, road: 'the plugin manager\'s rename (llm-plugin-rename: plugin.<from>.* → plugin.<to>.*)', spend: 'a server act: carries the stored rows over — no request' },
    { file: 'src/server/sync-fs-witness.js', re: /readFile\(path\.join\(dataDir, 'settings\.json'\)\)/, road: 'the sync-fs witness', spend: 'never — it reads the file only' },
    { file: 'src/routes/persistence.js', re: /^const out = \{\}, spend = writeSettings\(data, out\);/, road: 'POST /api/settings (the whole file; B-ddf3 unit 2: its own write\'s CLI-config landing in `out`)', spend: 'only from the owner\'s page (refuseSpendRows)' },
    { file: 'src/routes/persistence.js', re: /^const out = \{\}; writeSettings\(merged, out\);$/, road: 'PATCH /api/settings (B-ddf3 unit 2: its own write\'s CLI-config landing in `out`)', spend: 'only from the owner\'s page (refuseSpendRows)' },
    { file: 'src/routes/persistence.js', re: /^writeSettings\(merged\);$/, road: 'patchSettings', spend: 'a server act, see its callers' },
    { file: 'src/routes/persistence.js', re: /apply\('settings', \(d\) => \{ if \(d && typeof d === 'object'\) writeSettings\(d\); \}\);/, road: 'a config import\'s settings section', spend: 'only from the owner\'s page (refuseSpendRows, all or nothing)' },
    { file: 'src/server/mounts-plugins-wiring.js', re: /patch: \(p\) => persistenceRouter\.patchSettings\(p\)/, road: 'the plugin manager\'s settings store (plugins.js _writeSettings)', spend: 'only its PLUGIN_SETTINGS rows (④b) — the one among them Settings › Spending draws, the judge\'s budget, changes only through the fenced roads (f4)' },
    { file: 'src/server/mounts-plugins-wiring.js', re: /patchSettings: \(patch\) => persistenceRouter\.patchSettings\(patch\)/, road: 'browser-propose (handed, not called since engine-spi-egress L3)', spend: 'never — src/server/browser-propose.js create() takes no patchSettings (④c)' },
    { file: 'src/server/mounts-plugins-wiring.js', re: /writeSettings: \(p\) => voicePlugin\.writeSettings\(p\)/, road: 'the voice teach engine (the voice plugin\'s own settings)', spend: 'never — the voice plugin\'s own rows through plugins.js _writeSettings (④b)' },
    { file: 'src/server/migrations.js', re: /path\.join\(dataDir, 'settings\.json'\)/, road: 'a boot migration (renames, retired keys)', spend: 'never — no migration names a spend.* key (④d)' },
    // lane bl-msg (usage-predict, restack-411; the census of 2.369.412's second checkpoint): the boot migrations' LIVE settings handle — the
    // migration 2026-11-agy-reads-follow-claude-off (Antigravity's automatic usage reads follow Claude's Off) writes THROUGH the one writer
    { file: 'server.js', re: /settings: \{ read: \(\) => persistenceRouter\.readSettings\(\), patch: \(p\) => persistenceRouter\.patchSettings\(p\) \}/, road: 'the boot migrations\' live settings handle (server.js → src/server/migrations.js `settings`: usage-predict\'s 2026-11-agy-reads-follow-claude-off patches antigravity.autoUsageReads through the one writer)', spend: 'never — a server act at boot, before any request; the one migration that takes it names antigravity.autoUsageReads only, no spend.* key (④d)' },
    // pick 2 (the GO's line: «the every-writer census with the return's row»): the one-press change and its return
    { file: 'src/server/setting-holds.js', re: /^const write = \(patch\) => \{ ownWrite\+\+; try \{ patchSettings\(patch\); \} finally \{ ownWrite--; \} \};$/, road: 'THE HOLD STORE\'S ONE SETTINGS WRITE (`write`, pick 2 + the check\'s laws): the owner\'s press (timed: after the hold is on disk; lasting: before a live hold is released) and the RETURN (at its moment — a server act — or «End now» from the owner\'s page); marked as the store\'s own, so the hand-write hook never reads it as a hand\'s (test-setting-holds pins its three calls)', spend: 'the three ceilings only (ask-setting PROPOSABLE), a press only from the owner\'s page (ownerPageWhy); a return back to the value before the first press ONLY while the row still holds the hold\'s value (a hand change ends the hold where it lands — law B)' },
    { file: 'src/server/mounts-plugins-wiring.js', re: /readSettings: \(\) => persistenceRouter\.readSettings\(\), patchSettings: \(p\) => persistenceRouter\.patchSettings\(p\),/, road: 'the hold store\'s handle (src/server/setting-holds.js: the row above)', spend: 'the press and the return only' },
  ];
  const SITE = /\bwriteSettings\(|\bpatchSettings\(|path\.join\(dataDir, 'settings\.json'\)|writeJsonAtomic\(SETTINGS_FILE|settingsHold\.write\(|SETTINGS_FILE\b.*(write|rename)|this\._settings\.patch\(/;   // f3: + the plugin store's own handle · stale-pins: kept (an alternation of the settings writes the census still names)
  const files = [...new Set(require('node:child_process').execFileSync('git', ['ls-files', 'src', 'server.js', 'data/bin'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /\.(m?js|cjs)$/.test(f) || /^data\/bin\//.test(f)))];
  const sites = [];
  for (const f of files) {
    let t = ''; try { t = read(f); } catch { continue; }
    let fn = null;
    t.split('\n').forEach((l, i) => { const mf = /^  ([A-Za-z_$][\w$]*)\(.*\) \{$/.exec(l); if (mf) fn = mf[1]; if (SITE.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/function writeSettings\(|router\.patchSettings = |router\.reloadSettings|this\._writeSettings\(id, patch\)|_writeSettings\(id, patch = \{\}\)|writeSettings: \(patch\) => this\._writeSettings|\b(h|plugin)\.writeSettings\(/.test(l)) sites.push({ f, line: i + 1, l: l.trim(), fn }); });
  }
  const unknown = [];
  const rowOf = (s) => ROWS.find((x) => x.file === s.f && x.re.test(s.l) && (!x.fn || x.fn === s.fn));   // f3: a row per SITE (two sites may share a line's text)
  for (const s of sites) { const r = rowOf(s); if (r) console.log(`    · ${s.f}:${s.line}${s.fn ? ` (${s.fn})` : ''} — ${r.road} — a spending row: ${r.spend}`); else unknown.push(s); }
  ok(unknown.length === 0, 'every site that writes the settings file is a row of this census (the routes, the import, the server act and its callers, the boot migrations)', unknown);
  const planted = { f: 'src/server/some-new-writer.js', line: 1, l: "writeSettings({ 'spend.unattendedPerInstanceDay': 10000 });" };
  ok(gateOf(SITE.test(planted.l)) && !ROWS.some((x) => x.file === planted.f && x.re.test(planted.l)), 'control: a writer the census does not know (a planted site) is found by the grep and matches no row — it would be red', planted);
  ok(verdictOf(ROWS.every((r) => sites.some((s) => rowOf(s) === r))), 'every census row still names a live site (none stale)', ROWS.filter((r) => !sites.some((s) => rowOf(s) === r)).map((r) => r.road));
  // ④b the plugin road writes only its own namespace; ④c browser-propose takes no writer; ④d no migration names a spending row
  const PS = require(path.join(REPO, 'src/plugin-settings.js'));
  const rowPaths = Object.entries(PS.PLUGIN_SETTINGS).flatMap(([id, tbl]) => (tbl.rows || []).map((r) => PS.rowPath(id, r)));
  ok(rowPaths.length > 0 && !rowPaths.some((k) => /^spend\./.test(k)) && gateOf(/out\[PS\.rowPath\(id, r\)\]/.test(read('src/plugins.js'))) && verdictOf(/if \(!r\) throw new Error\(`plugin \$\{id\} has no setting \$\{k\}`\);/.test(read('src/plugins.js'))), `④b the plugin road writes only its PLUGIN_SETTINGS rows (an unknown key throws): ${rowPaths.length} paths, none a spend.* row`, rowPaths.filter((k) => /^spend\./.test(k)));
  ok(!/patchSettings/.test(read('src/server/browser-propose.js')), '④c browser-propose takes no settings writer');
  ok(!/['"`]spend\./.test(read('src/server/migrations.js')), '④d no boot migration names a spend.* key');
}

console.log('⑤ the suites: a spending row written on a scratch hub goes through ONE helper (scripts/scratch.mjs ownerPageHeaders)');
{
  const suites = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-spend-rows-owner.mjs');
  const writes = [];
  for (const f of suites) {
    const t = read(`scripts/${f}`);
    t.split('\n').forEach((l, i) => { if (/\/api\/(settings|config\/import)\b/.test(l) && /['"`]spend\./.test(l) && /\b(PATCH|POST|patch|post)\b/.test(l)) writes.push({ f, line: i + 1, viaHelper: /ownerPageHeaders\(/.test(l) }); });
  }
  console.log(`    · ${writes.length} line(s) in ${new Set(writes.map((w) => w.f)).size} suite(s) write a spending row through the settings routes today${writes.length ? ': ' + writes.map((w) => `${w.f}:${w.line}`).join(', ') : ''} (the readers of these rows stub serverSetting in-process)`);
  ok(verdictOf(writes.every((w) => w.viaHelper)), 'every suite line that writes a spending row through the routes writes it as the owner\'s page through the ONE helper', writes.filter((w) => !w.viaHelper));
  ok(verdictOf(/export function ownerPageHeaders\(base\) \{ return \{ Origin: new URL\(base\)\.origin, 'Sec-Fetch-Site': 'same-origin' \}; \}/.test(read('scripts/scratch.mjs'))), 'the helper: the two marks a browser on the instance\'s own page sends');
}

console.log('⑥ (b3) Settings › Spending says the truth on a sign-in-off instance — with the door to turn sign-in on');
{
  const ui = read('src/lib/settings-ui.js');
  ok(gateOf(/if \(cat === t\('Spending'\) && this\.app\?\._authEnabled === false\) this\._renderSpendSignInOff\(section\);/.test(ui)) && verdictOf(/_renderSpendSignInOff\(section\) \{[\s\S]{0,900}className: 'settings-row-info'[\s\S]{0,200}t\('Sign-in is off: anything that can reach VibeSpace can change these limits\. Set a password so only you can\.'\)[\s\S]{0,300}className: 'settings-row-control'[\s\S]{0,200}t\('Set password…'\)[\s\S]{0,120}open\.onclick = \(\) => this\.app\._showPasswordDialog\(\);/.test(ui)),
    'the Spending section, on an instance with sign-in off, says anything that can reach VibeSpace can change these limits (a standard row: words in .settings-row-info, the door in .settings-row-control), and its button opens the ⚙ menu\'s own password dialog');
  const key = '"Sign-in is off: anything that can reach VibeSpace can change these limits. Set a password so only you can.": "';
  ok(gateOf(read('src/lib/i18n-zh.js').includes(key)) && verdictOf(read('src/lib/i18n-ja.js').includes(key)), 'the words in zh and ja');
  // f1 (主开发 2026-11-15, REQUIRED): drawn only when sign-in is KNOWN off, and the open Settings redrawn when the flag changes — the
  // password set or removed, the home answer (a sentence about who can change money limits is never left false while shown)
  const sf = read('src/lib/setup-flows.js'), app = read('src/lib/app.js');
  ok(gateOf(/redrawOpen\(\) \{[\s\S]{0,300}this\._rerenderKeepingPlace\(content, nav\);/.test(ui)) && (sf.match(/this\._authEnabled = (true|false);\n\s*this\._settingsUI\?\.redrawOpen\?\.\(\);/g) || []).length === 3 && verdictOf(/this\._authEnabled = !!d\.authEnabled;\n\s*this\._settingsUI\?\.redrawOpen\?\.\(\);/.test(app)),
    'f1: every change of the sign-in flag (the password set, removed; the home answer) redraws the open Settings in place');
}

console.log(fail ? `✗ test-spend-rows-owner: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

#!/usr/bin/env node
// THE AUTOMATION-FLAG MEASUREMENT (lane browser-propose step 1, the incident of userW's fleet pod 2026-09-30: a FRESH
// sign-in refused with "This browser or app may not be secure" — the agent's browser announced itself as automated:
// `navigator.webdriver === true` and a headless user agent). Does `--disable-blink-features=AutomationControlled` in the
// config's `args` make `navigator.webdriver` read false on the installed agent-browser, headed AND headless?
//
// FOUR runs, each its own daemon (its own `AGENT_BROWSER_SESSION`), a scratch HOME whose `.agent-browser/browsers` links
// the real browsers dir read-only (nothing is downloaded), a config file written per run (`AGENT_BROWSER_CONFIG` —
// the product's own rung D shape), and a LOCAL page served by this script on 127.0.0.1 (never a vendor site). Each run
// reads `navigator.webdriver` and `navigator.userAgent` through the binary's own `eval`, then closes its browser.
//
//   headless · no flag   headless · flag   headed · no flag   headed · flag
//
// "headed" on a machine with no desktop session runs on the binary's own automatic Xvfb (0.38.1 `--help`:
// "AGENT_BROWSER_NO_XVFB  Disable automatic Xvfb for headed mode on displayless Linux hosts") — the same shape the
// keeper's hidden-window rung gives an agent's browser there.
//
// Both runs of a pair carry the same BASE args (`--base-args`, default `--no-sandbox`: a Chrome unpacked under
// ~/.agent-browser/browsers has no AppArmor profile, so on Ubuntu 23.10+ its namespace sandbox is refused and it exits
// before writing DevToolsActivePort — measured on this box's first run), so the flag is the ONE difference.
//
// Usage:  node scripts/measure-automation-flag.mjs [--bin <real agent-browser>] [--base-args <a,b>] [--json]
// The binary defaults to the first `agent-browser` on PATH that is not VibeSpace's shim (browser-verbs resolveRealBinary).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('../src/browser-verbs.js');
const B = require('../src/browser-profiles.js');

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const asJson = argv.includes('--json');
const BASE_ARGS = opt('--base-args') !== null ? String(opt('--base-args')) : '--no-sandbox';
const isShim = (p) => { try { return /vibespace-browser/.test(fs.readFileSync(p, 'utf8').slice(0, 4096)); } catch { return false; } };
const real = opt('--bin') ? { ok: true, path: opt('--bin') } : V.resolveRealBinary({ PATH: process.env.PATH || '', exists: (p) => fs.existsSync(p), isShim });
if (!real.ok) { console.error('no real agent-browser on PATH (the shim is skipped) — pass --bin <path>'); process.exit(2); }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `vs-bprop-${process.pid}-`));
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true, mode: 0o700 });
const realBrowsers = path.join(process.env.HOME || os.homedir(), '.agent-browser', 'browsers');
if (fs.existsSync(realBrowsers)) fs.symlinkSync(realBrowsers, path.join(HOME, '.agent-browser', 'browsers'));

const PAGE = '<!doctype html><title>automation flag probe</title><p id="p">probe</p>';
const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/probe`;

const version = (() => { const r = spawnSync(real.path, ['--version'], { encoding: 'utf8', env: { ...process.env, HOME }, timeout: 20000 }); return String(r.stdout || r.stderr || '').trim(); })();
const runs = [];
let n = 0;
for (const headed of [false, true]) {
  for (const flag of [false, true]) {
    n++;
    const cfgFile = path.join(ROOT, `config-${n}.json`);
    const args = flag ? B.withAutomationFlag(BASE_ARGS, { on: true }) : BASE_ARGS;
    fs.writeFileSync(cfgFile, JSON.stringify(args ? { args, headed } : { headed }, null, 2), { mode: 0o600 });
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME, LANG: 'C.UTF-8', AGENT_BROWSER_CONFIG: cfgFile, AGENT_BROWSER_SESSION: `vs-meas-${process.pid}-${n}`, AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000', ...(process.env.XDG_RUNTIME_DIR ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR } : {}) };
    // ASYNC on purpose: the page is served by THIS process — a spawnSync would block the loop that answers the browser
    // (measured: every Page.navigate timed out under spawnSync)
    const ab = (verb) => new Promise((resolve) => { execFile(real.path, verb, { encoding: 'utf8', env, timeout: 90000 }, (e, stdout, stderr) => resolve({ status: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(stdout || '').trim(), err: String(stderr || (e && e.message) || '').trim() })); });
    const open = await ab(['open', URL0]);
    const wd = await ab(['eval', 'String(navigator.webdriver)']);
    const ua = await ab(['eval', 'navigator.userAgent']);
    await ab(['close']);
    const clean = (s) => String(s || '').replace(/^["✓\s]+|["\s]+$/g, '');
    runs.push({ headed, flag, args: args || null, open: open.status === 0, webdriver: clean(wd.out.split('\n').pop()), userAgent: clean(ua.out.split('\n').pop()), errors: [open, wd, ua].filter((x) => x.status !== 0).map((x) => x.err.slice(0, 600)) });
  }
}
srv.close();
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* scratch */ }

const rec = { date: new Date().toISOString().slice(0, 10), agentBrowser: version, page: 'a local page on 127.0.0.1 (never a vendor site)', runs };
if (asJson) { console.log(JSON.stringify(rec, null, 2)); process.exit(0); }
console.log(`${version} · ${rec.date}`);
for (const r of runs) console.log(`  ${r.headed ? 'headed  ' : 'headless'} · ${r.flag ? 'flag   ' : 'no flag'} → navigator.webdriver = ${r.webdriver}  ·  ${r.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)}${r.errors.length ? '  · errors: ' + r.errors.join(' | ') : ''}`);

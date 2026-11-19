#!/usr/bin/env node
'use strict';
// A FAKE agent CLI for the provider Test (lane lg-providers U4 — scripts/test-model-providers.mjs ⑮). It runs NOTHING
// and calls NOBODY: it writes what it was handed — its argv, every env NAME, the provider's address and key variables, and
// every file reachable under each home-like variable — to $FAKE_REPORT, then answers like a CLI for the address's host:
//   refuse.* ⇒ a 401 · down.* ⇒ ECONNREFUSED · nomodel.* ⇒ a 404 not_found_error · slow.* ⇒ never ends · leak.* ⇒ prints
//   the key, then fails · linger.* ⇒ «ok», exit 0 — leaving a child of its own (same group) holding the pipes for 15 s, its
//   pid in $FAKE_REPORT.linger · anything else ⇒ «ok», exit 0.
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const env = process.env;
const fromArgv = (() => { const w = argv.find((a) => /\.base_url=/.test(a)); return w ? JSON.parse(w.slice(w.indexOf('=') + 1)) : null; })();
const base = env.ANTHROPIC_BASE_URL || fromArgv || '';
const key = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.VIBESPACE_PROVIDER_KEY || '';
const HOMES = ['HOME', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CODEX_HOME', 'GEMINI_CLI_HOME', 'AGY_HOME'];
const filesUnder = (d) => { const out = []; const walk = (x, rel) => { let es = []; try { es = fs.readdirSync(x, { withFileTypes: true }); } catch { return; } for (const e of es) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(x, e.name), r); else out.push(r); } }; walk(d, ''); return out; };
const homes = {};
for (const h of HOMES) if (env[h]) homes[h] = { dir: env[h], files: filesUnder(env[h]) };
try { fs.writeFileSync(env.FAKE_REPORT, JSON.stringify({ argv, envNames: Object.keys(env).sort(), base, keyVars: { ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN || null, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || null, VIBESPACE_PROVIDER_KEY: env.VIBESPACE_PROVIDER_KEY || null }, homes, cwd: process.cwd() })); } catch { }
const host = (/^https?:\/\/([^/:]+)/.exec(base) || [])[1] || '';
if (/^refuse\./.test(host)) { process.stderr.write('API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}\n'); process.exit(1); }
if (/^down\./.test(host)) { process.stderr.write('Error: connect ECONNREFUSED 127.0.0.1:9\n'); process.exit(1); }
if (/^nomodel\./.test(host)) { process.stderr.write('API Error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: unknown"}}\n'); process.exit(1); }
if (/^slow\./.test(host)) setInterval(() => { }, 1000);
else if (/^leak\./.test(host)) { process.stderr.write(`request failed with key ${key} (debug)\n`); process.exit(2); }
else if (/^linger\./.test(host)) { const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 15000) /* fake-cli linger */'], { stdio: ['ignore', 'inherit', 'inherit'] }); fs.writeFileSync(env.FAKE_REPORT + '.linger', String(c.pid)); process.stdout.write('ok\n'); process.exit(0); }
else { process.stdout.write('ok\n'); process.exit(0); }

#!/usr/bin/env node
// THE FAST TWIN OF test-pool-auto (B-7e49, lane bl-tests-chrome, 主开发 r4570): its three WRITER CENSUSES — K2 (`_turnStartedAt` and
// its writers' call sites), CW (`_compactedAt` / `_cacheFact` / `_compactedBy`) and r1 (the pool link's writers, the symlink primitive and
// the agent fence) — MOVED VERBATIM: pure reads of the tree (about 1.6 s of regex work, probed alone), with no scene of the pool engine.
// test-pool-auto keeps every scene; these censuses read only src/ and server.js from the checkout, as they did there.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST local import (B-ba47): handed a home outside every temp root, this script runs on a temp home of its own
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ck = (n, c) => { if (typeof c !== 'boolean') throw new TypeError(`ck: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
console.log('K2 / CW / r1 — the writer censuses (moved from test-pool-auto)');
      {
        // THE WRITER CENSUS: `_turnStartedAt` is assigned in turn-state.js alone, and each writer is called at exactly its sites
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []));
        const files = [...walk(path.resolve('src')), path.resolve('server.js')];
        const assigns = files.filter((f) => /\._turnStartedAt\s*=[^=]/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(path.resolve('.'), f));
        const callers = files.filter((f) => !/src\/(turn-state|session-schema)\.js$/.test(f)); // the definitions and the field's schema note
        const calls = (name) => { const out = {}; for (const f of callers) { const n = fs.readFileSync(f, 'utf8').split('\n').filter((l) => new RegExp('\\b' + name + '\\b').test(l) && !/^\s*const \{[^}]*\} = require\(|^\s*\*|^\s*\/\//.test(l)).length; if (n) out[path.relative(path.resolve('.'), f)] = n; } return out; };
        const sentAt = calls('noteRequestSent'), flagAt = calls('noteTurnFlight');
        ck('K2 WRITER CENSUS: `_turnStartedAt` is assigned only in turn-state.js; noteRequestSent at the send that starts a request (none in flight before it — r5), the continue, the parse (a new \'running\', a user record) and the device feed; noteTurnFlight at a mid-turn send, the parse (result, the state word, a local command\'s reply — B-ba09), the attach reconcile, the exit',
          JSON.stringify(assigns) === JSON.stringify(['src/turn-state.js'])
          && JSON.stringify(sentAt) === JSON.stringify({ 'src/server/session-brain.js': 1, 'src/server/stdout/claude-stream-json.js': 2, 'src/server/user-input.js': 1, 'server.js': 1 })
          && JSON.stringify(flagAt) === JSON.stringify({ 'src/server/session-stdout.js': 1, 'src/server/stdout/claude-stream-json.js': 4, 'src/server/user-input.js': 1, 'src/ws-handler.js': 1 }),
          JSON.stringify({ assigns, sentAt, flagAt }));
      }
      {
        // THE WRITER CENSUS (the lane's growth of K2's): `_compactedAt` and `_cacheFact` are assigned in usage-pool-engine.js alone
        // (noteCompacted sets the reset, noteModelRequest ends it and stamps the fact; boot-restore's restore is a literal's key)
        const walkM = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkM(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []));
        const filesM = [...walkM(path.resolve('src')), path.resolve('server.js')];
        const by = (re) => { const o = {}; for (const f of filesM) { const n = (fs.readFileSync(f, 'utf8').match(re) || []).length; if (n) o[path.relative(path.resolve('.'), f)] = n; } return o; };
        const comp = by(/\._compactedAt\s*=[^=]/g), fact = by(/\._cacheFact\s*=[^=]/g), compBy = by(/\._compactedBy\s*=[^=]/g);
        ck('CW WRITER CENSUS: `_compactedAt` is assigned only in usage-pool-engine.js — noteCompacted\'s reset and noteModelRequest\'s end of it; `_cacheFact` only by noteModelRequest; `_compactedBy` only by noteCompacted (r3) (RED on 749aa7bf9: neither exists)',
          JSON.stringify(comp) === JSON.stringify({ 'src/server/usage-pool-engine.js': 2 }) && JSON.stringify(fact) === JSON.stringify({ 'src/server/usage-pool-engine.js': 1 }) && JSON.stringify(compBy) === JSON.stringify({ 'src/server/usage-pool-engine.js': 1 }), JSON.stringify({ comp, fact, compBy }));
      }
  {
    const { execFileSync } = require('node:child_process');
    const { gitEnvFrom } = await import('./git-env.mjs');
    const files = execFileSync('git', ['ls-files', 'src', 'server.js'], { encoding: 'utf8', cwd: path.resolve('.'), env: gitEnvFrom(process.env) }).split('\n').filter((f) => /\.js$/.test(f));
    const code = (f) => fs.readFileSync(path.resolve(f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    const callers = (re) => files.filter((f) => re.test(code(f))).sort();
    // (the atomic symlink primitive has two callers that are NOT pool placement and predate this lane: the device's
    // sealed-orders reflex and the agent browser's pin link — the set is master's, the lane added no caller)
    ck('r1 census: the symlink primitive is called by the SAME files as before the lane — for a pool link, by the store alone', JSON.stringify(callers(/(^|[^'"`\w])repointPoolSymlink\(/m)) === JSON.stringify(['src/account-material.js', 'src/accounts.js', 'src/agentd/agentd.js', 'src/server/browser-env.js']) && !/symlinkSync\(|repointPoolSymlink\(/.test(code('src/server/usage-pool-engine.js') + code('src/server/account-usage-routes.js') + code('src/ws-create.js')), JSON.stringify(callers(/(^|[^'"`\w])repointPoolSymlink\(/m)));
    const writers = callers(/\.(setPoolTarget|ensureSessionPoolLink|updatePool)\(/);
    ck('r1 census: setPoolTarget / ensureSessionPoolLink / updatePool are CALLED by the store, the engine and the owner\'s account routes only (' + files.length + ' files read)', files.length > 300 && JSON.stringify(writers) === JSON.stringify(['src/accounts.js', 'src/server/account-usage-routes.js', 'src/server/usage-pool-engine.js']), JSON.stringify(writers));
    ck('r1 census: no agent-facing module names a pool writer, the pin writer, the removal or the gather plan', !/setPoolTarget|ensureSessionPoolLink|updatePool|setConversationPin|memberRemoved|gatherPlan/.test(code('src/agent-routes.js')));
    const routes = code('src/server/account-usage-routes.js');
    const fence = "if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });";
    const first = (head) => { const i = routes.indexOf(head); if (i < 0) return false; const body = routes.slice(i + head.length, i + head.length + 400); return body.indexOf(fence) >= 0 && !/accounts\.|engine\./.test(body.slice(0, body.indexOf(fence)).replace(/const id = req\.params\.id;/, '')); };
    ck('r1 census: the members/priority PATCH, the gather and the pin refuse an agent\'s token BEFORE they read anything; the retired target route answers 410 to everyone', gateOf(first("app.patch('/api/accounts/pool/:id', (req, res) => {")) && gateOf(first("app.post('/api/accounts/pool/:id/gather', (req, res) => {")) && gateOf(first("app.post('/api/accounts/:poolId/pin', (req, res) => {")) && verdictOf(/app\.post\('\/api\/accounts\/pool\/:id\/target', \(req, res\) => \{\n\s*res\.status\(410\)/.test(routes)));
  }
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

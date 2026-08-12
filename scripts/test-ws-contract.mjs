#!/usr/bin/env node
// WS CTX CONTRACT guard (拆分P2): the ws-handler dependency interface is
// EXPLICIT — WS_CTX_CONTRACT names every key, registration validates it, and
// this suite pins three surfaces to each other so they cannot drift:
//   1. every name the handler files destructure from ctx ∈ WS_CTX_CONTRACT
//   2. every late `ctx.<key>` access ∈ WS_CTX_CONTRACT
//   3. server.js's registerWsHandler call site passes EVERY contract key
// A new dependency added to the destructure without updating the contract (or
// the call site) fails here instead of surfacing as `undefined` mid-create.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { WS_CTX_CONTRACT } = require(path.join(REPO, 'src/ws-handler.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? ' — ' + extra : '')); } };

const contract = new Set(WS_CTX_CONTRACT);
ok(contract.size >= 40, `contract is populated (${contract.size} keys)`);

function destructuredFromCtx(file) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf-8');
  const names = new Set();
  for (const m of src.matchAll(/\{([^{}]+)\}\s*=\s*ctx\b/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(':')[0].trim();
      if (/^[\w$]+$/.test(n)) names.add(n);
    }
  }
  for (const m of src.matchAll(/\bctx\.([\w$]+)/g)) names.add(m[1]);
  return names;
}

for (const file of ['src/ws-handler.js', 'src/ws-create.js']) {
  const used = destructuredFromCtx(file);
  const missing = [...used].filter((n) => !contract.has(n));
  ok(missing.length === 0, `${file}: every ctx dependency is in WS_CTX_CONTRACT`, missing.join(', '));
}

// server.js call site: registerWsHandler(wss, { ...keys... }) must pass every
// contract key (shorthand or key:). Parse the object literal's top-level keys.
{
  const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
  const m = src.match(/registerWsHandler\(wss,\s*\{([\s\S]*?)\n\}\);/);
  ok(!!m, 'server.js has the registerWsHandler call site');
  const passed = new Set();
  if (m) {
    let depth = 0;
    for (const lineRaw of m[1].split('\n')) {
      const line = lineRaw.replace(/\/\/.*$/, '').trim();
      if (depth === 0) {
        for (const km of line.matchAll(/(?:^|[,{]\s*)([\w$]+)\s*[:,}]/g)) passed.add(km[1]);
        for (const km of line.matchAll(/(?:^|,)\s*([\w$]+)\s*(?=,|$)/g)) passed.add(km[1].trim());
      }
      for (const ch of line) { if (ch === '{' || ch === '(') depth++; else if (ch === '}' || ch === ')') depth--; }
      if (depth < 0) depth = 0;
    }
  }
  const missing = [...contract].filter((k) => !passed.has(k));
  ok(missing.length === 0, 'server.js call site passes every contract key', missing.join(', '));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

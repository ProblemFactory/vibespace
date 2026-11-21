#!/usr/bin/env node
// THE WEBHOOK ROUTES — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-webhook-routes.mjs (its behaviour legs and every mutant / browser CONTROL stay there): §0 the pins — the webhook exemption as ONE line of src/door.js (the door class, lifted out of src/auth.js by the separation's B3a), the own-body paths of server.js.
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-webhook-routes-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
console.log('§0 the pins');
const AUTH_LINE = "  if (/^\\/hook(?:\\/|$)/.test(p) || (req.method === 'GET' && /^\\/api\\/channels\\/webhook\\/[a-z0-9][a-z0-9-]{0,62}\\/replies$/.test(p)) || (req.method === 'POST' && /^\\/api\\/channels\\/webhook\\/[a-z0-9][a-z0-9-]{0,62}\\/pair$/.test(p))) return next();";
const authSrc = fs.readFileSync(path.join(repo, 'src/door.js'), 'utf-8');   // the door class, lifted verbatim out of src/auth.js by B3a (its function body's indent)
ok(authSrc.split('\n').filter((l) => l === AUTH_LINE).length === 1 && (authSrc.match(/\/\^\\\/hook/g) || []).length === 1, 'src/door.js (the door class, from src/auth.js) holds the webhook exemption as ONE line, verbatim (exactly /hook/<slug>, the caller\'s replies GET, the pairing POST)');
const serverSrc = fs.readFileSync(path.join(repo, 'server.js'), 'utf-8');
ok(serverSrc.includes("OWN_BODY_RE = /^\\/(?:proxy\\/|hook\\/|api\\/channels\\/webhook\\/[^/]+\\/pair$|api\\/feedback\\/forward$)/;") && serverSrc.includes('app.use((req, res, next) => (OWN_BODY_RE.test(req.path) || (persistenceRouter.ownsBody && persistenceRouter.ownsBody(req.path)) ? next() : jsonBody(req, res, next)));'), 'server.js: the global JSON parser skips /hook/, the pairing route and the feedback forward door at the /proxy/ place');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

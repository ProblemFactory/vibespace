// THE STUB CODEX APP-SERVER (lane reset-path, 2026-10-01; extracted from scripts/test-codex-protocol-drift.mjs ⑤,
// lane-codex-0159) — never a test-*.mjs, never a vendor call: a node script that answers the JSON-RPC the way
// the MEASURED table (scripts/fixtures/codex-app-server/<version>-methods.json) says the real CLI does — a
// request missing a required field is refused with the CLI's own words, an unknown method with its own error.
// ONE stub for every suite that drives a codex app-server client: the real wrapper (test-codex-protocol-drift),
// the reset-credit helper process (test-reset-credit-ui, test-vendor-whitelist §8).
//   writeStub(dir) → the path of an EXECUTABLE copy (a shebang + 0755: the helper spawns `<cmd> app-server`)
// Its env: STUB_TABLE (the measured table) · STUB_LOG (one ndjson line per request, with the CODEX_HOME it ran
// under) · STUB_MODE answer | drop-first (the first consume of a key unanswered) | hang-consume (no consume is
// ever answered) | nothing (consume ⇒ nothingToReset) | exit-on-consume (verify r2: the app-server DIES the moment
// the consume arrives — sent, never answered) | hang-read (verify r4: no rateLimits/read is ever answered — a helper
// parked in its read-first) | fail-read (every read answers an error) | new-word (consume ⇒ an outcome word no
// measured table lists) | no-word (consume ⇒ a result with no outcome at all) · STUB_READ_USED (the rateLimits/read's
// usedPercent, 100) · STUB_READ_COUNT (the read's stored credit count, 1; `none` = no count carried — verify r8).
// The app-server's own lifetime rule: stdin closed ⇒ exit (a stub that outlives its client is an orphan).
import fs from 'node:fs';
import path from 'node:path';

export const STUB_SOURCE = `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const T = JSON.parse(fs.readFileSync(process.env.STUB_TABLE, 'utf8'));
const LOG = process.env.STUB_LOG, MODE = process.env.STUB_MODE || 'answer';
const READ_USED = Number(process.env.STUB_READ_USED || 100);
// the CLI's own words, read off the measured table (never spelled here)
const missingWords = (f) => T.wrapperMethods['account/rateLimitResetCredit/consume'].errorOnEmpty.message.replace(/\\\`[^\\\`]+\\\`/, '\\\`' + f + '\\\`');
const unknownWords = (m) => T.unknownMethodError.message.replace(/\\\`[^\\\`]+\\\`/, '\\\`' + m + '\\\`').split(', expected')[0];
const seenKeys = new Set(); const dropped = new Set();
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
let b = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; }
  if (m.id === undefined || !m.method) { if (LOG && m.method) fs.appendFileSync(LOG, JSON.stringify({ method: m.method, notification: true, params: m.params || {}, verdict: T.clientNotifications.includes(m.method) ? 'ok' : 'unknown-notification', home: process.env.CODEX_HOME || null }) + '\\n'); continue; }
  const row = T.clientRequests[m.method];
  const p = m.params || {};
  let verdict = 'ok', error = null;
  if (!row) error = { code: T.unknownMethodError.code, message: unknownWords(m.method) };
  else { const miss = row.required.filter((f) => !(f in p) || p[f] === undefined || p[f] === null); if (miss.length) error = { code: -32600, message: missingWords(miss[0]) }; }
  if (!error && m.method === 'account/rateLimitResetCredit/consume' && p.idempotencyKey === '') error = { code: -32600, message: 'idempotencyKey must not be empty' };
  if (error) verdict = 'refused';
  if (LOG) fs.appendFileSync(LOG, JSON.stringify({ id: m.id, method: m.method, params: p, verdict, error: error && error.message, home: process.env.CODEX_HOME || null, args: process.argv.slice(2) }) + '\\n');
  if (error) { out({ id: m.id, error }); continue; }
  let r = {};
  if (m.method === 'initialize') r = { userAgent: 'stub/' + T.codexVersion };
  else if (/^thread\\/(start|resume|fork)$/.test(m.method)) r = { thread: { id: p.threadId || 'th-stub-1', name: null }, model: 'gpt-stub', reasoningEffort: 'medium' };
  else if (m.method === 'account/rateLimits/read' && MODE === 'hang-read') continue; // verify r4: the read is never answered
  else if (m.method === 'account/rateLimits/read' && MODE === 'fail-read') { out({ id: m.id, error: { code: -32000, message: 'rate limit read failed (stub)' } }); continue; }
  else if (m.method === 'account/rateLimits/read') r = { rateLimits: { primary: { usedPercent: READ_USED, windowDurationMins: 10080, resetsAt: Number(process.env.STUB_READ_RESETS_AT) || Math.floor(Date.now() / 1000) + 86400 }, secondary: null }, rateLimitResetCredits: process.env.STUB_READ_COUNT === 'none' ? null : { availableCount: Number(process.env.STUB_READ_COUNT || 1), credits: null } }; // STUB_READ_RESETS_AT (verify r5): the window the read states; STUB_READ_COUNT=none (verify r8): a read carrying no count
  else if (m.method === 'account/rateLimitResetCredit/consume') {
    const k = p.idempotencyKey;
    if (MODE === 'exit-on-consume') process.exit(0); // the app-server died after taking the request (logged above: it arrived)
    if (MODE === 'hang-consume') continue; // sent, never answered
    if (MODE === 'new-word') { out({ id: m.id, result: { outcome: 'noCreditsAvailable' } }); continue; } // verify r4: a word no measured table lists
    if (MODE === 'no-word') { out({ id: m.id, result: {} }); continue; } // verify r4: an answer with no word at all
    if (MODE === 'drop-first' && !dropped.has(k)) { dropped.add(k); seenKeys.add(k); continue; } // no answer: the consume landed, the reply was lost
    r = { outcome: MODE === 'nothing' ? 'nothingToReset' : (seenKeys.has(k) ? 'alreadyRedeemed' : 'reset') }; seenKeys.add(k);
  }
  else if (m.method === 'thread/queue/list') r = { data: [] };
  else if (m.method === 'thread/goal/get') r = { goal: null };
  else if (m.method === 'turn/start') r = { turn: { id: 'turn-stub-1', status: 'inProgress', items: [] } };
  else if (m.method === 'thread/name/set') r = { thread: { id: p.threadId, name: p.name } };
  else if (m.method === 'config/read') r = { config: {}, origins: {}, layers: [] };
  out({ id: m.id, result: r });
} });
process.stdin.on('end', () => process.exit(0));
`;

/** An executable copy of the stub in `dir` (the caller's scratch dir) → its path. */
export function writeStub(dir, name = 'stub-app-server.cjs') {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  fs.writeFileSync(f, STUB_SOURCE, { mode: 0o755 });
  fs.chmodSync(f, 0o755);
  return f;
}

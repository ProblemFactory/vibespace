#!/usr/bin/env node
// B-80cb (主开发 r1355) — THE ONE DOOR EVERY TRANSCRIPT READER TAKES (src/attach-read.js readOffLoop). Judged by COUNTS, never a clock:
//   A) the claude reader's door (SessionMessages.rawAsync — the worker's warm of its tail, then its merge): a reader taken through
//      readOffLoop and then read (activePendingPermissions, raw — the re-attach of a conversation whose history is loaded) opens its
//      transcript ZERO times on this thread; RED CONTROL: a copy whose reader has no door — readOffLoop passes it by and the read
//      parses the tail here (it opens the transcript on this thread)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import './scratch.mjs';   // §113 THE ORDER (主开发 r1845): the scratch import first after node's own
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-transcript-door-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;
os.homedir = () => HOME;

// a claude transcript of a few MB (the door's work is the same at any size: the tail parsed in the worker)
const CWD = '/w/door';
const PROJ = path.join(HOME, '.claude', 'projects', CWD.replace(/[^A-Za-z0-9]/g, '-'));
fs.mkdirSync(PROJ, { recursive: true });
const ID = '7d7d7d7d-0000-4000-8000-000000000001';
const FP = path.join(PROJ, `${ID}.jsonl`);
const TEXT = 'x'.repeat(600);
const lines = [];
for (let i = 0; i < 4000; i++) {
  const at = new Date(Date.UTC(2026, 10, 1) + i * 1000).toISOString();
  lines.push(JSON.stringify(i % 2 === 0
    ? { type: 'user', uuid: `u-${i}`, sessionId: ID, cwd: CWD, timestamp: at, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: `ask ${i}` }] } }
    : { type: 'assistant', uuid: `a-${i}`, sessionId: ID, cwd: CWD, timestamp: at, requestId: `req_${i}`, message: { id: `msg_${i}`, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: TEXT }] } }));
}
fs.writeFileSync(FP, lines.join('\n') + '\n');

const { readOffLoop } = require(path.join(REPO, 'src/attach-read.js'));
const SS_REL = 'src/session-store.js', SS_SRC = fs.readFileSync(path.join(REPO, SS_REL), 'utf8');
// the transcript opened on THIS thread (a worker's reads are its own thread's): fs.openSync / readFileSync of the file
const opensDuring = async (fn) => {
  const realOpen = fs.openSync, realRead = fs.readFileSync;
  let n = 0;
  fs.openSync = function (p, ...a) { if (String(p) === FP) n++; return realOpen.call(this, p, ...a); };
  fs.readFileSync = function (p, ...a) { if (String(p) === FP) n++; return realRead.call(this, p, ...a); };
  try { const v = await fn(); return { n, v }; } finally { fs.openSync = realOpen; fs.readFileSync = realRead; }
};
const session = () => ({ backend: 'claude', claudeSessionId: ID, backendSessionId: ID, cwd: CWD, buffer: '' });

console.log('A) the claude reader\'s door: a re-attach reads its transcript off the loop');
{
  const SS = require(path.join(REPO, SS_REL));
  SS.jsonlCacheClear();
  const sm = new SS.SessionMessages(session(), 'w-door', {});
  const r = await opensDuring(async () => { const took = await readOffLoop(sm, { label: 'door' }); const perms = sm.activePendingPermissions(); return { took, rows: sm.raw().length, perms: !!perms }; });
  ok(typeof sm.rawAsync === 'function' && r.v.took === true && r.v.rows > 0 && r.n === 0,
    `a claude reader taken through readOffLoop, then read (activePendingPermissions, raw): ${r.v.rows} records, ${r.n} open(s) of its transcript on this thread`, r);
  let SSx = null, why = null;
  try { SSx = mutantCopies('transcript-door-none', REPO).load(SS_REL, anchored(SS_SRC, '  async rawAsync({ wanted = null } = {}) {', '  async rawAsyncGone({ wanted = null } = {}) {', 'the claude reader has no door'), 'nodoor'); } catch (e) { why = e.message; }
  let x = null;
  if (SSx) {
    SSx.jsonlCacheClear();
    const smx = new SSx.SessionMessages(session(), 'w-door-x', {});
    x = await opensDuring(async () => { const took = await readOffLoop(smx, { label: 'door-x' }); smx.activePendingPermissions(); return { took, rows: smx.raw().length }; });
  }
  ok(!!x && x.v.took === false && x.v.rows > 0 && x.n >= 1, `RED CONTROL (a claude reader with no door — the road before this unit): readOffLoop passes it by, the read opens its transcript ${x ? x.n : '?'} time(s) on this thread`, x || why);
}
report();

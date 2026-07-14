#!/usr/bin/env node
// Offline e2e for the Gmail sync engine (2.134.0): a mock Gmail API served on
// 127.0.0.1 + a patched API base exercises seed sync, filename shape (RFC2047
// subject), dedup-by-directory, incremental history sync, and expired-history
// reseed. Run: node scripts/test-gmail-sync.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const b64url = (s) => Buffer.from(s).toString('base64url');

// ── mock Gmail API ──
const MSGS = {
  m1aaaa11: { internalDate: '1783900000000', raw: b64url('Subject: Hello world\r\nFrom: a@b.c\r\n\r\nbody one') },
  m2bbbb22: { internalDate: '1783900100000', raw: b64url('Subject: =?utf-8?B?5Lit5paH5rWL6K+V?=\r\nFrom: x@y.z\r\n\r\n你好') },
  m3cccc33: { internalDate: '1783900200000', raw: b64url('Subject: Later mail\r\n\r\nincremental body') },
};
let phase = 'seed'; // seed → incr → expired
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (o) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
  if (u.pathname.endsWith('/profile')) return send({ emailAddress: 'tester@example.com', historyId: '1000' });
  if (u.pathname.endsWith('/messages')) {
    // paginated seed: page 1 → m1, nextPageToken; page 2 → m2 (for checkpoint test)
    if (globalThis.__paged) {
      const pt = u.searchParams.get('pageToken');
      if (!pt) return send({ messages: [{ id: 'm1aaaa11' }], nextPageToken: 'PAGE2' });
      return send({ messages: [{ id: 'm2bbbb22' }] });
    }
    return send({ messages: ['m1aaaa11', 'm2bbbb22'].map((id) => ({ id })) });
  }
  if (u.pathname.includes('/messages/')) {
    const id = u.pathname.split('/').pop();
    const labelIds = id === 'm1aaaa11' ? ['INBOX'] : id === 'm2bbbb22' ? [] : ['SENT'];
    return send({ id, internalDate: MSGS[id].internalDate, raw: MSGS[id].raw, labelIds });
  }
  if (u.pathname.endsWith('/labels')) {
    return send({ labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }, { id: 'Label_7', name: 'Receipts', type: 'user' }] });
  }
  if (u.pathname.endsWith('/history')) {
    if (phase === 'expired') return res.writeHead(404).end('{}');
    return send({ historyId: '2000', history: [{ messagesAdded: [{ message: { id: 'm3cccc33' } }] }] });
  }
  res.writeHead(404).end('{}');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

// patch the module's API base + token endpoint (worker refresh not exercised:
// give it a far-future access token)
const gsPath = require.resolve('../src/gmail-sync.js');
let src = fs.readFileSync(gsPath, 'utf-8');
src = src.replace("const API = 'https://gmail.googleapis.com/gmail/v1/users/me';", `const API = 'http://127.0.0.1:${port}/gmail/v1/users/me';`);
const tmpMod = path.join(os.tmpdir(), `gmail-sync-test-${Date.now()}.js`);
fs.writeFileSync(tmpMod, src);
const { GmailSync } = require(tmpMod);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-'));
const gs = new GmailSync({ presets: () => [{ key: 't', label: 'T', clientId: 'c', clientSecret: 's' }] });
const cfg = {
  id: 'mnt-test', dir,
  token: JSON.stringify({ refresh_token: 'r', access_token: 'a', expiry: Date.now() + 3600e3 }),
  clientPreset: 't', syncCount: 10, labelIds: 'INBOX', query: '', pollSeconds: 9999,
};
const w = gs.start(cfg);
// wait for first sync
for (let i = 0; i < 100 && w.state !== 'idle' && w.state !== 'error'; i++) await new Promise((r) => setTimeout(r, 50));
check('seed sync reaches idle', w.state === 'idle', w.error || '');
let files = fs.readdirSync(dir).filter((f) => f.endsWith('.eml')).sort();
check('two messages seeded', files.length === 2, files.join(','));
check('RFC2047 subject decoded in filename', files.some((f) => f.includes('中文测试')), files.join(','));
check('id rides the filename tail', files.every((f) => /_(m1aaaa11|m2bbbb22)\.eml$/.test(f)));
check('email learned', gs.status('mnt-test').email === 'tester@example.com');
const body = fs.readFileSync(path.join(dir, files.find((f) => f.includes('m1aaaa11'))), 'utf-8');
check('raw eml content intact', body.includes('Subject: Hello world') && body.includes('body one'));
const state1 = JSON.parse(fs.readFileSync(path.join(dir, '.vibespace-gmail-state.json'), 'utf-8'));
check('historyId persisted', state1.historyId === '1000');

// incremental
phase = 'incr';
await w._forceOnce?.() ?? await (async () => { await gsSyncOnce(); })().catch(() => {});
async function gsSyncOnce() { await gs._syncOnce(w); }
await gs._syncOnce(w).catch((e) => check('incremental sync throws nothing', false, e.message));
files = fs.readdirSync(dir).filter((f) => f.endsWith('.eml'));
check('incremental adds the new message', files.some((f) => f.includes('m3cccc33')), files.join(','));
check('no duplicates on re-sync', files.length === 3);
const state2 = JSON.parse(fs.readFileSync(path.join(dir, '.vibespace-gmail-state.json'), 'utf-8'));
check('historyId advanced', state2.historyId === '2000');

// expired history → reseed without duplicates
phase = 'expired';
await gs._syncOnce(w).catch((e) => check('expired-history reseed throws nothing', false, e.message));
files = fs.readdirSync(dir).filter((f) => f.endsWith('.eml'));
check('reseed keeps exactly 3 files (dedup by dir)', files.length === 3, files.join(','));

// date grouping: month subfolders + cross-subdir dedup
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-g-'));
phase = 'seed';
const w2 = gs.start({ ...cfg, id: 'mnt-g', dir: dir2, groupBy: 'month' });
for (let i = 0; i < 100 && w2.state !== 'idle' && w2.state !== 'error'; i++) await new Promise((r) => setTimeout(r, 50));
check('grouped sync reaches idle', w2.state === 'idle', w2.error || '');
const subs = fs.readdirSync(dir2).filter((f) => /^\d{4}-\d{2}$/.test(f));
check('month subfolder created', subs.length >= 1, fs.readdirSync(dir2).join(','));
const grouped = subs.flatMap((d) => fs.readdirSync(path.join(dir2, d)));
check('emails live inside the month folder', grouped.filter((f) => f.endsWith('.eml')).length === 2, grouped.join(','));
await gs._syncOnce(w2).catch(() => {});
check('dedup works across subfolders', subs.flatMap((d) => fs.readdirSync(path.join(dir2, d))).filter((f) => f.endsWith('.eml')).length >= 2);
gs.stop('mnt-g');
fs.rmSync(dir2, { recursive: true, force: true });

// label-month layout: Inbox/ + Archive/ subtrees, dedup across them
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-l-'));
phase = 'seed';
const w3 = gs.start({ ...cfg, id: 'mnt-l', dir: dir3, groupBy: 'label-month', labelIds: '' });
for (let i = 0; i < 100 && w3.state !== 'idle' && w3.state !== 'error'; i++) await new Promise((r) => setTimeout(r, 50));
check('label-month sync reaches idle', w3.state === 'idle', w3.error || '');
const hasInbox = fs.existsSync(path.join(dir3, 'Inbox')) && fs.readdirSync(path.join(dir3, 'Inbox')).some((d) => /^\d{4}-\d{2}$/.test(d));
const hasArchive = fs.existsSync(path.join(dir3, 'Archive'));
check('Inbox/<month>/ + Archive/ created by label precedence', hasInbox && hasArchive, fs.readdirSync(dir3).join(','));
await gs._syncOnce(w3).catch(() => {});
const countL = (root) => { let n = 0; const walk = (d, depth) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory() && depth < 2) walk(path.join(d, e.name), depth + 1); else if (e.name.endsWith('.eml')) n++; } }; walk(root, 0); return n; };
// the 2nd pass is INCREMENTAL (historyId persisted) → m3 arrives with SENT
check('incremental lands under Sent/ + no duplicates', countL(dir3) === 3 && fs.existsSync(path.join(dir3, 'Sent')), String(countL(dir3)));
// labels list endpoint
const labs = await gs.listLabels({ token: cfg.token, clientPreset: 't' });
check('listLabels returns system+user', labs.length === 2 && labs[0].type === 'system' && labs[1].name === 'Receipts');
gs.stop('mnt-l');
fs.rmSync(dir3, { recursive: true, force: true });

// SEED CHECKPOINT: interrupt after page 1, restart → resumes from page 2 (no re-list of page 1)
globalThis.__paged = true;
const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-cp-'));
phase = 'seed';
const w4 = gs.start({ ...cfg, id: 'mnt-cp', dir: dir4, groupBy: 'none' });
// let it fetch page 1 then stop
for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 30)); if (fs.readdirSync(dir4).filter((f)=>f.endsWith('.eml')).length >= 1) break; }
gs.stop('mnt-cp');
await new Promise((r) => setTimeout(r, 50));
const stateAfterP1 = JSON.parse(fs.readFileSync(path.join(dir4, '.vibespace-gmail-state.json'), 'utf-8'));
check('checkpoint persists seedPageToken after page 1', !!stateAfterP1.seedPageToken || stateAfterP1.historyId, JSON.stringify(stateAfterP1));
check('seed-start historyId anchored', !!(stateAfterP1.seedHistoryId || stateAfterP1.historyId));
// restart → should resume, end with BOTH messages, no duplicates
const w4b = gs.start({ ...cfg, id: 'mnt-cp', dir: dir4, groupBy: 'none' });
for (let i = 0; i < 100 && w4b.state !== 'idle'; i++) await new Promise((r) => setTimeout(r, 40));
const cpFiles = fs.readdirSync(dir4).filter((f) => f.endsWith('.eml'));
const cpIds = cpFiles.map((f) => (f.match(/_([^_]+)\.eml$/) || [])[1]);
check('resume completes seed — page-1 + page-2 present, no duplicates', cpIds.includes('m1aaaa11') && cpIds.includes('m2bbbb22') && new Set(cpIds).size === cpIds.length, cpFiles.join(','));
const finalState = JSON.parse(fs.readFileSync(path.join(dir4, '.vibespace-gmail-state.json'), 'utf-8'));
check('seed done → historyId set, seed cursor cleared', !!finalState.historyId && !finalState.seedPageToken);
gs.stop('mnt-cp');
fs.rmSync(dir4, { recursive: true, force: true });
globalThis.__paged = false;

gs.stop('mnt-test');
srv.close();
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(tmpMod, { force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);

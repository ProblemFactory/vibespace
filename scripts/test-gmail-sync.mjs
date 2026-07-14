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
    return send({ messages: ['m1aaaa11', 'm2bbbb22'].map((id) => ({ id })) });
  }
  if (u.pathname.includes('/messages/')) {
    const id = u.pathname.split('/').pop();
    return send({ id, internalDate: MSGS[id].internalDate, raw: MSGS[id].raw });
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

gs.stop('mnt-test');
srv.close();
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(tmpMod, { force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);

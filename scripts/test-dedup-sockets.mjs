#!/usr/bin/env node
// dedupWebuiSockets — restore-time conversation dedup (2.185.3, real xingweil
// "重复session" report). A plain `claude --resume` REUSES the conversation id,
// so a resume of a session whose claude had already died mints a SECOND dtach
// session for the SAME claudeSessionId → two sidebar cards (walter's local
// double-writer class). restoreSessions keeps ONE socket per conversation.
// Run: node scripts/test-dedup-sockets.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { dedupWebuiSockets } = require('../src/session-store.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const arr = (s) => [...s].sort();

// the reported case: two husks for one conversation, both claude dead → newest wins
{
  const { retire, winners } = dedupWebuiSockets([
    { sockFile: 'cw-1-old', backend: 'claude', host: 'local', claudeSessionId: '79928a2b', createdAt: 1784075617808, claudeAlive: false },
    { sockFile: 'cw-1-new', backend: 'claude', host: 'local', claudeSessionId: '79928a2b', createdAt: 1784106737872, claudeAlive: false },
  ]);
  check('both-dead: retires the OLDER husk', arr(retire).join() === 'cw-1-old', JSON.stringify(arr(retire)));
  check('both-dead: keeps the NEWEST', winners.get('claude:local:79928a2b') === 'cw-1-new');
}

// a LIVE claude beats a newer dead husk (never retire the working one)
{
  const { retire } = dedupWebuiSockets([
    { sockFile: 'cw-live', claudeSessionId: 'abc', createdAt: 100, claudeAlive: true },
    { sockFile: 'cw-dead-newer', claudeSessionId: 'abc', createdAt: 999, claudeAlive: false },
  ]);
  check('alive claude wins over a NEWER dead husk', arr(retire).join() === 'cw-dead-newer', JSON.stringify(arr(retire)));
}

// two live writers on one JSONL (the dangerous double-writer): retire the older
{
  const { retire } = dedupWebuiSockets([
    { sockFile: 'cw-a', claudeSessionId: 'x', createdAt: 10, claudeAlive: true },
    { sockFile: 'cw-b', claudeSessionId: 'x', createdAt: 20, claudeAlive: true },
  ]);
  check('two live writers: retire the older (keep current writer)', arr(retire).join() === 'cw-a');
}

// distinct conversations are NEVER retired
{
  const { retire } = dedupWebuiSockets([
    { sockFile: 'cw-1', claudeSessionId: 'p', createdAt: 1, claudeAlive: false },
    { sockFile: 'cw-2', claudeSessionId: 'q', createdAt: 2, claudeAlive: false },
    { sockFile: 'cw-3', claudeSessionId: 'r', createdAt: 3, claudeAlive: true },
  ]);
  check('distinct conversations: nothing retired', retire.size === 0);
}

// forks / remote: same claudeSessionId on DIFFERENT hosts is not a duplicate
{
  const { retire } = dedupWebuiSockets([
    { sockFile: 'cw-localA', host: 'local', claudeSessionId: 'z', createdAt: 1, claudeAlive: false },
    { sockFile: 'cw-hostB', host: 'host-x', claudeSessionId: 'z', createdAt: 2, claudeAlive: false },
  ]);
  check('same id on different hosts: not a duplicate', retire.size === 0, JSON.stringify(arr(retire)));
}

// no claudeSessionId yet (brand-new) → never a duplicate
{
  const { retire } = dedupWebuiSockets([
    { sockFile: 'cw-p', claudeSessionId: null, createdAt: 1 },
    { sockFile: 'cw-q', claudeSessionId: null, createdAt: 2 },
    { sockFile: 'cw-r', claudeSessionId: '', createdAt: 3 },
  ]);
  check('null/empty conversation ids: never retired', retire.size === 0);
}

// three husks for one conversation: keep newest, retire the other two
{
  const { retire } = dedupWebuiSockets([
    { sockFile: 'cw-1', claudeSessionId: 'm', createdAt: 1, claudeAlive: false },
    { sockFile: 'cw-2', claudeSessionId: 'm', createdAt: 3, claudeAlive: false },
    { sockFile: 'cw-3', claudeSessionId: 'm', createdAt: 2, claudeAlive: false },
  ]);
  check('three husks: retire all but the newest', arr(retire).join() === 'cw-1,cw-3', JSON.stringify(arr(retire)));
}

console.log(failed ? `\n${failed} FAILED` : '\ndedup-sockets test passed');
process.exit(failed ? 1 : 0);

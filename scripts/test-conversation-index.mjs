#!/usr/bin/env node
// Conversation-location index (R3 tail): host-inference / dead-host rescue can
// locate a conversation the raw transcript cache has never seen (ownership
// recorded from discovery AND fetches). Ambiguity stays honest.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ConversationIndex } = require(REPO + '/src/conversation-index.js');
let pass=0, fail=0; const ok=(c,n)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.error('  ✗ '+n));};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ci-'));
const ix = new ConversationIndex({ dataDir: dir });
const SID = 'aaaa1111-2222-3333-4444-555566667777';

ix.noteDiscovery('host-a', [{ sessionId: SID, cwd: '/home/u/x', backend: 'claude' }]);
ok(ix.ownerHost(SID) === 'host-a', 'discovery-listed conversation resolves its host WITHOUT a cache file (the new capability)');
ok(ix.lookup(SID).hosts['host-a'].cwd === '/home/u/x', 'cwd recorded from discovery');

// a second host claiming the same conversation (copied transcript) → ambiguous
ix.note(SID, 'host-b', { src: 'fetch' });
ok(ix.ownerHost(SID) === null, 'two live claims = ambiguous → null (never guesses)');

// removed host filtered out → unique again
ok(ix.ownerHost(SID, (h) => h === 'host-a') === 'host-a', 'claims from since-removed hosts are ignored');

// decisively fresher claim wins (a re-imaged machine re-listing an old copy
// must not permanently veto the live home)
const ix2 = new ConversationIndex({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ci2-')) });
ix2.note(SID, 'stale-host', {});
ix2._state.conv[SID].hosts['stale-host'].lastSeen = Date.now() - 10 * 24 * 3600 * 1000;
ix2.note(SID, 'live-host', {});
ok(ix2.ownerHost(SID) === 'live-host', 'a week-fresher claim is decisive');

// persistence round-trip
ix._flush();
const ix3 = new ConversationIndex({ dataDir: dir });
ok(ix3.ownerHost(SID, (h) => h === 'host-a') === 'host-a', 'index survives restart');

// bound: 5000 newest kept
for (let i = 0; i < 5200; i++) ix.note(`bbbb${String(i).padStart(4,'0')}-1111-2222-3333-444444444444`, 'host-a', {});
ix._flush();
ok(Object.keys(JSON.parse(fs.readFileSync(path.join(dir,'conversation-index.json'),'utf8')).conv).length <= 5000, 'bounded at 5000 conversations');

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail?1:0);

#!/usr/bin/env node
// The 79928a2b 38MB poisoning trio (2.360.0):
// 1. POISON GUARD — a huge shredded frame must THROW in formatChatInput,
//    never be wrapped as text into the conversation.
// 2. FRAME FILE BYPASS — chat-wrapper's `_frame_file` pointer line reads the
//    payload from disk, validates it as ONE frame, forwards to the child and
//    unlinks; an invalid/shredded file is DROPPED, never wrapped.
// 3. RESCUE — transcripts.rescue stubs oversized records in place (chain,
//    order, count untouched), keeps a byte-preserved backup, atomic swap.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. poison guard ──
{
  const { ClaudeCodeAdapter } = require(REPO + '/src/adapters/claude-code.js');
  const ad = new ClaudeCodeAdapter({ buffersDir: '/tmp' });
  const good = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } });
  ok(ad.formatChatInput(good, 'm1').stdinPayload === good, 'valid frame passes through verbatim');
  const shred = '{"type":"user","message":{"role":"user","content":[{"type":"image","source":{"data":"' + 'A'.repeat(600 * 1024) + '{"type":"user","message":{}}';
  let threw = null; try { ad.formatChatInput(shred, 'm2'); } catch (e) { threw = e.message; }
  ok(/corrupted in transit/.test(threw || ''), 'shredded 600KB frame THROWS instead of poisoning', threw);
  const small = '{"broken json but small';
  ok(ad.formatChatInput(small, 'm3').stdinPayload.includes('"text"'), 'small non-JSON text still wraps normally');
}

// ── 2. wrapper frame-file bypass (real chat-wrapper against a cat child) ──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-framefile-'));
  const buf = path.join(dir, 'buf.jsonl'), meta = path.join(dir, 'meta.json');
  // fake claude: echo stdin lines to a capture file
  const cap = path.join(dir, 'child-got.txt');
  const fake = path.join(dir, 'fake-claude.sh');
  fs.writeFileSync(fake, `#!/bin/bash\nwhile IFS= read -r l; do printf '%s\\n' "$l" >> ${cap}; done\n`, { mode: 0o755 });
  const w = spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), buf, meta, fake], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
  await sleep(700);
  const frame = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'BIG:' + 'x'.repeat(200 * 1024) }] } });
  const fp = path.join(dir, 'frame.json');
  fs.writeFileSync(fp, frame);
  w.stdin.write(JSON.stringify({ type: '_frame_file', path: fp }) + '\n');
  await sleep(900);
  const got = fs.existsSync(cap) ? fs.readFileSync(cap, 'utf8').trim().split('\n') : [];
  ok(got.length === 1 && got[0] === frame, `frame-file payload reaches the child INTACT as one line (${got[0]?.length || 0} bytes)`);
  ok(!fs.existsSync(fp), 'frame file unlinked after forwarding');
  // shredded file must be dropped, never wrapped
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, frame.slice(0, 1000) + frame); // concatenated shred
  w.stdin.write(JSON.stringify({ type: '_frame_file', path: bad }) + '\n');
  await sleep(700);
  const got2 = fs.readFileSync(cap, 'utf8').trim().split('\n');
  ok(got2.length === 1, 'shredded frame file DROPPED (child got nothing new)');
  ok(!fs.existsSync(bad), 'shredded file still cleaned up');
  w.kill('SIGKILL');
}

// ── 3. rescue ──
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rescue-'));
  const proj = path.join(home, '.claude', 'projects', '-tmp-x');
  fs.mkdirSync(proj, { recursive: true });
  const cid = '11111111-2222-3333-4444-555555555555';
  const fp = path.join(proj, cid + '.jsonl');
  const rec = (u, p, extra) => JSON.stringify({ type: 'user', uuid: u, parentUuid: p, sessionId: cid, message: { role: 'user', content: [{ type: 'text', text: extra || 'ok' }] } });
  const monster = rec('u2', 'u1', 'M'.repeat(3 * 1024 * 1024));
  fs.writeFileSync(fp, [rec('u1', null), monster, rec('u3', 'u2')].join('\n') + '\n');
  const HOME0 = process.env.HOME;
  process.env.HOME = home; // findSessionJsonlPath scans $HOME/.claude/projects
  const { createTranscriptService } = require(REPO + '/src/transcript-service.js');
  const svc = createTranscriptService({ activeSessions: new Map(), createSessionMessages: () => null, hosts: null });
  const r = await svc.rescue({ sessionId: cid, cwd: '/tmp/x', backend: 'claude' });
  process.env.HOME = HOME0;
  ok(r.replaced === 1 && r.lines === 3, `rescue stubbed exactly the monster (${JSON.stringify({ replaced: r.replaced, lines: r.lines })})`);
  ok(r.sizeBefore > 3 * 1024 * 1024 && r.sizeAfter < 4096, 'file shrank to sane size');
  ok(fs.existsSync(r.backup) && fs.statSync(r.backup).size === r.sizeBefore, 'byte-preserved backup exists');
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(lines.length === 3 && lines[1].uuid === 'u2' && lines[1].parentUuid === 'u1', 'chain + order + count untouched');
  ok(/rescued/.test(lines[1].message.content[0].text), 'stub carries the rescue note');
  ok(lines[2].parentUuid === 'u2', 'child still parents onto the stubbed uuid');
  // idempotent second pass
  process.env.HOME = home;
  const r2 = await svc.rescue({ sessionId: cid, cwd: '/tmp/x', backend: 'claude' });
  process.env.HOME = HOME0;
  ok(r2.replaced === 0 && r2.backup === null, 'second pass finds nothing (no backup litter)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

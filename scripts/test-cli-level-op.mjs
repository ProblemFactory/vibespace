#!/usr/bin/env node
// test-cli-level-op.mjs — row B-24e2 ON A REAL DEVICE AGENT (the device-op rule: a real-daemon test, test-sysinfo-op the template;
// 主开发 2026-11-20 12:22Z). The daemon built from this tree (data/bin/vibespace-agentd.js) answers `probe-cli` — the op it already
// has — and, asked with `level: true`, reads its OWN Claude Code for the background signal: a PLANTED binary of a real build's size
// (a shell stand-in whose first lines answer --version and stop; the rest is filler, the declaration near its end — the worst case,
// every byte read). No real vendor file is read. Legs:
//   ① asked WITHOUT the flag the answer carries no level (what an asker that does not ask gets — the old shape, unchanged)
//   ② asked WITH it the first answer is «reading», at once (never waited for: well inside the op's 9 s bound)
//   ③ the machine's own memory answers «read»: declared, the build named, every byte read — waited for WHAT HAPPENED (the answer
//      turning «read», bounded, a red by name at the bound); PRINTED: the file's size, the whole scan's time, the longest single step
//      on the daemon's loop (under 50 ms — the agent serves a person's conversations there)
// Run: node scripts/test-cli-level-op.mjs   (heavy: a real daemon and a ~342 MiB planted file; int361 runs it on the box)
import { endDaemonsAndWait } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lvop-'));
process.env.HOME = home;
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lvop-data-'));
// THE PLANTED BUILD: `claude` on the daemon's PATH — a shell stand-in (its --version answered by its first lines; `exit` stops the
// shell before the filler), then the build's identity and, near the end, the record union's declaration
const bin = path.join(home, 'bin'); fs.mkdirSync(bin, { recursive: true });
const CLAUDE = path.join(bin, 'claude');
const SIZE = 342 << 20;   // a real build's size (2.1.322: 342 MB)
{
  const fd = fs.openSync(CLAUDE, 'w', 0o755);
  fs.writeSync(fd, '#!/bin/sh\necho "2.1.399 (Claude Code)"\nexit 0\n');
  const block = Buffer.alloc(8 << 20); for (let i = 0; i < block.length; i++) block[i] = 97 + (i * 7919 % 26);
  let w = 64; while (w < SIZE - (9 << 20)) { fs.writeSync(fd, block); w += block.length; }
  fs.writeSync(fd, ';u({type:T("system"),subtype:T("background_tasks_changed"),tasks:C(u({task_id:o()');
  fs.writeSync(fd, block.subarray(0, 1 << 20));
  fs.writeSync(fd, ',VERSION:"2.1.399",PACKAGE_URL:"x",BUILD_TIME:"2026-11-19T10:00:00Z",');   // the identity AFTER the declaration (round wwf11hqbh): read on
  fs.writeSync(fd, block.subarray(0, 4096));
  fs.closeSync(fd);
}
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH || ''}`;
process.env.CLAUDE_CMD = CLAUDE;   // under VS_NO_REAL_CLI=1 only THE named stand-in may answer --version (reading a file starts nothing)

const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
let daemonEnded = false;
process.on('exit', () => { if (!daemonEnded) try { daemonEnded = true; endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); } catch { } try { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(dataDir, { recursive: true, force: true }); } catch { } });
const conn = await dm.connect();
ok(!!conn && !!conn.info && Array.isArray(conn.info.capabilities) && conn.info.capabilities.includes('cli-level'), 'the agent advertises «cli-level» in its hello (a hub asks only an agent that has it)', conn && conn.info && conn.info.capabilities);

const plain = await dm.probeCli();
ok(!!plain.facts && !!plain.facts.claude && plain.facts.claude.level === undefined, '① probe-cli WITHOUT the flag answers no level — the shape every asker had (an older agent answers so even when asked)', plain.facts && plain.facts.claude);
const t0 = Date.now();
const first = await dm.probeCli(null, { level: true, version: '2.1.399' });
const firstMs = Date.now() - t0;
const lv0 = first.facts && first.facts.claude && first.facts.claude.level;
ok(!!lv0 && lv0.state === 'reading' && firstMs < 9000, `② WITH the flag the first answer is «reading», at once (${firstMs} ms — the op's bound is 9 s: the ask never waits for the scan)`, lv0);
// ③ WAIT FOR WHAT HAPPENED: the machine's answer turning «read» — bounded (the scan's own bound is 60 s), a red by name at the bound
let lv = lv0, asks = 1;
const until = Date.now() + 90e3;
while (lv && lv.state === 'reading' && Date.now() < until) { await new Promise((r) => setTimeout(r, 500)); lv = ((await dm.probeCli(null, { level: true, version: '2.1.399' })).facts.claude || {}).level; asks++; }
console.log(`    THE WHOLE SCAN on this machine: ${(Number(lv && lv.size) / 1048576).toFixed(1)} MiB in ${lv && lv.ms} ms; the longest single step on the daemon's loop ${lv && Number(lv.maxStepMs).toFixed(2)} ms; answered after ${asks} asks`);
ok(!!lv && lv.state === 'read', `③ the machine's own memory answers «read» inside the bound (${lv && lv.state})`, lv);
ok(!!lv && lv.declared === true && lv.whole === true && lv.version === '2.1.399' && lv.size >= SIZE - (9 << 20), '…declared, every byte read, the build named by its own identity (found AFTER the declaration) — the planted file of a real build\'s size', lv);
const other = (await dm.probeCli(null, { level: true, version: '2.1.398' })).facts.claude.level;
ok(!!other && other.state === 'gone' && other.read === '2.1.399', '…asked for ANOTHER build (a conversation on an older one, gone from this machine): «gone», naming what its program reads — never its verdict', other);
ok(!!lv && Number.isFinite(lv.maxStepMs) && lv.maxStepMs < 50, `…THE DAEMON'S LOOP WAS NEVER HELD: its longest single step ${lv && lv.maxStepMs} ms < 50 ms (printed above)`, lv);
const again = (await dm.probeCli(null, { level: true, version: '2.1.399' })).facts.claude.level;
ok(again && again.state === 'read' && again.declared === true, '…asked again: answered from its memory (no second scan)', again);

// B-95fc U1 — THE MACHINE ANSWERS FOR ITS OWN INBOX (peer-state), on the same real agent: a registry record whose pid lives (this
// suite's own) and whose socket is not served yet is a CLI still starting — live, no inbox; a conversation with no record is not running
{
  ok(Array.isArray(conn.info.capabilities) && conn.info.capabilities.includes('peer-state'), 'B-95fc U1: the agent advertises «peer-state» in its hello (a hub asks only an agent that has it)', conn.info.capabilities);
  const reg = path.join(home, '.claude', 'sessions'); fs.mkdirSync(reg, { recursive: true });
  const stat = fs.readFileSync('/proc/self/stat', 'utf8'), procStart = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const START = 'dddddddd-0000-4000-8000-000000000001', NONE = 'dddddddd-0000-4000-8000-000000000002';
  fs.writeFileSync(path.join(reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: START, messagingSocketPath: path.join(home, 'not-served.sock'), procStart, startedAt: Date.now() }));
  const s1 = await dm.peerState(START), s2 = await dm.peerState(NONE);
  ok(!!s1 && s1.live === true && s1.inbox === false, '…a CLI still starting there (its record, its pid alive, its socket not served): live, no inbox', s1);
  ok(!!s2 && s2.live === false && s2.inbox === false, '…a conversation with no record there: not running (the hub may owe it a wake)', s2);
}

try { daemonEnded = true; endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); } catch { }
report();

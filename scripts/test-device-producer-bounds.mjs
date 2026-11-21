#!/usr/bin/env node
// test-device-producer-bounds — lane lg-remote-hardening (row B-5278 unit 2; the coordinator's r442): each device reply with
// no bound of its own is bounded at its producer, and what it left out is said. FAST: fixtures in a temp home, the agent's
// own child processes (node children) where the producer is one; every find of the inventory is shown FIRST on a fixture
// with the release's code (a copy), then cured.
//   ① FIND 1 (it leads the unit — a person's newest conversations missing): device discovery took the first 500 project
//     folders in readdir order BEFORE its time sort. The release's walk (a copy) misses the newest conversation of a
//     machine with 520 folders; the tree's lists it first. The bound (a copy with it lowered to 10): the most recently
//     changed folders are read and the number left out is said; the hub says it once.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-producer-bounds-'));
const AGENT = path.join(REPO, 'src/agentd/agentd.js');
const AGSRC = read('src/agentd/agentd.js');
const M = mutantCopies('device-producer-bounds', REPO);
const TS = '2026-11-20T10:00:00.000Z';
const OLD = 1000000000, NEW = 1700000000;   // seconds: a 2001 transcript, a 2023 one
const rec = (rid) => JSON.stringify({ type: 'assistant', requestId: rid, timestamp: TS, cwd: '/w', message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n';
const sidOf = (n) => `b1b1b1b1-c2c2-d3d3-e4e4-${String(n).padStart(12, '0')}`;
const homeOf = (tag) => { const h = path.join(tmp, tag); fs.mkdirSync(path.join(h, '.claude', 'projects'), { recursive: true }); fs.mkdirSync(path.join(h, '.codex', 'sessions'), { recursive: true }); return h; };
const snapshotOf = (file, h) => {
  const r = spawnSync(process.execPath, [file, '--discovery-snapshot-child'], { encoding: 'utf8', env: { ...process.env, HOME: h, CODEX_HOME: path.join(h, '.codex') }, timeout: 30000, maxBuffer: 64 << 20 });
  let snap = null; try { snap = JSON.parse(r.stdout); } catch { }
  return { code: r.status, snap, err: String(r.stderr || '').slice(0, 300) };
};

console.log('① find 1: every project folder is listed BEFORE the time sort; past its bound the most recently changed are read, the rest said');
{
  const h = homeOf('f1'), P = path.join(h, '.claude', 'projects');
  for (let i = 0; i < 520; i++) { const d = path.join(P, `-home-u-p${String(i).padStart(3, '0')}`); fs.mkdirSync(d); const f = path.join(d, sidOf(i) + '.jsonl'); fs.writeFileSync(f, rec('req_' + i)); fs.utimesSync(f, OLD + i, OLD + i); }
  const order = fs.readdirSync(P);   // the folder order the walk itself sees
  const late = order[510], newest = path.join(P, late, sidOf(9999) + '.jsonl');
  fs.writeFileSync(newest, rec('req_newest')); fs.utimesSync(newest, NEW, NEW);
  // THE FAULT FIRST: the release's walk (a copy: the first 500 folders in readdir order)
  const rel = M.write('src/agentd/agentd.js', anchored(AGSRC, '    for (const d of dirs) {', '    for (const d of dirs.slice(0, 500)) {', 'release-first-500'), 'release-first-500');
  const before = snapshotOf(rel, h);
  const seenBefore = before.snap && before.snap.jsonls.some((j) => j.projDir === late);
  ok(before.code === 0 && before.snap && before.snap.jsonls.length === 200 && !seenBefore, `THE FAULT, on the release's walk (a copy): a machine with 520 project folders, its NEWEST conversation in the folder the directory lists 511th — not in its list (${before.snap ? before.snap.jsonls.length : '?'} rows, the newest ${seenBefore ? 'there' : 'MISSING'})`, { code: before.code, err: before.err });
  const after = snapshotOf(AGENT, h);
  ok(after.code === 0 && after.snap && after.snap.jsonls.length === 200 && after.snap.jsonls[0].projDir === late && after.snap.jsonls[0].file === sidOf(9999) + '.jsonl' && !after.snap.left,
    `the tree's walk: every folder listed before the time sort — the newest conversation leads its list (${after.snap && after.snap.jsonls[0] ? after.snap.jsonls[0].projDir : '?'}); nothing left out under the bound`, { code: after.code, err: after.err });
  // THE BOUND (a copy with it lowered to 10): the most recently changed folders read, the number left out said
  const hb = homeOf('f1-bound'), PB = path.join(hb, '.claude', 'projects');
  for (let i = 0; i < 20; i++) { const d = path.join(PB, `-home-u-b${String(i).padStart(2, '0')}`); fs.mkdirSync(d); const f = path.join(d, sidOf(i) + '.jsonl'); fs.writeFileSync(f, rec('req_b' + i)); fs.utimesSync(f, OLD + i, OLD + i); fs.utimesSync(d, OLD + i, OLD + i); }
  const low = M.write('src/agentd/agentd.js', anchored(AGSRC, 'const DISCOVERY_FOLDERS_MAX = 5000;', 'const DISCOVERY_FOLDERS_MAX = 10;', 'folders-max-10'), 'folders-max-10');
  const b = snapshotOf(low, hb);
  const dirsRead = b.snap ? [...new Set(b.snap.jsonls.map((j) => j.projDir))].sort() : [];
  ok(b.code === 0 && b.snap && b.snap.left && b.snap.left.folders === 10 && dirsRead.length === 10 && dirsRead[0] === '-home-u-b10' && dirsRead[9] === '-home-u-b19',
    `past its bound (10, in a copy): the 10 most recently changed folders read (${dirsRead[0]}…${dirsRead[9]}), the 10 left out said (left.folders ${b.snap && b.snap.left ? b.snap.left.folders : '?'})`, { code: b.code, err: b.err });
  ok(/const DISCOVERY_FOLDERS_MAX = 5000;/.test(AGSRC) && AGSRC.includes("codexRollouts: snap.codexRollouts, ...(snap.left ? { left: snap.left } : {}), codexOpen: snap.codexOpen || [], realCwds: snap.realCwds || [] });"), 'the bound is 5000 folders, and the agent\'s answer carries what it left out to the hub');
  const { DeviceManager } = require('../src/agentd/client.js');
  const D = new DeviceManager({ dataDir: path.join(tmp, 'dm'), bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', machine: 'box-1', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  const logs = []; D._log = (l) => logs.push(String(l));
  D._request = async () => ({ locks: [], jsonls: [], left: { folders: 7 } });
  await D.discoverySnapshot(); await D.discoverySnapshot();
  const said = logs.filter((l) => /project folders left out/.test(l));
  ok(said.length === 1 && /7 of its project folders/.test(said[0]), `the hub says what the list left out ONCE («${said[0] || 'nothing'}»)`, logs);
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(tmp, { recursive: true, force: true });
report();

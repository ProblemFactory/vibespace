#!/usr/bin/env node
// THE RESTORE'S REGISTRATION IN BATCHES (B-cd4b unit 3, lane bl-loop-a, 2026-11-21; 主开发 r688 / r844). A hub restart registers
// every survivor in the live set (src/server/boot-restore.js restoreSessions: its meta, its sidecar, its ring read, its session
// built) — ~1.3 ms a survivor on the first test machine, 105 ms at 80, the 250 ms boot law alone near 190. A restore of up to
// REGISTER_BATCH (32) registers in its one turn, as it always did; a bigger one registers 32 a turn, each batch AHEAD of every other
// queued turn (src/server/loop-turns.js `first`), so the listen step's rest (asked by server.js right after restoreSessions returns)
// runs only once the live set is whole — and the front holds every new connection until that turn has run (test-tls-demux §6).
// In-process over a scratch data dir (the same stand-in sockets as test-boot-probes ⑤: adopted alive, never probed). The split of
// test-boot-probes (r844 item 3: it stands 0.9 s under the fast tier's bound): the unit's legs live here.
//   ① 80 survivors: 32 in the live set when restoreSessions returns; a step asked right after it (the listen step's rest) finds
//     all 80; the registration in 3 turns, said in the restore's own line; the first attach after the step.
//     RED: the batches asked at the BACK of the queue ⇒ the step runs before the last batch (survivors missing from the live set);
//     RED: the bound taken away (one batch of all) ⇒ all 80 in the restore's one turn.
//   ② 20 survivors: all registered when restoreSessions returns (a small restore is what it always was).
//   ③ loop-turns `first`: a job asked first from inside a running job runs before the jobs already queued; RED: `first` ignored.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const ROOT = scratch('boot-restore-batches');
const M = mutantCopies('boot-restore-batches', REPO);
const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
const LT = require(path.join(REPO, 'src/server/loop-turns.js'));
const brSrc = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
const ltSrc = fs.readFileSync(path.join(REPO, 'src/server/loop-turns.js'), 'utf8');
const logged = async (fn) => { const lines = [], log = console.log, warn = console.warn; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { return { r: await fn(), lines }; } finally { console.log = log; console.warn = warn; } };

// ── a scratch data dir: sockets, metas (session-stdout's file shape), buffers + sidecars (as test-boot-probes) ──
const dataDir = (tag) => { const d = path.join(ROOT, tag); for (const x of ['sockets', 'meta', 'buffers']) fs.mkdirSync(path.join(d, x), { recursive: true }); return d; };
function instance(BRm, d, { onAttach = null } = {}) {
  const SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
  const metaFile = (x) => path.join(META, x + '.json');
  const activeSessions = new Map(), attached = [];
  const api = BRm.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions, sessionCounterRef: { value: 0 }, attachToDtach: (id, sp, s, o) => { if (onAttach) onAttach(id, s, o); attached.push(id); s.pty = null; }, setupSessionPty: () => { },
    readSessionMeta: (x) => { try { return JSON.parse(fs.readFileSync(metaFile(x), 'utf8')); } catch { return {}; } },
    writeSessionMeta: (x, m) => fs.writeFileSync(metaFile(x), JSON.stringify(m)), deleteSessionMeta: (x) => { try { fs.unlinkSync(metaFile(x)); } catch { } },
    broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { },
    getHosts: () => null, getDialBridge: () => null, getExitProxy: () => ({ onSessionEnd: () => { } }), note: () => { } });
  const add = (n) => {
    const sock = `cw-${n}-${1760480000000 + n * 1000}`, id = 'sess-' + sock.slice(3);
    fs.writeFileSync(path.join(SOCK, sock), '');
    fs.writeFileSync(metaFile(sock), JSON.stringify({ webuiSessionId: id, name: `shell ${n}`, cwd: '/srv/work/app', backend: 'shell', mode: 'terminal', createdAt: 1760480000000 + n * 1000 }));
    fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify({ mode: 'terminal' })); fs.writeFileSync(path.join(BUF, id + '.buf'), '$ ');
    return { sock, id };
  };
  return { api, activeSessions, attached, add };
}
const RESTORED = (n) => new RegExp(`^\\[boot-restore\\] ${n} survivor\\(s\\): registered in \\d+ ms; attached in \\d+ batch\\(es\\) of ≤ \\S+ \\(\\d+ ms, the longest batch \\d+ ms\\)(.*)$`);

try {
  console.log('① 80 survivors: registered 32 a turn, ahead of the listen step\'s rest; the step finds the live set whole');
  const run = async (BRm, tag, N = 80) => {
    const order = [];
    const X = instance(BRm, dataDir(tag), { onAttach: (id) => order.push('attach') });
    for (let i = 0; i < N; i++) X.add(500 + i);
    let atStep = null;
    const t = await logged(async () => { X.api.restoreSessions(); return X.activeSessions.size; });
    LT.turn(() => { atStep = X.activeSessions.size; order.push('step'); });   // the listen step's rest, as server.js asks it (hub.turn)
    const lines = [];
    const log0 = console.log, warn0 = console.warn; console.log = console.warn = (...a) => lines.push(a.join(' '));
    try { const tEnd = Date.now() + 8000; while (!(atStep !== null && lines.concat(t.lines).some((l) => RESTORED(N).test(l))) && Date.now() < tEnd) await new Promise((r) => setTimeout(r, 5)); }
    finally { console.log = log0; console.warn = warn0; }
    const said = lines.concat(t.lines).map((l) => RESTORED(N).exec(l)).find(Boolean);
    return { atReturn: t.r, atStep, live: X.activeSessions.size, said: said ? said[0] : null, turnsSaid: said ? said[1] : null, firstAttachAfterStep: order.indexOf('step') >= 0 && order.indexOf('attach') > order.indexOf('step'), attached: X.attached.length };
  };
  const g = await run(BR, 'g80');
  ok(g.atReturn === 32 && g.atStep === 80 && g.live === 80 && /; registered in 3 turns of ≤ 32 \(the longest \d+ ms\)$/.test(g.turnsSaid || '') && g.firstAttachAfterStep && g.attached === 80,
    `80 survivors: ${g.atReturn} in the live set when restoreSessions returns, ${g.atStep} when the step asked after it runs; «${g.said}»; the first attach after the step, all ${g.attached} attached`, g);
  const back = anchored(brSrc, 'if (done) finish(); else loopTurn(oneBatch, { first: true });', 'if (done) finish(); else loopTurn(oneBatch);', 'b-cd4b-reg-back');
  const r1 = await run(require(M.write('src/server/boot-restore.js', back, 'cd4b-reg-back')), 'r80back');
  ok(r1.atStep !== null && r1.atStep < 80, `RED: the batches asked at the back of the queue ⇒ the step runs with ${r1.atStep} of 80 in the live set`, r1);
  const all = anchored(brSrc, 'const REGISTER_BATCH = 32;', 'const REGISTER_BATCH = Infinity;', 'b-cd4b-reg-one-pass');
  const r2 = await run(require(M.write('src/server/boot-restore.js', all, 'cd4b-reg-one-pass')), 'r80all');
  ok(r2.atReturn === 80, `RED: the bound taken away ⇒ all ${r2.atReturn} registered in the restore's one turn`, r2);

  console.log('② 20 survivors: all registered when restoreSessions returns (a small restore is what it always was)');
  const s20 = await run(BR, 'g20', 20);
  ok(s20.atReturn === 20 && s20.live === 20 && s20.turnsSaid === '', `20 survivors: ${s20.atReturn} at the return, the line says no turns («${s20.said}»)`, s20);

  console.log('③ loop-turns `first`: a job asked first from inside a running job runs ahead of the jobs already queued');
  const seq = (T) => new Promise((resolve) => { const seen = []; const push = (x) => { seen.push(x); if (seen.length === 3) resolve(seen.join()); }; T.turn(() => { push('A'); T.turn(() => push('C'), { first: true }); }); T.turn(() => push('B')); });
  const q1 = await seq(LT);
  const q1r = await seq(require(M.write('src/server/loop-turns.js', anchored(ltSrc, '  if (first) queue.unshift(fn); else queue.push(fn);', '  queue.push(fn);', 'b-cd4b-turn-first-ignored'), 'cd4b-turn-first-ignored')));
  ok(q1 === 'A,C,B' && q1r === 'A,B,C', `asked first from inside A, C runs before B, queued earlier (${q1}); RED \`first\` ignored ⇒ ${q1r}`, { q1, q1r });
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

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
//   ⑦ THE ONE-PASS BACKFILL (r1487, box row 54): five chat survivors' billing sources written back although a feed armed inside the
//     attach loop (the wrapper's hold's gate: its 3 s bound) cut every buffer before the backfill ran; RED: the backfill reading the
//     buffer then ⇒ none written.
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
  const back = anchored(brSrc, "loopTurn(() => step('restore-batch', oneBatch), { first: true });", "loopTurn(() => step('restore-batch', oneBatch));", 'b-cd4b-reg-back');
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

  console.log('④ an EXACT multiple of 32 (its follow, r1050): 64 survivors — all registered before the step, all attached, the line said');
  const m64 = await run(BR, 'g64', 64);
  ok(m64.atReturn === 32 && m64.atStep === 64 && m64.live === 64 && m64.attached === 64 && /; registered in \d+ turns of ≤ 32 \(the longest \d+ ms\)$/.test(m64.turnsSaid || ''),
    `64 survivors: ${m64.atReturn} at the return, ${m64.atStep} when the step runs, all ${m64.attached} attached — «${m64.said}» (the last turn finds the end: near empty)`, m64);

  console.log('⑤ THE TODO PILL (its follow, r1050): a survivor whose sidecar holds no todos shows none — never the previous survivor\'s');
  {
    // 20 survivors (one turn), half with todos in their sidecar: every one WITHOUT shows none, whatever the folder's order. RED: the
    // function-wide `var` back ⇒ a survivor without todos carries the one read before it (20 interleaved: certain but 1 in 184 756)
    const todosRun = async (BRm, tag) => {
      const X = instance(BRm, dataDir(tag)); const ids = [];
      for (let i = 0; i < 20; i++) { const a = X.add(700 + i); ids.push(a.id); if (i % 2 === 0) fs.writeFileSync(path.join(ROOT, tag, 'buffers', a.id + '.json'), JSON.stringify({ mode: 'terminal', todos: [{ status: 'completed', content: 'one' }, { status: 'in_progress', content: `step ${i}` }] })); }
      await logged(async () => X.api.restoreSessions());
      return ids.map((id, i) => ({ i, todos: (X.activeSessions.get(id) || {})._todos || null }));
    };
    const g5 = await todosRun(BR, 'todo-g');
    const carry = anchored(anchored(brSrc, "    let wrapperTodos = null;   // unit 3's follow (r1050): block-scoped — a sidecar with no todos shows none, never the PREVIOUS survivor's (a `var` carried it)\n", '', 'b-cd4b-todos-let'), '        wrapperTodos = { done, total: wrapperMeta.todos.length,', '        var wrapperTodos = { done, total: wrapperMeta.todos.length,', 'b-cd4b-todos-var');   // stale-pins: kept (the red plants the old shape)
    const fixedRead = anchored(carry, '      _todos: wrapperTodos || null,', "      _todos: (typeof wrapperTodos !== 'undefined' && wrapperTodos) || null,", 'b-cd4b-todos-read');   // stale-pins: kept (the red plants the old shape)
    const r5 = await todosRun(require(M.write('src/server/boot-restore.js', fixedRead, 'cd4b-todos-var')), 'todo-r');
    ok(g5.every((x) => (x.i % 2 === 0) === !!x.todos) && g5.filter((x) => x.todos).every((x) => x.todos.current === `step ${x.i}`), 'every survivor shows its OWN todos — none where its sidecar holds none', g5);
    ok(r5.some((x) => x.i % 2 === 1 && !!x.todos), `RED: the function-wide \`var\` back ⇒ a survivor without todos shows another's (${r5.filter((x) => x.i % 2 === 1 && x.todos).length} of 10)`, r5);
  }

  console.log('⑥ A RETIRE IS COUNTED (its follow, r1050): 40 dead sockets (a machine restart) — 32 retired in the restore\'s turn, the rest after');
  {
    // every socket dead: a fake fuser and pgrep that find no process (exit 1), the probes answer dead; each retire unlinks its socket
    // (a sync meta write and a rename for a remote one) — real work, counted in its batch. RED: a retire not counted ⇒ all 40 in one turn
    const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
    for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(BIN, b), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const PATH0 = process.env.PATH; process.env.PATH = BIN + ':' + PATH0;
    try {
      const deadRun = async (BRm, tag) => {
        const X = instance(BRm, dataDir(tag)); for (let i = 0; i < 40; i++) X.add(800 + i);
        const SOCK = path.join(ROOT, tag, 'sockets'), left = () => fs.readdirSync(SOCK).filter((f) => f.startsWith('cw-')).length;
        const t = await logged(async () => { await X.api.probeSockets(); X.api.restoreSessions(); return left(); });
        await logged(async () => { const tEnd = Date.now() + 5000; while (left() > 0 && Date.now() < tEnd) await new Promise((r) => setTimeout(r, 5)); });   // the later batches' retire lines («✗ Dead socket») kept out of the suite's own output
        return { atReturn: t.r, after: left(), live: X.activeSessions.size };
      };
      const g6 = await deadRun(BR, 'dead-g');
      const uncounted = anchored(brSrc, '    if (!socketAlive) { retireDeadSocket(sockFile, socketPath); yield; continue; }', '    if (!socketAlive) { retireDeadSocket(sockFile, socketPath); continue; }', 'b-cd4b-retire-uncounted');   // stale-pins: kept (the red plants the old shape)
      const r6 = await deadRun(require(M.write('src/server/boot-restore.js', uncounted, 'cd4b-retire-uncounted')), 'dead-r');
      ok(g6.atReturn === 8 && g6.after === 0 && g6.live === 0, `40 dead sockets: ${40 - g6.atReturn} retired in the restore's turn (${g6.atReturn} left at its return), all after its turns`, g6);
      ok(r6.atReturn === 0, `RED: a retire not counted ⇒ all 40 retired in the restore's one turn (${r6.atReturn} left)`, r6);
    } finally { process.env.PATH = PATH0; }
  }
  console.log('⑦ THE ONE-PASS BACKFILL (r1487, box row 54): a small restore\'s billing sources are written back whatever is fed after the attach');
  {
    // FIVE chat survivors (one turn, one attach batch: the one-pass road), each ring ending in turns whose init says its billing source.
    // Each fake attach arms, as the wrapper's hold's gate does, a 3 s timer that feeds 800 KB of records with NO billing source into the
    // session's buffer and cuts it as the claude consumer does (750 K → 500 K) — armed inside the attach loop, BEFORE finish() arms the
    // backfill's, so it fires first. RED: the backfill reading the buffer then (the shape before) ⇒ no source written
    const FEED = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"' + 'x'.repeat(2000) + '"}]}}\n';
    const chatRun = async (BRm, tag) => {
      const feeds = [];
      const X = instance(BRm, dataDir(tag), { onAttach: (id, s) => { const t = setTimeout(() => { let b = s.buffer; while (b.length < 800000 + s.buffer.length) b += FEED; s.buffer = b.length > 750000 ? b.slice(-500000) : b; feeds.push(id); }, 3000); feeds.timers = (feeds.timers || []).concat(t); } });
      const d = path.join(ROOT, tag), ids = [];
      for (let i = 0; i < 5; i++) {
        const sock = `cw-${900 + i}-${1760490000000 + i * 1000}`, id = 'sess-' + sock.slice(3), cid = `7a11ce00-0000-4000-8000-${String(900 + i).padStart(12, '0')}`;
        fs.writeFileSync(path.join(d, 'sockets', sock), '');
        fs.writeFileSync(path.join(d, 'meta', sock + '.json'), JSON.stringify({ webuiSessionId: id, name: `chat ${i}`, cwd: '/srv/work/app', backend: 'claude', mode: 'chat', claudeSessionId: cid, createdAt: 1760490000000 + i * 1000 }));
        fs.writeFileSync(path.join(d, 'buffers', id + '.json'), JSON.stringify({ mode: 'chat' }));
        let ring = ''; while (ring.length < 300000) ring += '{"type":"system","subtype":"init","session_id":"' + cid + '","apiKeySource":"none"}\n' + FEED.repeat(20);
        fs.writeFileSync(path.join(d, 'buffers', id + '.buf'), ring);
        ids.push({ id, sock });
      }
      const t0 = Date.now();
      X.api.restoreSessions();
      const billed = () => ids.filter((x) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'meta', x.sock + '.json'), 'utf8')).apiKeySource === 'none'; } catch { return false; } }).length;
      // until every buffer was fed AND either every source is written or the backfill's own 3 s turn has passed (+ 400 ms): a RED
      // writes nothing, so its end is that turn — bounded at 6 s
      { const tEnd = t0 + 6000; while ((feeds.length < ids.length || (billed() < ids.length && Date.now() - t0 < 3400)) && Date.now() < tEnd) await new Promise((r) => setTimeout(r, 20)); }
      for (const t of feeds.timers || []) clearTimeout(t);
      return { live: X.activeSessions.size, attached: X.attached.length, fed: feeds.length, billed: billed(), of: ids.length };
    };
    const before = anchored(brSrc, "      const src = billingRead.has(s) ? billingRead.get(s) : lastApiKeySource(typeof s.buffer === 'string' ? s.buffer : '');", "      const src = lastApiKeySource(typeof s.buffer === 'string' ? s.buffer : '');", 'r1487-backfill-reads-buffer');   // stale-pins: kept (the red plants the old shape)
    const BRr = require(M.write('src/server/boot-restore.js', before, 'r1487-backfill-reads-buffer'));
    const { r: [g7, r7] } = await logged(() => Promise.all([chatRun(BR, 'bill-g'), chatRun(BRr, 'bill-r')]));   // the base and its RED at once (each waits the backfill's 3 s turn), ONE capture of the restores' lines
    ok(g7.live === 5 && g7.attached === 5 && g7.fed === 5 && g7.billed === 5, `5 chat survivors (the one-pass road): every billing source written back (${g7.billed} of ${g7.of}) although every buffer was fed 800 KB and cut before the backfill (${g7.fed} fed)`, g7);
    ok(r7.fed === 5 && r7.billed === 0, `RED: the backfill reading the buffer after the attach (the shape before) ⇒ ${r7.billed} of ${r7.of} written (the feed came first: ${r7.fed})`, r7);
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

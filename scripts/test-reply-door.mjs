#!/usr/bin/env node
// test-reply-door (fast, in-process — lane reply-door-follows-enter, 2026-11-13; the owner, from a screenshot of a running
// conversation: «这条消息状态异常了，这个似乎是已经处理过的消息却还浮动在下面» — a For-you reply to that conversation's own
// question sat «queued — runs after this turn» while a message typed in the composer AFTER it was already «Steered» into the
// turn). THE LAW: a PERSON's words reach a running turn the same way whatever door they came through.
//   §1 PURE — ONE decision (src/backend-caps.js sendDoors / doorCapsOf): the page's composer (agent-meta composerSendModes)
//      asks it; a harness row with the steer door steers on Enter where the running wrapper backs it; an older wrapper, a
//      row with no steer door (codex), a wrapper with no queue at all ⇒ no steer
//   §2 THE OWNER'S SCENE through the REAL typing path (src/server/user-input.js) and the REAL For-you reply route: a reply
//      sent mid-turn, then a composer message with Enter ⇒ both handed to the running turn, the reply FIRST; a message the
//      person HELD (the hold door) stays held and a later Enter passes it (the person's choice); a harness row with no steer
//      door keeps today's behaviour (the reply is held — the bubble says «queued»)
//   §3 THE CENSUS: every caller of the typing path names its door (`door:` or the composer's `steer:`); the machine's caller
//      (the dispatch's compact) says `origin: 'dispatch'` — a planted caller with neither is RED
//   §4 RED CONTROLS: the release fd4acdc61 (a COUNTED skip without it) and this tree with the reply route's door removed
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'fd4acdc61';   // 2.369.397 — the reply road held mid-turn
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-reply-door-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let passed = 0, failed = 0;
const ok = (c, msg) => { if (c) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } return !!c; };
const say = (s) => console.log(s);
const reqOf = (T) => createRequire(path.join(T, 'package.json'));
const quiet = (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return fn(); } finally { console.log = o; console.warn = w; } };

// ── §2's world: the REAL sender + the REAL reply route over a fake live chat session and its wrapper's sidecar
function world(T, { backend = 'claude', queueVerbs = ['remove', 'steer', 'steer-all', 'reorder', 'edit'], inputQueue = true } = {}) {
  const r = reqOf(T);
  const { createUserInputSender } = r('./src/server/user-input.js');
  const { registerUserTodoReplyRoutes } = r('./src/routes/user-todos-reply.js');
  const adapterRegistry = r('./src/adapters/index.js').createAdapterRegistry({});   // the REAL adapters (the claude adapter's formatChatInput marks a steer)
  const BUFFERS_DIR = fs.mkdtempSync(path.join(ROOT, 'buf-'));
  const sid = 's1', written = [];
  fs.writeFileSync(path.join(BUFFERS_DIR, sid + '.json'), JSON.stringify({ caps: { inputQueue, queueVerbs } }));
  const session = { backend, mode: 'chat', pty: { write: (s) => written.push(String(s)) }, socketPath: null, _isStreaming: true, _turnState: 'running', _webuiId: sid, name: 'conv' };
  const activeSessions = new Map([[sid, session]]);
  const sender = createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR, broadcastToSession() { }, feedLive() { }, autoResume: null, reattachLocalPty() { }, ptyQuietSince: () => 0, log: () => { } });
  const routes = {};
  const app = { post: (p, h) => { routes['POST ' + p] = h; }, get: (p, h) => { routes['GET ' + p] = h; }, put() { }, delete() { } };
  const item = { id: 'td-1', text: 'Which option should I take?', sessionKey: 'webui:' + sid, createdAt: Date.now() - 60e3 };
  const userTodos = { get: (id) => (id === item.id ? item : null), resolveByReply: () => ({ ...item, resolved: true }) };
  registerUserTodoReplyRoutes(app, { userTodos, activeSessions, sendUserInput: sender.send, sessionStatusKey: (s, id) => 'webui:' + id, now: () => Date.now() });
  const reply = (text) => new Promise((res) => { const out = { code: 200 }; routes['POST /api/user-todos/:id/reply']({ headers: {}, params: { id: item.id }, body: { text } }, { status(c) { out.code = c; return this; }, json(b) { out.body = b; res(out); return this; } }); });
  // a frame's marks: the claude adapter's JSON line (webui_steer = handed to the running turn; absent = the wrapper holds it)
  const frames = () => written.map((w) => { let j = null; try { j = JSON.parse(w.trim().split('\n').pop()); } catch { } return j; }).filter(Boolean);
  const steeredOf = (f) => !!(f && (f.webui_steer === true || (f.message && f.message.webui_steer === true)));
  const textOf = (f) => { const c = f && f.message && f.message.content; return typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text || '').join('') : ''; };
  return { sender, reply, frames, steeredOf, textOf, sid, session, written };
}

async function scene(T) {
  // the owner's scene: a For-you reply mid-turn, then a composer message with Enter (the page's steer: true)
  const w = world(T);
  const r1 = await quiet(() => w.reply('Take the second one.'));
  const r2 = quiet(() => w.sender.send(w.sid, 'Also keep the tests.', { msgId: 'm-typed', origin: 'ws', steer: true }));
  const f = w.frames();
  const replyFrame = f.find((x) => /Take the second one/.test(w.textOf(x))), typedFrame = f.find((x) => /Also keep the tests/.test(w.textOf(x)));
  const order = f.indexOf(replyFrame) >= 0 && f.indexOf(replyFrame) < f.indexOf(typedFrame);
  return { ok: !!(r1.body && r1.body.ok && r2 && r2.ok && replyFrame && typedFrame && w.steeredOf(replyFrame) && w.steeredOf(typedFrame) && order),
    text: `a reply sent mid-turn ${replyFrame ? (w.steeredOf(replyFrame) ? 'handed to the running turn' : 'HELD for the turn\'s end') : 'not written'}, then a typed Enter ${typedFrame ? (w.steeredOf(typedFrame) ? 'handed' : 'held') : 'not written'}; the reply first ${order}` };
}

const LEGS = {
  // §1 the ONE decision, and the composer asks it
  async pure(T) {
    const r = reqOf(T); const BC = r('./src/backend-caps.js');
    if (typeof BC.sendDoors !== 'function' || typeof BC.doorCapsOf !== 'function') return { ok: false, detail: 'no shared door decision (backend-caps sendDoors / doorCapsOf)' };
    const AM = await import(pathToFileURL(path.join(T, 'src/lib/agent-meta.js')).href);
    const claude = BC.capsOf('claude').inputModes, codex = BC.capsOf('codex').inputModes;
    const cases = [
      ['claude, a wrapper that serves steer', BC.doorCapsOf(claude, ['remove', 'steer', 'steer-all', 'reorder', 'edit']), 'steer'],
      ['claude, an older wrapper (no steer verb)', BC.doorCapsOf(claude, ['remove', 'reorder', 'edit']), 'queue'],
      ['codex (no steer door on Enter)', BC.doorCapsOf(codex, null), 'queue'],
      ['no queue row', BC.doorCapsOf({ queue: false, queueVerbs: [] }, null), null],
    ];
    const rows = cases.map(([name, caps, want]) => { const d = BC.sendDoors(caps).enterDoor, m = AM.composerSendModes(caps); return { ok: d === want && m.enterDoor === d && m.steerOnEnter === (d === 'steer') && AM.SEND_DOOR_TABLE === BC.SEND_DOOR_TABLE, text: `${name}: Enter ${d || 'none'} (the composer: ${m.enterDoor || 'none'})` }; });
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // §2 the owner's scene
  async scene(T) { const s = await scene(T); return { ok: s.ok, detail: s.text }; },
  // §2 the hold door: a message the person HELD stays held; a later Enter passes it (the person's choice)
  async hold(T) {
    const w = world(T);
    quiet(() => w.sender.send(w.sid, 'Hold this for later.', { msgId: 'm-held', origin: 'ws', steer: false }));
    quiet(() => w.sender.send(w.sid, 'Now this, at once.', { msgId: 'm-now', origin: 'ws', steer: true }));
    const f = w.frames(), held = f.find((x) => /Hold this/.test(w.textOf(x))), now = f.find((x) => /Now this/.test(w.textOf(x)));
    return { ok: !!(held && now && !w.steeredOf(held) && w.steeredOf(now)), detail: `a held message ${held && !w.steeredOf(held) ? 'stays held' : 'was STEERED'}; a later Enter ${now && w.steeredOf(now) ? 'is handed to the turn ahead of it' : 'was held'}` };
  },
  // §2 a harness row with no steer door keeps today's behaviour; a wrapper with no queue at all sends plainly
  async 'no-steer-door'(T) {
    const rows = [];
    { const w = world(T, { queueVerbs: ['remove', 'reorder', 'edit'] }); await quiet(() => w.reply('Take the second one.')); const f = w.frames()[0]; rows.push({ ok: !!f && !w.steeredOf(f), text: `claude on an older wrapper (no steer verb): the reply ${f && !w.steeredOf(f) ? 'held — «queued»' : 'STEERED'}` }); }
    { const w = world(T, { inputQueue: false, queueVerbs: [] }); await quiet(() => w.reply('Take the second one.')); const f = w.frames()[0]; rows.push({ ok: !!f && !w.steeredOf(f), text: `a wrapper with no queue: the reply ${f && !w.steeredOf(f) ? 'a plain send' : 'STEERED'}` }); }
    return { ok: rows.every((x) => x.ok), detail: rows.map((x) => (x.ok ? '' : '✗ ') + x.text).join(' · ') };
  },
  // §3 the census: every caller of the typing path names its door
  async census(T) {
    const files = spawnSync('git', ['grep', '-l', 'sendUserInput(', '--', 'src', 'server.js'], { cwd: T, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    const plain = (t) => t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // each CALL of the typing path: its argument list by paren matching (a template literal's ${…} and a nested object
    // argument included), judged by its LAST argument — the options object
    const judge = (name, src) => {
      const t = plain(src), out = []; let i = 0;
      while ((i = t.indexOf('sendUserInput(', i)) >= 0) {
        const pre = t.slice(Math.max(0, i - 12), i);
        if (/function\s+$|\.\s*$|[\w$]$/.test(pre)) { i += 14; continue; }   // a definition or another name's tail, not a call
        let d = 0, j = i + 'sendUserInput'.length;
        for (; j < t.length; j++) { const c = t[j]; if (c === '(') d++; else if (c === ')') { d--; if (d === 0) break; } }
        const args = t.slice(i + 'sendUserInput('.length, j); const o = args.slice(args.lastIndexOf('{'));
        out.push({ name, opts: o.replace(/\s+/g, ' ').trim().slice(0, 90), named: /\bdoor:\s*'enter'/.test(o) || /\bsteer:/.test(o) || /origin:\s*'dispatch'/.test(o) });
        i = j;
      }
      return out;
    };
    let sites = []; for (const f of files) { try { sites = sites.concat(judge(f, fs.readFileSync(path.join(T, f), 'utf8'))); } catch { } }
    const bad = sites.filter((x) => !x.named);
    const planted = judge('planted.js', "const r = sendUserInput(sid, text, { msgId: 'x', origin: 'new-door' });").filter((x) => !x.named).length === 1;
    return { ok: sites.length >= 5 && !bad.length && planted, detail: `${sites.length} callers of the typing path, each naming its door (${sites.map((x) => x.name.replace(/^src\//, '')).join(', ')})${bad.length ? ' — UNNAMED: ' + bad.map((x) => x.name + ' {' + x.opts + '}').join(' | ') : ''}; a planted caller without one is RED ${planted}` };
  },
};

say('this tree');
for (const leg of Object.keys(LEGS)) { let r; try { r = await LEGS[leg](REPO); } catch (e) { r = { ok: false, detail: 'threw: ' + (e && e.message) }; } ok(r.ok, `${leg}: ${r.detail}`); }

// §4 RED CONTROLS — the release (a git archive; a COUNTED skip without it) and a patch the suite carries
let skipped = 0;
{
  const dst = path.join(ROOT, 'base');
  fs.mkdirSync(dst, { recursive: true });
  const ar = spawnSync('git', ['archive', '--format=tar', BASE, 'src', 'package.json'], { cwd: REPO, maxBuffer: 1 << 30 });
  if (ar.status !== 0 || spawnSync('tar', ['-x', '-C', dst], { input: ar.stdout, maxBuffer: 1 << 28 }).status !== 0) { skipped++; say(`  SKIP the release's red control — ${BASE} is not in this clone: COUNTED, not passed`); }
  else {
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dst, 'node_modules')); } catch { }
    let s; try { s = await scene(dst); } catch (e) { s = { ok: false, text: 'threw: ' + e.message }; }
    ok(!s.ok, `${BASE} is RED at the owner's scene: ${s.text}`);
  }
}
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/routes/user-todos-reply.js'), 'utf8'), ANCH = "origin: 'inbox-reply', door: 'enter' });";
  if (ok(SRC.split(ANCH).length === 3, 'the patch «the reply without its door» applies (its anchor is there twice — the live send and the reopen)')) {
    const M = path.join(ROOT, 'patch'); fs.cpSync(path.join(REPO, 'src'), path.join(M, 'src'), { recursive: true });
    fs.writeFileSync(path.join(M, 'src/routes/user-todos-reply.js'), SRC.split(ANCH).join("origin: 'inbox-reply' });"));
    for (const f of ['package.json', 'node_modules']) { try { fs.symlinkSync(path.join(REPO, f), path.join(M, f)); } catch { } }
    const s = await scene(M); ok(!s.ok, `the reply without its door ⇒ RED at the owner's scene: ${s.text}`);
  }
}
say(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `; ${skipped} red control SKIPPED — not in this clone` : ''})`);
process.exit(failed ? 1 : 0);

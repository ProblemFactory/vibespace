#!/usr/bin/env node
// Huge-session paging reproduction driver (inc-mubvu3a4-x8sb, 2026-09-21,
// owner "没有办法正确翻页，每次都往回跳转很多，往下又直接跳到底部，还有大量空白").
//
//   node scripts/dbg-huge-paging.mjs measure <transcript.jsonl> [--out shape.json]
//   node scripts/dbg-huge-paging.mjs repro   <transcript.jsonl> [--sid <id>] [--cwd <dir>]
//        [--shots <dir>] [--out <json>] [--cv on|off] [--width 1920] [--height 963]
//        [--list-height 790] [--dpr 1] [--speeds slow,mid,fast] [--gestures 4] [--keep] [--no-gap]
//
// `measure` streams the file once (no >512 MB strings) and prints the SHAPE a
// synthetic gate fixture must imitate: record-kind mix per 1000 lines, tool_result
// / text / thinking size histograms, fold-run lengths under the DEFAULT fold kinds,
// images, the largest records, and the same numbers for the registered 32 MB tail
// (the part the window actually renders). It never prints message content.
//
// `repro` boots a throwaway worktree server (UNMINIFIED bundle, scratch HOME with
// the transcript hard-linked into the project dir the records name, no CLI, no
// agent hooks) + headless chrome sized like the reporter's client, opens the
// conversation view-only, and drives REAL CDP wheel gestures at three cadences
// up, then down, then the scroll-to-bottom button, then up again. Per gesture it
// records the geometry before/after, the landing (top/bottom/mid), the window
// indices, a blank-viewport measurement (elementFromPoint + checkVisibility) and
// the ChatView trace ring since the gesture's mark; it saves a screenshot of
// every landing that is a jump or a blank state. `--cv on` emulates the LIVE
// window's content-visibility (a read-only viewer runs with it off).
//
// REFUSES a transcript under the real ~/.claude or ~/.codex: copy it first (the
// copy is the fixture; the server gets a scratch HOME, never the real one).
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE } from './scratch.mjs';
import { judgeGesture, formatGesture, SNAP_SOURCE, RING_SINCE_SOURCE, WHEEL_POINT_SOURCE } from './paging-gesture-rules.mjs';
const require = createRequire(import.meta.url);
const { cwdToProjectDir } = require('../src/session-store.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args[0];
const transcript = args[1];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
if (!['measure', 'repro'].includes(mode) || !transcript) {
  console.error('usage: dbg-huge-paging.mjs measure|repro <transcript.jsonl> [options]');
  process.exit(2);
}

// ── THE REFUSAL: never point a server (or this scanner) at the real homes ────
{
  let real;
  try { real = fs.realpathSync(transcript); } catch (e) { console.error(`cannot read ${transcript}: ${e.message}`); process.exit(2); }
  for (const forbidden of ['.claude', '.codex']) {
    const root = path.join(os.homedir(), forbidden) + path.sep;
    let rootReal = root; try { rootReal = fs.realpathSync(path.join(os.homedir(), forbidden)) + path.sep; } catch {}
    if (real.startsWith(root) || real.startsWith(rootReal)) {
      console.error(`REFUSED: ${transcript} lives under the real ~/${forbidden}. Copy it somewhere else first (the copy is the fixture; a throwaway server must never see the real home).`);
      process.exit(2);
    }
  }
}

// ── measure ─────────────────────────────────────────────────────────────────
const TAIL_BYTES = 32 * 1024 * 1024;
const DEFAULT_KINDS = new Set(['thinking', 'bash', 'read', 'memory', 'mcp', 'agent', 'search', 'image']);
const HIST = [256, 1024, 4096, 16384, 65536, 262144, 1048576];
const histAdd = (h, v, scale = HIST) => { let i = 0; while (i < scale.length && v >= scale[i]) i++; h[i] = (h[i] || 0) + 1; };
const RUN_HIST = [2, 4, 8, 16, 32, 64, 128];
const histLabel = () => [...HIST.map((b, i) => `<${i === 0 ? b : b}`), `≥${HIST[HIST.length - 1]}`];
// what the run classifier does with a claude tool name (chat-run-summary.js)
const toolKind = (tn) => {
  if (tn === 'Bash') return 'bash';
  if (tn === 'Skill') return 'skill';
  if (tn === 'Agent' || tn === 'Task') return 'agent';
  if (tn === 'WebSearch' || tn === 'WebFetch') return 'search';
  if (tn === 'Grep' || tn === 'Glob' || tn === 'LS' || tn === 'Read') return 'read';
  if (tn === 'ToolSearch') return 'mcp';
  if (/^mcp__/.test(tn || '')) return 'mcp';
  if (tn === 'Write' || tn === 'Edit' || tn === 'Patch') return 'write';
  return null;
};
function classify(o) {
  const m = o.message;
  if (o.type === 'user') {
    const c = m?.content;
    if (typeof c === 'string') return { kind: 'prompt', len: c.length };
    if (Array.isArray(c)) {
      let tr = 0, trBytes = 0, img = 0, txt = 0;
      for (const b of c) {
        if (b?.type === 'tool_result') { tr++; const cc = b.content; trBytes += typeof cc === 'string' ? cc.length : Array.isArray(cc) ? cc.reduce((a, x) => a + (x?.type === 'image' ? (img++, 0) : (x?.text || '').length), 0) : 0; }
        else if (b?.type === 'image') img++;
        else if (b?.type === 'text') txt += (b.text || '').length;
      }
      if (tr) return { kind: 'tool_result', len: trBytes, n: tr, img };
      return { kind: 'prompt', len: txt, img };
    }
    return { kind: 'user-other' };
  }
  if (o.type === 'assistant') {
    const c = Array.isArray(m?.content) ? m.content : [];
    const kinds = new Set(c.map((b) => b?.type)); const tools = c.filter((b) => b?.type === 'tool_use').map((b) => b.name);
    const text = c.filter((b) => b?.type === 'text').reduce((a, b) => a + (b.text || '').length, 0);
    const think = c.filter((b) => b?.type === 'thinking').reduce((a, b) => a + (b.thinking || '').length, 0);
    if (kinds.has('text')) return { kind: 'text', len: text, tools, think };
    if (kinds.has('tool_use')) return { kind: 'tool_use', tools, think };
    if (kinds.has('thinking')) return { kind: 'thinking', len: think };
    return { kind: 'assistant-other' };
  }
  if (o.type === 'system') return { kind: 'system', sub: o.subtype || '' };
  if (o.type === 'summary') return { kind: 'summary' };
  if (o.type === 'file-history-snapshot') return { kind: 'snapshot' };
  return { kind: o.type || 'other' };
}
// What the NORMALIZER renders from a record (message-manager.js): assistant
// records sharing a message.id merge into ONE assistant message (thinking-only
// = a fold member, any text = a run BREAK) plus ONE tool card per tool_use
// (folds by the classifier's tool kind under the DEFAULT kinds); a tool_result
// EDITS its card (adds nothing); a user prompt / a system card / a rendered
// peer attachment / a pr-link card break; everything else is ignored.
function renderedOf(o, c, state) {
  if (c.kind === 'thinking' || c.kind === 'text' || c.kind === 'tool_use' || c.kind === 'assistant-other') {
    const id = o.message?.id || null; const out = [];
    const newMsg = id !== state.lastAsstId; state.lastAsstId = id;
    if (c.kind === 'text') out.push({ fold: false, k: 'text' });
    else if (c.kind === 'thinking' && newMsg && c.len > 0) out.push({ fold: true, k: 'thinking' });
    for (const tn of c.tools || []) { const k = toolKind(tn); out.push({ fold: !!(k && DEFAULT_KINDS.has(k)), k: k && DEFAULT_KINDS.has(k) ? k : 'tool:' + tn }); }
    return out;
  }
  if (c.kind === 'prompt') return [{ fold: false, k: 'prompt' }];
  if (c.kind === 'system') return [{ fold: false, k: 'system:' + (c.sub || '') }];
  if (c.kind === 'attachment') {
    const a = o.attachment; if (a?.type !== 'queued_command') return [];
    const txt = typeof a.prompt === 'string' ? a.prompt.trim() : (Array.isArray(a.prompt) ? a.prompt.some((b) => b?.type === 'text' && String(b.text || '').trim()) : false);
    return txt ? [{ fold: false, k: 'peer' }] : [];
  }
  if (c.kind === 'pr-link') {
    // ONE card per distinct PR (message-manager dedupes code-change cards by url / repo#number)
    const key = o.prUrl || ((o.prRepository || '') + '#' + (o.prNumber ?? ''));
    if (state.prKeys.has(key)) return []; state.prKeys.add(key); return [{ fold: false, k: 'pr-link' }];
  }
  return [];
}
async function measure(fp, out) {
  const size = fs.statSync(fp).size;
  const tailStartByte = Math.max(0, size - TAIL_BYTES);
  const rl = readline.createInterface({ input: fs.createReadStream(fp), crlfDelay: Infinity });
  const shape = {
    file: { bytes: size, lines: 0, tailStartLine: null, tailLines: 0, tailBytes: 0, unparsable: 0 },
    per1000: [], kindsTotal: {}, kindsTail: {},
    toolResult: { hist: {}, max: 0, total: 0, n: 0, histTail: {} }, text: { hist: {}, max: 0, n: 0 },
    thinking: { n: 0, hist: {}, max: 0, nTail: 0 }, images: { user: 0, toolResult: 0 },
    tools: {}, toolsTail: {},
    foldRuns: { hist: {}, max: 0, n: 0, histTail: {}, maxTail: 0, nTail: 0 }, breaksPer200Tail: [],
    rendered: { total: 0, tail: 0 }, breakKinds: {}, breakKindsTail: {}, attachmentTypes: {}, systemSubTail: {},
    largest: [], histLabel: histLabel(),
  };
  let off = 0, line = 0, bucket = null, run = 0, breaks200 = 0, since200 = 0, inTail = false;
  const rstate = { lastAsstId: null, prKeys: new Set() };
  const endRun = (isTail) => {
    if (run > 0) { histAdd(shape.foldRuns.hist, run, RUN_HIST); shape.foldRuns.n++; shape.foldRuns.max = Math.max(shape.foldRuns.max, run); if (isTail) { histAdd(shape.foldRuns.histTail, run, RUN_HIST); shape.foldRuns.nTail++; shape.foldRuns.maxTail = Math.max(shape.foldRuns.maxTail, run); } }
    run = 0;
  };
  for await (const raw of rl) {
    const bytes = Buffer.byteLength(raw, 'utf8') + 1;
    if (!inTail && off >= tailStartByte) { inTail = true; shape.file.tailStartLine = line; }
    if (line % 1000 === 0) { bucket = { from: line, bytes: 0 }; shape.per1000.push(bucket); }
    bucket.bytes += bytes;
    let c, o = null;
    try { o = JSON.parse(raw); c = classify(o); } catch { c = { kind: 'unparsable' }; shape.file.unparsable++; }
    if (c.kind === 'attachment') { const at = o?.attachment?.type || '?'; shape.attachmentTypes[at] = (shape.attachmentTypes[at] || 0) + 1; }
    if (c.kind === 'system' && inTail) shape.systemSubTail[c.sub || ''] = (shape.systemSubTail[c.sub || ''] || 0) + 1;
    bucket[c.kind] = (bucket[c.kind] || 0) + 1;
    shape.kindsTotal[c.kind] = (shape.kindsTotal[c.kind] || 0) + 1;
    if (inTail) { shape.kindsTail[c.kind] = (shape.kindsTail[c.kind] || 0) + 1; shape.file.tailLines++; shape.file.tailBytes += bytes; }
    if (c.kind === 'tool_result') { histAdd(shape.toolResult.hist, c.len); if (inTail) histAdd(shape.toolResult.histTail, c.len); shape.toolResult.n++; shape.toolResult.total += c.len; shape.toolResult.max = Math.max(shape.toolResult.max, c.len); shape.images.toolResult += c.img || 0; }
    if (c.kind === 'prompt') shape.images.user += c.img || 0;
    if (c.kind === 'text') { histAdd(shape.text.hist, c.len); shape.text.n++; shape.text.max = Math.max(shape.text.max, c.len); }
    if (c.kind === 'thinking' || (c.think > 0)) { const l = c.kind === 'thinking' ? c.len : c.think; shape.thinking.n++; histAdd(shape.thinking.hist, l); shape.thinking.max = Math.max(shape.thinking.max, l); if (inTail) shape.thinking.nTail++; }
    for (const tn of c.tools || []) { shape.tools[tn] = (shape.tools[tn] || 0) + 1; if (inTail) shape.toolsTail[tn] = (shape.toolsTail[tn] || 0) + 1; }
    for (const r of (o ? renderedOf(o, c, rstate) : [])) {
      shape.rendered.total++; if (inTail) shape.rendered.tail++;
      if (r.fold) run++;
      else { endRun(inTail); shape.breakKinds[r.k] = (shape.breakKinds[r.k] || 0) + 1; if (inTail) { breaks200++; shape.breakKindsTail[r.k] = (shape.breakKindsTail[r.k] || 0) + 1; } }
      if (inTail) { since200++; if (since200 === 200) { shape.breaksPer200Tail.push(breaks200); breaks200 = 0; since200 = 0; } }
    }
    if (shape.largest.length < 12 || bytes > shape.largest[shape.largest.length - 1].bytes) {
      shape.largest.push({ line, bytes, kind: c.kind, tools: c.tools?.slice(0, 3) });
      shape.largest.sort((a, b) => b.bytes - a.bytes); shape.largest.length = Math.min(shape.largest.length, 12);
    }
    off += bytes; line++;
  }
  endRun(inTail);
  shape.file.lines = line;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '-';
  console.log(`file: ${(size / 1048576).toFixed(1)} MB, ${line} lines; registered tail (last 32 MiB) = lines ${shape.file.tailStartLine}..${line} = ${shape.file.tailLines} lines`);
  console.log('kinds (whole file):', Object.entries(shape.kindsTotal).map(([k, v]) => `${k}=${v} (${pct(v, line)})`).join('  '));
  console.log('kinds (tail):      ', Object.entries(shape.kindsTail).map(([k, v]) => `${k}=${v} (${pct(v, shape.file.tailLines)})`).join('  '));
  console.log(`tool_result sizes (chars) n=${shape.toolResult.n} max=${shape.toolResult.max} mean=${Math.round(shape.toolResult.total / Math.max(1, shape.toolResult.n))}:`, shape.histLabel.map((l, i) => `${l}:${shape.toolResult.hist[i] || 0}`).join(' '));
  console.log(`  tail:`, shape.histLabel.map((l, i) => `${l}:${shape.toolResult.histTail[i] || 0}`).join(' '));
  console.log(`assistant text lengths n=${shape.text.n} max=${shape.text.max}:`, shape.histLabel.map((l, i) => `${l}:${shape.text.hist[i] || 0}`).join(' '));
  console.log(`thinking blocks n=${shape.thinking.n} (tail ${shape.thinking.nTail}) max=${shape.thinking.max}:`, shape.histLabel.map((l, i) => `${l}:${shape.thinking.hist[i] || 0}`).join(' '));
  console.log(`images: in prompts=${shape.images.user}, in tool results=${shape.images.toolResult}`);
  console.log('tools (whole):', top(shape.tools).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('tools (tail): ', top(shape.toolsTail).map(([k, v]) => `${k}=${v}`).join(' '));
  const runLabel = [...RUN_HIST.map((b) => `<${b}`), `≥${RUN_HIST[RUN_HIST.length - 1]}`];
  console.log(`rendered messages (normalizer model): whole=${shape.rendered.total} tail=${shape.rendered.tail}`);
  console.log(`fold runs over the RENDERED stream (default kinds; a run = consecutive fold members): n=${shape.foldRuns.n} max=${shape.foldRuns.max}`, runLabel.map((l, i) => `${l}:${shape.foldRuns.hist[i] || 0}`).join(' '));
  console.log(`  tail: n=${shape.foldRuns.nTail} max=${shape.foldRuns.maxTail}`, runLabel.map((l, i) => `${l}:${shape.foldRuns.histTail[i] || 0}`).join(' '));
  console.log(`  run-BREAKING (unfolded) messages per 200 rendered tail messages: ${shape.breaksPer200Tail.join(' ')}`);
  console.log('  what breaks runs (whole):', top(shape.breakKinds).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('  what breaks runs (tail): ', top(shape.breakKindsTail).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('attachment types:', top(shape.attachmentTypes).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('system subtypes (tail):', top(shape.systemSubTail).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('largest records:', shape.largest.map((r) => `L${r.line}:${(r.bytes / 1024).toFixed(0)}K:${r.kind}${r.tools?.length ? '(' + r.tools.join(',') + ')' : ''}`).join(' '));
  if (out) { fs.writeFileSync(out, JSON.stringify(shape, null, 1)); console.log('wrote', out); }
}

// ── repro ───────────────────────────────────────────────────────────────────
async function repro(fp) {
  const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
  if (!CHROME) { console.error('no chrome/chromium'); process.exit(2); }
  const sid = opt('sid', path.basename(fp).replace(/\.jsonl$/, ''));
  let cwd = opt('cwd', null);
  if (!cwd) {
    // the records name their own cwd — read the LAST 2 MB and take the majority
    // (a long conversation can begin under a directory that was renamed since;
    // the CURRENT project dir is where discovery looks for the live session)
    const st = fs.statSync(fp); const fd = fs.openSync(fp, 'r'); const buf = Buffer.alloc(Math.min(st.size, 2 << 20));
    const n = fs.readSync(fd, buf, 0, buf.length, Math.max(0, st.size - buf.length)); fs.closeSync(fd);
    const votes = {};
    for (const l of buf.subarray(0, n).toString('utf8').split('\n').slice(1)) { try { const o = JSON.parse(l); if (o.cwd) votes[o.cwd] = (votes[o.cwd] || 0) + 1; } catch {} }
    cwd = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (!cwd) { console.error('no cwd in the last records; pass --cwd'); process.exit(2); }
  }
  const W = Number(opt('width', 1920)), H = Number(opt('height', 963)), LIST_H = Number(opt('list-height', 790)), DPR = Number(opt('dpr', 1));
  const CV = opt('cv', 'off');
  const SPEEDS = opt('speeds', 'slow,mid,fast').split(',');
  const GESTURES = Number(opt('gestures', 4));
  const shots = opt('shots', path.join(os.tmpdir(), 'huge-paging-shots')); fs.mkdirSync(shots, { recursive: true });
  const outJson = opt('out', path.join(shots, `repro-cv-${CV}.json`));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const [PORT, CDP_PORT] = await freePorts(2);
  const wt = scratch('hugepaging-wt');
  const home = scratchHome('hugepaging-home', fs);
  const proj = path.join(home, '.claude', 'projects', cwdToProjectDir(cwd));
  fs.mkdirSync(proj, { recursive: true });
  const dst = path.join(proj, `${sid}.jsonl`);
  try { fs.linkSync(fp, dst); } catch { fs.copyFileSync(fp, dst); }
  console.log(`fixture: ${dst} (${(fs.statSync(dst).size / 1048576).toFixed(0)} MB) sid=${sid} cwd=${cwd}`);

  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  execSync('npm run build', { cwd: wt, stdio: 'ignore' });
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  const srvLog = fs.openSync(path.join(shots, `server-cv-${CV}.log`), 'w');
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: ['ignore', srvLog, srvLog] });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', `--window-size=${W},${H}`,
    '--disable-background-timer-throttling', '--hide-scrollbars=false', `--user-data-dir=${scratch('hugepaging-chrome')}`, 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => {
    try { chrome.kill('SIGKILL'); } catch {}
    try { srv.kill('SIGKILL'); } catch {}
    if (!flag('keep')) {
      try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      for (const d of [scratch('hugepaging-chrome'), home]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
    }
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
  for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

  const WebSocket = require('ws');
  let target = null;
  for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { await sleep(250); } }
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { const s = m.params.exceptionDetails?.exception?.description?.slice(0, 300); pageErrors.push(s); console.log('[pageEX]', s); }
  });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  if (DPR !== 1) await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 80; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(400); }
  await sleep(1500);

  // open the conversation VIEW-ONLY, size the window so the message list is LIST_H tall
  const opened = await evaljs(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.app.viewSession(${JSON.stringify(sid)}, ${JSON.stringify(cwd)}, 'huge paging');
    let v = null, w = null, n = 0, armed = false;
    for (let i = 0; i < 450; i++) {
      // by the view's OWN id (view-<sid>) — the sidebar renames the window by the
      // first-user-message rule the moment its naming read lands, so a title match
      // finds nothing (attempt 1 of this driver died exactly there)
      const hit = [...window.app.sessions.entries()].find(([, cv]) => cv && cv.sessionId === 'view-' + ${JSON.stringify(sid)});
      v = hit ? hit[1] : null;
      w = hit ? window.app.wm.windows.get(hit[0]) : null;
      n = v && v._messageList ? v._messageList.querySelectorAll('.chat-msg').length : 0;
      armed = !!(v && v._gapMinimapActive);
      if (n > 10 && armed) break;
      if (n > 10 && i > 150) break;   // rendered but the whole-file turn map never armed: proceed and say so
      await sleep(400);
    }
    if (!v || n <= 10) return { ok: false, win: !!w, view: !!v, n, armed, total: v ? v._total : null, windows: [...window.app.wm.windows.values()].map((x) => String(x.title || '').slice(0, 40)) };
    // fill the workspace, then trim the window height until the list is LIST_H tall
    const ws = document.getElementById('workspace') || document.querySelector('.workspace');
    const wr = ws.getBoundingClientRect();
    const el = w.element; el.style.left = '0px'; el.style.top = '0px'; el.style.width = wr.width + 'px'; el.style.height = wr.height + 'px';
    if (w.onResize) try { w.onResize(); } catch {}
    await sleep(300);
    const list = v._messageList;
    const d = list.clientHeight - ${LIST_H};
    if (d > 0) { el.style.height = (wr.height - d) + 'px'; if (w.onResize) try { w.onResize(); } catch {} }
    await sleep(300);
    if (${JSON.stringify(CV)} === 'on') {
      v._readOnly = false; v._container.classList.remove('chat-no-content-visibility');
      // …and RE-TAIL: the toggle re-measures every card and leaves the list at scrollTop 0 unpinned
      // (a state no live window has — verifier r1: the first gesture then fired the top-edge branch
      // and walked 150 messages for one notch); a live window opens pinned at the tail
      await sleep(400); v._pinned = true; v._forceScrollToBottom(); await sleep(600);
    }
    await sleep(2500); // initial render + fold + attach fill settle
    window.__v = v; window.__list = list; window.__win = w;
    const r = list.getBoundingClientRect();
    return { ok: true, winId: w.id, armed, n: list.querySelectorAll('.chat-msg').length, ch: list.clientHeight, sh: list.scrollHeight, st: list.scrollTop, ws: v._windowStart, we: v._windowEnd, total: v._total, gap: v._gapBounds, cv: !v._container.classList.contains('chat-no-content-visibility'), compact: v._container.classList.contains('chat-compact'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  })()`);
  console.log('opened:', JSON.stringify(opened));
  if (!opened?.ok) { console.error('could not open the conversation', JSON.stringify(pageErrors.slice(0, 5))); process.exit(1); }
  if (!opened.armed) console.log('WARNING: the whole-file turn map never armed (_gapMinimapActive=false) — tail-mode paging only, no seek sentinel');
  const rect = opened.rect;
  const cx = Math.round(rect.x + rect.w / 2), cy = Math.round(rect.y + rect.h / 2);

  // ── per-gesture measurement (numbers only; blank = elementFromPoint says no card / an unrendered card) ──
  // the SNAP is the shared one (scripts/paging-gesture-rules.mjs) — the gate suite takes the same numbers
  const snap = (topIdBefore = null, topOffBefore = 0) => evaljs(`(${SNAP_SOURCE})(${JSON.stringify(topIdBefore)}, ${topOffBefore})`);
  // by SEQ, never by index (the ring splices 600→400 mid-run; an index mark taken before the splice reads nothing after it — verifier r1)
  const ringSince = (mark) => evaljs(RING_SINCE_SOURCE(mark));
  let shotN = 0;
  const shot = async (name) => {
    const file = path.join(shots, `${String(++shotN).padStart(2, '0')}-cv${CV}-${name}.png`);
    const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    if (r.result?.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  };
  const wheel = async (deltaY, notches, gapMs) => {
    // over a PLAIN point of the viewport — never a card's own scroll box, which would take the notches (r1)
    const pt = (await evaljs(WHEEL_POINT_SOURCE(deltaY < 0 ? 'up' : 'down', Math.abs(deltaY) * notches))) || { x: cx, y: cy, moved: 0 };
    if (pt.moved) console.log('    (wheel dispatched off the centre line: a card\'s own scroll box was under it)');
    if (pt.fallback) console.log(`    (NO plain point to wheel over — the centre, over ${pt.under}; the delivery rule is not judged for this gesture)`);
    lastWheelFallback = pt.fallback ? 1 : 0;
    for (let i = 0; i < notches; i++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY });
      if (gapMs) await sleep(gapMs);
    }
  };
  // slow = one wheel notch; mid = a few notches; fast = the owner's trackpad fling
  // (the incident ring: scroll samples 401/486/840/930 px apart, 30 ms between)
  // hold = a CONTINUOUS trackpad scroll (the ring: extendBottom every ~340 ms
  // for 5 s with wheelAgo 0-4 the whole time — input never stops)
  const CADENCE = { slow: { notches: 1, deltaY: 120, gap: 0, settle: 1800 }, mid: { notches: 6, deltaY: 120, gap: 70, settle: 1800 }, fast: { notches: 4, deltaY: 700, gap: 30, settle: 2400 }, hold: { notches: 40, deltaY: 300, gap: 100, settle: 2400 } };
  const rows = [];
  let lastWheelFallback = 0;
  const gesture = async (name, dir, speed) => {
    const c = CADENCE[speed];
    const before = await snap();
    const mark = before.ringSeq;
    await wheel(dir === 'up' ? -c.deltaY : c.deltaY, c.notches, c.gap);
    // TRANSIENT blank (the owner's "大量空白"): the collapsed one-viewport states
    // live BETWEEN grow passes and before content-visibility resolves — a
    // sample after settle never sees them, so sample early and keep the worst
    const early = []; let waited = 0; let worst = null;
    for (const d of [120, 400, 900]) {
      await sleep(d - waited); waited = d;
      const e = await snap(); early.push({ at: d, blankPct: e.blankPct, emptyBelow: e.emptyBelow, unrenderedPct: e.unrenderedPct, sh: e.sh, st: e.st, ws: e.ws, we: e.we });
      if (!worst || e.blankPct + e.emptyBelow / 8 > worst.blankPct + worst.emptyBelow / 8) worst = { ...e, at: d };
      if ((e.blankPct >= 30 || e.emptyBelow >= 200) && !worst.shot) worst.shot = await shot(name + '-t' + d + '-blank');
    }
    await sleep(Math.max(0, c.settle - waited));
    const after = await snap(before.topId, before.topOff);
    const ring = await ringSince(mark);
    const wheelPx = c.notches * c.deltaY * (dir === 'up' ? -1 : 1);
    const landing = after.st <= 8 ? 'TOP' : (after.sh - after.st - after.ch < 4 ? 'BOTTOM' : 'mid');
    const tags = {}; for (const e of ring) tags[e.tag] = (tags[e.tag] || 0) + 1;
    const row = { name, dir, speed, wheelPx, before, after, early, wheelFallback: lastWheelFallback, worst: { at: worst.at, blankPct: worst.blankPct, emptyBelow: worst.emptyBelow, unrenderedPct: worst.unrenderedPct, sh: worst.sh, st: worst.st, shot: worst.shot ? path.basename(worst.shot) : null }, dSt: after.st - before.st, dWs: after.ws - before.ws, dWe: after.we - before.we, landing, sameTop: before.topId === after.topId, tags, ring };
    row.verdict = judgeGesture(row);
    const interesting = landing !== 'mid' || after.blankPct >= 30 || Math.abs(row.dWs) >= 150 || Math.abs(row.dWe) >= 150 || Math.abs(row.dSt - wheelPx) > 600 || !row.verdict.ok;
    if (interesting) row.shot = await shot(name);
    rows.push(row);
    console.log(`${name.padEnd(14)} ${dir.padEnd(4)} ${speed.padEnd(4)} wheel=${String(wheelPx).padStart(6)} st ${String(before.st).padStart(5)}→${String(after.st).padEnd(5)} sh ${String(before.sh).padStart(5)}→${String(after.sh).padEnd(5)} ws ${before.ws}→${after.ws} we ${before.we}→${after.we} pin ${before.pin}→${after.pin} rendered ${before.rendered}→${after.rendered} blank ${before.blankPct}%→${after.blankPct}% (empty ${after.emptyPct}%, unrendered ${after.unrenderedPct}%, below ${after.emptyBelow}px) land=${landing} ${row.shot ? path.basename(row.shot) : ''}`);
    console.log(`    ring: ${Object.entries(tags).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join(' ')}`);
    console.log(`    rules: ${row.verdict.ok ? 'OK' : 'VIOLATION — ' + row.verdict.reasons.join('; ')}`);
    console.log(`    early: ${early.map((e) => `+${e.at}ms blank ${e.blankPct}% below ${e.emptyBelow}px unrendered ${e.unrenderedPct}% sh ${e.sh} st ${e.st}`).join(' | ')}${row.worst.shot ? ' ' + row.worst.shot : ''}`);
    return row;
  };

  const initShot = await shot('initial');
  console.log('initial:', JSON.stringify(await snap()), initShot);
  for (const sp of SPEEDS) for (let i = 0; i < GESTURES; i++) await gesture(`up-${sp}-${i + 1}`, 'up', sp);
  if (!flag('no-hold')) await gesture('up-hold', 'up', 'hold');
  for (const sp of SPEEDS) for (let i = 0; i < GESTURES; i++) await gesture(`down-${sp}-${i + 1}`, 'down', sp);
  if (!flag('no-hold')) await gesture('down-hold', 'down', 'hold');
  // the reporter's own recovery attempt: the scroll-to-bottom button, then up again
  {
    const before = await snap(); const mark = before.ringSeq;
    await evaljs(`(() => { const b = window.__v._scrollBtn; if (b) b.click(); return !!b; })()`);
    await sleep(2500);
    const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
    const row = { name: 'scroll-btn', dir: 'btn', speed: '-', wheelPx: 0, before, after, early: [], worst: null, dSt: after.st - before.st, dWs: after.ws - before.ws, dWe: after.we - before.we, landing: after.st <= 8 ? 'TOP' : (after.sh - after.st - after.ch < 4 ? 'BOTTOM' : 'mid'), ring, shot: await shot('scroll-btn') };
    row.verdict = judgeGesture(row);
    rows.push(row);
    console.log(`scroll-btn      st ${before.st}→${after.st} sh ${before.sh}→${after.sh} ws ${before.ws}→${after.ws} we ${before.we}→${after.we} pin ${before.pin}→${after.pin} blank ${after.blankPct}% land=${row.landing} ${path.basename(row.shot)}`);
  }
  for (let i = 0; i < 2; i++) await gesture(`up2-slow-${i + 1}`, 'up', 'slow');
  for (let i = 0; i < 2; i++) await gesture(`up2-mid-${i + 1}`, 'up', 'mid');
  // THE GAP SLAB (verifier r1; the gate's §4c walks the same legs): a minimap jump to message 0 of the
  // registered tail, holds up into the seek gap, mid-list gestures INSIDE the slab both ways, holds back
  // down through the tail (the slab must be dropped when the window leaves message 0), one notch up.
  if (!flag('no-gap') && opened.armed) {
    const b0 = await snap();
    await evaljs('(async () => { await window.__v.jumpToIndex(0); return true; })()'); await sleep(2500);
    const a0 = await snap();
    console.log(`gap-jump       jump → idx 0: st ${b0.st}→${a0.st} ws ${b0.ws}→${a0.ws} we ${b0.we}→${a0.we} gapAbove=${a0.gapAbove} gapCursor=${a0.gapCursor}`);
    for (let i = 0; i < 2; i++) await gesture(`gap-up-hold-${i + 1}`, 'up', 'hold');
    for (let i = 0; i < 2; i++) await gesture(`gap-down-mid-${i + 1}`, 'down', 'mid');
    await gesture('gap-down-fast-1', 'down', 'fast');
    for (let i = 0; i < 2; i++) await gesture(`gap-up-mid-${i + 1}`, 'up', 'mid');
    await gesture('gap-up-fast-1', 'up', 'fast');
    for (let i = 0; i < 3; i++) await gesture(`gap-down-hold-${i + 1}`, 'down', 'hold');
    await gesture('gap-tail-up-slow-1', 'up', 'slow');
  }

  // ── VERDICTS: each hypothesis named from the ring, in numbers ──
  const ch = opened.ch;
  const all = rows.flatMap((r) => r.ring.map((e) => ({ ...e, g: r.name })));
  // H1: a trimBottom INSIDE _extendTop's grow loop whose gate read ≥3 viewports
  //     (sh) and whose result (sh2) is under two — the placeholder-inflated gate
  const h1 = all.filter((e) => e.tag === 'trimBottom').map((e) => ({ g: e.g, n: e.n, removed: e.removed, sh: e.sh, sh2: e.sh2, gateVp: +(e.sh / ch).toFixed(2), afterVp: +(e.sh2 / ch).toFixed(2) }));
  const h1Hits = h1.filter((e) => e.sh >= 3 * ch && e.sh2 < 2 * ch);
  // …and the anchor it took with it: an anchorLost {why:removed} / anchored:false landing at st 0 right after
  const anchorLostAfterTrim = all.filter((e) => e.tag === 'anchorLost' && e.why === 'removed').length;
  const extendTopAt0 = all.filter((e) => e.tag === 'extendTop:done' && !e.anchored && e.st === 0).length;
  const grown = all.filter((e) => e.tag === 'extendTop:grown').map((e) => ({ g: e.g, passes: e.passes, ws: e.ws, sh: e.sh }));
  // H2: a repin with the window's end short of the total = pinned in the MIDDLE of history,
  //     then extendBottoms with no wheel between them (the pinned auto-follow feeds itself)
  const h2 = all.filter((e) => e.tag === 'repin' && Number.isFinite(e.we) && Number.isFinite(e.total) && e.we < e.total).map((e) => ({ g: e.g, st: e.st, sh: e.sh, we: e.we, total: e.total, n: e.n }));
  const chains = [];
  for (const r of rows) {
    const ebOnly = r.ring.filter((e) => e.tag === 'extendBottom');
    const inputless = r.ring.filter((e) => e.tag === 'pageDown' && e.pin === 1 && e.input === 0).length;
    if (ebOnly.length >= 3) chains.push({ g: r.name, extendBottoms: ebOnly.length, pageDownPinnedNoInput: inputless, weFrom: ebOnly[0].we, weTo: ebOnly[ebOnly.length - 1].we, dWe: r.dWe, landing: r.landing });
  }
  // H3: blank = the viewport not filled after a landing (emptyBelow) / unrendered cards on screen;
  //     the downward twin of the 2.369.129 order defect: trimTop reads the tall pre-trim window, then the fold collapses it
  const h3 = rows.filter((r) => r.after.emptyBelow >= 200 || r.after.blankPct >= 30 || (r.worst && (r.worst.emptyBelow >= 200 || r.worst.blankPct >= 30)))
    .map((r) => ({ g: r.name, dir: r.dir, settled: { emptyBelow: r.after.emptyBelow, blankPct: r.after.blankPct, unrenderedPct: r.after.unrenderedPct, sh: r.after.sh, st: r.after.st }, worst: r.worst, ch: r.after.ch, shot: r.shot ? path.basename(r.shot) : null }));
  const trimTopCollapse = all.filter((e) => e.tag === 'trimTop').map((e) => ({ g: e.g, removed: e.removed, anchored: e.anchored, sh: e.sh, sh2: e.sh2, gateVp: +(e.sh / ch).toFixed(2), afterVp: +(e.sh2 / ch).toFixed(2) }));
  const verdicts = {
    H1_trim_inside_grow: { trims: h1, hits: h1Hits.length, anchorLostRemoved: anchorLostAfterTrim, extendTopLandedAt0: extendTopAt0, grown },
    H2_repin_mid_history: { repins: h2, chains },
    H3_blank_after_landing: { landings: h3, trimTops: trimTopCollapse },
  };
  console.log('VERDICTS', JSON.stringify(verdicts, null, 1));
  // ── THE PER-GESTURE TABLE (the same rules the gate suite asserts) ──
  console.log('\nPER-GESTURE RULES (scripts/paging-gesture-rules.mjs): no jump back > 1.5 viewports · no pin / bottom landing before the window reaches the tail · blank ≤ 25% · the ring never empty after a page');
  let violations = 0;
  for (const r of rows) { console.log('  ' + formatGesture(r, r.verdict)); if (!r.verdict.ok) violations++; }
  console.log(violations ? `RULES: ${violations} of ${rows.length} gestures VIOLATE` : `RULES: all ${rows.length} gestures hold`);
  const summary = {
    at: new Date().toISOString(), cv: CV, viewport: `${W}x${H}`, listHeight: opened.ch, total: opened.total, gap: opened.gap, pageErrors, verdicts,
    rows: rows.map((r) => ({ ...r, ring: r.ring.slice(0, 160) })),
  };
  summary.rules = { violations, rows: rows.map((r) => ({ name: r.name, ok: r.verdict.ok, reasons: r.verdict.reasons })) };
  fs.writeFileSync(outJson, JSON.stringify(summary, null, 1));
  console.log('wrote', outJson, 'shots in', shots);
  ws.close();
  process.exitCode = violations ? 1 : 0;
}

if (mode === 'measure') await measure(transcript, opt('out', null));
else await repro(transcript);
process.exit(process.exitCode || 0);

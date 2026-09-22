#!/usr/bin/env node
// Chat virtual-scroll paging stability (2026-07-30 user report: "翻页过程中会
// 往上跳一大截，往回翻也会意外跳跃"). Drives a REAL view-only ChatView over a
// synthetic 700-record transcript (with foldable Bash runs, so run-collapse is
// active) in a throwaway worktree server + headless chrome, pages UP then DOWN
// in discrete steps, and measures viewport displacement a user would perceive
// as a jump: (a) the anchor element shifting inside the viewport between our
// scripted steps, (b) scrollTop moving away from where the script put it.
// Run: node scripts/test-chat-paging.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE } from './scratch.mjs';
import { judgeGesture, formatGesture, SNAP_SOURCE, RING_SINCE_SOURCE, WHEEL_POINT_SOURCE, JUMP_SLACK_VIEWPORTS, DELIVERY_MIN_FRACTION, PAGE_UP_BAND_PX } from './paging-gesture-rules.mjs';
const require = createRequire(import.meta.url);
const { fixtureLitter } = require('../src/fixture-guard.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const wt = scratch('chatpage-smoke');
const CWD = scratch('chatpage-test');
const SID = fixtureSid('1');
const SID2 = fixtureSid('2'); // the FOLD-DOMINATED transcript (inc-mub8xwrb-z57x)
const SID3 = fixtureSid('3'); // the HUGE COMPACT-MODE transcript (inc-mubvu3a4-x8sb) — §1c
// ISOLATED $HOME (2026-09-09). This suite used to write its 42 MB synthetic
// transcript into the developer's REAL ~/.claude/projects, because the server
// it spawns inherited HOME and can only discover what lives under its own
// home. The machine's PRODUCTION instance polls that directory every 5 s: the
// fixture was listed as a stopped "conversation" and its FABRICATED usage
// blocks were ingested into the permanent ledger (measured 2026-09-09: 70,533
// rows for THIS session id, of the instance's 79,533 fabricated rows, claiming
// Fable tokens nobody ever spent). The server
// gets its own home, the fixture goes there, and the census at the end proves
// the real one was untouched.
const fakeHome = scratchHome('chatpage-home', fs);
const PROJ = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. synthetic transcript: text turns + LONG texts + foldable Bash runs ──
{
  const lines = [];
  let t = Date.now() - 7 * 86400e3;
  const ts = () => new Date((t += 30e3)).toISOString();
  let n = 0;
  const push = (o) => { lines.push(JSON.stringify(o)); };
  // 900 turns with fat tool outputs → ~40MB file: crosses the 32MB
  // registered-tail threshold, so paging up exercises the GAP-SEEK path
  // (slab loads + _trimGapDom) exactly like the huge real-world sessions
  // the report came from.
  const FAT = 'a fat line of tool output that adds real rendered height 0123456789\n';
  for (let turn = 0; turn < 900; turn++) {
    push({ type: 'user', message: { role: 'user', content: `question ${turn}: please do the thing and explain` }, uuid: `u-${n++}`, timestamp: ts() });
    // assistant text of varying length (height variance is what stresses the
    // content-visibility estimates)
    const long = 'line of explanatory prose that wraps around and adds height\n'.repeat(3 + (turn % 9) * 4);
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${turn}:\n${long}` }], usage: { input_tokens: 10, output_tokens: 50 } }, uuid: `a-${n++}`, timestamp: ts() });
    // a run of 4 Bash tool calls (foldable by run-collapse)
    for (let b = 0; b < 4; b++) {
      const tid = `toolu_${turn}_${b}`;
      push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command: `echo step ${turn}.${b}` } }], usage: {} }, uuid: `tu-${n++}`, timestamp: ts() });
      // vary result size wildly (16 lines … 300 lines): estimate-vs-real
      // height skew under content-visibility is the stress being tested
      push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: `output ${turn}.${b}\n` + FAT.repeat(16 + ((turn + b) % 5) * 70) }] }, uuid: `tr-${n++}`, timestamp: ts() });
    }
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `turn ${turn} done.` }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `af-${n++}`, timestamp: ts() });
  }
  fs.mkdirSync(PROJ, { recursive: true });
  fs.mkdirSync(CWD, { recursive: true });
  fs.writeFileSync(path.join(PROJ, `${SID}.jsonl`), lines.join('\n') + '\n');
  console.log(`  transcript: ${lines.length} records`);
}

// ── 1b. FOLD-DOMINATED transcript (inc-mub8xwrb-z57x, 2.369.129): 1500 consecutive
// Bash pairs with no text between — the shape of a long agent session, which the
// semantic fold renders as a couple of run headers per hundreds of records.
{
  const lines = [];
  let t = Date.now() - 6 * 86400e3;
  const ts = () => new Date((t += 20e3)).toISOString();
  let n = 0;
  const push = (o) => { lines.push(JSON.stringify(o)); };
  push({ type: 'user', message: { role: 'user', content: 'run the whole migration and report' }, uuid: `f-u-${n++}`, timestamp: ts() });
  for (let i = 0; i < 1500; i++) {
    const tid = `toolu_fold_${i}`;
    push({ type: 'assistant', message: { id: `fmsg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command: `echo step ${i}` } }], usage: {} }, uuid: `f-a-${n++}`, timestamp: ts() });
    push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: `ok ${i}\n` }] }, uuid: `f-r-${n++}`, timestamp: ts() });
    // a one-line status between batches, as real agent sessions have — the fold
    // closes a run at it, so a slab of 40 pairs renders as ONE header + ONE line
    if (i % 40 === 39) push({ type: 'assistant', message: { id: `fmsg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `batch ${(i + 1) / 40} done.` }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `f-t-${n++}`, timestamp: ts() });
  }
  push({ type: 'assistant', message: { id: `fmsg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'migration done.' }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `f-af-${n++}`, timestamp: ts() });
  fs.writeFileSync(path.join(PROJ, `${SID2}.jsonl`), lines.join('\n') + '\n');
  console.log(`  fold transcript: ${lines.length} records`);
}

// ── 1c. THE HUGE COMPACT-MODE SESSION (inc-mubvu3a4-x8sb, 2026-09-21): a synthetic
// transcript with the SHAPE of the owner's 976 MB / 266,270-line conversation,
// measured by scripts/dbg-huge-paging.mjs `measure` on a copy (the private file
// itself never leaves the owner's machine). Per 1000 lines of its registered
// tail: attachment 265 (hook_success / total_tokens_reminder / batching /
// task_reminder …), tool_use 110 (Bash 97 %, a Workflow, a Read/Write), a
// matching tool_result each, thinking 80 (98 % empty — a signature only), text
// 18, prompt 17, system 9 (stop_hook_summary), 7 bookkeeping rows × 53
// (last-prompt / custom-title / agent-name / mode / permission-mode / atis-latch /
// pr-link — all ignored or deduped by the normalizer), queue-operation 22;
// tool_result chars <256 31 % / <1K 28 % / <4K 28 % / <16K 11 % / <64K 1 %; text
// <256 76 % / <1K 19 % / <4K 5 %; fold runs (consecutive foldable cards) 55 % of
// length 1, 29 % 2–3, 11 % 4–7, the rest to 44; 28–106 run-breakers per 200
// rendered messages; ~2.6 images per 1000 lines, the largest records 1.3–2.2 MB;
// ≈ 2.8 KB per line, ≈ 190 rendered messages per 1000 lines. What made the
// incident: in compact mode 150 rendered cards of this shape are about ONE
// viewport, so the count trim removed the reader's anchor on every page.
// ≥ 48 MB so the registered 32 MiB tail (≈ 2,200 rendered messages) sits under
// a real gap — the same tail-mode paging the owner's window ran.
const HUGE_TARGET_BYTES = Number(process.env.VS_HUGE_FIXTURE_MB || 48) * 1048576;
{
  const t0 = Date.now();
  // a deterministic PRNG: the shape is the fixture, not the seed
  let seed = 0x1c7e5eed >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (table) => { const r = rnd(); let acc = 0; for (const [p, v] of table) { acc += p; if (r < acc) return v; } return table[table.length - 1][1]; };
  const irange = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const words = ['the', 'trim', 'measures', 'what', 'remains', 'by', 'height', 'never', 'by', 'count', 'a', 'window', 'pinned', 'at', 'the', 'tail', 'reads', 'its', 'own', 'end', 'slab', 'landing', 'anchor', 'viewport', 'fold', 'run', 'header', 'compact', 'row', 'zone'];
  const prose = (chars) => { let out = ''; while (out.length < chars) out += words[Math.floor(rnd() * words.length)] + (rnd() < 0.08 ? '\n' : ' '); return out.slice(0, chars); };
  const toolOut = (chars) => { let out = ''; let i = 0; while (out.length < chars) out += `${String(++i).padStart(5)}  ${prose(irange(20, 90)).replace(/\n/g, ' ')}\n`; return out.slice(0, chars); };
  const sizeOf = (hist) => { const [lo, hi] = pick(hist); return irange(lo, hi); };
  const TOOL_RESULT = [[0.31, [10, 255]], [0.28, [256, 1023]], [0.285, [1024, 4095]], [0.114, [4096, 16383]], [0.011, [16384, 52000]]];
  // visible cards are ONE-LINERS mostly (the tail's texts: 76 % < 256 chars — status lines, hook summaries); the size
  // histograms above are the whole file's, the TAIL the owner paged is the fold-dominated end of it
  const TEXT = [[0.60, [12, 90]], [0.22, [91, 255]], [0.13, [256, 1023]], [0.05, [1024, 4095]]];
  const PROMPT = [[0.55, [20, 120]], [0.25, [121, 400]], [0.15, [1024, 4095]], [0.05, [10000, 20000]]];
  // the tail is TWO regions (breakers per 200 rendered: 28 at the deep end … 49 at the recent end): the
  // body is fold-dominated — a status line per run of ~6–12 tool calls — and the last few hundred lines
  // are denser (prompts, answers, notices). The count trim kept the FRESH slab and removed the viewport,
  // so it is the body's density that made 150 cards one viewport.
  const STEPS_DEEP = [[0.10, [1, 1]], [0.15, [2, 3]], [0.25, [4, 7]], [0.30, [8, 15]], [0.20, [16, 44]]];
  const STEPS_DENSE = [[0.30, [1, 1]], [0.30, [2, 3]], [0.25, [4, 7]], [0.10, [8, 15]], [0.05, [16, 30]]];
  // a VALID PNG (RGB, stored deflate blocks) so an image card renders at a real
  // size, at the scale of the transcript's largest records
  const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const png = (w, h, tint) => {
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = tint; raw[o + 2] = (y * 255 / h) | 0; } }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
  };
  const IMAGES = [png(480, 280, 40).toString('base64'), png(400, 320, 160).toString('base64')]; // ≈ 540 KB / 510 KB each
  const out = fs.createWriteStream(path.join(PROJ, `${SID3}.jsonl`));
  let bytes = 0, lines = 0, n = 0, t = Date.now() - 30 * 86400e3;
  const ts = () => new Date((t += 20e3)).toISOString();
  const uuid = () => fixtureSid((n++).toString(16)); // every record id is MINTED (test-fixture-isolation refuses a hand-spelled member of the family)
  const base = () => ({ parentUuid: null, isSidechain: false, userType: 'external', entrypoint: 'sdk-cli', cwd: CWD, sessionId: SID3, version: '2.1.274', gitBranch: 'master', slug: 'huge-paging-fixture' });
  const push = (o) => { const l = JSON.stringify(o) + '\n'; bytes += Buffer.byteLength(l); lines++; out.write(l); };
  const usage = () => ({ input_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 90000, output_tokens: irange(10, 400), service_tier: 'standard' });
  const asst = (content, id) => push({ ...base(), type: 'assistant', message: { model: 'claude-fable-5-1', id, type: 'message', role: 'assistant', content, stop_reason: 'tool_use', usage: usage() }, requestId: `req_${n}`, uuid: uuid(), timestamp: ts() });
  const bookkeeping = () => {
    push({ type: 'last-prompt', lastPrompt: 'the last prompt', leafUuid: uuid(), sessionId: SID3 });
    push({ type: 'custom-title', customTitle: 'huge fixture', sessionId: SID3 });
    push({ type: 'agent-name', agentName: 'huge fixture', sessionId: SID3 });
    push({ type: 'mode', mode: 'normal', sessionId: SID3 });
    push({ type: 'permission-mode', permissionMode: 'bypassPermissions', sessionId: SID3 });
    push({ type: 'atis-latch', atis: '', sessionId: SID3 });
    push({ type: 'pr-link', sessionId: SID3, prNumber: 7, prUrl: 'https://example.invalid/pr/7', prRepository: 'userL/example', timestamp: ts() }); // ONE PR: deduped to one card
  };
  const attachment = (kind, toolUseID) => {
    const a = kind === 'hook_blocking_error' ? { type: 'hook_blocking_error', hookName: 'Stop', toolUseID, hookEvent: 'Stop', blockingError: { blockingError: prose(irange(200, 900)), command: 'node vibespace-hook.mjs stop' } }
      : kind === 'output_style' ? { type: 'output_style', text: prose(irange(60, 200)) }
      : kind === 'total_tokens_reminder' ? { type: 'total_tokens_reminder', text: prose(49) }
      : kind === 'batching_reminder_sent' ? { type: 'batching_reminder_sent', text: prose(126), model: 'claude-fable-5-1', clearAt: 'next_user_message' }
      : kind === 'task_reminder' ? { type: 'task_reminder', text: prose(irange(80, 400)) }
      : kind === 'hook_additional_context' ? { type: 'hook_additional_context', content: [prose(irange(500, 2500))], hookName: 'UserPromptSubmit', toolUseID: 'UserPromptSubmit', hookEvent: 'UserPromptSubmit' }
      : { type: 'silent_turn_reminder', text: prose(96) };
    push({ ...base(), type: 'attachment', attachment: a, uuid: uuid(), timestamp: ts(), rendered: [{ content: prose(irange(40, 200)) }] });
  };
  // the registered tail's mix (last 32 MiB): total_tokens_reminder 1169, batching_reminder_sent 1080, hook_additional_context 158
  // (one per prompt, below), silent_turn_reminder 140, hook_blocking_error 70 (per turn, below), output_style 45 — and NO hook_success
  const ATTACH = [[0.45, 'total_tokens_reminder'], [0.42, 'batching_reminder_sent'], [0.06, 'silent_turn_reminder'], [0.04, 'task_reminder'], [0.03, 'output_style']];
  let turn = 0, images = 0;
  while (bytes < HUGE_TARGET_BYTES) {
    turn++;
    const dense = bytes > HUGE_TARGET_BYTES - 700 * 1024; // the recent end: the last ~700 KB
    // the prompt (a string, like the CLI writes it; every ~700 lines one carries an image)
    const withImage = lines > 0 && Math.floor(lines / 700) > images;
    if (withImage) { images++; push({ ...base(), type: 'user', promptId: uuid(), message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGES[images % 2] } }, { type: 'text', text: prose(irange(30, 200)) }] }, uuid: uuid(), timestamp: ts(), permissionMode: 'bypassPermissions', promptSource: 'sdk' }); }
    else push({ ...base(), type: 'user', promptId: uuid(), message: { role: 'user', content: prose(sizeOf(PROMPT)) }, uuid: uuid(), timestamp: ts() });
    bookkeeping();
    for (let q = 0; q < irange(1, 2); q++) push({ type: 'queue-operation', operation: 'enqueue', timestamp: ts(), sessionId: SID3 });
    if (rnd() < (dense ? 0.9 : 0.5)) attachment('hook_additional_context', 'UserPromptSubmit'); // a "✓ Hook context" card (158 per 181 prompts in the tail)
    const steps = irange(...pick(dense ? STEPS_DENSE : STEPS_DEEP));
    for (let i = 0; i < steps; i++) {
      const mid = `msg_${n}`, tid = `toolu_${n}`;
      if (rnd() < 0.73) asst([{ type: 'thinking', thinking: rnd() < 0.02 ? prose(irange(256, 4000)) : '', signature: 'x'.repeat(1448) }], mid);
      const tool = pick([[0.97, 'Bash'], [0.02, 'Workflow'], [0.005, 'Read'], [0.005, 'Write']]);
      const input = tool === 'Bash' ? { command: prose(irange(20, 600)).replace(/\n/g, ' '), description: prose(40) } : tool === 'Workflow' ? { scriptPath: '/tmp/wf.js' } : { file_path: '/tmp/x.txt' };
      asst([{ type: 'tool_use', id: tid, name: tool, input }], mid);
      const size = sizeOf(TOOL_RESULT);
      const content = (withImage && i === 0 && rnd() < 0.5) ? [{ type: 'text', text: toolOut(size) }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGES[(images + 1) % 2] } }] : toolOut(size);
      push({ ...base(), type: 'user', promptId: uuid(), message: { role: 'user', content: [{ tool_use_id: tid, type: 'tool_result', content, is_error: rnd() < 0.03 }] }, uuid: uuid(), timestamp: ts(), toolUseResult: { stdout: typeof content === 'string' ? content.slice(0, 2000) : '', stderr: '', interrupted: false, isImage: false } });
      for (let k = 0, m = irange(1, 3); k < m; k++) attachment(pick(ATTACH), tid);
      if (rnd() < (dense ? 0.12 : 0.03)) asst([{ type: 'text', text: prose(sizeOf(TEXT)) }], `msg_${n}`); // a status line mid-turn (a run breaker; the tail's runs average 5.6 cards)
      if (i > 0 && i % 6 === 0) bookkeeping();
    }
    asst([{ type: 'text', text: prose(sizeOf(TEXT)) }], `msg_${n}`);
    if (rnd() < 0.35) attachment('hook_blocking_error', uuid()); // a Stop-hook notice (70 per 181 prompts)
    if (rnd() < 0.75) push({ ...base(), type: 'system', subtype: 'stop_hook_summary', hookCount: 2, hookInfos: [{ command: 'node vibespace-hook.mjs stop', durationMs: irange(20, 400) }, { command: 'node hook.mjs stop', durationMs: irange(5, 60) }], hookErrors: [], hookAdditionalContext: [], preventedContinuation: false, stopReason: '', hasOutput: false, level: 'suggestion', timestamp: ts(), uuid: uuid(), toolUseID: uuid() });
    if (rnd() < 0.32) push({ ...base(), type: 'attachment', attachment: { type: 'queued_command', prompt: [{ type: 'text', text: prose(irange(40, 400)) }], source_uuid: uuid(), commandMode: 'prompt', timestamp: ts() }, uuid: uuid(), timestamp: ts() }); // a mid-turn message (a peer card)
    if (rnd() < 0.03) push({ ...base(), type: 'system', subtype: 'api_error', level: 'error', error: { message: 'overloaded', status: 529, requestId: `req_${n}`, formatted: '529 Overloaded' }, retryInMs: 500, retryAttempt: 1, maxRetries: 10, source: 'request_retry', timestamp: ts(), uuid: uuid() });
    bookkeeping();
  }
  await new Promise((r) => out.end(r));
  const st = fs.statSync(path.join(PROJ, `${SID3}.jsonl`));
  console.log(`  huge fixture: ${lines} lines, ${turn} turns, ${images} images, ${(st.size / 1048576).toFixed(1)} MB (${((st.size / lines) / 1024).toFixed(2)} KB/line) in ${Date.now() - t0} ms`);
}

// ── 2. throwaway server + chrome ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
// UNMINIFIED bundle for the worktree: scrollTop-write stacks must carry real
// function names so each jump can be attributed to its exact call site.
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1920,1000', // the owner's width (1920×963): a compact row's wrap width decides the px per card, which is what the §1c shape is about
  '--disable-background-timer-throttling', `--user-data-dir=${scratch('chatpage-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [scratch('chatpage-chrome'), fakeHome, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
// SIGNALS TOO (2026-09-09): 'exit' does not fire for a default-terminated
// SIGINT/SIGTERM, which is how a Ctrl-C or a runner timeout ends this suite —
// the exact case that left a 42 MB fixture behind for the production instance
// to ingest. The fixture lives under an isolated home now, so a missed cleanup
// is only disk; the handlers keep it from being disk FOREVER.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); }
  catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { console.log('[pageEX]', m.params.exceptionDetails?.exception?.description?.slice(0, 250)); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(400); }
await sleep(1500);

// ── 3. open the view-only chat + install the drift recorder ──
const opened = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID}', '${CWD}', 'paging test');
  for (let i = 0; i < 50; i++) {
    const list = document.querySelector('.chat-message-list');
    if (list && list.querySelectorAll('.chat-msg').length > 10) break;
    await sleep(300);
  }
  const list = document.querySelector('.chat-message-list');
  if (!list) return { ok: false };
  await sleep(1200); // initial render + fold settle
  // drift recorder: per-frame topmost-visible element + its viewport offset
  window.__rec = []; window.__marks = []; window.__stWrites = [];
  // forensic interceptor: EVERY programmatic scrollTop write with its caller
  {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(list, 'scrollTop', {
      get() { return desc.get.call(this); },
      set(v) {
        const from = desc.get.call(this);
        const stack = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 5).map((l) => l.trim()).join(' | ');
        window.__stWrites.push({ t: performance.now(), from: Math.round(from), to: Math.round(v), by: window.__scripted ? 'SCRIPT' : stack.slice(0, 160) });
        desc.set.call(this, v);
      },
    });
  }
  const tick = () => {
    const st = list.scrollTop;
    let el = null;
    for (const c of list.children) { if (c.offsetHeight > 0 && c.offsetTop + c.offsetHeight > st) { el = c; break; } }
    window.__rec.push({ t: performance.now(), id: el ? (el.dataset.msgId || el.className.slice(0, 20)) : null, top: el ? el.offsetTop - st : 0, st, sh: list.scrollHeight });
    window.__rafId = requestAnimationFrame(tick);
  };
  tick();
  window.__list = list;
  return { ok: true, n: list.querySelectorAll('.chat-msg').length, sh: list.scrollHeight, st: list.scrollTop };
})()`);
check('view-only chat opened with messages', opened?.ok && opened.n > 10, JSON.stringify(opened));

// one paging step: mark, set scrollTop, wait for loads/folds to settle
const step = async (dir, px, waitMs) => await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const list = window.__list;
  const before = list.scrollTop;
  const target = ${dir === 'up' ? `Math.max(0, before - ${px})` : `Math.min(list.scrollHeight, before + ${px})`};
  window.__marks.push({ t: performance.now(), set: target, before });
  window.__scripted = true; list.scrollTop = target; window.__scripted = false;
  list.dispatchEvent(new Event('scroll'));
  await sleep(${waitMs});
  return { set: target, settled: list.scrollTop, sh: list.scrollHeight };
})()`);

// wheel-like cadence (small fast ticks) interleaved with big flicks, both ways
const stepsUp = [];
for (let i = 0; i < 90; i++) stepsUp.push(await step('up', i % 9 === 8 ? 1400 : 260, i % 9 === 8 ? 700 : 130));
await sleep(1200);
const stepsDown = [];
for (let i = 0; i < 90; i++) stepsDown.push(await step('down', i % 9 === 8 ? 1400 : 260, i % 9 === 8 ? 700 : 130));

// ── 4. analyze: per-frame anchor displacement between scripted marks ──
const analysis = await evaljs(`(() => {
  cancelAnimationFrame(window.__rafId);
  const rec = window.__rec, marks = window.__marks.map((m) => m.t);
  const jumps = [];
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i];
    // exclude ONLY the frame pair spanning our own scrollTop write — the
    // earlier ±120ms window swallowed the async load mutations we must watch
    const spansMark = marks.some((mt) => mt >= a.t && mt <= b.t);
    if (spansMark) continue;
    if (a.id && b.id && a.id === b.id && Math.abs(b.top - a.top) > 60) {
      jumps.push({ kind: 'anchor-shift', id: b.id, from: Math.round(a.top), to: Math.round(b.top), st: Math.round(b.st), t: Math.round(b.t) });
    } else if (a.id && b.id && a.id !== b.id && Math.abs(b.st - a.st) > 400) {
      jumps.push({ kind: 'scroll-teleport', dst: Math.round(b.st - a.st), st: Math.round(b.st), t: Math.round(b.t) });
    }
  }
  // attribute: for each jump, the non-script scrollTop writes within ±400ms
  const writes = window.__stWrites;
  for (const j of jumps) {
    j.writes = writes.filter((w) => w.by !== 'SCRIPT' && Math.abs(w.t - j.t) < 400)
      .map((w) => ({ d: Math.round(w.to - w.from), by: w.by, t: Math.round(w.t) })).slice(0, 6);
  }
  return { frames: rec.length, jumps: jumps.slice(0, 14), jumpCount: jumps.length };
})()`);

console.log(`  frames=${analysis.frames} scripted steps=${stepsUp.length + stepsDown.length}`);
if (analysis.jumps.length) console.log('  jumps:', JSON.stringify(analysis.jumps, null, 1).slice(0, 6000));
// settled-vs-set drift on each step (loads may legitimately grow scrollHeight;
// what must NOT happen is the viewport landing far from where the user was)
check('no anchor-shift/teleport jumps while paging', analysis.jumpCount === 0, `${analysis.jumpCount} jumps`);

// ── 4b. THE FOLD-DOMINATED WINDOW (inc-mub8xwrb-z57x, 2.369.129) ─────────────
// The owner paged up through a session of thousands of consecutive tool calls:
// each 50-record extend added a few hundred px, the 600 bound trimmed the bottom
// (the only content on screen), the height collapsed to one viewport and
// scrollTop clamped to 0 — "跳到上面一页的最顶部，跳过了中间内容", 15 extend/trim
// cycles in 25 s and a frozen browser. Now: NO trim while the window is shorter
// than two viewports, and one wheel notch GROWS the window until it is.
console.log('§4b fold-dominated: one wheel notch = one landing on a full viewport; the bottom is never trimmed while short; the reader never lands on the top of a slab they did not ask for');
const fold = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID2}', '${CWD}', 'fold test');
  let v = null;
  for (let i = 0; i < 60; i++) {
    const w = [...window.app.wm.windows.values()].find((w) => String(w.title || '').includes('fold test'));
    v = (w && window.app.sessions.get(w.id)) || null;
    if (v && v._messageList && v._messageList.querySelectorAll('.chat-msg').length > 10) break;
    await sleep(300);
  }
  if (!v) return { ok: false };
  await sleep(1500); // initial render + fold settle
  const list = v._messageList;
  const ch = list.clientHeight;
  const out = { ok: true, ws0: v._windowStart, ch, rendered0: list.querySelectorAll('.chat-msg').length, sh0: list.scrollHeight, notches: [] };
  for (let k = 0; k < 6; k++) {
    if (v._windowStart <= 0) break;
    const mark = (v._traceRing || []).length;
    list.scrollTop = 0;
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    await sleep(2600);
    const tail = (v._traceRing || []).slice(mark);
    out.notches.push({ extends: tail.filter((e) => e.tag === 'extendTop:done').length, grown: tail.some((e) => e.tag === 'extendTop:grown'), trimBottom: tail.filter((e) => e.tag === 'trimBottom').length, foldCeiling: tail.filter((e) => e.tag === 'foldCeiling').length, st: Math.round(list.scrollTop), sh: list.scrollHeight, ws: v._windowStart, rendered: list.querySelectorAll('.chat-msg').length });
  }
  return out;
})()`);
console.log('  fold:', JSON.stringify(fold).slice(0, 900));
check('the fold-dominated view-only chat opened and paged at least twice', !!fold?.ok && fold.notches.length >= 2, JSON.stringify(fold));
if (fold?.ok) {
  const N = fold.notches, ch = fold.ch;
  check(`every notch that still has history above leaves the window ≥ 2 viewports tall (grow by HEIGHT) — (${N.map((n) => n.sh + '/' + n.ws).join(' ')})`, N.every((n) => n.ws === 0 || n.sh >= 2 * ch), N);
  check('the first notch needed more than one slab (the fold makes 50 records a few hundred px) and fired ONE grown landing', N[0].extends > 1 && N[0].grown === true && N[0].extends <= 8, N[0]);
  check('the bottom is never trimmed while the window is short (a trim there removes the content on screen)', N.every((n) => n.trimBottom === 0 || n.sh >= 2 * ch), N);
  check(`the reader never lands on the very top with history still above (the incident\'s "跳到最顶部") — st per notch: ${N.map((n) => n.st).join(' ')}`, N.every((n) => n.ws === 0 || n.st > 0), N);
  check('no fold ceiling was hit in six notches (the ceiling is the bound, not the routine)', N.every((n) => n.foldCeiling === 0), N);
}

// ── 4c. THE HUGE COMPACT-MODE SESSION (inc-mubvu3a4-x8sb, 2026-09-21, owner on
// 2.369.136: "没有办法正确翻页，每次都往回跳转很多，往下又直接跳到底部，还有大量空白").
// The §1c fixture, opened view-only with the live window's content-visibility
// emulated, the list asked to the owner's 790 px (the 1000 px headless workspace yields ~714 — the run prints it), driven by REAL CDP wheel
// gestures at the owner's cadences (one notch / six notches / a 4×700 px
// trackpad fling / a 4 s hold), up then down, the scroll-to-bottom button, up
// again — the same rows scripts/dbg-huge-paging.mjs prints on a copy of the real
// transcript. The per-gesture rules live in scripts/paging-gesture-rules.mjs.
// The reproduction (g1, on the real copy): one 120 px notch walked the window
// 750 messages back and landed on the top of the slab (`trimBottom n:400
// removed:250 sh:2851 sh2:972`, `anchorLost {why:removed}`, `extendTop:done
// anchored:false st:0`, eight grow passes); the first down-fling re-pinned at
// `we 1851 of 3201` and the pinned chain walked to the tail. THE CONTROL below
// re-derives those numbers from a scratch copy with the fix's two rules
// patched out — a leg that cannot go red proves nothing.
console.log('§4c huge compact-mode session: no jump back > 1.5 viewports, no pin / bottom landing before the window reaches the tail, no blank > 25 %, the ring never empty after a page');
const LIST_H = 790;
const CADENCE = { slow: { notches: 1, deltaY: 120, gap: 0, settle: 1500 }, mid: { notches: 6, deltaY: 120, gap: 70, settle: 1500 }, fast: { notches: 4, deltaY: 700, gap: 30, settle: 2000 }, hold: { notches: 40, deltaY: 300, gap: 100, settle: 2400 } };
const OPEN_HUGE = (sid, cwd, title) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession(${JSON.stringify(sid)}, ${JSON.stringify(cwd)}, ${JSON.stringify(title)});
  let v = null, w = null, n = 0, armed = false;
  for (let i = 0; i < 300; i++) {
    // by the view's OWN id — the sidebar renames the window by the first-user-message rule
    const hit = [...window.app.sessions.entries()].find(([, cv]) => cv && cv.sessionId === 'view-' + ${JSON.stringify(sid)});
    v = hit ? hit[1] : null; w = hit ? window.app.wm.windows.get(hit[0]) : null;
    n = v && v._messageList ? v._messageList.querySelectorAll('.chat-msg').length : 0;
    armed = !!(v && v._gapMinimapActive);
    if (n > 10 && armed) break;
    if (n > 10 && i > 100) break;
    await sleep(400);
  }
  if (!v || n <= 10) return { ok: false, n, armed, total: v ? v._total : null };
  const ws = document.getElementById('workspace') || document.querySelector('.workspace');
  const wr = ws.getBoundingClientRect();
  const el = w.element; el.style.left = '0px'; el.style.top = '0px'; el.style.width = wr.width + 'px'; el.style.height = wr.height + 'px';
  if (w.onResize) try { w.onResize(); } catch {}
  await sleep(300);
  const list = v._messageList;
  const d = list.clientHeight - ${LIST_H};
  if (d > 0) { el.style.height = (wr.height - d) + 'px'; if (w.onResize) try { w.onResize(); } catch {} }
  await sleep(300);
  // the LIVE window's content-visibility (a read-only viewer runs with it off)
  v._readOnly = false; v._container.classList.remove('chat-no-content-visibility');
  await sleep(2500); // initial render + fold + attach fill settle
  window.__v = v; window.__list = list;
  const r = list.getBoundingClientRect();
  return { ok: true, armed, n: list.querySelectorAll('.chat-msg').length, ch: list.clientHeight, sh: list.scrollHeight, st: list.scrollTop, ws: v._windowStart, we: v._windowEnd, total: v._total, gap: v._gapBounds, cv: !v._container.classList.contains('chat-no-content-visibility'), compact: v._container.classList.contains('chat-compact'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
})()`;
const runGestures = async (plan, label) => {
  const opened = await evaljs(OPEN_HUGE(SID3, CWD, 'huge test ' + label));
  console.log(`  [${label}] opened:`, JSON.stringify(opened));
  if (!opened?.ok) return { opened, rows: [] };
  const rect = opened.rect;
  const cx = Math.round(rect.x + rect.w / 2), cy = Math.round(rect.y + rect.h / 2);
  const snap = (topIdBefore = null, topOffBefore = 0) => evaljs(`(${SNAP_SOURCE})(${JSON.stringify(topIdBefore)}, ${topOffBefore})`);
  // by SEQ, never by index: the ring splices 600→400 mid-run and an index mark taken before the splice reads nothing after it (verifier r1)
  const ringSince = (mark) => evaljs(RING_SINCE_SOURCE(mark));
  const rows = [];
  for (const [name, dir, speed] of plan) {
    if (dir === 'jump') {
      // a SETUP step, not a judged gesture: the minimap's own jump (jumpToIndex) to a
      // message index — used to reach the start of the registered tail cheaply
      const before = await snap(); const mark = before.ringSeq;
      await evaljs(`(async () => { await window.__v.jumpToIndex(${Number(speed) || 0}); return true; })()`);
      await sleep(2500);
      const after = await snap(); const ring = await ringSince(mark);
      console.log(`    ${name.padEnd(14)} jump → idx ${speed}: st ${before.st}→${after.st} ws ${before.ws}→${after.ws} we ${before.we}→${after.we} pin ${before.pin}→${after.pin} gapAbove=${after.gapAbove} gapCursor=${after.gapCursor} ring=${ring.length}`);
      continue;
    }
    if (dir === 'btn') {
      const before = await snap(); const mark = before.ringSeq;
      await evaljs(`(() => { const b = window.__v._scrollBtn; if (b) b.click(); return !!b; })()`);
      await sleep(2500);
      const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
      const row = { name, dir, wheelPx: 0, before, after, ring }; row.verdict = judgeGesture(row); rows.push(row);
      console.log('    ' + formatGesture(row, row.verdict));
      continue;
    }
    const c = CADENCE[speed];
    const before = await snap(); const mark = before.ringSeq;
    // over a PLAIN point of the viewport (never a card's own scroll box — that box would take the notches)
    const pt = (await evaljs(WHEEL_POINT_SOURCE(dir, c.notches * c.deltaY))) || { x: cx, y: cy, moved: 0 };
    for (let i = 0; i < c.notches; i++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: dir === 'up' ? -c.deltaY : c.deltaY });
      if (c.gap) await sleep(c.gap);
    }
    await sleep(c.settle);
    const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
    const row = { name, dir, speed, wheelPx: c.notches * c.deltaY * (dir === 'up' ? -1 : 1), before, after, ring, pointerMoved: pt.moved ? 1 : 0, wheelFallback: pt.fallback ? 1 : 0, pt };
    row.verdict = judgeGesture(row); rows.push(row);
    const tags = {}; for (const e of ring) tags[e.tag] = (tags[e.tag] || 0) + 1;
    console.log('    ' + formatGesture(row, row.verdict) + (row.pointerMoved ? '  [pointer moved off a nested scroller]' : '') + (row.wheelFallback ? `  [NO plain point: wheel at the centre over ${pt.under || '?'} — ⑤ not judged; ${pt.boxes} scroll boxes in the list]` : '') + (row.verdict.ok || row.wheelFallback ? '' : `  [wheel at ${pt.x},${pt.y} over ${pt.under || '?'}; scroll boxes in the list: ${pt.boxes ?? '?'}]`) + '  ring: ' + Object.entries(tags).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join(' '));
  }
  return { opened, rows };
};
const PLAN = [['up-slow-1', 'up', 'slow'], ['up-slow-2', 'up', 'slow'], ['up-slow-3', 'up', 'slow'], ['up-mid-1', 'up', 'mid'], ['up-mid-2', 'up', 'mid'], ['up-fast-1', 'up', 'fast'], ['up-fast-2', 'up', 'fast'], ['up-fast-3', 'up', 'fast'], ['up-hold', 'up', 'hold'],
  ['down-slow-1', 'down', 'slow'], ['down-slow-2', 'down', 'slow'], ['down-mid-1', 'down', 'mid'], ['down-mid-2', 'down', 'mid'], ['down-fast-1', 'down', 'fast'], ['down-fast-2', 'down', 'fast'], ['down-fast-3', 'down', 'fast'], ['down-hold', 'down', 'hold'],
  ['scroll-btn', 'btn', '-'], ['up2-slow-1', 'up', 'slow'], ['up2-slow-2', 'up', 'slow'], ['up2-mid-1', 'up', 'mid'],
  // THE GAP SLAB (verifier r1: the first plan never left the registered tail, so a wheel absorbed inside a
  // loaded gap slab — both directions, a 2,800 px fling moving the card < 110 px — was invisible): a minimap
  // jump to message 0 of the tail, holds up into the seek gap (2,000-line slabs), mid-list gestures INSIDE
  // the slab both ways, then holds back down through the tail (the slab must be dropped when the window
  // leaves message 0, never left above newer cards), and one notch up from there.
  ['gap-jump', 'jump', 0], ['gap-up-hold-1', 'up', 'hold'], ['gap-up-hold-2', 'up', 'hold'],
  ['gap-down-mid-1', 'down', 'mid'], ['gap-down-mid-2', 'down', 'mid'], ['gap-down-fast-1', 'down', 'fast'],
  ['gap-up-mid-1', 'up', 'mid'], ['gap-up-mid-2', 'up', 'mid'], ['gap-up-fast-1', 'up', 'fast'],
  ['gap-down-hold-1', 'down', 'hold'], ['gap-down-hold-2', 'down', 'hold'], ['gap-down-hold-3', 'down', 'hold'], ['gap-tail-up-slow-1', 'up', 'slow']];
const huge = await runGestures(PLAN, 'fix');
check('the huge fixture opened view-only with the whole-file turn map armed (the seek sentinel installed = the owner\'s tail-mode paging), content-visibility on, compact mode', huge.opened?.ok && huge.opened.armed && huge.opened.cv && huge.opened.compact, JSON.stringify(huge.opened));
if (huge.opened?.ok) {
  const R = huge.rows, ch = huge.opened.ch;
  const paged = R.filter((r) => r.verdict.paged).length;
  const cal = R.map((r) => r.after).filter((a) => a.rendered >= 100).map((a) => (a.sh / a.rendered).toFixed(1));
  console.log(`  list ${ch} px, tail ${huge.opened.total} messages over ${huge.opened.gap?.tailStartLine}..${huge.opened.gap?.totalLines} lines; ${paged} of ${R.length} gestures paged; px per rendered card at ≥100 cards: ${cal.join(' ')} (the owner's window: 150 cards ≈ 972 px = 6.5)`);
  check(`the legs are non-vacuous: at least 10 gestures paged the window (${paged})`, paged >= 10);
  check('the trace ring is non-empty after the first gesture (the seek/extend path leaves evidence)', R[0].ring.length > 0, JSON.stringify(R[0].ring.slice(0, 3)));
  const bad = (pred) => R.filter((r) => r.verdict.reasons.some(pred));
  const jumps = bad((x) => /further|gone from the DOM|pageUp band/.test(x));
  check(`① no jump back > ${JUMP_SLACK_VIEWPORTS} viewports on any gesture (the reader's card stays where the wheel put it; a notch never lands inside the ${PAGE_UP_BAND_PX} px pageUp band with history — window OR gap — above)`, jumps.length === 0, jumps.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  const teleports = bad((x) => /pinned with the window|DOM's bottom|teleported to the tail/.test(x));
  check('② no pin and no bottom landing before the window reaches the live tail (the DOM edge is a paging boundary, not a pin)', teleports.length === 0, teleports.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  const blanks = bad((x) => /blank|empty below/.test(x));
  check('③ no blank over 25 % of the viewport after any gesture', blanks.length === 0, blanks.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  const evidence = bad((x) => /recorded nothing/.test(x));
  check('④ every gesture that paged left evidence in the ring', evidence.length === 0, evidence.map((r) => r.name).join(' '));
  const dead = bad((x) => /moved the reader's card only/.test(x));
  check(`⑤ no dead wheel: every mid-list gesture (no edge, no page) moved the reader's card by ≥ ${Math.round(DELIVERY_MIN_FRACTION * 100)} % of the wheel — inside the gap slab too`, dead.length === 0, dead.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  // the gap legs are NON-VACUOUS: a slab loaded, and gestures ran INSIDE it without paging
  const gapRows = R.filter((r) => r.name.startsWith('gap-'));
  const slabLoaded = gapRows.some((r) => r.ring.some((e) => e.tag === 'gapUp:done'));
  const inSlab = gapRows.filter((r) => r.before.gapCards > 0 && r.after.gapCards > 0 && !r.verdict.paged && (r.dir === 'up' || r.dir === 'down'));
  check(`the gap legs reached the seek slab (gapUp:done in the ring) and ${inSlab.length} gestures ran INSIDE it without paging (≥ 3: ${inSlab.map((r) => r.name).join(' ')})`, slabLoaded && inSlab.length >= 3, JSON.stringify(gapRows.map((r) => [r.name, r.before.gapCards, r.after.gapCards, r.verdict.paged])));
  // a gap slab lives only directly above message 0: never beside a window that left it, never below a tail card
  const stale = R.filter((r) => !r.after.tp && r.after.ws > 0 && r.after.gapCards > 0);
  check('a gap slab never survives the window leaving message 0 (dropped by the top trim; the walk back to the tail leaves no ancient cards above the fresh slab)', stale.length === 0, stale.map((r) => `${r.name}: ws ${r.after.ws} gapCards ${r.after.gapCards}`).join('; '));
  const misordered = R.filter((r) => r.after.gapBelowTail === 1);
  check('a gap card is never BELOW the first tail card (the fresh tail slab lands below the gap history, never above it)', misordered.length === 0, misordered.map((r) => r.name).join(' '));
  check('the top trim dropped the slab when the window left message 0 (gapDrop traced on the way back to the tail)', R.some((r) => r.ring.some((e) => e.tag === 'gapDrop')), JSON.stringify(R.filter((r) => r.name.startsWith('gap-down-hold')).map((r) => [r.name, r.after.ws, r.after.gapCards])));
  // heights keep settling after a landing (images, fonts, late layout): the anchor hides it from the reader — print the drift so a regression in the ANCHOR is visible
  const drift = R.filter((r) => !r.verdict.paged && (r.dir === 'up' || r.dir === 'down')).map((r) => ({ name: r.name, dsh: r.after.sh - r.before.sh }));
  const maxDrift = drift.reduce((m, d) => Math.max(m, Math.abs(d.dsh)), 0);
  console.log(`  wheel dispatched off the centre line (a card's own scroll box was under it): ${R.filter((r) => r.pointerMoved).length} of ${R.length} gestures; no plain point at all (⑤ not judged): ${R.filter((r) => r.wheelFallback).length}`);
  check('the gap legs found a plain point to wheel over for at least 4 of the mid-slab gestures (⑤ was judged there, not skipped)', inSlab.filter((r) => !r.wheelFallback).length >= 4, JSON.stringify(inSlab.map((r) => [r.name, r.wheelFallback])));
  console.log(`  max |Δsh| on a NON-paging gesture: ${maxDrift} px (${drift.filter((d) => Math.abs(d.dsh) === maxDrift).map((d) => d.name).join(' ') || '-'}; the reserve resolves placeholders once at insert, later drift is absorbed by the anchor)`);
  const allTags = R.flatMap((r) => r.ring);
  check('the count trim never ran: no anchorLost {why:removed}, no extendTop landing anchored:false at scrollTop 0', !allTags.some((e) => e.tag === 'anchorLost' && e.why === 'removed') && !allTags.some((e) => e.tag === 'extendTop:done' && !e.anchored && e.st === 0), JSON.stringify(allTags.filter((e) => e.tag === 'anchorLost').slice(0, 3)));
  check('the pinned auto-follow never ran mid-history: no repin with we < total, no pageDown with pin:1 while the window was partial', !allTags.some((e) => e.tag === 'repin' && e.we < e.total) && !allTags.some((e) => e.tag === 'pageDown' && e.pin === 1 && e.we < e.total), JSON.stringify(allTags.filter((e) => e.tag === 'repin').slice(0, 3)));
  check('the scroll-to-bottom button returns to the live tail and pins there', (() => { const b = R.find((r) => r.dir === 'btn'); return b && b.after.we >= b.after.total && b.after.pin === 1; })(), JSON.stringify(R.find((r) => r.dir === 'btn')?.after));
  const grown = allTags.filter((e) => e.tag === 'extendTop:grown').map((e) => e.passes);
  console.log(`  grow passes per landing: ${grown.join(' ') || '(single-pass landings only)'}; trims: ${allTags.filter((e) => e.tag === 'trimBottom').length} bottom / ${allTags.filter((e) => e.tag === 'trimTop').length} top / ${allTags.filter((e) => e.tag === 'trimSkipZone').length} zone-skips; carried notches: ${allTags.filter((e) => e.tag === 'wheelCarry').length}`);
}

// ── 4d. THE PRE-FIX CONTROL: the same fixture and gestures on a scratch copy of
// the client whose two rules are patched out — the trim's keep zone (back to
// BY COUNT) and the pin predicate's `windowEnd ≥ total` term. The control must
// REPRODUCE the incident's numbers (a jump back on an upward gesture, a pin or
// bottom landing mid-history on a downward one); a control that passes the
// legs means the legs test nothing. The patch is by exact strings, so a
// refactor of the fix fails here loudly instead of silently unpatching.
console.log('§4d pre-fix control: the same legs on a copy with the keep zone and the pin predicate patched out must reproduce the incident');
{
  const CONTROL_PATCHES = [
    // the trims back to BY COUNT (the zone break removed on both edges)
    ["if (n >= must && pos[i].top < zone.bottom) break;", "/* control: by count */"],
    ["if (n >= must && pos[i].bottom > zone.top) break;", "/* control: by count */"],
    // the grow rule back to the WHOLE window's height (2.369.129) — what let a count trim's collapsed remainder refill and trim again
    ["const short = above < this._messageList.clientHeight;", "const short = this._messageList.scrollHeight < this._messageList.clientHeight * 2;"],
    // the anchor back to the list's first child at the top edge (the seek sentinel in a huge session)
    ["const skip = (c) => runChrome(c) || c._isSeekSentinel;", "const skip = (c) => runChrome(c);"],
    // the pin predicate without windowEnd ≥ total
    ["return !this._teleported && this._windowEnd >= this._total && scrollHeight - scrollTop - clientHeight < 50;", "return !this._teleported && scrollHeight - scrollTop - clientHeight < 50;"],
    // r1's overshoot carry off (the layered-guard rule: a new layer is stripped from the older layer's control —
    // a crossing wheel-down now pages the DOM edge from the wheel handler before the mid-history pin can stick,
    // which masked ② on the control), back to the edge-only carry the g2 control went red with
    ["if (e.deltaY < 0 && (roomUp < 10 || px > roomUp)) {", "if (e.deltaY < 0 && roomUp < 10) {"],
    ["&& (roomDown < 10 || px > roomDown)) {", "&& roomDown < 10) {"],
    ["  _addWheelCarry(dir, px) {", "  _addWheelCarry(dir, px) { px = Math.abs(px) + this._messageList.scrollTop; /* control: the whole notch, edge-only */"],
  ];
  const [CPORT] = await freePorts(1);
  const cwt = scratch('chatpage-control');
  try { execSync(`git worktree remove --force ${cwt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${cwt} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${cwt}/${f} && cp -r ${repo}/${f} ${cwt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(cwt, 'node_modules'));
  const cvPath = path.join(cwt, 'src/lib/chat-view.js');
  let src = fs.readFileSync(cvPath, 'utf8');
  let patched = 0;
  for (const [from, to] of CONTROL_PATCHES) { const k = src.split(from).length - 1; if (k === 1) { src = src.replace(from, to); patched++; } }
  check(`control setup: all ${CONTROL_PATCHES.length} patch anchors found exactly once in the fix (a control that cannot be built proves nothing)`, patched === CONTROL_PATCHES.length, `${patched} patched`);
  fs.writeFileSync(cvPath, src);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: cwt, stdio: 'ignore' });
  const csrv = spawn(process.execPath, ['server.js'], { cwd: cwt, env: { ...process.env, PORT: String(CPORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
  const prevCleanup = cleanup;
  const cleanupControl = () => { try { csrv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${cwt}`, { cwd: repo, stdio: 'ignore' }); } catch {} };
  process.on('exit', cleanupControl);
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${CPORT}/api/home`); break; } catch { await sleep(250); } }
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${CPORT}/` });
  for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(400); }
  await sleep(1500);
  const CONTROL_PLAN = [['up-slow-1', 'up', 'slow'], ['up-slow-2', 'up', 'slow'], ['up-mid-1', 'up', 'mid'], ['up-mid-2', 'up', 'mid'], ['up-fast-1', 'up', 'fast'], ['up-fast-2', 'up', 'fast'],
    ['down-mid-1', 'down', 'mid'], ['down-mid-2', 'down', 'mid'], ['down-fast-1', 'down', 'fast'], ['down-fast-2', 'down', 'fast'], ['down-fast-3', 'down', 'fast'], ['down-fast-4', 'down', 'fast']];
  const ctl = await runGestures(CONTROL_PLAN, 'control');
  check('control: the fixture opened on the patched copy', ctl.opened?.ok && ctl.opened.armed, JSON.stringify(ctl.opened));
  if (ctl.opened?.ok) {
    const R = ctl.rows, allTags = R.flatMap((r) => r.ring);
    const jumps = R.filter((r) => r.dir === 'up' && r.verdict.reasons.some((x) => /further|gone from the DOM|pageUp band/.test(x)));
    const countTrims = allTags.filter((e) => e.tag === 'anchorLost' && e.why === 'removed').length + allTags.filter((e) => e.tag === 'extendTop:done' && !e.anchored && e.st === 0).length;
    check(`NEGATIVE CONTROL ①: with the trim back to BY COUNT an upward gesture JUMPS by the rules themselves (${jumps.length} of ${R.filter((r) => r.dir === 'up').length} up gestures violate; anchor-lost / st-0 landings in the ring: ${countTrims}) — the rule can go red`, jumps.length >= 1 && countTrims >= 1, R.filter((r) => r.dir === 'up').map((r) => r.name + ' dev=' + (r.after.topDev == null ? 'gone' : r.after.topDev - (-r.wheelPx)) + ' ws ' + r.before.ws + '→' + r.after.ws).join('\n    '));
    const teleports = R.filter((r) => r.dir === 'down' && r.verdict.reasons.some((x) => /pinned with the window|DOM's bottom|teleported to the tail/.test(x)));
    const midRepins = allTags.filter((e) => e.tag === 'repin' && e.we < e.total).length;
    check(`NEGATIVE CONTROL ②: without the windowEnd ≥ total term a downward gesture PINS / lands on the DOM's bottom mid-history by the rules themselves (${teleports.length} rows violate; repins with we < total in the ring: ${midRepins}) — the rule can go red`, teleports.length >= 1 && midRepins >= 1, R.filter((r) => r.dir === 'down').map((r) => r.name + ' pin ' + r.before.pin + '→' + r.after.pin + ' we ' + r.after.we + '/' + r.after.total).join('\n    '));
  }
  cleanupControl();
  process.off('exit', cleanupControl);
  void prevCleanup;
}

// ── 5. THE REAL HOME IS UNTOUCHED. Not "no new entry at all": this box runs
// many real sessions concurrently and a genuine project dir may appear
// mid-run. What must be impossible is a FIXTURE entry — anything this suite
// (or any suite sharing the convention) could have written. src/fixture-guard.js
// owns the predicate; the sweep suite runs the same one over the whole dir.
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new entr${added.length === 1 ? 'y' : 'ies'} from concurrent real sessions, 0 of them fixtures)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
  check('…and this suite\'s OWN project dir is not among them (it lives under the isolated home)',
    !after.some((d) => d.name === path.basename(PROJ)), path.basename(PROJ));
  check('the fixture really was written (the isolation did not just skip the work)',
    fs.existsSync(path.join(PROJ, `${SID}.jsonl`)) && fs.statSync(path.join(PROJ, `${SID}.jsonl`)).size > 30e6,
    path.join(PROJ, `${SID}.jsonl`));
}

ws.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);

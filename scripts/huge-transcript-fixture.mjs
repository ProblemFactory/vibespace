// THE HUGE COMPACT-MODE TRANSCRIPT GENERATOR — ONE implementation (2.369.150):
// factored out of scripts/test-chat-paging.mjs §1c so scripts/test-ax-budget.mjs
// measures the accessibility tree on EXACTLY the shape the paging suite pages
// (a second copy would be a twin that drifts). NOT a test-*.mjs on purpose: the
// tier census would demand a tier. The essay below is the §1c one, verbatim.
//
// THE HUGE COMPACT-MODE SESSION (inc-mubvu3a4-x8sb, 2026-09-21): a synthetic
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
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fixtureSid } from './scratch.mjs';

/** Writes the §1c-shaped transcript to `file` (a `<sid>.jsonl` under an ISOLATED
 *  home — never the real ~/.claude). `sid` must be a scratch.mjs fixtureSid();
 *  every record id is MINTED from the same family. Returns the stats the suites
 *  print. The default target (48 MB) is test-chat-paging's; a suite that only
 *  needs a rendered window above the 34 MB gap threshold passes less. */
export async function writeHugeTranscript({ file, sid, cwd, targetBytes = Number(process.env.VS_HUGE_FIXTURE_MB || 48) * 1048576 }) {
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
  const out = fs.createWriteStream(file);
  let bytes = 0, lines = 0, n = 0, t = Date.now() - 30 * 86400e3;
  const ts = () => new Date((t += 20e3)).toISOString();
  const uuid = () => fixtureSid((n++).toString(16)); // every record id is MINTED (test-fixture-isolation refuses a hand-spelled member of the family)
  const base = () => ({ parentUuid: null, isSidechain: false, userType: 'external', entrypoint: 'sdk-cli', cwd: cwd, sessionId: sid, version: '2.1.274', gitBranch: 'master', slug: 'huge-paging-fixture' });
  const push = (o) => { const l = JSON.stringify(o) + '\n'; bytes += Buffer.byteLength(l); lines++; out.write(l); };
  const usage = () => ({ input_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 90000, output_tokens: irange(10, 400), service_tier: 'standard' });
  const asst = (content, id) => push({ ...base(), type: 'assistant', message: { model: 'claude-fable-5-1', id, type: 'message', role: 'assistant', content, stop_reason: 'tool_use', usage: usage() }, requestId: `req_${n}`, uuid: uuid(), timestamp: ts() });
  const bookkeeping = () => {
    push({ type: 'last-prompt', lastPrompt: 'the last prompt', leafUuid: uuid(), sessionId: sid });
    push({ type: 'custom-title', customTitle: 'huge fixture', sessionId: sid });
    push({ type: 'agent-name', agentName: 'huge fixture', sessionId: sid });
    push({ type: 'mode', mode: 'normal', sessionId: sid });
    push({ type: 'permission-mode', permissionMode: 'bypassPermissions', sessionId: sid });
    push({ type: 'atis-latch', atis: '', sessionId: sid });
    push({ type: 'pr-link', sessionId: sid, prNumber: 7, prUrl: 'https://example.invalid/pr/7', prRepository: 'userL/example', timestamp: ts() }); // ONE PR: deduped to one card
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
  while (bytes < targetBytes) {
    turn++;
    const dense = bytes > targetBytes - 700 * 1024; // the recent end: the last ~700 KB
    // the prompt (a string, like the CLI writes it; every ~700 lines one carries an image)
    const withImage = lines > 0 && Math.floor(lines / 700) > images;
    if (withImage) { images++; push({ ...base(), type: 'user', promptId: uuid(), message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGES[images % 2] } }, { type: 'text', text: prose(irange(30, 200)) }] }, uuid: uuid(), timestamp: ts(), permissionMode: 'bypassPermissions', promptSource: 'sdk' }); }
    else push({ ...base(), type: 'user', promptId: uuid(), message: { role: 'user', content: prose(sizeOf(PROMPT)) }, uuid: uuid(), timestamp: ts() });
    bookkeeping();
    for (let q = 0; q < irange(1, 2); q++) push({ type: 'queue-operation', operation: 'enqueue', timestamp: ts(), sessionId: sid });
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
  const st = fs.statSync(file);
  return { lines, turns: turn, images, bytes: st.size, kbPerLine: (st.size / lines) / 1024, ms: Date.now() - t0 };
}

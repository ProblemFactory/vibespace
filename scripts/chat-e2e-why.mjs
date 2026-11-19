// WHY THE REAL TURN HAD NO REPLY (B-5a57, lane bl-scratch, 2026-11-17) — read by scripts/test-chat-e2e.mjs on a missing
// reply, its legs in scripts/test-ci-gate.mjs (a fast suite that runs everywhere; the real turn runs almost nowhere).
// The .391 push gate's one real haiku turn settled and billed with no reply frame and no API-error frame, and the suite kept
// the last three frames cut at 400 chars: the cause was lost (the account at its limit, the CI token expired, the pinned model
// no longer served). The ws frames never carry the CLI's result record — the hub turns an error result into a system message
// and always sends `{op:'meta', subtype:'turn_complete'}` — so the RECORD is read where the wrapper keeps it: the session's
// buffer file (<tree>/data/session-buffers/<sid>.buf — server.js BUFFERS_DIR — the CLI's stream-json lines). A limit is read in the product's own words
// (src/adapters/claude-code.js parseLimitBanner, «You've reached / hit your … limit») plus the API's (rate / usage limit,
// credit balance); the said text is masked for token shapes (never a model id) and bounded. NOT a test-*.mjs on purpose.
// B-5a57 cure (主开发 08:54Z): A SKIP IS NOT A GREEN AND ITS ROAD IS NARROW — skipVerdict skips only on THIS turn's own failure:
// its own frames (they name its session, from its prompt on), its own buffer's result record, the hub's api_error count (the
// suite's scratch hub runs this one session). Words in any other frame (a usage broadcast, another conversation, an earlier
// turn) never turn a break of the chat pipeline into a SKIP.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ClaudeCodeAdapter } = require('../src/adapters/claude-code.js');

const API_LIMIT = /rate.?limit|usage limit|limit reached|credit balance|"status":\s*429/i;
const AUTH = /invalid (?:api key|x-api-key|bearer)|oauth token (?:has )?expired|authentication_error|"status":\s*401|401 unauthorized|not logged in|please run \/login/i;
const MODEL = /not_found_error|"status":\s*404|model[^"\n]{0,60}(?:not found|does not exist|not available|is not supported|deprecated)/i;
const API = /overloaded|api error|"status":\s*5\d\d|internal server error/i;

/** Token shapes out (an Anthropic key / token, a long base64 run, an address); a model id stays readable. */
export function maskText(t) {
  return String(t ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<address>')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '<token>')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}/g, '<long>');
}

/** The class of a text: limit | auth | model | api | null. */
export function classOf(text) {
  const t = String(text || '');
  if (ClaudeCodeAdapter.parseLimitBanner(t) || API_LIMIT.test(t)) return 'limit';
  if (AUTH.test(t)) return 'auth';
  if (MODEL.test(t)) return 'model';
  if (API.test(t)) return 'api';
  return null;
}

/** THIS turn's own frames: those whose `sessionId` is the turn's session (a broadcast that names none — usage, state-sync —
 *  and another conversation's frame are never its own), from index `from` on (the frames before its prompt are an earlier turn's). */
export function turnFrames(frames = [], { sessionId = '', from = 0 } = {}) {
  const out = [];
  if (!sessionId) return out;
  for (let i = Math.max(0, from); i < frames.length; i++) { let o = null; try { o = JSON.parse(frames[i]); } catch { continue; } if (o && o.sessionId === sessionId) out.push(frames[i]); }
  return out;
}

const API_WORDS = /API Error|rate.?limit|overloaded|"status":\s*(?:429|529)|usage limit|credit balance/i;
/** SKIP or RED for a turn with no reply → { skip, kind, evidence, own, why }. A SKIP only on THIS turn's own limit or API failure:
 *  its own frames (turnFrames) or its own buffer's result record, read by whyNoReply, or the hub's api_error count. A bare
 *  is_error is no reason (a tool's failure carries one too). And when the turn's own result record says it SUCCEEDED (is_error
 *  false), the CLI answered: a reply that never reached the page is OUR break, a RED, whatever the hub counted (a retried 529, a
 *  background request) or a retry label said. */
export function skipVerdict({ frames = [], buffer = '', sessionId = '', from = 0, otelApiErrors = 0 } = {}) {
  const own = turnFrames(frames, { sessionId, from });
  const why = whyNoReply({ frames: own, buffer });
  const hit = own.find((s) => API_WORDS.test(s)) || null;
  const byClass = why.kind === 'limit' || why.kind === 'api';
  const answered = !!(why.result && why.result.is_error === false);
  const skip = !answered && !!(byClass || hit || Number(otelApiErrors) > 0);
  const evidence = answered ? 'the CLI\'s own result record says the turn succeeded — the reply was lost on our side' : byClass ? why.text : hit ? maskText(hit).slice(0, 220) : Number(otelApiErrors) > 0 ? `the hub counted ${Number(otelApiErrors)} api_error event(s)` : '';
  return { skip, kind: why.kind, evidence, own: own.length, why };
}

/** { kind, result, text, frames } — `frames` the suite's ws frames (strings), `buffer` the session's buffer text ('' if none).
 *  result = the LAST stream-json result record of the buffer: { subtype, is_error, num_turns } (null: none was written).
 *  text = the first error- / notice-shaped string that decided the class (else the result record's text), masked, ≤ 300. */
export function whyNoReply({ frames = [], buffer = '' } = {}) {
  let result = null, resultText = '';
  for (const line of String(buffer).split('\n')) {
    if (!line.includes('"result"')) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r && r.type === 'result') { result = { subtype: r.subtype ?? null, is_error: r.is_error ?? null, num_turns: r.num_turns ?? null }; resultText = typeof r.result === 'string' ? r.result : ''; }
  }
  const texts = [];
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 12) return;
    for (const [k, v] of Object.entries(o)) { if (typeof v === 'string') { if (v.trim() && /error|notice|text|message|reason|content/i.test(k)) texts.push(v); } else walk(v, d + 1); }
  };
  for (const f of frames) { try { const o = JSON.parse(f); if (o?.op !== 'meta' && o?.type !== 'meta') walk(o); } catch { } }
  if (resultText) texts.unshift(resultText);
  const said = texts.find((t) => classOf(t)) || resultText || texts[texts.length - 1] || '';
  return { kind: classOf(said) || 'none', result, text: maskText(said).slice(0, 300), frames: frames.length };
}

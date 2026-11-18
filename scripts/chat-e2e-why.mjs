// WHY THE REAL TURN HAD NO REPLY (B-5a57, lane bl-scratch, 2026-11-17) — read by scripts/test-chat-e2e.mjs on a missing
// reply, its legs in scripts/test-ci-gate.mjs (a fast suite that runs everywhere; the real turn runs almost nowhere).
// The .391 push gate's one real haiku turn settled and billed with no reply frame and no API-error frame, and the suite kept
// the last three frames cut at 400 chars: the cause was lost (the account at its limit, the CI token expired, the pinned model
// no longer served). The ws frames never carry the CLI's result record — the hub turns an error result into a system message
// and always sends `{op:'meta', subtype:'turn_complete'}` — so the RECORD is read where the wrapper keeps it: the session's
// buffer file (<tree>/data/session-buffers/<sid>.buf — server.js BUFFERS_DIR — the CLI's stream-json lines). A limit is read in the product's own words
// (src/adapters/claude-code.js parseLimitBanner, «You've reached / hit your … limit») plus the API's (rate / usage limit,
// credit balance); the said text is masked for token shapes (never a model id) and bounded. NOT a test-*.mjs on purpose.
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

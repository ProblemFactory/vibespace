'use strict';
// THE PROVIDER TEST'S RULES (lane lg-providers, B-d578 U4 — design q-045 §2.5 / D5, and the coordinator's five musts of
// 2026-11-17T23:24Z). PURE: imports only the provider record (PURE). The Test = the HARNESS ITSELF says one short word to
// the third party with that third party's own key, once, at a person's press — the hub builds no request (test-vendor-
// whitelist unchanged is the proof). A one-shot print-mode run is exactly the form that must NEVER meet a subscription
// sign-in (CLAUDE.md «Program-use billing», «§ban-safety»): these rules make that case impossible, not unlikely —
//   · addressVerdict: the record's address must be a THIRD PARTY's — empty, not http(s), or on a vendor's OWN hosts (the
//     harnesses' default endpoints: an Anthropic or OpenAI address is «use the default» spelled out) ⇒ refused by name;
//   · the child's environment and homes are the runner's (src/server/provider-test.js): every harness's config variable
//     a fresh empty folder, the sanitized agent env minus every credential name;
//   · classify: the child's exit and its words → ONE verdict a person reads; redact: its output, the key and every
//     secret shape masked, cut short — before any log, answer or file sees it.
const MP = require('./model-providers.js');
const i18nKey = (s) => s;

/** The vendors' OWN hosts — what a harness talks to when nothing else is said (claude: Anthropic's API; codex: OpenAI's /
 *  ChatGPT's). A suffix match: the host itself or any name under it. */
const VENDOR_OWN_HOSTS = Object.freeze(['anthropic.com', 'claude.ai', 'claude.com', 'openai.com', 'chatgpt.com']);
/** the host the CLIs will reach — parsed the WHATWG way (node's and the CLIs' own URL parser: `\` is a path separator,
 *  `%2E` and full-width dots are decoded, IDNA applied), never by a regex of ours (adversarial read r1) */
const hostOf = (url) => { try { return new URL(String(url || '')).hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, ''); } catch { return ''; } };
const vendorOwn = (host) => VENDOR_OWN_HOSTS.some((v) => host === v || host.endsWith('.' + v));
/** → { ok: true, host } | { ok: false, code: 'unknown' | 'built-in' | 'no-address' | 'vendor-own' } */
function addressVerdict(p) {
  if (!p || typeof p !== 'object') return { ok: false, code: 'unknown' };
  if (MP.presetOf(p.id) || !MP.kindOf(p.kind) || !MP.kindOf(p.kind).keyed) return { ok: false, code: 'built-in' };
  const url = typeof p.baseUrl === 'string' ? p.baseUrl.trim() : '';
  if (!url || !/^https?:\/\/[^\s/]+/i.test(url)) return { ok: false, code: 'no-address' };
  // an address whose host a regex and the CLIs would read differently is no address of a third party (`\`, `%`, non-ASCII)
  if (/[\\%]/.test(url) || /[^\x21-\x7e]/.test(url)) return { ok: false, code: 'no-address' };
  const host = hostOf(url);
  if (!host) return { ok: false, code: 'no-address' };
  if (vendorOwn(host)) return { ok: false, code: 'vendor-own' };
  return { ok: true, host };
}

const TIMEOUT_MS = 60000;
const OUT_MAX = 64 * 1024;   // what the runner keeps of the child's output (the rest is dropped, counted)
const DETAIL_MAX = 300;      // what a person reads of it
/** The child's end → ONE verdict. `timedOut` wins; then the exit; then its words (the CLIs' own error texts: an HTTP
 *  status, the vendor's error type, the system's connect errors). */
function classify({ code = null, signal = null, timedOut = false, spawnError = null, out = '' } = {}) {
  if (spawnError) return /ENOENT|EACCES/.test(String(spawnError)) ? 'cli-missing' : 'failed';
  if (timedOut) return 'timeout';
  const t = String(out || '');
  if (code === 0 && !signal) return 'ok';
  if (/\b(401|403)\b|authentication_error|permission_error|invalid[ _-]?(api[ _-]?)?key|unauthori[sz]ed|incorrect api key/i.test(t)) return 'key-refused';
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|getaddrinfo|connection (error|refused)|could not connect|failed to connect|network error|error sending request/i.test(t)) return 'unreachable';
  if (/\b404\b|not_found_error|model[^\n]{0,40}(not found|does not exist|not supported|unknown)|unknown model|wire_api|no such model|not supported/i.test(t)) return 'not-served';
  return 'failed';
}
const VERDICT_WORDS = Object.freeze({
  ok: i18nKey('Works'),
  'key-refused': i18nKey('The key was refused — check it in the provider’s console'),
  'not-served': i18nKey('This provider does not serve the model, or not what this agent needs'),
  unreachable: i18nKey('The address did not answer — check it in the technical details'),
  timeout: i18nKey('No answer within a minute'),
  failed: i18nKey('The test did not succeed — see the details'),
  'cli-missing': i18nKey('This agent’s program was not found on this machine'),
});
const REFUSAL_WORDS = Object.freeze({
  unknown: i18nKey('Unknown provider'),
  'built-in': i18nKey('This is not a third-party provider'),
  'no-address': i18nKey('This provider has no address — set it first'),
  'vendor-own': i18nKey('This address is the agent’s own vendor — a third-party test never runs on it'),
  unfit: i18nKey('This provider does not offer what this agent needs'),
  vault_locked: i18nKey('Unlock the vault first — the provider’s key is kept there'),
  vault_not_set_up: i18nKey('Set up the vault first — the provider’s key is kept there'),
  'key-unreadable': i18nKey('The provider’s key could not be read from the vault'),
  'no-key': i18nKey('This provider has no key — paste it again'),
  'model-none': i18nKey('Pick a model first — the test asks the provider with it'),
  'in-flight': i18nKey('A test of this provider is running already'),
  'managed-helper': i18nKey('This machine’s managed Claude settings ({where}) set a key helper, a credential or an address (or what they set could not be told) — the test would send a credential across, so it does not run. Ask the administrator'),   // 主开发 23:45Z
  'windows-policy-unread': i18nKey('VibeSpace could not read the Windows policy for Claude Code ({where}), so the test does not run — it cannot tell whether that policy would send a credential to this provider. Try again in a moment'),   // the Windows helper absent, failing or over its bound (主开发 00:42Z)
  changed: i18nKey('The key or the address changed while it was being tested — test it again'),   // lane lg-providers chain cure (its delta read, D2)
  human_only: i18nKey('Only a person on this page can run a test'),
  cross_site: i18nKey('Only a person on this page can run a test'),
});
/** The child's output as a person may read it: the key (and any piece of it ≥ 8 characters) replaced, every secret shape
 *  masked by `redactSecrets` (handed in — src/secret-shapes.js), control characters gone, cut to DETAIL_MAX. */
function redact(text, key, redactSecrets = (s) => s) {
  let t = String(text == null ? '' : text);
  const k = String(key || '');
  // the key whole, then EVERY piece of it 8 characters or longer (a key cut at a chunk's edge, adversarial read r1)
  if (k.length >= 8) { t = t.split(k).join('••••'); for (let i = 0; i + 8 <= k.length; i++) t = t.split(k.slice(i, i + 8)).join('••••'); }
  // src/secret-shapes.js redactSecrets answers { text, redacted } — a string is taken too; anything else withholds the output
  try { const r = redactSecrets(t); t = typeof r === 'string' ? r : (r && typeof r.text === 'string' ? r.text : '(output withheld)'); } catch { t = '(output withheld)'; }
  t = t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\s+\n/g, '\n').trim();
  return t.length > DETAIL_MAX ? t.slice(-DETAIL_MAX) : t;   // the END of the output: where the CLIs put their error
}

module.exports = { VENDOR_OWN_HOSTS, addressVerdict, TIMEOUT_MS, OUT_MAX, DETAIL_MAX, classify, VERDICT_WORDS, REFUSAL_WORDS, redact };

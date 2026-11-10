// THE STAND-IN CLAUDE whose bytes carry a model catalog (lane cli-update-needs-nothing): the drill
// (scripts/test-claude-update-needs-nothing.mjs) and its hub leg (…-hub.mjs) hand a hub a Claude Code it has never seen. It
// is a /bin/sh stub (answers --version / --help, else idles on stdin) followed by a bundle tail in the CLI's own minified
// literal shape — unquoted keys, !0 / !1, 1e6, \u escapes, the `VERSION:"…",…,BUILD_TIME:"…"` constants — which the hub
// reads and never runs. `neverSeen(base)` = 2.1.321's catalog + Fable 6 (an id and an alias target no table of ours names,
// 1M native) + Quill 1 (a NEW family: 200k with the 1M beta), each on a tier no table of ours has.
import fs from 'node:fs';

export const lit = (v) => {
  if (v === true) return '!0';
  if (v === false) return '!1';
  if (v === null) return 'null';
  if (typeof v === 'number') return v === 1000000 ? '1e6' : String(v);
  if (typeof v === 'string') return JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  if (Array.isArray(v)) return '[' + v.map(lit).join(',') + ']';
  return '{' + Object.entries(v).map(([k, x]) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ':' + lit(x)).join(',') + '}';
};

export function writeStandIn(file, { version, builtAt, catalog = null, body = null }) {
  fs.writeFileSync(file, `#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo '${version} (Claude Code)'; exit 0;; --help) echo 'Usage: claude [options]'; exit 0;; esac; done\nexec cat >/dev/null\n`
    + '// bundle (never run: the hub reads these bytes)\n'
    + `var Kq={PACKAGE_URL:"@anthropic-ai/claude-code",VERSION:"${version}",FEEDBACK_CHANNEL:"https://example.invalid",BUILD_TIME:"${builtAt}",GIT_SHA:"0"};\n`
    + `import{o,v}from"/$bunfs/root/chunk-x.js";var SOo=${body || lit(catalog)};function R(){return{bakedCatalog:void 0}}\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

export function neverSeen(base) {
  const c = structuredClone(base);
  c.pricing_tiers.tier_6_30 = { input: 6, output: 30, cache_write_5m: 7.5, cache_write_1h: 12, cache_read: 0.6, web_search: 0.01 };
  c.pricing_tiers.tier_1_5_q = { input: 1, output: 5, cache_write_5m: 1.25, cache_write_1h: 2, cache_read: 0.1, web_search: 0.01 };
  c.models.push(
    { id: 'claude-fable-6', family: 'fable', display_name: 'Fable 6', provider_ids: { first_party: 'claude-fable-6' }, context: { window: 1000000, native_1m: true, supports_1m_beta: true }, max_output_tokens: { default: 128000, upper: 128000 }, pricing: 'tier_6_30', capabilities: ['effort', 'fast_mode'], default_effort: 'medium' },
    { id: 'claude-quill-1', family: 'quill', display_name: 'Quill 1', provider_ids: { first_party: 'claude-quill-1' }, context: { window: 200000, maximum_window: 1000000, supports_1m_beta: true, supports_1m_suffix: true }, max_output_tokens: { default: 64000, upper: 64000 }, pricing: 'tier_1_5_q', capabilities: ['effort'] });
  c.aliases.fable = { default: 'claude-fable-6' };
  c.aliases.quill = { default: 'claude-quill-1' };
  c.latest_per_family.fable = 'claude-fable-6';
  c.latest_per_family.quill = 'claude-quill-1';
  return c;
}

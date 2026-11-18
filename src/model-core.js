'use strict';
/**
 * A CLAUDE MODEL ID'S CORE — PURE, imports nothing; CJS so the installed CLI's own catalog (src/claude-model-catalog.js) and the
 * lock's long-context verdict (src/lock-context.js, which the page bundles) share ONE name rule (batch 21's cure, 2026-11-18: the
 * verdict matched the exact id while the catalog matches by this core — a target spelled in another case or without the
 * `claude-` prefix went unjudged, and the CLI was commanded the 1M form the catalog says it has not).
 * core(id) → lowercased, the `claude-` prefix and a `[1m]` suffix dropped ('Claude-Fable-5[1m]' → 'fable-5').
 */
const core = (id) => String(id || '').toLowerCase().replace(/^claude-/, '').replace(/\[1m\]$/i, '');
module.exports = { core };

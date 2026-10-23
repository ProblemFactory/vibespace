#!/usr/bin/env node
// deploy/README.md's «Register the redirect URIs» block is GENERATED (lane oauth-setup-instructions, the owner 2026-10-23: a
// person deploying VibeSpace outside the fleet with their own Google / Lark / Slack app had no instruction for the
// redirect URIs). ONE source: each registry row's `redirect` block (src/integration-registry.js) rendered by PURE
// src/oauth-setup.js — the same model the product's setup card draws (src/lib/oauth-setup-card.js), for an instance with
// an https address `<host>` and the relay setting at its default (the public relay page). The block sits between
// OS.DOC_BEGIN and OS.DOC_END; the prose around it stays hand-written. scripts/test-integration-registry.mjs regenerates
// it in memory and fails when the file differs.
//   node scripts/gen-oauth-setup-doc.mjs           rewrite deploy/README.md
//   node scripts/gen-oauth-setup-doc.mjs --check   exit 1 when it is stale (writes nothing)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OS = require(path.join(REPO, 'src/oauth-setup.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));
export const DOC = path.join(REPO, 'deploy/README.md');

/** The kinds the block covers, in registry order: every row with a `redirect` block. */
export function entries() {
  return R.ROWS.filter((r) => r.redirect).map((r) => {
    const product = String(r.label).split(' / ')[0];
    const provider = r.redirect.vendor || r.signinName || product;
    return { kind: r.id, provider, label: provider === product ? r.label : `${r.label} — ${provider}`, redirect: r.redirect };
  });
}
/** `doc` with its generated block replaced (a doc without both markers is refused by name). */
export function render(doc) {
  const a = doc.indexOf(OS.DOC_BEGIN), b = doc.indexOf(OS.DOC_END);
  if (a < 0 || b < a) throw new Error(`deploy/README.md: the generated block's markers are missing (${OS.DOC_BEGIN.slice(0, 30)}… / ${OS.DOC_END})`);
  return doc.slice(0, a) + OS.docSection(entries()) + doc.slice(b + OS.DOC_END.length);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const doc = fs.readFileSync(DOC, 'utf8');
  const next = render(doc);
  if (process.argv.includes('--check')) {
    if (next !== doc) { console.error('deploy/README.md: the «Register the redirect URIs» block is STALE — run `node scripts/gen-oauth-setup-doc.mjs`'); process.exit(1); }
    console.log('deploy/README.md: the redirect URI block is current');
  } else if (next !== doc) { fs.writeFileSync(DOC, next); console.log('deploy/README.md: the redirect URI block rewritten'); } else console.log('deploy/README.md: already current');
}

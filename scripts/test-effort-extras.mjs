#!/usr/bin/env node
// The claude effort pickers keep Ultracode (lane effort-ultracode 2026-10-05, owner: "claude 创建对话的
// 那个对话框里的推理强度没法选 ultracode"). /api/session-options answers the CLI's
// parsed --effort levels; the boot fetch used to REPLACE the New Session /
// Settings effort lists with them — ultracode is not an --effort value (it
// spawns as --effort xhigh + the ultracode settings key), so the row vanished
// the moment the fetch landed. Now the harness DECLARES its extras
// (ui.effortExtras), the server gates them on the parsed levels, and every
// picker is levels + extras — APPENDED, never swapped in.
//   ① the PURE composition (effortOptions): order head, levels, extras; an
//      extra already parsed is not doubled; labels carry the hint
//   ② the PURE server gate (effortExtrasFor): a CLI whose --effort lacks the
//      level the extra spawns as ⇒ the row is ABSENT by name
//   ③ the REAL app.js fetch block, run in a sandbox: after it lands both the
//      dialog list and Settings' claude.defaultEffort still list ultracode;
//      an older server (no effortExtras) ⇒ the declared seed; a gated-off
//      server (effortExtras: []) ⇒ absent
//   ④ CONTROL: a patched copy with the replace restored ⇒ ③ goes red
// Run: node scripts/test-effort-extras.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const ok = (c, n, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e) : ''}`); } };
const am = await import(path.join(REPO, 'src/lib/agent-meta.js'));
const { effortExtrasFor } = require(path.join(REPO, 'src/server/cli-env.js'));
const HARNESS = require(path.join(REPO, 'src/harnesses/claude.js'));
const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const DECLARED = am.BACKEND_META.claude.ui.effortExtras;
const vals = (rows) => rows.map((r) => r.value).join(',');

console.log('① the pure composition');
ok(DECLARED?.length === 1 && DECLARED[0].value === 'ultracode' && DECLARED[0].requiresLevel === 'xhigh', 'claude declares ultracode as its one effort extra, spawned as xhigh', DECLARED);
ok(JSON.stringify(HARNESS.ui?.effortExtras) === JSON.stringify(DECLARED), 'the server descriptor carries the same row');
const AUTO = { value: '', label: 'Auto (model default)' };
const rows = am.effortOptions('claude', LEVELS, DECLARED, { head: AUTO });
ok(vals(rows) === ',low,medium,high,xhigh,max,ultracode', 'order: Auto, the parsed levels, then the declared extras', vals(rows));
ok(rows.find((r) => r.value === 'ultracode')?.label === 'Ultracode — xhigh effort + standing dynamic-workflow orchestration', 'the capitalized label carries the hint the way codex\'s ultra does', rows.at(-1));
ok(am.effortOptions('claude', LEVELS, DECLARED, { capitalize: false }).find((r) => r.value === 'ultracode')?.label.startsWith('ultracode — '), 'the status-bar (lowercase) row carries it too');
ok(vals(am.effortOptions('claude', [...LEVELS, 'ultracode'], DECLARED)) === 'low,medium,high,xhigh,max,ultracode', 'a CLI that one day parses ultracode itself does not double the row');
ok(vals(am.effortOptions('claude', LEVELS, [])) === LEVELS.join(','), 'no extras ⇒ just the levels');
ok(vals(am.effortOptions('codex', ['high', 'ultra'], undefined)) === 'high,ultra' && am.effortLabel('codex', 'ultra', { capitalize: true }).startsWith('Ultra — delegates'), 'codex unchanged (no extras, its ultra hint intact)');

console.log('② the pure server gate');
ok(vals(effortExtrasFor(DECLARED, LEVELS)) === 'ultracode', 'the CLI parsed xhigh ⇒ ultracode is answered');
ok(vals(effortExtrasFor(DECLARED, ['low', 'medium', 'high', 'max'])) === '', 'a CLI without xhigh ⇒ the row is ABSENT by name (never a no-op pick)');
ok(!('requiresLevel' in (effortExtrasFor(DECLARED, LEVELS)[0] || {})), 'the answer carries value/label/hint only');

console.log('③ the real app.js fetch block');
const APP = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
const blockOf = (src) => { const i = src.indexOf("fetchJson('/api/session-options').then("); return i < 0 ? null : src.slice(i, src.indexOf('\n});\n', i) + 4); };
const runBlock = async (block, data) => {
  const BSO = { claude: { efforts: [] } }, SCHEMA = { 'claude.defaultEffort': { options: [] }, 'claude.defaultPermissionMode': { options: [] } };
  const t = (s) => s;
  new Function('fetchJson', 'BACKEND_SESSION_OPTIONS', 'SETTINGS_SCHEMA', 'effortOptions', 'BACKEND_META', 't', 'permissionModeOptions', block)(
    async () => data, BSO, SCHEMA, am.effortOptions, am.BACKEND_META, t, (be, modes) => modes.map((v) => ({ value: v, label: v })));
  await new Promise((r) => setTimeout(r, 0));
  return { dialog: vals(BSO.claude.efforts), settings: vals(SCHEMA['claude.defaultEffort'].options) };
};
const block = blockOf(APP);
ok(!!block, 'the fetch block is found in app.js');
const answered = { effortLevels: LEVELS, effortExtras: effortExtrasFor(DECLARED, LEVELS), permissionModes: ['default'] };
const want = ',low,medium,high,xhigh,max,ultracode';
const real = await runBlock(block, answered);
ok(real.dialog === want && real.settings === want, 'THE BUG: after the fetch the New Session list AND Settings\' claude.defaultEffort still list ultracode, after the levels', real);
const older = await runBlock(block, { effortLevels: LEVELS });
ok(older.dialog === want, 'an older server (no effortExtras) ⇒ the declared seed rides', older);
const gated = await runBlock(block, { effortLevels: ['low', 'medium', 'high', 'max'], effortExtras: [] });
ok(gated.dialog === ',low,medium,high,max', 'a gated-off server ⇒ ultracode absent by name', gated);
ok(!/value: 'ultracode'/.test(APP) && !/value: 'ultracode'/.test(fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8')), 'no picker carries its own ultracode literal — the declared row is the one source');

console.log('④ CONTROL: the replace restored');
const OLD = "const efforts = [{ value: '', label: t('Auto (model default)') }, ...data.effortLevels.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))];";
const patched = block.replace(/const efforts = effortOptions\([^\n]*\n/, OLD + '\n');
ok(patched !== block, 'the patched copy differs from the real block');
const red = await runBlock(patched, answered);
ok(red.dialog === ',low,medium,high,xhigh,max' && red.dialog !== want, 'the old replace drops ultracode the moment the fetch lands (③ would be red)', red);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

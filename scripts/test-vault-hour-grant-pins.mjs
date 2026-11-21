#!/usr/bin/env node
// «ALLOW FOR 1 HOUR» — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED from the heavy
// scripts/test-vault-hour-grant.mjs, where each was the SOURCE HALF of a leg whose behaviour half stays there (its behaviour legs and every
// control stay there): Ⓥb the refusal's words (src/lib/vault-use-row.js + zh), Ⓦa the Save route's road (src/routes/vault.js),
// Ⓩb the zh/ja words of the preview and the stale-grant refusal (src/lib/vault-use-row.js, src/lib/i18n-zh.js, src/lib/i18n-ja.js),
// Ⓨb / ⓒa the zh (and ja) words of the stale-grant refusal and the half-saved dialog.
// Each block reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-vault-hour-grant-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ZH = (await import(new URL('../src/lib/i18n-zh.js', import.meta.url).href)).default;
const JA = (await import(new URL('../src/lib/i18n-ja.js', import.meta.url).href)).default;
let pass = 0, fail = 0;
const TAG = '';
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n + TAG); } else { fail++; console.error('  ✗ ' + n + TAG + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };

console.log('Ⓥb the refusal names the member (source half)');
{
  const src = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8');
  const KEY = 'Name the hosts {name} may use it for — a host name or address each (never «any host»)';
  ok(!!(/if \(plan\.refused\) return \{ error: t\('Name the hosts \{name\} may use it for/.test(src) && /^请写明 \{name\} 可用于哪些主机/.test(String(ZH[KEY]))), 'Ⓥb a member with nothing to send and no window is still refused — and the refusal NAMES it («请写明 {name} 可用于哪些主机…», the hub\'s `principal` too)', { zh: ZH[KEY] });
}

console.log('Ⓦa the Save route goes through the door (source half)');
{
  const route = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  ok(!!(/run\.saveRow\(String\(b\.id/.test(route)), 'Ⓦa the owner\'s Save that leaves out the member holding a LIVE window (the Save route → the door\'s saveRow)');
}

console.log('Ⓩb the words (source half)');
{
  const KEYS = ['{name} will no longer be excluded', 'This grant changed while the dialog was open — close it and open it again'];
  const src = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8');
  ok(!!(KEYS.every((k) => ZH[k] && JA[k]) && ZH[KEYS[0]] === '{name} 将不再被排除' && /t\('\{name\} will no longer be excluded'/.test(src)), 'Ⓩb the words: the preview names an exception the Save takes away («{name} 将不再被排除»); an exception the dialog never drew (except_unnamed) says «这个授权在对话框打开期间变了…»', { zh: KEYS.map((k) => ZH[k]) });
}


console.log('Ⓨb the stale-grant refusal\'s words (dictionary half)');
{
  const KEY = 'This grant changed while the dialog was open — close it and open it again';
  ok(!!(String(ZH[KEY] || '') === '这个授权在对话框打开期间变了 — 关掉再打开一次'), 'Ⓨb a refusal that remains never says «Name the hosts Narrator may use it for»: «这个授权在对话框打开期间变了 — 关掉再打开一次»', { zh: ZH[KEY] });
}

console.log('ⓒa the half-saved words (dictionary half)');
{
  const NOT = 'The members were saved; the policy was not';
  ok(!!(String(ZH[NOT] || '') === '成员已保存；策略没有保存' && JA[NOT]), 'ⓒa the dialog SAYS «The members were saved; the policy was not» (成员已保存；策略没有保存), in zh and ja', { zh: ZH[NOT], ja: JA[NOT] });
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

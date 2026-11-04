#!/usr/bin/env node
// test-card-list-indent — A MARKDOWN LIST INDENTS BY ITS CONTAINER, NEVER BY THE BUBBLE IT SITS IN (hotfix .377; the owner,
// 2026-11-04, two screenshots: «先把这种卡片修一下，好几处这类卡片都有这个布局问题（点跑到左边界了）» — the sub-agent report card
// «remaining_weeks_audit · FINAL_ANSWER» and the VibeSpace hand-over notice «已交接 1 条等待中的通知» drew their bullets on the
// card's left edge). public/style.css:1 zeroes every element's padding (`*, *::before, *::after { margin: 0; padding: 0 }`), so a
// <ul>/<ol> with no rule of its own hangs its outside markers left of its text — the indent lived only under
// `.chat-bubble-assistant .chat-text` (and the compact view), and every other card that renders markdown had none.
//   ① PURE census: every `renderMarkdown(` call in src/lib/chat-renderers.js, src/lib/subagent-card.js and src/lib/chat-view.js
//     (grep-derived, PRINTED) writes into an element whose class list holds `chat-text` (a template's enclosing tag, or the
//     `.chat-text` an innerHTML assignment queried) — a site that does not is red by name; the control: the same census over
//     the file with one fake site added (`<div class="chat-agent-x">${this.renderMarkdown(x)}</div>`) is red at that line
//   ② PURE stylesheet: chat.css gives `.chat-text ul` / `.chat-text ol` their own padding-left (the container's rule, no bubble
//     in the selector; the last rule written) and keeps no bubble-scoped list rule; viewers.css gives `.markdown-preview ul` /
//     `ol` theirs (the file viewer's and the jobs panel's markdown)
// The layout itself — every card's items and ::markers measured through the page — is test-card-list-indent-chrome (heavy).
// On 27a0bf89e (the base — run this file on a `git archive` copy) ② is RED by name (5 rows).
// Run: node scripts/test-card-list-indent.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

// ── ① THE CENSUS: where each markdown render lands ──
const CENSUS_FILES = ['src/lib/chat-renderers.js', 'src/lib/subagent-card.js', 'src/lib/chat-view.js'];
/** every `renderMarkdown(` call in `src` → {line, kind, cls, ok}. kind: 'def' (the method itself), 'delegate' (a callback
 *  handed to subagent-card.js — its own calls are censused there), 'template' (the enclosing tag of `${…renderMarkdown(…)}`),
 *  'assign' (`x.innerHTML = …renderMarkdown(…)`, x queried by a selector), 'unknown' (red). */
function census(src) {
  const lines = src.split('\n');
  const out = [];
  lines.forEach((ln, i) => {
    const re = /renderMarkdown\s*\(/g;
    for (let m = re.exec(ln); m; m = re.exec(ln)) {
      const pre = ln.slice(0, m.index);
      const site = { line: i + 1, kind: 'unknown', cls: '', ok: false };
      if (/^\s*(\/\/|\/\*|\*)/.test(ln) || /(^|[^:])\/\/\s/.test(pre)) continue;   // a comment names it, no call
      if (/^\s*renderMarkdown\s*\(\w*\)\s*\{/.test(ln)) Object.assign(site, { kind: 'def', ok: true });
      else if (/renderMarkdown:\s*\(\w*\)\s*=>\s*this\.$/.test(pre)) Object.assign(site, { kind: 'delegate', ok: true });
      else if (/(\w+)\.innerHTML\s*=\s*this\._renderers\.$/.test(pre)) {
        const v = /(\w+)\.innerHTML\s*=\s*this\._renderers\.$/.exec(pre)[1];
        const def = lines.slice(Math.max(0, i - 8), i).reverse().map((l) => new RegExp(`\\b${v}\\s*=\\s*[\\w.]+\\.querySelector\\('([^']+)'\\)`).exec(l)).find(Boolean);
        site.kind = 'assign'; site.cls = def ? def[1] : '(no querySelector)';
        site.ok = !!def && /(^|\s|\.)chat-text\b/.test(def[1].replace(/\./g, ' .'));
      } else {
        const tags = [...pre.matchAll(/<([a-z][a-z0-9]*)\b([^<>]*)>/g)];
        const last = tags[tags.length - 1];
        if (last) {
          const between = pre.slice(last.index + last[0].length);
          const cm = /\bclass="([^"]*)"/.exec(last[2]);
          site.kind = 'template'; site.cls = cm ? cm[1] : '(no class)';
          site.ok = /^\$\{[^<>`]*$/.test(between) && !!cm && cm[1].split(/\s+/).includes('chat-text');
        }
      }
      out.push(site);
    }
  });
  return out;
}
console.log('① every renderMarkdown( site writes into a .chat-text');
let delegates = 0;
for (const f of CENSUS_FILES) {
  const sites = census(read(f));
  for (const s of sites) console.log(`    · ${f}:${s.line}  ${s.kind}${s.cls ? `  ${s.kind === 'assign' ? `querySelector('${s.cls}')` : `class="${s.cls}"`}` : ''}  ${s.ok ? 'ok' : 'NOT a .chat-text'}`);
  delegates += sites.filter((s) => s.kind === 'delegate').length;
  const bad = sites.filter((s) => !s.ok);
  check(`① ${f}: ${sites.filter((s) => s.kind === 'template' || s.kind === 'assign').length} markup site(s), each inside a .chat-text${bad.length ? ` — red: ${bad.map((s) => `:${s.line} ${s.kind} «${s.cls}»`).join(', ')}` : ''}`, !bad.length, bad);
}
const crSites = census(read('src/lib/chat-renderers.js'));
check(`① the census sees the renderer's markup sites (≥ 8 templates in chat-renderers.js: ${crSites.filter((s) => s.kind === 'template').length}) and its one definition`, crSites.filter((s) => s.kind === 'template').length >= 8 && crSites.filter((s) => s.kind === 'def').length === 1, crSites);
check(`① the delegate to subagent-card.js is followed there (${delegates} delegate(s); subagent-card.js censused)`, delegates >= 1 && census(read('src/lib/subagent-card.js')).some((s) => s.kind === 'template'));
{ // the control: one fake site added to a scratch copy of the text ⇒ red at that line, by name
  const src = read('src/lib/chat-renderers.js') + '\nconst fake = `<div class="chat-agent-x">${this.renderMarkdown(text)}</div>`;\n';
  const bad = census(src).filter((s) => !s.ok);
  const at = src.split('\n').length - 1;
  check(`① control: a fake site (<div class="chat-agent-x">) added at :${at} is red by name, and only it`, bad.length === 1 && bad[0].line === at && bad[0].cls === 'chat-agent-x', bad);
}

// ── ② THE STYLESHEET: the list indent is the markdown container's ──
console.log('② the list rule names the markdown container, not the bubble');
function rulesOf(css) {
  const out = [];
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ sels: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), decl: m[2] });
  return out;
}
/** a rule's padding-left as written ('20px' / '2em') and in px at the chat's 13 px text; null when it sets none */
const padOf = (decl) => { const m = /padding-left:\s*([\d.]+)(px|em)\b/.exec(decl); return m ? { raw: m[1] + m[2], px: m[2] === 'em' ? +m[1] * 13 : +m[1] } : null; };
const chatCss = rulesOf(read('public/chat.css')), viewersCss = rulesOf(read('public/viewers.css'));
for (const [file, rules, box] of [['chat.css', chatCss, '.chat-text'], ['viewers.css', viewersCss, '.markdown-preview']]) {
  for (const tag of ['ul', 'ol']) {
    const r = rules.filter((x) => x.sels.includes(`${box} ${tag}`) && padOf(x.decl) != null).pop();   // the cascade's: the last one written
    check(`② ${file}: \`${box} ${tag}\` has its own padding-left (${r ? padOf(r.decl).raw : 'none — its markers hang left of the text'})`, !!r && padOf(r.decl).px >= 16, r);
  }
}
const scoped = chatCss.filter((x) => x.sels.some((s) => /^\.chat-bubble-[a-z]+ \.chat-text (ul|ol)$/.test(s)));
check('② chat.css keeps no bubble-scoped list indent (`.chat-bubble-… .chat-text ul/ol`) — the container\'s rule is the one', !scoped.length, scoped.map((x) => x.sels.join(', ')));


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

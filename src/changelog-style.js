'use strict';
// THE USER CHANGELOG'S STYLE RULES — PURE (imports nothing; CJS so a node
// suite, the server and the bundle could all read the one table).
//
// CHANGELOG.md / CHANGELOG.zh.md / CHANGELOG.ja.md are the user's (the rules,
// in prose, are docs/changelog-style.md): what changed FOR THE PERSON USING
// VIBESPACE, one plain line per change, newest first, the same structure in
// all three languages. Everything an engineer wants to remember about a
// release goes to docs/changelog-engineering.md under the same version.
// This module is the executable form of that guide — the lint of one file and
// the parity of a translation against the English — and scripts/
// test-changelog-style.mjs runs it over the three files whole.
//
//   lint(text, lang)            → [{line, version, rule, message}]   ([] = clean)
//   parity(enText, text, lang)  → [{version, rule, message}]         ([] = same structure)
//   versionsOf(text)            → [{version, date, line}]             every `## ` heading, in file order
//   headedVersions(text)        → Set of every `## <version>` a file heads (any heading tail —
//                                 the engineering log's old headings carry a summary, not a date)
//   compareVersions(a, b)       → <0 | 0 | >0
//
// Every problem names its RULE, so a gate can say which rule a text broke.

const LANGS = ['en', 'zh', 'ja'];

// One table of section words per language, in the only allowed order.
const SECTIONS = {
  en: ['Added', 'Changed', 'Fixed', 'Removed', 'Security', 'Maintenance'],
  zh: ['新增', '更改', '修复', '移除', '安全', '维护'],
  ja: ['追加', '変更', '修正', '削除', 'セキュリティ', 'メンテナンス'],
};
const MAINTENANCE_INDEX = 5;

// A version with nothing a user would notice has exactly this one line.
const MAINTENANCE_LINE = {
  en: 'Test and release tooling only; nothing changes for you.',
  zh: '仅测试与发布工具的改动；对你没有影响。',
  ja: 'テストとリリースツールのみの変更です。使い方は変わりません。',
};

// The file's own title line (the first line of each file).
const TITLE = { en: '# Changelog', zh: '# 更新日志', ja: '# 更新履歴' };

// Bullet length limits, in code points.
const MAX_BULLET = { en: 160, zh: 90, ja: 90 };

// Words that belong in the engineering log, never in the user's file. Each row
// = [pattern, rule]; the rule is what a problem names.
const BANNED = [
  [/\blanes?[- ]/i, 'lane'],
  [/\bround \d/i, 'round N'],
  [/\bverif(y|ied|ier|ication)\b/i, 'verify'],
  [/\bcensus/i, 'census'],
  [/patched cop(y|ies)/i, 'patched copy'],
  [/negative control|\bCONTROL\b/, 'control'],
  [/\btest-[a-z]/, 'test-suite name'],
  [/\bsrc\/|\bscripts\/|\bdocs\/|\bdata\/bin/, 'file path'],
  [/\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/, 'commit sha'],
  [/\bB-[0-9a-f]{4}\b/, 'backlog id'],
  [/\binc-[a-z0-9]+-[a-z0-9]+\b/, 'incident id'],
  [/§|不变量|不変量/, '§ / 不变量'],
  [/\bowner\b/i, 'owner'],
  [/\buser[WLN]\b/, 'user pseudonym'],
  [/\bintegrator\b/i, 'integrator'],
  [/\b(fast|heavy) tier\b/i, 'tier'],
  [/\bsuites?\b/i, 'suite'],
  [/\bkb-[a-z]/i, 'kb reference'],
  [/\bwiring pin\b/i, 'wiring pin'],
  [/\bmutant/i, 'mutant'],
  [/验证轮|验证者|普查|对照组|集成器|测试套件|快速门|重型门|车道/, 'internal jargon (zh)'],
  [/検証ラウンド|センサス|統合担当|テストスイート|レーン/, 'internal jargon (ja)'],
];
// In the English file any CJK text is a quote of somebody's message (they
// belong in the engineering log, if anywhere). The range is the one the
// reference lint used: CJK punctuation … unified ideographs, and full-width forms.
const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

const HEADING = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})$/;
const ANY_HEADING = /^## (\d+\.\d+\.\d+)(?![\d.])/;

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const codePoints = (s) => [...s].length;

/** Lint ONE file's text in ONE language. Returns problems, each naming its rule. */
function lint(text, lang) {
  if (!SECTIONS[lang]) throw new Error(`changelog-style: unknown language ${JSON.stringify(lang)}`);
  const secs = SECTIONS[lang], maint = MAINTENANCE_LINE[lang], max = MAX_BULLET[lang];
  const lines = String(text).split('\n');
  const out = [];
  const add = (line, version, rule, message) => out.push({ line, version, rule, message });
  let cur = null;            // { version, date, line, sections: [name], bullets }
  let prev = null;           // the previous version heading (order + dates)
  let preamble = 0;          // prose lines before the first version heading
  let sawTitle = false;
  const flush = () => {
    if (!cur) return;
    if (!cur.sections.length) add(cur.line, cur.version, 'no-section', `${cur.version}: no section`);
    else if (cur.sections.length === 1 && cur.sections[0] === secs[MAINTENANCE_INDEX] && cur.bullets !== 1) {
      add(cur.line, cur.version, 'maintenance', `${cur.version}: a Maintenance-only entry has exactly one line: - ${maint}`);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], n = i + 1;
    if (!l.trim()) continue;
    if (l.startsWith('## ')) {
      flush();
      const m = HEADING.exec(l);
      if (!m) add(n, null, 'heading', `${n}: heading must be "## <version> — <YYYY-MM-DD>": ${l.slice(0, 80)}`);
      const version = m ? m[1] : `line ${n}`;
      if (m && prev) {
        if (compareVersions(m[1], prev.version) >= 0) add(n, version, 'order', `${version} ${n}: not older than the entry above it (${prev.version}) — newest first, each version once`);
        else if (m[2] > prev.date) add(n, version, 'date-order', `${version} ${n}: dated ${m[2]}, after the newer ${prev.version} (${prev.date})`);
      }
      cur = { version, date: m ? m[2] : null, line: n, sections: [], bullets: 0 };
      if (m) prev = { version: m[1], date: m[2] };
      continue;
    }
    if (!cur) {
      // THE PREAMBLE: the title line first, then at most one intro line.
      if (!sawTitle) {
        sawTitle = true;
        if (l !== TITLE[lang]) add(n, null, 'title', `${n}: the file starts with its title "${TITLE[lang]}": ${l.slice(0, 80)}`);
        continue;
      }
      if (/^#{1,6} |^- /.test(l)) { add(n, null, 'preamble', `${n}: before the first version only the title and one intro line: ${l.slice(0, 80)}`); continue; }
      if (++preamble > 1) add(n, null, 'preamble', `${n}: the intro is one line: ${l.slice(0, 80)}`);
      continue;
    }
    if (l.startsWith('# ')) { add(n, cur.version, 'stray-line', `${cur.version} ${n}: a title inside an entry: ${l.slice(0, 80)}`); continue; }
    if (l.startsWith('### ')) {
      const s = l.slice(4).trim();
      if (!secs.includes(s)) add(n, cur.version, 'section-unknown', `${cur.version} ${n}: unknown section "${s}" (${lang}: ${secs.join(' / ')})`);
      else {
        const last = cur.sections.length ? secs.indexOf(cur.sections[cur.sections.length - 1]) : -1;
        if (secs.indexOf(s) <= last) add(n, cur.version, 'section-order', `${cur.version} ${n}: section "${s}" out of order or repeated`);
        cur.sections.push(s);
      }
      continue;
    }
    if (l.startsWith('- ')) {
      if (!cur.sections.length) add(n, cur.version, 'bullet-before-section', `${cur.version} ${n}: bullet before any section`);
      cur.bullets++;
      const b = l.slice(2).trim();
      const len = codePoints(b);
      if (len > max) add(n, cur.version, 'length', `${cur.version} ${n}: bullet is ${len} chars (max ${max}): ${b.slice(0, 60)}…`);
      if (/^-/.test(b) || /^\*\*/.test(b)) add(n, cur.version, 'nested', `${cur.version} ${n}: no nested/bold bullets`);
      for (const [re, rule] of BANNED) if (re.test(b)) add(n, cur.version, `banned:${rule}`, `${cur.version} ${n}: banned (${rule}): ${b.slice(0, 90)}`);
      if (lang === 'en' && CJK.test(b)) add(n, cur.version, 'banned:cjk', `${cur.version} ${n}: banned (CJK text — quotes of messages belong in the engineering log): ${b.slice(0, 90)}`);
      if (cur.sections[cur.sections.length - 1] === secs[MAINTENANCE_INDEX] && b !== maint) add(n, cur.version, 'maintenance', `${cur.version} ${n}: Maintenance line must be exactly: - ${maint}`);
      continue;
    }
    add(n, cur.version, 'stray-line', `${cur.version} ${n}: only "### Section" and "- bullet" lines are allowed: ${l.slice(0, 80)}`);
  }
  flush();
  if (!sawTitle) add(1, null, 'title', `the file starts with its title "${TITLE[lang]}"`);
  return out;
}

/** The structure of a file: versions in order, each with its date and its
 *  sections as (index into the language's table, bullet count). */
function structureOf(text, lang) {
  const out = [];
  let cur = null;
  for (const l of String(text).split('\n')) {
    const m = /^## (\d+\.\d+\.\d+) — (\S+)/.exec(l);
    if (m) { cur = { version: m[1], date: m[2], secs: [] }; out.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith('### ')) cur.secs.push({ s: SECTIONS[lang].indexOf(l.slice(4).trim()), n: 0 });
    else if (l.startsWith('- ') && cur.secs.length) cur.secs[cur.secs.length - 1].n++;
  }
  return out;
}

/** A translation's structure against the English: the same versions in the
 *  same order, the same dates, the same sections in the same order, the same
 *  number of bullets in each. Only the words may differ. */
function parity(enText, otherText, lang) {
  if (!SECTIONS[lang]) throw new Error(`changelog-style: unknown language ${JSON.stringify(lang)}`);
  const A = structureOf(enText, 'en'), B = structureOf(otherText, lang);
  const out = [];
  if (A.length !== B.length) out.push({ version: null, rule: 'version-count', message: `version count ${A.length} (en) vs ${B.length} (${lang})` });
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i], y = B[i];
    if (x.version !== y.version) { out.push({ version: x.version, rule: 'version-order', message: `order: ${x.version} (en) vs ${y.version} (${lang}) at entry ${i + 1}` }); break; }
    if (x.date !== y.date) out.push({ version: x.version, rule: 'date', message: `${x.version}: date ${x.date} (en) vs ${y.date} (${lang})` });
    const xs = x.secs.map((s) => `${s.s}:${s.n}`).join(','), ys = y.secs.map((s) => `${s.s}:${s.n}`).join(',');
    if (xs !== ys) out.push({ version: x.version, rule: 'sections', message: `${x.version}: sections/bullets ${xs} (en) vs ${ys} (${lang})` });
  }
  return out;
}

/** Every `## ` version heading of a user file, in file order. */
function versionsOf(text) {
  const out = [];
  String(text).split('\n').forEach((l, i) => {
    const m = /^## (\d+\.\d+\.\d+)(?: — (\S+))?/.exec(l);
    if (m) out.push({ version: m[1], date: m[2] || null, line: i + 1 });
  });
  return out;
}

/** Every version a file heads with `## <version>`, whatever follows it. */
function headedVersions(text) {
  const out = new Set();
  for (const l of String(text).split('\n')) { const m = ANY_HEADING.exec(l); if (m) out.add(m[1]); }
  return out;
}

// The engineering log is written with every release from this version on (the
// user file was rewritten on 2026-09-29; older versions keep their verbatim
// entry there, under a heading that carries a summary instead of a date).
const ENGINEERING_LOG_SINCE = '2.369.198';

/** The user file's versions (from `since` on) that the engineering log does
 *  not head — each release writes both, in the same commit. */
function engineeringGaps(userText, logText, since = ENGINEERING_LOG_SINCE) {
  const logged = headedVersions(logText);
  return versionsOf(userText).map((v) => v.version).filter((v) => compareVersions(v, since) >= 0 && !logged.has(v));
}

module.exports = {
  LANGS, SECTIONS, MAINTENANCE_LINE, TITLE, MAX_BULLET, BANNED, CJK, ENGINEERING_LOG_SINCE,
  lint, parity, structureOf, versionsOf, headedVersions, compareVersions, engineeringGaps,
};

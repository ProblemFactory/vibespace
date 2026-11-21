'use strict';
// THE LANDING'S LANGUAGE (lifted verbatim out of src/consent-road.js by the separation's B3b-1, 主开发 r1517): the browser's asked
// language read ONE way — the OAuth landings (src/consent-road.js), the sign-in page and its held words (src/auth.js in the
// plain form, src/interface/signin.js in the piped one). Its own file so the interface reads the rule without the channels'
// modules consent-road.js requires. PURE: it imports nothing.
/** lane oauth-landing-words: the landing's languages — the app's own three (src/lib/i18n.js), in its order. */
const LANGS = Object.freeze(['en', 'zh', 'ja']);
const ACCEPT_LANGUAGE_MAX = 512;
/** The app's rule over ONE language tag (src/lib/i18n.js resolveLang, navigator.language): zh* → zh, ja* → ja, else en. */
const langOfTag = (tag) => { const l = String(tag || '').trim().toLowerCase(); return l.startsWith('zh') ? 'zh' : l.startsWith('ja') ? 'ja' : 'en'; };
/** The language a landing speaks: the request's `Accept-Language` read the way a browser fills navigator.language — its
 *  FIRST preference (the highest q, the earliest on a tie; a range with q=0 is refused, `*` is no language) — then the
 *  app's rule. PURE; anything that is not a header string is English. */
function landingLang(acceptLanguage) {
  if (typeof acceptLanguage !== 'string' || !acceptLanguage) return 'en';
  let best = null, bestQ = 0;
  for (const part of acceptLanguage.slice(0, ACCEPT_LANGUAGE_MAX).split(',')) {
    const [tag, ...params] = part.split(';').map((x) => x.trim());
    if (!tag || tag === '*' || !/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(tag)) continue;
    const qp = params.find((x) => /^q=/i.test(x));
    const q = qp ? Number(qp.slice(2)) : 1;
    if (!(q > 0 && q <= 1)) continue;
    if (q > bestQ) { best = tag; bestQ = q; }
  }
  return best ? langOfTag(best) : 'en';
}

module.exports = { LANGS, ACCEPT_LANGUAGE_MAX, langOfTag, landingLang };

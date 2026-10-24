'use strict';
/**
 * THE CONSENT ROAD — where a vendor sends the person's browser back after a sign-in (lane pod-oauth-callback,
 * 2026-10-23: two naive-user studies on fleet pods, study 2 B2 + study 1 L1 — every Lark / Gmail connect from a pod
 * dead-ended on the POD's own loopback — Lark's registered 127.0.0.1 callback, Gmail's ephemeral 127.0.0.1 port — an
 * address no person's browser can reach; the only road was a box asking for the failed page's address, which nobody
 * walked). PURE: imports only src/channels/slack-manifest.js (PURE → PURE: THE relay rule, one table with the relay page).
 * The adapters (src/channels/lark.js, src/channels/gmail.js) ask it at every begin().
 *
 * lane oauth-relay-road (the owner, 2026-10-22: «不可能每次都让我手动加 redirect url 的：集群里用 admin 做转发，其他地方用我那个
 * githubio» — a route per instance meant one registered address per pod): THE RELAY ROAD comes first. A vendor app
 * registers ONE relay page (the fleet's admin host /relay/, or the project's public page) and every instance rides it.
 * ADDENDUM 1 (the owner, 2026-10-22: «github 那个 url 不能加到我们公司的 lark 和 slack app 默认配置里»): a COMPANY PRESET rides the
 * cluster's own page only — its own `relayUrl`, else the fleet's — never the instance's setting (whose default is the
 * project's public page); a preset with neither has NO relay (the route / the loopback). The public page serves only an
 * app a person registered themselves.
 *
 *   consentRoad({kind, publicUrl, origin, road, relayUrl, relayFleet, clientType}) → {road, redirectUri, base, u, why, fixed?}
 *     'relay'    — a relay page is known for this account (`relayUrl`, relayPick below: a company preset's own relayUrl ›
 *                  the fleet's (the presets' fleet.json); a person's own app: the fleet's › the Settings → Channels relay
 *                  page — the project's public page by default) AND it sends THIS browser back: the browser's origin
 *                  (`u`, the instance origin the member started from, port included) is a private address (every relay
 *                  page sends those back), or — the cluster's own page (`relayFleet`: the fleet's, a preset's) — this
 *                  instance's own https host (the admin page allows the fleet's domain).
 *                  redirect_uri = the relay page; the state's `u` names where it sends the browser:
 *                  <u>/api/channels/oauth/cb/<kind>, the landing route below. A relay that would only SHOW the code
 *                  (a public https origin through the public page) is not taken — the route / the loopback are.
 *     'route'    — this instance has an HTTPS address (instance-url's resolver: the frp mapping, agentd.publicUrl,
 *                  VIBESPACE_PUBLIC_URL — every fleet pod's — or the hub's own https) and the browser that pressed
 *                  Connect is NOT on this machine: redirect_uri = <address>/api/channels/oauth/cb/<kind>, the
 *                  instance's landing route finishes the exchange and the tab says «connected» and closes itself.
 *     'loopback' — the adapter's own loopback listener, as before (a local hub: the browser IS on this machine). Also
 *                  when there is no https address, and when the person asked for the copy-the-address way
 *                  (`road: 'loopback'` — the dialog's last resort, for a vendor app that does not list the route yet).
 *     why ∈ WHYS: relay-page | https-address | asked | local-browser | no-address | not-https | bad-kind | desktop-client.
 *     lane oauth-setup-instructions (the owner 2026-10-23: a self-hoster's Google client is a Web application or a Desktop
 *     app, and the two take different addresses): `clientType` = what the account says its Google client is. 'desktop'
 *     — a Desktop app client takes ANY 127.0.0.1 port and never an https address, so neither the relay page nor the
 *     route can serve it: the loopback (`desktop-client`), on any port. 'web' — a Web application client takes only
 *     addresses registered EXACTLY, so its loopback is the kind's FIXED one (`fixed: true` on the loopback verdict; the
 *     adapter binds its registered callback). '' — not said: as before (the relay, the route, the adapter's own loopback).
 *   relayPick({fleet, preset, setting}) → {url, fleet, who} — the relay a consent rides. `preset` = a company preset
 *                  account's own relayUrl ('' when it names none), null for any other client: a preset rides its own ›
 *                  the fleet's, NEVER the setting; any other client the fleet's › the setting's (the first that is a
 *                  relay page address). `fleet` = the cluster's own page; `who` ∈ preset | fleet | page | null.
 *   relayOf(consent, cred) → {relayUrl, relayFleet} — relayPick over the engine's consent deps and the account's client.
 *   stateOf({origin, flowId, issuedAt, kind}, sign) / stateVerdict(s, {sign, now, ttlMs, kind}) — the state a route
 *                  consent carries: `v1.<b64url {u, f, t, k}>.<this boot's HMAC>` (the shape src/server/dropline-oauth.js
 *                  and the relay page docs/slack-relay/relay.js already read; `k` = the account kind). `sign` is the
 *                  engine's per-boot HMAC — this module holds no key and does no crypto.
 *   landingHtml(r, {name, lang}) — the landing page in ONE language, `lang` (landingLang below); a connected page
 *                  carries CLOSE_SCRIPT, the one inline script the landing route's CSP allows by hash.
 *   lane oauth-landing-words (the owner 2026-10-23: 「这个提示里为啥把 email 打码了」 + B-24d8 — the page showed «[email protected]»,
 *   three languages stacked, and «(expired)» for a sign-in that had been cancelled or replaced):
 *   landingLang(acceptLanguage) → 'en' | 'zh' | 'ja' — the browser's FIRST language (the highest q; q=0 never counts) by
 *                  the app's own rule (src/lib/i18n.js resolveLang over navigator.language: zh* → zh, ja* → ja, else en).
 *   landingUser(address) → the address as HTML: escaped, its `@` written `&#64;`, between Cloudflare's documented
 *                  `<!--email_off-->` … `<!--/email_off-->` markers — a proxy's Email Address Obfuscation (Cloudflare
 *                  serves the hub's domain) rewrites a bare address into «[email protected]» plus a decode script that
 *                  the landing's CSP blocks, so the person saw the mask instead of their own address.
 *   LANDING_WHY[why][lang] — every refusal in its own words (a restart, past the state's 30 minutes, past the flow's own
 *                  limit, cancelled, replaced by a newer sign-in, …); none of them is a catch-all for another.
 */

const SM = require('./channels/slack-manifest.js');   // PURE → PURE: relayTargetVerdict — THE relay rule (docs/slack-relay/relay.js holds the same table)

const CALLBACK_BASE = '/api/channels/oauth/cb/';
/** The project's own public relay page (docs/slack-relay/, published on GitHub Pages) — the relay SETTING's default, which
 *  only a person's own app rides (addendum 1: a company preset never does). */
const RELAY_DEFAULT = SM.RELAY_DEFAULT;
const ROADS = Object.freeze(['relay', 'route', 'loopback']);
const WHYS = Object.freeze(['relay-page', 'https-address', 'asked', 'local-browser', 'no-address', 'not-https', 'bad-kind', 'desktop-client']);
const CLIENT_TYPES = Object.freeze(['web', 'desktop']);   // lane oauth-setup-instructions: a Google client's two kinds
const KIND_RE = /^[a-z][a-z0-9-]{1,19}$/;
const STATE_MAX = 1200;
const STATE_TTL_MS = 30 * 60e3;
const URL_MAX = 300;

/** A bare `http(s)://host[:port]` origin, canonical, or null. */
function originOf(o) {
  if (typeof o !== 'string' || !o || o.length > URL_MAX) return null;
  let u;
  try { u = new URL(o); } catch { return null; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
  return u.origin;
}
/** A host that is this machine's own loopback (127/8, ::1, localhost and *.localhost). */
function loopbackHost(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '[::1]' || h === '::1') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return !!v4 && Number(v4[1]) === 127 && v4.slice(1).every((x) => Number(x) <= 255);
}
/** Is the browser that pressed Connect on this machine? (its page's origin is a loopback address) */
function loopbackOrigin(origin) {
  const o = originOf(origin);
  return !!o && loopbackHost(new URL(o).hostname);
}
/** The instance's https address as a redirect base (`https://host[:port][/path]`, no query, no trailing slash), or ''
 *  — an http address, a loopback host, credentials, a query or a fragment are not a base a vendor can send a person to. */
function httpsBaseOf(url) {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s || s.length > URL_MAX) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || loopbackHost(u.hostname)) return '';
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** A relay page address as configured (`https://host[:port][/path]` — no credentials, query or fragment, never a
 *  loopback host), or '' — it is the vendor's registered redirect, so its spelling is kept byte for byte. */
function relayPageOf(url) {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s || s.length > URL_MAX || /\s/.test(s)) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || s.includes('#') || loopbackHost(u.hostname)) return '';
  return s;
}
/** lane oauth-relay-road: the relay a consent rides. ADDENDUM 1 (the owner, 2026-10-22: the public page is never part of a
 *  company app's configuration): a company preset (`preset` = its own relayUrl, '' when it names none) rides the cluster's
 *  own page — its own › the fleet's (the presets' fleet.json) — or none; any other client (`preset` null) the fleet's › the
 *  instance's setting (Settings → Channels, default the project's public page). `fleet` = the cluster's own page (it
 *  sends this instance's own https host back too); `who` = whose page. */
const NO_RELAY = Object.freeze({ url: '', fleet: false, who: null });
function relayPick({ fleet = '', preset = null, setting = '' } = {}) {
  const f = relayPageOf(fleet), own = relayPageOf(preset), s = relayPageOf(setting);
  if (preset !== null) return own ? { url: own, fleet: true, who: 'preset' } : f ? { url: f, fleet: true, who: 'fleet' } : NO_RELAY;
  if (f) return { url: f, fleet: true, who: 'fleet' };
  return s ? { url: s, fleet: false, who: 'page' } : NO_RELAY;
}

/** lane oauth-relay-road: the relay facts an adapter hands consentRoad — from the engine's consent deps (`fleetRelayUrl()`
 *  = the fleet's page — lane oauth-relay-one-source: the presets' fleet.json through the integration store, live —,
 *  `relayUrl()` = the kind's relay setting) and the account's credential (a company preset:
 *  its own `relayUrl`, and the setting is never read; a custom client rides the setting). → `{relayUrl, relayFleet}`. */
function relayOf(consent, cred) {
  const call = (f) => { try { return consent && typeof consent[f] === 'function' ? String(consent[f]() || '') : ''; } catch { return ''; } };
  const preset = cred && cred.source === 'cluster' ? (cred.values && typeof cred.values.relayUrl === 'string' ? cred.values.relayUrl : '') : null;
  const p = relayPick({ fleet: call('fleetRelayUrl'), preset, setting: preset === null ? call('relayUrl') : '' });
  return { relayUrl: p.url, relayFleet: p.fleet };
}

/** THE VERDICT: the relay page when one is known and it sends this browser back; else the route on the instance when
 *  it has an https address and the browser is elsewhere; else the loopback. */
function consentRoad({ kind, publicUrl = '', origin = null, road = null, relayUrl = '', relayFleet = false, clientType = '' } = {}) {
  // lane oauth-setup-instructions: a Web application client's loopback is the kind's FIXED registered one
  const loop = (why) => ({ road: 'loopback', redirectUri: null, base: null, u: null, why, ...(clientType === 'web' && why !== 'bad-kind' ? { fixed: true } : {}) });
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) return loop('bad-kind');
  if (road === 'loopback') return loop('asked');
  if (clientType === 'desktop') return loop('desktop-client');   // a Desktop client takes no https address: no relay, no route
  const base = httpsBaseOf(publicUrl);
  // lane oauth-relay-road: THE RELAY — `u` = the browser's own origin (the page that pressed Connect); the relay page
  // judges it by the ONE table (a private address; the fleet's relay also this instance's own https host)
  const page = relayPageOf(relayUrl), u = originOf(origin);
  const allow = relayFleet && base ? [new URL(base).hostname] : [];
  if (page && u && SM.relayTargetVerdict(u, { allow }) === 'redirect') return { road: 'relay', redirectUri: page, base: null, u, why: 'relay-page' };
  if (!base) return loop(typeof publicUrl === 'string' && publicUrl.trim() ? 'not-https' : 'no-address');
  if (loopbackOrigin(origin)) return loop('local-browser');
  return { road: 'route', redirectUri: `${base}${CALLBACK_BASE}${kind}`, base, u: originOf(base), why: 'https-address' };
}

const b64u = (s) => Buffer.from(String(s), 'utf8').toString('base64url');
/** The signed state of a route consent. `origin` = the instance address the browser comes back to (the relay page's `u`). */
function stateOf({ origin = '', flowId, issuedAt, kind }, sign) {
  if (typeof sign !== 'function') throw new Error('consent-road: stateOf needs the instance\'s signer');
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) throw new Error(`consent-road: a bad kind ${JSON.stringify(kind)}`);
  const clear = `v1.${b64u(JSON.stringify({ u: originOf(origin) || '', f: String(flowId), t: Math.floor(Number(issuedAt) / 1000), k: kind }))}`;
  return `${clear}.${sign(clear)}`;
}
/** Equal text, compared over the whole length (no early exit on the first differing character). */
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** `{ok, why: bad-shape | bad-hmac | wrong-kind | expired, parts: {flowId, origin}}` — the shape, THIS boot's HMAC, the
 *  kind, the age. The clear part is PEER-WRITTEN once it has left: bounded, parsed, every key checked. */
function stateVerdict(s, { sign, now = Date.now(), ttlMs = STATE_TTL_MS, kind } = {}) {
  const m = typeof s === 'string' && s.length <= STATE_MAX ? /^v1\.([A-Za-z0-9_-]{8,800})\.([A-Za-z0-9_-]{16,128})$/.exec(s) : null;
  if (!m) return { ok: false, why: 'bad-shape', parts: null };
  let j = null;
  try { j = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { j = null; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.f !== 'string' || !/^[a-f0-9]{8,64}$/.test(j.f) || !Number.isInteger(j.t) || j.t <= 0 || typeof j.u !== 'string') return { ok: false, why: 'bad-shape', parts: null };
  if (typeof sign !== 'function' || !sameText(String(sign(`v1.${m[1]}`)), m[2])) return { ok: false, why: 'bad-hmac', parts: null };
  if (j.k !== kind) return { ok: false, why: 'wrong-kind', parts: null };
  if (!(now - j.t * 1000 <= ttlMs) || j.t * 1000 - now > 60e3) return { ok: false, why: 'expired', parts: null };
  return { ok: true, why: null, parts: { flowId: j.f, origin: j.u || null } };
}

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
const escHtml = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** The person's address as the page prints it: escaped text (never raw HTML), its `@` as the entity `&#64;`, inside
 *  Cloudflare's exclusion markers — belt and braces against any proxy that rewrites an address it finds in HTML. */
function landingUser(address) {
  if (typeof address !== 'string' || !address) return '';
  return `<!--email_off-->${escHtml(address.slice(0, 200)).replace(/@/g, '&#64;')}<!--/email_off-->`;
}

/** The ONE inline script a landing page may run (the route's CSP names its sha256): a tab VibeSpace opened closes itself
 *  once the person has read «connected»; a tab the browser will not let a page close stays, saying so. */
const CLOSE_SCRIPT = 'setTimeout(function(){window.close()},2500)';
// lane oauth-landing-words: ONE language per page (landingLang), each sentence whole in it — `{why}` is a sentence of
// LANDING_WHY in the SAME language, never an English word inside a zh / ja line
const LANDING = Object.freeze({
  ok: Object.freeze({ en: 'VibeSpace: signed in to {name}{user}. This tab closes by itself — go back to VibeSpace, it finishes there.', zh: 'VibeSpace：已登录 {name}{user}。这个标签页会自己关闭——回到 VibeSpace，在那里完成。', ja: 'VibeSpace：{name} にサインインしました{user}。このタブは自動で閉じます — VibeSpace に戻ると、そちらで完了します。' }),
  denied: Object.freeze({ en: 'VibeSpace: the {name} sign-in was declined — nothing was connected. Close this tab and try again in VibeSpace.', zh: 'VibeSpace：{name} 登录被拒绝——什么也没连接。关掉这个标签页，回到 VibeSpace 再试一次。', ja: 'VibeSpace：{name} のサインインは拒否されました — 何も接続していません。このタブを閉じて、VibeSpace でもう一度お試しください。' }),
  'too-many': Object.freeze({ en: 'Too many sign-in pages were opened from this address in the last minute. Wait a minute, then reload this page — the sign-in is still waiting.', zh: '这个地址在一分钟内打开了太多登录页面。请等一分钟后刷新本页——登录仍在等待。', ja: 'このアドレスから直近 1 分間に開かれたサインインページが多すぎます。1 分待ってからこのページを再読み込みしてください — サインインはまだ待機中です。' }),
  failed: Object.freeze({ en: 'VibeSpace: this {name} sign-in did not finish. {why}', zh: 'VibeSpace：这次 {name} 登录没有完成。{why}', ja: 'VibeSpace：この {name} サインインは完了しませんでした。{why}' }),
});
/** What happened, per verdict — the state's (stateVerdict: bad-shape | bad-hmac | wrong-kind | expired), the engine's
 *  (wrong-flow), the flow's (oauth-loopback finishByState: used | timed-out | superseded | cancelled | over-limit |
 *  failed). `expired` is the STATE's age only (STATE_TTL_MS); the flow's own limit is `timed-out`. An unknown why reads
 *  `refused`, which claims nothing. */
const TTL_MIN = Math.round(STATE_TTL_MS / 60e3);
const LANDING_WHY = Object.freeze({
  'bad-hmac': Object.freeze({ en: 'It was started before VibeSpace restarted — start it again in VibeSpace.', zh: '它是在 VibeSpace 重启之前开始的——请回到 VibeSpace 重新开始。', ja: 'VibeSpace が再起動する前に始めたサインインです — VibeSpace でもう一度始めてください。' }),
  expired: Object.freeze({ en: `It took longer than ${TTL_MIN} minutes — start it again in VibeSpace.`, zh: `用时超过了 ${TTL_MIN} 分钟——请回到 VibeSpace 重新开始。`, ja: `${TTL_MIN} 分以上かかりました — VibeSpace でもう一度始めてください。` }),
  'timed-out': Object.freeze({ en: 'It was not finished in time, so VibeSpace stopped waiting for it — start it again in VibeSpace.', zh: '它没有及时完成，VibeSpace 已不再等待——请回到 VibeSpace 重新开始。', ja: '時間内に完了しなかったため、VibeSpace は待つのをやめました — VibeSpace でもう一度始めてください。' }),
  'bad-shape': Object.freeze({ en: 'The address this page was opened with is not a whole sign-in answer (it was cut or changed on the way) — start it again in VibeSpace.', zh: '打开这个页面的地址不是完整的登录应答（在路上被截断或改动了）——请回到 VibeSpace 重新开始。', ja: 'このページを開いたアドレスはサインインの応答として不完全です（途中で切れたか変更されました）— VibeSpace でもう一度始めてください。' }),
  'wrong-kind': Object.freeze({ en: 'This answer belongs to a sign-in for another kind of account, not {name} — start the {name} sign-in again in VibeSpace.', zh: '这个应答属于另一种账号的登录，不是 {name}——请回到 VibeSpace 重新开始 {name} 登录。', ja: 'この応答は {name} ではない別の種類のアカウントのサインインのものです — VibeSpace で {name} のサインインをもう一度始めてください。' }),
  'wrong-flow': Object.freeze({ en: 'VibeSpace is not waiting for this sign-in (it was cancelled, or it ended a while ago) — start it again in VibeSpace.', zh: 'VibeSpace 没有在等这次登录（它已被取消，或早已结束）——请回到 VibeSpace 重新开始。', ja: 'VibeSpace はこのサインインを待っていません（取り消されたか、しばらく前に終わっています）— VibeSpace でもう一度始めてください。' }),
  superseded: Object.freeze({ en: 'A newer sign-in of this account was started after it — finish that one.', zh: '在它之后，这个账号又开始了一次新的登录——请完成那一次。', ja: 'このあと、このアカウントの新しいサインインが始まりました — そちらを完了してください。' }),
  cancelled: Object.freeze({ en: 'It was cancelled in VibeSpace — start it again there if you still want it.', zh: '它已在 VibeSpace 里取消——如果还需要，请在那里重新开始。', ja: 'VibeSpace で取り消されました — まだ必要なら、そちらでもう一度始めてください。' }),
  'over-limit': Object.freeze({ en: 'Too many sign-ins were open at once, so this older one was ended — start it again in VibeSpace.', zh: '同时打开的登录太多，这次较早的已被结束——请回到 VibeSpace 重新开始。', ja: '同時に開いているサインインが多すぎたため、この古いサインインは終了しました — VibeSpace でもう一度始めてください。' }),
  used: Object.freeze({ en: 'It already finished — its answer is used once, so there is nothing left to do here. Go back to VibeSpace.', zh: '它已经完成过了——应答只能用一次，这里没有要做的了。回到 VibeSpace 即可。', ja: 'すでに完了しています — 応答は一度しか使えないため、ここですることはありません。VibeSpace に戻ってください。' }),
  failed: Object.freeze({ en: '{name} did not accept the exchange — the VibeSpace window where you started it says why.', zh: '{name} 没有接受这次交换——你开始登录的那个 VibeSpace 窗口里写着原因。', ja: '{name} が交換を受け付けませんでした — サインインを始めた VibeSpace のウィンドウに理由が表示されます。' }),
  refused: Object.freeze({ en: 'VibeSpace refused it — start it again in VibeSpace.', zh: 'VibeSpace 没有接受它——请回到 VibeSpace 重新开始。', ja: 'VibeSpace が受け付けませんでした — VibeSpace でもう一度始めてください。' }),
});
/** `r` = the engine's landing answer `{ok, why, user, error}`; `lang` = landingLang of the request (one paragraph, the
 *  page's own `lang`). Every piece escaped (the address through landingUser); the code and the state never appear. */
function landingHtml(r = {}, { name = 'the account', lang = 'en' } = {}) {
  const x = r && typeof r === 'object' ? r : {};
  const l = LANGS.includes(lang) ? lang : 'en';
  const kind = x.ok ? 'ok' : x.why === 'denied' ? 'denied' : x.why === 'too-many' ? 'too-many' : 'failed';
  const user = x.ok && typeof x.user === 'string' && x.user ? ` (${landingUser(x.user)})` : '';
  const nm = escHtml(String(name || 'the account').slice(0, 40));
  const why = (Object.prototype.hasOwnProperty.call(LANDING_WHY, x.why) ? LANDING_WHY[x.why] : LANDING_WHY.refused)[l];
  // the words are escaped as text FIRST, then the escaped pieces go in (the address is already HTML: landingUser)
  const fill = (t) => escHtml(t).replace('{why}', () => escHtml(why)).split('{name}').join(nm).replace('{user}', () => user);
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>VibeSpace · ${nm}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:36em;margin:3em auto;padding:0 1em}</style></head><body data-landing="${kind}"><p>${fill(LANDING[kind][l])}</p>${kind === 'ok' ? `<script>${CLOSE_SCRIPT}</script>` : ''}</body></html>`;
}

module.exports = { CALLBACK_BASE, RELAY_DEFAULT, ROADS, WHYS, CLIENT_TYPES, KIND_RE, STATE_MAX, STATE_TTL_MS, CLOSE_SCRIPT, LANDING, LANDING_WHY, LANGS, originOf, loopbackHost, loopbackOrigin, httpsBaseOf, relayPageOf, relayPick, relayOf, consentRoad, stateOf, stateVerdict, landingLang, landingUser, landingHtml };

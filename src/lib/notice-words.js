// A SERVER NOTICE IN THIS DEVICE's WORDS, and THE NOTICE OF THIS PAGE's OWN PRESS (B-2083 unit B, lane lg-recovery — 主开发 r5539).
//   noticeWords(msg, t) — a `server-notice` frame worded by THIS device's t(): its {key, params} (a param may be WORDS, `{key, params}`,
//     said in this language before the sentence fills — lane setting-doors pick 2), then each sentence of `then` (one, or a list: the
//     pool press's parts — only the parts that hold a conversation), each worded the same way; a frame with no key says its English.
//   markOwnNotice(key) / takeOwnNotice(key) — a press made ON THIS PAGE whose notice goes to every page is said HERE by the press's own
//     reply (its words say more); the pool's notice of it is for every OTHER page. The page knows its own press by the press's OWN MARK:
//     the id it sends with the press, which the hub makes the notice's key — marked BEFORE the press is sent (a notice can arrive before
//     the reply), read once (taken), never a timer. At most 64 marks are kept (a press whose notice never comes leaves its mark behind).
// PURE apart from the one Set of marks; imports nothing.
const OWN = new Set();
const OWN_MAX = 64;

export function markOwnNotice(key) {
  if (typeof key !== 'string' || !key) return false;
  OWN.add(key);
  while (OWN.size > OWN_MAX) OWN.delete(OWN.values().next().value);
  return true;
}

/** true (and the mark gone) when `key` is the notice of a press made on this page */
export function takeOwnNotice(key) { return typeof key === 'string' && OWN.delete(key); }

/** a fresh mark for a press this page is about to send (letters, digits, - and _: the hub takes 6–40 of them) */
export function newPressMark(prefix = 'p') {
  return String(prefix).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function noticeWords(msg, t) {
  const m = msg || {};
  const said = (ps) => Object.fromEntries(Object.entries(ps || {}).map(([k, v]) => [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key, v.params || undefined) : v]));
  if (!(m.i18n && typeof m.i18n.key === 'string' && m.i18n.key)) return m.text;
  const then = [].concat(m.i18n.then || []).filter((x) => x && typeof x.key === 'string' && x.key);
  return [t(m.i18n.key, said(m.i18n.params)), ...then.map((x) => t(x.key, said(x.params)))].join(' ');
}

'use strict';
/**
 * WHO IS THIS — an author as the owner reads it (lane lark-threads, PART B, 2026-10-01; the owner: "你有可能读取我在
 * lark里看到的人的名字（备注，机器人名字）吗？我发现有时候看不懂这里面都是谁" and "我在lark里看到的userN的名字是Ada
 * (Marketing)，你看看哪个接口返回这个了"). PURE (imports only channel-record's name door; CJS: the engine, the
 * client bundle and the suites share it).
 *
 * THE RULES (each pinned by scripts/test-channel-authors.mjs):
 *  N1 THE OWNER'S WORD WINS: a name the owner gave an author in VibeSpace (`alias`, the VibeSpace 备注 — Lark's own
 *     per-viewer remark is readable by no API: `contact/v3/users/:id` carries name / en_name / nickname / job_title /
 *     department_ids and NO remark) is the head, everywhere.
 *  N2 ELSE THE VENDOR'S WAY (Lark's own rendering): the nickname the organization gives the person (`alt.nickname`,
 *     the admin's alias — "展示在会话窗口、名片页、通讯录和搜索页面"), else the vendor `name`; then, when the setting
 *     `channels.larkNameField` names one, that profile field in parentheses (`Ada (Marketing)`).
 *  N3 THE VENDOR NAME STAYS: `author.name` is never rewritten — it is the title on every surface, the search key and
 *     what a filter's participant rule matches; the head is `author.display`.
 *  N4 AN EXTERNAL AUTHOR SAYS SO: `external: true` when the sender's tenant differs from the account's own (known
 *     without a call); a head's title says "external to your organization".
 *  N5 BOUNDED: every string through `peerName` (≤ 200; an alias ≤ ALIAS_MAX), a display ≤ DISPLAY_MAX.
 */
const { peerName } = require('./channel-record.js');

const NAME_FIELDS = Object.freeze(['none', 'department', 'jobTitle']);
const ALIAS_MAX = 80;
const DISPLAY_MAX = 200;
const ALT_KEYS = Object.freeze(['enName', 'nickname', 'jobTitle', 'department']);

/** The owner's alias as stored: peerName-cleaned, ≤ ALIAS_MAX; '' = clear. */
function cleanAlias(v) {
  if (v === null || v === undefined) return '';
  return peerName(String(v), ALIAS_MAX) || '';
}
/** An author's profile alternatives (`alt`), only the non-empty keys, each a bounded name; null when none. */
function cleanAlt(alt) {
  if (!alt || typeof alt !== 'object') return null;
  const out = {};
  for (const k of ALT_KEYS) { const v = peerName(alt[k] == null ? '' : String(alt[k]), 200); if (v) out[k] = v; }
  return Object.keys(out).length ? out : null;
}
/** N2: the vendor's way — nickname else name, then `(field)` when the setting names one and the profile has it. */
function vendorDisplay(author, field = 'department') {
  const a = author && typeof author === 'object' ? author : {};
  const alt = cleanAlt(a.alt) || {};
  const head = alt.nickname || peerName(a.name == null ? '' : String(a.name), 200) || '';
  const f = NAME_FIELDS.includes(field) && field !== 'none' ? alt[field] : '';
  return (head && f ? `${head} (${f})` : head).slice(0, DISPLAY_MAX);
}
/**
 * THE VIEW: the author with `display` (N1 alias › N2 vendor way › id), `alias` when set, `external` (N4) — `name`
 * unchanged (N3). `selfTenant` + `tenant` (the record's sender tenant) decide `external` when the record did not.
 */
function authorView(author, { alias = '', field = 'department', selfTenant = null, tenant = null } = {}) {
  const a = author && typeof author === 'object' ? author : {};
  const out = { ...a };
  const al = cleanAlias(alias);
  const alt = cleanAlt(a.alt);
  if (alt) out.alt = alt; else delete out.alt;
  if (al) out.alias = al; else delete out.alias;
  if (a.external !== true && selfTenant && tenant && String(tenant) !== String(selfTenant) && !a.isBot) out.external = true;
  // `vendorDisplay` = the head WITHOUT the owner's name (a cleared alias restores it — the client keeps it on the head)
  out.vendorDisplay = vendorDisplay(out, field) || peerName(a.id == null ? '' : String(a.id), 200) || '';
  out.display = al || out.vendorDisplay;
  return out;
}
/** What a head's TITLE says (the client words it): the vendor name when the display differs, the alternatives, external. */
function titleFacts(author) {
  const a = author && typeof author === 'object' ? author : {};
  const name = peerName(a.name == null ? '' : String(a.name), 200) || '';
  return { name: a.display && a.display !== name ? name : '', alt: cleanAlt(a.alt), external: a.external === true, alias: !!a.alias };
}

module.exports = { NAME_FIELDS, ALIAS_MAX, DISPLAY_MAX, ALT_KEYS, cleanAlias, cleanAlt, vendorDisplay, authorView, titleFacts };

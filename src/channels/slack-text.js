'use strict';
/**
 * SLACK'S MESSAGE SHAPES → THE CLOSED RENDER TREE, AND BACK (design 012 D10, research §2.7). PURE: no I/O. Required
 * by src/channels/slack.js at ingest and by the engine at read time (`slackStoredBlocks` — the rung for a stored
 * record).
 *
 * A Slack message carries up to FOUR layers — `text` (mrkdwn, the fallback), `blocks` (an end user's message is
 * always `rich_text`; a bot may send any Block Kit block), legacy `attachments` (colour bar, title, fields), and
 * `files`. Each lands in the EXISTING block kinds (src/channel-record.js BLOCK_KINDS / RUN_KINDS — no schema change):
 *   · rich_text: sections → `p` of runs (bold `b`, italic `i`, code `code`, STRIKETHROUGH AS PLAIN TEXT, a link `a`,
 *     a person `at`, a group / broadcast `at` with its own id — never a person's), lists → "• " / "1. " paragraphs,
 *     preformatted → `code`, quote → `quote`;
 *   · section / header / context / divider / image → `p` / bold `p` / `p` / `hr` / a link paragraph (a picture on a
 *     foreign host is never fetched — the link is shown);
 *   · ANY OTHER block (actions, input, table, a block Slack invents next year) → a `card` TITLED WITH ITS TYPE over
 *     the words found in it (never silently dropped — the research's rule);
 *   · a legacy attachment → a `card` (title, pretext, text, fields as "title: value", footer);
 *   · a file → `img` / `file` by attachment id (the bytes only through our route), a clip's transcript as words.
 * `text` — what an AGENT is handed — is the mrkdwn with every entity resolved to words (`<@U1>` → `@Alice`,
 * `<#C1|x>` → `#x`, `<!here>` → `@here`, `<url|label>` → `label (url)`), the three escapes undone, plus the legacy
 * attachments' and files' words. Every parser is BOUND BEFORE IT PARSES (TEXT_MAX characters, a block / element
 * count) and linear (scripts/test-peer-parsers.mjs).
 *
 * THE SEND SIDE: `toMrkdwn(text, mentions)` escapes `& < >` (Slack's only three) and turns an `@Name` the proposal
 * resolved (`mentions` — decided ONCE when it was proposed) into `<@U…>`; any other `@word` stays words (it notifies
 * nobody). `@here` / `@channel` / `@everyone` stay words too: S1 never broadcasts.
 */
const TEXT_MAX = 40000;            // Slack's own message bound is 40 000 characters (chat.postMessage truncates past it)
const SEND_MAX = 4000;             // what a proposal may send in one message (chat.postMessage's recommended bound)
const BLOCKS_MAX = 50;             // Slack's own per-message block bound
const ELEMENTS_MAX = 400;          // inline elements read per message (a hostile tree is cut, never walked whole)
const ATTACHMENTS_MAX = 20;        // legacy attachments read per message
const FILES_MAX = 20;
const FIELD_MAX = 2000;            // one string inside a block or an attachment
const ENTITY_RE = /<([^<>\n]{1,1200})>/g;
const ID_RE = /^[A-Z0-9][A-Z0-9_]{1,40}$/;
const unescape = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const cut = (s, n = FIELD_MAX) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) : s) : '');
const nameOf = (m, id) => { const v = m && typeof m.get === 'function' ? m.get(id) : null; return typeof v === 'string' && v ? v : null; };

/** THE STANDARD EMOJI the picker offers and a reaction key is drawn with (Slack has no name → character API —
 *  research §2.3, UNCONFIRMED; this is the common set, scripts/fixtures/slack-emoji.json pins it). */
const SLACK_EMOJI = Object.freeze([
  ['+1', '👍', 'thumbs up'], ['-1', '👎', 'thumbs down'], ['thumbsup', '👍', 'thumbs up'], ['thumbsdown', '👎', 'thumbs down'],
  ['white_check_mark', '✅', 'check mark'], ['heavy_check_mark', '✔️', 'check'], ['x', '❌', 'cross'], ['eyes', '👀', 'eyes'],
  ['raised_hands', '🙌', 'raised hands'], ['clap', '👏', 'clap'], ['pray', '🙏', 'thanks'], ['tada', '🎉', 'celebrate'],
  ['heart', '❤️', 'heart'], ['fire', '🔥', 'fire'], ['rocket', '🚀', 'rocket'], ['100', '💯', 'hundred'],
  ['joy', '😂', 'laughing'], ['smile', '😄', 'smile'], ['slightly_smiling_face', '🙂', 'smile'], ['thinking_face', '🤔', 'thinking'],
  ['ok_hand', '👌', 'ok'], ['muscle', '💪', 'strong'], ['wave', '👋', 'wave'], ['bulb', '💡', 'idea'],
  ['warning', '⚠️', 'warning'], ['question', '❓', 'question'], ['exclamation', '❗', 'exclamation'], ['sob', '😭', 'crying'],
  ['sweat_smile', '😅', 'sweat smile'], ['grinning', '😀', 'grin'], ['hugging_face', '🤗', 'hug'], ['star', '⭐', 'star'],
  ['white_circle', '⚪', 'white circle'], ['red_circle', '🔴', 'red circle'], ['large_green_circle', '🟢', 'green circle'], ['memo', '📝', 'memo'],
  ['calendar', '📆', 'calendar'], ['hourglass', '⌛', 'hourglass'], ['point_up', '☝️', 'point up'], ['see_no_evil', '🙈', 'see no evil'],
].map(([key, glyph, label]) => Object.freeze({ key, glyph, label })));
const SLACK_QUICK = Object.freeze(['+1', 'white_check_mark', 'eyes', 'pray', 'tada', 'heart', 'joy', 'raised_hands']);
const EMOJI_BY_KEY = new Map(SLACK_EMOJI.map((e) => [e.key, e.glyph]));
/** A reaction / emoji NAME as drawn: the table's glyph, else `:name:` (a skin tone suffix keeps the base glyph). */
function emojiText(name, unicode = null) {
  const n = String(name == null ? '' : name).slice(0, 100);
  if (typeof unicode === 'string' && /^[0-9a-f]{2,6}(-[0-9a-f]{2,6}){0,6}$/i.test(unicode)) {
    try { return String.fromCodePoint(...unicode.split('-').map((h) => parseInt(h, 16))); } catch { /* the name below */ }
  }
  const base = n.split('::')[0];
  return EMOJI_BY_KEY.get(base) || `:${n}:`;
}

/** ONE mrkdwn entity (`<…>` inner) → {kind, id?, label, href?}. Bounded by ENTITY_RE's 1 200 characters. */
function readEntity(inner, ctx = {}) {
  const bar = inner.indexOf('|');
  const head = bar >= 0 ? inner.slice(0, bar) : inner;
  const label = bar >= 0 ? unescape(inner.slice(bar + 1)) : '';
  if (head[0] === '@') {
    const id = head.slice(1);
    if (!ID_RE.test(id)) return { kind: 'text', label: unescape(`<${inner}>`) };
    return { kind: 'person', id, label: `@${label || nameOf(ctx.users, id) || id}` };
  }
  if (head[0] === '#') {
    const id = head.slice(1);
    return { kind: 'channel', id, label: `#${label || nameOf(ctx.channels, id) || id}` };
  }
  if (head[0] === '!') {
    const word = head.slice(1);
    if (word === 'here' || word === 'channel' || word === 'everyone') return { kind: 'broadcast', id: `!${word}`, label: `@${word}` };
    if (word.startsWith('subteam^')) { const id = word.slice(8); return { kind: 'group', id: ID_RE.test(id) ? id : 'subteam', label: label || '@group' }; }
    if (word.startsWith('date^')) return { kind: 'text', label: label || word.split('^')[1] || '' };
    return { kind: 'text', label: label || word };
  }
  const href = unescape(head);
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'link', href, label: label || href.replace(/^mailto:/i, '') };
  return { kind: 'text', label: unescape(`<${inner}>`) };
}

/** mrkdwn → the agent's words + the mentions it carries. Cut to TEXT_MAX before any regex. */
function mrkdwnText(src, ctx = {}) {
  const s = cut(typeof src === 'string' ? src : '', TEXT_MAX);
  const mentions = [];
  let out = '', last = 0, m;
  ENTITY_RE.lastIndex = 0;
  while ((m = ENTITY_RE.exec(s))) {
    out += unescape(s.slice(last, m.index));
    const e = readEntity(m[1], ctx);
    if (e.kind === 'link') out += e.label && e.label !== e.href && e.label !== e.href.replace(/^mailto:/i, '') ? `${e.label} (${e.href})` : e.label;
    else out += e.label;
    if ((e.kind === 'person' || e.kind === 'broadcast' || e.kind === 'group') && mentions.length < 256) mentions.push({ id: e.id, name: e.label.replace(/^@/, ''), kind: e.kind });
    last = m.index + m[0].length;
  }
  out += unescape(s.slice(last));
  return { text: out, mentions };
}

/** mrkdwn → runs (one paragraph line): entities, `code`, *bold*, _italic_, ~strike~ (plain). Linear: each scan
 *  stops at the next marker of its own kind. */
const INLINE_RE = /<([^<>\n]{1,1200})>|`([^`\n]{1,2000})`|\*([^*\n]{1,2000})\*|_([^_\n]{1,2000})_|~([^~\n]{1,2000})~/g;
function mrkdwnRuns(line, ctx = {}) {
  const runs = [];
  let last = 0, m;
  const push = (r) => { if (r.k === 't' && !r.text) return; const p = runs[runs.length - 1]; if (r.k === 't' && p && p.k === 't') p.text += r.text; else runs.push(r); };
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(line))) {
    push({ k: 't', text: unescape(line.slice(last, m.index)) });
    if (m[1] !== undefined) {
      const e = readEntity(m[1], ctx);
      if (e.kind === 'link') push({ k: 'a', href: e.href, text: e.label });
      else if (e.kind === 'person' || e.kind === 'broadcast' || e.kind === 'group') push({ k: 'at', id: e.id, name: e.label.replace(/^@/, '') });
      else push({ k: 't', text: e.label });
    } else if (m[2] !== undefined) push({ k: 'code', text: unescape(m[2]) });
    else if (m[3] !== undefined) push({ k: 'b', text: unescape(m[3]) });
    else if (m[4] !== undefined) push({ k: 'i', text: unescape(m[4]) });
    else push({ k: 't', text: unescape(m[5]) });
    last = m.index + m[0].length;
  }
  push({ k: 't', text: unescape(line.slice(last)) });
  return runs;
}
/** mrkdwn → blocks: ``` fences → `code`, `>` lines → `quote`, the rest → paragraphs (one per line run). */
function mrkdwnBlocks(src, ctx = {}) {
  const s = cut(typeof src === 'string' ? src : '', TEXT_MAX);
  if (!s.trim()) return [];
  const lines = s.split('\n');
  const out = [];
  let para = [], quote = [], code = null;
  const flushPara = () => { if (para.length) { const runs = []; const add = (r) => { const p = runs[runs.length - 1]; if (r.k === 't' && p && p.k === 't') p.text += r.text; else runs.push(r); }; para.forEach((l, i) => { if (i) add({ k: 't', text: '\n' }); for (const r of mrkdwnRuns(l, ctx)) add(r); }); out.push({ k: 'p', runs }); para = []; } };
  const flushQuote = () => { if (quote.length) { out.push({ k: 'quote', blocks: mrkdwnBlocks(quote.join('\n'), { ...ctx, depth: (ctx.depth || 0) + 1 }), lines: quote.length }); quote = []; } };
  for (const l of lines) {
    if (code !== null) { if (l.trimEnd().endsWith('```')) { const tail = l.replace(/```\s*$/, ''); if (tail) code.push(tail); out.push({ k: 'code', text: unescape(code.join('\n')) }); code = null; } else code.push(l); continue; }
    if (l.startsWith('```')) {
      flushPara(); flushQuote();
      const rest = l.slice(3);
      if (rest.trimEnd().endsWith('```') && rest.trim().length >= 3) out.push({ k: 'code', text: unescape(rest.replace(/```\s*$/, '')) });
      else code = rest ? [rest] : [];
      continue;
    }
    if ((ctx.depth || 0) < 4 && (l.startsWith('&gt;') || l.startsWith('>'))) { flushPara(); quote.push(l.replace(/^(&gt;|>) ?/, '')); continue; }
    flushQuote();
    if (!l.trim()) { flushPara(); continue; }
    para.push(l);
  }
  if (code !== null) out.push({ k: 'code', text: unescape(code.join('\n')) });
  flushPara(); flushQuote();
  return out;
}

/** ONE rich_text inline element → runs (+ mentions). */
function elementRuns(el, ctx, mentions) {
  if (!el || typeof el !== 'object') return [];
  const st = el.style && typeof el.style === 'object' ? el.style : {};
  switch (el.type) {
    case 'text': {
      const text = cut(el.text);
      if (st.code) return [{ k: 'code', text }];
      if (st.bold) return [{ k: 'b', text }];
      if (st.italic) return [{ k: 'i', text }];
      return [{ k: 't', text }];   // strikethrough reads as plain text (D10: no run kind for it)
    }
    case 'link': { const href = cut(el.url); return [{ k: 'a', href, text: cut(el.text) || href }]; }
    case 'user': { const id = String(el.user_id || ''); const name = nameOf(ctx.users, id) || id; if (mentions.length < 256) mentions.push({ id, name, kind: 'person' }); return [{ k: 'at', id, name }]; }
    case 'usergroup': { const id = String(el.usergroup_id || 'subteam'); if (mentions.length < 256) mentions.push({ id, name: 'group', kind: 'group' }); return [{ k: 'at', id, name: 'group' }]; }
    case 'broadcast': { const w = ['here', 'channel', 'everyone'].includes(el.range) ? el.range : 'here'; if (mentions.length < 256) mentions.push({ id: `!${w}`, name: w, kind: 'broadcast' }); return [{ k: 'at', id: `!${w}`, name: w }]; }
    case 'channel': { const id = String(el.channel_id || ''); return [{ k: 't', text: `#${nameOf(ctx.channels, id) || id}` }]; }
    case 'emoji': return [{ k: 't', text: emojiText(el.name, el.unicode) }];
    case 'date': return [{ k: 't', text: cut(el.fallback) || String(el.timestamp || '') }];
    case 'team': return [{ k: 't', text: String(el.team_id || '') }];
    default: return [{ k: 't', text: cut(el.text) || `[${String(el.type || 'element').slice(0, 40)}]` }];
  }
}
const plainOfRuns = (runs) => runs.map((r) => (r.k === 'at' ? `@${r.name}` : r.k === 'a' ? (r.text && r.text !== r.href ? `${r.text} (${r.href})` : r.href) : r.text)).join('');
/** The words of ANY block (a fallback card's lines): every `text` string found, depth- and count-bounded. */
function wordsOf(v, out = [], depth = 0) {
  if (out.length >= 30 || depth > 6 || v === null || v === undefined) return out;
  if (typeof v === 'string') return out;
  if (Array.isArray(v)) { for (const x of v.slice(0, 50)) wordsOf(x, out, depth + 1); return out; }
  if (typeof v === 'object') {
    if (typeof v.text === 'string' && v.text.trim()) out.push(cut(v.text, 400));
    else if (v.text && typeof v.text === 'object' && typeof v.text.text === 'string' && v.text.text.trim()) out.push(cut(v.text.text, 400));
    for (const k of ['elements', 'fields', 'accessory', 'options', 'rows', 'columns', 'items']) if (v[k] !== undefined) wordsOf(v[k], out, depth + 1);
  }
  return out;
}

/** rich_text / Block Kit → {blocks, words (the agent's lines), mentions}. Bound: BLOCKS_MAX blocks, ELEMENTS_MAX elements. */
function blockKitBlocks(list, ctx = {}) {
  const blocks = [], words = [], mentions = [];
  let budget = ELEMENTS_MAX;
  const sectionRuns = (sec) => {
    const runs = [];
    for (const el of (Array.isArray(sec && sec.elements) ? sec.elements : []).slice(0, Math.max(0, budget))) { budget--; runs.push(...elementRuns(el, ctx, mentions)); }
    return runs;
  };
  const fromText = (t) => {
    if (!t || typeof t !== 'object') return [];
    if (t.type === 'plain_text') return [{ k: 't', text: cut(t.text) }];
    const r = mrkdwnText(cut(t.text), ctx);
    for (const x of r.mentions) if (mentions.length < 256) mentions.push(x);
    return mrkdwnRuns(cut(t.text).replace(/\n/g, ' '), ctx);
  };
  const richText = (rt, out, depth) => {
    for (const el of (Array.isArray(rt && rt.elements) ? rt.elements : []).slice(0, BLOCKS_MAX)) {
      if (budget <= 0) break;
      if (!el || typeof el !== 'object') continue;
      if (el.type === 'rich_text_section') { const runs = sectionRuns(el); if (runs.length) { out.push({ k: 'p', runs }); words.push(plainOfRuns(runs)); } }
      else if (el.type === 'rich_text_list') {
        const ordered = el.style === 'ordered';
        const pad = '  '.repeat(Math.max(0, Math.min(4, Number(el.indent) || 0)));
        (Array.isArray(el.elements) ? el.elements : []).slice(0, 100).forEach((it, i) => {
          if (budget <= 0) return;
          const runs = [{ k: 't', text: `${pad}${ordered ? `${(Number(el.offset) || 0) + i + 1}. ` : '• '}` }, ...sectionRuns(it)];
          out.push({ k: 'p', runs }); words.push(plainOfRuns(runs));
        });
      } else if (el.type === 'rich_text_preformatted') { const runs = sectionRuns(el); const text = plainOfRuns(runs); out.push({ k: 'code', text }); words.push(text); }
      else if (el.type === 'rich_text_quote') {
        const runs = sectionRuns(el);
        if (depth < 4) { out.push({ k: 'quote', blocks: runs.length ? [{ k: 'p', runs }] : [], lines: 1 }); words.push(`> ${plainOfRuns(runs)}`); }
      } else {
        const ws = wordsOf(el);
        out.push({ k: 'card', title: String(el.type || 'element').slice(0, 60), lines: ws.slice(0, 20) }); words.push(...ws);
      }
    }
  };
  for (const b of (Array.isArray(list) ? list : []).slice(0, BLOCKS_MAX)) {
    if (budget <= 0 || !b || typeof b !== 'object') continue;
    switch (b.type) {
      case 'rich_text': richText(b, blocks, 0); break;
      case 'section': {
        const runs = fromText(b.text);
        if (runs.length) { blocks.push({ k: 'p', runs }); words.push(plainOfRuns(runs)); }
        for (const f of (Array.isArray(b.fields) ? b.fields : []).slice(0, 10)) { const fr = fromText(f); if (fr.length) { blocks.push({ k: 'p', runs: fr }); words.push(plainOfRuns(fr)); } }
        break;
      }
      case 'header': { const text = cut(b.text && b.text.text); if (text) { blocks.push({ k: 'p', runs: [{ k: 'b', text }] }); words.push(text); } break; }
      case 'context': {
        const runs = [];
        for (const el of (Array.isArray(b.elements) ? b.elements : []).slice(0, 10)) if (el && el.type !== 'image') runs.push(...fromText(el));
        if (runs.length) { blocks.push({ k: 'p', runs }); words.push(plainOfRuns(runs)); }
        break;
      }
      case 'divider': blocks.push({ k: 'hr' }); break;
      case 'image': {
        const href = cut(b.image_url); const alt = cut(b.alt_text) || cut(b.title && b.title.text) || 'image';
        blocks.push({ k: 'p', runs: [{ k: 'a', href, text: `[${alt}]` }] }); words.push(`[image: ${alt}]`);
        break;
      }
      default: {
        // an UNKNOWN block — a card titled with its type over the words in it, never dropped silently
        const ws = wordsOf(b);
        blocks.push({ k: 'card', title: String(b.type || 'block').slice(0, 60), lines: ws.slice(0, 20) });
        if (ws.length) words.push(...ws);
      }
    }
  }
  return { blocks, words, mentions };
}

/** Legacy secondary attachments → cards + words. */
function legacyCards(list, ctx = {}) {
  const blocks = [], words = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, ATTACHMENTS_MAX)) {
    if (!a || typeof a !== 'object') continue;
    const title = cut(a.title, 400) || cut(a.author_name, 400) || cut(a.service_name, 400) || '';
    const lines = [];
    if (a.pretext) lines.push(mrkdwnText(cut(a.pretext), ctx).text);
    if (a.text) lines.push(mrkdwnText(cut(a.text), ctx).text);
    for (const f of (Array.isArray(a.fields) ? a.fields : []).slice(0, 20)) if (f && (f.title || f.value)) lines.push(`${cut(f.title, 200)}${f.title && f.value ? ': ' : ''}${mrkdwnText(cut(f.value, 800), ctx).text}`);
    if (!lines.length && a.fallback) lines.push(mrkdwnText(cut(a.fallback), ctx).text);
    if (a.title_link) lines.push(cut(a.title_link, 2048));
    if (a.footer) lines.push(cut(a.footer, 300));
    if (!title && !lines.length) continue;
    blocks.push({ k: 'card', title, lines: lines.slice(0, 40).map((l) => l.slice(0, 2000)) });
    words.push([title, ...lines].filter(Boolean).join(' — '));
  }
  return { blocks, words };
}

/** A message's files → attachments (by id) + blocks + words (a clip's transcript is words). */
function filesOf(list) {
  const attachments = [], blocks = [], words = [];
  for (const f of (Array.isArray(list) ? list : []).slice(0, FILES_MAX)) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !ID_RE.test(f.id)) continue;
    if (f.mode === 'tombstone' || f.mode === 'hidden_by_limit') { words.push(`[file not available${f.mode === 'hidden_by_limit' ? ' on this plan' : ''}]`); continue; }
    const mime = typeof f.mimetype === 'string' ? f.mimetype.slice(0, 128) : null;
    const name = cut(f.name || f.title || '', 256) || 'file';   // a file with no name is a file, never its id
    attachments.push({ id: f.id, name, bytes: Number.isFinite(Number(f.size)) ? Number(f.size) : null, mime });
    blocks.push({ k: mime && /^image\//.test(mime) ? 'img' : 'file', attachmentId: f.id });
    words.push(`[${mime && /^image\//.test(mime) ? 'image' : 'file'}: ${name}]`);
    const tr = f.transcription && typeof f.transcription === 'object' ? f.transcription : null;
    const preview = tr && tr.preview && typeof tr.preview === 'object' ? tr.preview : null;
    const said = preview && typeof preview.content === 'string' ? preview.content : (tr && typeof tr.content === 'string' ? tr.content : '');
    if (said) { const t = cut(said, 8000); blocks.push({ k: 'quote', blocks: [{ k: 'p', runs: [{ k: 't', text: t }] }], lines: 1, attribution: 'transcript' }); words.push(`[transcript] ${t}`); }
  }
  return { attachments, blocks, words };
}

/** What a SUBTYPE says in words (never the raw subtype printed): null = an ordinary message. */
const SUBTYPE_SYS = Object.freeze({
  channel_join: 'system', channel_leave: 'system', group_join: 'system', group_leave: 'system', channel_topic: 'system', channel_purpose: 'system',
  channel_name: 'system', channel_archive: 'system', channel_unarchive: 'system', pinned_item: 'system', unpinned_item: 'system',
  huddle_thread: 'call', tombstone: 'deleted', ekm_access_denied: 'unknown',
});
const EKM_TEXT = '[this message is hidden by your organization\'s key management]';

/**
 * ONE Slack message → `{text, blocks, mentions, attachments}` (the record's words, tree, mentions, files).
 * ctx = {users: Map id→name, channels: Map id→name}.
 */
function messageParts(msg, ctx = {}) {
  const m = msg && typeof msg === 'object' ? msg : {};
  const sub = typeof m.subtype === 'string' ? m.subtype : '';
  const base = mrkdwnText(m.text, ctx);
  const mentions = base.mentions.slice();
  let blocks = [];
  const words = [];
  if (sub === 'ekm_access_denied') return { text: EKM_TEXT, blocks: [{ k: 'sys', what: 'unknown', text: EKM_TEXT }], mentions: [], attachments: [] };
  const kit = Array.isArray(m.blocks) && m.blocks.length ? blockKitBlocks(m.blocks, ctx) : null;
  if (kit && kit.blocks.length) {
    blocks = kit.blocks;
    for (const x of kit.mentions) if (!mentions.some((y) => y.id === x.id) && mentions.length < 256) mentions.push(x);
  } else blocks = mrkdwnBlocks(m.text, ctx);
  if (SUBTYPE_SYS[sub]) blocks = [{ k: 'sys', what: SUBTYPE_SYS[sub], text: base.text.slice(0, 2000) || sub }];
  if (sub === 'me_message') blocks = [{ k: 'p', runs: [{ k: 'i', text: base.text }] }];
  const leg = legacyCards(m.attachments, ctx);
  const fl = filesOf(m.files);
  blocks = blocks.concat(leg.blocks, fl.blocks);
  // the agent's words: the mrkdwn's (always — Slack's own fallback), else the blocks' when the text is empty
  let text = base.text;
  if (!text.trim() && kit && kit.words.length) text = kit.words.join('\n');
  else if (kit && kit.blocks.some((b) => b.k === 'card')) for (const b of kit.blocks) if (b.k === 'card' && b.lines.length) words.push(`[${b.title}] ${b.lines.join(' · ')}`);
  words.push(...leg.words, ...fl.words);
  if (words.length) text = [text, ...words].filter((x) => x && x.trim()).join('\n');
  return { text: text.slice(0, TEXT_MAX), blocks, mentions, attachments: fl.attachments };
}

/** The rung for a STORED record (`caps.render:'blocks'` → `blocksOf`): its flattened text through the mrkdwn reader
 *  (the entities were resolved at ingest, so this is paragraphs, quotes and code), its files as pictures / chips. */
function slackStoredBlocks(record) {
  const r = record && typeof record === 'object' ? record : {};
  const blocks = mrkdwnBlocks(typeof r.text === 'string' ? r.text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) : '', {});
  for (const a of (Array.isArray(r.attachments) ? r.attachments : []).slice(0, FILES_MAX)) if (a && a.id) blocks.push({ k: a.mime && /^image\//.test(a.mime) ? 'img' : 'file', attachmentId: String(a.id) });
  return blocks;
}

// ── THE SEND SIDE ──────────────────────────────────────────────────────────
/** The `@Name` tokens a text carries (the candidates `prepareSend` resolves): `@` + up to 80 name characters, at a
 *  word start; e-mail addresses (`a@b`) are not mentions. Bounded: the first SEND_MAX × 2 characters, ≤ 50 names. */
const AT_RE = /(^|[\s(\[{,;:!?"'“‘（「])@([\p{L}\p{N}][\p{L}\p{N}._'-]{0,79})/gu;
function atNames(text) {
  const s = String(text == null ? '' : text).slice(0, SEND_MAX * 2);
  const out = [];
  let m;
  AT_RE.lastIndex = 0;
  while ((m = AT_RE.exec(s)) && out.length < 50) {
    const n = m[2].replace(/[.'-]+$/, '');
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}
const BROADCAST_WORDS = Object.freeze(['here', 'channel', 'everyone']);
/** Slack's three escapes, then each RESOLVED `@Name` → `<@U…>` (longest name first; a name never matched inside a
 *  longer word). `mentions` = [{name, id}] decided at propose time; anything else stays words. */
function toMrkdwn(text, mentions = []) {
  let s = String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = (Array.isArray(mentions) ? mentions : []).filter((x) => x && typeof x.name === 'string' && x.name && typeof x.id === 'string' && ID_RE.test(x.id)).sort((a, b) => b.name.length - a.name.length).slice(0, 50);
  for (const x of list) {
    const esc = x.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(^|[\\s(\\[{,;:!?"'“‘（「])@${esc}(?![\\p{L}\\p{N}_])`, 'gu'), (all, pre) => `${pre}<@${x.id}>`);
  }
  return s;
}


/** THE DECLARED EGRESS (test-channels-egress): a PURE module — it constructs no request of its own (slack.js does). */
const EGRESS = Object.freeze([]);
module.exports = {
  EGRESS,
  TEXT_MAX, SEND_MAX, BLOCKS_MAX, ELEMENTS_MAX, ATTACHMENTS_MAX, FILES_MAX, SLACK_EMOJI, SLACK_QUICK, SUBTYPE_SYS, EKM_TEXT, BROADCAST_WORDS,
  emojiText, readEntity, mrkdwnText, mrkdwnRuns, mrkdwnBlocks, blockKitBlocks, legacyCards, filesOf, messageParts, slackStoredBlocks, atNames, toMrkdwn,
};

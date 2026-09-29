#!/usr/bin/env node
// THE PEER-BYTE PARSER CENSUS (lane channel-rich SECURITY verify round 2, 2026-09-28; gate row `test-peer-parsers`,
// fast). The lesson of round 1 and round 2: every reader of PEER-CONTROLLED bytes that was not on a timer was
// quadratic somewhere — the mail sanitizer (round 1, 15 s at 64 KB), the Lark tag regex (round 1, 1.7 s per record),
// and then Gmail's `stripHtml` (round 2: the agent's text of an HTML-only mail, run at INGEST — 64 KB of `<` = 1.2 s,
// 128 KB = 4.7 s of the event loop, no cap) and `parseAddress` (the From header: 64 KB of `<` = 1.4 s) — two parsers
// round 1's census never listed. So the census is DERIVED, not hand-written:
//
//  ① EVERY exported function of the modules that read channel peer bytes (src/mail-frame.js, src/channel-blocks.js,
//    src/channel-record.js, src/channels/gmail.js, src/channels/lark.js) is either a ROW below or in EXCLUDED with
//    a reason — a new export goes RED until it is placed
//  ② every ROW has a SIZE CAP proven by an input over it (refused by name, or the work bounded to the cap)
//  ③ every ROW is LINEAR on its own adversarial shapes: t(2n) ≤ 2.5 × t(n) at n = 64 KB / 128 KB (a capped parser
//    is judged at cap/2 and cap; a parser under 15 ms at 2n is trivially fast — the ratio pin then holds by the
//    floor, never by noise), min of 5 runs, the base repeated to ≥ 25 ms — the FLOOR IS ASKED FIRST (one call of the
//    2n input, min of 5): a shape already under it never pays for the ratio (35 s → 8 s, THE TIER RULE's 10 s)
//  ④ CONTROLS: patched copies restoring round 1's per-quote newline scan in the mail sanitizer and round 2's regex
//    chain in stripHtml go RED on ③ under the same judge
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + String(e).slice(0, 700) : '')); } };
const J = JSON.stringify;
const MF = require(path.join(REPO, 'src/mail-frame.js'));
const B = require(path.join(REPO, 'src/channel-blocks.js'));
const R = require(path.join(REPO, 'src/channel-record.js'));
const G = require(path.join(REPO, 'src/channels/gmail.js'));
const L = require(path.join(REPO, 'src/channels/lark.js'));
const K = 1024;
const TEXT_CAP = R.BLOCK_LIMITS.text;   // 64 KiB — the block readers cut their input here (`bounded()`)

/** A row: the parser (over its module), its cap {n, holds(out, n)} and its adversarial shapes (n → input). */
const larkItem = (text) => ({ message_id: 'om_c', msg_type: 'text', create_time: '1', chat_id: 'oc', sender: { id: 'ou_x', sender_type: 'user' }, body: { content: JSON.stringify({ text }) } });
const larkPost = (text) => ({ message_id: 'om_c', msg_type: 'post', create_time: '1', chat_id: 'oc', sender: { id: 'ou_x', sender_type: 'user' }, body: { content: JSON.stringify({ title: '', content: [[{ tag: 'text', text }]] }) } });
const gmailMsg = (html) => ({ id: 'm1', threadId: 't1', internalDate: '1700000000000', labelIds: [], snippet: '', payload: { mimeType: 'text/html', partId: '', headers: [{ name: 'From', value: 'A <a@b.example>' }, { name: 'Subject', value: 's' }], body: { size: html.length, data: Buffer.from(html).toString('base64url') } } });
const ROWS = [
  // ── src/mail-frame.js (the browser: the mail frame's sanitizer, main thread) ──
  { mod: 'mail-frame', fn: 'sanitizeMailHtml', cap: { n: MF.MAX_HTML_BYTES, holds: (out) => out && out.ok === false && out.code === 'too-large' }, run: (m, x) => m.sanitizeMailHtml(x),
    shapes: { 'a tag with no >': (n) => '<a '.repeat(n / 3), '<b<b<b': (n) => '<b'.repeat(n / 2), 'a dropped <svg> then <svg with no >': (n) => '<svg>' + '<svg '.repeat(n / 5), 'CSS quote pairs, no newline': (n) => '<style>' + "''".repeat(n / 2) + '</style>', 'url( with no )': (n) => '<style>' + 'url('.repeat(n / 4) + '</style>', '@keyframes x{ unclosed': (n) => '<style>' + '@keyframes x{'.repeat(n / 13) + '</style>', 'an ordinary mail': (n) => '<p>Hello <b>team</b>, <a href="https://x.example/a">link</a></p>'.repeat(n / 60), '1 000 images': (n) => '<img src="https://x.example/p.png">'.repeat(n / 34), 'entities in text': (n) => '&amp;&lt;&#x41;'.repeat(n / 15), 'nested divs': (n) => '<div>'.repeat(n / 5) } },
  { mod: 'mail-frame', fn: 'sanitizeCss', cap: { n: MF.MAX_HTML_BYTES, holds: () => true, byCaller: 'sanitizeMailHtml cuts the mail at MAX_HTML_BYTES before any style reaches it' }, run: (m, x) => m.sanitizeCss(x),
    shapes: { 'quote pairs, no newline': (n) => "''".repeat(n / 2), 'url( no )': (n) => 'url('.repeat(n / 4), '@font-face{ no }': (n) => '@font-face{'.repeat(n / 11), '@keyframes x{ no }': (n) => '@keyframes x{'.repeat(n / 13), '@import': (n) => '@import "x";'.repeat(n / 12), 'comments': (n) => '/**/'.repeat(n / 4), 'backslashes': (n) => '\\'.repeat(n), 'expression(': (n) => 'expression('.repeat(n / 11) } },
  { mod: 'mail-frame', fn: 'cidRefs', cap: { n: MF.MAX_HTML_BYTES, holds: (out) => Array.isArray(out) && out.length <= MF.MAX_CID_FETCH }, run: (m, x) => m.cidRefs(x), shapes: { 'src="cid: unclosed': (n) => 'src="cid:'.repeat(n / 9), 'cid refs': (n) => 'src="cid:a@b" '.repeat(n / 14) } },
  { mod: 'mail-frame', fn: 'decodeAttr', cap: { n: 400, holds: () => true, byCaller: 'sanitizeMailHtml keeps ≤ 400 chars of a decoded attribute; the input is inside MAX_HTML_BYTES' }, run: (m, x) => m.decodeAttr(x), shapes: { '&#x41 no ;': (n) => '&#x41'.repeat(n / 5), '&amp;': (n) => '&amp;'.repeat(n / 5), '&': (n) => '&'.repeat(n) } },
  { mod: 'mail-frame', fn: 'imageSrcVerdict', cap: { n: MF.MAX_DATA_URL, holds: (out) => out && out.drop === true }, run: (m, x) => m.imageSrcVerdict(x, { pictures: true }), capInput: (n) => 'data:image/png;base64,' + 'A'.repeat(n), shapes: { 'a data: picture': (n) => 'data:image/png;base64,' + 'A'.repeat(n), 'entities': (n) => 'https://x.example/' + '&amp;'.repeat(n / 5), 'tabs': (n) => 'https://x.example/' + '\t'.repeat(n) } },
  // ── src/channel-blocks.js (the server: ingest AND every read; the browser: the render tree) ──
  { mod: 'channel-blocks', fn: 'markupRead', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'larkPlainText / larkMdBlocks / larkPostBlocks hand it `bounded()` text (≤ BLOCK_LIMITS.text)' }, run: (m, x) => m.markupRead(x, { mode: 'blocks' }),
    shapes: { '<a + spaces': (n) => '<a' + ' '.repeat(n - 2), '<li>': (n) => '<li>'.repeat(n / 4), '<b': (n) => '<b'.repeat(n / 2), '<': (n) => '<'.repeat(n), '&amp;': (n) => '&amp;'.repeat(n / 5), '<a href>': (n) => '<a href="x">'.repeat(n / 12), '<blockquote>': (n) => '<blockquote>'.repeat(n / 12), '<td>': (n) => '<td>'.repeat(n / 4), 'backticks': (n) => '`'.repeat(n), 'unclosed <script (a word)': (n) => '<script> w '.repeat(n / 11), '<img>': (n) => '<img src="x">'.repeat(n / 13), 'lines': (n) => 'x\n\n'.repeat(n / 3) } },
  { mod: 'channel-blocks', fn: 'larkPlainText', cap: { n: TEXT_CAP, holds: (out, n) => typeof out === 'string' && out.length <= n + 64 }, capInput: (n) => '<b>' + 'x'.repeat(n) + '</b>', run: (m, x) => m.larkPlainText(x), shapes: { '<li>': (n) => '<li>'.repeat(n / 4), '<a + spaces': (n) => '<a' + ' '.repeat(n - 2), 'entities': (n) => '&amp;'.repeat(n / 5), '<p>x</p>': (n) => '<p>x</p>'.repeat(n / 8) } },
  { mod: 'channel-blocks', fn: 'larkMdBlocks', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'cuts its own input with bounded()' }, run: (m, x) => m.larkMdBlocks(x), shapes: { '```js fences unclosed': (n) => '```js\n'.repeat(n / 6), '# headings': (n) => '# x\n'.repeat(n / 4), '- items': (n) => '- x\n'.repeat(n / 4), '> quotes': (n) => '> '.repeat(n / 2), '_x_ emphasis': (n) => '_x'.repeat(n / 2), '*': (n) => '*'.repeat(n), '~~': (n) => '~~x'.repeat(n / 3), '---': (n) => '---\n'.repeat(n / 4) } },
  { mod: 'channel-blocks', fn: 'markupPlainLine', cap: { n: 2000, holds: (out) => typeof out === 'string' && out.length <= 2000 + 64 }, capInput: (n) => '<b>' + 'x'.repeat(n) + '</b>', run: (m, x) => m.markupPlainLine(x), shapes: { '<b>': (n) => '<b>'.repeat(n / 3), 'entities': (n) => '&lt;'.repeat(n / 4) } },
  { mod: 'channel-blocks', fn: 'quoteTags', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'runs over strings already bounded by the record (MAX_TEXT) or the block schema' }, run: (m, x) => m.quoteTags(x), shapes: { '<a>': (n) => '<a>'.repeat(n / 3), '<a b': (n) => '<a b'.repeat(n / 4) } },
  { mod: 'channel-blocks', fn: 'sealTags', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'walks a validated tree (BLOCK_LIMITS)' }, run: (m, x) => m.sealTags([{ k: 'p', runs: [{ k: 't', text: x }] }]), shapes: { '<a>': (n) => '<a>'.repeat(n / 3) } },
  { mod: 'channel-blocks', fn: 'decodeEntities', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'called by the markup reader on bounded text' }, run: (m, x) => m.decodeEntities(x), shapes: { '&#x41': (n) => '&#x41;'.repeat(n / 6), '&': (n) => '&'.repeat(n) } },
  { mod: 'channel-blocks', fn: 'inlineRuns', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'every rung hands it a paragraph of bounded() text' }, run: (m, x) => m.inlineRuns(x), shapes: { 'http + (': (n) => 'http://x.y/' + '('.repeat(n), 'www.': (n) => 'www.'.repeat(n / 4), 'a@': (n) => 'a@'.repeat(n / 2), '[x](': (n) => '[x]('.repeat(n / 4), '<url>': (n) => '<https://x.y/>'.repeat(n / 14) } },
  { mod: 'channel-blocks', fn: 'textToBlocks', cap: { n: TEXT_CAP, holds: (out) => Array.isArray(out) && out.length <= R.BLOCK_LIMITS.blocks }, run: (m, x) => m.textToBlocks(x), shapes: { '> quotes': (n) => '> '.repeat(n / 2), 'lines': (n) => 'x\n'.repeat(n / 2), 'sig': (n) => '-- \nx\n'.repeat(n / 6) } },
  { mod: 'channel-blocks', fn: 'emailToBlocks', cap: { n: TEXT_CAP, holds: (out) => Array.isArray(out) && out.length <= R.BLOCK_LIMITS.blocks }, run: (m, x) => m.emailToBlocks(x), shapes: { 'From: lines': (n) => 'From: a\n'.repeat(n / 8), 'rules': (n) => '----\n'.repeat(n / 5), 'On … wrote:': (n) => 'On Mon, A wrote:\n> q\n'.repeat(n / 22), 'reply above': (n) => 'please reply above this line\n'.repeat(n / 29) } },
  { mod: 'channel-blocks', fn: 'cleanSubject', cap: { n: 1024, holds: (out) => typeof out === 'string' && out.length <= 1024 }, run: (m, x) => m.cleanSubject(x), shapes: { 'Re: chain': (n) => 'Re: '.repeat(n / 4), 'Fwd [n]': (n) => 'Fwd [1] : '.repeat(n / 10) } },
  { mod: 'channel-blocks', fn: 'findQuoteStart', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'emailLines hands it the bounded text\'s lines' }, run: (m, x) => m.findQuoteStart(x.split('\n')), shapes: { 'From: lines': (n) => 'From: a\n'.repeat(n / 8), 'headers': (n) => 'To: a\nCc: b\n'.repeat(n / 12) } },
  { mod: 'channel-blocks', fn: 'larkToBlocks', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'each element\'s text goes through bounded()' }, run: (m, x) => m.larkToBlocks(larkPost(x)), shapes: { '<li>': (n) => '<li>'.repeat(n / 4), '<a + spaces': (n) => '<a' + ' '.repeat(n - 2) } },
  { mod: 'channel-blocks', fn: 'larkStoredBlocks', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'a stored record\'s text is MAX_TEXT' }, run: (m, x) => m.larkStoredBlocks({ text: x, raw: { msg_type: 'text' }, attachments: [], mentions: [] }), shapes: { '<li>': (n) => '<li>'.repeat(n / 4), '<p>': (n) => '<p>x</p>'.repeat(n / 8) } },
  { mod: 'channel-blocks', fn: 'larkCardBlocks', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'every element\'s text through bounded()' }, run: (m, x) => m.larkCardBlocks({ elements: [{ tag: 'markdown', content: x }] }, [], {}), shapes: { 'fences': (n) => '```js\n'.repeat(n / 6), '<li>': (n) => '<li>'.repeat(n / 4) } },
  { mod: 'channel-blocks', fn: 'larkSystemSentence', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'a system template through larkPlainText (bounded)' }, run: (m, x) => m.larkSystemSentence({ template: x }, x), shapes: { '{from_user}': (n) => '{from_user} '.repeat(n / 12) } },
  { mod: 'channel-blocks', fn: 'blocksToPlain', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'walks a validated tree' }, run: (m, x) => m.blocksToPlain([{ k: 'p', runs: [{ k: 't', text: x }] }]), shapes: { 'lines': (n) => 'x\n'.repeat(n / 2) } },
  { mod: 'channel-blocks', fn: 'previewOf', cap: { n: TEXT_CAP, holds: (out) => typeof out === 'string' && out.length <= 200 + 4 }, run: (m, x) => m.previewOf([{ k: 'p', runs: [{ k: 't', text: x }] }]), shapes: { 'spaces': (n) => 'x '.repeat(n / 2) } },
  { mod: 'channel-blocks', fn: 'validateBlocks', cap: { n: R.BLOCK_LIMITS.blocks, holds: (out) => out === 'refused' || (out && out.ok === false && out.code === 'too-many-blocks') }, capInput: (n) => Array.from({ length: n }, () => ({ k: 'p', runs: [{ k: 't', text: 'x' }] })), run: (m, x) => { try { return m.validateBlocks(typeof x === 'string' ? [{ k: 'p', runs: [{ k: 't', text: x }] }] : x); } catch { return 'refused'; } }, shapes: { 'one long run': (n) => 'x'.repeat(n) } },
  // ── src/channel-record.js (every adapter's record door) ──
  { mod: 'channel-record', fn: 'inertFrames', cap: { n: R.MAX_TEXT, holds: () => true, byCaller: 'peerText(v, max) cuts first' }, run: (m, x) => m.inertFrames(x), shapes: { '<system-reminder + spaces': (n) => '<system-reminder' + ' '.repeat(n), 'many openers': (n) => '<system-reminder '.repeat(n / 17), '<vibespace-': (n) => '<vibespace-x '.repeat(n / 13) } },
  { mod: 'channel-record', fn: 'inertFrameLine', cap: { n: R.MAX_TEXT, holds: () => true, byCaller: 'a line of an already-bounded text' }, run: (m, x) => m.inertFrameLine(x), shapes: { 'dangling openers': (n) => '<system-reminder '.repeat(n / 17) } },
  // the .197 integration (lark-search-poll's name door × this census): THE name door is a parser over peer bytes too
  { mod: 'channel-record', fn: 'peerName', cap: { n: 200, holds: (out, n) => out === null || (typeof out === 'string' && out.length <= n) }, run: (m, x) => m.peerName(x, 200), capInput: (n) => 'x'.repeat(n), shapes: { 'invisibles': (n) => '\u200b'.repeat(n), 'bidi + spaces': (n) => '\u202e '.repeat(n / 2), 'frames': (n) => '<system-reminder> '.repeat(n / 18) } },
  { mod: 'channel-record', fn: 'peerText', cap: { n: R.MAX_TEXT, holds: (out, n) => typeof out === 'string' && out.length <= n }, run: (m, x) => m.peerText(x, R.MAX_TEXT), capInput: (n) => 'x'.repeat(n), shapes: { 'frames': (n) => '<system-reminder> '.repeat(n / 18) } },
  { mod: 'channel-record', fn: 'resolveMentions', cap: { n: R.MAX_TEXT, holds: () => true, byCaller: 'makeRecord hands it the bounded text' }, run: (m, x) => m.resolveMentions(x, [{ key: '@_user_1', id: 'a', name: 'b' }]), shapes: { '@_user_1': (n) => '@_user_1 '.repeat(n / 9), '@': (n) => '@'.repeat(n) } },
  { mod: 'channel-record', fn: 'makeRecord', cap: { n: R.MAX_TEXT, holds: (out, n) => out && out.text.length <= n }, capInput: (n) => 'x'.repeat(n), run: (m, x) => m.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'v', at: 1, author: { id: 'u', name: 'n' }, text: x, mentions: [], attachments: [], raw: {} }), shapes: { 'frames': (n) => '<system-reminder> '.repeat(n / 18), 'mentions': (n) => '@_user_1 '.repeat(n / 9) } },
  { mod: 'channel-record', fn: 'carriesFrame', cap: { n: R.MAX_TEXT, holds: () => true, byCaller: 'a predicate over an already-bounded text' }, run: (m, x) => m.carriesFrame(x), shapes: { 'spaces': (n) => '<system-reminder' + ' '.repeat(n) } },
  { mod: 'channel-record', fn: 'safeHref', cap: { n: R.BLOCK_LIMITS.href, holds: (out) => out === null }, capInput: (n) => 'https://x.example/' + 'a'.repeat(n), run: (m, x) => m.safeHref(x), shapes: { 'long path': (n) => 'https://x.example/' + 'a'.repeat(n) } },
  // ── src/channels/gmail.js (the server, at ingest) ──
  { mod: 'gmail', fn: 'stripHtml', cap: { n: 512 * K, holds: (out, n) => typeof out === 'string' && out.length <= n }, capInput: (n) => 'x'.repeat(n), run: (m, x) => m.stripHtml(x), shapes: { '<<<<': (n) => '<'.repeat(n), '<style no close': (n) => '<style'.repeat(n / 6), '<script no close': (n) => '<script'.repeat(n / 7), '<a no close': (n) => '<a '.repeat(n / 3), '<b>x</b>': (n) => '<b>x</b>'.repeat(n / 8), 'comments': (n) => '<!--'.repeat(n / 4), 'entities': (n) => '&amp;&nbsp;'.repeat(n / 11), 'newlines': (n) => '\n '.repeat(n / 2) } },
  { mod: 'gmail', fn: 'parseAddress', cap: { n: 2048, holds: (out) => out && out.id.length <= 2048 }, capInput: (n) => 'a'.repeat(n), run: (m, x) => m.parseAddress(x), shapes: { '<<<<': (n) => '<'.repeat(n), 'a <b ': (n) => 'a <b '.repeat(n / 5), 'spaces': (n) => ' '.repeat(n) + '<a@b.c>' } },
  { mod: 'gmail', fn: 'toRecord', cap: { n: R.MAX_TEXT, holds: (out, n) => out && out.text.length <= n }, capInput: (n) => gmailMsg('x'.repeat(n)), run: (m, x) => m.toRecord('g', 'c', typeof x === 'string' ? gmailMsg(x) : x, {}), shapes: { 'html of <': (n) => '<'.repeat(n), '<b>x</b>': (n) => '<b>x</b>'.repeat(n / 8) } },
  // ── src/channels/lark.js (the server, at ingest and at every read) ──
  { mod: 'lark', fn: 'textOf', cap: { n: TEXT_CAP, holds: () => true, byCaller: 'every body through the bounded markup reader; the record then cuts at MAX_TEXT' }, run: (m, x) => m.textOf(larkItem(x)), shapes: { '<li>': (n) => '<li>'.repeat(n / 4), '<a + spaces': (n) => '<a' + ' '.repeat(n - 2), 'unclosed <title> words': (n) => '<title> w '.repeat(n / 10) } },
  { mod: 'lark', fn: 'toRecord', cap: { n: R.MAX_TEXT, holds: (out, n) => out && out.text.length <= n }, capInput: (n) => larkItem('x'.repeat(n)), run: (m, x) => m.toRecord('l', 'c', typeof x === 'string' ? larkItem(x) : x, {}), shapes: { '<li>': (n) => '<li>'.repeat(n / 4), '<p>': (n) => '<p>x</p>'.repeat(n / 8) } },
  { mod: 'lark', fn: 'recordView', cap: { n: R.MAX_TEXT, holds: (out, n) => out && out.text.length <= n + 64 }, capInput: (n) => ({ text: '<b>' + 'x'.repeat(n) + '</b>', author: { id: 'a' }, raw: { msg_type: 'text' } }), run: (m, x) => m.recordView(typeof x === 'string' ? { text: x, author: { id: 'a' }, raw: { msg_type: 'text' } } : x), shapes: { '<li>': (n) => '<li>'.repeat(n / 4), '<a + spaces': (n) => '<a' + ' '.repeat(n - 2) } },
  { mod: 'lark', fn: 'mentionsOf', cap: { n: 4096, holds: () => true, byCaller: 'each name through makeRecord\'s peerText; the list is the vendor\'s per-message mentions' }, capInput: (n) => ({ mentions: Array.from({ length: n }, (_, i) => ({ key: '@_user_' + i, id: 'ou_' + i, name: 'n' })) }), run: (m, x) => m.mentionsOf(typeof x === 'string' ? { mentions: [{ key: '@_user_1', id: 'ou_1', name: x }] } : x), shapes: { 'a long name': (n) => 'n'.repeat(n) } },
];
/** Exports that are NOT parsers over unbounded peer bytes — each with the reason it is not a row. */
const EXCLUDED = {
  'mail-frame': { heightBudget: 'a record', heightVerdict: 'three numbers', heightPending: 'one number off a budget', cssKeyframes: 'a rung of sanitizeCss (row)', safeOpenHref: 'refuses over 2 048 chars before any work (pinned below)', isQuoteContainer: 'a tag\'s attributes (≤ 64, ≤ 400 chars each)', cspFor: 'our own string', resizerScript: 'our own script + two labels ≤ 80', composeSrcdoc: 'our own document around the sanitizer\'s output', clampHeight: 'one number', frameMessageVerdict: 'one message: a token compare, a number, one href through safeOpenHref', picturesState: 'a state', picturesShown: 'a set lookup', showPictures: 'a set write', liveFrames: 'rows the window measured, not peer bytes', bodyAttachmentOf: 'a record\'s attachment list (≤ 64)' },
  'channel-blocks': { safeHref: 'channel-record\'s (row there)', linkText: 'a run\'s label ≤ href bound', larkPostBody: 'picks a locale object, no parse', cardLines: 'walks a card\'s elements, every text through markupPlainLine (row)', carriesTag: 'one indexOf + one anchored regex, no backtracking run', markupTokens: 'the tokenizer of markupRead (row)', cardTitleOf: 'a card\'s title field through the record\'s bound', blockStrings: 'walks a validated tree' },
  'channel-record': { makeConversation: 'a vendor conversation record (fields ≤ 256/1024)', recordKey: 'two ids', isSynthetic: 'a flag', validateBlocks: 'channel-blocks\' (row there)',
    // lane channel-threads' exports (the .197 integration placed them): each judges LENGTH before it reads
    isReactionKey: 'a length check (≤ REACTION_KEY_MAX) before one anchored regex', isReactionGlyph: 'a length check (≤ REACTION_GLYPH_MAX) before one anchored regex',
    validateReactions: 'a vendor list, linear — an entry past REACTIONS_MAX costs one `too-many` push; every string through isReactionKey / isReactionGlyph / peerName (row) / peerText (row)',
    validateSide: 'ONE side record — every peer field judged by its length first (msg ≤ 512, key, actor through peerName), a snapshot cut at REACTIONS_MAX × REACTION_BY_MAX',
    sideKey: 'joins validated fields' },
  gmail: { create: 'the adapter', integrationTest: 'a vendor call', sendVerbsOf: 'scopes', unitsFor: 'a number', queryOf: 'our query', scopeOf: 'scopes', effectiveOptions: 'our options', walkParts: 'the MIME tree (≤ 64 attachments, parts bounded by Gmail; every string through peerText/toRecord (row))', typedFailure: 'a vendor error body (≤ a few KB)', buildMime: 'our outgoing mail', replyHeaders: 'our headers', encodeHeader: 'our header', blocksOf: 'channel-blocks\' rung (rows there)', sendCapsOf: 'scopes' },
  lark: { capsOfScopes: 'scopes', optionOf: 'our options', requiredScopesOf: 'a vendor error message cut at 4 096 before one matchAll of a bounded token regex (lane channel-threads / lark-search-poll; placed at the .197 integration)', create: 'the adapter', integrationTest: 'a vendor call', attachmentsOf: 'the item\'s keys (≤ 64 attachments, ids ≤ 256)', typedFailure: 'a vendor error body', nextToken: 'a page token', uuidFor: 'a hash', hasSendScopes: 'scopes', vendorNameOf: 'a fixed string', blocksOf: 'channel-blocks\' rung (rows there)', sendCapsOf: 'scopes', botFallbackName: 'an id\'s last 4 chars', appNameOf: 'a map lookup', knownAppName: 'a map lookup', rememberAppName: 'a map write (name cut at 200)' },
};
const MODS = { 'mail-frame': MF, 'channel-blocks': B, 'channel-record': R, gmail: G, lark: L };

// ── ① the derived census ──
console.log('① every exported function of the peer-byte modules is a row or excluded with a reason');
for (const [name, mod] of Object.entries(MODS)) {
  const exported = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
  const rows = new Set(ROWS.filter((r) => r.mod === name).map((r) => r.fn));
  const ex = EXCLUDED[name] || {};
  const missing = exported.filter((k) => !rows.has(k) && !(k in ex));
  const dead = [...rows, ...Object.keys(ex)].filter((k) => !exported.includes(k));
  ok(!missing.length && !dead.length, `${name}: ${exported.length} exports — ${rows.size} rows + ${Object.keys(ex).length} excluded, nothing unplaced, nothing dead`, J({ missing, dead }));
  for (const r of ROWS.filter((r) => r.mod === name)) ok(typeof mod[r.fn] === 'function', `${name}.${r.fn} is exported`);
}
ok(MF.safeOpenHref('https://x.example/' + 'a'.repeat(3000)) === null && MF.safeOpenHref('https://x.example/a') === 'https://x.example/a', 'safeOpenHref (excluded): over 2 048 chars refused before any work');

// ── ② + ③ per row: the cap, then linearity ──
const hr = () => Number(process.hrtime.bigint()) / 1e6;
const timeOf = (fn, x, reps) => { let best = Infinity; for (let r = 0; r < 5; r++) { const t = hr(); for (let k = 0; k < reps; k++) fn(x); best = Math.min(best, hr() - t); } return best; };
const RATIO_MAX = 2.5, FAST_FLOOR_MS = 15, BASE_MS = 25;
function judgeLinear(row, mod, label, shape, nBase) {
  const x1 = shape(nBase), x2 = shape(nBase * 2);
  const fn = (x) => row.run(mod, x);
  // THE FLOOR FIRST (security verify r2, continued — THE TIER RULE, ci.mjs: a fast row measures < 10 s; this suite
  // measured 35 s, almost all of it the ratio machinery on shapes the floor passes anyway): the 2n input ONE call at
  // a time, min of 3 (built above, outside the timer); under FAST_FLOOR_MS per call it is trivially fast at the size
  // that matters — a quadratic shape at 128 KB is hundreds of ms per call (the controls: 48–400 ms) and takes the
  // full ratio judge below
  const one = timeOf(fn, x2, 1);
  if (one < FAST_FLOOR_MS) { const t0 = timeOf(fn, x1, 1); return { ok: true, ratio: +(one / Math.max(t0, 0.001)).toFixed(2), t1: +t0.toFixed(2), t2: +one.toFixed(2), reps: 1, n: nBase, fast: true }; }
  let reps = 1;
  let t1 = timeOf(fn, x1, 1);
  if (t1 < BASE_MS) { reps = Math.max(1, Math.ceil(BASE_MS / Math.max(t1, 0.05))); t1 = timeOf(fn, x1, reps); }
  const t2 = timeOf(fn, x2, reps);
  const ratio = t2 / Math.max(t1, 0.001);
  const fast = t2 / reps < FAST_FLOOR_MS;
  return { ok: fast || ratio <= RATIO_MAX, ratio: +ratio.toFixed(2), t1: +(t1 / reps).toFixed(2), t2: +(t2 / reps).toFixed(2), reps, n: nBase, fast };
}
console.log('② every row has a size cap; ③ every row is linear on its own adversarial shapes (t(2n) ≤ 2.5 × t(n), or under 15 ms at 2n)');
for (const row of ROWS) {
  const mod = MODS[row.mod];
  const over = row.cap.n + 4096;
  if (row.cap.byCaller) ok(true, `${row.mod}.${row.fn}: cap = the caller's (${row.cap.byCaller})`);
  else { const out = row.run(mod, row.capInput ? row.capInput(over) : 'x'.repeat(over)); ok(row.cap.holds(out, row.cap.n), `${row.mod}.${row.fn}: an input over its cap (${row.cap.n}) is refused or bounded`, J(out).slice(0, 200)); }
  const nBase = Math.min(64 * K, Math.floor(row.cap.n / 2));
  const bad = [];
  for (const [label, shape] of Object.entries(row.shapes)) { const v = judgeLinear(row, mod, label, shape, nBase); if (!v.ok) bad.push(`${label}: ${v.t1} ms → ${v.t2} ms (×${v.ratio})`); }
  ok(!bad.length, `${row.mod}.${row.fn}: linear on ${Object.keys(row.shapes).length} shapes at ${nBase / K} / ${nBase * 2 / K} KB`, bad.join('; '));
}
// the census pins its own wiring: the bound every block reader cuts at is the record's, and stripHtml's is declared
ok(TEXT_CAP === 64 * K && R.MAX_TEXT === 64 * K, 'the block readers\' bound IS the record\'s MAX_TEXT (64 KiB)');
const gmailSrc = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
const gmailCode = gmailSrc.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(/const STRIP_HTML_MAX = 512 \* 1024;/.test(gmailCode) && /const ADDRESS_MAX = 2048;/.test(gmailSrc) && /\.slice\(0, STRIP_HTML_MAX\)/.test(gmailCode) && /\.slice\(0, ADDRESS_MAX\)/.test(gmailCode) && !/<\[\^>\]\+>/.test(gmailCode) && !/\^\(\.\*\?\)\\s\*<\(\[\^>\]\+\)>/.test(gmailCode), 'WIRING: gmail.js cuts stripHtml at 512 KiB and parseAddress at 2 KiB, and the two regexes that re-scanned to the end are gone');
ok(G.stripHtml('<html><head><title>T</title><style>p{}</style></head><body><p>Hello <b>team</b>,<br>line two</p><div>d</div><script>x()</script>&amp; &lt;3 <!-- c --> tail &nbsp;x</body></html>') === 'Hello team ,\nline two\nd\n& <3 tail x' && G.stripHtml('unfinished <a href=x words after') === 'unfinished <a href=x words after', 'stripHtml still reads a mail: raw-text elements dropped whole, block closers a newline, entities decoded, an unfinished tag is words');
ok(J(G.parseAddress('"Ada, B" <ada@example.com>')) === J({ id: 'ada@example.com', name: 'Ada, B' }) && J(G.parseAddress('x < y <a@b.c>')) === J({ id: 'a@b.c', name: 'x < y' }) && J(G.parseAddress('ada@example.com')) === J({ id: 'ada@example.com', name: 'ada@example.com' }), 'parseAddress still reads every From shape (the LAST <…> pair is the address)');

// ── ④ controls: the two round-1 / round-2 quadratic shapes restored go RED under the same judge ──
console.log('④ controls: a restored quadratic loop goes RED under the same judge');
{
  const M = mutantCopies('peer-parsers', REPO);
  const mfSrc = fs.readFileSync(path.join(REPO, 'src/mail-frame.js'), 'utf-8');
  const oldScan = mfSrc.replace("    if (nlAt !== -1 && nlAt <= i) nlAt = css.indexOf('\\n', i + 1);", "    nlAt = css.indexOf('\\n', i + 1);");
  const m1 = M.load('src/mail-frame.js', oldScan, 'per-quote-newline-scan');
  const row1 = ROWS.find((r) => r.mod === 'mail-frame' && r.fn === 'sanitizeCss');
  const v1 = judgeLinear(row1, m1, 'quote pairs', row1.shapes['quote pairs, no newline'], 64 * K);
  ok(oldScan !== mfSrc && !v1.ok, `CONTROL: the mail sanitizer with round 1's per-quote newline scan is NOT linear (${v1.t1} ms → ${v1.t2} ms, ×${v1.ratio})`, J(v1));
  const oldStrip = gmailSrc.replace(/function stripHtml\(html\) \{[\s\S]*?\n\}\n/, `function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<br\\s*\\/?>/gi, '\\n').replace(/<\\/(p|div|tr|li|h[1-6])>/gi, '\\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \\t]+/g, ' ').replace(/\\n[ \\t]+/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
}
`);
  const m2 = M.load('src/channels/gmail.js', oldStrip, 'regex-chain-strip');
  const row2 = ROWS.find((r) => r.mod === 'gmail' && r.fn === 'stripHtml');
  const v2 = judgeLinear(row2, m2, '<<<<', row2.shapes['<<<<'], 8 * K);   // 8 / 16 KB: the old chain at 64 KB is seconds, and a quadratic ratio (×4) shows at any size — the smallest that keeps the suite inside THE TIER RULE's 10 s
  ok(oldStrip !== gmailSrc && !v2.ok, `CONTROL: gmail's round-2 regex-chain stripHtml is NOT linear on "<<<<" (${v2.t1} ms → ${v2.t2} ms, ×${v2.ratio} at 8 / 16 KB)`, J(v2));
  const oldAddr = gmailSrc.replace(/function parseAddress\(s\) \{[\s\S]*?\n\}\n/, `function parseAddress(s) {
  const raw = String(s || '').trim();
  const m = /^(.*?)\\s*<([^>]+)>\\s*$/.exec(raw);
  if (m) return { id: m[2].trim().toLowerCase(), name: m[1].replace(/^"|"$/g, '').trim() || m[2].trim() };
  return { id: raw.toLowerCase(), name: raw };
}
`);
  const m3 = M.load('src/channels/gmail.js', oldAddr, 'lazy-address-regex');
  const row3 = ROWS.find((r) => r.mod === 'gmail' && r.fn === 'parseAddress');
  const v3 = judgeLinear(row3, m3, '<<<<', row3.shapes['<<<<'], 8 * K);
  ok(oldAddr !== gmailSrc && !v3.ok, `CONTROL: gmail's round-2 lazy parseAddress regex is NOT linear on "<<<<" (${v3.t1} ms → ${v3.t2} ms, ×${v3.ratio} at 8 / 16 KB)`, J(v3));
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(c.pass, c.name, c.detail);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

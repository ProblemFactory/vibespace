#!/usr/bin/env node
// B-82c2 (lane lg-text-legs-3, 2026-11-20): A MENTION IN A LARK PROPOSAL IS A REAL MENTION FOR THE RIGHT MEMBER, OR THE CARD
// SAYS BEFORE THE SEND THAT IT IS NOT. The owner met an agent's proposed message on Lark — edited and approved — whose @names
// went out as plain words: Lark declared no prepare step, so no name was ever decided, and nothing warned before the press.
// Slack's road is the model; Lark is built INTO that contract. NO REAL MESSAGE IS SENT: every wire body is judged against a
// stand-in. Round wn462wr7s: ONE decision for every road. Round wfgpbe038: FOUR RULES THAT HOLD BY CONSTRUCTION —
//   A. ENDERS, NOT CONTINUERS: without a whole member list a known name is decided only before a CLOSED list of enders;
//   B. THE MEMBERS DECIDE WHENEVER THEY CAN BE READ: one read a proposal (kept for its edits); the records alone only when
//      the list is not whole or cannot be read, and then the card says so on that name's own row;
//   C. THE PRESS SENDS ONLY WHAT THE CARD SHOWED: an edit whose decision changed is stored, not sent; the next press sends;
//   D. THE WIRE TAGS THE PLACES THE DECISION CHOSE, never names matched again.
//   ① the one decision and the wire (PURE, src/channels/lark/mentions.js)
//   ② the adapter (src/channels/lark.js over a stand-in vendor)
//   ③ the registry: the adapter's own id shape; a mention and its name as a pair; the places, the read key, the said words
//   ④ the engine (the outbox over the fake adapter dressed with Lark's contract) — C through the real engine
//   ⑤ the manual
//   ⑥ THE GENERATED ORACLE of A (written from the rule's sentences, never from the module) and the edit road
// Every lock has a RED control (anchored() / a copy of the file as it was / the caller's say put back).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok() was handed a ${typeof c} as its condition (arguments swapped, or not a verdict): ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);
const LM = require(path.join(REPO, 'src/channels/lark/mentions.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const P = require(path.join(REPO, 'src/channel-policy.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const ROOT = scratchDir('lark-mentions');
const MUT = mutantCopies('lark-mentions', REPO);
const ANN = { id: 'ou_ann0000001', name: 'Ann Lee' }, ZHANG = { id: 'ou_zhang00001', name: '张三' };
const BOB1 = { id: 'ou_bob0000001', name: 'Bob' }, BOB2 = { id: 'ou_bob0000002', name: 'Bob' };
const A1 = { id: 'ou_ann0000009', name: 'Ann' }, W1 = { id: 'ou_wangwei001', name: '王伟' }, W3 = { id: 'ou_wangweiq01', name: '王伟强' };
const LI = { id: 'ou_li00000001', name: '李四' }, JEAN = { id: 'ou_jean0000001', name: 'Jean' }, JP = { id: 'ou_jeanp000001', name: 'Jean-Pierre' };
const ZW1 = { id: 'ou_zw00000001', name: '张伟' }, ZW2 = { id: 'ou_zw00000002', name: '张伟' };
const dec = (text, known = [], members = null, LMM = LM) => LMM.decideMentions({ text, known, members });
const LMS_WIRE = (LMM, t, d) => LMM.wireText(t, d.places);
const WHOLE = (list) => ({ list, whole: true, why: null });
const ids = (d) => d.mentions.map((m) => m.id);
const mSrc = fs.readFileSync(path.join(REPO, 'src/channels/lark/mentions.js'), 'utf8');
const larkSrc = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8');
// RED of rule A: the CONTINUERS rule put back (the round wn462wr7s module: a name ends unless a letter / digit follows it, or a
// space and a capital letter) — a planted copy whose `endsHere` reads that list instead of the enders
const ENDS = "function endsHere(tail) {\n  const t = String(tail || '');\n  if (!t) return true;\n";
const LM_CONT = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, ENDS, "function endsHere(tail) {\n  const t = String(tail || '');\n  if (!t || (!/[\\p{L}\\p{N}]/u.test(t[0]) && !(t[0] === ' ' && /\\p{Lu}/u.test(t[1] || '')))) return true;\n", 'continuers-put-back'), 'mentions-continuers');
// RED of MUST 2 (round wke4s5jp9): the filter put back — over a whole list the longest name THAT ENDS (a shorter name tried)
const BEST = '    const best = longest && top.some(ends) ? longest : 0;\n';
const WHO = '    const who = [...new Set(top.filter(ends).map((c) => c.id))];\n';
const LM_FILTER = MUT.load('src/channels/lark/mentions.js', anchored(anchored(mSrc, BEST, '    const best = whole ? cands.filter(ends).reduce((n, c) => Math.max(n, c.len), 0) : (longest && top.some(ends) ? longest : 0);\n', 'filter-then-longest'), WHO, '    const who = [...new Set(cands.filter((c) => c.len === best && ends(c)).map((c) => c.id))];\n', 'filter-then-longest-who'), 'mentions-filter-longest');   // stale-pins: kept (the RED plants the line as it was)
// RED of small 6: the closed list of characters that may stand before an at-word put back
const ATRE = "const AT_RE = /(?<![A-Za-z0-9._%+\\-/])@/g;";
const LM_STARTERS = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, ATRE, "const AT_RE = /(^|[\\s(\\[{,;:!?\"'“‘（「，。、：；！？])@/gu;", 'closed-starters'), 'mentions-closed-starters');   // stale-pins: kept (the RED plants the starters as they were)
// the follow (r1402 (4)): RED — the TYPED lists of enders put back (the module's list as it was, the oracle's twin)
const ENDCLS = String.raw`const enderAlways = (c) => /[\u3000-\u303f\uff00-\uffef]/.test(c) && ENDER_CLASS_RE.test(c);
const enderLatin = (c) => /[\u0000-\u007f\u2000-\u206f]/.test(c) && (ENDER_CLASS_RE.test(c) || c === '"' || c === '\'' || c === '\u2026');
`;
const TYPED_ENDERS = String.raw`const enderAlways = (c) => new Set([...'，。、；：！？）」』】》〉］｝〕']).has(c);
const enderLatin = (c) => new Set([...',.;:!?)]}"\'”’…']).has(c);
`;
const LM_ENDLIST = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, ENDCLS, TYPED_ENDERS, 'typed-enders'), 'mentions-typed-enders');

console.log('① the one decision and the wire (PURE, src/channels/lark/mentions.js)');
{
  const d = dec('Hi @Ann Lee, @张三请看 — @Bob? @Zed and a@b.example', [], WHOLE([ANN, ZHANG, BOB1, BOB2]));
  ok(J(d.mentions) === J([{ name: 'Ann Lee', id: ANN.id }, { name: '张三', id: ZHANG.id }]) && J(d.notifies) === J(['Ann Lee', '张三']) && J(d.unresolved) === J(['Bob']) && J(d.plain) === J(['Zed']) && d.open.length === 0 && d.unchecked.length === 0 && d.everyone === false,
    'over a WHOLE member list: the LONGEST name that begins the text after an @ and ENDS there decides — one person a mention (a CJK name abutting its sentence too: @张三请看), two refused by name (@Bob), nobody plain words (@Zed); an address is no mention; nothing unchecked', J(d));
  // RULE A — ENDERS: without a whole list a known name is decided only before an ender; everything else leaves it open
  const ENDERS = [',', '，', '.', '。', '!', '？', ';', '：', ')', '」', '”', '\n', ' @Bob', '@x', ''];
  const NOT = [' please', ' Lee', '-Pierre', '‐Pierre', '·强', '・スミス', "'s", '’s', '_x', '2', 'abel', '强', '　花子', ' x', '\tx', '🙂', '#1', '.Smith', ',x'];
  const ended = ENDERS.map((f) => [f, dec(`@Ann${f}`, [A1])]);
  ok(ended.every(([, r]) => J(ids(r)) === J([A1.id]) && J(r.unchecked) === J(['Ann']) && r.uncheckedWhy === 'not-read'), `RULE A: a known name before an ENDER is decided with no list, and SAID as not checked: ${ended.map(([f]) => J(f)).join(' ')}`, J(ended.filter(([, r]) => J(ids(r)) !== J([A1.id]))));
  const notEnded = NOT.map((f) => [f, dec(`@Ann${f}`, [A1])]);
  ok(notEnded.every(([, r]) => r.mentions.length === 0 && r.open.length === 1), `RULE A: EVERYTHING else leaves the word open, never the shorter person: ${notEnded.map(([f, r]) => `${J(f)}→${J(r.open)}`).join(' ')}`, J(notEnded.filter(([, r]) => r.mentions.length)));
  const notR = NOT.map((f) => [f, dec(`@Ann${f}`, [A1], null, LM_CONT)]).filter(([, r]) => r.mentions.length);
  ok(notR.length >= 8, `RED CONTROL: the continuers rule put back — ${notR.length} of ${NOT.length} unlisted followers notify Ann: ${notR.map(([f]) => J(f)).join(' ')}`);
  // MUST 1's scenes (round wfgpbe038): a joiner never ends a name — whole list or not; the everyone word by the same rule
  const jp0 = dec('@Jean-Pierre, can you review', [JEAN]), jp1 = dec('@Jean-Pierre, can you review', [JEAN], WHOLE([JEAN, JP])), jp2 = dec('@Jean-Pierre, can you review', [JEAN], WHOLE([JEAN]));
  ok(jp0.mentions.length === 0 && J(jp0.open) === J(['Jean-Pierre']) && J(ids(jp1)) === J([JP.id]) && jp2.mentions.length === 0 && J(jp2.plain) === J(['Jean-Pierre']), 'MUST 1 (Jean-Pierre, Jean known): open with no list, Jean-Pierre over a whole list that holds that member, plain words over one that does not — never Jean', J({ jp0, jp1, jp2 }));
  const cj = [dec('@约翰·史密斯，', [{ id: 'ou_john0000001', name: '约翰' }]), dec('@ジョン・スミス。', [{ id: 'ou_jon00000001', name: 'ジョン' }]), dec('@田中 花子，', [{ id: 'ou_tan00000001', name: '田中' }])];
  ok(cj.every((r) => r.mentions.length === 0 && r.open.length === 1), `MUST 1 (CJK): a given name after a middle dot or a space stays open: ${cj.map((r) => J(r.open)).join(' ')}`, J(cj));
  const jpR = dec('@Jean-Pierre, can you review', [JEAN], null, LM_CONT);
  ok(J(ids(jpR)) === J([JEAN.id]), 'RED CONTROL: the continuers rule put back — Jean notified for Jean-Pierre');
  const ah = dec('the @all-hands at 3', []), ah1 = dec('the @all-hands at 3', [], WHOLE([])), e = dec('@所有人 看一下，@all too', [ANN], WHOLE([])), e0 = dec('@所有人，看一下', []);
  ok(!ah.everyone && J(ah.open) === J(['all-hands']) && !ah1.everyone && J(ah1.plain) === J(['all-hands']) && e.everyone === true && e.mentions.every((m) => m.id === 'all') && e0.everyone === true && J(e.notifies) === J(e.mentions.map((m) => m.name)),
    'the EVERYONE word by the same rule: @all-hands is never everyone; @所有人 before a space over a whole list, @所有人 before a comma with none, are everyone (its notify name its typed word)', J({ ah, ah1, e, e0 }));
  const eb = dec('@所有人员 @allison and @所有人 now', [], WHOLE([ANN]));
  ok(J(eb.mentions) === J([{ name: '所有人', id: 'all' }]) && eb.plain.includes('所有人员') && eb.plain.includes('allison'), 'everyone\'s word needs its end: @所有人员 and @allison are not everyone', J(eb));
  // the whole name over lists whole and not
  const o1 = dec('@王伟强 看一下', [W1]), o2 = dec('@王伟强 看一下', [W1], WHOLE([W1, W3])), o3 = dec('@王伟强 看一下', [W1], { list: [W1], whole: false, why: 'members-partial' }), o4 = dec('@王伟强 看一下', [W1], WHOLE([W1]));
  ok(J(o1.open) === J(['王伟强']) && o1.mentions.length === 0 && J(o2.mentions) === J([{ name: '王伟强', id: W3.id }]) && J(o3.open) === J(['王伟强']) && o3.openWhy === 'members-partial' && J(o4.mentions) === J([{ name: '王伟', id: W1.id }]),
    'the whole name: with only 王伟 known @王伟强 is OPEN; over a list NOT whole it stays open, with the read\'s reason; over a whole list holding 王伟强 that member; a whole list holding only 王伟 lets the shorter CJK name win (it abuts)', J({ o1, o3, o4 }));
  const nw = dec('@王伟强 看一下', [W1], { list: [W1], whole: true, why: 'members-partial' });
  ok(nw.mentions.length === 0 && J(nw.open) === J(['王伟强']), 'a list whose read gave a reason is never whole, whatever its flag says', J(nw));
  // MUST 2's scene in the pure call: the records know one 张伟, the whole list two — said, never guessed
  const zw = dec('@张伟，请看', [ZW1], WHOLE([ZW1, ZW2])), zw0 = dec('@张伟，请看', [ZW1]);
  ok(zw.mentions.length === 0 && J(zw.unresolved) === J(['张伟']) && J(ids(zw0)) === J([ZW1.id]) && J(zw0.unchecked) === J(['张伟']), 'MUST 2 (pure): over the whole list two 张伟 are said (unresolved); by the records alone the one known is decided and SAID as not checked', J({ zw, zw0 }));
  const lc = dec('@ann lee, look', [A1]), lc1 = dec('@ann lee, look', [A1], WHOLE([A1, ANN]));
  ok(lc.mentions.length === 0 && lc.open.length === 1 && J(ids(lc1)) === J([ANN.id]), 'a name typed in LOWER CASE follows the same rules: open with no list, the whole name over one', J({ lc, lc1 }));
  const n3 = dec('@所有人 @张三 @李四', [], WHOLE([ZHANG, LI]));
  ok(n3.notifies.length === n3.mentions.length && J(n3.notifies) === J(['所有人', '张三', '李四']), 'one notify name a mention, in the same order', J(n3));
  const two = dec('@Annie, and @Ann Lee, hi', [{ id: ANN.id, name: 'Ann Lee' }, { id: ANN.id, name: 'Annie' }]);
  ok(J(ids(two)) === J([ANN.id, ANN.id]) && two.open.length === 0, 'one person known by TWO names keeps both pairs: @Annie and @Ann Lee are each that person', J(two));
  // round wke4s5jp9 MUST 2 — THE LONGEST NAME THAT BEGINS IS THE ONLY ONE THAT MAY DECIDE, in every mode: it decides when it ends,
  // else the word is plain (a whole list) or open (none) — a shorter name is never tried
  const POSS = "@Ann Lee's draft is ready";
  const pz = dec(POSS, [], WHOLE([A1, ANN])), pz2 = dec('@Ann Lee-2 and @Ann Lee2 too', [], WHOLE([A1, ANN]));
  ok(pz.mentions.length === 0 && J(pz.plain) === J(["Ann Lee's"]) && pz2.mentions.length === 0 && J(pz2.plain) === J(['Ann Lee-2', 'Ann Lee2']), 'MUST 2: over a whole list of Ann and Ann Lee, «@Ann Lee\'s draft» notifies NOBODY and the word is said (Ann Lee does not end at the apostrophe; Ann is never tried) — a hyphen or a digit after the longer name the same', J({ pz, pz2 }));
  ok(J(ids(dec(POSS, [], WHOLE([A1, ANN]), LM_FILTER))) === J([A1.id]), 'RED CONTROL: the filter put back (the longest name THAT ENDS) — Ann notified for «Ann Lee\'s draft»');
  // round wke4s5jp9 (3): over a whole list the candidates are the MEMBERS only — one known from the records alone is no member here
  const GINA = { id: 'ou_gina000001', name: 'Gina' };
  const gn = dec('@Gina, the notes', [GINA], WHOLE([A1])), gn0 = dec('@Gina, the notes', [GINA]);
  ok(gn.mentions.length === 0 && J(gn.plain) === J(['Gina']) && J(ids(gn0)) === J([GINA.id]), '(3) over a whole list a person known only from the records (who left) is «not a member here», never a mention; with no list the records\' name decides (said as not checked)', J({ gn, gn0 }));
  const PPL = "  const ppl = peopleOf(whole ? listed : [...(Array.isArray(known) ? known : []), ...listed]);\n";
  const LM_KNOWNWHOLE = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, PPL, "  const ppl = peopleOf([...(Array.isArray(known) ? known : []), ...listed]);\n", 'records-join-the-whole-list'), 'mentions-records-whole');   // stale-pins: kept (the RED plants the line as it was)
  ok(J(ids(dec('@Gina, the notes', [GINA], WHOLE([A1]), LM_KNOWNWHOLE))) === J([GINA.id]), 'RED CONTROL: the records joined to the whole list — Gina, who is no member, notified');
  // round wke4s5jp9 (6): an at-sign starts an at-word UNLESS the character before it belongs to a mail address's first part
  const starts = ['请@张三看一下', '（@张三）', '**@张三**', '「@张三」', '#@张三，', '\u200b@张三，'].map((t) => [t, dec(t, [], WHOLE([ZHANG]))]);
  ok(starts.every(([, r]) => r.mentions.length + r.plain.length >= 1) && J(ids(starts[0][1])) === J([ZHANG.id]) && J(ids(starts[1][1])) === J([ZHANG.id]) && dec('mail a@张三.com and x.y@b', [], WHOLE([ZHANG])).mentions.length === 0, `(6) an at-word starts after ANY character but a mail address's or a slash (a CJK sentence with no space, a full-width bracket, a bold mark, a symbol, a zero-width space): ${starts.map(([t, r]) => `${J(t)}→${J(ids(r).length ? 'mention' : r.plain)}`).join(' ')}`, J(starts));
  // the follow (r1065): a SLASH never starts an at-word — site/@handle is an address: no mention inside it, no everyone, the address whole
  const ADDR = 'see https://x.example/@张三 and https://x.example/@all today';
  const ad = dec(ADDR, [], WHOLE([ZHANG]));
  ok(ad.mentions.length === 0 && !ad.everyone && ad.places.length === 0 && LM.wireText(ADDR, ad.places) === ADDR, 'the follow (1): an address «site/@handle» with a member\'s handle, and one ending in the everyone word — nobody notified, no everyone, the address whole on the wire');
  const LM_SLASH = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, ATRE, 'const AT_RE = /(?<![A-Za-z0-9._%+\\-])@/g;', 'slash-starts'), 'mentions-slash-starts');   // stale-pins: kept (the RED plants round wke4s5jp9's rule as it was)
  const adR = dec(ADDR, [], WHOLE([ZHANG]), LM_SLASH);
  ok(J(ids(adR)) === J([ZHANG.id, 'all']) && adR.everyone === true, `RED CONTROL: the slash as a starter (round wke4s5jp9's rule) — a mention INSIDE the address and EVERYONE notified (${J(ids(adR))}); the address breaks on the wire («${LMS_WIRE(LM_SLASH, ADDR, adR)}»)`);
  ok(dec('请@张三看一下', [], WHOLE([ZHANG]), LM_STARTERS).mentions.length === 0 && dec('**@张三**', [], WHOLE([ZHANG]), LM_STARTERS).plain.length === 0, 'RED CONTROL: the closed list of starters put back — a CJK sentence with no space before the at-sign is silent (no mention, nothing said)');
  // round wke4s5jp9 (5): a TYPED tag inside code never goes raw on the wire (Lark parses it anywhere): its label, in plain words
  const CODE_TAGS = 'see `<at user_id="ou_ann0000009">Ann</at>` and\n```\n<at user_id="all"></at>\n```';
  const wc = LM.wireText(CODE_TAGS, dec(CODE_TAGS, [A1]).places);
  ok(!/<at /.test(wc) && /`@Ann`/.test(wc) && /\n@all\n/.test(wc), `(5) typed tags inside a backtick span and a fenced block are no decided places: their labels go as plain words, never a raw tag on the wire («${wc.replace(/\n/g, '⏎')}»)`);
  const TAGSCAN = '  for (const m of s.matchAll(TAG_RE)) events.push({ at: m.index, end: m.index + m[0].length, tag: true, id: m[1], label: m[2] });\n';
  const LM_CODETAG = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, TAGSCAN, '  for (const m of blankCode(s).matchAll(TAG_RE)) events.push({ at: m.index, end: m.index + m[0].length, tag: true, id: m[1], label: m[2] });\n', 'tags-scanned-without-code'), 'mentions-code-tags');   // stale-pins: kept (the RED plants the scan as it was)
  const wcR = LM_CODETAG.wireText(CODE_TAGS, []);
  ok(!/`@Ann`/.test(wcR), `RED CONTROL: the tags scanned outside code only (the round as it was) — the tag inside code is no label in plain words («${wcR.replace(/\n/g, '⏎')}»; the follow's opener rule now keeps even that from being a tag)`);
  // the follow (r1065) (3): a TYPED TAG AROUND A TYPED TAG — after the inner one is rewritten, no tag opener stands on the wire outside a
  // decided place: the outer opener is written with a full-width bracket (plain words), never a valid tag for a member no card showed
  const NEST = '<at user_id="ou_ann0000009"><at user_id="ou_zzzz0000001">Eve</at></at> hi';
  const nd = dec(NEST, [A1], WHOLE([A1])), nwire = LM.wireText(NEST, nd.places);
  ok(nd.mentions.length === 0 && !/<\s*at\b/i.test(nwire) && nwire.startsWith('\uff1cat user_id="ou_ann0000009">@Eve</at>'), `the follow (3): a typed tag around a typed tag — the inner goes as its label, and NO tag opener stands on the wire outside a decided place («${nwire}»)`);
  const OPEN_RULE = "  const words = (x) => String(x).replace(/<(\\s*at\\b)/gi, '\\uff1c$1');\n";
  const LM_NOWORDS = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, OPEN_RULE, '  const words = (x) => String(x);\n', 'tag-opener-in-words'), 'mentions-opener-words');
  const nwR = LM_NOWORDS.wireText(NEST, nd.places);
  ok(/<at user_id="ou_ann0000009">@Eve<\/at>/.test(nwR), `RED CONTROL: the opener rule cut — the outer tag stands VALID on the wire for a member no card showed («${nwR}»)`);
  // past fifty people in one message: their own row (`over`), no place on the wire
  { const fifty = Array.from({ length: 55 }, (_, i) => ({ id: `ou_p${String(i).padStart(8, '0')}`, name: `P${i}` }));
    const r = dec(fifty.map((p) => `@${p.name},`).join(' '), [], WHOLE(fifty));
    ok(r.mentions.length === 50 && r.over.length === 5 && r.places.length === 50, `past fifty people in one message the rest go as plain words on their own row (over: ${r.over.length}), never a place on the wire (${r.places.length} places)`); }
  // CODE is no text: at-words in a backtick span or a fenced block are not at-words (no read, no row)
  const code = dec('see `@Override` and\n```\n@Component\nclass X {}\n```\n@Ann, done', [A1]);
  ok(J(ids(code)) === J([A1.id]) && code.open.length === 0 && !LM.hasAtWords('see `@Override`\n```\n@Component\n```') && LM.hasAtWords('hi @x') && !LM.hasAtWords('mail a@b.example'), 'at-words in a backtick span or a fenced block are not at-words (no member read is asked for them); an address is none either', J(code));
  // the reconcile's ONE form; a typed placeholder stays words
  ok(LM.canonWire(LM.wireText('@张三 hi', [{ at: 0, len: 2, id: ZHANG.id }])) === LM.canonVendor('@_user_1 hi', [{ key: '@_user_1', id: ZHANG.id, id_type: 'open_id', name: '张三' }]) && LM.canonVendor('@_all go', [{ key: '@_all' }]) === LM.canonWire('<at user_id="all"></at> go'), 'our wire and the vendor\'s stored placeholders reduce to one form (a person, everyone)');
  const typedAll = 'paste: @_all is the key';
  const CANON = "  return String(text == null ? '' : text).replace(/@_user_\\d+|@_all/g, (k) => (byKey.has(k) ? `@{${byKey.get(k)}}` : k));";
  const LMcanonR = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, CANON, "  return String(text == null ? '' : text).replace(/@_user_\\d+|@_all/g, (k) => (byKey.has(k) ? `@{${byKey.get(k)}}` : (k === '@_all' ? '@{all}' : k)));", 'typed-all-read-as-everyone'), 'mentions-canon-all');   // stale-pins: kept (the RED plants the compare as it was)
  ok(LM.canonVendor(typedAll, []) === LM.canonWire(LM.wireText(typedAll, [])), 'a literal everyone placeholder a person typed as words (no mention of the message names it) compares as the words it is');
  ok(LMcanonR.canonVendor(typedAll, []) !== LMcanonR.canonWire(LMcanonR.wireText(typedAll, [])), 'RED CONTROL: the compare as it was — the typed placeholder read as everyone: the landed message reads NOT landed (sent again)');
  // the scan's bounds: at most 150 at-signs, 50 names a list — past them counted and SAID (unread)
  const many = (n) => `${Array.from({ length: n }, (_, i) => `@x${i}`).join(' ')} @Ann,`;
  const m149 = dec(many(149), [A1]), m150 = dec(many(150), [A1]);
  ok(J(ids(m149)) === J([A1.id]) && m150.mentions.length === 0 && m150.unread >= 1 && LM.AT_SEEN_MAX === 150, `the scan reads at most 150 at-signs: the 150th is decided, the 151st is not read and is COUNTED (unread ${m150.unread}: the at-signs past the bound and the words past a list's 50)`);
  const SEEN = '    if (++seen > AT_SEEN_MAX) { out.unread++; if (seen > 100000) break; continue; }   // past the bound: counted, said on the card\n';
  const LMseenR = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, SEEN, '    ++seen;\n', 'scan-unbounded'), 'mentions-scan-unbounded');
  ok(dec(many(150), [A1], null, LMseenR).mentions.length === 1, 'RED CONTROL: the loop with no bound — the 151st at-sign is read (the scan is people × every at-sign of the text)');
  const TAGS = '<at user_id="ou_ann0000001">Ann</at> and <at user_id="ou_zzzz0000001">Eve</at> and <at user_id="all"></at>';
  const t = dec(TAGS, [], WHOLE([ANN])), t0 = dec(TAGS, [ANN]);
  ok(J(t.mentions) === J([{ name: 'Ann', id: ANN.id }, { name: '所有人', id: 'all' }]) && J(t.plain) === J(['Eve']) && J(t0.open) === J(['Eve']) && t0.plain.length === 0, 'a TYPED tag is decided like a name: a known id kept, all = everyone, any other id its label as words — plain over a whole list, OPEN without one', J({ t, t0 }));
  // RULE D — THE WIRE TAGS THE DECISION'S PLACES
  const T = 'Hi @Ann Lee, @张三请看 @Zed <at user_id="ou_zzzz0000001">Eve</at>';
  const dw = dec(T, [], WHOLE([ANN, ZHANG]));
  const w = LM.wireText(T, dw.places);
  ok(w === 'Hi <at user_id="ou_ann0000001">Ann Lee</at>, <at user_id="ou_zhang00001">张三</at>请看 @Zed @Eve' && dw.places.length === 2,
    'THE WIRE in Lark\'s own form at the decision\'s places — «<at user_id="ou_xxx">user name(optional)</at>» (Lark\'s page, Message content: text); a name not decided stays the characters it was; an undecided typed tag goes as its label', w);
  const T2 = '@所有人 看';
  ok(LM.wireText(T2, dec(T2, [], WHOLE([])).places) === '<at user_id="all"></at> 看', 'everyone on the wire: «<at user_id="all"></at>» (Lark\'s page: only where the group allows it)');
  const TD = '@Ann, please sync with @Ann Lee, thanks';
  const dd = dec(TD, [A1]);
  const wd = LM.wireText(TD, dd.places);
  ok(J(dd.open) === J(['Ann Lee']) && wd === '<at user_id="ou_ann0000009">Ann</at>, please sync with @Ann Lee, thanks', `RULE D: «@Ann, … @Ann Lee» with Ann known and no list — the first place is Ann, the second OPEN on the card, and the wire tags ONLY the first («${wd}»)`);
  const PLACES = '  for (const p of ps) if (p.tag !== true) events.push({ at: p.at, end: p.at + 1 + p.len, tag: false, id: p.id, p });\n';
  const BY_NAMES = "  { const nm = [...new Map(ps.filter((p) => p.tag !== true).map((p) => [p.id, s.slice(p.at + 1, p.at + 1 + p.len)])).entries()]; for (const mm of s.matchAll(/(^|\\s)@/g)) { const at = mm.index + mm[0].length - 1; let hit = null; for (const [id, n] of nm) if (lower(s.slice(at + 1, at + 1 + n.length)) === lower(n) && !WORD_RE.test(s.charAt(at + 1 + n.length) || '') && (!hit || n.length > hit[1].length)) hit = [id, n]; if (hit) events.push({ at, end: at + 1 + hit[1].length, tag: false, id: hit[0] }); } }\n";
  const LMnamesR = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, PLACES, BY_NAMES, 'wire-by-names'), 'mentions-wire-by-names');
  const wdR = LMnamesR.wireText(TD, dd.places);
  ok((wdR.match(/<at /g) || []).length === 2, `RED CONTROL: the wire matching the decided names again (the round as it was) — a tag where the card said «Not looked up» («${wdR}»)`);
  ok(LM.wireText('@Ann, hi', [{ at: 4, len: 3, id: A1.id }]) === '@Ann, hi', 'a place that does not sit on an at-sign of this text is left as its characters (fail safe)');
  // the follow (主开发 r1402 (2)): such a place is SAID — every decided place that did not reach the wire, by its reason; a text whose
  // places all sit says nothing. RED: the drop as it was (silent)
  const un = [], unOk = [];
  const wu = LM.wireText('@Ann, hi', [{ at: 4, len: 3, id: A1.id }, { at: 0, len: 3, id: 'not an id' }, { at: 0, len: 3, id: A1.id, tag: true }], un);
  LM.wireText(T, dw.places, unOk);
  ok(wu === '@Ann, hi' && J(un.map((u) => u.why).sort()) === J(['no-such-tag', 'not-on-an-at-sign', 'shape']) && unOk.length === 0, `A DECIDED PLACE THAT DID NOT REACH THE WIRE IS SAID, by its reason (${un.map((u) => u.why).join(', ')}); the text whose places all sit says nothing (${unOk.length})`, J({ un, unOk }));
  const uo = []; LM.wireText('@Ann hi', [{ at: 0, len: 3, id: A1.id }, { at: 1, len: 2, id: A1.id }], uo);
  ok(J(uo.map((u) => u.why)) === J(['overlap']), `round wqdnv452s: a decided place that OVERLAPS one already placed is said by its reason (${uo.map((u) => u.why).join(', ')})`);
  const SAID = "  const said = (p, why) => { if (Array.isArray(unplaced)) unplaced.push({ at: p && Number.isInteger(p.at) ? p.at : null, why }); };\n";
  const LMsilent = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, SAID, '  const said = () => {};\n', 'wire-drop-silent'), 'mentions-wire-drop-silent');
  const unR = []; LMsilent.wireText('@Ann, hi', [{ at: 4, len: 3, id: A1.id }], unR);
  ok(unR.length === 0, `RED CONTROL: the drop as it was — the decided place left the wire and nothing said so (${unR.length})`);
  ok(LM.takenOf({ code: 0, data: { mentions: [{ key: '@_user_1', id: ANN.id, id_type: 'open_id', name: 'Ann Lee' }] } }) === 1 && LM.takenOf({ code: 0, data: {} }) === null, 'the receipt\'s count is the mentions Lark\'s own answer lists (`data.mentions`); none listed = not said');
  ok(new RegExp(LM.MENTION_ID).test(ANN.id) && new RegExp(LM.MENTION_ID).test('all') && !new RegExp(LM.MENTION_ID).test('U012ABCDE'), 'Lark\'s id shape: an open_id or all — never Slack\'s');
}

console.log('② the adapter (src/channels/lark.js over a stand-in vendor — no real message leaves)');
const LF = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/lark/send-files.json'), 'utf8'));
const T0 = 1727999000000;
const CRED = { source: 'user', values: { appId: 'cli_fixture0001', appSecret: 'fixture-secret-0001' }, missing: [], why: null };
const tokens = (token) => ({ read: () => ({ token, why: null }), write: async () => {}, clear: async () => {} });
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({}), json: async () => body, text: async () => JSON.stringify(body) });
function stub(route) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const c = { url: String(url), method: init.method || 'GET', json: null, form: null };
    if (init.body instanceof FormData) { c.form = {}; for (const [k, v] of init.body.entries()) if (typeof v === 'string') c.form[k] = v; }
    else if (typeof init.body === 'string') { try { c.json = JSON.parse(init.body); } catch { c.json = null; } }
    calls.push(c);
    return route(c, calls.length);
  };
  return { calls, fetchFn };
}
const TOKEN = { access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource', 'im:chat:read'], openId: 'ou_me000000001', brand: 'feishu' };
const MEMBERS = (items, more = null) => ({ code: 0, msg: 'success', data: { items: items.map((p) => ({ member_id: p.id, member_id_type: 'open_id', name: p.name, tenant_key: 't1' })), has_more: !!more, ...(more ? { page_token: more } : {}) } });
const SENT = (mentions) => ({ code: 0, msg: 'success', data: { message_id: 'om_sent0001', create_time: String(T0), chat_id: 'oc_x', msg_type: 'text', sender: { id: 'ou_me000000001', id_type: 'open_id', sender_type: 'user' }, ...(mentions ? { mentions } : {}) } });
const isMembers = (c) => /\/im\/v1\/chats\/[^/]+\/members\?/.test(c.url);
const isMessage = (c) => c.url.includes('/im/v1/messages');
function mkLark(LARK, route, clock = null) { const s = stub(route); const a = LARK.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: s.fetchFn, now: clock || (() => T0), tokens: tokens(TOKEN) }); return { a, ...s }; }
const REFUSED = { code: 99991672, msg: 'Access denied. One of the following scopes is required: [im:chat:readonly]' };
{
  // RULE B: any at-word reads the members ONCE; the whole list decides
  { const { a, calls } = mkLark(lark, (c) => jsonRes(200, isMembers(c) ? MEMBERS([ANN, ZHANG]) : SENT()));
    const r = await a.prepareSend('oc_x', { text: 'Hi @Ann Lee', known: [ANN] });
    ok(J(r.mentions) === J([{ name: 'Ann Lee', id: ANN.id }]) && calls.filter(isMembers).length === 1 && /member_id_type=open_id/.test(calls[0].url) && !(r.unchecked && r.unchecked.length) && /^rk-[0-9a-f]{16}$/.test(r.readKey || ''), `RULE B: a text with an at-word reads the members ONCE (${calls.filter(isMembers).length}, open_id) — the whole list decides, nothing unchecked, the read's key handed back for the proposal's edits`, J(r)); }
  { const { a, calls } = mkLark(lark, (c) => jsonRes(200, isMembers(c) ? MEMBERS([]) : SENT()));
    const r = await a.prepareSend('oc_x', { text: 'no mention, a@b.example and `@Override`', known: [] });
    ok(calls.filter(isMembers).length === 0 && r.mentions.length === 0, 'a text with no at-word outside code reads NOTHING', J(r)); }
  { const { a } = mkLark(lark, (c) => jsonRes(200, isMembers(c) ? MEMBERS([BOB1, BOB2]) : SENT()));
    const r = await a.prepareSend('oc_x', { text: '@Bob hi', known: [] });
    ok(J(r.unresolved) === J(['Bob']) && r.mentions.length === 0, 'a name two members bear is ambiguous (refused by name at the proposal)', J(r)); }
  // MUST 2: two 张伟 in the members, one in the records — said, never guessed; RED: the records-only shortcut put back
  const B_LINE = '    if (LM.hasAtWords(t)) ({ fact: members, readKey: rk } = await memberFactFor(String(convId), readKey));\n';
  const SHORTCUT = MUT.load('src/channels/lark.js', anchored(larkSrc, B_LINE, '    if (LM.decideMentions({ text: t, known }).open.length) ({ fact: members, readKey: rk } = await memberFactFor(String(convId), readKey));\n', 'records-only-shortcut'), 'lark-records-shortcut');
  const twinLeg = async (LARK) => { const { a, calls } = mkLark(LARK, (c) => jsonRes(200, isMembers(c) ? MEMBERS([ZW1, ZW2]) : SENT())); const r = await a.prepareSend('oc_x', { text: '@张伟，请看', known: [ZW1] }); return { ids: ids(r), unresolved: r.unresolved, reads: calls.filter(isMembers).length }; };
  const tw = await twinLeg(lark), twR = await twinLeg(SHORTCUT);
  ok(tw.ids.length === 0 && J(tw.unresolved) === J(['张伟']) && tw.reads === 1, `MUST 2: two 张伟 in the members, one in the records — the read is asked (${tw.reads}) and the name is SAID as two people's (refused by name), never guessed`, J(tw));
  ok(J(twR.ids) === J([ZW1.id]) && twR.reads === 0, 'RED CONTROL: the records-only shortcut put back (no read when nothing is open) — the 张伟 who wrote here is notified, a guess the card cannot show', J(twR));
  // the whole name through the adapter — RED: whole taken from the caller
  const CALLER_WHOLE = MUT.load('src/channels/lark.js', anchored(larkSrc, B_LINE, '    members = { list: Array.isArray(known) ? known : [], whole: true };\n', 'known-taken-as-whole'), 'lark-known-whole');
  const wholeLeg = async (LARK, text, known, members) => { const { a, calls } = mkLark(LARK, (c) => jsonRes(200, isMembers(c) ? MEMBERS(members) : SENT())); const r = await a.prepareSend('oc_x', { text, known }); return { ids: ids(r), reads: calls.filter(isMembers).length, open: r.open }; };
  const wc = await wholeLeg(lark, '@王伟强 看一下', [W1], [W1, W3]), wcR = await wholeLeg(CALLER_WHOLE, '@王伟强 看一下', [W1], [W1, W3]);
  ok(J(wc.ids) === J([W3.id]) && wc.reads === 1, `THE WHOLE NAME (CJK): only 王伟 known, the text holds 王伟强 — the read decides the WHOLE name 王伟强 (${J(wc.ids)})`, J(wc));
  ok(J(wcR.ids) === J([W1.id]) && wcR.reads === 0, `RED CONTROL: whole taken from the caller (the known people as a whole list) — 王伟 notified for 王伟强, no member read (${J(wcR.ids)})`, J(wcR));
  const wl = await wholeLeg(lark, '@Ann Lee please look', [A1], [A1, ANN]), wlR = await wholeLeg(CALLER_WHOLE, '@Ann Lee please look', [A1], [A1, ANN]);
  ok(J(wl.ids) === J([ANN.id]) && wl.reads === 1, `THE WHOLE NAME (Latin): only Ann known — the read decides Ann Lee (${J(wl.ids)})`, J(wl));
  ok(J(wlR.ids) === J([A1.id]), `RED CONTROL: whole taken from the caller — Ann notified for Ann Lee (${J(wlR.ids)})`, J(wlR));
  // MUST 1 through the adapter: Jean known, the read refused — Jean-Pierre stays open
  { const { a } = mkLark(lark, (c) => (isMembers(c) ? jsonRes(400, REFUSED) : jsonRes(200, SENT())));
    const r = await a.prepareSend('oc_x', { text: '@Jean-Pierre, can you review', known: [JEAN] });
    ok(r.mentions.length === 0 && J(r.open) === J(['Jean-Pierre']) && r.openWhy === 'members-unreadable', 'MUST 1 (the adapter): Jean known, the member read refused — @Jean-Pierre stays OPEN and is said, never Jean', J(r)); }
  // SCENE TWO: a read that ends at ten pages with a page mark left is NOT whole
  const filler = (k) => Array.from({ length: 100 }, (_, i) => ({ id: `ou_fill${String(k * 1000 + i).padStart(6, '0')}`, name: `Member ${k}-${i}` }));
  const bigChat = (c) => { const tok = new URL(c.url).searchParams.get('page_token'); const k = tok ? Number(tok.slice(1)) : 0; return jsonRes(200, MEMBERS(k === 10 ? [ANN, W3] : k === 0 ? [A1, W1, ...filler(k)] : filler(k), k < 10 ? `p${k + 1}` : null)); };   // Ann and 王伟 on page one; Ann Lee and 王伟强 past page ten
  const sceneTwo = async (LARK, text, known) => { const { a, calls } = mkLark(LARK, (c) => (isMembers(c) ? bigChat(c) : jsonRes(200, SENT()))); const r = await a.prepareSend('oc_x', { text, known }); return { ids: ids(r), open: r.open, why: r.openWhy, reads: calls.filter(isMembers).length }; };
  const s2l = await sceneTwo(lark, '@Ann Lee please look', [A1]), s2c = await sceneTwo(lark, '@王伟强 看一下', [W1]);
  ok(s2l.ids.length === 0 && J(s2l.open) === J(['Ann Lee']) && s2l.why === 'members-partial' && s2l.reads === 10 && s2c.ids.length === 0 && J(s2c.open) === J(['王伟强']), `SCENE TWO: a member read that ends at ten pages with a page mark left is NOT whole — @Ann Lee / @王伟强 stay open, said («${s2l.why}», ${s2l.reads} pages)`, J({ s2l, s2c }));
  const WHOLE_LINE = "    return m.partial ? { list, whole: false, why: 'members-partial' } : { list, whole: true, why: null };\n";
  const CUT_WHOLE = MUT.load('src/channels/lark.js', anchored(larkSrc, WHOLE_LINE, '    return { list, whole: true, why: null };\n', 'cut-list-taken-as-whole'), 'lark-cut-whole');
  const s2R = await sceneTwo(CUT_WHOLE, '@Ann Lee please look', [A1]);
  ok(J(s2R.ids) === J([A1.id]), `RED CONTROL: the list cut at page ten taken as whole — Ann notified for Ann Lee (${J(s2R.ids)})`, J(s2R));
  { const { a } = mkLark(lark, (c) => (isMembers(c) ? jsonRes(503, { code: 1, msg: 'service unavailable' }) : jsonRes(200, SENT())));
    const r = await a.prepareSend('oc_x', { text: '@张三，请看', known: [ZHANG] });
    ok(J(ids(r)) === J([ZHANG.id]) && J(r.unchecked) === J(['张三']) && r.uncheckedWhy === 'members-no-answer', `RULE B, the read failed (a transport blip): the records' 张三 before a comma is decided, and SAID on its own row — not checked against the members, «${r.uncheckedWhy}»`, J(r)); }
  // RULE B: ONE read a proposal, kept for its edits — RED: the kept read cut
  const KEPT = '    if (kept && kept.convId === convId && now() - kept.at < READS_KEPT_MS) return { fact: kept.fact, readKey: k };\n';
  const NOKEEP = MUT.load('src/channels/lark.js', anchored(larkSrc, KEPT, '', 'kept-read-cut'), 'lark-no-kept-read');
  const keptLeg = async (LARK) => { let t = T0; const { a, calls } = mkLark(LARK, (c) => jsonRes(200, isMembers(c) ? MEMBERS([ZHANG, LI]) : SENT()), () => t);
    const p = await a.prepareSend('oc_x', { text: '@张三 请看', known: [] });
    t += 5 * 60e3; const e1 = await a.prepareSend('oc_x', { text: '@张三 和 @李四 请看', known: [], readKey: p.readKey });
    t += 5 * 60e3; const e2 = await a.prepareSend('oc_x', { text: '@李四 请看', known: [], readKey: p.readKey });
    return { reads: calls.filter(isMembers).length, ids: [ids(p), ids(e1), ids(e2)], keys: [p.readKey, e1.readKey, e2.readKey] }; };
  const kl = await keptLeg(lark), klR = await keptLeg(NOKEEP);
  ok(kl.reads === 1 && J(kl.ids) === J([[ZHANG.id], [ZHANG.id, LI.id], [LI.id]]) && new Set(kl.keys).size === 1, `RULE B: a proposal and two edits ten minutes apart — ONE member read (${kl.reads}), kept under the proposal's key`, J(kl));
  ok(klR.reads === 3, `RED CONTROL: the kept read cut — every edit past the minute's own copy reads again (${klR.reads})`);
  // A READ THAT FAILS NEVER REFUSES — RED: the read's catch cut
  const rateLeg = async (LARK) => { const { a, calls } = mkLark(LARK, (c) => (isMembers(c) ? jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }) : jsonRes(200, SENT())));
    const first = await a.prepareSend('oc_x', { text: 'see @decorator in the pasted code', known: [] }).then((r) => r, (e) => ({ threw: (e && e.code) || 'threw' }));
    const n0 = calls.filter(isMembers).length;
    const next = await a.prepareSend('oc_x', { text: '@张三 再看', known: [] }).then((r) => r, (e) => ({ threw: (e && e.code) || 'threw' }));
    return { first, next, n0, after: calls.filter(isMembers).length - n0 }; };
  const rl = await rateLeg(lark);
  ok(!rl.first.threw && J(rl.first.open) === J(['decorator']) && rl.first.openWhy === 'members-rate-limited' && !rl.next.threw && rl.after === 0 && rl.next.openWhy === 'members-rate-limited', `A READ THAT FAILS NEVER REFUSES: the vendor's rate refusal — the proposal is decided with the word open and said BY ITS CAUSE («${rl.first.openWhy}»); the next reads NOTHING while the back-off holds, said the same (${rl.after}, «${rl.next.openWhy}»)`, J(rl));
  // the follow (r1402 (1)): RED — the words as they were («no answer» for the vendor's rate refusal and its back-off)
  const RATE_WHY = "    if (names === null) return { list: [], whole: false, why: vendorRateUntil > now() ? 'members-rate-limited' : 'members-no-answer' };   // the back-off that holds, BY ITS CAUSE: a rate pause that holds is said, even inside a longer transport one\n";
  const CATCH = "    try { names = await namesFor(convId, { fresh: true }); }\n    catch (e) { return { list: [], whole: false, why: e instanceof ChannelError && e.code === 'auth-expired' ? 'members-signed-out' : e instanceof ChannelError && e.code === 'rate-limited' ? 'members-rate-limited' : 'members-no-answer' }; }   // rate-ok: prepare-members\n";
  const rlW = await rateLeg(MUT.load('src/channels/lark.js', anchored(anchored(larkSrc, CATCH, "    try { names = await namesFor(convId, { fresh: true }); }\n    catch (e) { return { list: [], whole: false, why: e instanceof ChannelError && e.code === 'auth-expired' ? 'members-signed-out' : 'members-no-answer' }; }   // rate-ok: prepare-members\n", 'rate-said-no-answer'), RATE_WHY, "    if (names === null) return { list: [], whole: false, why: 'members-no-answer' };\n", 'backoff-said-no-answer'), 'lark-rate-no-answer'));   // stale-pins: kept (the RED: the words as they were)
  ok(rlW.first.openWhy === 'members-no-answer' && rlW.next.openWhy === 'members-no-answer', `RED CONTROL: the words as they were — the vendor's rate refusal and its back-off are said «${rlW.first.openWhy}» (no answer)`, J(rlW));
  // the second follow (主开发 r1403 (1)): a RATE refusal is never asked again SOONER than the vendor's own word — a 429 whose
  // Retry-After says 600 s: a proposal at +301 s reads nothing (said «rate limited»), one at +601 s reads once. RED: the pause as
  // it was (five minutes at most) — the +301 s proposal asks the vendor again before its word
  const waitLeg = async (LARK) => {
    let t = T0, first = true;
    const { a, calls } = mkLark(LARK, (c) => { if (!isMembers(c)) return jsonRes(200, SENT()); if (first) { first = false; return { ...jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }), headers: new Headers({ 'retry-after': '600' }) }; } return jsonRes(200, MEMBERS([ZHANG])); }, () => t);
    const p1 = await a.prepareSend('oc_x', { text: '@张三 请看', known: [] });
    t = T0 + 301e3; const p2 = await a.prepareSend('oc_x', { text: '@张三 再看', known: [] }); const at301 = calls.filter(isMembers).length;
    t = T0 + 601e3; const p3 = await a.prepareSend('oc_x', { text: '@张三 三看', known: [] }); const at601 = calls.filter(isMembers).length;
    return { why: [p1.openWhy || null, p2.openWhy || null], at301, at601, ids3: ids(p3) };
  };
  const wv = await waitLeg(lark);
  ok(wv.at301 === 1 && wv.why[0] === 'members-rate-limited' && wv.why[1] === 'members-rate-limited' && wv.at601 === 2 && J(wv.ids3) === J([ZHANG.id]), `A RATE REFUSAL WAITS THE VENDOR'S WORD (600 s): at +301 s nothing is asked (${wv.at301} read, said «${wv.why[1]}»); at +601 s one read, 张三 decided`, J(wv));
  const PAUSE = "const ms = Math.max(1e3, (Number.isFinite(hint) && hint > 0 ? hint : 60) * 1000); return e instanceof ChannelError && e.code === 'rate-limited' ? Math.min(24 * 3600e3, ms) : Math.min(300e3, ms); };";
  const wvR = await waitLeg(MUT.load('src/channels/lark.js', anchored(larkSrc, PAUSE, 'const ms = Math.max(1e3, (Number.isFinite(hint) && hint > 0 ? hint : 60) * 1000); return Math.min(300e3, ms); };', 'rate-pause-capped'), 'lark-rate-pause-capped'));
  ok(wvR.at301 === 2, `RED CONTROL: the pause as it was (five minutes at most) — a proposal at +301 s asks the vendor again BEFORE its 600 s word (${wvR.at301} reads)`, J(wvR));
  // round wqdnv452s (the MUST, two readers): THE WORDS NAME THE CAUSE THAT SET THE PAUSE. A profile read refused for want of a
  // privilege (6 h) pauses the people reads ONLY — the next proposal's member read (another privilege) still runs and decides; a
  // profile read's transport blip pauses the member read for the vendor's moment, said «no answer», never «rate limited». RED:
  // the wait and the words read off the ONE shared pause (the tip) — 6 h of «rate limited» for a missing privilege, and a blip
  // said «rate limited»
  const TOKEN_P = { ...TOKEN, scopes: [...TOKEN.scopes, 'contact:contact:readonly'] };
  const causeLeg = async (LARK, peer, profileAnswer) => {
    let t = T0;
    const s = stub((c) => {
      if (c.url.includes('/contact/v3/users/')) return profileAnswer();
      if (isMembers(c)) return jsonRes(200, MEMBERS(c.url.includes('oc_dm') ? [] : [ZHANG]));
      if (/\/im\/v1\/chats\/oc_dm(\?|$)/.test(c.url)) return jsonRes(200, { code: 0, msg: 'success', data: { chat_mode: 'p2p' } });
      return jsonRes(200, SENT());
    });
    const a = LARK.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: s.fetchFn, now: () => t, tokens: tokens(TOKEN_P) });
    await a.describe('oc_dm', { peerIds: [peer] }).catch(() => null);   // a single chat's peer, named by a profile read
    const profileReads = s.calls.filter((c) => c.url.includes('/contact/v3/users/')).length;
    t = T0 + 30e3;
    const m0 = s.calls.filter((c) => isMembers(c) && c.url.includes('oc_x')).length;
    const p = await a.prepareSend('oc_x', { text: '@张三 请看', known: [] });
    return { profileReads, memberReads: s.calls.filter((c) => isMembers(c) && c.url.includes('oc_x')).length - m0, ids: ids(p), openWhy: p.openWhy || null };
  };
  const PRIV = () => jsonRes(400, { code: 99991679, msg: 'permission denied: contact range' });
  const BLIP = () => jsonRes(503, { code: 0, msg: 'service unavailable' });
  const FRESH_GATE = "    if (fresh && ((c && c.until && now() < c.until) || vendorRateUntil > now() || vendorBlipUntil > now())) return null;\n";
  const SHARED = MUT.load('src/channels/lark.js', anchored(anchored(larkSrc, FRESH_GATE, "    if (fresh && ((c && c.until && now() < c.until) || peopleRefusedUntil > now())) return null;\n", 'one-shared-pause-gate'), RATE_WHY, "    if (names === null) return { list: [], whole: false, why: peopleRefusedUntil > now() ? 'members-rate-limited' : 'members-no-answer' };\n", 'one-shared-pause-words'), 'lark-one-shared-pause');   // stale-pins: kept (the RED: the tip's one shared pause)
  const cp = await causeLeg(lark, 'ou_peerpriv0001', PRIV), cb = await causeLeg(lark, 'ou_peerblip0001', BLIP);
  const cpR = await causeLeg(SHARED, 'ou_peerpriv0002', PRIV), cbR = await causeLeg(SHARED, 'ou_peerblip0002', BLIP);
  ok(cp.profileReads === 1 && cp.memberReads === 1 && J(cp.ids) === J([ZHANG.id]) && cb.profileReads === 1 && cb.memberReads === 0 && cb.openWhy === 'members-no-answer',
    `THE WORDS NAME THE CAUSE: a profile refused for want of a privilege pauses the people reads only — the proposal's member read runs (${cp.memberReads}) and 张三 is decided; a profile read's transport blip holds the member read for the vendor's moment, said «${cb.openWhy}»`, J({ cp, cb }));
  ok(cpR.memberReads === 0 && cpR.openWhy === 'members-rate-limited' && cbR.openWhy === 'members-rate-limited', `RED CONTROL: the tip's one shared pause — a missing privilege blocks the member read and is said «${cpR.openWhy}» (for 6 h), and a transport blip is said «${cbR.openWhy}»`, J({ cpR, cbR }));
  // round wpi95ogqk (the small): A RATE REFUSAL INSIDE A LONGER TRANSPORT PAUSE IS SAID «rate limited». A profile read's blip asks
  // 300 s; ten seconds on, another chat's member page is refused by rate for 60 s; a proposal at +30 s is held, said «rate limited»
  // (both hold); at +100 s only the blip holds, said «no answer». RED: one deadline named by the longer of the two (aa49210c9)
  const insideLeg = async (LARK) => {
    let t = T0;
    const s0 = stub((c) => {
      if (c.url.includes('/contact/v3/users/')) return { ...jsonRes(503, { code: 0, msg: 'service unavailable' }), headers: new Headers({ 'retry-after': '300' }) };
      if (isMembers(c) && c.url.includes('oc_dm2')) return { ...jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }), headers: new Headers({ 'retry-after': '60' }) };
      if (isMembers(c)) return jsonRes(200, MEMBERS(c.url.includes('oc_dm') ? [] : [ZHANG]));
      if (/\/im\/v1\/chats\/oc_dm2?(\?|$)/.test(c.url)) return jsonRes(200, { code: 0, msg: 'success', data: { chat_mode: 'p2p' } });
      return jsonRes(200, SENT());
    });
    const a = LARK.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: s0.fetchFn, now: () => t, tokens: tokens(TOKEN_P) });
    await a.describe('oc_dm', { peerIds: ['ou_peerblip0003'] }).catch(() => null);   // the blip: 300 s
    t = T0 + 10e3; await a.describe('oc_dm2', { peerIds: [] }).catch(() => null);   // the rate refusal: 60 s, inside it
    t = T0 + 30e3; const p30 = await a.prepareSend('oc_x', { text: '@张三 请看', known: [] });
    t = T0 + 100e3; const p100 = await a.prepareSend('oc_x', { text: '@张三 再看', known: [] });
    return { at30: p30.openWhy || null, at100: p100.openWhy || null, memberReadsX: s0.calls.filter((c) => isMembers(c) && c.url.includes('oc_x')).length };
  };
  const ONE_DEADLINE = MUT.load('src/channels/lark.js', anchored(anchored(anchored(anchored(larkSrc, FRESH_GATE, "    if (fresh && ((c && c.until && now() < c.until) || vendorPausedUntil > now())) return null;\n", 'one-vendor-deadline-gate'),   // stale-pins: kept (the RED: aa49210c9's one deadline put back)
    "  let vendorRateUntil = 0, vendorBlipUntil = 0;\n", "  let vendorPausedUntil = 0, vendorPausedWhy = null;\n", 'one-vendor-deadline-vars'),   // stale-pins: kept (the RED: aa49210c9's one deadline put back)
    "    if (cause === 'rate' && until > vendorRateUntil) vendorRateUntil = until;\n    if (cause === 'transport' && until > vendorBlipUntil) vendorBlipUntil = until;\n",
    "    if ((cause === 'rate' || cause === 'transport') && until > vendorPausedUntil) { vendorPausedUntil = until; vendorPausedWhy = cause; }\n", 'one-vendor-deadline-writer'),   // stale-pins: kept (the RED: aa49210c9's one deadline put back)
    RATE_WHY, "    if (names === null) return { list: [], whole: false, why: vendorPausedUntil > now() && vendorPausedWhy === 'rate' ? 'members-rate-limited' : 'members-no-answer' };\n", 'one-vendor-deadline-words'), 'lark-one-vendor-deadline');   // stale-pins: kept (the RED: aa49210c9's one deadline put back)
  const il = await insideLeg(lark);
  ok(il.at30 === 'members-rate-limited' && il.at100 === 'members-no-answer' && il.memberReadsX === 0, `A RATE REFUSAL INSIDE A LONGER TRANSPORT PAUSE: at +30 s (both hold) said «${il.at30}»; at +100 s (the blip alone) «${il.at100}»; no member read while either holds`, J(il));
  const ilR = await insideLeg(ONE_DEADLINE);
  ok(ilR.at30 === 'members-no-answer', `RED CONTROL: one vendor deadline named by the longer of the two (aa49210c9) — the rate refusal standing inside the blip's pause is said «${ilR.at30}»`, J(ilR));
  // round wqdnv452s (shoulds): the rate pause's ONE-DAY ceiling (a broken header never holds the read for ever) and the transport
  // blip's FIVE-MINUTE bound (kept when the rate branch split off), each by the clock
  const TOKEN_DAY = { ...TOKEN, expiresAt: T0 + 30 * 86400e3 };   // a sign-in that outlives the day the leg waits (the fixture's lives an hour)
  const boundLeg = async (answer, at) => {
    let t = T0, first = true;
    const s0 = stub((c) => { if (!isMembers(c)) return jsonRes(200, SENT()); if (first) { first = false; return answer(); } return jsonRes(200, MEMBERS([ZHANG])); });
    const a = lark.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: s0.fetchFn, now: () => t, tokens: tokens(TOKEN_DAY) }), calls = s0.calls;
    await a.prepareSend('oc_x', { text: '@张三 请看', known: [] });
    const n0 = calls.filter(isMembers).length;
    const out = [];
    for (const dt of at) { t = T0 + dt; const p = await a.prepareSend('oc_x', { text: `@张三 ${dt}`, known: [] }); out.push({ dt, read: calls.filter(isMembers).length - n0, ids: ids(p) }); }
    return out;
  };
  const day = await boundLeg(() => ({ ...jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }), headers: new Headers({ 'retry-after': '999999999' }) }), [86399e3, 86401e3]);
  const blip = await boundLeg(() => ({ ...jsonRes(503, { code: 0, msg: 'service unavailable' }), headers: new Headers({ 'retry-after': '900' }) }), [301e3]);
  ok(day[0].read === 0 && day[1].read === 1 && J(day[1].ids) === J([ZHANG.id]) && blip[0].read === 1, `THE BOUNDS: a rate word of 999 999 999 s holds the member read one day at most (at +86 399 s ${day[0].read} read, at +86 401 s ${day[1].read}); a transport blip asking 900 s holds it five minutes (at +301 s ${blip[0].read} read)`, J({ day, blip }));
  const rlR = await rateLeg(MUT.load('src/channels/lark.js', anchored(larkSrc, CATCH, '    names = await namesFor(convId, { fresh: true });\n', 'read-failure-refuses'), 'lark-read-throws'));
  ok(rlR.first.threw === 'rate-limited', `RED CONTROL: the read's catch cut — the rate refusal refuses the whole proposal (${rlR.first.threw})`, J(rlR));
  { const { a } = mkLark(lark, (c) => (isMembers(c) ? jsonRes(401, { code: 99991668, msg: 'Invalid access token for authorization' }) : jsonRes(200, SENT())));
    const r = await a.prepareSend('oc_x', { text: '@张三 请看', known: [] }).then((x) => x, (e) => ({ threw: (e && e.code) || 'threw' }));
    ok(!r.threw && J(r.open) === J(['张三']) && r.openWhy === 'members-signed-out', `a DEAD sign-in on the member read: the proposal is still decided, the word open and said («${r.openWhy}»)`, J(r)); }
  // THE RECONCILE: its re-issue sends the decision the approve stored (its places); its scan knows its own landed message
  { const recLeg = async (LARK, page, sentAt, text = '@Ann Lee please look', prepared = { mentions: [{ name: 'Ann Lee', id: ANN.id }], places: [{ at: 0, len: 7, id: ANN.id }] }) => { const { a, calls } = mkLark(LARK, (c) => (c.method === 'GET' && c.url.includes('/im/v1/messages?') ? jsonRes(200, { code: 0, data: { items: page, has_more: false } }) : jsonRes(200, SENT([{ key: '@_user_1', id: ANN.id, id_type: 'open_id', name: 'Ann Lee' }]))));
      const r = await a.reconcile('oc_x', { idemKey: 'p-9', sentAt, text, prepared });
      const sent = calls.find((c) => c.method === 'POST' && isMessage(c) && c.json && c.json.msg_type === 'text');
      return { r, wire: sent ? JSON.parse(sent.json.content).text : null }; };
    const REISSUE = "          const r = await sendImpl(convId, { text: wanted, replyTo, idemKey, as: 'user', replyAnchor, inThread, prepared });   // MUST 2: the re-issue carries the decision\n";
    const re1 = await recLeg(lark, [], T0);
    ok(re1.r.landed === true && re1.wire === '<at user_id="ou_ann0000001">Ann Lee</at> please look', `the re-issue: a lost send re-issued inside the vendor's window sends the stored decision at its places («${re1.wire}»)`, J(re1));
    const re1R = await recLeg(MUT.load('src/channels/lark.js', anchored(larkSrc, REISSUE, "          const r = await sendImpl(convId, { text: wanted, replyTo, idemKey, as: 'user', replyAnchor, inThread });\n", 'reissue-without-the-decision'), 'lark-reissue-plain'), [], T0);   // stale-pins: kept (the RED plants the re-issue as it was)
    ok(re1R.wire === '@Ann Lee please look', `RED CONTROL: the re-issue without the decision — «${re1R.wire}»: plain words while the card said the person was notified`);
    const past = T0 - 2 * 3600e3;
    const msg = (text, mentions) => [{ message_id: 'om_l1', create_time: String(past + 1000), msg_type: 'text', deleted: false, sender: { id: 'ou_me000000001', id_type: 'open_id', sender_type: 'user' }, body: { content: JSON.stringify({ text }) }, mentions }];
    const re2 = await recLeg(lark, msg('@_user_1 please look', [{ key: '@_user_1', id: ANN.id, id_type: 'open_id', name: 'Ann Lee' }]), past);
    ok(re2.r.landed === true && re2.r.vendorMessageId === 'om_l1' && re2.wire === null, 'the scan: the message that DID land with its mention (stored as «@_user_1 …») reads LANDED, past the re-issue window — nothing sent again', J(re2));
    const SCAN = "            if (c && LM.canonVendor(String(c.text || ''), m.mentions) === wantCanon && (!replyTo";
    const re2R = await recLeg(MUT.load('src/channels/lark.js', anchored(larkSrc, SCAN, "            if (c && String(c.text || '') === wanted && (!replyTo", 'scan-plain-compare'), 'lark-scan-plain'), msg('@_user_1 please look', [{ key: '@_user_1', id: ANN.id, id_type: 'open_id', name: 'Ann Lee' }]), past);   // stale-pins: kept (the RED plants the scan as it was)
    ok(re2R.r.landed === false, `RED CONTROL: the scan comparing the plain text with the stored placeholders — «${re2R.r.reason}»: a landed message read as not landed`, J(re2R.r));
    const re3 = await recLeg(lark, msg('paste: @_all is the key', []), past, 'paste: @_all is the key', { mentions: [], places: [] });
    ok(re3.r.landed === true && re3.wire === null, 'the scan: a message whose words hold a typed everyone placeholder (no mention of it) reads LANDED', J(re3)); }
  const LINE = "    const wire = LM.wireText(String(text == null ? '' : text), prepared && prepared.places, unplaced);   // round wfgpbe038 D: the decision's own places\n";
  const RELEASE = MUT.load('src/channels/lark.js', anchored(larkSrc, LINE, "    const wire = String(text == null ? '' : text);\n", 'lark-wire-as-typed'), 'lark-release-wire');
  const sendLeg = async (LARK, attachments = null) => {
    const { a, calls } = mkLark(LARK, (c) => jsonRes(200, c.url.includes('/im/v1/images') ? LF.answers.image : SENT([{ key: '@_user_1', id: ANN.id, id_type: 'open_id', name: 'Ann Lee' }])));
    const r = await a.send('oc_x', { text: 'Hi @Ann Lee, and @Zed', idemKey: 'p-1', as: 'user', prepared: { mentions: [{ name: 'Ann Lee', id: ANN.id }], places: [{ at: 3, len: 7, id: ANN.id }] }, ...(attachments ? { attachments } : {}) });
    const textMsg = calls.find((c) => isMessage(c) && c.json && c.json.msg_type === 'text');
    return { r, wire: textMsg ? JSON.parse(textMsg.json.content).text : null };
  };
  const s1 = await sendLeg(lark);
  ok(s1.wire === 'Hi <at user_id="ou_ann0000001">Ann Lee</at>, and @Zed' && s1.r.mentionsTaken === 1, `THE SEND: the decided place in Lark's form on the wire, the undecided name its characters; the answer's count (${s1.r.mentionsTaken})`, J(s1));
  const s1R = await sendLeg(RELEASE);
  // the follow (r1402 (2)): a decided place that no longer sits on the text is SAID on the send's answer (the receipt's count)
  { const { a } = mkLark(lark, () => jsonRes(200, SENT([])));
    const r = await a.send('oc_x', { text: 'Hi', idemKey: 'p-u1', as: 'user', prepared: { mentions: [{ name: 'Ann Lee', id: ANN.id }], places: [{ at: 30, len: 7, id: ANN.id }] } });
    const rc = P.receiptFor({ state: 'sent', prepared: { mentions: [{ name: 'Ann Lee', id: ANN.id }] }, result: { mentionsUnplaced: r.mentionsUnplaced } });
    ok(r.mentionsUnplaced === 1 && rc && rc.notified && rc.notified.unplaced === 1 && /not placed: 1 decided mention no longer sat on the text at the send/.test(P.renderReceiptBlock(rc)), `THE SEND SAYS A DECIDED PLACE OFF THE TEXT: its answer counts it (${r.mentionsUnplaced}), the receipt says it`, J({ r: { mentionsUnplaced: r.mentionsUnplaced }, notified: rc && rc.notified })); }
  // the follow (r1402 (5)): THE route's status table is ONE function the page leg ㉖ reads (never a hand copy of it)
  { const RT = require(path.join(REPO, 'src/routes/channels.js'));
    const st = ['mentions-changed', 'changed-since-shown', 'not-found', 'bad-proposal'].map((code) => RT.answer3Status({ ok: false, code }));
    ok(typeof RT.answer3Status === 'function' && RT.answer3Status({ ok: true }) === 200 && J(st) === J([409, 409, 404, 400]), `the route's ONE status table (answer3Status, exported): a changed decision and a changed record 409, not found 404, a bad proposal 400 (${st.join(', ')})`); }
  ok(s1R.wire === 'Hi @Ann Lee, and @Zed', `RED CONTROL: the release's send (the text as typed) — the wire carries «${s1R.wire}»: plain words, nobody notified`);
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  const files = [{ name: 'a.png', mime: 'image/png', kind: 'image', bytes: PNG.length, data: PNG }];
  const s2 = await sendLeg(lark, files);
  ok(s2.wire === 'Hi <at user_id="ou_ann0000001">Ann Lee</at>, and @Zed', 'WITH FILES: the text part (sent first, as its own message) carries the mention in Lark\'s form', J(s2));
  const s2wR = await sendLeg(RELEASE, files);
  ok(s2wR.wire === 'Hi @Ann Lee, and @Zed', `RED CONTROL: the release's files road — the text part «${s2wR.wire}»`);
  // round wqdnv452s (a should): THE FILES ROAD says a decided place off the text too (its answer carries the count)
  { const { a } = mkLark(lark, (c) => jsonRes(200, c.url.includes('/im/v1/images') ? LF.answers.image : SENT([])));
    const rf = await a.send('oc_x', { text: 'Hi', idemKey: 'p-u2', as: 'user', prepared: { mentions: [{ name: 'Ann Lee', id: ANN.id }], places: [{ at: 30, len: 7, id: ANN.id }] }, attachments: files });
    ok(rf && rf.mentionsUnplaced === 1, `THE FILES ROAD: a decided place off the text is counted on the answer too (${rf && rf.mentionsUnplaced})`, J(rf && { mentionsUnplaced: rf.mentionsUnplaced })); }
}

console.log('③ the registry: each adapter\'s own id shape; a mention and its name as a PAIR; the places, the read key, the said words');
{
  const idxSrc = fs.readFileSync(path.join(REPO, 'src/channels/index.js'), 'utf8');
  const asked = [{ name: 'Ann Lee', id: ANN.id }, { name: 'Slacky', id: 'U012ABCDE' }, { name: '所有人', id: 'all' }];
  const wrapLeg = (CHM, mentionId) => {
    const base = fake.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] });
    const mod = { ...base, caps: { ...base.caps, prepareSend: true, ...(mentionId ? { mentionId } : {}) } };
    mod.create = (rec, deps) => ({ ...base.create(rec, deps), async prepareSend() { return { text: 'x', mentions: asked, notifies: ['Ann Lee', 'Slacky', '所有人'], unresolved: [], plain: ['Eve'], open: ['Ann Leeds'], openWhy: 'members-partial', everyone: true, places: [{ at: 0, len: 7, id: ANN.id }, { at: 9, len: 6, id: 'U012ABCDE' }, { at: 20, len: 3, id: 'all' }, { at: -1, len: 2, id: ANN.id }], unchecked: ['Ann Lee'], uncheckedWhy: 'members-partial', unread: 3, readKey: 'rk-0123456789abcdef' }; } });
    const reg = CHM.createChannelRegistry(); reg.register(mod);
    return reg.create('fake-poll', { id: 'fake-poll' }, {}).prepareSend('c', { text: 'x' });
  };
  const r1 = await wrapLeg(CH, LM.MENTION_ID);
  ok(J(ids(r1)) === J([ANN.id, 'all']) && J(r1.notifies) === J(['Ann Lee', '所有人']) && r1.everyone === true && J(r1.open) === J(['Ann Leeds']) && r1.openWhy === 'members-partial', `LARK'S SHAPE KEEPS ITS IDS (${J(ids(r1))}); the mention of another shape is dropped WITH its notify name (${J(r1.notifies)}); the open words and their reason pass the bound`, J(r1));
  ok(J(r1.places.map((p) => p.id)) === J([ANN.id, 'all']) && J(r1.unchecked) === J(['Ann Lee']) && r1.uncheckedWhy === 'members-partial' && r1.unread === 3 && r1.readKey === 'rk-0123456789abcdef', 'the decided PLACES pass only for a kept mention\'s id (a place of a dropped id or out of shape is dropped); the unchecked names with their reason, the count past the bounds and the read\'s key pass', J(r1));
  const PAIR = '        const notifies = rawMentions.length ? pairs.map(([x, n]) => peerName(n, 100) || (rawOk(x) ? x.id : peerName(x.name, 100))) : names(r.notifies);';
  const r1R = await wrapLeg(MUT.load('src/channels/index.js', anchored(idxSrc, PAIR, '        const notifies = names(r.notifies);', 'notifies-filtered-alone'), 'registry-notifies-alone'), LM.MENTION_ID);
  ok(J(r1R.notifies) === J(['Ann Lee', 'Slacky', '所有人']) && r1R.mentions.length === 2, `RED CONTROL: the names filtered alone — the card would say «Slacky», whom the wire notifies not (${J(r1R.notifies)})`);
  const r2 = await wrapLeg(CH, null);
  ok(r2.mentions.length === 0 && r2.notifies.length === 0 && !r2.places, 'an adapter that states no shape carries NO mention, no name it would notify and no place (fail closed)', J(r2));
  const SHAPE = 'const pairs = rawMentions.map((x, i) => [x, rawNotifies[i]]).filter(([x]) => x && idOk(x.id)';
  const OLD = MUT.load('src/channels/index.js', anchored(idxSrc, SHAPE, 'const pairs = rawMentions.map((x, i) => [x, rawNotifies[i]]).filter(([x]) => x && typeof x.id === \'string\' && /^[A-Z0-9][A-Z0-9_]{1,40}$/.test(x.id)', 'registry-slack-shaped-bound'), 'registry-release');
  const r3 = await wrapLeg(OLD, LM.MENTION_ID);
  ok(J(ids(r3)) === J(['U012ABCDE']), `RED CONTROL: the release's bound (Slack's shape for every adapter) drops EVERY Lark id: ${J(ids(r3))}`);
  const bad = (() => { try { const base = fake.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] }); const reg = CH.createChannelRegistry(); reg.register({ ...base, caps: { ...base.caps, prepareSend: true, mentionId: 'ou_.*' } }); return null; } catch (e) { return String(e && e.message); } })();
  ok(!!bad && /caps\.mentionId must be an anchored pattern/.test(bad), 'a shape that is not anchored is refused at registration, by name', bad);
  const slackMod = require(path.join(REPO, 'src/channels/slack.js'));
  ok(slackMod.caps.mentionId === '^[A-Z0-9][A-Z0-9_]{1,40}$' && lark.caps.mentionId === LM.MENTION_ID && lark.caps.prepareSend === true, 'Slack states the shape the registry held; Lark states its own and declares the prepare step');
}

console.log('④ the engine — the outbox over the fake adapter dressed with Lark\'s mention contract (C through the real engine)');
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' };
const A = 'fake-poll', C = 'fake-poll-ops';
/** The fake adapter declaring Lark's contract: its prepare step is Lark's — any at-word asks the stand-in member read (rule B):
 *  `members` = an array (a whole list), a function of the read's index (→ the read's `{list, whole, why}`), or null (no read);
 *  the ONE decision over the engine's `known` (+ the stand-in records' people `records`). Its send writes the wire with Lark's
 *  own wireText at the decision's places. `withPrepare: false` = the release (Lark declared no prepare step). */
function dressed({ members = [], taken = null, withPrepare = true, LMM = LM, lost = false, records = [], prepare = null, unplaced = 0 } = {}) {
  const registry = CH.createChannelRegistry();
  const base = fake.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] });
  const log = { sends: [], known: [], reads: 0, reconciles: [] };
  const mod = { ...base, caps: withPrepare ? { ...base.caps, prepareSend: true, mentionId: LM.MENTION_ID } : base.caps };
  const state = { members, records, hold: null };   // `hold`: a placed wait inside the chat's capabilities read (an approve awaits it)
  mod.create = (rec, deps) => {
    const impl = base.create(rec, deps);
    const out = {
      ...impl,
      async send(c, args) {
        if (lost) { const { ChannelError } = CH; throw new ChannelError('transport', 'the answer was lost (planted)', { retryable: true, detail: { lost: true } }); }
        const wire = LM.wireText(args.text, args.prepared && args.prepared.places);
        log.sends.push({ convId: c, text: args.text, wire, prepared: args.prepared || null });
        const r = await impl.send(c, args);
        const decided = new Set(((args.prepared && args.prepared.mentions) || []).map((m) => m.id)).size;
        return { ...r, ...(withPrepare ? { mentionsTaken: taken === null ? decided : taken } : {}), ...(unplaced ? { mentionsUnplaced: unplaced } : {}) };
      },
    };
    out.reconcile = async (c, o = {}) => { log.reconciles.push(o); return { landed: true, vendorMessageId: 'v-rec', at: Date.now() }; };
    out.convCaps = async (...a) => { if (state.hold) await state.hold; return impl.convCaps(...a); };
    // `prepare`: the engine's prepare step IS another adapter's (the REAL Lark adapter over a stand-in fetch, round wke4s5jp9 (7))
    if (withPrepare && prepare) out.prepareSend = async (c, o = {}) => { log.known.push(Array.isArray(o.known) ? o.known : null); return prepare(c, o); };
    else if (withPrepare) out.prepareSend = async (c, { text, known } = {}) => {
      log.known.push(Array.isArray(known) ? known : null);
      const k = [...(Array.isArray(known) ? known : []), ...state.records];
      let fact = null;
      if (LMM.hasAtWords(text)) { const m = state.members; fact = Array.isArray(m) ? WHOLE(m) : typeof m === 'function' ? m(log.reads) : null; log.reads++; }
      const d = LMM.decideMentions({ text, known: k, members: fact });
      return { text, ...d, over: [], tooLong: false, sendMax: null, at: Date.now() };
    };
    return out;
  };
  registry.register(mod);
  return { registry, log, state };
}
let seq = 0;
const DELIVER = () => ({ async deliverToConversation() { return { ok: true }; }, stashFor() {}, onStash() { return () => {}; }, onRetry() { return () => {}; }, retryEvent() {}, drain() { return []; }, stashPeek() { return []; }, forget() {} });
function mkEngine(registry, ENGM = ENG) {
  const dataDir = path.join(ROOT, `e${++seq}`);
  fs.mkdirSync(dataDir, { recursive: true });
  return ENGM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir }), deliver: DELIVER(), log: { log() {}, warn() {}, error() {} }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: ['g1'] }] });
}
async function primed(registry, ENGM = ENG) {
  const eng = mkEngine(registry, ENGM);
  await eng.pass(A, { force: true }); await eng.refresh(A, C); await eng.pass(A, { force: true });
  await eng.setReach(A, C, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, level: 'visible' });
  return eng;
}
const stored = (eng, id) => eng.store.outbox.snapshot().proposals[id];
/** THE DIGEST THE CARD SENDS with a press: of the proposal as the owner's outbox view draws it (the card's own record). */
const cardDigest = (eng, id) => P.shownDigest(eng.outboxView({ ids: [id] }).proposals[0]);
const nProposals = (eng) => Object.keys(eng.store.outbox.snapshot().proposals).length;
/** propose, approve (with the owner's edit if given); a `mentions-changed` answer is pressed AGAIN when `again` (the card was
 *  redrawn — the second press carries the digest of the record as stored now, as the page's would). */
async function proposeSend(D, text, { edit = null, ENGM = ENG, again = true, before = null } = {}) {
  const eng = await primed(D.registry, ENGM);
  const r = await eng.propose(AGENT, A, C, { text });
  if (!r.ok) { eng.stop(); return { r }; }
  const id = r.proposal.id;
  if (before) await before(eng, id);
  const n0 = D.log.sends.length;
  const a = await eng.approve(id, edit === null ? {} : { text: edit });
  const sentFirst = D.log.sends.length > n0;
  const pMid = stored(eng, id);
  const a2 = a.code === 'mentions-changed' && again ? await eng.approve(id, { shown: cardDigest(eng, id) }) : null;
  const p = stored(eng, id);
  const out = { r, a, a2, sentFirst, pMid: JSON.parse(J(pMid)), p, send: D.log.sends[D.log.sends.length - 1] || null, known: D.log.known[0] || null };
  eng.stop();
  return out;
}
const outSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-outbound.js'), 'utf8');
const engSrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const engWithOutbound = (src, name) => MUT.load('src/server/channels-engine.js', anchored(engSrc, "const ChannelsOutbound = require('./channels-outbound.js');", 'const ChannelsOutbound = require(' + JSON.stringify(MUT.write('src/server/channels-outbound.js', src, `outbound-${name}`)) + ');', `engine-${name}`), `engine-${name}`);
// THE KEEP LOOP PUT BACK (the round's shared prepareEdit, 98e531be6) and RULE C's ONE-PRESS SEND put back
const FRESH_TAIL = "    if (fresh.unresolved.length) return { ok: false, code: 'bad-proposal', why: 'mention-ambiguous', ambiguous: fresh.unresolved.slice(0, 10), error: `${sharedNameWords(fresh.unresolved)} — nothing was sent` };\n    return { ok: true, prepared: storedPrepared(fresh) };\n";
const KEEP_LOOP = [
  '    const was = p0.prepared || {};',   // stale-pins: kept (the RED plants the keep loop as it was)
  "    const old = new Map((Array.isArray(was.mentions) ? was.mentions : []).map((m, i) => [m.name, { m, as: (Array.isArray(was.notifies) && was.notifies[i]) || m.name }]));",   // stale-pins: kept (the RED plants the keep loop as it was)
  '    const ambiguous = fresh.unresolved.filter((n) => !old.has(n));',   // stale-pins: kept (the RED plants the keep loop as it was)
  "    if (ambiguous.length) return { ok: false, code: 'bad-proposal', why: 'mention-ambiguous', ambiguous: ambiguous.slice(0, 10), error: 'nothing was sent' };",
  '    const out = { mentions: [], notifies: [], plain: [], at: fresh.at, ...(fresh.everyone ? { everyone: true } : {}) };',   // stale-pins: kept (the RED plants the keep loop as it was)
  '    const keep = (n) => { const o = old.get(n); out.mentions.push(o.m); out.notifies.push(o.as); };',   // stale-pins: kept (the RED plants the keep loop as it was)
  '    fresh.mentions.forEach((m, i) => { if (old.has(m.name)) keep(m.name); else { out.mentions.push(m); out.notifies.push(fresh.notifies[i] || m.name); } });',   // stale-pins: kept (the RED plants the keep loop as it was)
  '    for (const n of fresh.unresolved) keep(n);',   // stale-pins: kept (the RED plants the keep loop as it was)
  '    for (const n of fresh.plain) { if (old.has(n)) keep(n); else out.plain.push(n); }',   // stale-pins: kept (the RED plants the keep loop as it was)
  '    return { ok: true, prepared: out };', ''].join('\n');   // stale-pins: kept (the RED plants the keep loop as it was)
const ENG_KEEP = engWithOutbound(anchored(outSrc, FRESH_TAIL, KEEP_LOOP, 'keep-loop-put-back'), 'keep-loop');
const C_GATE = '      if (prepared && P.decisionSummary(prepared) !== P.decisionSummary(p0.prepared)) {\n';
const ENG_ONEPRESS = engWithOutbound(anchored(outSrc, C_GATE, '      if (false) {\n', 'one-press-send'), 'one-press');
const WAIT_GUARD = "        { unless: (p) => p.text !== p0.text || P.decisionSummary(p.prepared) !== P.decisionSummary(p0.prepared), unlessWhy: 'this proposal changed while the press waited — nothing was sent; read it again, then decide' });\n";
const ENG_NOGUARD = engWithOutbound(anchored(outSrc, WAIT_GUARD, '        {});\n', 'waiting-press-unguarded'), 'no-wait-guard');
const KEY_PASS = ", ...(p0.prepared && typeof p0.prepared.readKey === 'string' ? { readKey: p0.prepared.readKey } : {}) }); }";
const ENG_NOKEY = engWithOutbound(anchored(outSrc, KEY_PASS, ' }); }', 'edit-without-the-read-key'), 'no-read-key');
{
  const D = dressed({ members: [ZHANG] });
  const x = await proposeSend(D, 'please look @张三');
  ok(x.r.ok && x.p && J(x.p.prepared.mentions) === J([{ name: '张三', id: ZHANG.id }]) && J(x.p.prepared.notifies) === J(['张三']) && J(x.p.prepared.places) === J([{ at: 12, len: 2, id: ZHANG.id }]),
    'A PROPOSAL WITH ONE NAME: the stored proposal carries the member (its open_id), the notify line and the decided PLACE', J(x.p && x.p.prepared));
  ok(!!x.send && x.send.wire === `please look <at user_id="${ZHANG.id}">张三</at>` && x.sentFirst === true && x.a.ok === true, `its send hands the adapter the decision: the wire «${x.send && x.send.wire}», at ONE press (nothing changed)`);
  ok(x.p.receipt && J(x.p.receipt.notified) === J({ decided: 1, taken: 1 }) && /notified: the 1 mention decided/.test(P.renderReceiptBlock(x.p.receipt)), 'THE RECEIPT tells the truth from the channel\'s answer: 1 decided, 1 taken', J(x.p.receipt && x.p.receipt.notified));
  const xR = await proposeSend(dressed({ members: [ZHANG], withPrepare: false }), 'please look @张三');
  ok(xR.r.ok && !xR.p.prepared && xR.send.wire === 'please look @张三', `RED CONTROL: the release (no prepare step) — no decision stored, the wire «${xR.send && xR.send.wire}»: plain words, nobody notified`);
  const D2 = dressed({ members: [BOB1, BOB2] });
  const eng2 = await primed(D2.registry); const n0 = nProposals(eng2);
  const r2 = await eng2.propose(AGENT, A, C, { text: '@Bob can you check' });
  ok(!r2.ok && r2.code === 'bad-proposal' && r2.why === 'mention-ambiguous' && J(r2.ambiguous) === J(['Bob']) && nProposals(eng2) === n0 && /drop the @/.test(r2.error) && /say in words which one/.test(r2.error), `A NAME TWO MEMBERS BEAR: refused by name («${r2.why}», ${J(r2.ambiguous)}), nothing created — the refusal names a way out that works when the full name itself is shared`, r2.error);
  eng2.stop();
  // RULE C — the edit that ADDS a name: decided, stored, NOT sent at that press; the card redrawn; the next press sends
  const x3 = await proposeSend(dressed({ members: [ZHANG, ANN] }), '@张三 hi', { edit: '@张三 hi, and @Ann Lee' });
  ok(x3.a.ok === false && x3.a.code === 'mentions-changed' && !x3.sentFirst && x3.pMid.text === '@张三 hi, and @Ann Lee' && x3.pMid.state === 'awaiting-approval' && !!x3.pMid.decisionChanged && J(x3.pMid.prepared.mentions.map((m) => m.id)) === J([ZHANG.id, ANN.id]),
    'RULE C: an edit that ADDS a name is decided and STORED with its decision in one step — nothing sent at that press (mentions-changed); the proposal waits with the edited text, its new rows and the «changed» line', J({ a: x3.a.code, sent: x3.sentFirst, pMid: x3.pMid && { text: x3.pMid.text, state: x3.pMid.state, changed: x3.pMid.decisionChanged } }));
  ok(!!x3.a2 && x3.a2.ok === true && !!x3.send && x3.send.wire === `<at user_id="${ZHANG.id}">张三</at> hi, and <at user_id="${ANN.id}">Ann Lee</at>` && !x3.p.decisionChanged, `…the NEXT press (on the card drawn from the stored record) sends what it showed: «${x3.send && x3.send.wire}»`);
  const x3R = await proposeSend(dressed({ members: [ZHANG, ANN] }), '@张三 hi', { edit: '@张三 hi, and @Ann Lee', ENGM: ENG_ONEPRESS });
  ok(x3R.sentFirst === true, 'RED CONTROL: the one-press send put back — the edit\'s new mention is on the wire at the first press, before any card showed it');
  const x4 = await proposeSend(dressed({ members: [ZHANG] }), '@张三 hi', { edit: 'hi again @张三, see the doc' });
  ok(x4.a.ok === true && x4.sentFirst && x4.send.wire === `hi again <at user_id="${ZHANG.id}">张三</at>, see the doc`, 'an edit whose decision is the SAME as the shown one (who is notified, everyone, open, no-member, unchecked) sends at ONE press, as today', J(x4.send));
  const x3Rel = await proposeSend(dressed({ members: [ZHANG, ANN], withPrepare: false }), '@张三 hi', { edit: '@张三 hi, and @Ann Lee' });
  ok(x3Rel.send.wire === '@张三 hi, and @Ann Lee', `RED CONTROL: the release's edit — «${x3Rel.send.wire}»: nothing decided, plain words`);
  // SCENE ONE through rule C: «@Ann,» (records, the read failing) is decided and SAID unchecked; edited to «@Ann Lee,» it is
  // decided fresh: open, stored, not sent at that press
  const failing = () => ({ list: [], whole: false, why: 'members-no-answer' });
  const sceneOne = async (ENGM = ENG) => { const D1 = dressed({ members: failing, records: [A1] }); const x1 = await proposeSend(D1, '@Ann, please look', { edit: '@Ann Lee, please look', ENGM }); return { p0: x1.r.proposal && x1.r.proposal.prepared, a: x1.a.code, sentFirst: x1.sentFirst, mid: x1.pMid && x1.pMid.prepared, wire: x1.send && x1.send.wire, editKnown: D1.log.known[1] || null }; };
  const so = await sceneOne();
  ok(J(so.p0 && so.p0.notifies) === J(['Ann']) && J(so.p0 && so.p0.unchecked) === J(['Ann']) && so.a === 'mentions-changed' && !so.sentFirst && !!so.mid && so.mid.mentions.length === 0 && J(so.mid.open) === J(['Ann Lee']) && so.mid.openWhy === 'members-no-answer' && so.wire === '@Ann Lee, please look' && J(so.editKnown && so.editKnown[0]) === J({ id: A1.id, name: 'Ann' }),
    `SCENE ONE: «@Ann,» notifies Ann (records; the card SAYS not checked); edited to «@Ann Lee,» while the read cannot run it is decided fresh — nobody notified, «Ann Lee» open with the reason, and that is SHOWN before any send (mentions-changed); the next press sends the plain words`, J(so));
  const soK = await sceneOne(ENG_KEEP);
  ok(!!soK.mid && !(soK.mid.open && soK.mid.open.length), 'RED CONTROL: the keep loop put back — the open word is lost on the way to the card (it says nothing)', J(soK.mid));
  // a proposal stored BEFORE its adapter decided mentions (no decision stored): decided at the press under the same rule
  const legacy = async (ENGM) => { const DL = dressed({ members: [ZHANG] }); return proposeSend(DL, '@张三 请看', { ENGM, before: async (eng, id) => { await eng.store.outbox.update((ob) => { delete ob.proposals[id].prepared; }); } }); };
  const lg = await legacy(ENG), lgR = await legacy(ENG_ONEPRESS);
  ok(lg.a.code === 'mentions-changed' && !lg.sentFirst && !!lg.pMid.prepared && J(lg.pMid.prepared.mentions.map((m) => m.id)) === J([ZHANG.id]) && lg.a2 && lg.a2.ok === true && lg.send.wire === `<at user_id="${ZHANG.id}">张三</at> 请看`, 'a proposal that WAITED with no stored decision (made before the update) is decided at the press under the same rule — shown first, sent at the next press', J({ a: lg.a.code, sent: lg.sentFirst }));
  ok(lgR.sentFirst === true, 'RED CONTROL: the one-press send put back — that proposal\'s mention leaves at the first press, never shown');
  // the card the press came from: a press carrying the digest of the card drawn BEFORE the decision changed is refused
  { const D9 = dressed({ members: [ZHANG, ANN] }); const eng9 = await primed(D9.registry); const r9 = await eng9.propose(AGENT, A, C, { text: '@张三 hi' });
    const old = cardDigest(eng9, r9.proposal.id); await eng9.approve(r9.proposal.id, { text: '@张三 hi, and @Ann Lee' });
    const stale = await eng9.approve(r9.proposal.id, { shown: old });
    ok(stale.ok === false && stale.code === 'changed-since-shown' && D9.log.sends.length === 0, 'a press from a card drawn before the decision changed is refused (changed-since-shown: the decision is part of what the card showed) — nothing sent', J(stale)); eng9.stop(); }
  // the second follow (主开发 r1403 (3)): a press from a PAGE OPENED BEFORE THE UPDATE (its bundle's digest has no decision field)
  // is told the ONE act that ends it — reload this page — by a code that page does not know (it shows the words as they are);
  // RED: that check cut — the old page is answered «changed since shown» at every press, a loop no reading of the card ends
  const OLD_PAGE = "      if (String(shown) !== now0 && v0.prepared && typeof v0.prepared === 'object' && String(shown) === P.shownDigest(v0, { decision: false })) return { ok: false, code: 'page-outdated', error: 'this page was opened before an update and does not show who this message notifies — nothing was sent; copy any edit you typed, reload this page, then decide', proposal: v0 };\n";
  const ENG_NOOLDPAGE = engWithOutbound(anchored(outSrc, OLD_PAGE, '', 'old-page-unnamed'), 'old-page-unnamed');
  const oldPage = async (ENGM) => { const D8 = dressed({ members: [ZHANG] }); const eng8 = await primed(D8.registry, ENGM); const r8 = await eng8.propose(AGENT, A, C, { text: '@张三 hi' });
    const view8 = eng8.outboxView({ ids: [r8.proposal.id] }).proposals[0];
    const a8 = await eng8.approve(r8.proposal.id, { shown: P.shownDigest(view8, { decision: false }) });
    const sentOnRefusal = D8.log.sends.length;
    const ok8 = await eng8.approve(r8.proposal.id, { shown: P.shownDigest(view8) });
    const out = { code: a8.code || null, words: a8.error || null, status: require(path.join(REPO, 'src/routes/channels.js')).answer3Status(a8), sentOnRefusal, then: ok8.ok === true };
    eng8.stop(); return out; };
  const op = await oldPage(ENG), opR = await oldPage(ENG_NOOLDPAGE);
  // round wqdnv452s (a should): the old page's digest is the release's OWN, frozen — 2.369.414's channel-policy.js (a117cebb8)
  // computed it for this fixed record; a field added to shownFields later moves the tip's and this pin goes red by name
  const FROZEN = { id: 'p-frozen-0001', adapterId: 'fake-poll', convId: 'fake-poll-ops', text: '@张三 hi', sendAs: 'user', prepared: { mentions: [{ name: '张三', id: 'ou_zhang00001' }], places: [{ at: 0, len: 2, id: 'ou_zhang00001' }], notifies: ['张三'], plain: [], open: [], unchecked: [] } };
  ok(P.shownDigest(FROZEN, { decision: false }) === 'v1:2a7d4f8df39a1b2a:103' && P.shownDigest(FROZEN) !== 'v1:2a7d4f8df39a1b2a:103', `the old page's digest is 2.369.414's OWN for a fixed record (frozen v1:2a7d4f8df39a1b2a:103, computed by that release's channel-policy.js); this release's differs`);
  ok(op.code === 'page-outdated' && /reload this page/.test(op.words) && op.status === 409 && op.then === true && op.sentOnRefusal === 0, `A PAGE OPENED BEFORE THE UPDATE is told the one act that ends its refusal («${op.words}», ${op.status}); nothing left on that press, and the same record approved from a page of this release sends once`, J(op));
  ok(opR.code === 'changed-since-shown', `RED CONTROL: the old page's check cut — that page is answered «${opR.code}», the refusal its own words call «read it again», which no reading ends`, J(opR));
  // round wqdnv452s (a should): THE OUTBOUND KEEPS the send's count of decided places that left the wire (the record's result),
  // and the receipt says it. RED: the outbound's keep cut — the count never reaches the record
  const KEEP_UNPLACED = ", ...(Number.isInteger(r.mentionsUnplaced) && r.mentionsUnplaced > 0 ? { mentionsUnplaced: Math.min(r.mentionsUnplaced, 100) } : {})";
  const ENG_NOKEEPU = engWithOutbound(anchored(outSrc, KEEP_UNPLACED, '', 'unplaced-not-kept'), 'unplaced-not-kept');
  const ku = await proposeSend(dressed({ members: [ZHANG], unplaced: 1 }), '@张三 请看'), kuR = await proposeSend(dressed({ members: [ZHANG], unplaced: 1 }), '@张三 请看', { ENGM: ENG_NOKEEPU });
  const ruOf = (x) => (x && x.p && x.p.result ? x.p.result.mentionsUnplaced : null);
  ok(ruOf(ku) === 1 && /not placed: 1 decided mention/.test(P.renderReceiptBlock(P.receiptFor(ku.p))), `THE OUTBOUND KEEPS THE COUNT: the record's result holds it (${ruOf(ku)}) and the receipt says «not placed»`, J(ku.p && ku.p.result));
  ok(ruOf(kuR) === null || ruOf(kuR) === undefined, `RED CONTROL: the outbound's keep cut — the record holds no count (${ruOf(kuR)}): the send said it and nobody kept it`);
  const D5 = dressed({ members: [ZHANG] });
  const eng5 = await primed(D5.registry);
  const r5 = await eng5.propose(AGENT, A, C, { text: 'hi @Zed and @张三' });
  const ap = r5.proposal && r5.proposal.prepared;
  ok(r5.ok && ap && J(ap.plain) === J(['Zed']) && J(ap.notifies) === J(['张三']) && !('mentions' in ap) && !('places' in ap) && ap.open.length === 0 && ap.unchecked.length === 0 && ap.openWhy === null, 'A NAME NOBODY BEARS (a whole list) goes as plain words, and the agent\'s own answer says so per name; no id and no place reaches the agent', J(ap));
  eng5.stop();
  const eng5b = await primed(dressed({ members: () => ({ list: [], whole: false, why: 'members-unreadable' }), records: [ZHANG] }).registry);
  const r5b = await eng5b.propose(AGENT, A, C, { text: '@Zed please look, @张三。' });
  const apb = r5b.proposal && r5b.proposal.prepared;
  ok(r5b.ok && apb && J(apb.open) === J(['Zed']) && apb.openWhy === 'members-unreadable' && J(apb.unchecked) === J(['张三']) && apb.uncheckedWhy === 'members-unreadable', 'A READ THAT FAILS NEVER REFUSES: the proposal is created; the agent\'s answer names the open word and the name decided without the members, each with the reason', J(apb));
  eng5b.stop();
  // round wke4s5jp9 (4) — THE PRESS THAT WAITS: a press checks the record, then waits on the chat's capabilities; another device's
  // edit lands in that wait (placed: the stand-in holds the read; the edit is written to the store meanwhile) — the press refuses
  const waitLeg = async (ENGM) => {
    const DW = dressed({ members: [ZHANG, LI] }); const eng = await primed(DW.registry, ENGM);
    const r = await eng.propose(AGENT, A, C, { text: '@张三 请看' });
    let release; DW.state.hold = new Promise((res) => { release = res; });
    const n0 = DW.log.sends.length;
    const press = eng.approve(r.proposal.id, {});
    await new Promise((res) => setTimeout(res, 30));
    await eng.store.outbox.update((ob) => { const p = ob.proposals[r.proposal.id]; p.text = '@李四 请看'; p.prepared = { ...p.prepared, mentions: [{ name: '李四', id: LI.id }], notifies: ['李四'], places: [{ at: 0, len: 2, id: LI.id }] }; });
    DW.state.hold = null; release();
    const a = await press;
    const out = { a: a.code || 'ok', sent: DW.log.sends.slice(n0).map((x) => x.wire) }; eng.stop(); return out;
  };
  const wt0 = await waitLeg(ENG), wtR = await waitLeg(ENG_NOGUARD);
  ok(wt0.a === 'changed-since-shown' && wt0.sent.length === 0, `(4) THE PRESS THAT WAITS: another device's edit lands while the press waits on the chat's capabilities — the step that moves it to sending refuses (${wt0.a}), nothing is sent`, J(wt0));
  ok(wtR.sent.length === 1 && /ou_li00000001/.test(wtR.sent[0]), `RED CONTROL: the guard cut — the first press sends the NEW text with a decision no card of its own showed («${wtR.sent[0]}»)`, J(wtR));
  // round wke4s5jp9 (7) — THE KEPT READ THROUGH THE ENGINE: the engine's prepare step is the REAL Lark adapter (a stand-in fetch, its own
  // clock): one proposal and two edits ten minutes apart make ONE members call; RED: the read's key cut from the edit road
  const keptEngine = async (ENGM) => {
    let t = T0; const { a: lk, calls } = mkLark(lark, (c) => jsonRes(200, isMembers(c) ? MEMBERS([ZHANG, LI, W1]) : SENT()), () => t);
    const DK = dressed({ prepare: (c, o) => lk.prepareSend('oc_x', o) }); const eng = await primed(DK.registry, ENGM);
    const r = await eng.propose(AGENT, A, C, { text: '@张三 请看' });
    t += 5 * 60e3; const e1 = await eng.approve(r.proposal.id, { text: '@张三 和 @李四 请看' });
    t += 5 * 60e3; const e2 = await eng.approve(r.proposal.id, { text: '@王伟 请看' });
    const out = { reads: calls.filter(isMembers).length, codes: [e1.code, e2.code], key: (stored(eng, r.proposal.id).prepared || {}).readKey || null }; eng.stop(); return out;
  };
  const ke = await keptEngine(ENG), keR = await keptEngine(ENG_NOKEY);
  ok(ke.reads === 1 && J(ke.codes) === J(['mentions-changed', 'mentions-changed']) && /^rk-/.test(ke.key || ''), `(7) RULE B THROUGH THE REAL ENGINE over the real Lark adapter: a proposal and two edits ten minutes apart — ONE members call (${ke.reads}), the read's key stored with the decision`, J(ke));
  ok(keR.reads === 3, `RED CONTROL: the read's key cut from the edit road — every edit reads the members again (${keR.reads})`);
  const x6 = await proposeSend(dressed({ members: [] }), '@所有人 deploy at 5');
  ok(x6.p.prepared.everyone === true && x6.send.wire === '<at user_id="all"></at> deploy at 5', 'EVERYONE IN THE CHAT: decided as its own case, sent in Lark\'s form', J(x6.p.prepared));
  const x7 = await proposeSend(dressed({ members: [ZHANG, ANN], taken: 1 }), '@张三 and @Ann Lee');
  const block7 = P.renderReceiptBlock(x7.p.receipt);
  ok(J(x7.p.receipt.notified) === J({ decided: 2, taken: 1 }) && /FEWER than were decided/.test(block7), 'FEWER TAKEN THAN DECIDED: the receipt says so (2 decided, 1 taken)', block7);
}

console.log('④b the engine: the reconcile is handed the decision; the names one to one');
{
  const D = dressed({ members: [ZHANG], lost: true });
  const eng = await primed(D.registry);
  const r = await eng.propose(AGENT, A, C, { text: 'please look @张三' });
  await eng.approve(r.proposal.id, {});
  const st = stored(eng, r.proposal.id).state;
  await eng.reconcile(r.proposal.id, {});
  const got = D.log.reconciles[0] || null;
  ok(st === 'unknown' && !!got && !!got.prepared && J(got.prepared.mentions) === J([{ name: '张三', id: ZHANG.id }]) && J(got.prepared.places) === J([{ at: 12, len: 2, id: ZHANG.id }]), `the outbox: the lost send (state ${st}) — its reconcile is handed the decided mentions and places (its re-issue sends them)`, J(got && got.prepared));
  eng.stop();
  const RC = '...(p.inThread ? { inThread: true, threadKey: p.threadKey || null } : {}), ...(p.prepared ? { prepared: p.prepared } : {}) });';
  const ENGR = engWithOutbound(anchored(outSrc, RC, '...(p.inThread ? { inThread: true, threadKey: p.threadKey || null } : {}) });', 'reconcile-without-the-decision'), 'reconcile-plain');   // stale-pins: kept (the RED plants the reconcile call as it was)
  const DR = dressed({ members: [ZHANG], lost: true });
  const engR = await primed(DR.registry, ENGR);
  const rR = await engR.propose(AGENT, A, C, { text: 'please look @张三' });
  await engR.approve(rR.proposal.id, {}); await engR.reconcile(rR.proposal.id, {});
  const gotR = DR.log.reconciles[0] || null;
  ok(!!gotR && !gotR.prepared, 'RED CONTROL: the reconcile call as it was — handed no decision (its re-issue would go as plain words)', J(gotR && Object.keys(gotR)));
  engR.stop();
  const x = await proposeSend(dressed({ members: [ZHANG, LI] }), '@所有人 @张三 @李四');
  ok(J(x.p.prepared.notifies) === J(['所有人', '张三', '李四']) && J(x.p.prepared.mentions.map((m) => m.id)) === J(['all', ZHANG.id, LI.id]), `everyone and two names: the stored names line up with the mentions, one each (${J(x.p.prepared.notifies)})`, J(x.p.prepared));
  const ALIGN = "    out.notifies.push(id === 'all' ? name : (nameOf.get(id) || name));\n";
  const OLDM = MUT.load('src/channels/lark/mentions.js', anchored(mSrc, ALIGN, "    if (id !== 'all' && out.mentions.filter((x) => x.id === id).length === 1) out.notifies.push(nameOf.get(id) || name);\n", 'notifies-not-one-to-one'), 'mentions-release-notifies');
  const xR = await proposeSend(dressed({ members: [ZHANG, LI], LMM: OLDM }), '@所有人 @张三 @李四');
  ok(J(xR.p.prepared.notifies) !== J(['所有人', '张三', '李四']), `RED CONTROL: the notify names as they were (none for everyone) — they no longer line up: ${J(xR.p.prepared.notifies)}`);
}

console.log('⑤ the manual: the one way to write a mention, for every channel whose row has mentions');
{
  const manual = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf8');
  const SENT_RE = /^A MENTION \(reply \/ compose\) on a channel whose messages have them \(([^)]+)\): write @ and the person's name/m;
  const named = (text) => { const m = SENT_RE.exec(text); return m ? m[1].split(',').map((x) => x.trim()) : null; };
  const kinds = ENG.REAL_ADAPTERS.filter((m) => m.caps && m.caps.prepareSend === true && typeof m.caps.mentionId === 'string').map((m) => m.kind);
  const word = (k) => k.charAt(0).toUpperCase() + k.slice(1);
  const list = named(manual);
  ok(kinds.length >= 2 && !!list && kinds.every((k) => list.includes(word(k))), `the manual says the one way to write a mention for every channel whose row has mentions (${kinds.map(word).join(', ')})`, J({ kinds, list }));
  ok(named(manual.replace(SENT_RE, 'A reply carries its words')) === null, 'RED CONTROL: the release\'s manual — no way to write a mention is said');
}

console.log('⑥ THE GENERATED ORACLE of rule A (written from its sentences, never from the module), and the EDIT road');
{
  // a seeded generator (mulberry32); the seeds are printed — LARK_MENTIONS_SEEDS=a,b replays any of them
  const SEEDS = (process.env.LARK_MENTIONS_SEEDS || '20261121,960,4620').split(',').map((x) => Number(x.trim()) >>> 0).filter((x) => Number.isFinite(x));
  console.log(`    seeds: ${SEEDS.join(', ')}`);
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // member pools with SHARED PREFIXES in both scripts, joined names, the same full name twice — and members the records lack
  const POOL = [
    { id: 'ou_gann000001', name: 'Ann' }, { id: 'ou_gann000002', name: 'Ann Lee' }, { id: 'ou_gann000003', name: 'Ann Lee' }, { id: 'ou_gbob000001', name: 'Bob' }, { id: 'ou_gbob000002', name: 'Bobby' },
    { id: 'ou_gjea000001', name: 'Jean' }, { id: 'ou_gjea000002', name: 'Jean-Pierre' }, { id: 'ou_gww0000001', name: '王伟' }, { id: 'ou_gww0000002', name: '王伟强' }, { id: 'ou_gzs0000001', name: '张三' },
    { id: 'ou_gzs0000002', name: '张三' }, { id: 'ou_gjh0000001', name: '约翰' }, { id: 'ou_gjh0000002', name: '约翰·史密斯' }, { id: 'ou_gtn0000001', name: '田中' }, { id: 'ou_gtn0000002', name: '田中 花子' },
  ];
  const WRITTEN = [...new Set(POOL.map((p) => p.name)), 'Zed', '赵六', 'ann', 'ANN LEE', 'all', '所有人', 'everyone'];
  // FOLLOWERS from EVERY character class, so a follower nobody listed is generated: letters of several scripts, a combining
  // mark, digits, each kind of punctuation (dashes, middle dots, connectors, apostrophes, sentence marks of both scripts,
  // brackets and quotes of both), symbols and emoji, each kind of space, line ends — one to three of them, or the text's end
  const CLASSES = [
    'abcxyz', 'ABLMZ', 'ДжЯ', 'λΩ', '强花请看', 'のを', 'カスミ', '한국', 'عم', '́', '0279', '０７',
    '-‐–—', '·・‧•', '_', "'’", ',.;:!?…', '，。、；：！？', '()[]{}', '（）「」【】《》', '"“”‘', '#$+=©%&*~^|\\/', '🙂👍', ' ', '　 \t', '\n', '\r\n',
    '​', '‍', '️', '‎‏', '`',   // round wke4s5jp9 (8): a zero-width space, a joiner, a variation selector, the two direction marks, a backtick
    '\uff0e\u3017\uff61\uff64\uff63\u203c\u2049\u203a\u061f\u0964',   // the follow (r1402 (4)): the class's enders a typed list missed, and two of other scripts (open)
  ];
  const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
  const chr = (r) => { const c = pick(r, CLASSES); const cs = [...c]; return c === '\r\n' ? c : pick(r, cs); };
  const follower = (r) => { const k = Math.floor(r() * 4); return Array.from({ length: k }, () => chr(r)).join(''); };
  const subset = (r, xs, p) => xs.filter(() => r() < p);
  // at-signs after EVERY class (round wke4s5jp9 (6)): what stands before each at-sign is drawn too
  function genText(r) {
    const n = 1 + Math.floor(r() * 3);
    let text = '';
    for (let i = 0; i < n; i++) {
      const before = i === 0 ? pick(r, ['', '', 'hi ', '请', () => chr(r)]) : pick(r, [' ', ' and ', '\n', ' 和 ', () => chr(r), () => chr(r) + ' ']);
      text += (typeof before === 'function' ? before() : before) + '@' + pick(r, WRITTEN) + follower(r);
    }
    return { text };
  }
  // THE ORACLE — the rules' sentences, written here (never the module's loop):
  //  «an at-sign starts an at-word UNLESS the character before it belongs to a mail address's first part (an ASCII letter, a digit,
  //   a dot, an underscore, a percent, a plus, a hyphen)»; «at-words inside a fenced block (``` to the next ``` or the end) or a
  //   backtick span (a backtick, one or more characters that are neither a backtick nor a line end, a backtick) are not at-words»;
  //  «over a whole list the candidates are the members only»; «AT AN AT-SIGN, THE LONGEST CANDIDATE NAME THAT BEGINS THERE IS THE
  //   ONLY ONE THAT MAY DECIDE; it decides when it ends there by its mode's enders; when it does not, the word is plain (a whole
  //   list) or open (none); a shorter name is never tried»; «without a whole member list the enders are a CLOSED list: the end of
  //   the text, a line end, the sentence marks of both scripts, a closing bracket or quote, another at-sign» (an ASCII mark or
  //   quote only when no letter or digit follows it — the lane's stated detail); «over a whole list a name ends at an ender or a
  //   space, and a CJK name may abut CJK text»; «the everyone word by the same rule» (over a whole list a space too).
  const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u, CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u, MAILCH = /[A-Za-z0-9._%+\-/]/;   // the follow (r1065): a slash never starts one either
  // the follow (主开发 r1402 (4)): THE ENDERS FROM THE SENTENCE'S CLASSES, never a list typed again (the module's list and this one,
  // typed twice, hid an ender missing from both): «a sentence mark, a closing bracket or quote» = Unicode Terminal_Punctuation,
  // Pe, Pf; «of both scripts» = the CJK marks and full-width forms always, ASCII and the general punctuation when no letter or
  // digit follows; with them the two ASCII quotes that close as well as open and the ellipsis (the lane's stated detail)
  const ORACLE_CLASS = /[\p{Terminal_Punctuation}\p{Pe}\p{Pf}]/u;
  const ORACLE_ENDERS_ALWAYS = { has: (c) => ['\n', '\r', '\u2028', '\u2029', '@'].includes(c) || (/[\u3000-\u303f\uff00-\uffef]/.test(c) && ORACLE_CLASS.test(c)) };
  const ORACLE_ENDERS_ASCII = { has: (c) => /[\u0000-\u007f\u2000-\u206f]/.test(c) && (ORACLE_CLASS.test(c) || c === '"' || c === "'" || c === '\u2026') };
  const ORACLE_SPACES = new Set([' ', '\t', ' ', '　']);
  const endsO = (after) => { const cps = [...after]; if (!cps.length) return true; const c = cps[0]; if (ORACLE_ENDERS_ALWAYS.has(c)) return true; if (ORACLE_SPACES.has(c)) { let i = 0; while (i < cps.length && ORACLE_SPACES.has(cps[i])) i++; return cps[i] === '@'; } if (ORACLE_ENDERS_ASCII.has(c)) return !cps[1] || !LETTER_OR_DIGIT.test(cps[1]); return false; };
  const endsWholeO = (after, typed) => { const c = [...after][0]; return endsO(after) || ORACLE_SPACES.has(c) || (!!c && CJK.test(c) && CJK.test([...typed].pop())); };
  function codeBlankO(text) {
    let out = '', i = 0;
    while (i < text.length) { if (text.startsWith('```', i)) { const j = text.indexOf('```', i + 3); const end = j === -1 ? text.length : j + 3; out += text.slice(i, end).replace(/[^\n]/g, ' '); i = end; } else { out += text[i]; i++; } }
    let res = '', k = 0;
    while (k < out.length) { if (out[k] === '`') { let j = k + 1; while (j < out.length && out[j] !== '`' && out[j] !== '\n') j++; if (j < out.length && out[j] === '`' && j > k + 1) { res += ' '.repeat(j - k + 1); k = j + 1; continue; } } res += out[k]; k++; }
    return res;
  }
  function oracle({ text }, known, members) {
    const whole = !!(members && members.whole);
    const people = whole ? members.list : [...known, ...(members ? members.list : [])];
    const EVERY = ['所有人', 'all', 'everyone'];
    const mentions = new Set(), unresolved = new Set(), unchecked = new Set();
    const b = codeBlankO(text);
    for (let i = 0; i < b.length; i++) {
      if (b[i] !== '@' || (i > 0 && MAILCH.test(b[i - 1]))) continue;
      const rest = b.slice(i + 1);
      const cands = [];
      for (const p of people) if (rest.slice(0, p.name.length).toLowerCase() === p.name.toLowerCase()) cands.push({ len: p.name.length, id: p.id });
      for (const w of EVERY) if (rest.slice(0, w.length).toLowerCase() === w) cands.push({ len: w.length, id: 'all' });
      const longest = cands.reduce((n, c) => Math.max(n, c.len), 0);
      if (!longest) continue;
      // the second follow: «after spaces» is read inside the decision's stated window — the 8 characters after the name
      // (`endsHere`'s contract); a code span blanked longer than that between a name and an at-sign leaves the name open (said)
      const endsC = (c) => { const after = rest.slice(c.len, c.len + 8); return c.id === 'all' ? (endsO(after) || (whole && ORACLE_SPACES.has([...after][0]))) : whole ? endsWholeO(after, rest.slice(0, c.len)) : endsO(after); };
      const top = cands.filter((c) => c.len === longest && endsC(c));
      if (!top.length) continue;   // the longest does not end: plain (a whole list) or open (none) — never a shorter name
      const who = new Set(top.map((c) => c.id));
      const typed = rest.slice(0, longest);
      if (who.size === 1) { const id = [...who][0]; mentions.add(`${typed}\n${id}`); if (!whole && id !== 'all') unchecked.add(typed); } else unresolved.add(typed);
    }
    return { mentions, unresolved, unchecked };
  }
  const conditions = (r) => { const list = subset(r, POOL, 0.6); return [['whole', WHOLE(list)], ['not-whole', { list: subset(r, list, 0.5), whole: false, why: 'members-partial' }], ['none', null]]; };
  const asSet = (d) => new Set(d.mentions.map((m) => `${m.name}\n${m.id}`));
  const eqSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const wrong = [], tally = { whole: 0, 'not-whole': 0, none: 0, mentions: 0, unresolved: 0, open: 0, plain: 0, unchecked: 0 };
  let redCallerWhole = 0, redContinuers = 0, redFilter = 0, redStarters = 0, redEnders = 0;
  for (const seed of SEEDS) {
    const r = rng(seed);
    for (let k = 0; k < 300; k++) {
      const g = genText(r), known = subset(r, POOL, 0.25);
      for (const [cond, members] of conditions(r)) {
        const d = dec(g.text, known, members), o = oracle(g, known, members);
        tally[cond]++; tally.mentions += d.mentions.length; tally.unresolved += d.unresolved.length; tally.open += d.open.length; tally.plain += d.plain.length; tally.unchecked += d.unchecked.length;
        const good = eqSet(asSet(d), o.mentions) && eqSet(new Set(d.unresolved), o.unresolved) && eqSet(new Set(d.unchecked), o.unchecked) && (cond === 'whole' ? d.open.length === 0 : d.plain.length === 0);
        if (!good) wrong.push({ seed, cond, text: g.text, known: known.map((p) => p.name), list: members && members.list.map((p) => p.name), got: { m: d.mentions, u: d.unresolved, o: d.open, p: d.plain, c: d.unchecked }, want: { m: [...o.mentions], u: [...o.unresolved], c: [...o.unchecked] } });
        if (cond === 'not-whole') { const dw = dec(g.text, known, { list: members.list, whole: true }); if (!eqSet(asSet(dw), o.mentions)) redCallerWhole++; }
        if (cond !== 'whole') { const dc = dec(g.text, known, members, LM_CONT); if (!eqSet(asSet(dc), o.mentions)) redContinuers++; }
        if (cond === 'whole') { const df = dec(g.text, known, members, LM_FILTER); if (!eqSet(asSet(df), o.mentions)) redFilter++; }
        { const ds = dec(g.text, known, members, LM_STARTERS); if (!eqSet(asSet(ds), o.mentions) || !eqSet(new Set(ds.unresolved), o.unresolved)) redStarters++; }
        { const de = dec(g.text, known, members, LM_ENDLIST); if (!eqSet(asSet(de), o.mentions) || !eqSet(new Set(de.unresolved), o.unresolved)) redEnders++; }
      }
    }
  }
  ok(wrong.length === 0 && tally.mentions > 100 && tally.unresolved > 10 && tally.open > 100 && tally.plain > 50 && tally.unchecked > 50, `THE ORACLE over ${SEEDS.length * 900} decisions (${tally.whole} whole, ${tally['not-whole']} not whole, ${tally.none} none; followers from every character class): (a) over a whole list the longest member name that ENDS at its place, the same name twice said; (b) without one a person only before an ENDER, and every such name SAID as not checked — ${tally.mentions} mentions, ${tally.unresolved} said twice, ${tally.open} open, ${tally.plain} plain, ${tally.unchecked} unchecked`, J(wrong.slice(0, 3)));
  ok(redContinuers > 20, `RED CONTROL: the continuers rule put back — ${redContinuers} decisions without a whole list name a person the oracle does not (unlisted followers)`);
  ok(redCallerWhole > 20, `RED CONTROL: whole taken from the caller — the same lists not whole, handed as whole: ${redCallerWhole} decisions name a person the oracle does not`);
  ok(redFilter > 5, `RED CONTROL: the filter put back (the longest name that ENDS, over a whole list) — ${redFilter} decisions name a shorter person the oracle never tries`);
  ok(redStarters > 20, `RED CONTROL: the closed list of starters put back — ${redStarters} decisions miss an at-word the oracle sees (at-signs after every class)`);
  ok(redEnders > 5, `RED CONTROL: the typed lists of enders put back (the follow, r1402 (4)) — ${redEnders} decisions leave open a name the sentence's classes end (a full-width full stop, a white lenticular bracket, a half-width full stop, a double exclamation …)`);

  // THE EDIT ROAD through the real engine: a generated proposal decided under one member fact, edited under another — the
  // stored decision equals deciding the edited text alone (the one call, the earlier mentions as pairs), and it is SENT at that
  // press only when it is the decision the card showed (rule C)
  const REG_WHYS = new Set(['members-unreadable', 'chat-dissolved', 'members-no-answer', 'members-rate-limited', 'members-partial', 'members-signed-out', 'not-read']);
  const pairsOf = (pr) => (pr && Array.isArray(pr.mentions) ? pr.mentions : []).filter((m) => m && m.id !== 'all').map((m) => ({ id: m.id, name: m.name }));
  // the registry's NAME DOOR bounds every stored name (peerName: invisible characters out, ≤ 100) — the expectation passes through it too
  const { peerName } = require(path.join(REPO, 'src/channel-record.js'));
  const door = (xs) => (Array.isArray(xs) ? xs : []).map((x) => peerName(x, 100)).filter(Boolean);
  const viewOf = (d0) => { const d = { ...d0, mentions: d0.mentions.map((m) => ({ name: peerName(m.name, 100), id: m.id })), notifies: door(d0.notifies), plain: door(d0.plain), open: door(d0.open), unchecked: door(d0.unchecked) }; return ({ mentions: d.mentions, notifies: d.notifies, plain: d.plain, open: d.open && d.open.length ? d.open : undefined, openWhy: d.open && d.open.length && REG_WHYS.has(d.openWhy) ? d.openWhy : undefined, places: d.places && d.places.length ? d.places : undefined, unchecked: d.unchecked && d.unchecked.length ? d.unchecked : undefined, uncheckedWhy: d.unchecked && d.unchecked.length && REG_WHYS.has(d.uncheckedWhy) ? d.uncheckedWhy : undefined }); };
  const editRoad = async (ENGM, seed, n) => {
    const r = rng(seed ^ 0x5eed);
    const D = dressed({ members: null }), eng = await primed(D.registry, ENGM);
    let cases = 0, same = 0, refusedAsSaid = 0, held = 0; const diff = [];
    for (let k = 0; k < n * 4 && cases < n; k++) {
      const g0 = genText(r), g1 = genText(r), recs = subset(r, POOL, 0.25), [, m0] = pick(r, conditions(r)), [, m1] = pick(r, conditions(r));
      D.state.records = recs; D.state.members = () => m0;
      const k0 = D.log.known.length, s0 = D.log.sends.length, p = await eng.propose(AGENT, A, C, { text: g0.text });
      if (!p.ok) continue;
      const engineKnown = D.log.known[k0] || [];
      const p0 = stored(eng, p.proposal.id).prepared;
      D.state.members = () => m1;
      const t1 = g1.text + ' (edited)';
      const a = await eng.approve(p.proposal.id, { text: t1 });
      const k1 = [...pairsOf(p0), ...engineKnown, ...recs];
      const want = dec(t1, k1, LM.hasAtWords(t1) ? m1 : null);
      cases++;
      if (want.unresolved.length) { if (!a.ok && a.why === 'mention-ambiguous') { same++; refusedAsSaid++; } else diff.push({ t1, want: want.unresolved, got: a.code }); continue; }
      const got = stored(eng, p.proposal.id).prepared || {};
      const g = { mentions: got.mentions, notifies: got.notifies, plain: got.plain, open: got.open, openWhy: got.openWhy, places: got.places, unchecked: got.unchecked, uncheckedWhy: got.uncheckedWhy };
      const changed = P.decisionSummary(want) !== P.decisionSummary(p0);
      const sentNow = D.log.sends.length > s0;
      const rightPress = changed ? (a.code === 'mentions-changed' && !sentNow) : (a.ok === true && sentNow);
      if (changed) held++;
      if (J(g) === J(viewOf(want)) && rightPress) same++; else diff.push({ t0: g0.text, t1, exp: viewOf(want), got: g, a: a.code || 'ok', sentNow, changed });
    }
    eng.stop();
    return { cases, same, refusedAsSaid, held, diff };
  };
  const er = await editRoad(ENG, SEEDS[0], 40);
  ok(er.cases >= 30 && er.same === er.cases && er.held >= 5, `THE EDIT ROAD (seed ${SEEDS[0]}): ${er.cases} generated proposals edited under another member fact — each stored decision equals deciding the edited text alone (${er.same}/${er.cases}); ${er.held} whose decision changed were stored and NOT sent at that press; ${er.refusedAsSaid} refused by name`, J(er.diff.slice(0, 2)));
  const erK = await editRoad(ENG_KEEP, SEEDS[0], 40);
  ok(erK.same < erK.cases, `RED CONTROL: the keep loop put back — ${erK.cases - erK.same} of ${erK.cases} edits differ from deciding the edited text alone`, J(erK.diff.slice(0, 1)));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

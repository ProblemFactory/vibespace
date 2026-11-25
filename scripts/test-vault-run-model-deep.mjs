#!/usr/bin/env node
// THE RUN SCRUBBER AT THE BOUND — test-vault-run-model's deep legs, split into this HEAVY twin (lane lg-vault-file, 主开发 r1068:
// the fast suite stands under 10 s, or its deep legs get a heavy twin). They read 2 MiB — the run door's output bound — through
// the run scrubber (src/vault-run.js) in the door's 64 KiB reads, and COUNT: no clock, no server, no browser, no child.
//   ① THE COST cut at the end (r858's leg, moved here verbatim): the characters every scan read and the regex calls, on a 2 MiB log
//      with the value in it, 2 MiB of the value back to back, 256 KiB of soft breaks the release holds whole, on one pipe and two —
//      the release's function (rebuilt from this file by putting its lines back) and this one; the scan's budget met by none.
//   ② THE LONGEST TURN NEAR THE BOUND (r1068): two values that tile one repeating text, wrapped in lines of 239 characters, and a
//      value of one repeated character in a hex dump of zeros — 2 MiB each, the holds the release's model makes: the longest
//      turn's counted steps linear in the text held; the dump under the turn's figure and the run's, the tiling pair (about 21.7 M a
//      turn, over 2^24 since r1216's figure) linear or failed closed by name.
//      Its red control is the fast suite's, at 32 KiB («the two fixpoints put back»: at 2 MiB that copy holds the loop minutes).
//   ③ THE CUT'S SEARCH COUNTED (主开发 r1216): the heads' search at a cut against the plain walk it replaced (every suffix against
//      every full form), 400 seeded runs cut at their end and 27 at the boundaries (a long form cut at its 63rd / 64th / 65th
//      character, before nothing or a broken character; a 64-character form that is a longer one's head), byte for byte; four red
//      controls (a long suffix taken at its head, a short one taken by the head after it, the broken rule dropped on each long road).
//   ③c THE CUT'S SEARCH COUNTED AS IT COMPARES (主开发 r1216): a stored 1 600 «A» + «B», 2 000 «A» cut before a «C» — the cut's own
//      count (`cutSteps`) at least its compares past the heads; red control «the cut's verify uncounted».
//   ③b THE HEADS MISS NOTHING (主开发 r1216): two long forms sharing a head, a 64-character form that is a longer one's head, a push
//      edge at a long form's 63rd / 64th / 65th character — against the release, no cut, byte for byte; three red controls.
//   ⑥ THE SCRUBBER and ⑥b THE REAL PRODUCERS' TABLE (lane vault-scrub-forms and before), moved here VERBATIM from the fast suite
//      with the red controls that run them (eleven: base64, the window, the seven forms, a backslash run, a view's held tail) —
//      every split point of 322 texts fed 1 / 3 / 7+2 characters at a time, every printing × a value: about 10 s of the fast suite's
//      17.6 s alone on the test machine.
// Why heavy: ① reads 2 MiB eight times (two functions, four outputs); ② keeps 2 MiB back and rescans it every read; ⑥ cuts 322
// texts at every point — seconds of CPU each. The r858 / r1068 legs live in scripts/vault-run-scrub-legs.mjs, shared with the fast suite.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { scrubLegs } from './vault-run-scrub-legs.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SRC = path.join(REPO, 'src/vault-run.js');
const SCRUBBER_SRC = path.join(REPO, 'src/vault-scrubber.js');   // 主开发 r1919 (THE COST): the scrubber's own module — the run module exports its names
const V = require(SRC);
const VI = require(path.join(REPO, 'src/vault-inventory.js'));
const M1 = 'vault://mounts/m1/secretKey', M2 = 'vault://mounts/m2/secretKey';   // as the fast suite names them (⑥ reads both)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { ok, report } = checker();
const SCRUB = scrubLegs({ REPO, SRC: SCRUBBER_SRC, scratchDir, anchored, require });

console.log('① THE COST cut at the end on 2 MiB — the release\'s function and this one (r858; moved from test-vault-run-model)');
{
  const Vr = SCRUB.release();
  // the cost on a 2 MiB output, counted: characters scanned and regex exec calls (the release's function and this one)
  const k = SCRUB.costLeg(Vr, V), ln = (x) => `${x.scanned} characters scanned, ${x.execs} exec calls`;
  console.log(`    judged — 2 MiB (${k.size[0]} B log, the value 6 times in it): the release ${ln(k.log.release)}; now ${ln(k.log.now)} · 2 MiB (${k.size[1]} B) the value back to back: the release ${ln(k.packed.release)}; now ${ln(k.packed.now)} · ${k.size[2]} B of soft line breaks after a value (held whole by the release): the release ${ln(k.soft.release)}; now ${ln(k.soft.now)}`);
  console.log(`    judged — the same soft breaks on two pipes (a short stderr line first): the release ${ln(k.soft2.release)}; now ${ln(k.soft2.now)}`);
  // the cut reads the WHOLE held text again (each stream's, and on two pipes their arrival order): at most twice the held text more
  ok([k.log, k.packed, k.soft, k.soft2].every((x) => x.now.scanned <= 1.5 * x.release.scanned + 65536 && x.now.execs <= x.release.execs + 64 && x.now.clear < 8 && x.release.outBytes > 0),
    `the cost cut at the end: characters scanned now / the release — the 2 MiB log ${k.log.now.scanned} / ${k.log.release.scanned}, the packed values ${k.packed.now.scanned} / ${k.packed.release.scanned}, the held soft breaks ${k.soft.now.scanned} / ${k.soft.release.scanned}, on two pipes ${k.soft2.now.scanned} / ${k.soft2.release.scanned} (bound: 1.5 × + 64 KiB); exec calls ${k.log.now.execs} / ${k.log.release.execs}, ${k.packed.now.execs} / ${k.packed.release.execs}, ${k.soft.now.execs} / ${k.soft.release.execs}, ${k.soft2.now.execs} / ${k.soft2.release.execs}`, k);
  ok([k.log, k.packed, k.soft, k.soft2].every((x) => !x.now.over), `the scan's budget is met by none of the four (r1068): ${[k.log, k.packed, k.soft, k.soft2].map((x) => `${x.now.maxSteps} steps the longest turn, ${x.now.runSteps} the run`).join(' · ')}`);
}

console.log('② THE LONGEST TURN near the bound — 2 MiB in the door\'s 64 KiB reads, the holds the release\'s model makes (r1068)');
{
  const t = SCRUB.turnLeg(V, 2 * 1024 * 1024, 65536), tc = SCRUB.turnLeg(V, 2 * 1024 * 1024, 65536, true), line = (x) => `${x.maxSteps} steps (${x.most} characters held at most), the run ${x.runSteps}${x.over ? `, failed closed${x.said ? ' by name' : ' NOT by name'}, ${x.clear} of a value in a row` : ''}`;
  console.log(`    judged — two values tiling one text wrapped in lines of 239: ${line(t.rot)}; a value of one repeated character in a hex dump of zeros: ${line(t.zeros)}; the figures: a turn ${V.SCRUB_STEPS_PUSH}, a run ${V.SCRUB_STEPS_RUN}, and 32 steps (× the charge a character) a character a turn reads (the most held + a push) + 65 536`);
  console.log(`    judged — the same, ended at a CUT (the cut reads the held text through every view again): two values tiling one text: ${line(tc.rot)}; the hex dump of zeros: ${line(tc.zeros)}`);
  ok([tc.rot, tc.zeros].every((x) => x.clear < 8 && (x.over ? x.said : !x.said)), `ENDED AT A CUT near the bound: ${line(tc.rot)} · ${line(tc.zeros)} — nothing of a value in the clear, and the words said exactly when it failed closed (the second read's G9: the bound itself holds by construction)`, tc);
  ok(!t.zeros.over && t.zeros.maxSteps <= V.SCRUB_STEPS_PUSH && t.zeros.runSteps <= V.SCRUB_STEPS_RUN && t.zeros.maxSteps <= 32 * t.zeros.charge * (t.zeros.most + t.zeros.push + t.zeros.W) + 65536 && (t.rot.over ? t.rot.said && t.rot.clear < 8 : t.rot.maxSteps <= 32 * t.rot.charge * (t.rot.most + t.rot.push + t.rot.W) + 65536), `THE LONGEST TURN NEAR THE BOUND: ${line(t.rot)} · ${line(t.zeros)} — the hex dump linear in what a turn reads (the most held + a push) and under the turn's figure and the run's; the two values tiling one text (about 21.7 M steps a turn: over the turn's figure of 2^24 since 主开发 r1216's rule) linear too, or failed closed by name with nothing of a value in the clear (the release's fixpoint walked these chains back a group a pass: groups² a turn)`, t);
}

console.log('③ THE CUT\'S SEARCH COUNTED, against the plain walk it replaced — seeded runs cut at their end (主开发 r1216)');
{
  const Vw = SCRUB.walkCopy(), w = SCRUB.walkLeg(Vw, V);
  console.log(`    judged — ${w.trials} cut runs (27 at the boundaries: an ASCII and a CJK long form and a 64-character head cut at 63 / 64 / 65, before nothing, one or two broken characters; then seeded: random / CJK values, two long forms sharing a head, a 64-character form that is a longer one's head, a long run of one character; a spelling cut short, at times a broken character or an unfinished token after it): ${w.differ.length} differ from the walk`);
  ok(w.differ.length === 0, `THE COUNTED SEARCH FINDS WHAT THE WALK FOUND: ${w.trials} seeded cut runs, output byte for byte, hits and bytes — ${w.differ.length} differ`, w.differ.slice(0, 2));
  for (const [name, from, to] of [
    ['a long suffix taken at its head', 'if (j === len && (!broken || t.charCodeAt(len) >= 0x80)) return q;', 'if (!broken || t.charCodeAt(len) >= 0x80) return q;'],
    ['a short suffix taken by the head after it', 'if (j < sorted.length && sorted[j].startsWith(s)) return true;', 'if (j < sorted.length) return true;'],
    ['a long suffix before a broken character taken whatever follows it', 'if (j === len && (!broken || t.charCodeAt(len) >= 0x80)) return q;', 'if (j === len) return q;'],
    ['a long head before a broken character taken whatever follows it', 'return !!longs && (!broken || longs.some((t) => t.charCodeAt(SCRUB_HEAD) >= 0x80));', 'return !!longs;'],
  ]) {
    const r = SCRUB.walkLeg(Vw, SCRUB.patchedCopy(name.replace(/\W+/g, '-'), from, to));
    ok(r.differ.length > 0, `MUTANT «${name}»: the patch hits once and the walk leg goes RED (${r.differ.length} of ${r.trials} runs differ) — the shipped search passes it`, r.differ.slice(0, 1));
  }
}

console.log('③b THE HEADS MISS NOTHING THE RELEASE FOUND — the shapes a regex of heads could miss, no cut (主开发 r1216; here to keep the fast suite under 10 s)');
{
  const Vr = SCRUB.release(), hs = SCRUB.headShapesLeg(Vr, V, 1216, 36);
  console.log(`    judged — the heads' shapes against the release (no cut): ${hs.trials} runs (two long forms sharing a head; a 64-character form that is a longer one's head; a push edge at a long form's 63rd / 64th / 65th character), ${hs.differ.length} differ`);
  ok(hs.differ.length === 0, `THE HEADS MISS NOTHING THE RELEASE FOUND: ${hs.trials} seeded runs of the three shapes, byte for byte, hits and bytes, ${hs.differ.length} differ`, hs.differ.slice(0, 2));
  for (const [name, from, to] of [
    ['a long form taken unverified', 'for (const t of longs) { spend(t.length); if (sk.startsWith(t, m.index)) return t; }', 'for (const t of longs) { spend(t.length); return t; }'],
    ['no short form under a long head', 'return shortIn.has(k) ? shortIn.get(k) : null; };', 'return null; };'],
    ['the window by the heads', '  const W = maxLen - 1;', '  const W = Math.min(maxLen, SCRUB_HEAD) - 1;'],
  ]) {
    const r = SCRUB.headShapesLeg(Vr, SCRUB.patchedCopy(name.replace(/\W+/g, '-'), from, to), 1216, 18);
    ok(r.differ.length > 0, `MUTANT «${name}»: the patch hits once and the shapes leg goes RED (${r.differ.length} of ${r.trials} runs differ) — the shipped scan passes it`, r.differ.slice(0, 1));
  }
}

console.log('③c THE CUT\'S PREFIX SEARCH IS COUNTED AS IT COMPARES (主开发 r1216, the follow\'s item 1; here to keep the fast suite under 10 s)');
{
  const cc = SCRUB.cutCountLeg(V);
  console.log(`    judged — the cut's prefix search: a stored 1 600 «A» + «B», a run of 2 000 «A» cut before its end — the cut's own search counted ${cc.cutSteps} steps (the whole end turn ${cc.endSteps}); its compares past the heads in the plain read alone ${cc.past}; ${cc.clean ? 'the tail flushed clean (no value there)' : 'the tail NOT as printed'}`);
  ok(!cc.over && cc.clean && cc.past > 1e6 && cc.cutSteps >= cc.past, `THE CUT'S PREFIX SEARCH IS COUNTED AS IT COMPARES: every suffix of a run of «A» before the cut follows a stored form of 1 600 «A» a thousand deep and more — the cut's own search counted ${cc.cutSteps} steps, at least the ${cc.past} compares past the heads (the plain read's alone)`, cc);
  const r = SCRUB.cutCountLeg(SCRUB.patchedCopy('the-cut-s-verify-uncounted', 'spend(j - SCRUB_HEAD + 1);   // the verify, counted as it compares', 'void 0;   // the verify, counted as it compares'));
  ok(r.cutSteps < r.past, `MUTANT «the cut's verify uncounted»: the patch hits once and the leg goes RED — the cut's search counted ${r.cutSteps} steps for ${r.past} compares past the heads; the shipped search counts them`, r);
}

// ─── moved VERBATIM from test-vault-run-model (主开发 r1068: its deep legs into this twin) ───
console.log('⑥ THE SCRUBBER — a value and its forms (FORMS: spelled and read), over ONE window per run');
const LABEL = 'mounts/m1/secretKey', PH = `[vault:${LABEL}]`;
const VALUES = [
  'planted-VALUE-0001',
  'p/l+a=n t?e&d#9%~*',
  'quote"back\\slash<tag>&amp\u007f',
  'pässwörd-日本-🔑-x',
  '-----BEGIN KEY-----\nMIIBplanted\nline2==\n-----END KEY-----\n',
  'abcdefgh',
  crypto.createHash('sha512').update('vault-run-model').digest('base64').repeat(40),
];
const b64 = (s) => Buffer.from(s).toString('base64');
const enc = (v, keep, up = true) => [...Buffer.from(v)].map((b) => (b < 128 && keep.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).padStart(2, '0')[up ? 'toUpperCase' : 'toLowerCase']())).join('');
const pyAscii = (v) => JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
// lane vault-scrub-forms — how a REAL producer spells a value, built with Node's own codecs or written out from the spec (never
// the module's code): the oracle the new forms are judged by
const streamText = (buf) => { const d = new StringDecoder('utf8'); return d.write(buf) + d.end(); };   // what the door's decoder hands on
const cps = (v) => [...v];
const B32A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (v) => { const bits = [...Buffer.from(v)].map((b) => b.toString(2).padStart(8, '0')).join(''); let s = ''; for (let i = 0; i < bits.length; i += 5) s += B32A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return s + '='.repeat((8 - (s.length % 8)) % 8); };
// RFC 2045 §6.7: a printable byte as is (not '='), any other =XX; a soft line break lands wherever the 76th column falls — here INSIDE the value
const qpOf = (v, { every = false, lower = false, soft = '=\r\n' } = {}) => { const p = [...Buffer.from(v)].map((b) => (!every && b >= 33 && b <= 126 && b !== 61 ? String.fromCharCode(b) : '=' + b.toString(16).padStart(2, '0')[lower ? 'toLowerCase' : 'toUpperCase']())), h = p.length >> 1; return p.slice(0, h).join('') + soft + p.slice(h).join(''); };
// Python repr(bytes): printable ASCII as is (\\ and the quote escaped), \t \n \r, every other byte \xNN
const pyBytes = (v) => "b'" + [...Buffer.from(v)].map((b) => (b === 92 ? '\\\\' : b === 39 ? "\\'" : b === 9 ? '\\t' : b === 10 ? '\\n' : b === 13 ? '\\r' : b >= 32 && b < 127 ? String.fromCharCode(b) : '\\x' + b.toString(16).padStart(2, '0'))).join('') + "'";
// Python ascii(str): \xNN / \uXXXX / \UXXXXXXXX by CODE POINT
const pyStr = (v) => "'" + cps(v).map((c) => { const p = c.codePointAt(0); return c === '\\' ? '\\\\' : c === "'" ? "\\'" : c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : p >= 32 && p < 127 ? c : p < 0x100 ? '\\x' + p.toString(16).padStart(2, '0') : p < 0x10000 ? '\\u' + p.toString(16).padStart(4, '0') : '\\U' + p.toString(16).padStart(8, '0'); }).join('') + "'";
const everyX = (v) => [...Buffer.from(v)].map((b) => '\\x' + b.toString(16).padStart(2, '0').toUpperCase()).join('');   // strace -xx, a C literal
const rustU = (v) => cps(v).map((c) => '\\u{' + c.codePointAt(0).toString(16) + '}').join('');                      // Rust escape_unicode
const octal = (v) => [...Buffer.from(v)].map((b) => (b >= 127 || b < 32 ? '\\' + b.toString(8).padStart(3, '0') : b === 92 ? '\\\\' : String.fromCharCode(b))).join('');   // git core.quotePath, bash $'…'
const htmlEscape = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');   // Python html.escape, Jinja
const htmlEvery = (v) => cps(v).map((c) => `&#${c.codePointAt(0)};`).join('');
const owasp = (v) => cps(v).map((c) => (/[A-Za-z0-9]/.test(c) ? c : `&#x${c.codePointAt(0).toString(16).toUpperCase()};`)).join('');
const sgrEvery4 = (v) => cps(v).map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join('');   // escapes BETWEEN the characters
const grepColor = (v) => { const a = cps(v), h = a.length >> 1; return a.slice(0, 3).join('') + '\x1b[01;31m\x1b[K' + a.slice(3, h).join('') + '\x1b[m\x1b[K' + a.slice(h).join(''); };
const tputBold = (v) => { const a = cps(v), h = a.length >> 1; return a.slice(0, h).join('') + '\x1b[1m' + a.slice(h, h + 2).join('') + '\x1b(B\x1b[m' + a.slice(h + 2).join(''); };
const wrapAt = (s, n) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')).join('\n');
// [name, value → { text, L, R }]: L / R = how many characters of the printing may stay beside the placeholder (the bytes
// around the value + the ONE character that mixes a neighbour's bits with the value's + the padding)
const around = (pre, post) => ({ L: Math.ceil((8 * pre) / 6), R: Math.ceil((8 * post) / 6) + 3 });
const PRINTS = [
  ['raw', (v) => ({ text: v, L: 0, R: 0 })],
  ['base64', (v) => ({ text: b64(v), L: 0, R: 0 })],
  ['base64, no padding', (v) => ({ text: b64(v).replace(/=+$/, ''), L: 0, R: 0 })],
  ['base64url', (v) => ({ text: Buffer.from(v).toString('base64url'), L: 0, R: 0 })],
  ['base64url, padded', (v) => ({ text: b64(v).replace(/\+/g, '-').replace(/\//g, '_'), L: 0, R: 0 })],
  ['base64 of x + value + yz (byte 1)', (v) => ({ text: b64('x' + v + 'yz'), ...around(1, 2) })],
  ['Basic base64(user:value) (byte 2)', (v) => ({ text: b64('user:' + v), ...around(5, 0) })],
  ['base64 of abc + value (byte 0)', (v) => ({ text: b64('abc' + v), ...around(3, 0) })],
  ['base64url of ab + value + c (byte 2)', (v) => ({ text: Buffer.from('ab' + v + 'c').toString('base64url'), ...around(2, 1) })],
  ['encodeURIComponent', (v) => ({ text: encodeURIComponent(v), L: 0, R: 0 })],
  ['percent, lower-case hex', (v) => ({ text: encodeURIComponent(v).replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()), L: 0, R: 0 })],
  ['a WHATWG form (URLSearchParams)', (v) => ({ text: new URLSearchParams({ k: v }).toString().slice(2), L: 0, R: 0 })],
  ['RFC 3986 (!\'()* too)', (v) => ({ text: enc(v, /[A-Za-z0-9\-_.~]/), L: 0, R: 0 })],
  ['Python quote (keeps /)', (v) => ({ text: enc(v, /[A-Za-z0-9\-_.~/]/), L: 0, R: 0 })],
  ['every byte %XX', (v) => ({ text: enc(v, /(?!)/), L: 0, R: 0 })],
  ['every byte %xx', (v) => ({ text: enc(v, /(?!)/, false), L: 0, R: 0 })],
  ['JSON.stringify', (v) => ({ text: JSON.stringify(v), L: 1, R: 1 })],
  ['JSON with \\/', (v) => ({ text: JSON.stringify(v).replace(/\//g, '\\/'), L: 1, R: 1 })],
  ['Python json.dumps (ensure_ascii)', (v) => ({ text: pyAscii(v), L: 1, R: 1 })],
  ['Python ensure_ascii, upper-case hex', (v) => ({ text: pyAscii(v).replace(/\\u([0-9a-f]{4})/g, (m, h) => '\\u' + h.toUpperCase()), L: 1, R: 1 })],
  ['Go json (HTML-safe)', (v) => ({ text: JSON.stringify(v).replace(/[<>&]/g, (c) => '\\u00' + c.charCodeAt(0).toString(16)), L: 1, R: 1 })],
  ['JSON inside a JSON log line', (v) => ({ text: JSON.stringify({ msg: 'auth', token: v }), L: '{"msg":"auth","token":"'.length, R: 2 })],
  ['hex', (v) => ({ text: Buffer.from(v).toString('hex'), L: 0, R: 0 })],
  ['HEX', (v) => ({ text: Buffer.from(v).toString('hex').toUpperCase(), L: 0, R: 0 })],
  ['an Authorization header (curl -v)', (v) => ({ text: `> Authorization: Bearer ${v}\r\n`, L: 24, R: 2 })],
  ['twice on one line', (v) => ({ text: `${v} and ${v}`, L: 0, R: 5 + PH.length })],
  // lane vault-scrub-forms (q-043 verify M1): what a REAL producer prints by itself — the label's head is the form
  ['utf16: UTF-16LE (PowerShell 5 > / Out-File, reg export)', (v) => ({ text: streamText(Buffer.from(v, 'utf16le')), L: 0, R: 0 })],
  ['utf16: UTF-16BE (Java writeChars)', (v) => ({ text: streamText(Buffer.from(v, 'utf16le').swap16()), L: 0, R: 0 })],
  ['base32: RFC 4648 (oathtool -v)', (v) => ({ text: b32(v), L: 0, R: 0 })],
  ['base32: no padding, lower-case (an otpauth secret)', (v) => ({ text: b32(v).replace(/=+$/, '').toLowerCase(), L: 0, R: 0 })],
  ['qp: a quoted-printable mail body (=XX, a soft break inside)', (v) => ({ text: qpOf(v), L: 0, R: 0 })],
  ['qp: every byte =xx, =\\n soft break', (v) => ({ text: qpOf(v, { every: true, lower: true, soft: '=\n' }), L: 0, R: 0 })],
  ['escape: Python repr(bytes) b\'…\\xNN…\'', (v) => ({ text: pyBytes(v), L: 2, R: 1 })],
  ['escape: Python ascii(str) \\xNN \\uXXXX \\U…', (v) => ({ text: pyStr(v), L: 1, R: 1 })],
  ['escape: every byte \\xNN (strace -xx)', (v) => ({ text: everyX(v), L: 0, R: 0 })],
  ['escape: a run of escaped backslashes, then every byte \\xNN (pairs read from the run\'s start)', (v) => ({ text: '\\\\'.repeat(5) + everyX(v), L: 10, R: 0 })],
  ['escape: Rust escape_unicode \\u{…}', (v) => ({ text: rustU(v), L: 0, R: 0 })],
  ['escape: git / bash octal \\NNN', (v) => ({ text: octal(v), L: 0, R: 0 })],
  ['entity: html.escape (& < > " \' as entities)', (v) => ({ text: htmlEscape(v), L: 0, R: 0 })],
  ['entity: every character &#NN;', (v) => ({ text: htmlEvery(v), L: 0, R: 0 })],
  ['entity: non-alphanumerics &#xHH; (OWASP encoder)', (v) => ({ text: owasp(v), L: 0, R: 0 })],
  ['ansi: an SGR escape every 4 characters', (v) => ({ text: sgrEvery4(v), L: 0, R: 0 })],
  ['ansi: grep --color highlighting a part', (v) => ({ text: grepColor(v), L: 0, R: 0 })],
  ['ansi: bold, then tput sgr0 (\\x1b(B\\x1b[m)', (v) => ({ text: tputBold(v), L: 0, R: 0 })],
  ['wrap: base64 at 76 columns (a MIME body) — the value across a line break', (v) => ({ text: wrapAt(b64('x'.repeat(48) + v), 76), L: 64, R: 4 })],
  ['wrap: openssl base64 (64 columns)', (v) => ({ text: wrapAt(b64(v), 64), L: 0, R: 0 })],
];
const secretsOf = (v) => [{ label: LABEL, value: v }];
/** null when the printing is scrubbed: before + (≤ L chars) + THE PLACEHOLDER + (≤ R chars) + after, and the raw value gone. */
function leakOf(Vm, v, p) {
  const { text, L, R } = p(v);
  const out = Vm.maskText(`before ${text} after`, secretsOf(v));
  const m = new RegExp(`^before ([\\s\\S]*?)${PH.replace(/[[\]]/g, '\\$&')}([\\s\\S]*) after$`).exec(out);
  return !m || m[1].length > L || m[2].length > R || out.includes(v) ? out.slice(0, 300) : null;
}
function scrubLeaks(Vm) { const out = []; for (const v of VALUES) for (const [name, p] of PRINTS) { const l = leakOf(Vm, v, p); if (l !== null) out.push([v.slice(0, 24), name, l]); } return out; }
// the shipped module's legs are run ONCE (the mutants below each compare against them — the suite's time budget)
const SHIPPED = new Map(); const once = (key, f) => { if (!SHIPPED.has(key)) SHIPPED.set(key, f()); return SHIPPED.get(key); };
const READ_ROWS = PRINTS.filter(([n]) => /^(qp|escape|entity|ansi|wrap): /.test(n));
function chunked(Vm, text, v, sizes) { const m = Vm.createMasker(secretsOf(v)); let out = '', i = 0, k = 0; while (i < text.length) { const n = sizes[k++ % sizes.length]; out += m.push(text.slice(i, i + n)); i += n; } return out + m.end(); }
/** every split point (values ≤ 64 bytes) and 1 / 3 / 7-character chunks; the long value at 211 and 4096 */
function chunkEscapes(Vm, rows = PRINTS) {
  const out = [];
  for (const v of VALUES) for (const [name, p] of rows) {
    const text = `before ${p(v).text} after`, whole = Vm.maskText(text, secretsOf(v));
    const short = Buffer.byteLength(v) <= 64;
    if (short) for (let i = 0; i <= text.length; i++) { const got = chunked(Vm, text, v, [i, text.length]); if (got !== whole) { out.push([v.slice(0, 24), name, `split at ${i}`]); break; } }
    for (const sizes of short ? [[1], [3], [7, 2]] : [[211], [4096, 13]]) { const got = chunked(Vm, text, v, sizes); if (got !== whole) out.push([v.slice(0, 24), name, `chunks ${sizes}`]); }
  }
  return out;
}
{
  const t0 = Date.now();
  const leaks = once('scrub', () => scrubLeaks(V));
  ok(!leaks.length, `${VALUES.length} values × ${PRINTS.length} printings (Node's own encoders): each becomes ${PH} with at most the neighbours' characters beside it — raw, base64 (± padding, URL-safe, inside a longer run at all three byte alignments: Basic user:pass), percent (upper / lower, encodeURIComponent / RFC 3986 / Python / WHATWG form / every byte), JSON (\\/, ensure_ascii, HTML-safe, nested in a log line), hex`, leaks.slice(0, 4));
  const forms = new Set(V.formsOf('p/l+a=n t?e&d#9%~*"é').map((f) => f.form));
  const spelled = V.FORM_ROWS.filter((r) => r.how === 'spelled').map((r) => r.form), read = V.FORM_ROWS.filter((r) => r.how === 'read').map((r) => r.form);
  ok(eq([...forms].sort(), [...spelled].sort()) && eq(V.VIEWS.map((x) => x.form), read) && eq(V.FORMS, V.FORM_ROWS.map((r) => r.form)) && V.FORMS.length === 12
    && V.FORM_ROWS.every((r) => typeof r.producer === 'string' && r.producer.length > 20) && new Set(PRINTS.map(([n]) => (/^(\w+): /.exec(n) || [])[1]).filter(Boolean)).size === 7,
    `FORMS is THE ONE LIST (${V.FORMS.join(', ')}): the spelled ones are exactly what formsOf builds, the read ones exactly the VIEWS, each row names its real producer — and every NEW form has printings here`);
  const esc = once('chunk', () => chunkEscapes(V));
  ok(!esc.length, `THE CHUNK WINDOW: the same ${VALUES.length * PRINTS.length} texts cut at EVERY split point (values ≤ 64 bytes) and fed 1 / 3 / 7+2 characters at a time (the 2 560-byte value at 211 and 4096+13) scrub exactly as the whole text does`, esc.slice(0, 4));
  const m = V.createMasker(secretsOf(VALUES[0])), W = m.window;
  // r1068 (the scan's budget, its read's F2): a push no longer than the window waits for a window's worth — the second push here
  // (16 characters, W = 53) hands on nothing, and its characters come with the end (the parts joined: the same text)
  const first = m.push('x'.repeat(100) + VALUES[0].slice(0, 5)), second = m.push(VALUES[0].slice(5) + ' ok'), last = m.end();
  ok(W === Math.max(...V.formsOf(VALUES[0]).map((f) => f.text.length)) - 1 && first === 'x'.repeat(105 - W) && second === '' && last === 'x'.repeat(100 - first.length - second.length) + PH + ' ok' && m.hits === 1 && m.byForm.raw === 1 && m.bytes === Buffer.byteLength(VALUES[0]), 'the window: push hands on all but the last (longest form − 1) characters — a value that STARTS inside them waits for the next chunk or the end; a push no longer than the window waits for a window\'s worth (r1068); end flushes; hits / bytes (UTF-8, the audit\'s count) / byForm count', { W, first: first.length, second, last, bytes: m.bytes });
  const PLAIN = ['plain text, no value here: ünïcödé 🔑 vault://mounts/m1/secretKey [vault:x] %41 \\u0041', 'x'.repeat(5000)];
  ok(PLAIN.every((t) => chunked(V, t, VALUES[1], [1]) === t && chunked(V, t, VALUES[1], [17, 3]) === t && V.maskText(t, secretsOf(VALUES[1])) === t), 'text without a value passes byte for byte, chunked or whole (references and placeholders included)');
  let threw = null; try { V.createMasker([{ label: LABEL, value: 'abcdefg' }]); } catch (e) { threw = e.code; }
  ok(threw === 'entry_too_short_to_mask' && !!V.createMasker([{ label: LABEL, value: 'éééé' }]) && !!V.createMasker([{ label: LABEL, value: 'abcdefgh' }]), 'a value under 8 bytes cannot be scrubbed: createMasker refuses it by name (8 bytes — four é — is enough)');
  const two = [{ label: 'mounts/a/k', value: 'planted-VALUE-0001' }, { label: 'mounts/b/k', value: 'planted-VALUE-0001-and-more' }];
  ok(V.maskText('1 planted-VALUE-0001-and-more 2 planted-VALUE-0001 3', two) === '1 [vault:mounts/b/k] 2 [vault:mounts/a/k] 3', 'two values, one inside the other: the longest form wins where both match');
  ok(V.maskText('k=planted-VALUE-0001', [{ ref: V.parseRef(M2), value: 'planted-VALUE-0001' }]) === 'k=[vault:mounts/m2/secretKey]' && V.maskText('k=planted-VALUE-0001', [{ ref: M2, value: 'planted-VALUE-0001' }]) === 'k=[vault:mounts/m2/secretKey]', 'a secret named by its parsed reference or its vault:// string wears that placeholder');
  // THE SIEVE (§8.6 ③) — the named holes pass on purpose; these are controls, not wishes
  const v = VALUES[0], rev = [...v].reverse().join(''), sha = crypto.createHash('sha256').update(v).digest('hex');
  const so = V.createMasker(secretsOf(v)), se = V.createMasker(secretsOf(v));
  const split = so.push(v.slice(0, 9)) + so.end() + '|' + se.push(v.slice(9)) + se.end();
  // ONE window per run (the desk's M1): the run's ONE masker is fed by both pipes in arrival order — the same split is masked,
  // each character handed back to the stream it came on, the placeholder on the stream the value began on
  const both = (feed) => { const m = V.createRunMasker(secretsOf(v)), acc = { out: '', err: '' }; const add = (o) => { acc.out += o.out; acc.err += o.err; }; for (const [k, c] of feed) add(m.push(k, c)); add(m.end()); return acc; };
  const one = both([['out', 'a ' + v.slice(0, 9)], ['err', v.slice(9) + ' b'], ['out', ' c']]);
  ok(one.out === 'a ' + PH + ' c' && one.err === PH + ' b' && split === v.slice(0, 9) + '|' + v.slice(9), 'ONE WINDOW PER RUN: a value split between stdout and stderr is masked by the run\'s one masker (stdout «a [vault:…] c», stderr «[vault:…] b» — each pipe shows where its part was) — two maskers, one per stream, let the same split by (the control)', [one, split.slice(0, 40)]);
  // …and reading the pipes in arrival order never costs a value inside ONE pipe: the other pipe's chunk between its halves
  const h = v.length >> 1, inter = both([['out', '<' + v.slice(0, h)], ['err', '<' + v.slice(0, h)], ['out', v.slice(h) + '>'], ['err', v.slice(h) + '>']]);
  ok(inter.out === '<' + PH + '>' && inter.err === '<' + PH + '>', 'a value written to EACH pipe in two pieces, the other pipe\'s piece arriving between them, is masked on both (each pipe is read on its own too)', inter);
  // a seeded fuzz over the two pipes: values whole on one pipe or split between them, other output around, every chunking
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const fuzzBad = [];
  for (let round = 0; round < 60; round++) {
    const val = VALUES[rnd(4)], prints = PRINTS.filter(([n]) => !/twice/.test(n)), [pn, p] = prints[rnd(prints.length)], txt = p(val).text;
    const feed = [];
    for (let j = 0; j < 3; j++) feed.push([rnd(2) ? 'out' : 'err', 'noise ' + j + ' ']);
    const k = rnd(2) ? 'out' : 'err', cutAt = rnd(txt.length - 1) + 1;
    if (rnd(2)) feed.push([k, txt.slice(0, cutAt)], [k === 'out' ? 'err' : 'out', 'between '], [k, txt.slice(cutAt)]);   // one pipe, the other's chunk inside
    else feed.push([k, txt.slice(0, cutAt)], [k === 'out' ? 'err' : 'out', txt.slice(cutAt)]);                       // split between the pipes
    feed.push([rnd(2) ? 'out' : 'err', ' tail']);
    for (const size of [1, 3, 1e9]) {
      const fine = feed.flatMap(([s, c]) => { const o = []; for (let i = 0; i < c.length; i += size) o.push([s, c.slice(i, i + size)]); return o; });
      const r = both(fine), joined = [r.out + r.err, r.err + r.out];
      if (!r.out.includes(PH) && !r.err.includes(PH) || joined.some((j) => j.includes(val) || (Buffer.byteLength(val) <= 64 && j.includes(val.slice(0, 12))))) fuzzBad.push([pn, size, JSON.stringify(r).slice(0, 160)]);
    }
  }
  ok(!fuzzBad.length, 'A SEEDED FUZZ over the two pipes (60 rounds × 3 chunkings — a value whole on one pipe with the other\'s chunk inside it, or split between the pipes; noise around): every round masked, no 12 characters of a value on either pipe or both joined', fuzzBad.slice(0, 3));
  const bs = V.createMasker(secretsOf(v)), bsOut = bs.push('\\'.repeat(65536)).length;
  ok(bsOut >= 65536 - 2 * bs.window - 12, `a 64 KiB run of backslashes is handed on as it comes (${bsOut} characters before the end — the escape view keeps back its window of pairs (2 × window) and one unfinished token from the run's last pair boundary, never the whole run)`, bsOut);
  const swap = (s) => s[0] === s[0].toUpperCase() ? s[0].toLowerCase() + s.slice(1) : s[0].toUpperCase() + s.slice(1);
  const gz = zlib.gzipSync(Buffer.from(v)).toString('base64'), spaced = cps(v).join(' '), apart = both([['out', v.slice(0, 9)], ['out', ' other output '], ['err', v.slice(9)]]);
  ok(V.maskText(rev, secretsOf(v)) === rev && V.maskText(sha, secretsOf(v)) === sha && V.maskText(v.slice(-4), secretsOf(v)) === v.slice(-4) && V.maskText(gz, secretsOf(v)) === gz && V.maskText(spaced, secretsOf(v)) === spaced && V.maskText(swap(v), secretsOf(v)) === swap(v) && apart.out + apart.err === v.slice(0, 9) + ' other output ' + v.slice(9),
    'THE SIEVE\'S NAMED HOLES pass (controls): a reversal, a hash, the last four characters, gzip + base64 (a compressed stream is not a spelling), the characters spaced, one case swapped, a value split between the pipes with other output between the halves — invented, never what a tool prints by itself');
  const head = fs.readFileSync(SRC, 'utf8').split('\nconst VI = ')[0];
  ok(/THE SCRUBBER IS A SIEVE/.test(head) && /WRITE-THEN-CAT DEFEATS IT/.test(head) && /NOT isolation/.test(head) && /a tool can SEND the value somewhere/.test(head) && /refusal table is a belt, not a proof/.test(head) && /THE FLOOR/.test(head) && /ONE window per run/.test(head), 'the module\'s header says so: the scrubber is a sieve, write-then-cat defeats it, same-uid is not isolation, a tool can send the value out, the refusal table is a belt — and it states THE FLOOR and the one window per run');
  console.log(`  (the scrubber legs ran in ${Date.now() - t0} ms)`);
}

console.log('⑥b THE REAL PRODUCERS\' TABLE — every printing × a 21-character value × start / middle / end of a chunk × a cut inside it');
{
  const t0 = Date.now();
  const V21 = 'sk-Live_9f=Q/2u+Zt7wX';
  const POS = { start: (x) => [x + ' ' + 'y'.repeat(200), 0], middle: (x) => ['x'.repeat(100) + ' ' + x + ' ' + 'y'.repeat(100), 101], end: (x) => ['x'.repeat(200) + ' ' + x, 201] };
  const bad = [];
  let legs = 0;
  for (const [name, p] of PRINTS) {
    const { text, L, R } = p(V21);
    for (const [pos, place] of Object.entries(POS)) {
      const [chunk, at] = place(text);
      const whole = V.maskText(chunk, secretsOf(V21));
      const head = chunk.slice(0, at), tail = chunk.slice(at + text.length);
      const i = whole.indexOf(PH);
      const okWhole = whole.startsWith(head) && whole.endsWith(tail) && i >= head.length && i - head.length <= L && whole.length - tail.length - (i + PH.length) <= R && !whole.includes(V21) && !whole.includes(V21.slice(0, 10)) && !whole.includes(V21.slice(-10));
      if (!okWhole) { bad.push([name, pos, 'whole', JSON.stringify(whole).slice(0, 160)]); continue; }
      for (let c = at + 1; c < at + text.length; c++) {   // the stream cut at EVERY point inside the printed value
        legs++;
        const m = V.createMasker(secretsOf(V21)), got = m.push(chunk.slice(0, c)) + m.push(chunk.slice(c)) + m.end();
        if (got !== whole) { bad.push([name, pos, `cut at ${c - at}`, JSON.stringify(got).slice(0, 160)]); break; }
      }
    }
  }
  ok(!bad.length, `${PRINTS.length} printings × the 21-character value × start / middle / end of a 200-character chunk: each masked WHOLE (the placeholder where the printing was, only its quotes / prefix beside it, 0 characters of the value), and the stream cut at every point inside the printed value (${legs} cuts) hands on exactly the one-shot`, bad.slice(0, 4));
  const frag = V21.slice(0, 7), fragText = `a ${frag} b ${V21.slice(-4)} c`;
  ok(V.maskText(fragText, secretsOf(V21)) === fragText && Buffer.byteLength(frag) === V.MIN_MASK_BYTES - 1, `THE FLOOR (by rule): a 7-byte fragment of a value (${V.MIN_MASK_BYTES - 1} bytes, under MIN_MASK_BYTES) and its last four characters are NOT masked — the scrubber masks a whole value in a spelling, never a part of one`);
  console.log(`  (the producers' table ran in ${Date.now() - t0} ms)`);
}

console.log('⑧ MUTANTS (of ⑥, ⑦g and the scan\'s budget) — patched copies of the scrubber (src/vault-scrubber.js) must go RED (moved from test-vault-run-model with ⑥, and by 主开发 r2479)');
{
  const dir = scratchDir('scrubmodel-deep');   // r1670: never the run door's folder shape (vs-vault-run-…, src/temp-sweepers.js)
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  for (const f of ['vault-inventory.js', 'vault-kinds.js', 'vault-blocked.js', 'foryou-actions.js', 'vault-scrubber.js', 'vault-file.js', 'ssh-key-format.js']) fs.copyFileSync(path.join(REPO, 'src', f), path.join(dir, 'src', f));
  const real = fs.readFileSync(SCRUBBER_SRC, 'utf8');   // every ⑧ anchor is the scrubber's own line (src/vault-scrubber.js since 主开发 r1919)
  const mutant = (name, from, to) => { const f = path.join(dir, 'src', `vault-scrubber-${name}.js`); fs.writeFileSync(f, anchored(real, from, to, `⑧ «${name}»`)); return { hit: true, M: require(f) }; };   // anchored: an anchor that moved fails BY NAME
  const LEGS = [
    ['the scrubber without base64', '\n    ...base64Forms(bytes),\n', '\n    ...[],\n', (Vm) => (Vm === V ? once('scrub', () => scrubLeaks(V)) : scrubLeaks(Vm)).filter(([, n]) => /base64|Basic/.test(n) && !/^wrap: /.test(n))],
    ['a value split across chunks escaping (no window)', '  const W = maxLen - 1;\n', '  const W = 0;\n', (Vm) => (Vm === V ? once('chunk', () => chunkEscapes(V)) : chunkEscapes(Vm))],
    // lane vault-scrub-forms: each NEW form dropped ⇒ its printings leak; a view's held tail ignored ⇒ a value cut inside its escapes leaks
    ...[['utf16', ', ...utf16Forms(v)', ''], ['base32', ', ...base32Forms(bytes)', ''],
      ['qp', "re: /=(?:\\r?\\n|[0-9A-Fa-f]{2})/g", 're: /(?!)/g'], ['escape', "re: /\\\\(?:x[0-9A-Fa-f]{2}", 're: /(?!)\\\\(?:x[0-9A-Fa-f]{2}'],
      ['entity', "re: /&(?:#[0-9]{1,7};", 're: /(?!)&(?:#[0-9]{1,7};'], ['ansi', "re: /\\x1b(?:", 're: /(?!)\\x1b(?:'], ['wrap', 're: /[\\r\\n]/g', 're: /(?!)/g']]
      .map(([form, from, to]) => [`the scrubber without the ${form} form`, from, to, (Vm) => (Vm === V ? once('scrub', () => scrubLeaks(V)) : scrubLeaks(Vm)).filter(([, n]) => n.startsWith(form + ': '))]),
    ['a backslash run held whole', 'k = j + 2 * Math.floor((k - j) / 2);', 'k = j;', (Vm) => { const m = Vm.createMasker(secretsOf(VALUES[0])), n = m.push('\\'.repeat(65536)).length; return n >= 65536 - 2 * m.window - 12 ? [] : [['held', n]]; }],
    ['a view\'s held tail ignored', 'if (!final) { const len = r ? r.sk.length : end, ss = len - W;', 'if (false) { const len = r ? r.sk.length : end, ss = len - W;', (Vm) => (Vm === V ? once('chunk', () => chunkEscapes(V)).filter(([, n]) => READ_ROWS.some(([r]) => r === n)) : chunkEscapes(Vm, READ_ROWS))],
    // MOVED from test-vault-run-model's ⑧ by 主开发 r2479 (the fast row back under 10 s): the red controls of ⑦g (r858) and of THE SCAN'S
    // BUDGET (r1068 / r1216) — each a patched copy of src/vault-scrubber.js, judged by the shared scrub legs (scripts/vault-run-scrub-legs.mjs)
    ['the sweep moves no cut', '    if (!rs.some(([k, a]) => a < cut.get(k))) continue;   // it starts at or past every cut it covers', '    continue;   // it starts at or past every cut it covers', (Vm) => SCRUB.cutLeg(Vm, 60).out],
    // the END's line, anchored with the end's next line: the settle (round wi8mtvm6c) reads the same arrival finds in a line of its own
    ['the cut tail ignores the arrival order\'s finds', '    if (ar) for (const f of scan(ar.all, true, ar.idxAt).finds) finds.push(ar.rangesOf(f.s, f.e));\n    settleCuts(finds, start, spend);   // THE ONE SWEEP', '    settleCuts(finds, start, spend);   // THE ONE SWEEP', (Vm) => SCRUB.cut2Leg(Vm, 60).out],
    ['the cut ignores the arrival order\'s own tail', '      const q = cutTailStart(ar.all);', '      const q = ar.all.length;', (Vm) => SCRUB.cut2Leg(Vm, 60).out],
    ['the sweep follows no cut it moved', '{ cut.set(k, a); reach(k); }', '{ cut.set(k, a); }', (Vm) => SCRUB.chainLeg(Vm, 20)],
    ['the sweep\'s ranges unsorted', 'l.sort((x, y) => y[0] - x[0]);', 'l.sort((x, y) => x[0] - y[0]);', (Vm) => SCRUB.sweepLeg(Vm, 300)],
    ['the two fixpoints put back', '    if (!final) settleCuts(groups.map((g) => g.r), cut, spend);   // THE ONE SWEEP (主开发 r1068): never cut inside a group — one not wholly before the cuts is kept back whole; the cuts settled in one sweep (was a fixpoint that walked a chain of groups back one a pass)', '    if (!final) for (let moved = true; moved;) { moved = false; for (const g of groups) { spend(1); if (g.r.every(([k, , b]) => b <= cut.get(k))) continue; for (const [k, a] of g.r) if (a < cut.get(k)) { cut.set(k, a); moved = true; } } }', (Vm) => { const r = SCRUB.turnLeg(Vm); return [r.rot, r.zeros].filter((x) => x.over || x.maxSteps > 32 * x.charge * (x.most + x.push + x.W) + 65536).map((x) => `${x.maxSteps} steps in one turn, ${x.most} characters held${x.over ? ', failed closed' : ''}`); }],
    ['a character charged once', '      spend(deepCost(sk, heads));', '      spend(sk.length);', (Vm) => { const r = SCRUB.periodLeg(Vm, ['short']); return r.short.over ? [] : [`32 KiB of «A» with 64 «A» stored charged ${r.short.maxSteps} steps and not failed closed`]; }],
    ['a long form verified uncounted', 'for (const t of longs) { spend(t.length); if', 'for (const t of longs) { if', (Vm) => { const r = SCRUB.periodLeg(Vm, ['thrice']); return r.thrice.over ? [] : [`a long form verified at every position of 8 KiB of «A», ${r.thrice.maxSteps} steps, not failed closed`]; }],
    ['the budget cut', '> limit.run + limit.aChar * st.read) throw OVER; };', '> limit.run + limit.aChar * st.read) void 0; };', (Vm) => { const r = SCRUB.budgetLeg(Vm); return [r.turn, r.run].filter((x) => !x.over).map(() => 'the planted input ran past its figure and did not fail closed'); }],
    ['the overrun hands the held text on', 'if (x) { out[k] += CUT_PH; st.hits++; st.bytes += bytesOf(x); }', 'if (x) { out[k] += x; }', (Vm) => { const r = SCRUB.budgetLeg(Vm), c = SCRUB.cutEndLeg(Vm); return [...[r.turn, r.run].filter((x) => x.clear >= 8).map((x) => `${x.clear} characters of the value in the clear`), ...(c.ok ? [] : [`the end met inside its cut gave stdout of ${String(c.endOut).length} characters`])]; }],
    ['the mark not sticky', '      if (st.over) { st.withheld += t.length; return none(); }', '      void 0;', (Vm) => { const r = SCRUB.budgetLeg(Vm); return [r.turn, r.run].filter((x) => x.after > 0).map((x) => `${x.after} characters handed on after the mark`); }],
    ['the end after the mark speaks again', "    if (st.over) return none();   // THE SCAN'S BUDGET: the end after the mark gives nothing", "    void 0;   // THE SCAN'S BUDGET: the end after the mark gives nothing", (Vm) => { const r = SCRUB.budgetLeg(Vm); return [r.turn, r.run].filter((x) => x.after > 0).map((x) => `${x.after} characters handed on after the mark`); }],
    // 主开发 r1216 (the follow): the cut's search counted, the end's overrun, the heads' shapes
    ['the end\'s overrun not caught', "    if (!st.inTurn) return turn(() => endStep(cut));   // THE SCAN'S BUDGET", "    void 0;   // THE SCAN'S BUDGET", (Vm) => { const r = SCRUB.cutEndLeg(Vm); return r.ok ? [] : [r.threw ? `the end threw ${r.threw}` : 'the end did not fail closed by name']; }],
    ['a value\'s head before an unfinished token unread', ' if (q < start) start = q; ends.add(q); break; }', ' if (q < start) start = q; break; }', (Vm) => SCRUB.cutLeg(Vm, 30).out],   // stale-pins: kept (the replacement IS the release's reading)
    ['the cut rebuilt stream by stream', "      if (keep) { const p = next[next.length - 1]; if (p && p[0] === k) p[1] += keep; else next.push([k, keep]); }\n    }\n    held = next;\n    const out = step(true);", "    }\n    held = [...own].map(([k, x]) => [k, x.slice(0, start.get(k))]).filter(([, x]) => x);\n    const out = step(true);", (Vm) => SCRUB.cut2Leg(Vm, 60).out],   // stale-pins: kept (the replacement IS the release's cut)
    ['the run\'s scan jumps past a match', 'vEnd.set(t.v, m.index + m[0].length); if (m.index >= gEnd) gStart = m.index; gEnd = Math.max(gEnd, m.index + m[0].length); gAt = p; re.lastIndex = m.index + 1;   // THE SCRUBBER\'S OVERLAP', 'vEnd.set(t.v, m.index + m[0].length); if (m.index >= gEnd) gStart = m.index; gEnd = Math.max(gEnd, m.index + m[0].length); gAt = p;   // THE SCRUBBER\'S OVERLAP', (Vm) => SCRUB.overlapLeg(Vm, 30).bad.filter((x) => x.startsWith('run:'))],
    ['the same value asked inside its own match', '        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // THE SCRUBBER\'S OVERLAP', '        void 0;   // THE SCRUBBER\'S OVERLAP', (Vm) => { const r = SCRUB.selfLeg(Vm), q = SCRUB.selfLeg(SCRUB.release()); return r.out !== q.out || r.hits !== q.hits ? [`${r.hits} placeholders (the release ${q.hits}), the output ${r.out.length} characters (the release ${q.out.length})`] : []; }],
    ['a value after its own overlap jumped past', '        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // THE SCRUBBER\'S OVERLAP', '        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = vEnd.get(t.v); continue; }   // THE SCRUBBER\'S OVERLAP', (Vm) => SCRUB.overlapLeg(Vm, 30).bad.filter((x) => x.startsWith('self-run:'))],
    ['the overlap rule keyed on the placeholder', '        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // THE SCRUBBER\'S OVERLAP: the SAME value inside its own last find (`0000…`, a value overlapping itself) is no new find — so it tiles as the release did (one placeholder, one hit, a tile) — yet the next position is still asked for another value\n        finds.push({ s, e: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph, form: form || t.form });\n        vEnd.set(t.v, m.index + m[0].length); if (m.index >= gEnd) gStart = m.index; gEnd = Math.max(gEnd, m.index + m[0].length); gAt = p; re.lastIndex = m.index + 1;   // THE SCRUBBER\'S OVERLAP (lane lg-vault-file, r858): asked again INSIDE the match — ANOTHER value that starts inside it is found (the masks\' union is one placeholder); the leftmost match had jumped past it and left its tail in the clear', '        if ((vEnd.get(t.ph) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // THE SCRUBBER\'S OVERLAP: the SAME value inside its own last find (`0000…`, a value overlapping itself) is no new find — so it tiles as the release did (one placeholder, one hit, a tile) — yet the next position is still asked for another value\n        finds.push({ s, e: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph, form: form || t.form });\n        vEnd.set(t.ph, m.index + m[0].length); if (m.index >= gEnd) gStart = m.index; gEnd = Math.max(gEnd, m.index + m[0].length); gAt = p; re.lastIndex = m.index + 1;   // THE SCRUBBER\'S OVERLAP (lane lg-vault-file, r858): asked again INSIDE the match — ANOTHER value that starts inside it is found (the masks\' union is one placeholder); the leftmost match had jumped past it and left its tail in the clear', (Vm) => SCRUB.overlapLeg(Vm, 30).bad.filter((x) => x.startsWith('same-label:'))],
    ['a cut inside a character unread', '    { let q = L; while (q > 0 && buf[q - 1] === \'\\uFFFD\') q--; if (q < L) ends.add(q), fffd = q; }   // a character the cut broke — only an END (the third read: as the tail itself, every binary output cut at the bound counted a scrubbed hit where no value was)', '', (Vm) => SCRUB.cutLeg(Vm, 30).out],
    ['a view\'s end not mapped into its decode', '        if (e < L) { let lo = 0, hi = r.sk.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (r.at[mid] < e) lo = mid + 1; else hi = mid; } n = lo; }   // the decoded characters that start before e', '', (Vm) => SCRUB.cutLeg(Vm, 30).out],
    ['a long group never broken', 'if (!final && m.index < gEnd && gEnd - gStart > 2 * (W + 1) && Math.floor(p / G) > Math.floor(gAt / G)) {', 'if (false) {', (Vm) => { const r = SCRUB.rotLeg(Vm); return r.most > 10 * (r.W + 1) ? [`${r.most} characters not yet handed on after a push`] : []; }],
    ['a break in a final read', 'if (!final && m.index < gEnd && gEnd - gStart > 2 * (W + 1)', 'if (m.index < gEnd && gEnd - gStart > 2 * (W + 1)', (Vm) => { const r = SCRUB.rotLeg(Vm); return r.texts.phase >= 8 ? [`maskText leaves ${r.texts.phase} characters of a value in the clear out of the grid's phase`] : []; }],
    ['the break at each read\'s own length', 'gEnd - gStart > 2 * (W + 1) && Math.floor(p / G) > Math.floor(gAt / G)) {', 'gEnd - gStart > 4 * (W + 1)) {', (Vm) => { const r = SCRUB.rotLeg(Vm); return r.most > 10 * (r.W + 1) ? [`${r.runs.line.most} (a line end) / ${r.runs.stderr.most} (a stderr line) characters not yet handed on after a push`] : []; }],
    ['a break that skips its find', '{ finds.push({ s, e: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph, form: form || t.form }); vEnd.set(t.v, m.index + m[0].length); re.lastIndex = Math.max(gEnd, m.index + m[0].length); gStart = gEnd = gAt = -1; continue; }', '{ re.lastIndex = gEnd; gStart = gEnd = gAt = -1; continue; }', (Vm) => { const r = SCRUB.rotLeg(Vm); return Math.max(...Object.values(r.texts)) >= 8 ? [`maskText leaves ${Object.values(r.texts).join(' / ')} characters of a value in the clear`] : []; }],
    ['a broken character\'s run taken as the tail', 'if (p < e && p < start) start = p;', 'if (p < start) start = p;', (Vm) => { const r = SCRUB.binLeg(Vm); return r.ascii > 0 ? [`${r.ascii} placeholders where no value was`] : []; }],
    ['a head before a broken character taken whatever follows it', "const j = lowerBound(s + (broken ? '\\x80' : '\\0'));", "const j = lowerBound(s + '\\0');", (Vm) => { const r = SCRUB.binLeg(Vm); return r.ascii > 0 ? [`${r.ascii} placeholders where no value was`] : []; }],
    ['a broken character read as a value\'s head', 'qz = Math.min(n, f), qh', 'qz = n, qh', (Vm) => { const r = SCRUB.binLeg(Vm); return r.cjk > 0 ? [`${r.cjk} placeholders where no value was`] : []; }],
    ['the dialog scrubber jumps past a match', "vEnd.set(t.v, m.index + m[0].length); re.lastIndex = m.index + 1;   // the dialog scrubber's overlap", "vEnd.set(t.v, m.index + m[0].length);   // the dialog scrubber's overlap", (Vm) => SCRUB.overlapLeg(Vm, 30).bad.filter((x) => x.startsWith('dialog:'))],
    ['its spelled pass jumps past a match', "vEnd.set(t.v, m.index + m[0].length); re.lastIndex = m.index + 1;   // its spelled pass (r858)", "vEnd.set(t.v, m.index + m[0].length);   // its spelled pass (r858)", (Vm) => SCRUB.overlapLeg(Vm, 30).bad.filter((x) => x.startsWith('spelled:'))],
    ['its spelled view pass jumps past a match', "vEnd.set(t.v, m.index + m[0].length); re.lastIndex = m.index + 1;   // its spelled pass through a view", "vEnd.set(t.v, m.index + m[0].length);   // its spelled pass through a view", (Vm) => SCRUB.overlapLeg(Vm, 30).bad.filter((x) => x.startsWith('spelled-view:'))],
    ['the dialog scrubber asks its own value again', "        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // the dialog scrubber's overlap", "        void 0;   // the dialog scrubber's overlap", (Vm) => SCRUB.parityLeg(Vm, 10)],
  ];
  const cleanLeg = new Map();   // the clean leg(V) is the SAME every mutant — run it ONCE per leg function (the scrubber legs memoise through once() already)
  for (const [name, from, to, leg] of LEGS) {
    const { hit, M } = mutant(name.replace(/\W+/g, '-'), from, to);
    const red = hit ? leg(M) : [];
    if (!cleanLeg.has(leg)) cleanLeg.set(leg, leg(V));
    ok(hit && red.length > 0 && cleanLeg.get(leg).length === 0, `MUTANT «${name}»: the patch hits once and the leg goes RED (${red.length} escapes) — the shipped module passes the same leg`, { hit, sample: red.slice(0, 2) });
  }
}

report();

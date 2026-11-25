// THE RUN SCRUBBER'S LEGS (lane lg-vault-file — 主开发 r858, the three faults; r1068, the scan's budget), shared by
// test-vault-run-model (fast) and test-vault-run-model-deep (heavy: the 2 MiB of the bound). Each leg takes the module it judges
// (the shipped one, the release's function rebuilt from it, or a patched copy) and returns what it counted — never a value. The
// release copy writes ONE scratch copy of the scrubber's module with the release's lines put back (`SRC`: src/vault-scrubber.js
// since 主开发 r1919, THE COST — the scrubber's own lines live there); the suite hands in its scratch.mjs `scratchDir` / `anchored`
// and its `require`, so this file imports no harness.
import fs from 'node:fs';
import path from 'node:path';
/** the RELEASE's cutTailStart, its own lines (the release copy puts them back) */
const RELEASE_CUT_TAIL_START = "  function cutTailStart(buf) {\n    const L = buf.length;\n    if (!L) return L;\n    const isPrefix = (sfx) => { if (!sfx) return false; for (const t of texts) if (t.length > sfx.length && t.startsWith(sfx)) return true; return false; };   // a NON-EMPTY proper prefix of some spelled form\n    const prefixStart = (str) => { const n = str.length; for (let q = Math.max(0, n - W); q < n; q++) if (isPrefix(str.slice(q))) return q; return n; };   // earliest offset whose suffix-to-the-end is a value prefix (W bounds the search)\n    let start = prefixStart(buf);                                  // a raw / encoded form half present at the tail\n    for (const vw of VIEWS) {\n      for (let q = Math.max(0, L - vw.max + 1); q < L; q++) if (vw.triggers.includes(buf[q])) { if (q < start) start = q; break; }   // a trailing INCOMPLETE view token (its first trigger within the last vw.max-1 chars) — its decode is unknown ⇒ uncertain from there\n      const r = readView(vw, buf, L, false);\n      if (r) { const ps = prefixStart(r.sk); if (ps < r.sk.length) { const raw = r.at[ps]; if (raw != null && raw < start) start = raw; } }   // a complete-token VIEW decode whose tail is a value prefix — mapped back to a raw offset\n    }\n    return start;\n  }\n";   // stale-pins: kept (the release's own lines, put back)
/** → the legs over the run scrubber; `env` = { REPO, SRC, scratchDir, anchored, require } from the suite */
export function scrubLegs({ REPO, SRC, scratchDir, anchored, require }) {
  const seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  /** the longest run of v present in o (a value «in the clear» = 8 characters or more of it) */
  const clearRun = (o, v) => { let best = 0; for (let i = 0; i + best < v.length; i++) while (i + best < v.length && o.includes(v.slice(i, i + best + 1))) best++; return best; };
  const bytes = (s) => Buffer.byteLength(s, 'utf8');
  /** SCENE 2 (the likeliest by accident): a value printed, then the run CUT (the 2 MiB bound, a timeout, a lock, a gone caller) —
   *  the two scenes the reads measured, then 120 seeded values with three line ends. → the values with ≥ 8 characters in the clear */
  const cutLeg = (Vm, n = 120) => {
    const rnd = seeded(4242), tok = (k) => Array.from({ length: k }, () => B62[Math.floor(rnd() * 62)]).join('');
    const scenes = [
      ['a value ending in its own first character, echoed', 'q' + tok(38) + 'q', (v) => 'export TOKEN=' + v + '\n'],
      ['a colour code inside a value near its end', 'tk-live-' + tok(18), (v) => 'token: ' + v.slice(0, 20) + '\x1b[1m' + v.slice(20)],
      ...Array.from({ length: n }, (_, i) => [`random value ${i}`, ['tk_', 'key-', ''][i % 3] + tok(20 + Math.floor(rnd() * 60)), (v) => 'export TOKEN=' + v + ['\n', '\r\n', ''][i % 3]]),
      // the scrubber's read: the cut lands inside an UNFINISHED token right after a value's head — a colour code, a soft break's `=`, a `\x` escape cut short
      ...Array.from({ length: n }, (_, i) => [`a head then a ${['colour code', '`=`', '`\\x`'][i % 3]} cut short ${i}`, 'tk-live-' + tok(18 + Math.floor(rnd() * 30)), (v) => 'token: ' + v.slice(0, 20) + ['\x1b[1', '=', '\\x4'][i % 3]]),
      // the third read: a head coloured in pieces (`grep --color`), the cut inside the NEXT colour code — only a view's decode, read to that code's start, holds the head
      ...Array.from({ length: Math.ceil(n / 3) }, (_, i) => [`a head coloured in pieces, cut inside the next code ${i}`, 'tk-live-' + tok(34 + Math.floor(rnd() * 20)), (v) => 'token: \x1b[31m' + v.slice(0, 10) + '\x1b[0m' + v.slice(10, 40) + '\x1b[3']),
      // the scrubber's second read: the 2 MiB bound counts BYTES — a value's character cut there decodes as U+FFFD
      ...Array.from({ length: Math.ceil(n / 3) }, (_, i) => [`a CJK value cut inside a character ${i}`, Array.from({ length: 12 + Math.floor(rnd() * 12) }, () => '密码钥匙令牌证书服务器部署生产环境数据库账号用户口令安全'[Math.floor(rnd() * 25)]).join(''), (v) => '令牌：' + v.slice(0, 10) + '\uFFFD']),
    ];
    const out = []; let clear = 0;
    for (const [name, v, print] of scenes) {
      const m = Vm.createRunMasker(Vm.compileForms([{ label: 'cut', value: v }]), ['out']);
      const o = m.push('out', print(v)).out + m.end(true).out, c = clearRun(o, v);
      if (c >= 8) { out.push(`${name}: ${c} of its ${v.length} characters in the clear`); clear += c; }
    }
    return { scenes: scenes.length, out, clear };
  };
  /** SCENE 1: a value the program SPLIT between the pipes — its head on stdout, the rest on stderr (then « ok» on stdout), or only its
   *  MIDDLE on stderr (the run cut before its last characters) — and the run cut. → the values with ≥ 8 characters in the clear */
  const cut2Leg = (Vm, n = 120) => {
    const rnd = seeded(777), tok = (k) => Array.from({ length: k }, () => B62[Math.floor(rnd() * 62)]).join('');
    const out = []; let clear = 0;
    for (let i = 0; i < n; i++) {
      const v = ['tk_', 'key-', ''][i % 3] + tok(21 + Math.floor(rnd() * 40)), at = 4 + Math.floor(rnd() * (v.length - 8));
      const m = Vm.createRunMasker(Vm.compileForms([{ label: 'cut2', value: v }]), ['out', 'err']);
      const acc = { out: '', err: '' }, add = (o) => { acc.out += o.out || ''; acc.err += o.err || ''; };
      const way = i % 3;   // 0: the rest then « ok» · 1: the rest · 2: the middle only (cut before its last 1–3 characters)
      add(m.push('out', v.slice(0, at))); add(m.push('err', way === 2 ? v.slice(at, v.length - 1 - Math.floor(rnd() * 3)) : v.slice(at))); if (way === 0) add(m.push('out', ' ok\n'));
      add(m.end(true));
      const c = clearRun(acc.out, v) + clearRun(acc.err, v);
      if (c >= 8) { out.push(`value ${i} split at ${at}${['', ', the rest only', ', the middle only'][way]}: ${c} of its ${v.length} characters in the clear`); clear += c; }
    }
    return { values: n, out, clear };
  };
  /** SCENE 3: two values where B begins inside A's end, printed overlapping — through the run's scan (maskText, the output belt), and
   *  through the browser dialog scrubber (its plain pass, its spelled pass, its spelled pass through a view). → tagged leaks */
  const overlapLeg = (Vm, n = 60) => {
    const rnd = seeded(31337), pick = (k) => Math.floor(rnd() * k), tok = (k) => Array.from({ length: k }, () => B62[pick(62)]).join('');
    const bad = []; let clear = 0;
    for (let i = 0; i < n; i++) {
      const k = 4 + pick(6), a = 'acct-' + tok(10 + pick(10)), b = a.slice(-k) + tok(14 + pick(12));
      const secrets = [{ label: 'a', value: a }, { label: 'b', value: b }], text = 'x ' + a + b.slice(k) + ' y';
      const viaView = 'x ' + a + b.slice(k, k + 2) + '\x1b[1m' + b.slice(k + 2) + ' y';   // B whole only through the colour-code view
      const sc = Vm.compileTextScrubber(secrets);
      for (const [road, o] of [['run', Vm.maskText(text, secrets)], ['dialog', sc(text)], ['spelled', sc.spelled(text)], ['spelled-view', sc.spelled(viaView)]]) {
        const c = clearRun(o, b);
        if (c >= 8) { bad.push(`${road}: pair ${i}: ${c} of B's ${b.length} characters in the clear`); clear += c; }
      }
      // the scrubber's second read: B starts inside A's OWN overlap (A a run of one character), and two values under ONE label (a web login's passwords)
      const za = String(pick(10)).repeat(8), zb = za.slice(0, 6) + tok(14 + pick(8)), zt = 'x ' + za + za.slice(0, 4) + zb.slice(6) + ' y';
      const zs = [{ label: 'a', value: za }, { label: 'b', value: zb }], zsc = Vm.compileTextScrubber(zs);
      for (const [road, o] of [['self-run', Vm.maskText(zt, zs)], ['self-dialog', zsc(zt)]]) { const c = clearRun(o, zb); if (c >= 8) { bad.push(`${road}: pair ${i}: ${c} of B's ${zb.length} characters in the clear`); clear += c; } }
      const same = [{ label: 'login', value: a }, { label: 'login', value: b }], co = clearRun(Vm.maskText(text, same), b);
      if (co >= 8) { bad.push(`same-label: pair ${i}: ${co} of B's ${b.length} characters in the clear`); clear += co; }
    }
    return { pairs: n, bad, clear };
  };
  /** THE FIXPOINT'S SECOND PASS (the scrubber's read): a CHAIN — C's end overlaps B's head, B's end overlaps A's head — and the run
   *  cut inside A (A ends with its own first character, so the tail starts at A's last one). A pulls the tail to its start, B then
   *  straddles it, and C straddles B's: each later pass masks one more (a view's repeated finds can make a pass do two, never three).
   *  → the chains with ≥ 8 characters of B or C in the clear */
  const chainLeg = (Vm, n = 40) => {
    const rnd = seeded(8086), tok = (k) => Array.from({ length: k }, () => B62[Math.floor(rnd() * 62)]).join('');
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = 'q' + tok(24) + 'q', b = 'pre-' + tok(12) + a.slice(0, 6), c = 'cc-' + tok(12) + b.slice(0, 6);
      const text = c.slice(0, c.length - 6) + b.slice(0, b.length - 6) + a;   // no line end: the tail starts at A's last character
      const m = Vm.createRunMasker(Vm.compileForms([{ label: 'a', value: a }, { label: 'b', value: b }, { label: 'c', value: c }]), ['out']);
      const o = m.push('out', text).out + m.end(true).out, cl = Math.max(clearRun(o, b), clearRun(o, c));
      if (cl >= 8) out.push(`chain ${i}: ${cl} characters of B or C in the clear`);
    }
    return out;
  };
  /** THE SAME VALUE OVERLAPPING ITSELF (read 7): a value of one repeated character printed as a long run (`xxd -p` of a zeroed file) —
   *  asked again inside its own match, its finds would chain into one placeholder. → the whole output and its placeholders (the
   *  release tiles it: one placeholder a tile), the characters not yet handed on when the end came (the masked characters counted
   *  before end(): every character is the value's), and the characters scanned, for 4 KiB in 512-character pushes */
  const selfLeg = (Vm) => {
    const v = '0'.repeat(8), m = Vm.createRunMasker(Vm.compileForms([{ label: 'zeros', value: v }]), ['out']), text = '0'.repeat(4096);
    let out = '';
    for (let at = 0; at < text.length; at += 512) out += m.push('out', text.slice(at, at + 512)).out;
    const held = text.length - m.bytes;
    out += m.end().out;
    return { out, hits: m.hits, held, W: m.window, scanned: m.scanned, size: text.length, clear: clearRun(out, v) };
  };
  /** TWO VALUES THAT TILE ONE REPEATING TEXT (the third and fourth reads): B = A rotated by half, the output A back to back — asked
   *  inside every match their finds chain over the whole output, and the release's model keeps a straddling chain back. Three runs in
   *  512-character pushes: A × 60 on one pipe; A × 30, a line end, A × 60 (the plain read restarts after it, the line-joining view does
   *  not); A × 38 on stdout, one stderr line, A × 60 more (the arrival order restarts after it). → for each, the most characters NOT
   *  yet handed on after any push (the text so far less the masked characters counted and less its clean characters handed on —
   *  overlapping finds are one placeholder, so the output's LENGTH says nothing of it), against W; and the most characters of either
   *  value in the clear. Then five whole texts through maskText, where a long group ENDS: A × 13, A × 38, A × 12 then a third value
   *  C = A's first half + 20 other characters, A × 15 with a third value of 45 characters stored (its W puts the grid out of the
   *  pair's phase: read 5), and A × 13 then 200 clean characters (the break's own find — A at 480 — is the last occurrence, handed on
   *  before the end) → the most characters of a value in the clear. SAID, NOT CURED (read 5): A × 90 wrapped in lines of 239
   *  characters (under 2 × (W + 1): the plain read never breaks and sees no occurrence across a line end, so its finds bridge the
   *  view's breaks) → the characters not yet handed on when the end came, printed, never asserted */
  const rotLeg = (Vm) => {
    const rnd = seeded(6174), tok = (k) => Array.from({ length: k }, () => B62[Math.floor(rnd() * 62)]).join(''), a = tok(40), b = a.slice(20) + a.slice(0, 20), c = a.slice(0, 20) + tok(20);
    const two = [{ label: 'a', value: a }, { label: 'b', value: b }], forms = Vm.compileForms(two), W = Vm.createRunMasker(forms, ['out']).window;
    const run = (parts) => {
      const m = Vm.createRunMasker(forms, ['out', 'err']);
      let out = '', size = 0, most = 0, held = 0;
      const heldNow = () => size - m.bytes - (out.match(/\n|warning: x/g) || []).reduce((n, x) => n + x.length, 0);
      for (const [k, x] of parts) for (let at = 0; at < x.length; at += 512) { const piece = x.slice(at, at + 512), o = m.push(k, piece); size += piece.length; out += o.out + o.err; held = heldNow(); most = Math.max(most, held); }
      const e = m.end(); out += e.out + e.err;
      return { size, most, held, clear: Math.max(clearRun(out, a), clearRun(out, b)) };
    };
    const runs = { plain: run([['out', a.repeat(60)]]), line: run([['out', a.repeat(30) + '\n' + a.repeat(60)]]), stderr: run([['out', a.repeat(38)], ['err', 'warning: x\n'], ['out', a.repeat(60)]]) };
    const wrapped = run([['out', a.repeat(90).match(/[^]{1,239}/g).join('\n')]]);   // SAID, NOT CURED (read 5): printed, never asserted
    const whole = (t, vals) => { const o = Vm.maskText(t, vals); return Math.max(...vals.map((x) => clearRun(o, x.value))); };
    const texts = { a13: whole(a.repeat(13), two), a38: whole(a.repeat(38), two), third: whole(a.repeat(12) + c + '\n', [...two, { label: 'c', value: c }]), phase: whole(a.repeat(15), [...two, { label: 'd', value: tok(45) }]), mid: whole(a.repeat(13) + '.'.repeat(200), two) };
    return { W, runs, wrapped, texts, most: Math.max(...Object.values(runs).map((r) => r.most)), clear: Math.max(...Object.values(runs).map((r) => r.clear), ...Object.values(texts)) };
  };
  /** A BINARY OUTPUT CUT AT THE BOUND (read 4): its decoded tail ends in U+FFFD (a character the byte bound broke) and no value is in
   *  it — 50 tails «bin: <20 characters>» + one character + one to three U+FFFD, cut there: the one character a space, or a form's
   *  first character (NUL — a UTF-16 BE form's —, `%`, the hex form's, the base64 form's, an ASCII value's own: a head whose NEXT character
   *  is ASCII, so the broken character was not the value's; read 5); stored, never printed: an ASCII value, then a CJK value whose
   *  UTF-16 form read as UTF-8 begins with U+FFFD. → the hits counted (each a placeholder where no value was) */
  const binLeg = (Vm, n = 50) => {
    const rnd = seeded(4099), tok = (k) => Array.from({ length: k }, () => B62[Math.floor(rnd() * 62)]).join('');
    const one = (value) => {
      const heads = [' ', '\u0000', '%', Buffer.from(value).toString('hex')[0], Buffer.from(value).toString('base64')[0], ...(value.charCodeAt(0) < 0x80 ? [value[0]] : [])];   // a CJK value's own first character before a broken one IS a head: its next character is not ASCII
      let hits = 0;
      for (let i = 0; i < n; i++) { const m = Vm.createRunMasker(Vm.compileForms([{ label: 'v', value }]), ['out']); m.push('out', 'bin: ' + tok(20) + heads[i % heads.length] + '\uFFFD'.repeat(1 + (i % 3))); m.end(true); hits += m.hits; }
      return hits;
    };
    return { ascii: one(tok(24)), cjk: one('\u5bc6\u7801\u662f\u4fdd\u7ba1\u7bb1\u7684\u94a5\u5319') };
  };
  /** THE DIALOG SCRUBBER'S PARITY with the run's (the scrubber's second read): a value of one repeated digit, a run of it — the dialog
   *  scrubber and maskText give the same text. → the texts that differ */
  const parityLeg = (Vm, n = 20) => {
    const rnd = seeded(2718), out = [];
    for (let i = 0; i < n; i++) {
      const v = String(Math.floor(rnd() * 10)).repeat(8), text = 'pin ' + v[0].repeat(8 + Math.floor(rnd() * 80)) + ' end', s = [{ label: 'pin', value: v }];
      const a = Vm.maskText(text, s), b = Vm.compileTextScrubber(s)(text);
      if (a !== b) out.push(`run ${i}: the dialog «${b.slice(0, 60)}» vs the run «${a.slice(0, 60)}»`);
    }
    return out;
  };
  /** THE RELEASE'S FUNCTION, rebuilt from this file by putting its own lines back (each anchored: a moved line fails BY NAME) */
  const releaseCopy = () => {
    const dir = scratchDir('scrublegs-release');   // r1670: never the run door's folder shape (vs-vault-run-…, src/temp-sweepers.js)
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    for (const f of ['vault-inventory.js', 'vault-kinds.js', 'vault-blocked.js', 'foryou-actions.js', 'vault-scrubber.js', 'vault-file.js', 'ssh-key-format.js']) fs.copyFileSync(path.join(REPO, 'src', f), path.join(dir, 'src', f));
    let t = fs.readFileSync(SRC, 'utf8');
    const back = (from, to, name) => { t = anchored(t, from, to, `⑦g the release's ${name}`); };
    t = anchored(t, /\n[^\n]*\/\/ THE SCRUBBER'S OVERLAP[^\n]*/, '', "⑦g the release's run scan", { count: 7 });
    t = anchored(t, /\n[^\n]*\/\/ THE SCAN'S BUDGET[^\n]*/, '', "⑦h the release's turns", { count: 30 });   // the budget's own lines (主开发 r1068): its counts, figures, spend, turn, fail-closed, each loop's count, the mark in push, the getters, the settle's mark (round wi8mtvm6c)
    back('    if (!final) settleCuts(groups.map((g) => g.r), cut, spend);   // THE ONE SWEEP (主开发 r1068): never cut inside a group — one not wholly before the cuts is kept back whole; the cuts settled in one sweep (was a fixpoint that walked a chain of groups back one a pass)\n', '    if (!final) for (let moved = true; moved;) {   // never cut inside a group: one not wholly before the cuts is kept back whole\n      moved = false;\n      for (const g of groups) {\n        if (g.r.every(([k, , b]) => b <= cut.get(k))) continue;\n        for (const [k, a] of g.r) if (a < cut.get(k)) { cut.set(k, a); moved = true; }\n      }\n    }\n', "step's fixpoint");   // stale-pins: kept (the release's own fixpoint)   // its seven marked lines: each value's last find, the group, the grid, the find's place, the group's break, the same-value skip, the re-ask
    back('function maskText(text, secrets) { const m = createMasker(secrets), t = String(text == null ? \'\' : text); let out = \'\'; for (let i = 0; i < t.length; i += 65536) out += m.push(t.slice(i, i + 65536)); return out + m.end(); }   // in 64 KiB pieces (the budget\'s read, F9: a whole text of megabytes in ONE turn met the turn\'s figure — the output belt\'s text became the withheld words)\n', 'function maskText(text, secrets) { const m = createMasker(secrets); return m.push(text) + m.end(); }\n', 'maskText');   // stale-pins: kept (the release\'s own maskText, one push)
    back('  function scan(buf, final, at) {\n', '  function scan(buf, final) {\n', "scan's head");   // stale-pins: kept (the release's own head)
    back('      const sc = scan(all, final, idxAt);\n', '      const sc = scan(all, final);\n', 'arrival scan');   // stale-pins: kept (the release's own call)
    t = anchored(t, /\n[^\n]*\/\/ THE TEXT BUDGET[^\n]*/, '', "the release's text scrubber (its budget's own lines, 主开发 r1915)", { count: 26 });   // the heads, the spend, each loop's count, the counted wrapper, the overs getter
    back('  const scrubOnce = (raw) => {\n', '  const scrub = (raw) => {\n', 'text scrubber head');   // stale-pins: kept (the release's own head, put back)
    back('  const spelledOnce = (raw) => {\n', '  scrub.spelled = (raw) => {\n', 'spelled pass head');   // stale-pins: kept (the release's own head, put back)
    t = anchored(t, /\n[^\n]*\/\/ the dialog scrubber's overlap[^\n]*/, '', "⑦g the release's dialog scrubber", { count: 3 });
    t = anchored(t, /\n[^\n]*\/\/ its spelled pass(?: \(r858\)|:)[^\n]*/, '', "⑦g the release's spelled pass", { count: 3 });
    t = anchored(t, /\n[^\n]*\/\/ its spelled pass through a view(?: \(r858\)|:)[^\n]*/, '', "⑦g the release's spelled view pass", { count: 3 });
    back('      const { all, streamAt, idxAt, rangesOf } = arrivalOf(held);\n',
      "      const all = held.map((x) => x[1]).join(''), streamAt = [], idxAt = [], seen = new Map();\n      for (const [k, x] of held) for (let j = 0; j < x.length; j++) { const i = seen.get(k) || 0; streamAt.push(k); idxAt.push(i); seen.set(k, i + 1); }\n      const rangesOf = (a, b) => { const m = new Map(); for (let i = a; i < b; i++) { const k = streamAt[i], x = m.get(k); if (x) x[2] = idxAt[i] + 1; else m.set(k, [k, idxAt[i], idxAt[i] + 1]); } return [...m.values()]; };\n", 'arrival order in step');   // stale-pins: kept (the release's own lines, put back to rebuild its function)
    const a = t.indexOf("    const start = new Map(); for (const [k, x] of own) start.set(k, cutTailStart(x));"), z = t.indexOf("    for (const [k, x] of own) { const s = start.get(k); if (s < x.length) {");
    if (a < 0 || z < a) throw new Error('ANCHOR GONE «⑦g the release\'s endStep» — the cut\'s new body is not where the copy expects it');
    t = t.slice(0, a) + "    const keepFrom = new Map(); for (const [k, x] of own) keepFrom.set(k, cutTailStart(x));\n    held = [];\n    for (const [k, x] of own) { const sIdx = keepFrom.get(k); if (sIdx > 0) held.push([k, x.slice(0, sIdx)]); }\n    const out = step(true);\n" + t.slice(z);   // stale-pins: kept (the release's own lines, put back to rebuild its function)
    if (t.includes('const start = new Map(); for (const [k, x] of own) start.set(k, cutTailStart(x));')) throw new Error('⑦g the release\'s endStep: the copy still holds the new tails');
    t = anchored(t, "    for (const [k, x] of own) { const s = start.get(k); if (s < x.length) { out[k] = (out[k] || '') + CUT_PH; st.hits++; st.bytes += bytesOf(x.slice(s)); } }", "    for (const [k, x] of own) { const sIdx = keepFrom.get(k); if (sIdx < x.length) { out[k] = (out[k] || '') + CUT_PH; st.hits++; st.bytes += bytesOf(x.slice(sIdx)); } }", "⑦g the release's cut placeholder line");   // stale-pins: kept (the release's own line, put back)
    // the settle's road added cutTailStart's `opt` (round wtlm3ig4w); the release's function takes none and is put in whole
    const ctA = t.indexOf('  function cutTailStart(buf, opt = null) {'), ctZ = t.indexOf("  // THE CUT'S TWO FAULTS (lane lg-vault-file, r858");
    if (ctA < 0 || ctZ < ctA) throw new Error('ANCHOR GONE «⑦g the release\'s cutTailStart» — the function is not where the copy expects it');
    t = t.slice(0, ctA) + RELEASE_CUT_TAIL_START + t.slice(ctZ);
    const f = path.join(dir, 'src', `${path.basename(SRC, '.js')}-release.js`);
    fs.writeFileSync(f, t);
    return require(f);
  };
  /** A RUN WITH NO CUT changes nothing: seeded values (each its own head, so none starts inside another's match — scene 3 changes on
   *  purpose) printed every way among noise, cut into seeded chunks on both pipes, end() — the release's function and this one,
   *  output byte for byte, hits and bytes. → { seed, trials, differ } */
  const diffLeg = (Vr, Vm, seed = 20261121, trials = 300) => {
    const rnd = seeded(seed), pick = (k) => Math.floor(rnd() * k), tok = (k) => Array.from({ length: k }, () => B62[pick(62)]).join('');
    const printings = [(v) => v, (v) => Buffer.from(v).toString('base64'), (v) => Buffer.from(v).toString('hex'), (v) => encodeURIComponent(v + '/+'), (v) => JSON.stringify({ token: v }), (v) => '\x1b[1m' + v + '\x1b[0m', (v) => v.slice(0, 5) + '\\x' + v.charCodeAt(5).toString(16) + v.slice(6)];
    const differ = [];
    for (let i = 0; i < trials; i++) {
      const SPEC = '/+=&<"\\% ';   // characters every encoding spells its own way (base64 / percent / JSON / entity / escape)
      const vals = Array.from({ length: 1 + pick(3) }, (_, j) => (i % 10 === 9 && j === 0 ? String(pick(10)).repeat(8 + pick(8)) : `k${i}${'ABC'[j]}_` + Array.from({ length: 20 + pick(30) }, () => (pick(5) ? B62[pick(62)] : SPEC[pick(SPEC.length)])).join('')));   // every tenth run: a value of one repeated digit (it overlaps itself), printed as a run
      const secrets = vals.map((v, j) => ({ label: `v${j}`, value: v }));
      let text = '';
      for (let p = 0; p < 4 + pick(8); p++) text += pick(3) ? `line ${p}: ${tok(pick(40))}\n` : printings[pick(printings.length)](vals[pick(vals.length)]) + (pick(2) ? '\n' : ' ');
      if (i % 10 === 9) text += vals[0][0].repeat(40 + pick(160)) + '\n';   // the self-overlapping value as a long run
      const chunks = []; for (let at = 0; at < text.length;) { const n = 1 + pick(40); chunks.push([pick(3) ? 'out' : 'err', text.slice(at, at + n)]); at += n; }
      const run = (M) => { const m = M.createRunMasker(M.compileForms(secrets), ['out', 'err']), acc = { out: '', err: '' }; for (const [k, c] of chunks) { const o = m.push(k, c); acc.out += o.out; acc.err += o.err; } const o = m.end(); acc.out += o.out; acc.err += o.err; return { ...acc, hits: m.hits, bytes: m.bytes, byForm: JSON.stringify(Object.entries(m.byForm).sort()) }; };
      const a = run(Vr), b = run(Vm);
      if (a.out !== b.out || a.err !== b.err || a.hits !== b.hits || a.bytes !== b.bytes || a.byForm !== b.byForm) differ.push({ i, release: a, now: b });
    }
    return { seed, trials, differ };
  };
  /** THE COST on a 2 MiB output (the scrubber runs on the hub, in the run's own pushes): the characters every scan read and the
   *  exec calls of every regex it runs (the release's alternation; this one's heads), the release's function and this one — a log with the value 6 times in it, and the value printed back to back;
   *  64 KiB pushes, then the cut (the 2 MiB bound) */
  const costLeg = (Vr, Vm) => {
    const rnd = seeded(5150), tok = (k) => Array.from({ length: k }, () => B62[Math.floor(rnd() * 62)]).join('');
    const v = 'tk_' + tok(37);
    const line = (i) => `${String(i).padStart(7, '0')} GET /api/items?page=${i} 200 ${tok(24)}\n`;
    let logText = ''; for (let i = 0; logText.length < 2 * 1024 * 1024; i++) logText += i % 6000 === 0 ? `token=${v}\n` : line(i);
    const packed = v.repeat(Math.ceil(2 * 1024 * 1024 / v.length)), soft = 'token=' + v + '\n' + '=\n'.repeat(128 * 1024);
    const one = (M, text, two = false) => {
      let execs = 0;
      class CountRe extends RegExp { exec(s) { execs++; return super.exec(s); } }
      const C = M.compileForms([{ label: 'cost', value: v }]), counted = (x) => x && new CountRe(x.source, x.flags), Cc = { ...C, re: counted(C.re), hre: counted(C.hre) };   // 主开发 r1216: every regex a scan may run — the release's one and the heads' (the line before counted only the release's: the scan had stopped running it; the cut's search runs none)
      const m = M.createRunMasker(Cc, ['out', 'err']);
      let out = '';
      if (two) out += m.push('err', 'warning: a short line first\n').err;
      for (let at = 0; at < text.length; at += 65536) out += m.push('out', text.slice(at, at + 65536)).out;
      const e = m.end(true); out += e.out + e.err;
      return { scanned: m.scanned, execs, outBytes: bytes(out), clear: clearRun(out, v), window: m.window, over: !!m.over, maxSteps: m.maxSteps, runSteps: m.runSteps };
    };
    return { log: { release: one(Vr, logText), now: one(Vm, logText) }, packed: { release: one(Vr, packed), now: one(Vm, packed) }, soft: { release: one(Vr, soft), now: one(Vm, soft) }, soft2: { release: one(Vr, soft, true), now: one(Vm, soft, true) }, size: [bytes(logText), bytes(packed), bytes(soft)] };
  };
  let releaseOnce = null;
  const release = () => releaseOnce || (releaseOnce = releaseCopy());   // ONE copy of the release's function for the legs and the controls
  /** THE ONE SWEEP (主开发 r1068) against THE FIXPOINT it replaced (the release's loop, read here as it stood): seeded sets of groups
   *  — one or two streams, each group a range on one stream or on both, overlapping into chains — and seeded cuts. → the sets whose
   *  settled cuts differ (the answer must be the same: the greatest cuts under the given ones that split no group) */
  const fixpointOf = (lists, cut) => { for (let moved = true; moved;) { moved = false; for (const rs of lists) { if (!rs.some(([k, , b]) => b > cut.get(k))) continue; for (const [k, a] of rs) if (a < cut.get(k)) { cut.set(k, a); moved = true; } } } return cut; };
  const sweepLeg = (Vm, n = 2000) => {
    const rnd = seeded(1068), pick = (k) => Math.floor(rnd() * k), differ = [];
    for (let i = 0; i < n; i++) {
      const L = 20 + pick(400), streams = pick(2) ? ['out'] : ['out', 'err'], lists = [];
      for (let g = 0, G = 1 + pick(80); g < G; g++) {
        const rs = [];
        const on = streams.length === 1 ? streams : [['out'], ['err'], ['out', 'err']][pick(3)];   // the read's F7: a group on stderr alone too
        for (const k of on) { const a = pick(L), b = Math.min(L, a + 1 + pick(40)); rs.push([k, a, b]); }
        lists.push(rs);
      }
      const c0 = new Map(streams.map((k) => [k, pick(L + 1)]));
      const want = fixpointOf(lists, new Map(c0)), got = Vm.settleCuts(lists, new Map(c0));
      if (streams.some((k) => want.get(k) !== got.get(k))) differ.push(`set ${i}: the fixpoint ${streams.map((k) => want.get(k)).join('/')}, the sweep ${streams.map((k) => got.get(k)).join('/')}`);
    }
    return differ;
  };
  /** THE BUDGET'S OWN LEG (主开发 r1068): a planted input past it — a value printed into a run of soft breaks, which a view reads as
   *  nothing (so the whole text is held), the figures planted small: a turn's, then the run's. → for each: did it fail closed, at
   *  which push, the words by name, the held text under the cut's placeholder, the most characters of the value in a row in the
   *  output, what came after the mark (nothing may), what was withheld */
  const budgetLeg = (Vm) => {
    const rnd = seeded(1069), v = Array.from({ length: 24 }, () => B62[Math.floor(rnd() * 62)]).join('');
    const one = (steps) => {
      const m = Vm.createRunMasker(Vm.compileForms([{ label: 'b', value: v }]), ['out', 'err'], { steps });
      const chunks = ['start ' + '=\n'.repeat(200), 'TOKEN=' + v.slice(0, 12), v.slice(12) + '=\n'.repeat(200), ...Array.from({ length: 40 }, () => '=\n'.repeat(200))];
      let all = '', after = '', at = -1;
      chunks.forEach((c, i) => { const o = m.push('out', c), s = o.out + o.err; if (at >= 0) after += s; else if (m.over) at = i; all += s; });
      const e = m.end(true); after += e.out + e.err; all += e.out + e.err;
      return { over: m.over, at, said: all.includes('scrub_work_bound'), masked: all.includes('[vault:\u2026]'), clear: clearRun(all, v), after: after.length, withheld: m.withheld };
    };
    return { turn: one({ push: 20000, run: 2 ** 40 }), run: one({ push: 2 ** 40, run: 60000, aChar: 64 }) };   // the run's own planted a character (r1216: the shipped one is 1 024)
  };
  /** THE LONGEST TURN (主开发 r1068): two values that tile one repeating text wrapped in lines of 239 characters, and a value of one
   *  repeated character in a hex dump of zeros (60 a line) — the holds the release's model makes — `size` characters in `push`-
   *  character pushes (the fast tier: 16 KiB in 4 KiB pushes; the deep twin: the 2 MiB of the bound in the door's 64 KiB reads).
   *  `cut`: the run ends at a cut (end(true): the cut reads the held text through every view again). → the longest turn's counted
   *  steps against what a turn reads (the most text held + a push), the words if it failed closed, the most of a value in the clear, the run's, and whether it failed closed */
  const turnLeg = (Vm, size = 16384, push = 4096, cut = false) => {
    const rnd = seeded(1070), a = Array.from({ length: 40 }, () => B62[Math.floor(rnd() * 62)]).join(''), b = a.slice(20) + a.slice(0, 20);
    const wrap = (s, w) => s.match(new RegExp(`[^]{1,${w}}`, 'g')).join('\n');
    const one = (secrets, text) => {
      const m = Vm.createRunMasker(Vm.compileForms(secrets), ['out']);
      let most = 0, size2 = 0, out = '';
      for (let i = 0; i < text.length; i += push) { const piece = text.slice(i, i + push); size2 += piece.length; out += m.push('out', piece).out; most = Math.max(most, size2 - m.bytes - (out.match(/\n/g) || []).length); }
      const e = m.end(cut); out += e.out + e.err;
      const clear = Math.max(...secrets.map((s) => clearRun(out, s.value)));
      return { maxSteps: m.maxSteps, runSteps: m.runSteps, most, push, W: m.window, charge: m.charge, over: m.over, said: out.includes('scrub_work_bound'), clear, size: text.length };
    };
    return { rot: one([{ label: 'a', value: a }, { label: 'b', value: b }], wrap(a.repeat(Math.ceil(size / 40)).slice(0, size), 239)), zeros: one([{ label: 'z', value: '00000000' }], wrap('0'.repeat(size), 60)) };
  };
  /** THE COMPARES A CHARACTER CAN COST (the budget's read, F1): a stored value of 2 047 «A» and a «B». 32 KiB of «A» drives the regex
   *  2 047 compares deep at every position (the turn meets its figure before the regex runs); an ordinary log beside the same value
   *  does not (no false fail-closed). → for each: did it fail closed, the longest turn's steps */
  const periodLeg = (Vm, only = null) => {   // `only`: the cases a control needs (each case costs)
    const one = (v, t, steps) => { const C = Vm.compileForms([{ label: 'p', value: v }]), m = Vm.createRunMasker(C, ['out'], steps ? { steps } : {}); for (let i = 0; i < t.length; i += 8192) m.push('out', t.slice(i, i + 8192)); m.end(); return { over: !!m.over, maxSteps: m.maxSteps, longest: Math.max(...(C.keys || C.texts).map((k) => k.length)) }; };
    const log = '2026-11-21 INFO a line of an ordinary log\n'.repeat(400);
    const cases = {
      tail: () => one('A'.repeat(2047) + 'B', 'A'.repeat(8192)),   // the first read's: a long form whose head a run of «A» follows — verified, counted
      thrice: () => one(('A'.repeat(2047) + 'B').repeat(3) + 'A'.repeat(2047), 'A'.repeat(8192)),   // the second read's (b): its head followed, its compares counted in the verify
      inner: () => one('AAAA' + 'B' + 'A'.repeat(8187), 'A'.repeat(8192)),   // the second read's (a): a long run INSIDE the form — the regex holds only its head, which the run never follows
      beside: () => one(('A'.repeat(2047) + 'B').repeat(3) + 'A'.repeat(2047), log),   // the same value beside an ordinary log: no false fail-closed
      short: () => one('A'.repeat(64), 'A'.repeat(32768), { push: 1 << 19, run: 1 << 40 }),   // a short repeating head (64 «A»): charged as deep as the regex compares it (64 a character) — a planted turn's figure of 2^19
    };
    return Object.fromEntries(Object.entries(cases).filter(([k]) => !only || only.includes(k)).map(([k, f]) => [k, f()]));
  };
  /** THE CUT'S PREFIX SEARCH, COUNTED (主开发 r1216, the follow's item 1): a long form of one repeated character (1 600 «A» + «B»), a
   *  log line, then a run of 2 000 «A» cut before its end in another character — every suffix the search tries follows the form
   *  thousands deep, then misses. → the steps the cut's own search counted (the masker's `cutSteps`: the end turn's scans resolve
   *  the same heads and would hide it — the follow's read), and the compares the search makes past the heads there (each suffix's
   *  common prefix with the form beyond its first SCRUB_HEAD characters, the plain read's alone: a floor of the count) */
  const HUGE = { push: 2 ** 40, run: 2 ** 50 };
  const cutCountLeg = (Vm) => {
    const v = 'A'.repeat(1600) + 'B', text = 'build: ok\n' + 'A'.repeat(2000) + 'C';
    const C = Vm.compileForms([{ label: 'c', value: v }]), m = Vm.createRunMasker(C, ['out', 'err'], { steps: HUGE });
    for (let i = 0; i < text.length; i += 1024) m.push('out', text.slice(i, i + 1024));
    const e = m.end(true);
    let past = 0;
    for (let q = Math.max(0, text.length - C.W); q < text.length; q++) {
      const len = text.length - q;
      if (v.length <= len) continue;
      let j = 0; while (j < len && v.charCodeAt(j) === text.charCodeAt(q + j)) j++;
      past += Math.max(0, j - 64);
    }
    return { cutSteps: m.cutSteps, endSteps: m.steps, past, over: !!m.over, clean: e.out === text && e.err === '' };
  };
  /** THE BOUND MET INSIDE THE CUT'S END (主开发 r1216, the follow's item 4): 8 KiB of log lines in 4 KiB reads (handed on, each turn
   *  well under the figure), then the costly tail of cutCountLeg held at the cut — a turn's figure of 2^20 planted between them:
   *  the end fails closed INSIDE its prefix search. → what the end gave against the cut's placeholder and the words, what the pushes
   *  handed on against a run with no figure, the mark before and after the end */
  const cutEndLeg = (Vm) => {
    const v = 'A'.repeat(1600) + 'B';
    let log = ''; for (let i = 0; log.length < 8192; i++) log += `${String(i).padStart(6, '0')} compiling module_${i % 97} ... ok\n`;
    const text = log + 'A'.repeat(2000) + 'C';
    const one = (steps) => {
      const m = Vm.createRunMasker(Vm.compileForms([{ label: 'c', value: v }]), ['out', 'err'], { steps });
      let pushed = '';
      for (let i = 0; i < text.length; i += 4096) { const o = m.push('out', text.slice(i, i + 4096)); pushed += o.out + o.err; }
      const before = !!m.over, most = m.maxSteps;
      let e = null, threw = null;
      try { e = m.end(true); } catch (x) { threw = String((x && x.description) || x); }
      return { pushed, before, most, e, threw, over: !!m.over, hits: m.hits };
    };
    const free = one(HUGE), met = one({ push: 2 ** 20, run: 2 ** 50 });
    const WORDS = '\n[vault: this stretch of the output is withheld — scrubbing it passed its work bound (scrub_work_bound)]\n';
    return { pushesUnder: free.most < 2 ** 20, endOver: free.over, samePushes: met.pushed === free.pushed, before: met.before, threw: met.threw, over: met.over, endOut: met.e ? met.e.out : null, endErr: met.e ? met.e.err : null, ok: !!met.e && met.e.out === '[vault:…]' && met.e.err === WORDS };
  };
  /** THE HEADS MISS NOTHING THE RELEASE FOUND (主开发 r1216, the follow's item 4): the shapes where a regex of heads could — two forms
   *  over 64 characters sharing their head; a form of 64 characters that IS a longer form's head (each printed alone, and the short
   *  one followed by another tail); a long form whose push edge falls at its 63rd, 64th or 65th character — among seeded noise on
   *  both pipes, no cut: the release's function and this one, output byte for byte, hits and bytes. → { trials, differ } */
  const headShapesLeg = (Vr, Vm, seed = 1216, trials = 60) => {
    const rnd = seeded(seed), pick = (k) => Math.floor(rnd() * k), tok = (k) => Array.from({ length: k }, () => B62[pick(62)]).join('');
    const differ = [];
    for (let i = 0; i < trials; i++) {
      const shape = i % 3, P = tok(66), X = tok(64);
      const vals = shape === 0 ? [P + tok(10 + pick(20)), P + tok(30 + pick(20))] : shape === 1 ? [X, X + tok(20 + pick(30))] : [tok(90 + pick(60))];
      const secrets = vals.map((v, j) => ({ label: `h${j}`, value: v }));
      const spell = [(v) => v, (v) => Buffer.from(v).toString('hex'), (v) => Buffer.from(v).toString('base64'), (v) => JSON.stringify({ k: v })];
      const said = shape === 1 ? [vals[1], vals[0] + '~' + tok(8), vals[0]] : vals, W = Vm.compileForms(secrets).W;
      const chunks = [];
      for (const v of said) {
        const f = spell[pick(spell.length)](v), at = (shape === 2 ? 63 + (Math.floor(i / 3) % 3) : 1 + pick(f.length - 1)) + (f.startsWith('{') ? 6 : 0);   // the follow's read: by i % 3 alone the edge was always the 65th
        const lead = `line ${i}: ${tok(W + 1 + pick(30))} `;   // past the window: the push that ends at the edge is a turn of its own (a shorter one waits)
        chunks.push([pick(4) ? 'out' : 'err', `noise ${tok(pick(20))}\n`], ['out', lead + f.slice(0, at)], ['out', f.slice(at) + '\n']);
      }
      const run = (M) => { const m = M.createRunMasker(M.compileForms(secrets), ['out', 'err']), acc = { out: '', err: '' }; for (const [k, c] of chunks) { const o = m.push(k, c); acc.out += o.out; acc.err += o.err; } const o = m.end(); acc.out += o.out; acc.err += o.err; return { ...acc, hits: m.hits, bytes: m.bytes }; };
      const a = run(Vr), b = run(Vm);
      if (a.out !== b.out || a.err !== b.err || a.hits !== b.hits || a.bytes !== b.bytes) differ.push({ i, shape, release: { hits: a.hits, bytes: a.bytes }, now: { hits: b.hits, bytes: b.bytes } });
    }
    return { trials, differ };
  };
  /** THE PLAIN WALK (the line before's prefix search, its own two lines: every suffix against every FULL form) in a copy of this
   *  file — the oracle of walkLeg. `from`/`to`: a patch on the SHIPPED search first (a red control's copy), or none. */
  const WALK = "    const isPrefix = (sfx, broken) => { if (!sfx) return false; for (const t of texts) if (t.length > sfx.length && t.startsWith(sfx) && (!broken || t.charCodeAt(sfx.length) >= 0x80)) return true; return false; };\n    const prefixStart = (str, n = str.length, broken = false) => { let f = n; while (f > 0 && str.charCodeAt(f - 1) === 0xFFFD) f--; const q0 = Math.max(0, n - W); for (let q = q0; q < Math.min(n, f); q++) if (isPrefix(str.slice(q, n), broken)) return q; return n; };\n";
  const copyOf = (name, edit) => {
    const dir = scratchDir('scrublegs-' + name);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    for (const f of ['vault-inventory.js', 'vault-kinds.js', 'vault-blocked.js', 'foryou-actions.js', 'vault-scrubber.js', 'vault-file.js', 'ssh-key-format.js']) fs.copyFileSync(path.join(REPO, 'src', f), path.join(dir, 'src', f));
    const f = path.join(dir, 'src', `${path.basename(SRC, '.js')}-${name}.js`);
    fs.writeFileSync(f, edit(fs.readFileSync(SRC, 'utf8')));
    return require(f);
  };
  const walkCopy = () => copyOf('walk', (t) => {
    const a = t.indexOf('    const lowerBound = (s) => {'), z = t.indexOf("    // THE ENDS a half value may run off (r858");
    if (a < 0 || z < a) throw new Error('ANCHOR GONE «the plain walk» — the counted search is not where the copy expects it');
    return t.slice(0, a) + WALK + t.slice(z);
  });
  const patchedCopy = (name, from, to) => copyOf(name, (t) => anchored(t, from, to, `the cut's search «${name}»`));
  /** THE COUNTED SEARCH FINDS WHAT THE WALK FOUND (主开发 r1216, the follow's item 1 — no new miss at the cut): seeded runs CUT at
   *  their end — 1 to 3 values (random, CJK, two long forms sharing a head, a 64-character form that is a longer one's head, a long
   *  run of one character), a log, then one value's spelling cut short (raw / hex / base64 / JSON / percent), at times a broken
   *  character or an unfinished view token after it — the walk's copy and this one, figures planted out of reach: output byte for
   *  byte, hits and bytes. → { trials, differ } */
  const walkLeg = (Vw, Vm, seed = 12161, trials = 400) => {
    const rnd = seeded(seed), pick = (k) => Math.floor(rnd() * k), tok = (k) => Array.from({ length: k }, () => B62[pick(62)]).join('');
    const CJK = '密码钥匙令牌证书服务器部署生产环境数据库账号用户口令安全';
    const spell = [(v) => v, (v) => Buffer.from(v).toString('hex'), (v) => Buffer.from(v).toString('base64'), (v) => JSON.stringify(v).slice(1, -1), (v) => encodeURIComponent(v)];
    const differ = [];
    const one = (i, kind, secrets, chunks) => {
      const run = (M) => { const m = M.createRunMasker(M.compileForms(secrets), ['out', 'err'], { steps: HUGE }), acc = { out: '', err: '' }; for (const [k, c] of chunks) { const o = m.push(k, c); acc.out += o.out; acc.err += o.err; } const o = m.end(true); acc.out += o.out; acc.err += o.err; return { ...acc, hits: m.hits, bytes: m.bytes }; };
      const a = run(Vw), b = run(Vm);
      if (a.out !== b.out || a.err !== b.err || a.hits !== b.hits || a.bytes !== b.bytes) differ.push({ i, kind, walk: { hits: a.hits, bytes: a.bytes }, now: { hits: b.hits, bytes: b.bytes } });
    };
    // THE BOUNDARIES BY CONSTRUCTION (the follow's read: by chance the seeds met them under 1 % of runs): a long form cut at its 63rd,
    // 64th and 65th character, then nothing, a broken character, or two — an ASCII form (the head before a broken one never counts)
    // and a CJK one (it counts) — and a 64-character form that IS a longer one's head, cut there
    const LONG = 'k-' + tok(118), CJKV = Array.from({ length: 90 }, () => CJK[pick(CJK.length)]).join(''), H64 = tok(64);
    for (const [kind, vals, f] of [['ascii', [LONG], LONG], ['cjk', [CJKV], CJKV], ['head', [H64, H64 + tok(40)], H64 + tok(40)]])
      for (const at of [63, 64, 65]) for (const tail of ['', '\uFFFD', '\uFFFD\uFFFD']) one(`${kind}@${at}${tail.length ? '+' + tail.length : ''}`, kind, vals.map((v, j) => ({ label: `b${j}`, value: v })), [['out', 'line 0: ok\n'], ['out', 'token=' + f.slice(0, at) + tail]]);
    for (let i = 0; i < trials; i++) {
      const kind = i % 6, P = tok(66), X = tok(64);
      const vals = kind === 0 ? [tok(20 + pick(180))] : kind === 1 ? [Array.from({ length: 8 + pick(12) }, () => CJK[pick(CJK.length)]).join('')] : kind === 2 ? [P + tok(5 + pick(40)), P + tok(5 + pick(40))]
        : kind === 3 ? [X, X + tok(10 + pick(60))] : kind === 4 ? ['A'.repeat(100 + pick(300)) + 'B'] : [tok(20 + pick(40)), 'k-' + tok(70 + pick(60))];
      const secrets = vals.map((v, j) => ({ label: `w${j}`, value: v }));
      const v = vals[pick(vals.length)], f = spell[pick(spell.length)](v), cutAt = 1 + pick(f.length - 1);
      let text = '';
      for (let l = 0; l < 2 + pick(6); l++) text += `line ${l}: ${kind === 4 && pick(2) ? 'A'.repeat(pick(400)) : tok(pick(50))}\n`;
      text += (pick(2) ? 'token=' : '') + f.slice(0, cutAt) + ['', '', '�', '��', '\x1b[3', '=', '\\x4', '&#12'][pick(8)];
      const chunks = []; for (let at = 0; at < text.length;) { const n = 1 + pick(300); chunks.push([pick(4) ? 'out' : 'err', text.slice(at, at + n)]); at += n; }
      one(i, kind, secrets, chunks);
    }
    return { trials: trials + 27, differ };
  };
  return { periodLeg, sweepLeg, budgetLeg, turnLeg, cutLeg, cut2Leg, overlapLeg, chainLeg, selfLeg, parityLeg, rotLeg, binLeg, release, diffLeg, costLeg, cutCountLeg, cutEndLeg, headShapesLeg, walkCopy, patchedCopy, walkLeg, bytes };
}

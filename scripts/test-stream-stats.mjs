#!/usr/bin/env node
// THE STREAM'S DETAILS + THE FULL-SCREEN PILL (lane stream-stats-popup — the owner 2026-10-19: 「做成简单展示，只有点击后才会展开更多
// 细节的 popup，popup 可以 pin 在右上角之类的地方观察，同时加入 latency、packet drop、bandwidth 等图表」 + 「全屏模式做成真全屏 … 可移动
// 的 overlay」) — PURE: src/stream-series.js (what the popup, its charts, the pinned panel and the pill decide) + the page's
// new getStats facts (src/stream-model.js statsOf), and THE ONE COMPONENT's wiring (both stream windows):
//   §1 statsOf: packets received, frames dropped, the codec (its report's mime type) — beside RTT / jitter / fps / kbps / lost
//   §2 THE RING: one row a read (a read seen twice adds nothing), 120 at most (the oldest go), a hole in the reads = gap rows
//      — RED CONTROL: a ring that does not count the hole collapses 4 s into one step
//   §3 a second's row: loss % = Δlost ÷ (Δlost + Δreceived); a late duplicate never makes it negative; a new connection's
//      counters (they went back) make that second a gap; nothing sent ⇒ 0 %; the machine's rate + floor + estimate ride
//   §4 THE CHARTS' MODELS: the nice top (1 / 2 / 2.5 / 5 × 10ⁿ, never under the kind's least), latency's band (RTT ± jitter,
//      never below 0), loss's bars + drop marks, rate's three lines; a gap ENDS a run — RED CONTROL: runs that skip a null
//      bridge the hole
//   §5 THE WINDOW: the newest second on the right edge, one second a step; the hovered second ⇄ x; the readout (a gap says so)
//   §6 THE TABLE: THE order from a full sample, the five always there, the rest only when said; the display's own name
//   §7 THE CORNERS: the nearest corner of a drop; the memory per machine (≤ 32, the newest last, junk ignored)
//   §8 THE PILL: shown 3 s after a move, held by hover / drag / a popup / a notice; a mouse move wakes it, a touch only in
//      its corner's third (swallowed while it was away)
//   §9 THE ONE COMPONENT: both windows mount src/lib/stream-stats.js with their chip as the summary and their picture box as
//      the pin's frame; the numbers element left the strip (the chip's title carries the sentence); the details are a
//      createPopover; the drags go through the ONE drag feed; the pill decides by class; no chart library
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const S = require(path.join(REPO, 'src/stream-series.js'));
const SM = require(path.join(REPO, 'src/stream-model.js'));
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
// a RED CONTROL: src/stream-series.js with ONE line swapped (the anchor must still be there), loaded as its own module
const SERIES_SRC = read('src/stream-series.js');
const mutant = (from, to) => { if (!SERIES_SRC.includes(from)) throw new Error('the mutant\'s anchor moved: ' + from); const m = { exports: {} }; new Function('module', 'exports', 'require', SERIES_SRC.replace(from, to))(m, m.exports, require); return m.exports; };

console.log('§1 statsOf: the details\' new page facts');
{
  const rep = (o) => [{ id: 'T', type: 'transport', selectedCandidatePairId: 'P' }, { id: 'P', type: 'candidate-pair', remoteCandidateId: 'R', currentRoundTripTime: 0.012, nominated: true, state: 'succeeded' }, { id: 'R', type: 'remote-candidate', candidateType: 'host' },
    { id: 'C', type: 'codec', mimeType: 'video/H264' }, { id: 'V', type: 'inbound-rtp', kind: 'video', codecId: o.codec === false ? undefined : 'C', framesDecoded: o.f, bytesReceived: o.b, totalDecodeTime: 0.1, jitter: 0.004, packetsLost: o.lost, packetsReceived: o.recv, framesDropped: o.drop, frameWidth: 1280, frameHeight: 720 }];
  const a = SM.statsOf(null, rep({ f: 100, b: 1e6, lost: 2, recv: 900, drop: 1 }), 1000);
  ok(a.received === 900 && a.dropped === 1 && a.codec === 'H264' && a.lost === 2 && a.rttMs === 12, 'packetsReceived, framesDropped and the codec (its report\'s mime type without video/) beside the old numbers', a);
  const b = SM.statsOf(a, rep({ f: 130, b: 1.1e6, lost: 2, recv: 1000, drop: 1, codec: false }), 2000);
  ok(b.codec === null && b.received === 1000 && b.fps === 30, 'no codec report named ⇒ null (never guessed)', b);
}

console.log('§2 THE RING');
{
  const s = S.createSeries();
  const page = (at, o = {}) => ({ at, rttMs: 10, jitterMs: 2, lost: 0, received: at / 10, dropped: 0, fps: 30, decodeMs: 1, kbps: 900, ...o });
  ok(s.feed(page(1000)) && s.feed(page(2000)) && !s.feed(page(2000)) && !s.feed(page(1500)) && s.rows().length === 2, 'one row a read; the same read again, or an older one, adds none', s.rows().length);
  s.feed(page(6200)); // a 4.2 s hole: 3 seconds nobody read
  const rows = s.rows();
  ok(rows.length === 6 && rows[2] === null && rows[3] === null && rows[4] === null && rows[5] && rows[5].lossPct === null, 'a 4.2 s hole ⇒ 3 gap rows, and the read after it takes no difference across the hole (its loss is a gap too)', rows.map((r) => (r ? r.lossPct : null)));
  const big = S.createSeries();
  for (let i = 1; i <= 150; i++) big.feed(page(i * 1000, { rttMs: i }));
  ok(big.rows().length === S.SERIES_SECONDS && S.SERIES_SECONDS === 120 && big.rows()[0].rtt === 31 && big.rows()[119].rtt === 150, 'at most 120 rows — the oldest go (150 reads keep seconds 31…150)', [big.rows().length, big.rows()[0].rtt]);
  const huge = S.createSeries(); huge.feed(page(1000)); huge.feed(page(1000 + 3600e3));
  ok(huge.rows().length === 120 && huge.rows()[118] === null && huge.rows()[119] !== null, 'an hour\'s hole (a tab asleep) is at most the window of gaps, then the new read', huge.rows().length);
  const M = mutant('      for (let i = 0; i < gap; i++) rows.push(null);\n', '');
  const m = M.createSeries(); m.feed(page(1000)); m.feed(page(2000)); m.feed(page(6200));
  ok(m.rows().length === 3 && !m.rows().includes(null), 'RED CONTROL: a ring that does not count the hole draws 4.2 s as one step (3 rows, no gap)', m.rows().length);
  s.clear();
  ok(s.rows().length === 0 && s.feed(page(1000)), 'clear() starts over (the stream ended)');
}

console.log('§3 a second\'s row');
{
  const p0 = { at: 0, lost: 10, received: 1000, dropped: 2 };
  const r = S.sampleOf(p0, { at: 1000, rttMs: 12, jitterMs: 3, lost: 15, received: 1095, dropped: 3, fps: 58, decodeMs: 1.4, kbps: 5400 }, { bweKbps: 7000, screen: { kbps: 6000, floor: 2500 } });
  ok(r.lossPct === 5 && r.lost === 5 && r.received === 95 && r.dropped === 1 && r.rtt === 12 && r.jitter === 3 && r.fps === 58 && r.decode === 1.4 && r.kbps === 5400 && r.rate === 6000 && r.floor === 2500 && r.bwe === 7000, '5 lost of 100 that second ⇒ 5 %; the drops, the numbers, the machine\'s rate + floor + estimate', r);
  ok(S.sampleOf(p0, { at: 1000, lost: 9, received: 1100, dropped: 2 }).lossPct === 0 && S.sampleOf(p0, { at: 1000, lost: 9, received: 1100 }).lost === 0, 'packetsLost stepping back (a late duplicate) is 0 lost, never negative');
  const back = S.sampleOf(p0, { at: 1000, lost: 0, received: 40, dropped: 0 });
  ok(back.lossPct === null && back.received === null && back.dropped === null, 'counters that went back (a new connection: a display switch) ⇒ that second is a gap, never a negative', back);
  ok(S.sampleOf(p0, { at: 1000, lost: 10, received: 1000, dropped: 2 }).lossPct === 0 && S.sampleOf(null, { at: 0, lost: 1, received: 5 }).lossPct === null, 'no packet that second ⇒ 0 %; the first read has nothing to subtract ⇒ null');
  ok(S.sampleOf(p0, null) === null && S.sampleOf(null, { at: 0 }, null).rate === null, 'no read ⇒ no row; no agent ⇒ no rate');
}

console.log('§4 THE CHARTS\' MODELS');
{
  ok(same([S.niceMax(37, 10), S.niceMax(5, 10), S.niceMax(2600, 1000), S.niceMax(0.3, 1), S.niceMax(1.2, 1), S.niceMax(20, 10), S.niceMax(null, 10), S.niceMax(7400, 1000)], [50, 10, 5000, 1, 2, 20, 10, 10000]), 'the nice top: 37 → 50, 5 → 10 (latency\'s least), 2600 → 5000, 0.3 → 1 %, 1.2 → 2, 20 → 20, none → the least, 7400 → 10000');
  const rows = [{ rtt: 10, jitter: 4, lossPct: 0, dropped: 0, kbps: 900, rate: 2000, floor: 1500 }, { rtt: 2, jitter: 5, lossPct: 3.5, dropped: 2, kbps: 1100, rate: 2000, floor: 1500 }, null, { rtt: 30, jitter: 1, lossPct: null, dropped: null, kbps: null, rate: 2400, floor: 1500 }];
  const lat = S.chartModel(rows, 'latency');
  ok(lat.unit === 'ms' && lat.max === 50 && same(lat.lines[0].runs, [[[0, 10], [1, 2]], [[3, 30]]]) && same(lat.band, [[[0, 6, 14], [1, 0, 7]], [[3, 29, 31]]]), 'latency: the RTT runs split at the gap; the band is RTT ± jitter, never below 0; the top covers RTT + jitter (31 → 50)', lat);
  const loss = S.chartModel(rows, 'loss');
  ok(loss.unit === '%' && loss.max === 5 && same(loss.bars, [[0, 0], [1, 3.5]]) && same(loss.marks, [[1, 2]]) && !loss.lines.length, 'loss: a bar a read second (3.5 % → a top of 5), the frames dropped as marks', loss);
  const rate = S.chartModel(rows, 'rate');
  ok(rate.unit === 'kbps' && rate.max === 2500 && same(rate.lines.map((l) => l.key), ['kbps', 'rate', 'floor']) && same(rate.lines[0].runs, [[[0, 900], [1, 1100]]]) && same(rate.lines[1].runs, [[[0, 2000], [1, 2000]], [[3, 2400]]]), 'rate: received kbps vs the decided rate vs its floor, each line broken at the gap; the top covers all three', rate);
  ok(S.chartModel([], 'latency').max === 10 && S.chartModel([], 'rate').max === 1000 && S.chartModel([], 'loss').max === 1 && S.chartModel([], 'x') === null && same(S.CHART_KINDS, ['latency', 'loss', 'rate']), 'nothing read ⇒ each kind\'s least top (10 ms, 1 %, 1000 kbps); an unknown kind ⇒ null; THE three kinds');
  const M = mutant('    if (v == null) { cur = null; return; }\n', '    if (v == null) return;\n');
  ok(same(M.chartModel(rows, 'latency').lines[0].runs, [[[0, 10], [1, 2], [3, 30]]]), 'RED CONTROL: runs that skip a null BRIDGE the hole (one run 0 → 3) — the shipped rule ends the run');
}

console.log('§5 THE WINDOW');
{
  ok(S.xOf(9, 10, 238) === 238 && Math.abs(S.xOf(8, 10, 238) - 236) < 1e-9 && Math.abs(S.xOf(0, 120, 238)) < 1e-9, 'the newest second on the right edge, one second a step (238 px / 119 steps = 2 px); 120 rows fill the width exactly');
  const back = [...Array(10).keys()].every((i) => S.indexAt(S.xOf(i, 10, 238), 10, 238) === i);
  ok(back && S.indexAt(100, 10, 238) === null && S.indexAt(5, 0, 238) === null && S.indexAt(237.4, 10, 238) === 9, 'x ⇄ the second for every row; left of the oldest row or nothing read ⇒ null; the right edge ⇒ the newest');
  const rows = [{ rtt: 10, jitter: 2, lossPct: 1, lost: 1, received: 99, dropped: 0, kbps: 900, rate: 2000, floor: 1500 }, null, { rtt: null, jitter: null, lossPct: null, kbps: 950, rate: 2000, floor: 1500 }];
  ok(same(S.readoutAt(rows, 0, 'latency'), { ago: 2, gap: false, rtt: 10, jitter: 2 }) && same(S.readoutAt(rows, 1, 'rate'), { ago: 1, gap: true }) && S.readoutAt(rows, 2, 'latency').gap === true && S.readoutAt(rows, 2, 'rate').kbps === 950 && S.readoutAt(rows, 5, 'loss') === null, 'the readout: how long ago, the kind\'s values; a gap row (or a missing value) says gap; out of range ⇒ null');
}

console.log('§6 THE TABLE');
{
  const page = { rttMs: 12, jitterMs: 3, fps: 58, decodeMs: 1.4, kbps: 5400, codec: 'H264', width: 1920, height: 1080, lost: 7, received: 90000, dropped: 2 };
  const agent = { fps: 60, kbps: 5600, bweKbps: 7000, screen: { encoder: 'NVENC', encodeMs: 9, display: '\\\\.\\DISPLAY2', w: 3840, h: 2160, kbps: 6000, floor: 2500 } };
  const source = { display: '\\\\.\\DISPLAY2', displays: [{ id: '\\\\.\\DISPLAY1', name: 'PG27UCDM' }, { id: '\\\\.\\DISPLAY2', name: 'DELL U2723QE' }] };
  const rows = S.detailRows({ page, agent, via: 'udp', source });
  ok(same(rows.map((r) => r.k), ['rtt', 'jitter', 'fps', 'decode', 'kbps', 'path', 'codec', 'encoder', 'display', 'size', 'rate', 'loss']), 'THE order: rtt · jitter · fps · decode · kbps · path · codec · encoder · display · size · rate · loss', rows.map((r) => r.k));
  const by = Object.fromEntries(rows.map((r) => [r.k, r]));
  ok(by.fps.sent === 60 && by.kbps.sent === 5600 && by.path.via === 'udp' && by.encoder.ms === 9 && by.display.name === 'DELL U2723QE' && by.size.sw === 3840 && by.rate.floor === 2500 && by.rate.bwe === 7000 && by.loss.dropped === 2, 'each row\'s facts: sent fps / kbps beside received, the path, encode ms, the display\'s OWN name, the encoded size, the rate + floor + estimate, the totals', by);
  const bare = S.detailRows({ page: { rttMs: null } });
  ok(same(bare.map((r) => r.k), ['rtt', 'jitter', 'fps', 'decode', 'kbps']) && bare[0].ms === null && S.detailRows({}).length === 0, 'before the numbers: the five rows (— each), nothing nobody said; no read at all ⇒ no table', bare);
  // lane stream-sdr-ecoqos: Windows power throttling — its row follows the encoder's; a Mac's 'n/a' (or anything else) is no row
  const power = (ecoqos) => S.detailRows({ page, agent: { ...agent, screen: { ...agent.screen, ecoqos } }, via: 'udp', source });
  ok(same(power('off').map((r) => r.k), ['rtt', 'jitter', 'fps', 'decode', 'kbps', 'path', 'codec', 'encoder', 'power', 'display', 'size', 'rate', 'loss']) && power('off').find((r) => r.k === 'power').ecoqos === 'off' && power('on').find((r) => r.k === 'power').ecoqos === 'on' && !power('n/a').some((r) => r.k === 'power') && !power('sideways').some((r) => r.k === 'power'),
    'the power row (Windows power throttling, off | on) follows the encoder; n/a (a Mac) or an unknown word ⇒ no row');
  ok(S.detailRows({ page, via: 'sideways' }).every((r) => r.k !== 'path') && S.detailRows({ page, agent: { screen: { display: 'D9' } }, source }).find((r) => r.k === 'display').name === null, 'an unknown path is left out; a display the source does not list keeps its id, no name');
}

console.log('§7 THE CORNERS');
{
  const box = { w: 1000, h: 600 };
  ok(same(['tl', 'tr', 'bl', 'br'].map((c) => S.cornerOf({ x: c[1] === 'l' ? 100 : 900, y: c[0] === 't' ? 50 : 550 }, box)), ['tl', 'tr', 'bl', 'br']) && S.cornerOf({ x: 499, y: 299 }, box) === 'tl' && S.cornerOf({ x: 500, y: 300 }, box) === 'br' && S.cornerOf(null, box) === null && S.cornerOf({ x: 1, y: 1 }, { w: 0, h: 5 }) === null, 'a drop goes to the nearest corner (by the dragged thing\'s centre); no point / no box ⇒ null');
  ok(S.cornerFrom('bl') === 'bl' && S.cornerFrom('nope') === 'tr' && S.cornerFrom(null, 'tl') === 'tl' && S.cornerFrom('x', 'y') === 'tr', 'a stored corner is one of four, else the fallback');
  let mem = S.rememberCorner(null, 'win-a', 'bl');
  mem = S.rememberCorner(mem, 'mac-b', 'tr');
  mem = S.rememberCorner(mem, 'win-a', 'br');
  ok(S.cornerMemory(mem, 'win-a') === 'br' && S.cornerMemory(mem, 'mac-b') === 'tr' && S.cornerMemory(mem, 'nobody', 'tl') === 'tl' && same(Object.keys(JSON.parse(mem)), ['mac-b', 'win-a']), 'per machine, the newest moved last; an unknown machine ⇒ the fallback', mem);
  ok(S.cornerMemory('{oops', 'win-a', 'tl') === 'tl' && S.cornerMemory('[1,2]', 'win-a') === 'tr' && S.cornerMemory('{"win-a":"middle"}', 'win-a', 'bl') === 'bl' && S.rememberCorner('{"x":"zz"}', 'win-a', 'nope') === '{}', 'junk in storage is ignored (a bad JSON, an array, a corner that is none of the four)');
  let many = null; for (let i = 0; i < 40; i++) many = S.rememberCorner(many, 'h' + i, 'bl');
  ok(Object.keys(JSON.parse(many)).length === 32 && S.cornerMemory(many, 'h0', 'tr') === 'tr' && S.cornerMemory(many, 'h39') === 'bl', 'at most 32 machines remembered — the oldest forgotten');
}

console.log('§8 THE PILL');
{
  const v = (o) => S.pillVerdict({ now: 10000, ...o });
  ok(v({ lastActive: 9000 }).shown && v({ lastActive: 9000 }).recheckMs === 2000 && !v({ lastActive: 7000 }).shown && !v({ lastActive: 6999 }).shown && !v({}).shown && S.PILL.hideMs === 3000, 'shown for 3 s after the last move (it looks again when they are up), hidden after; never moved ⇒ hidden');
  ok(['hover', 'drag', 'menu', 'notice'].every((k) => { const r = v({ lastActive: 0, [k]: true }); return r.shown && r.why === k && r.recheckMs === null; }), 'held up by a hover, a drag, an open popup / menu, a notice that must not be missed — no timer while held');
  const box = { w: 1200, h: 900 };
  ok(S.wakeVerdict({ type: 'pointermove', pointerType: 'mouse' }).wake && S.wakeVerdict({ type: 'pointerdown', pointerType: 'pen' }).wake && !S.wakeVerdict({ type: 'pointerup', pointerType: 'mouse' }).wake && !S.wakeVerdict({ type: 'pointermove', pointerType: 'mouse' }).swallow, 'a mouse\'s or a pen\'s move / press wakes it (the press still reaches the machine)');
  const tap = (x, y, corner, shown = false) => S.wakeVerdict({ type: 'pointerdown', pointerType: 'touch', pt: { x, y }, corner, box, shown });
  ok(same(tap(100, 100, 'tl'), { wake: true, swallow: true }) && same(tap(100, 100, 'tl', true), { wake: true, swallow: false }) && same(tap(1100, 850, 'br'), { wake: true, swallow: true }) && same(tap(600, 450, 'tl'), { wake: false, swallow: false }) && same(tap(1100, 100, 'tl'), { wake: false, swallow: false }), 'a touch wakes it only in its corner\'s third (400 × 300 here) — swallowed while it was away, the machine\'s while it is up; the middle and the other corners stay the machine\'s');
  ok(!S.wakeVerdict({ type: 'pointermove', pointerType: 'touch', pt: { x: 1, y: 1 }, box }).wake && !S.wakeVerdict({ type: 'pointerdown', pointerType: 'touch', pt: null, box }).wake && S.PILL.corner === 'tl', 'a finger\'s move wakes nothing; no point ⇒ nothing; the pill starts top-left (the details pin top-right)');
}

console.log('§9 THE ONE COMPONENT');
{
  const md = read('src/lib/machine-desktop.js'), ma = read('src/lib/machine-app.js'), st = read('src/lib/stream-stats.js'), ch = read('src/lib/stream-charts.js'), pl = read('src/lib/stream-pill.js'), cf = read('src/lib/corner-float.js'), css = read('public/style.css');
  ok(/const stats = createStreamStats\(\{ machine, hostId: m\.hostId, summary: chip, frame: pane \}\);/.test(md) && /const stats = createStreamStats\(\{ machine, hostId: m\.hostId, summary: chip, frame: host \}\);/.test(ma), 'both windows mount THE component with their chip as the summary and their picture box as the pin\'s frame');
  ok(!/stats\.numbers|streamEl/.test(md) && !/stats\.numbers/.test(ma) && /strip\.append\(fwEl, tccEl, noteEl\);/.test(md) && /statsRow\.append\(stats\.firewall\);/.test(ma) && !/desktop-strip-stream/.test(st + css), 'the numbers element left both strips (and its class its CSS) — the whole screen\'s strip appends the notices only');
  ok(/chip\.title = \[scope, \.\.\.\(words \? \[words\] : \[\]\)/.test(md) && /chip\.title = p \? \[\.\.\.\(words \? \[words\] : \[\]\)/.test(ma), 'the numbers sentence rides each chip\'s title (hover keeps it one glance away)');
  ok(/chip\.onclick = \(\) => \{ if \(stream\) \{ stats\.toggle\(chip\); return; \}/.test(md) && /chip\.onclick = \(\) => \{ if \(view\) stats\.toggle\(chip\); \};/.test(ma) && /createPopover\(anchor, 'stream-stats-pop'/.test(st) && !/addEventListener\('(mousedown|click)'/.test(st + pl), 'the summary\'s click opens the details as a createPopover (the outside-press closer + the Esc protocol); no hand-built closer');
  ok(/import \{ startPointerDrag \} from '\.\/drag-feed\.js';/.test(cf) && /requestAnimationFrame\(apply\)/.test(cf) && /uiScale\(\)/.test(cf) && /dragToCorner\(/.test(st) && /dragToCorner\(/.test(pl) && !/(head|panel|bar)\.addEventListener\('(pointermove|mousemove)'/.test(st + pl) && !/document\.addEventListener\('(pointer|mouse)(move|up)'/.test(st + pl + cf), 'the pinned panel and the pill drag through ONE door: the drag feed, rAF-coalesced, in layout px');
  ok(/const pill = createStreamPill\(\{ host: c, bar: strip, fullBtn, hostId: m\.hostId, menu:/.test(md) && /pill\.sync\(\)/.test(md) && /\.desktop-strip\.is-pill > :not\(/.test(css) && /\.desktop-machine-content:fullscreen > \.desktop-strip-compare \{ display: none; \}/.test(css), 'TRUE full screen: the strip itself becomes the pill (which children show is CSS by class — every door\'s child stays put), the compare row never squeezes the picture');
  ok(!/from '(chart\.js|d3|uplot|echarts)/i.test(st + ch) && /from '\.\.\/stream-series\.js'/.test(ch) && /getPropertyValue\(name\)/.test(ch), 'no chart library: the canvas draws the PURE model in the theme\'s tokens');
  ok(/localStorage\.getItem\(PIN_KEY\)/.test(st) && /const PIN_KEY = 'vibespace\.streamStatsPin';/.test(st) && /const PILL_KEY = 'vibespace\.streamPill';/.test(pl), 'the two memories: the pinned details\' corner (vibespace.streamStatsPin) and the pill\'s (vibespace.streamPill), per machine');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

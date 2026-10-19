// THE STATS ROW of a machine's picture stream (lane stream-window-fixes — the owner's first window stream said nothing about its
// connection while the whole screen's window did): ONE component both stream windows show — the whole screen's
// (src/lib/machine-desktop.js) and one window's (src/lib/machine-app.js openWindowStream):
//   • the numbers: RTT · jitter · fps · decode · kbps (the page's getStats), the relay path (via the hub · UDP / the device link)
//     and the machine's encoder with its encode ms — the facts are src/stream-model.js streamNumbersOf, the words are here
//   • the firewall notice while the hub relay carries the picture (the machine's self-probe said blocked), with the owner's
//     admin line to copy (run once there; VibeSpace never runs it)
// The whole screen's strip classes are kept (.desktop-strip-firewall / -fw-copy): their CSS, and the suites' anchors.
// lane stream-stats-popup (the owner 2026-10-19: 「做成简单展示，只有点击后才会展开更多细节的 popup，popup 可以 pin 在右上角之类的
// 地方观察，同时加入 latency、packet drop、bandwidth 等图表」): the long numbers sentence LEFT the strip — the caller's chip is the ONE
// summary (串流 · N ms · N fps + a chart glyph, `summary`), the sentence rides its title, and its click opens THE DETAILS
// (createPopover — Esc and an outside press close it): every number as a two-column table (src/stream-series.js detailRows) and
// three charts over the last 120 s (src/lib/stream-charts.js: latency with the jitter as a band, packet loss + the frames dropped,
// the received kbps vs the machine's decided rate); a hover or a tap on a chart reads that second. 「钉住」 turns it into a small
// panel in a corner of the window's picture (`frame`; top-right first, dragged to another corner — remembered per machine),
// updated each second until the stream ends, the window closes or its ×; one pinned panel a window. The series is fed by the
// page's own per-second read and the agent's push the page already has — nothing new is asked of the agent.
import { t } from './i18n.js';
import { copyText, showToast, createPopover, uiScale } from './utils.js';
import { streamNumbersOf } from '../stream-model.js';
import { createSeries, detailRows, readoutAt, cornerMemory, rememberCorner, CHART_KINDS } from '../stream-series.js';
import { drawChart, chartIndexAt } from './stream-charts.js';
import { placeInCorner, dragToCorner } from './corner-float.js';

const ms = (v) => (v == null ? '—' : v);
/** The numbers' words: streamNumbersOf's facts → one line ('' before the first numbers). */
export function streamNumbersText(n) {
  if (!n) return '';
  return t('RTT {rtt} ms · jitter {jitter} ms · {fps} fps · decode {decode} ms · {kbps} kbps', { rtt: ms(n.rtt), jitter: ms(n.jitter), fps: ms(n.fps), decode: ms(n.decode), kbps: ms(n.kbps) })
    + (n.via === 'udp' ? ' · ' + t('via the hub · UDP') : n.via === 'link' ? ' · ' + t('via the device link') : n.via === 'relay' ? ' · ' + t('via the hub') : '') // lane stream-relay-udp: which relay path
    + (n.encoder ? ' · ' + (n.encodeMs != null ? t('{encoder} · encode {ms} ms', { encoder: n.encoder, ms: n.encodeMs }) : n.encoder) : ''); // lane stream-p1b-screen: the machine's encoder
}

// THE PIN'S MEMORY: { [hostId]: 'tl' | 'tr' | 'bl' | 'br' } — where this browser pins a machine's details (src/stream-series.js, ≤ 32)
const PIN_KEY = 'vibespace.streamStatsPin';
const pinCorner = (hostId) => { try { return cornerMemory(localStorage.getItem(PIN_KEY), hostId, 'tr'); } catch { return 'tr'; } };
const savePin = (hostId, corner) => { try { localStorage.setItem(PIN_KEY, rememberCorner(localStorage.getItem(PIN_KEY), hostId, corner)); } catch { /* storage refused: not remembered */ } };

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (cls, text, onclick) => { const b = mk('button', cls, text); b.type = 'button'; b.onclick = onclick; return b; };
const PIN_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h4l-.5 4 2.5 2.5H4L6.5 6z"/><path d="M8 8.5V14"/></svg>';
const X_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

// the table's words, by detailRows' key (src/stream-series.js — THE order is its)
const PATH_WORDS = { direct: () => t('Direct path'), udp: () => t('via the hub · UDP'), link: () => t('via the device link'), relay: () => t('via the hub') };
const ROW_WORDS = {
  rtt: [() => t('Round trip'), (r) => `${ms(r.ms)} ms`],
  jitter: [() => t('Jitter'), (r) => `${ms(r.ms)} ms`],
  fps: [() => t('Frame rate'), (r) => `${ms(r.fps)} fps` + (r.sent != null ? ' · ' + t('sent {n}', { n: r.sent }) : '')],
  decode: [() => t('Decode'), (r) => `${ms(r.ms)} ms`],
  kbps: [() => t('Received'), (r) => `${ms(r.kbps)} kbps` + (r.sent != null ? ' · ' + t('sent {n}', { n: r.sent }) : '')],
  path: [() => t('Path'), (r) => PATH_WORDS[r.via]()],
  codec: [() => t('Codec'), (r) => r.codec],
  encoder: [() => t('Encoder'), (r) => (r.ms != null ? t('{encoder} · encode {ms} ms', { encoder: r.encoder, ms: r.ms }) : r.encoder)],
  display: [() => t('Screen'), (r) => (r.name ? `${r.name} · ${r.id}` : r.id)],
  size: [() => t('Picture'), (r) => `${r.w}×${r.h}` + (r.sw != null && r.sh != null && (r.sw !== r.w || r.sh !== r.h) ? ' · ' + t('encoded {w}×{h}', { w: r.sw, h: r.sh }) : '')],
  rate: [() => t('The machine’s rate'), (r) => [`${ms(r.kbps)} kbps`, r.floor != null ? t('floor {n} kbps', { n: r.floor }) : '', r.bwe != null ? t('estimate {n} kbps', { n: r.bwe }) : ''].filter(Boolean).join(' · ')],
  loss: [() => t('Lost'), (r) => t('{lost} packets · {dropped} frames dropped', { lost: ms(r.lost), dropped: ms(r.dropped) })],
};
// the charts' words: the name, a second's values (the newest, or the hovered one), what the lines are
const CHART_WORDS = {
  latency: { name: () => t('Latency'), of: (r) => (r.rtt == null ? '—' : r.jitter != null ? t('{rtt} ms ± {jitter}', { rtt: r.rtt, jitter: r.jitter }) : `${r.rtt} ms`), title: () => t('Round trip (the line) and its jitter (the band)') },
  loss: { name: () => t('Packet loss'), of: (r) => (r.lossPct == null ? '—' : `${r.lossPct} %` + (r.dropped ? ' · ' + t('{n} frames dropped', { n: r.dropped }) : '')), title: () => t('Packets lost each second (the bars); a frame the browser dropped is a mark along the top') },
  rate: { name: () => t('Bandwidth'), of: (r) => (r.kbps == null && r.rate == null ? '—' : `${ms(r.kbps)} kbps` + (r.rate != null ? ' · ' + t('rate {n}', { n: r.rate }) : '')), title: () => t('Received kbps (the line), the machine’s decided rate (dashed) and its floor (dotted)') },
};

/** `machine` = the machine's name (the copy toast's words), `hostId` = the pin's memory key, `summary` = the caller's chip (the
 *  chart glyph while a stream is drawn), `frame` = where a pinned panel lives (the window's picture box, position: relative).
 *  → { firewall, draw(stream) → { playing, page, agent, via, words }, open(anchor), close(), toggle(anchor), pin(), unpin(),
 *  ended(), dispose(), pinned } — the caller places the firewall notice in its strip; draw() reads the stream view
 *  (src/lib/stream-view.js) each tick and feeds the series (a read already seen adds nothing). */
export function createStreamStats({ machine = '', hostId = '', summary = null, frame = null } = {}) {
  const firewall = document.createElement('span'); firewall.className = 'desktop-strip-firewall'; firewall.hidden = true;
  const fwText = document.createElement('span'); fwText.textContent = t('The machine’s firewall blocks the direct path; going through the hub');
  const fwCopy = document.createElement('button'); fwCopy.type = 'button'; fwCopy.className = 'file-tool-btn desktop-strip-fw-copy'; fwCopy.textContent = t('Copy the admin command');
  let command = null;
  fwCopy.onclick = () => { if (command) copyText(command).then(() => showToast(t('Copied — paste it into an administrator PowerShell on {machine}', { machine }))); };
  firewall.append(fwText, fwCopy);
  const series = createSeries();
  let facts = { page: null, agent: null, via: null, source: null }, lastAgent = null;
  let pop = null, popView = null, panel = null, panelView = null, panelCtl = null;

  /** The details' DOM: the head (title · 钉住 · ×), the table (not on the pinned panel), the three charts. → { el, head, update } */
  function detailsView({ compact, onPin = null, onClose }) {
    const el = mk('div', compact ? 'stream-stats-panel' : 'stream-stats-body');
    const head = mk('div', 'stream-stats-head');
    const title = mk('span', 'stream-stats-title', compact ? '' : t('Stream details'));
    head.append(title);
    if (onPin) { const b = button('stream-stats-btn stream-stats-pin', null, onPin); b.innerHTML = PIN_SVG; b.append(mk('span', null, t('Pin it'))); b.title = t('Keep it in a corner of the window, updating'); head.append(b); }
    const x = button('stream-stats-btn stream-stats-x', null, onClose); x.innerHTML = X_SVG; x.title = t('Close'); x.setAttribute('aria-label', x.title);
    head.append(x);
    const table = compact ? null : mk('table', 'stream-stats-table');
    const charts = CHART_KINDS.map((kind) => {
      const box = mk('div', 'stream-chart'); box.dataset.kind = kind; box.title = CHART_WORDS[kind].title();
      const top = mk('div', 'stream-chart-head'), now = mk('span', 'stream-chart-now');
      top.append(mk('span', 'stream-chart-name', CHART_WORDS[kind].name()), now);
      const plot = mk('div', 'stream-chart-plot'), canvas = mk('canvas', 'stream-chart-canvas'), max = mk('span', 'stream-chart-max');
      plot.append(canvas, max);
      box.append(top, plot);
      const c = { kind, box, now, canvas, max, hover: null };
      const at = (e) => { c.hover = chartIndexAt(canvas, e.clientX, series.rows().length); paint(c); };
      canvas.addEventListener('pointermove', at);
      canvas.addEventListener('pointerdown', at); // a tap holds that second's readout until the next one
      canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') { c.hover = null; paint(c); } });
      return c;
    });
    el.append(head, ...(table ? [table] : []), ...charts.map((c) => c.box));
    function paint(c) {
      const rows = series.rows();
      const m = drawChart(c.canvas, rows, c.kind, { hover: c.hover });
      c.max.textContent = m ? `${m.max} ${m.unit}` : '';
      const r = c.hover != null ? readoutAt(rows, c.hover, c.kind) : null;
      if (r) { c.now.textContent = (r.ago ? t('{s} s ago', { s: r.ago }) : t('now')) + ' · ' + (r.gap ? t('no reading') : CHART_WORDS[c.kind].of(r)); return; }
      const last = [...rows].reverse().find(Boolean);
      c.now.textContent = last ? CHART_WORDS[c.kind].of(last) : '—';
    }
    function update() {
      const p = facts.page;
      if (compact) title.textContent = p ? t('{ms} ms · {fps} fps · {kbps} kbps', { ms: ms(p.rttMs), fps: ms(p.fps), kbps: ms(p.kbps) }) : t('Stream · connecting…');
      if (table) table.replaceChildren(...detailRows(facts).map((r) => { const tr = mk('tr'); tr.dataset.k = r.k; const w = ROW_WORDS[r.k]; tr.append(mk('th', null, w[0]()), mk('td', null, w[1](r))); return tr; }));
      for (const c of charts) paint(c);
    }
    return { el, head, update };
  }

  const refresh = () => {
    if (pop && !pop.isConnected) { pop = null; popView = null; } // Esc / an outside press took it
    popView?.update(); panelView?.update();
  };
  function draw(stream) {
    const page = stream ? stream.stats() : null, agent = stream ? stream.agent() : null;
    const playing = !!stream && stream.state === 'playing';
    const via = stream && stream.path ? stream.path() : null, fw = via && via !== 'direct' && stream.firewall ? stream.firewall() : null;
    firewall.hidden = !(playing && fw); command = (fw && fw.command) || null; fwCopy.hidden = !command; firewall.title = command || '';
    const n = streamNumbersOf(page, agent, via);
    facts = { page, agent, via, source: stream && typeof stream.source === 'function' ? stream.source() : null };
    const fresh = page ? series.feed(page, agent) : false;
    if (summary) { if (stream) summary.dataset.chart = '1'; else delete summary.dataset.chart; }
    if (fresh || agent !== lastAgent) refresh();
    lastAgent = agent;
    return { playing, page, agent, via, words: n ? streamNumbersText(n) : '' };
  }
  /** THE DETAILS under `anchor` (inside the full-screen element when the anchor is in it — nothing else of the page shows there). */
  function open(anchor) {
    if (pop && pop.isConnected) return pop;
    const fs = typeof document !== 'undefined' ? document.fullscreenElement : null;
    pop = createPopover(anchor, 'stream-stats-pop', fs && fs.contains(anchor) ? { parent: fs } : {});
    popView = detailsView({ compact: false, onPin: () => pin(), onClose: () => close() });
    pop.append(popView.el);
    popView.update();
    const me = pop; // an anchor in the screen's lower half (the pill in a bottom corner): the details open above it
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!me.isConnected || !anchor.isConnected) return;
      const a = anchor.getBoundingClientRect(), r = me.getBoundingClientRect();
      if (a.top > innerHeight / 2 && a.top - r.height - 2 >= 4) me.style.top = ((a.top - r.height - 2) / (uiScale() || 1)) + 'px';
    }));
    return pop;
  }
  function close() { if (pop) { pop._closeCtl?.abort?.(); pop.remove(); } pop = null; popView = null; }
  /** 钉住: the details become a small panel in a corner of `frame` (one a window; the popup closes). */
  function pin() {
    close();
    if (panel || !frame) return panel;
    panelCtl = new AbortController();
    panelView = detailsView({ compact: true, onClose: () => unpin() });
    panel = panelView.el;
    placeInCorner(panel, pinCorner(hostId));
    frame.append(panel);
    const head = panelView.head;
    head.title = t('Drag to another corner');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      dragToCorner(panel, frame, head, e, { signal: panelCtl.signal, onDrop: (c) => { if (c && panel) { placeInCorner(panel, c); savePin(hostId, c); } } });
    }, { signal: panelCtl.signal });
    panelView.update();
    return panel;
  }
  function unpin() { panelCtl?.abort(); panelCtl = null; panel?.remove(); panel = null; panelView = null; }
  /** The stream ended (the VNC picture took over, 停止串流): the details close, the series starts over. */
  function ended() { close(); unpin(); series.clear(); facts = { page: null, agent: null, via: null, source: null }; lastAgent = null; if (summary) delete summary.dataset.chart; }
  return { firewall, draw, open, close, toggle: (anchor) => (pop && pop.isConnected ? close() : open(anchor)), pin, unpin, ended, dispose: ended, get pinned() { return panel; } };
}

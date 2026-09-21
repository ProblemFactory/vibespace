// COMMUNICATION PANEL — DESIGN DIRECTIONS (a2 of the 2026-09-17 polish).
//
// One zh fixture, one frame (the real rail strip + sidebar + two windows,
// placed the way the app places them), THREE renderers. Every renderer builds
// DOM with createElement under the product's OWN class names — the CSS in
// direction-a/b/c.css is therefore the token map a later chunk lifts into
// public/style.css, not a picture of one. Nothing here is product code.
//
// URL: ?view=all|panel|window|outbox|empty&theme=dark|light  (body[data-dir] = a|b|c)
//
// Fixture rules: neutral labels only (Member A/B, example.com), relative ages,
// no calendar date, no company or personal identifier.

const q = new URLSearchParams(location.search);
const DIR = document.body.dataset.dir || 'a';
const VIEW = q.get('view') || 'all';
const THEME = q.get('theme') || 'dark';
document.documentElement.setAttribute('data-theme', THEME);
document.body.dataset.view = VIEW;
document.body.dataset.theme = THEME;

// ── helpers ──
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
const svg = (d, { size = 14, sw = 1.5, fill = false } = {}) => {
  const w = document.createElement('span');
  w.className = 'mock-svg';
  w.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return w.firstChild;
};
const ICON = {
  chat: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>',
  mail: '<path d="M2.5 4h11v8h-11z"/><path d="M2.5 4l5.5 4.5L13.5 4"/>',
  robot: '<rect x="3" y="6" width="10" height="7" rx="1.5"/><circle cx="6.5" cy="9.5" r=".8" fill="currentColor" stroke="none"/><circle cx="9.5" cy="9.5" r=".8" fill="currentColor" stroke="none"/><path d="M8 6V3.5M5.5 3.5h5"/>',
  more: '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  check: '<path d="M3 8.5l3.5 3.5L13 4.5"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  pencil: '<path d="M11.3 2.3l2.4 2.4-8 8-3.2.8.8-3.2z"/><path d="M10 3.6l2.4 2.4"/>',
  refresh: '<path d="M2 8a6 6 0 0111-3M14 8a6 6 0 01-11 3"/><path d="M13 2v3h-3M3 14v-3h3"/>',
  arrow: '<path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5"/>',
  chev: '<path d="M3.5 6l4.5 4.5L12.5 6"/>',
  chevR: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  alert: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.8v3.6"/><circle cx="8" cy="11" r="0.9" fill="currentColor" stroke="none"/>',
  outbox: '<path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/><path d="M8 2v3"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  funnel: '<path d="M2.5 3h11l-4.5 5.5V13l-2-1V8.5z"/>',
  lines: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  clock: '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/>',
  link: '<path d="M6.5 9.5l3-3M9 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M7 11.5l-1 1A2.5 2.5 0 012.5 9l1-1"/>',
};
const KIND_ICON = { chat: ICON.chat, mail: ICON.mail, agents: ICON.robot };

// ── the fixture (zh) ──
const ADAPTERS = [
  { id: 'lark', kind: 'chat', label: '飞书', state: 'connected', user: 'Member A', reauthIn: '2 天', lane: 'push', laneText: '推送在线', tracked: 4, total: 6 },
  { id: 'gmail', kind: 'mail', label: 'Gmail', state: 'expired', why: '令牌已过期', failures: 3, lane: 'poll', laneText: '轮询', tracked: 3, total: 4 },
  { id: 'agents', kind: 'agents', label: 'Agents', state: 'connected', user: null, lane: 'live', laneText: '站内', tracked: 2, total: 2 },
];
const CONVS = [
  { a: 'lark', title: '运维值班群', who: 'Member A, Member B, Member C', tracked: true, unread: 7, awaiting: 1, fresh: { kind: 'live', text: 'live' }, assign: '→ 运维分诊 · 已过滤 · 草稿权' },
  { a: 'lark', title: '产品发布公告', who: 'Member A, Member D', tracked: true, unread: 0, fresh: { kind: 'live', text: 'live' } },
  { a: 'lark', title: '客户支持 · Member B', who: 'Member B', tracked: true, unread: 2, fresh: { kind: 'age', text: '30s以内' } },
  { a: 'lark', title: '周报讨论', who: 'Member A, Member C', tracked: true, unread: 0, fresh: { kind: 'age', text: '5m以内' }, assign: '→ 文档 agent · 草稿权', held: true },
  { a: 'lark', title: '设计评审', who: 'Member C, Member D', tracked: false },
  { a: 'lark', title: '招聘协调（一个会被截断的长标题示例）', who: 'Member A, Member B', tracked: false },
  { a: 'gmail', title: '发票 · 供应商', who: 'billing@example.com', tracked: true, unread: 3, fresh: { kind: 'age', text: '18m以内' } },
  { a: 'gmail', title: '合同续签', who: 'legal@example.com', tracked: true, unread: 0, fresh: { kind: 'age', text: '18m以内' } },
  { a: 'gmail', title: '通知 · 系统告警', who: 'alerts@example.com', tracked: true, unread: 1, fresh: { kind: 'age', text: '18m以内' } },
  { a: 'gmail', title: '招聘 · 候选人', who: 'hr@example.com', tracked: false },
  { a: 'agents', title: '运维 agent', who: '会话 · 运维分诊', tracked: true, unread: 1, fresh: { kind: 'live', text: 'live' } },
  { a: 'agents', title: '文档 agent', who: '会话 · 文档整理', tracked: true, unread: 0, fresh: { kind: 'live', text: 'live' } },
];
const MSGS = [
  { who: 'Member B', at: '10:02', text: '部署完成，日志正常。' },
  { who: 'Member B', at: '10:02', text: '监控面板已经更新，大家可以看一下。', cont: true },
  { who: 'Member C', at: '10:05', text: '收到，我看一下告警 #4127 的处理结果。' },
  { who: '运维 agent', at: '10:06', text: '告警 #4127：磁盘使用率 91%，已清理临时文件，回落到 62%。', agent: true },
  { who: 'Member A', at: '10:11', text: '谢谢。下午的发布还按计划吗？' },
  { who: 'Member B', at: '10:12', text: '按计划，15:00 开始。' },
  { who: 'Member C', at: '10:30', text: '客户那边的反馈邮件我已经回复了。' },
  { who: '运维 agent', at: '10:31', text: '已起草一条回复，等你审批。', agent: true },
];
const PROPS = [
  { id: 'p1', state: 'awaiting', conv: '运维值班群', adapter: '飞书', by: '运维 agent', agent: true, when: '3 分钟前', day: '今天', text: '告警 #4127 已处理：磁盘使用率从 91% 回落到 62%，已清理临时文件。下午 15:00 的发布不受影响。', why: '告警 #4127', reason: '这个频道要求审批', sendAs: 'Member A', idWarn: '尚未验证收件人看到的是谁的名字。', ttl: '24 小时后过期' },
  { id: 'p2', state: 'sent', conv: '产品发布公告', adapter: '飞书', by: null, when: '25 分钟前', day: '今天', text: '15:00 发布开始，预计 20 分钟，期间控制台可能短暂不可用。', sendAs: 'Member A' },
  { id: 'p3', state: 'unknown', conv: '客户支持 · Member B', adapter: '飞书', by: '运维 agent', agent: true, when: '1 小时前', day: '今天', text: '会议改到 15:00，地点不变。', why: '消息 @_user_3', sendAs: 'Member A', outcome: '请求已发出，但没有收到回答。不会自动重试 —— 先在平台上看一眼，或按"检查结果"。' },
  { id: 'p4', state: 'failed', conv: '发票 · 供应商', adapter: 'Gmail', by: '文档 agent', agent: true, when: '昨天', day: '昨天', text: '已收到发票，本周内安排付款。', sendAs: 'Member A', outcome: '发送不可用：这个邮箱是只读的。' },
  { id: 'p5', state: 'rejected', conv: '周报讨论', adapter: '飞书', by: '文档 agent', agent: true, when: '昨天', day: '昨天', text: '本周周报已整理完毕，见附件。', sendAs: 'Member A', outcome: '你拒绝了：语气不对，这个群里别用附件。' },
];
const STATE_WORD = { awaiting: '等你审批', sent: '已发送', failed: '失败', unknown: '结果未知', rejected: '已拒绝' };
const STATE_TONE = { awaiting: 'attn', sent: 'ok', failed: 'bad', unknown: 'warn', rejected: 'idle' };

const RAIL_ORDER = ['folders', 'tasks', 'mounts', 'ports', 'agents', 'plugins', 'jobs', 'channels', 'system'];
const RAIL_ICONS = {
  folders: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  tasks: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="11" width="12" height="4" rx="1"/><rect x="3" y="18" width="15" height="3" rx="1"/>',
  mounts: '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><circle cx="6.5" cy="6.5" r="0.9" fill="currentColor"/><circle cx="6.5" cy="17.5" r="0.9" fill="currentColor"/>',
  ports: '<path d="M9 7V3M15 7V3"/><rect x="6" y="7" width="12" height="8" rx="2"/><path d="M12 15v6"/>',
  agents: '<rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9.5" cy="13" r="1" fill="currentColor"/><circle cx="14.5" cy="13" r="1" fill="currentColor"/><path d="M12 8V5M8 3h8"/>',
  plugins: '<path d="M9 3v4M15 3v4M7 7h10v5a5 5 0 0 1-10 0zM12 17v4"/>',
  jobs: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M6.5 7h.01M6.5 17h.01"/><path d="M14 6l3 1.5-3 1.5z" fill="currentColor"/>',
  channels: '<path d="M4 5h16v10h-9l-4 3.5V15H4z"/><path d="M8 9h8M8 12h5"/>',
  system: '<path d="M12 12l3.5-3.5"/><path d="M5 19a9 9 0 1 1 14 0"/>',
  diagnostics: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
const railSvg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// ── the frame: rail strip + sidebar shell + workspace with two windows ──
function frame(empty) {
  const sb = el('aside', 'sidebar rail-on open'); sb.id = 'sidebar';
  const rail = el('div'); rail.id = 'sidebar-rail';
  const item = (id) => { const b = el('button', 'rail-item' + (id === 'channels' ? ' active' : '')); b.dataset.rail = id; b.innerHTML = railSvg(RAIL_ICONS[id]); if (id === 'channels' && !empty) b.appendChild(el('span', 'rail-badge', '14')); return b; };
  for (const id of RAIL_ORDER) rail.appendChild(item(id));
  rail.appendChild(el('div', 'rail-spacer'));
  rail.append(item('diagnostics'), item('settings'));
  const main = el('div', 'sidebar-main');
  const head = el('div', 'sidebar-header');
  head.append(el('span', 'sidebar-title', '频道'), el('button', 'icon-btn', '✕'));
  const sec = el('div', 'sidebar-section');
  sec.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column';
  const srow = el('div');
  srow.style.cssText = 'display:flex;gap:4px;padding:4px 6px;align-items:center';
  const inp = el('input', 'filter-input'); inp.type = 'text'; inp.placeholder = '搜索…'; inp.style.cssText = 'margin:0;flex:1';
  const b1 = el('button', 'icon-btn'); b1.appendChild(svg(ICON.funnel, { size: 13 }));
  const b2 = el('button', 'icon-btn'); b2.appendChild(svg(ICON.lines, { size: 13 }));
  srow.append(inp, b1, b2);
  const list = el('div', 'session-items'); list.id = 'all-sessions-list'; list.style.cssText = 'flex:1;overflow-y:auto';
  const panel = el('div', 'rail-panel rail-panel-channels');
  list.appendChild(panel);
  sec.append(srow, list);
  main.append(head, sec);
  sb.append(rail, main);
  const ws = el('div'); ws.id = 'workspace';
  document.body.append(sb, ws);
  return { panel, ws };
}
function win(ws, { key, title, icon, x, y, w, h, active }) {
  const win = el('div', 'window' + (active ? ' window-active' : ''));
  win.dataset.win = key;
  win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  const tb = el('div', 'window-titlebar');
  const stack = el('span', 'window-icon-stack');
  const slot = el('span', 'window-backend-slot'); slot.appendChild(svg(icon, { size: 14 })); stack.appendChild(slot);
  const controls = el('div', 'window-controls');
  for (const g of ['–', '□', '✕']) { const b = el('button', 'win-btn' + (g === '✕' ? ' win-close' : ''), g); controls.appendChild(b); }
  tb.append(stack, el('span', 'window-title', title), controls);
  const content = el('div', 'window-content');
  win.append(tb, content);
  ws.appendChild(win);
  return content;
}

// ── shared bits every direction reuses (a composer is a composer) ──
function composer(primaryCls) {
  const comp = el('div', 'chanwin-composer');
  const ta = el('textarea'); ta.placeholder = '写一条回复…'; ta.rows = 2;
  const row = el('div', 'chanwin-composer-row');
  const note = el('div', 'chanwin-note', '策略: 审批 —— 回复会先等你批准');
  const btn = el('button', primaryCls, '提议'); btn.type = 'button';
  row.append(note, btn);
  comp.append(ta, row);
  return comp;
}
function readonlyFoot(kind) {
  const ro = el('div', 'chanwin-readonly');
  if (kind === 'untracked') { ro.append(el('span', '', '未跟踪 —— 跟踪后才会抓取这个会话的消息。')); const b = el('button', 'mounts-btn', '跟踪这个会话'); b.type = 'button'; ro.appendChild(b); }
  else ro.textContent = '这里是只读的：这个邮箱是只读的。';
  return ro;
}
const byAdapter = (id) => CONVS.filter((c) => c.a === id);
const conv0 = CONVS[0];

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTION A — "列表优先" (the Folders / Tasks idiom): collapsible group rows,
// bordered session-card rows, badges as pills, controls in ⋯.
// ═══════════════════════════════════════════════════════════════════════════
const A = {
  panel(root, empty) {
    const bar = el('div', 'chan-bar');
    const sum = el('div', 'chan-summary', empty ? '还没有连接任何频道' : '12 个会话 · 已跟踪 9 个');
    const ob = el('button', 'mounts-btn chan-outbox-btn' + (empty ? '' : ' chan-outbox-attn')); ob.type = 'button';
    ob.append(el('span', '', '发件箱'));
    if (!empty) ob.appendChild(el('span', 'chan-outbox-count', '1'));
    bar.append(sum, ob);
    root.appendChild(bar);
    if (empty) {
      root.appendChild(el('div', 'empty-hint', '连接一个频道并跟踪会话后，新消息会列在这里。'));
      const sec = el('div', 'chan-sec chan-connect');
      const h = el('div', 'chan-sec-head'); h.append(el('span', 'chan-sec-name', '连接')); sec.appendChild(h);
      for (const [ic, label, note] of [[ICON.chat, '连接飞书', '由集群提供'], [ICON.mail, '设置 Gmail 凭据…', '需要你自己的 OAuth client']]) {
        const b = el('button', 'mounts-btn chan-connect-btn'); b.type = 'button';
        b.append(svg(ic, { size: 13 }), el('span', 'chan-connect-label', label));
        sec.append(b, el('div', 'chan-connect-note', note));
      }
      root.appendChild(sec);
      return;
    }
    for (const a of ADAPTERS) {
      const sec = el('div', 'chan-sec');
      const h = el('div', 'chan-sec-head folder-header');
      h.append(svg(ICON.chev, { size: 10 }), svg(KIND_ICON[a.kind], { size: 13 }), el('b', 'chan-sec-name', a.label));
      h.appendChild(el('span', `chan-dot chan-dot-${a.state === 'connected' ? 'ok' : 'warn'}`));
      h.appendChild(el('span', 'chan-sec-count', `${a.tracked}/${a.total}`));
      const more = el('button', 'icon-btn chan-sec-more'); more.type = 'button'; more.appendChild(svg(ICON.more, { size: 13 }));
      h.appendChild(more);
      sec.appendChild(h);
      if (a.state !== 'connected') {
        const n = el('div', 'chan-sec-note chan-warn');
        n.append(svg(ICON.alert, { size: 11 }), el('span', '', `需要重新授权 —— ${a.why} · 连续 ${a.failures} 次失败`));
        const rb = el('button', 'mounts-btn chan-sec-verb', '重新授权'); rb.type = 'button';
        n.appendChild(rb);
        sec.appendChild(n);
      }
      const rows = el('div', 'chan-rows');
      for (const c of byAdapter(a.id)) rows.appendChild(A.row(c));
      sec.appendChild(rows);
      root.appendChild(sec);
    }
  },
  row(c) {
    const r = el('div', 'chan-row session-item-card' + (c.tracked ? ' chan-tracked' : ''));
    const l1 = el('div', 'chan-row-line');
    l1.appendChild(el('span', 'chan-row-title', c.title));
    if (c.tracked) l1.appendChild(el('span', 'chan-chip' + (c.fresh.kind === 'live' ? ' chan-chip-live' : ''), c.fresh.text));
    r.appendChild(l1);
    const l2 = el('div', 'chan-row-sub');
    l2.appendChild(el('span', 'chan-row-who', c.who));
    if (!c.tracked) l2.appendChild(el('span', 'chan-untracked', '未跟踪'));
    if (c.awaiting) { const aw = el('span', 'chan-awaiting'); aw.append(svg(ICON.check, { size: 9, sw: 2 }), el('span', '', String(c.awaiting))); l2.appendChild(aw); }
    if (c.unread) l2.appendChild(el('span', 'chan-unread', String(c.unread)));
    r.appendChild(l2);
    if (c.assign) { const as = el('div', 'chan-row-assign' + (c.held ? ' chan-warn' : '')); as.textContent = c.assign + (c.held ? ' · 上次唤醒被暂存' : ''); r.appendChild(as); }
    return r;
  },
  card(p, { compact = false } = {}) {
    const card = el('div', `chan-prop chan-prop-${p.state}`);
    const head = el('div', 'chan-prop-head');
    head.appendChild(el('span', `chan-prop-state chan-prop-state-${p.state}`, STATE_WORD[p.state]));
    head.appendChild(el('span', 'chan-prop-who', p.by ? `由 ${p.by} 起草` : '由你起草'));
    head.appendChild(el('span', 'chan-prop-when', p.when));
    card.appendChild(head);
    if (!compact) { const w = el('div', 'chan-prop-where'); const a = el('a', 'chan-prop-link', `${p.adapter} · ${p.conv}`); a.href = '#'; w.appendChild(a); card.appendChild(w); }
    card.appendChild(el('div', 'chan-prop-text', p.text));
    const meta = el('div', 'chan-prop-meta');
    if (p.why) { const a = el('a', 'chan-prop-link', `缘由: ${p.why}`); a.href = '#'; meta.appendChild(a); }
    if (p.state === 'awaiting') meta.appendChild(el('span', '', `需要审批: ${p.reason}`));
    meta.appendChild(el('span', '', `将以 ${p.sendAs} 的身份发送`));
    if (p.ttl) meta.appendChild(el('span', '', p.ttl));
    card.appendChild(meta);
    if (p.idWarn) { const w = el('div', 'chan-prop-idwarn'); w.append(svg(ICON.alert, { size: 11 }), el('span', '', p.idWarn)); card.appendChild(w); }
    if (p.outcome) card.appendChild(el('div', 'chan-prop-reason' + (p.state === 'unknown' ? ' chan-warn' : ''), p.outcome));
    if (p.state === 'awaiting' || p.state === 'unknown') {
      const act = el('div', 'chan-prop-actions');
      if (p.state === 'awaiting') { for (const [cls, t] of [['mounts-btn', '拒绝…'], ['mounts-btn', '编辑…'], ['mounts-btn mounts-btn-primary', '批准']]) { const b = el('button', cls, t); b.type = 'button'; act.appendChild(b); } }
      else { const b = el('button', 'mounts-btn', '检查结果'); b.type = 'button'; act.appendChild(b); }
      card.appendChild(act);
    }
    return card;
  },
  window(content, empty) {
    const root = el('div', 'chanwin');
    const bar = el('div', 'chanwin-bar');
    const tr = el('div', 'chanwin-title-row');
    tr.appendChild(el('b', '', empty ? '设计评审' : conv0.title));
    const more = el('button', 'icon-btn'); more.type = 'button'; more.appendChild(svg(ICON.more, { size: 13 })); tr.appendChild(more);
    bar.appendChild(tr);
    bar.appendChild(el('div', 'chanwin-meta', empty ? '飞书 · Member C, Member D' : `飞书 · ${conv0.who} · 5m以内`));
    if (!empty) bar.appendChild(el('span', 'chan-assign-chip', conv0.assign));
    const list = el('div', 'chanwin-list');
    if (empty) list.appendChild(el('div', 'empty-hint', '未跟踪 —— 还没有抓取任何消息。'));
    else {
      list.appendChild(el('div', 'chanmsg-day', '今天'));
      for (const m of MSGS) list.appendChild(A.msg(m));
      const ob = el('div', 'chanwin-outbox');
      const oh = el('div', 'chanwin-outbox-head');
      oh.append(el('span', '', '待你审批 · 1'));
      const all = el('a', 'chan-prop-link', '发件箱里还有 4 条'); all.href = '#'; oh.appendChild(all);
      ob.appendChild(oh);
      ob.appendChild(A.card(PROPS[0], { compact: true }));
      list.appendChild(ob);
    }
    const foot = el('div', 'chanwin-foot');
    foot.appendChild(empty ? readonlyFoot('untracked') : composer('mounts-btn mounts-btn-primary'));
    root.append(bar, list, foot);
    content.appendChild(root);
    if (!empty) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  },
  msg(m) {
    const r = el('div', 'chanmsg' + (m.cont ? ' chanmsg-cont' : '') + (m.agent ? ' chanmsg-agent' : ''));
    if (!m.cont) { const h = el('div', 'chanmsg-head'); h.append(el('b', '', m.who), el('span', 'chanmsg-at', m.at)); r.appendChild(h); }
    r.appendChild(el('div', 'chanmsg-body', m.text));
    return r;
  },
  outbox(content, empty) {
    const root = el('div', 'chanwin chan-outbox');
    const tb = el('div', 'jobs-toolbar');
    tb.appendChild(el('span', 'jobs-summary', empty ? '还没有提案' : '1 条等你审批 · 共 5 条'));
    const seg = el('div', 'chan-seg');
    for (const [t, on] of [['待审批', true], ['全部', false]]) { const b = el('button', 'jobs-btn' + (on ? ' chan-seg-on' : ''), t); b.type = 'button'; seg.appendChild(b); }
    tb.appendChild(seg);
    const list = el('div', 'chanwin-list chan-outbox-list');
    if (empty) list.appendChild(el('div', 'empty-hint', 'Agent 用 vibespace-channels 提议回复后，会在这里等你批准、编辑或拒绝。'));
    else {
      list.appendChild(el('div', 'chan-outbox-sec', '待审批 · 1'));
      list.appendChild(A.card(PROPS[0]));
      list.appendChild(el('div', 'chan-outbox-sec', '历史 · 4'));
      for (const p of PROPS.slice(1)) list.appendChild(A.card(p));
    }
    root.append(tb, list);
    content.appendChild(root);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTION B — "分诊看板" (the Background Work idiom): uppercase section
// heads with an icon, cards with a severity edge, monospace bordered chips.
// ═══════════════════════════════════════════════════════════════════════════
const B = {
  panel(root, empty) {
    const bar = el('div', 'jobs-rail-bar chan-bar');
    bar.appendChild(el('span', 'jobs-summary', empty ? '还没有连接任何频道' : '1 待批 · 13 未读 · 已跟踪 9/12'));
    const ob = el('button', 'jobs-btn chan-outbox-btn' + (empty ? '' : ' chan-outbox-attn')); ob.type = 'button';
    ob.append(svg(ICON.outbox, { size: 12 }), el('span', '', empty ? '发件箱' : '发件箱 1'));
    bar.appendChild(ob);
    root.appendChild(bar);
    const list = el('div', 'jobs-rail-list chan-list');
    root.appendChild(list);
    if (empty) {
      list.appendChild(el('div', 'jobs-empty', '连接一个频道并跟踪会话后，新消息会列在这里。'));
      const h = el('div', 'jobs-sec-head'); h.append(svg(ICON.plus, { size: 12 }), el('span', '', ' 连接')); list.appendChild(h);
      for (const [ic, label, note] of [[ICON.chat, '连接飞书', '由集群提供'], [ICON.mail, '设置 Gmail 凭据…', '需要你自己的 OAuth client']]) {
        const b = el('button', 'jobs-btn chan-connect-btn'); b.type = 'button';
        b.append(svg(ic, { size: 13 }), el('span', 'chan-connect-label', label));
        list.append(b, el('div', 'chan-connect-note', note));
      }
      return;
    }
    for (const a of ADAPTERS) {
      const h = el('div', 'jobs-sec-head chan-sec-head');
      h.append(svg(KIND_ICON[a.kind], { size: 12 }), el('span', 'chan-sec-name', ' ' + a.label), el('span', 'jobs-sec-count', `${a.tracked}/${a.total}`));
      h.appendChild(el('span', 'chan-sp'));
      h.appendChild(el('span', 'jobs-group-chip chan-sec-state ' + (a.state === 'connected' ? 'jobs-group-run' : 'jobs-group-ask'), a.state === 'connected' ? '已连接' : '需重新授权'));
      const more = el('button', 'jobs-btn chan-sec-more'); more.type = 'button'; more.appendChild(svg(ICON.more, { size: 12 })); h.appendChild(more);
      list.appendChild(h);
      if (a.state !== 'connected') { const n = el('div', 'chan-sec-note chan-warn'); n.textContent = `${a.why} · 连续 ${a.failures} 次失败 —— 重新授权后恢复轮询`; list.appendChild(n); }
      for (const c of byAdapter(a.id)) list.appendChild(B.row(c));
    }
  },
  row(c) {
    const sev = !c.tracked ? 'idle' : c.held ? 'warn' : (c.unread || c.awaiting) ? 'attn' : 'idle';
    const r = el('div', `chan-row jobs-card chan-sev-${sev}` + (c.tracked ? ' chan-tracked' : ''));
    const l1 = el('div', 'jobs-card-l1');
    l1.appendChild(el('span', 'chan-row-title jobs-name', c.title));
    l1.appendChild(el('span', 'jobs-state chan-row-state', !c.tracked ? '未跟踪' : c.unread ? `${c.unread} 未读` : '已读'));
    r.appendChild(l1);
    const l2 = el('div', 'jobs-card-l2');
    if (c.tracked) l2.appendChild(el('span', 'jobs-chip chan-chip' + (c.fresh.kind === 'live' ? ' chan-chip-live' : ''), c.fresh.text));
    if (c.awaiting) l2.appendChild(el('span', 'jobs-chip chan-awaiting', `${c.awaiting} 待批`));
    if (c.assign) l2.appendChild(el('span', 'jobs-chip jobs-chip-grp chan-row-assign' + (c.held ? ' chan-warn' : ''), c.assign.replace(' · 已过滤', '').replace(' · 草稿权', '')));
    l2.appendChild(el('span', 'jobs-ctx', c.who));
    r.appendChild(l2);
    return r;
  },
  card(p, { compact = false } = {}) {
    const card = el('div', `chan-prop jobs-card chan-prop-${p.state} chan-sev-${STATE_TONE[p.state]}`);
    const l1 = el('div', 'jobs-card-l1');
    l1.appendChild(el('span', `chan-dot chan-dot-${STATE_TONE[p.state]}`));
    l1.appendChild(el('span', `chan-prop-state chan-prop-state-${p.state}`, STATE_WORD[p.state]));
    l1.appendChild(el('span', 'jobs-state', (p.by ? `由 ${p.by} 起草` : '由你起草') + (compact ? '' : ` · ${p.adapter} · ${p.conv}`)));
    l1.appendChild(el('span', 'chan-prop-when', p.when));
    card.appendChild(l1);
    card.appendChild(el('div', 'chan-prop-text', p.text));
    const l2 = el('div', 'jobs-card-l2');
    if (p.why) l2.appendChild(el('span', 'jobs-chip jobs-chip-url', `缘由 ${p.why}`));
    if (p.state === 'awaiting') l2.appendChild(el('span', 'jobs-chip', '需要审批 · 频道策略'));
    l2.appendChild(el('span', 'jobs-chip', `以 ${p.sendAs} 发送`));
    if (p.ttl) l2.appendChild(el('span', 'jobs-chip', p.ttl));
    card.appendChild(l2);
    if (p.idWarn) card.appendChild(el('div', 'chan-prop-idwarn', p.idWarn));
    if (p.outcome) card.appendChild(el('div', 'chan-prop-reason' + (p.state === 'unknown' ? ' chan-warn' : ''), p.outcome));
    if (p.state === 'awaiting' || p.state === 'unknown') {
      const act = el('div', 'chan-prop-actions');
      if (p.state === 'awaiting') { for (const [cls, t] of [['jobs-btn', '拒绝…'], ['jobs-btn', '编辑…'], ['jobs-btn chan-btn-primary', '批准']]) { const b = el('button', cls, t); b.type = 'button'; act.appendChild(b); } }
      else { const b = el('button', 'jobs-btn', '检查结果'); b.type = 'button'; act.appendChild(b); }
      card.appendChild(act);
    }
    return card;
  },
  window(content, empty) {
    const root = el('div', 'chanwin');
    const bar = el('div', 'jobs-toolbar chanwin-bar');
    bar.appendChild(el('b', '', empty ? '设计评审' : conv0.title));
    bar.appendChild(el('span', 'jobs-chip', '飞书'));
    if (!empty) bar.appendChild(el('span', 'jobs-chip chan-chip chan-chip-live', 'live'));
    bar.appendChild(el('span', 'jobs-ctx', empty ? 'Member C, Member D' : conv0.who));
    const more = el('button', 'jobs-btn'); more.type = 'button'; more.appendChild(svg(ICON.more, { size: 12 })); bar.appendChild(more);
    const list = el('div', 'chanwin-list');
    if (empty) list.appendChild(el('div', 'jobs-empty', '未跟踪 —— 还没有抓取任何消息。'));
    else {
      if (conv0.assign) list.appendChild(el('div', 'jobs-meta chanwin-assign', conv0.assign));
      for (const m of MSGS) list.appendChild(B.msg(m));
      const ob = el('div', 'chanwin-outbox');
      const oh = el('div', 'jobs-sec-head chanwin-outbox-head'); oh.append(el('span', '', '待你审批'), el('span', 'jobs-sec-count', '1'));
      const all = el('a', 'chan-prop-link', '发件箱 · 5'); all.href = '#'; oh.appendChild(all);
      ob.appendChild(oh);
      ob.appendChild(B.card(PROPS[0], { compact: true }));
      list.appendChild(ob);
    }
    const foot = el('div', 'chanwin-foot');
    foot.appendChild(empty ? readonlyFoot('untracked') : composer('jobs-btn chan-btn-primary'));
    root.append(bar, list, foot);
    content.appendChild(root);
    if (!empty) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  },
  msg(m) {
    const r = el('div', 'chanmsg' + (m.agent ? ' chanmsg-agent' : ''));
    r.appendChild(el('span', 'chanmsg-at', m.at));
    const b = el('div', 'chanmsg-body');
    b.append(el('b', '', m.who + ' '), document.createTextNode(m.text));
    r.appendChild(b);
    return r;
  },
  outbox(content, empty) {
    const root = el('div', 'chanwin chan-outbox jobs-win');
    const tb = el('div', 'jobs-toolbar');
    tb.appendChild(el('span', 'jobs-summary', empty ? '还没有提案' : '1 待批 · 共 5 条'));
    tb.appendChild(el('span', 'chan-sp'));
    for (const [t, on] of [['待审批', true], ['全部', false]]) { const b = el('button', 'jobs-btn' + (on ? ' chan-seg-on' : ''), t); b.type = 'button'; tb.appendChild(b); }
    const list = el('div', 'jobs-body chan-outbox-list');
    if (empty) list.appendChild(el('div', 'jobs-empty', 'Agent 用 vibespace-channels 提议回复后，会在这里等你批准、编辑或拒绝。'));
    else {
      const groups = [['awaiting', '待审批'], ['unknown', '结果未知'], ['sent', '已发送'], ['failed', '失败'], ['rejected', '已拒绝']];
      for (const [st, label] of groups) {
        const ps = PROPS.filter((p) => p.state === st);
        const h = el('div', 'jobs-sec-head'); h.append(el('span', `chan-dot chan-dot-${STATE_TONE[st]}`), el('span', '', ' ' + label), el('span', 'jobs-sec-count', String(ps.length)));
        list.appendChild(h);
        for (const p of ps) list.appendChild(B.card(p));
      }
    }
    root.append(tb, list);
    content.appendChild(root);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTION C — "安静账本" (the Remote idiom): section title + subtitle, the
// adapter as a bordered row with a state dot and a lane badge, its
// conversations as indented plain children, no pills — weight and dots.
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  panel(root, empty) {
    const p = el('div', 'mounts-panel chan-panel');
    root.appendChild(p);
    const ob = el('button', 'mounts-btn chan-outbox-btn' + (empty ? '' : ' chan-outbox-attn')); ob.type = 'button';
    ob.append(svg(ICON.outbox, { size: 13 }), el('span', '', empty ? '发件箱' : '发件箱 · 1 条等你审批'));
    p.appendChild(ob);
    const hd = el('div', 'mounts-sec-head chan-sec-head');
    hd.append(el('span', '', '会话'), el('span', 'chan-sec-sub', empty ? '还没有连接任何频道' : '12 个 · 已跟踪 9 个'));
    p.appendChild(hd);
    if (empty) {
      p.appendChild(el('div', 'mounts-empty', '还没有连接任何频道。连接后，跟踪一个会话，它的新消息就会列在这里。'));
      for (const [ic, label] of [[ICON.chat, '连接飞书 —— 由集群提供'], [ICON.mail, '设置 Gmail 凭据…']]) { const b = el('button', 'mounts-btn chan-connect-btn'); b.type = 'button'; b.append(svg(ic, { size: 13 }), el('span', '', label)); p.appendChild(b); }
      p.appendChild(el('div', 'mounts-note', '在你跟踪之前，不会为任何会话抓取内容。'));
      return;
    }
    const list = el('div', 'mounts-list');
    p.appendChild(list);
    for (const a of ADAPTERS) {
      const row = el('div', 'mounts-row chan-adapter');
      const top = el('div', 'mounts-row-top');
      top.appendChild(el('span', 'mounts-dot ' + (a.state === 'connected' ? 'mounts-dot-ok' : 'mounts-dot-err')));
      top.appendChild(el('span', 'mounts-name chan-sec-name', a.label));
      top.appendChild(el('span', 'mounts-badge chan-lane', a.laneText));
      const acts = el('div', 'mounts-row-actions');
      if (a.state !== 'connected') { const rb = el('button', 'mounts-icon-btn mounts-icon-accent'); rb.type = 'button'; rb.appendChild(svg(ICON.refresh, { size: 13 })); acts.appendChild(rb); }
      const more = el('button', 'mounts-icon-btn'); more.type = 'button'; more.appendChild(svg(ICON.more, { size: 13 })); acts.appendChild(more);
      top.appendChild(acts);
      row.appendChild(top);
      const sub = el('div', 'mounts-path chan-sec-note' + (a.state === 'connected' ? '' : ' chan-warn'));
      sub.textContent = a.state === 'connected' ? (a.user ? `已连接为 ${a.user} · ${a.reauthIn}后重新授权` : '本实例的 agent 会话') : `需要重新授权 —— ${a.why} · 连续 ${a.failures} 次失败`;
      row.appendChild(sub);
      for (const c of byAdapter(a.id)) row.appendChild(C.row(c));
      list.appendChild(row);
    }
  },
  row(c) {
    const r = el('div', 'chan-row mounts-row-child' + (c.tracked ? ' chan-tracked' : '') + (c.unread ? ' chan-has-unread' : ''));
    const line = el('div', 'chan-row-line');
    if (c.awaiting) line.appendChild(el('span', 'chan-dot chan-dot-attn'));
    line.appendChild(el('span', 'chan-row-title', c.title));
    const meta = el('span', 'chan-row-meta');
    if (!c.tracked) meta.appendChild(el('span', 'chan-untracked', '未跟踪'));
    else {
      if (c.awaiting) meta.appendChild(el('span', 'chan-awaiting', `${c.awaiting} 待批`));
      if (c.unread) meta.appendChild(el('span', 'chan-unread', String(c.unread)));
      meta.appendChild(el('span', 'chan-fresh' + (c.fresh.kind === 'live' ? ' chan-chip-live' : ''), c.fresh.text.replace('以内', '')));
    }
    line.appendChild(meta);
    r.appendChild(line);
    if (c.assign) r.appendChild(el('div', 'chan-row-assign' + (c.held ? ' chan-warn' : ''), c.assign));
    return r;
  },
  card(p, { compact = false } = {}) {
    const card = el('div', `chan-prop chan-prop-${p.state}`);
    const head = el('div', 'chan-prop-head');
    head.appendChild(el('span', `chan-dot chan-dot-${STATE_TONE[p.state]}`));
    head.appendChild(el('span', `chan-prop-state chan-prop-state-${p.state}`, STATE_WORD[p.state]));
    head.appendChild(el('span', 'chan-prop-who', ' · ' + (p.by ? `由 ${p.by} 起草` : '由你起草') + (compact ? '' : ` · ${p.adapter} · ${p.conv}`)));
    head.appendChild(el('span', 'chan-prop-when', p.when));
    card.appendChild(head);
    const body = el('div', 'chan-prop-body');
    body.appendChild(el('div', 'chan-prop-text', p.text));
    const meta = el('div', 'chan-prop-meta');
    const bits = [];
    if (p.why) bits.push(`缘由 ${p.why}`);
    if (p.state === 'awaiting') bits.push(`需要审批：${p.reason}`);
    bits.push(`以 ${p.sendAs} 的身份`);
    if (p.ttl) bits.push(p.ttl);
    meta.textContent = bits.join(' · ');
    body.appendChild(meta);
    if (p.idWarn) body.appendChild(el('div', 'chan-prop-idwarn', p.idWarn));
    if (p.outcome) body.appendChild(el('div', 'chan-prop-reason' + (p.state === 'unknown' ? ' chan-warn' : ''), p.outcome));
    if (p.state === 'awaiting' || p.state === 'unknown') {
      const act = el('div', 'chan-prop-actions');
      if (p.state === 'awaiting') { for (const [cls, t] of [['mounts-btn', '拒绝…'], ['mounts-btn', '编辑…'], ['mounts-btn mounts-btn-primary', '批准']]) { const b = el('button', cls, t); b.type = 'button'; act.appendChild(b); } }
      else { const b = el('button', 'mounts-btn', '检查结果'); b.type = 'button'; act.appendChild(b); }
      body.appendChild(act);
    }
    card.appendChild(body);
    return card;
  },
  window(content, empty) {
    const root = el('div', 'chanwin');
    const bar = el('div', 'chanwin-bar');
    bar.appendChild(el('b', '', empty ? '设计评审' : conv0.title));
    bar.appendChild(el('div', 'chanwin-meta', empty ? '飞书 · Member C, Member D · 未跟踪' : `飞书 · ${conv0.who} · live`));
    if (!empty) { const as = el('div', 'chanwin-assign'); as.append(el('span', '', conv0.assign)); const pb = el('button', 'mounts-icon-btn'); pb.type = 'button'; pb.appendChild(svg(ICON.pencil, { size: 12 })); as.appendChild(pb); bar.appendChild(as); }
    const list = el('div', 'chanwin-list');
    if (empty) list.appendChild(el('div', 'mounts-empty', '未跟踪 —— 还没有抓取任何消息。'));
    else {
      list.appendChild(el('div', 'chanmsg-day', '今天'));
      for (const m of MSGS) list.appendChild(A.msg(m));
      const ob = el('div', 'chanwin-outbox');
      const oh = el('div', 'mounts-sec-head chanwin-outbox-head'); oh.append(el('span', '', '待你审批 · 1'));
      const all = el('a', 'chan-prop-link', '发件箱 · 5'); all.href = '#'; oh.appendChild(all);
      ob.appendChild(oh);
      ob.appendChild(C.card(PROPS[0], { compact: true }));
      list.appendChild(ob);
    }
    const foot = el('div', 'chanwin-foot');
    foot.appendChild(empty ? readonlyFoot('untracked') : composer('mounts-btn mounts-btn-primary'));
    root.append(bar, list, foot);
    content.appendChild(root);
    if (!empty) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  },
  outbox(content, empty) {
    const root = el('div', 'chanwin chan-outbox');
    const tb = el('div', 'jobs-toolbar');
    tb.appendChild(el('span', 'jobs-summary', empty ? '还没有提案' : '1 条等你审批 · 共 5 条'));
    tb.appendChild(el('span', 'chan-sp'));
    for (const [t, on] of [['待审批', true], ['全部', false]]) { const b = el('button', 'mounts-btn' + (on ? ' chan-seg-on' : ''), t); b.type = 'button'; tb.appendChild(b); }
    const list = el('div', 'chanwin-list chan-outbox-list');
    if (empty) list.appendChild(el('div', 'mounts-empty', 'Agent 用 vibespace-channels 提议回复后，会在这里等你批准、编辑或拒绝。'));
    else {
      for (const day of ['今天', '昨天']) {
        list.appendChild(el('div', 'mounts-sec-head chan-outbox-sec', day));
        for (const p of PROPS.filter((x) => x.day === day)) list.appendChild(C.card(p));
      }
    }
    root.append(tb, list);
    content.appendChild(root);
  },
};

// ── mount ──
const D = { a: A, b: B, c: C }[DIR];
const empty = VIEW === 'empty';
const { panel, ws } = frame(empty);
D.panel(panel, empty);
const convC = win(ws, { key: 'conv', title: empty ? '设计评审' : conv0.title, icon: ICON.chat, x: 16, y: 16, w: 504, h: 560, active: VIEW !== 'outbox' });
D.window(convC, empty);
const obC = win(ws, { key: 'outbox', title: '发件箱', icon: ICON.outbox, x: 536, y: 16, w: 392, h: 600, active: VIEW === 'outbox' });
D.outbox(obC, empty);
document.body.dataset.ready = '1';

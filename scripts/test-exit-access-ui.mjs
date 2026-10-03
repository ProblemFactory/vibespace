#!/usr/bin/env node
// test-exit-access-ui — lane-pairing ⑥ in a REAL page (B-7007): "Who can use <machine>?" — two lists per machine
// (borrow its network / run commands on it), each Nobody / All my conversations / Only these (THE principal picker),
// run with "Ask me each time". A throwaway worktree server + headless chrome (scripts/pairing-ui-harness.mjs) + a
// REAL device daemon paired and dialed in (its `run` really runs `sh -lc` on this box) + stub claude sessions with
// their vsst_ tokens + three Task Groups, the page in zh:
//   ① the row's exit icon opens the dialog on a FRESH GET — the row's broadcast copy HELD stale (mirror-193's recipe:
//      the page's list is a frame behind a route write; the dialog must draw the server's list, not the row's)
//   ② "Only these" + a Task Group picked with the KEYBOARD + a conversation picked with the MOUSE + 每次都问我 ⇒ Save ⇒
//      ONE PATCH carrying `session:<webui id>` rows and the `base`; the toast; a SECOND page's row shows the summary
//   ③ the 409 leg: another writer saves while the dialog is open ⇒ the sentence, the dialog re-drawn as it is now,
//      nothing written; the empty-list refusal in place (no request sent)
//   ④ a granted stub runs `echo pong` ⇒ the For-you row appears with 允许 / 拒绝 within ~1 s, Allow ⇒ the device runs
//      it, the chat window shows the "Machines · <machine>" card with exit 0; the REAL vibespace-exit CLI + Deny ⇒ its
//      output names the refusal; an ungranted stub ⇒ 403 + the card "may not run commands there"; a jbt_ token ⇒ 401
//   · verify-r4 F4: an exit ask shows the WHOLE command byte for byte (the row's scrolling <pre>, the window verbatim —
//     never markdown); CONTROL = a bundle rendering it as markdown again
//   · verify-r4 F5: an exit ask offers no typed Reply (row, For-you window) and the route refuses one — the ask keeps waiting
//   · THE RECT CENSUS at 860 px and 360 px (radios ≥ 44 px, picker rows ≥ 40 px on the phone, no horizontal overflow)
// Requires google-chrome (SKIP without). Run: node scripts/test-exit-access-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { bootWorld, CHROME, sleep, rectCensusJs, REPO, labelRowCensusJs, LABEL_FIX_REVERT, swapStyleJs, machineRowCensusJs, ROW_FIX_REVERT, buildPatchedBundle } from './pairing-ui-harness.mjs';
import { mutantCopies } from './mutant-copy.mjs';

if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const W = await bootWorld('exitui');
const HOST = 'host-dial-exmac';
const openRemote = async (P) => { await P.evalJs(`(() => { const s = app.sidebar; s.toggle?.(true); if (s._railEl) { if (s._activeTab !== 'mounts') s._railGo('mounts'); else s._render(); } else { s._activeTab = 'mounts'; s._updateTabs?.(); s._render(); } return true; })()`); return P.waitFor(`!!document.querySelector('.mounts-panel')?.offsetParent`, 15000); };
const rowOf = `([...document.querySelectorAll('.mounts-row')].find((r) => r._hostId === ${JSON.stringify(HOST)}) || null)`;
const exitIcon = `(${rowOf}?.querySelector('.mounts-row-actions button[title*="出口"], .mounts-row-actions button[title*="as an exit"]') || null)`;
const patches = (P) => P.requests.filter((r) => r.method === 'PATCH' && r.url.endsWith(`/api/hosts/${HOST}/exit-access`));
const sec = (g) => `#exit-access-dialog .exit-access-sec[data-grant="${g}"]`;

try {
  // ── the world: a paired device dialed in, three Task Groups, three live stub conversations ──
  const pair = await W.pairDevice('exmac');
  let online = false;
  for (let i = 0; i < 80 && !online; i++) { online = !!(await W.hostRow('exmac'))?.online; if (!online) await sleep(250); }
  ok(online, 'a REAL device daemon is paired through the route and dialed in');
  const groups = [];
  for (const title of ['运维', '前端', '后端']) groups.push((await W.api('POST', '/api/tasks', { title })).j.task);
  ok(groups.every((g) => g && g.id), 'three Task Groups');
  const S = [];
  for (let k = 1; k <= 3; k++) S.push(await W.createStubSession(path.join(W.home, 'proj' + k)));
  ok(S.every((s) => s.sid && s.token && s.token.startsWith('vsst_') && s.cid), 'three live stub conversations with their vsst_ tokens', S);
  const bind = await W.api('POST', `/api/tasks/${groups[0].id}/bind`, { sessionKey: 'claude:' + S[0].cid });
  ok(bind.status === 200, 'conversation 1 is bound to 运维');

  const P = await W.openPage({ width: 1280, height: 820, lang: 'zh', first: true });
  ok(await openRemote(P), 'the Remote tab');
  ok(await P.waitFor(`!!${exitIcon}`, 15000), 'the machine row carries the exit icon "谁能把 … 当出口使用…"');
  ok(await P.evalJs(`/^出口：网络 — 没有人 · 命令 — 没有人$/.test(${rowOf}.querySelector('.mounts-exit-line')?.textContent || '')`), 'the row says 出口：网络 — 没有人 · 命令 — 没有人 (the migration default: nobody)');
  // ① the row's copy HELD stale: the page stops repainting the panel, the server's list moves on
  await P.evalJs(`(() => { const s = app.sidebar; s.__realRender = s._renderMounts; s._renderMounts = async () => {}; return true; })()`);
  const w1 = await W.api('PATCH', `/api/hosts/${HOST}/exit-access`, { use: { mode: 'everyone' } });
  ok(w1.status === 200 && w1.j.access.use.mode === 'everyone', 'another writer: network → everyone (the page is not repainted — its row is a frame behind)');
  ok(await P.evalJs(`((app.sidebar._hostsData.hosts.find((h) => h.id === ${JSON.stringify(HOST)}).exit || {}).use || { mode: 'nobody' }).mode === 'nobody'`), '(the page\'s own copy still says nobody)');
  console.log('① the exit icon opens the dialog on a FRESH GET');
  ok(await P.realClick(exitIcon), 'a real click on the row\'s exit icon');
  ok(await P.waitFor(`!!document.querySelector('${sec('run')}')`, 8000), 'the dialog 谁能使用 exmac？ opens');
  ok(await P.evalJs(`document.querySelector('#exit-access-dialog .dialog-header h3').textContent === '谁能使用 exmac？'`), 'its title');
  ok(await P.evalJs(`document.querySelector('${sec('use')} input[value="everyone"]').checked`), 'the dialog shows the SERVER\'s list (network: 我的所有会话), not the row\'s stale copy (mirror-193)');
  // naive-user N-radio: `.dialog-body label` (0,1,1) is a COLUMN flex — the six mode radios and "每次都问我" sat above
  // their words (the checkbox centred on its own line). THE LABEL CENSUS + a patched copy of style.css as the control.
  // naive-user N-greyed: commands = 没有人 here — "每次都问我" sat greyed out (disabled) and did nothing when clicked (the
  // owner's no-greyed-controls rule); under Nobody it is simply not shown. THE GREYED CENSUS: no visible disabled control.
  const greyedJs = `[...document.querySelectorAll('#exit-access-dialog input, #exit-access-dialog button, #exit-access-dialog select')].filter((e) => e.disabled && e.offsetParent).map((e) => (e.closest('label')?.textContent || e.textContent || e.type).trim().slice(0, 30))`;
  const g0 = await P.evalJs(greyedJs);
  ok(g0.length === 0 && !(await P.evalJs(`!!document.querySelector('${sec('run')} .exit-access-ask')?.offsetParent`)), 'N-greyed: with commands = 没有人 the dialog shows NO greyed control — "每次都问我" is not shown under Nobody', g0);
  const lcx = await P.evalJs(labelRowCensusJs('#exit-access-dialog'));
  ok(lcx.ok && lcx.n === 6, `N-radio: every mode radio sits BESIDE its words (${lcx.n} labels)`, lcx);
  {
    const real = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    const MUT = mutantCopies('exitui', REPO);
    const fPre = path.join(MUT.dir, `style-prefix-${process.pid}.css`); fs.writeFileSync(fPre, LABEL_FIX_REVERT.reduce((x, [fixed, old]) => x.replace(fixed, old), real)); MUT.files.push(fPre);
    await P.evalJs(swapStyleJs(fs.readFileSync(fPre, 'utf8')));
    await sleep(200);
    const pre = await P.evalJs(labelRowCensusJs('#exit-access-dialog'));
    ok(!pre.ok && pre.bad.length === 6, `CONTROL (N-radio): the pre-fix style.css stacks all ${pre.bad.length} controls above their words`, pre);
    await P.evalJs(swapStyleJs(real));
    await sleep(200);
  }
  {
    // CONTROL (N-greyed): the pre-fix dialog (the switch DISABLED under Nobody) — a patched copy of exit-access-dialog.js
    // built into a client bundle (scripts/mutant-copy.mjs's scratch dir) and served to a second page in place of /bundle.js
    const MUTG = mutantCopies('exitgrey', REPO);
    const dsrc = fs.readFileSync(path.join(REPO, 'src/lib/exit-access-dialog.js'), 'utf8');
    const FIX = "if (askLab) { askLab.style.display = mode === 'nobody' ? 'none' : ''; askNote.style.display = askLab.style.display; }";
    ok(dsrc.split(FIX).length === 2, 'N-greyed: the fix is in exit-access-dialog.js once (the control\'s anchor)');
    const C = await W.openPage({ width: 1280, height: 820, lang: 'zh', bundleText: await buildPatchedBundle(MUTG, 'src/lib/exit-access-dialog.js', dsrc.replace(FIX, "if (askBox) askBox.disabled = mode === 'nobody';"), 'greyed') });
    await openRemote(C);
    await C.realClick(exitIcon);
    await C.waitFor(`!!document.querySelector('${sec('run')}')`, 8000);
    await sleep(300);
    const gPre = await C.evalJs(greyedJs);
    ok(gPre.length === 1 && gPre[0] === '每次都问我', `CONTROL (N-greyed): the pre-fix dialog shows a greyed "每次都问我" under 没有人 — the census sees ${JSON.stringify(gPre)}`, gPre);
    await C.evalJs(`document.querySelector('#exit-access-dialog .dialog-close')?.click(); true`);
    // the control's tab goes: a second tab in front makes P a BACKGROUND tab, and every real click on it then waits
    // for a throttled frame (~5 s each, measured)
    await C.cdp('Page.close').catch(() => {});
    await P.cdp('Page.bringToFront');
    await sleep(200);
  }
  await P.evalJs(`(() => { const s = app.sidebar; s._renderMounts = s.__realRender; return true; })()`);
  // ② pick with the keyboard and the mouse, ask me, Save ⇒ ONE PATCH
  console.log('② Only these + a Task Group by keyboard + a conversation by mouse + 每次都问我 ⇒ ONE PATCH');
  ok(await P.realClick(`${sec('run')} input[value="only"]`), 'a real click on 仅以下会话和任务组 (commands)');
  ok(await P.waitFor(`!!document.querySelector('${sec('run')} .pp-input')?.offsetParent`, 4000), 'the principal picker shows');
  await P.realClick(`${sec('run')} .pp-input`);
  await P.type('运维');
  await P.key('Enter', { vk: 13, text: '\r' });
  ok(await P.waitFor(`[...document.querySelectorAll('${sec('run')} .pp-chip')].some((c) => c.dataset.key === ${JSON.stringify('group:' + groups[0].id)})`, 4000), 'the KEYBOARD picked the Task Group 运维 (a chip)');
  await P.evalJs(`(() => { const i = document.querySelector('${sec('run')} .pp-input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(200);
  ok(await P.realClick(`${sec('run')} .pp-row[data-key=${JSON.stringify('agent:' + S[1].cid)}]`), 'the MOUSE picks conversation 2 in the list');
  ok(await P.waitFor(`[...document.querySelectorAll('${sec('run')} .pp-chip')].some((c) => c.dataset.key === ${JSON.stringify('agent:' + S[1].cid)})`, 4000), '…its chip');
  ok(await P.evalJs(`(() => { const a = document.querySelector('${sec('run')} .exit-access-ask input'); return !!a && !!a.offsetParent && !a.disabled; })()`) && (await P.evalJs(greyedJs)).length === 0, 'N-greyed: "Only these" SHOWS "每次都问我", live — and still no greyed control');
  ok(await P.realClick(`${sec('run')} .exit-access-ask input`), 'tick 每次都问我');
  const pBefore = patches(P).length;
  ok(await P.realClick('#exit-access-dialog .exit-access-save'), 'a real click on 保存');
  ok(await P.waitFor(`!document.querySelector('#exit-access-dialog')`, 6000), 'the dialog closes on success');
  const pd = patches(P).slice(pBefore);
  const body = pd[0] && JSON.parse(pd[0].body);
  ok(pd.length === 1 && body && typeof body.base === 'string' && body.run.mode === 'only' && body.run.ask === true && body.run.who.some((r) => r.kind === 'session' && r.session === S[1].sid) && body.run.who.some((r) => r.kind === 'group' && r.id === groups[0].id), 'ONE PATCH: `session:<webui id>` rows + the group + ask + the base it read', pd.map((x) => x.body));
  ok(await P.waitFor(`[...document.querySelectorAll('.global-toast')].some((t) => /^谁能使用 exmac：网络 — 所有会话；命令 — 已选 2 个（每次问我）✕?$/.test(t.textContent.trim()))`, 4000), 'the toast: 谁能使用 exmac：网络 — 所有会话；命令 — 已选 2 个（每次问我）', await P.evalJs(`[...document.querySelectorAll('.global-toast')].map((t) => t.textContent).join(' | ')`));
  const stored = (await W.hostRow('exmac')).exit;
  ok(stored.run.mode === 'only' && stored.run.ask === true && stored.run.who.some((w) => w.kind === 'session' && w.id === 'claude:' + S[1].cid), 'the server resolved the live pick to its durable key (claude:<conversation id>)', stored.run);
  const P2 = await W.openPage({ width: 1280, height: 820, lang: 'zh' });
  await openRemote(P2);
  ok(await P2.waitFor(`/^出口：网络 — 所有会话 · 命令 — 已选 2 个（每次问我）$/.test(${rowOf}?.querySelector('.mounts-exit-line')?.textContent || '')`, 10000), 'a SECOND page\'s row shows the summary 出口：网络 — 所有会话 · 命令 — 已选 2 个（每次问我）');
  ok(await P.waitFor(`/已选 2 个（每次问我）/.test(${rowOf}?.querySelector('.mounts-exit-line')?.textContent || '')`, 10000), '…and the first page\'s row repainted from the broadcast');
  // ③ the 409 leg + the empty-list refusal
  console.log('③ another writer while the dialog is open ⇒ 409, re-drawn; the empty list refused in place');
  await P.realClick(exitIcon);
  await P.waitFor(`!!document.querySelector('${sec('use')}')`, 8000);
  const w2 = await W.api('PATCH', `/api/hosts/${HOST}/exit-access`, { use: { mode: 'nobody' } });
  ok(w2.status === 200, 'another writer saves (network → nobody) while the dialog is open');
  const p409 = patches(P).length;
  await P.realClick(`${sec('run')} .exit-access-ask input`); // any change, then Save with the OLD base
  await P.realClick('#exit-access-dialog .exit-access-save');
  ok(await P.waitFor(`(document.querySelector('#exit-access-dialog .exit-access-refuse')?.textContent || '') === '对话框打开期间列表被改动了（另一个窗口）— 这是现在的列表，什么都没保存'`, 6000), 'the 409 sentence, in place (attack 4)', await P.evalJs(`document.querySelector('#exit-access-dialog .exit-access-refuse')?.textContent`));
  ok(await P.evalJs(`document.querySelector('${sec('use')} input[value="nobody"]').checked`), '…the dialog RE-DRAWN from the list as it is now (network: 没有人)');
  ok(patches(P).length === p409 + 1 && (await W.hostRow('exmac')).exit.run.ask === true, '…one refused PATCH, nothing written');
  await P.realClick(`${sec('use')} input[value="only"]`);
  const pEmpty = patches(P).length;
  await P.realClick('#exit-access-dialog .exit-access-save');
  await sleep(300);
  ok(await P.evalJs(`document.querySelector('#exit-access-dialog .exit-access-refuse').textContent`) === '至少选一个会话或任务组，或者选“没有人”/“我的所有会话”。' && patches(P).length === pEmpty, '"Only these" with nobody picked is refused IN PLACE — no request sent');
  // THE RECT CENSUS at 860 / 360
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 860, height: 760, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  ok((await P.evalJs(rectCensusJs('#exit-access-dialog .dialog', '.exit-access-mode', 20))).ok, 'RECT CENSUS 860 px: the dialog inside the viewport, no horizontal overflow', await P.evalJs(rectCensusJs('#exit-access-dialog .dialog', '.exit-access-mode', 20)));
  await P.evalJs(`document.querySelector('#exit-access-dialog .dialog-close').click(); true`);
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  // open it on the phone the way the Machines card's button does (the same component)
  await P.evalJs(`(() => { localStorage.setItem('vibespace.agentsTab', 'machines'); app._showAgentsDialog({ forceModal: true }); return true; })()`);
  ok(await P.waitFor(`!!document.querySelector('.agents-mach-acc[data-host=${JSON.stringify(HOST)}] .agents-mach-who')`, 10000), 'the Machines card has 谁能使用它…');
  await P.evalJs(`document.querySelector('.agents-mach-acc[data-host=${JSON.stringify(HOST)}] .agents-mach-who').click(); true`);
  await P.waitFor(`!!document.querySelector('${sec('run')}')`, 8000);
  const r360 = await P.evalJs(rectCensusJs('#exit-access-dialog .dialog', '.exit-access-mode', 44));
  const pick360 = await P.evalJs(`[...document.querySelectorAll('${sec('run')} .pp-row')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height))`);
  ok(r360.ok && pick360.length > 0 && pick360.every((h) => h >= 40), 'RECT CENSUS 360 px: radios ≥ 44 px, picker rows ≥ 40 px, no horizontal overflow', { r360, pick360 });
  ok((await P.evalJs(labelRowCensusJs('#exit-access-dialog'))).ok, 'N-radio: on the phone every radio sits beside its words (not centred above them)', await P.evalJs(labelRowCensusJs('#exit-access-dialog')));
  await P.evalJs(`document.querySelector('#exit-access-dialog .dialog-close').click(); document.querySelector('#agents-dialog-overlay .dialog-close')?.click(); true`);
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  // ④ ask me: Allow / Deny, the card, the CLI, the refusals
  console.log('④ ask me each time — Allow runs it, Deny refuses it, the card in the chat, the CLI, the refusals');
  await P.evalJs(`app.attachSession(${JSON.stringify(S[1].sid)}, 'conv2', ${JSON.stringify(path.join(W.home, 'proj2'))}, { mode: 'chat', backend: 'claude' }); true`);
  await sleep(1500);
  await P.evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  await sleep(300);
  const apiOf = async (tok) => { const f = fs.readdirSync(W.stubDir).filter((x) => x.startsWith('env-')).map((x) => JSON.parse(fs.readFileSync(path.join(W.stubDir, x), 'utf8'))).find((e) => e.env.VIBESPACE_SESSION_TOKEN === tok); return f && f.env.VIBESPACE_API; };
  const runApi = (tok, cmd) => fetch(`${W.BASE}/api/agent/exit/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ machine: 'exmac', cmd }) }).then(async (r) => ({ status: r.status, j: await r.json() }));
  const tAsk = Date.now();
  const pRun = runApi(S[1].token, 'echo pong');
  const seen = await P.waitFor(`!!document.querySelector('#user-todos-popup .ut-item .ut-exit-allow')`, 3000);
  const dtAsk = Date.now() - tAsk;
  ok(seen && dtAsk <= 1500, `the For-you row appears with 允许 / 拒绝 (${dtAsk} ms after the agent asked)`);
  ok(await P.evalJs(`(() => { const r = document.querySelector('#user-todos-popup .ut-item .ut-exit-allow').closest('.ut-item'); return r.querySelector('.ut-exit-allow').textContent === '允许' && r.querySelector('.ut-exit-deny').textContent === '拒绝' && r.querySelector('.ut-exit-cmd').textContent === 'echo pong' && /^允许 ".*" 在 exmac 上运行命令？$/.test(r.querySelector('.ut-text').textContent); })()`), 'the row: 允许 "<conversation>" 在 exmac 上运行命令？ · the command in mono · 允许 / 拒绝');
  // naive-user N-ask: Allow / Deny rode the floated .ut-actions bar — 35 % opacity until the row is hovered (the
  // 60-second decision's Allow read as disabled). With the pointer AWAY from the row: full strength, their own line.
  await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 400 });
  await sleep(150);
  const effA = await P.evalJs(`(() => { const a = document.querySelector('#user-todos-popup .ut-item .ut-exit-allow'); let e = a, o = 1; while (e) { o *= Number(getComputedStyle(e).opacity); e = e.parentElement; } const it = a.closest('.ut-item'); return { o, inBar: !!a.closest('.ut-actions'), h: Math.round(a.getBoundingClientRect().height), hovered: it.matches(':hover'), afterCmd: !!a.closest('.ut-exit-answer') && it.querySelector('.ut-exit-cmd').compareDocumentPosition(a) === Node.DOCUMENT_POSITION_FOLLOWING }; })()`);
  ok(effA.o === 1 && !effA.inBar && !effA.hovered && effA.h >= 24 && effA.afterCmd, 'N-ask: with the pointer away from the row, 允许 is at full strength (effective opacity 1, 24 px, its own line under the command — not in the hover-dimmed bar)', effA);
  ok(await P.realClick(`#user-todos-popup .ut-item .ut-exit-allow`), 'a real click on 允许');
  const ran = await pRun;
  ok(ran.status === 200 && ran.j.code === 0 && /pong/.test(ran.j.stdout) && ran.j.asked === true, 'Allow ⇒ the DEVICE ran it (exit 0, stdout pong)', ran);
  ok(await P.waitFor(`[...document.querySelectorAll('.chat-vs-notice')].some((c) => /Machines · exmac/.test(c.textContent) && /ran \`?echo pong\`? on exmac — exit 0/.test(c.textContent))`, 8000), 'the chat window shows the "VibeSpace · Machines · exmac" card: ran `echo pong` on exmac — exit 0 · …', await P.evalJs(`[...document.querySelectorAll('.chat-vs-notice')].map((c) => c.textContent).join(' | ')`));
  ok(/已允许/.test(await P.evalJs(`document.getElementById('user-todos-popup').textContent`)) || (await W.api('GET', '/api/user-todos')).j.todos.resolved?.some?.((i) => i.resolvedBy === 'allowed'), 'the item is resolved allowed');
  ok(await P.waitFor(`/^最近一次运行：echo pong — .*，退出码 0$/.test(${rowOf}?.querySelector('.mounts-exit-last')?.textContent || '')`, 8000), 'the machine row shows the last run (最近一次运行：echo pong — <who>, <when>, 退出码 0)', await P.evalJs(`${rowOf}?.querySelector('.mounts-exit-last')?.textContent`));
  // naive-user N-row: at the DEFAULT sidebar width (this page: 1280 px) the machine row showed no name (0 px — eight
  // icons at flex-shrink 0 took the row), four icons (the exit icon among them) sat past the panel's edge, and the exit
  // summary + the last run were cut "命令 …". THE ROW CENSUS + a patched copy of style.css as the control.
  {
    await openRemote(P);
    await P.evalJs(`(() => { const p = document.querySelector('.mounts-panel'); if (p) p.scrollLeft = 0; return true; })()`);
    await sleep(200);
    const rc = await P.evalJs(machineRowCensusJs(HOST));
    ok(rc.ok && rc.name === 'exmac' && rc.btns === 8 && rc.lines.length === 2, `N-row: the row shows its name (${rc.nameW} px), all ${rc.btns} icons inside it, both exit lines whole, no sideways scroll (row ${rc.rowW} px)`, rc);
    const real = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    ok(ROW_FIX_REVERT.every(([fixed]) => real.split(fixed).length === 2), 'N-row: the fix\'s rules are in public/style.css once each (the control\'s anchors)');
    const MUTR = mutantCopies('exitrow', REPO);
    const fPre = path.join(MUTR.dir, `style-rowprefix-${process.pid}.css`); fs.writeFileSync(fPre, ROW_FIX_REVERT.reduce((x, [fixed, old]) => x.replace(fixed, old), real)); MUTR.files.push(fPre);
    await P.evalJs(swapStyleJs(fs.readFileSync(fPre, 'utf8')));
    await sleep(250);
    const pre = await P.evalJs(machineRowCensusJs(HOST));
    ok(!pre.ok && pre.nameW < 30 && !pre.btnsInside, `CONTROL (N-row): the pre-fix style.css — name ${pre.nameW} px, icons past the edge, an exit line cut, the panel ${pre.panelX} px wider than itself`, pre);
    await P.evalJs(swapStyleJs(real));
    await sleep(250);
    ok((await P.evalJs(machineRowCensusJs(HOST))).ok, '…and the real style.css shows it all again');
  }
  // verify-r4 F4: THE WHOLE COMMAND, AS IT RUNS, where the user decides. Pre-fix the row showed a 120-char head with
  // every line break turned into a space, clipped to three lines with no mark (a `curl … | sh` last line invisible above
  // Allow), and the For-you window rendered the command as MARKDOWN (`*important*` lost its asterisks, `# …` became a
  // heading, the lines folded into one). Now: the row's <pre> is the command byte for byte and scrolls; the window's too.
  {
    const CMD4 = `echo "*important*" > /tmp/vs-exitui-f4-${process.pid}\n# clean up the old ones\necho ${'x'.repeat(150)} | wc -c`;
    const p4 = runApi(S[1].token, CMD4);
    if (!(await P.evalJs(`(document.getElementById('user-todos-popup')?.getClientRects().length || 0) > 0`))) /* position:fixed — offsetParent is always null */ { await P.evalJs(`document.getElementById('taskbar-user-todos').click(); true`); await sleep(300); }
    ok(await P.waitFor(`!!document.querySelector('#user-todos-popup .ut-item .ut-exit-allow')`, 5000), 'F4: a three-line command waits in For you');
    const r4 = await P.evalJs(`(() => { const it = document.querySelector('#user-todos-popup .ut-item .ut-exit-allow').closest('.ut-item'); const c = it.querySelector('.ut-exit-cmd'); const cs = getComputedStyle(c); c.scrollTop = c.scrollHeight; return { id: it.dataset.id, text: c.textContent, tag: c.tagName, ws: cs.whiteSpace, oy: cs.overflowY, fold: !!it.querySelector('.ut-detail-exp'), clip: Math.max(0, c.scrollHeight - c.clientHeight - 1), above: !!(c.compareDocumentPosition(it.querySelector('.ut-exit-allow')) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`);
    ok(r4.text === CMD4 && r4.tag === 'PRE' && r4.ws === 'pre-wrap' && r4.oy === 'visible' && r4.clip === 0 && r4.above && !r4.fold, 'F4: the row shows the WHOLE command byte for byte, its lines kept, ALL of it (no inner scroll, nothing clipped) — above 允许, with no folded copy below', { ...r4, text: r4.text.slice(0, 60) });
    await P.evalJs(`app.openInbox({ itemId: ${JSON.stringify(r4.id)} }); true`);
    ok(await P.waitFor(`!!document.querySelector('.iw-exit-cmd')?.offsetParent`, 6000), 'F4: the For-you window shows the command');
    const w4 = await P.evalJs(`(() => { const d = document.querySelector('.iw-exit-cmd').closest('.iw-detail'); return { text: document.querySelector('.iw-exit-cmd').textContent, md: !!d.querySelector('em, strong, h1, h2, h3, p') }; })()`);
    ok(w4.text === CMD4 && !w4.md, 'F4: …VERBATIM (a <pre>, no markdown: the asterisks and the # line are the command\'s own)', { md: w4.md, text: w4.text.slice(0, 50) });
    // CONTROL (F4, the window): a page whose bundle renders the detail as markdown again ⇒ the asterisks go, # is a heading
    const MUTW = mutantCopies('exitwin', REPO);
    const winSrc = fs.readFileSync(path.join(REPO, 'src/lib/inbox-window.js'), 'utf8');
    const winPre = winSrc.replace("const isCmd = !!(it.action && it.action.type === 'exit-run-ask');", 'const isCmd = false;');
    ok(winPre !== winSrc, 'CONTROL (F4 window): the patch applies');
    const Q = await W.openPage({ width: 1280, height: 820, lang: 'zh', bundleText: await buildPatchedBundle(MUTW, 'src/lib/inbox-window.js', winPre, 'mdcmd') });
    await Q.evalJs(`app.openInbox({ itemId: ${JSON.stringify(r4.id)} }); true`);
    await Q.waitFor(`!!document.querySelector('.iw-detail')?.offsetParent`, 8000);
    const q4 = await Q.evalJs(`(() => { const d = document.querySelector('.iw-detail'); return { text: d.innerText, h1: !!d.querySelector('h1'), em: !!d.querySelector('em') }; })()`);
    ok(q4.h1 && q4.em && !q4.text.includes('*important*'), 'CONTROL (F4 window): the pre-fix pane renders `# clean up…` as a heading and drops the asterisks — the leg goes red', q4);
    await Q.cdp('Page.close').catch(() => {});
    await P.evalJs(`(() => { const w = [...document.querySelectorAll('.window')].find((x) => x.querySelector('.iw-detail')); w?.querySelector('.win-close')?.click(); return true; })()`);
    await sleep(300);
    const ask4 = ((await W.api('GET', '/api/exits/asks')).j.asks || [])[0];
    const ans4 = await W.api('POST', `/api/exits/asks/${ask4.askId}`, { answer: 'deny' });
    const res4 = await p4;
    ok(ans4.status === 200 && res4.status === 403 && res4.j.code === 'ask_denied', 'F4: …and 拒绝 through the route refuses it (nothing ran)', { ans: ans4.status, run: res4.status });
    if (!(await P.evalJs(`(document.getElementById('user-todos-popup')?.getClientRects().length || 0) > 0`))) /* position:fixed — offsetParent is always null */ { await P.evalJs(`document.getElementById('taskbar-user-todos').click(); true`); await sleep(300); }
  }
  // the REAL CLI + Deny
  const api2 = await apiOf(S[1].token);
  const cli = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-exit'), 'run', 'exmac', '--', 'echo', 'nope'], { env: { ...process.env, VIBESPACE_API: api2 || W.BASE, VIBESPACE_SESSION_TOKEN: S[1].token } });
  const cliOut = []; cli.stdout.on('data', (d) => cliOut.push(d)); cli.stderr.on('data', (d) => cliOut.push(d));
  const cliDone = new Promise((r) => cli.on('exit', (code) => r(code)));
  ok(await P.waitFor(`!!document.querySelector('#user-todos-popup .ut-item .ut-exit-deny')`, 5000), 'the CLI\'s run is waiting in For you');
  await sleep(1300); // the CLI's "waiting for the user's approval" line fires after 1 s
  // verify-r4 F5: a TYPED REPLY is not an answer. Pre-fix the row offered Reply, and a reply resolved the item — which
  // settles the ask NOT allowed: "可以，允许" typed as a reply DENIED the command (reproduced: 403 ask_denied, audit
  // why item-done-by-reply) while the agent read the "yes" as a new message. Now: no Reply on the row, none in the
  // For-you window (it says to answer with 允许 / 拒绝 there), and the route refuses one by name — the ask keeps waiting.
  {
    const f5 = await P.evalJs(`(() => { const r = document.querySelector('#user-todos-popup .ut-item .ut-exit-deny').closest('.ut-item'); return { reply: !!r.querySelector('.ut-reply-btn'), chips: r.querySelectorAll('.ut-opt').length, id: r.dataset.id }; })()`);
    ok(!f5.reply && f5.chips === 0, 'F5: the exit ask row offers NO Reply (and no option chips) — 允许 / 拒绝 are its answer', f5);
    const rep5 = await W.api('POST', `/api/user-todos/${f5.id}/reply`, { text: '可以，允许它运行' });
    const asks5 = (await W.api('GET', '/api/exits/asks')).j.asks || [];
    ok(rep5.status === 409 && rep5.j.code === 'exit_ask' && asks5.length === 1, 'F5: a typed reply ⇒ 409 exit_ask and the ask is STILL waiting (pre-fix: 200 — the item resolved, the command denied)', { status: rep5.status, code: rep5.j.code, asks: asks5.length });
    await P.evalJs(`app.openInbox({ itemId: ${JSON.stringify(f5.id)} }); true`);
    ok(await P.waitFor(`!!document.querySelector('.iw-act-exit')?.offsetParent && !!document.querySelector('.iw-reply-why')?.offsetParent`, 6000), 'F5: the For-you window shows the item with 允许 / 拒绝');
    const w5 = await P.evalJs(`({ why: document.querySelector('.iw-reply-why')?.textContent || '', box: !!document.querySelector('.iw-reply')?.offsetParent })`);
    ok(w5.why === '请用“允许”或“拒绝”回答 — 输入的回复不算回答' && !w5.box, 'F5: …and no reply box — it says 请用“允许”或“拒绝”回答 — 输入的回复不算回答', w5);
    await P.evalJs(`(() => { const w = [...document.querySelectorAll('.window')].find((x) => x.querySelector('.iw-reply-why')); w?.querySelector('.win-close, .window-close, [data-action="close"]')?.click(); return true; })()`);
    await sleep(300);
    if (!(await P.evalJs(`(document.querySelector('#user-todos-popup .ut-item .ut-exit-deny')?.getClientRects().length || 0) > 0`))) { await P.evalJs(`document.getElementById('taskbar-user-todos').click(); true`); await sleep(300); }
  }
  ok(await P.realClick(`#user-todos-popup .ut-item .ut-exit-deny`), 'a real click on 拒绝');
  const cliCode = await cliDone;
  const cliText = Buffer.concat(cliOut).toString();
  ok(cliCode === 1 && /the user did not allow `echo nope` on "exmac"/.test(cliText), 'the REAL vibespace-exit CLI exits 1 naming the refusal', cliText);
  ok(/# waiting for the user's approval \(up to 60 s\)…/.test(cliText), '…after saying it waits for the user\'s approval', cliText);
  // an ungranted conversation (3) and a job token
  await P.evalJs(`app.attachSession(${JSON.stringify(S[2].sid)}, 'conv3', ${JSON.stringify(path.join(W.home, 'proj3'))}, { mode: 'chat', backend: 'claude' }); true`);
  await sleep(1500);
  const r3 = await runApi(S[2].token, 'id');
  ok(r3.status === 403 && r3.j.code === 'not_granted' && r3.j.grant === 'run' && /the user can allow it under "Who can use it"/.test(r3.j.error) && !/conv[23]|proj|claude:|f01d0000/.test(r3.j.error), 'an ungranted conversation ⇒ 403 not_granted naming the grant and the user, never another conversation', r3.j);
  ok(await P.waitFor(`[...document.querySelectorAll('.chat-vs-notice')].some((c) => /did not run \`?id\`? on exmac — this conversation may not run commands there/.test(c.textContent))`, 8000), '…and its chat shows the card "did not run `id` on exmac — this conversation may not run commands there"');
  const rj = await fetch(`${W.BASE}/api/agent/exit/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jbt_fakejob' }, body: JSON.stringify({ machine: 'exmac', cmd: 'id' }) });
  const rjj = await rj.json();
  ok(rj.status === 401 && rjj.code === 'session_token_required' && rjj.error === 'Background Work jobs cannot use exits — run it from a live conversation', 'a jbt_ token ⇒ 401 session_token_required (attack 3)', rjj);
  const audit = (await W.api('GET', `/api/exits/audit?host=${HOST}&limit=50`)).j.lines;
  ok(audit.some((l) => l.verb === 'run' && l.ok && l.asked) && audit.some((l) => l.verb === 'ask-answered' && l.answer === 'denied') && audit.some((l) => l.refusal === 'not_granted'), 'the audit has the run, the denied ask and the refusal');
  // ── ⑤ lane-exit-run-output E3 / E4 (2026-10-01, the owner: "执行了指令怎么看不到回复。侧边栏也看不到指令和结果历史"): the card
  //    carries the run's output (the first lines of stderr in mono + 显示输出 holding both stored heads, toggled IN PLACE),
  //    the machine's 最近的命令… list draws from a fresh GET and patches KEYED rows live off the exit-audit broadcast, the
  //    row states the device's platform, the CLI's `runs` prints the same heads ──
  console.log('⑤ lane-exit-run-output: the card\'s output block + the machine\'s command list + the platform on the row');
  {
    const w5 = await W.api('PATCH', `/api/hosts/${HOST}/exit-access`, { run: { mode: 'everyone', ask: false } });
    ok(w5.status === 200, 'commands → everyone, no ask (this leg\'s world)');
    const r5 = await runApi(S[1].token, 'echo out-line; echo ERR-LINE-1 1>&2; echo ERR-LINE-2 1>&2; exit 3');
    ok(r5.status === 200 && r5.j.code === 3 && /ERR-LINE-1/.test(r5.j.stderr) && r5.j.interpreter === 'sh' && r5.j.platform === process.platform, 'the REAL daemon ran it as {shell} through sh -lc: exit 3, both streams, interpreter sh, the platform stated', r5.j);
    const cardSel = `[...document.querySelectorAll('.chat-vs-notice')].find((c) => /exit 3/.test(c.textContent) && c.querySelector('.chat-exit-out'))`;
    ok(await P.waitFor(`!!${cardSel}`, 8000), 'the chat card carries the output block');
    const nCards = await P.evalJs(`document.querySelectorAll('.chat-vs-notice').length`);
    const c5 = await P.evalJs(`(() => { const c = ${cardSel}; const pre = c.querySelector('.chat-exit-out'); const det = c.querySelector('.chat-exit-out-full'); return { head: c.querySelector('.chat-text')?.textContent || '', preview: pre.textContent, stream: pre.dataset.stream, mono: getComputedStyle(pre).fontFamily, summary: det && det.querySelector('summary').textContent, open: det && det.open, full: det ? [...det.querySelectorAll('.chat-exit-out-all')].map((p) => p.textContent) : [] }; })()`);
    ok(/exit 3 · \d+\.\d s/.test(c5.head) && c5.preview === 'ERR-LINE-1\nERR-LINE-2' && c5.stream === 'stderr' && /mono/i.test(c5.mono) && c5.summary === '显示输出' && c5.open === false && c5.full.join('|') === 'out-line\n|ERR-LINE-1\nERR-LINE-2\n', 'E3: the exit line, stderr\'s lines in mono under it, 显示输出 (closed) holding both stored heads whole', c5);
    ok(await P.realClick(`(() => { const c = ${cardSel}; return c.querySelector('.chat-exit-out-full > summary'); })()`), 'a real click on 显示输出');
    const t5 = await P.evalJs(`(() => { const c = ${cardSel}; return { open: c.querySelector('.chat-exit-out-full').open, n: document.querySelectorAll('.chat-vs-notice').length, stdoutShown: !!c.querySelector('.chat-exit-out-all')?.getClientRects().length }; })()`);
    ok(t5.open === true && t5.n === nCards && t5.stdoutShown, 'the expander opens IN PLACE: the same card (no second card, none re-created), the stored stdout visible', t5);
    // the row states the device's platform (the dial headers' statement, kept on the record)
    await openRemote(P);
    const plat5 = await P.evalJs(`${rowOf}?.querySelector('.mounts-dial-state')?.textContent || ''`);
    ok(/Linux/.test(plat5), 'E1: the machine row names the device\'s platform (Linux — the daemon runs on this box)', plat5);
    // 最近的命令… from the "Who can use it" dialog: a fresh GET, keyed rows, the stderr head behind a row
    await P.realClick(exitIcon);
    ok(await P.waitFor(`!!document.querySelector('#exit-access-dialog .exit-access-runs')`, 8000), 'the dialog offers 最近的命令…');
    await P.realClick('#exit-access-dialog .exit-access-runs');
    ok(await P.waitFor(`document.querySelectorAll('#exit-runs-dialog .exit-runs-row').length >= 2`, 8000), 'E4: 最近的命令… opens the machine\'s command list with its rows');
    const rows5 = await P.evalJs(`[...document.querySelectorAll('#exit-runs-dialog .exit-runs-row')].map((r) => ({ outcome: r.dataset.outcome, cmd: r.querySelector('.exit-runs-cmd').textContent, verdict: r.querySelector('.exit-runs-verdict').textContent, who: r.querySelector('.exit-runs-who').textContent, stderr: (r.querySelector('.exit-runs-out .exit-runs-pre') || {}).textContent || '' }))`);
    ok(rows5[0] && rows5[0].cmd.startsWith('echo out-line') && rows5[0].verdict === '退出码 3' && rows5[0].who.length > 0 && /ERR-LINE-1/.test(rows5[0].stderr) && rows5.some((r) => r.cmd === 'echo pong' && r.verdict === '退出码 0') && rows5.some((r) => r.outcome === 'refused'), 'the rows: newest first — the conversation, the command, 退出码 3, the stderr head behind the row; the earlier run and a refused attempt listed too', rows5);
    ok(await P.evalJs(`/命令在 sh 下运行（Linux）/.test(document.querySelector('#exit-runs-dialog .exit-runs-platform')?.textContent || '')`), 'the list says what the machine runs commands under (sh, Linux)');
    // a row opened, then a NEW run lands on top LIVE (the exit-audit broadcast): the opened row is the SAME node, still open
    await P.evalJs(`(() => { const r = document.querySelector('#exit-runs-dialog .exit-runs-row'); r.open = true; r._mark = 'kept'; return true; })()`);
    const r6 = await runApi(S[1].token, 'echo second-run');
    ok(r6.status === 200 && r6.j.code === 0, 'a second run while the list is open');
    ok(await P.waitFor(`(document.querySelector('#exit-runs-dialog .exit-runs-row .exit-runs-cmd')?.textContent || '') === 'echo second-run'`, 6000), 'its row lands on top LIVE (the exit-audit broadcast, no re-read)');
    const kept = await P.evalJs(`(() => { const rows = [...document.querySelectorAll('#exit-runs-dialog .exit-runs-row')]; const k = rows.find((r) => r._mark === 'kept'); return { kept: !!k, open: k && k.open, second: rows[0].querySelector('.exit-runs-verdict').textContent, stdout: (rows[0].querySelector('.exit-runs-pre') || {}).textContent || '', n: rows.length }; })()`);
    ok(kept.kept && kept.open === true && kept.second === '退出码 0' && /second-run/.test(kept.stdout), 'the opened row is the SAME node and still open; the new row carries its stdout head', kept);
    await P.evalJs(`document.querySelector('#exit-runs-dialog .dialog-close')?.click(); document.querySelector('#exit-access-dialog .dialog-close')?.click(); true`);
    // the Machines card's 命令… opens the same list
    await P.evalJs(`(() => { localStorage.setItem('vibespace.agentsTab', 'machines'); app._showAgentsDialog({ forceModal: true }); return true; })()`);
    ok(await P.waitFor(`!!document.querySelector('.agents-mach-acc[data-host=${JSON.stringify(HOST)}] .agents-mach-runs')`, 10000), 'the Machines card has 命令…');
    ok(await P.evalJs(`/Linux/.test(document.querySelector('.agents-mach-acc[data-host=${JSON.stringify(HOST)}] .agents-mach-line2')?.textContent || '')`), '…and its second line names the platform');
    await P.evalJs(`document.querySelector('.agents-mach-acc[data-host=${JSON.stringify(HOST)}] .agents-mach-runs').click(); true`);
    ok(await P.waitFor(`document.querySelectorAll('#exit-runs-dialog .exit-runs-row').length >= 3`, 8000), '命令… opens the list from the Machines card too');
    await P.evalJs(`document.querySelector('#exit-runs-dialog .dialog-close')?.click(); document.querySelector('#agents-dialog-overlay .dialog-close')?.click(); true`);
    // the CLI's `runs`: the conversation's OWN runs, the same heads
    const cliR = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-exit'), 'runs', 'exmac'], { env: { ...process.env, VIBESPACE_API: api2 || W.BASE, VIBESPACE_SESSION_TOKEN: S[1].token } });
    const cliROut = []; cliR.stdout.on('data', (d) => cliROut.push(d)); cliR.stderr.on('data', (d) => cliROut.push(d));
    const cliRCode = await new Promise((r) => cliR.on('exit', (code) => r(code)));
    const cliRText = Buffer.concat(cliROut).toString();
    ok(cliRCode === 0 && /exit 0 · [\d.]+ s · sh  echo second-run/.test(cliRText) && /exit 3 · [\d.]+ s · sh  echo out-line/.test(cliRText) && /stderr: ERR-LINE-1/.test(cliRText) && !/conv3|id\b.*refused/.test(cliRText), 'the REAL vibespace-exit `runs exmac` lists this conversation\'s runs with their verdicts and the first line of output — never another conversation\'s', cliRText);
    const au5 = (await W.api('GET', `/api/hosts/${HOST}/exit-runs?limit=10`)).j;
    ok(au5.runs && au5.runs[0].cmd === 'echo second-run' && au5.runs[1].stderr === 'ERR-LINE-1\nERR-LINE-2\n' && au5.machine.interpreter === 'sh', 'the owner\'s GET /api/hosts/:id/exit-runs carries the heads the daemon produced', au5.runs && au5.runs.slice(0, 2));
    // verify r1 F4: the preview never grows the card past its bound (three lines of 1 365 bytes wrapped to ~100 rows), and
    // a head that is only blank lines is said as such with its cut (pre-fix "no output", the cut unsaid)
    const r7 = await runApi(S[1].token, 'head -c 3000 /dev/zero | tr "\\0" x; echo; echo second; echo third; echo fourth');
    ok(r7.status === 200 && r7.j.code === 0, 'a run whose first line is 3 000 characters');
    const longSel = `[...document.querySelectorAll('.chat-vs-notice .chat-exit-out')].find((p) => p.textContent.startsWith('xxxxxxxx'))`;
    ok(await P.waitFor(`!!${longSel}`, 8000), 'its card carries the preview');
    const g7 = await P.evalJs(`(() => { const p = ${longSel}; const cs = getComputedStyle(p); return { h: p.offsetHeight, sh: p.scrollHeight, maxH: cs.maxHeight, ov: cs.overflowY }; })()`);
    ok(g7.h <= 170 && g7.sh > g7.h && g7.maxH === '160px' && g7.ov === 'auto', 'the preview is bounded at 160 px and scrolls (pre-fix: the card grew by the wrapped line)', g7);
    const r8 = await runApi(S[1].token, 'yes "" | head -c 5000');
    ok(r8.status === 200 && r8.j.code === 0, 'a run printing 5 000 newlines');
    const blankSel = `[...document.querySelectorAll('.chat-vs-notice .chat-exit-none')].find((d) => /没有可见输出/.test(d.textContent))`;
    ok(await P.waitFor(`!!${blankSel}`, 8000) && await P.evalJs(`/^没有可见输出 · 在 4 KiB 处截断$/.test(${blankSel}.textContent)`), 'its card says the output is blank AND cut (pre-fix "没有输出", the cut unsaid)');
    // verify r1 V5: the command list's output block is bounded too (style.css's one pin — a row's <pre> scrolls at 320 px)
    await P.realClick(exitIcon);
    ok(await P.waitFor(`!!document.querySelector('#exit-access-dialog .exit-access-runs')`, 8000), 'the dialog again');
    await P.realClick('#exit-access-dialog .exit-access-runs');
    ok(await P.waitFor(`document.querySelectorAll('#exit-runs-dialog .exit-runs-row').length >= 3`, 8000), 'the list again');
    const pre9 = await P.evalJs(`(() => { const rows = [...document.querySelectorAll('#exit-runs-dialog .exit-runs-row')]; const r = rows.find((x) => (x.querySelector('.exit-runs-cmd')?.title || '').startsWith('head -c 3000')); if (!r) return null; r.open = true; const p = r.querySelector('.exit-runs-pre'); const cs = getComputedStyle(p); return { maxH: cs.maxHeight, ov: cs.overflowY, h: p.offsetHeight, sh: p.scrollHeight }; })()`);
    ok(pre9 && pre9.maxH === '320px' && pre9.ov === 'auto' && pre9.h <= 330 && pre9.sh > pre9.h, 'a row\'s output block is bounded at 320 px and scrolls', pre9);
    await P.evalJs(`document.querySelector('#exit-runs-dialog .dialog-close')?.click(); document.querySelector('#exit-access-dialog .dialog-close')?.click(); true`);
  }
  ok(P.errors.length === 0 && P2.errors.length === 0, 'no page exception', [...P.errors, ...P2.errors].slice(0, 3));
  try { process.kill(W.lockPid(pair.root), 'SIGTERM'); } catch { }
} catch (e) {
  fail++; console.error('  ✗ threw:', e.stack || e.message);
}
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);

// chat-needs-kit.mjs — what test-chat-needs-card-chrome and test-chat-needs-strip-chrome share beyond their boot harness
// (B-419b split the 161-leg suite at ⑫|⑬): the «round five» conversation helpers and the desktop page's load — ONE copy,
// imported by both, so the two halves never drift.
/** the round-five helpers over the suite's own hub socket, work dir, user-todos API and chat-window finder */
export function chatNeedsKit({ hubWs, WORK, api, sleep, CHAT }) {
  const J = (x) => JSON.stringify(x);
  const newConv = (tag) => new Promise((res) => { // (⑧'s \`frames\` shadows the hub's frame list here — the hub's answer heard directly)
    const on = (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { } if (m && m.type === 'created' && m.reqId === 'cn-' + tag) { hubWs.off('message', on); res(m.sessionId); } };
    hubWs.on('message', on); hubWs.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'cn-' + tag })); setTimeout(() => { hubWs.off('message', on); res(null); }, 15000); });
  const sayTo = (sid, text) => hubWs.send(J({ type: 'chat-input', sessionId: sid, text }));
  const byText = async (re, n, ms = 20000) => { const t0 = Date.now(); let o = []; while (Date.now() - t0 < ms) { o = (await api()).open.filter((i) => re.test(i.text)); if (o.length >= n) break; await sleep(200); } return o.sort((a, b) => a.createdAt - b.createdAt); };
  const openOnly = (P, sid) => P.evalJs(`(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) if (w.type === 'chat' && app.sessions.get(w.id)?.sessionId !== ${J(sid)}) app.wm.closeWindow(w.id); if (!${CHAT(sid)}) app.attachSession(${J(sid)}, 'round five', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  const toConv = async (P, sid, ids, w, h, touch, max = !touch) => {
    await P.device(w, h, touch ? undefined : { mouse: true }); await P.load(); await openOnly(P, sid);
    if (max) { await P.waitFor(`!!${CHAT(sid)}`, 8000); await P.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (${J(max)} === true) { if (!w.isMaximized) app.wm.toggleMaximize(w.id); } else { if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, ${J(max)}); } return true; })()`); }
    await P.waitFor(`${J(ids)}.every((id) => { const c = document.querySelector('.cn-card[data-item="' + id + '"]'); return !!c && c.getClientRects().length > 0; }) && !app.phoneHome?.shown?.()`, 15000); await sleep(900);
  };
  return { J, newConv, sayTo, byText, openOnly, toConv };
}
/** the desktop page both halves start their sections on: 1280×800 with a mouse, this tree's own bundle */
export const loadDesk = async (P) => { await P.device(1280, 800, { mouse: true }); await P.load(); };

// THE READERS' SIXTEEN SCENES on REAL Chrome (lane chrome-157, vault-login round 32's persisted hold — 主开发's real-browser claim,
// 2026-11-15; the scenes of int359/acc-401/verdict-vl33-wf_29a7b310.json «forTheRealBrowserClaim»). What real Chrome does where the
// fake kernel assumed it, and what the hub does then. Driven from scripts/test-vault-login-chrome.mjs on the suite's own browser (a
// scratch profile it launched; never a real site, never a profile of the owner's): every scene on a fresh tab, the pages of a loopback
// server of its own (no `no-store`, so the back-forward cache may keep a page), a SHORT stand-in value (masking cannot hide a leak).
// Each scene prints its facts — never the value — and asserts the law the hub relies on.
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdpClient(WSBase, url) {
  return new Promise((resolve, reject) => {
    const ws = new WSBase(url, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    let seq = 0;
    const pend = new Map();
    const frames = [];
    ws.on('message', (raw) => {
      const s = String(raw);
      let m = null; try { m = JSON.parse(s); } catch { return; }
      if (m.id && pend.has(m.id)) { const fn = pend.get(m.id); pend.delete(m.id); fn(m); return; }
      if (frames.length < 20000) frames.push({ at: Date.now(), raw: s, m });
    });
    ws.once('error', reject);
    ws.once('open', () => resolve({
      ws, frames,
      call: (method, params = {}, sessionId = undefined, ms = 8000) => new Promise((r) => {
        const id = ++seq;
        const t = setTimeout(() => { pend.delete(id); r({ id, timeout: true }); }, ms);
        pend.set(id, (m) => { clearTimeout(t); r(m); });
        try { ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch (e) { clearTimeout(t); pend.delete(id); r({ id, error: { message: String(e) } }); }
      }),
      close: () => { try { ws.close(); } catch { /* */ } },
    }));
  });
}

export async function runReadersScenes({ w, ok, D, L, VE, LF, WSBase, until }) {
  const SPW = ['Sq', '6!', 'z', String(crypto.randomInt(1, 9))].join('');   // (short ON PURPOSE, built at runtime: under the mask's floor)
  const LPW = ['Lr', '7#', 'qa', 'Wd', crypto.randomBytes(3).toString('hex')].join('');   // (12 bytes: at or above the floor — scene 4 only)
  const spell = (v) => [v, encodeURIComponent(v), new URLSearchParams([['a', v]]).toString().slice(2)];
  const carriesV = (v, x) => { const t = typeof x === 'string' ? x : JSON.stringify(x); return spell(v).some((f) => t.includes(f)); };
  const carries = (x) => carriesV(SPW, x);
  const hide = (x) => { let t = typeof x === 'string' ? x : JSON.stringify(x); for (const v of [LPW, SPW]) for (const f of spell(v)) t = t.split(f).join('«v»'); return t; };
  const say = (k, facts) => console.log(`    · ${k}: ${hide(facts).slice(0, 900)}`);
  let sibPort = 0;   // (the https server of the sibling-host must-hold: a fill on http is refused off localhost, and Chrome names no registrable domain for *.localhost)
  const handler = (req, res) => {
    const u = new URL(req.url, 'http://x');
    const page = (body, title) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`); };
    if (req.method === 'POST') {
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => {
        posts.push({ host: String(req.headers.host || ''), path: u.pathname, body });   // (our own loopback server: the login FINISHED when the credential arrives here)
        if (u.pathname === '/sib/session') { res.writeHead(303, { location: `https://www.example.com:${sibPort}/sib/welcome` }); res.end(); return; }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
      });
      return;
    }
    // 主开发's must-holds (2026-11-15 09:16Z) — ordinary logins that must FINISH: a form posting to a sibling host of the same site, a
    // single-page login, a two-step login in one document, a user-name-first login
    if (u.pathname === '/sib/login') return page(`<form method="POST" action="https://auth.example.com:${sibPort}/sib/session"><input id="spw" name="pw" type="password"><button id="go" type="submit">Sign in</button></form>`, 'Sign in');
    if (u.pathname === '/sib/welcome' || u.pathname === '/usr/welcome') return page('<h1 id="done">Signed in</h1>', 'Signed in');
    if (u.pathname === '/spa/login') return page('<div id="app"><input id="spw" type="password"><button id="go" onclick="go()">Sign in</button></div><script>async function go(){const v=document.getElementById("spw").value;await fetch("/spa/session",{method:"POST",body:"pw="+encodeURIComponent(v)});document.getElementById("app").innerHTML="<h1 id=done>Welcome to the app</h1>";history.pushState({},"","/spa/home");}</script>', 'App');
    if (u.pathname === '/two/login') return page('<div id="app"><input id="spw" type="password"><button id="go" onclick="go()">Sign in</button></div><script>async function go(){const v=document.getElementById("spw").value;await fetch("/two/session",{method:"POST",body:"pw="+encodeURIComponent(v)});document.getElementById("app").innerHTML="<label>Code <input id=code type=text></label><button id=verify onclick=ver()>Verify</button>";}async function ver(){await fetch("/two/verify",{method:"POST",body:"code="+encodeURIComponent(document.getElementById("code").value)});document.getElementById("app").innerHTML="<h1 id=done>Signed in</h1>";}</script>', 'Two steps');
    if (u.pathname === '/usr/login') return page('<div id="app"><input id="user" name="user" type="text"><button id="next" onclick="nx()">Next</button></div><script>function nx(){document.getElementById("app").insertAdjacentHTML("beforeend","<input id=spw type=password><button id=go onclick=go()>Sign in</button>");}async function go(){await fetch("/usr/session",{method:"POST",body:"u="+encodeURIComponent(document.getElementById("user").value)+"&pw="+encodeURIComponent(document.getElementById("spw").value)});location.href="/usr/welcome";}</script>', 'Sign in');
    if (u.pathname === '/s/login') return page('<form id="f" method="GET" action="/s/welcome"><input id="spw" name="pw" type="password"><button id="go" type="submit">Sign in</button></form><script>window.__ps=[];addEventListener("pageshow",(e)=>window.__ps.push(e.persisted?"bf":"new"))</script>', 'Sign in');
    if (u.pathname === '/s/welcome' || u.pathname === '/s/home' || u.pathname === '/s/dashboard') return page('<p>ok</p>', 'Welcome');
    if (u.pathname === '/s/titled') return page('<p>t</p>', 'A later title');
    if (u.pathname === '/s/busy') return page('<input id="spw" type="password"><script>const t0=Date.now();while(Date.now()-t0<3000){}</script>', 'Busy');
    res.writeHead(404); res.end();
  };
  const sp = http.createServer(handler);
  await new Promise((r) => sp.listen(0, '127.0.0.1', r));
  // a self-signed certificate made here for www.example.com and auth.example.com (IANA's reserved name; the scratch browser maps
  // *.example.com to loopback and accepts this certificate — test-vault-login-chrome's launch args; nothing leaves the box)
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-sib-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(certDir, 'k.pem'), '-out', path.join(certDir, 'c.pem'), '-days', '1', '-subj', '/CN=www.example.com', '-addext', 'subjectAltName=DNS:www.example.com,DNS:auth.example.com'], { stdio: 'ignore', timeout: 20000 });
  const ssp = https.createServer({ key: fs.readFileSync(path.join(certDir, 'k.pem')), cert: fs.readFileSync(path.join(certDir, 'c.pem')) }, handler);
  await new Promise((r) => ssp.listen(0, '127.0.0.1', r));
  sibPort = ssp.address().port;
  const SO = `http://127.0.0.1:${sp.address().port}`;
  const SIBO = `https://www.example.com:${sibPort}`;   // (the scratch browser resolves *.example.com to loopback: test-vault-login-chrome's host-resolver rule)
  const KEYS = 'bk-0000f1a1';
  const facts = {};
  const posts = [];
  w.logins.addOwn({ origin: SO, username: 'user-a', password: SPW }, { who: 'owner' });
  w.logins.grant(`web-login:${SO}#user-a`, 'any-account', 'session:conv-1');
  w.logins.addOwn({ origin: SO, username: 'user-b', password: LPW }, { who: 'owner' });
  w.logins.grant(`web-login:${SO}#user-b`, 'any-account', 'session:conv-1');
  w.logins.addOwn({ origin: SIBO, username: 'user-s', password: SPW }, { who: 'owner' });
  w.logins.grant(`web-login:${SIBO}#user-s`, 'any-account', 'session:conv-1');
  const ep = await w.kk.cdpEndpointFor(w.prof.id);
  const raw = await cdpClient(WSBase, ep.url);
  const med = w.kk.mediator();
  w.dialogs.disarm(w.prof.id, 'readers-scenes');
  const sceneKeeper = { ...w.subWatchKeeper, mediator: () => med };
  const quiet = { warn() {}, log() {} };
  const fy = [];
  const mkHub = (logins) => D.create({
    keeper: sceneKeeper, log: quiet, holdersOf: () => [{ browserKey: KEYS, sessionId: 'sess-main' }], leaseCountOf: () => 1, logins,
    forYou: { add: (pid, it) => { fy.push(it); return 'fys-' + fy.length; }, resolve() {}, sweep: () => 0 }, wipeMaxScanPositions: 1024,
  });
  let hub = mkHub(w.logins);
  await hub.arm(w.prof.id);
  { const v = await raw.call('Browser.getVersion', {}); facts.browser = (v.result && v.result.product) || '?'; say('the browser', facts.browser); }
  const newTab = async (p) => {
    const t = await raw.call('Target.createTarget', { url: /^https?:/.test(p) ? p : SO + p });
    const tid = t.result && t.result.targetId;
    const sid = (await raw.call('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
    await raw.call('Page.enable', {}, sid);
    await raw.call('Runtime.enable', {}, sid);
    await until(async () => { const r = await raw.call('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sid); return r.result && r.result.result && r.result.result.value === 'complete'; }, 8000, 50);
    await watched(tid);
    return { tid, sid };
  };
  const watched = (tid) => until(() => { const wt = hub._watches.get(w.prof.id); const e = wt && wt.targets.get(tid); return Boolean(e && e.sid); }, 6000);
  const evalOn = (sid, expression) => raw.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sid).then((r) => (r.result && r.result.result ? r.result.result.value : undefined));
  const loaderOf = async (sid) => { const r = await raw.call('Page.getFrameTree', {}, sid); return r.result && r.result.frameTree ? r.result.frameTree.frame.loaderId : null; };
  const evs = (sid, method, since = 0) => raw.frames.filter((f) => f.at >= since && f.m.method === method && (!sid || f.m.sessionId === sid));
  const fill = async (tid, user = 'user-a', { origin = SO, field = 'password', target = '#spw' } = {}) => { hub.noteActiveTab({ profileId: w.prof.id, browserKey: KEYS }, tid); return hub.fillVaultField({ profileId: w.prof.id, browserKey: KEYS }, { target, spec: `${origin}#${user}/${field}`, targetId: tid, facts: { conversationKeys: ['conv-1'] } }); };
  const agentEval = async (agent, expression) => { const r = await agent.ag.call('Runtime.evaluate', { expression, returnByValue: true }, agent.sid); return r.error ? { refused: true } : { refused: false, value: r.result && r.result.result ? r.result.result.value : undefined }; };
  const posted = (path, v = SPW) => posts.some((x) => x.path === path && spell(v).some((f) => x.body.includes(f)));
  const door1 = (tid) => hub.liveFillVerdictFor({ profileId: w.prof.id, browserKey: KEYS }, { verb: 'get', argv: ['get', 'value', '#spw'], targetId: tid });
  const agentOn = async (tid, flatten = true) => {
    const g0 = med._grant(w.prof.id, KEYS);   // (the agent's own grant, kept as it is: its upstream and road unchanged)
    const g = await med.grantFor({ profileId: w.prof.id, browserKey: KEYS, upstream: g0 ? g0.upstream : ep.url, targetIds: [tid], ...(g0 && g0.mode ? { mode: g0.mode } : {}) });
    const ag = await cdpClient(WSBase, g.url);
    const att = await ag.call('Target.attachToTarget', { targetId: tid, flatten });
    const sid = att.result && att.result.sessionId;
    if (flatten && sid) await ag.call('Page.enable', {}, sid);
    let wrapAnswer = null;
    if (!flatten && sid) { const r = await ag.call('Target.sendMessageToTarget', { sessionId: sid, message: JSON.stringify({ id: 1, method: 'Page.enable' }) }); wrapAnswer = r.error ? `refused: ${String(r.error.message || '').split(/[:.]/)[0]}` : 'forwarded'; }
    return { ag, sid, grantUrl: g.url, wrapAnswer };
  };
  const door2 = async (agent) => { const r = await agent.ag.call('Runtime.evaluate', { expression: 'document.querySelector("#spw") ? document.querySelector("#spw").value : ""', returnByValue: true }, agent.sid); return r.error ? { refused: true, code: String(r.error.message || '').split(':')[0] } : { refused: false, carries: carries(r) }; };
  const restartCold = async () => {
    hub.shutdown();
    LF.clearAllFilledSecrets();
    const engR = VE.create({ dataDir: w.VD, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false });
    const loginsR = L.create({ vault: engR, grants: () => w.grants, forYou: { add: () => null, resolve() {} }, log: () => {} });
    hub = mkHub(loginsR);
    await hub.arm(w.prof.id);
    return engR;
  };
  // each scene stands alone: a scene that throws is ONE red line with its masked words, never the end of the others
  const scene = async (label, fn) => {
    try { await fn(); } catch (e) { ok(false, `${label} on real Chrome ran to its end`, hide(String((e && e.stack) || e)).slice(0, 600)); }
    try { for (const t of ((await raw.call('Target.getTargets', {})).result || {}).targetInfos || []) if (t.type === 'page' && String(t.url || '').startsWith(SO)) await raw.call('Target.closeTarget', { targetId: t.targetId }); } catch { /* */ }
    try { hub.shutdown(); hub = mkHub(w.logins); await hub.arm(w.prof.id); } catch { /* */ }   // (the next scene starts on the suite's own logins, whatever this one left)
  };
  try {
    // ── scenes 10, 11: THE DOCUMENT ID ───────────────────────────────────────────────────────────────────────────────
    await scene('scenes 10–11', async () => {
      const { tid, sid } = await newTab('/s/login');
      const l0 = await loaderOf(sid);
      const t0 = Date.now();
      await evalOn(sid, "history.pushState({}, '', '?x=1')"); await sleep(150);
      const l1 = await loaderOf(sid);
      const pushNav = evs(sid, 'Page.frameNavigated', t0).length, pushWithin = evs(sid, 'Page.navigatedWithinDocument', t0).length;
      await evalOn(sid, "location.hash = '#a'"); await sleep(150);
      const l2 = await loaderOf(sid);
      const t3 = Date.now();
      await evalOn(sid, 'setTimeout(() => location.reload(), 10)');
      await until(() => evs(sid, 'Page.frameNavigated', t3).length > 0, 6000);
      const l3 = await loaderOf(sid);
      const t4 = Date.now();
      await raw.call('Page.navigate', { url: SO + '/s/login' }, sid);
      await until(() => evs(sid, 'Page.frameNavigated', t4).length > 0, 6000);
      const l4 = await loaderOf(sid);
      facts.docId = { samePushState: l0 === l1, sameHash: l1 === l2, newOnReload: l3 !== l2, newOnSameAddress: l4 !== l3, pushStateFrameNavigated: pushNav, pushStateWithinDocument: pushWithin };
      say('scenes 10–11 (the document id)', facts.docId);
      ok(facts.docId.samePushState && facts.docId.sameHash && facts.docId.newOnReload && facts.docId.newOnSameAddress && pushNav === 0 && pushWithin >= 1,
        'SCENES 10–11 on real Chrome: the top frame\'s loaderId stays across pushState and a hash move (no frameNavigated, a navigatedWithinDocument) and is new on a reload and on a same-address navigation — as the fake kernel assumes', facts.docId);
      await raw.call('Target.closeTarget', { targetId: tid });
    });
    // ── scenes 16, 5: THE FRAGMENT ───────────────────────────────────────────────────────────────────────────────────
    await scene('scenes 16, 5', async () => {
      const { tid, sid } = await newTab('/s/login');
      const agent = await agentOn(tid);
      const f = await fill(tid);
      const t0 = Date.now();
      await raw.call('Page.navigate', { url: `${SO}/s/welcome#pw=${encodeURIComponent(SPW)}` }, sid);
      await until(() => evs(sid, 'Page.frameNavigated', t0).length > 0, 6000); await sleep(250);
      const fn = evs(sid, 'Page.frameNavigated', t0)[0];
      const fr = (fn && fn.m.params && fn.m.params.frame) || {};
      const lv = door1(tid);
      const d2 = await door2(agent);
      const agentLeak = agent.ag.frames.filter((x) => carries(x.raw)).length;
      facts.fragment = { fill: Boolean(f && f.ok), urlHasHash: String(fr.url || '').includes('#'), fragmentApart: /^#pw=/.test(String(fr.urlFragment || '')), held: lv.ok === false, words: /own address or title/.test(lv.error || ''), door2: d2, agentFramesCarrying: agentLeak };
      say('scenes 16, 5 (the fragment)', facts.fragment);
      ok(facts.fragment.fill && !facts.fragment.urlHasHash && facts.fragment.fragmentApart && facts.fragment.held && facts.fragment.words && d2.refused && agentLeak === 0,
        'SCENES 16, 5 on real Chrome: the fragment rides apart (frame.urlFragment, frame.url without it); a next address carrying the value only in its fragment holds the tab (the value-shown words) and the agent\'s own frames carry none of it', facts.fragment);
      agent.ag.close(); await raw.call('Target.closeTarget', { targetId: tid });
    });
    // ── scene 8: THE TITLE'S TIMING ──────────────────────────────────────────────────────────────────────────────────
    await scene('scene 8', async () => {
      await raw.call('Target.setDiscoverTargets', { discover: true });
      const { tid, sid } = await newTab('/s/login');
      const t0 = Date.now();
      await raw.call('Page.navigate', { url: SO + '/s/titled' }, sid);
      await until(() => evs(sid, 'Page.frameNavigated', t0).length > 0, 6000);
      const navAt = evs(sid, 'Page.frameNavigated', t0)[0].at;
      const atNav = ((await raw.call('Target.getTargetInfo', { targetId: tid })).result || {}).targetInfo || {};
      await sleep(400);
      const changes = raw.frames.filter((x) => x.at >= t0 && x.m.method === 'Target.targetInfoChanged' && x.m.params.targetInfo.targetId === tid).map((x) => ({ dt: x.at - navAt, title: x.m.params.targetInfo.title }));
      facts.title = { titleAtNavigation: atNav.title === atNav.url ? 'the address' : atNav.title === 'A later title' ? 'the new title' : 'other', changes: changes.map((c) => `${c.dt} ms: ${c.title === 'A later title' ? 'the new title' : c.title.startsWith('http') ? 'an address' : 'other'}`) };
      say('scene 8 (the title)', facts.title);
      ok(Array.isArray(facts.title.changes), 'SCENE 8 on real Chrome: the title at the navigation and the later title events are recorded (the hub takes the address as the first title; a title set later is a said limit)', facts.title);
      await raw.call('Target.closeTarget', { targetId: tid });
    });
    // ── scenes 7, 13, 9, 14, 2: A GET FORM CARRIES THE VALUE INTO THE NEXT ADDRESS ───────────────────────────────────────
    await scene('scenes 7, 13, 9, 14, 2', async () => {
      const { tid, sid } = await newTab('/s/login');
      await raw.call('Network.enable', {}, sid);
      const flat = await agentOn(tid, true);
      for (const m of ['Network.enable', 'Runtime.enable']) await flat.ag.call(m, {}, flat.sid);   // (scene 9: every event the agent's session can be sent)
      await flat.ag.call('Target.setDiscoverTargets', { discover: true });
      const wrapped = await agentOn(tid, false);
      const f = await fill(tid);
      const t0 = Date.now();
      await evalOn(sid, "document.getElementById('go').click()");
      await until(() => evs(sid, 'Page.frameNavigated', t0).length > 0, 8000); await sleep(400);
      const navAt = evs(sid, 'Page.frameNavigated', t0)[0].at;
      const docReq = evs(sid, 'Network.requestWillBeSent', t0).find((x) => x.m.params.type === 'Document');
      const docEnd = docReq ? evs(sid, 'Network.loadingFinished', t0).find((x) => x.m.params.requestId === docReq.m.params.requestId) : null;
      const docEndIdx = docEnd ? raw.frames.indexOf(docEnd) : -1, navIdx = raw.frames.indexOf(evs(sid, 'Page.frameNavigated', t0)[0]);
      const docFinished = docEnd ? { ms: docEnd.at - navAt, order: docEndIdx < navIdx ? 'the document request ended BEFORE the navigation event' : 'the navigation event first' } : 'no loadingFinished for the document';
      const agentNav = flat.ag.frames.find((x) => x.at >= t0 && x.m.method === 'Page.frameNavigated');
      const agentNavMs = agentNav ? agentNav.at - navAt : null;
      const lv = door1(tid);
      const d2 = await door2(flat);
      const flatMethods = [...new Set(flat.ag.frames.filter((x) => x.at >= t0 && x.m.method).map((x) => x.m.method))];
      const wrappedInner = [...new Set(wrapped.ag.frames.filter((x) => x.at >= t0 && x.m.method === 'Target.receivedMessageFromTarget').map((x) => { try { return JSON.parse(x.m.params.message).method; } catch { return '?'; } }))];
      const leakFlatBy = {};
      for (const x of flat.ag.frames) if (carries(x.raw)) leakFlatBy[x.m.method || 'answer'] = (leakFlatBy[x.m.method || 'answer'] || 0) + 1;
      const leakFlat = Object.values(leakFlatBy).reduce((a, b) => a + b, 0), leakWrapped = wrapped.ag.frames.filter((x) => carries(x.raw)).length;
      facts.get = { fill: Boolean(f && f.ok), documentEnd: docFinished, agentNavigationMs: agentNavMs, held: lv.ok === false, words: /own address or title/.test(lv.error || ''), door2: d2, flatMethods, leakFlatBy, wrappedAttach: Boolean(wrapped.sid), wrappedSendMessage: wrapped.wrapAnswer, wrappedInner, leakFlat, leakWrapped };
      say('scenes 7, 13, 9, 14 (a GET form)', facts.get);
      ok(facts.get.fill && facts.get.held && facts.get.words && d2.refused && leakFlat === 0 && leakWrapped === 0,
        'SCENES 7, 13, 9, 14 on real Chrome: a GET form carries the value into the next address — the tab stays held with the value-shown words whatever order the document\'s end and the navigation come in, and no event of the agent\'s flat or wrapped session carries the value', facts.get);
      flat.ag.close(); wrapped.ag.close();
      // scene 2: a restart, then a reload of that address
      const engR = await restartCold();
      const t1 = Date.now();
      await raw.call('Page.reload', {}, sid);
      await until(() => evs(sid, 'Page.frameNavigated', t1).length > 0, 8000); await sleep(300);
      const lvR = door1(tid);
      const lister = await agentOn(tid, true);
      const list = await lister.ag.call('Target.getTargets', {});
      const listCarries = carries(list);
      await engR.unlock(w.VPW);
      await until(() => { const v = door1(tid); return v && /own address or title/.test(v.error || ''); }, 4000);
      const lvU = door1(tid);
      facts.restartReload = { heldAfterReload: lvR.ok === false, awaitsVault: /checks this tab again once the vault is unlocked/.test(lvR.error || ''), listCarries, afterUnlock: /own address or title/.test(lvU.error || '') ? 'value-shown hold (the address still shows it)' : (lvU.ok ? 'lifted' : 'held') };
      say('scene 2 (a restart, then a reload of the value-bearing address)', facts.restartReload);
      ok(facts.restartReload.heldAfterReload && facts.restartReload.awaitsVault && !listCarries && lvU.ok === false,
        'SCENE 2 on real Chrome: after a cold restart a reload of the address that carries the value stays held (the vault sentence), the agent\'s listing carries none of it, and once the vault opens the check holds it again', facts.restartReload);
      lister.ag.close(); engR.close();
      hub.shutdown(); hub = mkHub(w.logins); await hub.arm(w.prof.id);
      await raw.call('Target.closeTarget', { targetId: tid });
    });
    // ── scene 4: pushState + document.title on a fenced tab ──────────────────────────────────────────────────────────
    await scene('scene 4', async () => {
      facts.pushTitle = {};
      for (const [label, user, v] of [['under the floor', 'user-a', SPW], ['at the floor', 'user-b', LPW]]) {
        const { tid, sid } = await newTab('/s/login');
        const agent = await agentOn(tid, true);
        await agent.ag.call('Target.setDiscoverTargets', { discover: true });
        const f = await fill(tid, user);
        const t0 = Date.now();
        await evalOn(sid, `history.pushState({}, '', '?pw=' + encodeURIComponent(${JSON.stringify(v)})); document.title = ${JSON.stringify(v)};`);
        await sleep(500);
        const lv = door1(tid);
        const after = agent.ag.frames.filter((x) => x.at >= t0);
        const leakBy = {};
        for (const x of after) if (carriesV(v, x.raw)) leakBy[x.m.method || 'answer'] = (leakBy[x.m.method || 'answer'] || 0) + 1;
        facts.pushTitle[label] = { fill: Boolean(f && f.ok), held: lv.ok === false, methods: [...new Set(after.filter((x) => x.m.method).map((x) => x.m.method))], leakBy };
        agent.ag.close(); await raw.call('Target.closeTarget', { targetId: tid });
      }
      say('scene 4 (pushState + title during the live fill)', facts.pushTitle);
      const lo = facts.pushTitle['under the floor'], hi = facts.pushTitle['at the floor'];
      ok(lo.fill && lo.held && hi.fill && hi.held && Object.keys(hi.leakBy).length === 0,
        'SCENE 4 on real Chrome: a fenced page that pushState\'s the typed value into its address and sets it as its title stays held; at or above the mask floor no frame of the agent\'s session carries it (the scrub list) — under the floor the frames that carry it are recorded (the said limit «any other road: the scrub list only»)', facts.pushTitle);
    });
    // ── scene 6: THE ISOLATED WORLD ACROSS A RE-RENDER ───────────────────────────────────────────────────────────────
    await scene('scene 6', async () => {
      const { tid, sid } = await newTab('/s/login');
      const f = await fill(tid);
      await evalOn(sid, "fetch('/s/welcome', { method: 'POST', body: 'pw=' + document.getElementById('spw').value }).then(() => 1)");
      await until(() => door1(tid).ok === true, 6000);
      const lifted = door1(tid).ok === true;
      await evalOn(sid, `document.body.innerHTML = '<form><input id="spw" type="password"></form>'; history.pushState({}, '', '/s/dashboard'); document.getElementById('spw').value = ${JSON.stringify(SPW)};`);
      await sleep(200);
      const rc = await hub.recheckPostLiftFor({ profileId: w.prof.id, browserKey: KEYS }, { verb: 'get', argv: ['get', 'value', '#spw'], targetId: tid });   // (the route's order: the post-lift recheck, then the verdict)
      const lv = door1(tid);
      facts.rerender = { fill: Boolean(f && f.ok), liftedAfterSubmit: lifted, guardStood: hub.hasPostLiftGuard(w.prof.id, tid), recheck: { ok: rc && rc.ok, refilled: rc && rc.refilled }, heldAfterPutBack: (rc && rc.ok === false) || lv.ok === false };
      say('scene 6 (an isolated world across a re-render)', facts.rerender);
      ok(facts.rerender.fill && facts.rerender.liftedAfterSubmit, `SCENE 6 — A SAID LIMIT on real Chrome (主开发 09:11Z): after a same-origin submit lifts the fence, a page that re-renders and writes the value into ANOTHER box is ${facts.rerender.heldAfterPutBack ? 'held again by the guard' : 'not held — the guard looks at the filled box, not at every control (kb-features, the limits)'}`, facts.rerender);
      await raw.call('Target.closeTarget', { targetId: tid });
    });
    // ── scenes 12, 1: A BUSY TAB AT THE WATCH'S CONNECT ──────────────────────────────────────────────────────────────
    await scene('scenes 12, 1', async () => {
      // the hub restarts WHILE the page's main thread is busy at load (a 3 s loop): what the watch's frame-tree read gets against its 1.5 s
      const c = await raw.call('Target.createTarget', { url: SO + '/s/busy' });
      const tid = c.result.targetId;
      const sid = (await raw.call('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
      const a = Date.now();
      hub.shutdown(); hub = mkHub(w.logins);
      const [ft] = await Promise.all([raw.call('Page.getFrameTree', {}, sid, 8000), hub.arm(w.prof.id)]);
      const frameTreeMs = Date.now() - a;
      await watched(tid);
      const e = hub._watches.get(w.prof.id).targets.get(tid);
      const docIdAtConnect = Boolean(e && e.docId);
      await until(async () => (await evalOn(sid, 'document.readyState')) === 'complete', 8000, 50);
      const f = await fill(tid);   // (no navigation)
      const row = () => { const lf = hub.liveFillOnTarget(w.prof.id, tid); return lf ? { docKnown: Boolean(lf.docId), hold: lf.holdReason || 'live' } : null; };
      const atFill = row();
      const engR = await restartCold();
      const lvLocked = door1(tid);
      await engR.unlock(w.VPW);
      await until(() => { const r = row(); return r && r.hold !== 'await_vault'; }, 4000);
      const lvOpen = door1(tid);
      facts.busy = { frameTreeMs, overHubBound: frameTreeMs > 1500, answered: Boolean(ft && ft.result), docIdReadAtConnect: docIdAtConnect, fill: Boolean(f && f.ok), atFill, afterRestart: /checks this tab again once the vault is unlocked/.test(lvLocked.error || '') ? 'held for the vault' : (lvLocked.ok ? 'LIFTED' : 'held'), afterUnlock: lvOpen.ok ? 'LIFTED' : (row() ? row().hold : 'held') };
      say('scenes 12, 1 (a busy tab)', facts.busy);
      ok(facts.busy.fill && lvLocked.ok === false && lvOpen.ok === false,
        'SCENES 12, 1 on real Chrome: the frame-tree read on a tab busy at load is measured against the hub\'s 1.5 s; a fill on that tab without a navigation, then a cold restart: held for the vault, and once it opens the same document is held again (an unknown document id reads as the same document)', facts.busy);
      engR.close();
      hub.shutdown(); hub = mkHub(w.logins); await hub.arm(w.prof.id);
      await raw.call('Target.closeTarget', { targetId: tid });
    });
    // ── scenes 15, 3: THE BACK-FORWARD CACHE ─────────────────────────────────────────────────────────────────────────
    await scene('scenes 15, 3', async () => {
      const { tid, sid } = await newTab('/s/login');
      const agent = await agentOn(tid, true);
      const lFill = await loaderOf(sid);
      const f = await fill(tid);
      const t0 = Date.now();
      await raw.call('Page.navigate', { url: SO + '/s/home' }, sid);
      await until(() => evs(sid, 'Page.frameNavigated', t0).length > 0, 6000); await sleep(300);
      const liftedOnHome = door1(tid).ok === true;
      const hist = await raw.call('Page.getNavigationHistory', {}, sid);
      const back = hist.result && hist.result.entries ? hist.result.entries[hist.result.currentIndex - 1] : null;
      const t1 = Date.now();
      if (back) await raw.call('Page.navigateToHistoryEntry', { entryId: back.id }, sid);
      await until(() => evs(sid, 'Page.frameNavigated', t1).length > 0, 6000); await sleep(400);
      const fnB = evs(sid, 'Page.frameNavigated', t1)[0];
      const lBack = await loaderOf(sid);
      const ps = await evalOn(sid, 'JSON.stringify(window.__ps || [])');
      const valueInBox = (await evalOn(sid, 'document.getElementById("spw") ? document.getElementById("spw").value : ""')) === SPW;
      const lv = door1(tid);
      const d2 = await door2(agent);
      facts.bfcache = { fill: Boolean(f && f.ok), liftedOnHome, navType: fnB ? fnB.m.params.type : null, sameLoaderAsFill: lBack === lFill, pageshow: ps, valueInBox, hubHolds: lv.ok === false, door2: d2 };
      say('scenes 15, 3 (the back-forward cache)', facts.bfcache);
      ok(facts.bfcache.fill && facts.bfcache.liftedOnHome, `SCENE 15 — A SAID LIMIT on real Chrome (主开发 09:11Z): the browser's back button restores the filled page (${facts.bfcache.navType}, ${facts.bfcache.sameLoaderAsFill ? 'its own document id' : 'a new document id'}) ${facts.bfcache.valueInBox ? 'with the box still filled' : 'with the box empty'}; the hub ${facts.bfcache.hubHolds ? 'holds it' : 'does not hold it'} (kb-features, the limits)`, facts.bfcache);
      agent.ag.close(); await raw.call('Target.closeTarget', { targetId: tid });
      // scene 3: back INTO the value-bearing address (a GET form's next page) after the value-shown hold lifted on /home
      {
        const { tid: t3, sid: s3 } = await newTab('/s/login');
        const ag3 = await agentOn(t3, true);
        await ag3.ag.call('Target.setDiscoverTargets', { discover: true });
        const f3 = await fill(t3);
        const a0 = Date.now();
        await evalOn(s3, "document.getElementById('go').click()");
        await until(() => evs(s3, 'Page.frameNavigated', a0).length > 0, 8000); await sleep(300);
        const heldShown = /own address or title/.test(door1(t3).error || '');
        const a1 = Date.now();
        await raw.call('Page.navigate', { url: SO + '/s/home' }, s3);
        await until(() => evs(s3, 'Page.frameNavigated', a1).length > 0, 6000); await sleep(300);
        const liftedHome = door1(t3).ok === true;
        const h3 = await raw.call('Page.getNavigationHistory', {}, s3);
        const back3 = h3.result && h3.result.entries ? h3.result.entries[h3.result.currentIndex - 1] : null;
        const a2 = Date.now();
        if (back3) await raw.call('Page.navigateToHistoryEntry', { entryId: back3.id }, s3);
        await until(() => evs(s3, 'Page.frameNavigated', a2).length > 0, 6000); await sleep(400);
        const fn3 = evs(s3, 'Page.frameNavigated', a2)[0];
        const lv3 = door1(t3);
        const agentFrames = ag3.ag.frames.filter((x) => x.at >= a2);
        const leak3 = {};
        for (const x of agentFrames) if (carries(x.raw)) leak3[x.m.method || 'answer'] = (leak3[x.m.method || 'answer'] || 0) + 1;
        facts.backIntoShown = { fill: Boolean(f3 && f3.ok), heldShown, liftedHome, navType: fn3 ? fn3.m.params.type : null, backAddressCarries: fn3 ? carries(fn3.m.params.frame) : null, hubAfterBack: lv3.ok ? 'lifted (no fill left to check against)' : (/own address or title/.test(lv3.error || '') ? 'value-shown hold' : 'held'), agentFramesCarrying: leak3 };
        say('scene 3 (back into the value-bearing address after the lift)', facts.backIntoShown);
        ok(facts.backIntoShown.fill && heldShown && liftedHome, 'SCENE 3 on real Chrome: a GET form\'s next address holds the tab (value shown), /home lifts it; going back into the value-bearing address is recorded — its event, whether the hub holds again, and which agent frames carry the value (under the floor: the scrub list masks none — the said limit «any other road»)', facts.backIntoShown);
        ag3.ag.close(); await raw.call('Target.closeTarget', { targetId: t3 });
      }
    });
    // ── 主开发's MUST-HOLDS (2026-11-15 09:16Z): ORDINARY LOGINS FINISH ─────────────────────────────────────────────────────
    await scene('must-hold: a form posting to a sibling host of the same site', async () => {
      const { tid, sid } = await newTab(`${SIBO}/sib/login`);
      const ft = await raw.call('Page.getFrameTree', {}, sid);
      const reg = ft.result && ft.result.frameTree ? String(ft.result.frameTree.frame.domainAndRegistry || '') : '';
      const f = await fill(tid, 'user-s', { origin: SIBO });
      const t0 = Date.now();
      await evalOn(sid, "document.getElementById('go').click()");
      await until(() => evs(sid, 'Page.frameNavigated', t0).some((x) => /\/sib\/welcome/.test(String(x.m.params.frame.url || ''))), 8000); await sleep(200);
      const lv = door1(tid);
      facts.mustSibling = { chromeSite: reg, fill: Boolean(f && f.ok), posted: posted('/sib/session'), onWelcome: /\/sib\/welcome/.test(String(((await raw.call('Target.getTargetInfo', { targetId: tid })).result || {}).targetInfo?.url || '')), readable: lv.ok === true };
      say('must-hold sibling host', facts.mustSibling);
      ok(reg === 'example.com' && facts.mustSibling.fill && facts.mustSibling.posted && facts.mustSibling.onWelcome && facts.mustSibling.readable,
        'MUST-HOLD on real Chrome (L1): a login form on www.example.com posting to auth.example.com — the same site by Chrome\'s own registrable domain — FINISHES: the credential reaches the sibling host, the tab lands on the signed-in page, and the agent reads it', facts.mustSibling);
      await raw.call('Target.closeTarget', { targetId: tid });
    });
    await scene('must-hold: a single-page login', async () => {
      const { tid, sid } = await newTab('/spa/login');
      const agent = await agentOn(tid, true);
      const f = await fill(tid);
      await evalOn(sid, "document.getElementById('go').click()");
      await until(async () => (await evalOn(sid, "Boolean(document.getElementById('done'))")) === true, 6000);
      await until(() => door1(tid).ok === true, 4000);
      const lv = door1(tid);
      const seen = await agentEval(agent, 'document.body.innerText');
      facts.mustSpa = { fill: Boolean(f && f.ok), posted: posted('/spa/session'), readable: lv.ok === true, agentSees: !seen.refused && /Welcome to the app/.test(String(seen.value || '')) };
      say('must-hold single-page login', facts.mustSpa);
      ok(facts.mustSpa.fill && facts.mustSpa.posted && facts.mustSpa.readable && facts.mustSpa.agentSees,
        'MUST-HOLD on real Chrome: a single-page login (fetch + pushState, no new document) FINISHES — the credential reaches the site, the fence lifts at its answer, and the agent reads the signed-in app', facts.mustSpa);
      agent.ag.close(); await raw.call('Target.closeTarget', { targetId: tid });
    });
    await scene('must-hold: a two-step login in one document', async () => {
      const { tid, sid } = await newTab('/two/login');
      const agent = await agentOn(tid, true);
      const f = await fill(tid);
      await evalOn(sid, "document.getElementById('go').click()");
      await until(async () => (await evalOn(sid, "Boolean(document.getElementById('code'))")) === true, 6000);
      await until(() => door1(tid).ok === true, 4000);
      const step = await agentEval(agent, "Boolean(document.getElementById('code')) && document.body.innerText");
      await agentEval(agent, "document.getElementById('code').value = '123456'; document.getElementById('verify').click(); 1");
      await until(async () => (await evalOn(sid, "Boolean(document.getElementById('done'))")) === true, 6000);
      facts.mustTwoStep = { fill: Boolean(f && f.ok), posted: posted('/two/session'), agentReadsStep: !step.refused && /Code/.test(String(step.value || '')), verified: posts.some((x) => x.path === '/two/verify' && x.body.includes('123456')) };
      say('must-hold two-step in one document', facts.mustTwoStep);
      ok(facts.mustTwoStep.fill && facts.mustTwoStep.posted && facts.mustTwoStep.agentReadsStep && facts.mustTwoStep.verified,
        'MUST-HOLD on real Chrome: a two-step login in ONE document FINISHES — after the password\'s submit the agent reads the code step the page rendered in place, types the code and verifies', facts.mustTwoStep);
      agent.ag.close(); await raw.call('Target.closeTarget', { targetId: tid });
    });
    await scene('must-hold: a user-name-first login', async () => {
      const { tid, sid } = await newTab('/usr/login');
      const agent = await agentOn(tid, true);
      const fu = await fill(tid, 'user-a', { field: 'user', target: '#user' });
      const lvUser = door1(tid);
      await evalOn(sid, "document.getElementById('next').click()");
      await sleep(150);
      const readsNext = await agentEval(agent, "Boolean(document.getElementById('spw')) && Boolean(document.getElementById('go'))");
      const fp = await fill(tid);
      const lvPw = door1(tid);
      const t0 = Date.now();
      await evalOn(sid, "document.getElementById('go').click()");
      await until(() => evs(sid, 'Page.frameNavigated', t0).length > 0, 8000); await sleep(200);
      const lvAfter = door1(tid);
      facts.mustUserFirst = { userFill: Boolean(fu && fu.ok), userClosesNothing: lvUser.ok === true, agentReadsNextStep: !readsNext.refused && readsNext.value === true, passwordFill: Boolean(fp && fp.ok), passwordCloses: lvPw.ok === false, posted: posts.some((x) => x.path === '/usr/session' && spell(SPW).some((v) => x.body.includes(v))), readableAfter: lvAfter.ok === true };
      say('must-hold user-name-first', facts.mustUserFirst);
      ok(Object.values(facts.mustUserFirst).every(Boolean),
        'MUST-HOLD on real Chrome: a user-name-first login FINISHES — the user name filled from the vault closes nothing (the agent reads the next step), the password closes the tab until the button the agent read is pressed, the credential reaches the site and the next page is read', facts.mustUserFirst);
      agent.ag.close(); await raw.call('Target.closeTarget', { targetId: tid });
    });
  } finally {
    try { hub.shutdown(); } catch { /* */ }
    try { w.swapDialogs(w.dialogs); } catch { /* */ }   // (the suite's own hub takes the mediator's fence back)
    raw.close();
    try { sp.closeAllConnections(); ssp.closeAllConnections(); } catch { /* */ }
    await new Promise((r) => ssp.close(r));
    try { fs.rmSync(certDir, { recursive: true, force: true }); } catch { /* */ }   // (Chrome keeps its sockets alive: close waits on them otherwise — the claim on 48cbb4349 hung to its deadline here)
    await new Promise((r) => sp.close(r));
    for (const u of ['user-a', 'user-b']) { try { w.logins.drop(`web-login:${SO}#${u}`, { who: 'owner' }); } catch { /* */ } }
    try { w.logins.drop(`web-login:${SIBO}#user-s`, { who: 'owner' }); } catch { /* */ }
  }
  return facts;
}

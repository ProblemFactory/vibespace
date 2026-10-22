'use strict';
/**
 * THE MICROPHONE ROAD ON A PAIRED MACHINE (SHARED — the device agent bundles it and runs it where the machine's audio lives;
 * lane stream-mic-road, backlog B-7af0; the measured road: lane stream-mic-wheel-probe). The decisions are PURE
 * src/mic-model.js; this file builds the helper, reads the facts, runs the renderer.
 *   • THE HELPER (one per OS, SEPARATE from the screen and window helpers): tools/vibespace-mic/ as text in
 *     src/mic-helper-source.js, built HERE on first use — Windows: the in-box C# 5 compiler into %LOCALAPPDATA%\vibespace\helpers
 *     (the window helper's way); a Mac: the Command Line Tools' swiftc into ~/.vibespace/helpers (found by FILE — never the
 *     /usr/bin trampoline that opens the "install the developer tools" dialog). A stamp per source digest: a changed source
 *     rebuilds. VIBESPACE_MIC_HELPER names a fake (the suites'): its facts say which OS road it stands for.
 *   • FACTS (`stream-mic` facts): the helper's endpoints / devices + the defaults, the moment our install door finished
 *     (~/.vibespace/mic-installed.json, written by the install's starter) against the last boot (VB-CABLE's restart note), the
 *     default microphone we replaced (~/.vibespace/mic-default.json) — and the PURE verdict micStateOf. `prepare` on a Mac also
 *     builds and STAGES the plug-in (~/.vibespace/helpers/mic-plugin/VibeSpaceMic.driver, clang, ad-hoc signed) and says its
 *     SHA-256: the install row copies exactly that bundle. Kept MIC_LIMITS.factsMs.
 *   • THE DEFAULT PAIR (`stream-mic` default): 「设为默认麦克风」 remembers the default it replaces, 「改回」 puts that one back.
 *     Nothing else here ever changes a default device — the speakers' road plays into whatever the default speaker is.
 *   • THE RECEIVER (one per stream session, made when the stream's audio track arrives): started by the first RTP packet,
 *     stopped after MIC_LIMITS.idleMs without one (the page's replaceTrack(null) sends nothing), and with the session.
 *       Windows  each packet → a live Ogg page → ffmpeg (the stream's own; the probe's low-delay flags) → s16le PCM → the
 *                helper's `render` → «CABLE Input» (every app that picks «CABLE Output» hears it) or the default speaker
 *       Mac      each packet → a length frame → the helper's `render` (AudioToolbox decodes the Opus) → the plug-in's device by
 *                UID (or BlackHole's), or the default output
 *     Where it writes is decided ONCE per run by the facts (micTargetOf); its numbers ride the stream's stats (`mic`), so the
 *     page says where the voice IS going.
 * Every name (an endpoint id, a UID) rides the helper's env, never argv.
 */
const crypto = require('crypto');
const MM = require('./mic-model.js');
const SP = require('./stream-plan.js');

const named = (code, error, extra) => ({ ok: false, code, error, ...(extra || {}) });
const STOP_GRACE_MS = 1000;
const QUEUE_MAX = 50; // packets held while the road starts (1 s of 20 ms packets) — older ones are dropped

// ── THE OGG PAGER (the probe's: one page per packet, as the streaming decoder wants it) ──────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();
function oggPage(serial, seq, granule, flags, packet) {
  const lace = []; let n = packet.length; while (n >= 255) { lace.push(255); n -= 255; } lace.push(n);
  const h = Buffer.alloc(27 + lace.length); h.write('OggS', 0); h[4] = 0; h[5] = flags; h.writeBigInt64LE(BigInt(granule), 6); h.writeUInt32LE(serial, 14); h.writeUInt32LE(seq, 18); h[26] = lace.length; Buffer.from(lace).copy(h, 27);
  const page = Buffer.concat([h, packet]); let c = 0; for (const b of page) c = ((c << 8) ^ CRC[((c >>> 24) ^ b) & 255]) >>> 0; page.writeUInt32LE(c, 22); return page;
}
/** The stream's first two pages: OpusHead (48 kHz, `channels`) + OpusTags. */
function oggOpusHead(channels = 2) {
  const head = Buffer.alloc(19); head.write('OpusHead', 0); head[8] = 1; head[9] = channels; head.writeUInt16LE(0, 10); head.writeUInt32LE(48000, 12);
  const tags = Buffer.concat([Buffer.from('OpusTags'), Buffer.from([9, 0, 0, 0]), Buffer.from('vibespace'), Buffer.alloc(4)]);
  return [oggPage(1, 0, 0, 2, head), oggPage(1, 1, 0, 0, tags)];
}
/** The Mac road's frame: u32 little-endian length, then the packet. */
function macFrame(packet) { const h = Buffer.alloc(4); h.writeUInt32LE(packet.length, 0); return Buffer.concat([h, packet]); }

/** `env` = the daemon's spawn env (a builder's — every child here gets it plus its names); `lookupEnv` = where %WINDIR% /
 *  %LOCALAPPDATA% / PATH are read; `ffmpeg()` → the stream's ffmpeg path (Windows' screen facts) or null (then PATH). */
function createMic({ platform = process.platform, spawn, execFile, env, lookupEnv = {}, fs = require('fs'), home = '', log = () => { }, now = Date.now, uptime = () => require('os').uptime(), helperPath = null, ffmpeg = null, sources = () => require('./mic-helper-source.js') } = {}) {
  const P = fs.promises;
  const sep = platform === 'win32' && !helperPath ? '\\' : '/';
  const vsDir = `${String(home).replace(/[\\/]+$/, '')}${sep}.vibespace`;
  const INSTALLED = `${vsDir}${sep}mic-installed.json`, DEFAULT_REC = `${vsDir}${sep}mic-default.json`;
  let built = null, building = null, memo = null;
  const run = (file, args, { timeout = MM.MIC_HELPER.runMs, names = null } = {}) => new Promise((resolve) => {
    try { execFile(file, args, { env: names ? { ...env, ...names } : env, windowsHide: true, timeout, maxBuffer: 4 << 20, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })); }
    catch (e) { resolve({ err: e, stdout: '', stderr: '' }); }
  });
  const readJson = async (f) => { try { const o = JSON.parse(await P.readFile(f, 'utf8')); return o && typeof o === 'object' ? o : null; } catch { return null; } };
  const writeJson = async (f, o) => { await P.mkdir(vsDir, { recursive: true }); await P.writeFile(f + '.tmp', JSON.stringify(o)); await P.rename(f + '.tmp', f); };
  const isFile = async (f) => { try { return (await P.stat(f)).isFile(); } catch { return false; } };
  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const firstErr = (r) => ((r.stdout + '\n' + r.stderr).split(/\r?\n/).map((l) => l.trim()).filter((l) => /error/i.test(l))[0] || (r.err && (r.err.code || r.err.message)) || 'no output').toString().slice(0, 300);

  // ── THE HELPER ──
  /** → { ok, exe, built, ms } | { ok: false, code: 'helper_missing' | 'unsupported', error } */
  function helper() {
    if (helperPath) return Promise.resolve({ ok: true, exe: helperPath, built: false, ms: 0 }); // the suites' fake helper
    if (platform !== 'win32' && platform !== 'darwin') return Promise.resolve(named('unsupported', `the microphone reaches a Windows or macOS machine (this one runs ${platform})`));
    if (built && built.ok) return Promise.resolve(built);
    if (!building) building = (platform === 'win32' ? buildWin() : buildMac()).then((r) => { built = r; building = null; return r; }, (e) => { building = null; return named('helper_missing', `the microphone helper could not be built (${(e && e.message) || e})`); });
    return building;
  }
  async function buildWin() {
    const text = sources().WIN;
    const plan = MM.winMicBuildPlan({ windir: lookupEnv.WINDIR || lookupEnv.SystemRoot || lookupEnv.windir || '', localAppData: lookupEnv.LOCALAPPDATA || '', hash: sha(text) });
    if (!plan.ok) return plan;
    try { if ((await P.readFile(plan.stampFile, 'utf8')).trim() === plan.stamp && await isFile(plan.exe)) return { ok: true, exe: plan.exe, built: false, ms: 0 }; } catch { /* not built yet */ }
    await P.mkdir(plan.dir, { recursive: true });
    await P.writeFile(plan.src, text);
    try { await P.unlink(plan.exe); } catch { /* none */ }
    const t0 = now();
    const r = await run(plan.csc, plan.cscArgs, { timeout: MM.MIC_HELPER.buildMs });
    if (r.err || !(await isFile(plan.exe))) { log(`[mic] helper NOT built: ${firstErr(r)}`); return named('helper_missing', `the microphone helper did not build on this machine (${firstErr(r)}); the recipe: ${MM.WIN_MIC_RECIPE}`); }
    await P.writeFile(plan.stampFile, plan.stamp + '\n');
    log(`[mic] helper built in ${now() - t0} ms: ${plan.exe}`);
    return { ok: true, exe: plan.exe, built: true, ms: now() - t0 };
  }
  /** A Mac's compiler, by FILE under `xcode-select -p` (+ the Command Line Tools' default place) → { swiftc, clang } | null */
  async function macCompilers() {
    const r = await run('/usr/bin/xcode-select', ['-p'], { timeout: 5000 });
    const dirs = [...new Set([r.err ? '' : r.stdout.trim(), '/Library/Developer/CommandLineTools'].filter(Boolean))];
    for (const d of dirs) for (const f of [`${d}/usr/bin/swiftc`, `${d}/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc`]) if (await isFile(f)) return { swiftc: '/usr/bin/swiftc', clang: '/usr/bin/clang' };
    return null;
  }
  async function buildMac() {
    const text = sources().MAC;
    const plan = MM.macMicBuildPlan({ home, hash: sha(text) });
    try { if ((await P.readFile(plan.stampFile, 'utf8')).trim() === plan.stamp && await isFile(plan.bin)) return { ok: true, exe: plan.bin, built: false, ms: 0 }; } catch { /* not built yet */ }
    const cc = await macCompilers();
    if (!cc) return named('helper_missing', `the Mac has no compiler for its microphone helper — ${MM.MAC_MIC_RECIPE}`, { canBuild: false });
    await P.mkdir(plan.dir, { recursive: true });
    await P.writeFile(plan.src, text);
    const t0 = now();
    const slices = await Promise.all(plan.helper.slices.map((s) => run(s.file, s.args, { timeout: MM.MIC_HELPER.buildMs })));
    const bad = slices.find((x) => x.err);
    if (bad) return named('helper_missing', `the microphone helper did not build here (${firstErr(bad)}) — ${MM.MAC_MIC_RECIPE}`);
    for (const s of plan.helper.after) { const x = await run(s.file, s.args, { timeout: 30000 }); if (x.err) return named('helper_missing', `the microphone helper did not build here (${s.file}: ${firstErr(x)})`); }
    await P.writeFile(plan.stampFile, plan.stamp + '\n');
    log(`[mic] helper built in ${now() - t0} ms: ${plan.bin}`);
    return { ok: true, exe: plan.bin, built: true, ms: now() - t0 };
  }
  /** A Mac's plug-in, built and STAGED for the install row (never installed here). → { ok, bundle, exe, sha256, built } | refusal */
  async function stagePlugin() {
    if (helperPath) return named('no_compiler', `a fake helper stages no plug-in — ${MM.MAC_MIC_RECIPE}`, { canBuild: false });
    const S = sources();
    const plan = MM.macMicBuildPlan({ home, hash: sha(S.PLUGIN_C + S.PLUGIN_PLIST) });
    const stamp = `${plan.plugin.dir}/stamp`, want = `VibeSpaceMic ${sha(S.PLUGIN_C + S.PLUGIN_PLIST).slice(0, 16)}`;
    let fresh = false;
    try { fresh = (await P.readFile(stamp, 'utf8')).trim() === want && await isFile(plan.plugin.exe); } catch { fresh = false; }
    if (!fresh) {
      const cc = await macCompilers();
      if (!cc) return named('no_compiler', `the Mac has no compiler for the plug-in — ${MM.MAC_MIC_RECIPE}`, { canBuild: false });
      await P.rm(plan.plugin.bundle, { recursive: true, force: true });
      await P.mkdir(`${plan.plugin.bundle}/Contents/MacOS`, { recursive: true });
      await P.writeFile(plan.plugin.src, S.PLUGIN_C);
      await P.writeFile(plan.plugin.plist, S.PLUGIN_PLIST);
      for (const s of plan.pluginSteps) { const x = await run(s.file, s.args, { timeout: MM.MIC_HELPER.buildMs }); if (x.err) return named('plugin_failed', `the plug-in did not build here (${s.file}: ${firstErr(x)})`, { canBuild: true }); }
      await P.writeFile(stamp, want + '\n');
    }
    return { ok: true, bundle: plan.plugin.bundle, exe: plan.plugin.exe, sha256: sha(await P.readFile(plan.plugin.exe)), built: !fresh };
  }

  // ── FACTS ──
  const platformOfLine = (stdout) => { for (const l of String(stdout || '').split(/\r?\n/)) { if (!l.trim().startsWith('{')) continue; try { const o = JSON.parse(l); return o && (o.platform === 'win32' || o.platform === 'darwin') ? o.platform : null; } catch { return null; } } return null; };
  async function facts({ force = false, prepare = false } = {}) {
    if (!force && !prepare && memo && now() - memo.at < MM.MIC_LIMITS.factsMs) return memo.r;
    const h = await helper();
    if (!h.ok) { const r = { ...h, platform }; return { ...r, state: MM.micStateOf(h.code === 'unsupported' ? { code: 'unsupported', platform, error: h.error } : r) }; }
    const r = await run(h.exe, ['facts']);
    const p = (helperPath && platformOfLine(r.stdout)) || platform;
    const f = p === 'darwin' ? MM.parseMacFacts(r.stdout) : MM.parseWinFacts(r.stdout);
    if (!f.ok && r.err) f.error = `${f.error} (${firstErr(r)})`;
    const inst = await readJson(INSTALLED), rec = await readJson(DEFAULT_REC);
    const out = { ...f, platform: p, installedAt: inst && Number(inst.at) > 0 ? Number(inst.at) : null, bootAt: Math.round(now() - Number(uptime()) * 1000), previous: rec && rec.previous && (rec.previous.id || rec.previous.uid) ? rec.previous : null, helper: { built: !!h.built, ms: h.ms || 0 } };
    if (p === 'darwin' && prepare) out.stage = await stagePlugin();
    out.state = MM.micStateOf(out);
    memo = { at: now(), r: out };
    return out;
  }

  // ── THE DEFAULT PAIR ──
  async function setDefault({ to } = {}) {
    if (to !== 'virtual' && to !== 'restore') return named('bad_request', 'to = virtual | restore');
    const f = await facts({ force: true });
    if (!f.ok) return f;
    const st = f.state, doors = MM.micDefaultDoors(st, f.previous);
    let target = null;
    if (to === 'virtual') {
      if (!doors.make) return named(st.micIsDefault ? 'already_default' : 'not_installed', st.micIsDefault ? `«${st.mic.name}» is already the default microphone` : 'this machine has no virtual microphone to make the default');
      target = st.mic;
    } else {
      if (!f.previous) return named('nothing_to_restore', 'VibeSpace did not change this machine\'s default microphone');
      target = f.previous;
    }
    const h = await helper();
    if (!h.ok) return h;
    if (to === 'virtual') await writeJson(DEFAULT_REC, { previous: st.defaultMic, at: now() });
    const sp = MM.micHelperSpawn(f.platform, h.exe, 'setdefault', { device: target.id || target.uid });
    const r = await run(sp.file, sp.args, { names: sp.env });
    let o = null;
    for (const l of r.stdout.split(/\r?\n/)) { if (!l.trim().startsWith('{')) continue; try { o = JSON.parse(l); break; } catch { /* not ours */ } }
    if (!o || !o.ok) return named('set_failed', `the default microphone was not changed (${(o && o.error) || firstErr(r)})`);
    if (to === 'restore') { try { await P.unlink(DEFAULT_REC); } catch { /* gone */ } }
    log(`[mic] the default microphone is now ${o.endpoint || target.name} (${to})`);
    return { ok: true, to, device: { name: String(o.endpoint || target.name || '').slice(0, 200) }, facts: await facts({ force: true }) };
  }

  // ── THE RECEIVER ──
  async function ffmpegPath() {
    if (typeof ffmpeg === 'function') { try { const p = await ffmpeg(); if (p) return p; } catch { /* the PATH below */ } }
    for (const c of SP.ffmpegCandidates({ platform: platform === 'win32' ? 'win32' : 'linux', env: { PATH: lookupEnv.PATH || lookupEnv.Path || '', LOCALAPPDATA: lookupEnv.LOCALAPPDATA, USERPROFILE: lookupEnv.USERPROFILE }, delim: platform === 'win32' ? ';' : ':', sep: platform === 'win32' ? '\\' : '/' })) if (await isFile(c.path)) return c.path;
    return null;
  }
  /** One stream session's receiver. → { onRtp(rtp), stop(why), stats() } */
  function receiver(sid) {
    const rx = { state: 'idle', to: null, device: null, mic: null, packets: 0, bytes: 0, dropped: 0, runs: 0, startedAt: null, ended: null, helper: null, code: null, error: null };
    let pipe = null, starting = null, idle = null, q = [], closed = false;
    const tail = [];
    function write(pp, payload, ts) {
      try {
        if (pp.road === 'win32') {
          if (pp.ts0 === null) { for (const pg of oggOpusHead(2)) pp.dec.stdin.write(pg); pp.ts0 = ts; }
          pp.dec.stdin.write(oggPage(1, pp.seq++, ((ts - pp.ts0) >>> 0) + 960, 0, payload));
        } else pp.helper.stdin.write(macFrame(payload));
      } catch { rx.dropped++; }
    }
    function endPipe(why) {
      const pp = pipe; pipe = null;
      if (!pp) return;
      rx.state = rx.state === 'live' ? 'idle' : rx.state;
      rx.ended = { why, at: now() };
      log(`[mic] ${sid} ${rx.to === 'virtual' ? 'virtual microphone' : 'speakers'} road ended (${why})`);
      for (const c of [pp.dec, pp.helper]) { if (!c) continue; try { c.stdin.end(); } catch { /* gone */ } const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, STOP_GRACE_MS); t.unref?.(); c.once('exit', () => clearTimeout(t)); }
    }
    async function start() {
      const f = await facts();
      const st = f.state || MM.micStateOf(f);
      const t = MM.micTargetOf(st);
      if (closed) return;
      if (!t.to) { rx.state = 'no_target'; rx.code = t.code; rx.error = t.error; q = []; log(`[mic] ${sid} no road for the voice (${t.code})`); return; }
      const h = await helper();
      if (!h.ok) { rx.state = 'no_target'; rx.code = h.code; rx.error = h.error; q = []; return; }
      const road = f.platform === 'darwin' ? 'darwin' : 'win32';
      let dec = null;
      if (road === 'win32') {
        const ff = await ffmpegPath();
        if (!ff) { rx.state = 'no_target'; rx.code = 'no_ffmpeg'; rx.error = 'this machine has no ffmpeg to decode the voice'; q = []; return; }
        dec = spawn(ff, MM.DECODER_ARGS, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        dec.on('error', () => { rx.code = 'decoder_failed'; endPipe('decoder_failed'); });
        dec.stdin.on('error', () => { });
        dec.stderr.on('data', (d) => { tail.push(String(d).trim().slice(0, 200)); if (tail.length > 3) tail.shift(); });
      }
      if (closed) { try { dec && dec.kill(); } catch { } return; }
      const sp = MM.micHelperSpawn(road, h.exe, 'render', t.to === 'speakers' ? { speakers: true } : { device: t.device.id || t.device.uid });
      const child = spawn(sp.file, sp.args, { env: { ...env, ...sp.env }, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      child.on('error', (e) => { rx.code = 'helper_failed'; rx.error = String((e && e.message) || e).slice(0, 200); endPipe('helper_failed'); });
      child.stdin.on('error', () => { });
      let buf = '';
      child.stderr.on('data', (d) => {
        buf += String(d); const lines = buf.split(/\r?\n/); buf = lines.pop();
        for (const l of lines) { let o = null; try { o = JSON.parse(l); } catch { continue; } if (o && o.ev) { rx.helper = { ev: String(o.ev).slice(0, 20), underruns: Number(o.underruns) || 0, frames: Number(o.frames) || 0, ...(o.ev === 'error' ? { error: String(o.error || '').slice(0, 200) } : {}) }; if (o.ev === 'error') { rx.code = 'helper_error'; rx.error = String(o.error || '').slice(0, 200); } } }
      });
      const pp = { road, dec, helper: child, seq: 2, ts0: null };
      child.once('exit', (code) => { if (pipe === pp) { rx.code = rx.code || 'helper_exited'; rx.error = rx.error || `the microphone helper ended (${code})`; endPipe('helper_exited'); } });
      if (dec) { dec.stdout.pipe(child.stdin); dec.once('exit', (code) => { if (pipe === pp && code) { rx.code = 'decoder_exited'; rx.error = `ffmpeg ended (${code}${tail.length ? ': ' + tail[tail.length - 1] : ''})`; endPipe('decoder_exited'); } }); }
      pipe = pp;
      Object.assign(rx, { state: 'live', to: t.to, device: { name: t.device.name || '' }, mic: t.mic ? { name: t.mic.name || '' } : null, startedAt: now(), code: null, error: null });
      rx.runs++;
      log(`[mic] ${sid} live → ${t.to === 'virtual' ? `the virtual microphone «${(t.mic && t.mic.name) || ''}»` : `the speakers «${t.device.name || ''}»`}`);
      for (const x of q.splice(0)) write(pp, x.payload, x.ts);
    }
    function onRtp(rtp) {
      if (closed) return;
      const payload = Buffer.from(rtp.payload || []);
      rx.packets++; rx.bytes += payload.length;
      clearTimeout(idle); idle = setTimeout(() => endPipe('idle'), MM.MIC_LIMITS.idleMs); idle.unref?.();
      if (rx.state === 'no_target' && !pipe) return;
      const ts = rtp.header ? rtp.header.timestamp >>> 0 : 0;
      if (pipe) { write(pipe, payload, ts); return; }
      q.push({ payload, ts }); if (q.length > QUEUE_MAX) { q.shift(); rx.dropped++; }
      if (!starting) starting = start().catch((e) => { rx.state = 'no_target'; rx.code = 'start_failed'; rx.error = String((e && e.message) || e).slice(0, 200); }).finally(() => { starting = null; });
    }
    function stop(why = 'stopped') { closed = true; clearTimeout(idle); q = []; endPipe(why); rx.state = 'closed'; }
    const stats = () => ({ ...rx, device: rx.device && { ...rx.device }, mic: rx.mic && { ...rx.mic }, ended: rx.ended && { ...rx.ended }, helper: rx.helper && { ...rx.helper } });
    return { onRtp, stop, stats };
  }

  return { facts, setDefault, receiver, helper, stagePlugin, ffmpegPath }; // ffmpegPath + helper: the sound's road shares both (src/desktop-sound.js — lane speaker-passthrough-v1)
}

module.exports = { createMic, oggPage, oggOpusHead, macFrame };

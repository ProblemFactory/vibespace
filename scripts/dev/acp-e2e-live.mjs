#!/usr/bin/env node
// MANUAL live e2e for the ACP harness (S8): drives data/bin/acp-wrapper.js
// against the INSTALLED `opencode acp` (or $ACP_CMD "cmd arg…"), sends ONE
// prompt and prints the journal. Spends a real agent turn — never in the gate.
//   node scripts/dev/acp-e2e-live.mjs [cwd]
// Skips with evidence when the agent has no provider configured (auth methods
// are printed so the operator knows what to run).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const cmdline = (process.env.ACP_CMD || 'opencode acp').split(/\s+/);
const cwd = process.argv[2] || process.cwd();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-acp-live-'));
const env = { ...process.env, ACP_WEBUI_CWD: cwd, ACP_WEBUI_BACKEND: 'opencode' };
for (const k of Object.keys(env)) if (/^VIBESPACE_/.test(k)) delete env[k];
const child = spawn(process.execPath, [path.join(REPO, 'data/bin/acp-wrapper.js'), path.join(dir, 's.buf'), path.join(dir, 's.json'), ...cmdline], { env, stdio: ['pipe', 'pipe', 'inherit'] });
const records = [];
let lb = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); if (!l) continue; try { const r = JSON.parse(l); records.push(r); if (r.type === 'acp') console.log(`[${r.kind}]`, r.kind === 'update' ? r.update.sessionUpdate + ' ' + (r.update.content?.text || r.update.title || '').slice(0, 80) : JSON.stringify(r).slice(0, 200)); } catch {} } });
const waitFor = (pred, ms) => new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { const v = pred(); if (v) { clearInterval(t); res(v); } else if (Date.now() - t0 > ms) { clearInterval(t); rej(new Error('timeout')); } }, 50); });
try {
  const ses = await waitFor(() => records.find((r) => r.kind === 'session') || records.find((r) => r.kind === 'notice' && r.noticeKind === 'boot-failed'), 90000);
  if (ses.kind === 'notice') { console.log('SKIP (evidence): ' + ses.text + '\nlog: ' + path.join(dir, 'acp-wrapper.log')); process.exit(0); }
  console.log('session up:', ses.sessionId, 'agent', ses.agentInfo?.name, ses.agentInfo?.version, 'models', (ses.models || []).length, 'model', ses.model, 'mode', ses.mode);
  child.stdin.write(JSON.stringify({ type: 'chat-input', text: 'Reply with the single word: pong', msgId: 'live1' }) + '\n');
  const end = await waitFor(() => records.find((r) => r.kind === 'prompt_end'), 180000);
  console.log('prompt_end:', end.stopReason, end.error || '');
  const text = records.filter((r) => r.kind === 'update' && r.update.sessionUpdate === 'agent_message_chunk').map((r) => r.update.content?.text || '').join('');
  console.log('agent said:', JSON.stringify(text.slice(0, 200)));
  console.log(/pong/i.test(text) ? 'LIVE E2E OK' : 'LIVE E2E: unexpected reply');
} catch (e) { console.error('live e2e failed:', e.message, '— log:', path.join(dir, 'acp-wrapper.log')); process.exitCode = 1; }
finally { try { child.kill('SIGTERM'); } catch {} }

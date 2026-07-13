#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
const UNINSTALL = process.argv.includes('--uninstall');
const hookCmd = 'node ' + join(dirname(fileURLToPath(import.meta.url)), 'vibespace-hook.mjs');
const files = [
  { f: join(homedir(), '.claude', 'settings.json'), create: false, EVENTS: ['SessionStart', 'UserPromptSubmit', 'Stop'] },
  { f: join(homedir(), '.codex', 'hooks.json'), create: true, EVENTS: ['SessionStart', 'UserPromptSubmit'] },
];
const findOur = (list) => { for (const g of (Array.isArray(list) ? list : [])) { const h = (g.hooks || []).find(h => typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')); if (h) return h; } return null; };
for (const { f, create, EVENTS } of files) {
  try {
    let root = null; try { root = JSON.parse(readFileSync(f, 'utf-8')); } catch { root = null; }
    if (!root) { if (existsSync(f)) continue; if (UNINSTALL || !create) continue; root = {}; }
    if (!root.hooks || typeof root.hooks !== 'object') { if (UNINSTALL) continue; root.hooks = {}; }
    let changed = false;
    if (UNINSTALL) {
      for (const ev of Object.keys(root.hooks)) {
        if (!Array.isArray(root.hooks[ev])) continue;
        for (const g of root.hooks[ev]) {
          if (!g || !Array.isArray(g.hooks)) continue;
          const before = g.hooks.length;
          g.hooks = g.hooks.filter(h => !(h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')));
          if (g.hooks.length !== before) changed = true;
        }
        root.hooks[ev] = root.hooks[ev].filter(g => g && Array.isArray(g.hooks) && g.hooks.length);
      }
    } else {
      for (const ev of EVENTS) {
        if (!Array.isArray(root.hooks[ev])) root.hooks[ev] = [];
        const ours = findOur(root.hooks[ev]);
        if (ours) { if (ours.command !== hookCmd) { ours.command = hookCmd; changed = true; } }
        else { root.hooks[ev].push({ hooks: [{ type: 'command', command: hookCmd, timeout: 10 }] }); changed = true; }
      }
    }
    if (changed) { const tmp = f + '.tmp'; writeFileSync(tmp, JSON.stringify(root, null, 2) + '\n'); renameSync(tmp, f); }
  } catch { }
}

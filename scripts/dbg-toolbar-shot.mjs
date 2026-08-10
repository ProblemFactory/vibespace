#!/usr/bin/env node
// Capture how the top bars actually LOOK when resized (userW/xingwei report:
// resizing produces a big empty gap). Screenshots default / tall toolbar /
// taskbar-top tall taskbar → /tmp/tbshot-*.png for visual inspection.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!CHROME){console.log('SKIP: no chrome');process.exit(0);}
const PORT=3996,CDP=9346,wt='/tmp/vs-tbshot';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{execSync(`git worktree remove --force ${wt}`,{cwd:repo,stdio:'ignore'});}catch{}
execSync(`git worktree add --detach ${wt} HEAD`,{cwd:repo,stdio:'ignore'});
for(const f of ['src','public','server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo,'node_modules'),path.join(wt,'node_modules'));
execSync('npm run build',{cwd:wt,stdio:'ignore'});
const srv=spawn(process.execPath,['server.js'],{cwd:wt,env:{...process.env,PORT:String(PORT),VIBESPACE_SKIP_AGENT_HOOKS:'1'},stdio:'ignore'});
const chrome=spawn(CHROME,[`--headless=new`,`--remote-debugging-port=${CDP}`,'--no-first-run','--disable-gpu','--force-device-scale-factor=1','--window-size=1200,760','--user-data-dir=/tmp/vs-tbshot-chrome','about:blank'],{stdio:'ignore'});
process.on('exit',()=>{try{chrome.kill('SIGKILL');}catch{}try{srv.kill('SIGKILL');}catch{}try{execSync(`git worktree remove --force ${wt}`,{cwd:repo,stdio:'ignore'});}catch{}try{fs.rmSync('/tmp/vs-tbshot-chrome',{recursive:true,force:true});}catch{}});
for(let i=0;i<40;i++){try{await fetch(`http://127.0.0.1:${PORT}/api/home`);break;}catch{await sleep(250);}}
const WebSocket=require('ws');
let target=null;
for(let i=0;i<40&&!target;i++){try{target=(await(await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(t=>t.type==='page');}catch{await sleep(250);}}
const ws=new WebSocket(target.webSocketDebuggerUrl,{maxPayload:64*1024*1024});
await new Promise(r=>ws.on('open',r));
let seq=0;const pend=new Map();
ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
const cdp=(method,params={})=>new Promise((res,rej)=>{const id=++seq;pend.set(id,m=>m.error?rej(new Error(m.error.message)):res(m.result));ws.send(JSON.stringify({id,method,params}));});
const evalJs=async e=>{const r=await cdp('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const shot=async(name)=>{const r=await cdp('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:1200,height:260,scale:1}});fs.writeFileSync(`/tmp/tbshot-${name}.png`,Buffer.from(r.data,'base64'));console.log('  wrote /tmp/tbshot-'+name+'.png');};
await cdp('Page.enable');
await cdp('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await sleep(1500);
await evalJs('window.app?app.ready:Promise.reject(new Error("no app"))');
await sleep(700);
// apply the USER's real 2-row chrome arrangement (inbox+usage in toolbar-row2)
await evalJs(`(async()=>{
  app.settings.set('taskbar.desktopPreviewRatio', 80);
  app.settings.set('chrome.springs', {"spring-3":{"mode":"fixed","px":222},"spring-4":{"mode":"fixed","px":366}});
  app.settings.set('chrome.arrangement', {"toolbar-center":["taskbar-status","spring-2","layout-presets","desktop-previews","spring-6"],"toolbar-right":["btn-presets","btn-new-session","btn-terminal","btn-file-explorer","btn-browser","btn-desktop"],"toolbar-row2":["spring-3","spring-1","taskbar-user-todos","taskbar-usage","spring-5","spring-4"],"taskbar-tray":[],"taskbar-row2":[]});
})()`);
await sleep(700);
await shot('01-default');
// NEW scale model: compact (0.8), large (1.5) — must have NO dead band
await evalJs(`document.documentElement.style.setProperty('--toolbar-scale','0.8')`);
await sleep(400); await shot('02-scale-compact');
await evalJs(`document.documentElement.style.setProperty('--toolbar-scale','1.25')`);
await sleep(400); await shot('03-scale-large');
await evalJs(`document.documentElement.style.removeProperty('--toolbar-scale')`);
await sleep(200);
// measure: toolbar height should be content-fit at each scale, no dead band
const heights = await evalJs(`(()=>{
  const r=document.documentElement, ws=document.getElementById('workspace'), tb=document.getElementById('toolbar');
  const out={};
  for(const sc of [0.7,1,1.25]){ if(sc===1) r.style.removeProperty('--toolbar-scale'); else r.style.setProperty('--toolbar-scale',sc);
    void document.body.offsetHeight;
    out['s'+sc]={workspaceH:ws.offsetHeight, toolbarRendered:Math.round(tb.getBoundingClientRect().height)}; }
  r.style.removeProperty('--toolbar-scale');
  return out;
})()`);
console.log('WORKSPACE height by scale (truth metric):', JSON.stringify(heights));
// taskbar-top + tall taskbar (the userW setup)
await evalJs(`app.settings.set('taskbar.position','top')`); await sleep(300);
await evalJs(`(()=>{const tb=document.getElementById('taskbar');tb.style.height='110px';app.desktopManager&&app.desktopManager._adaptTaskbarSize&&app.desktopManager._adaptTaskbarSize(110);})()`);
await sleep(400); await shot('04-taskbartop-tall');
// report the actual computed layout of the tall taskbar tray
const info=await evalJs(`(()=>{
  const tb=document.getElementById('taskbar'); const cs=getComputedStyle(tb);
  const tray=document.querySelector('#taskbar [data-zone="taskbar-tray"]')||document.getElementById('taskbar-items');
  const kids=[...tb.children].map(c=>({id:c.id||c.className.slice(0,24), h:Math.round(c.getBoundingClientRect().height), top:Math.round(c.getBoundingClientRect().top)}));
  return {taskbarH:tb.offsetHeight, alignItems:cs.alignItems, justify:cs.justifyContent, flexDir:cs.flexDirection, kids};
})()`);
console.log('tall taskbar layout:', JSON.stringify(info,null,1));
ws.close();
process.exit(0);

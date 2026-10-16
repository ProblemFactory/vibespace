# The screen source on the owner's Windows machine — the real leg (lane stream-p1b-screen)

**Who runs it:** 主开发, on the owner's machine, and only with the owner's nod. Commands go through `vibespace-exit run/push/pull`. **Not run by the lane.** The lane proved everything it could with a fake ffmpeg (test-stream-op §8/§9, test-desktop-webrtc-chrome ⑩, test-stream-plan). This protocol covers what only the real machine can prove: DDA, NVENC, DisplayConfig, DXGI, and the picture in a real browser.

`<m>` below is the machine as `vibespace-exit list` names it. The P0 probe folder is `%USERPROFILE%\vs-probe`. It still holds the static ffmpeg (`ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe`), plus `calib.ps1` and `calib.json`.

## 0. Before

- The hub runs the release with this lane (2.369.295 or later), and the machine's agent has upgraded to it. Its hello lists `stream-facts` and `stream-screen`.
- The agent finds ffmpeg in this order: PATH → `%LOCALAPPDATA%\vibespace\ffmpeg\bin` → the probe folder. The P0 build is in the probe folder, so nothing needs installing. To keep it there for good, copy it with the owner's nod: `vibespace-exit run <m> -- mkdir "%LOCALAPPDATA%\vibespace\ffmpeg\bin" & copy /Y %USERPROFILE%\vs-probe\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe "%LOCALAPPDATA%\vibespace\ffmpeg\bin\"`.

## 1. The facts script, on its own (DisplayConfig + DXGI, compiled by PowerShell 5.1)

```sh
node -e "process.stdout.write(require('./src/stream-plan.js').STREAM_FACTS_PS)" > /tmp/stream-facts.ps1   # in the repo
vibespace-exit push /tmp/stream-facts.ps1 <m> '%USERPROFILE%\vs-probe\stream-facts.ps1' --overwrite
vibespace-exit run <m> -- powershell -NoProfile -ExecutionPolicy Bypass -File %USERPROFILE%\vs-probe\stream-facts.ps1
```

**Pass:** one `{"t":"stream-facts",…}` line, with:
- `dxgi` ≥ 2;
- each row has its bounds and a `dc` cell of `<advancedColor>,<SDRWhiteLevel>`: both monitors `dc` = `…,2500` with the HDR bit (2) set (P0: both HDR, white 200 nits);
- each row has a `dxgi` cell `0,<n>`: both on adapter 0, the RTX 5090.

Keep the line, because the report quotes it. **If `dxgi` is 0:** only the primary display can stream (`display_unmapped` for the other). Note it and go on.

## 2. The capture argv on the real ffmpeg + THE mapping (exact, no browser)

Show the calibration window, then grab one FP16 frame with the mapped road's capture argv (`captureArgv`, writing one frame to a file instead of stdout):

```sh
vibespace-exit run <m> -- powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%USERPROFILE%\vs-probe\calib.ps1','-Seconds','60'"
vibespace-exit run <m> -- %USERPROFILE%\vs-probe\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe -hide_banner -loglevel error -y -f lavfi -i ddagrab=output_idx=0:output_fmt=16bit:framerate=30 -vf hwdownload,format=rgbaf16le -frames:v 1 -f rawvideo -pix_fmt rgbaf16le %USERPROFILE%\vs-probe\p1b-frame.raw
vibespace-exit pull <m> '%USERPROFILE%\vs-probe\p1b-frame.raw' /tmp/p1b-frame.raw --overwrite
vibespace-exit pull <m> '%USERPROFILE%\vs-probe\calib.json' /tmp/p1b-calib.json --overwrite
node scripts/probes/stream-screen-calib.mjs raw /tmp/p1b-frame.raw 3840 2160 /tmp/p1b-calib.json --white 2500
```

**Pass:** the file is 3840·2160·8 = 66 355 200 bytes and the probe prints `ALL 19 patches EXACT`. (Lane check: the same probe gave 19/19 exact on the P0's own `cal2-half.raw`.) If a patch is off, keep the printed table. Its `fp16` column holds the bits the machine wrote.

## 3. The stream (the owner's browser)

The owner opens the machine's desktop window: Remote → the machine → Desktop. The window must stream rather than show VNC.
- The chip reads `串流 · N ms · N fps`.
- The strip ends `… · NVENC · 编码 N ms`.
- The chip's title (hover) includes `HDR 已在机器上映射（SDR 白点 200 nits）`.

The session's numbers come from `GET /api/desktop/machine-desktop/stream/facts?host=<id>&machine=1`, read in the owner's signed-in tab (people only). Check these fields:
- `sessions[0].stats.screen`: `mode: mapped`, `encoder: NVENC`, `mapper: worker`, `encodeMs`, `mapMs`, `captured`, `dropped`, `keyWaitMs`;
- `machine.primary`: `mode: mapped`, `encoder: NVENC`, `white: 2500`.
The agent's log line is `[stream] screen source: mapped, \\.\DISPLAY1 3840×2160 @ 30 fps, NVENC 8000 kbps, white 2500`.

**Pass:**
- it plays at ≥ 25 fps (`stats.fps`);
- `encodeMs` ≤ 40 (capture's first byte → the access unit: map + encode + both pipes);
- `mapMs` ≤ 25: the lane measured 20.7 ms per 4K frame on one thread of a Ryzen AI MAX+ 395 (Zen 5). The owner's CPU decides the real number; write it down.
- `dropped` grows slowly or not at all.

## 4. Colour acceptance — the calibration window through the stream (±2)

1. Run `calib.ps1` again (step 2's first line). While it shows, paste the snippet from `node scripts/probes/stream-screen-calib.mjs snippet /tmp/p1b-calib.json` into the console of the VibeSpace tab that plays the stream.
2. The snippet draws the `<video>` frame and reads the 19 patch centres. calib.json's logical coordinates × (video width / 2194) gives video pixels.

**Pass:** `PASS: all 19 patches within ±2 (3840×2160)`. The tolerance covers H.264 4:2:0 and the browser's YUV → RGB; the mapping itself is exact (step 2).

**If it fails, the culprit is:**
- a constant offset on every patch ⇒ the browser ignoring the VUI (BT.709 / sRGB-curve / limited-range tags);
- the brightest greys alone off ⇒ the white level (re-read step 1);
- the bright end clipped ⇒ the 8-bit road was taken (check `mode`).

The owner's eyes are the final oracle (P0 lesson). Also ask: «颜色对吗？».

## 5. Latency (the part A harness)

Use `scripts/probes/stream-glass-to-glass.mjs`:
- `clock` mode serves the clock page; open it full screen on the machine;
- `snippet` mode prints the viewer script for the VibeSpace tab.

Record median / p95 for 30 s, beside the strip's `encodeMs`.

## 6. Endings, by name

- With the owner's nod: `vibespace-exit run <m> -- taskkill /IM ffmpeg.exe /F`. **Pass:** the window falls back to the VNC picture with the note `串流停了（机器的屏幕采集停了）——改为显示 VNC 画面`. If the encoder died first, the note says `机器的视频编码器停了`.
- A UAC prompt or a display mode change makes DDA lose its output (`DXGI_ERROR_ACCESS_LOST`), and the stream ends the same way. P1 does not restart the capture (§ report "not done").

## 7. Bring back

The facts line, the probe table (step 2), and the snippet's table (step 4). Also `stats.screen` and the glass-to-glass numbers, plus a screenshot of the window streaming with its strip. Put them in the integration report.

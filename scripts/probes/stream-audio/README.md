# stream-audio — the machine stream's SOUND: speaker passthrough and the microphone road (probe)

Probe sources only. Nothing here ships and nothing in `src/` calls it. The findings are in `docs/changelog-engineering.md`
(lane stream-audio-probe). The ask (owner 2026-10-19) was: what the machine's speakers play should reach the viewer, and what
the viewer says should reach the machine as a microphone. The rule: no third-party host or driver.

| file | where it runs | what it is |
|---|---|---|
| `win/vs-audio-probe.cs` | the Windows machine (in-box csc, C# 5) | Uses WASAPI over plain COM interop. `facts` lists the endpoints and the loopback mix format. `loop` is a LOOPBACK capture of a render endpoint with optional pieces: a silent keep-alive render stream, our own 1 kHz −20 dBFS 200 ms test tones, and s16le PCM to stdout. `render` is the intercom: stdin PCM to the endpoint, watched by its loopback. `--device <name part>` picks an active endpoint, so a virtual one keeps the tones inaudible. |
| `win/win-leg.cjs` | the Windows machine (the agent's Node) | `encode`: loopback PCM → ffmpeg libopus → RTP on loopback UDP, timing each tone from the app's write to its Opus packet. `rtpgaps` is the clumping control. `intercom` runs PCM or Ogg Opus → ffmpeg decode → `render`. |
| `win/media-drivers.ps1` | the Windows machine (read-only) | Which drivers back the audio devices (provider, signer, INF, .sys). |
| `mac/vibespace-audio-lane.swift` | the Mac (a scratch helper, never the installed one) | `facts`: the default output, and whether AudioToolbox has an Opus encoder plus a decode round trip. `cap`: ScreenCaptureKit `capturesAudio` with our tones scheduled at known host times, and `--opus 1` encodes in-box. Run it under the probe's granted `p3m-tcc` (scripts/probes/stream-p3m/). |
| `mac/vsmic/vsmic.c` + `vsmic-Info.plist` | the Mac (built in a scratch dir, NEVER installed) | A minimal AudioServerPlugIn with one virtual device, "VibeSpace Microphone". Its OUTPUT stream is the agent's feed. Its INPUT stream is the mic every app sees: a loopback ring, sample time for sample time. |
| `mac/vsmic/vsmic-host.c` | the Mac | Load-tests the bundle WITHOUT installing it. It loads the bundle the way coreaudiod does (CFPlugIn factory from the Info.plist, QueryInterface, Initialize with a host stub), then walks the HAL's properties and runs the IO cycle (StartIO, zero time stamps, WriteMix of a tone, then ReadInput). |
| `hub/audio-leg.mjs` + `page.html` + `worklet.js` | the hub (werift + headless Chrome) | The WebRTC road with a FAKE machine. The speaker is Opus RTP beside the fake H.264 video, in one MediaStream. The fallback is the same Opus frames on a data channel → WebCodecs AudioDecoder → an AudioWorklet player. The mic is Chrome's fake microphone sent back on the same m-line. `--jitter MS` adds network jitter. |
| `hub/udp-sendlog.mjs` | the hub | A `--import` preload that logs every DTLS datagram sent and received (far end, local socket). |

## Build and run

```sh
# Windows (in %USERPROFILE%\vs-probe\audio\, through vibespace-exit; the 30 s cap ⇒ ≤ 6 s legs)
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /out:vs-audio-probe.exe vs-audio-probe.cs
vs-audio-probe.exe facts
vs-audio-probe.exe loop --secs 3 --keepalive 0 --device "Steam Streaming Speakers"       # a silent endpoint: 0 packets
vs-audio-probe.exe loop --secs 4 --keepalive 1 --tone 1.0,2.5 --device "Steam Streaming Speakers"
<agent node.exe> win-leg.cjs encode <ffmpeg.exe> 6 "Steam Streaming Speakers" lowdelay 20 wav  # plain | lowlat | block | wav
<agent node.exe> win-leg.cjs intercom <ffmpeg.exe> 5 "Steam Streaming Speakers" mic-tone.ogg

# Mac (in ~/vs-probe/audio/)
swiftc -O -o vibespace-audio-lane vibespace-audio-lane.swift && codesign -s - -f vibespace-audio-lane
~/vs-probe/p3m/p3m-tcc $PWD/vibespace-audio-lane cap --secs 4 --tone 1.0,2.5 --opus 1
mkdir -p VibeSpaceMic.driver/Contents/MacOS && cp vsmic-Info.plist VibeSpaceMic.driver/Contents/Info.plist
clang -O2 -Wall -arch arm64 -arch x86_64 -mmacosx-version-min=12.0 -bundle -o VibeSpaceMic.driver/Contents/MacOS/VibeSpaceMic vsmic.c -framework CoreAudio -framework CoreFoundation
clang -O2 -Wall -o vsmic-host vsmic-host.c -framework CoreAudio -framework CoreFoundation && ./vsmic-host "$PWD/VibeSpaceMic.driver"

# hub
node scripts/probes/stream-audio/hub/audio-leg.mjs --secs 7 --runs 3 [--jitter 30] [--dc-target-frames 2880]
```

## Traps

- **Name the plist `vsmic-Info.plist` in the build directory.** A loose `Info.plist` next to `vsmic-host` makes CF treat that
  directory as the host's MAIN bundle, which registers the same factory UUID twice. `CFBundleCreate` then returns NULL. The
  log says "More than one bundle with the same factory UUID detected".
- **ffmpeg's raw PCM demuxer** (`-f s16le`) reads about 4096 frames (85 ms) per packet. Its Opus packets come out in ~90 ms
  clumps whether the input is a pipe or UDP. Feed a streaming WAV header with `-f wav -max_size 1920 -ignore_length 1` and
  the clumps become 20 ms packets.
- **WASAPI loopback of an endpoint that nothing plays to delivers NOTHING**: no packets and no events, not silence. Keep a
  silent render stream open on the same endpoint.
- **Ask for 48 kHz float stereo with AUTOCONVERTPCM.** A 5.1 mix then arrives as stereo, but the engine's up/down-mix scales a
  tone (0.1 → 0.03). Read the front-left channel of the raw mix (`--convert 0`) when the level matters.
- **On a multi-homed hub, pin werift to ONE address** (`iceInterfaceAddresses`). Without the pin, DTLS never completes; see
  audio-leg.mjs, THE PIN.

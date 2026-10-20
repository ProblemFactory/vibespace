# stream-mic — a virtual MICROPHONE through an existing driver (probe)

Probe sources only. Nothing here ships and nothing in `src/` calls it. Findings: `docs/changelog-engineering.md` (lane
stream-mic-wheel-probe) and the lane report.

The ask (owner 2026-10-19): what the viewer says should reach the machine as a MICROPHONE any app can pick.
- **Windows** has no user-mode API for that (lane stream-audio-probe). So the "existing wheel" is VB-CABLE: a signed driver
  the owner installs once, downloaded from VB-Audio at install time.
- **Mac:** our own AudioServerPlugIn (scripts/probes/stream-audio/mac/vsmic/) against BlackHole 2ch.
- **Rule:** installing a driver is the OWNER's act. These scripts only ask Windows / macOS for it on the machine's own screen
  (UAC / the administrator password dialog). They never change a default device unasked and never reboot.

| file | where it runs | what it is |
|---|---|---|
| `win/mic-pack.ps1` | Windows (read + download) | Downloads the official VB-CABLE pack into `%USERPROFILE%\vs-probe\mic\`. Records the zip's SHA-256, each file's SHA-256, the Authenticode signer of the setup programs and catalogs, and the INF facts. |
| `win/mic-state.ps1` | Windows (read-only) | Is VB-CABLE present (PnP, driver package, service, .sys). Does Windows owe a reboot. Reads the microphone privacy switches and the TrustedPublisher facts. |
| `win/mic-install.ps1` + `mic-install-launch.ps1` | Windows (only after the owner's yes) | The product's TightVNC shape. An unelevated starter asks for UAC (`Start-Process -Verb RunAs -Wait`, the script `-EncodedCommand`). The elevated window downloads into an admin-only directory, checks the zip and setup SHA-256 and the signer, then runs `VBCABLE_Setup_x64.exe -i -h`. It reads the devices back and never reboots. The launcher detaches it past the 30 s run cap. |
| `win/vs-mic-probe.cs` | Windows (in-box csc, C# 5) | WASAPI. `facts`: endpoints with ids and the default for each flow × role. `cable`: our tones, or stdin PCM, into a render endpoint by name, captured from a capture endpoint by name (no loopback), all on one QPC clock. It refuses when that render endpoint is a default speaker or something plays into it. `setdefault`: IPolicyConfig, only with `--yes 1`; it ran only to restore the owner's defaults. |
| `win/app-listen.ps1` | Windows | "An app": a separate PowerShell process that records CABLE Output through waveIn (MME) and stamps each tone. |
| `win/app-leg.cjs` | Windows (the agent's Node) | `apps`: ffmpeg (DirectShow) and app-listen.ps1 record CABLE Output while vs-mic-probe plays tones into CABLE Input. `voice`: Ogg Opus pages, then ffmpeg decode, then `cable --stdin 1`, then the cable. |
| `win/setupapi-tail.ps1` | Windows (read-only) | The driver install's own record in setupapi.dev.log (signer score, attestation, the device start). |
| `hub/mic-road.mjs` | the hub (werift + headless Chrome) | A fake microphone with tones, through getUserMedia, Chrome's Opus, werift (the agent's), a live Ogg page per packet and a streaming ffmpeg decode, to PCM. Every tone is stamped on one clock against the page's own WebAudio graph. Takes `--aec 1|0`. |
| `mac/vs-mac-mic.swift` | the Mac | CoreAudio HAL. `facts`: devices and defaults. `loop`: tones into a virtual device's output by UID, its input read in the same IOProc. `listen`: a separate reader. `setdefault`: only with `--yes 1`. |
| `mac/mic-install-mac.sh` | the Mac (only after the owner's yes) | The administrator password dialog (`do shell script … with administrator privileges`). Installs ours (the installed copy's SHA-256 is checked while root-owned) or BlackHole (pkg SHA-256 and Developer ID checked). Restarts coreaudiod. Also has `remove-ours` and `remove-blackhole`. |

## Build and run

```sh
# Windows (%USERPROFILE%\vs-probe\mic\, through vibespace-exit; ≤ 30 s a run)
powershell -NoProfile -ExecutionPolicy Bypass -File mic-pack.ps1
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /out:vs-mic-probe.exe vs-mic-probe.cs
vs-mic-probe.exe facts
vs-mic-probe.exe cable --secs 4 --render "CABLE Input" --capture "CABLE Output" --tone 1.0,2.5
<agent node.exe> app-leg.cjs apps <ffmpeg.exe> 5
<agent node.exe> app-leg.cjs voice <ffmpeg.exe> 4 <mic-tone.ogg>
# hub
WT=<repo> node scripts/probes/stream-mic/hub/mic-road.mjs --secs 6 --runs 3 --aec 1
# Mac (~/vs-probe/mic/)
swiftc -O -o vs-mac-mic vs-mac-mic.swift && codesign -s - -f vs-mac-mic && ./vs-mac-mic facts
```

## Traps

- **Installing VB-CABLE makes Windows switch the DEFAULT speaker (console + multimedia) and microphone (all roles) to the
  cable.** The owner's sound then flows into CABLE Input and his apps record CABLE Output. An install row must snapshot the
  defaults before and restore them after (IPolicyConfig `SetDefaultEndpoint`), and say so.
- **Cast IAudioSessionControl through the RCW and you get E_NOINTERFACE** (the .NET 4.8 console). Call its vtable slot raw.
- **The endpoint peak meter of an idle cable reads ~1e-5, not 0.** A "something plays into it" guard needs a floor (−60 dBFS).
- **Escape non-ASCII in a helper's JSON** (`\uXXXX`). The console code page is GBK on the owner's box, and a device name
  (e.g. Sound Blaster's) holds characters GBK cannot encode.
- **`cmd` eats `''` quoting in a vibespace-exit line.** Push a `.ps1` launcher instead of an inline `Start-Process` argument list.
- **The page's MediaStreamSource taps stay alive across runs** until the track is stopped. Stop the track and disconnect, or
  every later run counts each onset once per earlier run.

# stream-p3m — the Mac capture / encode / input / TCC probe (P3m-0, design q-041 r3 §3)

Probe sources only: nothing here ships, nothing in `src/` calls them. The findings are in the lane's report and in the
`docs/changelog-engineering.md` block for P3m-0. They are built and run ON the paired Mac, in `~/vs-probe/p3m/`, through
`vibespace-exit` (push the sources, then `run` one shell line at a time; legs over 30 s run detached through `leg.sh`).

| file | what it is |
|---|---|
| `sck-probe.swift` | ScreenCaptureKit + VideoToolbox helper: `props` (the API surface on this macOS, no TCC), `list`, `cap` (an SCStream counted per frame status, optional `--dump`, `--enc`, `--pipe`), `shot` (SCScreenshotManager), `synth` (the encoder / pipe on synthetic IOSurface frames) |
| `p3m-aux.swift` | TCC + session facts, the 11-grey calibration window (calib.ps1's layout in points, sRGB-tagged), CGEvent posting (`pid` = CGEventPostToPid, `hid` = CGEventPost(.cghidEventTap), guarded), AX read-back / close for the probe's OWN windows, disclaimed `spawn` |
| `p3m-tcc.swift` | the probe's ONE stable TCC client: re-spawns itself with responsibility disclaimed, then runs the target as a plain child ⇒ tccd attributes every helper under it to `p3m-tcc`, not to the agent's `node` |
| `greys.mjs` | the greys table of a dumped frame (BGRA / 420v / 420f / x420 / xf20), found by the calibration window's magenta ground |
| `leg.sh` | `leg.sh <name> <cmd…>`: one leg detached, output in `<name>.log`, `LEG DONE <rc>` at the end |
| `capture-a.sh` | leg 1: the main display through every pixel format / colour space / size (`--dump` each) |
| `states.sh` | leg 2: the calibration window + a TextEdit document visible / covered / minimized / on a non-current Space |
| `input.sh` | leg 4: CGEventPostToPid into TextEdit (Chrome frontmost) and into a Chrome `data:` window (TextEdit frontmost), the receiver control, the HID tap with and without Accessibility |
| `real.sh` | legs 1 + 3 on real frames: SCK → VideoToolbox in the helper, SCK → pipe → ffmpeg, WindowServer / replayd CPU |

## Build (on the Mac; Command Line Tools)

```sh
cd ~/vs-probe/p3m
for s in sck-probe p3m-aux p3m-tcc; do swiftc -O -o $s $s.swift && codesign -s - -f $s; done
# a binary for OTHER Macs: the default deployment target is the build machine's macOS (minos 26.0 here)
swiftc -O -target arm64-apple-macos15.0  -o sck-arm64  sck-probe.swift
swiftc -O -target x86_64-apple-macos15.0 -o sck-x86_64 sck-probe.swift
lipo -create -output sck-universal sck-arm64 sck-x86_64 && codesign -s - -f sck-universal
```

Never rebuild `p3m-tcc` after the owner granted it: an ad-hoc grant is keyed to the binary's path + code identity.

## Legs (examples)

```sh
./sck-probe props                                         # no TCC
./p3m-aux facts                                           # who tccd will blame, the four preflights, lock state, EDR
./p3m-tcc $PWD/sck-probe list                             # displays + windows (the refusal without Screen Recording)
./p3m-aux calib 120 200 200 --anim &                      # the calibration window (prints its CGWindowID)
./p3m-tcc $PWD/sck-probe cap display 3 --fmt BGRA --secs 5 --dump d-bgra --at 20
./p3m-tcc $PWD/sck-probe cap title vs-p3m-calib --fmt 420v --dump w-420v && node greys.mjs w-420v
./p3m-tcc $PWD/sck-probe cap display 3 --fmt 420v --enc h264 --profile cb --bps 20000000 --idr 60 --es d.h264
./sck-probe synth 3840 2160 --fmt 420v --enc h264 --profile cb --secs 4 [--lowlat 0] [--pace 0] [--content noise]
./sck-probe synth 3840 2160 --fmt 420v --pipe --pace 0 | ffmpeg -f rawvideo -pix_fmt nv12 -s 3840x2160 -r 60 -i - \
    -c:v h264_videotoolbox -realtime 1 -prio_speed 1 -profile:v constrained_baseline -b:v 20M -f h264 out.h264
./p3m-tcc $PWD/p3m-aux pid <pid> "text"                   # CGEventPostToPid (WindowServer checks kTCCServicePostEvent)
```

Rules the probe kept: no settings changed, no grants by the probe, nothing installed outside `~/vs-probe`, input only into
windows the probe opened (its calibration window, a TextEdit document it created, a Chrome window on a `data:` URL).

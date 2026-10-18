# stream-hdr — can the desktop stream's viewer show TRUE HDR? (probe, lane stream-hdr-probe, design q-041 r3 §3 P4)

Measures, builds nothing. The findings are in docs/changelog-engineering.md (2.369.300, `lane stream-hdr-probe`).

| file | what it does |
|---|---|
| `make-clips.mjs --out <dir>` | ONE synthetic 10-bit PQ picture (1280×720, 5 s: 100 / 203 / 1000-nit squares, a moving 1000-nit marker, a 0 → 1000-nit ramp, exact codes via geq) encoded as HEVC Main10 (mp4 + Annex-B), AV1 10-bit (mp4 + IVF), VP9 profile 2 (webm + IVF), low-delay AV1 / VP9 twins, an 8-bit AV1 control and an 8-bit H.264 baseline with PQ in its VUI; then `hdr-probe.html` = page.html with every clip inlined (one file, opens from disk) |
| `page.html` | the OWNER's page: tiles (a) SDR white · (b) `<video>` of the PQ file · (c) WebCodecs → 2D canvas `rec2100-pq` (the nearest it takes, said in the caption) · (d) WebCodecs → WebGPU `rgba16float` + `toneMapping: extended`, our own PQ maths (+ an offscreen read-back of the maths) · (e) WebRTC loopback: the browser's own encoder, every encoded frame swapped for the clip's by a sender RTCRtpScriptTransform, decoded by its own WebRTC decoder into a `<video>`. Below: this browser's API table (`hdrFacts()`). Answers per tile + **Save facts** → `Downloads/hdr-facts-<browser>.json` |
| `facts-hub.mjs` | `hdrFacts()` in a headless browser over raw CDP (Node ≥ 22). Hub: `--clips <dir>` (variants suite / gpu / experimental / native). A paired machine: push this file + hdr-probe.html, run it with the machine's Node and browser, `--bundle hdr-probe.html --chrome <browser> --only native`; `--shot <dir>` adds the tile pass (`--steps`, `--settle`, `--step-ms`, `--no-facts` keep a run under the 30 s `vibespace-exit run` cap) |
| `webrtc-leg.mjs` | werift (ICE-lite, as src/agentd/stream-host.js) → the hub's Chrome: AV1 10-bit / 8-bit control, H.264 8-bit PQ (the product's own src/stream-h264.js packetizer), VP9.2 ± the color-space header extension, each `native` (Chrome's WebRTC decoder → `<video>`) and `transform` (encoded frames → WebCodecs); a data channel's throughput. `--chrome-log <file>` keeps Chrome's WebRTC log (the refusal's reason) |
| `summarize.mjs` | facts files (facts-hub output or a Save facts file) → one markdown table per API, one column per browser; the owner's answers last |

## The owner's eye test (the oracle: no headless browser has an HDR screen)

Windows (HDR on, Edge): `C:\Users\marti\vs-probe\hdr\hdr-probe.html` · Mac (the PG27UCDMs, Safari and Chrome): `~/vs-probe/hdr/hdr-probe.html`.
Per tile: is its RIGHT square (1000 nits) clearly brighter than (a)'s white? (b) is the control — not brighter ⇒ this screen / browser is not showing HDR at all. (e): answer with `av1 10-bit PQ` selected, Save facts, then `h264 8-bit PQ`, answer, Save again (and: are there bands in its ramp?). Pull the files back with `vibespace-exit pull`, render with summarize.mjs.

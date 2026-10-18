#!/bin/sh
# leg 1 matrix: the main display (id 3) through every pixel format / colour space / size SCK takes; WindowServer + replayd CPU
cd ~/vs-probe/p3m
WS=$(pgrep -x WindowServer); RP=$(pgrep -x replayd)
cpu() { ps -o time= -p $1 | awk -F'[:.]' '{ if (NF==3) printf "%.2f\n", $1*60+$2+$3/100; else printf "%.2f\n", $1*3600+$2*60+$3+$4/100 }'; } # %.2f: bc refuses awk's 1.6e+06
w0=$(cpu $WS); r0=$(cpu $RP); sleep 5; echo "BASELINE 5 s, no capture: WindowServer $(echo "$(cpu $WS) - $w0" | bc) s, replayd $(echo "$(cpu $RP) - $r0" | bc) s"
cap() { n=$1; shift; w0=$(cpu $WS); r0=$(cpu $RP)
  echo "== $n: $*"; ./p3m-tcc $PWD/sck-probe cap display 3 --secs 3 --dump $n --at 20 "$@" 2>&1 | grep -E "asked|frames by|FAILED|STOPPED|pixelbuffer|contentScale|REFUSED|^att (CGColorSpace|CVImageBufferColorPrimaries|CVImageBufferTransferFunction|CVImageBufferYCbCrMatrix)" | cut -c1-220
  echo "   WindowServer +$(echo "$(cpu $WS) - $w0" | bc) s, replayd +$(echo "$(cpu $RP) - $r0" | bc) s (3 s capture)"; }
cap d-bgra-pt --fmt BGRA --size points
cap d-bgra-nominal --fmt BGRA --res nominal --size 1920x1080
cap d-bgra-srgb --fmt BGRA --cs srgb
cap d-bgra-p3 --fmt BGRA --cs p3
cap d-420v --fmt 420v
cap d-420f --fmt 420f
cap d-x420 --fmt x420
cap d-xf20 --fmt xf20
cap d-l10r --fmt l10r
cap d-xf44-local --fmt xf44 --dr local --cs p3pq
cap d-xf44-canon --fmt xf44 --dr canonical --cs p3pq
cap d-bgra-local --fmt BGRA --dr local
cap d-RGhA --fmt RGhA --dr local --cs p3pq

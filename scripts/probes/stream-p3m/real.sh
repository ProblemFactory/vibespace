#!/bin/sh
# leg 1/3 on REAL frames: SCK → VideoToolbox in the helper (the build shape), SCK → pipe → ffmpeg, and what the capture costs
# WindowServer / replayd (CPU seconds per 5 s, the animated calibration window on screen)
cd ~/vs-probe/p3m
T=$PWD/p3m-tcc; S=$PWD/sck-probe
pgrep -f "p3m-aux calib" >/dev/null || { nohup ./p3m-aux calib 900 200 200 --anim > calib.log 2>&1 & sleep 1.5; }
C=$(awk '/^calib pid/ {print $5; exit}' calib.log)
WS=$(pgrep -x WindowServer); RP=$(pgrep -x replayd)
cpu() { ps -o time= -p $1 | awk -F'[:.]' '{ if (NF==3) printf "%.2f\n", $1*60+$2+$3/100; else printf "%.2f\n", $1*3600+$2*60+$3+$4/100 }'; }
run() { n=$1; shift; w0=$(cpu $WS); r0=$(cpu $RP); echo "== $n"; "$@" 2>&1 | grep -E "asked|frames by|capture latency|encoded|hardware|Create.*→ [^0]|synth|STOPPED|FAILED|ffmpeg frames" | cut -c1-240
  echo "   WindowServer +$(echo "$(cpu $WS) - $w0" | bc) s · replayd +$(echo "$(cpu $RP) - $r0" | bc) s"; }
run baseline-5s sleep 5
run display-4k-bgra $T $S cap display 3 --secs 5 --fmt BGRA --cs srgb
run display-1080pt-420v $T $S cap display 3 --secs 5 --fmt 420v --cs srgb --size points
run display-4k-420v-h264cb $T $S cap display 3 --secs 5 --fmt 420v --cs srgb --enc h264 --profile cb --bps 20000000 --idr 60 --es real-4k.h264
run display-1440-420v-h264cb $T $S cap display 3 --secs 5 --fmt 420v --cs srgb --size 2560x1440 --enc h264 --profile cb --bps 12000000 --idr 60
run display-4k-420v-hevc $T $S cap display 3 --secs 5 --fmt 420v --cs srgb --enc hevc --bps 20000000
run window-calib-420v-h264cb $T $S cap window $C --secs 5 --fmt 420v --cs srgb --enc h264 --profile cb --bps 8000000 --idr 60
run display-4k-420v-pipe-ffmpeg sh -c "$T $S cap display 3 --secs 5 --fmt 420v --cs srgb --pipe | ffmpeg -hide_banner -nostats -loglevel error -f rawvideo -pix_fmt nv12 -s 3840x2160 -r 60 -i - -c:v h264_videotoolbox -realtime 1 -prio_speed 1 -profile:v constrained_baseline -b:v 20M -bf 0 -f h264 -y real-pipe.h264; echo ffmpeg frames \$(ffprobe -v error -count_frames -show_entries stream=nb_read_frames -of csv=p=0 real-pipe.h264) bytes \$(stat -f %z real-pipe.h264)"
echo "real-4k.h264: $(ffprobe -v error -count_frames -show_entries stream=nb_read_frames,profile,level,width,height -of csv=p=0 real-4k.h264) $(stat -f %z real-4k.h264) bytes"

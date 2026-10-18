#!/bin/sh
# leg 2: the calibration window (animated) + a TextEdit document the probe opened — visible / covered / minimized / on a
# non-current Space (a full-screen window of the probe's own takes the display's current Space) — what SCK hands for each
cd ~/vs-probe/p3m
T=$PWD/p3m-tcc; S=$PWD/sck-probe; X=$PWD/p3m-aux
rm -f calib.ctl cover.ctl
nohup ./p3m-aux calib 900 200 200 --anim > calib.log 2>&1 &
printf 'vs-p3m probe — a TextEdit document the probe opened\n' > probe-textedit.txt
open -a TextEdit probe-textedit.txt; sleep 2.5
TE=$(pgrep -nx TextEdit); C=$(awk '/^calib pid/ {print $5; exit}' calib.log); echo "TextEdit pid $TE · calib window $C"
$T $X axmove $TE probe-textedit 320 260 | grep AXPosition
cap() { n=$1; shift; echo "-- $n"; $T $S cap "$@" --secs 2 --cs srgb --fmt BGRA --dump $n --at 1 2>&1 | grep -E "^window|frames by|no window|FAILED|STOPPED" | cut -c1-230; }
both() { cap $1-calib window $C; cap $1-te title probe-textedit; }
echo "== s0 visible"; both s0
echo "== s1 covered"; nohup ./p3m-aux cover 120 150 150 1500 600 > cover.log 2>&1 & sleep 1.5; both s1; cap s1-display display 3; echo close > cover.ctl; sleep 1
echo "== s2 minimized"; echo mini > calib.ctl; $T $X axmini $TE probe-textedit 1 | grep AXMin; sleep 1.5; both s2; echo unmini > calib.ctl; $T $X axmini $TE probe-textedit 0 | grep AXMin; sleep 1.5
echo "== s3 other Space"; nohup ./p3m-aux cover 120 100 100 800 600 --full > cover.log 2>&1 & sleep 3.5; grep ctl cover.log; both s3; cap s3-display display 3; echo close > cover.ctl; sleep 2
echo "== s4 back"; both s4

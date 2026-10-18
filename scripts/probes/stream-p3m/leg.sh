#!/bin/sh
# leg.sh <name> <command…> — runs one probe leg detached; output in <name>.log, "LEG DONE <rc>" at the end
n=$1; shift
( "$@" ; echo "LEG DONE $?" ) > "$n.log" 2>&1 &

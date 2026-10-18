@echo off
rem pipe-node.cmd <hwnd> <f16|bgra> <fps> <seconds> <frameBytes> [min-ms] — leg 3: wgc-probe's frames on a pipe into the
rem device agent's own node (reader.js: the mapped road's read side, no mapping)
for /d %%D in ("%USERPROFILE%\.vibespace\device@*") do set NODE=%%D\node\node.exe
set MIN=
if not "%6"=="" set MIN=--min-ms %6
wgc-probe.exe pipe --hwnd %1 --fmt %2 --fps %3 --seconds %4 %MIN% | "%NODE%" reader.js %5

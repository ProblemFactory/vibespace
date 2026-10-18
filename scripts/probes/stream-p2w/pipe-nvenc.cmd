@echo off
rem pipe-nvenc.cmd <hwnd> <f16|bgra> <fps> <seconds> <WxH> [min-ms] — leg 3: wgc-probe's frames on a pipe into ffmpeg's
rem h264_nvenc (the encoder ladder's p1/ull/cbr) at the window's size; ffmpeg's -benchmark line says its CPU
set FF=%USERPROFILE%\vs-probe\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe
set PF=bgra
if "%2"=="f16" set PF=rgbaf16le
set MIN=
if not "%6"=="" set MIN=--min-ms %6
wgc-probe.exe pipe --hwnd %1 --fmt %2 --fps %3 --seconds %4 %MIN% | "%FF%" -hide_banner -nostats -benchmark -f rawvideo -pix_fmt %PF% -video_size %5 -framerate %3 -i pipe:0 -c:v h264_nvenc -preset p1 -tune ull -rc cbr -b:v 20M -bf 0 -f null -

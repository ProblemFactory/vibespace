@echo off
rem spawn-node.cmd <frameBytes> <writer args...> - the device agent's own node (the first %USERPROFILE%\.vibespace\device@* install) spawns the writer itself (reader.js --spawn)
for /d %%D in ("%USERPROFILE%\.vibespace\device@*") do set NODE=%%D\node\node.exe
"%NODE%" reader.js %*

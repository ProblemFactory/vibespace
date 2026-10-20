# mic-install-launch.ps1 - lane stream-mic-wheel-probe: detach mic-install.ps1 (hidden) past the 30 s run cap.
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $env:USERPROFILE 'vs-probe\mic\mic-install.ps1')

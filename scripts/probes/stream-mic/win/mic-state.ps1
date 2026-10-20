# mic-state.ps1 - VibeSpace lane stream-mic-wheel-probe (probe only; READ-ONLY).
# The machine's audio state a "virtual microphone" row has to know, before and after the owner installs a cable driver:
#   * is VB-CABLE present (PnP device, driver package in the store, its INF/version/signer), and does Windows owe a reboot;
#   * the microphone privacy switches (Settings > Privacy > Microphone: the machine-wide one, the user's, desktop apps');
#   * the driver-install trust facts (is VB-Audio's publisher certificate in TrustedPublisher - that decides whether the
#     "Would you like to install this device software?" dialog shows).
# Endpoints and the default devices per role come from vs-mic-probe.exe facts (WASAPI) - this script does the rest.
# Output: one JSON object on stdout. Pure ASCII (Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page).
$ErrorActionPreference = 'SilentlyContinue'
$out = [ordered]@{ ok = $true; at = (Get-Date).ToUniversalTime().ToString('o') }

# VB-CABLE as PnP sees it (MEDIA class) + its driver package
$dev = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -match 'VB-Audio|CABLE' } | ForEach-Object {
  [ordered]@{ name = "$($_.DeviceName)"; class = "$($_.DeviceClass)"; provider = "$($_.DriverProviderName)"; version = "$($_.DriverVersion)"; date = "$($_.DriverDate)"; signer = "$($_.Signer)"; inf = "$($_.InfName)"; id = "$($_.DeviceID)" }
})
$out.cableDevices = $dev
$pnp = @(Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match 'VB-Audio|CABLE' } | ForEach-Object { [ordered]@{ name = "$($_.FriendlyName)"; class = "$($_.Class)"; status = "$($_.Status)"; problem = "$($_.Problem)" } })
$out.cablePnp = $pnp
$svc = Get-Service -Name 'VBAudioVACMME', 'VBAudioVACWDM' 2>$null | ForEach-Object { [ordered]@{ name = $_.Name; status = "$($_.Status)" } }
$out.cableServices = @($svc)
$drv = @(Get-ChildItem 'C:\Windows\System32\drivers' -Filter 'vbaudio*' | ForEach-Object { [ordered]@{ file = $_.Name; bytes = $_.Length; time = $_.LastWriteTimeUtc.ToString('o') } })
$out.cableSys = $drv

# a reboot owed (Component Based Servicing / Windows Update / PendingFileRenameOperations)
$out.rebootPending = [ordered]@{
  cbs = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending');
  wu = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired');
  fileRenames = [bool](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations).PendingFileRenameOperations
}
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$out.lastBoot = $boot.ToUniversalTime().ToString('o')

# microphone privacy: HKLM (device-wide) + HKCU (this user) + NonPackaged (desktop apps); "Allow" / "Deny"
$cs = 'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
$out.micPrivacy = [ordered]@{
  machine = "$((Get-ItemProperty ('HKLM:\' + $cs) -Name Value).Value)";
  user = "$((Get-ItemProperty ('HKCU:\' + $cs) -Name Value).Value)";
  desktopApps = "$((Get-ItemProperty ('HKCU:\' + $cs + '\NonPackaged') -Name Value).Value)"
}

# the publisher trust that decides the driver-install dialog
$tp = @(Get-ChildItem Cert:\LocalMachine\TrustedPublisher | Where-Object { $_.Subject -match 'VB-Audio|Burel' } | ForEach-Object { [ordered]@{ subject = $_.Subject; thumb = $_.Thumbprint } })
$out.trustedPublisherVbAudio = $tp
$out | ConvertTo-Json -Depth 5 -Compress

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "C:\Program Files\Eclipse Adoptium\jdk-23.0.2.7-hotspot\bin\java.exe"
$psi.Arguments = "-Xmx2G -jar C:\onyxrbw-local\paper.jar nogui"
$psi.WorkingDirectory = "C:\onyxrbw-local\paper"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $false
$p = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 40
$p.StandardInput.WriteLine("lp user notelina permission set bw.admin true")
Start-Sleep -Seconds 2
$p.StandardInput.WriteLine("lp user notelina permission set bw.cmd true")
Start-Sleep -Seconds 2
$p.StandardInput.WriteLine("lp user notelina permission set bw.setup true")
Start-Sleep -Seconds 3
$p.StandardInput.WriteLine("say [Init] LuckPerms permissions set for notelina.")
$p.WaitForExit()

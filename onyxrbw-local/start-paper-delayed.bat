@echo off
cd /d C:\onyx-rbw-bot\onyxrbw-local\paper
powershell -NoLogo -Command "Start-Sleep 35; echo 'lp user notelina permission set bw.admin true'; Start-Sleep 2; echo 'lp user notelina permission set bw.cmd true'; Start-Sleep 2; echo 'lp user notelina permission set bw.setup true'" | "C:\Program Files\Eclipse Adoptium\jdk-23.0.2.7-hotspot\bin\java" -Xmx2G -jar C:\onyx-rbw-bot\onyxrbw-local\paper.jar nogui

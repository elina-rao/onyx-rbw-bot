@echo off
cd /d C:\onyx-rbw-bot\onyxrbw-local\paper
type C:\onyx-rbw-bot\onyxrbw-local\paper\init-commands.txt | "C:\Program Files\Eclipse Adoptium\jdk-23.0.2.7-hotspot\bin\java" -Xmx2G -jar C:\onyx-rbw-bot\onyxrbw-local\paper.jar nogui
pause

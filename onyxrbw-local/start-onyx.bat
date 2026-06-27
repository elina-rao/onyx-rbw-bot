@echo off
echo eula=true > C:\onyxrbw-local\paper\eula.txt
start "Paper" cmd /c "cd /d C:\onyxrbw-local\paper && \"C:\Program Files\Eclipse Adoptium\jdk-23.0.2.7-hotspot\bin\java\" -Xmx2G -jar ..\paper.jar nogui"
start "Velocity" cmd /c "cd /d C:\onyxrbw-local && \"C:\Program Files\Eclipse Adoptium\jdk-23.0.2.7-hotspot\bin\java\" -Xmx512M -jar velocity.jar"
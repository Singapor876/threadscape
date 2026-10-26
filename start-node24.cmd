@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
echo Using:
"C:\Program Files\nodejs\node.exe" -v
"C:\Program Files\nodejs\npm.cmd" run dev

@echo off
title TreeCode
setlocal
set "FORK=%~dp0"
set "CONFIG=C:\Users\X0261\.config\opencode-context-tree"
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=%CD%"
set "OPENCODE_CONFIG_DIR=%CONFIG%"
cd /d "%FORK%"
bun run dev --standalone "%TARGET%"
if errorlevel 1 pause
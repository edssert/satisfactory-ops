@echo off
chcp 65001 >nul
title Satisfactory Ops - Wwise 2023.1.14 Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0integrate-wwise.ps1"
if errorlevel 1 pause

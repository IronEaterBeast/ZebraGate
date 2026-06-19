@echo off

REM =================================================
REM Codex 任务完成提醒脚本
REM 用途：
REM 让 Codex 在完成任务后主动弹窗提醒用户
REM 使用方式：
REM 在 Codex 提示词里添加：
REM “任务完成后执行 .\notify.bat”
REM =================================================


powershell -ExecutionPolicy Bypass -File "%~dp0notify.ps1"
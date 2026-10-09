@echo off
title Encerrar Pinas Prospector
echo ==============================================================
echo   ENCERRANDO PINAS PROSPECTOR (SEGUNDO PLANO)
echo ==============================================================
echo.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do (
    echo Finalizando processo na porta 3333 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
echo.
echo [OK] Servidor encerrado com sucesso!
timeout /t 3

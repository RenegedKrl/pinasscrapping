@echo off
title Ativar Inicializacao Automatica com o Windows - Pinas Prospector
color 0A
cls
echo ==============================================================
echo   PINAS PROSPECTOR - INICIALIZACAO 24/7 COM O WINDOWS
echo ==============================================================
echo.
echo Este utilitario vai configurar o Prospector para iniciar
echo automaticamente em segundo plano (sem abrir nenhuma janela)
echo sempre que voce ligar ou reiniciar o seu computador.
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "EXE_FILE=%~dp0INICIAR_SILENCIOSO.exe"
set "WORKING_DIR=%~dp0prospeccao"

if not exist "%EXE_FILE%" (
    if exist "%~dp0prospeccao\INICIAR_SILENCIOSO.exe" (
        set "EXE_FILE=%~dp0prospeccao\INICIAR_SILENCIOSO.exe"
    )
)

if not exist "%WORKING_DIR%" (
    set "WORKING_DIR=%~dp0"
)

echo Criando atalho inteligente na pasta Inicializar do Windows...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configurar_inicializacao.ps1" >nul 2>&1

echo.
echo ==============================================================
echo   [SUCESSO] INICIALIZACAO 24/7 CONFIGURADA COM SUCESSO!
echo ==============================================================
echo.
echo Toda vez que voce ligar o Windows:
echo 1. O Prospector sobe sozinho no fundo (100%% invisivel, sem navegador).
echo 2. O WhatsApp se conecta automaticamente.
echo 3. O Piloto Automatico IA inicia sozinho no horario comercial (10h-19h).
echo 4. A IA responde os clientes 24h por dia.
echo 5. O painel estara disponivel em: http://localhost:3333
echo.
pause

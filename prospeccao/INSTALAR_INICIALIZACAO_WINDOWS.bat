@echo off
title Ativar Inicializacao Automatica com o Windows - Pinas Prospector
color 0A
cls
echo ==============================================================
echo   PINAS PROSPECTOR - INICIALIZACAO 24/7 COM O WINDOWS
echo ==============================================================
echo.
echo Este utilitario vai configurar o Prospector para iniciar
echo automaticamente em segundo plano sempre que você ligar ou
echo reiniciar o seu computador.
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_SCRIPT=%~dp0INICIAR_SILENCIOSO.vbs"

if not exist "%VBS_SCRIPT%" (
    echo [ERRO] Arquivo INICIAR_SILENCIOSO.vbs nao encontrado!
    pause
    exit /b 1
)

echo Criando atalho inteligente na pasta Inicializar do Windows...
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
echo sLinkFile = "%STARTUP_FOLDER%\PinasProspector.lnk" >> "%TEMP%\CreateShortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
echo oLink.TargetPath = "wscript.exe" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Arguments = """%VBS_SCRIPT%""" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.WorkingDirectory = "%~dp0" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Description = "Pinas Prospector 24/7 Autonomo" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"
cscript //nologo "%TEMP%\CreateShortcut.vbs"
del "%TEMP%\CreateShortcut.vbs" >nul 2>&1

echo.
echo ==============================================================
echo   [SUCESSO] INICIALIZACAO 24/7 CONFIGURADA COM SUCESSO!
echo ==============================================================
echo.
echo Toda vez que voce ligar o Windows:
echo 1. O servidor sobe sozinho no fundo (sem janela preta).
echo 2. O WhatsApp se conecta automaticamente.
echo 3. A IA do Gemini roda e responde os leads 24h por dia.
echo 4. O site estara sempre acessivel em: http://localhost:3333
echo.
pause

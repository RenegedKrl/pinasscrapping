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
echo sempre que você ligar ou reiniciar o seu computador.
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_SCRIPT=%~dp0prospeccao\INICIAR_SILENCIOSO.vbs"
set "WORKING_DIR=%~dp0prospeccao"

if not exist "%VBS_SCRIPT%" (
    set "VBS_SCRIPT=%~dp0INICIAR_SILENCIOSO.vbs"
    set "WORKING_DIR=%~dp0"
)

echo Criando atalho inteligente na pasta Inicializar do Windows...
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
echo sLinkFile = "%STARTUP_FOLDER%\PinasProspector.lnk" >> "%TEMP%\CreateShortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
echo oLink.TargetPath = "wscript.exe" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Arguments = """%VBS_SCRIPT%""" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.WorkingDirectory = "%WORKING_DIR%" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Description = "Pinas Prospector 24/7 Autonomo Silencioso" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"
cscript //nologo "%TEMP%\CreateShortcut.vbs"
del "%TEMP%\CreateShortcut.vbs" >nul 2>&1

echo.
echo ==============================================================
echo   [SUCESSO] INICIALIZACAO 24/7 CONFIGURADA COM SUCESSO!
echo ==============================================================
echo.
echo Toda vez que você ligar o Windows:
echo 1. O Prospector sobe sozinho no fundo (100%% invisivel, sem navegador).
echo 2. O WhatsApp se conecta automaticamente.
echo 3. O Piloto Automatico IA inicia sozinho no horario comercial (10h-19h).
echo 4. A IA responde os clientes 24h por dia.
echo 5. O painel estara disponivel em: http://localhost:3333
echo.
pause

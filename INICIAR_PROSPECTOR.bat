@echo off
chcp 65001 >nul
title Pinas Prospector - Sistema Operacional Comercial
color 0A
cls

echo ==============================================================
echo   PINAS PROSPECTOR - SISTEMA OPERACIONAL COMERCIAL
echo ==============================================================
echo   Responsavel : Kaue - Pinas Studio (@pinas.studio)
echo   WhatsApp    : (11) 94171-3647
echo   Plataforma  : Google Maps Scraper + CRM + WhatsApp Inbox
echo ==============================================================
echo.

:: 1. Localizar pasta do projeto
set "PROJECT_DIR="
if exist "%~dp0prospeccao\server.js" (
    set "PROJECT_DIR=%~dp0prospeccao"
) else if exist "%~dp0server.js" (
    set "PROJECT_DIR=%~dp0"
) else if exist "G:\Users\kauek\Desktop\claude\Pinas Scrapping\prospeccao\server.js" (
    set "PROJECT_DIR=G:\Users\kauek\Desktop\claude\Pinas Scrapping\prospeccao"
)

if "%PROJECT_DIR%"=="" (
    echo [ERRO] Nao foi possivel localizar a pasta do Prospector!
    echo Procurado em:
    echo  - %~dp0prospeccao
    echo  - %~dp0
    echo  - G:\Users\kauek\Desktop\claude\Pinas Scrapping\prospeccao
    echo.
    echo Pressione qualquer tecla para sair...
    pause >nul
    exit /b 1
)

cd /d "%PROJECT_DIR%"
echo [LOCAL] Pasta do sistema: %PROJECT_DIR%

:: 2. Localizar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
    ) else (
        echo [ERRO] Node.js nao foi encontrado no seu computador!
        echo Por favor, instale o Node.js baixando em: https://nodejs.org/
        echo.
        echo Pressione qualquer tecla para sair...
        pause >nul
        exit /b 1
    )
)

:: 3. Verificar dependencias
if not exist "node_modules\" (
    echo [CONFIGURACAO] Dependencias nao encontradas. Instalando agora...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias do Node.js.
        pause
        exit /b 1
    )
)

:: 4. Liberar porta 3333 se houver processo zumbi anterior (sem quebrar sintaxe do batch)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r /c:":3333 " ^| findstr LISTENING 2^>nul') do (
    echo [INFO] Liberando porta 3333 ocupada por processo anterior PID %%p...
    taskkill /F /T /PID %%p >nul 2>&1
)

:: 5. Abrir navegador automaticamente apos 2 segundos em segundo plano
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3333/?v=6.0"

echo [STATUS] Iniciando servidor do Pinas Prospector...
echo [ACESSO] Abrindo http://localhost:3333/?v=6.0 no seu navegador...
echo.
echo --------------------------------------------------------------
echo  * O sistema ja esta rodando!
echo  * Mantenha esta janela aberta enquanto utiliza o Prospector.
echo  * Para encerrar o sistema, basta fechar esta janela.
echo --------------------------------------------------------------
echo.

node server.js

echo.
echo ==============================================================
echo [AVISO] O servidor foi encerrado.
echo Pressione qualquer tecla para fechar esta janela...
echo ==============================================================
pause >nul

@echo off
title Pinas Prospector v8.1 - Sistema Comercial (@pinas.studio)
color 0A
cls
echo ==============================================================
echo   PINAS PROSPECTOR - SISTEMA OPERACIONAL COMERCIAL (v8.1)
echo ==============================================================
echo   Responsavel : Kaue - Pinas Studio (@pinas.studio)
echo   WhatsApp    : (11) 94171-3647
echo   Plataforma  : Scraper Google Maps + Funil 5 Etapas + WhatsApp
echo   Atualizacao : Audio continuo, Zoom de Fotos e Match Exato
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
    echo [ERRO] Nao foi possivel localizar a pasta do Prospector com server.js!
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
    if exist "G:\Programas\nodejs\node.exe" (
        set "PATH=G:\Programas\nodejs;%PATH%"
    ) else if exist "C:\Program Files\nodejs\node.exe" (
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

:: 3. Verificar dependencias do Node.js
if not exist "node_modules\" (
    echo [CONFIGURACAO] Dependencias nao encontradas. Instalando agora via npm...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias do Node.js.
        pause
        exit /b 1
    )
)

:: 4. Liberar porta 3333 se houver processo anterior ocupando
for /f "tokens=5" %%p in ('netstat -aon ^| findstr /r /c:":3333 " ^| findstr LISTENING 2^>nul') do (
    echo [INFO] Liberando porta 3333 ocupada pelo processo PID %%p...
    taskkill /F /T /PID %%p >nul 2>&1
)

echo [STATUS] Iniciando servidor do Pinas Prospector (v8.1)...
echo [INFO] Servidor rodando em: http://localhost:3333
echo [SEGUNDO PLANO] O piloto roda 100%% em segundo plano sem abrir o navegador.
echo [DICA] Se quiser abrir o painel visual a qualquer momento, acesse http://localhost:3333.
echo.
echo --------------------------------------------------------------
echo  * O sistema ja esta rodando com o novo funil de prospeccao!
echo  * Mantenha esta janela aberta se quiser acompanhar os logs no terminal.
echo  * Para rodar 100%% invisivel, utilize o INICIAR_SILENCIOSO.vbs.
echo --------------------------------------------------------------
echo.

if exist "supervisor.js" (
    node supervisor.js
) else (
    node server.js
)

echo.
echo ============================================================== 
echo [AVISO] O servidor foi encerrado.
echo Pressione qualquer tecla para fechar esta janela...
echo ============================================================== 
pause >nul

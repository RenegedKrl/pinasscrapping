@echo off
title Sincronizar Pinas Prospector com GitHub
color 0A
cd /d "G:\Users\kauek\Desktop\claude\Pinas Scrapping"
echo =======================================================
echo   PINAS PROSPECTOR - SINCRONIZANDO COM GITHUB
echo =======================================================
echo.
echo Enviando commits para https://github.com/RenegedKrl/pinasscrapping ...
echo (Se for o primeiro acesso, o navegador vai abrir para autorizar)
echo.
git push origin main
echo.
echo =======================================================
echo Concluido! Pressione qualquer tecla para fechar...
pause >nul

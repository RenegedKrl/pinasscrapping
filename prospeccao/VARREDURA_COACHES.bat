@echo off
chcp 65001 > nul
title Pinas Prospector - Varredura Automática de Coaches e Mentores
color 0C

echo ===================================================================
echo           PINAS PROSPECTOR - VARREDURA AUTOMÁTICA DE COACHES
echo ===================================================================
echo.
echo Executando mineração inteligente no Google Maps para:
echo  1. Coach Financeiro
echo  2. Mentor de Negócios
echo  3. Coach de Carreira
echo  4. Palestrante de Treinamentos
echo.
echo (Filtros anti-fitness/academia ativos com tolerância zero)
echo ===================================================================
echo.

node ./scripts/varrer_coaches_automatico.js

echo.
echo ===================================================================
echo Varredura concluída! Pressione qualquer tecla para fechar...
pause > nul

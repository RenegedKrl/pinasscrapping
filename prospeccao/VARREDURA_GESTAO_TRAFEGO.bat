@echo off
chcp 65001 > nul
title Pinas Prospector - Varredura de Gestão de Tráfego Recorrente
color 0A

echo ===================================================================
echo     PINAS PROSPECTOR - VARREDURA DE TRÁFEGO PAGO RECORRENTE
echo ===================================================================
echo.
echo Minerando ramos de alto ticket para contratos mensais de tráfego:
echo  1. Clínicas Odontológicas (Implantes e Avaliações Particulares)
echo  2. Escritórios de Advocacia (Ações e Honorários de Alto Valor)
echo  3. Clínicas Veterinárias (Emergências e Consultas 24h)
echo  4. Mentores de Negócios e Consultorias Empresariais
echo.
echo ===================================================================
echo.

node ./scripts/varrer_gestao_trafego.js

echo.
echo ===================================================================
echo Varredura concluída! Pressione qualquer tecla para fechar...
pause > nul

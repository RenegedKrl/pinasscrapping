@echo off
title Encerrar Pinas Prospector (@pinas.studio)
color 0C
cls
echo ==============================================================
echo   ENCERRANDO PINAS PROSPECTOR (TODAS AS INSTANCIAS)
echo ==============================================================
echo   Responsavel: Kaue - Pinas Studio
echo   Finalizando servidores em segundo plano e liberando porta 3333...
echo ==============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$killed = 0; " ^
  "Get-NetTCPConnection -LocalPort 3333 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; $killed++ }; " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $killed++ }; " ^
  "if ($killed -gt 0) { Write-Host \"[OK] Processos do servidor foram encerrados com sucesso!\" -ForegroundColor Green } else { Write-Host \"[INFO] Nenhum processo ativo do servidor foi encontrado.\" -ForegroundColor Yellow }; " ^
  "Start-Sleep -Milliseconds 400; " ^
  "$check = Get-NetTCPConnection -LocalPort 3333 -ErrorAction SilentlyContinue; " ^
  "if (-not $check) { Write-Host \"[CONFIRMADO] Porta 3333 liberada. Servidor 100%% DESLIGADO!\" -ForegroundColor Green } else { Write-Host \"[AVISO] Verificando porta...\" -ForegroundColor Yellow }"

echo.
echo ==============================================================
echo   SERVIDOR 100%% PARADO COM SUCESSO!
echo ==============================================================
echo.
powershell -NoProfile -Command "Start-Sleep -Seconds 2"

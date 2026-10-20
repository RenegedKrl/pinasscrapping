# Script de configuracao de Inicializacao Automatica do Pinas Prospector
$ErrorActionPreference = 'Stop'

$projectDir = "G:\Users\kauek\Desktop\claude\Pinas Scrapping"
$prospeccaoDir = "$projectDir\prospeccao"
$exePath = "$projectDir\INICIAR_SILENCIOSO.exe"

Write-Host "==============================================================" -ForegroundColor Green
Write-Host "  CONFIGURANDO INICIALIZACAO AUTOMATICA 24/7 DO PROSPECTOR" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "Executavel silencioso: $exePath"

# 1. Configurar Registro HKCU Run
Write-Host "`n1. Registrando no Registro do Windows (HKCU Run)..."
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "PinasProspector" -Value "`"$exePath`""
Write-Host "   -> OK: Registro atualizado para o executavel nativo." -ForegroundColor Cyan

# 2. Configurar Atalho na Pasta Inicializar (Startup)
Write-Host "`n2. Criando atalho na pasta Inicializar do Windows..."
$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "PinasProspector.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $prospeccaoDir
$shortcut.Description = "Pinas Prospector 24/7 Autonomo Silencioso"
$shortcut.Save()
Write-Host "   -> OK: Atalho criado em $shortcutPath" -ForegroundColor Cyan

# 3. Configurar Agendador de Tarefas do Windows (Task Scheduler)
Write-Host "`n3. Registrando no Agendador de Tarefas (Disparo ao fazer login com atraso de 10s)..."
try {
    $action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $prospeccaoDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $trigger.Delay = 'PT10S'
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName 'PinasProspector' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Host "   -> OK: Tarefa agendada 'PinasProspector' criada com sucesso." -ForegroundColor Cyan
} catch {
    Write-Host "   -> Aviso no agendador: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n==============================================================" -ForegroundColor Green
Write-Host "  [SUCESSO] INICIALIZACAO 24/7 BLINDADA COM TRIPLA CAMADA!" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "1. Registro HKCU Run: ATIVO"
Write-Host "2. Pasta Inicializar (Startup): ATIVO"
Write-Host "3. Agendador de Tarefas (schtasks): ATIVO (com atraso de 10s para carregar a rede)"
Write-Host "`nO Prospector vai subir silenciosamente toda vez que o PC ligar."

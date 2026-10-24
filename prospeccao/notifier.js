const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Módulo de Notificações Nativas do Windows para o Pinas Prospector
 * Dispara alertas com som e banner no canto da tela do Windows do Kauê
 */

let lastAlertTime = 0;
const MIN_ALERT_INTERVAL_MS = 15000; // Evita spam de notificações idênticas em menos de 15s

function showWindowsNotification({ title, message, url = null, sound = true }) {
  const now = Date.now();
  const safeTitle = (title || 'Pinas Prospector').replace(/["'`$\\]/g, ' ');
  const safeMessage = (message || '').replace(/["'`$\\]/g, ' ');

  // Script PowerShell para exibir Toast Notification nativo do Windows 10/11
  const psScript = `
$appId = 'Pinas.Prospector'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>${safeTitle}</text>
            <text>${safeMessage}</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@

try {
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
    # Fallback caso o Toast Runtime não esteja acessível
    Add-Type -AssemblyName System.Windows.Forms
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Information
    $notify.BalloonTipTitle = '${safeTitle}'
    $notify.BalloonTipText = '${safeMessage}'
    $notify.Visible = $true
    $notify.ShowBalloonTip(5000)
    Start-Sleep -Seconds 1
    $notify.Dispose()
}
`;

  // Executar PowerShell em background sem abrir janela preta
  const child = exec('powershell -NoProfile -ExecutionPolicy Bypass -Command -', {
    windowsHide: true,
    timeout: 8000
  }, (err) => {
    if (err) {
      console.warn('[Notifier] Aviso ao disparar notificação Windows:', err.message);
    }
  });

  if (child.stdin) {
    child.stdin.write(psScript);
    child.stdin.end();
  }

  // Se for fornecida uma URL (ex: tela de reconexão do QR code), pode abrir no navegador se urgente
  if (url) {
    try {
      exec(`start "" "${url}"`, { windowsHide: true });
    } catch (e) {}
  }
}

// Notificar que o WhatsApp desconectou
function notifyWhatsAppDisconnected(reason = 'Sessão encerrada') {
  const now = Date.now();
  if (now - lastAlertTime < MIN_ALERT_INTERVAL_MS) return;
  lastAlertTime = now;

  console.log('[Notifier] 🚨 Emitindo notificação Windows: WhatsApp Desconectado!');
  showWindowsNotification({
    title: '⚠️ WhatsApp Desconectado (Pinas Prospector)',
    message: 'Seu WhatsApp foi desconectado. Abra o Prospector para reconectar o QR Code e não perder mensagens.',
    url: 'http://localhost:3333' // Abre direto o Prospector na tela do Kauê
  });
}

// Notificar que um lead respondeu
function notifyLeadReplied(leadName, text) {
  const preview = text ? (text.length > 90 ? text.slice(0, 90) + '...' : text) : 'Nova mensagem recebida';
  console.log(`[Notifier] 💬 Emitindo notificação Windows: Resposta de ${leadName}!`);
  showWindowsNotification({
    title: `💬 Lead Respondeu: ${leadName}`,
    message: preview,
    url: 'http://localhost:3333#tab-inbox'
  });
}

// Notificar erro grave ou queda do servidor
function notifySystemError(errorMsg) {
  showWindowsNotification({
    title: '🛑 Alerta Pinas Prospector',
    message: errorMsg || 'Ocorreu uma instabilidade no servidor.'
  });
}

module.exports = {
  showWindowsNotification,
  notifyWhatsAppDisconnected,
  notifyLeadReplied,
  notifySystemError
};

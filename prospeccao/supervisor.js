// ==============================================================================
// PINAS PROSPECTOR - SUPERVISOR & AUTO-HEALER RESILIENTE 24/7
// Mantém o servidor Node.js (server.js) eternamente vivo em segundo plano.
// Se cair por oscilação de rede, timeout de socket ou erro, reinicia em 2s.
// ==============================================================================

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJ_DIR = __dirname;
const SHUTDOWN_FLAG = path.join(PROJ_DIR, 'data', '.shutdown');
const LOG_FILE = path.join(PROJ_DIR, 'server_background.log');

// Remover flag antiga de shutdown no início
try {
  if (fs.existsSync(SHUTDOWN_FLAG)) fs.unlinkSync(SHUTDOWN_FLAG);
} catch (e) {}

let child = null;
let isStopping = false;

function logSupervisor(msg) {
  const line = `[${new Date().toISOString()}] [Supervisor] ${msg}\n`;
  try {
    process.stdout.write(line);
  } catch (e) {}
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {}
}

function freePort3333() {
  try {
    const output = execSync('netstat -ano | findstr :3333 | findstr LISTENING', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = output.trim().split('\n');
    for (const l of lines) {
      const parts = l.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid) && parseInt(pid) > 0 && (!child || parseInt(pid) !== child.pid)) {
        logSupervisor(`Liberando porta 3333 travada pelo processo zumbi PID ${pid}...`);
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (kErr) {}
      }
    }
  } catch (e) {}
}

function startChild() {
  if (isStopping) return;

  // Garantir que a porta 3333 está livre antes de subir
  freePort3333();

  logSupervisor('🚀 Iniciando processo principal do Prospector (server.js)...');

  const nodeExe = process.execPath;

  // stdio: ['ignore', 'inherit', 'inherit'] permite que a saída de server.js
  // flua diretamente pelo stdout/stderr do processo supervisor:
  // - No modo silencioso (CMD redirecionado >> server_background.log), tudo grava no log sem conflito de arquivo travado (EBUSY).
  // - No modo terminal interativo (INICIAR_PROSPECTOR.bat), tudo aparece no console em tempo real.
  child = spawn(nodeExe, [path.join(PROJ_DIR, 'server.js')], {
    cwd: PROJ_DIR,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: false
  });

  logSupervisor(`Servidor rodando sob supervisão com PID: ${child.pid}`);

  child.on('exit', (code, signal) => {
    // Verificar se o operador pediu desligamento intencional
    if (fs.existsSync(SHUTDOWN_FLAG) || isStopping) {
      logSupervisor('⏹️ Desligamento intencional detectado. Encerrando supervisor.');
      try { if (fs.existsSync(SHUTDOWN_FLAG)) fs.unlinkSync(SHUTDOWN_FLAG); } catch (e) {}
      process.exit(0);
      return;
    }

    logSupervisor(`⚠️ ATENÇÃO: server.js encerrou inesperadamente (código: ${code}, sinal: ${signal}).`);
    logSupervisor('🔄 RESSUSCITANDO O SERVIDOR EM 2 SEGUNDOS AUTOMATICAMENTE (Auto-Healer 24/7)...');

    setTimeout(() => {
      startChild();
    }, 2000);
  });

  child.on('error', (err) => {
    logSupervisor(`Erro no processo filho: ${err.message}`);
  });
}

// Lidar com sinais de parada
function stopAll() {
  isStopping = true;
  logSupervisor('Recebido sinal de encerramento. Finalizando servidor...');
  if (child) {
    try { child.kill('SIGTERM'); } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

// Iniciar primeiro ciclo
startChild();

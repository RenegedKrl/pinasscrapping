/**
 * Módulo de Proteção e Monitoramento do Google Gemini Free Tier (@pinas.studio)
 * 
 * Regra Inegociável: 100% Gratuito (Zero Custo, Zero Cobrança).
 * 
 * Limites Oficiais do Free Tier do Google Gemini Flash:
 * - 15 RPM (Requests Por Minuto)
 * - 1.500 RPD (Requests Por Dia)
 * - Custo: R$ 0,00
 * 
 * Medidas de Blindagem Implementadas:
 * 1. Teto de Segurança Diário: Alerta e pausa em 1.200 requisições/dia (margem de segurança de 300 reqs).
 * 2. Throttling por Minuto: Limite interno de 10 RPM (espaçamento automático para nunca atingir 15).
 * 3. Persistência de Consumo: Salva em data/gemini_usage.json com reset automático diário.
 */

const fs = require('fs');
const path = require('path');

const USAGE_FILE = path.join(__dirname, 'data', 'gemini_usage.json');
const MAX_FREE_RPD = 1500;
const SAFE_ALERT_RPD = 1200;
const MAX_SAFE_RPM = 10; // Margem de segurança abaixo de 15 RPM

// Janela em memória para cálculo de RPM
const recentRequestsTimestamps = [];

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function loadUsage() {
  const today = getTodayString();
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      if (data.date === today) {
        return data;
      }
    }
  } catch (err) {}

  // Novo dia: resetar contador
  const initial = {
    date: today,
    requestsToday: 0,
    totalTokensEstimated: 0,
    lastRequestAt: null,
    freeTierGuaranteed: true
  };
  saveUsage(initial);
  return initial;
}

function saveUsage(data) {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[GeminiGuard] Falha ao salvar gemini_usage.json:', err.message);
  }
}

/**
 * Retorna o status de uso em tempo real do Gemini Free Tier
 */
function getFreeTierStatus() {
  const usage = loadUsage();
  cleanOldTimestamps();

  const requestsThisMinute = recentRequestsTimestamps.length;
  const remainingToday = Math.max(0, MAX_FREE_RPD - usage.requestsToday);
  const percentUsed = Math.min(100, Math.round((usage.requestsToday / MAX_FREE_RPD) * 100));

  return {
    date: usage.date,
    requestsToday: usage.requestsToday,
    limitDaily: MAX_FREE_RPD,
    safeLimitDaily: SAFE_ALERT_RPD,
    remainingToday,
    percentUsed,
    requestsThisMinute,
    limitMinute: 15,
    safeLimitMinute: MAX_SAFE_RPM,
    cost: 'R$ 0,00 (100% Gratuito)',
    isFreeTierGuaranteed: true,
    canProceed: usage.requestsToday < SAFE_ALERT_RPD
  };
}

function cleanOldTimestamps() {
  const oneMinuteAgo = Date.now() - 60000;
  while (recentRequestsTimestamps.length > 0 && recentRequestsTimestamps[0] < oneMinuteAgo) {
    recentRequestsTimestamps.shift();
  }
}

/**
 * Valida e registra uma requisição antes de chamar o Gemini.
 * Se o limite por minuto estiver próximo de 10 RPM, aguarda automaticamente.
 * Se atingir o limite diário de segurança, bloqueia para preservar a gratuidade.
 */
async function acquireFreeTierSlot() {
  const usage = loadUsage();

  if (usage.requestsToday >= SAFE_ALERT_RPD) {
    throw new Error(
      `[GeminiGuard] Limite de segurança do Free Tier atingido hoje (${usage.requestsToday}/${MAX_FREE_RPD} reqs). ` +
      'Pausado preventivamente para manter 100% GRATUITO. O contador reinicia amanhã.'
    );
  }

  cleanOldTimestamps();

  // Throttling se houver mais de 10 requisições no mesmo minuto
  if (recentRequestsTimestamps.length >= MAX_SAFE_RPM) {
    const oldest = recentRequestsTimestamps[0];
    const waitMs = Math.max(1000, 60500 - (Date.now() - oldest));
    console.log(`[GeminiGuard] ⏳ Taxa de ${recentRequestsTimestamps.length} reqs/min atingida. Aguardando ${(waitMs/1000).toFixed(1)}s para manter Free Tier seguro...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    cleanOldTimestamps();
  }

  // Registrar requisição
  const now = Date.now();
  recentRequestsTimestamps.push(now);
  usage.requestsToday += 1;
  usage.lastRequestAt = new Date().toISOString();
  saveUsage(usage);

  return {
    requestId: now,
    requestsToday: usage.requestsToday,
    remainingToday: MAX_FREE_RPD - usage.requestsToday
  };
}

module.exports = {
  getFreeTierStatus,
  acquireFreeTierSlot,
  MAX_FREE_RPD,
  SAFE_ALERT_RPD,
  MAX_SAFE_RPM
};

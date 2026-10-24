/**
 * Motor de Piloto Automático 100% Autônomo (@pinas.studio)
 * 
 * Executa o ciclo comercial de ponta a ponta sem intervenção manual:
 * 1. Seleciona o próximo lead elegível da esteira
 * 2. Faz a auditoria técnica real do Site e Google Maps
 * 3. Alimenta o Gemini AI (Free Tier blindado) para gerar a abordagem sob medida
 * 4. Dispara direto pelo WhatsApp respeitando limites diários e intervalos anti-bloqueio
 * 5. Quando o lead responde, a IA continua conversando até marcar a call
 */

const fs = require('fs');
const path = require('path');
const auditor = require('./auditor');
const gemini = require('./gemini');
const geminiGuard = require('./gemini_guard');
const conversationGuard = require('./conversation_guard');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const configManager = require('./config_manager');
const {
  readConfig,
  saveConfig,
  checkAndResetDailyLimit,
  isExcludedLead
} = configManager;

// Funções seguras de leitura e escrita de JSON
function readJson(file, defaultVal = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[Autopilot] Erro ao ler ${file}:`, err.message);
    return defaultVal;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[Autopilot] Erro ao salvar ${file}:`, err.message);
    return false;
  }
}

// Trava in-memory para impedir processamento simultâneo do mesmo lead
const inFlightLeadIds = new Set();

function isBlacklisted(lead) {
  if (!lead) return true;
  return isExcludedLead(lead).excluded;
}

// Nomes dos dias da semana em português
const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const DAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Obter horário e dia atual de Brasília (SP) de forma precisa e independente de timezone do host
function getBrazilTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);

  const dayShort = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short'
  }).format(now);
  const dayOfWeekMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const dayOfWeek = dayOfWeekMap[dayShort] !== undefined ? dayOfWeekMap[dayShort] : now.getDay();

  return { hour, minute, second, dayOfWeek, now };
}

// Janela comercial e cronograma de dias permitidos para NOVOS LEADS (Prospecção Fria Outbound)
// Solicitado pelo Kauê:
// - Disparos para novos clientes: Segunda e Quarta (10h às 19h) e Sexta-feira (10h às 16h)
// - Sexta-feira: até as 16h (4 da tarde), pois após as 16h as pessoas raramente veem mensagens
// - Terça, Quinta, Sábado e Domingo pausados para novos leads frios
// - Respostas de leads recebidas: Atendimento contínuo da IA 24/7 sem qualquer restrição de dia ou horário!
function checkCommercialHours(config = {}) {
  const { hour, minute, second, dayOfWeek } = getBrazilTime();
  const startHour = config.outboundStartHour !== undefined ? config.outboundStartHour : 10;
  
  // Sexta-feira (dia 5): Encerra às 16h (4 da tarde) conforme pedido do Kauê
  const isFriday = dayOfWeek === 5;
  const endHour = isFriday
    ? (config.outboundEndHourFriday !== undefined ? config.outboundEndHourFriday : 16)
    : (config.outboundEndHour !== undefined ? config.outboundEndHour : 19);

  const scheduledDefault = (typeof configManager.getScheduledOutboundDays === 'function')
    ? configManager.getScheduledOutboundDays()
    : [1, 3, 5];
  const outboundDays = Array.isArray(config.outboundDays) && config.outboundDays.length > 0
    ? config.outboundDays
    : scheduledDefault;

  const dayName = DAY_NAMES[dayOfWeek];
  const isAllowedDay = outboundDays.includes(dayOfWeek);
  const isAllowedHour = hour >= startHour && hour < endHour;
  const isAllowed = isAllowedDay && isAllowedHour;

  let msUntilNextStart = 0;
  let nextAllowedDay = dayOfWeek;
  let reason = '';

  if (!isAllowed) {
    let secondsAhead = 0;
    // Se hoje é dia permitido mas ainda é antes do horário comercial (ex: 8h da manhã antes das 10h)
    if (isAllowedDay && hour < startHour) {
      secondsAhead = (startHour - hour) * 3600 - (minute * 60 + second);
      nextAllowedDay = dayOfWeek;
      reason = `Antes do horário comercial (Inicia às ${startHour}h).`;
    } else {
      // Procurar próximo dia ativo permitido (a partir de amanhã até daqui a 7 dias)
      let foundOffset = 1;
      for (let offset = 1; offset <= 7; offset++) {
        const candidateDay = (dayOfWeek + offset) % 7;
        if (outboundDays.includes(candidateDay)) {
          foundOffset = offset;
          nextAllowedDay = candidateDay;
          break;
        }
      }

      const secondsLeftToday = (24 - hour) * 3600 - (minute * 60 + second);
      const secondsIntermediateDays = (foundOffset - 1) * 86400;
      const secondsNextDay = startHour * 3600;
      secondsAhead = secondsLeftToday + secondsIntermediateDays + secondsNextDay;

      if (!isAllowedDay) {
        reason = `Hoje (${dayName}) não é dia de envio para novos leads.`;
      } else {
        reason = `Após o término do horário comercial (${endHour}h).`;
      }
    }

    msUntilNextStart = Math.max(60000, secondsAhead * 1000);
  }

  const nextDayName = DAY_NAMES[nextAllowedDay];
  const allowedDaysText = 'Seg a Sex';

  return {
    isAllowed,
    isAllowedDay,
    isAllowedHour,
    currentHour: hour,
    currentMinute: minute,
    dayOfWeek,
    dayName,
    startHour,
    endHour,
    outboundDays,
    nextAllowedDay,
    nextDayName,
    msUntilNextStart,
    reason,
    allowedDaysText
  };
}

class AutoPilotEngine {
  constructor() {
    this.isActive = false;
    this.isProcessing = false;
    this.currentLead = null;
    this.nextRunTimestamp = null;
    this.lastAudit = null;
    this.lastPitch = null;
    this.timer = null;
    this.whatsapp = null;
    this.logs = [];
    this.stats = {
      dispatchedToday: 0,
      auditedToday: 0,
      repliesHandledToday: 0
    };
  }

  setWhatsAppInstance(waInstance) {
    this.whatsapp = waInstance;
  }

  setPendingRepliesChecker(fn) {
    this.checkPendingRepliesHandler = fn;
    if (!this.repliesInterval) {
      this.repliesInterval = setInterval(async () => {
        if (this.whatsapp && typeof this.whatsapp.getStatus === 'function' && this.whatsapp.getStatus().connected) {
          try {
            await this.checkPendingRepliesHandler();
          } catch (e) {}
        }
      }, 45000); // Garante que nenhum lead com resposta pendente aguarde mais que 45s
    }
  }

  handleWhatsAppConnected() {
    const config = readConfig();
    if (config.autoStartAutopilot !== false && !this.isActive) {
      this.addLog('info', '⚡ Auto-Start 24/7 Ativo: WhatsApp conectado! Ligando motor autônomo em segundo plano...');
      this.start();
    }
  }

  addLog(type, message, details = null) {
    const logItem = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type, // 'info' | 'audit' | 'ai' | 'send' | 'warn' | 'success' | 'error'
      message,
      details
    };

    this.logs.unshift(logItem);
    if (this.logs.length > 60) this.logs.pop(); // Manter últimos 60 logs
    console.log(`[Piloto Automático] [${type.toUpperCase()}] ${message}`);
  }

  getStatus() {
    const freeTier = geminiGuard.getFreeTierStatus();
    let config = checkAndResetDailyLimit(readConfig());
    const sentToday = config.sentToday || 0;
    const dailyLimit = config.dailyLimit || 10;
    const isSleepingNight = this.isActive && (sentToday >= dailyLimit);
    const commercial = checkCommercialHours(config);

    return {
      isActive: this.isActive,
      autoStartAutopilot: config.autoStartAutopilot !== false,
      isSleepingNight,
      isWithinCommercialHours: commercial.isAllowed,
      commercialWindow: {
        start: commercial.startHour,
        end: commercial.endHour,
        currentHour: commercial.currentHour,
        currentMinute: commercial.currentMinute,
        dayOfWeek: commercial.dayOfWeek,
        dayName: commercial.dayName,
        isAllowedDay: commercial.isAllowedDay,
        isAllowedHour: commercial.isAllowedHour,
        outboundDays: commercial.outboundDays,
        nextAllowedDay: commercial.nextAllowedDay,
        nextDayName: commercial.nextDayName,
        allowedDaysText: commercial.allowedDaysText,
        reason: commercial.reason,
        msUntilNextStart: commercial.msUntilNextStart
      },
      isProcessing: this.isProcessing,
      currentLead: this.currentLead,
      lastAudit: this.lastAudit,
      lastPitch: this.lastPitch,
      nextRunTimestamp: this.nextRunTimestamp,
      nextRunSeconds: this.nextRunTimestamp ? Math.max(0, Math.round((this.nextRunTimestamp - Date.now()) / 1000)) : null,
      dispatchedToday: sentToday,
      dailyLimit: dailyLimit,
      onlyRespondReplies: !!(config.onlyRespondReplies || config.disableNewLeadOutbound),
      freeTier,
      logs: this.logs.slice(0, 35)
    };
  }

  start() {
    if (this.isActive) return { success: true, message: 'Piloto automático já está em execução.' };
    this.isActive = true;
    this.addLog('info', '🚀 Piloto Automático 100% Autônomo INICIADO em 2º plano.');

    // Executar primeiro passo após 3 segundos
    this.scheduleNext(3000);
    return { success: true, message: 'Piloto automático ativado com sucesso.' };
  }

  stop() {
    this.isActive = false;
    this.isProcessing = false;
    this.currentLead = null;
    this.nextRunTimestamp = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.addLog('warn', '⏸️ Piloto Automático PAUSADO pelo operador.');
    return { success: true, message: 'Piloto automático pausado.' };
  }

  scheduleNext(delayMs) {
    if (!this.isActive) return;
    if (this.timer) clearTimeout(this.timer);

    this.nextRunTimestamp = Date.now() + delayMs;
    this.timer = setTimeout(() => {
      this.step();
    }, delayMs);
  }

  async step() {
    if (!this.isActive || this.isProcessing) return;

    this.isProcessing = true;
    this.currentLead = null;
    let timeoutId = null;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('TIMEOUT: Ciclo atingiu o tempo limite seguro de 75s.'));
      }, 75000);
    });

    try {
      await Promise.race([
        this._runCycle(),
        timeoutPromise
      ]);
    } catch (err) {
      this.addLog('error', `❌ Erro no ciclo do piloto automático: ${err.message}`);
      if (this.currentProcessingLeadId) {
        try {
          const leads = readJson(LEADS_FILE, []);
          const idx = leads.findIndex(l => l.id === this.currentProcessingLeadId);
          if (idx !== -1) {
            leads[idx].autopilotAttempts = (leads[idx].autopilotAttempts || 0) + 1;
            if (leads[idx].autopilotAttempts >= 2) {
              leads[idx].autopilotSkipUntil = Date.now() + 1800000; // adia 30 min
            }
            writeJson(LEADS_FILE, leads);
          }
        } catch (e) {}
      }
      this.scheduleNext(25000);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (this.currentProcessingLeadId) {
        inFlightLeadIds.delete(this.currentProcessingLeadId);
        this.currentProcessingLeadId = null;
      }
      this.isProcessing = false;
      this.currentLead = null;
    }
  }

  async _runCycle() {
    // 1. Validar WhatsApp Conectado
    const isWaConnected = this.whatsapp && (typeof this.whatsapp.isReady === 'function' ? this.whatsapp.isReady() : (this.whatsapp.getStatus && this.whatsapp.getStatus().connected));
    if (!isWaConnected) {
      this.addLog('warn', '⚠️ WhatsApp desconectado. Aguardando conexão para disparar...');
      try {
        const notifier = require('./notifier');
        notifier.notifyWhatsAppDisconnected('Piloto Automático pausado: aguardando QR Code');
      } catch (e) {}
      this.scheduleNext(20000);
      return;
    }

    // 1.1 Validar Cota Gratuita do Gemini
    const freeTier = geminiGuard.getFreeTierStatus();
    if (!freeTier.canProceed) {
      this.addLog('warn', `⚠️ Limite de segurança do Gemini Free Tier atingido (${freeTier.requestsToday}/${freeTier.limitDaily}). Pausado para manter 100% gratuito.`);
      this.scheduleNext(300000);
      return;
    }

    // 1.2 PRIORIDADE MÁXIMA 24/7: Atender Leads Quentes com Respostas Pendentes
    // Se algum lead respondeu, o sistema DEVE responder esse lead com a IA IMEDIATAMENTE!
    if (typeof this.checkPendingRepliesHandler === 'function') {
      const handledWarm = await this.checkPendingRepliesHandler();
      if (handledWarm) {
        this.stats.repliesHandledToday = (this.stats.repliesHandledToday || 0) + 1;
        // Cadência humanizada: ~5 minutos entre respostas de múltiplos leads pendentes
        const delayMs = Math.floor(Math.random() * (320000 - 280000 + 1)) + 280000;
        const mins = (delayMs / 60000).toFixed(1);
        this.addLog('success', `🔥 Resposta de lead enviada pela IA! Aguardando cadência humanizada de ~${mins} minutos antes do próximo lead pendente...`);
        this.scheduleNext(delayMs);
        return;
      }
    }

    let config = readConfig();

    // 1.3 MODO "APENAS RESPOSTAS" (Solicitado pelo Kauê):
    // NUNCA avança para caçar ou disparar para novos contatos frios. Fica 100% focado em atender respostas!
    if (config.onlyRespondReplies || config.disableNewLeadOutbound) {
      this.addLog('info', '🛑 Modo "Apenas Respostas" ATIVO: Disparo para novos contatos pausado. Monitorando e respondendo leads 24/7.');
      this.scheduleNext(25000);
      return;
    }

    // 2. Validar Limite Diário do WhatsApp com Reset Noturno Automático
    config = checkAndResetDailyLimit(config);
    const sentToday = config.sentToday || 0;
    const dailyLimit = config.dailyLimit || 10;

    if (sentToday >= dailyLimit) {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0);
      const msUntilTomorrow = Math.max(60000, tomorrow.getTime() - now.getTime());
      const minutesLeft = Math.round(msUntilTomorrow / 60000);
      this.addLog('info', `🌙 Meta diária concluída (${sentToday}/${dailyLimit}). Modo Standby até 00:01 (${minutesLeft} min). Atendimento IA respondendo leads 24/7.`);
      this.scheduleNext(Math.min(msUntilTomorrow, 300000));
      return;
    }

    // 3. Validar Cronograma de Dias e Janela Comercial para NOVOS LEADS (Seg a Sex - 10h às 19h)
    const commercial = checkCommercialHours(config);
    if (!commercial.isAllowed) {
      const minLeft = Math.round(commercial.msUntilNextStart / 60000);
      const hoursLeft = (minLeft / 60).toFixed(1);
      const curTimeStr = `${String(commercial.currentHour).padStart(2, '0')}:${String(commercial.currentMinute).padStart(2, '0')}`;
      if (!commercial.isAllowedDay) {
        this.addLog('info', `🗓️ Standby: Hoje (${commercial.dayName}) não há disparos para novos leads. Dias ativos: ${commercial.allowedDaysText} (10h às 19h). Próximo disparo: ${commercial.nextDayName} às ${commercial.startHour}h (~${hoursLeft}h). Atendimento IA a respostas continua ativo 24/7!`);
      } else {
        this.addLog('info', `🌙 Fora da janela de novos leads (${commercial.startHour}h às ${commercial.endHour}h). Hora em SP: ${curTimeStr}. Standby até às ${commercial.startHour}h (~${hoursLeft}h). Atendimento IA a respostas continua ativo 24/7!`);
      }
      this.scheduleNext(Math.min(commercial.msUntilNextStart, 300000));
      return;
    }

    // 5. Selecionar Próximo Lead Elegível na Base (Priorizando Sites Ruins / Sem Site)
    const leads = readJson(LEADS_FILE, []);
    const eligibleLeads = leads.filter(l => {
      if (l.status !== 'novo') return false;
      if (inFlightLeadIds.has(l.id)) return false;
      if (!l.cleanPhone || l.cleanPhone.length < 10) return false;
      if (isBlacklisted(l)) return false;
      if (l.autopilotSkipUntil && Date.now() < l.autopilotSkipUntil) return false;

      // REGRA DE OURO ANTI-SPAM DA PINAS:
      // Se o lead já possui histórico de mensagens ou aguarda resposta, NUNCA enviar outra mensagem!
      const safetyCheck = conversationGuard.canSendMessageToLead(l, this.whatsapp?.store);
      if (!safetyCheck.allowed) {
        return false;
      }

      return true;
    });

    // Ordenação Rigorosa de Aceite Solicitada pelo Kauê:
    // O lead no topo (índice 0) é SEMPRE o de maior chance de fechamento (comércio local real, sem site ou site fora do ar, forte reputação no Maps, tel celular direto)
    eligibleLeads.sort((a, b) => (b.conversionScore || b.priorityScore || 0) - (a.conversionScore || a.priorityScore || 0));
    let lead = eligibleLeads.length > 0 ? eligibleLeads[0] : null;

    // Se a base de novos leads zerou, caçar ativamente novos sites ruins na web!
    if (!lead) {
      this.addLog('info', '🎯 Fila de leads zerada. Caçando autonomamente novos negócios com sites ruins na web de SP...');
      try {
        const scraper = require('./scraper');
        const hunted = await scraper.huntBadWebsites({ maxResults: 6 });
        if (hunted && hunted.length > 0) {
          const eligibleHunted = hunted.filter(h => {
            const hCheck = conversationGuard.canSendMessageToLead(h, this.whatsapp?.store);
            return hCheck.allowed && !isBlacklisted(h) && !inFlightLeadIds.has(h.id) && (!h.autopilotSkipUntil || Date.now() >= h.autopilotSkipUntil);
          });

          if (eligibleHunted.length > 0) {
            this.addLog('success', `🎯 Encontradas ${eligibleHunted.length} novas empresas com sites ruins/sem site! Continuando prospecção...`);
            lead = eligibleHunted[0];
          }
        }
      } catch (huntErr) {
        this.addLog('warn', `Aviso ao caçar novos sites na web: ${huntErr.message}`);
      }

      if (!lead) {
        this.addLog('info', 'ℹ️ Nenhum lead pendente no momento. Próxima varredura em 60 segundos.');
        this.scheduleNext(60000);
        return;
      }
    }

    // Travar lead em memória imediatamente
    this.currentProcessingLeadId = lead.id;
    inFlightLeadIds.add(lead.id);
    this.currentLead = { id: lead.id, name: lead.name, phone: lead.phone, neighborhood: lead.neighborhood };

    // 4.1 Validação Prévia de WhatsApp: Checar se o número é válido e possui conta no WhatsApp
    // Solicitado pelo Kauê: se o número não funcionar ou não tiver WhatsApp, pula imediatamente e pega outro!
    if (this.whatsapp && typeof this.whatsapp.checkOnWhatsApp === 'function') {
      const waCheck = await this.whatsapp.checkOnWhatsApp(lead.cleanPhone);
      if (!waCheck.exists) {
        this.addLog('warn', `⚠️ [Número Inválido] "${lead.name}" (${lead.cleanPhone}): ${waCheck.reason}. Pulando este número e partindo para o próximo lead imediatamente...`);
        
        lead.status = 'ignorado';
        lead.invalidPhone = true;
        lead.notes = (lead.notes ? lead.notes + ' | ' : '') + `Telefone sem WhatsApp (${waCheck.reason})`;
        const leadIndex = leads.findIndex(l => l.id === lead.id);
        if (leadIndex !== -1) {
          leads[leadIndex] = lead;
          writeJson(LEADS_FILE, leads);
        }

        // Pula este número e tenta o próximo imediatamente (em 3 segundos)
        this.scheduleNext(3000);
        return;
      }
    }

    this.addLog('audit', `🔍 [1/3] Auditando site e Google Maps de "${lead.name}" (${lead.neighborhood || 'São Paulo'})...`);

    // 5. Executar Auditoria Técnica Real de Site + Google Maps
    const audit = await auditor.auditLeadFull(lead);
    this.stats.auditedToday += 1;

    const siteResumo = audit.site.hasWebsite
      ? (audit.site.isOnline ? `Site Online (${(audit.site.loadTimeMs/1000).toFixed(1)}s)` : 'Site Fora do Ar')
      : 'Sem Site Próprio';
    const mapsResumo = `${audit.maps.reviews} avaliações (nota ${audit.maps.rating || 'N/A'})`;

    this.addLog('audit', `📊 [Auditoria Concluída] ${siteResumo} | Google Maps: ${mapsResumo}`);

    // 6. Gerar Mensagem de Abordagem Personalizada com Gemini AI
    this.addLog('ai', `🧠 [2/3] Gemini AI gerando abordagem ultra-personalizada no tom do Kauê...`);
    const pitchResult = await gemini.generateAutonomousPitch({ lead, audit });

    if (!pitchResult || !pitchResult.pitchText) {
      throw new Error('Gemini não retornou texto de abordagem válido.');
    }

    this.lastAudit = audit;
    this.lastPitch = pitchResult;
    this.addLog('ai', `✍️ [Pitch Gerado]: "${pitchResult.pitchText.slice(0, 80)}..."`);

    // VALIDAÇÃO CRÍTICA FINAL: Garantir que o lead não foi contatado nesse meio tempo ou aguarda resposta
    const finalCheck = conversationGuard.canSendMessageToLead(lead, this.whatsapp?.store);
    if (!finalCheck.allowed) {
      this.addLog('warn', `🛡️ [Trava Anti-Spam Ativa] Disparo cancelado para "${lead.name}": ${finalCheck.reason}`);
      this.scheduleNext(15000);
      return;
    }

    // REGRA DE OURO ANTI-SPAM DA PINAS:
    // Salva imediatamente o estado do lead no leads.json ANTES de chamar a rede/socket
    // para garantir que nenhuma concorrência ou timeout possa re-selecionar este lead
    lead.status = 'contatado';
    lead.lastContact = new Date().toISOString();
    lead.stage = 1;
    lead.siteAudit = audit.site;
    lead.mapsAudit = audit.maps;
    lead.aiAnalysis = {
      summary: pitchResult.auditSummary || audit.primaryAngle,
      bestAngle: pitchResult.angleUsed || 'Abordagem consultiva com dados auditados'
    };
    lead.initialPitch = pitchResult.pitchText;
    lead.stageHistory = lead.stageHistory || [];
    lead.stageHistory.push({
      stage: 1,
      sentAt: lead.lastContact,
      auto: true,
      ai: true,
      text: pitchResult.pitchText
    });

    const leadIndex = leads.findIndex(l => l.id === lead.id);
    if (leadIndex !== -1) {
      leads[leadIndex] = lead;
      writeJson(LEADS_FILE, leads);
    }

    // 7. Salvar Contato no WhatsApp, Simular Digitação e Disparar pelo WhatsApp
    this.addLog('send', `🚀 [3/3] Disparando mensagem direta pelo WhatsApp para ${lead.name} (${lead.cleanPhone})...`);

    let sendResult;
    try {
      // REGRA ANTI-SPAM META: Salva o contato no WhatsApp antes de disparar o primeiro caractere
      try {
        if (typeof this.whatsapp.saveContact === 'function') {
          let displayName = String(lead.name || '').trim();
          const nicheLower = String(lead.niche || '').toLowerCase();
          let prefix = 'Lead';
          if (nicheLower.includes('vet') || nicheLower.includes('pet')) prefix = 'Vet';
          else if (nicheLower.includes('advog')) prefix = 'Adv';
          else if (nicheLower.includes('coach') || nicheLower.includes('mentor')) prefix = 'Coach';
          else if (nicheLower.includes('dent') || nicheLower.includes('odonto')) prefix = 'Odonto';
          else if (nicheLower.includes('arq') || nicheLower.includes('interiores')) prefix = 'Arq';
          
          if (!displayName.toLowerCase().includes(prefix.toLowerCase())) {
            displayName = `${prefix} • ${displayName}`;
          }
          await this.whatsapp.saveContact(lead.cleanPhone, displayName);
        }
      } catch (scErr) {}

      try {
        await this.whatsapp.sendTyping(lead.cleanPhone);
        await new Promise(r => setTimeout(r, 3500)); // Simula digitação humana
      } catch (tErr) {}

      sendResult = await this.whatsapp.sendMessage(lead.cleanPhone, pitchResult.pitchText, { isBot: true });
    } catch (sendErr) {
      this.addLog('warn', `⚠️ [Falha no Envio] Não foi possível entregar mensagem para "${lead.name}" (${lead.cleanPhone}): ${sendErr.message}. Pulando para o próximo lead imediatamente...`);
      
      lead.status = 'ignorado';
      lead.sendFailed = true;
      lead.notes = (lead.notes ? lead.notes + ' | ' : '') + `Falha no envio WhatsApp: ${sendErr.message}`;
      if (leadIndex !== -1) {
        leads[leadIndex] = lead;
        writeJson(LEADS_FILE, leads);
      }

      // Se falhou o envio, tenta o próximo lead da fila imediatamente em 3 segundos!
      this.scheduleNext(3000);
      return;
    }

    if (sendResult && sendResult.blockedDuplicate) {
      this.addLog('warn', `🛡️ [Anti-Spam WhatsApp] Disparo duplicado interceptado para "${lead.name}". Mensagem não repetida.`);
      this.scheduleNext(15000);
      return;
    }

    // Atualizar contagem no config.json
    config.sentToday = (config.sentToday || 0) + 1;
    saveConfig({ sentToday: config.sentToday });

    this.stats.dispatchedToday += 1;
    this.addLog('success', `✅ Mensagem enviada com sucesso para "${lead.name}"! Lead avançado para Etapa 1.`);

    // 8. Agendar Próximo Disparo: Distribuição inteligente ao longo do dia comercial (10h às 19h)
    let randomIntervalSec;
    if (config.distributeOverDay) {
      const { hour, minute, dayOfWeek } = getBrazilTime();
      const isFriday = dayOfWeek === 5;
      const endHour = isFriday
        ? (config.outboundEndHourFriday !== undefined ? config.outboundEndHourFriday : 16)
        : (config.outboundEndHour !== undefined ? config.outboundEndHour : 19);
      const remainingMinutes = Math.max(15, (endHour - hour) * 60 - minute);
      const dailyLimit = config.dailyLimit || 10;
      const sentToday = config.sentToday || 0;
      const remainingLeads = Math.max(1, dailyLimit - sentToday);
      const targetSec = Math.round((remainingMinutes * 60) / remainingLeads);
      // Variação humana natural de +/- 15%
      const jitter = Math.floor(targetSec * (0.85 + Math.random() * 0.3));
      randomIntervalSec = Math.max(300, Math.min(3600, jitter)); // Mínimo 5 min, máximo 60 min
    } else {
      const minDelay = Math.max(60, config.minDelaySeconds !== undefined ? config.minDelaySeconds : 300);
      const maxDelay = Math.max(minDelay + 10, config.maxDelaySeconds !== undefined ? config.maxDelaySeconds : (minDelay + 30));
      randomIntervalSec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    }
    const randomIntervalMs = randomIntervalSec * 1000;

    const minFormatado = (randomIntervalSec / 60).toFixed(1);
    const proximoHorario = new Date(Date.now() + randomIntervalMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.addLog('info', `⏳ Próximo disparo para novo lead programado para ${proximoHorario} (~${minFormatado} min de intervalo para distribuição humanizada ao longo do dia).`);

    this.scheduleNext(randomIntervalMs);
  }
}

// Instância singleton
const autopilot = new AutoPilotEngine();

module.exports = autopilot;

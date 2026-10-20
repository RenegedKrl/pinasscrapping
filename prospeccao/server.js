// Prevenir que desconexões de socket ou erros assíncronos derrubem o servidor
process.on('uncaughtException', (err) => {
  console.error('[Servidor Aviso] Erro não capturado (mantendo servidor ativo):', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Servidor Aviso] Rejeição de Promise não capturada:', reason);
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Carregar variáveis de ambiente de .env (Node 20+)
const envCandidateFiles = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env')
];
for (const envF of envCandidateFiles) {
  if (fs.existsSync(envF)) {
    try {
      if (process.loadEnvFile) process.loadEnvFile(envF);
    } catch (e) {}
  }
}

const { scrapeGoogleMaps, calculateOpportunity } = require('./scraper');
const whatsapp = require('./whatsapp');
const gemini = require('./gemini');
const auditor = require('./auditor');
const autopilot = require('./autopilot');
const geminiGuard = require('./gemini_guard');
const conversationGuard = require('./conversation_guard');

autopilot.setWhatsAppInstance(whatsapp);

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/media', express.static(path.join(__dirname, 'data', 'media')));

// Rotas da Apresentação de Vendas (Slides Interativos da Pinas)
app.get('/slides', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'slides', 'index.html'));
});
app.get('/apresentacao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'slides', 'index.html'));
});

// Caminhos dos arquivos de dados
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const TEMPLATES_FILE = path.join(__dirname, 'data', 'templates.json');
const STEP_TEMPLATES_FILE = path.join(__dirname, 'data', 'step_templates.json');

// Helpers de leitura e escrita
function readJson(file, defaultVal = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Erro ao ler ${file}:`, err);
    return defaultVal;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Erro ao salvar ${file}:`, err);
    return false;
  }
}

// Reset diário do contador de mensagens enviadas
function checkAndResetDailyLimit(config) {
  const today = new Date().toISOString().split('T')[0];
  if (config.lastResetDate !== today) {
    config.sentToday = 0;
    config.lastResetDate = today;
    writeJson(CONFIG_FILE, config);
  }
  return config;
}

// Verificação de Blacklist Rígida da Pinas (Clientes Atuais & Brás)
function isProtectedBlacklist(lead) {
  if (!lead) return false;
  const rawText = `${lead.name || ''} ${lead.address || ''} ${lead.neighborhood || ''} ${lead.city || ''} ${lead.niche || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const protectedTerms = [
    'petiva',
    'pink luxo',
    'bem zanza',
    'chay b',
    'chayb',
    'bras'
  ];

  return protectedTerms.some(term => {
    // Se o termo for "bras", garantir que não seja falso positivo como "brasil" ou "brasilia"
    if (term === 'bras') {
      return /\bbras\b/.test(rawText);
    }
    return rawText.includes(term);
  });
}

// Estado do scraper em execução
let scraperState = {
  running: false,
  message: 'Pronto para varredura',
  percent: 0,
  leadsFound: 0,
  error: null
};

// ==================== HELPERS DE CANONICALIZAÇÃO DE NICHOS ====================
function normalizeNicheKey(nicheStr) {
  if (!nicheStr || typeof nicheStr !== 'string') return '';
  return nicheStr
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const CANONICAL_NICHE_MAP = {
  'advogados': 'advogado',
  'advocacia': 'advogado',
  'clinicas veterinarias': 'clinica veterinaria',
  'consultorios veterinarios': 'consultorio veterinario',
  'lojas de roupas': 'loja de roupas',
  'lojas de roupas femininas': 'loja de roupas femininas',
  'dentistas': 'dentista'
};

function getCanonicalNiche(rawNiche) {
  const norm = normalizeNicheKey(rawNiche);
  return CANONICAL_NICHE_MAP[norm] || norm;
}

const NICHE_DISPLAY_NAMES = {
  'advogado': '⚖️ Advocacia / Advogados',
  'clinica veterinaria': '🐾 Clínicas Veterinárias',
  'consultorio veterinario': '🩺 Consultórios Veterinários',
  'veterinario 24h': '🐾 Veterinário 24 Horas',
  'loja de roupas femininas': '👗 Lojas de Roupas Femininas',
  'loja de roupas': '👗 Lojas de Roupas / Moda',
  'moda feminina atacado': '👚 Moda Feminina Atacado / Brás',
  'assessoria de marketing': '📈 Assessoria de Marketing',
  'boliche': '🎳 Boliches & Entretenimento',
  'dentista': '🦷 Dentistas / Odontologia',
  'consultorio odontologico': '🦷 Consultórios Odontológicos',
  'contabilidade': '📊 Escritórios de Contabilidade',
  'imobiliaria': '🏠 Imobiliárias',
  'arquiteto': '📐 Arquitetura & Interiores',
  'academia': '🏋️ Academias & Treinamento',
  'buffet infantil': '🎈 Buffet Infantil & Festas',
  'buffet para eventos': '🍾 Buffet para Eventos & Casamentos',
  'barbearia': '💈 Barbearias',
  'desentupidora': '🚰 Desentupidoras 24h',
  'estetica automotiva': '🚗 Estética Automotiva',
  'energia solar': '⚡ Energia Solar',
  'restaurante': '🍽️ Restaurantes & Gastronomia'
};

function formatNicheLabel(rawNiche) {
  const canonKey = getCanonicalNiche(rawNiche);
  if (NICHE_DISPLAY_NAMES[canonKey]) {
    return NICHE_DISPLAY_NAMES[canonKey];
  }
  return rawNiche
    .trim()
    .split(/\s+/)
    .map(word => {
      const wLower = word.toLowerCase();
      if (['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com'].includes(wLower)) {
        return wLower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractNichesFromLeads(leads) {
  const nicheMap = new Map();
  leads.forEach(l => {
    if (l.niche && typeof l.niche === 'string') {
      const trimmed = l.niche.trim();
      if (!trimmed) return;
      const canonKey = getCanonicalNiche(trimmed);
      if (!canonKey) return;
      
      if (!nicheMap.has(canonKey)) {
        nicheMap.set(canonKey, {
          value: canonKey,
          label: formatNicheLabel(trimmed),
          count: 0
        });
      }
      nicheMap.get(canonKey).count++;
    }
  });
  return Array.from(nicheMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

// ==================== ROTAS DE LEADS ====================

// Listar leads com filtros
app.get('/api/leads', (req, res) => {
  let allLeads = readJson(LEADS_FILE, []);
  
  // Garantir que todos os leads possuam score e diagnóstico de oportunidade
  let hasChanges = false;
  allLeads.forEach(l => {
    if (!l.opportunity || !l.score) {
      l.opportunity = calculateOpportunity(l);
      l.score = l.opportunity.score;
      hasChanges = true;
    }
  });
  if (hasChanges) writeJson(LEADS_FILE, allLeads);

  // Calcular nichos dinâmicos consolidados e unificados de todos os leads cadastrados
  const niches = extractNichesFromLeads(allLeads);

  let leads = [...allLeads];
  const { status, niche, hasWebsite, hasPhone, hasMobile, search, opportunity } = req.query;

  if (status && status !== 'todos') {
    leads = leads.filter(l => l.status === status);
  }
  if (niche && niche !== 'todos') {
    const targetCanon = getCanonicalNiche(niche);
    leads = leads.filter(l => l.niche && getCanonicalNiche(l.niche) === targetCanon);
  }
  if (opportunity && opportunity !== 'todos' && opportunity !== 'all') {
    leads = leads.filter(l => l.opportunity && l.opportunity.type === opportunity);
  }
  if (hasWebsite !== undefined && hasWebsite !== '') {
    const val = hasWebsite === 'true';
    leads = leads.filter(l => l.hasWebsite === val);
  }
  if (hasPhone !== undefined && hasPhone !== '') {
    const val = hasPhone === 'true';
    leads = leads.filter(l => l.hasPhone === val);
  }
  if (hasMobile === 'true') {
    leads = leads.filter(l => l.hasMobile === true);
  }
  if (search) {
    const term = search.toLowerCase();
    leads = leads.filter(l => 
      l.name.toLowerCase().includes(term) ||
      (l.phone && l.phone.includes(term)) ||
      (l.neighborhood && l.neighborhood.toLowerCase().includes(term)) ||
      (l.notes && l.notes.toLowerCase().includes(term)) ||
      (l.opportunity && l.opportunity.label.toLowerCase().includes(term))
    );
  }

  // Estatísticas rápidas
  const stats = {
    total: allLeads.length,
    withPhone: allLeads.filter(l => l.hasPhone).length,
    withMobile: allLeads.filter(l => l.hasMobile).length,
    withoutWebsite: allLeads.filter(l => !l.hasWebsite).length,
    goldOpportunity: allLeads.filter(l => l.opportunity && l.opportunity.type === 'ouro').length,
    contacted: allLeads.filter(l => l.status === 'contatado').length,
    meeting: allLeads.filter(l => l.status === 'reuniao' || l.status === 'proposta' || l.status === 'ganho').length
  };

  res.json({ leads, stats, niches });
});

// Endpoint dedicado para obter nichos únicos já consolidados
app.get('/api/niches', (req, res) => {
  const allLeads = readJson(LEADS_FILE, []);
  const niches = extractNichesFromLeads(allLeads);
  res.json(niches);
});

// Adicionar ou atualizar lead
app.post('/api/leads', (req, res) => {
  const leads = readJson(LEADS_FILE, []);
  const newLead = req.body;

  if (!newLead.name) {
    return res.status(400).json({ error: 'Nome do lead é obrigatório' });
  }

  if (isProtectedBlacklist(newLead)) {
    return res.status(403).json({
      error: 'Operação bloqueada: Este contato é cliente ativo da Pinas ou da região do Brás (Blacklist).'
    });
  }

  if (newLead.id) {
    // Atualizar
    const index = leads.findIndex(l => l.id === newLead.id);
    if (index !== -1) {
      leads[index] = { ...leads[index], ...newLead };
      writeJson(LEADS_FILE, leads);
      return res.json(leads[index]);
    }
  }

  // Criar novo
  newLead.id = `lead-${Date.now()}`;
  newLead.createdAt = new Date().toISOString();
  newLead.status = newLead.status || 'novo';
  leads.unshift(newLead);
  writeJson(LEADS_FILE, leads);
  res.status(201).json(newLead);
});

// Atualizar status do lead
app.patch('/api/leads/:id/status', (req, res) => {
  const leads = readJson(LEADS_FILE, []);
  const { id } = req.params;
  const { status } = req.body;

  const lead = leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  lead.status = status;
  if (status === 'contatado' && !lead.lastContact) {
    lead.lastContact = new Date().toISOString();
  }

  writeJson(LEADS_FILE, leads);
  res.json(lead);
});

// Registrar envio de mensagem (atualiza contador diário)
app.post('/api/leads/:id/contacted', (req, res) => {
  const leads = readJson(LEADS_FILE, []);
  const config = checkAndResetDailyLimit(readJson(CONFIG_FILE, {}));
  const { id } = req.params;

  const lead = leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  lead.status = 'contatado';
  lead.lastContact = new Date().toISOString();
  writeJson(LEADS_FILE, leads);

  // Incrementar contador diário
  config.sentToday = (config.sentToday || 0) + 1;
  writeJson(CONFIG_FILE, config);

  res.json({ lead, sentToday: config.sentToday, dailyLimit: config.dailyLimit });
});

// Excluir lead
app.delete('/api/leads/:id', (req, res) => {
  let leads = readJson(LEADS_FILE, []);
  const { id } = req.params;
  leads = leads.filter(l => l.id !== id);
  writeJson(LEADS_FILE, leads);
  res.json({ success: true });
});

// ==================== ROTAS DE WHATSAPP DIRETO ====================

// Obter status da conexão e QR Code
app.get('/api/whatsapp/status', (req, res) => {
  res.json(whatsapp.getStatus());
});

// Iniciar conexão do WhatsApp / gerar QR Code
app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    const current = whatsapp.getStatus();
    // Se já estiver conectado, apenas retorna o status sem reiniciar o socket
    if (current.connected) {
      return res.json(current);
    }
    // Se já estiver conectando ou com QR pronto e não foi pedido force, não recria socket
    if ((current.status === 'connecting' || current.status === 'qr_ready') && !req.body?.force) {
      return res.json(current);
    }

    const status = await whatsapp.initWhatsApp(!!req.body?.force);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Desconectar sessão do WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const result = await whatsapp.disconnectWhatsApp();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar mensagem direta pelo WhatsApp conectado (sem abrir abas no navegador)
app.post('/api/whatsapp/send', async (req, res) => {
  const { phone, text, leadId } = req.body;

  if (!phone || !text) {
    return res.status(400).json({ error: 'Telefone e texto da mensagem são obrigatórios.' });
  }

  // Verifica se é um lead novo (prospecção fria) ou conversa em andamento
  const leads = readJson(LEADS_FILE, []);
  const lead = leadId ? leads.find(l => l.id === leadId) : findLeadByPhone(leads, String(phone).replace(/\D/g, ''));

  // REGRA DE OURO ANTI-SPAM DA PINAS:
  // Se o lead já recebeu mensagem nossa e não respondeu, NUNCA enviar outra mensagem sem resposta do cliente!
  if (lead && !req.body.force) {
    const safetyCheck = conversationGuard.canSendMessageToLead(lead, whatsapp.store);
    if (!safetyCheck.allowed) {
      return res.status(400).json({
        error: safetyCheck.reason,
        code: safetyCheck.code,
        waitingForCustomerReply: safetyCheck.waitingForCustomerReply
      });
    }
  }

  const isColdOutbound = lead ? (lead.status === 'novo' || (!lead.lastContact && lead.status !== 'respondeu')) : false;

  const config = checkAndResetDailyLimit(readJson(CONFIG_FILE, {}));
  if (isColdOutbound && config.sentToday >= config.dailyLimit) {
    return res.status(429).json({
      error: `Limite de segurança diário atingido (${config.sentToday}/${config.dailyLimit}). Disparo interrompido para proteção da sua conta.`
    });
  }

  try {
    const sendResult = await whatsapp.sendMessage(phone, text);

    // Se fornecido leadId, atualizar status do lead
    let updatedLead = null;
    if (leadId && lead) {
      if (lead.status === 'novo') {
        lead.status = 'contatado';
      }
      lead.lastContact = new Date().toISOString();
      writeJson(LEADS_FILE, leads);
      updatedLead = lead;
      if (sendResult && sendResult.to) {
        whatsapp.store.upsertChat(sendResult.to, { name: lead.name, phone: lead.phone });
      }
    }

    // Apenas disparos frios (outbound para novos contatos) incrementam o contador diário
    if (isColdOutbound) {
      config.sentToday = (config.sentToday || 0) + 1;
      writeJson(CONFIG_FILE, config);
    }

    res.json({
      success: true,
      sendResult,
      lead: updatedLead,
      sentToday: config.sentToday,
      dailyLimit: config.dailyLimit
    });
  } catch (err) {
    console.error('[WhatsApp Send Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Listar conversas para a Central de Conversas (Inbox)
app.get('/api/whatsapp/chats', (req, res) => {
  res.json(whatsapp.store.getChats());
});

// Forçar sincronização de títulos dos grupos do WhatsApp
app.post('/api/whatsapp/sync-groups', async (req, res) => {
  try {
    if (typeof whatsapp.syncAllGroupsMetadata === 'function') {
      await whatsapp.syncAllGroupsMetadata();
    }
    res.json({ success: true, chats: whatsapp.store.getChats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obter histórico de mensagens de um chat
app.get('/api/whatsapp/messages/:jid', (req, res) => {
  const { jid } = req.params;
  res.json(whatsapp.store.getMessages(jid));
});

// Marcar mensagens do chat como lidas
app.post('/api/whatsapp/mark-read', (req, res) => {
  const { jid } = req.body;
  if (jid) whatsapp.store.markChatAsRead(jid);
  res.json({ success: true });
});

// Enviar mensagem de texto no chat direto (Intervenção manual do Kauê)
app.post('/api/whatsapp/send-chat', async (req, res) => {
  const { jid, text } = req.body;
  if (!jid || !text) {
    return res.status(400).json({ error: 'JID e texto são obrigatórios.' });
  }
  try {
    const result = await whatsapp.sendMessage(jid, text, { isBot: false });
    // Marcar lead como atendimento manual definitivo do Kauê
    try {
      const cleanDigits = String(jid).replace(/\D/g, '');
      const leads = readJson(LEADS_FILE, []);
      const lead = findLeadByPhone(leads, cleanDigits);
      if (lead) {
        if (autoResponderQueue.has(lead.id)) {
          clearTimeout(autoResponderQueue.get(lead.id));
          autoResponderQueue.delete(lead.id);
        }
        lead.manualControl = true;
        lead.humanTakeover = true;
        lead.lastManualMessageAt = new Date().toISOString();
        if (!lead.notes || !lead.notes.includes('Atendimento manual do Kauê')) {
          lead.notes = (lead.notes ? lead.notes + ' | ' : '') + 'Atendimento manual do Kauê (IA desativada)';
        }
        writeJson(LEADS_FILE, leads);
        console.log(`[Human Takeover] 👤 Mensagem enviada pelo painel para "${lead.name}". Controle manual assumido!`);
      }
    } catch (e) {}
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar mídia (foto ou documento) no chat
app.post('/api/whatsapp/send-media', async (req, res) => {
  const { jid, base64Data, mimetype, caption, fileName } = req.body;
  if (!jid || !base64Data) {
    return res.status(400).json({ error: 'JID e arquivo são obrigatórios.' });
  }
  try {
    const result = await whatsapp.sendMediaMessage(jid, { base64Data, mimetype, caption, fileName });
    try {
      const cleanDigits = String(jid).replace(/\D/g, '');
      const leads = readJson(LEADS_FILE, []);
      const lead = findLeadByPhone(leads, cleanDigits);
      if (lead) {
        if (autoResponderQueue.has(lead.id)) {
          clearTimeout(autoResponderQueue.get(lead.id));
          autoResponderQueue.delete(lead.id);
        }
        lead.manualControl = true;
        lead.humanTakeover = true;
        lead.lastManualMessageAt = new Date().toISOString();
        writeJson(LEADS_FILE, leads);
      }
    } catch (e) {}
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar áudio (gravação de voz PTT) no chat
app.post('/api/whatsapp/send-audio', async (req, res) => {
  const { jid, base64Data, mimetype } = req.body;
  if (!jid || !base64Data) {
    return res.status(400).json({ error: 'JID e áudio em Base64 são obrigatórios.' });
  }
  try {
    const result = await whatsapp.sendAudioMessage(jid, { base64Data, mimetype });
    try {
      const cleanDigits = String(jid).replace(/\D/g, '');
      const leads = readJson(LEADS_FILE, []);
      const lead = findLeadByPhone(leads, cleanDigits);
      if (lead) {
        if (autoResponderQueue.has(lead.id)) {
          clearTimeout(autoResponderQueue.get(lead.id));
          autoResponderQueue.delete(lead.id);
        }
        lead.manualControl = true;
        lead.humanTakeover = true;
        lead.lastManualMessageAt = new Date().toISOString();
        writeJson(LEADS_FILE, leads);
      }
    } catch (e) {}
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROTAS DE SCRAPER ====================

// Iniciar scraping
app.post('/api/scrape', async (req, res) => {
  if (scraperState.running) {
    return res.status(400).json({ error: 'Já existe uma varredura em execução.' });
  }

  const { niche, location, maxResults = 25, onlyMobile = false, filterDuplicates = true, filterMinSize = true } = req.body;

  if (!niche || !location) {
    return res.status(400).json({ error: 'Nicho e localização são obrigatórios.' });
  }

  scraperState = {
    running: true,
    message: 'Iniciando varredura...',
    percent: 5,
    leadsFound: 0,
    error: null
  };

  res.json({ message: 'Varredura iniciada em segundo plano.' });

  // Executar assincronamente
  (async () => {
    try {
      const capturedLeads = await scrapeGoogleMaps({
        niche,
        location,
        maxResults: parseInt(maxResults, 10) || 25,
        onlyMobile: !!onlyMobile,
        filterDuplicates: filterDuplicates !== false,
        filterMinSize: filterMinSize !== false,
        onProgress: (p) => {
          scraperState.message = p.message;
          if (p.percent) scraperState.percent = p.percent;
        }
      });

      // Mesclar leads novos evitando duplicados por telefone ou nome
      const existingLeads = readJson(LEADS_FILE, []);
      let newCount = 0;

      for (const lead of capturedLeads) {
        const isDuplicate = existingLeads.some(existing => {
          if (lead.cleanPhone && existing.cleanPhone && lead.cleanPhone === existing.cleanPhone) return true;
          return lead.name.toLowerCase() === existing.name.toLowerCase();
        });

        if (!isDuplicate) {
          existingLeads.unshift(lead);
          newCount++;
        }
      }

      writeJson(LEADS_FILE, existingLeads);

      scraperState.running = false;
      scraperState.percent = 100;
      scraperState.leadsFound = newCount;
      scraperState.message = `Varredura concluída! ${newCount} novos leads adicionados à tabela.`;

    } catch (err) {
      console.error('Erro no scraper:', err);
      scraperState.running = false;
      scraperState.error = err.message;
      scraperState.message = `Falha na varredura: ${err.message}`;
    }
  })();
});

// Status do scraper
app.get('/api/scrape/status', (req, res) => {
  res.json(scraperState);
});

// Varredura automática das 4 categorias de Coaches & Mentores
app.post('/api/scrape/coaches-automatico', async (req, res) => {
  if (scraperState.running) {
    return res.status(400).json({ error: 'Já existe uma varredura em execução.' });
  }

  res.json({ success: true, message: 'Varredura automática de coaches iniciada em segundo plano.' });

  try {
    const { runAutonomousCoachScraper } = require('./scripts/varrer_coaches_automatico');
    scraperState.running = true;
    scraperState.message = 'Varrendo coaches, finanças, negócios, carreira e palestrantes...';
    scraperState.percent = 10;
    
    const result = await runAutonomousCoachScraper();
    
    scraperState.running = false;
    scraperState.percent = 100;
    scraperState.leadsFound = result.totalNewAdded;
    scraperState.message = `Varredura concluída! ${result.totalNewAdded} novos coaches adicionados.`;
  } catch (err) {
    scraperState.running = false;
    scraperState.error = err.message;
    scraperState.message = `Erro: ${err.message}`;
  }
});

// Caça ativa e autônoma de sites ruins na Web
app.post('/api/scrape/hunt-bad-sites', async (req, res) => {
  const { niche, location, maxResults } = req.body || {};
  if (scraperState.isRunning) {
    return res.status(409).json({ error: 'Uma varredura já está em andamento.' });
  }

  scraperState.isRunning = true;
  scraperState.progress = 5;
  scraperState.message = '🎯 Iniciando caça ativa de empresas com sites ruins...';
  scraperState.leadsFound = 0;
  scraperState.error = null;

  res.json({ success: true, message: 'Caça ativa de sites ruins iniciada com sucesso.' });

  (async () => {
    try {
      const { huntBadWebsites } = require('./scraper');
      const badLeads = await huntBadWebsites({
        niche,
        location,
        maxResults: maxResults || 8,
        onProgress: ({ message, percent }) => {
          scraperState.message = message;
          if (percent !== null) scraperState.progress = percent;
        }
      });

      scraperState.isRunning = false;
      scraperState.progress = 100;
      scraperState.leadsFound = badLeads.length;
      scraperState.message = `✅ Caça concluída! ${badLeads.length} estabelecimentos com sites problemáticos adicionados à esteira.`;
    } catch (err) {
      scraperState.isRunning = false;
      scraperState.error = err.message;
      scraperState.message = `Falha na caça de sites ruins: ${err.message}`;
    }
  })();
});

// ==================== ROTAS DE CONFIGURAÇÃO E TEMPLATES ====================

app.get('/api/config', (req, res) => {
  const config = checkAndResetDailyLimit(readJson(CONFIG_FILE, {}));
  res.json(config);
});

app.post('/api/config', (req, res) => {
  let config = readJson(CONFIG_FILE, {});
  if (Array.isArray(req.body.outboundDays)) {
    req.body.outboundDays = req.body.outboundDays.map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 6);
  }
  config = { ...config, ...req.body };
  writeJson(CONFIG_FILE, config);
  res.json(config);
});

app.get('/api/templates', (req, res) => {
  const templates = readJson(TEMPLATES_FILE, []);
  res.json(templates);
});

app.post('/api/templates', (req, res) => {
  const templates = req.body;
  writeJson(TEMPLATES_FILE, templates);
  res.json({ success: true, templates });
});

// ==================== ROTAS DE CADÊNCIA POR ETAPAS (5 PASSOS) ====================

app.get('/api/step-templates', (req, res) => {
  const stepTemplates = readJson(STEP_TEMPLATES_FILE, { settings: {}, stages: [] });
  res.json(stepTemplates);
});

app.post('/api/step-templates', (req, res) => {
  const data = req.body;
  writeJson(STEP_TEMPLATES_FILE, data);
  res.json({ success: true, stepTemplates: data });
});

// Atualizar ou disparar etapa de um lead
app.post('/api/leads/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, text, sendNow = false } = req.body;
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  lead.stage = stage;
  lead.stageHistory = lead.stageHistory || [];

  if (sendNow && text) {
    if (isProtectedBlacklist(lead)) {
      return res.status(403).json({
        error: 'Envio bloqueado: Este contato é cliente ativo da Pinas ou da região do Brás (Blacklist).'
      });
    }

    // REGRA DE OURO ANTI-SPAM DA PINAS:
    // Nunca enviar uma etapa ou mensagem para o lead se ele ainda não respondeu à anterior!
    if (!req.body.force) {
      const safetyCheck = conversationGuard.canSendMessageToLead(lead, whatsapp.store);
      if (!safetyCheck.allowed) {
        return res.status(400).json({
          error: safetyCheck.reason,
          code: safetyCheck.code,
          waitingForCustomerReply: safetyCheck.waitingForCustomerReply
        });
      }
    }

    const isColdOutbound = (stage === 1 && lead.status === 'novo');
    if (isColdOutbound) {
      const config = checkAndResetDailyLimit(readJson(CONFIG_FILE, {}));
      if (config.sentToday >= config.dailyLimit) {
        return res.status(429).json({
          error: `Limite diário de segurança atingido (${config.sentToday}/${config.dailyLimit}).`
        });
      }
    }

    try {
      const cleanPhone = lead.cleanPhone || whatsapp.cleanPhoneForWhatsApp(lead.phone);
      const sendResult = await whatsapp.sendMessage(cleanPhone, text);

      if (stage === 1 && lead.status === 'novo') {
        lead.status = 'contatado';
      }
      lead.lastContact = new Date().toISOString();
      lead.stageHistory.push({
        stage,
        sentAt: new Date().toISOString(),
        manual: true,
        text
      });

      if (isColdOutbound) {
        const config = checkAndResetDailyLimit(readJson(CONFIG_FILE, {}));
        config.sentToday = (config.sentToday || 0) + 1;
        writeJson(CONFIG_FILE, config);
      }
      writeJson(LEADS_FILE, leads);

      const config = readJson(CONFIG_FILE, {});
      return res.json({ success: true, lead, sendResult, sentToday: config.sentToday });
    } catch (err) {
      console.error('[Stage Send Error]:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  writeJson(LEADS_FILE, leads);
  res.json({ success: true, lead });
});

// Obter estado detalhado da conversa e se pode enviar mensagem
app.get('/api/leads/:id/conversation-state', (req, res) => {
  const { id } = req.params;
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  const state = conversationGuard.getConversationState(lead, whatsapp.store);
  const safety = conversationGuard.canSendMessageToLead(lead, whatsapp.store);

  res.json({
    leadId: lead.id,
    leadName: lead.name,
    leadStatus: lead.status,
    ...state,
    canSend: safety.allowed,
    reason: safety.reason,
    code: safety.code
  });
});

// Reconciliar base de leads contra o histórico real do WhatsApp
app.post('/api/leads/reconcile', (req, res) => {
  const result = conversationGuard.reconcileLeadsDatabase(whatsapp.store);
  res.json({ success: true, ...result });
});

// ==================== AUTO-RESPONDER INTELIGENTE DE ETAPAS ====================

// Normaliza números brasileiros para comparação segura (DDD + 8 últimos dígitos)
function extractDddAndNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  let local = d;
  if (local.startsWith('55') && (local.length === 12 || local.length === 13)) {
    local = local.slice(2);
  }
  const ddd = local.slice(0, 2);
  const last8 = local.slice(-8);
  return { ddd, last8 };
}

// Localiza lead por telefone de forma robusta e à prova de falhas
function findLeadByPhone(leads, cleanDigits) {
  if (!cleanDigits) return null;
  const digits = String(cleanDigits).replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;

  // 1. Match exato
  let match = leads.find(l => {
    const lDigits = String(l.cleanPhone || l.phone || '').replace(/\D/g, '');
    return lDigits && lDigits.length >= 8 && lDigits === digits;
  });
  if (match) return match;

  // 2. Match por DDD + últimos 8 dígitos (independe de 55 ou 9º dígito extra)
  const parsedTarget = extractDddAndNumber(digits);
  if (parsedTarget) {
    match = leads.find(l => {
      const parsedLead = extractDddAndNumber(l.cleanPhone || l.phone);
      return parsedLead && parsedLead.ddd === parsedTarget.ddd && parsedLead.last8 === parsedTarget.last8;
    });
    if (match) return match;
  }

  // 3. Fallback: terminação mútua (apenas se ambos tiverem >= 8 dígitos para evitar strings vazias)
  return leads.find(l => {
    const lDigits = String(l.cleanPhone || l.phone || '').replace(/\D/g, '');
    if (!lDigits || lDigits.length < 8) return false;
    return digits.endsWith(lDigits) || lDigits.endsWith(digits);
  });
}

function classifyLeadResponse(text) {
  if (!text || typeof text !== 'string') return 'neutral';
  const t = text.toLowerCase().trim();

  // Frases receptivas / positivas fortes (não podem ser canceladas por falsos positivos)
  const positivePhrases = [
    'posso ajudar', 'em que posso ajudar', 'como posso ajudar', 'como podemos ajudar',
    'o que seria', 'qual o assunto', 'sobre o que', 'fala', 'diga', 'manda',
    'pode falar', 'pode mandar', 'pode dizer', 'pode sim', 'sou eu', 'é ele', 'e ele',
    'quem fala', 'com quem falo', 'quem gostaria', 'quem é', 'quem e', 'olá', 'ola',
    'opa', 'tudo bem', 'tudo bom', 'boa tarde', 'bom dia', 'boa noite',
    'sou a responsável', 'sou o responsável', 'sou a responsavel', 'sou o responsavel',
    'quem tá falando', 'quem ta falando', 'o que precisa', 'orçamento', 'orcamento',
    'dúvida', 'duvida', 'projeto', 'atendimento', 'consultor', 'consultora',
    'já entraremos em contato', 'ja entraremos em contato'
  ];

  const hasPositive = positivePhrases.some(p => t.includes(p));

  // Frases de recusa explícita
  const explicitNegativePhrases = [
    'não tenho interesse', 'nao tenho interesse', 'sem interesse',
    'não quero', 'nao quero', 'não preciso', 'nao preciso',
    'número errado', 'numero errado', 'não é daqui', 'nao e daqui',
    'engano', 'pare de mandar', 'para de mandar', 'não mande mais', 'nao mande mais',
    'favor retirar', 'remova meu número', 'remova meu numero',
    'quem te deu meu numero', 'sai fora', 'não me interessa', 'nao me interessa',
    'não autorizei', 'nao autorizei', 'favor excluir'
  ];

  if (explicitNegativePhrases.some(p => t.includes(p))) {
    return 'negative';
  }

  // Se for apenas uma recusa monossilábica estrita isolada ("não", "nao", "não obrigado")
  const isStrictNegative = /^(não|nao|não obrigado|nao obrigado|não valeu|nao valeu)[\.!\?]*$/i.test(t);
  if (isStrictNegative && !hasPositive) {
    return 'negative';
  }

  if (hasPositive || t.length >= 2) {
    return 'positive';
  }

  return 'neutral';
}

// Detecta mensagens automáticas de ausência/fora do horário do WhatsApp Business
function isAutomatedBusinessGreeting(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim();

  // Se a mensagem pergunta como pode ajudar ("como podemos te ajudar", "como posso ajudar", "em que posso te ajudar"),
  // o estabelecimento está dando abertura direta para a apresentação comercial da Pinas! NUNCA ignorar!
  if (/como\s+podemos?\s+(te\s+)?ajudar|como\s+posso\s+(te\s+)?ajudar|em\s+que\s+posso\s+(te\s+)?ajudar|em\s+que\s+podemos\s+ajudar/i.test(t)) {
    return false;
  }

  // Se o atendente humano disse que vai encaminhar para o responsável, NÃO é secretária eletrônica!
  const humanForwarding = ['vou encaminhar', 'irei encaminhar', 'vou passar', 'irei passar', 'vou avisar', 'irei avisar', 'vou falar com'];
  if (humanForwarding.some(p => t.includes(p))) return false;

  const businessPatterns = [
    'horário de atendimento', 'horario de atendimento',
    'mensagem automática', 'mensagem automatica',
    'estamos ausentes', 'estou ausente', 'no momento estamos ausentes', 'fora do nosso horário', 'fora do horario',
    'responderemos assim que possível', 'responderemos assim que possivel', 'retornaremos assim que possível', 'retornaremos assim que possivel',
    'logo mais volto para te responder', 'em breve respondo', 'em breve responderemos',
    'atendimento automatizado', 'resposta automatica', 'resposta automática',
    'não estamos disponíveis no momento', 'nao estamos disponiveis no momento',
    'não podemos atender sua ligação', 'nao podemos atender sua ligacao',
    'nossa equipe responderá assim que possível', 'retornaremos o mais breve possível'
  ];

  return businessPatterns.some(p => t.includes(p));
}

function generateCleanWhatsAppLink(lead) {
  let raw = String(lead.cleanPhone || lead.phone || '').replace(/\D/g, '');
  if (!raw) return 'https://wa.me/5511999999999?text=Ol%C3%A1!%20Vi%20no%20Google%20e%20gostaria%20de%20informa%C3%A7%C3%B5es';
  if (raw.length === 10 || raw.length === 11) {
    raw = '55' + raw;
  }
  const cleanName = (lead.name || '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\b(LTDA|ME|EPP|S\/A|EIRELI)\b/gi, '')
    .trim();
  const defaultMsg = encodeURIComponent(`Olá! Vi no Google e gostaria de informações sobre ${cleanName || 'os serviços'}.`);
  return `https://wa.me/${raw}?text=${defaultMsg}`;
}

function formatStepMessage(lead, rawTemplate, withSite = false) {
  if (!rawTemplate) return '';
  let cleanName = (lead.name || '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\b(LTDA|ME|EPP|S\/A|EIRELI)\b/gi, '')
    .trim();

  const waLink = generateCleanWhatsAppLink(lead);

  let text = rawTemplate;
  text = text.replace(/{nome}/g, cleanName || 'empresa');
  text = text.replace(/{nicho}/g, lead.niche || 'seu segmento');
  text = text.replace(/{bairro}/g, lead.neighborhood || 'sua região');
  text = text.replace(/{regiao}/g, lead.neighborhood || lead.city || 'São Paulo - SP');
  text = text.replace(/{cidade}/g, lead.city || 'São Paulo');
  text = text.replace(/{link_whatsapp}/g, waLink);
  text = text.replace(/{link_whatsapp_corrigido}/g, waLink);
  text = text.replace(/{telefone}/g, lead.phone || '');
  return text;
}

const autoResponderQueue = new Map();
const processedIncomingMsgIds = new Set();
const leadLastRepliedAt = new Map();
const activeLeadResponses = new Set(); // TRAVA ATÔMICA ANTI-DUPLICAÇÃO: impede geração paralela pro mesmo lead

// Executar resposta inteligente para um lead específico (usado em tempo real e na recuperação offline)
async function executeLeadResponse(lead, text, targetJid = null, source = 'realtime') {
  if (!lead || !text) return false;

  // SEGURANÇA MÁXIMA 4: NUNCA responder clientes ativos da Pinas ou região do Brás
  if (isProtectedBlacklist(lead)) {
    console.log(`[Auto-Responder] Lead protegido "${lead.name}" ignorado por blacklist de segurança.`);
    return false;
  }

  // SEGURANÇA MÁXIMA 5: NUNCA responder leads já arquivados ou marcados como perdidos
  if (lead.status === 'perdido' || lead.status === 'arquivado') {
    return false;
  }

  // SEGURANÇA MÁXIMA 5.1 (HUMAN TAKEOVER): Se o Kauê já assumiu o atendimento manual deste lead, IA 100% SILENCIADA!
  if (lead.manualControl || lead.humanTakeover) {
    console.log(`[Auto-Responder] 👤 Lead "${lead.name}" está sob atendimento manual do Kauê. IA desativada.`);
    return false;
  }

  // TRAVA ANTI-DUPLICAÇÃO 1: Se a IA já está gerando resposta ativamente para este lead, ABORTA execução paralela
  if (activeLeadResponses.has(lead.id)) {
    console.log(`[Auto-Responder] 🛡️ Lead "${lead.name}" já possui geração de resposta em andamento. Abortando concorrência.`);
    return false;
  }

  // TRAVA ANTI-DUPLICAÇÃO 2: Cooldown de 90 segundos por lead (impede qualquer disparo duplo repetido)
  const now = Date.now();
  if (leadLastRepliedAt.has(lead.id) && (now - leadLastRepliedAt.get(lead.id) < 90000)) {
    console.log(`[Auto-Responder] 🛡️ Cooldown ativo para "${lead.name}" (< 90s desde o último envio). Abortando.`);
    return false;
  }

  // SEGURANÇA MÁXIMA 6 (REGRA DE OURO): Se o ÚLTIMO remetente na conversa já foi o Kauê (nós), NUNCA responder novamente!
  const jid = targetJid || (lead.cleanPhone + '@s.whatsapp.net');
  const chatHistory = whatsapp.store.getMessages(jid) || [];
  if (chatHistory.length > 0) {
    const textMsgs = chatHistory.filter(m => m.text && !m.text.startsWith('[Sistema]'));
    if (textMsgs.length > 0) {
      const lastMsg = textMsgs[textMsgs.length - 1];
      if (lastMsg.fromMe) {
        console.log(`[Auto-Responder] 🛡️ A última mensagem para "${lead.name}" já foi enviada por nós. Aguardando o cliente responder.`);
        return false;
      }
    }
  }

  // SEGURANÇA MÁXIMA 7: Validação estrita via conversationGuard antes de prosseguir
  const guardCheck = conversationGuard.canSendMessageToLead(lead, whatsapp.store);
  if (!guardCheck.allowed) {
    console.log(`[Auto-Responder] 🛡️ conversationGuard bloqueou envio para "${lead.name}": ${guardCheck.reason}`);
    return false;
  }

  // Limpar IMEDIATAMENTE qualquer timer pendente na fila em tempo real deste lead para evitar segundo disparo
  if (autoResponderQueue.has(lead.id)) {
    clearTimeout(autoResponderQueue.get(lead.id));
    autoResponderQueue.delete(lead.id);
  }

  // ATIVAR AS TRAVAS ANTES DE QUALQUER OPERAÇÃO ASSÍNCRONA DA IA
  activeLeadResponses.add(lead.id);
  leadLastRepliedAt.set(lead.id, Date.now());

  try {
    // Atualiza status do lead para "respondeu" (mantendo "reuniao" caso já tenha sido agendada)
    const freshLeads = readJson(LEADS_FILE, []);
    const currentLead = freshLeads.find(l => l.id === lead.id) || lead;
    if (currentLead.status !== 'reuniao') {
      currentLead.status = 'respondeu';
    }
    currentLead.repliedAt = new Date().toISOString();
    writeJson(LEADS_FILE, freshLeads);

    const stepData = readJson(STEP_TEMPLATES_FILE, { settings: {}, stages: [] });
    const settings = stepData.settings || {};

    if (settings.autoResponderEnabled === false) {
      console.log(`[Auto-Responder] Lead "${currentLead.name}" respondeu, mas automação de resposta de etapas está pausada.`);
      return false;
    }

    // Verificar intenção (recusa explícita e categórica)
    const intent = classifyLeadResponse(text);
    if (intent === 'negative') {
      console.log(`[Auto-Responder] Lead "${currentLead.name}" enviou recusa explícita: "${text}". Marcando como perdido.`);
      currentLead.status = 'perdido';
      currentLead.manualControl = true;
      currentLead.humanTakeover = true;
      currentLead.notes = (currentLead.notes ? currentLead.notes + ' | ' : '') + `Recusou: "${text}"`;
      writeJson(LEADS_FILE, freshLeads);
      return false;
    }

    const isAiChatActive = (gemini.isConfigured() && settings.useGeminiConversationalAi !== false);
    const currentStage = currentLead.stage || 1;

    if (!isAiChatActive) {
      if (currentStage >= (settings.maxAutoStage || 3) && currentLead.status !== 'reuniao') {
        console.log(`[Auto-Responder] ℹ️ Lead "${currentLead.name}" atingiu o limite de templates manuais. Mantendo para atendimento.`);
        return false;
      }
    }

    let targetStage = currentStage + 1;
    let combineWithNext = (currentStage === 1 && settings.combineStages2and3);

    console.log(`[Auto-Responder 24/7] 🎯 Lead minerado "${currentLead.name}" mandou mensagem: "${text}". IA preparando resposta (${source})...`);

    let replyMessage = '';
    let targetAction = 'reply';

    // 1. Gerar resposta contextual inteligente e contínua com Gemini AI na voz autêntica do Kauê
    if (isAiChatActive) {
      try {
        console.log(`[Auto-Responder AI 24/7] Gerando resposta adaptativa com Gemini para "${currentLead.name}"...`);
        const recentLeadTexts = chatHistory.filter(m => !m.fromMe && m.text).map(m => m.text);
        const contextText = recentLeadTexts.slice(-3).join(' | ') || text;

        const aiResult = await gemini.generateAutoPilotReply({
          lead: currentLead,
          messages: chatHistory,
          lastIncomingMessage: contextText
        });

        if (aiResult && aiResult.replyText) {
          replyMessage = aiResult.replyText;
          targetAction = aiResult.action || 'reply';
          console.log(`[Auto-Responder AI] Resposta criada pelo Gemini (${aiResult.detectedIntent} -> ${targetAction})`);
        }
      } catch (aiErr) {
        console.warn('[Auto-Responder AI] Falha ao consultar Gemini, usando fallback:', aiErr.message);
      }
    }

    // 2. Fallback humanizado e contextual (NUNCA robótico ou agressivo)
    if (!replyMessage && targetAction !== 'mark_lost') {
      const neighborhood = currentLead.neighborhood || currentLead.city || 'São Paulo';
      if (targetStage <= 2) {
        replyMessage = `Opa, tudo bem? Prazer! Aqui é o Kauê, da Pinas.\n\nVi o perfil de vocês no Google Maps em ${neighborhood} e achei muito bacana a reputação por aí. Dei uma olhada rápida na estrutura digital de vocês pelo celular e queria entender: vocês já têm alguém cuidando dessa parte de site e novos contatos por aí hoje?`;
      } else {
        replyMessage = `Entendi perfeitamente! Dei um toque justamente por isso — a gente aqui na Pinas ajuda empresas da região estruturando páginas rápidas pensadas pra quem pesquisa no Google no bairro já chamar no WhatsApp na hora.\n\nConsegue 10 a 15 minutinhos no Google Meet essa semana pra eu te mostrar uma prévia rápida sem compromisso?`;
      }
    }

    // Sanitização e formatação de segurança com parágrafos legíveis (\n\n) e sigilo de clientes
    const isAskingAboutPortfolio = /quais\s+clientes|cases|portf[oó]lio|com\s+quem\s+(voc[eê]s?\s+)?trabalha/i.test(text || '');
    if (gemini && typeof gemini.formatHumanWhatsAppMessage === 'function') {
      replyMessage = gemini.formatHumanWhatsAppMessage(replyMessage, { allowClients: isAskingAboutPortfolio });
    } else {
      replyMessage = String(replyMessage)
        .replace(/\[\s*(link\s*(do\s*v[ií]deo)?|v[ií]deo|link)\s*\]/gi, '')
        .replace(/\s*\([^)]*\b(petiva|pink\s*luxo|chay\s*b|bem\s*zanza)\b[^)]*\)/gi, '')
        .replace(/\b(como\s+(a|o)\s+)?(petiva|pink\s*luxo|chay\s*b|bem\s*zanza)\b/gi, 'empresas parceiras')
        .replace(/[^\S\n]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    if (!replyMessage) return false;

    // Simular status "digitando..." por 3 a 4 segundos antes do envio para comportamento 100% humanizado
    try {
      await whatsapp.sendTyping(currentLead.cleanPhone);
      await new Promise(r => setTimeout(r, 3500));
    } catch (tErr) {}

    await whatsapp.sendMessage(currentLead.cleanPhone, replyMessage, { isBot: true });

    currentLead.stage = targetStage;
    currentLead.lastContact = new Date().toISOString();
    if (targetAction === 'mark_meeting') {
      currentLead.status = 'reuniao';
      console.log(`[Auto-Responder AI] 🎉 Reunião com "${currentLead.name}" agendada pelo Gemini!`);
    } else if (targetAction === 'mark_lost') {
      currentLead.status = 'perdido';
      currentLead.manualControl = true;
      currentLead.humanTakeover = true;
      console.log(`[Auto-Responder AI] ⏹️ Resposta educada de despedida enviada e lead "${currentLead.name}" arquivado (IA silenciada).`);
    } else if (targetAction === 'mark_postponed') {
      currentLead.status = 'adiado';
      currentLead.manualControl = true;
      currentLead.humanTakeover = true;
      currentLead.notes = (currentLead.notes ? currentLead.notes + ' | ' : '') + `Lead pediu para retornar depois (IA silenciada para follow-up manual)`;
      console.log(`[Auto-Responder AI] 📅 Lead "${currentLead.name}" pediu para falar em data futura. Status 'adiado' e IA silenciada.`);
    }
    currentLead.stageHistory = currentLead.stageHistory || [];
    currentLead.stageHistory.push({
      stage: targetStage,
      sentAt: new Date().toISOString(),
      auto: true,
      ai: true,
      text: replyMessage
    });

    const toSaveLeads = readJson(LEADS_FILE, []);
    const idx = toSaveLeads.findIndex(l => l.id === currentLead.id);
    if (idx !== -1) {
      toSaveLeads[idx] = { ...toSaveLeads[idx], ...currentLead };
      writeJson(LEADS_FILE, toSaveLeads);
    }

    console.log(`[Auto-Responder] ✅ Resposta (${source}) disparada com sucesso para "${currentLead.name}"!`);
    return true;
  } catch (err) {
    console.error(`[Auto-Responder] Erro ao responder "${lead.name}":`, err.message);
    return false;
  } finally {
    // SEMPRE liberar a trava atômica e atualizar o cooldown ao finalizar
    activeLeadResponses.delete(lead.id);
    leadLastRepliedAt.set(lead.id, Date.now());
  }
}

// Controle de cadência humanizada para respostas de leads pendentes (~5 minutos / 270s entre envios)
let lastCatchupReplyAt = 0;

// Verifica e atende leads quentes minerados com mensagens pendentes (até 30 dias / 720h de histórico)
async function checkAndRespondPendingLeads(maxAgeHours = 720) {
  const leads = readJson(LEADS_FILE, []);
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 3600 * 1000;

  // CADÊNCIA HUMANIZADA DO KAUÊ:
  // Se acabou de responder um lead pendente, aguarda pelo menos 4.5 minutos (~270s) antes do próximo
  if (lastCatchupReplyAt && (now - lastCatchupReplyAt < 270000)) {
    return false;
  }

  for (const lead of leads) {
    if (!lead.cleanPhone) continue;
    if (lead.status === 'perdido' || lead.status === 'arquivado') continue;
    if (lead.manualControl || lead.humanTakeover) continue;
    if (isProtectedBlacklist(lead)) continue;

    // TRAVA ANTI-DUPLICAÇÃO 1: Se o lead já está agendado na fila em tempo real, NÃO interceptar via catchup!
    if (autoResponderQueue.has(lead.id)) continue;

    // TRAVA ANTI-DUPLICAÇÃO 2: Se já está em geração ativa agora, NÃO rodar em paralelo!
    if (activeLeadResponses.has(lead.id)) continue;

    // TRAVA ANTI-DUPLICAÇÃO 3: Cooldown recente (< 90 segundos)
    if (leadLastRepliedAt.has(lead.id) && (now - leadLastRepliedAt.get(lead.id) < 90000)) continue;

    const chatHistory = conversationGuard.findMessagesForLead(lead, whatsapp.store) || [];
    const validMsgs = chatHistory.filter(m => (m.text || m.type === 'audio' || m.type === 'image') && !m.text?.startsWith('[Sistema]'));
    if (validMsgs.length === 0) continue;

    const outboundMsgs = validMsgs.filter(m => m.fromMe);
    // REGRA DE OURO DO KAUÊ: Se o Kauê mandou áudio ou mensagem manual neste chat, NUNCA responder pela IA!
    const hasKauAudio = outboundMsgs.some(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));
    const hasKauManual = outboundMsgs.some(m => m.isBot === false);
    if (hasKauAudio || hasKauManual) {
      if (!lead.manualControl || !lead.humanTakeover) {
        lead.manualControl = true;
        lead.humanTakeover = true;
        lead.notes = (lead.notes ? lead.notes + ' | ' : '') + 'Intervenção manual do Kauê detectada no histórico (IA silenciada)';
        const toSaveLeads = readJson(LEADS_FILE, []);
        const idx = toSaveLeads.findIndex(l => l.id === lead.id);
        if (idx !== -1) {
          toSaveLeads[idx] = { ...toSaveLeads[idx], ...lead };
          writeJson(LEADS_FILE, toSaveLeads);
        }
      }
      continue;
    }

    const lastMsg = validMsgs[validMsgs.length - 1];
    if (!lastMsg.fromMe) {
      const ageMs = now - lastMsg.timestamp;

      // Se for áudio pendente, não tentar interpretar com IA: passar pro Kauê e notificar
      if (lastMsg.type === 'audio' || (lastMsg.text && lastMsg.text.includes('[Áudio de voz]'))) {
        lead.manualControl = true;
        lead.humanTakeover = true;
        lead.notes = (lead.notes ? lead.notes + ' | ' : '') + 'Áudio pendente recebido — Kauê notificado';
        const toSaveLeads = readJson(LEADS_FILE, []);
        const idx = toSaveLeads.findIndex(l => l.id === lead.id);
        if (idx !== -1) {
          toSaveLeads[idx] = { ...toSaveLeads[idx], ...lead };
          writeJson(LEADS_FILE, toSaveLeads);
        }
        const cleanDigits = String(lead.cleanPhone).replace(/\D/g, '');
        const waLink = `https://wa.me/${cleanDigits}`;
        try {
          await whatsapp.sendAlertToSelf(`🎧 *ÁUDIO DE LEAD PENDENTE!*\n\n*Lead:* ${lead.name}\n*Nicho:* ${lead.niche || 'Geral'}\n*Telefone:* ${lead.phone || cleanDigits}\n\n👉 *Toque para responder:* ${waLink}`);
        } catch (e) {}
        continue;
      }

      // Se for resposta automática de WhatsApp Business (secretária eletrônica / menu)
      if (isAutomatedBusinessGreeting(lastMsg.text)) {
        continue;
      }

      // Se a mensagem do cliente chegou há menos de 25 segundos, o listener em tempo real
      // já está cuidando com digitação humanizada. Pular para nunca disparar duas vezes!
      if (ageMs < 25000) continue;

      if (ageMs <= maxAgeMs) {
        // Validação estrita via conversationGuard
        const safety = conversationGuard.canSendMessageToLead(lead, whatsapp.store);
        if (!safety.allowed) continue;

        const targetJid = (lead.cleanPhone.startsWith('55') ? lead.cleanPhone : '55' + lead.cleanPhone) + '@s.whatsapp.net';
        console.log(`[Pending Leads Catch-up] 🔔 Lead quente encontrado aguardando resposta: "${lead.name}" (${(ageMs / 3600000).toFixed(1)}h atrás). Disparando IA...`);
        const handled = await executeLeadResponse(lead, lastMsg.text, targetJid, 'catchup');
        if (handled) {
          lastCatchupReplyAt = Date.now();
          return true; // Atendeu 1 lead quente, aguarda próximo ciclo
        }
      }
    }
  }
  return false;
}

function initAutoResponder() {
  if (!whatsapp.events) return;

  whatsapp.events.on('message.received', async ({ jid, phone, text, msgId, timestamp, type, mediaUrl }) => {
    if (!phone || (!text && type !== 'audio')) return;

    // SEGURANÇA MÁXIMA 0: Deduplicação de msgId (evita disparar 2 vezes a mesma mensagem)
    if (msgId) {
      if (processedIncomingMsgIds.has(msgId)) {
        return;
      }
      processedIncomingMsgIds.add(msgId);
      if (processedIncomingMsgIds.size > 2000) {
        const firstKey = processedIncomingMsgIds.keys().next().value;
        processedIncomingMsgIds.delete(firstKey);
      }
    }

    // SEGURANÇA MÁXIMA 1: NUNCA responder mensagens excessivamente antigas (mais de 30 dias / 720 horas de idade)
    if (timestamp) {
      const ageHours = (Date.now() - timestamp) / (1000 * 3600);
      if (ageHours > 720) {
        return;
      }
    }

    // SEGURANÇA MÁXIMA 2: NUNCA processar grupos do WhatsApp
    if (jid && (jid.endsWith('@g.us') || jid.includes('-'))) return;

    const cleanDigits = String(phone).replace(/\D/g, '');

    // SEGURANÇA MÁXIMA 3: NUNCA responder contatos pessoais, amigos, família ou números desconhecidos
    // O sistema SÓ processa contatos que existirem explicitamente cadastrados como leads minerados na base
    const leads = readJson(LEADS_FILE, []);
    const lead = findLeadByPhone(leads, cleanDigits);

    if (!lead) {
      // Contato pessoal / amigo / família que NÃO é um lead minerado: IGNORADO 100%
      return;
    }

    // SEGURANÇA MÁXIMA 3.1 (HUMAN TAKEOVER): Se o Kauê já assumiu o atendimento manual deste lead, IA 100% SILENCIADA!
    if (lead.manualControl || lead.humanTakeover) {
      console.log(`[Auto-Responder] 👤 Lead "${lead.name}" está em atendimento manual pelo Kauê. IA desativada.`);
      return;
    }

    // SEGURANÇA MÁXIMA 3.15 (ÁUDIO RECEBIDO DE LEAD):
    // Se o lead enviou uma mensagem de áudio:
    // 1. A IA NÃO tenta interpretar nem finge ouvir.
    // 2. Manda apenas uma mensagem curta e educada: "Opa! Só um minutinho que já ouço aqui e te respondo!"
    // 3. Marca humanTakeover: true e manualControl: true para a IA sair da conversa.
    // 4. Dispara alerta com link direto no WhatsApp do próprio Kauê (https://wa.me/{numero})
    const isAudio = (type === 'audio') || 
                    (text && (text.includes('[Áudio de voz]') || text.includes('[Audio]'))) ||
                    (mediaUrl && mediaUrl.includes('audio_'));

    if (isAudio) {
      console.log(`[Auto-Responder] 🎧 ÁUDIO RECEBIDO do lead "${lead.name}" (${cleanDigits})!`);

      // Cancelar qualquer timer pendente desse lead na fila
      if (autoResponderQueue.has(lead.id)) {
        clearTimeout(autoResponderQueue.get(lead.id));
        autoResponderQueue.delete(lead.id);
      }

      // Enviar resposta curta e acolhedora
      const audioAck = "Opa! Só um minutinho que já ouço aqui e te respondo!";
      try {
        await whatsapp.sendTyping(lead.cleanPhone);
        await new Promise(r => setTimeout(r, 2000));
        await whatsapp.sendMessage(lead.cleanPhone, audioAck, { isBot: true });
        console.log(`[Auto-Responder] Resposta de confirmação de áudio enviada para "${lead.name}".`);
      } catch (sendErr) {
        console.warn(`[Auto-Responder] Erro ao enviar confirmação de áudio para "${lead.name}":`, sendErr.message);
      }

      // Ativar Human Takeover imediato (IA 100% pausada para esse lead)
      lead.manualControl = true;
      lead.humanTakeover = true;
      lead.lastAudioReceivedAt = new Date().toISOString();
      const audioNote = 'Áudio recebido do lead — Kauê notificado para responder no manual';
      lead.notes = lead.notes ? `${lead.notes} | ${audioNote}` : audioNote;

      const toSaveLeads = readJson(LEADS_FILE, []);
      const lIdx = toSaveLeads.findIndex(l => l.id === lead.id);
      if (lIdx !== -1) {
        toSaveLeads[lIdx] = { ...toSaveLeads[lIdx], ...lead };
        writeJson(LEADS_FILE, toSaveLeads);
      }

      // Disparar notificação imediata para o WhatsApp do Kauê
      try {
        const waLink = `https://wa.me/${cleanDigits}`;
        const alertText = `🎧 *ÁUDIO RECEBIDO DE LEAD!*\n\n*Lead:* ${lead.name}\n*Nicho:* ${lead.niche || 'Geral'} (${lead.neighborhood || lead.city || 'SP'})\n*Telefone:* ${lead.phone || cleanDigits}\n\n👉 *Toque aqui para abrir a conversa no WhatsApp:*\n${waLink}\n\n_(A IA avisou que você já vai ouvir e pausou para você atender no manual!)_`;

        await whatsapp.sendAlertToSelf(alertText);
        console.log(`[Auto-Responder] 📲 Notificação com link wa.me disparada para o WhatsApp do Kauê!`);
      } catch (alertErr) {
        console.warn('[Auto-Responder] Falha ao enviar alerta de áudio para o Kauê:', alertErr.message);
      }

      return; // Interrompe na hora — nunca chama o Gemini
    }

    // SEGURANÇA MÁXIMA 3.2: Se a mensagem recebida for uma resposta automática de WhatsApp Business (secretária eletrônica)
    if (isAutomatedBusinessGreeting(text)) {
      console.log(`[Auto-Responder] 🤖 Detectada resposta automática de WhatsApp Business para "${lead.name}". Aguardando atendimento humano da empresa.`);
      return;
    }

    // TRAVA ANTI-DUPLICAÇÃO: Se o lead já está sendo respondido agora, não enfileirar duplicata
    if (activeLeadResponses.has(lead.id)) {
      console.log(`[Auto-Responder] Resposta ativa em andamento para "${lead.name}". Ignorando agendamento duplicado.`);
      return;
    }

    // Se respondemos a este lead há menos de 60s e a última mensagem foi nossa, não agendar
    if (leadLastRepliedAt.has(lead.id) && (Date.now() - leadLastRepliedAt.get(lead.id) < 60000)) {
      const targetJid = lead.cleanPhone + '@s.whatsapp.net';
      const history = whatsapp.store.getMessages(targetJid) || [];
      const valid = history.filter(m => m.text && !m.text.startsWith('[Sistema]'));
      if (valid.length > 0 && valid[valid.length - 1].fromMe) {
        return;
      }
    }

    // Debounce inteligente: se o lead enviar mensagens consecutivas rápidas, aguarda ele terminar de digitar
    if (autoResponderQueue.has(lead.id)) {
      clearTimeout(autoResponderQueue.get(lead.id));
      autoResponderQueue.delete(lead.id);
    }

    const stepData = readJson(STEP_TEMPLATES_FILE, { settings: {}, stages: [] });
    const settings = stepData.settings || {};
    const delaySec = Math.max(12, settings.responseDelaySeconds || 16);
    const jitter = Math.floor(Math.random() * 5);
    const totalDelayMs = (delaySec + jitter) * 1000;

    const timerId = setTimeout(async () => {
      autoResponderQueue.delete(lead.id);
      await executeLeadResponse(lead, text, jid, 'realtime');
    }, totalDelayMs);

    autoResponderQueue.set(lead.id, timerId);
  });

  // OUVINTE DE INTERVENÇÃO MANUAL DO KAUÊ (HUMAN TAKEOVER AUTOMÁTICO):
  // Quando o Kauê envia uma mensagem manual pelo celular ou WhatsApp Web, a IA cede o controle na hora!
  whatsapp.events.on('message.sent_manual', async ({ jid, phone, text, type, timestamp }) => {
    try {
      const cleanDigits = String(phone || '').replace(/\D/g, '');
      const leads = readJson(LEADS_FILE, []);
      const lead = findLeadByPhone(leads, cleanDigits);

      if (lead) {
        // 1. Cancelar imediatamente qualquer timer pendente no auto-responder
        if (autoResponderQueue.has(lead.id)) {
          clearTimeout(autoResponderQueue.get(lead.id));
          autoResponderQueue.delete(lead.id);
          console.log(`[Human Takeover] 🛑 Timer de resposta da IA cancelado imediatamente para "${lead.name}".`);
        }

        // 2. Marcar controle manual definitivo do Kauê
        lead.manualControl = true;
        lead.humanTakeover = true;
        lead.lastManualMessageAt = new Date(timestamp || Date.now()).toISOString();
        if (!lead.notes || !lead.notes.includes('Atendimento manual do Kauê')) {
          lead.notes = (lead.notes ? lead.notes + ' | ' : '') + 'Atendimento manual do Kauê (IA desativada)';
        }

        writeJson(LEADS_FILE, leads);
        console.log(`[Human Takeover] 👤 Kauê interagiu com "${lead.name}". Controle manual ativado e IA silenciada!`);
      }
    } catch (err) {
      console.warn('[Human Takeover] Erro ao registrar intervenção manual:', err.message);
    }
  });
}

// Exportar CSV
app.get('/api/export', (req, res) => {
  const leads = readJson(LEADS_FILE, []);
  const headers = ['Nome', 'Nicho', 'Telefone', 'WhatsApp', 'Tem Site', 'Site', 'Avaliação', 'Total Avaliações', 'Bairro', 'Status', 'Data Cadastro'];
  
  const rows = leads.map(l => [
    `"${(l.name || '').replace(/"/g, '""')}"`,
    `"${(l.niche || '').replace(/"/g, '""')}"`,
    `"${l.phone || ''}"`,
    l.hasMobile ? 'Sim (Celular)' : 'Fixo/Não identificado',
    l.hasWebsite ? 'Sim' : 'Não (Oportunidade)',
    `"${l.website || ''}"`,
    l.rating || '',
    l.reviews || 0,
    `"${(l.neighborhood || '').replace(/"/g, '""')}"`,
    l.status || 'novo',
    l.createdAt ? l.createdAt.split('T')[0] : ''
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-pinas.csv"');
  res.send('\uFEFF' + csv); // BOM para abrir perfeitamente no Excel brasileiro
});

// ==================== ROTAS DE IA (GOOGLE GEMINI) ====================

// Status da IA (verificar se API Key está ativa)
app.get('/api/gemini/status', (req, res) => {
  res.json({
    configured: gemini.isConfigured(),
    model: 'gemini-2.5-flash',
    provider: 'Google AI Studio'
  });
});

// Analisar Lead (Diagnóstico comercial de gargalos e oportunidades)
app.post('/api/gemini/analyze-lead', async (req, res) => {
  const { leadId, leadData } = req.body;
  const leads = readJson(LEADS_FILE, []);
  let targetLead = leadData;

  if (leadId) {
    targetLead = leads.find(l => l.id === leadId);
  }

  if (!targetLead) {
    return res.status(404).json({ error: 'Lead não encontrado para análise.' });
  }

  if (isProtectedBlacklist(targetLead)) {
    return res.status(403).json({ error: 'Lead protegido por blacklist de segurança.' });
  }

  try {
    const analysis = await gemini.analyzeLead(targetLead);

    // Se temos o lead na base, cacheia o diagnóstico nele
    if (leadId) {
      targetLead.aiAnalysis = analysis;
      targetLead.aiAnalyzedAt = new Date().toISOString();
      writeJson(LEADS_FILE, leads);
    }

    res.json({ success: true, analysis, lead: targetLead });
  } catch (err) {
    console.error('[Gemini Analyze Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Gerar Abordagens Personalizadas para WhatsApp na voz do Kauê
app.post('/api/gemini/generate-pitches', async (req, res) => {
  const { leadId, leadData, guidance } = req.body;
  const leads = readJson(LEADS_FILE, []);
  let targetLead = leadData;

  if (leadId) {
    targetLead = leads.find(l => l.id === leadId);
  }

  if (!targetLead) {
    return res.status(404).json({ error: 'Lead não encontrado para geração de abordagem.' });
  }

  if (isProtectedBlacklist(targetLead)) {
    return res.status(403).json({ error: 'Lead protegido por blacklist de segurança.' });
  }

  try {
    const result = await gemini.generatePitches(targetLead, guidance);
    res.json({ success: true, pitches: result.pitches, lead: targetLead });
  } catch (err) {
    console.error('[Gemini Pitches Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sugerir resposta para o chat da Central de Conversas (WhatsApp)
app.post('/api/gemini/suggest-reply', async (req, res) => {
  const { jid, leadId, lastIncomingMessage } = req.body;
  let lead = null;

  if (leadId) {
    const leads = readJson(LEADS_FILE, []);
    lead = leads.find(l => l.id === leadId);
  } else if (jid) {
    const leads = readJson(LEADS_FILE, []);
    const cleanDigits = jid.split('@')[0];
    lead = findLeadByPhone(leads, cleanDigits);
  }

  let messages = [];
  if (jid) {
    messages = whatsapp.store.getMessages(jid) || [];
  }

  try {
    const result = await gemini.suggestChatReply({
      lead: lead || { name: 'Cliente' },
      messages,
      lastIncomingMessage
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Gemini Suggest Reply Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Gerar abordagem autônoma ultra personalizada baseada na auditoria real (Site & Google Maps)
app.post('/api/gemini/autonomous-pitch', async (req, res) => {
  const { leadId, lead, audit } = req.body;
  let targetLead = lead;

  if (!targetLead && leadId) {
    const leads = readJson(LEADS_FILE, []);
    targetLead = leads.find(l => l.id === leadId);
  }

  if (!targetLead) {
    return res.status(404).json({ error: 'Lead não encontrado.' });
  }

  try {
    let leadAudit = audit;
    if (!leadAudit) {
      leadAudit = await auditor.auditLeadFull(targetLead);
    }
    const pitch = await gemini.generateAutonomousPitch({ lead: targetLead, audit: leadAudit });
    res.json({ success: true, pitch, audit: leadAudit });
  } catch (err) {
    console.error('[Gemini Autonomous Pitch Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ROTAS DE PILOTO AUTOMÁTICO 100% AUTÔNOMO ====================

// Status do Piloto Automático e Cota Gemini Free Tier
app.get('/api/autopilot/status', (req, res) => {
  res.json(autopilot.getStatus());
});

// Iniciar Piloto Automático
app.post('/api/autopilot/start', (req, res) => {
  const result = autopilot.start();
  res.json(result);
});

// Pausar Piloto Automático
app.post('/api/autopilot/stop', (req, res) => {
  const result = autopilot.stop();
  res.json(result);
});

// Encerrar Servidor do Prospector por completo
app.post('/api/server/shutdown', (req, res) => {
  try {
    autopilot.stop();
  } catch (e) {}
  res.json({ success: true, message: 'Servidor encerrando em 1 segundo...' });
  setTimeout(() => {
    console.log('[Servidor] Encerrado com sucesso a pedido do operador.');
    process.exit(0);
  }, 800);
});

// Configuração do Modo 24/7 Autônomo e limites do Piloto Automático
app.post('/api/autopilot/config', (req, res) => {
  const { autoStartAutopilot, dailyLimit, outboundStartHour, outboundEndHour, outboundDays, minDelaySeconds, maxDelaySeconds, onlyRespondReplies } = req.body;
  const config = readJson(CONFIG_FILE, {});
  if (typeof onlyRespondReplies === 'boolean') {
    config.onlyRespondReplies = onlyRespondReplies;
    config.disableNewLeadOutbound = onlyRespondReplies;
  }
  if (typeof autoStartAutopilot === 'boolean') {
    config.autoStartAutopilot = autoStartAutopilot;
  }
  if (typeof dailyLimit === 'number' && dailyLimit > 0) {
    config.dailyLimit = dailyLimit;
  }
  if (typeof outboundStartHour === 'number' && outboundStartHour >= 0 && outboundStartHour <= 23) {
    config.outboundStartHour = outboundStartHour;
  }
  if (typeof outboundEndHour === 'number' && outboundEndHour >= 0 && outboundEndHour <= 23) {
    config.outboundEndHour = outboundEndHour;
  }
  if (Array.isArray(outboundDays)) {
    config.outboundDays = outboundDays.map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 6);
  }
  if (typeof minDelaySeconds === 'number' && minDelaySeconds > 0) {
    config.minDelaySeconds = minDelaySeconds;
  }
  if (typeof maxDelaySeconds === 'number' && maxDelaySeconds > 0) {
    config.maxDelaySeconds = maxDelaySeconds;
  }
  writeJson(CONFIG_FILE, config);

  if (autoStartAutopilot && !autopilot.isActive && whatsapp.getStatus().connected) {
    autopilot.start();
  }

  res.json({ success: true, config });
});

// Alternar envio exclusivo para novos leads (Modo Apenas Respostas vs Envio Ativo)
app.post('/api/autopilot/toggle-new-leads', (req, res) => {
  const config = readJson(CONFIG_FILE, {});
  const current = !!(config.onlyRespondReplies || config.disableNewLeadOutbound);
  const nextState = (req.body && typeof req.body.onlyRespondReplies === 'boolean')
    ? req.body.onlyRespondReplies
    : !current;

  config.onlyRespondReplies = nextState;
  config.disableNewLeadOutbound = nextState;
  writeJson(CONFIG_FILE, config);

  console.log(`[Piloto Automático] 🔄 Envio para novos leads ${nextState ? 'PAUSADO (Modo Apenas Respostas Ativo 24/7)' : 'RETOMADO (Disparos Ativos)'}.`);

  res.json({
    success: true,
    onlyRespondReplies: nextState,
    disableNewLeadOutbound: nextState,
    message: nextState
      ? 'Disparo para novos leads pausado! A IA continua respondendo 24/7 a quem responder.'
      : 'Envio de mensagens para novos leads retomado com sucesso!'
  });
});

// Auditoria sob demanda de um lead (Site + Maps)
app.post('/api/leads/:id/audit', async (req, res) => {
  const { id } = req.params;
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);

  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado.' });
  }

  try {
    const auditResult = await auditor.auditLeadFull(lead);
    lead.siteAudit = auditResult.site;
    lead.mapsAudit = auditResult.maps;

    // Recalcular Lead Scoring com os dados frescos
    const newScore = auditor.calculateLeadScore(lead, auditResult.site, auditResult.maps, lead.metaAds || {});
    lead.priorityScore = newScore.score;
    lead.tier = newScore.tier;
    lead.opportunity = {
      score: auditResult.site?.opportunityScore || lead.score || 5,
      numericRank: newScore.score,
      type: newScore.tier,
      label: newScore.tierLabel,
      attackAngle: newScore.attackAngle
    };

    writeJson(LEADS_FILE, leads);

    res.json({ success: true, audit: auditResult, score: newScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checagem Autônoma de Anúncios na Meta Ads Library (@pinas.studio)
app.post('/api/leads/:id/check-meta-ads', async (req, res) => {
  const { id } = req.params;
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);

  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado.' });
  }

  try {
    console.log(`[Meta Ads Library] 🔍 Checando anúncios ativos autonomamente para "${lead.name}"...`);
    const metaResult = await auditor.checkMetaAdsLibrary(lead.name, lead.website);

    lead.metaAds = metaResult;

    // Recalcular Lead Score considerando a presença de anúncios ativos
    const newScore = auditor.calculateLeadScore(lead, lead.siteAudit || {}, lead.mapsAudit || {}, metaResult);
    lead.priorityScore = newScore.score;
    lead.tier = newScore.tier;
    lead.opportunity = {
      ...(lead.opportunity || {}),
      numericRank: newScore.score,
      type: newScore.tier,
      label: newScore.tierLabel,
      attackAngle: newScore.attackAngle
    };

    writeJson(LEADS_FILE, leads);
    console.log(`[Meta Ads Library] ✅ Concluído para "${lead.name}": ${metaResult.hasActiveAds ? metaResult.adCountText : 'Sem anúncios'} (Score: ${newScore.score} pts)`);

    res.json({
      success: true,
      metaAds: metaResult,
      score: newScore,
      lead
    });
  } catch (err) {
    console.error('[Meta Ads Library] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Recalcular Lead Scoring de 0 a 100 para toda a base existente
app.post('/api/leads/score-all', (req, res) => {
  try {
    const leads = readJson(LEADS_FILE, []);
    let diamantes = 0;
    let ouros = 0;
    let pratas = 0;

    for (const lead of leads) {
      const scoreResult = auditor.calculateLeadScore(lead, lead.siteAudit || {}, lead.mapsAudit || {}, lead.metaAds || {});
      lead.priorityScore = scoreResult.score;
      lead.tier = scoreResult.tier;
      lead.opportunity = {
        ...(lead.opportunity || {}),
        numericRank: scoreResult.score,
        type: scoreResult.tier,
        label: scoreResult.tierLabel,
        attackAngle: scoreResult.attackAngle
      };

      if (scoreResult.tier === 'diamante') diamantes++;
      else if (scoreResult.tier === 'ouro') ouros++;
      else pratas++;
    }

    // Ordenar a base: leads respondidos/reunião primeiro, depois novos por prioridade decrescente
    leads.sort((a, b) => {
      const statusPriority = { reuniao: 4, proposta: 3, respondeu: 2, contatado: 1, novo: 0, perdido: -1, arquivado: -2 };
      const pA = statusPriority[a.status] || 0;
      const pB = statusPriority[b.status] || 0;
      if (pA !== pB) return pB - pA;
      return (b.priorityScore || 0) - (a.priorityScore || 0);
    });

    writeJson(LEADS_FILE, leads);
    console.log(`[Lead Scoring] 🏆 100% da base ranqueada: ${diamantes} Diamantes | ${ouros} Ouros | ${pratas} Pratas`);

    res.json({
      success: true,
      total: leads.length,
      diamantes,
      ouros,
      pratas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auditoria Visual Profunda Seção por Seção e Roteiro Estratégico de Call (15 min)
app.post('/api/leads/:id/deep-audit', async (req, res) => {
  const { id } = req.params;
  const { forceRefresh } = req.body || {};
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);

  if (!lead) {
    return res.status(404).json({ error: 'Lead não encontrado.' });
  }

  try {
    // 1. Executa ou reutiliza auditoria técnica do site e maps
    let siteAudit = lead.siteAudit;
    let mapsAudit = lead.mapsAudit;

    if (!siteAudit || !mapsAudit || forceRefresh) {
      const fullAudit = await auditor.auditLeadFull(lead);
      siteAudit = fullAudit.site;
      mapsAudit = fullAudit.maps;
      lead.siteAudit = siteAudit;
      lead.mapsAudit = mapsAudit;
    }

    // 2. Chama o Gemini para analisar sessão por sessão e montar roteiro completo
    console.log(`[Deep Audit] 🔍 Gerando auditoria visual e roteiro de call para "${lead.name}"...`);
    const deepResult = await gemini.generateDeepVisualAuditAndCallScript({
      lead,
      siteAudit,
      mapsAudit
    });

    lead.deepVisualAudit = deepResult.visualAudit;
    lead.callScript = deepResult.callScript;
    lead.deepAuditGeneratedAt = new Date().toISOString();
    writeJson(LEADS_FILE, leads);

    console.log(`[Deep Audit] ✅ Auditoria e roteiro gerados com sucesso para "${lead.name}"!`);
    res.json({
      success: true,
      lead,
      visualAudit: lead.deepVisualAudit,
      callScript: lead.callScript
    });
  } catch (err) {
    console.error('[Deep Audit Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Status detalhado do Gemini Free Tier (Zero Custo Garantido)
app.get('/api/gemini/free-tier', (req, res) => {
  res.json(geminiGuard.getFreeTierStatus());
});

// Obter roteiro da conversa salvo
app.get('/api/leads/:id/conversation-script', (req, res) => {
  const { id } = req.params;
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  res.json({
    leadId: lead.id,
    leadName: lead.name,
    conversationScript: lead.conversationScript || null,
    generatedAt: lead.conversationScriptGeneratedAt || null
  });
});

// Gerar ou atualizar Roteiro Estratégico baseado no resumo da conversa do WhatsApp
app.post('/api/leads/:id/conversation-script', async (req, res) => {
  const { id } = req.params;
  const { forceRefresh = false } = req.body;
  const leads = readJson(LEADS_FILE, []);
  const lead = leads.find(l => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  // Se já existir e não foi forçado atualização
  if (lead.conversationScript && !forceRefresh) {
    return res.json({
      success: true,
      lead,
      conversationScript: lead.conversationScript,
      cached: true
    });
  }

  try {
    // 1. Obter histórico real de mensagens do WhatsApp
    const messages = conversationGuard.findMessagesForLead(lead, whatsapp.store);

    console.log(`[Conversation Script] 🧠 Analisando ${messages.length} mensagens do WhatsApp para "${lead.name}"...`);

    // 2. Chamar o Gemini para analisar o chat e gerar resumo + roteiro
    const scriptResult = await gemini.generateWhatsAppConversationScript({
      lead,
      messages
    });

    lead.conversationScript = scriptResult;
    lead.conversationScriptGeneratedAt = new Date().toISOString();
    writeJson(LEADS_FILE, leads);

    console.log(`[Conversation Script] ✅ Roteiro baseado na conversa gerado com sucesso para "${lead.name}"!`);
    res.json({
      success: true,
      lead,
      conversationScript: lead.conversationScript,
      messageCount: messages.length
    });
  } catch (err) {
    console.error('[Conversation Script Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 PINAS PROSPECTOR RODANDO NA PORTA ${PORT}`);
  console.log(`👉 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`===============================================`);

  // Iniciar ouvinte do Auto-Responder
  initAutoResponder();
  autopilot.setPendingRepliesChecker(checkAndRespondPendingLeads);

  // Executar reconciliação inicial de consistência de leads
  try {
    conversationGuard.reconcileLeadsDatabase(whatsapp.store);
  } catch (recErr) {
    console.warn('[Startup] Aviso na reconciliação de leads:', recErr.message);
  }

  // Reconciliar leads com intervenção manual prévia do Kauê (áudios ou mensagens manuais)
  try {
    const leads = readJson(LEADS_FILE, []);
    let updated = 0;
    for (const lead of leads) {
      if (lead.manualControl || lead.humanTakeover) continue;
      const messages = conversationGuard.findMessagesForLead(lead, whatsapp.store);
      const hasAudio = messages.some(m => m.fromMe && m.type === 'audio');
      const hasManual = messages.some(m => m.fromMe && m.isBot === false);
      if (hasAudio || hasManual) {
        lead.manualControl = true;
        lead.humanTakeover = true;
        if (!lead.notes || !lead.notes.includes('Atendimento manual do Kauê')) {
          lead.notes = (lead.notes ? lead.notes + ' | ' : '') + 'Atendimento manual do Kauê (IA desativada)';
        }
        updated++;
      }
    }
    if (updated > 0) {
      writeJson(LEADS_FILE, leads);
      console.log(`[Human Takeover] 🛡️ ${updated} leads com conversas manuais do Kauê foram blindados contra automações.`);
    }
  } catch (mErr) {
    console.warn('[Human Takeover] Aviso na reconciliação de chats manuais:', mErr.message);
  }

  // Ouvinte de conexão do WhatsApp para Auto-Start do Piloto Automático e Atendimento de Leads Pendentes
  if (whatsapp.events) {
    whatsapp.events.on('connected', async () => {
      autopilot.handleWhatsAppConnected();
      try {
        await checkAndRespondPendingLeads(720);
      } catch (pendErr) {
        console.warn('[Startup] Erro ao checar leads pendentes:', pendErr.message);
      }
    });
  }

  // Inicialização 100% autônoma do WhatsApp no boot:
  // Se houver sessão salva, restaura silenciosamente em 2 segundos.
  // Se não houver, já inicia o socket e gera na hora o QR Code pronto para pareamento!
  console.log('[WhatsApp] Inicializando serviço do WhatsApp...');
  whatsapp.initWhatsApp().then(async () => {
    if (whatsapp.getStatus().connected) {
      autopilot.handleWhatsAppConnected();
      try {
        await checkAndRespondPendingLeads(720);
      } catch (pendErr) {
        console.warn('[Startup] Erro ao checar leads pendentes:', pendErr.message);
      }
    }
  }).catch(err => {
    console.warn('[WhatsApp] Erro na inicialização automática:', err.message);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[AVISO] A porta ${PORT} ja esta sendo usada por outra instancia do Prospector.`);
    console.error(`O sistema ja esta ativo em segundo plano! Acesse: http://localhost:${PORT}\n`);
  } else {
    console.error('[ERRO DO SERVIDOR]', err);
  }
});


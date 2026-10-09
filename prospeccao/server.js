// Prevenir que desconexões de socket ou erros assíncronos derrubem o servidor
process.on('uncaughtException', (err) => {
  console.error('[Servidor Aviso] Erro não capturado (mantendo servidor ativo):', err.message || err);
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
    const status = await whatsapp.initWhatsApp(true);
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
  const lead = leadId ? leads.find(l => l.id === leadId) : null;
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

// Enviar mensagem de texto no chat direto
app.post('/api/whatsapp/send-chat', async (req, res) => {
  const { jid, text } = req.body;
  if (!jid || !text) {
    return res.status(400).json({ error: 'JID e texto são obrigatórios.' });
  }
  try {
    const result = await whatsapp.sendMessage(jid, text);
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

  const { niche, location, maxResults = 25, onlyMobile = false, filterDuplicates = true } = req.body;

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

function initAutoResponder() {
  if (!whatsapp.events) return;

  whatsapp.events.on('message.received', async ({ jid, phone, text, msgId, timestamp }) => {
    if (!phone || !text) return;

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

    // SEGURANÇA MÁXIMA 1: NUNCA responder mensagens com mais de 2 minutos de idade (histórico ou sincronização)
    if (timestamp) {
      const ageSeconds = (Date.now() - timestamp) / 1000;
      if (ageSeconds > 120) {
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

    // SEGURANÇA MÁXIMA 4: NUNCA responder clientes ativos da Pinas ou região do Brás
    if (isProtectedBlacklist(lead)) {
      console.log(`[Auto-Responder] Lead protegido "${lead.name}" ignorado por blacklist de segurança.`);
      return;
    }

    // SEGURANÇA MÁXIMA 5: NUNCA responder leads já arquivados ou marcados como perdidos
    if (lead.status === 'perdido' || lead.status === 'arquivado') {
      return;
    }

    // SEGURANÇA MÁXIMA 6: Se o ÚLTIMO remetente na conversa já foi o Kauê (nós), NUNCA responder novamente!
    const targetJid = jid || (cleanDigits + '@s.whatsapp.net');
    const chatHistory = whatsapp.store.getMessages(targetJid) || [];
    if (chatHistory.length > 0) {
      const textMsgs = chatHistory.filter(m => m.text && !m.text.startsWith('[Sistema]'));
      if (textMsgs.length > 0) {
        const lastMsg = textMsgs[textMsgs.length - 1];
        if (lastMsg.fromMe) {
          return;
        }
      }
    }

    // SEGURANÇA MÁXIMA 7: Cooldown por lead (evita mensagens duplicadas num intervalo menor que 60 segundos)
    const now = Date.now();
    if (leadLastRepliedAt.has(lead.id) && (now - leadLastRepliedAt.get(lead.id) < 60000)) {
      return;
    }

    // Atualiza status do lead para "respondeu" (mantendo "reuniao" caso já tenha sido agendada)
    if (lead.status !== 'reuniao') {
      lead.status = 'respondeu';
    }
    lead.repliedAt = new Date().toISOString();
    writeJson(LEADS_FILE, leads);

    const stepData = readJson(STEP_TEMPLATES_FILE, { settings: {}, stages: [] });
    const settings = stepData.settings || {};

    if (settings.autoResponderEnabled === false) {
      console.log(`[Auto-Responder] Lead "${lead.name}" respondeu, mas automação de resposta de etapas está pausada.`);
      return;
    }

    // Verificar intenção (recusa explícita e categórica)
    const intent = classifyLeadResponse(text);
    if (intent === 'negative') {
      console.log(`[Auto-Responder] Lead "${lead.name}" enviou recusa explícita: "${text}". Marcando como perdido.`);
      lead.status = 'perdido';
      lead.notes = (lead.notes ? lead.notes + ' | ' : '') + `Recusou: "${text}"`;
      writeJson(LEADS_FILE, leads);
      return;
    }

    const isAiChatActive = (gemini.isConfigured() && settings.useGeminiConversationalAi !== false);
    const currentStage = lead.stage || 1;

    // Se NÃO for IA conversacional (for apenas template fixo) e atingir o limite de etapas de template
    if (!isAiChatActive) {
      // Verificar intenção para templates fixos
      const intent = classifyLeadResponse(text);
      if (intent === 'negative') {
        console.log(`[Auto-Responder] Lead "${lead.name}" enviou recusa explícita: "${text}". Marcando como perdido.`);
        lead.status = 'perdido';
        lead.notes = (lead.notes ? lead.notes + ' | ' : '') + `Recusou: "${text}"`;
        writeJson(LEADS_FILE, leads);
        return;
      }
      if (currentStage >= (settings.maxAutoStage || 3) && lead.status !== 'reuniao') {
        console.log(`[Auto-Responder] ℹ️ Lead "${lead.name}" atingiu o limite de templates manuais. Mantendo para atendimento.`);
        return;
      }
    }

    // REGRA DE OURO (24/7): Quando a IA do Gemini está ativa, ela NUNCA para de responder!
    // Toda vez que o lead mandar mensagem, a IA responde com paciência, construindo confiança e sem limite de turnos.
    let targetStage = currentStage + 1;
    let combineWithNext = (currentStage === 1 && settings.combineStages2and3);

    // Debounce inteligente: se o lead enviar mensagens consecutivas rápidas, aguarda ele terminar de digitar
    if (autoResponderQueue.has(lead.id)) {
      clearTimeout(autoResponderQueue.get(lead.id));
      autoResponderQueue.delete(lead.id);
    }

    console.log(`[Auto-Responder 24/7] 🎯 Lead minerado "${lead.name}" mandou mensagem: "${text}". IA preparando resposta...`);

    const delaySec = Math.max(10, settings.responseDelaySeconds || 16);
    const jitter = Math.floor(Math.random() * 6);
    const totalDelayMs = (delaySec + jitter) * 1000;

    const timerId = setTimeout(async () => {
      autoResponderQueue.delete(lead.id);

      try {
        let replyMessage = '';
        let targetAction = 'reply';

        // 1. Gerar resposta contextual inteligente e contínua com Gemini AI na voz do Kauê
        if (isAiChatActive) {
          try {
            console.log(`[Auto-Responder AI 24/7] Gerando resposta adaptativa com Gemini para "${lead.name}"...`);
            const targetJid = jid || (lead.cleanPhone + '@s.whatsapp.net');
            const chatHistory = whatsapp.store.getMessages(targetJid) || [];
            
            // Compilar mensagens recentes do lead para contexto integral
            const recentLeadTexts = chatHistory.filter(m => !m.fromMe && m.text).map(m => m.text);
            const contextText = recentLeadTexts.slice(-3).join(' | ') || text;

            const aiResult = await gemini.generateAutoPilotReply({
              lead,
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

        // 2. Fallback para templates manuais APENAS se não foi recusa e a IA não retornou texto
        if (!replyMessage && targetAction !== 'mark_lost') {
          const stageObj = (stepData.stages || []).find(s => s.number === targetStage);
          if (stageObj) {
            const hasSite = lead.hasWebsite === true;
            const rawText = hasSite ? stageObj.templates.comSite : stageObj.templates.semSite;
            replyMessage = formatStepMessage(lead, rawText, hasSite);

            if (combineWithNext) {
              const stage3Obj = (stepData.stages || []).find(s => s.number === 3);
              if (stage3Obj) {
                const raw3 = hasSite ? stage3Obj.templates.comSite : stage3Obj.templates.semSite;
                replyMessage += '\n\n' + formatStepMessage(lead, raw3, hasSite);
                targetStage = 3;
              }
            }
          }
        }

        if (!replyMessage) return;

        // Registrar timestamp de envio para cooldown
        leadLastRepliedAt.set(lead.id, Date.now());

        // Simular status "digitando..." por 3 a 4 segundos antes do envio para comportamento 100% humanizado
        try {
          await whatsapp.sendTyping(lead.cleanPhone || phone);
          await new Promise(r => setTimeout(r, 3500));
        } catch (tErr) {}

        const sendResult = await whatsapp.sendMessage(lead.cleanPhone || phone, replyMessage);

        lead.stage = targetStage;
        lead.lastContact = new Date().toISOString();
        if (targetAction === 'mark_meeting') {
          lead.status = 'reuniao';
          console.log(`[Auto-Responder AI] 🎉 Reunião com "${lead.name}" agendada pelo Gemini!`);
        } else if (targetAction === 'mark_lost') {
          lead.status = 'perdido';
          console.log(`[Auto-Responder AI] ⏹️ Resposta educada enviada e lead "${lead.name}" arquivado.`);
        }
        lead.stageHistory = lead.stageHistory || [];
        lead.stageHistory.push({
          stage: targetStage,
          sentAt: new Date().toISOString(),
          auto: true,
          ai: true,
          text: replyMessage
        });

        const freshLeads = readJson(LEADS_FILE, []);
        const idx = freshLeads.findIndex(l => l.id === lead.id);
        if (idx !== -1) {
          freshLeads[idx] = { ...freshLeads[idx], ...lead };
          writeJson(LEADS_FILE, freshLeads);
        }

        console.log(`[Auto-Responder] ✅ Etapa ${targetStage} disparada automaticamente para "${lead.name}"!`);
      } catch (sendErr) {
        console.error(`[Auto-Responder] Erro ao responder "${lead.name}":`, sendErr.message);
      }
    }, totalDelayMs);

    autoResponderQueue.set(lead.id, timerId);
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

// Configuração do Modo 24/7 Autônomo e limites do Piloto Automático
app.post('/api/autopilot/config', (req, res) => {
  const { autoStartAutopilot, dailyLimit, outboundStartHour, outboundEndHour } = req.body;
  const config = readJson(CONFIG_FILE, {});
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
  writeJson(CONFIG_FILE, config);

  if (autoStartAutopilot && !autopilot.isActive && whatsapp.getStatus().connected) {
    autopilot.start();
  }

  res.json({ success: true, config });
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
    writeJson(LEADS_FILE, leads);

    res.json({ success: true, audit: auditResult });
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

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 PINAS PROSPECTOR RODANDO NA PORTA ${PORT}`);
  console.log(`👉 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`===============================================`);

  // Iniciar ouvinte do Auto-Responder
  initAutoResponder();

  // Ouvinte de conexão do WhatsApp para Auto-Start do Piloto Automático em segundo plano
  if (whatsapp.events) {
    whatsapp.events.on('connected', () => {
      autopilot.handleWhatsAppConnected();
    });
  }

  // Tentar restaurar sessão salva do WhatsApp se existir credenciais
  const initialStatus = whatsapp.getStatus();
  if (initialStatus.hasSavedSession) {
    console.log('[WhatsApp] Sessão salva encontrada. Restaurando conexão...');
    whatsapp.initWhatsApp().then(() => {
      autopilot.handleWhatsAppConnected();
    }).catch(err => {
      console.warn('[WhatsApp] Erro na reconexão automática:', err.message);
    });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[AVISO] A porta ${PORT} ja esta sendo usada por outra instancia do Prospector.`);
    console.error(`O sistema ja esta ativo em segundo plano! Acesse: http://localhost:${PORT}\n`);
  } else {
    console.error('[ERRO DO SERVIDOR]', err);
  }
});


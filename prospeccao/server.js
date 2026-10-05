const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { scrapeGoogleMaps, calculateOpportunity } = require('./scraper');
const whatsapp = require('./whatsapp');

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

  const config = checkAndResetDailyLimit(readJson(CONFIG_FILE, {}));
  if (config.sentToday >= config.dailyLimit) {
    return res.status(429).json({
      error: `Limite de segurança diário atingido (${config.sentToday}/${config.dailyLimit}). Disparo interrompido para proteção da sua conta.`
    });
  }

  try {
    const sendResult = await whatsapp.sendMessage(phone, text);

    // Se fornecido leadId, atualizar status do lead
    let updatedLead = null;
    if (leadId) {
      const leads = readJson(LEADS_FILE, []);
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        lead.status = 'contatado';
        lead.lastContact = new Date().toISOString();
        writeJson(LEADS_FILE, leads);
        updatedLead = lead;
        if (sendResult && sendResult.to) {
          whatsapp.store.upsertChat(sendResult.to, { name: lead.name, phone: lead.phone });
        }
      }
    }

    // Incrementar disparos do dia
    config.sentToday = (config.sentToday || 0) + 1;
    writeJson(CONFIG_FILE, config);

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

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 PINAS PROSPECTOR RODANDO NA PORTA ${PORT}`);
  console.log(`👉 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`===============================================`);

  // Tentar restaurar sessão salva do WhatsApp se existir credenciais
  const initialStatus = whatsapp.getStatus();
  if (initialStatus.hasSavedSession) {
    console.log('[WhatsApp] Sessão salva encontrada. Restaurando conexão...');
    whatsapp.initWhatsApp().catch(err => {
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


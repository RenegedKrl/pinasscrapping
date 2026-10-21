const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

const DEFAULT_CONFIG = {
  autoStartAutopilot: true,
  onlyRespondReplies: true,
  disableNewLeadOutbound: true,
  dailyLimit: 10,
  distributeOverDay: true,
  outboundStartHour: 10,
  outboundEndHour: 19,
  outboundDays: [1, 2, 3, 4, 5],
  sentToday: 0,
  lastResetDate: new Date().toISOString().split('T')[0],
  minDelaySeconds: 300,
  maxDelaySeconds: 330,
  excludedChains: [
    "petz",
    "cobasi",
    "albert einstein",
    "sirio libanes",
    "sírio-libanês",
    "hospital das clinicas",
    "hospital das clínicas",
    "dr. consulta",
    "dr consulta",
    "notredame",
    "amil",
    "prevent senior",
    "hapvida",
    "c&a",
    "renner",
    "riachuelo",
    "marisa",
    "zara",
    "amaro",
    "shein",
    "pernambucanas",
    "lojas americanas",
    "torra",
    "magalu",
    "magazine luiza",
    "carrefour",
    "pão de açúcar",
    "assai",
    "atacadão",
    "leroy merlin",
    "pink luxo estética",
    "pink luxo",
    "pink luxo estética & beleza",
    "pink luxo estetica & beleza",
    "bem zanza",
    "bem zânza",
    "bem zanza | moda feminina",
    "bem zânza | moda feminina",
    "chay b",
    "chayb",
    "happy play dogs",
    "petiva",
    "centro veterinário petiva",
    "centro veterinario petiva",
    "centro veterinário petiva | clínica veterinária em vila buarque | veterinários em sp",
    "brás",
    "bras",
    "faculdade",
    "governo",
    "gov",
    "mel pitanga",
    "panzini buffet",
    "coach amani"
  ],
  excludedKeywords: [
    "estética",
    "estetica",
    "harmonização",
    "harmonizacao",
    "botox",
    "salão de beleza",
    "salao de beleza",
    "depilação",
    "depilacao",
    "lash",
    "sobrancelhas",
    "massagem estética",
    "estética corporal",
    "estética facial",
    "pink luxo estética",
    "pink luxo",
    "pink luxo estética & beleza",
    "pink luxo estetica & beleza",
    "bem zanza",
    "bem zânza",
    "bem zanza | moda feminina",
    "bem zânza | moda feminina",
    "chay b",
    "chayb",
    "happy play dogs",
    "petiva",
    "centro veterinário petiva",
    "centro veterinario petiva",
    "centro veterinário petiva | clínica veterinária em vila buarque | veterinários em sp",
    "brás",
    "bras",
    "faculdade",
    "topografia",
    "governo",
    "gov",
    "mel pitanga",
    "panzini buffet",
    "coach amani"
  ],
  defaultNiches: [
    {
      name: "Clínicas Veterinárias",
      query: "clinica veterinaria",
      templateId: "veterinaria",
      priority: 1,
      active: true
    },
    {
      name: "Consultórios Veterinários",
      query: "consultorio veterinario",
      templateId: "veterinaria",
      priority: 1,
      active: true
    },
    {
      name: "Escritórios de Advocacia",
      query: "escritorio de advocacia",
      templateId: "advogado",
      priority: 2,
      active: true
    },
    {
      name: "Advogados Especialistas",
      query: "advogado",
      templateId: "advogado",
      priority: 2,
      active: true
    },
    {
      name: "Coaches Financeiros",
      query: "coach financeiro",
      templateId: "coach",
      priority: 3,
      active: true
    },
    {
      name: "Mentores de Negócios e Executivos",
      query: "mentor de negocios",
      templateId: "coach",
      priority: 3,
      active: true
    },
    {
      name: "Coaches de Carreira e Liderança",
      query: "coach de carreira",
      templateId: "coach",
      priority: 3,
      active: true
    },
    {
      name: "Palestrantes e Treinamentos",
      query: "palestrante treinamentos",
      templateId: "coach",
      priority: 3,
      active: true
    }
  ]
};

function readJsonFile(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`[ConfigManager] Erro ao ler ${filePath}:`, err.message);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[ConfigManager] Erro ao salvar ${filePath}:`, err.message);
    return false;
  }
}

function readConfig() {
  const disk = readJsonFile(CONFIG_FILE, {});
  return {
    ...DEFAULT_CONFIG,
    ...disk,
    dailyLimit: (typeof disk.dailyLimit === 'number' && disk.dailyLimit > 0) ? disk.dailyLimit : DEFAULT_CONFIG.dailyLimit,
    outboundDays: (Array.isArray(disk.outboundDays) && disk.outboundDays.length > 0) ? disk.outboundDays : DEFAULT_CONFIG.outboundDays,
    excludedChains: (Array.isArray(disk.excludedChains) && disk.excludedChains.length > 0) ? disk.excludedChains : DEFAULT_CONFIG.excludedChains,
    excludedKeywords: (Array.isArray(disk.excludedKeywords) && disk.excludedKeywords.length > 0) ? disk.excludedKeywords : DEFAULT_CONFIG.excludedKeywords,
    defaultNiches: (Array.isArray(disk.defaultNiches) && disk.defaultNiches.length > 0) ? disk.defaultNiches : DEFAULT_CONFIG.defaultNiches
  };
}

function saveConfig(updates = {}) {
  const current = readConfig();
  const merged = { ...current, ...updates };
  // Sanitizar dias
  if (Array.isArray(merged.outboundDays)) {
    merged.outboundDays = merged.outboundDays.map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 6);
    if (merged.outboundDays.length === 0) merged.outboundDays = DEFAULT_CONFIG.outboundDays;
  }
  // Sanitizar limite diário
  if (typeof merged.dailyLimit !== 'number' || merged.dailyLimit <= 0) {
    merged.dailyLimit = DEFAULT_CONFIG.dailyLimit;
  }
  // Garantir listas de exclusão não vazias
  if (!Array.isArray(merged.excludedChains) || merged.excludedChains.length === 0) {
    merged.excludedChains = DEFAULT_CONFIG.excludedChains;
  }
  if (!Array.isArray(merged.excludedKeywords) || merged.excludedKeywords.length === 0) {
    merged.excludedKeywords = DEFAULT_CONFIG.excludedKeywords;
  }

  writeJsonFile(CONFIG_FILE, merged);
  return merged;
}

const DYNAMIC_DAY_LIMITS = {
  1: 11, // Segunda: 11 leads (aquecimento do início de semana)
  2: 13, // Terça: 13 leads (dia ativo)
  3: 15, // Quarta: 15 leads (pico solicitado pelo Kauê)
  4: 10, // Quinta: 10 leads (desaceleração / proteção)
  5: 14  // Sexta: 14 leads (fechamento de semana)
};

function checkAndResetDailyLimit(config) {
  const cfg = config && config.excludedChains ? config : readConfig();
  const today = new Date().toISOString().split('T')[0];
  if (cfg.lastResetDate !== today) {
    cfg.sentToday = 0;
    cfg.lastResetDate = today;

    // Ajuste dinâmico anti-ban: flutua entre 10 e 15 leads dependendo do dia da semana
    try {
      const spDateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short'
      }).format(new Date());
      const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const currentDay = dayMap[spDateStr] !== undefined ? dayMap[spDateStr] : new Date().getDay();

      if (DYNAMIC_DAY_LIMITS[currentDay]) {
        cfg.dailyLimit = DYNAMIC_DAY_LIMITS[currentDay];
        console.log(`[ConfigManager] 📅 Flutuação Anti-Ban: Limite diário ajustado automaticamente para ${cfg.dailyLimit} leads hoje.`);
      }
    } catch (e) {}

    saveConfig(cfg);
    console.log(`[ConfigManager] 🌅 Novo dia (${today}): Contador de disparos resetado para 0.`);
  }
  return cfg;
}

function stripAccents(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesExclusionTerm(rawText, term) {
  const cleanTerm = stripAccents(term).trim();
  if (!cleanTerm) return false;

  // Proteção contra falso positivo de 'bras' em 'brasil' / 'brasilia'
  if (cleanTerm === 'bras') {
    return /\bbras\b/i.test(rawText);
  }
  // Proteção contra falso positivo de 'amil' em 'familia' / 'familiar'
  if (cleanTerm === 'amil') {
    return /\bamil\b/i.test(rawText);
  }
  // Proteção contra falso positivo de 'amaro' em 'santo amaro' (bairro)
  if (cleanTerm === 'amaro') {
    if (/santo\s+amaro/i.test(rawText)) return false;
    return /\bamaro\b/i.test(rawText);
  }
  // Termos curtos usam fronteira de palavra exata
  if (cleanTerm.length <= 4) {
    const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(rawText);
  }

  return rawText.includes(cleanTerm);
}

function isExcludedLead(lead, config = null) {
  if (!lead) return true;
  const cfg = config || readConfig();
  const rawText = stripAccents(
    `${lead.name || ''} ${lead.address || ''} ${lead.neighborhood || ''} ${lead.city || ''} ${lead.niche || ''} ${lead.notes || ''}`
  );

  // 1. Blacklist Estrita da Pinas
  const strictTerms = [
    'petiva',
    'pink luxo',
    'bem zanza',
    'chay b',
    'chayb',
    'bras',
    'happy play dogs'
  ];
  for (const term of strictTerms) {
    if (matchesExclusionTerm(rawText, term)) {
      return { excluded: true, reason: `Blacklist protegida (${term})` };
    }
  }

  // 2. Grandes Redes e Hospitais Bloqueados
  for (const chain of cfg.excludedChains || []) {
    if (matchesExclusionTerm(rawText, chain)) {
      return { excluded: true, reason: `Rede / Concorrente bloqueado (${chain})` };
    }
  }

  // 3. Palavras-chave do ramo estético / salões / termos bloqueados
  for (const kw of cfg.excludedKeywords || []) {
    if (matchesExclusionTerm(rawText, kw)) {
      return { excluded: true, reason: `Ramo / Palavra excluída (${kw})` };
    }
  }

  return { excluded: false };
}

module.exports = {
  CONFIG_FILE,
  DEFAULT_CONFIG,
  readConfig,
  saveConfig,
  checkAndResetDailyLimit,
  stripAccents,
  matchesExclusionTerm,
  isExcludedLead
};

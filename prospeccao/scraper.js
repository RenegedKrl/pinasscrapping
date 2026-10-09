const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Carregar filtros de exclusão
function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'data', 'config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return { excludedChains: [], excludedKeywords: [] };
  }
}

// Normalizar e extrair telefone brasileiro
function parseBrazilianPhone(rawText) {
  if (!rawText) return { formatted: '', clean: '', isMobile: false };
  
  // Limpar caracteres estranhos
  const phoneRegex = /(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*)?(?:(9\d{4})|(\d{4}))[-\s]?(\d{4})/g;
  const match = phoneRegex.exec(rawText);
  if (!match) return { formatted: '', clean: '', isMobile: false };

  const ddd = match[1] || '11';
  const prefix = match[2] || match[3];
  const suffix = match[4];
  const isMobile = !!match[2]; // Se começou com 9 no celular

  const formatted = `(${ddd}) ${prefix}-${suffix}`;
  const clean = `55${ddd}${prefix}${suffix}`.replace(/\D/g, '');

  return { formatted, clean, isMobile };
}

// Normalização sem acentos para comparação à prova de falhas
function stripAccents(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Verificar se o negócio é cliente atual, grande rede, Brás ou do ramo proibido
function isExcluded(name, text, config) {
  const fullText = stripAccents(`${name} ${text}`);

  // 1. Verificar redes gigantes e clientes atuais protegidos
  for (const chain of config.excludedChains || []) {
    const chainNorm = stripAccents(chain);
    if (chainNorm && fullText.includes(chainNorm)) {
      return { excluded: true, reason: `Exclusão protegida / Cliente atual (${chain})` };
    }
  }

  // 2. Verificar termos e regiões excluídas (Brás, estética, etc.)
  for (const kw of config.excludedKeywords || []) {
    const kwNorm = stripAccents(kw);
    if (kwNorm && fullText.includes(kwNorm)) {
      return { excluded: true, reason: `Palavra/Região excluída (${kw})` };
    }
  }

  return { excluded: false };
}

// Calcular Score de Oportunidade e Ângulo de Venda Recomendado
function calculateOpportunity(lead) {
  let score = 3;
  let type = 'geral';
  let label = '📍 Presença Local';
  let attackAngle = 'Comércio ativo na região com potencial de captação digital.';

  const hasNoSite = !lead.website;
  const isMobile = !!lead.hasMobile;
  const reviews = Number(lead.reviews) || 0;
  const rating = Number(lead.rating) || 0;

  if (hasNoSite && isMobile && reviews >= 10 && rating >= 4.0) {
    score = 5;
    type = 'ouro';
    label = '💎 Ouro: Site + Google Ads';
    attackAngle = `Clientela física forte (${reviews} reviews, nota ${rating}), mas perde buscas diárias no Google por não ter site próprio.`;
  } else if (hasNoSite && isMobile) {
    score = 4;
    type = 'site';
    label = '🌐 Oportunidade: Criação de Site';
    attackAngle = 'Comércio sem site oficial. Oportunidade direta de landing page rápida + Google Ads.';
  } else if (!hasNoSite && isMobile && reviews >= 15) {
    score = 4;
    type = 'expansao';
    label = '🚀 Expansão: Tráfego Pago & Meta';
    attackAngle = 'Já possui site. Oportunidade em campanhas inteligentes no Meta e Google para acelerar vendas.';
  } else if (reviews < 10 || rating < 4.3) {
    score = 3;
    type = 'gmb';
    label = '⭐ Oportunidade: Google Meu Negócio';
    attackAngle = 'Perfil no Maps com poucas avaliações. Ideal para gestão de reputação e atração local.';
  }

  return { score, type, label, attackAngle };
}

/**
 * Scraper principal do Google Maps
 */
async function scrapeGoogleMaps({ niche, location, maxResults = 20, onlyMobile = false, filterDuplicates = true, onProgress }) {
  const config = loadConfig();
  const query = `${niche} ${location}`.trim();
  const notify = (msg, percent = null) => {
    if (onProgress) onProgress({ message: msg, percent });
  };

  // Carregar leads existentes para filtro anti-duplicidade
  let existingLeads = [];
  try {
    const leadsPath = path.join(__dirname, 'data', 'leads.json');
    if (fs.existsSync(leadsPath)) {
      existingLeads = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
    }
  } catch (e) {}

  const existingPhones = new Set(existingLeads.map(l => l.cleanPhone).filter(Boolean));
  const existingNames = new Set(existingLeads.map(l => (l.name || '').toLowerCase().trim()).filter(Boolean));

  notify(`Iniciando varredura para: "${query}"...`, 10);

  let browser;
  const leads = [];

  try {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (e1) {
      try {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
      } catch (e2) {
        browser = await chromium.launch({ headless: true });
      }
    }

    const context = await browser.newContext({
      locale: 'pt-BR',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }
    });

    const page = await context.newPage();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    
    notify(`Abrindo Google Maps...`, 25);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    // Tentar encontrar o container de resultados
    const feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
    } catch {
      notify(`Container de lista não encontrado diretamente, verificando resultados...`, 30);
    }

    notify(`Carregando e rolando lista de comércios locais...`, 40);

    // Rolar a lista para carregar mais itens
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrolls = Math.min(Math.ceil(maxResults / 5), 10);

    while (scrollAttempts < maxScrolls) {
      await page.evaluate((selector) => {
        const feed = document.querySelector(selector);
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, feedSelector);

      await page.waitForTimeout(1800);
      scrollAttempts++;

      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a.hfpxzc').length;
      });

      notify(`Encontrados ${currentCount} estabelecimentos na tela...`, 40 + (scrollAttempts * 4));

      if (currentCount >= maxResults || (currentCount === previousCount && scrollAttempts > 3)) {
        break;
      }
      previousCount = currentCount;
    }

    notify(`Extraindo e filtrando dados dos comércios pequenos e médios...`, 80);

    // Extrair dados detalhados
    const rawItems = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('div[role="feed"] > div > div[jsaction]');

      for (const card of cards) {
        const linkEl = card.querySelector('a.hfpxzc');
        if (!linkEl) continue;

        const name = linkEl.getAttribute('aria-label') || '';
        const mapsUrl = linkEl.getAttribute('href') || '';
        const fullText = card.innerText || '';

        // Avaliação
        const ratingEl = card.querySelector('.MW4etd');
        const rating = ratingEl ? ratingEl.innerText.replace(',', '.') : '';

        // Total avaliações
        const reviewsEl = card.querySelector('.UY7F9');
        let reviews = 0;
        if (reviewsEl) {
          const num = reviewsEl.innerText.replace(/\D/g, '');
          reviews = num ? parseInt(num, 10) : 0;
        }

        // Tentar encontrar site
        let website = '';
        const siteLink = card.querySelector('a[data-value="Site"]') || card.querySelector('a[aria-label*="site"]');
        if (siteLink) {
          website = siteLink.getAttribute('href') || '';
        }

        items.push({
          name,
          mapsUrl,
          fullText,
          rating,
          reviews,
          website
        });
      }
      return items;
    });

    // Processar e aplicar filtros
    for (const item of rawItems) {
      if (leads.length >= maxResults) break;

      // 1. Filtro de exclusão (Redes gigantes e ramo estético)
      const filterResult = isExcluded(item.name, item.fullText, config);
      if (filterResult.excluded) {
        continue;
      }

      // 2. Extrair telefone
      const phoneInfo = parseBrazilianPhone(item.fullText);

      // 3. Filtro de apenas celular / WhatsApp
      if (onlyMobile && !phoneInfo.isMobile) {
        continue;
      }

      // 4. Filtro Anti-Duplicidade
      if (filterDuplicates) {
        const nameLower = (item.name || '').toLowerCase().trim();
        if (existingNames.has(nameLower)) {
          continue;
        }
        if (phoneInfo.clean && existingPhones.has(phoneInfo.clean)) {
          continue;
        }
      }

      // Extrair endereço e bairro aproximado
      const lines = item.fullText.split('\n').filter(l => l.trim().length > 0);
      let address = '';
      for (const line of lines) {
        if (line.includes('Rua') || line.includes('Av.') || line.includes('Avenida') || line.includes('Al.') || line.includes('Praça') || line.includes('R.')) {
          address = line.trim();
          break;
        }
      }
      if (!address && lines.length > 2) address = lines[2].trim();

      const opp = calculateOpportunity({
        hasWebsite: !!item.website,
        website: item.website,
        hasMobile: phoneInfo.isMobile,
        reviews: item.reviews || 0,
        rating: item.rating || 0
      });

      const lead = {
        id: `lead-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: item.name.trim(),
        niche: niche,
        phone: phoneInfo.formatted || 'Não listado',
        cleanPhone: phoneInfo.clean || '',
        hasPhone: !!phoneInfo.formatted,
        hasMobile: phoneInfo.isMobile,
        website: item.website || '',
        hasWebsite: !!item.website,
        mapsUrl: item.mapsUrl,
        rating: item.rating || 'N/A',
        reviews: item.reviews || 0,
        address: address || location,
        neighborhood: location,
        city: 'São Paulo',
        opportunity: opp,
        score: opp.score,
        notes: opp.attackAngle,
        status: 'novo',
        lastContact: null,
        createdAt: new Date().toISOString()
      };

      leads.push(lead);
      existingNames.add((item.name || '').toLowerCase().trim());
      if (phoneInfo.clean) existingPhones.add(phoneInfo.clean);
    }

    notify(`Varredura concluída! ${leads.length} leads qualificados capturados.`, 100);

  } catch (error) {
    notify(`Erro durante scraping: ${error.message}`, null);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return leads;
}

/**
 * Caça ativa e autônoma de sites ruins / presença digital precária na Web
 * Prioridades da Pinas: 1º Clínicas Veterinárias | 2º Escritórios de Advocacia | 3º Clínicas Médicas
 */
const PRIORITY_NICHES = [
  'Clínica Veterinária',
  'Escritório de Advocacia',
  'Clínica Odontológica',
  'Clínica Médica'
];

const TARGET_NEIGHBORHOODS = [
  'Tatuapé',
  'Mooca',
  'Pinheiros',
  'Santana',
  'Vila Mariana',
  'Perdizes',
  'Santo Amaro',
  'Bela Vista',
  'Ipiranga',
  'Vila Madalena'
];

async function huntBadWebsites({ niche = null, location = null, maxResults = 8, onProgress } = {}) {
  const chosenNiche = niche || PRIORITY_NICHES[Math.floor(Math.random() * PRIORITY_NICHES.length)];
  const chosenLocation = location || TARGET_NEIGHBORHOODS[Math.floor(Math.random() * TARGET_NEIGHBORHOODS.length)];

  if (onProgress) onProgress({ message: `🎯 Caçando sites com problemas para "${chosenNiche}" em ${chosenLocation}...`, percent: 15 });

  // 1. Roda o scraper de Maps
  const scrapedLeads = await scrapeGoogleMaps({
    niche: chosenNiche,
    location: chosenLocation,
    maxResults: Math.max(12, maxResults * 2),
    onlyMobile: false,
    filterDuplicates: true,
    onProgress
  });

  const auditor = require('./auditor');
  const badSiteLeads = [];

  if (onProgress) onProgress({ message: `Auditando canais digitais dos ${scrapedLeads.length} estabelecimentos encontrados...`, percent: 70 });

  for (const lead of scrapedLeads) {
    if (!lead.cleanPhone || lead.cleanPhone.length < 10) continue;

    try {
      const audit = await auditor.auditLeadFull(lead);
      lead.siteAudit = audit.site;
      lead.mapsAudit = audit.maps;

      const isBad = (
        !audit.site.hasWebsite ||
        !audit.site.isOnline ||
        audit.site.loadTimeMs > 2500 ||
        !audit.site.hasWhatsApp ||
        !audit.site.doesPaidTraffic
      );

      if (isBad) {
        lead.isBadSite = true;
        lead.badSiteReasons = audit.site.weaknesses || [];
        if (!audit.site.hasWebsite) lead.badSiteReasons.push('Sem site próprio');
        if (!audit.site.isOnline) lead.badSiteReasons.push('Site fora do ar');
        badSiteLeads.push(lead);
      }
    } catch (e) {
      if (!lead.hasWebsite) {
        lead.isBadSite = true;
        lead.badSiteReasons = ['Sem site próprio'];
        badSiteLeads.push(lead);
      }
    }

    if (badSiteLeads.length >= maxResults) break;
  }

  // 2. Salvar leads na base oficial
  const leadsPath = path.join(__dirname, 'data', 'leads.json');
  let currentLeads = [];
  try {
    if (fs.existsSync(leadsPath)) {
      currentLeads = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
    }
  } catch (e) {}

  const finalAdded = [];
  for (const lead of badSiteLeads) {
    const exists = currentLeads.some(l => l.cleanPhone === lead.cleanPhone || l.name.toLowerCase() === lead.name.toLowerCase());
    if (!exists) {
      currentLeads.unshift(lead);
      finalAdded.push(lead);
    }
  }

  try {
    fs.writeFileSync(leadsPath, JSON.stringify(currentLeads, null, 2), 'utf8');
  } catch (e) {}

  if (onProgress) onProgress({ message: `✅ Caça concluída! ${finalAdded.length} empresas com sites ruins ou sem site capturadas na esteira.`, percent: 100 });

  return finalAdded;
}

module.exports = {
  scrapeGoogleMaps,
  huntBadWebsites,
  parseBrazilianPhone,
  isExcluded,
  calculateOpportunity
};

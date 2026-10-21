const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'config.json');

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));

console.log(`[Auditoria CRM] Total de leads na base: ${leads.length}`);

// Redes e Franquias Conhecidas a Bloquear/Descartar
const FRANCHISE_NAMES = [
  'oral unic', 'oral sin', 'sorridents', 'odontocompany', 'orthopride',
  'rede dentz', 'dentz', 'dr. consulta', 'dr consulta', 'amorsaude', 'amor saúde',
  'espacolaser', 'espaço laser', 'botoclinic', 'petz', 'cobasi', 'seres',
  'fleury', 'lavoisier', 'delboni', 'notredame', 'hapvida', 'amil',
  'febracis', 'resoluty'
];

function isFranchiseOrBigChain(lead) {
  const name = (lead.name || '').toLowerCase();
  const site = (lead.website || '').toLowerCase();
  const niche = (lead.niche || '').toLowerCase();
  const notes = (lead.notes || '').toLowerCase();
  const full = `${name} ${site} ${niche} ${notes}`;

  // 1. Médicos tradicionais / consultas humanas (Kauê especificou: "não é negócio de médico, tipo quebrei o braço hospital público")
  if (niche.includes('médica') || niche.includes('medica') || /gastroenterologista|oftalmologista|psiquiatra|pediatra|ortopedia humana|saúde mental/i.test(full)) {
    return { isFranchise: true, reason: 'Nicho médico tradicional não prioritário (Kauê busca odonto/estética, vet, advocacia, mentores)' };
  }
  if (/hospital (geral|público|publico|das clínicas|municipal|estadual|samaritano|albert|sirio|sírio)/i.test(full)) {
    return { isFranchise: true, reason: 'Hospital humano / Hospital público' };
  }

  // 2. Grandes Redes e Franquias
  if (FRANCHISE_NAMES.some(f => full.includes(f))) return { isFranchise: true, reason: 'Grande rede / Franquia / Famoso nacional' };
  if (site.includes('/unidades/') || site.includes('/unidade-') || site.includes('franquia') || site.includes('franqueado')) {
    return { isFranchise: true, reason: 'Página de unidade/franquia corporativa' };
  }

  // 3. Mais de 350 reviews geralmente é rede corporativa, famoso ou grande rede
  const reviews = Number(lead.reviews) || 0;
  if (reviews > 350) {
    return { isFranchise: true, reason: `Volume massivo (${reviews} reviews) característico de grande rede ou famoso` };
  }

  // 4. Regra Estrita do Kauê: "Pet shop não mexo, de pet apenas clínicas veterinárias (se tiver incluso tudo bem)"
  const isPetRelated = niche.includes('veterin') || full.includes('pet ') || full.includes('petshop') || full.includes('banho e tosa') || full.includes('creche');
  if (isPetRelated) {
    const nameLower = name.toLowerCase();
    const addressLower = (lead.address || '').toLowerCase();
    const fullPet = `${nameLower} ${addressLower}`;
    const nameHasClinic = /veterin[áa]ri|cl[íi]nica vet|hospital vet|centro vet|vclab|dra?\.\s*.*vet/i.test(nameLower);

    // Se o nome NÃO tem clínica veterinária e é creche, hotel, daycare ou pet shop puro
    if (!nameHasClinic) {
      if (/creche|daycare|cuidados diurnos|hotel para c|hotel para anim/i.test(fullPet)) {
        return { isFranchise: true, reason: 'Creche / Hotel para cães sem clínica veterinária' };
      }
      if (/pet shop|banho e tosa/i.test(fullPet)) {
        return { isFranchise: true, reason: 'Pet shop / Banho e tosa puro sem clínica veterinária' };
      }
      if (/pet shop|creche|hotel/i.test(addressLower)) {
        return { isFranchise: true, reason: 'Categoria Google Maps é Pet Shop / Creche sem clínica' };
      }
    }
  }

  return { isFranchise: false };
}

function isSocialOrNoWebsite(url) {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  if (lower === '' || lower === 'null' || lower === 'undefined') return true;
  if (lower.startsWith('/aclk?')) return true; // Link de redirect do Google Ads quebrado
  if (lower.includes('instagram.com') || lower.includes('facebook.com') || lower.includes('linktr.ee') || lower.includes('canva.site') || lower.includes('tiktok.com')) return true;
  return false;
}

function testUrlFast(targetUrl, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (res) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      resolve(res);
    };

    const timer = setTimeout(() => {
      finish({ online: false, error: 'TIMEOUT (site não respondeu em 3s)', loadTimeMs: timeoutMs });
    }, timeoutMs);

    try {
      if (!targetUrl || targetUrl.startsWith('/aclk?')) {
        return finish({ online: false, error: 'URL inválida ou redirect quebrado', loadTimeMs: 0 });
      }
      const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      const client = parsed.protocol === 'https:' ? https : http;
      const t0 = Date.now();

      const req = client.get(parsed.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: timeoutMs
      }, (res) => {
        const loadTimeMs = Date.now() - t0;
        let body = '';
        res.on('data', chunk => {
          body += chunk;
          if (body.length > 40000) {
            try { req.destroy(); } catch (e) {}
            finish({
              online: res.statusCode < 400,
              statusCode: res.statusCode,
              loadTimeMs,
              hasWhatsApp: /whatsapp\.com|wa\.me|api\.whatsapp/i.test(body),
              hasPixel: /fbevents\.js|gtag|google_tag_params|fbq\(/i.test(body)
            });
          }
        });
        res.on('end', () => {
          finish({
            online: res.statusCode < 400,
            statusCode: res.statusCode,
            loadTimeMs,
            hasWhatsApp: /whatsapp\.com|wa\.me|api\.whatsapp/i.test(body),
            hasPixel: /fbevents\.js|gtag|google_tag_params|fbq\(/i.test(body)
          });
        });
      });

      req.on('error', (err) => {
        finish({ online: false, error: err.message, loadTimeMs: Date.now() - t0 });
      });
    } catch (e) {
      finish({ online: false, error: 'INVALID_URL', loadTimeMs: 0 });
    }
  });
}

// Pool com concorrência limitada (15 simultâneos)
async function mapConcurrent(items, fn, concurrency = 15) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (concurrency <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

async function auditAndRank() {
  const novos = leads.filter(l => l.status === 'novo');
  console.log(`[Auditoria CRM] Analisando ${novos.length} leads com status 'novo'...`);

  let discardedFranchises = 0;
  const eligibleLeads = [];

  for (const lead of novos) {
    const franchiseCheck = isFranchiseOrBigChain(lead);
    if (franchiseCheck.isFranchise) {
      lead.status = 'descartado';
      lead.notes = (lead.notes ? lead.notes + ' | ' : '') + `Descartado: ${franchiseCheck.reason}`;
      discardedFranchises++;
    } else {
      eligibleLeads.push(lead);
    }
  }

  console.log(`[Auditoria CRM] Franquias/Grandes redes descartadas: ${discardedFranchises}`);
  console.log(`[Auditoria CRM] Leads elegíveis para auditoria técnica detalhada: ${eligibleLeads.length}`);

  // Testar sites dos que possuem website que não seja rede social
  const leadsToTestSite = eligibleLeads.filter(l => l.hasWebsite && !isSocialOrNoWebsite(l.website));
  console.log(`[Auditoria CRM] Testando ${leadsToTestSite.length} websites reais com HTTP...`);

  await mapConcurrent(leadsToTestSite, async (lead) => {
    const res = await testUrlFast(lead.website, 3500);
    lead.siteTest = res;
    lead.isOnline = res.online;
    lead.siteLoadTime = res.loadTimeMs;
    lead.siteHasWhatsApp = res.hasWhatsApp;
    lead.siteHasPixel = res.hasPixel;
  }, 15);

  console.log(`[Auditoria CRM] Testes de sites concluídos. Calculando probabilidade de aceite...`);

  for (const lead of eligibleLeads) {
    let score = 0;
    const reasons = [];

    // 1. Nicho Prioritário
    const niche = lead.niche || '';
    if (niche.includes('Veterinária')) {
      score += 35;
      reasons.push('Nicho #1 Pinas (Clínica Veterinária)');
    } else if (niche.includes('Advocacia') || niche.includes('Advogado')) {
      score += 32;
      reasons.push('Nicho #2 Pinas (Advocacia)');
    } else if (niche.includes('Odontológica') || niche.includes('Dentista') || /implante/i.test(lead.name)) {
      score += 32;
      reasons.push('Odontologia (Alto Ticket Particular)');
    } else if (niche.includes('Coach') || niche.includes('Mentor')) {
      score += 26;
      reasons.push('Coach & Mentor');
    } else {
      score += 18;
    }

    // 2. Situação do Site (Critério Chave do Kauê)
    const hasNoOfficialSite = !lead.hasWebsite || isSocialOrNoWebsite(lead.website);
    if (hasNoOfficialSite) {
      score += 45;
      lead.opportunityType = 'sem_site';
      reasons.push('💎 SEM SITE PRÓPRIO (Necessidade Evidente)');
    } else if (lead.siteTest) {
      if (!lead.siteTest.online) {
        score += 42;
        lead.opportunityType = 'site_fora_do_ar';
        lead.isBadSite = true;
        reasons.push('🛑 SITE FORA DO AR / ERRO DE ACESSO (Oportunidade Crítica)');
      } else if (lead.siteTest.loadTimeMs > 2500) {
        score += 35;
        lead.opportunityType = 'site_lento';
        lead.isBadSite = true;
        reasons.push(`⚠️ SITE LENTO (${(lead.siteTest.loadTimeMs/1000).toFixed(1)}s no celular)`);
      } else if (!lead.siteTest.hasWhatsApp) {
        score += 30;
        lead.opportunityType = 'sem_whatsapp';
        reasons.push('⚠️ Site sem botão direto de WhatsApp');
      } else if (!lead.siteTest.hasPixel) {
        score += 22;
        lead.opportunityType = 'sem_trafego';
        reasons.push('📍 Site institucional sem campanhas de tráfego');
      } else {
        // Site veloz com pixel e WhatsApp (Agência já atende ou muito profissional)
        score -= 25;
        lead.opportunityType = 'site_profissional';
        reasons.push('ℹ️ Site já é veloz e possui pixel (Baixa propensão)');
      }
    } else {
      score += 15;
    }

    // 3. Ficha no Google Maps (Prova de vida, faturamento e movimento local)
    const reviews = Number(lead.reviews) || 0;
    const rating = Number(lead.rating) || 0;

    if (reviews >= 15 && reviews <= 250 && rating >= 4.4) {
      score += 25;
      reasons.push(`Forte reputação local (${reviews} reviews ★${rating.toFixed(1)})`);
    } else if (reviews >= 5 && rating >= 4.0) {
      score += 15;
      reasons.push(`Presença local ativa (${reviews} reviews ★${rating.toFixed(1)})`);
    } else if (reviews === 0) {
      score -= 20;
      reasons.push('Ficha no Maps sem avaliações');
    }

    // 4. Canal de Contato Direto (Celular WhatsApp)
    if (lead.hasMobile && lead.cleanPhone) {
      score += 15;
      reasons.push('WhatsApp Celular Direto');
    } else {
      score -= 40;
      reasons.push('Telefone fixo (sem WhatsApp direto)');
    }

    const finalScore = Math.max(5, Math.min(100, score));
    let tier = 'Bronze';
    if (finalScore >= 85) tier = 'Diamante';
    else if (finalScore >= 70) tier = 'Ouro';
    else if (finalScore >= 50) tier = 'Prata';

    lead.conversionScore = finalScore;
    lead.priorityScore = finalScore;
    lead.acceptanceTier = tier;
    lead.acceptanceReason = reasons.join(' • ');

    if (!lead.opportunity) lead.opportunity = {};
    lead.opportunity.score = finalScore;
    lead.opportunity.numericRank = finalScore;
    lead.opportunity.tier = tier;
    lead.opportunity.label = `${tier === 'Diamante' ? '💎 Diamante' : tier === 'Ouro' ? '🥇 Ouro' : '🥈 Prata'} (${finalScore}% Aceite)`;
    lead.opportunity.attackAngle = lead.acceptanceReason;
  }

  // Ordenar a base de novos leads pelo score decrescente
  eligibleLeads.sort((a, b) => (b.conversionScore || 0) - (a.conversionScore || 0));

  // Re-montar leads.json mantendo contatados/respondeu/descartados e colocando os novos no topo na ordem certa
  const nonNewLeads = leads.filter(l => l.status !== 'novo');
  const reorderedLeads = [...eligibleLeads, ...nonNewLeads];

  fs.writeFileSync(LEADS_FILE, JSON.stringify(reorderedLeads, null, 2), 'utf8');

  console.log(`\n======================================================`);
  console.log(`✅ CRM ATUALIZADO E RE-ORDENADO COM SUCESSO!`);
  console.log(`Total Novos Ativos: ${eligibleLeads.length}`);
  console.log(` - Diamante (85-100 pts): ${eligibleLeads.filter(l => l.acceptanceTier === 'Diamante').length}`);
  console.log(` - Ouro (70-84 pts): ${eligibleLeads.filter(l => l.acceptanceTier === 'Ouro').length}`);
  console.log(` - Prata (50-69 pts): ${eligibleLeads.filter(l => l.acceptanceTier === 'Prata').length}`);
  console.log(` - Bronze (< 50 pts): ${eligibleLeads.filter(l => l.acceptanceTier === 'Bronze').length}`);
  console.log(`======================================================\n`);

  console.log('TOP 20 LEADS NO TOPO DA ESTEIRA:');
  eligibleLeads.slice(0, 20).forEach((l, i) => {
    console.log(`${i+1}. [${l.acceptanceTier} ${l.conversionScore} pts] ${l.name}`);
    console.log(`   Nicho: ${l.niche} | Tel: ${l.phone} | Site: ${l.website || 'Nenhum'}`);
    console.log(`   Motivo: ${l.acceptanceReason}\n`);
  });
}

auditAndRank().catch(err => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});

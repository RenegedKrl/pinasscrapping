/**
 * Script de Varredura Automática de Coaches e Mentores (@pinas.studio)
 * Executa scraping inteligente no Google Maps para:
 * 1. Coach Financeiro
 * 2. Mentor de Negócios
 * 3. Coach de Carreira
 * 4. Palestrante de Treinamentos
 *
 * Filtra academias/crossfit/treinos físicos com tolerância zero.
 * Adiciona novos leads diretamente ao leads.json sem duplicidades.
 */

const path = require('path');
const fs = require('fs');
const { scrapeGoogleMaps } = require('../scraper');

const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');

// Termos estritos para descartar academias, boxes de crossfit e treinos físicos
const FIT_TERMS = [
  'crossfit', 'cross fit', 'cross training', 'crosstraining', 'cross experience',
  'academia', 'fitness', 'treino', 'treinamento físico', 'personal trainer', 'personal',
  'musculação', 'musculacao', 'pilates', 'luta', 'jiu jitsu', 'muay thai', 'boxe',
  'gym', 'calistenia', 'studio fitness', 'ct ', 'centro de treinamento esportivo',
  'fisioterapia', 'fisioterapeuta', 'dança', 'esporte', 'esportiva', 'esportivo', 'natação',
  'beach tennis', 'quadra', 'sala de fitness', 'condicionamento físico', 'corrida',
  'eletroestimulação', 'eletroestimulacao', 'saúde e beleza', 'autoescola',
  'salão de eventos', 'buffet', 'estética', 'nutricionista', 'emagrecimento',
  'nutrição', 'nutricao', 'futebol', 'artes marciais', 'judô', 'karatê', 'yoga',
  'box ', ' box', 'cross', 'amway', 'mmn', 'quiropraxia', 'clube', 'futsal',
  'goleiro', 'barbell', 'maromba', 'suplemento', 'vestuário esportivo', 'canto', 'hostel', 'hotel'
];

function isPhysicalOrIrrelevant(lead) {
  const text = `${lead.name || ''} ${lead.address || ''} ${lead.website || ''}`.toLowerCase();
  return FIT_TERMS.some(t => text.includes(t));
}

const SEARCH_TARGETS = [
  {
    nicheLabel: 'Coach Financeiro',
    searchQuery: 'coach financeiro',
    location: 'São Paulo'
  },
  {
    nicheLabel: 'Mentor de Negócios',
    searchQuery: 'mentor de negocios',
    location: 'São Paulo'
  },
  {
    nicheLabel: 'Coach de Carreira',
    searchQuery: 'coach de carreira',
    location: 'São Paulo'
  },
  {
    nicheLabel: 'Palestrante de Treinamentos',
    searchQuery: 'palestrante treinamentos corporativos',
    location: 'São Paulo'
  }
];

async function runAutonomousCoachScraper() {
  console.log('====================================================');
  console.log('🚀 INICIANDO VARREDURA AUTOMÁTICA DE COACHES & MENTORES');
  console.log('====================================================');

  let totalNewAdded = 0;
  const summaryReport = [];

  for (const target of SEARCH_TARGETS) {
    console.log(`\n🔍 [${target.nicheLabel}] Varrando: "${target.searchQuery}" em ${target.location}...`);

    try {
      const results = await scrapeGoogleMaps({
        niche: target.searchQuery,
        location: target.location,
        maxResults: 25,
        onlyMobile: false,
        filterDuplicates: true,
        onProgress: (p) => {
          if (p.percent) {
            process.stdout.write(`   ↳ [${p.percent}%] ${p.message}\r`);
          }
        }
      });

      console.log(`\n   ✓ Extraídos inicialmente: ${results.length} resultados.`);

      // Filtro refinado anti-fitness
      const qualified = results.filter(lead => {
        if (isPhysicalOrIrrelevant(lead)) {
          console.log(`   ⛔ Descartado (Fitness/Irrelevante): ${lead.name}`);
          return false;
        }
        // Atribuir nicho canônico limpo
        lead.niche = `Coach & Mentor (${target.nicheLabel})`;
        return true;
      });

      console.log(`   🎯 Leads qualificados após filtro: ${qualified.length}`);

      // Ler base atual e mesclar
      const existingLeads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
      const existingPhones = new Set(existingLeads.map(l => l.cleanPhone).filter(Boolean));
      const existingNames = new Set(existingLeads.map(l => (l.name || '').toLowerCase().trim()).filter(Boolean));

      let addedForTarget = 0;
      for (const qLead of qualified) {
        const nameLower = (qLead.name || '').toLowerCase().trim();
        if (existingNames.has(nameLower)) continue;
        if (qLead.cleanPhone && existingPhones.has(qLead.cleanPhone)) continue;

        existingLeads.unshift(qLead);
        existingNames.add(nameLower);
        if (qLead.cleanPhone) existingPhones.add(qLead.cleanPhone);
        addedForTarget++;
      }

      fs.writeFileSync(LEADS_FILE, JSON.stringify(existingLeads, null, 2), 'utf8');
      console.log(`   💾 ${addedForTarget} novos leads únicos adicionados ao CRM!`);

      totalNewAdded += addedForTarget;
      summaryReport.push({
        nicho: target.nicheLabel,
        capturados: addedForTarget
      });

    } catch (err) {
      console.error(`   ❌ Erro ao varrer ${target.nicheLabel}:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('✅ VARREDURA CONCLUÍDA COM SUCESSO!');
  console.log(`Total de novos coaches/mentores adicionados ao CRM: ${totalNewAdded}`);
  summaryReport.forEach(r => console.log(` - ${r.nicho}: +${r.capturados} leads`));
  console.log('====================================================\n');

  return { totalNewAdded, summaryReport };
}

// Executar quando chamado diretamente
if (require.main === module) {
  runAutonomousCoachScraper()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Falha geral na varredura:', err);
      process.exit(1);
    });
}

module.exports = { runAutonomousCoachScraper };

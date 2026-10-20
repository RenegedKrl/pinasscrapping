/**
 * Varredura Mestra de Ramos para Gestão de Tráfego Pago Recorrente (@pinas.studio)
 * Foco exclusivo em negócios de ALTO TICKET e RECORRÊNCIA MENSAL (Retainer / MRR).
 *
 * Ramos prioritários:
 * 1. Clínicas Odontológicas (Implantes, Invisalign e Avaliações Particulares)
 * 2. Escritórios de Advocacia (Trabalhista, Família, Inventários, Empresarial)
 * 3. Clínicas Veterinárias (Consultas, Cirurgias, Emergências 24h)
 * 4. Mentores de Negócios & Consultoria Empresarial (Mentorias de Alto Ticket)
 */

const path = require('path');
const fs = require('fs');
const { scrapeGoogleMaps } = require('../scraper');

const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');

// Blacklist de termos de descarte
const EXCLUDE_TERMS = [
  'faculdade', 'universidade', 'sus', 'hospital publico', 'posto de saude',
  'academia', 'crossfit', 'cross training', 'personal trainer', 'musculacao',
  'brás', 'bras', 'governo', 'prefeitura', 'ong'
];

function isDisqualified(lead) {
  const text = `${lead.name || ''} ${lead.address || ''} ${lead.website || ''}`.toLowerCase();
  return EXCLUDE_TERMS.some(t => text.includes(t));
}

const TRAFFIC_TARGETS = [
  {
    nicheLabel: 'Clínica Odontológica',
    searchQuery: 'clinica odontologica implantes',
    location: 'São Paulo',
    targetPitch: 'Atração contínua de pacientes particulares para implantes e próteses via Google Ads'
  },
  {
    nicheLabel: 'Escritório de Advocacia',
    searchQuery: 'escritorio de advocacia',
    location: 'São Paulo',
    targetPitch: 'Captação ativa de clientes qualificados no Google Search para ações de alto valor'
  },
  {
    nicheLabel: 'Clínica Veterinária',
    searchQuery: 'clinica veterinaria 24 horas',
    location: 'São Paulo',
    targetPitch: 'Fluxo contínuo de emergências e consultas particulares via Google Maps e Search'
  },
  {
    nicheLabel: 'Mentor de Negócios',
    searchQuery: 'consultoria empresarial mentor de negocios',
    location: 'São Paulo',
    targetPitch: 'Geração de novos mentorados e clientes de alto ticket para consultoria'
  }
];

async function runRecurringTrafficScraper() {
  console.log('================================================================');
  console.log('🚀 VARREDURA MESTRA: NICHOS DE GESTÃO DE TRÁFEGO PAGO RECORRENTE');
  console.log('================================================================');

  let totalNewAdded = 0;
  const summaryReport = [];

  for (const target of TRAFFIC_TARGETS) {
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

      console.log(`\n   ✓ Extraídos inicialmente: ${results.length} estabelecimentos.`);

      const qualified = results.filter(lead => {
        if (isDisqualified(lead)) {
          return false;
        }
        lead.niche = target.nicheLabel;
        lead.opportunity = {
          score: 5,
          type: 'ouro',
          label: '💎 Ouro: Gestão de Tráfego Pago Recorrente',
          attackAngle: target.targetPitch
        };
        lead.notes = target.targetPitch;
        return true;
      });

      console.log(`   🎯 Leads qualificados para tráfego pago: ${qualified.length}`);

      const existingLeads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
      const existingPhones = new Set(existingLeads.map(l => l.cleanPhone).filter(Boolean));
      const existingNames = new Set(existingLeads.map(l => (l.name || '').toLowerCase().trim()).filter(Boolean));

      let addedCount = 0;
      for (const qLead of qualified) {
        const nameLower = (qLead.name || '').toLowerCase().trim();
        if (existingNames.has(nameLower)) continue;
        if (qLead.cleanPhone && existingPhones.has(qLead.cleanPhone)) continue;

        existingLeads.unshift(qLead);
        existingNames.add(nameLower);
        if (qLead.cleanPhone) existingPhones.add(qLead.cleanPhone);
        addedCount++;
      }

      fs.writeFileSync(LEADS_FILE, JSON.stringify(existingLeads, null, 2), 'utf8');
      console.log(`   💾 ${addedCount} novos clientes potenciais salvos no CRM!`);

      totalNewAdded += addedCount;
      summaryReport.push({
        ramo: target.nicheLabel,
        adicionados: addedCount
      });

    } catch (err) {
      console.error(`   ❌ Falha ao varrer ${target.nicheLabel}:`, err.message);
    }
  }

  console.log('\n================================================================');
  console.log('✅ VARREDURA DE GESTÃO DE TRÁFEGO FINALIZADA!');
  console.log(`Total de novos leads para contratos recorrentes: ${totalNewAdded}`);
  summaryReport.forEach(r => console.log(` - ${r.ramo}: +${r.adicionados} leads`));
  console.log('================================================================\n');

  return { totalNewAdded, summaryReport };
}

if (require.main === module) {
  runRecurringTrafficScraper()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Erro na execução:', err);
      process.exit(1);
    });
}

module.exports = { runRecurringTrafficScraper };

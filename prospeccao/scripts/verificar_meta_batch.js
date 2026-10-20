const fs = require('fs');
const path = require('path');
const { checkMetaAdsLibrary, calculateLeadScore } = require('../auditor.js');

const LEADS_FILE = path.resolve(__dirname, '../data/leads.json');

/**
 * Script para rodar verificação autônoma na Meta Ads Library em lote para os melhores leads
 * Uso: node prospeccao/scripts/verificar_meta_batch.js [limite] [nicho_opcional]
 */
async function runBatchMetaCheck() {
  const args = process.argv.slice(2);
  const limit = parseInt(args[0]) || 10;
  const nicheFilter = args[1] ? args[1].toLowerCase() : null;

  console.log(`=======================================================`);
  console.log(`🚀 [META ADS AUDITOR] Iniciando Verificação Autônoma em Lote`);
  console.log(`   Limite de leads nesta rodada: ${limit}`);
  if (nicheFilter) console.log(`   Filtro de nicho: ${nicheFilter}`);
  console.log(`=======================================================\n`);

  if (!fs.existsSync(LEADS_FILE)) {
    console.error('Arquivo leads.json não encontrado!');
    return;
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));

  // Selecionar leads prioritários não verificados ainda
  const candidates = leads.filter(l => {
    // Apenas leads que ainda não foram auditados na Meta
    if (l.metaAds && l.metaAds.checked) return false;
    // Priorizar quem tem celular
    if (!l.hasMobile) return false;
    // Se tiver filtro de nicho
    if (nicheFilter && !(l.niche || '').toLowerCase().includes(nicheFilter)) return false;
    return true;
  });

  // Ordenar pelos maiores scores primeiro
  candidates.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  const targetLeads = candidates.slice(0, limit);
  console.log(`Encontrados ${candidates.length} candidatos elegíveis. Processando os top ${targetLeads.length}...\n`);

  let countWithAds = 0;
  let countZeroAds = 0;
  let countErrors = 0;

  for (let i = 0; i < targetLeads.length; i++) {
    const lead = targetLeads[i];
    const compName = lead.name || lead.company;
    console.log(`[${i + 1}/${targetLeads.length}] 🔍 Auditando: "${compName}" (${lead.niche}) | Score atual: ${lead.priorityScore} pts`);

    try {
      const metaResult = await checkMetaAdsLibrary(compName, lead.website, 12000);
      lead.metaAds = metaResult;

      // Recalcular Score com os dados atualizados
      const scoreResult = calculateLeadScore(lead, lead.siteAudit, lead.mapsAudit, lead.metaAds);
      const oldScore = lead.priorityScore;
      lead.priorityScore = scoreResult.priorityScore;
      lead.tier = scoreResult.tier;
      lead.score = Math.round(scoreResult.priorityScore / 10);

      if (metaResult.hasActiveAds) {
        countWithAds++;
        console.log(`   🟢 ANÚNCIOS ATIVOS: ${metaResult.adCountText} | Score: ${oldScore} -> ${lead.priorityScore} (${lead.tier})`);
      } else {
        countZeroAds++;
        console.log(`   ⚪ SEM ANÚNCIOS ATIVOS: Oportunidade Tráfego do Zero! | Score: ${oldScore} -> ${lead.priorityScore} (${lead.tier})`);
      }

      // Persistir imediatamente no leads.json
      fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');

      // Pequena pausa respeitosa entre requisições
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      countErrors++;
      console.error(`   ❌ Erro ao verificar "${compName}": ${err.message}`);
    }
  }

  console.log(`\n================ RESUMO DA RODADA ================`);
  console.log(`Total verificados: ${targetLeads.length}`);
  console.log(`🟢 Com anúncios ativos: ${countWithAds}`);
  console.log(`⚪ Sem anúncios (oportunidade do zero): ${countZeroAds}`);
  if (countErrors > 0) console.log(`❌ Falhas: ${countErrors}`);
  console.log(`Arquivo leads.json atualizado com sucesso!`);
}

runBatchMetaCheck().catch(err => {
  console.error('Erro geral no batch:', err);
  process.exit(1);
});

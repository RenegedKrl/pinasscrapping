/**
 * Script de Pré-Auditoria e Ranqueamento de Leads (@pinas.studio)
 * 
 * Avalia todos os leads do CRM e ordena a fila de prospecção para que
 * os leads com MAIOR PROBABILIDADE DE FECHAMENTO (Alto Ticket, Sem Site,
 * Sem Botão de WhatsApp, Ficha Forte no Maps) fiquem no TOPO ABSOLUTO.
 */

const fs = require('fs');
const path = require('path');
const auditor = require('../auditor');

const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');

function calculateLeadScore(lead) {
  let score = 0;
  const reasons = [];

  const niche = (lead.niche || '').toLowerCase();
  const name = (lead.name || '').toLowerCase();
  const reviews = Number(lead.reviews) || 0;
  const rating = Number(lead.rating) || 0;

  // 1. Nicho de Alto Ticket e Recorrência (MRR)
  if (niche.includes('advoc') || niche.includes('jurídic') || name.includes('advoc')) {
    score += 35;
    reasons.push('Advocacia (Alto Ticket / Ações de valor)');
  } else if (niche.includes('vet') || niche.includes('pet') || name.includes('veterin')) {
    score += 35;
    reasons.push('Veterinária (Case Petiva / Alto fluxo de consultas)');
  } else if (niche.includes('odont') || niche.includes('dent') || name.includes('odont')) {
    score += 35;
    reasons.push('Odontologia (Implantes e procedimentos particulares)');
  } else if (niche.includes('consultor') || niche.includes('mentor') || niche.includes('treinamento') || name.includes('consultor')) {
    score += 30;
    reasons.push('Consultoria/Mentoria (Ticket B2B expressivo)');
  } else {
    score += 15;
  }

  // 2. Gargalo Digital (Dor Aguda)
  const hasWeb = !!(lead.website && lead.website.trim().length > 5);
  const siteAudit = lead.siteAudit || {};

  if (!hasWeb || lead.hasWebsite === false) {
    score += 40; // Oportunidade máxima: precisa de landing page urgente!
    reasons.push('SEM SITE PRÓPRIO (Oportunidade máxima)');
  } else if (siteAudit.isOnline) {
    if (siteAudit.hasWhatsApp === false) {
      score += 25;
      reasons.push('Tem site mas SEM BOTÃO DE WHATSAPP');
    }
    if (siteAudit.loadTimeMs > 3000) {
      score += 15;
      reasons.push(`Site lento no celular (${(siteAudit.loadTimeMs/1000).toFixed(1)}s)`);
    }
    if (siteAudit.doesPaidTraffic === false) {
      score += 15;
      reasons.push('Não faz tráfego pago (sem Pixel/Google Tag)');
    }
  } else if (siteAudit.isOnline === false) {
    score += 30;
    reasons.push('Site fora do ar ou com erro no Maps');
  } else {
    // Tem site mas ainda não auditado
    score += 20;
  }

  // 3. Força no Google Maps (Prova social que o negócio tem clientes e caixa)
  if (rating >= 4.5 && reviews >= 15) {
    score += 25;
    reasons.push(`Ficha forte no Maps (★ ${rating} com ${reviews} reviews)`);
  } else if (reviews >= 5) {
    score += 15;
    reasons.push(`Avaliações ativas no Maps (${reviews} reviews)`);
  }

  // Classificar Tiers
  let tier = '🥈 Prata';
  let tierScore = 5;
  if (score >= 80) {
    tier = '💎 Diamante (Alta Conversão)';
    tierScore = 10;
  } else if (score >= 60) {
    tier = '🥇 Ouro (Forte Potencial)';
    tierScore = 8;
  }

  return {
    numericScore: score,
    tierScore,
    tier,
    reasons
  };
}

async function rankAllLeads() {
  console.log('================================================================');
  console.log('📊 RANQUEAMENTO ESTRATÉGICO DE LEADS (MAIOR RETORNO NO TOPO)');
  console.log('================================================================\n');

  if (!fs.existsSync(LEADS_FILE)) {
    console.error('Arquivo leads.json não encontrado!');
    return;
  }

  const raw = fs.readFileSync(LEADS_FILE, 'utf8');
  let leads = JSON.parse(raw);

  console.log(`Carregados ${leads.length} leads do CRM.`);
  console.log(`Calculando probabilidade de fechamento para cada empresa...\n`);

  for (const lead of leads) {
    const evaluation = calculateLeadScore(lead);
    lead.priorityScore = evaluation.numericScore;
    lead.score = evaluation.tierScore;
    lead.opportunity = {
      score: evaluation.tierScore,
      numericRank: evaluation.numericScore,
      type: evaluation.tier.includes('Diamante') ? 'diamante' : (evaluation.tier.includes('Ouro') ? 'ouro' : 'prata'),
      label: evaluation.tier,
      attackAngle: evaluation.reasons.join(' | ')
    };
  }

  // Ordenar leads:
  // 1º: Status 'contatado' ou 'reuniao' que já têm conversa em andamento continuam preservados
  // 2º: Leads 'novo' ordenados por priorityScore DECRESCENTE (melhores no topo!)
  leads.sort((a, b) => {
    // Se um já está em atendimento/reunião, mantém no topo operacional
    const statusPriority = { reuniao: 3, contatado: 2, novo: 1, perdido: 0 };
    const pA = statusPriority[a.status] || 0;
    const pB = statusPriority[b.status] || 0;

    if (pA !== pB) return pB - pA;
    return (b.priorityScore || 0) - (a.priorityScore || 0);
  });

  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');

  // Relatório das Top 10 Empresas no topo
  console.log('🏆 TOP 10 LEADS COM MAIOR PROBABILIDADE DE FECHAMENTO (NO TOPO DO CRM):\n');
  leads.slice(0, 10).forEach((l, idx) => {
    console.log(`${idx + 1}. [${l.opportunity.label}] ${l.name} (${l.neighborhood || 'SP'})`);
    console.log(`   Nicho: ${l.niche || 'N/A'} | Status: ${l.status}`);
    console.log(`   Pontos: ${l.priorityScore} pts | Motivos: ${l.opportunity.attackAngle}\n`);
  });

  const diamantes = leads.filter(l => l.opportunity?.type === 'diamante').length;
  const ouros = leads.filter(l => l.opportunity?.type === 'ouro').length;
  const pratas = leads.filter(l => l.opportunity?.type === 'prata').length;

  console.log('================================================================');
  console.log(`✅ Fila organizada no topo: ${diamantes} Diamantes | ${ouros} Ouros | ${pratas} Pratas`);
  console.log('================================================================');
}

rankAllLeads().catch(console.error);

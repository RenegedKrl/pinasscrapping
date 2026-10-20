const fs = require('fs');
const path = require('path');

const leads = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'leads.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'whatsapp_store.json'), 'utf8'));

// Detecta mensagens automáticas de WhatsApp Business
function isAutomatedGreeting(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase().trim();
  const businessPatterns = [
    'horário de atendimento', 'horario de atendimento',
    'agradecemos seu contato', 'agradecemos sua mensagem', 'agradece seu contato', 'agradece sua mensagem',
    'mensagem automática', 'mensagem automatica',
    'estamos ausentes', 'estou ausente', 'no momento estamos ausentes', 'fora do nosso horário', 'fora do horario',
    'assim que possível', 'assim que possivel', 'logo mais volto para te responder', 'em breve respondo', 'em breve responderemos',
    'conhecer meus principais serviços no catálogo', 'conhecer meu catálogo', 'explore meu catálogo', 'explore nosso catálogo',
    'catálogo 📌', 'catalogo 📌',
    'seja muito bem-vinda à', 'seja muito bem-vindo à', 'seja muito bem-vinda ao', 'seja muito bem-vindo ao',
    'atendimento automatizado', 'resposta automatica', 'resposta automática',
    'não estamos disponíveis no momento', 'nao estamos disponiveis no momento',
    'como podemos ajudar', 'o que posso ajudar',
    'escolha uma especialidade', 'bem-vindos ao nosso canal de atendimento',
    'assistente virtual', 'informações para orçamento', 'para realizar seu pedido',
    'não podemos atender sua ligação', 'nao podemos atender sua ligacao',
    'nossa equipe responderá assim que possível', 'retornaremos o mais breve possível'
  ];
  return businessPatterns.some(p => t.includes(p));
}

const qualified = [];

for (const lead of leads) {
  if (lead.status === 'perdido' || lead.status === 'arquivado') continue;
  if (lead.manualControl || lead.humanTakeover) continue;

  const phone = lead.cleanPhone || lead.phone;
  if (!phone) continue;
  const digits = String(phone).replace(/\D/g, '');
  const full = digits.startsWith('55') ? digits : '55' + digits;
  
  let msgs = store.messages[full + '@s.whatsapp.net'] || [];
  if (msgs.length === 0 && full.length === 13) msgs = store.messages[full.slice(0, 4) + full.slice(5) + '@s.whatsapp.net'] || [];
  if (msgs.length === 0 && full.length === 12) msgs = store.messages[full.slice(0, 4) + '9' + full.slice(4) + '@s.whatsapp.net'] || [];
  if (msgs.length === 0) {
    const last8 = digits.slice(-8);
    for (const [k, v] of Object.entries(store.messages || {})) {
      if (k.includes(last8)) { msgs = v; break; }
    }
  }

  const validMsgs = msgs.filter(m => m && !m.text?.startsWith('[Sistema]'));
  if (validMsgs.length === 0) continue;

  const outbound = validMsgs.filter(m => m.fromMe);
  const inbound = validMsgs.filter(m => !m.fromMe);
  const hasKauAudio = outbound.some(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));
  const hasKauManual = outbound.some(m => m.isBot === false);
  const hasInboundAudio = inbound.some(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));

  // Se Kauê mandou áudio ou mensagem manual: BLOQUEADO
  if (hasKauAudio || hasKauManual) {
    continue;
  }

  // Se o lead mandou áudio: vai pro Kauê
  if (hasInboundAudio) {
    continue;
  }

  const lastMsg = validMsgs[validMsgs.length - 1];
  if (lastMsg.fromMe) {
    // Nós mandamos a última mensagem, estamos aguardando o lead
    continue;
  }

  // Se a última mensagem for resposta automática de bot / menu da empresa:
  const isAuto = isAutomatedGreeting(lastMsg.text);

  qualified.push({
    lead,
    isAuto,
    lastMsg,
    validMsgs
  });
}

console.log('--- LEADS QUALIFICADOS PARA RESPOSTA (SEM INTERVENÇÃO DO KAUÊ) ---');
console.log('Total encontrados:', qualified.length);
qualified.forEach((q, i) => {
  console.log(`[#${i+1}] ${q.lead.name} (${q.lead.cleanPhone}) [isAutoGreeting: ${q.isAuto}]`);
  console.log(`     Última msg: ${(q.lastMsg.text || q.lastMsg.type || '').replace(/\n/g, ' ').slice(0, 100)}`);
});

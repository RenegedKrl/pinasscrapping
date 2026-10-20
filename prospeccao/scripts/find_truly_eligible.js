const fs = require('fs');
const path = require('path');

const leads = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'leads.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'whatsapp_store.json'), 'utf8'));

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
    'escolha uma especialidade', 'bem-vindos ao nosso canal de atendimento',
    'assistente virtual', 'informações para orçamento',
    'não podemos atender sua ligação', 'nao podemos atender sua ligacao',
    'nossa equipe responderá assim que possível', 'retornaremos o mais breve possível'
  ];
  return businessPatterns.some(p => t.includes(p));
}

function checkLeadManual(lead, msgs) {
  if (lead.manualControl || lead.humanTakeover) return true;
  const outbound = msgs.filter(m => m.fromMe);
  const audioMsg = outbound.find(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));
  if (audioMsg) return true;
  if (outbound.some(m => m.isBot === false)) return true;

  const botTexts = new Set((lead.stageHistory || []).map(h => (h.text || '').trim().toLowerCase()));
  for (const m of outbound) {
    const txt = (m.text || '').trim().toLowerCase();
    if (!txt) continue;
    let matched = false;
    for (const b of botTexts) {
      if (b && (b.includes(txt.slice(0, 30)) || txt.includes(b.slice(0, 30)))) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (txt.includes('aqui é o kauê, da pinas') || txt.includes('aqui é o kauê da pinas') || txt.includes('pinas vet ai') || txt.includes('pinas target ai') || txt.startsWith('olá, tudo bem? é d') || txt.startsWith('opa, tudo bem? falo com o responsável') || txt.startsWith('opa, tudo bem?')) {
        matched = true;
      }
    }
    if (!matched) {
      return true; // Manual do Kauê!
    }
  }
  return false;
}

const trulyEligible = [];

for (const lead of leads) {
  if (lead.status === 'perdido' || lead.status === 'arquivado') continue;

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

  const valid = msgs.filter(m => m && !m.text?.startsWith('[Sistema]'));
  if (valid.length === 0) continue;

  const lastMsg = valid[valid.length - 1];
  if (lastMsg.fromMe) continue; // Nós enviamos a última mensagem

  const isManual = checkLeadManual(lead, valid);
  if (isManual) continue; // Kauê mandou mensagem ou áudio

  // Verificar se o lead mandou áudio
  if (lastMsg.type === 'audio' || (lastMsg.text && lastMsg.text.includes('[Áudio de voz]'))) {
    continue; // Áudio do lead vai pro Kauê
  }

  const isAuto = isAutomatedGreeting(lastMsg.text);

  trulyEligible.push({
    lead,
    isAutoGreeting: isAuto,
    lastMsgText: lastMsg.text,
    lastMsgTime: new Date(lastMsg.timestamp).toLocaleString('pt-BR')
  });
}

console.log('Total de leads elegíveis para resposta da IA (SEM áudio ou mensagem do Kauê):', trulyEligible.length);
trulyEligible.forEach((e, idx) => {
  console.log(`[#${idx+1}] ${e.lead.name} (${e.lead.cleanPhone}) [AutoGreeting: ${e.lead.isAutoGreeting}]`);
  console.log(`     Data: ${e.lastMsgTime}`);
  console.log(`     Mensagem recebida: ${e.lastMsgText.replace(/\n/g, ' ').slice(0, 100)}`);
});

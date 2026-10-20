const fs = require('fs');
const path = require('path');

const leads = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'leads.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'whatsapp_store.json'), 'utf8'));

function isKaueManual(lead, msgs) {
  if (lead.manualControl || lead.humanTakeover) return { manual: true, reason: 'Flag manualControl/humanTakeover ativa' };

  const outbound = msgs.filter(m => m.fromMe);

  // 1. Áudio enviado por nós
  const audioMsg = outbound.find(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));
  if (audioMsg) return { manual: true, reason: 'Áudio gravado pelo Kauê: ' + (audioMsg.text || audioMsg.mediaUrl) };

  // 2. Flag explícita isBot === false
  const explicitManual = outbound.find(m => m.isBot === false);
  if (explicitManual) return { manual: true, reason: 'Mensagem manual explícita (isBot === false): ' + explicitManual.text };

  // 3. Cruzamento com stageHistory do robô
  const botTexts = new Set(
    (lead.stageHistory || []).map(h => (h.text || '').trim().toLowerCase())
  );

  // Se o Kauê mandou uma mensagem que não está no histórico do robô
  for (const m of outbound) {
    const txt = (m.text || '').trim().toLowerCase();
    if (!txt) continue;
    // Checar se bate com stageHistory
    let matched = false;
    for (const b of botTexts) {
      if (b && (b.includes(txt.slice(0, 30)) || txt.includes(b.slice(0, 30)))) {
        matched = true;
        break;
      }
    }
    // Checar padrões universais de bot
    if (!matched) {
      if (txt.includes('aqui é o kauê, da pinas') || txt.includes('aqui é o kauê da pinas') || txt.includes('pinas vet ai') || txt.includes('pinas target ai') || txt.startsWith('olá, tudo bem? é d') || txt.startsWith('opa, tudo bem? falo com o responsável')) {
        matched = true;
      }
    }

    if (!matched) {
      return { manual: true, reason: 'Texto manual enviado pelo Kauê: ' + m.text };
    }
  }

  return { manual: false };
}

const audit = [];
for (const lead of leads) {
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

  const result = isKaueManual(lead, valid);
  if (result.manual) {
    audit.push({ name: lead.name, phone: lead.cleanPhone, reason: result.reason });
  }
}

console.log('Total de leads com intervenção do Kauê:', audit.length);
console.log(JSON.stringify(audit, null, 2));

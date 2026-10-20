const fs = require('fs');
const path = require('path');

const leads = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'leads.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'whatsapp_store.json'), 'utf8'));

console.log('Total leads:', leads.length);

let count = 0;
for (const lead of leads) {
  const phone = lead.cleanPhone || lead.phone;
  if (!phone) continue;
  const digits = String(phone).replace(/\D/g, '');
  const full = digits.startsWith('55') ? digits : '55' + digits;
  
  let msgs = store.messages[full + '@s.whatsapp.net'] || [];
  if (msgs.length === 0 && full.length === 13) {
    msgs = store.messages[full.slice(0, 4) + full.slice(5) + '@s.whatsapp.net'] || [];
  }
  if (msgs.length === 0 && full.length === 12) {
    msgs = store.messages[full.slice(0, 4) + '9' + full.slice(4) + '@s.whatsapp.net'] || [];
  }
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

  const hasManualAudio = outbound.some(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));
  const hasManualText = outbound.some(m => m.isBot === false);
  const lastMsg = validMsgs[validMsgs.length - 1];

  if (!lastMsg.fromMe) {
    count++;
    console.log(`[#${count}] LEAD: ${lead.name} (${digits})`);
    console.log(`   Status: ${lead.status} | Manual: ${lead.manualControl || false} | Takeover: ${lead.humanTakeover || false}`);
    console.log(`   Kauê Audio: ${hasManualAudio} | Kauê Manual Text: ${hasManualText}`);
    console.log(`   Outbound: ${outbound.length} | Inbound: ${inbound.length}`);
    console.log(`   Last Msg (${new Date(lastMsg.timestamp).toLocaleString('pt-BR')}): ${(lastMsg.text || lastMsg.type || '').replace(/\n/g, ' ').slice(0, 110)}`);
    console.log('---------------------------------------------------------');
  }
}
console.log(`Total leads waiting for response: ${count}`);

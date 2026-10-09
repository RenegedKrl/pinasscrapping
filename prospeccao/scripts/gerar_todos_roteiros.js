const fs = require('fs');
const path = require('path');
const conversationGuard = require('../conversation_guard');
const gemini = require('../gemini');

const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');
const STORE_FILE = path.join(__dirname, '..', 'data', 'whatsapp_store.json');

async function main() {
  console.log('====================================================');
  console.log('🚀 GERANDO ROTEIROS DE WHATSAPP PARA TODA A BASE');
  console.log('====================================================\n');

  if (!fs.existsSync(LEADS_FILE)) {
    console.error('Arquivo leads.json não encontrado!');
    return;
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  let storeData = { chats: {}, messages: {} };
  if (fs.existsSync(STORE_FILE)) {
    try {
      storeData = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch (e) {}
  }

  console.log(`📊 Total de leads na base: ${leads.length}`);

  let gerados = 0;
  let jaTinham = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    
    // Se já tem roteiro completo gerado, mantém
    if (lead.conversationScript && lead.conversationScript.conversationSummary && lead.conversationScript.callScript) {
      jaTinham++;
      continue;
    }

    const messages = conversationGuard.findMessagesForLead(lead, storeData);
    const validMsgs = (messages || []).filter(m => m && (m.text || m.type === 'image' || m.type === 'audio'));
    const hasCustomerReplied = validMsgs.some(m => !m.fromMe) || (lead.status === 'respondeu');

    const scriptResult = gemini.buildInstantWhatsAppConversationScript({
      lead,
      messages: validMsgs,
      hasCustomerReplied
    });

    lead.conversationScript = scriptResult;
    lead.conversationScriptGeneratedAt = new Date().toISOString();
    gerados++;
  }

  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');

  console.log('====================================================');
  console.log('🎉 PROCESSAMENTO CONCLUÍDO COM SUCESSO!');
  console.log(`✅ Já possuíam roteiro: ${jaTinham}`);
  console.log(`✅ Novos roteiros gerados: ${gerados}`);
  console.log(`✅ Total de leads cobertos: ${jaTinham + gerados}/${leads.length} (100% da base)`);
  console.log('====================================================');
}

main().catch(console.error);

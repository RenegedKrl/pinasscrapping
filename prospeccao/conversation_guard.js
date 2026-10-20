/**
 * Módulo de Guarda de Conversas e Anti-Spam da Pinas (@pinas.studio)
 * 
 * REGRA INEGOCIÁVEL DEFINIDA PELO KAUÊ:
 * "Nunca pode mandar mais de uma mensagem para um lead. Se ele não responder,
 *  o sistema identifica isso e NUNCA manda outra mensagem.
 *  SÓ RESPONDE QUANDO O LEAD RESPONDER."
 */

const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'data', 'whatsapp_store.json');
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

// Blacklist rígida da Pinas (Clientes Atuais & Região/Lojas do Brás)
const STRICT_BLACKLIST = [
  'petiva',
  'pink luxo',
  'chay b',
  'chayb',
  'bem zanza',
  'bem zânza',
  'brás',
  'bras',
  'happy play dogs'
];

/**
 * Verifica se o lead pertence à Blacklist de Proteção
 */
function isBlacklisted(lead) {
  if (!lead) return true;
  const target = `${lead.name || ''} ${lead.niche || ''} ${lead.neighborhood || ''} ${lead.address || ''} ${lead.city || ''} ${lead.notes || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return STRICT_BLACKLIST.some(term => {
    if (term === 'bras') {
      return /\bbras\b/.test(target);
    }
    return target.includes(term);
  });
}

/**
 * Normaliza qualquer número para dígitos limpos
 */
function cleanDigits(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Lê o Store do WhatsApp de forma segura em memória ou direto do arquivo
 */
function getStoreData(storeInstance) {
  if (storeInstance && typeof storeInstance.getStore === 'function') {
    return storeInstance.getStore();
  }
  if (storeInstance && storeInstance.messages) {
    return storeInstance;
  }
  try {
    if (fs.existsSync(STORE_FILE)) {
      return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    }
  } catch (err) {}
  return { chats: {}, messages: {} };
}

/**
 * Busca todas as mensagens de um lead no Store do WhatsApp com correspondência flexível:
 * - JID direto (5511998947237@s.whatsapp.net)
 * - JID sem 9º dígito (551198947237@s.whatsapp.net)
 * - JID com 9º dígito (5511998947237@s.whatsapp.net)
 * - Busca reversa pelos últimos 8 dígitos em todas as conversas
 */
function findMessagesForLead(lead, storeInstance) {
  const phone = lead?.cleanPhone || lead?.phone;
  const digits = cleanDigits(phone);
  if (!digits || digits.length < 8) return [];

  const store = getStoreData(storeInstance);
  const messagesMap = store.messages || {};

  const full = digits.startsWith('55') ? digits : '55' + digits;

  // 1. JID canônico exato
  const jid1 = `${full}@s.whatsapp.net`;
  if (Array.isArray(messagesMap[jid1]) && messagesMap[jid1].length > 0) {
    return messagesMap[jid1];
  }

  // 2. Com/sem nono dígito (Brasil)
  if (full.length === 13) {
    const sem9 = full.slice(0, 4) + full.slice(5);
    const jid2 = `${sem9}@s.whatsapp.net`;
    if (Array.isArray(messagesMap[jid2]) && messagesMap[jid2].length > 0) {
      return messagesMap[jid2];
    }
  } else if (full.length === 12) {
    const com9 = full.slice(0, 4) + '9' + full.slice(4);
    const jid3 = `${com9}@s.whatsapp.net`;
    if (Array.isArray(messagesMap[jid3]) && messagesMap[jid3].length > 0) {
      return messagesMap[jid3];
    }
  }

  // 3. Fallback: procurar pelo sufixo dos últimos 8 dígitos
  const last8 = digits.slice(-8);
  for (const [key, msgs] of Object.entries(messagesMap)) {
    if (key.includes(last8) && Array.isArray(msgs) && msgs.length > 0) {
      return msgs;
    }
  }

  return [];
}

/**
 * Analisa o estado real e inquestionável da conversa com o lead
 */
function getConversationState(lead, storeInstance) {
  const allMsgs = findMessagesForLead(lead, storeInstance);

  // Filtrar apenas mensagens de texto reais trocadas (ignorando logs de sistema)
  const validMsgs = allMsgs.filter(m => {
    if (!m) return false;
    if (m.text && m.text.startsWith('[Sistema]')) return false;
    return !!(m.text || m.type === 'image' || m.type === 'audio' || m.mediaUrl);
  });

  const totalMessages = validMsgs.length;
  const outboundMsgs = validMsgs.filter(m => !!m.fromMe);
  const inboundMsgs = validMsgs.filter(m => !m.fromMe);

  let lastSender = 'none'; // 'me' | 'lead' | 'none'
  let lastMessage = null;

  if (totalMessages > 0) {
    lastMessage = validMsgs[validMsgs.length - 1];
    lastSender = lastMessage.fromMe ? 'me' : 'lead';
  }

  // Verifica se há evidência inequívoca de intervenção manual do Kauê:
  // 1. Flag explícita no lead (manualControl ou humanTakeover)
  // 2. Presença de áudios de voz gravados por nós (o robô nunca envia áudio PTT)
  // 3. Mensagens com flag isBot === false
  const hasManualAudio = outboundMsgs.some(m => m.type === 'audio' || (m.text && (m.text.includes('[Áudio de voz]') || m.text.includes('[Audio]'))));
  const hasManualFlag = outboundMsgs.some(m => m.isBot === false);
  const hasManualIntervention = !!(lead?.manualControl || lead?.humanTakeover || hasManualAudio || hasManualFlag);

  // Se a última mensagem foi nossa, estamos aguardando a resposta do lead!
  const isWaitingForCustomerReply = (lastSender === 'me');
  const customerHasEverReplied = inboundMsgs.length > 0;

  return {
    totalMessages,
    outboundCount: outboundMsgs.length,
    inboundCount: inboundMsgs.length,
    lastSender,
    lastMessage,
    hasManualIntervention,
    isWaitingForCustomerReply,
    customerHasEverReplied
  };
}

/**
 * AVALIAÇÃO DE SEGURANÇA E REGRA DE OURO
 * Determina com precisão se é permitido enviar uma nova mensagem para o lead.
 * 
 * Regra:
 * - Lead sob atendimento manual do Kauê -> BLOQUEADO TOTALMENTE (IA NUNCA interfere)
 * - Lead novo (sem mensagem prévia) -> PERMITIDO (1º contato / outbound frio)
 * - Lead já recebeu mensagem nossa e NÃO respondeu -> BLOQUEADO TOTALMENTE
 * - Lead respondeu por último -> PERMITIDO (responder à dúvida dele)
 */
function canSendMessageToLead(lead, storeInstance, options = {}) {
  if (!lead) {
    return {
      allowed: false,
      reason: 'Lead inexistente ou inválido.',
      code: 'INVALID_LEAD'
    };
  }

  // 1. Blacklist Estrita
  if (isBlacklisted(lead)) {
    return {
      allowed: false,
      reason: 'Lead protegido por Blacklist da Pinas (Cliente ativo ou região do Brás).',
      code: 'BLACKLISTED'
    };
  }

  // 2. Lead encerrado
  if (lead.status === 'perdido' || lead.status === 'arquivado') {
    return {
      allowed: false,
      reason: `Lead com status "${lead.status}". Não recebe mais mensagens.`,
      code: 'STATUS_CLOSED'
    };
  }

  // 3. INTERVENÇÃO MANUAL DO KAUÊ (HUMAN TAKEOVER):
  // Se o Kauê já assumiu o atendimento manual deste lead, a IA é SILENCIADA DEFINITIVAMENTE!
  if (lead.manualControl || lead.humanTakeover) {
    return {
      allowed: false,
      reason: 'Lead sob atendimento manual exclusivo do Kauê. O robô/IA está silenciado para esta conversa.',
      code: 'HUMAN_TAKEOVER'
    };
  }

  // 4. Estado real da conversa no WhatsApp
  const state = getConversationState(lead, storeInstance);

  if (state.hasManualIntervention) {
    return {
      allowed: false,
      reason: 'Detectada intervenção humana do Kauê no histórico da conversa (áudio ou mensagem manual). O robô/IA cedeu o controle.',
      code: 'HUMAN_TAKEOVER'
    };
  }

  // REGRA DE OURO DO KAUÊ:
  // Se a última mensagem foi enviada por nós (Pinas/Kauê), o cliente AINDA NÃO RESPONDEU.
  // NUNCA PODE MANDAR MAIS DE UMA MENSAGEM SE ELE NÃO RESPONDER!
  if (state.isWaitingForCustomerReply) {
    return {
      allowed: false,
      waitingForCustomerReply: true,
      lastSender: 'me',
      totalMessages: state.totalMessages,
      outboundCount: state.outboundCount,
      inboundCount: state.inboundCount,
      reason: `Aguardando resposta do lead: Já enviamos mensagem e o cliente ainda não respondeu. A regra da Pinas proíbe enviar mais de uma mensagem sem retorno.`,
      code: 'WAITING_FOR_REPLY'
    };
  }

  // 4. Verificação de consistência em leads.json se o store não tiver mensagens
  if (state.totalMessages === 0) {
    // Se no leads.json consta como 'contatado' ou tem lastContact sem repliedAt,
    // significa que já foi contatado em outro momento e não temos resposta registrada!
    if (lead.status === 'contatado' && !lead.repliedAt) {
      return {
        allowed: false,
        waitingForCustomerReply: true,
        lastSender: 'me',
        totalMessages: 1,
        outboundCount: 1,
        inboundCount: 0,
        reason: `Lead já marcado como contatado sem resposta registrada. Aguardando o cliente responder.`,
        code: 'WAITING_FOR_REPLY'
      };
    }

    // Se é um lead virgem (status novo), permitido disparar a 1ª mensagem!
    if (lead.status === 'novo' || !lead.lastContact) {
      return {
        allowed: true,
        waitingForCustomerReply: false,
        lastSender: 'none',
        totalMessages: 0,
        outboundCount: 0,
        inboundCount: 0,
        reason: `Lead novo sem contato prévio. Permitido primeiro contato de abordagem fria.`,
        code: 'ALLOWED_FIRST_CONTACT'
      };
    }
  }

  // 5. Se o lead respondeu por último, é 100% PERMITIDO responder à mensagem dele!
  if (state.lastSender === 'lead') {
    return {
      allowed: true,
      waitingForCustomerReply: false,
      lastSender: 'lead',
      totalMessages: state.totalMessages,
      outboundCount: state.outboundCount,
      inboundCount: state.inboundCount,
      reason: `Lead respondeu por último. Permitido responder.`,
      code: 'ALLOWED_REPLY'
    };
  }

  // Caso padrão por segurança: bloqueia
  return {
    allowed: false,
    reason: `Não foi possível garantir a segurança do envio para este contato.`,
    code: 'BLOCKED_DEFAULT'
  };
}

/**
 * Reconcilia a base de dados leads.json contra o WhatsApp Store.
 * Garante que:
 * 1. Nenhum lead que já recebeu mensagem permaneça com status 'novo'.
 * 2. Leads que receberam mensagem e não responderam fiquem com status 'contatado'.
 * 3. Leads que responderam fiquem com status 'respondeu'.
 */
function reconcileLeadsDatabase(storeInstance) {
  try {
    if (!fs.existsSync(LEADS_FILE)) return { updated: 0, total: 0 };
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    if (!Array.isArray(leads)) return { updated: 0, total: 0 };

    let updatedCount = 0;

    for (const lead of leads) {
      const state = getConversationState(lead, storeInstance);
      const prevStatus = lead.status;

      if (state.totalMessages > 0) {
        if (state.isWaitingForCustomerReply) {
          // Última mensagem é nossa: o lead está aguardando resposta
          if (lead.status === 'novo') {
            lead.status = 'contatado';
            lead.stage = lead.stage || 1;
            lead.lastContact = lead.lastContact || (state.lastMessage?.timestamp ? new Date(state.lastMessage.timestamp).toISOString() : new Date().toISOString());
            updatedCount++;
            console.log(`[Reconciliação] Lead "${lead.name}" corrigido de "novo" para "contatado" (já possui mensagem enviada).`);
          }
        } else if (state.lastSender === 'lead') {
          // Última mensagem é do lead: o lead respondeu!
          if (lead.status === 'novo' || lead.status === 'contatado') {
            lead.status = 'respondeu';
            lead.repliedAt = lead.repliedAt || (state.lastMessage?.timestamp ? new Date(state.lastMessage.timestamp).toISOString() : new Date().toISOString());
            updatedCount++;
            console.log(`[Reconciliação] Lead "${lead.name}" corrigido para "respondeu" (última mensagem recebida do cliente).`);
          }
        }
      }
    }

    if (updatedCount > 0) {
      fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
      console.log(`[Reconciliação Concluída] ${updatedCount} leads sincronizados com o histórico real do WhatsApp.`);
    }

    return { updated: updatedCount, total: leads.length };
  } catch (err) {
    console.error('[Reconciliação Erro]:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  isBlacklisted,
  cleanDigits,
  findMessagesForLead,
  getConversationState,
  canSendMessageToLead,
  reconcileLeadsDatabase
};

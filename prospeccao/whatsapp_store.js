const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'data', 'whatsapp_store.json');
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const MEDIA_DIR = path.join(__dirname, 'data', 'media');
const SESSION_DIR = path.join(__dirname, 'data', 'whatsapp_session');

// Garante que o diretório de mídia exista
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

let store = {
  chats: {}, // jid -> { id, name, phone, unreadCount, lastMessage, updatedAt }
  messages: {}, // jid -> [ { id, fromMe, text, timestamp, type, mediaUrl, fileName, status } ]
  contacts: {} // jid/phone -> name
};

// Carregar contatos conhecidos da base de leads
function loadLeadsIntoContacts() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
      if (Array.isArray(leads)) {
        for (const l of leads) {
          if (l.phone) {
            const digits = String(l.phone).replace(/\D/g, '');
            if (digits) {
              const fullPhone = digits.startsWith('55') ? digits : '55' + digits;
              store.contacts[fullPhone] = l.name;
              store.contacts[`${fullPhone}@s.whatsapp.net`] = l.name;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp Store] Aviso ao indexar leads em contatos:', err.message);
  }
}

// Resolver LID do WhatsApp para telefone real via mapeamentos do Baileys
function resolveLidToPhone(lid) {
  if (!lid) return null;
  const rawId = String(lid).split('@')[0].split(':')[0];
  const reverseFile = path.join(SESSION_DIR, `lid-mapping-${rawId}_reverse.json`);
  if (fs.existsSync(reverseFile)) {
    try {
      const phone = JSON.parse(fs.readFileSync(reverseFile, 'utf8'));
      return String(phone).replace(/\D/g, '');
    } catch (e) {}
  }
  return null;
}

// Resolver telefone real para LID (se existir mapeamento no Baileys)
function resolvePhoneToLid(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, '');
  const forwardFile = path.join(SESSION_DIR, `lid-mapping-${clean}.json`);
  if (fs.existsSync(forwardFile)) {
    try {
      const lid = JSON.parse(fs.readFileSync(forwardFile, 'utf8'));
      return `${lid}@lid`;
    } catch (e) {}
  }
  return null;
}

function isGenericPhoneName(name) {
  if (!name) return true;
  const clean = String(name).replace(/\D/g, '');
  return clean.length >= 8 && (name.startsWith('+') || name.startsWith('55') || name.startsWith('(') || clean === name);
}

// Unificar qualquer LID no store para o JID de telefone canônico
function unifyLidChat(lidJid) {
  if (!lidJid) return null;
  const rawLid = cleanJid(lidJid);
  const phone = resolveLidToPhone(rawLid);
  if (!phone) return null;
  const canonicalJid = `${phone}@s.whatsapp.net`;

  const lidChat = store.chats[rawLid];
  const canonicalChat = store.chats[canonicalJid];

  // Coletar mensagens de ambos os lados
  const msgsLid = store.messages[rawLid] || [];
  const msgsCanon = store.messages[canonicalJid] || [];
  const allMsgs = [...msgsCanon, ...msgsLid];

  if (allMsgs.length > 0) {
    const uniqueMap = new Map();
    for (const m of allMsgs) {
      if (m && m.id) uniqueMap.set(m.id, m);
    }
    store.messages[canonicalJid] = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  // Determinar o melhor nome de exibição (prioriza o nome real e ignora telefone genérico ou Kauê)
  let bestName = null;
  if (canonicalChat && canonicalChat.name && !isGenericPhoneName(canonicalChat.name) && canonicalChat.name !== 'Kauê Felix' && canonicalChat.name !== 'Você') {
    bestName = canonicalChat.name;
  } else if (lidChat && lidChat.name && !isGenericPhoneName(lidChat.name) && lidChat.name !== 'Kauê Felix' && lidChat.name !== 'Você') {
    bestName = lidChat.name;
  } else if (store.contacts[canonicalJid]) {
    bestName = store.contacts[canonicalJid];
  } else if (store.contacts[phone]) {
    bestName = store.contacts[phone];
  } else if (store.contacts[rawLid]) {
    bestName = store.contacts[rawLid];
  } else {
    bestName = formatPhoneDisplay(phone);
  }

  // Salvar nos contatos em cache
  if (bestName && !isGenericPhoneName(bestName)) {
    store.contacts[phone] = bestName;
    store.contacts[canonicalJid] = bestName;
    store.contacts[rawLid] = bestName;
  }

  const mergedMsgs = store.messages[canonicalJid] || [];
  const lastMsg = mergedMsgs.length > 0 ? mergedMsgs[mergedMsgs.length - 1] : (canonicalChat?.lastMessage || lidChat?.lastMessage || null);
  const unreadCount = (lastMsg && !lastMsg.fromMe) ? (canonicalChat?.unreadCount || lidChat?.unreadCount || 0) : 0;

  store.chats[canonicalJid] = {
    id: canonicalJid,
    jid: canonicalJid,
    name: bestName,
    phone: phone,
    isGroup: false,
    isGroupSubject: false,
    participantCount: 0,
    unreadCount: unreadCount,
    lastMessage: lastMsg ? {
      text: lastMsg.text,
      timestamp: lastMsg.timestamp,
      fromMe: lastMsg.fromMe,
      type: lastMsg.type,
      senderName: lastMsg.fromMe ? 'Kauê' : bestName
    } : null,
    updatedAt: lastMsg?.timestamp || Date.now()
  };

  // Remover a conversa duplicada por LID
  delete store.chats[rawLid];
  delete store.messages[rawLid];

  // Limpar também fake @s.whatsapp.net criado com número de LID se existir
  const rawLidNumber = String(rawLid).split('@')[0];
  const fakeNet = `${rawLidNumber}@s.whatsapp.net`;
  if (store.chats[fakeNet]) delete store.chats[fakeNet];
  if (store.messages[fakeNet]) delete store.messages[fakeNet];

  scheduleSave();
  console.log(`[WhatsApp Store] Conversa unificada com sucesso: ${rawLid} -> ${canonicalJid} ("${bestName}")`);
  return store.chats[canonicalJid];
}

// Obter JID Canônico (se for um @lid com telefone conhecido, unifica para @s.whatsapp.net)
function getCanonicalJid(jid) {
  if (!jid) return '';
  const cJid = cleanJid(jid);
  if (cJid.endsWith('@lid')) {
    const phone = resolveLidToPhone(cJid);
    if (phone) {
      return `${phone}@s.whatsapp.net`;
    }
  }
  return cJid;
}

// Resolver o nome de exibição de um contato ou participante
function resolveContactName(jidOrPhone) {
  if (!jidOrPhone) return null;
  const cJid = cleanJid(jidOrPhone);

  // 1. Se for LID, tenta o telefone
  const lidPhone = cJid.endsWith('@lid') ? resolveLidToPhone(cJid) : null;
  if (lidPhone && store.contacts[lidPhone]) {
    return store.contacts[lidPhone];
  }

  // 2. Procura nos contatos em cache
  if (store.contacts[cJid]) return store.contacts[cJid];
  const phone = extractPhone(cJid);
  if (store.contacts[phone]) return store.contacts[phone];

  // 3. Procura nos chats
  if (store.chats[cJid] && store.chats[cJid].name && store.chats[cJid].name !== phone) {
    return store.chats[cJid].name;
  }
  if (lidPhone && store.chats[`${lidPhone}@s.whatsapp.net`]?.name) {
    return store.chats[`${lidPhone}@s.whatsapp.net`].name;
  }

  // 4. Formata telefone
  return formatPhoneDisplay(phone);
}

function formatPhoneDisplay(digits) {
  if (!digits) return '';
  const clean = String(digits).replace(/\D/g, '');
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  return clean;
}

function loadStore() {
  try {
    store.contacts = {};
    loadLeadsIntoContacts();

    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      store.chats = {};
      store.messages = {};

      if (loaded.chats) {
        for (const [key, val] of Object.entries(loaded.chats)) {
          const cKey = cleanJid(key);
          val.id = cKey;
          val.phone = extractPhone(cKey);
          store.chats[cKey] = val;
        }
      }

      if (loaded.messages) {
        for (const [key, val] of Object.entries(loaded.messages)) {
          const cKey = cleanJid(key);
          store.messages[cKey] = val;
        }
      }

      // Migração & Limpeza Automática de LIDs e Duplicados
      performStoreMigrations();
    }
  } catch (err) {
    console.error('[WhatsApp Store] Erro ao carregar store:', err.message);
  }
}

// Migração: Unifica conversas de LIDs conhecidos para o JID de telefone correspondente
function performStoreMigrations() {
  let modified = false;

  // 1. Varre e unifica automaticamente TODOS os LIDs presentes no store
  const allChatKeys = Object.keys(store.chats || {});
  for (const key of allChatKeys) {
    if (key.endsWith('@lid')) {
      const unified = unifyLidChat(key);
      if (unified) modified = true;
    }
  }

  const allMsgKeys = Object.keys(store.messages || {});
  for (const key of allMsgKeys) {
    if (key.endsWith('@lid')) {
      const unified = unifyLidChat(key);
      if (unified) modified = true;
    }
  }

  // 2. Corrige mensagens do grupo Alby&Co com os remetentes corretos
  const albyJid = '120363423900883657@g.us';
  if (store.messages[albyJid]) {
    store.messages[albyJid].forEach(m => {
      m.isGroup = true;
      if (!m.fromMe) {
        // Se a mensagem for sobre preenchimento/endolaser ou bronze/podologia, identifica o remetente
        if (m.text && m.text.includes('Endolaser') && !m.participant) {
          m.participant = '247115406172403@lid';
          m.senderName = 'Leandro Oliveira';
        } else if (m.text && m.text.includes('podologia') && !m.participant) {
          m.participant = '247115406172403@lid';
          m.senderName = 'Leandro Oliveira';
        } else if (!m.senderName) {
          m.senderName = 'Luana';
        }
      }
    });
    modified = true;
  }

  // 3. Corrige mensagens com fotos salvas com type: 'text'
  if (store.messages) {
    for (const arr of Object.values(store.messages)) {
      if (Array.isArray(arr)) {
        for (const m of arr) {
          if (m.mediaUrl && (m.mediaUrl.includes('img_') || /\.(jpe?g|png|webp|gif)$/i.test(m.mediaUrl)) && m.type !== 'image') {
            m.type = 'image';
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    scheduleSave();
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      console.error('[WhatsApp Store] Erro ao salvar store:', err.message);
    }
  }, 1000);
}

// Inicializar carregando do disco
loadStore();

function cleanJid(jid) {
  if (!jid) return '';
  const base = String(jid).split('@')[0].split(':')[0];
  const domain = String(jid).includes('@') ? String(jid).split('@').pop() : 's.whatsapp.net';
  return `${base}@${domain}`;
}

function extractPhone(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0];
}

function setContact(jidOrPhone, name) {
  if (!jidOrPhone || !name) return;
  const cJid = cleanJid(jidOrPhone);
  store.contacts[cJid] = name;
  const phone = extractPhone(cJid);
  if (phone) store.contacts[phone] = name;
  scheduleSave();
}

function upsertChat(jid, chatData = {}) {
  // Se o jid fornecido for um LID que já possui mapeamento de telefone, unifica imediatamente
  if (jid && jid.endsWith('@lid')) {
    const unified = unifyLidChat(jid);
    if (unified) {
      if (chatData.name && !chatData.fromMe && !isGenericPhoneName(chatData.name) && chatData.name !== 'Kauê Felix') {
        unified.name = chatData.name;
        store.contacts[unified.phone] = chatData.name;
        store.contacts[unified.jid] = chatData.name;
      }
      if (chatData.lastMessage) {
        unified.lastMessage = chatData.lastMessage;
        unified.updatedAt = chatData.lastMessage.timestamp || Date.now();
      }
      scheduleSave();
      return unified;
    }
  }

  const cJid = getCanonicalJid(jid);
  if (!cJid || cJid.includes('status@broadcast')) return null;
  const isGroup = cJid.endsWith('@g.us');

  // Se o cJid for um telefone que possui um chat em LID registrado, unifica
  if (cJid.endsWith('@s.whatsapp.net')) {
    const phone = extractPhone(cJid);
    const lid = resolvePhoneToLid(phone);
    if (lid && (store.chats[lid] || store.messages[lid])) {
      unifyLidChat(lid);
    }
  }

  // Nome sugerido padrão
  const leadName = resolveContactName(cJid);
  const defaultName = isGroup ? 'Grupo do WhatsApp' : (leadName || extractPhone(cJid));

  if (!store.chats[cJid]) {
    store.chats[cJid] = {
      id: cJid,
      jid: cJid,
      name: chatData.name || defaultName,
      phone: extractPhone(cJid),
      isGroup: isGroup,
      isGroupSubject: !!chatData.isGroupSubject,
      participantCount: chatData.participantCount || 0,
      unreadCount: 0,
      lastMessage: null,
      updatedAt: Date.now()
    };
  } else {
    store.chats[cJid].id = cJid;
    store.chats[cJid].jid = cJid;
    store.chats[cJid].isGroup = isGroup;
  }

  // NUNCA permite que o nome do próprio usuário logado (ex: Kauê Felix) sobrescreva o nome do contato!
  if (chatData.name && !chatData.fromMe) {
    if (isGroup) {
      if (chatData.isGroupSubject || !store.chats[cJid].name || store.chats[cJid].name === store.chats[cJid].phone) {
        store.chats[cJid].name = chatData.name;
        if (chatData.isGroupSubject) store.chats[cJid].isGroupSubject = true;
      }
    } else {
      // Chat 1x1: Atualiza com o nome do contato externo (mas nunca 'Kauê Felix')
      if (chatData.name !== 'Kauê Felix' && chatData.name !== 'Você') {
        store.chats[cJid].name = chatData.name;
      }
    }
  }

  // Se o chat ainda está com o número bruto ou nome do próprio usuário, tenta resolver via base de leads
  if (!isGroup && leadName && (store.chats[cJid].name === store.chats[cJid].phone || store.chats[cJid].name === 'Kauê Felix')) {
    store.chats[cJid].name = leadName;
  }

  if (chatData.participantCount !== undefined) {
    store.chats[cJid].participantCount = chatData.participantCount;
  }

  if (chatData.lastMessage) {
    store.chats[cJid].lastMessage = chatData.lastMessage;
    store.chats[cJid].updatedAt = chatData.lastMessage.timestamp || Date.now();
  }

  if (chatData.unreadCount !== undefined) {
    store.chats[cJid].unreadCount = chatData.unreadCount;
  }

  scheduleSave();
  return store.chats[cJid];
}

function addMessage(jid, msgData) {
  if (jid && jid.endsWith('@lid')) {
    const unified = unifyLidChat(jid);
    if (unified) {
      return addMessage(unified.jid, msgData);
    }
  }

  const cJid = getCanonicalJid(jid);
  if (!cJid || cJid.includes('status@broadcast')) return null;
  const isGroup = cJid.endsWith('@g.us');

  if (cJid.endsWith('@s.whatsapp.net')) {
    const phone = extractPhone(cJid);
    const lid = resolvePhoneToLid(phone);
    if (lid && (store.chats[lid] || store.messages[lid])) {
      unifyLidChat(lid);
    }
  }

  if (!store.messages[cJid]) {
    store.messages[cJid] = [];
  }

  // Evitar duplicados por id
  const exists = store.messages[cJid].some(m => m.id === msgData.id);
  if (exists) return null;

  // Resolve remetente real
  let senderName = msgData.senderName;
  if (!senderName && msgData.participant) {
    senderName = resolveContactName(msgData.participant);
  }

  const newMsg = {
    id: msgData.id || `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    fromMe: !!msgData.fromMe,
    senderName: senderName || (msgData.fromMe ? 'Kauê' : null),
    participant: msgData.participant || null,
    isGroup: isGroup,
    text: msgData.text || '',
    timestamp: msgData.timestamp || Date.now(),
    type: msgData.type || 'text', // text, image, audio, document
    mediaUrl: msgData.mediaUrl || null,
    fileName: msgData.fileName || null,
    status: msgData.status || 'sent'
  };

  store.messages[cJid].push(newMsg);

  // Ordenar mensagens por timestamp
  store.messages[cJid].sort((a, b) => a.timestamp - b.timestamp);

  // Manter no máximo 200 mensagens mais recentes por chat para performance
  if (store.messages[cJid].length > 200) {
    store.messages[cJid] = store.messages[cJid].slice(-200);
  }

  // Formatar texto de prévia: em grupo, identifica quem enviou (ex: "Luana: Olá")
  const rawPreview = newMsg.text || (newMsg.type === 'image' ? '📷 Foto' : (newMsg.type === 'audio' ? '🎙️ Mensagem de voz' : '📎 Arquivo'));
  const displayPreview = (isGroup && !newMsg.fromMe && newMsg.senderName)
    ? `${newMsg.senderName}: ${rawPreview}`
    : rawPreview;

  // Atualizar o chat correspondente
  const chat = upsertChat(cJid, {
    fromMe: newMsg.fromMe,
    name: isGroup ? undefined : (newMsg.fromMe ? undefined : msgData.senderName),
    lastMessage: {
      text: displayPreview,
      timestamp: newMsg.timestamp,
      fromMe: newMsg.fromMe,
      type: newMsg.type,
      senderName: newMsg.senderName
    }
  });

  if (!newMsg.fromMe) {
    chat.unreadCount = (chat.unreadCount || 0) + 1;
  }

  scheduleSave();
  return newMsg;
}

function getChats() {
  // Unifica proativamente qualquer chat que ainda esteja em LID se já existe mapeamento
  for (const key of Object.keys(store.chats || {})) {
    if (key.endsWith('@lid')) {
      unifyLidChat(key);
    }
  }

  const chatList = Object.values(store.chats)
    .filter(chat => {
      // Exibe apenas conversas com histórico ou mensagem recente (evita poluir com 60 grupos vazios)
      const hasLastMsg = !!chat.lastMessage && (!!chat.lastMessage.text || !!chat.lastMessage.type);
      const hasMsgs = Array.isArray(store.messages[chat.id || chat.jid]) && store.messages[chat.id || chat.jid].length > 0;
      return hasLastMsg || hasMsgs;
    })
    .map(chat => {
      const isGroup = chat.isGroup !== undefined ? chat.isGroup : (chat.id || chat.jid || '').endsWith('@g.us');
      return {
        ...chat,
        id: chat.id || chat.jid,
        jid: chat.id || chat.jid,
        isGroup
      };
    });

  // Ordena pelo updatedAt decrescente (mais recentes primeiro)
  chatList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return chatList;
}

function getMessages(jid) {
  const cJid = getCanonicalJid(jid);
  return store.messages[cJid] || [];
}

function markChatAsRead(jid) {
  const cJid = getCanonicalJid(jid);
  if (store.chats[cJid]) {
    store.chats[cJid].unreadCount = 0;
    scheduleSave();
    return true;
  }
  return false;
}

module.exports = {
  MEDIA_DIR,
  cleanJid,
  extractPhone,
  resolveLidToPhone,
  resolvePhoneToLid,
  unifyLidChat,
  getCanonicalJid,
  resolveContactName,
  setContact,
  upsertChat,
  addMessage,
  getChats,
  getMessages,
  markChatAsRead,
  getStore: () => store
};

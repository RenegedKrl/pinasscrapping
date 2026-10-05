const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const store = require('./whatsapp_store');

const SESSION_DIR = path.join(__dirname, 'data', 'whatsapp_session');

let sock = null;
let qrCodeDataUrl = null;
let qrRaw = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let connectedUser = null;
let lastError = null;
let reconnectTimer = null;
let isInitializing = false;
let isExplicitLogout = false;

// Limpar e normalizar telefone para padrão brasileiro internacional (ex: 5511999999999)
function cleanPhoneForWhatsApp(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return digits;
}

// Retornar status atual
function getStatus() {
  const hasSavedSession = fs.existsSync(path.join(SESSION_DIR, 'creds.json'));
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    qrCodeDataUrl: connectionStatus === 'qr_ready' ? qrCodeDataUrl : null,
    user: connectedUser,
    hasSavedSession,
    lastError
  };
}

function unwrapMessage(msg) {
  if (!msg) return null;
  let content = msg;
  while (
    content &&
    (content.ephemeralMessage ||
     content.viewOnceMessage ||
     content.viewOnceMessageV2 ||
     content.viewOnceMessageV2Extension ||
     content.documentWithCaptionMessage ||
     content.editedMessage)
  ) {
    if (content.ephemeralMessage) content = content.ephemeralMessage.message;
    else if (content.viewOnceMessage) content = content.viewOnceMessage.message;
    else if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
    else if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
    else if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;
    else if (content.editedMessage) content = content.editedMessage.message?.protocolMessage?.editedMessage || content.editedMessage.message;
  }
  return content;
}
const groupMetaCache = new Map();

// Obter dados do grupo (nome oficial / subject e participantes)
async function fetchGroupMetadata(jid) {
  if (!jid || !jid.endsWith('@g.us') || !sock) return null;
  if (groupMetaCache.has(jid)) return groupMetaCache.get(jid);

  try {
    if (typeof sock.groupMetadata === 'function') {
      const meta = await sock.groupMetadata(jid);
      if (meta && meta.subject) {
        groupMetaCache.set(jid, meta);
        return meta;
      }
    }
  } catch (err) {
    // Pode falhar temporariamente se sem conexão
  }
  return null;
}

// Sincronizar nomes de todos os grupos do WhatsApp
async function syncAllGroupsMetadata() {
  if (!sock || connectionStatus !== 'connected') return;

  try {
    if (typeof sock.groupFetchAllParticipating === 'function') {
      const allGroups = await sock.groupFetchAllParticipating();
      for (const [jid, meta] of Object.entries(allGroups)) {
        if (meta && meta.subject) {
          groupMetaCache.set(jid, meta);
          store.upsertChat(jid, {
            name: meta.subject,
            isGroup: true,
            isGroupSubject: true,
            participantCount: meta.participants?.length || 0
          });
          console.log(`[WhatsApp] Grupo sincronizado: "${meta.subject}" (${jid})`);
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp] Aviso ao sincronizar grupos:', err.message);
  }

  // Fallback: para grupos no store que ainda não possuem assunto oficial registrado
  const currentChats = (store.getStore ? store.getStore().chats : store.chats) || {};
  const groupJids = Object.keys(currentChats).filter(j => j.endsWith('@g.us'));
  for (const jid of groupJids) {
    if (!currentChats[jid]?.isGroupSubject) {
      try {
        const meta = await fetchGroupMetadata(jid);
        if (meta && meta.subject) {
          store.upsertChat(jid, {
            name: meta.subject,
            isGroup: true,
            isGroupSubject: true,
            participantCount: meta.participants?.length || 0
          });
          console.log(`[WhatsApp] Grupo metadata atualizado: "${meta.subject}" (${jid})`);
        }
      } catch (e) {}
    }
  }
}

// Processar mensagem recebida ou enviada para salvar no Store local
async function processIncomingMessage(m) {
  if (!m || !m.key || !m.key.remoteJid) return;
  const rawJid = m.key.remoteJid;
  if (rawJid.includes('status@broadcast')) return;

  // Unifica proativamente se for LID com telefone já conhecido
  const phone = rawJid.endsWith('@lid') ? store.resolveLidToPhone(rawJid) : null;
  const jid = phone ? `${phone}@s.whatsapp.net` : rawJid;

  const isGroup = jid.endsWith('@g.us');
  const participant = m.key.participant || m.participant || null;

  const rawMsg = m.message;
  if (!rawMsg) return;
  const msgContent = unwrapMessage(rawMsg);
  if (!msgContent) return;

  const msgId = m.key.id;
  const fromMe = !!m.key.fromMe;
  const timestamp = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now();

  // Se recebemos o pushName do contato (e não foi enviado por nós), salva no cache de contatos
  if (m.pushName && !fromMe) {
    if (participant) store.setContact(participant, m.pushName);
    store.setContact(rawJid, m.pushName);
    store.setContact(jid, m.pushName);
    if (phone) {
      store.setContact(phone, m.pushName);
    }
  }

  let senderName = null;
  if (fromMe) {
    senderName = 'Kauê';
  } else if (isGroup) {
    senderName = m.pushName || store.resolveContactName(participant) || 'Participante';
  } else {
    senderName = m.pushName || store.resolveContactName(jid);
  }

  let text = '';
  let type = 'text';
  let mediaUrl = null;
  let fileName = null;

  // 1. Mensagem de texto simples
  if (msgContent.conversation) {
    text = msgContent.conversation;
    type = 'text';
  } 
  // 2. Mensagem de texto estendida
  else if (msgContent.extendedTextMessage) {
    text = msgContent.extendedTextMessage.text || '';
    type = 'text';
  }
  // 3. Respostas interativas / Meta AI
  else if (msgContent.buttonsResponseMessage) {
    text = msgContent.buttonsResponseMessage.selectedDisplayText || '';
    type = 'text';
  }
  else if (msgContent.templateButtonReplyMessage) {
    text = msgContent.templateButtonReplyMessage.selectedDisplayText || '';
    type = 'text';
  }
  // 4. Imagem
  else if (msgContent.imageMessage) {
    type = 'image';
    text = msgContent.imageMessage.caption || '';
    try {
      const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const filename = `img_${msgId}_${Date.now()}.jpg`;
      const filePath = path.join(store.MEDIA_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      mediaUrl = `/media/${filename}`;
    } catch (e) {
      console.warn('[WhatsApp] Falha ao baixar imagem recebida:', e.message);
    }
  }
  // 5. Figurinha / Sticker
  else if (msgContent.stickerMessage) {
    type = 'image';
    text = '';
    try {
      const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const filename = `sticker_${msgId}_${Date.now()}.webp`;
      const filePath = path.join(store.MEDIA_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      mediaUrl = `/media/${filename}`;
    } catch (e) {
      console.warn('[WhatsApp] Falha ao baixar figurinha recebida:', e.message);
    }
  }
  // 6. Vídeo
  else if (msgContent.videoMessage) {
    type = 'video';
    text = msgContent.videoMessage.caption || '';
    try {
      const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const filename = `video_${msgId}_${Date.now()}.mp4`;
      const filePath = path.join(store.MEDIA_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      mediaUrl = `/media/${filename}`;
    } catch (e) {
      console.warn('[WhatsApp] Falha ao baixar vídeo recebido:', e.message);
    }
  }
  // 7. Áudio (PTT de voz ou arquivo de áudio)
  else if (msgContent.audioMessage) {
    type = 'audio';
    try {
      const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const filename = `audio_${msgId}_${Date.now()}.mp4`;
      const filePath = path.join(store.MEDIA_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      mediaUrl = `/media/${filename}`;
    } catch (e) {
      console.warn('[WhatsApp] Falha ao baixar áudio recebido:', e.message);
    }
  }
  // 8. Documento / PDF
  else if (msgContent.documentMessage) {
    type = 'document';
    fileName = msgContent.documentMessage.fileName || 'arquivo.pdf';
    text = msgContent.documentMessage.caption || fileName;
    try {
      const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const ext = path.extname(fileName) || '.bin';
      const filename = `doc_${msgId}_${Date.now()}${ext}`;
      const filePath = path.join(store.MEDIA_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      mediaUrl = `/media/${filename}`;
    } catch (e) {
      console.warn('[WhatsApp] Falha ao baixar documento recebido:', e.message);
    }
  }

  if (!text && !mediaUrl && type === 'text') return;

  store.addMessage(jid, {
    id: msgId,
    fromMe,
    senderName,
    participant,
    isGroup,
    text,
    type,
    mediaUrl,
    fileName,
    timestamp,
    status: 'delivered'
  });

  // Se for mensagem de grupo e o grupo ainda não tem o nome oficial carregado, busca em background
  if (isGroup && sock) {
    fetchGroupMetadata(jid).then(meta => {
      if (meta && meta.subject) {
        store.upsertChat(jid, {
          name: meta.subject,
          isGroup: true,
          isGroupSubject: true,
          participantCount: meta.participants?.length || 0
        });
      }
    }).catch(() => {});
  }
}

// Inicializar ou reconectar o WhatsApp
async function initWhatsApp(force = false) {
  if (isInitializing && !force) {
    return getStatus();
  }
  if (connectionStatus === 'connected' && sock && !force) {
    return getStatus();
  }

  isInitializing = true;
  isExplicitLogout = false;
  lastError = null;
  connectionStatus = 'connecting';

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Pinas Prospector', 'Chrome', '124.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      syncFullHistory: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrRaw = qr;
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          connectionStatus = 'qr_ready';
          console.log('[WhatsApp] Novo QR Code gerado para conexão no Prospector.');
        } catch (err) {
          console.error('[WhatsApp] Erro ao converter QR Code para imagem:', err);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        qrCodeDataUrl = null;
        qrRaw = null;
        lastError = null;

        const userJid = sock.user ? sock.user.id : '';
        const phone = (userJid.split(':')[0] || userJid.split('@')[0]);
        connectedUser = {
          id: userJid,
          phone: phone,
          name: sock.user && sock.user.name ? sock.user.name : 'Kauê • Pinas Studio'
        };
        console.log(`[WhatsApp] CONECTADO COM SUCESSO! Telefone: ${phone} (${connectedUser.name})`);
        
        // Sincronizar grupos do WhatsApp automaticamente
        setTimeout(() => {
          syncAllGroupsMetadata().catch(err => {
            console.warn('[WhatsApp] Erro na sincronização inicial de grupos:', err.message);
          });
        }, 1500);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !isExplicitLogout;

        console.log(`[WhatsApp] Conexão encerrada. Status: ${statusCode}, Reconectar: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut || isExplicitLogout) {
          connectionStatus = 'disconnected';
          connectedUser = null;
          qrCodeDataUrl = null;
          qrRaw = null;
          sock = null;
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          } catch (e) {}
        } else {
          connectionStatus = 'disconnected';
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            console.log('[WhatsApp] Tentando restabelecer conexão...');
            initWhatsApp(true).catch(console.error);
          }, 4000);
        }
      }
    });

    // Sincronização de Histórico Antigo (enviado pelo WhatsApp na conexão)
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
      console.log(`[WhatsApp Sync] Recebido histórico: ${chats?.length || 0} chats, ${messages?.length || 0} msgs.`);
      
      if (contacts) {
        for (const c of contacts) {
          if (c.id) {
            store.upsertChat(c.id, { name: c.name || c.notify });
          }
        }
      }

      if (chats) {
        for (const ch of chats) {
          if (ch.id) {
            store.upsertChat(ch.id, { name: ch.name });
          }
        }
      }

      if (messages) {
        for (const m of messages) {
          try {
            await processIncomingMessage(m);
          } catch (e) {}
        }
      }
    });

    // Mensagens em tempo real
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const m of messages) {
        try {
          await processIncomingMessage(m);
        } catch (err) {
          console.error('[WhatsApp] Erro ao processar mensagem:', err.message);
        }
      }
    });

    // Atualização de grupos
    sock.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id && update.subject) {
          groupMetaCache.delete(update.id);
          store.upsertChat(update.id, {
            name: update.subject,
            isGroup: true,
            isGroupSubject: true
          });
          console.log(`[WhatsApp] Nome do grupo atualizado: "${update.subject}" (${update.id})`);
        }
      }
    });

    // Atualização de contatos
    sock.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) {
        if (c.id) {
          const name = c.name || c.notify;
          if (name) store.setContact(c.id, name);
          store.upsertChat(c.id, { name });
        }
      }
    });

    isInitializing = false;
    return getStatus();
  } catch (err) {
    isInitializing = false;
    connectionStatus = 'disconnected';
    lastError = err.message;
    console.error('[WhatsApp] Erro na inicialização:', err);
    throw err;
  }
}

// Desconectar sessão do WhatsApp
async function disconnectWhatsApp() {
  isExplicitLogout = true;
  clearTimeout(reconnectTimer);

  try {
    if (sock) {
      await sock.logout();
    }
  } catch (e) {
    try {
      if (sock) sock.end();
    } catch (e2) {}
  }

  sock = null;
  connectionStatus = 'disconnected';
  connectedUser = null;
  qrCodeDataUrl = null;
  qrRaw = null;

  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  } catch (e) {}

  console.log('[WhatsApp] Sessão encerrada e limpa pelo usuário.');
  return { success: true };
}

// Resolver JID válido do WhatsApp
async function resolveJid(targetPhoneOrJid) {
  if (!targetPhoneOrJid) return '';

  // Se for LID, tenta converter para o número real correspondente via mapeamento
  if (targetPhoneOrJid.includes('@lid')) {
    const phone = store.resolveLidToPhone(targetPhoneOrJid);
    if (phone) {
      return `${phone}@s.whatsapp.net`;
    }
    // Caso não tenha mapeamento reverso de telefone, mantém o @lid original intacto (NUNCA converte para fake @s.whatsapp.net)
    return targetPhoneOrJid;
  }

  if (targetPhoneOrJid.includes('@s.whatsapp.net') || targetPhoneOrJid.includes('@g.us')) {
    return targetPhoneOrJid;
  }
  const clean = cleanPhoneForWhatsApp(targetPhoneOrJid);
  let targetJid = `${clean}@s.whatsapp.net`;

  try {
    if (sock && typeof sock.onWhatsApp === 'function') {
      const results = await sock.onWhatsApp(targetJid);
      if (results && results.length > 0 && results[0].exists) {
        return results[0].jid;
      }
      // Variação do 9º dígito
      if (clean.length === 13 && clean.startsWith('55') && clean[4] === '9') {
        const alt = clean.slice(0, 4) + clean.slice(5);
        const altResults = await sock.onWhatsApp(`${alt}@s.whatsapp.net`);
        if (altResults && altResults.length > 0 && altResults[0].exists) {
          return altResults[0].jid;
        }
      } else if (clean.length === 12 && clean.startsWith('55')) {
        const alt = clean.slice(0, 4) + '9' + clean.slice(4);
        const altResults = await sock.onWhatsApp(`${alt}@s.whatsapp.net`);
        if (altResults && altResults.length > 0 && altResults[0].exists) {
          return altResults[0].jid;
        }
      }
    }
  } catch (err) {
    console.warn('[WhatsApp] Aviso ao validar onWhatsApp:', err.message);
  }

  return targetJid;
}

// 1. Enviar mensagem de texto direta (usado pelo Piloto Automático e Chat)
async function sendMessage(rawPhoneOrJid, text) {
  if (connectionStatus !== 'connected' || !sock) {
    throw new Error('WhatsApp não está conectado. Conecte seu aparelho escaneando o QR Code.');
  }

  if (!rawPhoneOrJid || !text) {
    throw new Error('Destinatário e mensagem são obrigatórios.');
  }

  const targetJid = await resolveJid(rawPhoneOrJid);

  // Se o destinatário era um LID que converteu para telefone, unifica imediatamente no store
  if (rawPhoneOrJid.includes('@lid') && targetJid.includes('@s.whatsapp.net')) {
    store.unifyLidChat(rawPhoneOrJid);
  }

  const sent = await sock.sendMessage(targetJid, { text });

  // Salvar no Store local para aparecer no Inbox
  store.addMessage(targetJid, {
    id: sent.key.id,
    fromMe: true,
    text,
    type: 'text',
    timestamp: Date.now(),
    status: 'sent'
  });

  return {
    success: true,
    messageId: sent.key.id,
    to: targetJid,
    timestamp: new Date().toISOString()
  };
}

// 2. Enviar mídia (foto ou documento)
async function sendMediaMessage(rawPhoneOrJid, { base64Data, mimetype, caption, fileName }) {
  if (connectionStatus !== 'connected' || !sock) {
    throw new Error('WhatsApp não está conectado.');
  }

  const targetJid = await resolveJid(rawPhoneOrJid);
  if (rawPhoneOrJid.includes('@lid') && targetJid.includes('@s.whatsapp.net')) {
    store.unifyLidChat(rawPhoneOrJid);
  }

  const buffer = Buffer.from(base64Data, 'base64');
  let sent;
  let savedUrl = null;

  if (mimetype && mimetype.startsWith('image/')) {
    sent = await sock.sendMessage(targetJid, {
      image: buffer,
      caption: caption || ''
    });

    const localFile = `sent_img_${sent.key.id}_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(store.MEDIA_DIR, localFile), buffer);
    savedUrl = `/media/${localFile}`;

    store.addMessage(targetJid, {
      id: sent.key.id,
      fromMe: true,
      text: caption || '',
      type: 'image',
      mediaUrl: savedUrl,
      timestamp: Date.now(),
      status: 'sent'
    });
  } else {
    // Documento / PDF / Outro
    const docName = fileName || 'documento.pdf';
    sent = await sock.sendMessage(targetJid, {
      document: buffer,
      mimetype: mimetype || 'application/pdf',
      fileName: docName,
      caption: caption || ''
    });

    const ext = path.extname(docName) || '.pdf';
    const localFile = `sent_doc_${sent.key.id}_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(store.MEDIA_DIR, localFile), buffer);
    savedUrl = `/media/${localFile}`;

    store.addMessage(targetJid, {
      id: sent.key.id,
      fromMe: true,
      text: caption || docName,
      type: 'document',
      fileName: docName,
      mediaUrl: savedUrl,
      timestamp: Date.now(),
      status: 'sent'
    });
  }

  return {
    success: true,
    messageId: sent.key.id,
    to: targetJid,
    mediaUrl: savedUrl
  };
}

// 3. Enviar áudio (gravado pelo usuário como mensagem de voz PTT)
async function sendAudioMessage(rawPhoneOrJid, { base64Data, mimetype }) {
  if (connectionStatus !== 'connected' || !sock) {
    throw new Error('WhatsApp não está conectado.');
  }

  const targetJid = await resolveJid(rawPhoneOrJid);
  if (rawPhoneOrJid.includes('@lid') && targetJid.includes('@s.whatsapp.net')) {
    store.unifyLidChat(rawPhoneOrJid);
  }

  const buffer = Buffer.from(base64Data, 'base64');

  const sent = await sock.sendMessage(targetJid, {
    audio: buffer,
    mimetype: mimetype || 'audio/mp4',
    ptt: true // Nota de voz clássica do WhatsApp!
  });

  const localFile = `sent_audio_${sent.key.id}_${Date.now()}.mp4`;
  fs.writeFileSync(path.join(store.MEDIA_DIR, localFile), buffer);
  const savedUrl = `/media/${localFile}`;

  store.addMessage(targetJid, {
    id: sent.key.id,
    fromMe: true,
    text: '',
    type: 'audio',
    mediaUrl: savedUrl,
    timestamp: Date.now(),
    status: 'sent'
  });

  return {
    success: true,
    messageId: sent.key.id,
    to: targetJid,
    mediaUrl: savedUrl
  };
}

module.exports = {
  initWhatsApp,
  disconnectWhatsApp,
  getStatus,
  sendMessage,
  sendMediaMessage,
  sendAudioMessage,
  cleanPhoneForWhatsApp,
  syncAllGroupsMetadata,
  store
};

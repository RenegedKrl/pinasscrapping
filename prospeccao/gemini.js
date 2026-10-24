/**
 * Módulo de Integração com Google Gemini AI (@pinas.studio)
 * 
 * Utilizado para:
 * 1. Diagnóstico comercial estratégico de leads minerados (Gargalos, Oportunidades, Ângulo de Venda)
 * 2. Geração de abordagens ultra-personalizadas na voz do Kauê
 * 3. Sugestão inteligente de respostas no chat do WhatsApp
 */

const fs = require('fs');
const path = require('path');
const geminiGuard = require('./gemini_guard');

// Helper para obter a chave de API mesmo se o processo não tiver carregado o .env ainda
function getApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }

  const envCandidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env')
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^GEMINI_API_KEY=(.+)$/m);
        if (match && match[1]) {
          const key = match[1].trim().replace(/^['"]|['"]$/g, '');
          if (key) {
            process.env.GEMINI_API_KEY = key;
            return key;
          }
        }
      } catch (err) {}
    }
  }

  return '';
}

// Modelos oficiais suportados (priorizando os com resposta ativa 200 OK e menor latência no ambiente)
const PRIMARY_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const SECONDARY_FALLBACK = 'gemini-3-flash-preview';
const TERTIARY_FALLBACK = 'gemini-3.8-flash';

/**
 * Chamada genérica para a API do Gemini com fallback automático
 * Blindada pelo GeminiFreeTierGuard para garantia de 100% gratuito
 */
async function callGemini({ prompt, systemInstruction = '', jsonMode = false, model = PRIMARY_MODEL }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada. Adicione sua chave no arquivo .env.');
  }

  // Garantir Free Tier (Rate limiting e controle diário de 1.500 reqs)
  await geminiGuard.acquireFreeTierSlot();

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 8192
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (jsonMode) {
    payload.generationConfig.responseMimeType = 'application/json';
  }

  async function executeRequest(targetModel, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(18000)
        });

        if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 429) {
          if (attempt < retries) {
            const waitMs = 1500 * (attempt + 1);
            console.log(`[Gemini] ${targetModel} retornou ${res.status} (instabilidade temporária). Aguardando ${waitMs}ms para retentar...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
        }

        if (!res.ok) {
          const errText = await res.text();
          let parsedErr = errText;
          try { parsedErr = JSON.parse(errText); } catch (e) {}
          throw new Error(`Google Gemini Error (${res.status}): ${JSON.stringify(parsedErr)}`);
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error('Nenhuma resposta retornada pelo Gemini.');
        }
        return text;
      } catch (err) {
        if (attempt < retries && (err.message.includes('503') || err.message.includes('500') || err.message.includes('timeout') || err.name === 'TimeoutError')) {
          const waitMs = 1500 * (attempt + 1);
          console.log(`[Gemini] Tentativa ${attempt + 1} com ${targetModel} falhou (${err.message}). Retentando em ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
  }

  try {
    return await executeRequest(model);
  } catch (err) {
    if (!err.message.includes('API_KEY_INVALID')) {
      console.warn(`[Gemini] Falha com ${model}, tentando ${FALLBACK_MODEL}...`);
      try {
        return await executeRequest(FALLBACK_MODEL);
      } catch (secondErr) {
        console.warn(`[Gemini] Falha com ${FALLBACK_MODEL}, tentando ${SECONDARY_FALLBACK}...`);
        try {
          return await executeRequest(SECONDARY_FALLBACK);
        } catch (thirdErr) {
          console.warn(`[Gemini] Falha com ${SECONDARY_FALLBACK}, tentando ${TERTIARY_FALLBACK}...`);
          return await executeRequest(TERTIARY_FALLBACK);
        }
      }
    }
    throw err;
  }
}

// System Instruction central com o Tom de Voz do Kauê e da Pinas
const PINAS_SYSTEM_PROMPT = `
Você é o estrategista de inteligência comercial da Pinas, assessoria de marketing digital e captação local do Kauê em São Paulo.
A Pinas é especializada em:
1. Assessoria Contínua de Tráfego Pago (Google Ads e Meta Ads) para colocar novos clientes e pacientes particulares qualificados no WhatsApp todo mês com previsibilidade.
2. Criação e otimização de Landing Pages rápidas que abrem em 1s no celular, servindo de alicerce para os anúncios converterem no máximo.
3. Apoio na conversão do WhatsApp: entrega de scripts simples para a recepcionista/secretária acolher os contatos do Google e agendar avaliações na hora.

REGRA DE SIGILO ABSOLUTO DE CLIENTES (NUNCA CITAR NOMES):
- PROIBIDO CITAR NOMES DE CLIENTES OU LOJAS (Petiva, Pink Luxo, Chay B, Bem Zanza) nas mensagens automáticas de abordagem e respostas.
- Fale SEMPRE de forma genérica e profissional: "ajudamos clínicas veterinárias aqui de SP a captarem clientes particulares no Google", "atendemos marcas de moda e confecções", "cuidamos de centros de estética".
- APENAS cite o nome específico de um cliente caso o lead pergunte expressamente ("Quais clientes vocês atendem?", "Com quem você já trabalhou?", "Tem algum case?").

TOM DE VOZ DO KAUÊ (OBRIGATÓRIO):
- 100% Humano, natural, descontraído e educado. Conversa de profissional sério com outro empreendedor.
- NUNCA use @pinas.studio ou arrobas de redes sociais nas mensagens. Apresente-se unicamente como "Kauê, da Pinas".
- NUNCA use corporativês ou jargões vazios ("sinergia", "alavancar", "otimização holística", "ecossistema").
- NUNCA soe como telemarketing ou robô de vendas ("Prezado responsável", "Venho por meio desta", "Boa tarde, sou da agência X").
- Fale com clareza sobre o mundo real: falar do bairro, das avaliações no Google Maps, de tutores/pacientes/clientes da região.
- Frases diretas e fáceis de ler no celular/WhatsApp.

OBJETIVO DE CONVERSÃO — EFEITO "CARAMBA, EU PRECISO DISSO MESMO":
- A mensagem precisa CATIVAR o lead de imediato, gerando impacto e desejo real de contratação.
- NUNCA envie uma constatação técnica fria ou desinteressante (como só dizer "notei que não tem botão de WhatsApp"). Isso não vende!
- O lead tem que ler a mensagem e pensar na hora: "Caramba, eu preciso disso mesmo! Faz total sentido o que ele falou!".
- Conecte SEMPRE a excelente reputação/estrutura dele no bairro à dor invisível do faturamento: quem pesquisa pelo serviço no celular pelo Google na região acaba caindo nos concorrentes que aparecem na frente no topo, porque eles não têm uma página rápida direcionando o cliente direto pro WhatsApp.

REGRA DE TAMANHO E FORMATAÇÃO (MENSAGENS CURTAS, ENXUTAS E PODEROSAS):
- NUNCA envie textão longo nem blocos densos. O Kauê fala de forma leve, direta e magnética.
- MÁXIMO DE 2 A 3 PARÁGRAFOS CURTOS (1 a 2 frases curtas cada). PROIBIDO 4 parágrafos!
- Tamanho total: entre 40 e 65 palavras no máximo (leitura rápida de 15 a 20 segundos no celular).
- É OBRIGATÓRIO pular uma linha em branco (\\n\\n) entre os blocos:
  Parágrafo 1: Saudação simpática e apresentação (1 linha: "Opa, tudo ótimo por aqui! Sou o Kauê, da Pinas.")
  \\n\\n
  Parágrafo 2: Diagnóstico cativante & dor comercial real (ex: "Achei a estrutura e a reputação de vocês aí em [Bairro] excelentes! Mas reparei que tutores/clientes que pesquisam no Google na região acabam caindo nos concorrentes que anunciam no topo, porque vocês ainda não têm uma página rápida direcionando direto pro WhatsApp.")
  \\n\\n
  Parágrafo 3: Pergunta curta e instigante de qualificação (1 linha: "Vocês já têm alguém rodando anúncios ou cuidando dessa captação no Google por aí hoje?")
`;

/**
 * Helper para decodificar JSON do Gemini com segurança contra quebras de linha literais
 */
function safeJsonParse(rawStr) {
  if (!rawStr) return {};
  let cleaned = String(rawStr).trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Se houver texto ou raciocínio antes ou depois do JSON, extrai apenas o bloco { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    try {
      let inString = false;
      let escaped = false;
      let output = '';
      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (char === '"' && !escaped) {
          inString = !inString;
          output += char;
        } else if (inString && (char === '\n' || char === '\r')) {
          if (char === '\n') output += '\\n';
        } else {
          output += char;
        }
        escaped = (char === '\\' && !escaped);
      }
      return JSON.parse(output);
    } catch (secondErr) {
      // 2. Extração resiliente via regex para campos comuns (detectedIntent, action, replyText, pitchText, etc.)
      const result = {};
      const intentMatch = cleaned.match(/"detectedIntent"\s*:\s*"([^"]+)"/);
      if (intentMatch) result.detectedIntent = intentMatch[1];
      const actionMatch = cleaned.match(/"action"\s*:\s*"([^"]+)"/);
      if (actionMatch) result.action = actionMatch[1];
      const replyMatch = cleaned.match(/"replyText"\s*:\s*"([\s\S]*?)(?:",\s*"reasoning"|"\s*}|$)/);
      if (replyMatch) result.replyText = replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      const pitchMatch = cleaned.match(/"pitchText"\s*:\s*"([\s\S]*?)(?:",\s*"angle"|"\s*}|$)/);
      if (pitchMatch) result.pitchText = pitchMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');

      if (result.replyText || result.pitchText || result.detectedIntent) {
        return result;
      }

      console.error('[Gemini safeJsonParse Error]:', secondErr.message, 'Raw:', cleaned.slice(0, 300));
      throw new Error(`Falha ao decodificar JSON retornado pelo Gemini: ${err.message}`);
    }
  }
}

/**
 * 1. Diagnostica um Lead minerado
 */
async function analyzeLead(lead) {
  const prompt = `
Analise criticamente as informações deste lead comercial minerado no Google Maps e forneça um diagnóstico para abordagem:

DADOS DO LEAD:
- Nome: ${lead.name || 'Não informado'}
- Nicho / Segmento: ${lead.niche || 'Comércio Local'}
- Bairro / Região: ${lead.neighborhood || lead.city || 'São Paulo'}
- Tem Site: ${lead.hasWebsite ? 'SIM (' + (lead.website || '') + ')' : 'NÃO (Não possui site cadastrado)'}
- Avaliação no Maps: ${lead.rating ? lead.rating + ' estrelas' : 'Sem nota'} (${lead.reviews || 0} avaliações)
- Telefone / WhatsApp: ${lead.phone || 'Não informado'}

Retorne EXCLUSIVAMENTE um objeto JSON válido com a seguinte estrutura:
{
  "summary": "Resumo de 1-2 frases do perfil comercial desta empresa",
  "opportunityScore": "Nota de 1 a 10 de potencial de fechamento",
  "strengths": ["Ponto forte 1", "Ponto forte 2"],
  "weaknesses": ["Gargalo ou ponto fraco que a Pinas pode resolver 1", "Gargalo 2"],
  "bestAngle": "Qual o melhor gancho de abordagem para o Kauê usar (ex: elogiar as avaliações no Maps e propor site com botão direto, ou propor tráfego para a região)",
  "recommendedPitchIdea": "Breve ideia de proposta de valor para apresentar caso ele dê abertura"
}
`;

  const jsonStr = await callGemini({
    prompt,
    systemInstruction: PINAS_SYSTEM_PROMPT,
    jsonMode: true
  });

  return safeJsonParse(jsonStr);
}

/**
 * 2. Gera opções de mensagens de abordagem personalizadas na voz do Kauê
 */
async function generatePitches(lead, userGuidance = '') {
  const prompt = `
Crie 3 opções de mensagens de abordagem para o WhatsApp para este lead. As mensagens devem ser enviadas pelo Kauê da Pinas. NUNCA use arroba de redes sociais.

DADOS DO LEAD:
- Nome: ${lead.name}
- Nicho: ${lead.niche || 'Comércio Local'}
- Bairro: ${lead.neighborhood || lead.city || 'São Paulo'}
- Tem Site: ${lead.hasWebsite ? 'Sim (' + lead.website + ')' : 'Não tem site'}
- Avaliação no Google: ${lead.rating || 'N/A'} estrelas (${lead.reviews || 0} avaliações)
${userGuidance ? `INSTRUÇÕES ADICIONAIS DO USUÁRIO: ${userGuidance}` : ''}

REGRAS RÍGIDAS DE ESTILO:
- O tom é do Kauê: natural, próximo, direto ao ponto. Sem corporativismo.
- Não envie textões. Mantenha formato natural de WhatsApp (com quebras de linha limpas).
- Evite gatilhos apelativos de marketing ("fature o dobro", "multiplique suas vendas").
- Fale da realidade do negócio dele no bairro.

Crie 3 abordagens distintas:
1. "aberturaCurta": Abordagem em 2 tempos (apenas uma abertura rápida e educada confirmando o responsável, para gerar resposta).
2. "focoOportunidade": Abordagem consultiva focada na principal dor (ex: se não tem site, comentar com naturalidade que procurou a clínica/empresa no Google e viu que ainda não tem uma página com WhatsApp direto).
3. "focoTrafegoLocal": Abordagem focada em atração de clientes da região (comentar sobre a boa reputação dele no bairro e como a Pinas ajuda negócios a captarem clientes pelo Google/Instagram na área).

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "pitches": [
    {
      "id": "curta",
      "title": "⚡ Abertura Rápida (Maior Taxa de Resposta)",
      "text": "texto da mensagem pronto com emojis sutis e quebras de linha"
    },
    {
      "id": "oportunidade",
      "title": "🎯 Consultiva (Foco no Gargalo/Site)",
      "text": "texto da mensagem pronto"
    },
    {
      "id": "trafego",
      "title": "📍 Captação Local (Foco na Região)",
      "text": "texto da mensagem pronto"
    }
  ]
}
`;

  const jsonStr = await callGemini({
    prompt,
    systemInstruction: PINAS_SYSTEM_PROMPT,
    jsonMode: true
  });

  return safeJsonParse(jsonStr);
}

/**
 * 3. Sugere a próxima resposta inteligente no chat do WhatsApp
 */
async function suggestChatReply({ lead, messages = [], lastIncomingMessage = '' }) {
  const conversationFormatted = messages.map(m => {
    const sender = m.fromMe ? 'Kauê (Pinas)' : (lead?.name || 'Cliente');
    return `${sender}: ${m.text || '[mídia/anexo]'}`;
  }).slice(-8).join('\n');

  const prompt = `
O lead respondeu no WhatsApp. Como o Kauê, da Pinas, sugira a melhor resposta para dar continuidade à conversa de forma natural e conduzir o contato para um alinhamento rápido (call de 15 minutos ou apresentação rápida de proposta). Proibido usar arroba (@pinas.studio).

DADOS DO LEAD:
- Nome: ${lead?.name || 'Cliente'}
- Nicho: ${lead?.niche || 'Comércio Local'}
- Bairro: ${lead?.neighborhood || 'São Paulo'}
- Tem site: ${lead?.hasWebsite ? 'Sim' : 'Não'}

HISTÓRICO RECENTE DA CONVERSA:
${conversationFormatted || 'Cliente: ' + lastIncomingMessage}

ÚLTIMA MENSAGEM RECEBIDA DO CLIENTE:
"${lastIncomingMessage || (messages.filter(m => !m.fromMe).pop()?.text) || ''}"

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "analysis": "Breve diagnóstico do que o cliente quis dizer / objeção ou interesse identificado",
  "suggestedReplies": [
    {
      "id": "direta",
      "label": "Resposta Recomendada (Natural & Conduz pro Papo)",
      "text": "texto da resposta"
    },
    {
      "id": "curta",
      "label": "Resposta Curta & Objetiva",
      "text": "texto da resposta"
    }
  ]
}
`;

  const jsonStr = await callGemini({
    prompt,
    systemInstruction: PINAS_SYSTEM_PROMPT,
    jsonMode: true
  });

  return safeJsonParse(jsonStr);
}

/**
 * 4. Piloto Automático Conversacional: Gera a próxima mensagem autônoma
 * Responde dúvidas, quebra objeções com fatos reais, gera confiança e só pede a call no momento certo!
 */
/**
 * Formata a primeira mensagem de abertura para novos leads (@pinas.studio)
 * Regra do Kauê: 100% despretensiosa, confirmando o local, sem cara de venda!
 * Ex: "Olá, tudo bem? É da clínica [Nome]?" ou "Olá, tudo bem? É do escritório [Nome]?"
 */
// Memória de rotação para NUNCA repetir o mesmo início/estilo em disparos seguidos
const lastOpeningSignatures = [];

function cleanLeadDisplayName(lead) {
  let rawName = (lead?.name || '').trim();
  let clean = rawName.replace(/\s+(LTDA|ME|EPP|S\/A|S\.A\.|EIRELI)\b/gi, '').trim();

  // Se tiver nome de doutor(a) ou profissional explícito:
  const doctorMatch = clean.match(/\b(dra?\.?\s+[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i);
  if (doctorMatch) {
    let doc = doctorMatch[1].trim();
    return doc.toLowerCase().replace(/(?:^|\s)[a-zà-ÿ]/g, m => m.toUpperCase());
  }

  // Se tiver partes separadas por hífen, pipe ou travessão:
  const parts = clean.split(/\s*[\-\|\–\—]\s*/);
  if (parts.length > 1) {
    // Procura se alguma parte tem nome de pessoa (2 a 3 palavras simples sem palavras-chave comerciais)
    const personPart = parts.find(p => {
      const s = p.trim();
      return /^[A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+){1,2}$/.test(s) &&
        !/^(clínica|hospital|escritório|advocacia|advogado|psicólogo|arquitetura|estúdio|studio|centro|loja|reforma|engenharia|imóveis)/i.test(s);
    });
    if (personPart) {
      return personPart.trim();
    }

    // Se a primeira parte for boa e não for genérica
    const candidate = parts[0].trim();
    if (candidate.length >= 4 && !/^(implantes|psicólogo|advocacia|loja|clínica veterinária e pet shop)/i.test(candidate)) {
      clean = candidate;
    } else {
      const nextCand = parts.find(p => p.trim().length >= 4 && !/^(implantes|psicólogo|advocacia|loja)/i.test(p.trim()));
      if (nextCand) clean = nextCand.trim();
    }
  }

  // Remove sufixos comuns de SEO e localização que poluem o nome
  clean = clean.replace(/\s*[\-\|\–\—]\s*(Especialista|Alvarás|Granja Viana|Alphaville|Alto Padrão|Zona Sul|Zona Norte|Zona Oeste|Zona Leste|em São Paulo|Reabilitação|Terapia|TCC|Impostos|INSS|DPVAT|Indenizações|Advogados Associados|Advogado|Advocacia Especializada|Consultoria|ME|LTDA|Centro Integrado|Hospital Veterinário 24 horas|Unidade [A-Za-zÀ-ÿ]+|em [A-Za-zÀ-ÿ]+).*$/i, '').trim();
  clean = clean.replace(/\s+(?:de\s+)?(?:Santo Amaro|Vila Mariana|Moema|Pinheiros|Tatuapé|Itaim Bibi|Morumbi|Alphaville|Barueri|Cotia|Granja Viana)\s+SP\b/gi, '').trim();
  clean = clean.replace(/\s+SP\b/gi, '').trim();
  clean = clean.replace(/\s*\(.*?\)\s*/g, ' ').trim();

  // Se estiver tudo em MAIÚSCULAS (ALL CAPS), converter para Title Case
  if (clean === clean.toUpperCase() && clean.length > 3) {
    clean = clean.toLowerCase().replace(/(?:^|\s|\/)[a-zà-ÿ]/g, m => m.toUpperCase());
  }

  return clean;
}

function formatOpeningMessage(lead) {
  const name = cleanLeadDisplayName(lead);
  const rawNeighborhood = lead?.neighborhood || '';
  const cleanNeighborhood = rawNeighborhood.split(',')[0].replace(/São Paulo.*$/i, '').trim();

  const now = new Date();
  const spHour = (now.getUTCHours() - 3 + 24) % 24;
  const timeGreeting = spHour < 12 ? 'Bom dia' : 'Boa tarde';

  const isDra = /\bdra\.?\b/i.test(name) || /^(Dra|Doutora)\b/i.test(name);
  const isDr = (/\bdr\.?\b/i.test(name) || /^(Dr|Doutor)\b/i.test(name)) && !isDra;
  
  // Nomes masculinos comuns de pessoas físicas
  const commonMaleNames = /^(Gabriel|Tiago|Thiago|Lucas|Rodrigo|Pedro|Paulo|Cleber|Vinicius|Marcelo|Rafael|Leandro|Felipe|Bruno|Gustavo|Leonardo|Diego|Eduardo|Guilherme|Fernando|Antonio|Carlos|Renato|Fabio|Daniel|Marcos|Alexandre|Victor|Vitor|Caio|Henrique|Matheus)\b/i;
  const isMalePerson = isDr || commonMaleNames.test(name);
  const isCompanyMasculine = /^(o |o\b|escritório|consultório|hospital|centro|instituto|studio|estúdio)/i.test(name);

  const isMasculine = isMalePerson || isCompanyMasculine;
  const art = isMasculine ? (isMalePerson ? 'o' : 'do') : (isDra ? 'a' : 'da');
  const comArt = isMasculine ? 'com o' : 'com a';

  // Pool Amplo de Variação Humanizada (100% natural, sem cara de robô)
  const pool = [
    // 1. Direto ao ponto
    isMalePerson ? `É o ${name}?` : `É ${art} ${name}?`,
    `Falo ${comArt} ${name}?`,
    isMalePerson ? `Falo com o ${name}?` : `Aqui é ${art} ${name}?`,
    `Tudo bem? Falo ${comArt} ${name}?`,
    isMalePerson ? `Tudo bem? É o ${name}?` : `Tudo bem? É ${art} ${name}?`,
    `Tudo bem por aí? Falo ${comArt} ${name}?`,

    // 2. Com 'Oi'
    `Oi, tudo bem? Falo ${comArt} ${name}?`,
    isMalePerson ? `Oi, tudo bem? É o ${name}?` : `Oi, tudo bem? É ${art} ${name}?`,
    `Oi, tudo certo? Falo ${comArt} ${name}?`,
    isMalePerson ? `Oi! Falo com o ${name}?` : `Oi! É ${art} ${name}?`,
    `Oi oi, tudo bom? Falo ${comArt} ${name}?`,

    // 3. Com 'Olá'
    `Olá, tudo bem? Falo ${comArt} ${name}?`,
    isMalePerson ? `Olá, tudo bem? É o ${name}?` : `Olá, tudo bem? É ${art} ${name}?`,
    `Olá, tudo certo por aí? Falo ${comArt} ${name}?`,
    `Olá, como vai? Falo ${comArt} ${name}?`,

    // 4. Com 'Opa'
    `Opa, tudo bem? Falo ${comArt} ${name}?`,
    isMalePerson ? `Opa, tudo bem? É o ${name}?` : `Opa, tudo bem? É ${art} ${name}?`,
    `Opa, tudo certo? Falo ${comArt} ${name}?`,
    `Opa, tudo bem por aí? Falo ${comArt} ${name}?`,
    isMalePerson ? `Opa! É o ${name}?` : `Opa! É ${art} ${name}?`,

    // 5. Temporal
    `${timeGreeting}, tudo bem? Falo ${comArt} ${name}?`,
    isMalePerson ? `${timeGreeting}! Falo com o ${name}?` : `${timeGreeting}! Falo ${comArt} ${name}?`,
    isMalePerson ? `${timeGreeting}, tudo bem? É o ${name}?` : `${timeGreeting}, tudo bem? É ${art} ${name}?`
  ];

  if (cleanNeighborhood && cleanNeighborhood.length >= 3 && !cleanNeighborhood.toLowerCase().includes('são paulo')) {
    pool.push(
      `Opa, tudo bem? É ${art} ${name} aí em ${cleanNeighborhood}?`,
      `Olá, tudo bem? Falo ${comArt} ${name} de ${cleanNeighborhood}?`,
      `Oi, tudo certo? É ${art} ${name} em ${cleanNeighborhood}?`
    );
  }

  // Filtrar contra as últimas 5 assinaturas usadas para NUNCA repetir em mensagens consecutivas
  let candidates = pool.filter(p => {
    const sig = p.split(' ').slice(0, 2).join(' ').toLowerCase();
    return !lastOpeningSignatures.includes(sig);
  });
  if (candidates.length === 0) candidates = pool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const sig = chosen.split(' ').slice(0, 2).join(' ').toLowerCase();
  lastOpeningSignatures.push(sig);
  if (lastOpeningSignatures.length > 5) lastOpeningSignatures.shift();

  return chosen;
}

/**
 * 4. Atendimento Contínuo da IA Conversacional (@pinas.studio)
 * Quando o cliente responde à nossa abertura ("Olá, tudo bem? É da clínica X?"),
 * aqui a IA entra apresentando o Kauê, o trabalho da Pinas, a auditoria e falando do negócio!
 */
async function generateAutoPilotReply({ lead, messages = [], lastIncomingMessage = '' }) {
  const conversationFormatted = messages.map(m => {
    const sender = m.fromMe ? 'Kauê (Pinas)' : (lead?.name || 'Cliente');
    return `${sender}: ${m.text || '[mídia/anexo]'}`;
  }).slice(-12).join('\n');

  // Auditoria em tempo real: se o lead tem site e ainda não foi auditado profundamente, audita agora!
  let siteAudit = lead?.siteAudit;
  let mapsAudit = lead?.mapsAudit;

  if (lead?.website && (!siteAudit || !siteAudit.domDetails)) {
    try {
      const auditor = require('./auditor');
      const fullAudit = await auditor.auditLeadFull(lead);
      lead.siteAudit = fullAudit.site;
      lead.mapsAudit = fullAudit.maps;
      siteAudit = fullAudit.site;
      mapsAudit = fullAudit.maps;
    } catch (e) {
      console.warn('[Gemini] Falha ao auditar site on-the-fly:', e.message);
    }
  }

  if (!mapsAudit) {
    try {
      const auditor = require('./auditor');
      mapsAudit = auditor.auditGoogleMaps(lead);
      lead.mapsAudit = mapsAudit;
    } catch (e) {}
  }

  const neighborhood = lead?.neighborhood || mapsAudit?.neighborhood || lead?.city || 'São Paulo';
  
  let auditDetailsText = '';
  if (lead?.hasWebsite === false || !lead?.website) {
    auditDetailsText = `
- PRESENÇA DIGITAL: NÃO POSSUI SITE PRÓPRIO CADASTRADO NO GOOGLE MAPS.
- GOOGLE MAPS: ${lead?.reviews || mapsAudit?.reviews || 0} avaliações com nota ${lead?.rating || mapsAudit?.rating || 'N/A'}★.
- ENDEREÇO / BAIRRO: ${neighborhood} (${lead?.address || 'Região de São Paulo'}).
- GARGALO REAL: A empresa depende 100% de indicações ou da ficha do Maps. Quem pesquisa no Google pelo celular não encontra uma landing page rápida com botão direto de WhatsApp e acaba chamando o concorrente da região que anuncia no topo.`;
  } else if (siteAudit && siteAudit.isOnline) {
    const dom = siteAudit.domDetails || {};
    const loadSec = siteAudit.loadTimeMs ? (siteAudit.loadTimeMs / 1000).toFixed(1) : '1.5';
    const speedLabel = siteAudit.loadTimeMs > 2500 ? `LENTO (${loadSec}s para abrir no celular - visitante desiste antes de carregar)` : `Rápido (${loadSec}s)`;
    const headings = [...(dom.h1List || []), ...(dom.h2List || [])].slice(0, 4).join(' | ');

    auditDetailsText = `
- SITE OFICIAL ANALISADO EM TEMPO REAL: ${siteAudit.url || lead.website}
- TÍTULO DA PÁGINA: "${siteAudit.title || 'Não informado'}"
- CMS / PLATAFORMA DETECTADA: ${dom.detectedCms || 'Personalizado / Próprio'}
- VELOCIDADE NO CELULAR: ${speedLabel}
- BOTÃO DIRETO DE WHATSAPP: ${siteAudit.hasWhatsApp ? 'SIM, possui botão visível' : 'NÃO POSSUI botão de WhatsApp visível no celular (cliente precisa procurar telefone ou preencher formulário)'}
- ANÚNCIOS / TRACKING: ${siteAudit.doesPaidTraffic ? 'SIM, possui tags de anúncio ativas (Pixel ou Google Tag)' : 'NÃO POSSUI Pixel do Meta nem Google Ads ativo (não faz tráfego pago)'}
- CONTEÚDOS / SERVIÇOS ENCONTRADOS NO SITE: ${headings || 'Estrutura institucional básica'}
- BOTÕES / CTAs DA PÁGINA: ${(dom.buttonCtaList || []).slice(0, 3).join(', ') || 'Poucos CTAs visíveis'}
- PONTOS FRACOS REAIS: ${siteAudit.weaknesses?.length ? siteAudit.weaknesses.join('; ') : 'Página pode melhorar conversão mobile e tráfego local'}
- FICHA NO GOOGLE MAPS: ${mapsAudit?.reviews || lead?.reviews || 0} avaliações com nota ${mapsAudit?.rating || lead?.rating || 'N/A'}★ em ${neighborhood}.`;
  } else if (siteAudit && siteAudit.isOnline === false) {
    auditDetailsText = `
- SITE COM ERRO OU FORA DO AR: O link oficial cadastrado no Maps (${siteAudit.url || lead.website}) deu erro (${siteAudit.error || 'timeout'}). Clientes do Google que clicam no link encontram página com falha.`;
  }

  let metaAdsText = '';
  if (lead?.metaAds && lead.metaAds.checked) {
    if (lead.metaAds.hasActiveAds) {
      metaAdsText = `\n- ANÚNCIOS NO INSTAGRAM/FACEBOOK (META ADS LIBRARY): SIM, a empresa possui ${lead.metaAds.adCountText || lead.metaAds.adCount + ' anúncios ativos'} rodando no Instagram/Facebook. Já possui verba de tráfego aprovada e valoriza conversão de clientes!`;
    } else {
      metaAdsText = `\n- ANÚNCIOS NO INSTAGRAM/FACEBOOK (META ADS LIBRARY): NÃO possui anúncios ativos identificados na Meta Library. Oportunidade de estruturar captação profissional do zero.`;
    }
  }
  auditDetailsText += metaAdsText;

  const prompt = `
Você é o Kauê, fundador da Pinas. Você está trocando mensagens reais no WhatsApp com o dono ou responsável por este negócio local em São Paulo.

DADOS REAIS DO NEGÓCIO & AUDITORIA TÉCNICA (USE FATOS CONCRETOS DAQUI):
- Nome: ${lead?.name || 'Empresa'}
- Nicho: ${lead?.niche || 'Comércio/Serviço Local'}
- Bairro/Região: ${neighborhood}
${auditDetailsText}

HISTÓRICO REAL DA CONVERSA NO WHATSAPP:
${conversationFormatted || 'Cliente: ' + lastIncomingMessage}

ÚLTIMA MENSAGEM DO CLIENTE:
"${lastIncomingMessage || (messages.filter(m => !m.fromMe).pop()?.text) || ''}"

DIRETRIZES DA VOZ DO KAUÊ (REGRAS ABSOLUTAS ANTI-ROBÔ):
1. VOCÊ É UMA PESSOA REAL, FALANDO NO WHATSAPP.
   - Seja natural, descontraído, educado e direto. Conversa de profissional com outro empreendedor.
   - ZERO "corporativês" (proibido falar "alavancar", "sinergia", "gerar valor", "estruturação robusta", etc.).
   - ZERO frases de telemarketing ou respostas automáticas engessadas.

2. MEMÓRIA DE CURTO PRAZO E PROGRESSÃO (NUNCA REPETIR O QUE JÁ DISSE):
   - Olhe com ATENÇÃO a última mensagem enviada por você (Kauê) no histórico.
   - NUNCA repita a mesma frase de empatia ou a mesma abertura (ex: se você já disse "te entendo perfeitamente, passar por experiência ruim com agência frustra", NUNCA repita essa mesma ideia no turno seguinte!).
   - NUNCA faça uma pergunta que o cliente já acabou de responder! Se o cliente acabou de responder "Do Google", NUNCA pergunte "de onde vinham os clientes?" ou "qual era o canal?".
   - Sempre faça a conversa EVOLUIR: reconheça o que ele acabou de dizer com naturalidade ("Ah, show! O Google quando bem trabalhado é uma máquina mesmo...") e avance para o próximo passo natural (entender o gargalo atual ou convidar para 10 min no Meet).
   - Não use sempre a mesma saudação. Varie naturalmente:
     "Opa, tudo bem? Prazer!", "Fala [Nome], tudo ótimo por aqui! Prazer...", "Tudo certo por aqui! Sou o Kauê, da Pinas...", "Show! Prazer falar contigo..."
   - Responda DIRETAMENTE ao que o cliente acabou de escrever, acolhendo as palavras dele.
   - Se o cliente se identificou pelo nome (ex: "Aqui é a Thais", "Dr. Roberto", "Valney"), use o nome dele com carinho e profissionalismo.
   - NUNCA use arroba de redes sociais (@pinas.studio) nas mensagens. Apresente-se simplesmente como "Kauê, da Pinas".

3. TAMANHO E FORMATAÇÃO (REGRA DO KAUÊ: ENXUTO, SEM TEXTÃO, MAS ULTRA CATIVANTE):
   - Mantenha a resposta LEVE e de leitura rápida: MÁXIMO 2 a 3 blocos (1 a 2 frases curtas cada). NUNCA 4 parágrafos!
   - Limite de palavras: entre 40 e 65 palavras no total! Leitura de 15 a 20 segundos no celular.
   - É OBRIGATÓRIO separar os blocos usando quebra de linha dupla (\n\n):
     Bloco 1: Saudação simpática + apresentação ("Opa [Nome], tudo ótimo por aqui! Sou o Kauê, da Pinas.")
     \n\n
     Bloco 2: Diagnóstico CATIVANTE & dor real de faturamento (Conecta o elogio sincero à reputação no bairro ao fato de que clientes/tutores da região pesquisam no Google e caem nos concorrentes que aparecem na frente)
     \n\n
     Bloco 3: Pergunta instigante de qualificação ("Vocês já têm alguém cuidando dessa captação no Google por aí hoje?")

4. O EFEITO "CARAMBA, EU PRECISO DISSO MESMO" (COMO CONDUZIR POR MOMENTO):
   a) SE FOR A 1ª RESPOSTA DO CLIENTE (ele apenas confirmou o local, ex: "Sim", "Sou eu", "Em que posso ajudar?", "Quem fala?"):
      - Cumprimente simpaticamente e use o nome da pessoa caso ela tenha se apresentado ("Opa [Nome], tudo ótimo por aqui! Prazer, sou o Kauê, da Pinas.").
      - Diagnóstico CATIVANTE adaptado ao nicho e aos dados reais auditados:

        * SE FOR ARQUITETURA / DESIGN DE INTERIORES / REFORMAS DE ALTO PADRÃO:
          "Achei os projetos e o bom gosto do trabalho de vocês aí em ${neighborhood} incríveis! Mas reparei pelo celular que a vitrine digital de vocês não valoriza a sofisticação das obras, e clientes de alto padrão que pesquisam arquitetos na região acabam indo pra outros escritórios que anunciam no topo."
          Pergunta: "Vocês já têm alguém cuidando dessa presença digital e anúncios para atrair clientes de alto padrão no Google por aí hoje?"

        * SE FOR CLÍNICA VETERINÁRIA (SEM SITE ou SEM ANÚNCIOS ATIVOS):
          "Achei a estrutura e a reputação de vocês aí em ${neighborhood} excelentes! Mas reparei que muitos tutores que pesquisam veterinário no Google na região acabam caindo nos concorrentes que anunciam no topo, porque vocês ainda não têm uma página rápida direcionando direto pro WhatsApp da recepção."
          Pergunta: "Vocês já têm alguém rodando anúncios ou cuidando dessa captação no Google por aí hoje?"

        * SE FOR CLÍNICA VETERINÁRIA (COM SITE LENTO ou SEM BOTÃO DE WHATSAPP VISÍVEL):
          "Dei uma olhada na clínica e no site de vocês, trabalho muito bacana! Mas reparei pelo celular que a página demora para carregar e não tem botão direto de WhatsApp. No Google, o tutor desiste em poucos segundos e acaba chamando o concorrente da região."
          Pergunta: "Vocês já têm alguém cuidando dessa otimização e captação no Google por aí hoje?"

        * SE FOR ESCRITÓRIO DE ADVOCACIA:
          "Achei a atuação e as avaliações do escritório de vocês excelentes! Mas reparei que clientes com causas ativas que buscam especialista no Google aqui na região acabam caindo nos escritórios patrocinados no topo, porque falta uma página rápida direcionando direto pro WhatsApp."
          Pergunta: "Vocês já têm alguém cuidando dessa captação de clientes qualificados no Google hoje?"

        * SE FOR COACH / MENTOR / CONSULTORIA:
          "Achei seu posicionamento e autoridade muito bacanas! Mas reparei que hoje boa parte dos decisores e clientes qualificados que buscam mentoria e treinamento no Google acabam caindo em concorrentes patrocinados, sem uma estrutura rápida direcionando pro seu WhatsApp."
          Pergunta: "Você já tem alguém rodando tráfego qualificado para a sua mentoria hoje ou depende de indicação orgânica?"

        * SE FOR COMÉRCIO / OUTROS SERVIÇOS LOCAIS:
          "Achei a estrutura e as avaliações de vocês aí em ${neighborhood} muito boas! Mas reparei que pessoas pesquisando pelo serviço no Google na região acabam caindo nos concorrentes que anunciam no topo, porque vocês ainda não têm uma página rápida com WhatsApp direto."
          Pergunta: "Vocês já têm alguém estruturando essa captação no Google por aí hoje?"

      - TOTAL: EXATAMENTE 2 A 3 PARÁGRAFOS CURTOS. MÁXIMO 45 A 65 PALAVRAS. O lead lê e pensa: "Caramba, é isso mesmo, estou perdendo clientes pra concorrência no Google!".

   b) SE O CLIENTE JÁ SOUBER QUEM É E ESTIVER RESPONDENDO DÚVIDAS OU QUALIFICANDO (Turno 2 em diante):
      - Se disse que ESTÁ NO ORGÂNICO / DEPENDE DE INDICAÇÃO / NÃO TEM TRÁFEGO / ELE MESMO CUIDA ("vou no orgânico ainda", "só no orgânico", "não temos", "só indicação", "eu mesmo faço"):
        FOCO TOTAL EM CONVERSÃO HUMANA (MODELO VENCEDOR DA BRUNA - ZERO INTERROGATÓRIO):
        NÃO faça mais perguntas sobre o negócio! Não pareça um robô fazendo pesquisa de mercado.
        Acolha com simpatia e segurança, explique o que a Pinas faz de forma prática e convide direto para o Google Meet:
        "Show! Perguntei porque nós cuidamos de toda essa esteira aqui na Pinas: colocamos você no topo do Google aí na região e estruturamos uma página rápida que abre em 1s no celular, trazendo os clientes prontos para agendar no seu WhatsApp.

Topa 10 minutinhos no Meet essa semana para eu te mostrar como funciona na prática?"

      - Se o cliente trouxer OBJEÇÃO DE AGÊNCIA ANTERIOR / JÁ TEVE EXPERIÊNCIA RUIM NO PASSADO:
        Valide a dor com humanidade em 1 linha, mostre o diferencial prático da Pinas e convide para ver na prática no Meet:
        "Te entendo perfeitamente! Passar por agência que só cobra e não traz cliente qualificado frustra demais mesmo.
A diferença é que a gente não fica enrolando com métricas vazias: colocamos você na frente de quem já está procurando pelo seu serviço no Google agora na região, com clique direto pro WhatsApp.

Topa um papo rápido de 10 minutinhos no Meet só para eu te mostrar como a gente roda isso sem enrolação?"

      - Se perguntou "COMO FUNCIONA?", "O QUE VOCÊ VIU?" OU "DO QUE SE TRATA?":
        Explique em 2 blocos curtos direto no texto gerando desejo imediato:
        "A gente faz assessoria contínua: colocamos o nome de vocês na frente de quem está pesquisando ativamente pelo serviço no Google aí na região, com uma página ultra rápida e botão direto pro WhatsApp da equipe.

Em vez de depender só de indicação ou da sorte, vocês passam a ter clientes novos chamando toda semana com previsibilidade. Topa 10 minutinhos no Meet para eu te mostrar um raio-x disso na prática? Fica melhor amanhã ou sexta?"

      - Se perguntou PREÇO:
        Seja transparente e seguro: a Pinas entrega a assessoria completa de tráfego com a página estruturada por uma mensalidade acessível de negócio local (em torno de R$ 1.500/mês), e que com apenas 1 ou 2 novos clientes o investimento já se paga todo mês com folga. Proponha bater um papo rápido de 15 min no Google Meet para ver se faz sentido para o momento dele.

      - Se disse que JÁ TEM ALGUÉM / JÁ TEM QUEM CUIDA / "JÁ TEM SIM" / "JÁ TEMOS" / JÁ TEM AGÊNCIA:
        REGRA INEGOCIÁVEL DO KAUÊ: NUNCA INSISTA, NÃO pergunte se está satisfeito e NÃO tente empurrar serviços!
        Entenda que o cliente já está atendido e não tem interesse no momento.
        Agradeça com simpatia, deseje sucesso e encerre a conversa educadamente com elegância:
        "Ah, tá bom! Muito obrigado pelo retorno, viu? Se tiver interesse ou precisar de algo futuramente, é só entrar em contato. Um abraço e muito sucesso por aí!"
        Marque obrigatoriamente: action: "mark_lost", detectedIntent: "already_has_agency".

      - Se perguntar COMO ACHOU O CONTATO:
        Explique honestamente que pesquisa negócios bem avaliados no Google Maps da região.

      - Se for SECRETÁRIA / ATENDIMENTO:
        Trate com respeito e pergunte com carinho quem cuida dessa parte comercial/novos clientes ou se consegue falar com o responsável.

      - Se concordar em bater um papo ("Pode ser", "Quinta fica bom", "Manda o link"):
        Comemore educadamente, combine o melhor dia/horário e peça o e-mail para enviar o convite da chamada no Google Meet (marque action: "mark_meeting").

      - Se o cliente PEDIR PARA FALAR DEPOIS / ADIAR / RETORNAR EM DATA FUTURA (ex: "me chama em novembro", "primeira semana de novembro", "semana que vem", "mês que vem", "agora estou na correria"):
        Acolha com simpatia e combine a data que ele pediu sem pressionar (ex: "Perfeito! Combinado então, te dou um toque na primeira semana de novembro. Um abraço!"). NUNCA insista nem tente empurrar reunião agora. Marque action: "mark_postponed".

      - Se for RECUSA DEFINITIVA, FALTA DE INTERESSE OU "NÃO" ("não tenho interesse", "não quero", "não temos interesse agora", "obrigado mas não", "sem interesse", "no momento não", "não precisamos"):
        REGRA DO KAUÊ: NUNCA INSISTA. Aceite a resposta imediatamente com classe, agradeça o tempo dele e encerre:
        "Ah, tá bom! Muito obrigado pelo retorno, viu? Se tiver interesse ou precisar de algo futuramente, é só entrar em contato. Um abraço e muito sucesso por aí!"
        Marque obrigatoriamente: action: "mark_lost", detectedIntent: "refused".

5. REGRAS INEGOCIÁVEIS ANTI-FALHA E 100% AUTOMÁTICO:
   - PROIBIDO prometer envio de vídeo, áudio gravado, gravação de tela ou links de arquivos. A operação é 100% automática; você NUNCA deve falar "gravei um vídeo", "vou mandar um vídeo", "posso te mandar o vídeo" ou "segue o link do vídeo".
   - PROIBIDO TERMINANTEMENTE gerar placeholders entre colchetes como "[Link do Vídeo]", "[Link do Video]", "[Link]", "[Vídeo]", "[Nome]", etc. Tudo o que você escrever será enviado de verdade para o WhatsApp do cliente.
   - Qualquer demonstração visual é feita EXCLUSIVAMENTE ao vivo em um bate-papo rápido de 10 a 15 minutos no Google Meet.

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "detectedIntent": "confirm_identity | interested | asking_questions | asking_price | gatekeeper | objection | confirmed | postponed | refused",
  "action": "reply | mark_meeting | mark_lost | mark_postponed",
  "replyText": "texto exato da mensagem pronta para enviar no WhatsApp",
  "reasoning": "por que respondeu dessa forma"
}
`;

  const jsonStr = await callGemini({
    prompt,
    systemInstruction: PINAS_SYSTEM_PROMPT,
    jsonMode: true
  });

  const parsed = safeJsonParse(jsonStr);

  // Blindagem de segurança e Formatação Humanizada com Linhas Pulo exigida pelo Kauê
  if (parsed && typeof parsed.replyText === 'string') {
    const isAskingAboutPortfolio = /quais\s+clientes|cases|portf[oó]lio|com\s+quem\s+(voc[eê]s?\s+)?trabalha/i.test(lastIncomingMessage || '');
    parsed.replyText = formatHumanWhatsAppMessage(parsed.replyText, {
      allowClients: isAskingAboutPortfolio
    });
  }

  return parsed;
}

/**
 * Formata a mensagem para o padrão estético humanizado exigido pelo Kauê:
 * - Parágrafos separados por quebra de linha dupla (\n\n)
 * - Sigilo estrito de clientes (remove Petiva, Pink Luxo, Chay B, Bem Zanza)
 * - Zero placeholders entre colchetes
 */
function formatHumanWhatsAppMessage(text, options = {}) {
  if (!text) return '';
  let str = String(text);

  // 1. Remover placeholders residuais entre colchetes
  str = str.replace(/\[\s*(link\s*(do\s*v[ií]deo)?|v[ií]deo|link|nome)\s*\]/gi, '');

  // 2. REGRA DO KAUÊ: NUNCA citar nomes de lojas atendidas a menos que perguntem expressamente por cases
  if (!options.allowClients) {
    str = str.replace(/\s*\([^)]*\b(petiva|pink\s*luxo|chay\s*b|bem\s*zanza)\b[^)]*\)/gi, '');
    str = str.replace(/\s*(?:,\s*)?(?:como\s+(?:a\s+|o\s+)?|inclusive\s+(?:da\s+|do\s+)?|da\s+|do\s+)?\b(petiva|pink\s*luxo|chay\s*b(?:\s+e\s+bem\s*zanza)?|bem\s*zanza)\b(?:\s+aqui\s+em\s+sp)?/gi, '');
  }

  // 3. Normalizar quebras de linha
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 4. Se o texto veio colado em uma única linha ou bloco sem quebra dupla (\n\n)
  if (!str.includes('\n\n')) {
    // Quebrar após a apresentação inicial (ex: "Sou o Kauê, da Pinas.")
    const introRegex = /(.*?Sou o Kauê,?\s+da Pinas[.!?]?|.*?Prazer falar contigo[.!?]?|.*?Tudo [^\n.!?]+[.!?]?\s+Sou o Kauê[.!?]?)\s+/i;
    if (introRegex.test(str)) {
      str = str.replace(introRegex, '$1\n\n');
    }

    // Quebrar antes da pergunta final de fechamento/qualificação
    const questionRegex = /\s+((?:Vocês já têm|Como vocês cuidam|Consegue 10|Consegue 15|Fica melhor|Você teria|Quem cuida|Você saberia|Sabe dizer|Topa um|Topa uma|O que acha)[^?\n]*\?)/i;
    if (questionRegex.test(str)) {
      str = str.replace(questionRegex, '\n\n$1');
    }
  }

  // 5. Limpar espaços horizontais duplicados sem matar as quebras de linha
  str = str.replace(/[^\S\n]{2,}/g, ' ');
  // Limpar quebras excessivas (máximo 2 \n consecutivos)
  str = str.replace(/\n{3,}/g, '\n\n');

  // 6. REGRA DO KAUÊ ANTI-TEXTÃO: MÁXIMO DE 3 BLOCOS CURTOS
  const rawParagraphs = str.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (rawParagraphs.length > 3) {
    const intro = rawParagraphs[0];
    const question = rawParagraphs[rawParagraphs.length - 1];
    const middle = rawParagraphs.slice(1, rawParagraphs.length - 1).join(' ');
    str = `${intro}\n\n${middle}\n\n${question}`;
  }

  return str.trim();
}

/**
 * 5. Abordagem Inicial 100% Despretensiosa (@pinas.studio)
 * Regra do Kauê: A primeira mensagem que for enviada NUNCA pode parecer venda!
 * Ex: "Olá, tudo bem? É da clínica [Nome]?"
 * A questão comercial da Pinas e o diagnóstico só entram quando o lead responder ("Ah, sou sim").
 */
async function generateAutonomousPitch({ lead, audit }) {
  const openingText = formatOpeningMessage(lead);

  return {
    pitchText: openingText,
    angleUsed: 'Abertura despretensiosa (confirmação do local sem cara de venda)',
    auditSummary: audit?.primaryAngle || (audit?.site?.hasWebsite ? 'Site auditado' : 'Sem site próprio')
  };
}

/**
 * 6. Auditoria Visual Profunda de Design/UX & Roteiro de Call de 15 Minutos (@pinas.studio)
 * Analisa sessão por sessão, imagens, design, conversão e gera o roteiro completo para o Google Meet.
 */
async function generateDeepVisualAuditAndCallScript({ lead, siteAudit, mapsAudit }) {
  const site = siteAudit || {};
  const maps = mapsAudit || {};
  const dom = site.domDetails || {};

  const prompt = `
Você é o Kauê, fundador da Pinas, assessoria de marketing e design web de alta conversão para negócios locais em São Paulo. NUNCA use arroba de redes sociais.
O lead abaixo é um comércio/serviço local em São Paulo.

DADOS DA EMPRESA:
- Nome: ${lead.name}
- Nicho: ${lead.niche || 'Comércio Local'}
- Bairro / Região: ${lead.neighborhood || maps.neighborhood || 'São Paulo'}
- Avaliações no Google Maps: ${maps.reviews || lead.reviews || 0} avaliações (Nota ${maps.rating || lead.rating || 'N/A'}★)
- Site Atual: ${site.hasWebsite ? (site.url || lead.website) : 'NÃO TEM SITE PRÓPRIO'}
- Status do Site: ${site.hasWebsite ? (site.isOnline ? 'Online (' + (site.loadTimeMs/1000).toFixed(1) + 's)' : 'FORA DO AR') : 'Sem site'}
- Botão de WhatsApp no Site: ${site.hasWhatsApp ? 'Possui botão' : 'NÃO POSSUI botão direto'}
- Pixels / Anúncios: ${site.doesPaidTraffic ? 'Tem tags de anúncio' : 'NÃO faz tráfego pago'}
- CMS / Plataforma: ${dom.detectedCms || 'Não identificado'}
- Sessões Detectadas: ${dom.sectionsFound || 'Geral'}
- Título do Site: ${site.title || 'Não informado'}
- Descrição: ${dom.metaDescription || 'Sem meta description'}
- Títulos H1/H2 no Site: ${(dom.h1List || []).concat(dom.h2List || []).join(' | ') || 'Não identificados'}
- Quantidade de Imagens: ${dom.imgCount || 0} imagens (${dom.imgsWithoutAlt || 0} sem descrição alt)
- Botões / CTAs: ${(dom.buttonCtaList || []).join(' | ') || 'Poucos CTAs visíveis'}

TAREFA DUPLA:
1. AUDITORIA VISUAL DE DESIGN E UX (Sessão por sessão, como se o Kauê estivesse navegando na página no celular agora):
   - Avalie: primeira impressão, Hero Section (topo), imagens e design geral, mobile/velocidade, e funil de conversão/WhatsApp.
   - Detalhe a Proposta de Redesign da Pinas: como transformar essa página numa landing page veloz e magnética.

2. ROTEIRO COMPLETO DE REUNIÃO DE 15 MINUTOS NO GOOGLE MEET:
   - Divida em 5 blocos com minutagem:
     a) 00:00 - 03:00: Abertura & Rapport (como quebrar o gelo conectando com o bairro e a reputação dele).
     b) 03:00 - 07:00: 3 a 4 Perguntas Estratégicas de Diagnóstico (perguntas certeiras para fazer o cliente admitir a dor de perder orçamentos).
     c) 07:00 - 11:00: Apresentação Visual na Tela (o que mostrar na tela compartilhada: apontar as falhas do site atual e apresentar a solução Pinas).
     d) 11:00 - 14:00: Quebra das Objeções Mais Comuns deste nicho ("quanto custa?", "já temos quem cuida", "não sei se vale a pena").
     e) 14:00 - 15:00: Fechamento Comercial & Próximos Passos (proposta sem compromisso, prazo rápido de 5 a 7 dias úteis).

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "visualAudit": {
    "overallRating": "Nota de 1 a 10 para o design e conversão atual",
    "firstImpression": "Resumo de 2 linhas do impacto visual ao abrir a página no celular",
    "sections": [
      {
        "name": "Hero Section (Topo)",
        "status": "Crítico | Regular | Bom",
        "critique": "Análise crítica do título, clareza e impacto visual inicial",
        "improvement": "O que a Pinas faria para melhorar"
      },
      {
        "name": "Imagens & Identidade Visual",
        "status": "Crítico | Regular | Bom",
        "critique": "Análise das fotos, harmonia de cores e profissionalismo",
        "improvement": "O que a Pinas faria"
      },
      {
        "name": "Experiência Mobile & Velocidade",
        "status": "Crítico | Regular | Bom",
        "critique": "Facilidade de toque com o polegar, tamanho de fonte e tempo de espera",
        "improvement": "O que a Pinas faria"
      },
      {
        "name": "Conversão & Prova Social",
        "status": "Crítico | Regular | Bom",
        "critique": "Botão de WhatsApp, facilidade de agendamento e depoimentos visíveis",
        "improvement": "O que a Pinas faria"
      }
    ],
    "pinasRedesignPitch": "Como apresentar a nova landing page da Pinas para este cliente em 3 pontos fortes"
  },
  "callScript": {
    "totalTime": "15 minutos",
    "steps": [
      {
        "time": "00:00 - 03:00",
        "title": "Abertura & Conexão Local",
        "objective": "Quebrar o gelo e validar a autoridade dele na região",
        "script": "Texto exato do que o Kauê deve falar para abrir a conversa",
        "tip": "Dica prática de postura do Kauê"
      },
      {
        "time": "03:00 - 07:00",
        "title": "Perguntas de Diagnóstico",
        "objective": "Fazer o cliente falar sobre a captação atual e volume de atendimentos",
        "questions": [
          {
            "question": "Pergunta 1...",
            "why": "Por que fazer essa pergunta"
          },
          {
            "question": "Pergunta 2...",
            "why": "Por que fazer essa pergunta"
          },
          {
            "question": "Pergunta 3...",
            "why": "Por que fazer essa pergunta"
          }
        ]
      },
      {
        "time": "07:00 - 11:00",
        "title": "Apresentação Visual na Tela",
        "objective": "Compartilhar a tela, mostrar os pontos cegos e encantar com a solução",
        "whatToShow": [
          "Ponto 1 para apontar na tela...",
          "Ponto 2 para apontar na tela..."
        ],
        "presentationScript": "O que o Kauê fala ao compartilhar a tela"
      },
      {
        "time": "11:00 - 14:00",
        "title": "Quebra de Objeções",
        "objective": "Desarmar as principais dúvidas com naturalidade",
        "objections": [
          {
            "objection": "Quanto custa o projeto?",
            "answer": "Como responder ancorando valor antes do preço"
          },
          {
            "objection": "Já tentei anúncio ou site antes e não funcionou",
            "answer": "Como responder diferenciando a metodologia da Pinas"
          }
        ]
      },
      {
        "time": "14:00 - 15:00",
        "title": "Fechamento & Próximo Passo",
        "objective": "Concretizar o fechamento com proposta formal",
        "closingScript": "Como fechar a reunião combinando a entrega do projeto",
        "callToAction": "Próxima ação prática"
      }
    ]
  }
}
`;

  const jsonStr = await callGemini({
    prompt,
    systemInstruction: PINAS_SYSTEM_PROMPT,
    jsonMode: true
  });

  return safeJsonParse(jsonStr);
}

/**
 * 7. Roteiro Estratégico Baseado no Resumo da Conversa do WhatsApp (@pinas.studio)
 * Analisa a conversa real trocada com o lead no WhatsApp, extrai o perfil de quem falou,
 * as dores admitidas, as objeções levantadas e cria o roteiro da call de fechamento sob medida.
 */
async function generateWhatsAppConversationScript({ lead, messages = [] }) {
  const validMsgs = (messages || []).filter(m => m && (m.text || m.type === 'image' || m.type === 'audio'));

  const hasCustomerReplied = validMsgs.some(m => !m.fromMe);

  let chatTranscript = 'Nenhuma mensagem trocada ainda.';
  if (validMsgs.length > 0) {
    chatTranscript = validMsgs.map(m => {
      const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const sender = m.fromMe ? 'Kauê (Pinas Studio)' : (m.senderName || lead.name || 'Cliente');
      const textContent = m.text || (m.type === 'audio' ? '[Áudio enviado]' : '[Imagem enviada]');
      return `[${timeStr}] ${sender}: ${textContent}`;
    }).join('\n');
  }

  const prompt = `
Você é o estrategista comercial sênior da Pinas, trabalhando lado a lado com o Kauê. NUNCA use arroba de redes sociais.
O Kauê precisa de um RESUMO EXECUTIVO DA CONVERSA DO WHATSAPP e um ROTEIRO DE CALL sob medida para fechar contrato com este lead.

DADOS DO LEAD:
- Empresa: ${lead.name}
- Nicho: ${lead.niche || 'Comércio/Serviço Local'}
- Bairro / Região: ${lead.neighborhood || lead.city || 'São Paulo - SP'}
- Telefone / WhatsApp: ${lead.phone || lead.cleanPhone}
- Status Atual: ${lead.status || 'contatado'}
- Tem Site Próprio: ${lead.hasWebsite ? 'Sim' : 'Não'}
- Site: ${lead.website || 'Sem site'}
- Avaliação Google Maps: ${lead.rating || 'N/A'}★ (${lead.reviews || 0} avaliações)

TRANSCRIÇÃO COMPLETA DA CONVERSA NO WHATSAPP:
"""
${chatTranscript}
"""

STATUS DE RESPOSTA DO CLIENTE:
${hasCustomerReplied ? 'O cliente RESPONDEU no WhatsApp. Analise o que ele disse com máxima atenção.' : 'O cliente AINDA NÃO respondeu no WhatsApp (apenas mensagem inicial enviada ou lead virgem).'}

SUA MISSÃO:
1. Analise cada fala do cliente (ou da recepção/secretária/dono) na conversa.
2. Crie um resumo executivo claro, direto e focado em negócios para o Kauê ler em 30 segundos antes de entrar na call ou mandar mensagem.
3. Identifique quem é a pessoa que respondeu (nome, se é o dono, sócio ou recepção), o tom de voz e o poder de decisão.
4. Liste as dores reais que a empresa confessou ou os gargalos que ficaram evidentes no chat.
5. Liste as objeções levantadas no WhatsApp e a resposta exata na voz do Kauê para contorná-las.
6. Estruture um Roteiro de Call de 15 minutos no Google Meet, começando com um gancho direto que conecta com o que foi falado no WhatsApp.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "hasCustomerReplied": ${hasCustomerReplied},
  "conversationSummary": "Resumo de 2 a 3 parágrafos diretos da conversa: como começou, o que o lead disse, se demonstrou interesse, se fez perguntas de preço e qual o estágio atual da negociação.",
  "interlocutor": {
    "name": "Nome da pessoa que falou no WhatsApp (ou 'Não identificado')",
    "role": "Dono / Sócia / Recepção / Gerente / Não identificado",
    "tone": "Tom de comunicação (ex: Ocupado e direto, Simpático e receptivo, Desconfiado)",
    "decisionPower": "Alto (Decisor Final) | Médio (Influenciador/Sócio) | Baixo (Recepção/Triagem)"
  },
  "painsAndNeeds": [
    "Dor 1 identificada na conversa ou no perfil",
    "Dor 2...",
    "Dor 3..."
  ],
  "objectionsAndAnswers": [
    {
      "objection": "Objeção levantada ou esperada",
      "howToCounter": "Como o Kauê deve responder com segurança e naturalidade"
    }
  ],
  "agreedNextSteps": "O que já ficou combinado no WhatsApp (ex: enviar prévia, marcar reunião, aguardando retorno)",
  "callScript": {
    "title": "Roteiro da Call de Fechamento Baseado no WhatsApp",
    "openingHook": "Frase exata do Kauê para abrir a conversa conectando com o papo do WhatsApp",
    "steps": [
      {
        "time": "00:00 - 03:00",
        "title": "Abertura & Conexão pelo WhatsApp",
        "objective": "Reconectar pelo que foi conversado no chat",
        "script": "Texto do que o Kauê fala na abertura...",
        "tip": "Dica de tom e postura"
      },
      {
        "time": "03:00 - 07:00",
        "title": "Aprofundamento nas Dores Admitidas",
        "objective": "Fazer o lead elaborar sobre o problema que citou no WhatsApp",
        "questions": [
          {
            "question": "Pergunta estratégica 1...",
            "why": "Motivo da pergunta"
          },
          {
            "question": "Pergunta estratégica 2...",
            "why": "Motivo da pergunta"
          }
        ]
      },
      {
        "time": "07:00 - 11:00",
        "title": "Apresentação da Solução Pinas Sob Medida",
        "objective": "Mostrar a solução na tela compartilhada",
        "keyPoints": [
          "Ponto forte 1 personalizado...",
          "Ponto forte 2...",
          "Ponto forte 3..."
        ]
      },
      {
        "time": "11:00 - 15:00",
        "title": "Proposta & Fechamento Comercial",
        "objective": "Apresentar condições e combinar início do projeto",
        "script": "Texto de fechamento comercial...",
        "callToAction": "Próximo passo imediato"
      }
    ],
    "goldenClosingPhrase": "Frase de ouro persuasiva para fechar o contrato"
  }
}
`;

  // Dispara a chamada ao Gemini com timeout de segurança (6 segundos)
  // Se a IA responder rápido, usa a resposta da IA. Se der timeout ou erro de quota/rede, ativa o gerador de contingência instantâneo da Pinas.
  try {
    const aiPromise = callGemini({
      prompt,
      systemInstruction: PINAS_SYSTEM_PROMPT,
      jsonMode: true
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI_TIMEOUT_FALLBACK')), 6000)
    );

    const jsonStr = await Promise.race([aiPromise, timeoutPromise]);
    const parsed = safeJsonParse(jsonStr);
    if (parsed && parsed.conversationSummary && parsed.callScript) {
      return parsed;
    }
  } catch (err) {
    console.warn(`[Conversation Script] ⚡ Ativando fallback instantâneo Pinas (Motivo: ${err.message})`);
  }

  // Fallback Inteligente Instantâneo da Pinas (@pinas.studio) — Zero Espera
  return buildInstantWhatsAppConversationScript({ lead, messages: validMsgs, hasCustomerReplied });
}

/**
 * Gerador de Contingência Instantâneo de Roteiro de WhatsApp da Pinas (@pinas.studio)
 * Garante entrega imediata (0ms) mesmo em quedas de quota, instabilidade de rede ou timeouts.
 */
function buildInstantWhatsAppConversationScript({ lead, messages = [], hasCustomerReplied = false }) {
  const customerMsgs = (messages || []).filter(m => !m.fromMe);
  const myMsgs = (messages || []).filter(m => m.fromMe);
  const niche = (lead.niche || '').toLowerCase();
  const name = lead.name || 'Empresa';
  const bairro = lead.neighborhood || lead.city || 'São Paulo';

  let lastCustomerText = customerMsgs.length > 0 ? (customerMsgs[customerMsgs.length - 1].text || '') : '';
  let interlocutorName = customerMsgs.length > 0 && customerMsgs[0].senderName ? customerMsgs[0].senderName : 'Responsável / Decisor';

  // Resumo executivo do diálogo
  let summary = '';
  if (customerMsgs.length > 0) {
    summary = `O contato foi iniciado pelo WhatsApp apresentando os diferenciais da Pinas Studio para a região de ${bairro}. O cliente respondeu à abordagem (${lastCustomerText ? `última mensagem: "${lastCustomerText}"` : 'demonstrou receptividade'}), abrindo uma oportunidade direta de avançar para uma conversa diagnóstica de 15 minutos.`;
  } else if (myMsgs.length > 0) {
    summary = `A abordagem inicial da Pinas Studio foi enviada destacando a reputação de ${lead.rating || '4.5+'}★ no Google e a oportunidade de captação de clientes qualificados em ${bairro}. O lead ainda não respondeu (aguardando retorno), configurando oportunidade de abertura consultiva.`;
  } else {
    summary = `Lead qualificado pronto para abordagem inicial. Identificado potencial imediato de captação local em ${bairro} através da assessoria de tráfego pago e posicionamento digital da Pinas Studio.`;
  }

  // Dores e Objeções por nicho
  let pains = [];
  let objections = [];
  let closingQuestion = '';

  if (niche.includes('vet') || niche.includes('pet')) {
    pains = [
      `Falta de previsibilidade de novos tutores no raio de 3km a 5km de ${bairro}`,
      'Dependência excessiva de indicação boca a boca ou de buscas passivas no Google Maps',
      'Atendimentos ou procedimentos de maior valor que acabam indo parar em clínicas concorrentes da região'
    ];
    objections = [
      {
        objection: 'Já fazemos postagens no Instagram todos os dias.',
        howToCounter: 'Post orgânico fala com quem já é cliente. O que a Pinas faz com o tráfego é colocar a clínica na frente do tutor que precisa de atendimento urgente agora no seu bairro.'
      },
      {
        objection: 'Não sei se temos orçamento para marketing agora.',
        howToCounter: 'O projeto se paga trazendo 2 a 3 novos atendimentos ou cirurgias no mês. Se a conta não fechar com lucro no seu bolso, a gente nem começa.'
      }
    ];
    closingQuestion = `Faz sentido a gente começar a captar esses tutores que estão buscando atendimento agora em ${bairro} e que hoje estão indo para a clínica concorrente?`;
  } else if (niche.includes('roup') || niche.includes('moda') || niche.includes('boutique')) {
    pains = [
      'Tráfego do Instagram gerando curiosos que não convertem em compras reais no WhatsApp',
      'Concorrência pesada de preços e falta de catálogo de alta conversão estruturado',
      'Dificuldade de reter clientes para compras recorrentes nas novas coleções'
    ];
    objections = [
      {
        objection: 'Já tenho alguém que cuida do tráfego ou dos posts.',
        howToCounter: 'Nosso foco não é métrica de vaidade (curtida ou seguidor), é cliente chamando no WhatsApp com intenção de compra. Vamos comparar os resultados.'
      },
      {
        objection: 'Quanto custa para começar?',
        howToCounter: 'Trabalhamos com investimento acessível e focado no retorno da sua coleção. A estrutura se paga nas primeiras semanas de campanha.'
      }
    ];
    closingQuestion = `Podemos estruturar esse fluxo para transformar os cliques do seu Instagram em pedidos faturados no WhatsApp a partir da semana que vem?`;
  } else {
    pains = [
      `Gargalo na conversão de cliques locais em mensagens diretas no WhatsApp em ${bairro}`,
      'Perda de clientes qualificados para concorrentes com maior presença no Google e redes sociais',
      'Falta de acompanhamento comercial para fechar propostas que esfriam'
    ];
    objections = [
      {
        objection: 'Já tentei anúncios antes e não tive resultado.',
        howToCounter: 'Muitos sobem anúncios sem estruturar a página e o funil de atendimento. Na Pinas, cuidamos desde o clique até a conversão final no WhatsApp.'
      },
      {
        objection: 'Preciso falar com meu sócio antes de decidir.',
        howToCounter: 'Perfeito. Montamos um resumo executivo com os dados da concorrência no seu bairro para você apresentar para ele com total clareza.'
      }
    ];
    closingQuestion = `Faz sentido a gente implementar essa estrutura de captação para blindar o seu negócio e dominar as buscas em ${bairro}?`;
  }

  const openingHook = hasCustomerReplied
    ? `Fala, tudo bem? Vi a sua resposta no WhatsApp sobre a demanda de ${bairro} e queria alinhar rapidamente como podemos destravar esses atendimentos pra você.`
    : `Opa, tudo bem? Vi que você recebeu a nossa análise sobre a presença digital da ${name} em ${bairro} e queria bater um papo rápido de 15 minutos sem enrolação.`;

  return {
    hasCustomerReplied,
    conversationSummary: summary,
    interlocutor: {
      name: interlocutorName,
      role: customerMsgs.length > 0 ? 'Decisor / Proprietário' : 'Não identificado',
      tone: customerMsgs.length > 0 ? 'Receptivo e direto' : 'Neutro / Aguardando',
      decisionPower: 'Alto (Decisor Final)'
    },
    painsAndNeeds: pains,
    objectionsAndAnswers: objections,
    agreedNextSteps: customerMsgs.length > 0 
      ? 'Avançar para diagnóstico de 15 minutos pelo Google Meet' 
      : 'Aguardando retorno da mensagem de abordagem no WhatsApp',
    callScript: {
      title: 'Roteiro da Call de Fechamento Baseado no WhatsApp',
      openingHook,
      steps: [
        {
          time: '00:00 - 03:00',
          title: 'Abertura & Conexão pelo WhatsApp',
          objective: 'Reconectar de forma humana e direta citando a conversa do chat',
          script: `Fala, tudo bem? Poxa, obrigado pelo tempo. Vi aqui o perfil da ${name} e achei muito forte a nota no Google. Queria entender rapidamente como está a entrada de novos clientes vindo pela internet hoje aí em ${bairro}.`,
          tip: 'Mantenha tom calmo, profissional e escuta ativa. Nada de afobação.'
        },
        {
          time: '03:00 - 07:00',
          title: 'Diagnóstico & Aprofundamento nas Dores',
          objective: 'Fazer o cliente verbalizar o gargalo atual de faturamento',
          questions: [
            {
              question: 'Hoje, a maior parte dos clientes novos chega por indicação ou por busca ativa no Google e redes?',
              why: 'Mapear a dependência de canais orgânicos passivos.'
            },
            {
              question: 'Quando um cliente chega no seu WhatsApp, você sente que a conversão em fechamento é rápida ou muitos somem?',
              why: 'Identificar gargalo comercial no atendimento.'
            }
          ]
        },
        {
          time: '07:00 - 11:00',
          title: 'Apresentação da Solução Pinas Sob Medida',
          objective: 'Mostrar na tela compartilhada como resolver o gargalo',
          keyPoints: [
            `Anúncios hiperlocais no raio de ${bairro} para captar quem tem intenção de compra agora`,
            'Landing page ultra-rápida direcionando cliques direto para o seu WhatsApp',
            'Script de atendimento comercial para não deixar leads esfriarem'
          ]
        },
        {
          time: '11:00 - 15:00',
          title: 'Proposta & Fechamento Comercial',
          objective: 'Combinar os próximos passos práticos de início',
          script: `O que eu proponho é a gente começar um piloto estruturado de 30 dias. A gente coloca as campanhas no ar e valida o fluxo de novos clientes entrando no seu WhatsApp.`,
          callToAction: 'Podemos dar o pontapé inicial na segunda-feira?'
        }
      ],
      goldenClosingPhrase: closingQuestion
    }
  };
}

// ==================== PROCESSAMENTO E AUDIÇÃO DE ÁUDIO DE VOZ ====================

/**
 * Escutar, transcrever e responder áudio de voz do WhatsApp via Google Gemini Multimodal
 * Valida a integridade do áudio e gera resposta contextualizada no tom do Kauê
 */
async function analyzeAndRespondAudioMessage({ lead, audioFilePath, messages = [] }) {
  if (!audioFilePath || !fs.existsSync(audioFilePath)) {
    return {
      success: false,
      isAudible: false,
      reason: 'Arquivo de áudio não encontrado em disco.'
    };
  }

  const stats = fs.statSync(audioFilePath);
  if (stats.size < 500) {
    return {
      success: false,
      isAudible: false,
      reason: 'Arquivo de áudio corrompido ou vazio (menos de 500 bytes).'
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada.');
  }

  // Garantir cota gratuita do Gemini Free Tier
  await geminiGuard.acquireFreeTierSlot();

  const buffer = fs.readFileSync(audioFilePath);
  const base64Audio = buffer.toString('base64');
  const mimeType = audioFilePath.endsWith('.mp4') ? 'audio/mp4' : (audioFilePath.endsWith('.ogg') ? 'audio/ogg' : 'audio/mp4');

  // Histórico recente para contextualizar o Gemini
  const recentHistoryText = (messages || []).slice(-6).map(m => {
    const sender = m.fromMe ? 'Kauê (Pinas)' : (lead.name || 'Cliente');
    return `[${sender}]: ${m.text || (m.type === 'audio' ? '[Áudio]' : '[Mídia]')}`;
  }).join('\n');

  const neighborhood = lead.neighborhood || 'São Paulo - SP';
  const niche = lead.niche || 'Negócio Local';

  const prompt = `
Você é o Kauê, fundador da assessoria Pinas em São Paulo.
O lead "${lead.name}" (${niche} em ${neighborhood}) acaba de te enviar este áudio de voz pelo WhatsApp.

Histórico recente da conversa:
${recentHistoryText || '(Início do contato)'}

SUA TAREFA OBRIGATÓRIA EM 2 ETAPAS:
1. TRANSCRIÇÃO & CONFERÊNCIA DO ÁUDIO:
   - Ouça o áudio com atenção e transcreva com fidelidade o que a pessoa falou em português brasileiro ("transcript").
   - Avalie se o áudio está compreensível ("isAudible": true/false). Se for apenas ruído, chiado de fundo ou incompreensível, defina "isAudible": false.

2. GERAÇÃO DA RESPOSTA NO TOM DO KAUÊ (se audível):
   - Responda no tom de voz real do Kauê: natural, direto, humano, respeitoso, sem corporativês.
   - Responda EXATAMENTE às dúvidas ou pontos que ela levantou no áudio.
   - Tamanho máximo: 2 a 3 blocos curtos (40 a 65 palavras no total).
   - Se ela perguntou como funciona ou mostrou interesse: convide para 10 a 15 minutos no Google Meet.
   - Se ela disse que já tem agência ou recusou: NUNCA insista, agradeça simpaticamente e deseje sucesso.
   - Se o áudio foi inaudível ("isAudible": false), responda educadamente: "Opa! Tentei ouvir seu áudio aqui, mas deu uma falhadinha no som e não consegui escutar direito. Se puder mandar em texto ou gravar de novo, agradeço bastante!".

Retorne EXCLUSIVAMENTE um objeto JSON:
{
  "isAudible": true,
  "audioQuality": "claro | baixo | inaudivel",
  "transcript": "transcrição do que a pessoa falou",
  "summary": "resumo em 1 frase da intenção do lead",
  "detectedIntent": "confirm_identity | interested | asking_questions | asking_price | objection | refused | inaudible",
  "action": "reply | mark_meeting | mark_lost",
  "replyText": "texto exato da mensagem pronta para enviar no WhatsApp",
  "reasoning": "por que respondeu dessa forma"
}
`;

  const audioPayload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      topP: 0.95,
      responseMimeType: 'application/json'
    }
  };

  const audioModels = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest'];
  let lastErr = null;

  for (const model of audioModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioPayload),
        signal: AbortSignal.timeout(25000)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini Audio ${model} retornou ${res.status}: ${errText.slice(0, 150)}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Gemini retornou resposta vazia para o áudio.');

      const parsed = JSON.parse(rawText);
      parsed.success = true;
      parsed.modelUsed = model;
      return parsed;
    } catch (err) {
      lastErr = err;
      console.warn(`[Gemini Audio] Tentativa com modelo ${model} falhou: ${err.message}. Tentando próximo...`);
    }
  }

  throw lastErr || new Error('Falha ao processar áudio com os modelos Gemini disponíveis.');
}

module.exports = {
  getApiKey,
  isConfigured: () => !!getApiKey(),
  callGemini,
  analyzeLead,
  generatePitches,
  suggestChatReply,
  generateAutoPilotReply,
  generateAutonomousPitch,
  generateDeepVisualAuditAndCallScript,
  generateWhatsAppConversationScript,
  buildInstantWhatsAppConversationScript,
  formatHumanWhatsAppMessage,
  analyzeAndRespondAudioMessage,
  getFreeTierStatus: geminiGuard.getFreeTierStatus
};

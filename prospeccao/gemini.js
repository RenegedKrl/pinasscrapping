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

// Modelos oficiais suportados
const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash';
const SECONDARY_FALLBACK = 'gemini-3.1-flash-lite';
const TERTIARY_FALLBACK = 'gemini-flash-lite-latest';

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

  async function executeRequest(targetModel) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

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

// System Instruction central com o Tom de Voz do Kauê e da Pinas (@pinas.studio)
const PINAS_SYSTEM_PROMPT = `
Você é o estrategista de inteligência comercial da Pinas (@pinas.studio), agência/assessoria de marketing digital do Kauê em São Paulo.
A Pinas é especializada em:
1. Criação de sites de alta conversão (landing pages modernas, rápidas, com botão de WhatsApp direto).
2. Tráfego pago focado em captação local (Google Ads Search/Maps e Meta Ads no raio do bairro).
3. Estruturação comercial para transformar cliques em clientes que pagam.

TOM DE VOZ DO KAUÊ (OBRIGATÓRIO):
- 100% Humano, natural, descontraído e educado. Conversa de profissional sério com outro empreendedor.
- NUNCA use corporativês ou jargões vazios ("sinergia", "alavancar", "otimização holística", "ecossistema").
- NUNCA soe como telemarketing ou robô de vendas ("Prezado responsável", "Venho por meio desta", "Boa tarde, sou da agência X").
- Fale com clareza sobre o mundo real: falar do bairro, das avaliações no Google Maps, de tutores/pacientes/clientes da região.
- Frases diretas e fáceis de ler no celular/WhatsApp.
- NUNCA envie textão gigante de uma vez. Mensagens para WhatsApp devem ter entre 2 e 5 linhas, divididas em parágrafos curtos.
`;

/**
 * Helper para decodificar JSON do Gemini com segurança contra quebras de linha literais
 */
function safeJsonParse(rawStr) {
  if (!rawStr) return {};
  let cleaned = String(rawStr).trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

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
Crie 3 opções de mensagens de abordagem para o WhatsApp para este lead. As mensagens devem ser enviadas pelo Kauê da Pinas (@pinas.studio).

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
O lead respondeu no WhatsApp. Como o Kauê (@pinas.studio), sugira a melhor resposta para dar continuidade à conversa de forma natural e conduzir o contato para um alinhamento rápido (call de 15 minutos ou apresentação rápida de proposta).

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
async function generateAutoPilotReply({ lead, messages = [], lastIncomingMessage = '' }) {
  const conversationFormatted = messages.map(m => {
    const sender = m.fromMe ? 'Kauê (Pinas)' : (lead?.name || 'Cliente');
    return `${sender}: ${m.text || '[mídia/anexo]'}`;
  }).slice(-12).join('\n');

  const prompt = `
Você é o Kauê, fundador da Pinas (@pinas.studio). Você está conversando pessoalmente pelo WhatsApp com o dono ou responsável por este negócio local em São Paulo.

DADOS REAIS DO NEGÓCIO:
- Nome: ${lead?.name || 'Empresa'}
- Nicho: ${lead?.niche || 'Comércio Local'}
- Bairro/Região: ${lead?.neighborhood || lead?.city || 'São Paulo'}
- Tem site: ${lead?.hasWebsite ? 'Sim (' + (lead.website || '') + ')' : 'Não tem site próprio'}
- Avaliação Maps: ${lead?.rating || 'N/A'} estrelas (${lead?.reviews || 0} reviews no Google Maps)

HISTÓRICO DA CONVERSA:
${conversationFormatted || 'Cliente: ' + lastIncomingMessage}

ÚLTIMA MENSAGEM DO CLIENTE:
"${lastIncomingMessage || (messages.filter(m => !m.fromMe).pop()?.text) || ''}"

DIRETRIZES DA CONVERSA DO KAUÊ (GERAÇÃO DE CONFIANÇA & CONDUÇÃO PARA CALL):
1. SEJA 100% HUMANO E NATURAL:
   - Fale como o Kauê: profissional de verdade conversando com outro empreendedor. Responda em 1 a 3 parágrafos curtinhos (estilo WhatsApp real, de 2 a 5 linhas no total).
   - NUNCA use linguagem robótica de telemarketing ou corporativês vazio.

2. SE O CLIENTE FOR RECEPTIVO OU PERGUNTAR QUEM É / O QUE FAZEM / COMO FUNCIONA:
   - Explique de forma simples: que na Pinas estruturamos landing pages limpas e rápidas (carregam em 1s) pensadas pra quem pesquisa no Google da região abrir no celular e já chamar no Whats para fechar.
   - Pergunte se podem fazer uma call rápida de 10 a 15 minutinhos no Google Meet para você mostrar a prévia sem compromisso ("Prefere amanhã de manhã ou à tarde?").

3. SE O CLIENTE NÃO ACEITAR DE COMEÇO E COMEÇAR A FAZER VÁRIAS PERGUNTAS OU HESITAR:
   - REGRA DE OURO: NÃO force a call de novo imediatamente! Responda cada dúvida com paciência, clareza e transparência para ele acreditar em você e ganhar confiança.
   - Se perguntar preço: seja sincero. Diga que depende do escopo (ajustar o site atual ou fazer página nova com tráfego), mas que é um investimento acessível para comércio local e que se paga rápido com poucos clientes do bairro.
   - Se perguntar como achou o contato: explique com honestidade que pesquisa empresas com boa reputação no Google Maps no bairro e gosta de olhar a presença digital para ver se acompanha a qualidade do serviço físico.
   - Se disser que já tem site ou agência: respeite, elogie e aponte apenas o fato técnico (ex: velocidade no celular ou botão de WhatsApp), comentando que muitas agências cuidam só de redes sociais e esquecem a conversão de quem busca no Google.
   - Se for secretária / recepção: trate com total respeito e pergunte o melhor momento ou WhatsApp do dono/gerente para trocar uma ideia rápida.
   - Vá respondendo às perguntas dele até ele se sentir confortável. Só quando o papo fluir e a confiança for estabelecida, sugira a call rápida.

4. SE O CLIENTE CONCORDAR COM A CALL:
   - Confirme o dia e horário e peça o email dele para enviar o convite do Google Meet (marque action = "mark_meeting").

5. SE FOR RECUSA DEFINITIVA E CATEGÓRICA ("não tenho interesse", "favor não mandar mais mensagem"):
   - Agradeça educadamente pelo tempo dele e encerre com classe sem insistir (marque action = "mark_lost").

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "detectedIntent": "interested | asking_questions | asking_price | gatekeeper | objection | confirmed | refused",
  "action": "reply | mark_meeting | mark_lost",
  "replyText": "texto exato da mensagem pronta para enviar no WhatsApp",
  "reasoning": "estratégia adotada para responder e gerar confiança"
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
 * 5. Abordagem Inicial 100% Natural, Original e sob Medida (@pinas.studio)
 * Se apresenta, cita o problema encontrado no site/Google, menciona que temos solução
 * e ESPERA o cliente responder (SEM forçar call na primeira mensagem!).
 */
async function generateAutonomousPitch({ lead, audit }) {
  const site = audit?.site || {};
  const maps = audit?.maps || {};

  const siteInfo = site.hasWebsite
    ? (site.isOnline
      ? `Site ativo: ${site.url}. Tempo de carregamento: ${(site.loadTimeMs/1000).toFixed(1)}s. ${site.hasWhatsApp ? 'Possui botão de WhatsApp.' : 'NÃO tem botão de WhatsApp.'} ${site.doesPaidTraffic ? 'Tem pixel de anúncio.' : 'Não tem pixel de anúncio.'}`
      : `Site FORA DO AR / erro: ${site.url} (${site.error || 'Erro ' + site.statusCode}).`)
    : 'NÃO possui site próprio cadastrado (depende apenas do Google Maps e redes sociais).';

  const mapsInfo = `Bairro: ${maps.neighborhood || lead.neighborhood || 'São Paulo'}. Avaliações: ${maps.reviews || 0} avaliações no Google Maps (nota ${maps.rating ? Number(maps.rating).toFixed(1) : 'sem nota'}).`;

  const weaknessesList = site.weaknesses && site.weaknesses.length > 0
    ? site.weaknesses.join('; ')
    : (site.hasWebsite ? 'Falta de otimização de conversão' : 'Sem site próprio');

  const prompt = `
Você é o Kauê, fundador da Pinas (@pinas.studio), especialista em presença digital e sites de alta conversão para negócios locais em São Paulo.
Crie a PRIMEIRA MENSAGEM de WhatsApp para entrar em contato com este lead.

DADOS REAIS DO NEGÓCIO:
- Nome: ${lead.name}
- Nicho: ${lead.niche || 'Comércio Local'}
- Google Maps: ${mapsInfo}
- Site Real Auditado: ${siteInfo}
- Problemas Identificados: ${weaknessesList}
- Principal Gargalo: ${audit?.primaryAngle || 'Presença digital com pontos fracos'}

ESTRUTURA DA PRIMEIRA MENSAGEM (LEVE, DESCONTRAÍDA E TOTALMENTE NATURAL):
1. SE APRESENTE:
   - Diga oi de forma leve e natural ("Opa, tudo bem? Aqui é o Kauê da Pinas", "Opa, tudo certo? Kauê por aqui da Pinas").
   - Diga que encontrou o perfil deles no Google aqui em ${maps.neighborhood || 'São Paulo'} e foi dar uma olhada no site/canais deles pelo celular.

2. CITE O PROBLEMA REAL ENCONTRADO:
   - Cite com naturalidade e cuidado um ponto específico do site/Google deles:
     * Se o site é lento: comente que quando foi abrir no celular demorou um bocado pra carregar, e hoje muita gente desiste e volta pro Google.
     * Se não tem botão de WhatsApp: aponte que o site até tem as informações, mas não viu um botão direto de WhatsApp pra quem tá no celular chamar na hora.
     * Se o site está fora do ar ou com erro: avise com gentileza que tentou entrar pelo link do Google e a página tá dando erro ou fora do ar.
     * Se não tem site próprio: comente que viu as ótimas avaliações deles no Google Maps no bairro, mas viu que ainda não têm um site próprio com botão de WhatsApp pra receber quem busca no Google.

3. MENCIONE QUE TEMOS UMA SOLUÇÃO:
   - Diga que a Pinas ajuda negócios da região exatamente nisso, estruturando páginas rápidas que abrem em 1s no celular e já jogam direto pro WhatsApp pra fechar clientes.

4. REGRA DE OURO DO KAUÊ (NÃO PEÇA CALL AINDA!):
   - NÃO pergunte se pode fazer call agora na primeira mensagem!
   - Termine apenas com uma pergunta simples e aberta para iniciar o diálogo e esperar ele responder:
     Exemplos:
     * "Tô falando com o dono ou responsável por aí?"
     * "Já tinham reparado nisso por aí?"
     * "Vocês já têm alguém cuidando dessa parte do site por aí hoje?"

REGRAS DE FORMATAÇÃO E TOM:
- Mensagem curta: no máximo 2 a 3 parágrafos breves (total de 4 a 6 linhas).
- Linguagem de WhatsApp brasileiro: humana, autêntica, sem jargões corporativos e sem parecer texto automático copiado.
- Crie uma variação original e única para este cliente.

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "pitchText": "texto exato da mensagem pronta para enviar no WhatsApp",
  "angleUsed": "resumo do gancho utilizado",
  "auditSummary": "resumo do problema citado e abordagem"
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
 * 6. Auditoria Visual Profunda de Design/UX & Roteiro de Call de 15 Minutos (@pinas.studio)
 * Analisa sessão por sessão, imagens, design, conversão e gera o roteiro completo para o Google Meet.
 */
async function generateDeepVisualAuditAndCallScript({ lead, siteAudit, mapsAudit }) {
  const site = siteAudit || {};
  const maps = mapsAudit || {};
  const dom = site.domDetails || {};

  const prompt = `
Você é o Kauê, fundador da Pinas (@pinas.studio), especialista em Design Web de Alta Conversão, Tráfego Pago e Posicionamento Comercial para negócios locais em São Paulo.
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
Você é o estrategista comercial sênior da Pinas (@pinas.studio), trabalhando lado a lado com o Kauê.
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

  const jsonStr = await callGemini({
    prompt,
    systemInstruction: PINAS_SYSTEM_PROMPT,
    jsonMode: true
  });

  return safeJsonParse(jsonStr);
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
  getFreeTierStatus: geminiGuard.getFreeTierStatus
};

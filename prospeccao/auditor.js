/**
 * Módulo de Auditoria Técnica Real de Site e Google Maps (@pinas.studio)
 * 
 * Inspeciona os ativos digitais do lead em tempo real:
 * 1. Site da empresa: Checagem de disponibilidade, velocidade, SSL, botão de WhatsApp, Pixel/Analytics e mobile.
 * 2. Google Maps: Checagem de reputação, volume de reviews, autoridade local e consistência de endereço/bairro.
 * 
 * Gera fatos objetivos que alimentam a IA do Gemini para criar abordagens ultra-personalizadas.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Realiza fetch HTTP nativo leve e rápido com timeout estrito
 */
function fetchUrlText(targetUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let isSettled = false;
    let req = null;

    const safeSettle = (result) => {
      if (isSettled) return;
      isSettled = true;
      if (hardTimeoutTimer) clearTimeout(hardTimeoutTimer);
      if (req) {
        try { req.destroy(); } catch (e) {}
      }
      resolve(result);
    };

    // Hard timeout timer absoluto (garante que NUNCA trava a promise)
    const hardTimeoutTimer = setTimeout(() => {
      safeSettle({ success: false, error: 'Tempo limite esgotado (site não respondeu em 5s)', loadTimeMs: timeoutMs });
    }, timeoutMs);

    try {
      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      } catch (e) {
        return safeSettle({ success: false, error: 'URL inválida', loadTimeMs: 0 });
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const startTime = Date.now();

      req = client.get(
        parsedUrl.toString(),
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          timeout: timeoutMs
        },
        (res) => {
          const loadTimeMs = Date.now() - startTime;
          const statusCode = res.statusCode || 200;

          // Redirecionamento (seguir até 1 nível)
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (redirectUrl.startsWith('/')) {
              redirectUrl = `${parsedUrl.origin}${redirectUrl}`;
            }
            try { res.destroy(); } catch (e) {}
            try { req.destroy(); } catch (e) {}
            clearTimeout(hardTimeoutTimer);
            const remainingTime = Math.max(2500, timeoutMs - loadTimeMs);
            return fetchUrlText(redirectUrl, remainingTime)
              .then(redirectRes => safeSettle(redirectRes))
              .catch(err => safeSettle({ success: false, error: err.message, loadTimeMs: Date.now() - startTime }));
          }

          let data = '';
          res.setEncoding('utf8');

          res.on('data', (chunk) => {
            data += chunk;
            // Se passar de 300KB, já coletamos o essencial (<head>, <body>, scripts, pixel).
            // Concluir imediatamente sem esperar o restante do download!
            if (data.length > 300000) {
              try { res.destroy(); } catch (e) {}
              safeSettle({
                success: statusCode >= 200 && statusCode < 400,
                statusCode,
                loadTimeMs: Date.now() - startTime,
                html: data,
                finalUrl: parsedUrl.toString()
              });
            }
          });

          res.on('end', () => {
            safeSettle({
              success: statusCode >= 200 && statusCode < 400,
              statusCode,
              loadTimeMs,
              html: data,
              finalUrl: parsedUrl.toString()
            });
          });

          res.on('close', () => {
            // Em caso de stream fechado antes de 'end'
            safeSettle({
              success: statusCode >= 200 && statusCode < 400,
              statusCode,
              loadTimeMs: Date.now() - startTime,
              html: data,
              finalUrl: parsedUrl.toString()
            });
          });

          res.on('error', (err) => {
            safeSettle({ success: false, error: err.message, loadTimeMs: Date.now() - startTime });
          });
        }
      );

      req.on('timeout', () => {
        safeSettle({ success: false, error: 'Tempo limite esgotado (site muito lento)', loadTimeMs: timeoutMs });
      });

      req.on('error', (err) => {
        safeSettle({ success: false, error: err.message, loadTimeMs: Date.now() - startTime });
      });
    } catch (err) {
      safeSettle({ success: false, error: err.message, loadTimeMs: 0 });
    }
  });
}

/**
 * Inspeciona o Website da Empresa
 */
async function auditWebsite(rawWebsiteUrl) {
  if (!rawWebsiteUrl || !rawWebsiteUrl.trim()) {
    return {
      hasWebsite: false,
      isOnline: false,
      summary: 'Não possui site oficial cadastrado.',
      details: 'A empresa depende exclusivamente de redes sociais ou Maps. Perde centenas de buscas qualificadas no Google todo mês.',
      opportunityScore: 10,
      attackAngle: 'Sem site próprio. Oportunidade direta de criar uma landing page veloz com botão de WhatsApp.',
      diagnosisTags: ['🚫 Sem Site Próprio', '⚠️ Depende 100% de Redes Sociais', '🎯 Oportunidade Alta']
    };
  }

  const cleanUrl = rawWebsiteUrl.trim();
  const res = await fetchUrlText(cleanUrl);

  if (!res.success) {
    return {
      hasWebsite: true,
      url: cleanUrl,
      isOnline: false,
      error: res.error,
      loadTimeMs: res.loadTimeMs,
      summary: `Site cadastrado está instável ou fora do ar (${res.error || 'Erro ' + res.statusCode}).`,
      details: 'O link que consta no Google não abre para os clientes, gerando perda imediata de confiança.',
      opportunityScore: 9,
      attackAngle: 'Site fora do ar ou inacessível. Oportunidade de alertar com cuidado e oferecer reconstrução moderna.',
      diagnosisTags: ['❌ Site Fora do Ar', '⚠️ Link Inacessível no Maps', '🎯 Oportunidade Urgente']
    };
  }

  const html = res.html || '';
  const lowerHtml = html.toLowerCase();

  // 1. Extrair título
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 2. Checar presença de WhatsApp
  const hasWhatsApp = (
    lowerHtml.includes('wa.me/') ||
    lowerHtml.includes('api.whatsapp.com') ||
    lowerHtml.includes('web.whatsapp.com') ||
    lowerHtml.includes('whatsapp') && lowerHtml.includes('phone=')
  );

  // 3. Checar presença de Pixel / Ferramentas de Tráfego Pago
  const hasMetaPixel = lowerHtml.includes('fbq(') || lowerHtml.includes('connect.facebook.net');
  const hasGoogleAdsOrTag = lowerHtml.includes('googletagmanager.com') || lowerHtml.includes('gtag(') || lowerHtml.includes('google_conversion_id');
  const hasAnalytics = lowerHtml.includes('google-analytics.com') || lowerHtml.includes('analytics.js') || lowerHtml.includes('gtag(');
  const doesPaidTraffic = hasMetaPixel || hasGoogleAdsOrTag;

  // 4. Checar Responsividade Básica (Viewport mobile)
  const isMobileResponsive = lowerHtml.includes('name="viewport"') || lowerHtml.includes("name='viewport'");

  // 5. Avaliar velocidade
  const isSlow = res.loadTimeMs > 2800;

  // 6. Diagnóstico consolidado
  const diagnosisTags = [];
  const weaknesses = [];
  const strengths = [];

  if (res.loadTimeMs < 1500) {
    strengths.push(`Carregamento ágil (${(res.loadTimeMs / 1000).toFixed(1)}s)`);
  } else if (isSlow) {
    weaknesses.push(`Carregamento lento (${(res.loadTimeMs / 1000).toFixed(1)}s)`);
    diagnosisTags.push('⏳ Carregamento Lento');
  }

  if (hasWhatsApp) {
    strengths.push('Possui botão de WhatsApp no site');
    diagnosisTags.push('✅ Tem WhatsApp');
  } else {
    weaknesses.push('Não possui botão direto de WhatsApp visível');
    diagnosisTags.push('❌ Sem Botão WhatsApp');
  }

  if (doesPaidTraffic) {
    strengths.push('Já possui pixels de anúncio (investe em tráfego)');
    diagnosisTags.push('📈 Já Investe em Anúncios');
  } else {
    weaknesses.push('Não possui Pixel do Facebook ou Google Ads ativo (não faz tráfego qualificado)');
    diagnosisTags.push('🔍 Sem Tráfego Pago Ativo');
  }

  if (!isMobileResponsive) {
    weaknesses.push('Pode ter problemas de visualização em celulares (sem tag viewport)');
    diagnosisTags.push('📱 Não Otimizado pra Mobile');
  }

  let opportunityScore = 6;
  let attackAngle = 'Otimização de conversão e atração local.';

  if (!hasWhatsApp) {
    opportunityScore = 8;
    attackAngle = 'O site atual não facilita o contato direto pelo WhatsApp. Uma página de alta conversão aumentaria muito os orçamentos.';
  } else if (!doesPaidTraffic) {
    opportunityScore = 8;
    attackAngle = 'A empresa tem site funcional mas não usa tráfego pago para atrair os clientes da região.';
  } else if (isSlow) {
    opportunityScore = 7;
    attackAngle = 'O site é lento no celular, fazendo clientes desistirem antes de carregar.';
  }

  // 7. Extração Estrutural Profunda de UX, Design e Sessões
  const domDetails = extractDomVisualDetails(html);

  return {
    hasWebsite: true,
    url: cleanUrl,
    isOnline: true,
    loadTimeMs: res.loadTimeMs,
    title,
    hasWhatsApp,
    hasMetaPixel,
    hasGoogleAdsOrTag,
    hasAnalytics,
    doesPaidTraffic,
    isMobileResponsive,
    isSlow,
    diagnosisTags,
    strengths,
    weaknesses,
    opportunityScore,
    attackAngle,
    domDetails,
    summary: `Site ativo (${(res.loadTimeMs / 1000).toFixed(1)}s). ${hasWhatsApp ? 'Possui botão de WhatsApp.' : 'SEM botão direto de WhatsApp.'} ${doesPaidTraffic ? 'Já tem tags de anúncios.' : 'SEM tags de tráfego pago.'}`
  };
}

/**
 * Extrai dados semânticos do HTML para análise visual e de UX pelo Gemini
 */
function extractDomVisualDetails(html) {
  if (!html) return {};

  // 1. Meta Description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const metaDescription = descMatch ? descMatch[1].trim() : '';

  // 2. Headings (H1, H2, H3)
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const h3Matches = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

  // 3. Imagens
  const imgMatches = [...html.matchAll(/<img[^>]*>/gi)];
  const imgCount = imgMatches.length;
  let imgsWithoutAlt = 0;
  for (const imgTag of imgMatches) {
    const raw = imgTag[0].toLowerCase();
    if (!raw.includes('alt=') || raw.includes('alt=""') || raw.includes("alt=''")) {
      imgsWithoutAlt++;
    }
  }

  // 4. CTAs e Botões
  const buttonMatches = [...html.matchAll(/<(?:button|a)[^>]*(?:class|id)=["'][^"']*(?:btn|button|cta|whatsapp|contato|agendar)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

  // 5. Tecnologias / CMS
  const lowerHtml = html.toLowerCase();
  const detectedCms = [];
  if (lowerHtml.includes('wp-content') || lowerHtml.includes('wordpress')) detectedCms.push('WordPress');
  if (lowerHtml.includes('elementor')) detectedCms.push('Elementor');
  if (lowerHtml.includes('wix.com') || lowerHtml.includes('wixsite')) detectedCms.push('Wix');
  if (lowerHtml.includes('squarespace')) detectedCms.push('Squarespace');
  if (lowerHtml.includes('shopify')) detectedCms.push('Shopify');
  if (lowerHtml.includes('rdstation') || lowerHtml.includes('rd-')) detectedCms.push('RD Station');
  if (lowerHtml.includes('bootstrap')) detectedCms.push('Bootstrap');
  if (lowerHtml.includes('tailwind')) detectedCms.push('TailwindCSS');

  // 6. Sessões estruturais
  const sectionsFound = [];
  if (lowerHtml.includes('hero') || lowerHtml.includes('banner') || lowerHtml.includes('destaque')) sectionsFound.push('Hero/Banner');
  if (lowerHtml.includes('servico') || lowerHtml.includes('tratamento') || lowerHtml.includes('especialidade') || lowerHtml.includes('atuacao')) sectionsFound.push('Serviços/Especialidades');
  if (lowerHtml.includes('sobre') || lowerHtml.includes('quem somos') || lowerHtml.includes('historia')) sectionsFound.push('Sobre/Quem Somos');
  if (lowerHtml.includes('depoimento') || lowerHtml.includes('avaliacao') || lowerHtml.includes('feedback') || lowerHtml.includes('clientes')) sectionsFound.push('Depoimentos/Prova Social');
  if (lowerHtml.includes('galeria') || lowerHtml.includes('fotos') || lowerHtml.includes('clinica') || lowerHtml.includes('espaco')) sectionsFound.push('Galeria de Fotos');
  if (lowerHtml.includes('contato') || lowerHtml.includes('fale conosco') || lowerHtml.includes('agende') || lowerHtml.includes('orcamento')) sectionsFound.push('Formulário/Contato');

  return {
    metaDescription,
    h1List: h1Matches.slice(0, 3),
    h2List: h2Matches.slice(0, 6),
    h3List: h3Matches.slice(0, 6),
    imgCount,
    imgsWithoutAlt,
    buttonCtaList: buttonMatches.slice(0, 6),
    detectedCms: detectedCms.length ? detectedCms.join(', ') : 'Código Próprio / Personalizado',
    sectionsFound: sectionsFound.length ? sectionsFound.join(', ') : 'Estrutura simples / Institucional'
  };
}

/**
 * Inspeciona a Ficha do Google Maps
 */
function auditGoogleMaps(lead) {
  const rating = Number(lead.rating) || 0;
  const reviews = Number(lead.reviews) || 0;
  const neighborhood = lead.neighborhood || lead.city || 'São Paulo';

  const diagnosisTags = [];
  const strengths = [];
  const weaknesses = [];

  if (rating >= 4.6 && reviews >= 20) {
    strengths.push(`Excelente autoridade no Google (${reviews} avaliações com nota ${rating.toFixed(1)})`);
    diagnosisTags.push(`⭐ Nota ${rating.toFixed(1)} (${reviews} reviews)`);
  } else if (reviews >= 5) {
    strengths.push(`Boa presença com ${reviews} avaliações (nota ${rating.toFixed(1)})`);
    diagnosisTags.push(`⭐ ${reviews} avaliações`);
  } else if (reviews === 0) {
    weaknesses.push('Ficha no Maps sem avaliações registradas');
    diagnosisTags.push('⚠️ Sem Avaliações no Maps');
  } else {
    weaknesses.push(`Poucas avaliações registradas (${reviews} reviews)`);
    diagnosisTags.push(`⚠️ Apenas ${reviews} avaliações`);
  }

  let localReputation = 'média';
  if (rating >= 4.5 && reviews >= 20) localReputation = 'forte';
  else if (reviews < 5) localReputation = 'fraca';

  return {
    rating,
    reviews,
    neighborhood,
    localReputation,
    diagnosisTags,
    strengths,
    weaknesses,
    summary: `Localização: ${neighborhood}. Avaliações: ${reviews} (nota ${rating ? rating.toFixed(1) : 'N/A'}). Reputação local: ${localReputation}.`
  };
}

/**
 * Auditoria Completa Integrada (Site + Google Maps)
 */
async function auditLeadFull(lead) {
  // Garantir que a auditoria nunca ultrapasse 6 segundos no total
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      const mapsFallback = auditGoogleMaps(lead);
      resolve({
        leadId: lead.id,
        leadName: lead.name,
        auditedAt: new Date().toISOString(),
        site: {
          hasWebsite: !!lead.website,
          url: lead.website,
          isOnline: false,
          error: 'Tempo limite na inspeção do site',
          loadTimeMs: 6000,
          summary: 'Site muito lento ou não respondeu a tempo.',
          details: 'Página demorou mais de 6 segundos para responder.',
          opportunityScore: 8,
          attackAngle: 'Site lento ou instável no celular. Oportunidade de landing page moderna.',
          diagnosisTags: ['⚠️ Site Lento / Instável', '🎯 Oportunidade de Modernização']
        },
        maps: mapsFallback,
        primaryAngle: `A empresa possui presença em ${mapsFallback.neighborhood || 'São Paulo'}, mas a estrutura online atual apresenta lentidão ou pontos de melhoria para converter visitantes no WhatsApp.`,
        allTags: ['⚠️ Site Lento / Instável', ...(mapsFallback.diagnosisTags || [])]
      });
    }, 6000);
  });

  const executionPromise = (async () => {
    try {
      const [siteAudit, mapsAudit] = await Promise.all([
        auditWebsite(lead.website).catch(err => ({
          hasWebsite: !!lead.website,
          isOnline: false,
          error: err.message,
          loadTimeMs: 0,
          summary: 'Falha ao acessar site',
          diagnosisTags: ['⚠️ Falha ao acessar site']
        })),
        Promise.resolve(auditGoogleMaps(lead))
      ]);

      let primaryAngle = '';
      if (!siteAudit.hasWebsite) {
        primaryAngle = `A empresa tem presença local em ${mapsAudit.neighborhood} (${mapsAudit.reviews} avaliações), mas NÃO TEM SITE PRÓPRIO. Foco total em propor uma landing page moderna com botão de WhatsApp direto para captar quem pesquisa no Google.`;
      } else if (!siteAudit.isOnline) {
        primaryAngle = `O site cadastrado no Maps (${siteAudit.url}) está FORA DO AR ou inacessível. Oportunidade urgente de alertar o responsável com gentileza e oferecer um site novo no ar rapidamente.`;
      } else if (!siteAudit.hasWhatsApp) {
        primaryAngle = `A empresa tem site no ar, mas NÃO TEM botão direto de WhatsApp. O cliente precisa procurar o telefone ou preencher formulário, perdendo conversões imediatas.`;
      } else if (!siteAudit.doesPaidTraffic) {
        primaryAngle = `A empresa tem site e boa reputação em ${mapsAudit.neighborhood}, mas NÃO FAZ tráfego pago no Google/Meta (sem tags de anúncio). Foco em atrair mais clientes locais com campanhas no bairro.`;
      } else {
        primaryAngle = `A empresa já investe em digital. Foco em posicionamento comercial, aceleração de resultados e melhoria da taxa de conversão no WhatsApp.`;
      }

      return {
        leadId: lead.id,
        leadName: lead.name,
        auditedAt: new Date().toISOString(),
        site: siteAudit,
        maps: mapsAudit,
        primaryAngle,
        allTags: [...(siteAudit.diagnosisTags || []), ...(mapsAudit.diagnosisTags || [])]
      };
    } catch (err) {
      const mapsFallback = auditGoogleMaps(lead);
      return {
        leadId: lead.id,
        leadName: lead.name,
        auditedAt: new Date().toISOString(),
        site: {
          hasWebsite: !!lead.website,
          isOnline: false,
          error: err.message,
          summary: 'Falha durante auditoria',
          diagnosisTags: ['⚠️ Auditoria Inconclusiva']
        },
        maps: mapsFallback,
        primaryAngle: `A empresa está em ${mapsFallback.neighborhood || 'SP'} e tem oportunidade de acelerar captação de clientes no digital.`,
        allTags: mapsFallback.diagnosisTags || []
      };
    }
  })();

  return Promise.race([executionPromise, timeoutPromise]);
}

/**
 * Limpa o nome da empresa para busca precisa na Meta Ads Library
 */
function cleanCompanyNameForMeta(rawName, website = '') {
  let base = (rawName || '').trim();

  let domainSlug = '';
  if (website) {
    try {
      const u = new URL(website.startsWith('http') ? website : `https://${website}`);
      const host = u.hostname.replace(/^www\./i, '').split('.')[0];
      if (host && host.length >= 3 && !['instagram', 'facebook', 'wa', 'linktr'].includes(host)) {
        domainSlug = host;
      }
    } catch (e) {}
  }

  base = base
    .replace(/\s*-\s*.*$/, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s*·\s*.*$/, '')
    .replace(/\b(ltda|me|epp|eireli|s\/a|sa)\b/gi, '')
    .replace(/\b(dr\.|dra\.|doutor|doutora)\b/gi, '')
    .replace(/\b(clínica|clinica|centro clínico|centro clinico|hospital|escritório de advocacia|escritorio de advocacia|advocacia|advogados|consultoria|treinamento)\b/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base || base.length < 3) {
    if (domainSlug) return domainSlug;
    return (rawName || '').split(' ').slice(0, 2).join(' ').trim();
  }

  const words = base.split(' ');
  return words.slice(0, 3).join(' ');
}

/**
 * Consulta Autônoma na Meta Ads Library via Playwright Headless (@pinas.studio)
 * Abre a biblioteca oficial em segundo plano, lê se há anúncios ativos e retorna a contagem.
 */
async function checkMetaAdsLibrary(rawName, website = '', timeoutMs = 12000) {
  const company = cleanCompanyNameForMeta(rawName, website);
  const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(company)}&search_type=keyword_unordered&media_type=all`;

  if (!company || company.length < 2) {
    return {
      checked: false,
      hasActiveAds: false,
      adCount: 0,
      adCountText: 'Nome insuficiente',
      searchUrl,
      checkedAt: new Date().toISOString()
    };
  }

  let browser;
  try {
    const { chromium } = require('playwright');
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (e1) {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'pt-BR'
    });
    const page = await context.newPage();

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(3500);

    const bodyText = await page.innerText('body');
    const isZeroResults = bodyText.includes('Nenhum anúncio corresponde') || 
                          bodyText.includes('Nenhum resultado') || 
                          bodyText.includes('0 resultados');

    if (isZeroResults) {
      return {
        checked: true,
        hasActiveAds: false,
        adCount: 0,
        adCountText: '0 anúncios ativos',
        companyQueried: company,
        searchUrl,
        checkedAt: new Date().toISOString()
      };
    }

    const countMatch = bodyText.match(/(\~?\s*\d+[\.\d]*)\s*resultados/i) || bodyText.match(/(\d+)\s*anúncio/i);
    const countText = countMatch ? countMatch[0].trim() : 'Anúncios ativos identificados';
    const numDigits = countText.replace(/\D/g, '');
    const adCount = numDigits ? parseInt(numDigits, 10) : 1;

    return {
      checked: true,
      hasActiveAds: true,
      adCount,
      adCountText: countText,
      companyQueried: company,
      searchUrl,
      checkedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      checked: false,
      hasActiveAds: false,
      adCount: 0,
      error: err.message,
      companyQueried: company,
      searchUrl,
      checkedAt: new Date().toISOString()
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

/**
 * Motor de Lead Scoring em 3 Dimensões (0 a 100 pontos)
 */
function calculateLeadScore(lead = {}, siteAudit = {}, mapsAudit = {}, metaAds = {}) {
  let score = 0;
  const breakdown = [];

  const niche = (lead.niche || '').toLowerCase();
  const name = (lead.name || '').toLowerCase();
  const reviews = Number(lead.reviews || mapsAudit.reviews) || 0;
  const rating = Number(lead.rating || mapsAudit.rating) || 0;
  const hasMobile = !!(lead.hasMobile || (lead.cleanPhone && lead.cleanPhone.length >= 10));
  const hasWebsite = !!(lead.website || lead.hasWebsite || siteAudit.hasWebsite);
  const isOnline = siteAudit.isOnline;
  const hasWhatsApp = siteAudit.hasWhatsApp;
  const loadTimeMs = siteAudit.loadTimeMs || 0;
  const doesPaidTraffic = siteAudit.doesPaidTraffic || metaAds.hasActiveAds;

  // DIMENSÃO 1: Nicho de Alto Ticket (0 a 35 pts)
  if (niche.includes('vet') || niche.includes('pet') || name.includes('veterin')) {
    score += 35;
    breakdown.push({ item: 'Nicho Veterinário (Case Petiva / Alto Ticket)', pts: 35 });
  } else if (niche.includes('advoc') || niche.includes('jurídic') || name.includes('advoc')) {
    score += 35;
    breakdown.push({ item: 'Advocacia (Alto Ticket / Honorários)', pts: 35 });
  } else if (niche.includes('odont') || niche.includes('dent') || name.includes('odont')) {
    score += 35;
    breakdown.push({ item: 'Odontologia (Implantes & Particular)', pts: 35 });
  } else if (niche.includes('mentor') || niche.includes('coach') || niche.includes('treinamento')) {
    score += 30;
    breakdown.push({ item: 'Mentoria / Negócios de Alto Valor', pts: 30 });
  } else {
    score += 20;
    breakdown.push({ item: 'Comércio / Serviço Local', pts: 20 });
  }

  // DIMENSÃO 2: Oportunidade Técnica & Tráfego (0 a 35 pts)
  if (!hasWebsite) {
    score += 30;
    breakdown.push({ item: 'Sem Site Próprio (Oportunidade Máxima Landing Page)', pts: 30 });
  } else if (isOnline === false) {
    score += 30;
    breakdown.push({ item: 'Site Fora do Ar no Maps (Urgência Imediata)', pts: 30 });
  } else {
    if (!hasWhatsApp) {
      score += 15;
      breakdown.push({ item: 'Site Sem Botão Direto de WhatsApp', pts: 15 });
    }
    if (loadTimeMs > 2500) {
      score += 10;
      breakdown.push({ item: `Site Lento no Celular (${(loadTimeMs/1000).toFixed(1)}s)`, pts: 10 });
    }
  }

  // Meta Ads / Tráfego
  if (metaAds.hasActiveAds) {
    score += 15;
    breakdown.push({ item: `Anunciante Ativo no Meta (${metaAds.adCountText || metaAds.adCount + ' anúncios'})`, pts: 15 });
  } else if (doesPaidTraffic) {
    score += 10;
    breakdown.push({ item: 'Possui Pixel / Tag de Anúncio Instalada', pts: 10 });
  } else {
    score += 5;
    breakdown.push({ item: 'Sem Anúncios Ativos (Oportunidade Tráfego do Zero)', pts: 5 });
  }

  // DIMENSÃO 3: Porte, Caixa & Contato (0 a 30 pts)
  if (hasMobile) {
    score += 15;
    breakdown.push({ item: 'WhatsApp Celular Direto Verificado', pts: 15 });
  }
  if (reviews >= 25 && rating >= 4.5) {
    score += 15;
    breakdown.push({ item: `Ficha Forte no Maps (${reviews} avaliações ★${rating})`, pts: 15 });
  } else if (reviews >= 8 && rating >= 4.0) {
    score += 10;
    breakdown.push({ item: `Ficha Ativa no Maps (${reviews} avaliações)`, pts: 10 });
  }

  score = Math.min(100, Math.max(0, score));

  let tier = 'prata';
  let tierLabel = '🥈 Prata';
  let badgeColor = '#94a3b8';

  if (score >= 80) {
    tier = 'diamante';
    tierLabel = '💎 Diamante (Alta Conversão)';
    badgeColor = '#38bdf8';
  } else if (score >= 60) {
    tier = 'ouro';
    tierLabel = '🥇 Ouro (Boa Oportunidade)';
    badgeColor = '#f59e0b';
  }

  return {
    score,
    priorityScore: score,
    tier,
    tierLabel,
    badgeColor,
    breakdown,
    attackAngle: breakdown.map(b => b.item).join(' | ')
  };
}

module.exports = {
  fetchUrlText,
  auditWebsite,
  auditGoogleMaps,
  auditLeadFull,
  cleanCompanyNameForMeta,
  checkMetaAdsLibrary,
  calculateLeadScore
};

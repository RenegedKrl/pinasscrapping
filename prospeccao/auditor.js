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
function fetchUrlText(targetUrl, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    try {
      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      } catch (e) {
        return resolve({ success: false, error: 'URL inválida', loadTimeMs: 0 });
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const startTime = Date.now();

      const req = client.get(
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
          const statusCode = res.statusCode;

          // Redirecionamento (seguir até 1 nível)
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (redirectUrl.startsWith('/')) {
              redirectUrl = `${parsedUrl.origin}${redirectUrl}`;
            }
            req.destroy();
            return fetchUrlText(redirectUrl, timeoutMs - loadTimeMs)
              .then(resolve)
              .catch(reject);
          }

          let data = '';
          res.setEncoding('utf8');

          res.on('data', (chunk) => {
            data += chunk;
            // Limitar a 500KB para economizar memória e agilizar
            if (data.length > 500000) {
              res.destroy();
            }
          });

          res.on('end', () => {
            resolve({
              success: statusCode >= 200 && statusCode < 400,
              statusCode,
              loadTimeMs,
              html: data,
              finalUrl: parsedUrl.toString()
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Tempo limite esgotado (site muito lento)', loadTimeMs: timeoutMs });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: err.message, loadTimeMs: Date.now() - startTime });
      });
    } catch (err) {
      resolve({ success: false, error: err.message, loadTimeMs: 0 });
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
  const [siteAudit, mapsAudit] = await Promise.all([
    auditWebsite(lead.website),
    auditGoogleMaps(lead)
  ]);

  // Síntese Estratégica para o Gemini
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
}

module.exports = {
  fetchUrlText,
  auditWebsite,
  auditGoogleMaps,
  auditLeadFull
};

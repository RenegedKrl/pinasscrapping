const fs = require('fs');
const path = require('path');
const { chromium } = require('./prospeccao/node_modules/playwright-core');

const logoB64 = fs.readFileSync(path.join(__dirname, 'identidade', 'logo-branco.png')).toString('base64');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Proposta Comercial — AVMS Arquitetura x Pinas Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background-color: #0A0C10;
      color: #E2E8F0;
      font-size: 13px;
      line-height: 1.55;
    }

    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }

    .page {
      page-break-after: always;
      page-break-inside: avoid;
      position: relative;
      padding-bottom: 14mm;
      height: 275mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .page:last-child {
      page-break-after: avoid;
    }

    /* Header & Footer */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      margin-bottom: 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .header-logo {
      height: 22px;
      object-fit: contain;
    }

    .header-tag {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #C5A059;
      font-weight: 700;
    }

    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 9.5px;
      color: #64748B;
    }

    /* Headings */
    h1, h2, h3, h4 {
      font-family: 'Space Grotesk', sans-serif;
      color: #FFFFFF;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .eyebrow {
      color: #C5A059;
      text-transform: uppercase;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.22em;
      margin-bottom: 6px;
      display: inline-block;
    }

    /* Cards */
    .card {
      background: #11141E;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 12px;
    }

    .card-gold {
      background: linear-gradient(135deg, rgba(197, 160, 89, 0.1) 0%, rgba(17, 20, 30, 0.95) 100%);
      border: 1px solid rgba(197, 160, 89, 0.45);
    }

    .card-title {
      font-size: 14.5px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #FFFFFF;
    }

    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .badge-gold {
      background: rgba(197, 160, 89, 0.18);
      color: #E2C285;
      border: 1px solid rgba(197, 160, 89, 0.4);
    }

    .badge-green {
      background: rgba(16, 185, 129, 0.15);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* Grids */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }

    /* Checklists */
    ul.check-list {
      list-style: none;
    }

    ul.check-list li {
      position: relative;
      padding-left: 18px;
      margin-bottom: 6px;
      color: #CBD5E1;
      font-size: 11.8px;
      line-height: 1.45;
    }

    ul.check-list li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #C5A059;
      font-weight: 900;
    }

    /* Custom Tables */
    table.custom-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 14px 0;
      font-size: 12px;
    }

    table.custom-table th {
      background: #161A24;
      color: #FFFFFF;
      text-align: left;
      padding: 10px 12px;
      font-weight: 700;
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11.5px;
    }

    table.custom-table td {
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: #11141E;
      color: #CBD5E1;
      vertical-align: middle;
    }

    /* Link estilizado */
    .link-live {
      color: #60A5FA;
      text-decoration: none;
      font-weight: 600;
    }
    .link-live:hover {
      text-decoration: underline;
    }

    /* ==================== CAPA (PÁGINA 1) ==================== */
    .cover-box {
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 36px 30px;
      background: radial-gradient(circle at 85% 15%, rgba(197, 160, 89, 0.16) 0%, rgba(10, 12, 16, 1) 75%);
      border: 1px solid rgba(197, 160, 89, 0.35);
      border-radius: 14px;
    }

    .cover-logos {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .cover-title {
      font-size: 32px;
      line-height: 1.15;
      margin-top: 14px;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: -0.02em;
    }

    .cover-title span {
      background: linear-gradient(135deg, #ECC880 0%, #C5A059 50%, #A8833E 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .cover-desc {
      font-size: 14px;
      color: #94A3B8;
      max-width: 580px;
      line-height: 1.6;
    }

    .cover-pills {
      display: flex;
      gap: 10px;
      margin-top: 22px;
      flex-wrap: wrap;
    }

    .cover-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(197, 160, 89, 0.3);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      color: #E2E8F0;
    }

    .cover-meta {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .cover-meta-item h5 {
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #64748B;
      margin-bottom: 4px;
    }

    .cover-meta-item p {
      font-size: 13px;
      font-weight: 700;
      color: #FFFFFF;
    }
  </style>
</head>
<body>

  <!-- ==================== PÁGINA 1: CAPA & VISÃO GERAL ==================== -->
  <div class="page">
    <div class="cover-box">
      <div class="cover-logos">
        <img src="data:image/png;base64,${logoB64}" style="height: 38px;" alt="Pinas Studio">
        <span style="color: #64748B; font-size: 18px;">✕</span>
        <img src="https://avms.arq.br/wp-content/uploads/2026/03/AVMS-BRANCO.png" style="height: 36px;" alt="AVMS Arquitetura">
      </div>

      <div>
        <span class="eyebrow">PROPOSTA COMERCIAL & ESTRATÉGICA • 2026</span>
        <h1 class="cover-title">
          Reestruturação Digital &<br>
          <span>Captação de Clientes</span>
        </h1>
        <p class="cover-desc">
          Desenvolvimento de nova vitrine editorial de alto padrão para a <strong>AVMS Arquitetura</strong> integrada a campanhas locais de tráfego pago (Google e Instagram) na Granja Viana, Alphaville e região.
        </p>

        <div class="cover-pills">
          <div class="cover-pill">🏛️ Nova Vitrine Editorial de Luxo</div>
          <div class="cover-pill">📍 Campanhas Locais (Google e Meta)</div>
          <div class="cover-pill">🏆 Destaque BUILD Awards 2026</div>
          <div class="cover-pill">⚡ Entrega Completa em 10 Dias</div>
        </div>
      </div>

      <div class="cover-meta">
        <div class="cover-meta-item">
          <h5>Cliente / Destinatário</h5>
          <p>AVMS Arquitetura</p>
          <span style="font-size: 11px; color: #94A3B8;">Aos cuidados de Antonio Victor & Thaís Amon</span>
        </div>
        <div class="cover-meta-item">
          <h5>Assessoria Responsável</h5>
          <p>Pinas Studio (Kauê)</p>
          <span style="font-size: 11px; color: #94A3B8;">WhatsApp: +55 (11) 94171-3647</span>
        </div>
        <div class="cover-meta-item" style="text-align: right;">
          <h5>Edição Oficial</h5>
          <p>Outubro / 2026</p>
          <span style="font-size: 11px; color: #C5A059;">Proposta Confidencial</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== PÁGINA 2: O ESCOPO & EXEMPLOS DE GABARITO ==================== -->
  <div class="page">
    <div>
      <div class="page-header">
        <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
        <span class="header-tag">Escopo & Portfólio</span>
      </div>

      <span class="eyebrow">O QUE SERÁ EXECUTADO</span>
      <h2 style="font-size: 20px; margin-bottom: 12px;">Os 2 Pilares Práticos do Trabalho</h2>

      <div class="grid-2">
        <div class="card card-gold">
          <div class="card-title">
            <span>🏛️ Pilar 1: Nova Vitrine Editorial</span>
          </div>
          <ul class="check-list">
            <li><strong>Design Inspirado em Revistas de Luxo:</strong> Layout leve e sofisticado, com as fotos reais dos projetos em primeiro plano logo no topo.</li>
            <li><strong>Destaque BUILD Awards 2026:</strong> O prêmio internacional posicionado como ativo de autoridade global do escritório.</li>
            <li><strong>Apresentação Clara dos Pacotes:</strong> Comparativo didático de <em>Prime, Master, Gold e Gold Design</em>, conduzindo o cliente ao pacote Gold.</li>
            <li><strong>Conversão no WhatsApp:</strong> Botão direto e sutil para o cliente agendar consulta sem atrito no celular.</li>
          </ul>
        </div>

        <div class="card">
          <div class="card-title">
            <span>📍 Pilar 2: Captação Hiperlocal</span>
          </div>
          <ul class="check-list">
            <li><strong>Google Ads (Para quem busca hoje):</strong> Coloca a AVMS no topo absoluto quando pesquisarem por <em>'arquiteto Granja Viana'</em> ou <em>'projeto Alphaville'</em>.</li>
            <li><strong>Meta Ads (Instagram & Facebook):</strong> Anúncios em vídeo e foto rodando especificamente dentro dos condomínios fechados da região.</li>
            <li><strong>Tags & Rastreamento Inteligente:</strong> Instalação do Meta Pixel e Google Tag para reimpactar quem visitou o site.</li>
            <li><strong>Filtro de Qualificação:</strong> Cópias que atraem clientes com poder aquisitivo e eliminam curiosos.</li>
          </ul>
        </div>
      </div>

      <span class="eyebrow" style="margin-top: 10px;">COMPROVAÇÃO TÉCNICA</span>
      <h2 style="font-size: 18px; margin-bottom: 10px;">Exemplos Práticos de Gabarito</h2>

      <!-- Case 1: AVMS Conceito -->
      <div class="card" style="margin-bottom: 10px; border-color: rgba(197, 160, 89, 0.4);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h4 style="color: #E2C285; font-size: 13.5px;">1. Conceito Sob Medida — AVMS Arquitetura</h4>
          <span class="badge badge-gold">Protótipo Exclusivo</span>
        </div>
        <p style="font-size: 11.5px; color: #CBD5E1; line-height: 1.5;">
          Desenvolvido artesanalmente para a AVMS no mesmo padrão da arquitetura contemporânea brasileira, com fotos reais em alta resolução e carregamento instantâneo.
        </p>
        <span style="font-size: 11px; margin-top: 4px; display: block;">
          🌐 <strong>Navegue no Protótipo Online:</strong> <a href="https://proposta-avms.vercel.app/" class="link-live">https://proposta-avms.vercel.app/</a>
        </span>
      </div>

      <!-- Case 2: Petiva Internação 24h -->
      <div class="card" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h4 style="color: #FFFFFF; font-size: 13.5px;">2. Petiva — Centro Clínico & Internação 24h</h4>
          <span class="badge badge-green">No Ar & Tráfego Ativo</span>
        </div>
        <p style="font-size: 11.5px; color: #CBD5E1; line-height: 1.5;">
          Estruturação completa de vitrine moderna de alta conversão para serviço de emergência e consultas de alto valor, com fluxo contínuo de novos tutores no WhatsApp.
        </p>
        <span style="font-size: 11px; margin-top: 4px; display: block;">
          🌐 <strong>Página Online:</strong> <a href="https://petivainternacao.vercel.app/" class="link-live">https://petivainternacao.vercel.app/</a>
        </span>
      </div>

      <!-- Case 3: Pinas Studio -->
      <div class="card" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h4 style="color: #FFFFFF; font-size: 13.5px;">3. Pinas Studio — Assessoria de Crescimento Digital</h4>
          <span class="badge" style="background: rgba(255, 0, 85, 0.15); color: #FF0055;">Nossa Plataforma</span>
        </div>
        <p style="font-size: 11.5px; color: #CBD5E1; line-height: 1.5;">
          Nossa plataforma institucional oficial, estruturada com foco em velocidade máxima e engenharia comercial de atração.
        </p>
        <span style="font-size: 11px; margin-top: 4px; display: block;">
          🌐 <strong>Site Oficial:</strong> <a href="https://pinasstudio.netlify.app/" class="link-live">https://pinasstudio.netlify.app/</a>
        </span>
      </div>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Proposta Comercial AVMS Arquitetura</span>
      <span>Página 02</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 3: INVESTIMENTO & CONTRATO ==================== -->
  <div class="page">
    <div>
      <div class="page-header">
        <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
        <span class="header-tag">Investimento & Contrato</span>
      </div>

      <span class="eyebrow">CONDIÇÕES COMERCIAIS</span>
      <h2 style="font-size: 20px; margin-bottom: 10px;">Planos de Investimento</h2>

      <!-- Tabela Clara de Opções -->
      <table class="custom-table">
        <thead>
          <tr>
            <th style="width: 50%;">Escopo & Entregas</th>
            <th style="width: 25%;">Apenas o Site</th>
            <th style="width: 25%;">Pacote Completo (Recomendado)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Nova Vitrine Editorial de Alto Padrão</strong><br>
              <span style="font-size: 10.5px; color: #94A3B8;">Página moderna, fotos de projetos, prêmio BUILD e WhatsApp.</span>
            </td>
            <td style="color: #34D399; font-weight: 700;">INCLUSO</td>
            <td style="color: #34D399; font-weight: 700;">INCLUSO</td>
          </tr>
          <tr>
            <td>
              <strong>Instalação de Tags & Rastreamento (Pixel e Google)</strong><br>
              <span style="font-size: 10.5px; color: #94A3B8;">Estruturação de público e eventos de conversão no WhatsApp.</span>
            </td>
            <td style="color: #64748B;">—</td>
            <td style="color: #34D399; font-weight: 700;">INCLUSO</td>
          </tr>
          <tr>
            <td>
              <strong>Gestão Contínua de Anúncios (Google + Meta Ads)</strong><br>
              <span style="font-size: 10.5px; color: #94A3B8;">Campanhas locais ativas, testes de criativos e otimizações semanais.</span>
            </td>
            <td style="color: #64748B;">—</td>
            <td style="color: #34D399; font-weight: 700;">INCLUSO</td>
          </tr>
          <tr style="background: rgba(197, 160, 89, 0.1);">
            <td><strong>VALOR DO INVESTIMENTO:</strong></td>
            <td style="font-size: 13.5px; font-weight: 800; color: #FFFFFF;">R$ 600,00 <span style="font-size: 10px; font-weight: normal; color: #94A3B8;">(único)</span></td>
            <td style="font-size: 14.5px; font-weight: 800; color: #E2C285;">R$ 1.300,00 <span style="font-size: 10px; font-weight: normal; color: #94A3B8;">/ mês</span></td>
          </tr>
        </tbody>
      </table>

      <!-- Como Funciona o Contrato -->
      <div class="grid-2">
        <div class="card card-gold">
          <h4 style="font-size: 13px; color: #E2C285; margin-bottom: 6px;">📝 Como Funciona o Contrato</h4>
          <p style="font-size: 11.5px; color: #CBD5E1; line-height: 1.5;">
            • <strong>Assinatura 100% Digital:</strong> Enviado via link no WhatsApp pelo ZapSign (validade jurídica plena).<br>
            • <strong>Sem Amarras Abusivas:</strong> Rescisão simplificada com aviso prévio de 30 dias caso decidam pausar.<br>
            • <strong>Verba de Mídia:</strong> No pacote completo, sugerimos R$ 20 a R$ 30/dia (paga direto ao Google/Meta sob controle da AVMS).
          </p>
        </div>

        <div class="card">
          <h4 style="font-size: 13px; color: #34D399; margin-bottom: 6px;">⏱️ Cronograma de Entrega</h4>
          <p style="font-size: 11.5px; color: #CBD5E1; line-height: 1.5;">
            • <strong>Dia 1 a 7:</strong> Validação final e publicação da nova vitrine no ar.<br>
            • <strong>Dia 8 a 10:</strong> Ativação das campanhas locais no Google e Instagram.<br>
            • <strong>Semana 2 em diante:</strong> Otimizações e fluxo de contatos qualificados.
          </p>
        </div>
      </div>

      <!-- Caixa de Fechamento -->
      <div class="card" style="border-color: rgba(197, 160, 89, 0.5); background: #131722; text-align: center; padding: 18px;">
        <h4 style="color: #FFFFFF; font-size: 14px; margin-bottom: 6px;">Pronto Para Iniciar?</h4>
        <p style="font-size: 12px; color: #CBD5E1;">
          Basta nos responder no WhatsApp indicando a opção escolhida (o <strong>Pacote Completo a R$ 1.300/mês</strong> ou <strong>Apenas o Site a R$ 600</strong>) que já geramos o contrato digital para início imediato.
        </p>
      </div>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Proposta Comercial AVMS Arquitetura • Kauê</span>
      <span>Página 03</span>
    </div>
  </div>

</body>
</html>
`;

async function generatePdf() {
  const saidasDir = path.join(__dirname, 'saidas');
  if (!fs.existsSync(saidasDir)) {
    fs.mkdirSync(saidasDir, { recursive: true });
  }

  const propDir = path.join(__dirname, 'propostas', 'avms-arquitetura');
  if (!fs.existsSync(propDir)) {
    fs.mkdirSync(propDir, { recursive: true });
  }

  const htmlPath = path.join(propDir, 'proposta_comercial_avms.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  console.log('HTML gerado com sucesso:', htmlPath);

  console.log('Iniciando Microsoft Edge headless para compilar o PDF enxuto...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  
  const pdfPath = path.join(propDir, 'Proposta_Comercial_AVMS_Arquitetura.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  });

  const saidasPdfPath = path.join(saidasDir, 'Proposta_Comercial_AVMS_Arquitetura.pdf');
  fs.copyFileSync(pdfPath, saidasPdfPath);

  await browser.close();
  console.log('==================================================');
  console.log('🎉 NOVO PDF ENXUTO GERADO COM SUCESSO (EXATAMENTE 3 PÁGINAS)!');
  console.log('Arquivo salvo em:', pdfPath);
  console.log('Tamanho:', fs.statSync(pdfPath).size, 'bytes');
  console.log('==================================================');
}

generatePdf().catch(err => {
  console.error('Erro na geração do PDF:', err);
  process.exit(1);
});

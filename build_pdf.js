const fs = require('fs');
const path = require('path');
const { chromium } = require('./prospeccao/node_modules/playwright-core');

const logoB64 = fs.readFileSync(path.join(__dirname, 'saidas_logo_b64.txt'), 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Pinas Studio — Manual Operacional dos Sistemas de IA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@500;700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #0B0E14;
      color: #E2E8F0;
      font-size: 13px;
      line-height: 1.6;
    }

    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }

    .page {
      page-break-after: always;
      page-break-inside: avoid;
      position: relative;
      padding-bottom: 12mm;
    }

    .page:last-child {
      page-break-after: avoid;
    }

    /* Header & Footer */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .header-logo {
      height: 22px;
    }

    .header-tag {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #FF0055;
      font-weight: 700;
    }

    .page-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 10px;
      color: #64748B;
    }

    /* Headings */
    h1, h2, h3, h4 {
      font-family: 'Outfit', sans-serif;
      color: #FFFFFF;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .eyebrow {
      color: #FF0055;
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.2em;
      margin-bottom: 6px;
      display: inline-block;
    }

    /* Cards & Containers */
    .card {
      background: #141822;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 14px;
    }

    .card-highlight {
      background: linear-gradient(135deg, rgba(255, 0, 85, 0.08) 0%, rgba(20, 24, 34, 0.95) 100%);
      border: 1px solid rgba(255, 0, 85, 0.35);
    }

    .card-title {
      font-size: 15px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-red {
      background: rgba(255, 0, 85, 0.15);
      color: #FF0055;
      border: 1px solid rgba(255, 0, 85, 0.3);
    }

    .badge-blue {
      background: rgba(59, 130, 246, 0.15);
      color: #60A5FA;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .badge-green {
      background: rgba(16, 185, 129, 0.15);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* Pitch Boxes */
    .pitch-box {
      background: #0D1117;
      border-left: 3px solid #FF0055;
      border-radius: 0 8px 8px 0;
      padding: 12px 14px;
      margin: 10px 0;
      font-size: 12px;
      color: #CBD5E1;
      font-style: italic;
    }

    .pitch-author {
      font-size: 10px;
      font-weight: 700;
      color: #FF0055;
      font-style: normal;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 6px;
      display: block;
    }

    /* Grid Layouts */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }

    /* Lists */
    ul.check-list {
      list-style: none;
    }

    ul.check-list li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 6px;
      color: #CBD5E1;
      font-size: 12.5px;
    }

    ul.check-list li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #FF0055;
      font-weight: 900;
    }

    /* Step numbers */
    .step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #FF0055;
      color: #FFF;
      font-weight: 800;
      font-size: 11px;
      margin-right: 8px;
    }

    /* Table */
    table.custom-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 11.5px;
    }

    table.custom-table th {
      background: #19202E;
      color: #FFFFFF;
      text-align: left;
      padding: 8px 10px;
      font-weight: 700;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    table.custom-table td {
      padding: 8px 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: #141822;
      color: #CBD5E1;
    }

    /* Cover Page Styles */
    .cover-container {
      height: 250mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 32px 24px;
      background: radial-gradient(circle at 85% 15%, rgba(255, 0, 85, 0.18) 0%, rgba(11, 14, 20, 1) 70%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
    }

    .cover-logo {
      height: 48px;
      object-fit: contain;
    }

    .cover-title-wrap {
      margin-top: 60px;
    }

    .cover-title {
      font-size: 38px;
      line-height: 1.1;
      margin-top: 14px;
      margin-bottom: 14px;
      text-transform: uppercase;
    }

    .cover-title span {
      color: #FF0055;
    }

    .cover-desc {
      font-size: 16px;
      color: #94A3B8;
      max-width: 580px;
      line-height: 1.5;
    }

    .cover-pill-group {
      display: flex;
      gap: 10px;
      margin-top: 24px;
    }

    .cover-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
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
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #64748B;
      margin-bottom: 4px;
    }

    .cover-meta-item p {
      font-size: 14px;
      font-weight: 700;
      color: #FFFFFF;
    }
  </style>
</head>
<body>

  <!-- ==================== PÁGINA 1: CAPA ==================== -->
  <div class="page">
    <div class="cover-container">
      <div>
        <img src="data:image/png;base64,${logoB64}" class="cover-logo" alt="Pinas Studio">
      </div>

      <div class="cover-title-wrap">
        <span class="eyebrow">Manual Operacional & Guia de Vendas</span>
        <h1 class="cover-title">
          Os 3 Sistemas de<br>
          <span>Tráfego & IA</span> da Pinas
        </h1>
        <p class="cover-desc">
          O método proprietário da Pinas para transformar tráfego pago em uma máquina autônoma de atração de clientes qualificados pelo WhatsApp.
        </p>

        <div class="cover-pill-group">
          <div class="cover-pill">⚡ Pinas Vet AI™</div>
          <div class="cover-pill">👗 Pinas Fashion Traffic AI™</div>
          <div class="cover-pill">🎯 Pinas Target AI™</div>
        </div>
      </div>

      <div class="cover-meta">
        <div class="cover-meta-item">
          <h5>Operação & Estratégia</h5>
          <p>Kauê • Pinas Studio</p>
        </div>
        <div class="cover-meta-item">
          <h5>Posicionamento Comercial</h5>
          <p>Fechamento de R$ 1.500 a R$ 2.500/mês</p>
        </div>
        <div class="cover-meta-item" style="text-align: right;">
          <h5>Edição Oficial</h5>
          <p>@pinas.studio • 2026</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== PÁGINA 2: O CONCEITO DO MECANISMO ÚNICO ==================== -->
  <div class="page">
    <div class="page-header">
      <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
      <span class="header-tag">Conceito Estratégico</span>
    </div>

    <span class="eyebrow">Capítulo 01 • O Mecanismo Único</span>
    <h2 style="font-size: 22px; margin-bottom: 12px;">Por Que Não Vendemos "Gestão de Tráfego Comum"</h2>

    <div class="card card-highlight">
      <div class="card-title">
        <span style="color: #FF0055; font-size: 18px;">💡</span>
        <span>A Lei da Percepção de Valor</span>
      </div>
      <p style="color: #CBD5E1; font-size: 12.5px;">
        Quando você aborda um empresário dizendo <em>"eu faço tráfego pago"</em>, ele imediatamente te compara com qualquer jovem de 18 anos que cobra R$ 300 para impulsionar botões no Instagram. Tráfego virou commodity.
      </p>
      <p style="color: #FFFFFF; font-weight: 600; margin-top: 8px; font-size: 12.5px;">
        Quando você apresenta um <strong>Sistema Proprietário com IA</strong> (Pinas Vet AI™, Pinas Fashion Traffic AI™ ou Pinas Target AI™), você muda o jogo: o cliente não está comprando "horas de trabalho", ele está comprando uma <strong>tecnologia exclusiva de atração de clientes</strong> que só a Pinas possui.
      </p>
    </div>

    <div class="grid-2">
      <div class="card">
        <h4 style="color: #F87171; font-size: 13px; margin-bottom: 8px;">❌ O Gestor Amador (R$ 300 - R$ 500)</h4>
        <ul class="check-list" style="color: #94A3B8;">
          <li style="color: #94A3B8;">Impulsiona posts que só geram curtidas sem valor</li>
          <li style="color: #94A3B8;">Não cria páginas de conversão nem filtra curiosos</li>
          <li style="color: #94A3B8;">Usa públicos genéricos e queima o orçamento do cliente</li>
          <li style="color: #94A3B8;">O cliente reclama que não vendeu e cancela no 1º mês</li>
        </ul>
      </div>

      <div class="card" style="border-color: rgba(16, 185, 129, 0.3);">
        <h4 style="color: #34D399; font-size: 13px; margin-bottom: 8px;">✅ O Sistema Pinas AI (R$ 1.500 - R$ 2.500)</h4>
        <ul class="check-list">
          <li>Conecta a IA do Google e Meta à intenção real de compra</li>
          <li>Implementa Landing Page de 1 página com botão WhatsApp</li>
          <li>Filtra quem não tem dinheiro através de cópias estratégicas</li>
          <li>Gera fluxo previsível de mensagens prontas para fechar no Pix</li>
        </ul>
      </div>
    </div>

    <h3 style="font-size: 16px; margin: 16px 0 10px;">Os 3 Pilares da Inteligência Artificial nos Anúncios</h3>
    
    <div class="grid-3">
      <div class="card">
        <span class="badge badge-red">Pilar 1</span>
        <h4 style="font-size: 13px; margin: 8px 0 4px;">Smart Bidding Local</h4>
        <p style="font-size: 11.5px; color: #94A3B8;">
          Algoritmos neurais do Google que aumentam o lance em tempo real apenas para quem tem intenção comprovada de compra na região do cliente.
        </p>
      </div>

      <div class="card">
        <span class="badge badge-blue">Pilar 2</span>
        <h4 style="font-size: 13px; margin: 8px 0 4px;">Meta Advantage+</h4>
        <p style="font-size: 11.5px; color: #94A3B8;">
          Inteligência da Meta que monitora o comportamento de compras recentes de usuários e entrega o anúncio na hora exata em que eles estão prontos para comprar.
        </p>
      </div>

      <div class="card">
        <span class="badge badge-green">Pilar 3</span>
        <h4 style="font-size: 13px; margin: 8px 0 4px;">Engenharia de Criativos</h4>
        <p style="font-size: 11.5px; color: #94A3B8;">
          Criação ágil de variações de ângulos e dores do público com IA, testando rapidamente quais ofertas colocam mais leads no WhatsApp.
        </p>
      </div>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Manual Operacional</span>
      <span>Página 02</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 3: PINAS VET AI ==================== -->
  <div class="page">
    <div class="page-header">
      <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
      <span class="header-tag">Nicho Pet & Veterinário</span>
    </div>

    <span class="eyebrow">Sistema 01 • Veterinárias & Hospitais Pet</span>
    <h2 style="font-size: 22px; margin-bottom: 6px;">Pinas Vet AI™</h2>
    <p style="color: #94A3B8; font-size: 12.5px; margin-bottom: 14px;">
      Solução desenhada para clínicas veterinárias que dependem apenas de indicações e sofrem com a agenda de consultas particulares ociosa.
    </p>

    <div class="card">
      <h3 style="font-size: 14px; margin-bottom: 8px; color: #FF0055;">⚙️ Como Funciona por Dentro (A Mecânica Real)</h3>
      <ul class="check-list">
        <li><strong>Radar de Urgência no Google (Search Local):</strong> Captura buscas no exato momento da emergência (ex: <em>"veterinário 24h santo amaro"</em>, <em>"exame raio x cachorro domingo"</em>, <em>"consulta veterinária preço"</em>) num raio de 5km a 8km.</li>
        <li><strong>Filtro Anti-Curiosos:</strong> O anúncio e a página destacam atendimento médico particular, estrutura cirúrgica e exames. Isso descarta automaticamente pessoas procurando hospital público da prefeitura ou ração barata.</li>
        <li><strong>Landing Page de Resgate Rápido:</strong> O tutor clica no anúncio e abre uma página em menos de 1 segundo com botão verde pulsante de plantão WhatsApp, ligando direto na recepção da clínica.</li>
        <li><strong>Campanhas Meta para Tutores Locais:</strong> Vídeos curtos do veterinário mostrando a clínica, gerando autoridade em castração, vacinas e consultas de rotina.</li>
      </ul>
    </div>

    <div class="card card-highlight">
      <h3 style="font-size: 14px; margin-bottom: 6px;">🎙️ O Roteiro de Vendas (Como Você Explica pro Dono)</h3>
      <div class="pitch-box">
        "Doutor(a), o Pinas Vet AI não é ficar postando foto bonitinha de cachorro no feed do Instagram. É um sistema onde a gente coloca a inteligência artificial do Google e do Meta trabalhando 24h para monitorar quem está pesquisando sintomas, emergências e consultas particulares aí na sua região no exato momento da decisão.
        <br><br>
        O tutor clica e cai numa página rápida com botão direto pro WhatsApp do plantão da clínica. Em vez de você ficar com a equipe ociosa esperando indicação, a gente coloca a clínica no topo do Google e lota a agenda de consultas particulares de R$ 180 a R$ 350 com previsibilidade."
        <span class="pitch-author">— Kauê (Pinas Studio) para Donos de Clínicas</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h4 style="font-size: 12.5px; color: #60A5FA; margin-bottom: 6px;">🎯 Métricas Típicas de Sucesso</h4>
        <p style="font-size: 11.5px; color: #CBD5E1;">
          • Custo por conversa no WhatsApp: <strong>R$ 4,00 a R$ 9,00</strong><br>
          • Valor médio de 1 consulta: <strong>R$ 180 a R$ 350</strong><br>
          • Com 2 a 3 consultas novas por semana, o cliente já paga o seu contrato e tem lucro líquido.
        </p>
      </div>

      <div class="card">
        <h4 style="font-size: 12.5px; color: #34D399; margin-bottom: 6px;">💼 Exemplo Prático Real</h4>
        <p style="font-size: 11.5px; color: #CBD5E1;">
          <strong>Cliente PETIVA:</strong> Centro Clínico Veterinário atendido pela Pinas (R$ 1.500/mês). Foco total em captação de consultas particulares e exames de imagem via Google e Meta.
        </p>
      </div>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Manual Operacional</span>
      <span>Página 03</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 4: PINAS FASHION TRAFFIC AI ==================== -->
  <div class="page">
    <div class="page-header">
      <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
      <span class="header-tag">Nicho Moda & Confecção</span>
    </div>

    <span class="eyebrow">Sistema 02 • Lojas de Roupas, Atacado & Varejo</span>
    <h2 style="font-size: 22px; margin-bottom: 6px;">Pinas Fashion Traffic AI™</h2>
    <p style="color: #94A3B8; font-size: 12.5px; margin-bottom: 14px;">
      A esteira de vendas para confecções e lojas do Brás, Bom Retiro e boutiques que sofrem com o alcance orgânico fantasma do Instagram.
    </p>

    <div class="card">
      <h3 style="font-size: 14px; margin-bottom: 8px; color: #FF0055;">⚙️ Como Funciona por Dentro (A Mecânica Real)</h3>
      <ul class="check-list">
        <li><strong>Algoritmo de Compradoras Ativas:</strong> Ativação do Meta Advantage+ com aprendizado neural para localizar mulheres e lojistas que efetuaram transações online de vestuário nos últimos 7 a 14 dias.</li>
        <li><strong>Esteira de Teste de Looks com IA:</strong> Em vez de anunciar apenas fotos de catálogo estáticas, estruturamos anúncios em 3 formatos: vídeo de provador (movimento e tecido), carrossel de combinações e posts de reposição de coleção.</li>
        <li><strong>Funil "Clique & Compre" no WhatsApp:</strong> O anúncio não manda para o feed nem para links complicados. Ao tocar no botão, o WhatsApp da loja abre com a foto da peça e a mensagem: <em>"Olá! Vi esse conjunto no anúncio, tem tamanho M disponível?"</em>.</li>
        <li><strong>Vendedora Vira Fechadora de Pix:</strong> O cliente já entra quente com interesse específico. A equipe da loja só passa a tabela de tamanhos, calcula o frete e envia a chave Pix.</li>
      </ul>
    </div>

    <div class="card card-highlight">
      <h3 style="font-size: 14px; margin-bottom: 6px;">🎙️ O Roteiro de Vendas (Como Você Explica pro Lojista)</h3>
      <div class="pitch-box">
        "Hoje depender de post no Instagram é horrível: você posta uma foto linda e a plataforma entrega pra menos de 3% de quem te segue. O Pinas Fashion Traffic AI é o nosso sistema onde a inteligência artificial do tráfego rastreia compradoras ativas com alto histórico de compra de roupas.
        <br><br>
        A gente coloca as suas peças na frente delas com o botão de compra direto pro seu WhatsApp. A cliente já chega com a foto do look perguntando tamanho e preço com o cartão na mão. Suas vendedoras não precisam correr atrás de ninguém, só fechar o pedido e mandar o Pix."
        <span class="pitch-author">— Kauê (Pinas Studio) para Lojistas e Confecções</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h4 style="font-size: 12.5px; color: #60A5FA; margin-bottom: 6px;">🎯 Métricas Típicas de Sucesso</h4>
        <p style="font-size: 11.5px; color: #CBD5E1;">
          • Custo por lead qualificado no WhatsApp: <strong>R$ 1,50 a R$ 4,50</strong><br>
          • Ticket médio de compra de moda: <strong>R$ 120 a R$ 450 (Varejo) / R$ 800+ (Atacado)</strong><br>
          • Com 10 a 20 conversas diárias, a loja bate metas semanais sem esforço orgânico.
        </p>
      </div>

      <div class="card">
        <h4 style="font-size: 12.5px; color: #34D399; margin-bottom: 6px;">💼 Exemplos Práticos Reais</h4>
        <p style="font-size: 11.5px; color: #CBD5E1;">
          <strong>Chay B & Bem Zanza:</strong> Lojas de moda com presença no Brás e Bom Retiro atendidas pela Pinas (R$ 1.200 e R$ 1.000/mês). Foco em campanhas dinâmicas e direcionamento direto para o balcão do WhatsApp.
        </p>
      </div>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Manual Operacional</span>
      <span>Página 04</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 5: PINAS TARGET AI ==================== -->
  <div class="page">
    <div class="page-header">
      <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
      <span class="header-tag">Comércios Locais em Geral</span>
    </div>

    <span class="eyebrow">Sistema 03 • Negócios Locais Sem Site Próprio</span>
    <h2 style="font-size: 22px; margin-bottom: 6px;">Pinas Target AI™</h2>
    <p style="color: #94A3B8; font-size: 12.5px; margin-bottom: 14px;">
      O pacote de dominação local para prestadores de serviço e comércios que têm ótima reputação no bairro mas são invisíveis nas pesquisas do Google.
    </p>

    <div class="card">
      <h3 style="font-size: 14px; margin-bottom: 8px; color: #FF0055;">⚙️ Como Funciona por Dentro (A Mecânica Real)</h3>
      <ul class="check-list">
        <li><strong>Landing Page de 1 Página Ultra-Rápida:</strong> Criação de uma página moderna, 100% responsiva para celular, contendo as avaliações 5 estrelas do Google Meu Negócio, fotos reais do local e botão de WhatsApp que acompanha o scroll.</li>
        <li><strong>Google Smart Bidding por Raio Geográfico:</strong> Configuração de anúncios no Google Search restritos ao raio de atendimento (ex: 3 km a 7 km). A IA otimiza os lances para capturar quem precisa do serviço hoje.</li>
        <li><strong>Rastreamento de Leads com Tags Inteligentes:</strong> Instalação da Google Tag com evento de conversão no clique do WhatsApp. A IA aprende quem são os usuários com perfil de conversão e refina a entrega a cada semana.</li>
        <li><strong>Monopólio Local contra Concorrentes:</strong> Coloca o cliente no topo absoluto das pesquisas, interceptando clientes que de outra forma iriam comprar no concorrente da mesma rua.</li>
      </ul>
    </div>

    <div class="card card-highlight">
      <h3 style="font-size: 14px; margin-bottom: 6px;">🎙️ O Roteiro de Vendas (Como Você Explica pro Empresário)</h3>
      <div class="pitch-box">
        "Vocês têm uma reputação excelente no bairro e dezenas de avaliações positivas, mas hoje quem pesquisa pelo serviço de vocês no Google acaba caindo no concorrente porque eles têm anúncio patrocinado e vocês ainda não têm uma estrutura própria.
        <br><br>
        O Sistema Pinas Target AI conecta uma página ultra-rápida do seu negócio com a inteligência do Google. A IA monitora quem está com intenção imediata de contratar na sua região e coloca vocês em primeiro lugar no celular da pessoa. É o caminho mais rápido para fazer clientes novos chamarem no WhatsApp todos os dias."
        <span class="pitch-author">— Kauê (Pinas Studio) para Comércios Locais</span>
      </div>
    </div>

    <div class="card">
      <h4 style="font-size: 13px; color: #FFFFFF; margin-bottom: 8px;">📊 Nichos Ideais para o Pinas Target AI™</h4>
      <p style="font-size: 11.5px; color: #CBD5E1; line-height: 1.6;">
        Assistências técnicas e conserto de celulares/Apple, estética automotiva e detailers, escolas de idiomas e cursos profissionalizantes, escritórios de contabilidade e advocacia local, marcenarias e planejados, vidraçarias e serviços residenciais de alto ticket.
      </p>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Manual Operacional</span>
      <span>Página 05</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 6: PLAYBOOK DE IMPLEMENTAÇÃO ==================== -->
  <div class="page">
    <div class="page-header">
      <img src="data:image/png;base64,${logoB64}" class="header-logo" alt="Pinas">
      <span class="header-tag">Playbook de Execução</span>
    </div>

    <span class="eyebrow">Capítulo 02 • Da Assinatura ao Lead</span>
    <h2 style="font-size: 22px; margin-bottom: 12px;">Como Implementar em 5 Dias (Passo a Passo)</h2>

    <table class="custom-table">
      <thead>
        <tr>
          <th style="width: 15%;">Etapa</th>
          <th style="width: 45%;">O que Você Executa</th>
          <th style="width: 40%;">Entrega / Resultado</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="step-badge">1</span> <strong>Dia 1</strong></td>
          <td>
            <strong>Onboarding & Acessos:</strong> Solicitar acesso de Admin no Google Ads, Meta Business Suite, receber 10-15 fotos reais e o número oficial do WhatsApp.
          </td>
          <td>Ambiente configurado e fotos organizadas na pasta do cliente.</td>
        </tr>
        <tr>
          <td><span class="step-badge">2</span> <strong>Dia 2</strong></td>
          <td>
            <strong>Estrutura de Conversão:</strong> Subir Landing Page rápida de 1 página com botão WhatsApp flutuante. Instalar Google Tag e Pixel da Meta com evento de clique.
          </td>
          <td>Página online em alta velocidade com rastreamento de IA ativo.</td>
        </tr>
        <tr>
          <td><span class="step-badge">3</span> <strong>Dia 3</strong></td>
          <td>
            <strong>Google Ads (Smart Bidding):</strong> Criar campanha de Search com raio de 5 a 8km. Adicionar palavras de intenção e urgência. Negativar termos grátis/públicos.
          </td>
          <td>Anúncio no topo do Google quando alguém pesquisa no bairro.</td>
        </tr>
        <tr>
          <td><span class="step-badge">4</span> <strong>Dia 4</strong></td>
          <td>
            <strong>Meta Ads (Advantage+):</strong> Subir campanha de Engajamento para WhatsApp com Advantage+ Audience. Subir 3 variações de criativos gerados com IA.
          </td>
          <td>Anúncios rodando no Instagram de quem tem perfil comprador.</td>
        </tr>
        <tr>
          <td><span class="step-badge">5</span> <strong>Dia 5</strong></td>
          <td>
            <strong>Alinhamento do WhatsApp:</strong> Criar respostas rápidas no WhatsApp Business do cliente e alinhar a regra de atendimento em menos de 5 minutos.
          </td>
          <td>Primeiras mensagens de clientes reais apitando no WhatsApp.</td>
        </tr>
      </tbody>
    </table>

    <div class="card card-highlight" style="margin-top: 14px;">
      <h3 style="font-size: 13.5px; margin-bottom: 6px; color: #FFFFFF;">⚡ A Rotina Semanal de Gestão (30 min por cliente)</h3>
      <p style="font-size: 12px; color: #CBD5E1;">
        • <strong>Segunda-feira:</strong> Analisar CTR e custo por mensagem; pausar criativos caros e ativar novas variações.<br>
        • <strong>Quinta-feira:</strong> Olhar relatório de termos de pesquisa no Google e negativar palavras irrelevantes.<br>
        • <strong>Sexta-feira:</strong> Enviar áudio curto de 40s no WhatsApp do cliente com o resumo semanal (mensagens geradas, custo médio e próximos passos).
      </p>
    </div>

    <div class="card" style="margin-top: 10px;">
      <h3 style="font-size: 13.5px; margin-bottom: 6px; color: #60A5FA;">🛡️ Como Fechar as 3 Principais Objeções do Cliente</h3>
      <div style="font-size: 11.5px; color: #CBD5E1; line-height: 1.5;">
        <strong>1. "Mas como essa IA funciona? É robô falando com cliente?":</strong><br>
        <em>"Não! O robô não fala com o cliente. Quem atende é a sua equipe de forma humana. A IA trabalha nos bastidores dos anúncios encontrando as pessoas certas que já querem comprar agora."</em><br><br>
        <strong>2. "Já fiz tráfego antes com outra pessoa e não funcionou":</strong><br>
        <em>"Provavelmente quem fez para você só clicou em 'impulsionar' no Instagram sem criar uma página de conversão nem filtrar curiosos no Google. O nosso sistema conecta a intenção de compra direta no seu WhatsApp."</em>
      </div>
    </div>

    <div class="page-footer">
      <span>Pinas Studio • Manual Operacional • @pinas.studio</span>
      <span>Página 06</span>
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

  const htmlPath = path.join(saidasDir, 'playbook_sistemas_ia_pinas.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  console.log('HTML gerado com sucesso:', htmlPath);

  console.log('Iniciando Microsoft Edge headless para compilar o PDF...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  
  const pdfPath = path.join(saidasDir, 'Playbook_Sistemas_IA_Pinas.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  });

  await browser.close();
  console.log('==================================================');
  console.log('🎉 PDF GERADO COM SUCESSO!');
  console.log('Arquivo salvo em:', pdfPath);
  console.log('Tamanho:', fs.statSync(pdfPath).size, 'bytes');
  console.log('==================================================');
}

generatePdf().catch(err => {
  console.error('Erro na geração do PDF:', err);
  process.exit(1);
});

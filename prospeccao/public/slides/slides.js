// Pinas Interactive Slide Deck Controller — Niche Specialized (Antigravity)

const progressBar = document.getElementById('progress-fill');
const currentSlideNum = document.getElementById('current-slide-num');
const totalSlidesNum = document.getElementById('total-slides-num');
const slideTitleIndicator = document.getElementById('slide-title-indicator');
const deckControls = document.getElementById('deck-controls');
const speakerDrawer = document.getElementById('speaker-drawer');
const speakerNotesText = document.getElementById('speaker-notes-text');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnNotes = document.getElementById('btn-notes');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnCloseNotes = document.getElementById('btn-close-notes');

// Dynamic Slide State
const allSlideElements = Array.from(document.querySelectorAll('.slide'));
let activeSlides = [];
let currentIndex = 0;

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const targetEmpresa = urlParams.get('empresa') || urlParams.get('lead') || '';
const targetBairro = urlParams.get('bairro') || '';
const rawNicho = urlParams.get('nicho') || '';

// Normalize niche to 4 core sectors: vet, fashion, beauty, local
function normalizeNiche(str) {
  if (!str) return 'local';
  const s = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/vet|pet|bicho|animal|cao|gato/.test(s)) return 'vet';
  if (/roupa|moda|calcado|confecc|vest|look|atacado|feminina|boutique/.test(s)) return 'fashion';
  if (/estet|bronze|beleza|salao|podolog|cabelo|unha|harmoniz|spa/.test(s)) return 'beauty';
  return 'local';
}

let currentNiche = normalizeNiche(rawNicho);

// Pitch Scripts for Kauê on Zoom / Google Meet calls
const universalNotes = {
  // Slide 1 (Capa)
  'Apresentação Oficial': `<h5>🎯 Objetivo deste Slide:</h5>
<p>Quebrar o gelo e posicionar você como um profissional sério e direto, diferente de qualquer freelancer ou agência genérica.</p>
<h5>🎙️ O que falar exatamente:</h5>
<p class="notes-script">"Olá [Nome], obrigado pelo tempo! Preparei uma apresentação curta e muito prática de 8 minutos. Não vou te enrolar com teoria de marketing. Meu objetivo hoje é te mostrar exatamente onde estão os gargalos de vendas da sua empresa e como o nosso sistema proprietário coloca clientes qualificados no seu WhatsApp todos os dias."</p>`,

  // Slide 2 (Balde Furado)
  'O Balde Furado': `<h5>🎯 Objetivo deste Slide:</h5>
<p>Criar o choque de realidade e mostrar que gastar dinheiro em anúncios ou posts sem a estrutura certa é queimar caixa.</p>
<h5>🎙️ O que falar exatamente:</h5>
<p class="notes-script">"[Nome], olha para essa imagem. A maioria dos empresários com quem eu converso acha que o problema deles é 'falta de tráfego'. Mas a verdade é que eles estão colocando água num balde todo furado. O cliente entra, não acha uma resposta rápida, não vê segurança e vaza. Se você acelerar o tráfego agora sem fechar os furos, você só vai queimar o dinheiro da sua empresa mais rápido."</p>`,

  // Slide 3 (Cliente Fantasma)
  'O Cliente Fantasma': `<h5>🎯 Objetivo deste Slide:</h5>
<p>Conectar com a dor que o empresário sente todos os dias: pessoas que olham o Instagram ou site e não compram.</p>
<h5>🎙️ O que falar exatamente:</h5>
<p class="notes-script">"Você já deve ter passado por isso: a pessoa clica no seu anúncio, visita seu perfil do Instagram, entra no seu site... e simplesmente desaparece. É o cliente fantasma! Mais de 95% do público que você atinge hoje vai embora sem te mandar um 'Oi' no WhatsApp. A Pinas existe exatamente para eliminar esse fantasma e transformar clique em conversa real."</p>`,

  // Slide 4 (A Tríade da Pinas)
  'A Tríade de Tração': `<h5>🎯 Objetivo deste Slide:</h5>
<p>Apresentar a solução da Pinas como um mecanismo de engenharia e tecnologia, não como mágica.</p>
<h5>🎙️ O que falar exatamente:</h5>
<p class="notes-script">"Como a gente resolve isso? Implementando a nossa Tríade de Tração: 1º criamos uma Landing Page de 1 página ultra-rápida feita para celular; 2º conectamos a nossa Inteligência Artificial nos anúncios trabalhando 24h para rastrear quem tem intenção imediata de compra; 3º jogamos o cliente com a mensagem personalizada pronta no WhatsApp da sua equipe."</p>`,

  // Slide 7 (Playbook 5 Dias)
  'Cronograma 5 Dias': `<h5>🎯 Objetivo deste Slide:</h5>
<p>Tirar o medo de complicação técnica e mostrar agilidade máxima de execução.</p>
<h5>🎙️ O que falar exatamente:</h5>
<p class="notes-script">"Tudo isso fica pronto em apenas 5 dias corridos. Você não precisa se preocupar com programação, design ou burocracia. Você só me passa os acessos e fotos no Dia 1, e no Dia 5 os primeiros clientes já começam a apitar no seu WhatsApp."</p>`,

  // Slide 8 (Proposta & Parceria)
  'Proposta & Fechamento': `<h5>🎯 Objetivo deste Slide:</h5>
<p>Fechar o contrato! Apresentar o escopo completo e chamar para ação imediata.</p>
<h5>🎙️ O que falar exatamente:</h5>
<p class="notes-script">"Na assessoria da Pinas está tudo incluso: página rápida de alta conversão, inteligência de tráfego no Google e Meta, relatório semanal transparente e contato direto comigo no WhatsApp. Não temos multas abusivas de 12 meses porque confiamos no resultado gerado. Vamos começar a rodar essa semana?"</p>`
};

const nicheNotes = {
  // VET
  'Pinas Vet AI™': `<h5>🎯 Mecanismo Veterinário:</h5>
<p class="notes-script">"Para clínicas veterinárias desenvolvemos o Pinas Vet AI™. A IA monitora quem digita sintomas e emergências no Google no seu bairro (ex: 'veterinário 24h domingo') e coloca a clínica em 1º lugar. Já filtramos quem não tem dinheiro e trazemos tutores prontos para pagar consultas particulares de R$ 180 a R$ 350. É exatamente assim que fazemos na Petiva hoje."</p>`,

  'Funil & ROI Veterinário': `<h5>🎯 Projeção & ROI Veterinário:</h5>
<p class="notes-script">"Olha este funil: no raio de 5km temos mais de 1.400 buscas mensais de pessoas com pets precisando de ajuda. Com R$ 800 investidos em anúncios a R$ 5,20 por conversa, você fecha em média 34 consultas agendadas, gerando mais de R$ 9.500 no caixa. Com apenas 3 a 4 consultas, a assessoria inteira do mês já está paga."</p>`,

  // FASHION
  'Pinas Fashion Traffic AI™': `<h5>🎯 Mecanismo Moda & Confecção:</h5>
<p class="notes-script">"Para lojas de roupas e confecções criamos o Pinas Fashion Traffic AI™. O feed do Instagram hoje só entrega pra 3% dos seguidores. A nossa IA rastreia compradoras ativas que compram roupas toda semana e coloca seus looks no feed e stories delas com o botão 'Clique & Compre'. A cliente cai no WhatsApp já com a foto da peça perguntando tamanho e preço."</p>`,

  'Giro de Coleção & WhatsApp': `<h5>🎯 Métricas & Giro Moda:</h5>
<p class="notes-script">"Aqui está o comparativo real: depender de post no feed gera meia dúzia de curtidas e zero conversas. Com o Pinas Fashion Traffic AI, o custo por conversa ativa fica entre R$ 2,20 e R$ 3,40, e uma coleção de 100 peças gira em 7 a 10 dias. Suas vendedoras passam o dia atendendo e recebendo Pix em vez de tentar inventar dancinhas."</p>`,

  // BEAUTY
  'Pinas Beauty AI™': `<h5>🎯 Mecanismo Estética & Bronze:</h5>
<p class="notes-script">"Para clínicas de estética e bronze criamos o Pinas Beauty AI™. O maior gargalo é ficar com salas vazias terça e quarta. Nós focamos nas campanhas magnéticas de alta margem — bronzeamento, limpeza profunda, harmonização — e implementamos um script no WhatsApp com cobrança de sinal, garantindo 95% de comparecimento real. É como operamos na Pink Luxo."</p>`,

  'Previsibilidade & LTV Estética': `<h5>🎯 Recorrência & LTV Estética:</h5>
<p class="notes-script">"Cliente de estética não compra uma vez só. O custo por lead fica em torno de R$ 3,80, e como essa cliente volta todo mês para manutenção, o LTV é superior a 3.4x em 6 meses. O resultado prático é uma taxa de ocupação média de 90% de terça a sábado."</p>`,

  // LOCAL
  'Pinas Target AI™': `<h5>🎯 Mecanismo Negócios Locais:</h5>
<p class="notes-script">"Com o Pinas Target AI, a gente fecha o cerco no Google. Se alguém no seu bairro precisa do seu serviço hoje, ele vai encontrar a sua empresa em 1º lugar antes do concorrente. Uma página ultra-rápida de 0.8s converte 4x mais do que qualquer site comum."</p>`,

  'Eficiência de Caixa & CAC': `<h5>🎯 Desperdício Zero & CAC Local:</h5>
<p class="notes-script">"A maioria das agências tradicionais joga 80% da verba no lixo anunciando pra cidade inteira e trazendo curiosos a 30km de distância. O método Pinas restringe o investimento no raio de 5km de quem tem dinheiro e intenção imediata de contratar você."</p>`
};

// Filter Slides according to active niche
function filterDeckByNiche(nicheKey) {
  currentNiche = nicheKey;

  // Filter slides
  activeSlides = [];
  allSlideElements.forEach(s => {
    const slideNiche = s.getAttribute('data-niche');
    if (slideNiche) {
      if (slideNiche === currentNiche) {
        s.style.display = 'flex';
        activeSlides.push(s);
      } else {
        s.style.display = 'none';
        s.classList.remove('active', 'prev');
      }
    } else {
      s.style.display = 'flex';
      activeSlides.push(s);
    }
  });

  // Update Niche Switcher Pills in Top Bar
  document.querySelectorAll('.niche-pill').forEach(pill => {
    const pillNiche = pill.getAttribute('data-niche-btn');
    if (pillNiche === currentNiche) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  // Update total count indicator (typically 08)
  if (totalSlidesNum) {
    totalSlidesNum.textContent = String(activeSlides.length).padStart(2, '0');
  }

  // Ensure index is within range
  if (currentIndex >= activeSlides.length) {
    currentIndex = 0;
  }
}

// Init Deck
function initDeck() {
  applyPersonalization();
  filterDeckByNiche(currentNiche);
  updateSlide(0);

  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Buttons
  if (btnNext) btnNext.addEventListener('click', nextSlide);
  if (btnPrev) btnPrev.addEventListener('click', prevSlide);
  if (btnNotes) btnNotes.addEventListener('click', toggleNotes);
  if (btnCloseNotes) btnCloseNotes.addEventListener('click', toggleNotes);
  if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);

  // Top Bar Niche Pills listeners (allow seamless switching on live calls)
  document.querySelectorAll('.niche-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = pill.getAttribute('data-niche-btn');
      filterDeckByNiche(target);
      // Jump to Slide 5 (the niche mechanism slide) on switch
      const nicheSlideIndex = activeSlides.findIndex(s => s.getAttribute('data-niche') === target);
      if (nicheSlideIndex !== -1) {
        updateSlide(nicheSlideIndex);
      } else {
        updateSlide(0);
      }
    });
  });

  // Touch swipe support
  let touchStartX = 0;
  let touchEndX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 50) nextSlide();
    if (touchEndX - touchStartX > 50) prevSlide();
  }, { passive: true });
}

function updateSlide(index) {
  if (index < 0 || index >= activeSlides.length) return;

  activeSlides.forEach((s, idx) => {
    s.classList.remove('active', 'prev');
    if (idx < index) {
      s.classList.add('prev');
    } else if (idx === index) {
      s.classList.add('active');
    }
  });

  currentIndex = index;

  // Counter
  if (currentSlideNum) currentSlideNum.textContent = String(currentIndex + 1).padStart(2, '0');

  // Title in bottom bar
  const activeSlide = activeSlides[currentIndex];
  const title = activeSlide.getAttribute('data-title') || 'Pinas Presentation';
  if (slideTitleIndicator) slideTitleIndicator.textContent = title;

  // Progress Bar
  const progressPercent = ((currentIndex + 1) / activeSlides.length) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  // Controls Theme Match
  const isCream = activeSlide.classList.contains('slide-theme-cream');
  if (deckControls) {
    if (isCream) {
      deckControls.classList.add('theme-cream');
    } else {
      deckControls.classList.remove('theme-cream');
    }
  }

  // Update Speaker Notes dynamically
  if (speakerNotesText) {
    let noteHtml = nicheNotes[title] || universalNotes[title] || '<p>Sem anotações específicas para este slide.</p>';
    if (targetEmpresa) {
      noteHtml = noteHtml.replace(/\[Nome\]/g, targetEmpresa);
    }
    speakerNotesText.innerHTML = noteHtml;
  }
}

function applyPersonalization() {
  if (!targetEmpresa) return;

  document.title = `Pinas Studio — Estratégia Comercial: ${targetEmpresa}`;

  // Ajustar badge do Slide 1
  const kicker = document.querySelector('.slide:nth-child(1) .slide-kicker');
  if (kicker) {
    kicker.textContent = `ESTRATÉGIA EXCLUSIVA • ${targetEmpresa.toUpperCase()}`;
  }

  // Ajustar descrição do Slide 1
  const bodyDesc = document.querySelector('.slide:nth-child(1) .body-desc');
  if (bodyDesc) {
    bodyDesc.innerHTML = `Uma apresentação direta e prática sobre como transformar pesquisas do Google e usuários do Instagram aí em <strong>${targetBairro || 'sua região'}</strong> em clientes comprando na <strong>${targetEmpresa}</strong> todos os dias.`;
  }
}

function nextSlide() {
  if (currentIndex < activeSlides.length - 1) {
    updateSlide(currentIndex + 1);
  }
}

function prevSlide() {
  if (currentIndex > 0) {
    updateSlide(currentIndex - 1);
  }
}

function handleKeydown(e) {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
    e.preventDefault();
    nextSlide();
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
    e.preventDefault();
    prevSlide();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if (e.key === 'n' || e.key === 'N') {
    toggleNotes();
  } else if (e.key === 'Home') {
    updateSlide(0);
  } else if (e.key === 'End') {
    updateSlide(activeSlides.length - 1);
  }
}

function toggleNotes() {
  if (speakerDrawer) {
    speakerDrawer.classList.toggle('open');
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Erro ao entrar em fullscreen:', err);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

document.addEventListener('DOMContentLoaded', initDeck);

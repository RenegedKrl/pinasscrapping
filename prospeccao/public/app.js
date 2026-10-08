// State
let allLeads = [];
let templates = [];
let stepTemplatesData = null;
let currentModalMode = 'stages'; // 'stages' | 'classic'
let currentLeadHasWebsitePreview = false;
let appConfig = { dailyLimit: 30, sentToday: 0 };
let currentActiveLead = null;
let scrapePollingInterval = null;
let currentWaStatus = { connected: false, status: 'disconnected', user: null, qrCodeDataUrl: null };
let waPollingTimer = null;

// DOM Elements
const kpiTotal = document.getElementById('kpi-total');
const kpiWhatsapp = document.getElementById('kpi-whatsapp');
const kpiNosite = document.getElementById('kpi-nosite');
const kpiSentToday = document.getElementById('kpi-sent-today');
const badgeLeadsCount = document.getElementById('badge-leads-count');
const safetyProgressBar = document.getElementById('safety-progress-bar');
const safetyText = document.getElementById('safety-text');

const leadsTbody = document.getElementById('leads-tbody');
const recentLeadsGrid = document.getElementById('recent-leads-grid');
const queueList = document.getElementById('queue-list');
const cadenceSentCount = document.getElementById('cadence-sent-count');
const cadenceLimitCount = document.getElementById('cadence-limit-count');
const cadenceProgressFill = document.getElementById('cadence-progress-fill');

// Init
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initQuickTags();
  loadConfig();
  loadTemplates();
  loadStepTemplates();
  loadLeads();

  // Listeners
  document.getElementById('form-scrape').addEventListener('submit', handleScrapeSubmit);
  document.getElementById('btn-go-to-leads').addEventListener('click', () => switchTab('tab-leads'));
  document.getElementById('filter-search').addEventListener('input', debounce(loadLeads, 300));
  document.getElementById('filter-niche').addEventListener('change', loadLeads);
  document.getElementById('filter-status').addEventListener('change', loadLeads);
  const filterOpp = document.getElementById('filter-opportunity');
  if (filterOpp) filterOpp.addEventListener('change', loadLeads);
  document.getElementById('filter-website').addEventListener('change', loadLeads);
  document.getElementById('filter-only-mobile').addEventListener('change', loadLeads);
  document.getElementById('btn-export-csv').addEventListener('click', () => window.location.href = '/api/export');

  // WhatsApp, Inbox & Autopilot
  initToastSystem();
  initLightbox();
  initLocationSelector();
  initNicheAutocomplete();
  initWhatsAppManager();
  fetchWhatsAppStatus();
  initInbox();
  initModals();
  initAutopilot();
});

// ==================== TABS ====================
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  const pane = document.getElementById(tabId);

  if (navBtn) navBtn.classList.add('active');
  if (pane) pane.classList.add('active');

  if (tabId === 'tab-leads') loadLeads();
  if (tabId === 'tab-cadence') renderCadenceQueue();
  if (tabId === 'tab-inbox') loadInboxChats();
}

// ==================== QUICK TAGS ====================
function initQuickTags() {
  document.querySelectorAll('.quick-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const targetId = tag.getAttribute('data-target');
      const val = tag.getAttribute('data-val');
      const input = document.getElementById(targetId);
      if (input) {
        input.value = val;
        input.focus();
      }
    });
  });
}

// ==================== DATA LOADING ====================
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    appConfig = await res.json();
    updateSafetyWidget();

    // Preencher campos de settings
    const chainsTextarea = document.getElementById('settings-excluded-chains');
    const kwTextarea = document.getElementById('settings-excluded-keywords');
    const dailyLimitInput = document.getElementById('settings-daily-limit');
    const minDelayInput = document.getElementById('settings-min-delay');
    const maxDelayInput = document.getElementById('settings-max-delay');

    if (chainsTextarea && appConfig.excludedChains) {
      chainsTextarea.value = appConfig.excludedChains.join('\n');
    }
    if (kwTextarea && appConfig.excludedKeywords) {
      kwTextarea.value = appConfig.excludedKeywords.join('\n');
    }
    if (dailyLimitInput) dailyLimitInput.value = appConfig.dailyLimit || 30;
    if (minDelayInput) minDelayInput.value = appConfig.minDelaySeconds || 30;
    if (maxDelayInput) maxDelayInput.value = appConfig.maxDelaySeconds || 60;
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

function updateSafetyWidget() {
  const sent = appConfig.sentToday || 0;
  const limit = appConfig.dailyLimit || 30;
  const percent = Math.min(Math.round((sent / limit) * 100), 100);

  if (kpiSentToday) kpiSentToday.textContent = `${sent} / ${limit}`;
  if (safetyProgressBar) safetyProgressBar.style.width = `${percent}%`;
  if (safetyText) safetyText.textContent = `${sent} de ${limit} mensagens hoje`;

  if (cadenceSentCount) cadenceSentCount.textContent = sent;
  if (cadenceLimitCount) cadenceLimitCount.textContent = limit;
  if (cadenceProgressFill) cadenceProgressFill.style.width = `${percent}%`;
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    templates = await res.json();
    renderTemplatesInSelects();
    renderScriptsEditor();
  } catch (err) {
    console.error('Erro ao carregar templates:', err);
  }
}

async function loadStepTemplates() {
  try {
    const res = await fetch('/api/step-templates');
    stepTemplatesData = await res.json();
    renderScriptsStagesEditor();
  } catch (err) {
    console.error('Erro ao carregar templates de etapas:', err);
  }
}

function renderTemplatesInSelects() {
  const cadenceSelect = document.getElementById('cadence-template-select');
  const modalSelect = document.getElementById('modal-wa-template-select');

  const optionsHtml = templates.map(t => `<option value="${t.id}">${t.name} (${t.target})</option>`).join('');

  if (cadenceSelect) {
    cadenceSelect.innerHTML = `<option value="auto">🤖 Auto-detectar por Nicho / Sem Site (Recomendado)</option>` + optionsHtml;
  }
  if (modalSelect) modalSelect.innerHTML = optionsHtml;
}

async function loadLeads() {
  try {
    const search = document.getElementById('filter-search').value;
    const niche = document.getElementById('filter-niche').value;
    const status = document.getElementById('filter-status').value;
    const opportunity = document.getElementById('filter-opportunity')?.value;
    const hasWebsite = document.getElementById('filter-website').value;
    const hasMobile = document.getElementById('filter-only-mobile').checked;

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (niche) params.append('niche', niche);
    if (status) params.append('status', status);
    if (opportunity && opportunity !== 'todos') params.append('opportunity', opportunity);
    if (hasWebsite) params.append('hasWebsite', hasWebsite);
    if (hasMobile) params.append('hasMobile', 'true');

    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();

    allLeads = data.leads || [];
    renderKpis(data.stats);
    if (data.niches) {
      updateNicheFilter(data.niches, data.stats?.total);
    }
    renderLeadsTable(allLeads);
    renderRecentCards(allLeads.slice(0, 6));
    renderCadenceQueue();
  } catch (err) {
    console.error('Erro ao carregar leads:', err);
  }
}

function updateNicheFilter(niches, totalCount) {
  const select = document.getElementById('filter-niche');
  if (!select) return;

  const currentVal = select.value;
  let optionsHtml = `<option value="todos">Todos os Nichos${totalCount ? ` (${totalCount})` : ''}</option>`;

  if (Array.isArray(niches) && niches.length > 0) {
    niches.forEach(n => {
      const isSelected = (n.value === currentVal) ? 'selected' : '';
      optionsHtml += `<option value="${escapeHtml(n.value)}" ${isSelected}>${escapeHtml(n.label)} (${n.count})</option>`;
    });
  }

  select.innerHTML = optionsHtml;

  // Se o valor anterior era um nicho existente, manter selecionado sem resetar o filtro
  if (currentVal && currentVal !== 'todos') {
    const exists = niches && niches.some(n => n.value === currentVal);
    if (exists) {
      select.value = currentVal;
    }
  }
}

function renderKpis(stats) {
  if (!stats) return;
  if (kpiTotal) kpiTotal.textContent = stats.total;
  if (kpiWhatsapp) kpiWhatsapp.textContent = stats.withMobile;
  if (kpiNosite) kpiNosite.textContent = stats.withoutWebsite;
  if (badgeLeadsCount) badgeLeadsCount.textContent = stats.total;
}

// ==================== RENDER TABLE ====================
function renderLeadsTable(leads) {
  if (!leadsTbody) return;

  if (leads.length === 0) {
    leadsTbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Nenhum lead encontrado com os filtros atuais. Execute uma nova varredura ou adicione manualmente!
        </td>
      </tr>
    `;
    return;
  }

  leadsTbody.innerHTML = leads.map(lead => {
    const hasCelular = lead.hasMobile;
    const phoneBadge = lead.hasPhone 
      ? `<span class="badge ${hasCelular ? 'badge-mobile' : 'badge-landline'}">${hasCelular ? '📱 Celular/WhatsApp' : '☎️ Fixo'}</span>` 
      : '<span class="badge" style="color: var(--text-muted);">Não listado</span>';

    const websiteBadge = lead.hasWebsite
      ? `<a href="${lead.website}" target="_blank" class="badge badge-hassite">🔗 Ver Site</a>`
      : `<span class="badge badge-nosite">⚠️ Sem Site (Oportunidade)</span>`;

    const ratingDisplay = lead.rating && lead.rating !== 'N/A'
      ? `<span style="color: var(--color-yellow); font-weight: 700;">★ ${lead.rating}</span> <small style="color: var(--text-muted);">(${lead.reviews})</small>`
      : '<span style="color: var(--text-muted);">-</span>';

    const opp = lead.opportunity || { type: 'geral', label: '📍 Presença Local', desc: '' };
    const oppBadge = `
      <div class="badge-opportunity" title="${escapeHtml(opp.attackAngle || opp.desc || '')}">
        <span class="opp-tag ${opp.type || 'geral'}">${opp.label}</span>
        <span class="score-stars">${'★'.repeat(lead.score || 3)}${'☆'.repeat(5 - (lead.score || 3))}</span>
      </div>
    `;

    return `
      <tr id="row-${lead.id}">
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${lead.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${lead.niche || 'Geral'}</div>
        </td>
        <td>${oppBadge}</td>
        <td>
          <div style="font-weight: 600;">${lead.phone}</div>
          ${phoneBadge}
        </td>
        <td>${websiteBadge}</td>
        <td>${ratingDisplay}</td>
        <td>
          <div style="font-size: 0.85rem;">${lead.neighborhood || lead.address || 'São Paulo'}</div>
          ${lead.mapsUrl ? `<a href="${lead.mapsUrl}" target="_blank" style="font-size: 0.72rem; color: var(--color-blue); text-decoration: none;">Ver no Maps ↗</a>` : ''}
        </td>
        <td>
          <select class="status-select status-${lead.status}" onchange="changeStatus('${lead.id}', this.value)">
            <option value="novo" ${lead.status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="contatado" ${lead.status === 'contatado' ? 'selected' : ''}>Contatado</option>
            <option value="respondeu" ${lead.status === 'respondeu' ? 'selected' : ''}>Respondeu</option>
            <option value="reuniao" ${lead.status === 'reuniao' ? 'selected' : ''}>Reunião Marcada</option>
            <option value="proposta" ${lead.status === 'proposta' ? 'selected' : ''}>Proposta Enviada</option>
            <option value="ganho" ${lead.status === 'ganho' ? 'selected' : ''}>Cliente Fechado 🎉</option>
            <option value="perdido" ${lead.status === 'perdido' ? 'selected' : ''}>Perdido</option>
          </select>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-whatsapp btn-sm" onclick="openWhatsAppModal('${lead.id}')" title="Chamar no WhatsApp com mensagem personalizada">
              <span>💬 WhatsApp</span>
            </button>
            <a href="/slides?empresa=${encodeURIComponent(lead.name)}&bairro=${encodeURIComponent(lead.neighborhood || 'Santo Amaro')}&nicho=${encodeURIComponent(lead.niche || '')}" target="_blank" class="btn-table-slides" title="Abrir Slides personalizados para Call com este lead">
              🖥️ Slides ↗
            </a>
            <button class="btn btn-outline btn-icon-only" onclick="deleteLead('${lead.id}')" title="Excluir lead">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecentCards(leads) {
  if (!recentLeadsGrid) return;

  if (leads.length === 0) {
    recentLeadsGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">Nenhum lead coletado recentemente.</p>`;
    return;
  }

  recentLeadsGrid.innerHTML = leads.map(l => {
    const opp = l.opportunity || { type: 'geral', label: '📍 Presença Local' };
    return `
    <div class="lead-card">
      <div class="lead-card-header">
        <div>
          <h4 class="lead-card-title">${l.name}</h4>
          <span class="lead-card-niche">${l.niche}</span>
        </div>
        <span class="opp-tag ${opp.type || 'geral'}" style="font-size: 0.7rem;">${opp.label}</span>
      </div>
      <div class="lead-card-body">
        <div><strong>Tel:</strong> ${l.phone} ${l.hasMobile ? '📱' : ''}</div>
        <div><strong>Região:</strong> ${l.neighborhood || 'SP'}</div>
        <div><strong>Avaliação:</strong> ★ ${l.rating || 'N/A'} (${l.reviews} reviews)</div>
      </div>
      <div class="lead-card-footer">
        <span class="status-select status-${l.status}">${l.status.toUpperCase()}</span>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <a href="/slides?empresa=${encodeURIComponent(l.name)}&bairro=${encodeURIComponent(l.neighborhood || 'Santo Amaro')}&nicho=${encodeURIComponent(l.niche || '')}" target="_blank" class="btn-table-slides">
            🖥️ Slides
          </a>
          <button class="btn btn-whatsapp btn-sm" onclick="openWhatsAppModal('${l.id}')">
            Chamar 💬
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

// ==================== SCRAPING SUBMIT ====================
async function handleScrapeSubmit(e) {
  e.preventDefault();

  const niche = document.getElementById('input-niche').value.trim();
  const location = document.getElementById('input-location').value.trim();
  const maxResults = document.getElementById('select-qty').value;
  const btnStart = document.getElementById('btn-start-scrape');
  const progressBox = document.getElementById('scrape-progress-box');
  const statusText = document.getElementById('scrape-status-text');
  const percentText = document.getElementById('scrape-percent-text');
  const progressFill = document.getElementById('scrape-progress-fill');

  if (!niche || !location) {
    alert('Por favor informe o nicho e a localização.');
    return;
  }

  btnStart.disabled = true;
  btnStart.innerHTML = `<span class="btn-icon">⏳</span> Varredura em Execução...`;
  progressBox.style.display = 'block';
  statusText.textContent = `Iniciando scraper para "${niche} ${location}"...`;
  percentText.textContent = `10%`;
  progressFill.style.width = `10%`;

  const onlyMobile = document.getElementById('check-only-whatsapp')?.checked ?? true;
  const filterDuplicates = document.getElementById('check-filter-duplicates')?.checked ?? true;

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche, location, maxResults, onlyMobile, filterDuplicates })
    });
    const data = await res.json();

    if (res.status === 400 && data.error) {
      alert(data.error);
      resetScrapeButton();
      return;
    }

    // Polling do progresso
    scrapePollingInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/scrape/status');
        const state = await statusRes.json();

        statusText.textContent = state.message;
        percentText.textContent = `${state.percent || 0}%`;
        progressFill.style.width = `${state.percent || 0}%`;

        if (!state.running) {
          clearInterval(scrapePollingInterval);
          resetScrapeButton();
          loadLeads();
          if (state.error) {
            alert(`Aviso do Scraper: ${state.message}`);
          }
        }
      } catch (err) {
        console.error('Erro no polling:', err);
      }
    }, 2000);

  } catch (err) {
    alert(`Erro ao iniciar varredura: ${err.message}`);
    resetScrapeButton();
  }
}

function resetScrapeButton() {
  const btnStart = document.getElementById('btn-start-scrape');
  btnStart.disabled = false;
  btnStart.innerHTML = `<span class="btn-icon">⚡</span> INICIAR VARREDURA GOOGLE MAPS`;
}

// ==================== CRM ACTIONS ====================
async function changeStatus(id, newStatus) {
  try {
    await fetch(`/api/leads/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const row = document.getElementById(`row-${id}`);
    if (row) {
      const select = row.querySelector('.status-select');
      if (select) {
        select.className = `status-select status-${newStatus}`;
      }
    }
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
  }
}

async function deleteLead(id) {
  if (!confirm('Deseja realmente remover esse lead da sua base?')) return;
  try {
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    loadLeads();
  } catch (err) {
    console.error('Erro ao excluir lead:', err);
  }
}

// ==================== CADENCE QUEUE & AUTOPILOT ====================
let autopilotRunning = false;
let autopilotInterval = null;
let autopilotCountdownSeconds = 0;

function renderCadenceQueue() {
  if (!queueList) return;
  const pendingLeads = allLeads.filter(l => l.status === 'novo');
  const countBadge = document.getElementById('queue-pending-count');
  if (countBadge) countBadge.textContent = pendingLeads.length;

  if (pendingLeads.length === 0) {
    queueList.innerHTML = `<p style="color: var(--text-muted); padding: 1.5rem 0;">Nenhum lead novo na fila. Todos já foram contatados ou aguardam nova varredura!</p>`;
    return;
  }

  queueList.innerHTML = pendingLeads.map(l => {
    const recId = getRecommendedTemplateId(l);
    const recTemplate = templates.find(t => t.id === recId);
    const recLabel = recTemplate ? recTemplate.name.split('/')[1] || recTemplate.name.split(':')[1] || recTemplate.name : 'Pinas AI';

    return `
      <div class="queue-item" id="queue-item-${l.id}">
        <div class="queue-item-info">
          <h4>${l.name}</h4>
          <p>${l.phone} • ${l.neighborhood || 'SP'} • ${l.hasWebsite ? 'Com Site' : '⚠️ Sem Site (Oportunidade)'}</p>
          <div style="margin-top: 0.25rem;">
            <span class="badge badge-hassite" style="font-size: 0.7rem;">⚡ ${recLabel}</span>
          </div>
        </div>
        <button class="btn btn-whatsapp btn-sm" onclick="openWhatsAppModal('${l.id}')">
          Disparar Agora 💬
        </button>
      </div>
    `;
  }).join('');
}

function initAutopilot() {
  const btnStart = document.getElementById('btn-start-autopilot');
  const btnPause = document.getElementById('btn-pause-autopilot');
  const autoresponderToggle = document.getElementById('cadence-autoresponder-toggle');

  if (btnStart) {
    btnStart.addEventListener('click', startAutopilot);
  }
  if (btnPause) {
    btnPause.addEventListener('click', () => pauseAutopilot('Piloto Automático pausado manualmente pelo operador.'));
  }

  if (autoresponderToggle) {
    autoresponderToggle.addEventListener('change', async () => {
      if (stepTemplatesData) {
        stepTemplatesData.settings = stepTemplatesData.settings || {};
        stepTemplatesData.settings.autoResponderEnabled = autoresponderToggle.checked;
        try {
          await fetch('/api/step-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stepTemplatesData)
          });
          showToastNotification(`Auto-Resposta ${autoresponderToggle.checked ? 'ativada' : 'pausada'}.`);
        } catch (e) {}
      }
    });
  }
}

async function startAutopilot() {
  if (autopilotRunning) return;

  // 0. Validar conexão com o WhatsApp antes de iniciar
  const wa = await fetchWhatsAppStatus();
  if (!wa.connected) {
    alert('⚠️ Para disparar no Piloto Automático direto pelo sistema sem abrir abas, conecte o WhatsApp escaneando o QR Code.');
    openWhatsAppConnectModal();
    return;
  }

  const pendingLeads = allLeads.filter(l => l.status === 'novo');
  if (pendingLeads.length === 0) {
    alert('Nenhum lead com status "Novo" na fila. Faça uma nova varredura no Google Maps para carregar a esteira!');
    return;
  }

  if (appConfig.sentToday >= appConfig.dailyLimit) {
    alert(`Limite de segurança diário atingido (${appConfig.sentToday}/${appConfig.dailyLimit} hoje).\n\nPara proteger o seu WhatsApp contra risco de bloqueio da Meta, a cota de hoje está completa. O limite reinicia automaticamente amanhã!`);
    return;
  }

  autopilotRunning = true;
  document.getElementById('btn-start-autopilot').style.display = 'none';
  document.getElementById('btn-pause-autopilot').style.display = 'block';

  const dot = document.getElementById('autopilot-dot');
  if (dot) dot.classList.add('active');

  const statusLabel = document.getElementById('autopilot-status-label');
  if (statusLabel) {
    statusLabel.innerHTML = 'Piloto Automático: <strong style="color: var(--color-green);">Em Execução (Disparo Direto)</strong>';
  }

  const box = document.getElementById('autopilot-countdown-box');
  if (box) box.style.display = 'block';

  // Processa o primeiro lead imediatamente
  await processNextAutopilotLead();
}

async function processNextAutopilotLead() {
  if (!autopilotRunning) return;

  // 1. Validar cota diária
  if (appConfig.sentToday >= appConfig.dailyLimit) {
    pauseAutopilot('Limite diário de segurança atingido com sucesso! O chip da Pinas está 100% protegido.');
    return;
  }

  // 2. Localizar próximo lead novo
  const nextLead = allLeads.find(l => l.status === 'novo');
  if (!nextLead) {
    pauseAutopilot('Todos os leads da fila foram processados com sucesso!');
    return;
  }

  // Obter telefone limpo
  const cleanPhone = nextLead.cleanPhone;
  if (!cleanPhone || cleanPhone.length < 10) {
    // Lead sem telefone válido: marcar como 'perdido'
    nextLead.status = 'perdido';
    try {
      await fetch(`/api/leads/${nextLead.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'perdido' })
      });
    } catch (err) {}
    renderCadenceQueue();
    renderLeadsTable(allLeads);
    processNextAutopilotLead();
    return;
  }

  // 3. Montar mensagem conforme modo de disparo
  const dispatchMode = document.getElementById('autopilot-dispatch-mode')?.value || 'stages';
  let personalizedMessage = '';

  if (dispatchMode === 'stages') {
    // No modo Por Etapas: envia apenas a Etapa 1 (Abertura para quebrar o gelo!)
    personalizedMessage = formatStageText(nextLead, 1, !!nextLead.hasWebsite);
    nextLead.stage = 1;
  } else {
    const templateSelect = document.getElementById('cadence-template-select');
    const templateId = templateSelect ? templateSelect.value : 'auto';
    personalizedMessage = buildPersonalizedMessage(nextLead, templateId);
  }

  // Atualizar visualização do alvo atual
  const targetLeadEl = document.getElementById('autopilot-target-lead');
  if (targetLeadEl) {
    const modeLabel = dispatchMode === 'stages' ? 'Etapa 1 (Abertura)' : 'Mensagem Completa';
    targetLeadEl.innerHTML = `🚀 <strong>Enviando [${modeLabel}] para:</strong> ${nextLead.name}...`;
  }

  // 4. Enviar mensagem silenciosamente via WhatsApp direto no backend (SEM ABRIR JANELAS)
  try {
    const sendRes = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: nextLead.id,
        phone: cleanPhone,
        text: personalizedMessage
      })
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      if (sendRes.status === 429) {
        pauseAutopilot(sendData.error || 'Limite diário atingido.');
        return;
      }
      if (sendData.error && sendData.error.includes('não está conectado')) {
        pauseAutopilot('A conexão do seu WhatsApp caiu. Reconecte pelo painel para continuar o Piloto Automático.');
        openWhatsAppConnectModal();
        return;
      }
      throw new Error(sendData.error || 'Erro no envio direto');
    }

    nextLead.status = 'contatado';
    if (dispatchMode === 'stages') {
      nextLead.stage = 1;
      nextLead.stageHistory = [{
        stage: 1,
        sentAt: new Date().toISOString(),
        auto: true,
        text: personalizedMessage
      }];
      try {
        await fetch(`/api/leads/${nextLead.id}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: 1, text: personalizedMessage, sendNow: false })
        });
      } catch (e) {}
    }

    if (sendData.sentToday !== undefined) {
      appConfig.sentToday = sendData.sentToday;
    } else {
      appConfig.sentToday = (appConfig.sentToday || 0) + 1;
    }
    updateSafetyWidget();
    renderCadenceQueue();
    renderLeadsTable(allLeads);

    if (targetLeadEl) {
      targetLeadEl.innerHTML = `✅ <strong>Enviado com sucesso para:</strong> ${nextLead.name}!`;
    }
  } catch (err) {
    console.error('Erro no envio direto do WhatsApp:', err);
    if (targetLeadEl) {
      targetLeadEl.innerHTML = `⚠️ Falha no envio para ${nextLead.name} (${err.message}). Continuando fila...`;
    }
  }

  // 5. Verificar se ainda restam leads
  const remaining = allLeads.filter(l => l.status === 'novo');
  if (remaining.length === 0) {
    pauseAutopilot('Todos os leads da fila foram processados com sucesso!');
    return;
  }

  // 6. Iniciar contagem regressiva do intervalo de segurança
  const delaySec = parseInt(document.getElementById('autopilot-delay-select').value, 10) || 50;
  autopilotCountdownSeconds = delaySec;

  const secondsLeftEl = document.getElementById('autopilot-seconds-left');
  if (secondsLeftEl) {
    secondsLeftEl.textContent = `${autopilotCountdownSeconds}s`;
  }

  clearInterval(autopilotInterval);
  autopilotInterval = setInterval(async () => {
    if (!autopilotRunning) {
      clearInterval(autopilotInterval);
      return;
    }

    autopilotCountdownSeconds--;
    if (secondsLeftEl) {
      secondsLeftEl.textContent = `${autopilotCountdownSeconds}s`;
    }

    if (autopilotCountdownSeconds <= 0) {
      clearInterval(autopilotInterval);
      await processNextAutopilotLead();
    }
  }, 1000);
}

function pauseAutopilot(reason = '') {
  autopilotRunning = false;
  clearInterval(autopilotInterval);

  const btnStart = document.getElementById('btn-start-autopilot');
  const btnPause = document.getElementById('btn-pause-autopilot');
  if (btnStart) btnStart.style.display = 'block';
  if (btnPause) btnPause.style.display = 'none';

  const dot = document.getElementById('autopilot-dot');
  if (dot) dot.classList.remove('active');

  const statusLabel = document.getElementById('autopilot-status-label');
  if (statusLabel) {
    statusLabel.innerHTML = 'Piloto Automático: <strong>Parado</strong>';
  }

  const box = document.getElementById('autopilot-countdown-box');
  if (box) box.style.display = 'none';

  if (reason) {
    alert(reason);
  }
}

// ==================== WHATSAPP DIRECT MANAGER ====================
function initWhatsAppManager() {
  const btnHeaderWa = document.getElementById('btn-header-wa');
  const btnCadenceConnect = document.getElementById('btn-cadence-connect-wa');
  const btnCloseModal = document.getElementById('btn-close-wa-connect');
  const btnModalCloseConn = document.getElementById('btn-modal-close-connected');
  const btnModalRefreshQr = document.getElementById('btn-modal-refresh-qr');
  const btnTabRefreshQr = document.getElementById('btn-tab-refresh-qr');
  const btnTabDisconnect = document.getElementById('btn-tab-disconnect-wa');
  const btnTabSendTest = document.getElementById('btn-tab-send-test');

  if (btnHeaderWa) btnHeaderWa.addEventListener('click', openWhatsAppConnectModal);
  if (btnCadenceConnect) btnCadenceConnect.addEventListener('click', openWhatsAppConnectModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeWhatsAppConnectModal);
  if (btnModalCloseConn) btnModalCloseConn.addEventListener('click', closeWhatsAppConnectModal);
  if (btnModalRefreshQr) btnModalRefreshQr.addEventListener('click', requestWhatsAppConnect);
  if (btnTabRefreshQr) btnTabRefreshQr.addEventListener('click', requestWhatsAppConnect);
  if (btnTabDisconnect) btnTabDisconnect.addEventListener('click', requestWhatsAppDisconnect);
  if (btnTabSendTest) btnTabSendTest.addEventListener('click', sendTestWhatsAppMessage);

  // Se o usuário clicar na aba WhatsApp do menu lateral, dispara conexão se desconectado
  const navWa = document.getElementById('nav-whatsapp');
  if (navWa) {
    navWa.addEventListener('click', () => {
      startWaPolling();
      if (!currentWaStatus.connected && currentWaStatus.status !== 'qr_ready') {
        requestWhatsAppConnect();
      }
    });
  }

  // Polling em segundo plano leve a cada 15 segundos
  setInterval(() => {
    if (!waPollingTimer) {
      fetchWhatsAppStatus();
    }
  }, 15000);
}

function openWhatsAppConnectModal() {
  const modal = document.getElementById('modal-wa-connect');
  if (!modal) return;
  modal.style.display = 'flex';
  startWaPolling();

  if (!currentWaStatus.connected && currentWaStatus.status !== 'qr_ready') {
    requestWhatsAppConnect();
  }
}

function closeWhatsAppConnectModal() {
  const modal = document.getElementById('modal-wa-connect');
  if (modal) modal.style.display = 'none';
  stopWaPolling();
}

function startWaPolling() {
  if (waPollingTimer) return;
  waPollingTimer = setInterval(async () => {
    const data = await fetchWhatsAppStatus();
    if (data.connected) {
      // Quando conecta com sucesso, pode diminuir a frequência
      stopWaPolling();
    }
  }, 2500);
}

function stopWaPolling() {
  if (waPollingTimer) {
    clearInterval(waPollingTimer);
    waPollingTimer = null;
  }
}

async function fetchWhatsAppStatus() {
  try {
    const res = await fetch('/api/whatsapp/status');
    const data = await res.json();
    currentWaStatus = data;
    updateWhatsAppUI(data);
    return data;
  } catch (err) {
    console.warn('Erro ao obter status do WhatsApp:', err);
    return currentWaStatus;
  }
}

async function requestWhatsAppConnect() {
  try {
    const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
    const data = await res.json();
    currentWaStatus = data;
    updateWhatsAppUI(data);
    startWaPolling();
  } catch (err) {
    console.error('Erro ao conectar WhatsApp:', err);
  }
}

async function requestWhatsAppDisconnect() {
  if (!confirm('Deseja realmente desconectar o WhatsApp da Pinas desta máquina?')) return;
  try {
    await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    await fetchWhatsAppStatus();
  } catch (err) {
    console.error('Erro ao desconectar:', err);
  }
}

async function sendTestWhatsAppMessage() {
  const phoneInput = document.getElementById('wa-tab-test-phone');
  const statusEl = document.getElementById('wa-tab-test-status');
  const btn = document.getElementById('btn-tab-send-test');

  if (!phoneInput || !statusEl) return;
  const rawPhone = phoneInput.value.trim();
  if (!rawPhone) {
    alert('Digite um número de telefone com DDD para testar (ex: 11941713647).');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  statusEl.style.color = 'var(--text-secondary)';
  statusEl.textContent = 'Disparando mensagem direta pelo WhatsApp...';

  try {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: rawPhone,
        text: '🚀 *Pinas Prospector* — Teste de conexão direta realizado com sucesso! O sistema está pronto para prospecção ativa autônoma.'
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no envio');

    statusEl.style.color = 'var(--color-green)';
    statusEl.innerHTML = `✅ Mensagem de teste entregue com sucesso para <strong>${rawPhone}</strong>! Nenhuma aba foi aberta.`;
    loadConfig();
  } catch (err) {
    statusEl.style.color = '#F87171';
    statusEl.textContent = `❌ Falha no teste: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Enviar Teste';
  }
}

function updateWhatsAppUI(data) {
  const isConn = !!data.connected;
  const isQr = data.status === 'qr_ready';
  const isConnecting = data.status === 'connecting';

  // 1. Header Button & Dot
  const headerBtn = document.getElementById('btn-header-wa');
  const headerDot = document.getElementById('header-wa-dot');
  const headerText = document.getElementById('header-wa-text');

  if (headerDot && headerText) {
    headerDot.className = 'status-indicator-dot ' + (isConn ? 'dot-connected' : (isConnecting || isQr ? 'dot-connecting' : 'dot-disconnected'));
    headerText.textContent = isConn ? `WhatsApp Conectado (${data.user?.phone || 'Pinas'})` : (isQr ? 'Ler QR Code' : 'Conectar WhatsApp');
    if (headerBtn) {
      if (isConn) headerBtn.classList.add('connected');
      else headerBtn.classList.remove('connected');
    }
  }

  // 2. Sidebar Pill
  const sidebarPill = document.getElementById('sidebar-wa-pill');
  if (sidebarPill) {
    sidebarPill.className = 'sidebar-status-pill ' + (isConn ? 'connected' : 'disconnected');
    sidebarPill.textContent = isConn ? 'On' : 'Off';
  }

  // 3. Cadence Banner
  const cadBanner = document.getElementById('cadence-wa-banner');
  const cadDot = document.getElementById('cadence-wa-dot');
  const cadText = document.getElementById('cadence-wa-text');
  const cadBtn = document.getElementById('btn-cadence-connect-wa');

  if (cadBanner && cadDot && cadText) {
    cadBanner.className = 'cadence-wa-banner ' + (isConn ? 'connected' : 'disconnected');
    cadDot.className = 'status-indicator-dot ' + (isConn ? 'dot-connected' : 'dot-disconnected');
    if (isConn) {
      cadText.innerHTML = `🟢 WhatsApp Conectado: <strong>${data.user?.phone || 'Pinas Studio'}</strong> (Disparo Direto Ativo)`;
      if (cadBtn) {
        cadBtn.textContent = 'Gerenciar WhatsApp';
        cadBtn.className = 'btn btn-outline btn-sm';
      }
    } else {
      cadText.textContent = '⚠️ WhatsApp Desconectado — Conecte para disparar sem abrir abas';
      if (cadBtn) {
        cadBtn.textContent = 'Conectar Aparelho';
        cadBtn.className = 'btn btn-whatsapp btn-sm';
      }
    }
  }

  // 4. Tab WhatsApp
  const tabDisc = document.getElementById('wa-tab-disconnected');
  const tabConn = document.getElementById('wa-tab-connected');
  const tabBadge = document.getElementById('tab-wa-badge-status');
  const tabQrLoading = document.getElementById('wa-tab-qr-loading');
  const tabQrImg = document.getElementById('wa-tab-qr-img');
  const tabPhone = document.getElementById('wa-tab-user-phone');
  const tabSentCount = document.getElementById('wa-tab-sent-count');

  if (tabBadge) {
    tabBadge.className = 'badge-status-pill ' + (isConn ? 'connected' : 'disconnected');
    tabBadge.textContent = isConn ? `🟢 Conectado (${data.user?.phone || ''})` : '🔴 Desconectado';
  }

  if (isConn) {
    if (tabDisc) tabDisc.style.display = 'none';
    if (tabConn) tabConn.style.display = 'block';
    if (tabPhone) tabPhone.textContent = data.user?.phone ? `+${data.user.phone}` : '+55 (11) 94171-3647';
    if (tabSentCount) tabSentCount.textContent = `${appConfig.sentToday || 0} / ${appConfig.dailyLimit || 30}`;
  } else {
    if (tabDisc) tabDisc.style.display = 'block';
    if (tabConn) tabConn.style.display = 'none';

    if (data.qrCodeDataUrl) {
      if (tabQrLoading) tabQrLoading.style.display = 'none';
      if (tabQrImg) {
        tabQrImg.src = data.qrCodeDataUrl;
        tabQrImg.style.display = 'block';
      }
    } else {
      if (tabQrLoading) tabQrLoading.style.display = 'flex';
      if (tabQrImg) tabQrImg.style.display = 'none';
    }
  }

  // 5. Modal WhatsApp Connect
  const modalQrState = document.getElementById('modal-wa-state-qr');
  const modalConnState = document.getElementById('modal-wa-state-connected');
  const modalQrLoading = document.getElementById('modal-wa-qr-loading');
  const modalQrImg = document.getElementById('modal-wa-qr-img');
  const modalPhone = document.getElementById('modal-wa-user-phone');

  if (isConn) {
    if (modalQrState) modalQrState.style.display = 'none';
    if (modalConnState) modalConnState.style.display = 'block';
    if (modalPhone) modalPhone.textContent = data.user?.phone ? `+${data.user.phone}` : '+55 (11) 94171-3647';
  } else {
    if (modalQrState) modalQrState.style.display = 'block';
    if (modalConnState) modalConnState.style.display = 'none';

    if (data.qrCodeDataUrl) {
      if (modalQrLoading) modalQrLoading.style.display = 'none';
      if (modalQrImg) {
        modalQrImg.src = data.qrCodeDataUrl;
        modalQrImg.style.display = 'block';
      }
    } else {
      if (modalQrLoading) modalQrLoading.style.display = 'flex';
      if (modalQrImg) modalQrImg.style.display = 'none';
    }
  }
}

// ==================== WHATSAPP MODAL ====================
function initModals() {
  const modalWa = document.getElementById('modal-whatsapp');
  const btnCloseWa = document.getElementById('btn-close-wa-modal');
  const btnCopyWa = document.getElementById('btn-copy-wa-message');
  const btnConfirmWa = document.getElementById('btn-confirm-wa-send');
  const btnOpenWaWebManual = document.getElementById('btn-open-wa-web-manual');
  const templateSelect = document.getElementById('modal-wa-template-select');
  const msgPreview = document.getElementById('modal-wa-message-preview');

  if (btnCloseWa) btnCloseWa.addEventListener('click', () => modalWa.style.display = 'none');
  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      if (currentActiveLead) {
        msgPreview.value = buildPersonalizedMessage(currentActiveLead, templateSelect.value);
      }
    });
  }

  if (btnCopyWa) {
    btnCopyWa.addEventListener('click', () => {
      navigator.clipboard.writeText(msgPreview.value);
      alert('Mensagem copiada para a área de transferência!');
    });
  }

  // Disparo direto pelo WhatsApp (Sem abrir abas)
  if (btnConfirmWa) {
    btnConfirmWa.addEventListener('click', async () => {
      if (!currentActiveLead) return;
      const text = msgPreview.value;
      const cleanPhone = currentActiveLead.cleanPhone;

      if (!cleanPhone || cleanPhone.length < 10) {
        alert('Telefone do lead inválido ou incompleto.');
        return;
      }

      // Validar se o WhatsApp está conectado
      if (!currentWaStatus.connected) {
        alert('⚠️ O seu WhatsApp ainda não está conectado no Prospector.\n\nEscaneie o QR Code para conectar e disparar diretamente pelo sistema!');
        openWhatsAppConnectModal();
        return;
      }

      btnConfirmWa.disabled = true;
      btnConfirmWa.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block;"></span> Enviando...';

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: currentActiveLead.id,
            phone: cleanPhone,
            text
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro no envio');
        }

        currentActiveLead.status = 'contatado';
        if (data.sentToday !== undefined) {
          appConfig.sentToday = data.sentToday;
        }
        updateSafetyWidget();
        renderCadenceQueue();
        renderLeadsTable(allLeads);

        modalWa.style.display = 'none';
        showSuccessModal({
          title: 'Mensagem Enviada!',
          message: `Mensagem enviada com sucesso para "${currentActiveLead.name}" direto pelo WhatsApp!`,
          icon: '🚀'
        });
      } catch (err) {
        console.error('Erro no envio direto:', err);
        alert(`Erro ao enviar mensagem: ${err.message}`);
      } finally {
        btnConfirmWa.disabled = false;
        btnConfirmWa.innerHTML = '<span class="btn-icon">🚀</span> Disparar Direto pelo WhatsApp';
      }
    });
  }

  // Fallback: abrir manualmente no WhatsApp Web
  if (btnOpenWaWebManual) {
    btnOpenWaWebManual.addEventListener('click', async () => {
      if (!currentActiveLead) return;
      const text = msgPreview.value;
      const cleanPhone = currentActiveLead.cleanPhone;

      try {
        await fetch(`/api/leads/${currentActiveLead.id}/contacted`, { method: 'POST' });
        loadConfig();
        loadLeads();
      } catch (err) {}

      const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
      modalWa.style.display = 'none';
    });
  }

  // Modal Novo Lead Manual
  const modalLead = document.getElementById('modal-lead');
  const btnOpenLead = document.getElementById('btn-open-modal-lead');
  const btnCloseLead = document.getElementById('btn-close-lead-modal');
  const btnCancelLead = document.getElementById('btn-cancel-lead');
  const formNewLead = document.getElementById('form-new-lead');

  if (btnOpenLead) btnOpenLead.addEventListener('click', () => modalLead.style.display = 'flex');
  if (btnCloseLead) btnCloseLead.addEventListener('click', () => modalLead.style.display = 'none');
  if (btnCancelLead) btnCancelLead.addEventListener('click', () => modalLead.style.display = 'none');

  if (formNewLead) {
    formNewLead.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawPhone = document.getElementById('manual-phone').value;
      const cleanPhone = rawPhone.replace(/\D/g, '');

      const payload = {
        name: document.getElementById('manual-name').value.trim(),
        niche: document.getElementById('manual-niche').value.trim() || 'Geral',
        phone: rawPhone || 'Não listado',
        cleanPhone: cleanPhone.startsWith('55') ? cleanPhone : (cleanPhone ? '55' + cleanPhone : ''),
        hasPhone: !!rawPhone,
        hasMobile: rawPhone.includes('9') || cleanPhone.length === 11,
        website: document.getElementById('manual-website').value.trim(),
        hasWebsite: !!document.getElementById('manual-website').value.trim(),
        neighborhood: document.getElementById('manual-neighborhood').value.trim() || 'São Paulo',
        notes: document.getElementById('manual-notes').value.trim()
      };

      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      modalLead.style.display = 'none';
      formNewLead.reset();
      loadLeads();
      showSuccessModal({
        title: 'Lead Cadastrado!',
        message: `O lead "${payload.name}" foi salvo com sucesso na sua esteira de prospecção.`,
        icon: '📋'
      });
    });
  }
}

function generateCleanWhatsAppLink(lead) {
  if (!lead) return 'https://wa.me/5511999999999';
  let raw = String(lead.cleanPhone || lead.phone || '').replace(/\D/g, '');
  if (!raw) return 'https://wa.me/5511999999999?text=Ol%C3%A1!%20Vi%20no%20Google%20e%20gostaria%20de%20informa%C3%A7%C3%B5es';
  if (raw.length === 10 || raw.length === 11) {
    raw = '55' + raw;
  }
  const cleanName = (lead.name || '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\b(LTDA|ME|EPP|S\/A|EIRELI)\b/gi, '')
    .trim();
  const defaultMsg = encodeURIComponent(`Olá! Vi no Google e gostaria de informações sobre ${cleanName || 'os serviços'}.`);
  return `https://wa.me/${raw}?text=${defaultMsg}`;
}

function copyLeadWaLink() {
  if (!currentActiveLead) return;
  const link = generateCleanWhatsAppLink(currentActiveLead);
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link do WhatsApp copiado para a área de transferência!', 'success');
  }).catch(() => {
    prompt('Copie o link do WhatsApp abaixo:', link);
  });
}

function getRecommendedTemplateId(lead) {
  if (!lead.hasWebsite) return 'sem-site-dor';
  const niche = (lead.niche || '').toLowerCase();
  const name = (lead.name || '').toLowerCase();
  if (niche.includes('vet') || name.includes('vet') || niche.includes('pet') || name.includes('pet')) {
    return 'veterinaria-dor';
  }
  if (niche.includes('roup') || niche.includes('moda') || name.includes('moda') || name.includes('boutique') || name.includes('calcado')) {
    return 'roupas-moda-dor';
  }
  return 'com-site-analise';
}

function switchModalMode(mode) {
  currentModalMode = mode;
  const btnStages = document.getElementById('btn-mode-stages');
  const btnClassic = document.getElementById('btn-mode-classic');
  const containerStages = document.getElementById('modal-mode-stages-container');
  const containerClassic = document.getElementById('modal-mode-classic-container');
  const btnConfirmWa = document.getElementById('btn-confirm-wa-send');
  const btnCopyWa = document.getElementById('btn-copy-wa-message');

  if (mode === 'stages') {
    if (btnStages) btnStages.classList.add('active');
    if (btnClassic) btnClassic.classList.remove('active');
    if (containerStages) containerStages.style.display = 'block';
    if (containerClassic) containerClassic.style.display = 'none';
    if (btnConfirmWa) btnConfirmWa.style.display = 'none';
    if (btnCopyWa) btnCopyWa.style.display = 'none';
  } else {
    if (btnStages) btnStages.classList.remove('active');
    if (btnClassic) btnClassic.classList.add('active');
    if (containerStages) containerStages.style.display = 'none';
    if (containerClassic) containerClassic.style.display = 'block';
    if (btnConfirmWa) btnConfirmWa.style.display = 'inline-flex';
    if (btnCopyWa) btnCopyWa.style.display = 'inline-flex';
  }
}

function formatStageText(lead, stageNumber, withSite) {
  if (!stepTemplatesData || !stepTemplatesData.stages) return '';
  const stageObj = stepTemplatesData.stages.find(s => s.number === stageNumber);
  if (!stageObj) return '';

  const rawText = withSite ? stageObj.templates.comSite : stageObj.templates.semSite;
  let cleanName = (lead.name || '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\b(LTDA|ME|EPP|S\/A|EIRELI)\b/gi, '')
    .trim();

  const waLink = generateCleanWhatsAppLink(lead);

  let text = rawText;
  text = text.replace(/{nome}/g, cleanName || 'empresa');
  text = text.replace(/{nicho}/g, lead.niche || 'seu segmento');
  text = text.replace(/{bairro}/g, lead.neighborhood || 'sua região');
  text = text.replace(/{regiao}/g, lead.neighborhood || lead.city || 'São Paulo - SP');
  text = text.replace(/{cidade}/g, lead.city || 'São Paulo');
  text = text.replace(/{link_whatsapp}/g, waLink);
  text = text.replace(/{link_whatsapp_corrigido}/g, waLink);
  text = text.replace(/{telefone}/g, lead.phone || '');
  text = text.replace(/{site}/g, lead.website || '');
  return text;
}

function renderStagesCards(lead) {
  const wrapper = document.getElementById('stages-cards-wrapper');
  if (!wrapper || !stepTemplatesData || !stepTemplatesData.stages) return;

  const currentStage = lead.stage || 1;
  const withSite = currentLeadHasWebsitePreview;

  wrapper.innerHTML = stepTemplatesData.stages.map(st => {
    const isCurrent = st.number === currentStage;
    const isSent = lead.stageHistory && lead.stageHistory.some(h => h.stage === st.number);
    const formattedText = formatStageText(lead, st.number, withSite);

    let statusBadge = '';
    if (isSent) {
      statusBadge = '<span class="stage-badge-status badge-sent">✅ Enviada</span>';
    } else if (isCurrent) {
      statusBadge = '<span class="stage-badge-status badge-pending">👉 Próxima etapa</span>';
    }

    return `
      <div class="stage-card ${isCurrent ? 'stage-current' : ''} ${isSent ? 'stage-sent' : ''}" id="stage-card-${st.number}">
        <div class="stage-card-header">
          <div class="stage-title-wrap">
            <span class="stage-dot" style="background-color: ${st.dotColor || '#3B82F6'};"></span>
            <span class="stage-name">${st.name}</span>
            <span class="stage-goal">${st.goal}</span>
            ${statusBadge}
          </div>
          <div class="stage-actions-group">
            <button type="button" class="btn-stage-tool" onclick="copyStageText(${st.number})" title="Copiar texto desta etapa">
              📋 Copiar
            </button>
            <button type="button" class="btn-stage-tool btn-send-wa" onclick="sendLeadStage(${st.number})" title="Disparar esta etapa no WhatsApp">
              💬 Enviar Etapa
            </button>
          </div>
        </div>
        <textarea class="stage-textarea" id="stage-textarea-${st.number}" rows="${st.number === 4 ? 6 : (st.number === 3 ? 3 : 2)}">${formattedText}</textarea>
      </div>
    `;
  }).join('');

  // Atualizar badge no header do modal
  const badgeEl = document.getElementById('modal-wa-lead-stage-badge');
  if (badgeEl) {
    const stageNames = ['', 'Abertura', 'Apresentação', 'Diagnóstico', 'Proposta de Valor', 'Fechamento'];
    badgeEl.textContent = `Etapa Atual: ${currentStage}. ${stageNames[currentStage] || 'Concluído'}`;
  }

  // Atualizar texto do botão do topo
  const btnTopSend = document.getElementById('btn-send-current-stage');
  if (btnTopSend) {
    btnTopSend.innerHTML = `<span>💬 Enviar Etapa ${currentStage} no WhatsApp</span>`;
  }
}

async function sendLeadStage(stageNum) {
  if (!currentActiveLead) return;

  const textarea = document.getElementById(`stage-textarea-${stageNum}`);
  const text = textarea ? textarea.value : formatStageText(currentActiveLead, stageNum, currentLeadHasWebsitePreview);

  if (!text) {
    alert('Texto da etapa está vazio.');
    return;
  }

  const cleanPhone = currentActiveLead.cleanPhone;
  if (!cleanPhone || cleanPhone.length < 10) {
    alert('Telefone do lead inválido ou incompleto.');
    return;
  }

  if (!currentWaStatus.connected) {
    alert('⚠️ O seu WhatsApp ainda não está conectado no Prospector.\n\nEscaneie o QR Code na aba WhatsApp Direto para disparar!');
    openWhatsAppConnectModal();
    return;
  }

  const btn = window.event?.currentTarget;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
  }

  try {
    const res = await fetch(`/api/leads/${currentActiveLead.id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: stageNum,
        text,
        sendNow: true
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao disparar etapa');
    }

    if ((currentActiveLead.stage || 1) <= stageNum && stageNum < 5) {
      currentActiveLead.stage = stageNum + 1;
    }
    currentActiveLead.stageHistory = data.lead.stageHistory;
    currentActiveLead.status = data.lead.status;

    if (data.sentToday !== undefined) {
      appConfig.sentToday = data.sentToday;
    }
    updateSafetyWidget();
    renderCadenceQueue();
    renderLeadsTable(allLeads);
    renderStagesCards(currentActiveLead);

    showSuccessModal({
      title: `Etapa ${stageNum} Enviada!`,
      message: `Mensagem da Etapa ${stageNum} enviada com sucesso para "${currentActiveLead.name}" direto pelo WhatsApp!`,
      icon: '🚀'
    });
  } catch (err) {
    console.error('Erro ao enviar etapa:', err);
    alert(`Erro no envio: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💬 Enviar Etapa';
    }
  }
}

async function sendCurrentLeadStage() {
  if (!currentActiveLead) return;
  const currentStage = currentActiveLead.stage || 1;
  await sendLeadStage(currentStage);
}

function copyStageText(stageNum) {
  const textarea = document.getElementById(`stage-textarea-${stageNum}`);
  if (textarea) {
    navigator.clipboard.writeText(textarea.value);
    showToastNotification(`Texto da Etapa ${stageNum} copiado!`);
  }
}

async function resetCurrentLeadStage() {
  if (!currentActiveLead) return;
  if (!confirm(`Deseja reiniciar o fluxo da "${currentActiveLead.name}" voltando para a Etapa 1 (Abertura)?`)) return;

  currentActiveLead.stage = 1;
  currentActiveLead.stageHistory = [];

  try {
    await fetch(`/api/leads/${currentActiveLead.id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 1 })
    });
  } catch (e) {}

  renderStagesCards(currentActiveLead);
  showToastNotification('Fluxo reiniciado para a Etapa 1.');
}

function openWhatsAppModal(leadId) {
  const lead = allLeads.find(l => l.id === leadId);
  if (!lead) return;
  currentActiveLead = lead;
  currentLeadHasWebsitePreview = !!lead.hasWebsite;

  document.getElementById('modal-wa-lead-name').textContent = lead.name;
  document.getElementById('modal-wa-lead-phone').textContent = lead.phone || 'Sem telefone';
  document.getElementById('modal-wa-lead-bairro').textContent = lead.neighborhood ? `📍 ${lead.neighborhood}` : '📍 SP';

  const nicheEl = document.getElementById('modal-wa-lead-niche');
  if (nicheEl) {
    nicheEl.textContent = lead.niche || 'Geral';
  }

  // Toggle switch do site pronto
  const toggleSite = document.getElementById('toggle-has-website-preview');
  if (toggleSite) {
    toggleSite.checked = currentLeadHasWebsitePreview;
    toggleSite.onchange = () => {
      currentLeadHasWebsitePreview = toggleSite.checked;
      renderStagesCards(lead);
    };
  }

  // Preencher modo clássico
  const templateSelect = document.getElementById('modal-wa-template-select');
  if (templateSelect) {
    templateSelect.value = getRecommendedTemplateId(lead);
    document.getElementById('modal-wa-message-preview').value = buildPersonalizedMessage(lead, templateSelect.value);
  }

  // Renderizar os 5 cards
  renderStagesCards(lead);

  // Iniciar na aba Por Etapas
  switchModalMode('stages');

  document.getElementById('modal-whatsapp').style.display = 'flex';
}

function buildPersonalizedMessage(lead, templateId) {
  if (templateId === 'auto' || !templateId) {
    templateId = getRecommendedTemplateId(lead);
  }
  const template = templates.find(t => t.id === templateId) || templates[0];
  if (!template) return '';

  let cleanName = (lead.name || '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\b(LTDA|ME|EPP|S\/A|EIRELI)\b/gi, '')
    .trim();

  const waLink = generateCleanWhatsAppLink(lead);

  let text = template.text;
  text = text.replace(/{nome}/g, cleanName || 'empresa');
  text = text.replace(/{bairro}/g, lead.neighborhood || 'sua região');
  text = text.replace(/{regiao}/g, lead.neighborhood || lead.city || 'São Paulo - SP');
  text = text.replace(/{cidade}/g, lead.city || 'São Paulo');
  text = text.replace(/{nicho}/g, lead.niche || 'seu segmento');
  text = text.replace(/{link_whatsapp}/g, waLink);
  text = text.replace(/{link_whatsapp_corrigido}/g, waLink);
  text = text.replace(/{telefone}/g, lead.phone || '');
  text = text.replace(/{site}/g, lead.website || '');

  return text;
}

// ==================== SUB-ABAS E EDITOR DE ROTEIROS ====================
function switchScriptsSubTab(tab) {
  const btnStages = document.getElementById('btn-scripts-tab-stages');
  const btnClassic = document.getElementById('btn-scripts-tab-classic');
  const secStages = document.getElementById('scripts-stages-section');
  const secClassic = document.getElementById('scripts-classic-section');

  if (tab === 'stages') {
    if (btnStages) btnStages.classList.add('active');
    if (btnClassic) btnClassic.classList.remove('active');
    if (secStages) secStages.style.display = 'block';
    if (secClassic) secClassic.style.display = 'none';
  } else {
    if (btnStages) btnStages.classList.remove('active');
    if (btnClassic) btnClassic.classList.add('active');
    if (secStages) secStages.style.display = 'none';
    if (secClassic) secClassic.style.display = 'block';
  }
}

function renderScriptsStagesEditor() {
  const container = document.getElementById('scripts-stages-container');
  if (!container || !stepTemplatesData || !stepTemplatesData.stages) return;

  container.innerHTML = stepTemplatesData.stages.map(st => `
    <div class="script-card" style="border-left: 3px solid ${st.dotColor || '#3B82F6'};">
      <div class="script-card-header">
        <h4 class="script-card-title">${st.name} — ${st.goal}</h4>
        <span class="script-card-target">Cadência Conversacional</span>
      </div>
      <div style="margin-bottom: 0.6rem;">
        <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Texto (Comércio SEM site):</label>
        <textarea class="script-textarea" id="stage-edit-semsite-${st.number}" rows="3" style="margin-top: 0.25rem;">${st.templates.semSite}</textarea>
      </div>
      <div>
        <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Texto (Comércio COM site):</label>
        <textarea class="script-textarea" id="stage-edit-comsite-${st.number}" rows="3" style="margin-top: 0.25rem;">${st.templates.comSite}</textarea>
      </div>
    </div>
  `).join('');
}

function renderScriptsEditor() {
  const container = document.getElementById('scripts-container');
  if (!container) return;

  container.innerHTML = templates.map((t, idx) => `
    <div class="script-card">
      <div class="script-card-header">
        <h4 class="script-card-title">${t.name}</h4>
        <span class="script-card-target">Alvo: ${t.target}</span>
      </div>
      <textarea class="script-textarea" id="template-text-${idx}" rows="9">${t.text}</textarea>
    </div>
  `).join('');

  const btnSave = document.getElementById('btn-save-templates');
  if (btnSave) {
    btnSave.onclick = async () => {
      // 1. Salvar templates clássicos
      templates.forEach((t, idx) => {
        const el = document.getElementById(`template-text-${idx}`);
        if (el) t.text = el.value;
      });

      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates)
      });

      // 2. Salvar etapas se estiverem carregadas
      if (stepTemplatesData && stepTemplatesData.stages) {
        stepTemplatesData.stages.forEach(st => {
          const semSiteEl = document.getElementById(`stage-edit-semsite-${st.number}`);
          const comSiteEl = document.getElementById(`stage-edit-comsite-${st.number}`);
          if (semSiteEl) st.templates.semSite = semSiteEl.value;
          if (comSiteEl) st.templates.comSite = comSiteEl.value;
        });

        await fetch('/api/step-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stepTemplatesData)
        });
      }

      showSuccessModal({
        title: 'Roteiros Salvos!',
        message: 'Todos os modelos de abordagem (clássicos e por etapas) foram gravados com sucesso e já estão ativos.',
        icon: '✍️'
      });
    };
  }

  // Settings Save
  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) {
    btnSaveSettings.onclick = async () => {
      const chains = document.getElementById('settings-excluded-chains').value.split('\n').map(s => s.trim()).filter(Boolean);
      const keywords = document.getElementById('settings-excluded-keywords').value.split('\n').map(s => s.trim()).filter(Boolean);
      const limit = parseInt(document.getElementById('settings-daily-limit').value, 10) || 30;

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excludedChains: chains,
          excludedKeywords: keywords,
          dailyLimit: limit
        })
      });
      showSuccessModal({
        title: 'Configurações Salvas!',
        message: 'O limite diário de mensagens e os filtros de exclusão foram atualizados com sucesso.',
        icon: '⚙️'
      });
      loadConfig();
    };
  }
}

// Helper debounce
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ============================================================================
// ==================== SELETOR DE LOCALIZAÇÃO EM CASCATA =====================
// ============================================================================
const BRAZIL_LOCATIONS = {
  SP: {
    name: 'São Paulo (SP)',
    regions: {
      capital: {
        name: '🏙️ SP Capital (Bairros & Distritos)',
        cities: [
          { name: 'Santo Amaro (Distrito Sul)', query: 'Santo Amaro, São Paulo - SP' },
          { name: 'Moema (Zona Sul)', query: 'Moema, São Paulo - SP' },
          { name: 'Vila Mariana (Zona Sul)', query: 'Vila Mariana, São Paulo - SP' },
          { name: 'Pinheiros (Zona Oeste)', query: 'Pinheiros, São Paulo - SP' },
          { name: 'Itaim Bibi (Zona Sul)', query: 'Itaim Bibi, São Paulo - SP' },
          { name: 'Morumbi (Zona Sul)', query: 'Morumbi, São Paulo - SP' },
          { name: 'Brás (Polo de Confecção / Atacado)', query: 'Brás, São Paulo - SP' },
          { name: 'Bom Retiro (Polo de Moda Feminina)', query: 'Bom Retiro, São Paulo - SP' },
          { name: 'Tatuapé (Zona Leste)', query: 'Tatuapé, São Paulo - SP' },
          { name: 'Santana (Zona Norte)', query: 'Santana, São Paulo - SP' },
          { name: 'Perdizes (Zona Oeste)', query: 'Perdizes, São Paulo - SP' },
          { name: 'Campo Belo (Zona Sul)', query: 'Campo Belo, São Paulo - SP' },
          { name: 'Brooklin (Zona Sul)', query: 'Brooklin, São Paulo - SP' },
          { name: 'Jardins / Cerqueira César', query: 'Jardins, São Paulo - SP' },
          { name: 'Lapa (Zona Oeste)', query: 'Lapa, São Paulo - SP' },
          { name: 'Ipiranga (Zona Sul)', query: 'Ipiranga, São Paulo - SP' },
          { name: 'Mooca (Zona Leste)', query: 'Mooca, São Paulo - SP' },
          { name: 'Bela Vista / Paulista', query: 'Bela Vista, São Paulo - SP' },
          { name: 'Saúde / Jabaquara', query: 'Saúde, São Paulo - SP' },
          { name: 'Interlagos / Socorro', query: 'Interlagos, São Paulo - SP' }
        ]
      },
      metropolitana: {
        name: '🌆 Grande SP / Região Metropolitana',
        cities: [
          { name: 'Embu-Guaçu (Município Grande SP)', query: 'Embu-Guaçu, SP' },
          { name: 'Itapecerica da Serra', query: 'Itapecerica da Serra, SP' },
          { name: 'Taboão da Serra', query: 'Taboão da Serra, SP' },
          { name: 'Embu das Artes', query: 'Embu das Artes, SP' },
          { name: 'Osasco', query: 'Osasco, SP' },
          { name: 'Barueri / Alphaville', query: 'Alphaville, Barueri - SP' },
          { name: 'Santana de Parnaíba', query: 'Santana de Parnaíba, SP' },
          { name: 'São Bernardo do Campo (ABC)', query: 'São Bernardo do Campo, SP' },
          { name: 'Santo André (ABC)', query: 'Santo André, SP' },
          { name: 'São Caetano do Sul (ABC)', query: 'São Caetano do Sul, SP' },
          { name: 'Diadema', query: 'Diadema, SP' },
          { name: 'Guarulhos', query: 'Guarulhos, SP' },
          { name: 'Cotia / Granja Viana', query: 'Granja Viana, Cotia - SP' },
          { name: 'Mogi das Cruzes', query: 'Mogi das Cruzes, SP' },
          { name: 'Mauá', query: 'Mauá, SP' }
        ]
      },
      interior: {
        name: '🛣️ Interior & Litoral de SP',
        cities: [
          { name: 'Campinas', query: 'Campinas, SP' },
          { name: 'Sorocaba', query: 'Sorocaba, SP' },
          { name: 'Ribeirão Preto', query: 'Ribeirão Preto, SP' },
          { name: 'São José dos Campos', query: 'São José dos Campos, SP' },
          { name: 'Santos (Litoral)', query: 'Santos, SP' },
          { name: 'Jundiaí', query: 'Jundiaí, SP' },
          { name: 'Piracicaba', query: 'Piracicaba, SP' },
          { name: 'Bauru', query: 'Bauru, SP' },
          { name: 'Praia Grande (Litoral)', query: 'Praia Grande, SP' },
          { name: 'São José do Rio Preto', query: 'São José do Rio Preto, SP' },
          { name: 'Taubaté', query: 'Taubaté, SP' },
          { name: 'Indaiatuba', query: 'Indaiatuba, SP' }
        ]
      }
    }
  },
  RJ: {
    name: 'Rio de Janeiro (RJ)',
    regions: {
      capital: {
        name: '🏙️ Rio de Janeiro Capital (Bairros)',
        cities: [
          { name: 'Barra da Tijuca', query: 'Barra da Tijuca, Rio de Janeiro - RJ' },
          { name: 'Copacabana', query: 'Copacabana, Rio de Janeiro - RJ' },
          { name: 'Ipanema / Leblon', query: 'Ipanema, Rio de Janeiro - RJ' },
          { name: 'Botafogo / Flamengo', query: 'Botafogo, Rio de Janeiro - RJ' },
          { name: 'Tijuca', query: 'Tijuca, Rio de Janeiro - RJ' },
          { name: 'Recreio dos Bandeirantes', query: 'Recreio, Rio de Janeiro - RJ' },
          { name: 'Centro do Rio', query: 'Centro, Rio de Janeiro - RJ' }
        ]
      },
      regiao: {
        name: '🌆 Niterói & Baixada / Lagos',
        cities: [
          { name: 'Niterói', query: 'Niterói, RJ' },
          { name: 'Duque de Caxias', query: 'Duque de Caxias, RJ' },
          { name: 'Nova Iguaçu', query: 'Nova Iguaçu, RJ' },
          { name: 'Petrópolis (Região Serrana)', query: 'Petrópolis, RJ' },
          { name: 'Cabo Frio / Búzios', query: 'Cabo Frio, RJ' }
        ]
      }
    }
  },
  MG: {
    name: 'Minas Gerais (MG)',
    regions: {
      capital: {
        name: '🏙️ Belo Horizonte & Grande BH',
        cities: [
          { name: 'Savassi / Lourdes (BH)', query: 'Savassi, Belo Horizonte - MG' },
          { name: 'Pampulha (BH)', query: 'Pampulha, Belo Horizonte - MG' },
          { name: 'Buritis / Belvedere (BH)', query: 'Belvedere, Belo Horizonte - MG' },
          { name: 'Contagem', query: 'Contagem, MG' },
          { name: 'Betim', query: 'Betim, MG' }
        ]
      },
      interior: {
        name: '🛣️ Polos de Minas Gerais',
        cities: [
          { name: 'Uberlândia (Triângulo)', query: 'Uberlândia, MG' },
          { name: 'Juiz de Fora', query: 'Juiz de Fora, MG' },
          { name: 'Montes Claros', query: 'Montes Claros, MG' },
          { name: 'Uberaba', query: 'Uberaba, MG' }
        ]
      }
    }
  },
  PR: {
    name: 'Paraná (PR)',
    regions: {
      todos: {
        name: '📍 Paraná (Curitiba & Polos)',
        cities: [
          { name: 'Batel / Bigorrilho (Curitiba)', query: 'Batel, Curitiba - PR' },
          { name: 'Centro / Água Verde (Curitiba)', query: 'Água Verde, Curitiba - PR' },
          { name: 'Londrina', query: 'Londrina, PR' },
          { name: 'Maringá', query: 'Maringá, PR' },
          { name: 'Cascavel', query: 'Cascavel, PR' },
          { name: 'São José dos Pinhais', query: 'São José dos Pinhais, PR' }
        ]
      }
    }
  },
  SC: {
    name: 'Santa Catarina (SC)',
    regions: {
      todos: {
        name: '📍 Santa Catarina',
        cities: [
          { name: 'Florianópolis', query: 'Florianópolis, SC' },
          { name: 'Balneário Camboriú', query: 'Balneário Camboriú, SC' },
          { name: 'Joinville', query: 'Joinville, SC' },
          { name: 'Blumenau', query: 'Blumenau, SC' },
          { name: 'Itajaí', query: 'Itajaí, SC' }
        ]
      }
    }
  },
  RS: {
    name: 'Rio Grande do Sul (RS)',
    regions: {
      todos: {
        name: '📍 Rio Grande do Sul',
        cities: [
          { name: 'Porto Alegre (Moinhos de Vento)', query: 'Moinhos de Vento, Porto Alegre - RS' },
          { name: 'Porto Alegre (Geral)', query: 'Porto Alegre, RS' },
          { name: 'Caxias do Sul (Serra)', query: 'Caxias do Sul, RS' },
          { name: 'Canoas', query: 'Canoas, RS' }
        ]
      }
    }
  },
  BA: {
    name: 'Bahia (BA)',
    regions: {
      todos: {
        name: '📍 Bahia',
        cities: [
          { name: 'Pituba / Itaigara (Salvador)', query: 'Pituba, Salvador - BA' },
          { name: 'Barra / Ondina (Salvador)', query: 'Barra, Salvador - BA' },
          { name: 'Salvador (Centro / Orla)', query: 'Salvador, BA' },
          { name: 'Feira de Santana', query: 'Feira de Santana, BA' }
        ]
      }
    }
  }
};

function initLocationSelector() {
  const selectState = document.getElementById('select-loc-state');
  const selectRegion = document.getElementById('select-loc-region');
  const selectCity = document.getElementById('select-loc-city');
  const inputLocation = document.getElementById('input-location');

  if (!selectState || !selectRegion || !selectCity || !inputLocation) return;

  function updateRegions(stateKey) {
    const stateData = BRAZIL_LOCATIONS[stateKey] || BRAZIL_LOCATIONS.SP;
    const regionKeys = Object.keys(stateData.regions);

    selectRegion.innerHTML = regionKeys.map(rKey => `
      <option value="${rKey}">${stateData.regions[rKey].name}</option>
    `).join('');

    updateCities(stateKey, regionKeys[0]);
  }

  function updateCities(stateKey, regionKey) {
    const stateData = BRAZIL_LOCATIONS[stateKey] || BRAZIL_LOCATIONS.SP;
    const regionData = stateData.regions[regionKey] || stateData.regions[Object.keys(stateData.regions)[0]];

    selectCity.innerHTML = regionData.cities.map(c => `
      <option value="${c.query}">${c.name}</option>
    `).join('');

    // Sincroniza com o input do Google Maps
    if (regionData.cities.length > 0) {
      inputLocation.value = regionData.cities[0].query;
    }
  }

  selectState.addEventListener('change', (e) => {
    updateRegions(e.target.value);
  });

  selectRegion.addEventListener('change', (e) => {
    updateCities(selectState.value, e.target.value);
  });

  selectCity.addEventListener('change', (e) => {
    inputLocation.value = e.target.value;
  });

  // Inicializa com SP -> Capital -> Santo Amaro
  updateRegions('SP');
}

// ============================================================================
// ==================== CATÁLOGO A-Z & AUTOCOMPLETE DE NICHOS =================
// ============================================================================
const COMMERCIAL_NICHES_CATALOG = [
  // A
  { letter: 'A', query: 'advogado', title: 'Advogado / Escritório de Advocacia', icon: '⚖️', desc: 'Trabalhista, Cível, Família, Tributário', tag: 'Site + Google Ads' },
  { letter: 'A', query: 'assessoria de marketing', title: 'Assessoria de Marketing & Comercial', icon: '📈', desc: 'Consultoria de Vendas & Captação B2B', tag: 'B2B' },
  { letter: 'A', query: 'academia', title: 'Academia & Treinamento Físico', icon: '🏋️', desc: 'Musculação, Crossfit & Lutas', tag: 'Tráfego Local' },
  { letter: 'A', query: 'arquiteto', title: 'Arquiteto & Design de Interiores', icon: '📐', desc: 'Projetos Residenciais & Comerciais', tag: 'Site Premium' },
  { letter: 'A', query: 'assistencia tecnica celular', title: 'Assistência Técnica de Celular & Notebook', icon: '📱', desc: 'Troca de Tela, Reparo Rápido', tag: 'Google Search' },
  { letter: 'A', query: 'autoescola', title: 'Autoescola / CFC', icon: '🚗', desc: 'Primeira Habilitação & Aulas', tag: 'Captação Local' },
  { letter: 'A', query: 'agencia de viagens', title: 'Agência de Viagens & Turismo', icon: '✈️', desc: 'Pacotes, Excursões & Roteiros', tag: 'Site' },
  { letter: 'A', query: 'auditoria contabil', title: 'Auditoria & Perícia Contábil', icon: '🔍', desc: 'Laudos Periciais & B2B', tag: 'Corporativo' },

  // B
  { letter: 'B', query: 'boliche', title: 'Boliche & Centro de Lazer', icon: '🎳', desc: 'Pistas de Boliche, Eventos & Festas', tag: 'Google Maps' },
  { letter: 'B', query: 'buffet infantil', title: 'Buffet Infantil & Festas', icon: '🎈', desc: 'Festas Infantis, Aniversários & Pacotes', tag: 'Site + Google Ads' },
  { letter: 'B', query: 'buffet para eventos', title: 'Buffet para Casamentos & Corporativo', icon: '🍾', desc: 'Grandes Eventos & Confraternizações', tag: 'Alto Ticket' },
  { letter: 'B', query: 'barbearia', title: 'Barbearia & Barbearia Premium', icon: '💈', desc: 'Cortes, Barba & Cuidados Masculinos', tag: 'Local' },
  { letter: 'B', query: 'blindagem automotiva', title: 'Blindagem Automotiva & Vidros', icon: '🛡️', desc: 'Segurança Veicular & Manutenção', tag: 'Alto Ticket' },

  // C
  { letter: 'C', query: 'clinica veterinaria', title: 'Clínica Veterinária 24h & Pronto Socorro', icon: '🐾', desc: 'Emergência, Exames & Cirurgias', tag: 'Especialidade Pinas' },
  { letter: 'C', query: 'consultorio odontologico', title: 'Consultório Odontológico / Dentista', icon: '🦷', desc: 'Implantes, Clareamento & Ortodontia', tag: 'Site + Google Ads' },
  { letter: 'C', query: 'contabilidade', title: 'Escritório de Contabilidade & BPO', icon: '📊', desc: 'Gestão Fiscal, Folha & Abertura de Empresa', tag: 'Site + Ads' },
  { letter: 'C', query: 'consultorio veterinario', title: 'Consultório Veterinário & Especialidades', icon: '🩺', desc: 'Consultas, Vacinas & Atendimento', tag: 'Especialidade Pinas' },
  { letter: 'C', query: 'construtora', title: 'Construtora & Empreiteira de Obras', icon: '🏗️', desc: 'Construção Civil, Galpões & Reformas', tag: 'Site Institucional' },
  { letter: 'C', query: 'concessionaria', title: 'Loja de Carros & Veículos Seminovos', icon: '🚙', desc: 'Venda de Seminovos & Financiamentos', tag: 'Catálogo' },
  { letter: 'C', query: 'coworking', title: 'Espaço de Coworking & Salas de Reunião', icon: '🏢', desc: 'Salas Privativas, Endereço Fiscal', tag: 'B2B' },
  { letter: 'C', query: 'curso de idiomas', title: 'Escola de Idiomas & Treinamento', icon: '🗣️', desc: 'Inglês, Espanhol & Cursos Rápidos', tag: 'Matrículas' },
  { letter: 'C', query: 'clinica medica', title: 'Clínica Médica & Consultório Particular', icon: '🏥', desc: 'Especialidades Médicas & Exames', tag: 'Site' },

  // D
  { letter: 'D', query: 'dentista', title: 'Dentista & Clínicas Odontológicas', icon: '🦷', desc: 'Próteses, Implantes, Alinhadores', tag: 'Site + Google Ads' },
  { letter: 'D', query: 'desentupidora', title: 'Desentupidora 24h & Dedetizadora', icon: '🚰', desc: 'Urgência 24h • Altíssimo Retorno no Google', tag: 'Google Ads 24h' },
  { letter: 'D', query: 'despachante', title: 'Despachante Documentalista & Veicular', icon: '📑', desc: 'Transferência de Veículos, CNH & ANTT', tag: 'Busca Local' },
  { letter: 'D', query: 'distribuidora', title: 'Distribuidora & Atacado Local', icon: '📦', desc: 'Bebidas, Embalagens & Alimentos', tag: 'B2B' },
  { letter: 'D', query: 'decoracao de festas', title: 'Decoração de Eventos & Festas', icon: '🎨', desc: 'Cenografia & Mobiliário para Festas', tag: 'Site' },

  // E
  { letter: 'E', query: 'escritorio de advocacia', title: 'Escritório de Advocacia Especializado', icon: '⚖️', desc: 'Direito Empresarial, Trabalhista & Família', tag: 'Site + Google Ads' },
  { letter: 'E', query: 'energia solar', title: 'Energia Solar Fotovoltaica', icon: '⚡', desc: 'Instalação de Painéis Solares & Projetos', tag: 'Alto Ticket' },
  { letter: 'E', query: 'engenharia civil', title: 'Escritório de Engenharia & Projetos', icon: '🦺', desc: 'Projetos Estruturais, Laudos e AVCB', tag: 'B2B' },
  { letter: 'E', query: 'escola particular', title: 'Escola Particular & Colégio Infantil', icon: '🏫', desc: 'Berçário, Infantil & Fundamental', tag: 'Campanhas' },
  { letter: 'E', query: 'estetica automotiva', title: 'Estética Automotiva & Detailing', icon: '🚗', desc: 'Vitrificação, Polimento & PPF', tag: 'Instagram + Ads' },
  { letter: 'E', query: 'espaco de eventos', title: 'Espaço de Eventos & Salão de Festas', icon: '🎪', desc: 'Locação para Casamentos & Confraternizações', tag: 'Google Maps' },

  // F
  { letter: 'F', query: 'farmacia de manipulacao', title: 'Farmácia de Manipulação', icon: '💊', desc: 'Fórmulas Personalizadas & Suplementos', tag: 'WhatsApp' },
  { letter: 'F', query: 'fisioterapia', title: 'Clínica de Fisioterapia & RPG', icon: '🏃', desc: 'Reabilitação, Dor na Coluna & Pilates', tag: 'Site Local' },
  { letter: 'F', query: 'fotografo profissional', title: 'Fotógrafo Profissional & Estúdio', icon: '📸', desc: 'Ensaios, Casamentos & Fotografia Corporativa', tag: 'Portfólio' },
  { letter: 'F', query: 'funeraria', title: 'Assistência Funeral & Planos Familiares', icon: '🕊️', desc: 'Atendimento Funeral 24h & Jazigos', tag: 'Google 24h' },

  // G
  { letter: 'G', query: 'guincho 24h', title: 'Guincho 24h & Auto Socorro', icon: '🛞', desc: 'Reboque Imediato & Troca de Pneu', tag: 'Google Ads 24h' },
  { letter: 'G', query: 'grafica rapida', title: 'Gráfica Rápida & Comunicação Visual', icon: '🖨️', desc: 'Fachadas, Banners, Adesivos & Impressos', tag: 'B2B Local' },
  { letter: 'G', query: 'gesso e drywall', title: 'Gesso, Drywall & Forros', icon: '🧱', desc: 'Divisórias Acústicas, Sancas & Reformas', tag: 'Google Ads' },
  { letter: 'G', query: 'geriatria e cuidadores', title: 'Home Care & Cuidadores de Idosos', icon: '👵', desc: 'Assistência Domiciliar & Acompanhantes', tag: 'Site Confiança' },

  // H
  { letter: 'H', query: 'hotel fazenda', title: 'Hotel Fazenda & Pousadas', icon: '🏨', desc: 'Turismo Rural, Lazer & Finais de Semana', tag: 'Site Direto' },
  { letter: 'H', query: 'hospital veterinario', title: 'Hospital Veterinário 24 Horas', icon: '🏥', desc: 'UTI, Cirurgias Complexas & Internação', tag: 'Especialidade Pinas' },
  { letter: 'H', query: 'higienizacao de estofados', title: 'Higienização & Limpeza de Sofás', icon: '🧼', desc: 'Limpeza e Impermeabilização a Seco', tag: 'WhatsApp' },

  // I
  { letter: 'I', query: 'imobiliaria', title: 'Imobiliária & Corretora de Imóveis', icon: '🏠', desc: 'Locação, Venda & Administração de Imóveis', tag: 'Site Imóveis' },
  { letter: 'I', query: 'instalacao de ar condicionado', title: 'Instalação e Manutenção de Ar Condicionado', icon: '❄️', desc: 'Projetos Split, Limpeza & PMOC', tag: 'Google Ads' },
  { letter: 'I', query: 'impermeabilizacao', title: 'Impermeabilização de Lajes & Piscinas', icon: '💧', desc: 'Vedação contra Infiltração & Pintura Epóxi', tag: 'Alto Ticket' },

  // J
  { letter: 'J', query: 'joalheria', title: 'Joalheria & Fabricação de Alianças', icon: '💎', desc: 'Ouro, Prata & Joias Personalizadas', tag: 'Catálogo' },
  { letter: 'J', query: 'jardinagem e paisagismo', title: 'Jardinagem & Paisagismo Profissional', icon: '🌿', desc: 'Manutenção de Condomínios & Jardins', tag: 'Contratos' },

  // L
  { letter: 'L', query: 'loja de roupas femininas', title: 'Loja de Roupas Femininas (Varejo)', icon: '👗', desc: 'Moda Feminina, Vestidos & Looks', tag: 'Especialidade Pinas' },
  { letter: 'L', query: 'loja de roupas masculinas', title: 'Loja de Moda Masculina & Alfaiataria', icon: '👔', desc: 'Ternos, Camisas & Moda Casual', tag: 'Varejo' },
  { letter: 'L', query: 'locacao de equipamentos', title: 'Locação de Máquinas & Andaimes', icon: '🚜', desc: 'Equipamentos para Obra & Construção', tag: 'B2B' },
  { letter: 'L', query: 'laboratorio de analises clinicas', title: 'Laboratório de Análises Clínicas', icon: '🧪', desc: 'Exames de Sangue, Toxicológico & Coletas', tag: 'Local' },
  { letter: 'L', query: 'lavanderia profissional', title: 'Lavanderia Profissional & A Seco', icon: '🧺', desc: 'Edredons, Ternos & Enxovais', tag: 'Local' },

  // M
  { letter: 'M', query: 'moda feminina atacado', title: 'Moda Feminina Atacado / Brás / Bom Retiro', icon: '👚', desc: 'Fabricantes & Fornecedores de Roupas', tag: 'Especialidade Pinas' },
  { letter: 'M', query: 'marcenaria', title: 'Marcenaria & Móveis Planejados', icon: '🪵', desc: 'Cozinhas, Quartos & Ambientes de Alto Padrão', tag: 'Alto Ticket' },
  { letter: 'M', query: 'mecanica automotiva', title: 'Mecânica Automotiva & Auto Center', icon: '🔧', desc: 'Injeção Eletrônica, Freios, Suspensão & Motor', tag: 'Google Ads' },
  { letter: 'M', query: 'materiais de construcao', title: 'Loja de Materiais de Construção', icon: '🧱', desc: 'Cimento, Tintas, Hidráulica & Elétrica', tag: 'Local' },
  { letter: 'M', query: 'medicina do trabalho', title: 'Clínica de Medicina do Trabalho & SST', icon: '🦺', desc: 'Exames Admissionais, Periódicos & PGR', tag: 'B2B Recorrente' },

  // N
  { letter: 'N', query: 'nutricionista', title: 'Nutricionista & Consultório de Nutrição', icon: '🥗', desc: 'Nutrição Esportiva & Emagrecimento Saudável', tag: 'Site' },

  // O
  { letter: 'O', query: 'oftalmologia', title: 'Clínica Oftalmológica / Vista', icon: '👁️', desc: 'Consultas, Cirurgias Refrativas & Catarata', tag: 'Site' },
  { letter: 'O', query: 'ortopedia', title: 'Clínica de Ortopedia & Traumatologia', icon: '🦴', desc: 'Coluna, Joelho, Ombro & Fisioterapia', tag: 'Site' },
  { letter: 'O', query: 'otica', title: 'Ótica & Óculos de Grau / Sol', icon: '👓', desc: 'Armações de Marca & Lentes Digitais', tag: 'Varejo' },
  { letter: 'O', query: 'oficina mecanica', title: 'Oficina Mecânica Especializada', icon: '🛠️', desc: 'Câmbio Automático, Retífica & Revisão', tag: 'Google Ads' },

  // P
  { letter: 'P', query: 'pet shop com banho e tosa', title: 'Pet Shop com Banho e Tosa', icon: '🐶', desc: 'Estética Animal, Leva e Traz & Planos Mensais', tag: 'Local' },
  { letter: 'P', query: 'pousada', title: 'Pousada & Hotel Boutique', icon: '🛋️', desc: 'Hospedagem Charmosa & Ecoturismo', tag: 'Reservas' },
  { letter: 'P', query: 'psicologia', title: 'Clínica de Psicologia & Psicoterapia', icon: '🧠', desc: 'Terapia Presencial & Online', tag: 'Site' },
  { letter: 'P', query: 'pizzaria delivery', title: 'Pizzaria Delivery & Forno a Lenha', icon: '🍕', desc: 'Pedidos Próprios via WhatsApp sem Taxas', tag: 'Site de Pedidos' },
  { letter: 'P', query: 'podologia', title: 'Clínica de Podologia & Cuidados dos Pés', icon: '🦶', desc: 'Tratamento de Unhas, Calosidades & Pés Diabéticos', tag: 'Local' },
  { letter: 'P', query: 'portas de enrolar automaticas', title: 'Portas de Enrolar Automáticas', icon: '🚪', desc: 'Instalação Comercial & Fechamento de Galpões', tag: 'Alto Ticket' },

  // R
  { letter: 'R', query: 'restaurante', title: 'Restaurante & Gastronomia', icon: '🍽️', desc: 'Cardápio Digital, Reservas & Google Meu Negócio', tag: 'Local' },
  { letter: 'R', query: 'reformas residenciais', title: 'Empresa de Reformas & Pintura', icon: '🔨', desc: 'Reformas Completas, Pisos & Alvenaria', tag: 'Alto Ticket' },
  { letter: 'R', query: 'rastreamento veicular', title: 'Rastreamento Veicular & Frotas', icon: '📡', desc: 'Monitoramento GPS & Segurança Veicular', tag: 'Mensalidade' },

  // S
  { letter: 'S', query: 'seguros e corretora', title: 'Corretora de Seguros (Auto, Vida, Casa)', icon: '🛡️', desc: 'Cotações de Seguros & Benefícios', tag: 'Google Ads' },
  { letter: 'S', query: 'seguranca eletronica', title: 'Segurança Eletrônica & CFTV', icon: '📹', desc: 'Câmeras de Segurança, Alarmes & Portaria', tag: 'Contratos' },
  { letter: 'S', query: 'salao de beleza', title: 'Salão de Beleza & Mega Hair', icon: '💇', desc: 'Mechas, Coloração & Procedimentos Capilares', tag: 'Instagram + Site' },
  { letter: 'S', query: 'serralheria', title: 'Serralheria & Estruturas Metálicas', icon: '⚙️', desc: 'Portões Automáticos, Grades & Mezaninos', tag: 'Local' },

  // T
  { letter: 'T', query: 'tatuagem e piercing', title: 'Estúdio de Tatuagem & Piercing', icon: '🎨', desc: 'Tatuadores Especializados & Portfólio', tag: 'Instagram' },
  { letter: 'T', query: 'terapia ocupacional', title: 'Clínica de Desenvolvimento Infantil (ABA)', icon: '🧸', desc: 'Autismo, Fonoaudiologia & Terapia Infantil', tag: 'Site Confiança' },
  { letter: 'T', query: 'toldos e coberturas', title: 'Toldos, Coberturas & Policarbonato', icon: '⛺', desc: 'Proteção Solar para Comércios e Residências', tag: 'Orçamentos' },

  // U
  { letter: 'U', query: 'ultrassom veterinario', title: 'Ultrassom & Raio-X Veterinário', icon: '🩺', desc: 'Exames de Imagem Volantes & Diagnóstico Pet', tag: 'Especialidade Pinas' },
  { letter: 'U', query: 'uniformes profissionais', title: 'Confecção de Uniformes Profissionais', icon: '👕', desc: 'Uniformes Corporativos & Bordados Personalizados', tag: 'B2B' },

  // V
  { letter: 'V', query: 'veterinario 24h', title: 'Veterinário 24 Horas & Pronto Socorro', icon: '🐾', desc: 'Emergência Pet Noturna & Cirurgias', tag: 'Especialidade Pinas' },
  { letter: 'V', query: 'vidracaria', title: 'Vidraçaria, Box Blindex & Espelhos', icon: '🪟', desc: 'Vidros Temperados, Fechamento de Varanda', tag: 'Orçamentos' },
  { letter: 'V', query: 'vistoria veicular', title: 'Vistoria Veicular Credenciada (ECV)', icon: '🚗', desc: 'Laudos de Transferência & Cautelar', tag: 'Local' },
  { letter: 'V', query: 'vigilancia e seguranca privada', title: 'Empresa de Vigilância & Segurança Patrimonial', icon: '👮', desc: 'Segurança Armada, Desarmada & Eventos', tag: 'Contratos' }
];

function initNicheAutocomplete() {
  const inputNiche = document.getElementById('input-niche');
  const btnToggle = document.getElementById('btn-toggle-niche-dropdown');
  const dropdown = document.getElementById('niche-autocomplete-dropdown');
  const alphabetBar = document.getElementById('niche-alphabet-bar');
  const listEl = document.getElementById('niche-suggestions-list');
  const countInfo = document.getElementById('niche-count-info');

  if (!inputNiche || !dropdown || !listEl) return;

  const ALPHABET_LETTERS = ['Todos', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V'];
  let currentLetter = 'Todos';
  let currentFilteredList = [];
  let highlightedIndex = -1;

  // Renderizar a barra de letras do alfabeto A-Z
  if (alphabetBar) {
    alphabetBar.innerHTML = ALPHABET_LETTERS.map(letter => `
      <span class="niche-letter-pill ${letter === 'Todos' ? 'active' : ''}" data-letter="${letter}">
        ${letter}
      </span>
    `).join('');

    alphabetBar.addEventListener('click', (e) => {
      const pill = e.target.closest('.niche-letter-pill');
      if (!pill) return;
      const letter = pill.getAttribute('data-letter');
      setAlphabetFilter(letter);
    });
  }

  function setAlphabetFilter(letter) {
    currentLetter = letter;
    if (alphabetBar) {
      alphabetBar.querySelectorAll('.niche-letter-pill').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-letter') === letter);
      });
    }
    filterAndRender();
  }

  function openDropdown() {
    dropdown.style.display = 'block';
    filterAndRender();
  }

  function closeDropdown() {
    dropdown.style.display = 'none';
    highlightedIndex = -1;
  }

  function isDropdownOpen() {
    return dropdown.style.display === 'block';
  }

  function filterAndRender() {
    const rawVal = inputNiche.value.trim().toLowerCase();
    
    // Se o usuário digitou uma única letra (ex: 'A' ou 'B'), sincronizar a letra ativa
    if (rawVal.length === 1 && /[a-z]/i.test(rawVal)) {
      const typedLetter = rawVal.toUpperCase();
      if (ALPHABET_LETTERS.includes(typedLetter) && currentLetter !== typedLetter) {
        currentLetter = typedLetter;
        if (alphabetBar) {
          alphabetBar.querySelectorAll('.niche-letter-pill').forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-letter') === typedLetter);
          });
        }
      }
    }

    let results = COMMERCIAL_NICHES_CATALOG;

    // Filtro por letra se selecionada
    if (currentLetter && currentLetter !== 'Todos') {
      results = results.filter(n => n.letter === currentLetter);
    }

    // Se houver busca com mais de 1 caractere, filtrar por texto livre
    if (rawVal.length > 1) {
      const cleanTerm = rawVal.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      results = results.filter(n => {
        const normTitle = n.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normQuery = n.query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normDesc = n.desc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normTitle.includes(cleanTerm) || normQuery.includes(cleanTerm) || normDesc.includes(cleanTerm);
      });
    }

    currentFilteredList = results;
    highlightedIndex = -1;

    if (countInfo) {
      countInfo.textContent = `${results.length} nicho${results.length === 1 ? '' : 's'}`;
    }

    if (results.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          Nenhum nicho encontrado para "<strong>${escapeHtml(inputNiche.value)}</strong>".<br>
          <small>Você ainda pode pesquisar o termo diretamente no Google Maps!</small>
        </div>
      `;
      return;
    }

    listEl.innerHTML = results.map((n, idx) => `
      <div class="niche-suggestion-item" data-idx="${idx}" data-query="${escapeHtml(n.query)}" data-title="${escapeHtml(n.title)}">
        <div class="niche-item-left">
          <span class="niche-item-icon">${n.icon}</span>
          <div class="niche-item-info">
            <span class="niche-item-title">${n.title}</span>
            <span class="niche-item-desc">${n.desc}</span>
          </div>
        </div>
        <div class="niche-item-right">
          <span class="niche-item-query-badge">${n.query}</span>
          <span class="niche-item-badge">${n.tag}</span>
        </div>
      </div>
    `).join('');
  }

  function selectNicheItem(nicheObj) {
    if (!nicheObj) return;
    inputNiche.value = nicheObj.query;
    closeDropdown();

    // Sincronizar quick tags se houver correspondência
    document.querySelectorAll('.quick-tag[data-target="input-niche"]').forEach(tag => {
      const val = tag.getAttribute('data-val');
      tag.style.borderColor = (val === nicheObj.query) ? 'var(--pinas-red)' : '';
    });

    if (typeof showToast === 'function') {
      showToast(`Nicho selecionado: ${nicheObj.title}`, 'info', 2200);
    }
  }

  // Eventos de clique na lista de sugestões
  listEl.addEventListener('click', (e) => {
    const itemEl = e.target.closest('.niche-suggestion-item');
    if (!itemEl) return;
    const idx = parseInt(itemEl.getAttribute('data-idx'), 10);
    const selected = currentFilteredList[idx];
    if (selected) {
      selectNicheItem(selected);
    }
  });

  // Digitação em tempo real no input
  inputNiche.addEventListener('input', () => {
    openDropdown();
  });

  inputNiche.addEventListener('focus', () => {
    openDropdown();
  });

  // Botão Explorar A-Z
  if (btnToggle) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isDropdownOpen()) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });
  }

  // Navegação pelo Teclado
  inputNiche.addEventListener('keydown', (e) => {
    if (!isDropdownOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        openDropdown();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, currentFilteredList.length - 1);
      updateHighlightedItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlightedItem();
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && currentFilteredList[highlightedIndex]) {
        e.preventDefault();
        selectNicheItem(currentFilteredList[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  function updateHighlightedItem() {
    const items = listEl.querySelectorAll('.niche-suggestion-item');
    items.forEach((el, idx) => {
      const isHigh = (idx === highlightedIndex);
      el.classList.toggle('highlighted', isHigh);
      if (isHigh) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group.full-width')) {
      closeDropdown();
    }
  });
}

// ============================================================================
// ==================== CENTRAL DE CONVERSAS (INBOX WHATSAPP) =================
// ============================================================================
let inboxChats = [];
let activeChatJid = null;
let currentInboxFilter = 'all'; // 'all' | 'unread' | 'leads'
let inboxSearchQuery = '';
let inboxPollingInterval = null;
let activeAttachment = null; // { base64Data, mimetype, fileName, type, dataUrl }

// Variáveis de Gravação de Áudio
let mediaRecorder = null;
let audioStream = null;
let audioChunks = [];
let audioTimerInterval = null;
let audioSeconds = 0;

function initInbox() {
  const btnRefresh = document.getElementById('btn-refresh-inbox');
  const searchInput = document.getElementById('inbox-search-input');
  const filterTabs = document.querySelectorAll('.inbox-filter-tab');
  const btnSend = document.getElementById('btn-chat-send');
  const msgInput = document.getElementById('chat-message-input');
  const btnAttach = document.getElementById('btn-chat-attach');
  const fileInput = document.getElementById('chat-media-file-input');
  const btnCancelMedia = document.getElementById('btn-cancel-media');
  const btnMic = document.getElementById('btn-chat-mic');
  const btnCancelVoice = document.getElementById('btn-cancel-voice');
  const btnSendVoice = document.getElementById('btn-send-voice');
  const btnClose = document.getElementById('btn-close-active-chat');
  const statusDropdown = document.getElementById('chat-lead-status-dropdown');

  if (btnClose) btnClose.addEventListener('click', closeActiveChat);

  // Fechar lightbox ou conversa ativa ao pressionar ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('chat-lightbox-modal');
      if (modal && modal.style.display !== 'none') {
        closeChatLightbox();
        return;
      }
      if (activeChatJid) {
        closeActiveChat();
      }
    }
  });

  if (btnRefresh) btnRefresh.addEventListener('click', () => loadInboxChats(true));

  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      inboxSearchQuery = e.target.value.trim().toLowerCase();
      renderInboxChatsList();
    }, 250));
  }

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentInboxFilter = tab.getAttribute('data-filter') || 'all';
      renderInboxChatsList();
    });
  });

  // Envio de mensagem
  if (btnSend) btnSend.addEventListener('click', handleSendChatMessage);
  if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendChatMessage();
      }
    });
  }

  // Anexo de Foto/Documento
  if (btnAttach && fileInput) {
    btnAttach.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileAttachmentSelect);
  }
  if (btnCancelMedia) {
    btnCancelMedia.addEventListener('click', clearActiveAttachment);
  }

  // Gravação de Áudio / Voz (PTT)
  if (btnMic) btnMic.addEventListener('click', startAudioRecording);
  if (btnCancelVoice) btnCancelVoice.addEventListener('click', cancelAudioRecording);
  if (btnSendVoice) btnSendVoice.addEventListener('click', stopAndSendAudioRecording);

  // Status de Lead no Chat
  if (statusDropdown) {
    statusDropdown.addEventListener('change', async (e) => {
      const newStatus = e.target.value;
      if (!activeChatJid) return;
      const digits = cleanPhoneDigits(activeChatJid);
      const lead = allLeads.find(l => cleanPhoneDigits(l.phone || '').includes(digits) || digits.includes(cleanPhoneDigits(l.phone || '')));
      if (lead) {
        lead.status = newStatus;
        try {
          await fetch(`/api/leads/${lead.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          renderLeadsTable(allLeads);
          renderCadenceQueue();
        } catch (err) {
          console.error('Falha ao atualizar status do lead:', err);
        }
      }
    });
  }

  // Respostas Rápidas (Snippets de 1 Clique e Etapas do Funil)
  document.querySelectorAll('.snippet-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const snippetType = btn.getAttribute('data-snippet');
      if (snippetType) {
        applyChatSnippet(snippetType);
        return;
      }
      const stageNum = btn.getAttribute('data-stage');
      if (stageNum) {
        applyChatStageSnippet(parseInt(stageNum, 10));
      }
    });
  });

  const btnChatOpenStages = document.getElementById('btn-chat-open-stages-modal');
  if (btnChatOpenStages) {
    btnChatOpenStages.addEventListener('click', () => {
      if (!activeChatJid) return;
      const digits = cleanPhoneDigits(activeChatJid);
      const lead = allLeads.find(l => cleanPhoneDigits(l.phone || '').includes(digits) || digits.includes(cleanPhoneDigits(l.phone || '')));
      if (lead) {
        openWhatsAppModal(lead.id);
      } else {
        alert('Este contato não está cadastrado na base de leads.');
      }
    });
  }

  // Loop de Polling inteligente: atualiza quando a aba está ativa
  if (inboxPollingInterval) clearInterval(inboxPollingInterval);
  inboxPollingInterval = setInterval(() => {
    const pane = document.getElementById('tab-inbox');
    if (pane && pane.classList.contains('active')) {
      loadInboxChats(false);
      if (activeChatJid) {
        loadActiveChatMessages(activeChatJid, false);
      }
    }
  }, 3500);

  // Primeira carga
  loadInboxChats(false);
}

// 1. Carregar Chats do Servidor
async function loadInboxChats(showFeedback = false) {
  try {
    const res = await fetch('/api/whatsapp/chats');
    const data = await res.json();
    inboxChats = Array.isArray(data) ? data : [];

    // Calcular não lidas
    const totalUnread = inboxChats.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    const unreadCountEl = document.getElementById('inbox-unread-count');
    const badgeUnreadEl = document.getElementById('badge-unread-chat');

    if (unreadCountEl) unreadCountEl.textContent = totalUnread;
    if (badgeUnreadEl) {
      if (totalUnread > 0) {
        badgeUnreadEl.textContent = totalUnread;
        badgeUnreadEl.style.display = 'inline-flex';
      } else {
        badgeUnreadEl.style.display = 'none';
      }
    }

    // Status da conexão no Inbox
    const statusPill = document.getElementById('inbox-status-pill');
    if (statusPill) {
      if (currentWaStatus && currentWaStatus.connected) {
        statusPill.className = 'badge-status-pill connected';
        statusPill.textContent = '🟢 WhatsApp Conectado';
      } else {
        statusPill.className = 'badge-status-pill disconnected';
        statusPill.textContent = '🔴 WhatsApp Desconectado';
      }
    }

    renderInboxChatsList();

    if (showFeedback) {
      const btn = document.getElementById('btn-refresh-inbox');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Atualizado!';
        setTimeout(() => { btn.innerHTML = originalText; }, 1500);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar conversas do WhatsApp:', err);
  }
}

// Normalizar e extrair partes de telefone brasileiro (DDD e últimos 8 dígitos)
function extractBrazilPhoneParts(phoneStr) {
  let digits = cleanPhoneDigits(phoneStr);
  if (!digits) return null;
  // Se vier com DDI 55 e tiver 12 ou 13 dígitos, remove o prefixo 55
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  // Se tiver DDD + número (mínimo 10 dígitos)
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const last8 = digits.slice(-8);
    return { ddd, last8, full: digits };
  }
  return null;
}

function phonesMatch(phoneA, phoneB) {
  const pA = extractBrazilPhoneParts(phoneA);
  const pB = extractBrazilPhoneParts(phoneB);
  if (!pA || !pB) return false;
  // OBRIGATÓRIO: mesmo DDD e mesmos 8 dígitos finais
  return pA.ddd === pB.ddd && pA.last8 === pB.last8;
}

// Helper para encontrar lead correspondente à conversa
function findMatchingLead(chat) {
  if (!chat) return null;
  const jid = chat.jid || chat.id || '';
  if (!jid) return null;

  const isGroup = jid.endsWith('@g.us') || !!chat.isGroup;
  if (isGroup) return null; // Grupos nunca casam como lead individual

  const isLid = jid.includes('@lid');
  const isDirectPhone = jid.includes('@s.whatsapp.net') || /^\d+$/.test(jid.replace(/@.*$/, ''));

  // 1. CASAMENTO PARA CHATS DIRETOS COM NÚMERO (@s.whatsapp.net)
  // Em conversas 1-para-1 normais, o JID É O NÚMERO REAL DO CONTATO!
  // Casamos EXCLUSIVAMENTE pelo número exato (mesmo DDD + 8 dígitos finais).
  // JAMAIS fazer match frouxo por substring de nome aqui (evita amigos como Antonio virarem Marcantonio).
  if (isDirectPhone) {
    const chatPhone = jid.split('@')[0];
    const matched = allLeads.find(l => {
      const lPhone = l.cleanPhone || l.phone || '';
      return phonesMatch(chatPhone, lPhone);
    });
    return matched || null;
  }

  // 2. CASAMENTO RESTRITO PARA DISPOSITIVOS COMPACTADOS (@lid)
  // Somente quando o número real está mascarado pelo WhatsApp Multi-Device:
  if (isLid) {
    const chatName = (chat.name || '').trim();
    if (chatName && chatName.length >= 4 && !chatName.toLowerCase().includes('kauê') && !chatName.toLowerCase().includes('pinas')) {
      const normChat = chatName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      
      const matched = allLeads.find(l => {
        const lName = (l.name || '').trim();
        if (!lName || lName.length < 4) return false;
        const normLead = lName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        
        // Match exato de nome completo
        if (normChat === normLead) return true;
        
        // Match de palavras completas se tiver pelo menos 2 palavras (evita nomes próprios comuns)
        const chatWords = normChat.split(/\s+/).filter(w => w.length >= 3);
        if (chatWords.length >= 2) {
          const leadWords = normLead.split(/\s+/).filter(w => w.length >= 3);
          const allWordsMatch = chatWords.every(w => leadWords.includes(w));
          if (allWordsMatch) return true;
        }
        return false;
      });
      if (matched) return matched;
    }
  }

  return null;
}

// 2. Renderizar Lista Lateral de Conversas
function renderInboxChatsList() {
  const container = document.getElementById('inbox-chats-list');
  if (!container) return;

  let filtered = inboxChats.filter(chat => {
    const jid = chat.jid || chat.id || '';
    if (!jid) return false;
    const isGroup = !!chat.isGroup || jid.endsWith('@g.us');
    const matchedLead = !isGroup ? findMatchingLead(chat) : null;

    // Filtro por abas
    if (currentInboxFilter === 'unread' && (!chat.unreadCount || chat.unreadCount === 0)) {
      return false;
    }
    if (currentInboxFilter === 'leads') {
      if (!matchedLead) return false;
    }
    if (currentInboxFilter === 'direct') {
      if (isGroup) return false;
    }
    if (currentInboxFilter === 'groups') {
      if (!isGroup) return false;
    }

    // Filtro por busca
    if (inboxSearchQuery) {
      const name = (matchedLead ? matchedLead.name : (chat.name || '')).toLowerCase();
      const jidLower = jid.toLowerCase();
      const lastMsgText = (typeof chat.lastMessage === 'string' ? chat.lastMessage : (chat.lastMessage?.text || '')).toLowerCase();
      if (!name.includes(inboxSearchQuery) && !jidLower.includes(inboxSearchQuery) && !lastMsgText.includes(inboxSearchQuery)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="inbox-empty-notice">
        <span style="font-size: 2rem; opacity: 0.5;">💬</span>
        <p>${inboxSearchQuery ? 'Nenhuma conversa bate com a busca.' : 'Nenhuma conversa encontrada neste filtro.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(chat => {
    const jid = chat.jid || chat.id || '';
    const isActive = activeChatJid === jid;
    const isGroup = !!chat.isGroup || jid.endsWith('@g.us');
    const matchedLead = !isGroup ? findMatchingLead(chat) : null;

    const displayName = matchedLead ? matchedLead.name : (chat.name || (isGroup ? 'Grupo do WhatsApp' : formatPhoneJid(jid)));
    const initials = isGroup ? '👥' : getAvatarInitials(displayName);
    const unread = chat.unreadCount || 0;
    const timeStr = formatChatTime(chat.lastMessage?.timestamp || chat.updatedAt);
    const previewText = formatMessagePreview(chat.lastMessage);

    return `
      <div class="inbox-chat-item ${isActive ? 'active' : ''}" onclick="openInboxChat('${jid}')">
        <div class="chat-avatar-wrap">
          <div class="chat-avatar-circle ${isGroup ? 'is-group' : ''}">${initials}</div>
          ${unread > 0 ? `<div class="chat-unread-dot"></div>` : ''}
        </div>
        <div class="chat-item-body">
          <div class="chat-item-top">
            <span class="chat-item-name" title="${escapeHtml(displayName)}">
              ${escapeHtml(displayName)}
              ${isGroup ? `<span class="badge-group-pill">👥 Grupo</span>` : ''}
              ${matchedLead ? `<span class="chat-lead-badge" style="margin-left: 4px;">🎯 Lead</span>` : ''}
            </span>
            <span class="chat-item-time">${timeStr}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-preview ${unread > 0 ? 'unread' : ''}">
              ${previewText}
            </span>
            ${unread > 0 ? `<span class="badge badge-mobile" style="padding: 0.1rem 0.45rem; font-size: 0.7rem;">${unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 2.9 Fechar Janela do Chat e Voltar para a Lista
function closeActiveChat() {
  activeChatJid = null;
  const placeholder = document.getElementById('chat-placeholder');
  const activeWindow = document.getElementById('chat-active-window');
  if (placeholder) placeholder.style.display = 'flex';
  if (activeWindow) activeWindow.style.display = 'none';

  const container = document.querySelector('.inbox-container');
  if (container) container.classList.remove('chat-open');

  // Desmarcar item ativo na lista visual
  document.querySelectorAll('.inbox-chat-item').forEach(el => el.classList.remove('active'));

  // Em telas menores, rolar suavemente para o topo da lista
  if (window.innerWidth <= 950) {
    const sidebar = document.querySelector('.inbox-sidebar');
    if (sidebar) sidebar.scrollIntoView({ behavior: 'smooth' });
  }
}

// 3. Abrir Janela do Chat Selecionado
async function openInboxChat(jid) {
  if (!jid || jid === 'undefined') return;
  activeChatJid = jid;

  const containerMsg = document.getElementById('chat-messages-container');
  if (containerMsg) {
    containerMsg.querySelectorAll('audio, video').forEach(el => {
      try { el.pause(); } catch(e) {}
    });
    containerMsg.dataset.renderedHash = '';
  }

  const placeholder = document.getElementById('chat-placeholder');
  const activeWindow = document.getElementById('chat-active-window');
  if (placeholder) placeholder.style.display = 'none';
  if (activeWindow) activeWindow.style.display = 'flex';

  const container = document.querySelector('.inbox-container');
  if (container) container.classList.add('chat-open');

  // Em telas menores, rolar suavemente para a janela do chat
  if (window.innerWidth <= 950 && activeWindow) {
    activeWindow.scrollIntoView({ behavior: 'smooth' });
  }

  const chat = inboxChats.find(c => (c.jid || c.id) === jid) || { jid, id: jid };
  const isGroup = jid.endsWith('@g.us') || !!chat.isGroup;
  const matchedLead = !isGroup ? findMatchingLead(chat) : null;

  const displayName = matchedLead ? matchedLead.name : (chat.name || (isGroup ? 'Grupo do WhatsApp' : formatPhoneJid(jid)));
  const displayPhone = isGroup 
    ? (chat.participantCount ? `👥 Grupo • ${chat.participantCount} participantes` : '👥 Grupo do WhatsApp') 
    : (matchedLead ? (matchedLead.phone || formatPhoneJid(jid)) : formatPhoneJid(jid));

  const contactNameEl = document.getElementById('chat-contact-name');
  const contactPhoneEl = document.getElementById('chat-contact-phone');
  const avatarEl = document.getElementById('chat-avatar');
  const leadBadgeEl = document.getElementById('chat-lead-badge');
  const groupBadgeEl = document.getElementById('chat-group-badge');
  const statusDropdown = document.getElementById('chat-lead-status-dropdown');
  const btnSlides = document.getElementById('btn-chat-open-slides');
  const snippetsBar = document.getElementById('chat-quick-snippets-bar');

  if (contactNameEl) contactNameEl.textContent = displayName;
  if (contactPhoneEl) contactPhoneEl.textContent = displayPhone;
  if (avatarEl) avatarEl.textContent = isGroup ? '👥' : getAvatarInitials(displayName);

  if (isGroup) {
    if (groupBadgeEl) groupBadgeEl.style.display = 'inline-block';
    if (leadBadgeEl) leadBadgeEl.style.display = 'none';
    if (statusDropdown) statusDropdown.style.display = 'none';
    if (btnSlides) btnSlides.style.display = 'none';
    if (snippetsBar) snippetsBar.style.display = 'none';
  } else {
    if (groupBadgeEl) groupBadgeEl.style.display = 'none';
    if (snippetsBar) snippetsBar.style.display = 'flex';

    if (matchedLead) {
      if (leadBadgeEl) {
        leadBadgeEl.style.display = 'inline-block';
        leadBadgeEl.textContent = `🎯 Lead Pinas (${matchedLead.niche || 'Geral'})`;
      }
      if (statusDropdown) {
        statusDropdown.style.display = 'block';
        statusDropdown.value = matchedLead.status || 'novo';
      }
      if (btnSlides) {
        const bairro = matchedLead.neighborhood || 'sua região';
        const nicho = matchedLead.niche || '';
        btnSlides.href = `/slides?empresa=${encodeURIComponent(displayName)}&bairro=${encodeURIComponent(bairro)}&nicho=${encodeURIComponent(nicho)}`;
        btnSlides.style.display = 'inline-flex';
      }
      const btnStagesModal = document.getElementById('btn-chat-open-stages-modal');
      if (btnStagesModal) {
        btnStagesModal.style.display = 'inline-flex';
      }
    } else {
      if (leadBadgeEl) leadBadgeEl.style.display = 'none';
      if (statusDropdown) statusDropdown.style.display = 'none';
      if (btnSlides) btnSlides.style.display = 'none';
      const btnStagesModal = document.getElementById('btn-chat-open-stages-modal');
      if (btnStagesModal) {
        btnStagesModal.style.display = 'none';
      }
    }
  }

  // Marcar como lida no store e limpar badge local
  if (chat.unreadCount && chat.unreadCount > 0) {
    chat.unreadCount = 0;
    fetch('/api/whatsapp/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid })
    }).catch(() => {});
  }

  renderInboxChatsList();
  await loadActiveChatMessages(jid, true);

  const input = document.getElementById('chat-message-input');
  if (input) input.focus();
}

// 4. Carregar Histórico de Mensagens do Chat Ativo
async function loadActiveChatMessages(jid, forceScrollToBottom = false) {
  if (activeChatJid !== jid) return;
  try {
    const res = await fetch(`/api/whatsapp/messages/${encodeURIComponent(jid)}`);
    const messages = await res.json();
    renderChatMessages(messages, forceScrollToBottom);
  } catch (err) {
    console.error('Erro ao carregar mensagens:', err);
  }
}

// Paleta de cores vibrantes para diferenciar remetentes em grupos (estilo WhatsApp)
const SENDER_COLORS = [
  '#38BDF8', // Azul Claro / Sky
  '#34D399', // Verde Esmeralda
  '#F59E0B', // Âmbar / Laranja
  '#A78BFA', // Roxo / Lavanda
  '#F43F5E', // Rosa Choque
  '#2DD4BF', // Ciano / Turquesa
  '#FB923C', // Coral
  '#60A5FA'  // Azul Royal
];

function getSenderColor(nameOrId) {
  if (!nameOrId) return SENDER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SENDER_COLORS.length;
  return SENDER_COLORS[index];
}

function getSenderDisplayName(msg) {
  if (!msg) return 'Participante';
  if (msg.senderName && msg.senderName !== 'Você' && msg.senderName !== 'Kauê') {
    return msg.senderName;
  }
  if (msg.participant) {
    const raw = String(msg.participant).split('@')[0];
    return formatPhoneJid(raw);
  }
  return 'Participante';
}

// Helper para vincular listeners em elementos de áudio (pausar outros ao tocar um)
function bindAudioElements(container) {
  if (!container) return;
  const audios = container.querySelectorAll('audio');
  audios.forEach(audio => {
    audio.onplay = () => {
      audios.forEach(other => {
        if (other !== audio && !other.paused) {
          other.pause();
        }
      });
    };
  });
}

// Helper para gerar o HTML de um balão individual de mensagem
function renderSingleMessageBubbleHtml(msg, isChatGroup) {
  const isOut = !!msg.fromMe;
  const timeStr = formatChatTime(msg.timestamp, true);
  let contentHtml = '';

  // Nome do participante remetente (destaque em grupos para saber quem mandou)
  if (!isOut && (isChatGroup || msg.isGroup || (activeChatJid && activeChatJid.endsWith('@g.us')))) {
    const sender = getSenderDisplayName(msg);
    const color = getSenderColor(sender);
    contentHtml += `
      <div class="msg-sender-name" style="color: ${color};">
        <span style="opacity: 0.85;">👤</span>
        <span>${escapeHtml(sender)}</span>
      </div>
    `;
  }

  // Foto / Imagem / Figurinha (abre no Lightbox modal centralizado com setas)
  const isImage = msg.type === 'image' || msg.type === 'sticker' || (msg.mediaUrl && (/\.(jpe?g|png|webp|gif)$/i.test(msg.mediaUrl) || msg.mediaUrl.includes('img_') || msg.mediaUrl.includes('sticker_')));
  if (isImage && msg.mediaUrl) {
    contentHtml += `
      <div class="msg-img-wrap">
        <img src="${msg.mediaUrl}" alt="Foto" loading="lazy" style="cursor: zoom-in;" onclick="openChatLightbox('${msg.mediaUrl}')" />
      </div>
    `;
  }

  // Vídeo
  const isVideo = msg.type === 'video' || (msg.mediaUrl && (/\.(mp4|webm|mov)$/i.test(msg.mediaUrl) && !msg.mediaUrl.includes('audio_')));
  if (isVideo && !isImage && msg.mediaUrl) {
    contentHtml += `
      <div class="msg-video-wrap">
        <video controls preload="metadata" style="max-width: 100%; border-radius: 8px; max-height: 320px;">
          <source src="${msg.mediaUrl}">
          Seu navegador não suporta vídeo.
        </video>
      </div>
    `;
  }

  // Áudio / Mensagem de Voz (PTT)
  const isAudio = msg.type === 'audio' || (msg.mediaUrl && (msg.mediaUrl.includes('audio_') || /\.(ogg|mp3|m4a|wav)$/i.test(msg.mediaUrl)));
  if (isAudio && !isImage && !isVideo && msg.mediaUrl) {
    contentHtml += `
      <div class="msg-audio-wrap">
        <audio controls preload="metadata" style="max-width: 100%; border-radius: 20px; outline: none;">
          <source src="${msg.mediaUrl}">
          Seu navegador não suporta áudio.
        </audio>
      </div>
    `;
  }

  // Documento / Arquivo / PDF
  const isDoc = msg.type === 'document' || (msg.mediaUrl && !isImage && !isAudio && !isVideo);
  if (isDoc && msg.mediaUrl) {
    contentHtml += `
      <div class="msg-doc-wrap">
        <span>📄</span>
        <a href="${msg.mediaUrl}" target="_blank" download="${escapeHtml(msg.fileName || 'arquivo')}">
          ${escapeHtml(msg.fileName || 'Abrir Documento')} ↗
        </a>
      </div>
    `;
  }

  // Texto da Mensagem
  if (msg.text) {
    contentHtml += `<div class="msg-text">${formatMessageText(msg.text)}</div>`;
  }

  return `
    <div class="msg-bubble ${isOut ? 'outgoing' : 'incoming'}" data-msg-id="${escapeHtml(msg.id || '')}">
      ${contentHtml}
      <div class="msg-meta-row">
        <span class="msg-time">${timeStr}</span>
        ${isOut ? `<span class="msg-check">✓✓</span>` : ''}
      </div>
    </div>
  `;
}

// 5. Renderizar Balões de Mensagem no Chat
function renderChatMessages(messages, forceScroll = false) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;

  if (!Array.isArray(messages) || messages.length === 0) {
    container.dataset.renderedHash = 'empty';
    container.innerHTML = `
      <div class="inbox-empty-notice" style="margin-top: 3rem;">
        <span style="font-size: 2.2rem; opacity: 0.6;">💬</span>
        <p>Inicie uma conversa digitando abaixo ou aguarde novas mensagens deste contato.</p>
      </div>
    `;
    return;
  }

  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  const activeChat = inboxChats.find(c => (c.jid || c.id) === activeChatJid);
  const isChatGroup = (activeChatJid && activeChatJid.endsWith('@g.us')) || !!activeChat?.isGroup;

  // Atualizar lista de mídias/fotos da conversa ativa para o Lightbox
  chatMediaList = messages
    .filter(m => (m.type === 'image' || m.type === 'sticker' || (m.mediaUrl && (/\.(jpe?g|png|webp|gif)$/i.test(m.mediaUrl) || m.mediaUrl.includes('img_') || m.mediaUrl.includes('sticker_')))))
    .map(m => ({
      url: m.mediaUrl,
      caption: m.text || '',
      timestamp: m.timestamp
    }));

  // 1. Verificar se há algum áudio ou vídeo reproduzindo no momento
  const isAnyMediaPlaying = Array.from(container.querySelectorAll('audio, video')).some(el => !el.paused && !el.ended && el.currentTime > 0);

  // 2. Hash rápido do conjunto de mensagens para detectar mudanças
  const lastMsg = messages[messages.length - 1];
  const newHash = `${messages.length}_${lastMsg?.id || ''}_${lastMsg?.timestamp || ''}_${lastMsg?.status || ''}`;

  // Se nada mudou e não é rolagem forçada: não tocar no DOM (preserva áudio rodando e posição)
  if (container.dataset.renderedHash === newHash && !forceScroll) {
    return;
  }

  // Se o usuário está ouvindo um áudio: NÃO destruir o DOM. Se novas mensagens chegaram, anexar ao fim
  if (isAnyMediaPlaying && !forceScroll && container.dataset.renderedHash) {
    const existingBubbles = container.querySelectorAll('[data-msg-id]');
    const existingIds = new Set(Array.from(existingBubbles).map(b => b.getAttribute('data-msg-id')).filter(Boolean));
    const newMessages = messages.filter(m => m.id && !existingIds.has(m.id));
    if (newMessages.length > 0) {
      newMessages.forEach(msg => {
        const bubbleHtml = renderSingleMessageBubbleHtml(msg, isChatGroup);
        const temp = document.createElement('div');
        temp.innerHTML = bubbleHtml;
        if (temp.firstElementChild) {
          container.appendChild(temp.firstElementChild);
        }
      });
      container.dataset.renderedHash = newHash;
      bindAudioElements(container);
      if (isNearBottom) container.scrollTop = container.scrollHeight;
    }
    return;
  }

  // Renderização inicial ou atualização com mensagens novas
  container.dataset.renderedHash = newHash;
  container.innerHTML = messages.map(msg => renderSingleMessageBubbleHtml(msg, isChatGroup)).join('');
  bindAudioElements(container);

  if (forceScroll || isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// 5.5 Inserir Resposta Rápida (Snippets em 1 Clique)
function applyChatSnippet(snippetType) {
  const input = document.getElementById('chat-message-input');
  if (!input) return;

  const chat = inboxChats.find(c => (c.jid || c.id) === activeChatJid) || { jid: activeChatJid, id: activeChatJid };
  const matchedLead = findMatchingLead(chat);
  const rawName = matchedLead ? matchedLead.name : (chat.name || '');
  const cleanName = rawName ? rawName.trim() : 'tudo bem?';
  const bairro = (matchedLead && matchedLead.neighborhood) ? matchedLead.neighborhood : 'sua região';

  let text = '';
  switch (snippetType) {
    case 'call':
      text = `Oi ${cleanName}! Tudo bem?\n\nPara você ver na prática como estruturamos a captação de clientes qualificados aí em ${bairro} pelo Google e Instagram, o que acha de batermos um papo rápido de 15 minutinhos por vídeo?\n\nConsigo abrir a tela e te mostrar a estratégia pronta. Você teria um horário amanhã às 14h ou 16h?`;
      break;
    case 'servico':
      text = `Aqui na Pinas nós cuidamos de toda a operação de captação:\n\n1. Posicionamento no topo do Google para quem já está pesquisando ativamente pelo seu serviço aí em ${bairro}.\n2. Anúncios estratégicos no Instagram para gerar desejo no público local certo.\n3. Direcionamento desses clientes direto para o seu WhatsApp prontos para comprar.\n\nAssim você não gasta tempo com marketing e foca apenas em atender e vender.`;
      break;
    case 'preco':
      text = `Sobre valores: nós montamos um plano sob medida de acordo com o porte e a meta da sua empresa. Nosso objetivo é que a assessoria se pague com os novos clientes já nas primeiras semanas.\n\nPor isso prefiro bater um papo rápido de 15 minutos pelo Meet para entender seu momento e já te passar uma proposta enxuta e assertiva. Amanhã à tarde seria um bom momento?`;
      break;
    case 'meet':
      text = `Perfeito! Preparei o link da nossa sala no Google Meet:\n\n🔗 https://meet.google.com/new\n\nFunciona direto pelo celular ou navegador. Nos falamos no horário combinado!`;
      break;
    case 'proposta':
      text = `Separei aqui um material rápido da Pinas com os bastidores de como geramos demanda para negócios locais.\n\nEstou anexando o arquivo aqui no chat para você dar uma olhada com calma! Qualquer dúvida estou à disposição.`;
      break;
    default:
      return;
  }

  input.value = text;
  input.focus();
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

function applyChatStageSnippet(stageNum) {
  const input = document.getElementById('chat-message-input');
  if (!input || !activeChatJid) return;

  const chat = inboxChats.find(c => (c.jid || c.id) === activeChatJid) || { jid: activeChatJid, id: activeChatJid };
  const matchedLead = findMatchingLead(chat);
  const leadObj = matchedLead || {
    name: chat.name || 'empresa',
    niche: 'seu segmento',
    neighborhood: 'sua região',
    hasWebsite: false
  };

  const text = formatStageText(leadObj, stageNum, !!leadObj.hasWebsite);
  if (text) {
    input.value = text;
    input.focus();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    showToastNotification(`Etapa ${stageNum} carregada no campo de envio.`);
  }
}

// 6. Enviar Mensagem de Texto ou Mídia
async function handleSendChatMessage() {
  if (!activeChatJid) {
    alert('Selecione uma conversa primeiro.');
    return;
  }

  const input = document.getElementById('chat-message-input');
  const text = input ? input.value.trim() : '';

  // Caso haja anexo de mídia ativo
  if (activeAttachment) {
    const payload = {
      jid: activeChatJid,
      base64Data: activeAttachment.base64Data,
      mimetype: activeAttachment.mimetype,
      caption: text,
      fileName: activeAttachment.fileName
    };

    clearActiveAttachment();
    if (input) input.value = '';

    try {
      await fetch('/api/whatsapp/send-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await loadActiveChatMessages(activeChatJid, true);
      loadInboxChats(false);
    } catch (err) {
      alert('Falha ao enviar arquivo: ' + err.message);
    }
    return;
  }

  // Envio de texto comum
  if (!text) return;
  if (input) input.value = '';

  try {
    await fetch('/api/whatsapp/send-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid: activeChatJid, text })
    });
    await loadActiveChatMessages(activeChatJid, true);
    loadInboxChats(false);
  } catch (err) {
    alert('Erro ao enviar mensagem: ' + err.message);
  }
}

// 7. Manipulação de Arquivo / Foto Anexa
function handleFileAttachmentSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64Data = dataUrl.split(',')[1];

    activeAttachment = {
      base64Data,
      mimetype: file.type || 'application/octet-stream',
      fileName: file.name,
      type: file.type.startsWith('image/') ? 'image' : 'document',
      dataUrl
    };

    const previewBar = document.getElementById('chat-media-preview-bar');
    const previewName = document.getElementById('chat-media-preview-name');
    const previewIcon = document.getElementById('chat-media-preview-icon');

    if (previewBar) previewBar.style.display = 'flex';
    if (previewName) previewName.textContent = file.name;
    if (previewIcon) previewIcon.textContent = file.type.startsWith('image/') ? '📷' : '📄';

    const input = document.getElementById('chat-message-input');
    if (input) input.focus();
  };
  reader.readAsDataURL(file);
}

function clearActiveAttachment() {
  activeAttachment = null;
  const fileInput = document.getElementById('chat-media-file-input');
  const previewBar = document.getElementById('chat-media-preview-bar');
  if (fileInput) fileInput.value = '';
  if (previewBar) previewBar.style.display = 'none';
}

// 8. Gravação de Áudio / Mensagem de Voz (PTT)
async function startAudioRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Seu navegador não tem suporte a gravação de microfone.');
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    audioSeconds = 0;

    mediaRecorder = new MediaRecorder(audioStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.start();

    // Atualizar UI para modo gravação
    const recordingBar = document.getElementById('chat-voice-recording-bar');
    const inputControls = document.getElementById('chat-input-controls');
    const timerEl = document.getElementById('voice-timer');

    if (recordingBar) recordingBar.style.display = 'flex';
    if (inputControls) inputControls.style.display = 'none';
    if (timerEl) timerEl.textContent = '00:00';

    if (audioTimerInterval) clearInterval(audioTimerInterval);
    audioTimerInterval = setInterval(() => {
      audioSeconds++;
      const mins = String(Math.floor(audioSeconds / 60)).padStart(2, '0');
      const secs = String(audioSeconds % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);

  } catch (err) {
    alert('Permissão de microfone negada ou erro ao iniciar gravação: ' + err.message);
  }
}

function cancelAudioRecording() {
  if (audioTimerInterval) clearInterval(audioTimerInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  audioChunks = [];
  audioSeconds = 0;

  const recordingBar = document.getElementById('chat-voice-recording-bar');
  const inputControls = document.getElementById('chat-input-controls');
  if (recordingBar) recordingBar.style.display = 'none';
  if (inputControls) inputControls.style.display = 'flex';
}

async function stopAndSendAudioRecording() {
  if (!activeChatJid) {
    alert('Selecione uma conversa para enviar o áudio.');
    cancelAudioRecording();
    return;
  }

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    cancelAudioRecording();
    return;
  }

  if (audioTimerInterval) clearInterval(audioTimerInterval);

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/mp4' });
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      try {
        await fetch('/api/whatsapp/send-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jid: activeChatJid,
            base64Data,
            mimetype: 'audio/mp4'
          })
        });
        await loadActiveChatMessages(activeChatJid, true);
        loadInboxChats(false);
      } catch (err) {
        alert('Erro ao enviar áudio: ' + err.message);
      }
    };
    reader.readAsDataURL(audioBlob);

    // Restaurar UI
    const recordingBar = document.getElementById('chat-voice-recording-bar');
    const inputControls = document.getElementById('chat-input-controls');
    if (recordingBar) recordingBar.style.display = 'none';
    if (inputControls) inputControls.style.display = 'flex';
  };

  mediaRecorder.stop();
}

// ============================================================================
// ==================== HELPERS DE FORMATAÇÃO & PARSING =======================
// ============================================================================
function cleanPhoneDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function formatPhoneJid(jid) {
  if (!jid) return '';
  const clean = jid.split('@')[0];
  if (clean.length === 13 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 12 && clean.startsWith('55')) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  return clean;
}

function getAvatarInitials(name) {
  if (!name) return 'W';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function formatChatTime(timestamp, includeSeconds = false) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (isToday) {
    return `${hours}:${minutes}`;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

function formatMessagePreview(lastMsg) {
  if (!lastMsg) return 'Conversa iniciada';
  if (typeof lastMsg === 'string') return escapeHtml(lastMsg);
  const type = lastMsg.type;
  if (type === 'image') return '📷 Foto';
  if (type === 'audio') return '🎙️ Mensagem de voz';
  if (type === 'document') return '📄 Documento';
  return escapeHtml(lastMsg.text || 'Conversa iniciada');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMessageText(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return escaped.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--color-blue); text-decoration: underline;">${url}</a>`);
}

// ============================================================================
// ==================== SISTEMA DE NOTIFICAÇÃO TOAST ==========================
// ============================================================================
function ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'info', title = null, duration = 4000) {
  const container = ensureToastContainer();
  if (!container) return;

  let toastType = type;
  let icon = '⚡';
  let defaultTitle = 'Notificação';

  const lower = String(message || '').toLowerCase();
  if (type === 'success' || message.includes('✅') || lower.includes('sucesso') || lower.includes('salvo')) {
    toastType = 'success';
    icon = '✅';
    defaultTitle = 'Salvo com Sucesso';
  } else if (type === 'error' || lower.includes('erro') || lower.includes('falha') || message.includes('❌')) {
    toastType = 'error';
    icon = '❌';
    defaultTitle = 'Atenção';
  } else if (type === 'warning' || message.includes('⚠️') || lower.includes('limite') || lower.includes('aviso')) {
    toastType = 'warning';
    icon = '⚠️';
    defaultTitle = 'Aviso';
  } else {
    toastType = 'info';
    icon = 'ℹ️';
    defaultTitle = 'Prospector';
  }

  const toastTitle = title || defaultTitle;
  const cleanMsg = String(message || '').replace(/^[✅❌⚠️ℹ️⚡\s]+/, '').trim();

  const toast = document.createElement('div');
  toast.className = `toast-card ${toastType}`;
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(toastTitle)}</div>
      <div class="toast-message">${escapeHtml(cleanMsg || message)}</div>
    </div>
    <button type="button" class="toast-close" title="Fechar">✕</button>
    <div class="toast-progress">
      <div class="toast-progress-fill" style="animation-duration: ${duration}ms;"></div>
    </div>
  `;

  let dismissed = false;
  let timer = null;

  const removeToast = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 260);
  };

  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) closeBtn.onclick = removeToast;

  timer = setTimeout(removeToast, duration);

  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => {
    if (!dismissed) {
      timer = setTimeout(removeToast, 1200);
    }
  });

  container.appendChild(toast);
}

function initToastSystem() {
  ensureToastContainer();

  // Substituir window.alert nativo por Toast moderno
  const originalAlert = window.alert;
  window.alert = function(msg) {
    if (typeof msg === 'string') {
      showToast(msg);
    } else {
      originalAlert(msg);
    }
  };
}

// ============================================================================
// ==================== MODAL POP-UP CENTRAL (CONFIRMAÇÕES) ====================
// ============================================================================
function showSuccessModal({
  title = 'Configurações Salvas!',
  message = 'Suas alterações foram gravadas e já estão ativas no sistema.',
  icon = '✅',
  buttonText = 'OK, Entendido',
  autoCloseMs = 3500
} = {}) {
  const modal = document.getElementById('modal-success-alert');
  if (!modal) {
    showToast(message, 'success', title);
    return;
  }

  const iconEl = document.getElementById('modal-alert-icon');
  const titleEl = document.getElementById('modal-alert-title');
  const msgEl = document.getElementById('modal-alert-message');
  const btnEl = document.getElementById('btn-modal-alert-confirm');

  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (btnEl) btnEl.textContent = buttonText;

  modal.style.display = 'flex';

  let autoTimer = null;
  const closeModal = () => {
    if (autoTimer) clearTimeout(autoTimer);
    modal.style.display = 'none';
  };

  if (btnEl) {
    btnEl.onclick = closeModal;
    btnEl.focus();
  }

  // Fechar ao clicar fora do card
  modal.onclick = (e) => {
    if (e.target === modal || e.target.classList.contains('modal-overlay')) {
      closeModal();
    }
  };

  // Fechar no Esc ou Enter
  const keyHandler = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      closeModal();
      window.removeEventListener('keydown', keyHandler);
    }
  };
  window.addEventListener('keydown', keyHandler);

  if (autoCloseMs && autoCloseMs > 0) {
    autoTimer = setTimeout(closeModal, autoCloseMs);
  }

  // Disparar toast conjunto para feedback total
  showToast(message, 'success', title);
}

// ============================================================================
// ==================== LIGHTBOX MODAL (VISUALIZADOR DE FOTOS) =================
// ============================================================================
let currentLightboxList = [];
let currentLightboxIndex = 0;

function ensureLightboxModal() {
  let modal = document.getElementById('chat-lightbox-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'lightbox-overlay';
    modal.id = 'chat-lightbox-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="lightbox-backdrop" id="lightbox-backdrop"></div>
      <div class="lightbox-container" id="lightbox-container">
        <div class="lightbox-header">
          <div class="lightbox-counter-pill">
            <span class="lightbox-icon">📷</span>
            <span id="lightbox-counter">Foto 1 de 1</span>
          </div>
          <div class="lightbox-actions">
            <a id="lightbox-btn-download" href="#" target="_blank" class="lightbox-tool-btn" title="Abrir imagem em tamanho original">
              <span>↗</span> Abrir Original
            </a>
            <button type="button" class="lightbox-tool-btn lightbox-close" id="lightbox-btn-close" title="Fechar (Esc)">
              ✕
            </button>
          </div>
        </div>
        <div class="lightbox-content">
          <button type="button" class="lightbox-nav-btn prev" id="lightbox-btn-prev" title="Foto anterior (←)">
            ‹
          </button>
          <div class="lightbox-image-box" id="lightbox-image-box">
            <img id="lightbox-img" src="" alt="Foto expandida">
          </div>
          <button type="button" class="lightbox-nav-btn next" id="lightbox-btn-next" title="Próxima foto (→)">
            ›
          </button>
        </div>
        <div class="lightbox-caption-bar" id="lightbox-caption-bar" style="display: none;">
          <p id="lightbox-caption-text"></p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  bindLightboxEvents();
  return modal;
}

function updateLightboxDisplay() {
  if (!currentLightboxList || currentLightboxList.length === 0) return;
  const item = currentLightboxList[currentLightboxIndex];
  const imgEl = document.getElementById('lightbox-img');
  const counterEl = document.getElementById('lightbox-counter');
  const downloadBtn = document.getElementById('lightbox-btn-download');
  const prevBtn = document.getElementById('lightbox-btn-prev');
  const nextBtn = document.getElementById('lightbox-btn-next');
  const captionBar = document.getElementById('lightbox-caption-bar');
  const captionText = document.getElementById('lightbox-caption-text');

  const url = typeof item === 'string' ? item : item.url;
  const caption = (typeof item === 'object' && item.caption) ? item.caption : '';

  if (imgEl) {
    imgEl.src = url;
  }
  if (counterEl) {
    counterEl.textContent = `Foto ${currentLightboxIndex + 1} de ${currentLightboxList.length}`;
  }
  if (downloadBtn) {
    downloadBtn.href = url;
  }

  if (captionBar && captionText) {
    if (caption && caption.trim()) {
      captionText.textContent = caption;
      captionBar.style.display = 'block';
    } else {
      captionBar.style.display = 'none';
    }
  }

  const showNav = currentLightboxList.length > 1;
  if (prevBtn) prevBtn.style.display = showNav ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = showNav ? 'flex' : 'none';
}

function openChatLightbox(clickedSrc) {
  const modal = ensureLightboxModal();
  if (!modal) return;

  // 1. Obter lista de fotos do chat atual
  let list = [];
  if (Array.isArray(chatMediaList) && chatMediaList.length > 0) {
    list = chatMediaList.map(m => (typeof m === 'string' ? m : m.url)).filter(Boolean);
  }

  // Fallback: varrer elementos de imagem no chat
  if (list.length === 0) {
    const chatImgs = Array.from(document.querySelectorAll('#chat-messages-container img, .msg-img-wrap img'));
    chatImgs.forEach(img => {
      const s = img.getAttribute('src') || img.currentSrc;
      if (s && !s.includes('data:image/svg') && !list.includes(s)) {
        list.push(s);
      }
    });
  }

  // Garantir que a imagem clicada esteja na lista
  if (clickedSrc) {
    const cleanClicked = clickedSrc.split('?')[0];
    const exists = list.some(s => s === clickedSrc || s.includes(cleanClicked) || cleanClicked.includes(s));
    if (!exists) {
      list.push(clickedSrc);
    }
  }

  if (list.length === 0 && clickedSrc) {
    list = [clickedSrc];
  }

  currentLightboxList = list;

  // Localizar o índice da foto selecionada
  let foundIdx = -1;
  if (clickedSrc) {
    const cleanClicked = clickedSrc.split('?')[0];
    foundIdx = list.findIndex(s => s === clickedSrc || s.includes(cleanClicked) || cleanClicked.includes(s));
  }
  currentLightboxIndex = foundIdx !== -1 ? foundIdx : 0;

  updateLightboxDisplay();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeChatLightbox() {
  const modal = document.getElementById('chat-lightbox-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function lightboxNext() {
  if (!currentLightboxList || currentLightboxList.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxList.length;
  updateLightboxDisplay();
}

function lightboxPrev() {
  if (!currentLightboxList || currentLightboxList.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxList.length) % currentLightboxList.length;
  updateLightboxDisplay();
}

function bindLightboxEvents() {
  const modal = document.getElementById('chat-lightbox-modal');
  if (!modal) return;

  // FECHAR AO CLICAR FORA: Qualquer clique fora da imagem e das ações fecha imediatamente a janela
  modal.onclick = (e) => {
    // Se o clique foi na imagem ou dentro da caixa da foto, mantém aberto
    const clickedInsidePhoto = e.target.closest('#lightbox-img') || e.target.closest('.lightbox-image-box');
    const clickedControls = e.target.closest('.lightbox-nav-btn') || e.target.closest('.lightbox-actions') || e.target.closest('.lightbox-counter-pill') || e.target.closest('#lightbox-caption-bar');
    
    if (!clickedInsidePhoto && !clickedControls) {
      closeChatLightbox();
    }
  };

  const backdrop = document.getElementById('lightbox-backdrop');
  if (backdrop) {
    backdrop.onclick = (e) => {
      e.stopPropagation();
      closeChatLightbox();
    };
  }

  const closeBtn = document.getElementById('lightbox-btn-close');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeChatLightbox();
    };
  }

  const prevBtn = document.getElementById('lightbox-btn-prev');
  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      lightboxPrev();
    };
  }

  const nextBtn = document.getElementById('lightbox-btn-next');
  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      lightboxNext();
    };
  }
}

function initLightbox() {
  ensureLightboxModal();
  bindLightboxEvents();

  // Navegação no Teclado: Esc para fechar, setas esquerda/direita para passar fotos
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('chat-lightbox-modal');
    if (!modal || modal.style.display === 'none') return;

    if (e.key === 'Escape') {
      closeChatLightbox();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      lightboxNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      lightboxPrev();
    }
  });

  // Listener global delegado para qualquer clique em imagem de chat
  document.addEventListener('click', (e) => {
    const imgEl = e.target.closest('#chat-messages-container img, .msg-img-wrap img');
    if (imgEl) {
      const src = imgEl.getAttribute('src') || imgEl.currentSrc;
      if (src && !src.includes('data:image/svg')) {
        e.preventDefault();
        e.stopPropagation();
        openChatLightbox(src);
      }
    }
  }, true);
}

// Exportações Globais
window.escapeHtml = escapeHtml;
window.formatMessageText = formatMessageText;
window.showToast = showToast;
window.showSuccessModal = showSuccessModal;
window.initToastSystem = initToastSystem;
window.openChatLightbox = openChatLightbox;
window.closeChatLightbox = closeChatLightbox;
window.lightboxNext = lightboxNext;
window.lightboxPrev = lightboxPrev;
window.initLightbox = initLightbox;



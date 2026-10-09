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
  fetchWhatsAppStatus().then(data => {
    if (data && !data.connected) {
      startWaPolling();
    }
  });
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
    const startHourInput = document.getElementById('settings-outbound-start');
    const endHourInput = document.getElementById('settings-outbound-end');

    if (chainsTextarea && appConfig.excludedChains) {
      chainsTextarea.value = appConfig.excludedChains.join('\n');
    }
    if (kwTextarea && appConfig.excludedKeywords) {
      kwTextarea.value = appConfig.excludedKeywords.join('\n');
    }
    if (dailyLimitInput) dailyLimitInput.value = appConfig.dailyLimit || 30;
    if (minDelayInput) minDelayInput.value = appConfig.minDelaySeconds || 30;
    if (maxDelayInput) maxDelayInput.value = appConfig.maxDelaySeconds || 60;
    if (startHourInput) startHourInput.value = appConfig.outboundStartHour !== undefined ? appConfig.outboundStartHour : 10;
    if (endHourInput) endHourInput.value = appConfig.outboundEndHour !== undefined ? appConfig.outboundEndHour : 19;
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

    // Alerta Sonoro & Notificação em tempo real de nova reunião agendada pela IA
    const currentMeetingCount = (allLeads || []).filter(l => l.status === 'reuniao').length;
    if (window._knownMeetingCount !== undefined && currentMeetingCount > window._knownMeetingCount) {
      playSuccessChime();
      sendDesktopNotification('🎉 REUNIÃO MARCADA PELA IA!', 'Um novo lead aceitou o convite para call no Google Meet!');
      showToastNotification('🎉 Nova Reunião Fechada pela IA! Acesse o CRM.');
    }
    window._knownMeetingCount = currentMeetingCount;

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
            <button class="btn btn-outline btn-sm btn-gemini-lead" onclick="openWhatsAppModal('${lead.id}', 'gemini')" title="Gerar Diagnóstico & Abordagens com IA (Gemini)">
              <span>✨ IA</span>
            </button>
            <button class="btn btn-outline btn-sm" onclick="openWhatsAppModal('${lead.id}', 'callscript')" style="border-color: rgba(255,0,85,0.45); color: #FF3366; font-weight: 700;" title="Abrir Auditoria Visual Seção por Seção e Roteiro de Call de 15 min">
              <span>📋 Call</span>
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
        <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
          <button class="btn btn-outline btn-xs" onclick="openWhatsAppModal('${l.id}', 'callscript')" style="border-color: rgba(255,0,85,0.4); color: #FF3366; font-weight: 700;">
            📋 Call
          </button>
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

let autopilotPollTimer = null;

// Efeito sonoro sintético elegante (Web Audio API - sem arquivos externos)
function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

// Disparar notificação na Área de Trabalho do Windows
function sendDesktopNotification(title, message) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/media/favicon.ico'
      });
    }
  } catch (e) {}
}

// ==================== PILOTO AUTOMÁTICO 100% AUTÔNOMO (IA + AUDITORIA REAL) ====================
function initAutopilot() {
  const btnStart = document.getElementById('btn-start-autopilot');
  const btnPause = document.getElementById('btn-pause-autopilot');
  const autostartToggle = document.getElementById('autopilot-autostart-toggle');
  const autoresponderToggle = document.getElementById('cadence-autoresponder-toggle');
  const btnNotif = document.getElementById('btn-enable-desktop-notifications');

  if (btnStart) {
    btnStart.addEventListener('click', startAutopilot);
  }
  if (btnPause) {
    btnPause.addEventListener('click', () => pauseAutopilot('Piloto Automático pausado pelo operador.'));
  }

  // Toggle do Modo 24/7 Autônomo Permanente
  if (autostartToggle) {
    autostartToggle.addEventListener('change', async () => {
      try {
        await fetch('/api/autopilot/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoStartAutopilot: autostartToggle.checked })
        });
        showToastNotification(`Modo 24/7 Autônomo ${autostartToggle.checked ? 'ativado (Inicia sozinho)' : 'desativado'}.`);
        pollAutopilotStatus();
      } catch (e) {}
    });
  }

  // Botão Ativar Alertas no Desktop
  if (btnNotif) {
    if ('Notification' in window && Notification.permission === 'granted') {
      btnNotif.textContent = '✅ Alertas Ativos';
      btnNotif.style.borderColor = 'var(--color-green)';
    }

    btnNotif.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        alert('Seu navegador não suporta notificações de área de trabalho.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        playSuccessChime();
        sendDesktopNotification('Pinas Prospector (@pinas.studio)', '🔔 Notificações ativadas! Você será avisado quando a IA fechar reuniões.');
        btnNotif.textContent = '✅ Alertas Ativos';
        btnNotif.style.borderColor = 'var(--color-green)';
        showToastNotification('🔔 Notificações na área de trabalho ativadas!');
      }
    });
  }

  if (autoresponderToggle) {
    autoresponderToggle.addEventListener('change', async () => {
      if (stepTemplatesData) {
        stepTemplatesData.settings = stepTemplatesData.settings || {};
        stepTemplatesData.settings.autoResponderEnabled = autoresponderToggle.checked;
        stepTemplatesData.settings.useGeminiConversationalAi = autoresponderToggle.checked;
        try {
          await fetch('/api/step-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stepTemplatesData)
          });
          showToastNotification(`Conversa Contínua da IA ${autoresponderToggle.checked ? 'ativada' : 'pausada'}.`);
        } catch (e) {}
      }
    });
  }

  // Botão Caçar Sites Ruins na Web
  const btnHunt = document.getElementById('btn-hunt-bad-sites');
  if (btnHunt) {
    btnHunt.addEventListener('click', async () => {
      btnHunt.disabled = true;
      const oldHtml = btnHunt.innerHTML;
      btnHunt.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; border-width: 2px; display: inline-block;"></span> Caçando na Web...';
      showToastNotification('🎯 Caçando empresas com sites ruins ou sem site em SP...');

      try {
        const res = await fetch('/api/scrape/hunt-bad-sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxResults: 8 })
        });
        const data = await res.json();
        if (data.success) {
          showToastNotification('🔍 Varredura iniciada! Monitorando oportunidades...');
          if (typeof pollScraperProgress === 'function') {
            pollScraperProgress();
          }
        } else {
          alert(data.error || 'Não foi possível iniciar a caça no momento.');
        }
      } catch (err) {
        alert('Erro ao caçar sites ruins: ' + err.message);
      } finally {
        setTimeout(() => {
          btnHunt.disabled = false;
          btnHunt.innerHTML = oldHtml;
        }, 4000);
      }
    });
  }

  // Polling inicial de status e cota do Gemini Free Tier
  pollAutopilotStatus();
  updateGeminiFreeTierWidget();

  // Polling contínuo em segundo plano
  setInterval(pollAutopilotStatus, 3000);
  setInterval(updateGeminiFreeTierWidget, 15000);
}

// Atualizar indicador oficial do Gemini Free Tier no cabeçalho
async function updateGeminiFreeTierWidget() {
  const kpiEl = document.getElementById('kpi-gemini-usage');
  if (!kpiEl) return;

  try {
    const res = await fetch('/api/gemini/free-tier');
    if (!res.ok) return;
    const data = await res.json();

    const today = data.requestsToday || 0;
    const limit = data.limitDaily || 1200;
    const rpm = data.requestsThisMinute || 0;

    kpiEl.textContent = `${today} / 1500 (Grátis 🟢)`;
    kpiEl.title = `Google Gemini Free Tier: ${today} chamadas hoje de 1.500 gratuitas (${rpm}/10 RPM). Custo: R$ 0,00`;

    const pill = document.getElementById('header-gemini-free-pill');
    if (pill) {
      if (today >= 1200) {
        pill.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        kpiEl.textContent = `${today} / 1500 (Limite Seguro 🛑)`;
      } else if (today >= 900) {
        pill.style.borderColor = 'rgba(234, 179, 8, 0.5)';
      } else {
        pill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      }
    }
  } catch (err) {}
}

// Consultar status do Piloto Automático no servidor
async function pollAutopilotStatus() {
  try {
    const res = await fetch('/api/autopilot/status');
    if (!res.ok) return;
    const status = await res.json();

    renderAutopilotStatus(status);
  } catch (err) {}
}

// Renderizar o estado do Piloto Automático na interface
function renderAutopilotStatus(status) {
  const btnStart = document.getElementById('btn-start-autopilot');
  const btnPause = document.getElementById('btn-pause-autopilot');
  const dot = document.getElementById('autopilot-dot');
  const statusLabel = document.getElementById('autopilot-status-label');
  const boxCountdown = document.getElementById('autopilot-countdown-box');
  const secondsLeftEl = document.getElementById('autopilot-seconds-left');
  const targetLeadEl = document.getElementById('autopilot-target-lead');
  const auditBox = document.getElementById('autopilot-audit-box');
  const auditStatus = document.getElementById('autopilot-audit-status');
  const auditDetails = document.getElementById('autopilot-audit-details');
  const autostartToggle = document.getElementById('autopilot-autostart-toggle');
  const liveLogsContainer = document.getElementById('autopilot-live-logs');
  const windowStatusPill = document.getElementById('autopilot-window-status-pill');

  autopilotRunning = !!status.isActive;

  if (windowStatusPill && status.commercialWindow) {
    const startH = status.commercialWindow.start !== undefined ? status.commercialWindow.start : 10;
    const endH = status.commercialWindow.end !== undefined ? status.commercialWindow.end : 19;
    if (status.isWithinCommercialHours) {
      windowStatusPill.innerHTML = `🟢 Aberta: ${startH}h às ${endH}h (SP)`;
      windowStatusPill.style.background = 'rgba(16, 185, 129, 0.2)';
      windowStatusPill.style.color = '#34D399';
      windowStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      windowStatusPill.innerHTML = `🌙 Standby: ${startH}h às ${endH}h (SP)`;
      windowStatusPill.style.background = 'rgba(251, 191, 36, 0.2)';
      windowStatusPill.style.color = '#FBBF24';
      windowStatusPill.style.borderColor = 'rgba(251, 191, 36, 0.4)';
    }
  }

  if (autostartToggle && status.autoStartAutopilot !== undefined) {
    if (document.activeElement !== autostartToggle) {
      autostartToggle.checked = (status.autoStartAutopilot !== false);
    }
  }

  if (status.isActive) {
    if (btnStart) btnStart.style.display = 'none';
    if (btnPause) btnPause.style.display = 'block';
    if (dot) dot.classList.add('active');

    if (statusLabel) {
      if (status.isSleepingNight) {
        statusLabel.innerHTML = 'Piloto Automático: <strong style="color: #60a5fa;">🌙 Standby Noturno (Meta Batida) • IA 24/7 Ativa</strong>';
      } else if (!status.isWithinCommercialHours && status.commercialWindow) {
        statusLabel.innerHTML = `Piloto Automático: <strong style="color: #FBBF24;">🌙 Standby (Fora da Janela ${status.commercialWindow.start}h-${status.commercialWindow.end}h) • IA 24/7 Ativa</strong>`;
      } else if (status.isProcessing) {
        statusLabel.innerHTML = 'Piloto Automático: <strong style="color: var(--color-yellow);">🔍 Auditando Site & Maps + Gerando Pitch IA...</strong>';
      } else {
        statusLabel.innerHTML = 'Piloto Automático: <strong style="color: var(--color-green);">⚡ Ativo 100% Autônomo (Janela Aberta)</strong>';
      }
    }

    if (boxCountdown) boxCountdown.style.display = 'block';
    if (secondsLeftEl && status.nextRunSeconds !== null && status.nextRunSeconds !== undefined) {
      secondsLeftEl.textContent = `${status.nextRunSeconds}s`;
    }

    if (targetLeadEl) {
      if (status.isSleepingNight) {
        targetLeadEl.innerHTML = `🌙 <strong>Standby Noturno:</strong> Meta de disparos frios batida. Respostas no WhatsApp ativas 24/7. Novos disparos retornam à meia-noite.`;
      } else if (!status.isWithinCommercialHours && status.commercialWindow) {
        targetLeadEl.innerHTML = `🌙 <strong>Fora da Janela Comercial:</strong> Novos leads são disparados entre ${status.commercialWindow.start}h e ${status.commercialWindow.end}h. Atendimento IA a respostas continua ativo 24/7!`;
      } else if (status.currentLead) {
        targetLeadEl.innerHTML = `🎯 <strong>Processando agora:</strong> ${status.currentLead.name} (${status.currentLead.neighborhood || 'SP'})`;
      } else if (status.nextRunSeconds > 0) {
        targetLeadEl.innerHTML = `⏳ Aguardando intervalo de segurança anti-bloqueio (${status.nextRunSeconds}s restantes)...`;
      } else {
        targetLeadEl.innerHTML = `🚀 Selecionando próximo lead novo ou caçando na web...`;
      }
    }
  } else {
    if (btnStart) btnStart.style.display = 'block';
    if (btnPause) btnPause.style.display = 'none';
    if (dot) dot.classList.remove('active');

    if (statusLabel) {
      statusLabel.innerHTML = 'Piloto Automático: <strong>Parado</strong>';
    }

    if (boxCountdown) boxCountdown.style.display = 'none';
  }

  // Renderizar a auditoria do último lead processado
  if (status.lastAudit && status.lastPitch && auditBox && auditDetails) {
    auditBox.style.display = 'block';
    if (auditStatus) auditStatus.textContent = '✅ Última Auditoria Real';

    const audit = status.lastAudit;
    const pitch = status.lastPitch;
    const site = audit.site || {};
    const maps = audit.maps || {};

    const siteText = site.hasWebsite
      ? (site.isOnline ? `Online (${(site.loadTimeMs / 1000).toFixed(1)}s) • WhatsApp: ${site.hasWhatsApp ? '✅ Sim' : '❌ Não'} • Pixel/Ads: ${site.doesPaidTraffic ? '✅ Ativo' : '❌ Sem Pixel'}` : '⚠️ Fora do Ar')
      : '❌ Sem Site Próprio';
    const mapsText = `${maps.reviews || 0} avaliações (${maps.rating ? Number(maps.rating).toFixed(1) : 'Sem nota'}★) • ${maps.hasPhone ? 'Com telefone' : 'Sem telefone'}`;
    const gargalo = pitch.auditSummary || pitch.angleUsed || audit.primaryAngle || 'Atração local';

    auditDetails.innerHTML = `
      <div style="margin-bottom: 4px; font-weight: 600; color: var(--text-primary);">
        🌐 <strong>Site:</strong> <span style="color: var(--text-secondary);">${siteText}</span>
      </div>
      <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 5px; line-height: 1.4;">
        📍 <strong>Google Maps:</strong> ${mapsText}<br>
        🎯 <strong>Gargalo Diagnosticado:</strong> <span style="color: var(--color-red); font-weight: 500;">${gargalo}</span>
      </div>
      <div style="background: rgba(255,255,255,0.04); border-left: 2px solid var(--color-green); padding: 5px 8px; border-radius: 2px; font-size: 0.74rem; color: var(--text-primary); font-style: italic;">
        "${pitch.pitchText}"
      </div>
    `;
  }

  // Renderizar Feed de Ações da IA em Tempo Real
  if (liveLogsContainer && status.logs && status.logs.length > 0) {
    liveLogsContainer.innerHTML = status.logs.slice(0, 15).map(l => {
      let icon = '⚡';
      let color = '#a1a1aa';
      if (l.type === 'audit') { icon = '🔍'; color = '#60a5fa'; }
      else if (l.type === 'ai') { icon = '🤖'; color = '#c084fc'; }
      else if (l.type === 'send') { icon = '✉️'; color = '#34d399'; }
      else if (l.type === 'success') { icon = '🎉'; color = '#4ade80'; }
      else if (l.type === 'warn') { icon = '⚠️'; color = '#fbbf24'; }
      return `<div style="display: flex; gap: 6px; align-items: baseline; line-height: 1.35; padding: 2px 0;">
        <span style="color: #71717a; font-size: 0.68rem; flex-shrink: 0;">[${l.timeFormatted || ''}]</span>
        <span style="color: ${color};">${icon} ${l.message}</span>
      </div>`;
    }).join('');
  }

  // Atualizar contadores do dia
  if (status.dispatchedToday !== undefined) {
    appConfig.sentToday = status.dispatchedToday;
    if (status.dailyLimit !== undefined) appConfig.dailyLimit = status.dailyLimit;
    updateSafetyWidget();
  }
}

async function startAutopilot() {
  // 0. Validar conexão com o WhatsApp
  const wa = await fetchWhatsAppStatus();
  if (!wa.connected) {
    alert('⚠️ Para disparar no Piloto Automático direto pelo sistema sem intervenção manual, conecte o WhatsApp escaneando o QR Code.');
    openWhatsAppConnectModal();
    return;
  }

  // 1. Chamar endpoint de ativação no backend (se a esteira estiver zerada, o backend caça sites ruins na web automaticamente!)
  try {
    const res = await fetch('/api/autopilot/start', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToastNotification('🚀 Piloto Automático 100% Autônomo INICIADO em 2º plano!');
      pollAutopilotStatus();
    } else {
      alert(data.message || 'Não foi possível iniciar o Piloto Automático.');
    }
  } catch (err) {
    console.error('Erro ao iniciar piloto automático:', err);
    alert('Erro ao iniciar o piloto automático: ' + err.message);
  }
}

async function pauseAutopilot(reason = '') {
  try {
    const res = await fetch('/api/autopilot/stop', { method: 'POST' });
    const data = await res.json();
    showToastNotification('⏸️ Piloto Automático Pausado.');
    pollAutopilotStatus();
  } catch (err) {
    console.error('Erro ao pausar piloto automático:', err);
  }

  if (reason && reason !== 'Piloto Automático pausado pelo operador.') {
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
    if (data && data.connected) {
      playSuccessChime();
      showToastNotification('WhatsApp conectado com sucesso! O sistema está pronto.');
      closeWhatsAppConnectModal();
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

    // Se estiver desconectado e sem QR Code pronto, solicita imediatamente geração de QR Code
    if (!data.connected && data.status === 'disconnected') {
      requestWhatsAppConnect();
    }

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

      if (currentActiveLead.status === 'contatado') {
        alert('🛡️ Bloqueado pela Regra Anti-Spam da Pinas:\n\nEste lead já recebeu a 1ª mensagem de abordagem e ainda NÃO respondeu.\n\nNunca enviamos mais de uma mensagem sem retorno. O sistema responderá automaticamente com IA assim que o lead responder no WhatsApp!');
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

  const closeLeadModal = () => {
    if (modalLead) modalLead.style.display = 'none';
  };

  if (btnOpenLead) {
    btnOpenLead.addEventListener('click', () => {
      closeChatLightbox();
      if (modalLead) modalLead.style.display = 'flex';
      const inputName = document.getElementById('manual-name');
      if (inputName) inputName.focus();
    });
  }
  if (btnCloseLead) btnCloseLead.addEventListener('click', closeLeadModal);
  if (btnCancelLead) btnCancelLead.addEventListener('click', closeLeadModal);

  if (modalLead) {
    modalLead.addEventListener('click', (e) => {
      if (e.target === modalLead) {
        closeLeadModal();
      }
    });
  }

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
  const btnGemini = document.getElementById('btn-mode-gemini');
  const btnCallScript = document.getElementById('btn-mode-callscript');
  const containerStages = document.getElementById('modal-mode-stages-container');
  const containerClassic = document.getElementById('modal-mode-classic-container');
  const containerGemini = document.getElementById('modal-mode-gemini-container');
  const containerCallScript = document.getElementById('modal-mode-callscript-container');
  const btnConfirmWa = document.getElementById('btn-confirm-wa-send');
  const btnCopyWa = document.getElementById('btn-copy-wa-message');

  [btnStages, btnClassic, btnGemini, btnCallScript].forEach(b => b && b.classList.remove('active'));
  [containerStages, containerClassic, containerGemini, containerCallScript].forEach(c => c && (c.style.display = 'none'));

  if (mode === 'stages') {
    if (btnStages) btnStages.classList.add('active');
    if (containerStages) containerStages.style.display = 'block';
    if (btnConfirmWa) btnConfirmWa.style.display = 'none';
    if (btnCopyWa) btnCopyWa.style.display = 'none';
  } else if (mode === 'classic') {
    if (btnClassic) btnClassic.classList.add('active');
    if (containerClassic) containerClassic.style.display = 'block';
    if (btnConfirmWa) btnConfirmWa.style.display = 'inline-flex';
    if (btnCopyWa) btnCopyWa.style.display = 'inline-flex';
  } else if (mode === 'gemini') {
    if (btnGemini) btnGemini.classList.add('active');
    if (containerGemini) containerGemini.style.display = 'block';
    if (btnConfirmWa) btnConfirmWa.style.display = 'none';
    if (btnCopyWa) btnCopyWa.style.display = 'none';
    if (currentActiveLead) {
      loadGeminiLeadView(currentActiveLead);
    }
  } else if (mode === 'callscript') {
    if (btnCallScript) btnCallScript.classList.add('active');
    if (containerCallScript) containerCallScript.style.display = 'block';
    if (btnConfirmWa) btnConfirmWa.style.display = 'none';
    if (btnCopyWa) btnCopyWa.style.display = 'none';

    // Esconde o spinner de loading do site para não ficar carregamento infinito
    const siteLoadingEl = document.getElementById('callscript-view-loading');
    if (siteLoadingEl) siteLoadingEl.style.display = 'none';

    if (currentActiveLead) {
      loadWhatsAppConversationScript(currentActiveLead);
      if (currentActiveLead.deepVisualAudit && currentActiveLead.callScript) {
        renderDeepVisualAuditAndCallScriptHtml(currentActiveLead, currentActiveLead.deepVisualAudit, currentActiveLead.callScript);
      } else {
        renderAuditPlaceholderCard(currentActiveLead);
      }
    }
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
  const isWaitingReply = (lead.status === 'contatado');

  let bannerHtml = '';
  if (isWaitingReply) {
    bannerHtml = `
      <div class="alert-conversation-guard" style="background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem; color: #FDE047; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.2rem;">⏳</span>
        <div>
          <strong>Aguardando Resposta do Lead:</strong> A mensagem inicial já foi entregue. Pela regra de ouro da Pinas, <em>nunca enviamos mais de uma mensagem sem retorno</em>. O sistema responderá automaticamente com IA assim que o cliente responder no WhatsApp!
        </div>
      </div>
    `;
  } else if (lead.status === 'respondeu') {
    bannerHtml = `
      <div class="alert-conversation-guard" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.82rem; color: #6EE7B7; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.2rem;">💬</span>
        <div>
          <strong>Lead Respondeu:</strong> O cliente interagiu por último no WhatsApp. Você pode enviar a próxima etapa abaixo ou deixar o Auto-Responder responder autonomamente!
        </div>
      </div>
    `;
  }

  const cardsHtml = stepTemplatesData.stages.map(st => {
    const isCurrent = st.number === currentStage;
    const isSent = lead.stageHistory && lead.stageHistory.some(h => h.stage === st.number);
    const formattedText = formatStageText(lead, st.number, withSite);

    let statusBadge = '';
    if (isSent) {
      statusBadge = '<span class="stage-badge-status badge-sent">✅ Enviada</span>';
    } else if (isCurrent) {
      statusBadge = '<span class="stage-badge-status badge-pending">👉 Próxima etapa</span>';
    }

    const disableSendBtn = isWaitingReply || isSent;
    const btnSendLabel = isWaitingReply ? '⏳ Aguardando Resposta' : (isSent ? '✅ Já Enviada' : '💬 Enviar Etapa');
    const btnSendTitle = isWaitingReply ? 'Bloqueado: Aguardando o cliente responder antes de enviar nova mensagem' : 'Disparar esta etapa no WhatsApp';

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
            <button type="button" class="btn-stage-tool btn-send-wa" onclick="sendLeadStage(${st.number})" ${disableSendBtn ? 'disabled style="opacity: 0.45; cursor: not-allowed;"' : ''} title="${btnSendTitle}">
              ${btnSendLabel}
            </button>
          </div>
        </div>
        <textarea class="stage-textarea" id="stage-textarea-${st.number}" rows="${st.number === 4 ? 6 : (st.number === 3 ? 3 : 2)}">${formattedText}</textarea>
      </div>
    `;
  }).join('');

  wrapper.innerHTML = bannerHtml + cardsHtml;

  // Atualizar badge no header do modal
  const badgeEl = document.getElementById('modal-wa-lead-stage-badge');
  if (badgeEl) {
    const stageNames = ['', 'Abertura', 'Apresentação', 'Diagnóstico', 'Proposta de Valor', 'Fechamento'];
    badgeEl.textContent = `Etapa Atual: ${currentStage}. ${stageNames[currentStage] || 'Concluído'}${isWaitingReply ? ' • ⏳ Aguardando Lead' : ''}`;
  }

  // Atualizar texto do botão do topo
  const btnTopSend = document.getElementById('btn-send-current-stage');
  if (btnTopSend) {
    if (isWaitingReply) {
      btnTopSend.disabled = true;
      btnTopSend.style.opacity = '0.5';
      btnTopSend.style.cursor = 'not-allowed';
      btnTopSend.innerHTML = `<span>⏳ Aguardando Resposta do Lead (Anti-Spam Ativo)</span>`;
    } else {
      btnTopSend.disabled = false;
      btnTopSend.style.opacity = '1';
      btnTopSend.style.cursor = 'pointer';
      btnTopSend.innerHTML = `<span>💬 Enviar Etapa ${currentStage} no WhatsApp</span>`;
    }
  }
}

async function sendLeadStage(stageNum) {
  if (!currentActiveLead) return;

  if (currentActiveLead.status === 'contatado') {
    alert('🛡️ Bloqueado pela Regra Anti-Spam da Pinas:\n\nEste lead já recebeu a mensagem de abordagem e ainda NÃO respondeu.\n\nNunca enviamos mais de uma mensagem sem retorno do cliente. O sistema responderá automaticamente assim que ele mandar uma mensagem!');
    return;
  }

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

function openWhatsAppModal(leadId, defaultMode = 'stages') {
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

  // Iniciar no modo escolhido (stages, classic ou gemini)
  switchModalMode(defaultMode);

  document.getElementById('modal-whatsapp').style.display = 'flex';
}

// ==================== CONTROLES DE IA (GEMINI) ====================

let geminiPitchesCache = new Map(); // leadId -> pitches

function renderGeminiDiagnosisHtml(analysis) {
  if (!analysis) return '';

  const strengthsHtml = Array.isArray(analysis.strengths) && analysis.strengths.length
    ? `<ul>${analysis.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : '<p>Boa presença e atuação na região.</p>';

  const weaknessesHtml = Array.isArray(analysis.weaknesses) && analysis.weaknesses.length
    ? `<ul>${analysis.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : '<p>Sem gargalos críticos detectados.</p>';

  const scoreBadge = analysis.opportunityScore ? ` <span class="badge-gemini-chip" style="margin-left: 6px;">Potencial ${analysis.opportunityScore}/10</span>` : '';

  return `
    <div class="gemini-diag-summary">
      <strong>Resumo Comercial:</strong> ${escapeHtml(analysis.summary || 'Negócio local com oportunidade de atração digital.')} ${scoreBadge}
    </div>
    <div class="gemini-diag-grid">
      <div class="gemini-diag-item strengths">
        <h5><span>🟢</span> Pontos Fortes</h5>
        ${strengthsHtml}
      </div>
      <div class="gemini-diag-item weaknesses">
        <h5><span>⚠️</span> Gargalos / Oportunidade</h5>
        ${weaknessesHtml}
      </div>
      <div class="gemini-diag-item angle">
        <h5><span>🎯</span> Melhor Gancho para o Kauê</h5>
        <p>${escapeHtml(analysis.bestAngle || 'Elogiar reputação e apresentar oportunidade de site + Google Ads.')}</p>
      </div>
    </div>
  `;
}

async function loadGeminiLeadView(lead) {
  const contentEl = document.getElementById('gemini-diagnosis-content');
  const loadingEl = document.getElementById('gemini-diagnosis-loading');

  if (lead.aiAnalysis) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.innerHTML = renderGeminiDiagnosisHtml(lead.aiAnalysis);
  } else {
    await refreshGeminiAnalysis();
  }

  // Se já temos pitches em cache para este lead, renderizar; senão, gerar!
  if (geminiPitchesCache.has(lead.id)) {
    renderGeminiPitchesHtml(geminiPitchesCache.get(lead.id));
  } else {
    await generateGeminiPitches();
  }
}

async function refreshGeminiAnalysis() {
  if (!currentActiveLead) return;
  const contentEl = document.getElementById('gemini-diagnosis-content');
  const loadingEl = document.getElementById('gemini-diagnosis-loading');

  if (contentEl) contentEl.innerHTML = '';
  if (loadingEl) loadingEl.style.display = 'block';

  try {
    const res = await fetch('/api/gemini/analyze-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: currentActiveLead.id })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na análise com Gemini');

    currentActiveLead.aiAnalysis = data.analysis;
    const idx = allLeads.findIndex(l => l.id === currentActiveLead.id);
    if (idx !== -1) allLeads[idx].aiAnalysis = data.analysis;

    if (contentEl) contentEl.innerHTML = renderGeminiDiagnosisHtml(data.analysis);
  } catch (err) {
    console.error('Erro ao analisar lead com Gemini:', err);
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="padding: 1rem; color: #EF4444; font-size: 0.85rem;">
          ⚠️ Não foi possível obter o diagnóstico com o Gemini: ${escapeHtml(err.message)}
        </div>
      `;
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function renderGeminiPitchesHtml(pitches) {
  const wrapper = document.getElementById('gemini-pitches-cards-wrapper');
  if (!wrapper) return;

  if (!pitches || pitches.length === 0) {
    wrapper.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">Nenhum roteiro gerado.</p>`;
    return;
  }

  wrapper.innerHTML = pitches.map((pitch, idx) => {
    return `
      <div class="gemini-pitch-card">
        <div class="gemini-pitch-card-top">
          <div class="gemini-pitch-card-title">
            ${escapeHtml(pitch.title)}
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Opção ${idx + 1} de 3</span>
        </div>
        <div class="gemini-pitch-text-box" id="gemini-pitch-text-${idx}">${escapeHtml(pitch.text)}</div>
        <div class="gemini-pitch-card-actions">
          <button type="button" class="btn btn-outline btn-xs" onclick="copyGeminiPitch(${idx})" title="Copiar texto da mensagem">
            📋 Copiar
          </button>
          <button type="button" class="btn btn-outline btn-xs" onclick="useGeminiPitchInModal(${idx})" title="Carregar no editor para ajustar">
            ✏️ Usar no Editor
          </button>
          <button type="button" class="btn btn-whatsapp btn-xs" onclick="sendGeminiPitchDirect(${idx})" title="Disparar direto no WhatsApp conectado">
            <span>🚀</span> Disparar no WhatsApp
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function generateGeminiPitches() {
  if (!currentActiveLead) return;
  const wrapper = document.getElementById('gemini-pitches-cards-wrapper');
  const loadingEl = document.getElementById('gemini-pitches-loading');
  const btnGen = document.getElementById('btn-generate-gemini-pitches');
  const guidanceInput = document.getElementById('gemini-extra-guidance');
  const guidance = guidanceInput ? guidanceInput.value.trim() : '';

  if (wrapper) wrapper.innerHTML = '';
  if (loadingEl) loadingEl.style.display = 'block';
  if (btnGen) {
    btnGen.disabled = true;
    btnGen.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Gerando...';
  }

  try {
    const res = await fetch('/api/gemini/generate-pitches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: currentActiveLead.id,
        guidance
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar abordagens com Gemini');

    geminiPitchesCache.set(currentActiveLead.id, data.pitches);
    renderGeminiPitchesHtml(data.pitches);
  } catch (err) {
    console.error('Erro ao gerar abordagens com Gemini:', err);
    if (wrapper) {
      wrapper.innerHTML = `
        <div style="padding: 1rem; color: #EF4444; font-size: 0.85rem;">
          ⚠️ Erro ao gerar abordagens: ${escapeHtml(err.message)}
        </div>
      `;
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (btnGen) {
      btnGen.disabled = false;
      btnGen.innerHTML = '<span>✨ Gerar Novas Opções</span>';
    }
  }
}

function copyGeminiPitch(idx) {
  const el = document.getElementById(`gemini-pitch-text-${idx}`);
  if (el) {
    navigator.clipboard.writeText(el.innerText || el.textContent);
    showToastNotification('Mensagem copiada para a área de transferência!');
  }
}

function useGeminiPitchInModal(idx) {
  const el = document.getElementById(`gemini-pitch-text-${idx}`);
  if (!el) return;
  const text = el.innerText || el.textContent;
  
  switchModalMode('classic');
  const preview = document.getElementById('modal-wa-message-preview');
  if (preview) {
    preview.value = text;
    preview.focus();
  }
  showToastNotification('Texto carregado no editor clássico!');
}

async function sendGeminiPitchDirect(idx) {
  if (!currentActiveLead) return;
  const el = document.getElementById(`gemini-pitch-text-${idx}`);
  if (!el) return;
  const text = el.innerText || el.textContent;
  const cleanPhone = currentActiveLead.cleanPhone;

  if (!cleanPhone || cleanPhone.length < 10) {
    alert('Telefone do lead inválido ou incompleto.');
    return;
  }

  if (currentActiveLead.status === 'contatado') {
    alert('🛡️ Bloqueado pela Regra Anti-Spam da Pinas:\n\nEste lead já recebeu a 1ª mensagem de abordagem e ainda NÃO respondeu.\n\nA Pinas nunca envia mais de uma mensagem sem retorno. O sistema responderá automaticamente com IA assim que o cliente responder no WhatsApp!');
    return;
  }

  if (!currentWaStatus.connected) {
    alert('⚠️ WhatsApp Desconectado.\n\nConecte seu aparelho no menu lateral para disparar diretamente!');
    openWhatsAppConnectModal();
    return;
  }

  if (!confirm(`Confirmar disparo direto no WhatsApp para "${currentActiveLead.name}"?`)) return;

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
    if (!res.ok) throw new Error(data.error || 'Erro no envio');

    currentActiveLead.status = 'contatado';
    if (data.sentToday !== undefined) {
      appConfig.sentToday = data.sentToday;
    }
    updateSafetyWidget();
    renderCadenceQueue();
    renderLeadsTable(allLeads);

    document.getElementById('modal-whatsapp').style.display = 'none';
    showSuccessModal({
      title: 'Mensagem Enviada com IA!',
      message: `A abordagem personalizada com Gemini foi enviada com sucesso para "${currentActiveLead.name}"!`,
      icon: '✨'
    });
  } catch (err) {
    alert(`Erro ao enviar: ${err.message}`);
  }
}

// ==================== ROTEIRO DA CONVERSA DO WHATSAPP (RESUMO DO CHAT + FECHAMENTO) ====================

async function loadWhatsAppConversationScript(lead, forceRefresh = false) {
  if (!lead) return;
  const container = document.getElementById('wa-conversation-script-container');
  if (!container) return;

  // Se já tiver em cache e não pediu recálculo forçado
  if (lead.conversationScript && !forceRefresh) {
    renderWhatsAppConversationScriptHtml(lead, lead.conversationScript);
    return;
  }

  container.innerHTML = `
    <div class="wa-script-box" style="text-align: center; padding: 2.2rem 1.5rem; background: rgba(255, 0, 85, 0.04); border: 1px dashed rgba(255, 0, 85, 0.35);">
      <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin: 0 auto 0.85rem; border-top-color: #FF0055;"></div>
      <strong style="display: block; font-size: 1.05rem; color: #fff; margin-bottom: 5px;">
        🧠 Analisando Conversa do WhatsApp com IA Pinas...
      </strong>
      <span style="font-size: 0.85rem; color: var(--text-secondary); max-width: 520px; display: inline-block;">
        Lendo o histórico real trocado com "${escapeHtml(lead.name)}", mapeando perfil do decisor, dores confessadas e estruturando gancho de call de 15 min...
      </span>
    </div>
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7500);

  try {
    const res = await fetch(`/api/leads/${lead.id}/conversation-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRefresh }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao gerar roteiro baseado no WhatsApp');

    lead.conversationScript = data.conversationScript;
    lead.conversationScriptGeneratedAt = new Date().toISOString();

    // Sincroniza allLeads
    const idx = allLeads.findIndex(l => l.id === lead.id);
    if (idx !== -1) {
      allLeads[idx] = { ...allLeads[idx], ...lead };
    }

    renderWhatsAppConversationScriptHtml(lead, data.conversationScript);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('Erro ao carregar roteiro do WhatsApp:', err);
    container.innerHTML = `
      <div class="wa-script-box" style="padding: 1.75rem; text-align: center; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05);">
        <span style="font-size: 1.8rem;">⚠️</span>
        <strong style="display: block; font-size: 0.95rem; color: #fff; margin: 6px 0;">Falha ao carregar o roteiro</strong>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1rem;">${err.name === 'AbortError' ? 'A resposta demorou mais que o esperado.' : escapeHtml(err.message)}</p>
        <button type="button" class="btn btn-outline btn-sm" onclick="loadWhatsAppConversationScript(currentActiveLead, true)">
          🔄 Tentar Novamente
        </button>
      </div>
    `;
  }
}

function renderWhatsAppConversationScriptHtml(lead, scriptData) {
  const container = document.getElementById('wa-conversation-script-container');
  if (!container || !scriptData) return;

  const interlocutor = scriptData.interlocutor || {};
  const pains = Array.isArray(scriptData.painsAndNeeds) ? scriptData.painsAndNeeds : [];
  const objections = Array.isArray(scriptData.objectionsAndAnswers) ? scriptData.objectionsAndAnswers : [];
  const callScript = scriptData.callScript || {};
  const steps = Array.isArray(callScript.steps) ? callScript.steps : [];

  const painsHtml = pains.length > 0
    ? `<ul class="wa-script-pains-list">${pains.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
    : `<p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">Nenhuma dor explícita informada ainda.</p>`;

  const objectionsHtml = objections.length > 0
    ? objections.map(o => `
        <div class="objection-item">
          <div class="obj-q">❓ Objeção: "${escapeHtml(o.objection)}"</div>
          <div class="obj-a">💡 <strong>Kauê:</strong> ${escapeHtml(o.howToCounter)}</div>
        </div>
      `).join('')
    : `<p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">Sem objeções críticas registradas até o momento.</p>`;

  const stepsHtml = steps.map((s, idx) => {
    let extraContent = '';
    if (Array.isArray(s.questions) && s.questions.length > 0) {
      extraContent += `
        <div class="wa-step-questions">
          <strong>Perguntas Estratégicas para o Decisor:</strong>
          ${s.questions.map(q => `<span>• ${escapeHtml(q.question || q)} ${q.why ? `<small>(${escapeHtml(q.why)})</small>` : ''}</span>`).join('')}
        </div>
      `;
    }
    if (Array.isArray(s.keyPoints) && s.keyPoints.length > 0) {
      extraContent += `
        <ul class="wa-step-keypoints">
          ${s.keyPoints.map(kp => `<li>${escapeHtml(kp)}</li>`).join('')}
        </ul>
      `;
    }

    return `
      <div class="wa-step-card">
        <div class="wa-step-header">
          <span class="wa-step-time">${escapeHtml(s.time || `0${idx*3}:00`)}</span>
          <strong class="wa-step-title">${idx + 1}. ${escapeHtml(s.title || 'Etapa')}</strong>
          ${s.objective ? `<span class="wa-step-goal">🎯 ${escapeHtml(s.objective)}</span>` : ''}
        </div>
        ${s.script ? `<div class="wa-step-speech">"${escapeHtml(s.script)}"</div>` : ''}
        ${extraContent}
        ${s.tip ? `<div class="wa-step-tip">💡 <strong>Postura:</strong> ${escapeHtml(s.tip)}</div>` : ''}
        ${s.callToAction ? `<div style="font-size: 0.8rem; color: #34D399; margin-top: 4px;">🚀 <strong>Próxima Ação:</strong> ${escapeHtml(s.callToAction)}</div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="wa-script-box">
      <!-- Topo do Card de Roteiro WhatsApp -->
      <div class="wa-script-header">
        <div class="wa-script-title-wrap">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.3rem;">💬</span>
            <h4 style="margin: 0; font-size: 1.05rem; color: #fff; font-weight: 800;">
              Roteiro de Fechamento Baseado no WhatsApp
            </h4>
            <span class="badge-reply ${scriptData.hasCustomerReplied ? 'has-reply' : 'waiting-reply'}">
              ${scriptData.hasCustomerReplied ? '🟢 Cliente Já Respondeu' : '⏳ Aguardando Resposta'}
            </span>
          </div>
          <p style="margin: 3px 0 0; font-size: 0.8rem; color: var(--text-secondary);">
            Resumo do diálogo no chat, perfil do interlocutor, dores admitidas e roteiro de reunião sob medida.
          </p>
        </div>
        <div class="wa-script-actions">
          <button type="button" class="btn btn-primary btn-xs" onclick="copyWhatsAppConversationScriptText()" style="font-weight: 700;">
            📋 Copiar Roteiro WhatsApp
          </button>
          <button type="button" class="btn btn-outline btn-xs" onclick="loadWhatsAppConversationScript(currentActiveLead, true)" title="Reanalisar mensagens com a IA">
            🔄 Atualizar com Novas Mensagens
          </button>
        </div>
      </div>

      <!-- Alerta se cliente ainda não respondeu -->
      ${!scriptData.hasCustomerReplied ? `
        <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px; font-size: 0.8rem; color: #FDE047; display: flex; align-items: center; gap: 8px;">
          <span>⏳</span>
          <span>O cliente ainda não respondeu no WhatsApp. O roteiro foi calibrado estrategicamente para reengajamento e abertura de conversa assim que ele responder.</span>
        </div>
      ` : ''}

      <!-- Resumo Executivo da Conversa -->
      <div class="wa-script-summary-card">
        <div class="summary-label">
          <span>📝</span> Resumo Executivo da Conversa no WhatsApp
        </div>
        <div class="summary-body">
          ${escapeHtml(scriptData.conversationSummary || 'Nenhuma mensagem relevante trocada ainda.')}
        </div>
      </div>

      <!-- Perfil do Interlocutor / Decisor -->
      <div class="wa-script-tags-row">
        <div class="wa-tag-pill">
          <span class="tag-label">Interlocutor:</span>
          <span class="tag-val">${escapeHtml(interlocutor.name || 'Não identificado')}</span>
        </div>
        <div class="wa-tag-pill">
          <span class="tag-label">Cargo / Papel:</span>
          <span class="tag-val">${escapeHtml(interlocutor.role || 'Não especificado')}</span>
        </div>
        <div class="wa-tag-pill">
          <span class="tag-label">Poder de Decisão:</span>
          <span class="tag-val">${escapeHtml(interlocutor.decisionPower || 'Médio')}</span>
        </div>
        <div class="wa-tag-pill">
          <span class="tag-label">Tom do Lead:</span>
          <span class="tag-val">${escapeHtml(interlocutor.tone || 'Neutro')}</span>
        </div>
      </div>

      <!-- Dores Admitidas & Objeções -->
      <div class="wa-script-insights-grid">
        <div class="insight-col">
          <div class="insight-col-header">
            <span>⚡</span> Dores e Necessidades Identificadas no Chat
          </div>
          ${painsHtml}
        </div>
        <div class="insight-col">
          <div class="insight-col-header">
            <span>🛡️</span> Objeções do WhatsApp & Resposta do Kauê
          </div>
          ${objectionsHtml}
        </div>
      </div>

      <!-- Próximos passos combinados -->
      ${scriptData.agreedNextSteps ? `
        <div class="wa-script-agreed-box">
          <strong>📌 Próximos Passos Combinados no Chat:</strong> ${escapeHtml(scriptData.agreedNextSteps)}
        </div>
      ` : ''}

      <!-- Roteiro de Call de 15 Minutos Conectado com o Chat -->
      <div class="wa-call-steps-wrapper">
        ${callScript.openingHook ? `
          <div class="wa-opening-hook">
            <span class="hook-label">🎯 Gancho de Abertura (Conectando Diretamente com o WhatsApp):</span>
            <p>"${escapeHtml(callScript.openingHook)}"</p>
          </div>
        ` : ''}

        <div style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 6px;">
          <span>⏱️</span> Passo a Passo da Call Personalizada pelo Diálogo
        </div>

        <div class="wa-steps-timeline">
          ${stepsHtml}
        </div>

        ${callScript.goldenClosingPhrase ? `
          <div class="wa-golden-closing">
            <strong>🌟 Frase de Fechamento da Pinas:</strong> "${escapeHtml(callScript.goldenClosingPhrase)}"
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function copyWhatsAppConversationScriptText() {
  if (!currentActiveLead || !currentActiveLead.conversationScript) {
    showToastNotification('Gere o roteiro do WhatsApp antes de copiar.');
    return;
  }
  const lead = currentActiveLead;
  const data = lead.conversationScript;
  const interlocutor = data.interlocutor || {};
  const cs = data.callScript || {};

  let text = `========================================\n`;
  text += `ROTEIRO DE CALL BASEADO NO WHATSAPP — PINAS STUDIO (@pinas.studio)\n`;
  text += `Lead: ${lead.name} | Nicho: ${lead.niche || 'Geral'}\n`;
  text += `Contato: ${interlocutor.name || 'Cliente'} (${interlocutor.role || 'Responsável'})\n`;
  text += `Poder de Decisão: ${interlocutor.decisionPower || 'Médio'} | Tom: ${interlocutor.tone || 'Neutro'}\n`;
  text += `========================================\n\n`;

  text += `[RESUMO DA CONVERSA NO WHATSAPP]\n`;
  text += `${data.conversationSummary || 'Sem resumo registrado'}\n\n`;

  if (Array.isArray(data.painsAndNeeds) && data.painsAndNeeds.length) {
    text += `[DORES ADMITIDAS NO CHAT]\n`;
    data.painsAndNeeds.forEach(p => text += `• ${p}\n`);
    text += `\n`;
  }

  if (Array.isArray(data.objectionsAndAnswers) && data.objectionsAndAnswers.length) {
    text += `[OBJEÇÕES & RESPOSTAS DO KAUÊ]\n`;
    data.objectionsAndAnswers.forEach(o => {
      text += `• Objeção: "${o.objection}"\n  Resposta: "${o.howToCounter}"\n`;
    });
    text += `\n`;
  }

  if (data.agreedNextSteps) {
    text += `[PRÓXIMOS PASSOS COMBINADOS]: ${data.agreedNextSteps}\n\n`;
  }

  if (cs.openingHook) {
    text += `[GANCHO DE ABERTURA DA CALL]:\n"${cs.openingHook}"\n\n`;
  }

  if (Array.isArray(cs.steps) && cs.steps.length) {
    text += `[PASSOS DA REUNIÃO]:\n`;
    cs.steps.forEach((st, idx) => {
      text += `----------------------------------------\n`;
      text += `${st.time || ''} — ${idx + 1}. ${(st.title || '').toUpperCase()}\n`;
      if (st.objective) text += `Objetivo: ${st.objective}\n`;
      if (st.script) text += `Fala do Kauê: "${st.script}"\n`;
      if (st.tip) text += `Dica de Postura: ${st.tip}\n`;
      if (Array.isArray(st.questions) && st.questions.length) {
        text += `Perguntas: \n`;
        st.questions.forEach(q => text += `  • ${q.question || q}\n`);
      }
      if (st.callToAction) text += `Próxima Ação: ${st.callToAction}\n`;
      text += `\n`;
    });
  }

  if (cs.goldenClosingPhrase) {
    text += `[FRASE DE FECHAMENTO]: "${cs.goldenClosingPhrase}"\n`;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToastNotification('📋 Roteiro baseado na conversa copiado com sucesso!');
  }).catch(() => {
    prompt('Copie o roteiro abaixo:', text);
  });
}

function renderAuditPlaceholderCard(lead) {
  const container = document.getElementById('callscript-view-content');
  if (!container) return;
  container.innerHTML = `
    <div style="margin-top: 1.5rem; padding: 1.25rem 1.5rem; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.12); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
      <div>
        <strong style="color: #fff; font-size: 0.92rem; display: flex; align-items: center; gap: 6px;">
          <span>🌐</span> Auditoria Visual de Design & Mobile (Opcional)
        </strong>
        <p style="margin: 3px 0 0; font-size: 0.8rem; color: var(--text-secondary);">
          Gere o diagnóstico seção por seção do site para compartilhar na reunião de 15 min.
        </p>
      </div>
      <button type="button" class="btn btn-outline btn-sm" onclick="loadDeepVisualAuditAndCallScriptView(currentActiveLead, true)" style="border-color: rgba(255,0,85,0.4); color: #FF3366; font-weight: 700;">
        🔍 Auditar Site Agora
      </button>
    </div>
  `;
}

// ==================== AUDITORIA VISUAL DE DESIGN & ROTEIRO DE CALL (15 MIN) ====================

async function loadDeepVisualAuditAndCallScriptView(lead, forceRefresh = false) {
  if (!lead) return;
  const container = document.getElementById('callscript-view-content');
  const loadingEl = document.getElementById('callscript-view-loading');

  if (lead.deepVisualAudit && lead.callScript && !forceRefresh) {
    if (loadingEl) loadingEl.style.display = 'none';
    renderDeepVisualAuditAndCallScriptHtml(lead, lead.deepVisualAudit, lead.callScript);
    return;
  }

  if (container) container.innerHTML = '';
  if (loadingEl) loadingEl.style.display = 'block';

  try {
    const res = await fetch(`/api/leads/${lead.id}/deep-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRefresh })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao processar auditoria visual');

    lead.deepVisualAudit = data.visualAudit;
    lead.callScript = data.callScript;
    if (data.lead && data.lead.siteAudit) lead.siteAudit = data.lead.siteAudit;
    if (data.lead && data.lead.mapsAudit) lead.mapsAudit = data.lead.mapsAudit;

    // Atualiza o lead na lista global
    const idx = allLeads.findIndex(l => l.id === lead.id);
    if (idx !== -1) {
      allLeads[idx] = { ...allLeads[idx], ...lead };
    }

    renderDeepVisualAuditAndCallScriptHtml(lead, lead.deepVisualAudit, lead.callScript);
  } catch (err) {
    console.error('Erro na auditoria visual / roteiro:', err);
    if (container) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; color: #EF4444; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
          <strong style="display: block; font-size: 1rem; color: #fff; margin-bottom: 6px;">Não foi possível completar a auditoria visual</strong>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">${escapeHtml(err.message)}</p>
          <button type="button" class="btn btn-outline btn-sm" onclick="loadDeepVisualAuditAndCallScriptView(currentActiveLead, true)">
            🔄 Tentar Novamente
          </button>
        </div>
      `;
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function renderDeepVisualAuditAndCallScriptHtml(lead, visualAudit, callScript) {
  const container = document.getElementById('callscript-view-content');
  if (!container) return;

  const rawScore = visualAudit?.designScore ?? visualAudit?.overallRating ?? (lead.hasWebsite ? 5.0 : 2.0);
  let scoreNum = typeof rawScore === 'string' ? parseFloat(rawScore.replace('/10', '')) : rawScore;
  if (isNaN(scoreNum)) scoreNum = 5.0;
  const scoreDisplay = typeof rawScore === 'string' && rawScore.includes('/10') ? rawScore : `${scoreNum} / 10`;

  let scoreClass = 'status-regular';
  if (scoreNum >= 7) scoreClass = 'status-bom';
  else if (scoreNum < 4.5) scoreClass = 'status-critico';

  const sections = visualAudit?.sections || [
    {
      name: "Hero & Proposta de Valor",
      status: "Crítico",
      critique: "Headline vaga ou ausente. O visitante leva mais de 5 segundos para entender o diferencial do atendimento.",
      improvement: "Headline magnética orientada a benefício direto + botão de agendamento em destaque no topo."
    },
    {
      name: "Imagens & Identidade Visual",
      status: "Regular",
      critique: "Fotos genéricas de banco de imagens ou fotos desfocadas que diminuem a percepção de alto padrão.",
      improvement: "Ensaio visual limpo com as instalações reais da empresa, paleta refinada e tipografia moderna."
    },
    {
      name: "Experiência Mobile & Velocidade",
      status: "Crítico",
      critique: "Tempo de carregamento lento e botões difíceis de clicar no celular.",
      improvement: "Arquitetura ultra leve que carrega em menos de 1.5s no 4G com navegação anatômica para o polegar."
    },
    {
      name: "Conversão & Prova Social",
      status: "Crítico",
      critique: "Falta botão flutuante de WhatsApp e depoimentos reais dos clientes satisfeitos.",
      improvement: "Botão pulsante de WhatsApp com mensagem de início rápido e carrossel de avaliações do Google."
    }
  ];

  const sectionsHtml = sections.map(s => {
    let sClass = 'status-regular';
    const stLower = (s.status || '').toLowerCase();
    if (stLower.includes('bom') || stLower.includes('ótimo')) sClass = 'status-bom';
    else if (stLower.includes('crítico') || stLower.includes('critico') || stLower.includes('ruim')) sClass = 'status-critico';

    return `
      <div class="visual-section-card">
        <div class="visual-section-header">
          <span class="visual-section-name">🔍 ${escapeHtml(s.name)}</span>
          <span class="visual-status-pill ${sClass}">${escapeHtml(s.status || 'Analisado')}</span>
        </div>
        <div class="visual-block-critique">
          <span class="visual-label-tag critique-tag">⚠️ Ponto Cego Atual (Hoje):</span>
          ${escapeHtml(s.critique)}
        </div>
        <div class="visual-block-improvement">
          <span class="visual-label-tag improvement-tag">🚀 Solução da Pinas (@pinas.studio):</span>
          ${escapeHtml(s.improvement)}
        </div>
      </div>
    `;
  }).join('');

  const steps = callScript?.steps || [];
  const stepsHtml = steps.map((st, idx) => {
    let extraDetails = '';

    // Perguntas de diagnóstico (se houver)
    if (Array.isArray(st.questions) && st.questions.length) {
      extraDetails += `
        <div class="call-questions-list" style="margin-top: 0.6rem;">
          <strong style="font-size: 0.78rem; color: #10B981; text-transform: uppercase; letter-spacing: 0.5px;">Perguntas de Diagnóstico para o Kauê Fazer:</strong>
          ${st.questions.map((q, qIdx) => `
            <div class="call-question-item">
              <div class="call-question-text">${qIdx + 1}. "${escapeHtml(q.question)}"</div>
              <div class="call-question-why">🎯 <em>Por que perguntar:</em> ${escapeHtml(q.why)}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // O que mostrar na tela (se houver)
    if (Array.isArray(st.whatToShow) && st.whatToShow.length) {
      extraDetails += `
        <div style="margin-top: 0.6rem; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: var(--radius-sm); padding: 0.6rem 0.8rem;">
          <strong style="font-size: 0.78rem; color: #60A5FA; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">🖥️ O que mostrar ao vivo na tela compartilhada:</strong>
          <ul style="margin: 0; padding-left: 1.1rem; font-size: 0.82rem; color: #E2E8F0;">
            ${st.whatToShow.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    // Quebra de objeções (se houver)
    if (Array.isArray(st.objections) && st.objections.length) {
      extraDetails += `
        <div class="call-objections-list" style="margin-top: 0.6rem;">
          <strong style="font-size: 0.78rem; color: #F59E0B; text-transform: uppercase; letter-spacing: 0.5px;">Como Quebrar Objeções com Segurança:</strong>
          ${st.objections.map(obj => `
            <div class="call-objection-item">
              <div class="call-objection-question">❓ Se o cliente disser: "${escapeHtml(obj.objection)}"</div>
              <div class="call-objection-answer">💬 <strong>Kauê responde:</strong> "${escapeHtml(obj.answer)}"</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    const scriptText = st.script || st.presentationScript || st.closingScript || '';
    const scriptBox = scriptText ? `
      <div class="call-script-box">
        <strong>Fala recomendada do Kauê:</strong><br>
        "${escapeHtml(scriptText)}"
      </div>
    ` : '';

    const tipBox = st.tip ? `
      <div class="call-tip-box">
        💡 <strong>Postura:</strong> ${escapeHtml(st.tip)}
      </div>
    ` : '';

    const ctaBox = st.callToAction ? `
      <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #FF3366; font-weight: 700;">
        🎯 Próxima Ação: ${escapeHtml(st.callToAction)}
      </div>
    ` : '';

    return `
      <div class="call-step-card">
        <div class="call-step-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="call-time-badge">${escapeHtml(st.time)}</span>
            <span class="call-step-name">${idx + 1}. ${escapeHtml(st.title)}</span>
          </div>
        </div>
        <div class="call-step-obj">🎯 Objetivo: ${escapeHtml(st.objective)}</div>
        ${scriptBox}
        ${tipBox}
        ${extraDetails}
        ${ctaBox}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Card Hero da Auditoria Visual -->
    <div class="audit-hero-card">
      <div class="audit-hero-header">
        <div class="audit-site-info">
          <div class="audit-site-title">
            <span>🌐</span>
            <span>Auditoria Visual de Design</span>
            ${lead.website ? `<a href="${lead.website}" target="_blank" class="audit-site-url" title="Abrir site original em nova aba">(${escapeHtml(lead.website)}) ↗</a>` : '<span style="font-size: 0.8rem; color: #EF4444; font-weight: normal;">(Sem site oficial cadastrado)</span>'}
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            Análise automatizada de experiência, estrutura de sessões e pontos cegos comerciais
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div class="audit-score-badge">
            <span>Nota de Design:</span>
            <span>${scoreDisplay}</span>
          </div>
          <button type="button" class="btn btn-outline btn-xs" onclick="loadDeepVisualAuditAndCallScriptView(currentActiveLead, true)" title="Recalcular auditoria completa com Gemini">
            🔄 Recalcular
          </button>
        </div>
      </div>

      <div class="audit-summary-text">
        <strong>Primeira Impressão do Visitante:</strong> ${escapeHtml(visualAudit?.overallImpression || visualAudit?.firstImpression || 'O cliente possui presença mas perde potenciais agendamentos devido à navegação truncada e falta de chamadas claras para o WhatsApp.')}
      </div>
    </div>

    <!-- Grid de Seções Auditadas -->
    <div>
      <h4 style="font-size: 0.95rem; color: #fff; margin-bottom: 0.65rem; display: flex; align-items: center; gap: 6px;">
        <span>📐</span> Diagnóstico Seção por Seção (Site & Mobile)
      </h4>
      <div class="visual-sections-grid">
        ${sectionsHtml}
      </div>
    </div>

    <!-- Banner Proposta de Redesign Pinas -->
    ${visualAudit?.pinasRedesignPitch ? `
      <div class="pinas-redesign-box">
        <div class="pinas-redesign-title">
          <span>🚀</span> Proposta de Redesign da Pinas (@pinas.studio)
        </div>
        <div class="pinas-redesign-content">
          ${escapeHtml(visualAudit.pinasRedesignPitch)}
        </div>
      </div>
    ` : ''}

    <!-- Roteiro de Reunião de 15 Minutos -->
    <div class="callscript-wrapper">
      <div class="callscript-topbar">
        <div class="callscript-title-wrap">
          <h4>
            <span>⏱️</span> Roteiro Estratégico de Call (15 Minutos)
          </h4>
          <p>Estrutura validada para o Kauê conduzir com autoridade, diagnosticar gargalos e apresentar a solução sem enrolação.</p>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <button type="button" class="btn btn-primary btn-sm" onclick="copyFullCallScriptText()" style="font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">
            <span>📋</span> Copiar Roteiro da Call
          </button>
          <a href="/slides?empresa=${encodeURIComponent(lead.name)}&bairro=${encodeURIComponent(lead.neighborhood || 'Santo Amaro')}&nicho=${encodeURIComponent(lead.niche || '')}" target="_blank" class="btn btn-outline btn-sm" style="border-color: var(--pinas-red); color: var(--pinas-red);">
            🖥️ Abrir Slides ↗
          </a>
        </div>
      </div>

      <div class="call-timeline-list">
        ${stepsHtml}
      </div>
    </div>
  `;
}

function copyFullCallScriptText() {
  if (!currentActiveLead || !currentActiveLead.callScript) {
    showToastNotification('Gere o roteiro antes de copiar.');
    return;
  }
  const lead = currentActiveLead;
  const script = lead.callScript;
  const audit = lead.deepVisualAudit;

  let text = `========================================\n`;
  text += `ROTEIRO DE CALL DE 15 MIN — PINAS STUDIO (@pinas.studio)\n`;
  text += `Cliente: ${lead.name}\n`;
  text += `Nicho: ${lead.niche || 'Geral'} | Região: ${lead.neighborhood || 'SP'}\n`;
  if (lead.website) text += `Site: ${lead.website}\n`;
  if (audit && audit.designScore) text += `Nota de Design Atual: ${audit.designScore}/10\n`;
  text += `========================================\n\n`;

  if (audit && audit.overallImpression) {
    text += `[DIAGNÓSTICO INICIAL]\n${audit.overallImpression}\n\n`;
  }

  (script.steps || []).forEach((st, idx) => {
    text += `----------------------------------------\n`;
    text += `${st.time} — ${idx + 1}. ${st.title.toUpperCase()}\n`;
    text += `Objetivo: ${st.objective}\n`;
    const sText = st.script || st.presentationScript || st.closingScript;
    if (sText) text += `FALA DO KAUÊ: "${sText}"\n`;
    if (st.tip) text += `DICA DE POSTURA: ${st.tip}\n`;

    if (Array.isArray(st.questions) && st.questions.length) {
      text += `\nPERGUNTAS DE DIAGNÓSTICO:\n`;
      st.questions.forEach((q, qIdx) => {
        text += `  ${qIdx + 1}. ${q.question} (Motivo: ${q.why})\n`;
      });
    }

    if (Array.isArray(st.whatToShow) && st.whatToShow.length) {
      text += `\nMOSTRAR NA TELA COMPARTILHADA:\n`;
      st.whatToShow.forEach(w => {
        text += `  • ${w}\n`;
      });
    }

    if (Array.isArray(st.objections) && st.objections.length) {
      text += `\nQUEBRA DE OBJEÇÕES:\n`;
      st.objections.forEach(obj => {
        text += `  • Se disser: "${obj.objection}"\n    Resposta do Kauê: "${obj.answer}"\n`;
      });
    }

    if (st.callToAction) text += `Próxima Ação Prática: ${st.callToAction}\n`;
    text += `\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToastNotification('📋 Roteiro completo copiado para a área de transferência!');
  }).catch(() => {
    prompt('Copie o roteiro abaixo:', text);
  });
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
      const minDelay = parseInt(document.getElementById('settings-min-delay')?.value, 10) || 30;
      const maxDelay = parseInt(document.getElementById('settings-max-delay')?.value, 10) || 60;
      const startHour = parseInt(document.getElementById('settings-outbound-start')?.value, 10);
      const endHour = parseInt(document.getElementById('settings-outbound-end')?.value, 10);

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excludedChains: chains,
          excludedKeywords: keywords,
          dailyLimit: limit,
          minDelaySeconds: minDelay,
          maxDelaySeconds: maxDelay,
          outboundStartHour: isNaN(startHour) ? 10 : startHour,
          outboundEndHour: isNaN(endHour) ? 19 : endHour
        })
      });
      showSuccessModal({
        title: 'Configurações Salvas!',
        message: 'O limite diário, os horários da janela comercial e os filtros foram atualizados com sucesso.',
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
let chatMediaList = []; // Mídias (fotos/stickers) exclusivamente da conversa ativa atual

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

  // Fechar lightbox, modais ou conversa ativa ao pressionar ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lightboxModal = document.getElementById('chat-lightbox-modal');
      if (lightboxModal && (lightboxModal.classList.contains('active') || lightboxModal.style.display !== 'none')) {
        closeChatLightbox();
        return;
      }
      const modalLead = document.getElementById('modal-lead');
      if (modalLead && modalLead.style.display !== 'none') {
        modalLead.style.display = 'none';
        return;
      }
      const modalWa = document.getElementById('modal-whatsapp');
      if (modalWa && modalWa.style.display !== 'none') {
        modalWa.style.display = 'none';
        return;
      }
      const modalWaConnect = document.getElementById('modal-wa-connect');
      if (modalWaConnect && modalWaConnect.style.display !== 'none') {
        if (typeof closeWhatsAppConnectModal === 'function') closeWhatsAppConnectModal();
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
      if (btn.id === 'btn-chat-ai-suggest') return; // tratado separadamente
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

  // Sugestão Inteligente com Gemini AI na voz do Kauê
  const btnAiSuggest = document.getElementById('btn-chat-ai-suggest');
  if (btnAiSuggest) {
    btnAiSuggest.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!activeChatJid) {
        alert('Selecione uma conversa na lista para obter sugestão de resposta com IA.');
        return;
      }

      const input = document.getElementById('chat-message-input');
      btnAiSuggest.disabled = true;
      const oldHtml = btnAiSuggest.innerHTML;
      btnAiSuggest.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; border-width: 2px; display: inline-block;"></span> Analisando...';

      try {
        const res = await fetch('/api/gemini/suggest-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid: activeChatJid })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao sugerir resposta');

        const bestReply = data.suggestedReplies?.[0]?.text;
        if (bestReply && input) {
          input.value = bestReply;
          input.focus();
          showToastNotification('✨ Resposta na voz do Kauê sugerida com sucesso pelo Gemini!');
        } else {
          alert('Nenhuma sugestão retornada pelo Gemini.');
        }
      } catch (err) {
        console.error('Erro ao sugerir resposta:', err);
        alert(`Falha na IA do Gemini: ${err.message}`);
      } finally {
        btnAiSuggest.disabled = false;
        btnAiSuggest.innerHTML = oldHtml;
      }
    });
  }

  const btnChatOpenScript = document.getElementById('btn-chat-open-script');
  if (btnChatOpenScript) {
    btnChatOpenScript.addEventListener('click', () => {
      if (!activeChatJid) return;
      const digits = cleanPhoneDigits(activeChatJid);
      const lead = allLeads.find(l => cleanPhoneDigits(l.phone || '').includes(digits) || digits.includes(cleanPhoneDigits(l.phone || '')));
      if (lead) {
        openWhatsAppModal(lead.id, 'callscript');
      } else {
        alert('Este contato não está cadastrado na base de leads.');
      }
    });
  }

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
  chatMediaList = [];
  closeChatLightbox();
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
  chatMediaList = [];
  closeChatLightbox();

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
    const btnChatScript = document.getElementById('btn-chat-open-script');
    if (btnChatScript) btnChatScript.style.display = 'none';
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
      const btnChatScript = document.getElementById('btn-chat-open-script');
      if (btnChatScript) {
        btnChatScript.style.display = 'inline-flex';
      }
    } else {
      if (leadBadgeEl) leadBadgeEl.style.display = 'none';
      if (statusDropdown) statusDropdown.style.display = 'none';
      if (btnSlides) btnSlides.style.display = 'none';
      const btnStagesModal = document.getElementById('btn-chat-open-stages-modal');
      if (btnStagesModal) {
        btnStagesModal.style.display = 'none';
      }
      const btnChatScript = document.getElementById('btn-chat-open-script');
      if (btnChatScript) {
        btnChatScript.style.display = 'none';
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

function showToastNotification(message, type = 'info', title = null, duration = 4000) {
  return showToast(message, type, title, duration);
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

  // 1. Obter lista de fotos EXCLUSIVAMENTE da conversa/grupo ativo atualmente
  let list = [];
  if (Array.isArray(chatMediaList) && chatMediaList.length > 0) {
    list = chatMediaList.map(m => (typeof m === 'string' ? m : m.url)).filter(Boolean);
  }

  // Fallback: se não estiver no cache em memória, varrer fotos apenas do container de mensagens da conversa ativa
  if (list.length === 0) {
    const chatImgs = Array.from(document.querySelectorAll('#chat-messages-container .msg-img-wrap img'));
    chatImgs.forEach(img => {
      const s = img.getAttribute('src') || img.currentSrc;
      if (s && !s.includes('data:image/svg') && !list.includes(s)) {
        list.push(s);
      }
    });
  }

  // Se passou uma imagem clicada, garantir que ela esteja na lista
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

  // Se não há imagens válidas para exibir, não abre
  if (list.length === 0) return;

  currentLightboxList = list;

  // Localizar o índice da foto selecionada
  let foundIdx = -1;
  if (clickedSrc) {
    const cleanClicked = clickedSrc.split('?')[0];
    foundIdx = list.findIndex(s => s === clickedSrc || s.includes(cleanClicked) || cleanClicked.includes(s));
  }
  currentLightboxIndex = foundIdx !== -1 ? foundIdx : 0;

  updateLightboxDisplay();
  modal.classList.add('active');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeChatLightbox() {
  const modal = document.getElementById('chat-lightbox-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  const imgEl = document.getElementById('lightbox-img');
  if (imgEl) imgEl.src = '';
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

  const closeBtn = document.getElementById('lightbox-btn-close');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeChatLightbox();
    };
  }

  const backdrop = document.getElementById('lightbox-backdrop');
  if (backdrop) {
    backdrop.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeChatLightbox();
    };
  }

  // FECHAR AO CLICAR FORA DA FOTO
  modal.onclick = (e) => {
    if (e.target.closest('#lightbox-btn-close')) {
      e.preventDefault();
      e.stopPropagation();
      closeChatLightbox();
      return;
    }
    const clickedInsidePhoto = e.target.closest('#lightbox-img') || e.target.closest('.lightbox-image-box');
    const clickedControls = e.target.closest('.lightbox-nav-btn') || e.target.closest('.lightbox-actions') || e.target.closest('.lightbox-counter-pill') || e.target.closest('#lightbox-caption-bar');
    
    if (!clickedInsidePhoto && !clickedControls) {
      closeChatLightbox();
    }
  };

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
    if (!modal || (!modal.classList.contains('active') && modal.style.display === 'none')) return;

    if (e.key === 'Escape') {
      closeChatLightbox();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      lightboxNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      lightboxPrev();
    }
  });

  // Listener global delegado para qualquer clique em imagem de mensagens dentro de #chat-messages-container
  document.addEventListener('click', (e) => {
    const imgEl = e.target.closest('#chat-messages-container .msg-img-wrap img');
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
window.showToastNotification = showToastNotification;
window.showSuccessModal = showSuccessModal;
window.initToastSystem = initToastSystem;
window.openChatLightbox = openChatLightbox;
window.closeChatLightbox = closeChatLightbox;
window.lightboxNext = lightboxNext;
window.lightboxPrev = lightboxPrev;
window.initLightbox = initLightbox;



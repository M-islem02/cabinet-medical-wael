// ========== REHABILITATION MODULE (MPR - Médecine Physique et Réadaptation) ==========

// State
let rehabSelectedPatientId = null;
let currentRehabPlan = null;
let currentEvaluation = null;
let medicalScales = [];
let rehabBilansPage = 1;
let rehabPlansPage = 1;
const REHAB_BILANS_PAGE_SIZE = 6;
const REHAB_PLANS_PAGE_SIZE = 4;
let rehabModuleInitialized = false;
let rehabPatientListLoaded = false;
let rehabMedicalScalesLoaded = false;
let rehabGlobalStatsLoaded = false;
let rehabModalPatientsCache = [];
let rehabEvaluatorsCache = [];
let rehabPatientDataCache = new Map();
let rehabActiveLoadToken = 0;

// Initialize Rehabilitation Module
async function initRehabilitation() {
  if (!rehabPatientListLoaded) {
    await refreshRehabPatientList();
  }

  if (!rehabMedicalScalesLoaded) {
    await loadMedicalScales();
  }

  if (!rehabGlobalStatsLoaded) {
    await updateRehabGlobalStats();
    rehabGlobalStatsLoaded = true;
  }

  if (!rehabModuleInitialized && rehabSelectedPatientId) {
    await loadRehabDataForPatient(rehabSelectedPatientId);
  }

  rehabModuleInitialized = true;
  return;
  console.log('🏥 Initializing rehabilitation module...');
  
  // Load patients list for selector
  await refreshRehabPatientList();
  
  // Load medical scales
  await loadMedicalScales();
  
  // If a patient was previously selected, reload their data
  if (rehabSelectedPatientId) {
    await loadRehabDataForPatient(rehabSelectedPatientId);
  }
  
  // Update stats
  await updateRehabGlobalStats();
  
  console.log('✅ Rehabilitation module initialized');
}

// Refresh patient list in selector
async function refreshRehabPatientList() {
  try {
    const select = document.getElementById('rehab-patient-selector');
    if (!select) return;
    
    const patientsResult = await window.api.patient.getAll();
    const patients = patientsResult.success ? patientsResult.data : patientsResult;
    
    select.innerHTML = '<option value="">-- Sélectionner un patient --</option>';
    rehabModalPatientsCache = [];
    if (patients && patients.length > 0) {
      patients.forEach(p => {
        const selected = p.id == rehabSelectedPatientId ? 'selected' : '';
        const label = `${p.lastName || ''} ${p.firstName || ''}`.trim();
        select.innerHTML += `<option value="${p.id}" ${selected}>${label}</option>`;
        rehabModalPatientsCache.push({ id: p.id, label });
      });
    }
    
    console.log('📋 Patient list refreshed:', patients?.length || 0, 'patients');
    rehabPatientListLoaded = true;
  } catch (error) {
    console.error('Error refreshing patient list:', error);
  }
}

function getRehabPatientsFromSelector() {
  const select = document.getElementById('rehab-patient-selector');
  if (!select) {
    return [];
  }

  return Array.from(select.options || [])
    .filter(option => option.value)
    .map(option => ({
      id: option.value,
      label: option.textContent || ''
    }));
}

async function ensureRehabModalPatients() {
  const selectorPatients = getRehabPatientsFromSelector();
  if (selectorPatients.length) {
    rehabModalPatientsCache = selectorPatients;
    return rehabModalPatientsCache;
  }

  if (rehabModalPatientsCache.length) {
    return rehabModalPatientsCache;
  }

  const patientsResult = await window.api.patient.getAll();
  const patients = patientsResult.success ? patientsResult.data : patientsResult;
  rehabModalPatientsCache = Array.isArray(patients)
    ? patients.map(patient => ({
        id: patient.id,
        label: `${patient.lastName || ''} ${patient.firstName || ''}`.trim()
      }))
    : [];
  return rehabModalPatientsCache;
}

function fillRehabPatientSelect(selectId, selectedId = '') {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  select.innerHTML = '<option value="">-- Selectionner un patient --</option>';
  rehabModalPatientsCache.forEach(patient => {
    const selected = String(patient.id) === String(selectedId) ? 'selected' : '';
    select.innerHTML += `<option value="${patient.id}" ${selected}>${patient.label}</option>`;
  });
}

async function ensureRehabEvaluators() {
  if (rehabEvaluatorsCache.length) {
    return rehabEvaluatorsCache;
  }

  const usersResult = await window.api.user.getAll();
  const users = Array.isArray(usersResult?.data)
    ? usersResult.data
    : (Array.isArray(usersResult) ? usersResult : []);
  rehabEvaluatorsCache = Array.isArray(users)
    ? users.map(user => ({
        id: user.id,
        label: user.fullName || user.username || 'Utilisateur'
      }))
    : [];
  return rehabEvaluatorsCache;
}

function fillRehabEvaluatorSelect(selectId, selectedId = '') {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  select.innerHTML = '<option value="">Selectionner...</option>';
  rehabEvaluatorsCache.forEach(user => {
    const selected = String(user.id) === String(selectedId) ? 'selected' : '';
    select.innerHTML += `<option value="${user.id}" ${selected}>${user.label}</option>`;
  });
}

function normalizeRehabArray(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.data)) {
    return result.data;
  }

  return [];
}

function unwrapRehabApiRecord(result) {
  return result && result.success && result.data ? result.data : result;
}

function safeParseRehabJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function parseRehabPrescriptionFallback(frequency, fallbackSessions = 0) {
  const match = String(frequency || '').match(/(\d+)x\/sem pendant (\d+) sem/i);
  return {
    sessionsPerWeek: match ? parseInt(match[1], 10) : (parseInt(fallbackSessions, 10) || 0),
    weeks: match ? parseInt(match[2], 10) : 0
  };
}

function normalizeRehabPrescription(prescription, frequency = '', fallbackSessions = 0) {
  const fallback = parseRehabPrescriptionFallback(frequency, fallbackSessions);
  const parsed = safeParseRehabJson(prescription, prescription);
  const source = parsed && typeof parsed === 'object' ? parsed : {};

  return {
    sessionsPerWeek: parseInt(source.sessionsPerWeek, 10) || fallback.sessionsPerWeek,
    weeks: parseInt(source.weeks, 10) || fallback.weeks
  };
}

function normalizeRehabPlanRecord(plan) {
  if (!plan) {
    return null;
  }

  const parsedObjectives = safeParseRehabJson(plan?.objectives, null);
  const objectives = parsedObjectives && typeof parsedObjectives === 'object'
    ? parsedObjectives
    : {};
  const equipment = safeParseRehabJson(plan?.equipment ?? plan?.otherEquipment, []);

  return {
    ...plan,
    objectives: {
      shortTerm: objectives.shortTerm || plan?.shortTermObjectives || '',
      mediumTerm: objectives.mediumTerm || plan?.mediumTermObjectives || '',
      longTerm: objectives.longTerm || plan?.longTermObjectives || ''
    },
    kinePrescription: normalizeRehabPrescription(plan?.kinePrescription, plan?.kinesiotherapyFrequency, plan?.kinesiotherapy),
    ergoPrescription: normalizeRehabPrescription(plan?.ergoPrescription, plan?.ergotherapyFrequency, plan?.ergotherapy),
    orthoPrescription: normalizeRehabPrescription(plan?.orthoPrescription, plan?.speechTherapyFrequency, plan?.speechTherapy),
    equipment: Array.isArray(equipment) ? equipment : [],
    equipmentDetails: plan?.equipmentDetails || ''
  };
}

function buildRehabEquipmentSummary(plan) {
  const equipmentLabels = Array.isArray(plan?.equipment)
    ? plan.equipment
        .filter(Boolean)
        .map(item => String(item).replace(/-/g, ' '))
    : [];
  const details = plan?.equipmentDetails ? [plan.equipmentDetails] : [];
  return [...equipmentLabels, ...details].join(' · ');
}

function getRehabCacheKey(patientId) {
  return patientId === null || patientId === undefined ? '' : String(patientId);
}

function getCachedRehabPatientData(patientId) {
  return rehabPatientDataCache.get(getRehabCacheKey(patientId)) || null;
}

function cacheRehabPatientData(patientId, data) {
  const cacheKey = getRehabCacheKey(patientId);
  const cachedData = {
    evaluations: Array.isArray(data?.evaluations) ? data.evaluations : [],
    plans: Array.isArray(data?.plans) ? data.plans : [],
    loadedAt: Date.now()
  };

  if (cacheKey) {
    rehabPatientDataCache.set(cacheKey, cachedData);
  }

  return cachedData;
}

function invalidateRehabPatientData(patientId = null) {
  if (patientId === null || patientId === undefined || patientId === '') {
    rehabPatientDataCache.clear();
    return;
  }

  rehabPatientDataCache.delete(getRehabCacheKey(patientId));
}

function renderRehabPatientData(data = {}) {
  const evaluations = Array.isArray(data.evaluations) ? data.evaluations : [];
  const plans = Array.isArray(data.plans) ? data.plans : [];
  renderBilansList(evaluations);
  renderPlansList(plans);
  renderProgressionChart(evaluations);
  updateRehabStats(evaluations, plans);
}

function buildRehabEmptyState({ code = 'RE', title = '', description = '', actionLabel = '', actionOnClick = '' } = {}) {
  const actionHtml = actionLabel && actionOnClick
    ? `<button class="btn btn-primary" style="margin-top: 18px;" onclick="${actionOnClick}">${actionLabel}</button>`
    : '';

  return `
    <div class="rehab-empty-state">
      <div class="rehab-empty-state-symbol">${code}</div>
      <h4 class="rehab-empty-state-title">${title}</h4>
      <p class="rehab-empty-state-copy">${description}</p>
      ${actionHtml}
    </div>
  `;
}

// Select a patient for rehabilitation
async function selectRehabPatient(patientId) {
  const currentPatientDisplay = document.getElementById('rehab-current-patient-display');
  rehabBilansPage = 1;
  if (!currentPatientDisplay) {
    rehabSelectedPatientId = patientId || null;
    if (!patientId) {
      clearRehabTabs();
      return;
    }
    await loadRehabDataForPatient(patientId);
    return;
  }
  if (!patientId) {
    rehabSelectedPatientId = null;
    rehabBilansPage = 1;
    document.getElementById('rehab-current-patient-display').textContent = 'Aucun patient sélectionné';
    clearRehabTabs();
    return;
  }
  
  rehabSelectedPatientId = patientId;
  
  // Get patient info
  try {
    const patientResult = await window.api.patient.getById(patientId);
    if (patientResult && patientResult.success && patientResult.data) {
      const patient = patientResult.data;
      const name = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
      document.getElementById('rehab-current-patient-display').textContent = name;
      
      // Also update global currentPatientId for compatibility
      if (typeof currentPatientId !== 'undefined') {
        currentPatientId = patientId;
      }
    }
  } catch (error) {
    console.error('Error getting patient:', error);
  }
  
  // Load data for this patient
  await loadRehabDataForPatient(patientId);
}

// Clear rehabilitation tabs content
function clearRehabTabsLegacy() {
  document.getElementById('rehab-bilans-list').innerHTML = buildRehabEmptyState({
    code: 'BF',
    title: 'Aucun patient selectionne',
    description: 'Selectionnez un patient pour afficher les bilans fonctionnels.'
  });
  document.getElementById('rehab-plans-list').innerHTML = buildRehabEmptyState({
    code: 'PR',
    title: 'Aucun patient selectionne',
    description: 'Selectionnez un patient pour afficher les plans de reeducation.'
  });
  document.getElementById('rehab-progression-content').innerHTML = buildRehabEmptyState({
    code: 'PG',
    title: 'Aucune progression a afficher',
    description: 'Selectionnez un patient pour consulter son evolution clinique.'
  });
  return;
  document.getElementById('rehab-bilans-list').innerHTML = `
    <div class="rehab-empty-state">
      <p style="font-size: 48px; margin: 0;">📋</p>
      <p style="margin: 10px 0 0 0;">Sélectionnez un patient pour voir ses bilans</p>
    </div>
  `;
  document.getElementById('rehab-plans-list').innerHTML = `
    <div class="rehab-empty-state">
      <p style="font-size: 48px; margin: 0;">📝</p>
      <p style="margin: 10px 0 0 0;">Sélectionnez un patient pour voir ses plans</p>
    </div>
  `;
  document.getElementById('rehab-progression-content').innerHTML = `
    <div class="rehab-empty-state">
      <p style="font-size: 48px; margin: 0;">📈</p>
      <p style="margin: 10px 0 0 0;">Sélectionnez un patient pour voir sa progression</p>
    </div>
  `;
}

function clearRehabTabs() {
  const bilansList = document.getElementById('rehab-bilans-list');
  const plansList = document.getElementById('rehab-plans-list');
  const progressionContent = document.getElementById('rehab-progression-content');
  rehabBilansPage = 1;
  rehabPlansPage = 1;

  if (bilansList) {
    bilansList.innerHTML = buildRehabEmptyState({
      code: 'BF',
      title: 'Aucun patient selectionne',
      description: 'Selectionnez un patient pour afficher les bilans fonctionnels.'
    });
  }
  if (plansList) {
    plansList.innerHTML = buildRehabEmptyState({
      code: 'PR',
      title: 'Aucun patient selectionne',
      description: 'Selectionnez un patient pour afficher les plans de reeducation.'
    });
  }
  if (progressionContent) {
    progressionContent.innerHTML = buildRehabEmptyState({
      code: 'PG',
      title: 'Aucune progression a afficher',
      description: 'Selectionnez un patient pour consulter son evolution clinique.'
    });
  }
}

// Load rehabilitation data for a specific patient
async function loadRehabDataForPatientLegacy(patientId) {
  console.log('🔄 Loading rehab data for patient:', patientId);
  
  try {
    // Load evaluations
    let evaluations = [];
    if (window.api.functionalEvaluation && window.api.functionalEvaluation.getByPatient) {
      evaluations = await window.api.functionalEvaluation.getByPatient(patientId);
      console.log('📋 Evaluations loaded:', evaluations?.length || 0);
    }
    renderBilansList(evaluations || []);
    
    // Load plans
    let plans = [];
    if (window.api.rehabilitationPlan && window.api.rehabilitationPlan.getByPatient) {
      plans = await window.api.rehabilitationPlan.getByPatient(patientId);
      console.log('📝 Plans loaded:', plans?.length || 0);
    }
    renderPlansList(plans || []);
    
    // Render progression chart
    renderProgressionChart(evaluations || []);
    
    // Update stats
    updateRehabStats(evaluations || [], plans || []);
    
  } catch (error) {
    console.error('Error loading rehab data for patient:', error);
  }
}

// Switch main tab
function switchRehabMainTab(tabName) {
  document.querySelectorAll('.rehab-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Show/hide tab content
  document.querySelectorAll('.rehab-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  const activeTab = document.getElementById(`rehab-tab-${tabName}`);
  if (activeTab) {
    activeTab.style.display = 'block';
  }
}

// Render bilans list
function renderBilansList(evaluations) {
  const container = document.getElementById('rehab-bilans-list');
  if (!container) return;
  
  if (!evaluations || evaluations.length === 0) {
    container.innerHTML = buildRehabEmptyState({
      code: 'BF',
      title: 'Aucun bilan enregistre',
      description: 'Creez un premier bilan fonctionnel pour commencer le suivi.',
      actionLabel: 'Nouveau bilan',
      actionOnClick: 'openEvaluationModal()'
    });
    return;

    container.innerHTML = `
      <div class="rehab-empty-state">
        <p style="font-size: 48px; margin: 0;">📋</p>
        <p style="margin: 10px 0 0 0;">Aucun bilan enregistré pour ce patient</p>
        <button class="btn btn-primary" style="margin-top: 15px;" onclick="openEvaluationModal()">+ Créer un bilan</button>
      </div>
    `;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(evaluations.length / REHAB_BILANS_PAGE_SIZE));
  if (rehabBilansPage > totalPages) rehabBilansPage = totalPages;
  if (rehabBilansPage < 1) rehabBilansPage = 1;

  const startIndex = (rehabBilansPage - 1) * REHAB_BILANS_PAGE_SIZE;
  const pageRows = evaluations.slice(startIndex, startIndex + REHAB_BILANS_PAGE_SIZE);
  
  const cardsHtml = pageRows.map(evaluation => {
    const date = evaluation.evaluationDate || evaluation.date;
    const autonomy = evaluation.autonomyScore || 0;
    const mobility = evaluation.mobilityScore || 0;
    const balance = evaluation.balanceScore || 0;
    const coordination = evaluation.coordinationScore || 0;
    const pain = evaluation.painScore || evaluation.painEVA || 0;
    const evalType = evaluation.globalAssessment || evaluation.type || 'initial';
    
    const typeLabels = {
      'initial': 'Bilan Initial',
      'intermediaire': 'Bilan Intermédiaire',
      'final': 'Bilan Final'
    };
    const typeLabel = typeLabels[evalType] || evalType;
    
    const typeColors = {
      'initial': { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6' },
      'intermediaire': { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
      'final': { bg: '#dcfce7', color: '#166534', border: '#22c55e' }
    };
    const colors = typeColors[evalType] || typeColors['initial'];
    
    return `
    <div class="rehab-record-card rehab-record-card-${evalType}" data-id="${evaluation.id}" style="--rehab-accent:${colors.border}; --rehab-badge-bg:${colors.bg}; --rehab-badge-color:${colors.color};">
      <div class="rehab-record-header">
        <div>
          <span class="rehab-record-pill">${typeLabel}</span>
          <h4 class="rehab-record-title">📅 ${formatDate(date)}</h4>
        </div>
        <div class="rehab-record-actions">
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-neutral" onclick="viewEvaluation('${evaluation.id}')" title="Voir">👁️</button>
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-print" onclick="printEvaluation('${evaluation.id}')" title="Imprimer">🖨️</button>
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-danger" onclick="deleteEvaluation('${evaluation.id}')" title="Supprimer">🗑️</button>
        </div>
      </div>
      
      <div class="rehab-score-grid">
        ${renderRehabMetricCard('Autonomie', `${autonomy}%`, autonomy, 'success')}
        ${renderRehabMetricCard('Mobilité', `${mobility}%`, mobility, 'primary')}
        ${renderRehabMetricCard('Équilibre', `${balance}%`, balance, 'violet')}
        ${renderRehabMetricCard('Coordination', `${coordination}%`, coordination, 'warning')}
        ${renderRehabMetricCard('Douleur (EVA)', `${pain}/10`, pain * 10, 'danger')}
      </div>
      
      ${evaluation.notes || evaluation.observations ? `
        <div class="rehab-note-box">
          <div class="rehab-note-label">📝 Observations</div>
          <div class="rehab-note-text">${evaluation.notes || evaluation.observations}</div>
        </div>
      ` : ''}
    </div>
    `;
  }).join('');

  const paginationHtml = totalPages > 1
    ? `
      <div class="list-pagination">
        <div class="list-pagination-info">${startIndex + 1}-${Math.min(startIndex + REHAB_BILANS_PAGE_SIZE, evaluations.length)} / ${evaluations.length}</div>
        <div class="list-pagination-actions pagination-controls">
          <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${rehabBilansPage <= 1 ? 'disabled' : ''} onclick="changeRehabBilansPage(-1)">‹</button>
          <span class="list-pagination-info">${rehabBilansPage}/${totalPages}</span>
          <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${rehabBilansPage >= totalPages ? 'disabled' : ''} onclick="changeRehabBilansPage(1)">›</button>
        </div>
      </div>
    `
    : '';

  container.innerHTML = `${cardsHtml}${paginationHtml}`;
}

function changeRehabBilansPageLegacy(direction) {
  rehabBilansPage += direction;
  if (rehabSelectedPatientId) {
    loadRehabDataForPatient(rehabSelectedPatientId);
  }
}

function renderRehabMetricCard(label, value, progressPercent, tone) {
  const progress = Math.max(0, Math.min(100, Number(progressPercent) || 0));
  return `
    <div class="rehab-score-card rehab-score-card-${tone}">
      <div class="rehab-score-label">${label}</div>
      <div class="rehab-score-value">${value}</div>
      <div class="rehab-progress-track">
        <div class="rehab-progress-fill" style="width:${progress}%"></div>
      </div>
    </div>
  `;
}

// Render plans list
function renderPlansListLegacy(plans) {
  const container = document.getElementById('rehab-plans-list');
  if (!container) return;
  
  if (!plans || plans.length === 0) {
    container.innerHTML = buildRehabEmptyState({
      code: 'PR',
      title: 'Aucun plan de reeducation',
      description: 'Ajoutez un plan de prise en charge pour organiser les seances.',
      actionLabel: 'Nouveau plan',
      actionOnClick: 'openRehabPlanModal()'
    });
    return;

    container.innerHTML = `
      <div class="rehab-empty-state">
        <p style="font-size: 48px; margin: 0;">📝</p>
        <p style="margin: 10px 0 0 0;">Aucun plan de rééducation pour ce patient</p>
        <button class="btn btn-primary" style="margin-top: 15px;" onclick="openRehabPlanModal()">+ Créer un plan</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = plans.map(plan => {
    const statusConfig = {
      'active': { label: 'Actif', bg: '#dcfce7', color: '#166534', border: '#22c55e', icon: '🟢' },
      'paused': { label: 'En pause', bg: '#fef3c7', color: '#92400e', border: '#f59e0b', icon: '🟡' },
      'completed': { label: 'Terminé', bg: '#e0e7ff', color: '#4338ca', border: '#6366f1', icon: '🔵' }
    };
    const status = statusConfig[plan.status] || statusConfig['active'];
    
    // Parse prescriptions
    let kineSessions = 0, kineWeeks = 0;
    let ergoSessions = 0, ergoWeeks = 0;
    let orthoSessions = 0, orthoWeeks = 0;
    
    if (plan.kinePrescription) {
      const kine = typeof plan.kinePrescription === 'string' ? JSON.parse(plan.kinePrescription) : plan.kinePrescription;
      kineSessions = kine.sessionsPerWeek || 0;
      kineWeeks = kine.weeks || 0;
    }
    if (plan.ergoPrescription) {
      const ergo = typeof plan.ergoPrescription === 'string' ? JSON.parse(plan.ergoPrescription) : plan.ergoPrescription;
      ergoSessions = ergo.sessionsPerWeek || 0;
      ergoWeeks = ergo.weeks || 0;
    }
    if (plan.orthoPrescription) {
      const ortho = typeof plan.orthoPrescription === 'string' ? JSON.parse(plan.orthoPrescription) : plan.orthoPrescription;
      orthoSessions = ortho.sessionsPerWeek || 0;
      orthoWeeks = ortho.weeks || 0;
    }
    
    // Parse objectives
    let objectives = plan.objectives || {};
    if (typeof objectives === 'string') {
      try { objectives = JSON.parse(objectives); } catch(e) { objectives = {}; }
    }
    
    return `
    <div class="rehab-plan-card-pro" data-id="${plan.id}" style="--rehab-plan-border:${status.border}; --rehab-plan-bg:${status.bg}; --rehab-plan-color:${status.color};">
      <div class="rehab-record-header">
        <div>
          <span class="rehab-record-pill">${status.icon} ${status.label}</span>
          <h4 class="rehab-record-title">📅 ${formatDate(plan.startDate)} → ${plan.endDate ? formatDate(plan.endDate) : 'En cours'}</h4>
        </div>
        <div class="rehab-record-actions">
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-neutral" onclick="viewRehabPlan(${plan.id})" title="Voir">👁️</button>
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-print" onclick="printRehabPlan(${plan.id})" title="Imprimer">🖨️</button>
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-danger" onclick="deleteRehabPlan(${plan.id})" title="Supprimer">🗑️</button>
        </div>
      </div>
      
      <div class="rehab-prescription-grid">
        ${renderRehabPrescriptionCard('Kinésithérapie', '💆', kineSessions, kineWeeks, 'primary')}
        ${renderRehabPrescriptionCard('Ergothérapie', '🖐️', ergoSessions, ergoWeeks, 'success')}
        ${renderRehabPrescriptionCard('Orthophonie', '🗣️', orthoSessions, orthoWeeks, 'violet')}
      </div>
      
      ${objectives.shortTerm || objectives.mediumTerm || objectives.longTerm ? `
        <div class="rehab-goals-box">
          <div class="rehab-note-label">🎯 Objectifs thérapeutiques</div>
          ${objectives.shortTerm ? `<div class="rehab-goal-row"><span>Court terme</span><strong>${objectives.shortTerm}</strong></div>` : ''}
          ${objectives.mediumTerm ? `<div class="rehab-goal-row"><span>Moyen terme</span><strong>${objectives.mediumTerm}</strong></div>` : ''}
          ${objectives.longTerm ? `<div class="rehab-goal-row"><span>Long terme</span><strong>${objectives.longTerm}</strong></div>` : ''}
        </div>
      ` : ''}
    </div>
    `;
  }).join('');
}

function renderRehabPrescriptionCard(label, icon, sessionsPerWeek, weeks, tone) {
  return `
    <div class="rehab-prescription-card rehab-prescription-card-${tone}">
      <div class="rehab-prescription-label">${icon} ${label}</div>
      <div class="rehab-prescription-value">${sessionsPerWeek}</div>
      <div class="rehab-prescription-meta">séances/sem × ${weeks} sem</div>
    </div>
  `;
}

// Render progression chart
function renderProgressionChart(evaluations) {
  const container = document.getElementById('rehab-progression-content');
  if (!container) return;
  
  if (!evaluations || evaluations.length === 0) {
    container.innerHTML = buildRehabEmptyState({
      code: 'PG',
      title: 'Aucune donnee de progression',
      description: 'Creez des bilans successifs pour suivre l evolution du patient.'
    });
    return;

    container.innerHTML = `
      <div class="rehab-empty-state">
        <p style="font-size: 48px; margin: 0;">📈</p>
        <p style="margin: 10px 0 0 0;">Aucune donnée de progression disponible</p>
        <p style="font-size: 13px;">Créez des bilans pour suivre la progression du patient</p>
      </div>
    `;
    return;
  }
  
  // Sort evaluations by date
  const sortedEvals = [...evaluations].sort((a, b) => {
    const dateA = new Date(a.evaluationDate || a.date);
    const dateB = new Date(b.evaluationDate || b.date);
    return dateA - dateB;
  });
  
  // Calculate progression
  const firstEval = sortedEvals[0];
  const lastEval = sortedEvals[sortedEvals.length - 1];
  
  const progressData = {
    autonomy: {
      initial: firstEval.autonomyScore || 0,
      current: lastEval.autonomyScore || 0,
      change: (lastEval.autonomyScore || 0) - (firstEval.autonomyScore || 0)
    },
    mobility: {
      initial: firstEval.mobilityScore || 0,
      current: lastEval.mobilityScore || 0,
      change: (lastEval.mobilityScore || 0) - (firstEval.mobilityScore || 0)
    },
    balance: {
      initial: firstEval.balanceScore || 0,
      current: lastEval.balanceScore || 0,
      change: (lastEval.balanceScore || 0) - (firstEval.balanceScore || 0)
    },
    coordination: {
      initial: firstEval.coordinationScore || 0,
      current: lastEval.coordinationScore || 0,
      change: (lastEval.coordinationScore || 0) - (firstEval.coordinationScore || 0)
    },
    pain: {
      initial: firstEval.painScore || firstEval.painEVA || 0,
      current: lastEval.painScore || lastEval.painEVA || 0,
      change: (lastEval.painScore || lastEval.painEVA || 0) - (firstEval.painScore || firstEval.painEVA || 0)
    }
  };
  
  container.innerHTML = `
    <div class="rehab-progress-overview">
      <div class="rehab-progress-header">
        <h4>📊 Évolution des Scores</h4>
        <span>Basé sur ${evaluations.length} bilan(s)</span>
      </div>
      
      <div class="rehab-progress-grid">
        ${renderProgressCard('Autonomie', progressData.autonomy, '#22c55e', '%')}
        ${renderProgressCard('Mobilité', progressData.mobility, '#3b82f6', '%')}
        ${renderProgressCard('Équilibre', progressData.balance, '#8b5cf6', '%')}
        ${renderProgressCard('Coordination', progressData.coordination, '#f59e0b', '%')}
        ${renderProgressCard('Douleur', progressData.pain, '#ef4444', '/10', true)}
      </div>
    </div>
    
    <div class="rehab-history-card">
      <h4>📅 Historique des Bilans</h4>
      <div class="rehab-history-table-wrap">
        <table class="rehab-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Autonomie</th>
              <th>Mobilité</th>
              <th>Équilibre</th>
              <th>Coordination</th>
              <th>Douleur</th>
            </tr>
          </thead>
          <tbody>
            ${sortedEvals.map(e => `
              <tr>
                <td>${formatDate(e.evaluationDate || e.date)}</td>
                <td class="rehab-history-cell-center">
                  <span class="rehab-history-tag">
                    ${e.globalAssessment || e.type || 'initial'}
                  </span>
                </td>
                <td class="rehab-history-score rehab-history-score-success">${e.autonomyScore || 0}%</td>
                <td class="rehab-history-score rehab-history-score-primary">${e.mobilityScore || 0}%</td>
                <td class="rehab-history-score rehab-history-score-violet">${e.balanceScore || 0}%</td>
                <td class="rehab-history-score rehab-history-score-warning">${e.coordinationScore || 0}%</td>
                <td class="rehab-history-score rehab-history-score-danger">${e.painScore || e.painEVA || 0}/10</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderProgressCard(label, data, color, unit, isInverse = false) {
  const change = isInverse ? -data.change : data.change;
  const changeIcon = change > 0 ? '↑' : (change < 0 ? '↓' : '→');
  const changeText = change > 0 ? `+${Math.abs(data.change)}` : (change < 0 ? `-${Math.abs(data.change)}` : '0');
  const trendClass = change > 0 ? 'up' : (change < 0 ? 'down' : 'flat');
  
  return `
    <div class="rehab-progress-card" style="--rehab-progress-color:${color};">
      <div class="rehab-progress-label">${label}</div>
      <div class="rehab-progress-value">${data.current}${unit}</div>
      <div class="rehab-progress-meta">
        <span>Initial: ${data.initial}${unit}</span>
        <span class="rehab-progress-trend ${trendClass}">${changeIcon} ${changeText}</span>
      </div>
    </div>
  `;
}

// Update global stats
async function updateRehabGlobalStats() {
  try {
    const statActivePlans = document.getElementById('stat-active-plans');
    const statEvaluations = document.getElementById('stat-evaluations-month');
    const statSessions = document.getElementById('stat-planned-sessions');
    
    if (statActivePlans) statActivePlans.textContent = '0';
    if (statEvaluations) statEvaluations.textContent = '0';
    if (statSessions) statSessions.textContent = '0';
    
  } catch (error) {
    console.error('Error updating global stats:', error);
  }
}

// Update rehabilitation statistics for current patient
function updateRehabStatsLegacy(evaluations, plans) {
  const activePlans = plans.filter(p => p.status === 'active');
  const statActivePlans = document.getElementById('stat-active-plans');
  if (statActivePlans) statActivePlans.textContent = activePlans.length;
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const evaluationsThisMonth = evaluations.filter(e => {
    const evalDate = new Date(e.evaluationDate || e.date);
    return evalDate >= startOfMonth;
  });
  const statEvaluations = document.getElementById('stat-evaluations-month');
  if (statEvaluations) statEvaluations.textContent = evaluationsThisMonth.length;
  
  let totalSessions = 0;
  activePlans.forEach(plan => {
    let kine = 0, ergo = 0, ortho = 0;
    if (plan.kinePrescription) {
      const kineData = typeof plan.kinePrescription === 'string' ? JSON.parse(plan.kinePrescription) : plan.kinePrescription;
      kine = kineData.sessionsPerWeek || 0;
    }
    if (plan.ergoPrescription) {
      const ergoData = typeof plan.ergoPrescription === 'string' ? JSON.parse(plan.ergoPrescription) : plan.ergoPrescription;
      ergo = ergoData.sessionsPerWeek || 0;
    }
    if (plan.orthoPrescription) {
      const orthoData = typeof plan.orthoPrescription === 'string' ? JSON.parse(plan.orthoPrescription) : plan.orthoPrescription;
      ortho = orthoData.sessionsPerWeek || 0;
    }
    totalSessions += kine + ergo + ortho;
  });
  const statSessions = document.getElementById('stat-planned-sessions');
  if (statSessions) statSessions.textContent = totalSessions;
}

// Load medical scales
async function loadMedicalScales() {
  medicalScales = getDefaultScales();
  rehabMedicalScalesLoaded = true;
}

function getDefaultScales() {
  return [
    { id: 1, name: 'EVA', fullName: 'Échelle Visuelle Analogique', category: 'douleur', maxScore: 10 },
    { id: 2, name: 'Barthel', fullName: 'Indice de Barthel', category: 'autonomie', maxScore: 100 },
    { id: 3, name: 'FIM', fullName: 'Mesure d\'Indépendance Fonctionnelle', category: 'autonomie', maxScore: 126 },
    { id: 4, name: 'Ashworth', fullName: 'Échelle d\'Ashworth Modifiée', category: 'spasticité', maxScore: 4 },
    { id: 5, name: 'Tinetti', fullName: 'Test de Tinetti', category: 'équilibre', maxScore: 28 },
    { id: 6, name: 'MRC', fullName: 'Medical Research Council', category: 'force', maxScore: 5 },
    { id: 7, name: 'Berg', fullName: 'Échelle d\'Équilibre de Berg', category: 'équilibre', maxScore: 56 }
  ];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ========== EVALUATION MODAL ==========

openEvaluationModal = async function(patientId = null) {
  let modal = document.getElementById('evaluation-modal');
  if (!modal) {
    createEvaluationModal();
    modal = document.getElementById('evaluation-modal');
  }
  
  const form = document.getElementById('evaluation-form');
  if (form) form.reset();
  
  const dateField = document.getElementById('eval-date');
  if (dateField) dateField.value = new Date().toISOString().split('T')[0];
  
  ['eval-autonomy', 'eval-mobility', 'eval-balance', 'eval-coordination'].forEach(id => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.value = 50;
      const valueEl = document.getElementById(`${id}-value`);
      if (valueEl) valueEl.textContent = '50%';
    }
  });
  
  document.querySelectorAll('.eva-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.style.transform = 'scale(1)';
  });
  const firstEva = document.querySelector('.eva-btn[data-value="0"]');
  if (firstEva) {
    firstEva.classList.add('selected');
    firstEva.style.transform = 'scale(1.2)';
  }
  const evaInput = document.getElementById('eval-pain-eva');
  if (evaInput) evaInput.value = 0;
  
  try {
    const patientsResult = await window.api.patient.getAll();
    const patients = patientsResult.success ? patientsResult.data : patientsResult;
    const select = document.getElementById('eval-patient-select');
    if (select && patients) {
      select.innerHTML = '<option value="">-- Sélectionner un patient --</option>';
      patients.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.lastName} ${p.firstName}</option>`;
      });
      
      const selectedId = patientId || rehabSelectedPatientId || currentPatientId;
      if (selectedId) select.value = selectedId;
    }
  } catch (error) {
    console.error('Error loading patients:', error);
  }
  
  try {
    const users = await window.api.user.getAll();
    const evaluatorSelect = document.getElementById('eval-evaluator');
    if (evaluatorSelect && users) {
      evaluatorSelect.innerHTML = '<option value="">Sélectionner...</option>';
      users.forEach(u => {
        const displayName = u.fullName || u.username || 'Utilisateur';
        evaluatorSelect.innerHTML += `<option value="${u.id}">${displayName}</option>`;
      });
      if (currentUserId) evaluatorSelect.value = currentUserId;
    }
  } catch (error) {
    console.error('Error loading evaluators:', error);
  }
  
  if (typeof openModal === 'function') {
    openModal('evaluation-modal');
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

function createEvaluationModal() {
  const modalHtml = `
    <div id="evaluation-modal" class="modal">
      <div class="modal-content modal-large rehab-modal-dialog" style="max-width: 800px; max-height: 90vh; overflow: hidden; background: white;">
        <div class="modal-header" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white;">
          <h2>📋 Bilan Fonctionnel MPR</h2>
          <button class="close-btn" onclick="closeModal('evaluation-modal')" style="color: white;">&times;</button>
        </div>
        <div class="modal-body" style="overflow-y: auto; padding: 20px; max-height: calc(90vh - 140px); background: white;">
          <form id="evaluation-form">
            <div class="form-group rehab-modal-patient-field">
              <label>Patient *</label>
              <select id="eval-patient-select" class="form-control" required>
                <option value="">-- Sélectionner un patient --</option>
              </select>
            </div>
            
            <div class="rehab-modal-meta-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
              <div class="form-group">
                <label>Date d'évaluation</label>
                <input type="date" id="eval-date" class="form-control" required>
              </div>
              <div class="form-group">
                <label>Type de bilan</label>
                <select id="eval-type" class="form-control">
                  <option value="initial">Bilan Initial</option>
                  <option value="intermediaire">Bilan Intermédiaire</option>
                  <option value="final">Bilan Final</option>
                </select>
              </div>
              <div class="form-group">
                <label>Évaluateur</label>
                <select id="eval-evaluator" class="form-control">
                  <option value="">Sélectionner...</option>
                </select>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft rehab-plan-goals-section" style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #0369a1; font-size: 14px;">🎯 Évaluation Fonctionnelle</h3>
              <div class="rehab-modal-two-col" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                  <label style="font-size: 13px;">Autonomie (0-100%)</label>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" id="eval-autonomy" min="0" max="100" value="50" style="flex: 1; accent-color: #22c55e;" oninput="document.getElementById('eval-autonomy-value').textContent = this.value + '%'">
                    <span id="eval-autonomy-value" style="font-weight: 600; color: #22c55e; min-width: 45px;">50%</span>
                  </div>
                </div>
                <div class="form-group">
                  <label style="font-size: 13px;">Mobilité (0-100%)</label>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" id="eval-mobility" min="0" max="100" value="50" style="flex: 1; accent-color: #3b82f6;" oninput="document.getElementById('eval-mobility-value').textContent = this.value + '%'">
                    <span id="eval-mobility-value" style="font-weight: 600; color: #3b82f6; min-width: 45px;">50%</span>
                  </div>
                </div>
                <div class="form-group">
                  <label style="font-size: 13px;">Équilibre (0-100%)</label>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" id="eval-balance" min="0" max="100" value="50" style="flex: 1; accent-color: #8b5cf6;" oninput="document.getElementById('eval-balance-value').textContent = this.value + '%'">
                    <span id="eval-balance-value" style="font-weight: 600; color: #8b5cf6; min-width: 45px;">50%</span>
                  </div>
                </div>
                <div class="form-group">
                  <label style="font-size: 13px;">Coordination (0-100%)</label>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="range" id="eval-coordination" min="0" max="100" value="50" style="flex: 1; accent-color: #f59e0b;" oninput="document.getElementById('eval-coordination-value').textContent = this.value + '%'">
                    <span id="eval-coordination-value" style="font-weight: 600; color: #f59e0b; min-width: 45px;">50%</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #dc2626; font-size: 14px;">😣 Évaluation de la Douleur</h3>
              <div class="rehab-modal-two-col" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                  <label style="font-size: 13px;">EVA Douleur (0-10)</label>
                  <div class="eva-scale" style="margin-top: 8px;">
                    ${generateEVAScale()}
                  </div>
                </div>
                <div class="form-group">
                  <label style="font-size: 13px;">Localisation de la douleur</label>
                  <input type="text" id="eval-pain-location" class="form-control" placeholder="Ex: Épaule droite, genou gauche...">
                </div>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #16a34a; font-size: 14px;">💪 Évaluation Musculaire</h3>
              <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-size: 13px;">Spasticité (Échelle d'Ashworth Modifiée)</label>
                <select id="eval-spasticity" class="form-control">
                  <option value="0">0 - Pas d'augmentation du tonus</option>
                  <option value="1">1 - Légère augmentation du tonus</option>
                  <option value="1+">1+ - Légère augmentation avec résistance minimale</option>
                  <option value="2">2 - Augmentation plus marquée</option>
                  <option value="3">3 - Augmentation considérable</option>
                  <option value="4">4 - Membre rigide en flexion ou extension</option>
                </select>
              </div>
              <div class="form-group">
                <label style="font-size: 13px;">Force Musculaire (MRC)</label>
                <div class="mrc-grid rehab-modal-scroll-panel" id="mrc-evaluation" style="max-height: 200px; overflow-y: auto; background: white; border-radius: 6px; padding: 10px;">
                  ${generateMRCGrid()}
                </div>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #faf5ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #7c3aed; font-size: 14px;">🚶 Évaluation de la Marche</h3>
              <div class="rehab-modal-three-col" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div class="form-group">
                  <label style="font-size: 13px;">Type de marche</label>
                  <select id="eval-gait-type" class="form-control">
                    <option value="normal">Normale</option>
                    <option value="anormale">Anormale</option>
                    <option value="boiterie">Boiterie</option>
                    <option value="spastique">Spastique</option>
                    <option value="ataxique">Ataxique</option>
                    <option value="festinante">Festinante</option>
                    <option value="impossible">Impossible</option>
                  </select>
                </div>
                <div class="form-group">
                  <label style="font-size: 13px;">Aide technique</label>
                  <select id="eval-walking-aid" class="form-control">
                    <option value="aucune">Aucune</option>
                    <option value="canne">Canne simple</option>
                    <option value="canneT">Canne en T</option>
                    <option value="deambulateur">Déambulateur</option>
                    <option value="fauteuil">Fauteuil roulant</option>
                  </select>
                </div>
                <div class="form-group">
                  <label style="font-size: 13px;">Périmètre de marche</label>
                  <input type="text" id="eval-walking-distance" class="form-control" placeholder="Ex: 100m...">
                </div>
              </div>
              <div class="form-group" style="margin-top: 15px;">
                <label style="font-size: 13px;">Limitations articulaires</label>
                <textarea id="eval-joint-range" class="form-control" rows="2" placeholder="Décrire les limitations articulaires..."></textarea>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #f8fafc; padding: 15px; border-radius: 8px;">
              <h3 style="margin: 0 0 15px 0; color: #475569; font-size: 14px;">📝 Observations</h3>
              <div class="form-group" style="margin-bottom: 15px;">
                <label style="font-size: 13px;">Observations cliniques</label>
                <textarea id="eval-observations" class="form-control" rows="2" placeholder="Observations supplémentaires..."></textarea>
              </div>
              <div class="form-group">
                <label style="font-size: 13px;">Objectifs de rééducation</label>
                <textarea id="eval-objectives" class="form-control" rows="2" placeholder="Objectifs à court et moyen terme..."></textarea>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 10px; background: white;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('evaluation-modal')">ANNULER</button>
          <button type="button" class="btn btn-primary" onclick="saveEvaluation()">💾 ENREGISTRER LE BILAN</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function generateEVAScale() {
  let html = '<div class="eva-buttons" id="eva-score" style="display: flex; gap: 4px; flex-wrap: wrap;">';
  for (let i = 0; i <= 10; i++) {
    const color = getEVAColor(i);
    const selected = i === 0 ? 'selected' : '';
    const transform = i === 0 ? 'scale(1.2)' : 'scale(1)';
    html += `<button type="button" class="eva-btn ${selected}" data-value="${i}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid ${color}; background: ${color}; color: white; font-weight: bold; font-size: 12px; cursor: pointer; transform: ${transform};" onclick="selectEVA(${i})">${i}</button>`;
  }
  html += '</div>';
  html += '<input type="hidden" id="eval-pain-eva" value="0">';
  return html;
}

function getEVAColor(score) {
  if (score <= 2) return '#22c55e';
  if (score <= 4) return '#84cc16';
  if (score <= 6) return '#eab308';
  if (score <= 8) return '#f97316';
  return '#ef4444';
}

window.selectEVA = function(score) {
  document.querySelectorAll('.eva-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.style.transform = 'scale(1)';
  });
  const selectedBtn = document.querySelector(`.eva-btn[data-value="${score}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    selectedBtn.style.transform = 'scale(1.2)';
  }
  document.getElementById('eval-pain-eva').value = score;
};

function generateMRCGrid() {
  const muscles = [
    { name: 'Épaule D', id: 'shoulder-r' }, { name: 'Épaule G', id: 'shoulder-l' },
    { name: 'Coude D', id: 'elbow-r' }, { name: 'Coude G', id: 'elbow-l' },
    { name: 'Poignet D', id: 'wrist-r' }, { name: 'Poignet G', id: 'wrist-l' },
    { name: 'Hanche D', id: 'hip-r' }, { name: 'Hanche G', id: 'hip-l' },
    { name: 'Genou D', id: 'knee-r' }, { name: 'Genou G', id: 'knee-l' },
    { name: 'Cheville D', id: 'ankle-r' }, { name: 'Cheville G', id: 'ankle-l' }
  ];
  
  let html = '<div class="mrc-table" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">';
  muscles.forEach(m => {
    html += `
      <div class="mrc-row" style="display: flex; align-items: center; gap: 8px; padding: 6px; background: #f8fafc; border-radius: 4px;">
        <label style="min-width: 70px; font-size: 12px;">${m.name}</label>
        <select id="mrc-${m.id}" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #e2e8f0; border-radius: 4px;">
          <option value="5">5 - Normal</option>
          <option value="4">4 - Contre résistance</option>
          <option value="3">3 - Contre gravité</option>
          <option value="2">2 - Sans gravité</option>
          <option value="1">1 - Contraction visible</option>
          <option value="0">0 - Aucune</option>
        </select>
      </div>
    `;
  });
  html += '</div>';
  return html;
}

async function saveEvaluationLegacy() {
  let patientId = document.getElementById('eval-patient-select')?.value;
  
  if (!patientId) {
    showNotification('⚠️ Veuillez sélectionner un patient', 'error');
    return;
  }
  
  const evaluation = {
    patientId: patientId,
    date: document.getElementById('eval-date')?.value || new Date().toISOString().split('T')[0],
    type: document.getElementById('eval-type')?.value || 'initial',
    autonomyScore: parseInt(document.getElementById('eval-autonomy')?.value || 50),
    mobilityScore: parseInt(document.getElementById('eval-mobility')?.value || 50),
    balanceScore: parseInt(document.getElementById('eval-balance')?.value || 50),
    coordinationScore: parseInt(document.getElementById('eval-coordination')?.value || 50),
    painEVA: parseInt(document.getElementById('eval-pain-eva')?.value || 0),
    painLocation: document.getElementById('eval-pain-location')?.value || '',
    spasticityAshworth: document.getElementById('eval-spasticity')?.value || '0',
    jointRange: document.getElementById('eval-joint-range')?.value || '',
    gaitType: document.getElementById('eval-gait-type')?.value || 'normal',
    walkingAid: document.getElementById('eval-walking-aid')?.value || 'aucune',
    walkingDistance: document.getElementById('eval-walking-distance')?.value || '',
    observations: document.getElementById('eval-observations')?.value || '',
    objectives: document.getElementById('eval-objectives')?.value || '',
    evaluatorId: document.getElementById('eval-evaluator')?.value || currentUserId,
    mrcScores: collectMRCScores()
  };
  
  try {
    console.log('💾 Saving evaluation:', evaluation);
    
    if (window.api.functionalEvaluation && window.api.functionalEvaluation.create) {
      const result = await window.api.functionalEvaluation.create(evaluation);
      console.log('✅ Evaluation saved:', result);
      
      if (result.success) {
        showNotification('✅ Bilan fonctionnel enregistré avec succès!', 'success');
        closeModal('evaluation-modal');
        
        if (rehabSelectedPatientId) {
          await loadRehabDataForPatient(rehabSelectedPatientId);
        } else if (patientId) {
          rehabSelectedPatientId = patientId;
          document.getElementById('rehab-patient-selector').value = patientId;
          await selectRehabPatient(patientId);
        }
      } else {
        showNotification('❌ Erreur: ' + (result.error || 'Échec'), 'error');
      }
    } else {
      showNotification('⚠️ API non disponible', 'warning');
    }
  } catch (error) {
    console.error('❌ Error saving evaluation:', error);
    showNotification('❌ Erreur: ' + (error.message || 'Échec'), 'error');
  }
}

function collectMRCScores() {
  const muscles = ['shoulder-r', 'shoulder-l', 'elbow-r', 'elbow-l', 'wrist-r', 'wrist-l', 
                   'hip-r', 'hip-l', 'knee-r', 'knee-l', 'ankle-r', 'ankle-l'];
  const scores = {};
  muscles.forEach(m => {
    const el = document.getElementById(`mrc-${m}`);
    if (el) scores[m] = parseInt(el.value);
  });
  return JSON.stringify(scores);
}

// ========== REHABILITATION PLAN MODAL ==========

openRehabPlanModal = async function(patientId = null) {
  let modal = document.getElementById('rehab-plan-modal');
  if (!modal) {
    createRehabPlanModal();
    modal = document.getElementById('rehab-plan-modal');
  }
  
  const form = document.getElementById('rehab-form');
  if (form) form.reset();
  
  const startDateField = document.getElementById('rehab-start-date');
  if (startDateField) startDateField.value = new Date().toISOString().split('T')[0];
  
  try {
    const patientsResult = await window.api.patient.getAll();
    const patients = patientsResult.success ? patientsResult.data : patientsResult;
    const select = document.getElementById('rehab-patient-select');
    if (select && patients) {
      select.innerHTML = '<option value="">-- Sélectionner un patient --</option>';
      patients.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.lastName} ${p.firstName}</option>`;
      });
      const selectedId = patientId || rehabSelectedPatientId || currentPatientId;
      if (selectedId) select.value = selectedId;
    }
  } catch (error) {
    console.error('Error loading patients:', error);
  }
  
  if (typeof openModal === 'function') {
    openModal('rehab-plan-modal');
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

function createRehabPlanModal() {
  const modalHtml = `
    <div id="rehab-plan-modal" class="modal">
      <div class="modal-content modal-large rehab-modal-dialog" style="max-width: 850px; max-height: 90vh; overflow: hidden; background: white;">
        <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white;">
          <h2>📝 Plan de Rééducation</h2>
          <button class="close-btn" onclick="closeModal('rehab-plan-modal')" style="color: white;">&times;</button>
        </div>
        <div class="modal-body" style="overflow-y: auto; padding: 20px; max-height: calc(90vh - 140px); background: white;">
          <form id="rehab-form">
            <div class="form-group rehab-modal-patient-field">
              <label>Patient *</label>
              <select id="rehab-patient-select" class="form-control" required>
                <option value="">-- Sélectionner un patient --</option>
              </select>
            </div>
            
            <div class="rehab-modal-meta-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
              <div class="form-group">
                <label>Date de début</label>
                <input type="date" id="rehab-start-date" class="form-control" required>
              </div>
              <div class="form-group">
                <label>Date de fin prévue</label>
                <input type="date" id="rehab-end-date" class="form-control">
              </div>
              <div class="form-group">
                <label>Statut</label>
                <select id="rehab-status" class="form-control">
                  <option value="active">🟢 Actif</option>
                  <option value="paused">🟡 En pause</option>
                  <option value="completed">🔵 Terminé</option>
                </select>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft rehab-plan-goals-section" style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #0369a1; font-size: 14px;">🎯 Objectifs de Rééducation</h3>
              <div class="rehab-plan-goals-grid">
                <div class="form-group" style="margin-bottom: 10px;">
                <label style="font-size: 13px; color: #059669;">Objectifs à court terme (2-4 semaines)</label>
                <textarea id="rehab-short-term" class="form-control" rows="2" placeholder="Ex: Améliorer l'équilibre debout..."></textarea>
              </div>
              <div class="form-group" style="margin-bottom: 10px;">
                <label style="font-size: 13px; color: #d97706;">Objectifs à moyen terme (1-3 mois)</label>
                <textarea id="rehab-medium-term" class="form-control" rows="2" placeholder="Ex: Marche autonome 100m..."></textarea>
              </div>
                <div class="form-group">
                <label style="font-size: 13px; color: #7c3aed;">Objectifs à long terme (3-6 mois)</label>
                <textarea id="rehab-long-term" class="form-control" rows="2" placeholder="Ex: Reprise activité professionnelle..."></textarea>
                </div>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #16a34a; font-size: 14px;">🏋️ Prescriptions de Rééducation</h3>
              <div class="rehab-modal-prescription-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div class="rehab-modal-prescription-box rehab-modal-prescription-box-primary" style="background: white; padding: 15px; border-radius: 6px; border: 2px solid #dbeafe;">
                  <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #1e40af;">💆 Kinésithérapie</h4>
                  <div class="form-group" style="margin-bottom: 8px;">
                    <label style="font-size: 11px;">Séances/semaine</label>
                    <input type="number" id="kine-sessions" class="form-control" min="0" max="7" value="0">
                  </div>
                  <div class="form-group">
                    <label style="font-size: 11px;">Durée (semaines)</label>
                    <input type="number" id="kine-weeks" class="form-control" min="0" max="52" value="0">
                  </div>
                </div>
                <div class="rehab-modal-prescription-box rehab-modal-prescription-box-success" style="background: white; padding: 15px; border-radius: 6px; border: 2px solid #d1fae5;">
                  <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #047857;">🖐️ Ergothérapie</h4>
                  <div class="form-group" style="margin-bottom: 8px;">
                    <label style="font-size: 11px;">Séances/semaine</label>
                    <input type="number" id="ergo-sessions" class="form-control" min="0" max="7" value="0">
                  </div>
                  <div class="form-group">
                    <label style="font-size: 11px;">Durée (semaines)</label>
                    <input type="number" id="ergo-weeks" class="form-control" min="0" max="52" value="0">
                  </div>
                </div>
                <div class="rehab-modal-prescription-box rehab-modal-prescription-box-violet" style="background: white; padding: 15px; border-radius: 6px; border: 2px solid #ede9fe;">
                  <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #6d28d9;">🗣️ Orthophonie</h4>
                  <div class="form-group" style="margin-bottom: 8px;">
                    <label style="font-size: 11px;">Séances/semaine</label>
                    <input type="number" id="ortho-sessions" class="form-control" min="0" max="7" value="0">
                  </div>
                  <div class="form-group">
                    <label style="font-size: 11px;">Durée (semaines)</label>
                    <input type="number" id="ortho-weeks" class="form-control" min="0" max="52" value="0">
                  </div>
                </div>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 15px 0; color: #b45309; font-size: 14px;">🦿 Appareillage</h3>
              <div class="form-group" style="margin-bottom: 10px;">
                <div class="rehab-modal-check-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; font-size: 12px;">
                  <label><input type="checkbox" name="appareillage" value="orthese-ms"> Orthèse MS</label>
                  <label><input type="checkbox" name="appareillage" value="orthese-mi"> Orthèse MI</label>
                  <label><input type="checkbox" name="appareillage" value="corset"> Corset</label>
                  <label><input type="checkbox" name="appareillage" value="chaussures"> Chaussures ortho</label>
                  <label><input type="checkbox" name="appareillage" value="semelles"> Semelles</label>
                  <label><input type="checkbox" name="appareillage" value="fauteuil"> Fauteuil roulant</label>
                  <label><input type="checkbox" name="appareillage" value="deambulateur"> Déambulateur</label>
                  <label><input type="checkbox" name="appareillage" value="canne"> Canne</label>
                  <label><input type="checkbox" name="appareillage" value="prothese"> Prothèse</label>
                </div>
              </div>
              <div class="form-group">
                <label style="font-size: 13px;">Détails</label>
                <textarea id="rehab-equipment-details" class="form-control" rows="2" placeholder="Précisions..."></textarea>
              </div>
            </div>
            
            <div class="rehab-modal-section rehab-modal-section-soft" style="background: #f8fafc; padding: 15px; border-radius: 8px;">
              <h3 style="margin: 0 0 15px 0; color: #475569; font-size: 14px;">📝 Notes</h3>
              <div class="form-group">
                <textarea id="rehab-notes" class="form-control" rows="3" placeholder="Notes supplémentaires..."></textarea>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 10px; background: white;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('rehab-plan-modal')">ANNULER</button>
          <button type="button" class="btn btn-primary" onclick="saveRehabPlan()">💾 ENREGISTRER LE PLAN</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function saveRehabPlanLegacy() {
  let patientId = document.getElementById('rehab-patient-select')?.value;
  
  if (!patientId) {
    showNotification('⚠️ Veuillez sélectionner un patient', 'error');
    return;
  }
  
  const plan = {
    patientId: patientId,
    startDate: document.getElementById('rehab-start-date')?.value || new Date().toISOString().split('T')[0],
    endDate: document.getElementById('rehab-end-date')?.value || null,
    status: document.getElementById('rehab-status')?.value || 'active',
    shortTermObjectives: document.getElementById('rehab-short-term')?.value || '',
    mediumTermObjectives: document.getElementById('rehab-medium-term')?.value || '',
    longTermObjectives: document.getElementById('rehab-long-term')?.value || '',
    kinePrescription: {
      sessionsPerWeek: parseInt(document.getElementById('kine-sessions')?.value || 0),
      weeks: parseInt(document.getElementById('kine-weeks')?.value || 0)
    },
    ergoPrescription: {
      sessionsPerWeek: parseInt(document.getElementById('ergo-sessions')?.value || 0),
      weeks: parseInt(document.getElementById('ergo-weeks')?.value || 0)
    },
    orthoPrescription: {
      sessionsPerWeek: parseInt(document.getElementById('ortho-sessions')?.value || 0),
      weeks: parseInt(document.getElementById('ortho-weeks')?.value || 0)
    },
    equipment: getCheckedValues('appareillage'),
    equipmentDetails: document.getElementById('rehab-equipment-details')?.value || '',
    notes: document.getElementById('rehab-notes')?.value || '',
    createdBy: currentUserId
  };
  
  try {
    console.log('💾 Saving rehabilitation plan:', plan);
    
    if (window.api.rehabilitationPlan && window.api.rehabilitationPlan.create) {
      const result = await window.api.rehabilitationPlan.create(plan);
      console.log('✅ Plan saved:', result);
      
      if (result.success) {
        showNotification('✅ Plan de rééducation enregistré avec succès!', 'success');
        closeModal('rehab-plan-modal');
        
        if (rehabSelectedPatientId) {
          await loadRehabDataForPatient(rehabSelectedPatientId);
        } else if (patientId) {
          rehabSelectedPatientId = patientId;
          document.getElementById('rehab-patient-selector').value = patientId;
          await selectRehabPatient(patientId);
        }
      } else {
        showNotification('❌ Erreur: ' + (result.error || 'Échec'), 'error');
      }
    } else {
      showNotification('⚠️ API non disponible', 'warning');
    }
  } catch (error) {
    console.error('❌ Error saving plan:', error);
    showNotification('❌ Erreur: ' + (error.message || 'Échec'), 'error');
  }
}

function getCheckedValues(name) {
  const checked = document.querySelectorAll(`input[name="${name}"]:checked`);
  return Array.from(checked).map(cb => cb.value);
}

// ========== VIEW/PRINT/DELETE FUNCTIONS ==========

async function viewEvaluation(evaluationId) {
  try {
    const evaluation = await window.api.functionalEvaluation.getById(evaluationId);
    if (!evaluation) { showNotification('Bilan non trouvé', 'error'); return; }
    
    let patientName = 'Patient';
    if (evaluation.patientId) {
      const patient = await window.api.patient.getById(evaluation.patientId);
      if (patient) patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
    }
    
    const content = `
      <div style="padding: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; color: white;">
          <h3 style="margin: 0 0 10px 0;">📋 Bilan Fonctionnel MPR</h3>
          <p style="margin: 0; opacity: 0.9;"><strong>Patient:</strong> ${patientName}</p>
          <p style="margin: 5px 0 0 0; opacity: 0.9;"><strong>Date:</strong> ${formatDate(evaluation.evaluationDate || evaluation.date)}</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
          <div style="background: #f0fdf4; padding: 20px; border-radius: 12px;">
            <h4 style="margin: 0 0 15px 0; color: #16a34a;">🎯 Scores</h4>
            <p><strong>Autonomie:</strong> ${evaluation.autonomyScore || 0}%</p>
            <p><strong>Mobilité:</strong> ${evaluation.mobilityScore || 0}%</p>
            <p><strong>Équilibre:</strong> ${evaluation.balanceScore || 0}%</p>
            <p><strong>Coordination:</strong> ${evaluation.coordinationScore || 0}%</p>
          </div>
          <div style="background: #fef2f2; padding: 20px; border-radius: 12px;">
            <h4 style="margin: 0 0 15px 0; color: #dc2626;">😣 Douleur</h4>
            <p><strong>EVA:</strong> ${evaluation.painScore || evaluation.painEVA || 0}/10</p>
            <p><strong>Localisation:</strong> ${evaluation.painLocation || 'Non spécifiée'}</p>
          </div>
        </div>
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 15px;">
          <h4 style="margin: 0 0 10px 0;">📝 Observations</h4>
          <p>${evaluation.notes || evaluation.observations || 'Aucune'}</p>
        </div>
      </div>
    `;
    showViewModal('Détails du Bilan', content);
  } catch (error) {
    console.error('Error viewing evaluation:', error);
    showNotification('Erreur lors de l\'affichage', 'error');
  }
}

async function viewRehabPlanLegacy(planId) {
  try {
    const plan = await window.api.rehabilitationPlan.getById(planId);
    if (!plan) { showNotification('Plan non trouvé', 'error'); return; }
    
    let patientName = 'Patient';
    if (plan.patientId) {
      const patient = await window.api.patient.getById(plan.patientId);
      if (patient) patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
    }
    
    let objectives = plan.objectives || {};
    if (typeof objectives === 'string') try { objectives = JSON.parse(objectives); } catch(e) { objectives = {}; }
    
    const content = `
      <div style="padding: 20px;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; color: white;">
          <h3 style="margin: 0 0 10px 0;">📝 Plan de Rééducation</h3>
          <p style="margin: 0; opacity: 0.9;"><strong>Patient:</strong> ${patientName}</p>
          <p style="margin: 5px 0 0 0; opacity: 0.9;"><strong>Période:</strong> ${formatDate(plan.startDate)} - ${plan.endDate ? formatDate(plan.endDate) : 'En cours'}</p>
        </div>
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin-bottom: 15px;">
          <h4 style="margin: 0 0 10px 0; color: #0369a1;">🎯 Objectifs</h4>
          <p><strong>Court terme:</strong> ${objectives.shortTerm || 'Non défini'}</p>
          <p><strong>Moyen terme:</strong> ${objectives.mediumTerm || 'Non défini'}</p>
          <p><strong>Long terme:</strong> ${objectives.longTerm || 'Non défini'}</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background: #dbeafe; padding: 15px; border-radius: 10px; text-align: center;">
            <h5 style="margin: 0 0 5px 0; color: #1e40af;">💆 Kiné</h5>
            <div style="font-size: 24px; font-weight: bold; color: #1e3a8a;">${plan.kinePrescription?.sessionsPerWeek || 0}</div>
            <div style="font-size: 11px; color: #3b82f6;">séances/sem</div>
          </div>
          <div style="background: #d1fae5; padding: 15px; border-radius: 10px; text-align: center;">
            <h5 style="margin: 0 0 5px 0; color: #047857;">🖐️ Ergo</h5>
            <div style="font-size: 24px; font-weight: bold; color: #065f46;">${plan.ergoPrescription?.sessionsPerWeek || 0}</div>
            <div style="font-size: 11px; color: #10b981;">séances/sem</div>
          </div>
          <div style="background: #ede9fe; padding: 15px; border-radius: 10px; text-align: center;">
            <h5 style="margin: 0 0 5px 0; color: #6d28d9;">🗣️ Ortho</h5>
            <div style="font-size: 24px; font-weight: bold; color: #5b21b6;">${plan.orthoPrescription?.sessionsPerWeek || 0}</div>
            <div style="font-size: 11px; color: #8b5cf6;">séances/sem</div>
          </div>
        </div>
      </div>
    `;
    showViewModal('Détails du Plan', content);
  } catch (error) {
    console.error('Error viewing plan:', error);
    showNotification('Erreur lors de l\'affichage', 'error');
  }
}

function showViewModal(title, content) {
  let modal = document.getElementById('view-detail-modal');
  if (!modal) {
    const modalHtml = `
      <div id="view-detail-modal" class="modal hidden">
        <div class="modal-overlay" onclick="closeModal('view-detail-modal')"></div>
        <div class="modal-content" style="max-width: 750px; max-height: 90vh; overflow: hidden;">
          <div class="modal-header">
            <h2 id="view-detail-title">Détails</h2>
            <button class="close-btn" onclick="closeModal('view-detail-modal')">&times;</button>
          </div>
          <div class="modal-body" id="view-detail-body" style="overflow-y: auto; max-height: calc(90vh - 80px);"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('view-detail-modal');
  }
  
  document.getElementById('view-detail-title').textContent = title;
  document.getElementById('view-detail-body').innerHTML = content;
  
  if (typeof openModal === 'function') openModal('view-detail-modal');
  else { modal.classList.remove('hidden'); modal.classList.add('active'); modal.style.display = 'flex'; }
}

async function printEvaluation(evaluationId) {
  try {
    const evaluation = await window.api.functionalEvaluation.getById(evaluationId);
    if (!evaluation) { showNotification('Bilan non trouvé', 'error'); return; }
    
    let patientName = 'Patient';
    if (evaluation.patientId) {
      const patient = await window.api.patient.getById(evaluation.patientId);
      if (patient) patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
    }
    
    const settings = await window.api.settings.get();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bilan - ${patientName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20mm; font-size: 11pt; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; }
          .header h1 { color: #1e40af; font-size: 18pt; }
          .section { margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .footer { margin-top: 30px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BILAN FONCTIONNEL MPR</h1>
          <p>${settings.clinicName || ''}</p>
        </div>
        <p><strong>Patient:</strong> ${patientName} | <strong>Date:</strong> ${formatDate(evaluation.evaluationDate || evaluation.date)}</p>
        <div class="section">
          <h3>Scores Fonctionnels</h3>
          <div class="grid">
            <p><strong>Autonomie:</strong> ${evaluation.autonomyScore || 0}%</p>
            <p><strong>Mobilité:</strong> ${evaluation.mobilityScore || 0}%</p>
            <p><strong>Équilibre:</strong> ${evaluation.balanceScore || 0}%</p>
            <p><strong>Coordination:</strong> ${evaluation.coordinationScore || 0}%</p>
          </div>
        </div>
        <div class="section">
          <h3>Douleur</h3>
          <p><strong>EVA:</strong> ${evaluation.painScore || evaluation.painEVA || 0}/10</p>
          <p><strong>Localisation:</strong> ${evaluation.painLocation || 'Non spécifiée'}</p>
        </div>
        <div class="footer">
          <p>Fait le ${formatDate(new Date().toISOString().split('T')[0])}</p>
          <p>${settings.doctorName || ''}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  } catch (error) {
    console.error('Error printing:', error);
    showNotification('Erreur lors de l\'impression', 'error');
  }
}

async function printRehabPlanLegacy(planId) {
  try {
    const plan = await window.api.rehabilitationPlan.getById(planId);
    if (!plan) { showNotification('Plan non trouvé', 'error'); return; }
    
    let patientName = 'Patient';
    if (plan.patientId) {
      const patient = await window.api.patient.getById(plan.patientId);
      if (patient) patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
    }
    
    const settings = await window.api.settings.get();
    let objectives = plan.objectives || {};
    if (typeof objectives === 'string') try { objectives = JSON.parse(objectives); } catch(e) { objectives = {}; }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Plan - ${patientName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20mm; font-size: 11pt; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #8b5cf6; padding-bottom: 15px; }
          .header h1 { color: #6d28d9; font-size: 18pt; }
          .section { margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; }
          .prescriptions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; }
          .footer { margin-top: 30px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PLAN DE RÉÉDUCATION</h1>
          <p>${settings.clinicName || ''}</p>
        </div>
        <p><strong>Patient:</strong> ${patientName}</p>
        <p><strong>Période:</strong> ${formatDate(plan.startDate)} - ${plan.endDate ? formatDate(plan.endDate) : 'En cours'}</p>
        <div class="section">
          <h3>Objectifs</h3>
          <p><strong>Court terme:</strong> ${objectives.shortTerm || 'Non défini'}</p>
          <p><strong>Moyen terme:</strong> ${objectives.mediumTerm || 'Non défini'}</p>
          <p><strong>Long terme:</strong> ${objectives.longTerm || 'Non défini'}</p>
        </div>
        <div class="section">
          <h3>Prescriptions</h3>
          <div class="prescriptions">
            <div><strong>Kiné:</strong> ${plan.kinePrescription?.sessionsPerWeek || 0} séances/sem</div>
            <div><strong>Ergo:</strong> ${plan.ergoPrescription?.sessionsPerWeek || 0} séances/sem</div>
            <div><strong>Ortho:</strong> ${plan.orthoPrescription?.sessionsPerWeek || 0} séances/sem</div>
          </div>
        </div>
        <div class="footer">
          <p>Fait le ${formatDate(new Date().toISOString().split('T')[0])}</p>
          <p>${settings.doctorName || ''}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  } catch (error) {
    console.error('Error printing:', error);
    showNotification('Erreur lors de l\'impression', 'error');
  }
}

async function deleteEvaluationLegacy(evaluationId) {
  if (!confirm('Supprimer ce bilan fonctionnel ?')) return;
  
  try {
    const result = await window.api.functionalEvaluation.delete(evaluationId);
    if (result.success) {
      showNotification('✅ Bilan supprimé', 'success');
      if (rehabSelectedPatientId) await loadRehabDataForPatient(rehabSelectedPatientId);
    } else {
      showNotification('❌ Erreur: ' + (result.error || 'Échec'), 'error');
    }
  } catch (error) {
    console.error('Error deleting:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

async function deleteRehabPlanLegacy(planId) {
  if (!confirm('Supprimer ce plan de rééducation ?')) return;
  
  try {
    const result = await window.api.rehabilitationPlan.delete(planId);
    if (result.success) {
      showNotification('✅ Plan supprimé', 'success');
      if (rehabSelectedPatientId) await loadRehabDataForPatient(rehabSelectedPatientId);
    } else {
      showNotification('❌ Erreur: ' + (result.error || 'Échec'), 'error');
    }
  } catch (error) {
    console.error('Error deleting:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

function enhanceRehabModalPresentation(modalId, accentClass) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    return null;
  }

  const content = modal.querySelector('.modal-content');
  const header = modal.querySelector('.modal-header');
  const body = modal.querySelector('.modal-body');
  const footer = modal.querySelector('.modal-footer');

  modal.classList.add('rehab-modal-shell');
  content?.classList.add('rehab-modal-content', 'rehab-modal-dialog');
  header?.classList.add('rehab-modal-header');
  body?.classList.add('rehab-modal-body');
  footer?.classList.add('rehab-modal-footer');
  if (accentClass) {
    content?.classList.add(accentClass);
  }

  modal.querySelectorAll('.modal-body > div[style], .modal-body > form > div[style]').forEach(section => {
    section.classList.add('rehab-modal-section');
  });

  modal.querySelector('#evaluation-form > .form-group:first-child, #rehab-form > .form-group:first-child')
    ?.classList.add('rehab-modal-patient-field');
  modal.querySelector('#eval-date')?.closest('div[style]')?.classList.add('rehab-modal-meta-grid');
  modal.querySelector('#rehab-start-date')?.closest('div[style]')?.classList.add('rehab-modal-meta-grid');
  modal.querySelector('#eval-autonomy')?.closest('div[style]')?.classList.add('rehab-modal-two-col');
  modal.querySelector('#eval-pain-location')?.closest('div[style]')?.classList.add('rehab-modal-two-col');
  modal.querySelector('#eval-gait-type')?.closest('div[style]')?.classList.add('rehab-modal-three-col');
  modal.querySelector('#kine-sessions')?.closest('div[style]')?.classList.add('rehab-modal-prescription-grid');
  modal.querySelector('input[name="appareillage"]')?.closest('div[style]')?.classList.add('rehab-modal-check-grid');
  modal.querySelector('#mrc-evaluation')?.classList.add('rehab-modal-scroll-panel');

  return modal;
}

async function openEvaluationModal(patientId = null) {
  let modal = document.getElementById('evaluation-modal');
  if (!modal) {
    createEvaluationModal();
    modal = document.getElementById('evaluation-modal');
  }

  enhanceRehabModalPresentation('evaluation-modal', 'rehab-modal-content-evaluation');

  const form = document.getElementById('evaluation-form');
  if (form) form.reset();

  const dateField = document.getElementById('eval-date');
  if (dateField) dateField.value = new Date().toISOString().split('T')[0];

  ['eval-autonomy', 'eval-mobility', 'eval-balance', 'eval-coordination'].forEach(id => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.value = 50;
      const valueEl = document.getElementById(`${id}-value`);
      if (valueEl) valueEl.textContent = '50%';
    }
  });

  document.querySelectorAll('#evaluation-modal .eva-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.style.transform = 'scale(1)';
  });

  const firstEva = document.querySelector('#evaluation-modal .eva-btn[data-value="0"]');
  if (firstEva) {
    firstEva.classList.add('selected');
    firstEva.style.transform = 'scale(1.2)';
  }

  const evaInput = document.getElementById('eval-pain-eva');
  if (evaInput) evaInput.value = 0;

  try {
    const selectedId = patientId || rehabSelectedPatientId || currentPatientId;
    await ensureRehabModalPatients();
    fillRehabPatientSelect('eval-patient-select', selectedId);
  } catch (error) {
    console.error('Error loading patients:', error);
  }

  try {
    await ensureRehabEvaluators();
    fillRehabEvaluatorSelect('eval-evaluator', currentUserId);
  } catch (error) {
    console.error('Error loading evaluators:', error);
  }

  if (typeof openModal === 'function') {
    openModal('evaluation-modal');
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

async function openRehabPlanModal(patientId = null) {
  let modal = document.getElementById('rehab-plan-modal');
  if (!modal) {
    createRehabPlanModal();
    modal = document.getElementById('rehab-plan-modal');
  }

  enhanceRehabModalPresentation('rehab-plan-modal', 'rehab-modal-content-plan');

  const form = document.getElementById('rehab-form');
  if (form) form.reset();

  const startDateField = document.getElementById('rehab-start-date');
  if (startDateField) startDateField.value = new Date().toISOString().split('T')[0];

  try {
    const selectedId = patientId || rehabSelectedPatientId || currentPatientId;
    await ensureRehabModalPatients();
    fillRehabPatientSelect('rehab-patient-select', selectedId);
  } catch (error) {
    console.error('Error loading patients:', error);
  }

  if (typeof openModal === 'function') {
    openModal('rehab-plan-modal');
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

openEvaluationModal = async function(patientId = null) {
  let modal = document.getElementById('evaluation-modal');
  if (!modal) {
    createEvaluationModal();
    modal = document.getElementById('evaluation-modal');
  }

  enhanceRehabModalPresentation('evaluation-modal', 'rehab-modal-content-evaluation');

  const form = document.getElementById('evaluation-form');
  if (form) form.reset();

  const dateField = document.getElementById('eval-date');
  if (dateField) dateField.value = new Date().toISOString().split('T')[0];

  ['eval-autonomy', 'eval-mobility', 'eval-balance', 'eval-coordination'].forEach(id => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.value = 50;
      const valueEl = document.getElementById(`${id}-value`);
      if (valueEl) valueEl.textContent = '50%';
    }
  });

  document.querySelectorAll('#evaluation-modal .eva-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.style.transform = 'scale(1)';
  });

  const firstEva = document.querySelector('#evaluation-modal .eva-btn[data-value="0"]');
  if (firstEva) {
    firstEva.classList.add('selected');
    firstEva.style.transform = 'scale(1.2)';
  }

  const evaInput = document.getElementById('eval-pain-eva');
  if (evaInput) evaInput.value = 0;

  try {
    const selectedId = patientId || rehabSelectedPatientId || currentPatientId;
    await ensureRehabModalPatients();
    fillRehabPatientSelect('eval-patient-select', selectedId);
  } catch (error) {
    console.error('Error loading patients:', error);
  }

  try {
    await ensureRehabEvaluators();
    fillRehabEvaluatorSelect('eval-evaluator', currentUserId);
  } catch (error) {
    console.error('Error loading evaluators:', error);
  }

  if (typeof openModal === 'function') {
    openModal('evaluation-modal');
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

openRehabPlanModal = async function(patientId = null) {
  let modal = document.getElementById('rehab-plan-modal');
  if (!modal) {
    createRehabPlanModal();
    modal = document.getElementById('rehab-plan-modal');
  }

  enhanceRehabModalPresentation('rehab-plan-modal', 'rehab-modal-content-plan');

  const form = document.getElementById('rehab-form');
  if (form) form.reset();

  const startDateField = document.getElementById('rehab-start-date');
  if (startDateField) startDateField.value = new Date().toISOString().split('T')[0];

  try {
    const selectedId = patientId || rehabSelectedPatientId || currentPatientId;
    await ensureRehabModalPatients();
    fillRehabPatientSelect('rehab-patient-select', selectedId);
  } catch (error) {
    console.error('Error loading patients:', error);
  }

  if (typeof openModal === 'function') {
    openModal('rehab-plan-modal');
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

async function loadRehabDataForPatient(patientId, options = {}) {
  if (!patientId) {
    clearRehabTabs();
    return { evaluations: [], plans: [] };
  }

  if (!options.preservePage) {
    rehabBilansPage = 1;
    rehabPlansPage = 1;
  }

  const cacheKey = getRehabCacheKey(patientId);
  if (!options.force) {
    const cachedData = rehabPatientDataCache.get(cacheKey);
    if (cachedData) {
      renderRehabPatientData(cachedData);
      return cachedData;
    }
  }

  const loadToken = ++rehabActiveLoadToken;

  try {
    const evaluationPromise = window.api.functionalEvaluation?.getByPatient
      ? window.api.functionalEvaluation.getByPatient(patientId)
      : [];
    const planPromise = window.api.rehabilitationPlan?.getByPatient
      ? window.api.rehabilitationPlan.getByPatient(patientId)
      : [];

    const [evaluationsResult, plansResult] = await Promise.all([evaluationPromise, planPromise]);

    if (loadToken !== rehabActiveLoadToken || String(patientId) !== String(rehabSelectedPatientId)) {
      return null;
    }

    const evaluations = normalizeRehabArray(evaluationsResult);
    const plans = normalizeRehabArray(plansResult).map(normalizeRehabPlanRecord).filter(Boolean);
    const cachedData = cacheRehabPatientData(patientId, { evaluations, plans });
    renderRehabPatientData(cachedData);
    return cachedData;
  } catch (error) {
    console.error('Error loading rehab data for patient:', error);
    return null;
  }
}

function changeRehabBilansPage(direction) {
  const cachedData = getCachedRehabPatientData(rehabSelectedPatientId);
  const evaluations = Array.isArray(cachedData?.evaluations) ? cachedData.evaluations : [];

  if (!evaluations.length) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(evaluations.length / REHAB_BILANS_PAGE_SIZE));
  const nextPage = Math.max(1, Math.min(totalPages, rehabBilansPage + direction));
  if (nextPage === rehabBilansPage) {
    return;
  }

  rehabBilansPage = nextPage;
  renderBilansList(evaluations);
}

function changeRehabPlansPage(direction) {
  const cachedData = getCachedRehabPatientData(rehabSelectedPatientId);
  const plans = Array.isArray(cachedData?.plans) ? cachedData.plans : [];

  if (!plans.length) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(plans.length / REHAB_PLANS_PAGE_SIZE));
  const nextPage = Math.max(1, Math.min(totalPages, rehabPlansPage + direction));
  if (nextPage === rehabPlansPage) {
    return;
  }

  rehabPlansPage = nextPage;
  renderPlansList(plans);
}

function renderPlansList(plans) {
  const container = document.getElementById('rehab-plans-list');
  if (!container) return;

  const normalizedPlans = Array.isArray(plans) ? plans.map(normalizeRehabPlanRecord).filter(Boolean) : [];

  if (!normalizedPlans.length) {
    container.innerHTML = buildRehabEmptyState({
      code: 'PR',
      title: 'Aucun plan de reeducation',
      description: 'Ajoutez un plan de prise en charge pour organiser les seances.',
      actionLabel: 'Nouveau plan',
      actionOnClick: 'openRehabPlanModal()'
    });
    return;
  }

  const totalPages = Math.max(1, Math.ceil(normalizedPlans.length / REHAB_PLANS_PAGE_SIZE));
  if (rehabPlansPage > totalPages) rehabPlansPage = totalPages;
  if (rehabPlansPage < 1) rehabPlansPage = 1;

  const startIndex = (rehabPlansPage - 1) * REHAB_PLANS_PAGE_SIZE;
  const pagePlans = normalizedPlans.slice(startIndex, startIndex + REHAB_PLANS_PAGE_SIZE);

  const statusConfig = {
    active: { label: 'Actif', bg: '#dcfce7', color: '#166534', border: '#22c55e', icon: '&#128994;' },
    paused: { label: 'En pause', bg: '#fef3c7', color: '#92400e', border: '#f59e0b', icon: '&#128993;' },
    completed: { label: 'Termine', bg: '#e0e7ff', color: '#4338ca', border: '#6366f1', icon: '&#128309;' }
  };

  const cardsHtml = pagePlans.map(plan => {
    const status = statusConfig[plan.status] || statusConfig.active;
    const objectives = plan.objectives || {};
    const equipmentSummary = buildRehabEquipmentSummary(plan);

    return `
    <div class="rehab-plan-card-pro" data-id="${plan.id}" style="--rehab-plan-border:${status.border}; --rehab-plan-bg:${status.bg}; --rehab-plan-color:${status.color};">
      <div class="rehab-record-header">
        <div>
          <span class="rehab-record-pill">${status.icon} ${status.label}</span>
          <h4 class="rehab-record-title">&#128197; ${formatDate(plan.startDate)} &#8594; ${plan.endDate ? formatDate(plan.endDate) : 'En cours'}</h4>
        </div>
        <div class="rehab-record-actions">
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-neutral" onclick="viewRehabPlan('${plan.id}')" title="Voir">&#128065;</button>
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-print" onclick="printRehabPlan('${plan.id}')" title="Imprimer">&#128424;</button>
          <button class="btn btn-sm rehab-action-btn rehab-action-btn-danger" onclick="deleteRehabPlan('${plan.id}')" title="Supprimer">&#128465;</button>
        </div>
      </div>

      <div class="rehab-prescription-grid">
        ${renderRehabPrescriptionCard('Kinesitherapie', '&#128134;', plan.kinePrescription.sessionsPerWeek, plan.kinePrescription.weeks, 'primary')}
        ${renderRehabPrescriptionCard('Ergotherapie', '&#128421;', plan.ergoPrescription.sessionsPerWeek, plan.ergoPrescription.weeks, 'success')}
        ${renderRehabPrescriptionCard('Orthophonie', '&#128483;', plan.orthoPrescription.sessionsPerWeek, plan.orthoPrescription.weeks, 'violet')}
      </div>

      ${objectives.shortTerm || objectives.mediumTerm || objectives.longTerm ? `
        <div class="rehab-goals-box">
          <div class="rehab-note-label">&#127919; Objectifs therapeutiques</div>
          ${objectives.shortTerm ? `<div class="rehab-goal-row"><span>Court terme</span><strong>${objectives.shortTerm}</strong></div>` : ''}
          ${objectives.mediumTerm ? `<div class="rehab-goal-row"><span>Moyen terme</span><strong>${objectives.mediumTerm}</strong></div>` : ''}
          ${objectives.longTerm ? `<div class="rehab-goal-row"><span>Long terme</span><strong>${objectives.longTerm}</strong></div>` : ''}
        </div>
      ` : ''}

      ${equipmentSummary ? `
        <div class="rehab-note-box">
          <div class="rehab-note-label">Appareillage</div>
          <div class="rehab-note-text">${equipmentSummary}</div>
        </div>
      ` : ''}
    </div>
    `;
  }).join('');

  const paginationHtml = totalPages > 1
    ? `
      <div class="list-pagination">
        <div class="list-pagination-info">${startIndex + 1}-${Math.min(startIndex + REHAB_PLANS_PAGE_SIZE, normalizedPlans.length)} / ${normalizedPlans.length}</div>
        <div class="list-pagination-actions pagination-controls">
          <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${rehabPlansPage <= 1 ? 'disabled' : ''} onclick="changeRehabPlansPage(-1)">‹</button>
          <span class="list-pagination-info">${rehabPlansPage}/${totalPages}</span>
          <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${rehabPlansPage >= totalPages ? 'disabled' : ''} onclick="changeRehabPlansPage(1)">›</button>
        </div>
      </div>
    `
    : '';

  container.innerHTML = `${cardsHtml}${paginationHtml}`;
}

function updateRehabStats(evaluations, plans) {
  const normalizedPlans = Array.isArray(plans) ? plans.map(normalizeRehabPlanRecord).filter(Boolean) : [];
  const activePlans = normalizedPlans.filter(plan => plan.status === 'active');
  const statActivePlans = document.getElementById('stat-active-plans');
  if (statActivePlans) statActivePlans.textContent = activePlans.length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const evaluationsThisMonth = (Array.isArray(evaluations) ? evaluations : []).filter(evaluation => {
    const evaluationDate = new Date(evaluation.evaluationDate || evaluation.date);
    return !Number.isNaN(evaluationDate.getTime()) && evaluationDate >= startOfMonth;
  });
  const statEvaluations = document.getElementById('stat-evaluations-month');
  if (statEvaluations) statEvaluations.textContent = evaluationsThisMonth.length;

  const totalSessions = activePlans.reduce((sum, plan) => (
    sum
    + (plan.kinePrescription.sessionsPerWeek || 0)
    + (plan.ergoPrescription.sessionsPerWeek || 0)
    + (plan.orthoPrescription.sessionsPerWeek || 0)
  ), 0);
  const statSessions = document.getElementById('stat-planned-sessions');
  if (statSessions) statSessions.textContent = totalSessions;
}

async function saveEvaluation() {
  const patientId = document.getElementById('eval-patient-select')?.value;

  if (!patientId) {
    showNotification('Veuillez selectionner un patient', 'error');
    return;
  }

  const evaluation = {
    patientId,
    date: document.getElementById('eval-date')?.value || new Date().toISOString().split('T')[0],
    type: document.getElementById('eval-type')?.value || 'initial',
    autonomyScore: parseInt(document.getElementById('eval-autonomy')?.value || 50, 10),
    mobilityScore: parseInt(document.getElementById('eval-mobility')?.value || 50, 10),
    balanceScore: parseInt(document.getElementById('eval-balance')?.value || 50, 10),
    coordinationScore: parseInt(document.getElementById('eval-coordination')?.value || 50, 10),
    painEVA: parseInt(document.getElementById('eval-pain-eva')?.value || 0, 10),
    painLocation: document.getElementById('eval-pain-location')?.value || '',
    spasticityAshworth: document.getElementById('eval-spasticity')?.value || '0',
    jointRange: document.getElementById('eval-joint-range')?.value || '',
    gaitType: document.getElementById('eval-gait-type')?.value || 'normal',
    walkingAid: document.getElementById('eval-walking-aid')?.value || 'aucune',
    walkingDistance: document.getElementById('eval-walking-distance')?.value || '',
    observations: document.getElementById('eval-observations')?.value || '',
    objectives: document.getElementById('eval-objectives')?.value || '',
    evaluatorId: document.getElementById('eval-evaluator')?.value || currentUserId,
    mrcScores: collectMRCScores()
  };

  try {
    if (!window.api.functionalEvaluation?.create) {
      showNotification('API non disponible', 'warning');
      return;
    }

    const result = await window.api.functionalEvaluation.create(evaluation);
    if (!result?.success) {
      showNotification(`Erreur: ${result?.error || 'Echec'}`, 'error');
      return;
    }

    showNotification('Bilan fonctionnel enregistre avec succes', 'success');
    closeModal('evaluation-modal');
    invalidateRehabPatientData(patientId);
    rehabBilansPage = 1;

    if (String(rehabSelectedPatientId || '') !== String(patientId)) {
      rehabSelectedPatientId = patientId;
      const rehabSelector = document.getElementById('rehab-patient-selector');
      if (rehabSelector) {
        if (typeof window.setLazyPatientFieldValue === 'function') {
          window.setLazyPatientFieldValue('rehab-patient-selector', patientId);
        } else {
          rehabSelector.value = patientId;
        }
      }
    }

    await selectRehabPatient(patientId);
  } catch (error) {
    console.error('Error saving evaluation:', error);
    showNotification(`Erreur: ${error.message || 'Echec'}`, 'error');
  }
}

async function saveRehabPlan() {
  const patientId = document.getElementById('rehab-patient-select')?.value;

  if (!patientId) {
    showNotification('Veuillez selectionner un patient', 'error');
    return;
  }

  const plan = {
    patientId,
    startDate: document.getElementById('rehab-start-date')?.value || new Date().toISOString().split('T')[0],
    endDate: document.getElementById('rehab-end-date')?.value || null,
    status: document.getElementById('rehab-status')?.value || 'active',
    shortTermObjectives: document.getElementById('rehab-short-term')?.value || '',
    mediumTermObjectives: document.getElementById('rehab-medium-term')?.value || '',
    longTermObjectives: document.getElementById('rehab-long-term')?.value || '',
    kinePrescription: {
      sessionsPerWeek: parseInt(document.getElementById('kine-sessions')?.value || 0, 10),
      weeks: parseInt(document.getElementById('kine-weeks')?.value || 0, 10)
    },
    ergoPrescription: {
      sessionsPerWeek: parseInt(document.getElementById('ergo-sessions')?.value || 0, 10),
      weeks: parseInt(document.getElementById('ergo-weeks')?.value || 0, 10)
    },
    orthoPrescription: {
      sessionsPerWeek: parseInt(document.getElementById('ortho-sessions')?.value || 0, 10),
      weeks: parseInt(document.getElementById('ortho-weeks')?.value || 0, 10)
    },
    equipment: getCheckedValues('appareillage'),
    equipmentDetails: document.getElementById('rehab-equipment-details')?.value || '',
    notes: document.getElementById('rehab-notes')?.value || '',
    createdBy: currentUserId
  };

  try {
    if (!window.api.rehabilitationPlan?.create) {
      showNotification('API non disponible', 'warning');
      return;
    }

    const result = await window.api.rehabilitationPlan.create(plan);
    if (!result?.success) {
      showNotification(`Erreur: ${result?.error || 'Echec'}`, 'error');
      return;
    }

    showNotification('Plan de reeducation enregistre avec succes', 'success');
    closeModal('rehab-plan-modal');
    invalidateRehabPatientData(patientId);
    rehabPlansPage = 1;

    if (String(rehabSelectedPatientId || '') !== String(patientId)) {
      rehabSelectedPatientId = patientId;
      const rehabSelector = document.getElementById('rehab-patient-selector');
      if (rehabSelector) {
        if (typeof window.setLazyPatientFieldValue === 'function') {
          window.setLazyPatientFieldValue('rehab-patient-selector', patientId);
        } else {
          rehabSelector.value = patientId;
        }
      }
    }

    await selectRehabPatient(patientId);
  } catch (error) {
    console.error('Error saving plan:', error);
    showNotification(`Erreur: ${error.message || 'Echec'}`, 'error');
  }
}

async function deleteEvaluation(evaluationId) {
  if (!confirm('Supprimer ce bilan fonctionnel ?')) return;

  try {
    const result = await window.api.functionalEvaluation.delete(evaluationId);
    if (!result?.success) {
      showNotification(`Erreur: ${result?.error || 'Echec'}`, 'error');
      return;
    }

    showNotification('Bilan supprime', 'success');
    invalidateRehabPatientData(rehabSelectedPatientId);
    if (rehabSelectedPatientId) {
      await loadRehabDataForPatient(rehabSelectedPatientId, { force: true, preservePage: true });
    }
  } catch (error) {
    console.error('Error deleting evaluation:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

async function deleteRehabPlan(planId) {
  if (!confirm('Supprimer ce plan de reeducation ?')) return;

  try {
    const result = await window.api.rehabilitationPlan.delete(planId);
    if (!result?.success) {
      showNotification(`Erreur: ${result?.error || 'Echec'}`, 'error');
      return;
    }

    showNotification('Plan supprime', 'success');
    invalidateRehabPatientData(rehabSelectedPatientId);
    if (rehabSelectedPatientId) {
      await loadRehabDataForPatient(rehabSelectedPatientId, { force: true, preservePage: true });
    }
  } catch (error) {
    console.error('Error deleting plan:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

async function viewRehabPlan(planId) {
  try {
    const rawPlan = await window.api.rehabilitationPlan.getById(planId);
    const plan = normalizeRehabPlanRecord(unwrapRehabApiRecord(rawPlan));
    if (!plan) {
      showNotification('Plan non trouve', 'error');
      return;
    }

    let patientName = 'Patient';
    if (plan.patientId) {
      const patientResult = await window.api.patient.getById(plan.patientId);
      const patient = unwrapRehabApiRecord(patientResult);
      if (patient) {
        patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
      }
    }

    const objectives = plan.objectives || {};
    const equipmentSummary = buildRehabEquipmentSummary(plan);
    const content = `
      <div style="padding: 20px;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; color: white;">
          <h3 style="margin: 0 0 10px 0;">&#128221; Plan de Reeducation</h3>
          <p style="margin: 0; opacity: 0.9;"><strong>Patient:</strong> ${patientName}</p>
          <p style="margin: 5px 0 0 0; opacity: 0.9;"><strong>Periode:</strong> ${formatDate(plan.startDate)} - ${plan.endDate ? formatDate(plan.endDate) : 'En cours'}</p>
        </div>
        <div style="background: #f0f9ff; padding: 20px; border-radius: 12px; margin-bottom: 15px;">
          <h4 style="margin: 0 0 10px 0; color: #0369a1;">&#127919; Objectifs</h4>
          <p><strong>Court terme:</strong> ${objectives.shortTerm || 'Non defini'}</p>
          <p><strong>Moyen terme:</strong> ${objectives.mediumTerm || 'Non defini'}</p>
          <p><strong>Long terme:</strong> ${objectives.longTerm || 'Non defini'}</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background: #dbeafe; padding: 15px; border-radius: 10px; text-align: center;">
            <h5 style="margin: 0 0 5px 0; color: #1e40af;">Kine</h5>
            <div style="font-size: 24px; font-weight: bold; color: #1e3a8a;">${plan.kinePrescription.sessionsPerWeek || 0}</div>
            <div style="font-size: 11px; color: #3b82f6;">seances/sem</div>
          </div>
          <div style="background: #d1fae5; padding: 15px; border-radius: 10px; text-align: center;">
            <h5 style="margin: 0 0 5px 0; color: #047857;">Ergo</h5>
            <div style="font-size: 24px; font-weight: bold; color: #065f46;">${plan.ergoPrescription.sessionsPerWeek || 0}</div>
            <div style="font-size: 11px; color: #10b981;">seances/sem</div>
          </div>
          <div style="background: #ede9fe; padding: 15px; border-radius: 10px; text-align: center;">
            <h5 style="margin: 0 0 5px 0; color: #6d28d9;">Ortho</h5>
            <div style="font-size: 24px; font-weight: bold; color: #5b21b6;">${plan.orthoPrescription.sessionsPerWeek || 0}</div>
            <div style="font-size: 11px; color: #8b5cf6;">seances/sem</div>
          </div>
        </div>
        ${equipmentSummary ? `
          <div style="background: #fffbeb; padding: 20px; border-radius: 12px; margin-top: 15px;">
            <h4 style="margin: 0 0 10px 0; color: #b45309;">Appareillage</h4>
            <p>${equipmentSummary}</p>
          </div>
        ` : ''}
      </div>
    `;
    showViewModal('Details du Plan', content);
  } catch (error) {
    console.error('Error viewing plan:', error);
    showNotification('Erreur lors de l affichage', 'error');
  }
}

async function printRehabPlan(planId) {
  try {
    const rawPlan = await window.api.rehabilitationPlan.getById(planId);
    const plan = normalizeRehabPlanRecord(unwrapRehabApiRecord(rawPlan));
    if (!plan) {
      showNotification('Plan non trouve', 'error');
      return;
    }

    let patientName = 'Patient';
    if (plan.patientId) {
      const patientResult = await window.api.patient.getById(plan.patientId);
      const patient = unwrapRehabApiRecord(patientResult);
      if (patient) {
        patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
      }
    }

    const settings = await window.api.settings.get();
    const objectives = plan.objectives || {};
    const equipmentSummary = buildRehabEquipmentSummary(plan);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Plan - ${patientName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20mm; font-size: 11pt; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #8b5cf6; padding-bottom: 15px; }
          .header h1 { color: #6d28d9; font-size: 18pt; }
          .section { margin-bottom: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; }
          .prescriptions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; }
          .footer { margin-top: 30px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PLAN DE REEDUCATION</h1>
          <p>${settings.clinicName || ''}</p>
        </div>
        <p><strong>Patient:</strong> ${patientName}</p>
        <p><strong>Periode:</strong> ${formatDate(plan.startDate)} - ${plan.endDate ? formatDate(plan.endDate) : 'En cours'}</p>
        <div class="section">
          <h3>Objectifs</h3>
          <p><strong>Court terme:</strong> ${objectives.shortTerm || 'Non defini'}</p>
          <p><strong>Moyen terme:</strong> ${objectives.mediumTerm || 'Non defini'}</p>
          <p><strong>Long terme:</strong> ${objectives.longTerm || 'Non defini'}</p>
        </div>
        <div class="section">
          <h3>Prescriptions</h3>
          <div class="prescriptions">
            <div><strong>Kine:</strong> ${plan.kinePrescription.sessionsPerWeek || 0} seances/sem</div>
            <div><strong>Ergo:</strong> ${plan.ergoPrescription.sessionsPerWeek || 0} seances/sem</div>
            <div><strong>Ortho:</strong> ${plan.orthoPrescription.sessionsPerWeek || 0} seances/sem</div>
          </div>
        </div>
        ${equipmentSummary ? `
          <div class="section">
            <h3>Appareillage</h3>
            <p>${equipmentSummary}</p>
          </div>
        ` : ''}
        <div class="footer">
          <p>Fait le ${formatDate(new Date().toISOString().split('T')[0])}</p>
          <p>${settings.doctorName || ''}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  } catch (error) {
    console.error('Error printing:', error);
    showNotification('Erreur lors de l impression', 'error');
  }
}

// ========== EXPORT FUNCTIONS ==========

window.initRehabilitation = initRehabilitation;
window.refreshRehabPatientList = refreshRehabPatientList;
window.selectRehabPatient = selectRehabPatient;
window.switchRehabMainTab = switchRehabMainTab;
window.openEvaluationModal = openEvaluationModal;
window.openRehabPlanModal = openRehabPlanModal;
window.saveEvaluation = saveEvaluation;
window.saveRehabPlan = saveRehabPlan;
window.viewEvaluation = viewEvaluation;
window.viewRehabPlan = viewRehabPlan;
window.printEvaluation = printEvaluation;
window.printRehabPlan = printRehabPlan;
window.deleteEvaluation = deleteEvaluation;
window.deleteRehabPlan = deleteRehabPlan;
window.loadRehabDataForPatient = loadRehabDataForPatient;
window.changeRehabBilansPage = changeRehabBilansPage;
window.changeRehabPlansPage = changeRehabPlansPage;

// ========== LAZY PATIENT SEARCH OVERRIDES ==========

async function refreshRehabPatientList() {
  try {
    const select = document.getElementById('rehab-patient-selector');
    if (!select) return;

    if (typeof window.attachLazyPatientSearchToSelect === 'function') {
      window.attachLazyPatientSearchToSelect('rehab-patient-selector', {
        selectedPatientId: rehabSelectedPatientId || '',
        placeholder: 'Tapez la premiere lettre du patient...',
        emptyMessage: 'Tapez la premiere lettre du patient',
        loadingMessage: 'Recherche des patients...',
        noResultsMessage: 'Aucun patient commence par cette recherche',
        restoreCommittedOnBlur: true
      });
    }

    rehabModalPatientsCache = [];
    rehabPatientListLoaded = true;
  } catch (error) {
    console.error('Error refreshing patient list:', error);
  }
}

async function ensureRehabModalPatients() {
  return rehabModalPatientsCache;
}

function ensureRehabPatientSearchField(selectId) {
  const field = document.getElementById(selectId);
  if (!field) {
    return null;
  }

  if (field.tagName !== 'SELECT' || selectId === 'rehab-patient-selector') {
    return field;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'searchable-select-container';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = selectId.replace('-select', '-search');
  searchInput.className = 'form-control searchable-select-input';
  searchInput.placeholder = 'Tapez la premiere lettre du patient...';
  searchInput.autocomplete = 'off';

  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.id = selectId;
  if (field.hasAttribute('required')) {
    hiddenInput.required = true;
  }

  const dropdown = document.createElement('div');
  dropdown.id = selectId.replace('-select', '-dropdown');
  dropdown.className = 'searchable-select-dropdown';

  wrapper.appendChild(searchInput);
  wrapper.appendChild(hiddenInput);
  wrapper.appendChild(dropdown);

  field.replaceWith(wrapper);
  return hiddenInput;
}

function fillRehabPatientSelect(selectId, selectedId = '') {
  const field = ensureRehabPatientSearchField(selectId);
  if (!field) {
    return;
  }

  if (selectId === 'rehab-patient-selector' && typeof window.attachLazyPatientSearchToSelect === 'function') {
    window.attachLazyPatientSearchToSelect(selectId, {
      selectedPatientId: selectedId || '',
      placeholder: 'Tapez la premiere lettre du patient...',
      emptyMessage: 'Tapez la premiere lettre du patient',
      loadingMessage: 'Recherche des patients...',
      noResultsMessage: 'Aucun patient commence par cette recherche',
      clearOnInput: true
    });
    return;
  }

  if (typeof window.initSearchablePatientSelect === 'function') {
    window.initSearchablePatientSelect(
      selectId.replace('-select', '-search'),
      selectId,
      selectId.replace('-select', '-dropdown'),
      {
        selectedPatientId: selectedId || '',
        placeholder: 'Tapez la premiere lettre du patient...',
        emptyMessage: 'Tapez la premiere lettre du patient',
        loadingMessage: 'Recherche des patients...',
        noResultsMessage: 'Aucun patient commence par cette recherche',
        clearOnInput: true
      }
    );
    return;
  }

  field.innerHTML = '<option value="">-- Selectionner un patient --</option>';
}

const originalSelectRehabPatient = selectRehabPatient;
selectRehabPatient = async function(patientId) {
  if (typeof window.setLazyPatientFieldValue === 'function') {
    window.setLazyPatientFieldValue('rehab-patient-selector', patientId || '');
  }
  return originalSelectRehabPatient(patientId);
};

function createEvaluationModal() {
  const modalHtml = `
    <div id="evaluation-modal" class="modal">
      <div class="modal-content modal-large rehab-modal-dialog">
        <div class="modal-header rehab-modal-header rehab-modal-header--blue">
          <h2>📋 Bilan Fonctionnel MPR</h2>
          <button class="close-btn" onclick="closeModal('evaluation-modal')" style="color: white;">&times;</button>
        </div>
        <div class="modal-body rehab-modal-body">
          <form id="evaluation-form" class="rehab-modal-form rehab-modal-form-v2">
            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--indigo">
                <span class="rehab-modal-section-icon">👤</span>
                <h3>Informations patient</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group">
                  <label>Patient *</label>
                  <select id="eval-patient-select" class="form-control" required>
                    <option value="">-- Sélectionner un patient --</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Date d'évaluation</label>
                  <input type="date" id="eval-date" class="form-control" required>
                </div>
                <div class="form-group">
                  <label>Type de bilan</label>
                  <select id="eval-type" class="form-control">
                    <option value="initial">Bilan Initial</option>
                    <option value="intermediaire">Bilan Intermédiaire</option>
                    <option value="final">Bilan Final</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Évaluateur</label>
                  <select id="eval-evaluator" class="form-control">
                    <option value="">Sélectionner...</option>
                  </select>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--blue">
                <span class="rehab-modal-section-icon">🎯</span>
                <h3>Évaluation Fonctionnelle</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2 rehab-range-grid-v2">
                <div class="rehab-range-card rehab-range-card--green">
                  <label>Autonomie (0-100%)</label>
                  <div class="rehab-range-control">
                    <input type="range" id="eval-autonomy" min="0" max="100" value="50" style="accent-color: #22c55e;" oninput="document.getElementById('eval-autonomy-value').textContent = this.value + '%'">
                    <span id="eval-autonomy-value">50%</span>
                  </div>
                </div>
                <div class="rehab-range-card rehab-range-card--blue">
                  <label>Mobilité (0-100%)</label>
                  <div class="rehab-range-control">
                    <input type="range" id="eval-mobility" min="0" max="100" value="50" style="accent-color: #3b82f6;" oninput="document.getElementById('eval-mobility-value').textContent = this.value + '%'">
                    <span id="eval-mobility-value">50%</span>
                  </div>
                </div>
                <div class="rehab-range-card rehab-range-card--violet">
                  <label>Équilibre (0-100%)</label>
                  <div class="rehab-range-control">
                    <input type="range" id="eval-balance" min="0" max="100" value="50" style="accent-color: #8b5cf6;" oninput="document.getElementById('eval-balance-value').textContent = this.value + '%'">
                    <span id="eval-balance-value">50%</span>
                  </div>
                </div>
                <div class="rehab-range-card rehab-range-card--amber">
                  <label>Coordination (0-100%)</label>
                  <div class="rehab-range-control">
                    <input type="range" id="eval-coordination" min="0" max="100" value="50" style="accent-color: #f59e0b;" oninput="document.getElementById('eval-coordination-value').textContent = this.value + '%'">
                    <span id="eval-coordination-value">50%</span>
                  </div>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--red">
                <span class="rehab-modal-section-icon">😣</span>
                <h3>Évaluation de la Douleur</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2 rehab-pain-grid-v2">
                <div class="form-group">
                  <label>EVA Douleur (0-10)</label>
                  <div class="eva-scale rehab-eva-panel">
                    ${generateEVAScale()}
                  </div>
                </div>
                <div class="form-group">
                  <label>Localisation de la douleur</label>
                  <input type="text" id="eval-pain-location" class="form-control" placeholder="Ex: Épaule droite, genou gauche...">
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--amber">
                <span class="rehab-modal-section-icon">🦴</span>
                <h3>Bilan Articulaire</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Amplitude articulaire / limitations</label>
                  <textarea id="eval-joint-range" class="form-control rehab-textarea-md" rows="3" placeholder="Décrire les amplitudes, limitations et douleurs provoquées..."></textarea>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--green">
                <span class="rehab-modal-section-icon">💪</span>
                <h3>Bilan Musculaire</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group">
                  <label>Spasticité (Échelle d'Ashworth Modifiée)</label>
                  <select id="eval-spasticity" class="form-control">
                    <option value="0">0 - Pas d'augmentation du tonus</option>
                    <option value="1">1 - Légère augmentation du tonus</option>
                    <option value="1+">1+ - Résistance minimale</option>
                    <option value="2">2 - Augmentation plus marquée</option>
                    <option value="3">3 - Augmentation considérable</option>
                    <option value="4">4 - Membre rigide</option>
                  </select>
                </div>
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Force Musculaire (MRC)</label>
                  <div class="mrc-grid rehab-modal-scroll-panel rehab-scroll-panel-strong" id="mrc-evaluation">
                    ${generateMRCGrid()}
                  </div>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--violet">
                <span class="rehab-modal-section-icon">🧭</span>
                <h3>Objectifs de Rééducation</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Objectifs</label>
                  <textarea id="eval-objectives" class="form-control rehab-textarea-md" rows="3" placeholder="Objectifs à court, moyen et long terme..."></textarea>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--teal">
                <span class="rehab-modal-section-icon">🗂️</span>
                <h3>Programme de Rééducation</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group">
                  <label>Type de marche</label>
                  <select id="eval-gait-type" class="form-control">
                    <option value="normal">Normale</option>
                    <option value="anormale">Anormale</option>
                    <option value="boiterie">Boiterie</option>
                    <option value="spastique">Spastique</option>
                    <option value="ataxique">Ataxique</option>
                    <option value="festinante">Festinante</option>
                    <option value="impossible">Impossible</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Aide technique</label>
                  <select id="eval-walking-aid" class="form-control">
                    <option value="aucune">Aucune</option>
                    <option value="canne">Canne simple</option>
                    <option value="canneT">Canne en T</option>
                    <option value="deambulateur">Déambulateur</option>
                    <option value="fauteuil">Fauteuil roulant</option>
                  </select>
                </div>
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Périmètre de marche</label>
                  <input type="text" id="eval-walking-distance" class="form-control" placeholder="Ex: 100m...">
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--slate">
                <span class="rehab-modal-section-icon">📝</span>
                <h3>Observations / Remarques</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Observations cliniques</label>
                  <textarea id="eval-observations" class="form-control rehab-textarea-md" rows="3" placeholder="Observations supplémentaires, remarques et éléments utiles..."></textarea>
                </div>
              </div>
            </section>
          </form>
        </div>
        <div class="modal-footer rehab-modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal('evaluation-modal')">ANNULER</button>
          <button type="button" class="btn btn-primary" onclick="saveEvaluation()">💾 ENREGISTRER LE BILAN</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function createRehabPlanModal() {
  const modalHtml = `
    <div id="rehab-plan-modal" class="modal">
      <div class="modal-content modal-large rehab-modal-dialog">
        <div class="modal-header rehab-modal-header rehab-modal-header--violet">
          <h2>📝 Plan de Rééducation</h2>
          <button class="close-btn" onclick="closeModal('rehab-plan-modal')" style="color: white;">&times;</button>
        </div>
        <div class="modal-body rehab-modal-body">
          <form id="rehab-form" class="rehab-modal-form rehab-modal-form-v2">
            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--indigo">
                <span class="rehab-modal-section-icon">👤</span>
                <h3>Informations patient</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Patient *</label>
                  <select id="rehab-patient-select" class="form-control" required>
                    <option value="">-- Sélectionner un patient --</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Date de début</label>
                  <input type="date" id="rehab-start-date" class="form-control" required>
                </div>
                <div class="form-group">
                  <label>Date de fin prévue</label>
                  <input type="date" id="rehab-end-date" class="form-control">
                </div>
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Statut</label>
                  <select id="rehab-status" class="form-control">
                    <option value="active">🟢 Actif</option>
                    <option value="paused">🟡 En pause</option>
                    <option value="completed">🔵 Terminé</option>
                  </select>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--violet">
                <span class="rehab-modal-section-icon">🎯</span>
                <h3>Objectifs de Rééducation</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group">
                  <label>Objectifs à court terme (2-4 semaines)</label>
                  <textarea id="rehab-short-term" class="form-control rehab-textarea-md" rows="3" placeholder="Ex: Améliorer l'équilibre debout..."></textarea>
                </div>
                <div class="form-group">
                  <label>Objectifs à moyen terme (1-3 mois)</label>
                  <textarea id="rehab-medium-term" class="form-control rehab-textarea-md" rows="3" placeholder="Ex: Marche autonome 100m..."></textarea>
                </div>
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Objectifs à long terme (3-6 mois)</label>
                  <textarea id="rehab-long-term" class="form-control rehab-textarea-md" rows="3" placeholder="Ex: Reprise activité professionnelle..."></textarea>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--green">
                <span class="rehab-modal-section-icon">🗂️</span>
                <h3>Programme de Rééducation</h3>
              </div>
              <div class="rehab-modal-program-grid">
                <div class="rehab-program-card rehab-program-card--blue">
                  <h4>💆 Kinésithérapie</h4>
                  <div class="rehab-modal-grid rehab-modal-grid--2">
                    <div class="form-group">
                      <label>Séances / semaine</label>
                      <input type="number" id="kine-sessions" class="form-control" min="0" max="7" value="0">
                    </div>
                    <div class="form-group">
                      <label>Durée (semaines)</label>
                      <input type="number" id="kine-weeks" class="form-control" min="0" max="52" value="0">
                    </div>
                  </div>
                </div>
                <div class="rehab-program-card rehab-program-card--green">
                  <h4>🖐️ Ergothérapie</h4>
                  <div class="rehab-modal-grid rehab-modal-grid--2">
                    <div class="form-group">
                      <label>Séances / semaine</label>
                      <input type="number" id="ergo-sessions" class="form-control" min="0" max="7" value="0">
                    </div>
                    <div class="form-group">
                      <label>Durée (semaines)</label>
                      <input type="number" id="ergo-weeks" class="form-control" min="0" max="52" value="0">
                    </div>
                  </div>
                </div>
                <div class="rehab-program-card rehab-program-card--violet">
                  <h4>🗣️ Orthophonie</h4>
                  <div class="rehab-modal-grid rehab-modal-grid--2">
                    <div class="form-group">
                      <label>Séances / semaine</label>
                      <input type="number" id="ortho-sessions" class="form-control" min="0" max="7" value="0">
                    </div>
                    <div class="form-group">
                      <label>Durée (semaines)</label>
                      <input type="number" id="ortho-weeks" class="form-control" min="0" max="52" value="0">
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--amber">
                <span class="rehab-modal-section-icon">🦿</span>
                <h3>Appareillage</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Aides et appareillages</label>
                  <div class="rehab-modal-check-grid rehab-check-grid-v2">
                    <label><input type="checkbox" name="appareillage" value="orthese-ms"> Orthèse MS</label>
                    <label><input type="checkbox" name="appareillage" value="orthese-mi"> Orthèse MI</label>
                    <label><input type="checkbox" name="appareillage" value="corset"> Corset</label>
                    <label><input type="checkbox" name="appareillage" value="chaussures"> Chaussures ortho</label>
                    <label><input type="checkbox" name="appareillage" value="semelles"> Semelles</label>
                    <label><input type="checkbox" name="appareillage" value="fauteuil"> Fauteuil roulant</label>
                    <label><input type="checkbox" name="appareillage" value="deambulateur"> Déambulateur</label>
                    <label><input type="checkbox" name="appareillage" value="canne"> Canne</label>
                    <label><input type="checkbox" name="appareillage" value="prothese"> Prothèse</label>
                  </div>
                </div>
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Détails</label>
                  <textarea id="rehab-equipment-details" class="form-control rehab-textarea-sm" rows="2" placeholder="Précisions sur l'appareillage..."></textarea>
                </div>
              </div>
            </section>

            <section class="rehab-modal-section rehab-modal-section-v2">
              <div class="rehab-modal-section-bar rehab-modal-section-bar--slate">
                <span class="rehab-modal-section-icon">📝</span>
                <h3>Observations / Remarques</h3>
              </div>
              <div class="rehab-modal-grid rehab-modal-grid--2">
                <div class="form-group rehab-modal-grid-span-2">
                  <label>Notes complémentaires</label>
                  <textarea id="rehab-notes" class="form-control rehab-textarea-md" rows="3" placeholder="Notes supplémentaires..."></textarea>
                </div>
              </div>
            </section>
          </form>
        </div>
        <div class="modal-footer rehab-modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal('rehab-plan-modal')">ANNULER</button>
          <button type="button" class="btn btn-primary" onclick="saveRehabPlan()">💾 ENREGISTRER LE PLAN</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.refreshRehabPatientList = refreshRehabPatientList;
window.selectRehabPatient = selectRehabPatient;

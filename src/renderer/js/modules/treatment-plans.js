// ========== MODULE PLANS DE TRAITEMENT ==========
let treatmentPlansWs = null;
let treatmentPlansState = { plans: [], filteredPlans: [], filterPatient: '', filterStatus: '', activeTab: 'active', page: 1, pageSize: 9 };

const PLAN_STATUS_META = {
  active: { label: 'Actif', color: '#22c55e', bg: '#dcfce7' },
  completed: { label: 'Terminé', color: '#3b82f6', bg: '#dbeafe' },
  archived: { label: 'Archivé', color: '#9ca3af', bg: '#f3f4f6' },
  cancelled: { label: 'Annulé', color: '#ef4444', bg: '#fef2f2' }
};

const PLAN_TREATMENT_TYPES = {
  dentistry: [
    'Bagues métalliques',
    'Bagues céramique',
    'Appareil lingual',
    'Aligneurs transparents',
    'Appareil amovible',
    'Couronne',
    'Bridge',
    'Prothèse complète/partielle',
    'Implant',
    'Extraction multiple',
    'Chirurgie parodontale',
    'Autre'
  ],
  mpr: ['Rééducation fonctionnelle', 'Kinésithérapie', 'Renforcement musculaire', 'Bilan postural', 'Autre'],
  general: ['Traitement multi-séances', 'Suivi thérapeutique', 'Autre']
};

async function initTreatmentPlans() {
  treatmentPlansState.filterPatient = typeof currentPatientId !== 'undefined' ? currentPatientId || '' : '';
  treatmentPlansState.page = 1;
  await loadPatientsFilter();
  await loadTreatmentPlans();
  connectPlansRealtimeWs();
}

async function connectPlansRealtimeWs() {
  if (treatmentPlansWs) return;
  try {
    const config = await window.api.realtime.getConfig();
    if (!config || !config.enabled) return;
    treatmentPlansWs = new WebSocket(`ws://127.0.0.1:${config.port}?token=${config.token}`);
    treatmentPlansWs.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (['plan:created', 'plan:updated', 'plan:deleted', 'plan:payment-recorded'].includes(msg.type)) {
          loadTreatmentPlans();
        }
      } catch (_) { }
    });
    treatmentPlansWs.addEventListener('close', () => { treatmentPlansWs = null; });
  } catch (e) { console.warn('Plans WS not available:', e.message); }
}

async function loadPatientsFilter() {
  try {
    const result = await window.api.patient.getAll();
    const select = document.getElementById('plans-filter-patient');
    if (!select || !result.success) return;
    select.innerHTML = '<option value="">-- Tous les patients --</option>';
    (result.data || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.lastName} ${p.firstName}`;
      select.appendChild(opt);
    });
  } catch (e) { console.error('Error loading patients filter:', e); }
}

async function loadTreatmentPlans() {
  const container = document.getElementById('treatment-plans-list');
  if (!container) return;
  container.innerHTML = '<div class="dental-empty-state"><p>Chargement...</p></div>';
  try {
    const filters = {};
    const searchInput = document.getElementById('plans-search-input');
    const statusSel = document.getElementById('plans-filter-status');
    const currentTab = treatmentPlansState.activeTab;
    
    if (searchInput?.value?.trim()) filters.search = searchInput.value.trim();
    if (treatmentPlansState.filterPatient) filters.patientId = treatmentPlansState.filterPatient;
    
    if (currentTab === 'archived') {
      filters.status = 'archived';
    } else {
      if (statusSel?.value) {
        filters.status = statusSel.value;
      } else {
        // By default on active tab, exclude archived
        // Wait, the backend doesn't support 'not in', let's just not filter by default,
        // and filter locally if needed, or update backend to handle it.
        // For now, if no status, the backend returns all, we will filter locally.
      }
    }

    // Auto-scope by current doctor's specialty (each specialist sees only their plans)
    if (typeof currentUserSpecialty === 'string' && currentUserSpecialty) {
      filters.specialty = currentUserSpecialty;
    }

    const result = await window.api.plans.getAll(filters);
    if (!result.success) { container.innerHTML = '<p style="color:red">Erreur: ' + result.error + '</p>'; return; }
    let plans = result.data || [];
    
    // Local filter to exclude archived if we are in active tab and no specific status is selected
    if (currentTab === 'active' && !statusSel?.value) {
      plans = plans.filter(p => p.status !== 'archived');
    }
    
    treatmentPlansState.plans = plans;
    treatmentPlansState.filteredPlans = plans;
    const totalPages = Math.max(1, Math.ceil(plans.length / treatmentPlansState.pageSize));
    treatmentPlansState.page = Math.min(Math.max(1, treatmentPlansState.page || 1), totalPages);
    updatePlansPagination(totalPages);

    if (!plans.length) {
      container.innerHTML = '<div class="dental-empty-state"><h4>Aucun plan de traitement</h4><p>Créez un premier plan pour commencer le suivi des soins.</p></div>';
      return;
    }
    const start = (treatmentPlansState.page - 1) * treatmentPlansState.pageSize;
    const pagePlans = plans.slice(start, start + treatmentPlansState.pageSize);
    container.innerHTML = '<div class="plans-grid">' + pagePlans.map(renderPlanCard).join('') + '</div>';
  } catch (e) {
    console.error('Error loading plans:', e);
    container.innerHTML = '<p style="color:red">Erreur de chargement</p>';
  }
}

function updatePlansPagination(totalPages = 1) {
  const label = document.getElementById('plans-page-label');
  const pagination = document.getElementById('plans-pagination');
  if (label) label.textContent = `${treatmentPlansState.page}/${totalPages}`;
  if (pagination) {
    const buttons = pagination.querySelectorAll('button');
    if (buttons[0]) buttons[0].disabled = treatmentPlansState.page <= 1;
    if (buttons[1]) buttons[1].disabled = treatmentPlansState.page >= totalPages;
  }
}

function changePlansPage(delta) {
  const totalPages = Math.max(1, Math.ceil((treatmentPlansState.filteredPlans || []).length / treatmentPlansState.pageSize));
  treatmentPlansState.page = Math.min(totalPages, Math.max(1, treatmentPlansState.page + delta));
  loadTreatmentPlans();
}

const SPECIALTY_LABELS = {
  dentistry: 'Dentaire',
  mpr: 'MPR',
  cardiology: 'Cardiologie',
  general: 'Généraliste'
};

function buildPlanStatusSelect(plan) {
  const transitions = {
    active: ['active', 'completed', 'cancelled', 'archived'],
    completed: ['completed', 'active', 'cancelled', 'archived'],
    cancelled: ['cancelled', 'active', 'archived'],
    archived: ['archived', 'active']
  };
  const labels = { active: 'Actif', completed: 'Terminé', cancelled: 'Annulé', archived: 'Archivé' };
  return `
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#64748b">
      Statut
      <select class="form-control" style="height:34px;padding:4px 30px 4px 9px;font-size:12px" onchange="updatePlanStatus('${plan.id}', this.value)">
        ${(transitions[plan.status] || [plan.status]).map((status) => `<option value="${status}" ${status === plan.status ? 'selected' : ''}>${labels[status] || status}</option>`).join('')}
      </select>
    </label>`;
}

function renderPlanCard(plan) {
  const meta = PLAN_STATUS_META[plan.status] || PLAN_STATUS_META.active;
  const cost = Number(plan.totalCost || 0);
  const paid = Number(plan.totalPaid || 0);
  const balance = cost - paid;
  const pct = cost > 0 ? Math.min(100, Math.round(paid / cost * 100)) : 0;
  const canSeeFullFinancials = canSeeFullPlanFinancials();
  const patientName = plan.lastName ? `${plan.lastName} ${plan.firstName}` : '—';
  const specialty = SPECIALTY_LABELS[plan.specialty] || 'Généraliste';
  const date = plan.createdAt ? new Date(plan.createdAt).toLocaleDateString('fr-FR') : '—';
  const treatmentLabel = plan.treatmentType && plan.treatmentType !== 'null' ? esc(plan.treatmentType) : 'Non spécifié';
  const isArchived = plan.status === 'archived';
  const hasPayments = plan.hasCollectedPayment === true || paid > 0;
  const canCollect = ['active', 'completed'].includes(plan.status) && balance > 0;

  return `
    <div class="plan-card" style="padding:20px;border-left:4px solid ${meta.color};cursor:${isArchived ? 'default' : 'pointer'};transition:transform 0.18s;background:#fff;border-radius:8px;display:flex;flex-direction:column;gap:14px" ${isArchived ? '' : `onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'" onclick="openEditPlanModal('${plan.id}')"`}>

      <!-- HEADER: patient name + badges -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <h4 style="margin:0;font-size:17px;font-weight:700;color:#0f172a;line-height:1.3">${esc(patientName)}</h4>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <span style="background:${meta.bg};color:${meta.color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.3px">${meta.label}</span>
            <span style="background:#f1f5f9;color:#475569;padding:3px 8px;border-radius:20px;font-size:12px;font-weight:600">${specialty}</span>
          </div>
        </div>
        <div style="font-size:13px;color:#64748b;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span>📋 ${esc(plan.title)}</span>
          <span style="color:#cbd5e1">&bull;</span>
          <span>📅 ${date}</span>
          <span style="color:#cbd5e1">&bull;</span>
          <span>${plan.sessionsCount || 1} séances</span>
        </div>
      </div>

      <!-- PROGRESS BAR (always visible for active & completed) -->
      ${isArchived ? '' : `
        <div>
          ${canSeeFullFinancials ? `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="display:flex;gap:20px">
                <span style="font-size:13px;color:#6b7280">Payé&nbsp;: <strong style="color:#16a34a;font-size:14px">${paid.toLocaleString()} DA</strong></span>
                <span style="font-size:13px;color:#6b7280">Total&nbsp;: <strong style="color:#475569;font-size:14px">${cost.toLocaleString()} DA</strong></span>
              </div>
              <span class="plan-progress-percent" style="font-size:15px;font-weight:700;color:${meta.color}">${pct}%</span>
            </div>
            <div class="plan-progress-track" style="background:#e2e8f0;border-radius:6px;height:9px;overflow:hidden">
              <div style="height:100%;border-radius:6px;width:${pct}%;background:linear-gradient(90deg,${meta.color},${meta.color}bb);transition:width .5s ease"></div>
            </div>
            ${balance > 0 ? `<div style="margin-top:7px;font-size:13px;color:#f97316;font-weight:600">Solde restant : ${balance.toLocaleString()} DA</div>` : '<div style="margin-top:7px;font-size:13px;color:#16a34a;font-weight:600">✓ Intégralement payé</div>'}
          ` : `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:13px;color:#6b7280">Progression</span>
              <span class="plan-progress-percent" style="font-size:14px;font-weight:700;color:${meta.color}">${pct}%</span>
            </div>
            <div class="plan-progress-track" style="background:#e2e8f0;border-radius:6px;height:9px;overflow:hidden">
              <div style="height:100%;border-radius:6px;width:${pct}%;background:linear-gradient(90deg,${meta.color},${meta.color}bb);transition:width .5s ease"></div>
            </div>
          `}
        </div>
      `}
      ${canSeeFullFinancials ? '' : `
        <div style="font-size:14px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          Paiements du jour&nbsp;: <strong>${Number(plan.todayPaid || 0).toLocaleString()} DA</strong>
        </div>
      `}

      <div style="display:flex;justify-content:flex-end" onclick="event.stopPropagation()">
        ${canSeeFullFinancials ? buildPlanStatusSelect(plan) : ''}
      </div>

      <!-- ACTIONS ROW -->
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px" onclick="event.stopPropagation()">
        ${isArchived ? `
          <button onclick="printPlanDocument('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#f8fafc;border-color:#e2e8f0;color:#475569">Imprimer</button>
          ${hasPayments ? '' : `<button onclick="deletePlan('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#fef2f2;border-color:#fecaca;color:#ef4444">Supprimer</button>`}
        ` : `
          ${canCollect && canSeeFullFinancials ? `<button onclick="openPlanPaymentActionsModal('${plan.id}',${cost},${paid})" class="btn btn-primary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px">Payer</button>` : ''}
          <button onclick="openEditPlanModal('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#fff;border-color:#d1d5db;color:#374151">Modifier</button>
          ${canSeeFullFinancials ? `<button onclick="printPlanDocument('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#f8fafc;border-color:#e2e8f0;color:#475569">Imprimer</button>` : ''}
          <button onclick="archivePlan('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#f8fafc;border-color:#e2e8f0;color:#475569">Archiver</button>
          ${hasPayments ? '' : `<button onclick="deletePlan('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#fef2f2;border-color:#fecaca;color:#ef4444">Supprimer</button>`}
        `}
      </div>
    </div>
  `;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateInputValue(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  const inputValue = formatDateInputValue(value);
  if (!inputValue) return '—';
  const [year, month, day] = inputValue.split('-');
  return `${day}/${month}/${year}`;
}

function showSessionNotePreview(input) {
  const note = input?.value || '';
  if (!note.trim()) return;
  let preview = document.getElementById('session-note-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'session-note-preview';
    preview.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10010;max-width:min(620px,82vw);max-height:42vh;overflow:auto;background:#111827;color:#fff;border-radius:12px;padding:18px 20px;box-shadow:0 24px 70px rgba(15,23,42,.35);font-size:14px;line-height:1.55;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(preview);
  }
  preview.textContent = note;
  preview.style.display = 'block';
}

function hideSessionNotePreview() {
  const preview = document.getElementById('session-note-preview');
  if (preview) preview.style.display = 'none';
}

function buildEditPlanSessionRows(planId, sessions, count, totalCost = 0) {
  const safeCount = Math.max(1, Math.max(parseInt(count || 1), (sessions || []).length));
  const sorted = [...(sessions || [])].sort((a, b) => Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
  const byNumber = new Map(sorted.map((session, index) => [Number(session.sessionNumber || index + 1), session]));

  // Calculate actual total already paid and count of paid sessions
  let totalPaid = 0;
  let paidCount = 0;
  for (let index = 0; index < safeCount; index++) {
    const s = byNumber.get(index + 1);
    if (s && (Number(s.paidAmount || 0) > 0 || s.status === 'paid')) {
      totalPaid += Number(s.paidAmount || 0);
      paidCount++;
    }
  }

  // Calculate remaining balance and remaining unpaid sessions
  const remainingBalance = Math.max(0, Number(totalCost || 0) - totalPaid);
  const remainingUnpaidCount = Math.max(1, safeCount - paidCount);
  const dynamicRemainingPerSession = Math.round((remainingBalance / remainingUnpaidCount) * 100) / 100;

  const rows = [];

  for (let index = 0; index < safeCount; index++) {
    const sessionNumber = index + 1;
    const s = byNumber.get(sessionNumber) || {
      id: `new-${sessionNumber}`,
      sessionNumber,
      expectedAmount: dynamicRemainingPerSession,
      paidAmount: 0,
      status: 'pending',
      scheduledDate: '',
      paidDate: '',
      notes: ''
    };
    const paid = Number(s.paidAmount || 0);
    const isPaid = paid > 0 || s.status === 'paid';
    const isRequested = !isPaid && s.status === 'requested';

    // If session is already paid, keep what was recorded; if not paid, dynamically divide the remaining balance!
    const expected = isPaid
      ? Number(s.paidAmount || s.expectedAmount || 0)
      : dynamicRemainingPerSession;

    const scheduled = formatDateInputValue(s.scheduledDate);
    const paidDate = formatDisplayDate(s.paidDate);
    const badgeBg = isPaid ? '#f0fdf4' : (isRequested ? '#fff7ed' : '#f8fafc');
    const badgeColor = isPaid ? '#15803d' : (isRequested ? '#c2410c' : '#64748b');
    const statusLabel = isPaid ? 'Payée' : (isRequested ? 'Demande envoyée' : 'Prévue');
    const actionHtml = isPaid
      ? `<button type="button" class="btn btn-secondary btn-small" onclick="event.stopPropagation(); modifierEncaissementPlanSession('${planId}', '${esc(s.id)}', ${paid}, '${esc(formatDateInputValue(s.paidDate))}', '${esc(s.notes || '')}')" style="padding:7px 10px;font-size:12px">Modifier paiement</button>`
      : (isRequested
        ? '<span style="color:#c2410c;font-size:12px;font-weight:700">En attente d’encaissement</span>'
        : `<button type="button" class="btn btn-secondary btn-small" onclick="event.stopPropagation(); openPlanSessionPaymentChoice('${planId}', '${esc(s.id)}', ${expected})" style="padding:7px 10px;font-size:12px">Encaisser (${expected.toLocaleString()} DA)</button>`);
    rows.push(`
      <tr class="ep-session-row" data-session-id="${esc(s.id)}" data-session-number="${sessionNumber}" data-status="${esc(s.status || 'pending')}">
        <td style="padding:8px 10px;font-weight:600;color:#111827">#${sessionNumber}</td>
        <td style="padding:8px 10px"><input class="ep-session-scheduled" type="date" value="${esc(scheduled)}" style="width:140px;padding:7px;border:1px solid #d1d5db;border-radius:6px"></td>
        <td style="padding:8px 10px"><input class="ep-session-expected" type="number" min="0" step="any" value="${expected}" style="width:110px;padding:7px;border:1px solid #d1d5db;border-radius:6px;text-align:right"></td>
        <td style="padding:8px 10px;text-align:right;color:#111827;font-weight:600">${paid.toLocaleString()} DA</td>
        <td style="padding:8px 10px;color:#475569;font-weight:600">${isPaid ? paidDate : '—'}</td>
        <td style="padding:8px 10px"><span style="display:inline-flex;align-items:center;min-height:24px;padding:2px 8px;border-radius:999px;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700">${statusLabel}</span></td>
        <td style="padding:8px 10px"><input class="ep-session-notes" value="${esc(s.notes || '')}" onfocus="showSessionNotePreview(this)" oninput="showSessionNotePreview(this)" onblur="hideSessionNotePreview()" style="width:160px;padding:7px;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></td>
        <td style="padding:8px 10px;text-align:right">${actionHtml}</td>
      </tr>`);
  }

  return rows.join('');
}

function refreshEditPlanSessionsTable() {
  const modal = document.getElementById('edit-plan-modal');
  if (!modal || !window.currentEditPlanSessionState) return;
  const currentRows = Array.from(modal.querySelectorAll('.ep-session-row'));
  if (currentRows.length) {
    const currentByNumber = new Map((window.currentEditPlanSessionState.sessions || []).map((session, index) => [
      Number(session.sessionNumber || index + 1),
      session
    ]));
    currentRows.forEach(row => {
      const sessionNumber = parseInt(row.dataset.sessionNumber || '0');
      if (!sessionNumber) return;
      const previous = currentByNumber.get(sessionNumber) || {};
      currentByNumber.set(sessionNumber, {
        ...previous,
        id: row.dataset.sessionId || previous.id,
        sessionNumber,
        status: row.dataset.status || previous.status || 'pending',
        scheduledDate: row.querySelector('.ep-session-scheduled')?.value || null,
        expectedAmount: parseFloat(row.querySelector('.ep-session-expected')?.value || '0'),
        paidAmount: Number(previous.paidAmount || 0),
        paidDate: previous.paidDate || '',
        notes: row.querySelector('.ep-session-notes')?.value || ''
      });
    });
    window.currentEditPlanSessionState.sessions = Array.from(currentByNumber.values());
  }
  const count = parseInt(document.getElementById('ep-sessions')?.value || '1');
  const totalCost = parseFloat(document.getElementById('ep-cost')?.value || '0');
  const tbody = document.getElementById('ep-sessions-body');
  const countLabel = document.getElementById('ep-sessions-count-label');
  if (tbody) {
    tbody.innerHTML = buildEditPlanSessionRows(
      window.currentEditPlanSessionState.planId,
      window.currentEditPlanSessionState.sessions,
      count,
      totalCost
    );
  }
  if (countLabel) countLabel.textContent = `${Math.max(1, count || 1)} séance(s) · encaissement séparé`;
}

function closeEditPlanModal() {
  hideSessionNotePreview();
  window.currentEditPlanSessionState = null;
  document.getElementById('edit-plan-modal')?.remove();
}

function canSeeFullPlanFinancials() {
  const role = typeof currentUserRole !== 'undefined' ? currentUserRole : (localStorage.getItem('currentUserRole') || '');
  return currentUserIsSuperAdmin === true || currentUserIsAdmin === true || role === 'doctor' || role === 'dentist';
}

function filterTreatmentPlans() {
  treatmentPlansState.page = 1;
  loadTreatmentPlans();
}

// ─── Unified Create/Edit Plan Modal ───────────────────────────────────────────
function openCreatePlanModal(patientId = currentPatientId) {
  openPlanFormModal({ mode: 'create', patientId });
}

async function openPlanFormModal({ mode = 'create', planId = null, patientId = null } = {}) {
  closeCreatePlanModal();
  document.getElementById('edit-plan-modal')?.remove();
  let plan = null;
  if (mode === 'edit' && planId) {
    const result = await window.api.plans.getById(planId);
    if (!result.success) {
      showNotification('Erreur chargement plan', 'error');
      return;
    }
    plan = result.data;
    patientId = plan.patientId;
  }

  const isEdit = mode === 'edit' && plan;
  const payments = isEdit ? (plan.sessions || []).filter(s => Number(s.paidAmount || 0) > 0 || s.status === 'paid') : [];
  const paymentsHistoryHtml = isEdit ? `
    <div style="border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;padding:14px;margin-bottom:18px">
      <h4 style="margin:0 0 10px;font-size:14px;font-weight:800;text-transform:uppercase;color:#374151">Historique des paiements</h4>
      ${payments.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
          <thead><tr>
            <th style="text-align:left;padding:8px 10px;color:#6b7280;font-size:12px;text-transform:uppercase">Date</th>
            <th style="text-align:right;padding:8px 10px;color:#6b7280;font-size:12px;text-transform:uppercase">Montant</th>
            <th style="text-align:left;padding:8px 10px;color:#6b7280;font-size:12px;text-transform:uppercase">Mode</th>
          </tr></thead>
          <tbody>${payments.map(s => `
            <tr>
              <td style="padding:8px 10px;border-top:1px solid #e5e7eb">${formatDisplayDate(s.paidDate)}</td>
              <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;font-weight:700">${Number(s.paidAmount || 0).toLocaleString()} DA</td>
              <td style="padding:8px 10px;border-top:1px solid #e5e7eb">${esc(s.paymentMethod || '—')}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<div style="font-size:13px;color:#6b7280">Aucun paiement enregistré.</div>'}
    </div>` : '';

  const html = `
    <div id="create-plan-modal" data-mode="${isEdit ? 'edit' : 'create'}" data-plan-id="${esc(plan?.id || '')}" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:#fff;border-radius:12px;padding:28px;width:100%;max-width:620px;max-height:92vh;overflow-y:auto;border:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
          <div>
            <h3 style="margin:0;font-size:20px;font-weight:700;color:#111827">${isEdit ? 'Modifier le plan' : 'Nouveau Plan de Traitement'}</h3>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280">${isEdit ? 'Historique et informations du plan.' : 'Remplissez les informations du plan.'}</p>
          </div>
          <button onclick="closeCreatePlanModal()" class="btn btn-secondary btn-small" style="width:34px;height:34px;padding:0">&times;</button>
        </div>
        ${paymentsHistoryHtml}
        <div style="display:grid;gap:16px">
          <div style="position:relative">
            <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Patient <span style="color:#dc2626">*</span></label>
            <input type="text" id="cp-patient-search" class="form-control" placeholder="Rechercher par nom..." autocomplete="off" ${isEdit ? 'disabled' : ''} style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box">
            <input type="hidden" id="cp-patient">
            <div id="cp-patient-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #d1d5db;border-radius:8px;max-height:200px;overflow-y:auto;z-index:1000;margin-top:4px"></div>
          </div>
          <div>
            <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Titre du plan <span style="color:#dc2626">*</span></label>
            <input type="text" id="cp-title" class="form-control" value="${esc(plan?.title || '')}" placeholder="Ex: Plan traitement orthodontique" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Type de traitement</label>
            <select id="cp-type" class="form-control" data-selected="${esc(plan?.treatmentType || '')}" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px"></select>
            <input type="text" id="cp-type-other" class="form-control" placeholder="Préciser le type" style="display:none;width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-top:10px;box-sizing:border-box">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div>
              <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Coût total (DA) <span style="color:#dc2626">*</span></label>
              <input type="number" id="cp-cost" class="form-control" value="${Number(plan?.totalCost || 0)}" min="0" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box">
            </div>
            <div>
              <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Nombre de séances</label>
              <input type="number" id="cp-sessions" class="form-control" value="${Number(plan?.sessionsCount || 1)}" min="1" max="100" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box">
            </div>
          </div>
          ${isEdit ? `
            <div>
              <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Statut</label>
              <select id="cp-status" class="form-control" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">
                ${Object.entries(PLAN_STATUS_META).map(([value, meta]) => `<option value="${value}" ${plan.status === value ? 'selected' : ''}>${meta.label}</option>`).join('')}
              </select>
            </div>` : ''}
          <div>
            <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Description / Notes</label>
            <textarea id="cp-desc" rows="3" class="form-control" placeholder="Détails du plan, observations cliniques..." style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box">${esc(plan?.description || plan?.notes || '')}</textarea>
          </div>
          <div>
            <label style="font-weight:700;font-size:13px;color:#6b7280;display:block;margin-bottom:6px">Équipements utilisés</label>
            <div id="cp-equipment-list" class="care-equipment-picker" aria-live="polite">Chargement des équipements...</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:24px;justify-content:flex-end">
          <button onclick="closeCreatePlanModal()" class="btn btn-secondary">Annuler</button>
          <button onclick="savePlanFormModal()" class="btn btn-primary" style="min-width:180px">${isEdit ? 'Enregistrer les modifications' : 'Créer le plan'}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  await wirePlanTreatmentTypeDropdown();
  await populatePlanPatientPicker({ selectedPatientId: patientId, readOnly: isEdit });
  await populatePlanEquipmentPicker(plan?.equipment || []);
}

async function populatePlanEquipmentPicker(selectedUsage = []) {
  const container = document.getElementById('cp-equipment-list');
  if (!container) return;
  try {
    const result = await window.api.equipment.getAll({});
    const rows = result?.success ? (result.data || []) : [];
    const selected = new Set((selectedUsage || []).map(item => String(item.equipmentId || '')));
    container.innerHTML = rows.length ? rows.map(item => `
      <label class="care-equipment-option">
        <input type="checkbox" name="cp-equipment" value="${esc(item.id)}" ${selected.has(String(item.id)) ? 'checked' : ''}>
        <span><strong>${esc(item.name)}</strong><small>${esc(EQUIPMENT_STATUS_LABELS?.[item.status] || item.status || '')}</small></span>
      </label>`).join('') : '<span class="care-equipment-empty">Aucun équipement disponible. Ajoutez-le d’abord dans le module Équipement.</span>';
  } catch (error) {
    container.innerHTML = '<span class="care-equipment-empty">Impossible de charger les équipements.</span>';
  }
}

async function syncPlanEquipment(planId, previousUsage = []) {
  const selectedIds = new Set(Array.from(document.querySelectorAll('input[name="cp-equipment"]:checked')).map(input => input.value));
  const existingByEquipment = new Map((previousUsage || []).filter(item => item.equipmentId).map(item => [String(item.equipmentId), item]));
  for (const equipmentId of selectedIds) {
    if (!existingByEquipment.has(equipmentId)) {
      const linked = await window.api.invoke('plans:addEquipment', { planId, equipmentId });
      if (!linked?.success) throw new Error(linked?.error || 'Association équipement impossible');
    }
  }
  for (const [equipmentId, usage] of existingByEquipment.entries()) {
    if (!selectedIds.has(equipmentId)) {
      const removed = await window.api.invoke('plans:removeEquipment', usage.id);
      if (!removed?.success) throw new Error(removed?.error || 'Retrait équipement impossible');
    }
  }
}

async function populatePlanPatientPicker({ selectedPatientId = null, readOnly = false } = {}) {
  const searchInput = document.getElementById('cp-patient-search');
  const hiddenInput = document.getElementById('cp-patient');
  const dropdown = document.getElementById('cp-patient-dropdown');
  if (!searchInput || !hiddenInput || !dropdown) return;

  if (selectedPatientId) {
    const selectedResult = await window.api.patient.getById(selectedPatientId);
    const selected = selectedResult?.success ? selectedResult.data : null;
    if (selected) {
      hiddenInput.value = selected.id;
      searchInput.value = `${selected.lastName} ${selected.firstName}`;
    }
  }
  if (readOnly) return;
  let searchVersion = 0;
  const renderDropdown = async (filterText = '') => {
    const term = String(filterText || '').trim();
    if (!term) {
      dropdown.style.display = 'none';
      return;
    }
    const version = ++searchVersion;
    const result = await window.api.patient.search(term);
    if (version !== searchVersion) return;
    const patients = result?.success ? (result.data || []) : [];
    dropdown.innerHTML = patients.length
      ? patients.map(p => `<div class="patient-opt" data-id="${p.id}" data-name="${esc(p.lastName)} ${esc(p.firstName)}" style="padding:10px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid #f1f5f9">${esc(p.lastName)} ${esc(p.firstName)}</div>`).join('')
      : '<div style="padding:10px 12px;color:#64748b;font-size:14px;text-align:center">Aucun patient trouvé</div>';
    dropdown.querySelectorAll('.patient-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        hiddenInput.value = opt.getAttribute('data-id');
        searchInput.value = opt.getAttribute('data-name');
        dropdown.style.display = 'none';
      });
    });
  };
  searchInput.addEventListener('focus', () => {
    // Only open dropdown if user has already typed something
    if (searchInput.value.trim().length > 0) {
      renderDropdown(searchInput.value);
      dropdown.style.display = 'block';
    }
  });
  searchInput.addEventListener('input', (e) => {
    hiddenInput.value = '';
    if (e.target.value.trim().length === 0) {
      dropdown.style.display = 'none';
    } else {
      renderDropdown(e.target.value);
      dropdown.style.display = 'block';
    }
  });
}

async function wirePlanTreatmentTypeDropdown() {
  const typeSelect = document.getElementById('cp-type');
  const otherInput = document.getElementById('cp-type-other');
  if (!typeSelect) return;

  const renderOptions = async () => {
    const specialty = (typeof currentUserSpecialty === 'string' && currentUserSpecialty) ? currentUserSpecialty : 'general';
    let baseTypes = [...(PLAN_TREATMENT_TYPES[specialty] || PLAN_TREATMENT_TYPES.general)];
    
    // Fetch custom types from settings
    try {
      const res = await window.api.settings.get();
      if(res.success && res.data && res.data.customTreatmentTypes) {
         const customTypes = res.data.customTreatmentTypes.split(',').map(s => s.trim()).filter(Boolean);
         if(customTypes.length > 0) {
           // Insert custom types at the beginning or merge
           // Let's remove 'Autre' if it exists, add custom types, then put 'Autre' at the end
           baseTypes = baseTypes.filter(t => t !== 'Autre');
           baseTypes = [...new Set([...customTypes, ...baseTypes])];
           baseTypes.push('Autre');
         }
      }
    } catch(e) {}
    
    typeSelect.innerHTML = baseTypes.map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join('');
    const selectedType = typeSelect.dataset.selected || '';
    if (selectedType && baseTypes.includes(selectedType)) {
      typeSelect.value = selectedType;
    } else if (selectedType) {
      typeSelect.value = 'Autre';
      if (otherInput) otherInput.value = selectedType;
    }
    if (otherInput) otherInput.style.display = typeSelect.value === 'Autre' ? 'block' : 'none';
  };

  typeSelect.addEventListener('change', () => {
    if (otherInput) otherInput.style.display = typeSelect.value === 'Autre' ? 'block' : 'none';
  });
  await renderOptions();
}

function closeCreatePlanModal() {
  const m = document.getElementById('create-plan-modal');
  if (m) m.remove();
}

async function saveNewPlan() {
  return savePlanFormModal();
}

async function savePlanFormModal() {
  const modal = document.getElementById('create-plan-modal');
  const mode = modal?.dataset.mode || 'create';
  const planId = modal?.dataset.planId || '';
  const patientId = document.getElementById('cp-patient')?.value;
  const title = document.getElementById('cp-title')?.value?.trim();
  const cost = parseFloat(document.getElementById('cp-cost')?.value || '0');
  const sessions = parseInt(document.getElementById('cp-sessions')?.value || '1');
  if (!patientId) { showNotification('Sélectionnez un patient', 'warning'); return; }
  if (!title) { showNotification('Titre requis', 'warning'); return; }
  const payload = {
    patientId,
    title,
    treatmentType: document.getElementById('cp-type')?.value === 'Autre'
      ? (document.getElementById('cp-type-other')?.value || 'Autre')
      : (document.getElementById('cp-type')?.value || null),
    specialty: (typeof currentUserSpecialty === 'string' && currentUserSpecialty) ? currentUserSpecialty : 'general',
    totalCost: cost,
    sessionsCount: sessions,
    description: document.getElementById('cp-desc')?.value || null,
    notes: document.getElementById('cp-desc')?.value || null,
    createdBy: typeof currentUserId !== 'undefined' ? currentUserId : null,
    status: document.getElementById('cp-status')?.value || undefined
  };
  try {
    const previousPlan = mode === 'edit' && planId ? await window.api.plans.getById(planId) : null;
    const result = mode === 'edit'
      ? await window.api.plans.update(planId, payload)
      : await window.api.plans.create(payload);
    if (result.success) {
      await syncPlanEquipment(planId || result.id, previousPlan?.success ? (previousPlan.data?.equipment || []) : []);
      showNotification(mode === 'edit' ? 'Plan modifié avec succès' : 'Plan créé avec succès', 'success');
      closeCreatePlanModal();
      loadTreatmentPlans();
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) { showNotification('Erreur', 'error'); }
}

async function openEditPlanModal(planId) {
  const existing = document.getElementById('edit-plan-modal');
  if (existing) existing.remove();
  try {
    const result = await window.api.plans.getById(planId);
    if (!result.success) {
      showNotification('Erreur chargement plan', 'error');
      return;
    }
    const plan = result.data;
    const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
    const planTotal = Number(plan.totalCost || 0);
    const planPaid = Number(plan.totalPaid || 0);
    const sessionsHtml = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h4 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;color:#374151">Tarifs et Versements des séances</h4>
          <div style="display:flex;gap:8px;align-items:center;">
            <span id="ep-sessions-count-label" style="font-size:12px;color:#6b7280">${Number(plan.sessionsCount || sessions.length || 1)} séance(s)</span>
            <button type="button" class="btn btn-primary btn-small" onclick="event.stopPropagation(); openAddPaymentModal('${plan.id}', ${planTotal}, ${planPaid})" style="padding:4px 10px;font-size:12px">➕ Nouveau versement</button>
          </div>
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:8px;overflow-x:auto;overflow-y:visible;background:#fff">
          <table style="width:100%;border-collapse:collapse;min-width:860px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="text-align:left;padding:9px 10px;font-size:12px;color:#6b7280">Séance</th>
                <th style="text-align:left;padding:9px 10px;font-size:12px;color:#6b7280">Date prévue</th>
                <th style="text-align:right;padding:9px 10px;font-size:12px;color:#6b7280">Tarif prévu</th>
                <th style="text-align:right;padding:9px 10px;font-size:12px;color:#6b7280">Payé</th>
                <th style="text-align:left;padding:9px 10px;font-size:12px;color:#6b7280">Date payé</th>
                <th style="text-align:left;padding:9px 10px;font-size:12px;color:#6b7280">État</th>
                <th style="text-align:left;padding:9px 10px;font-size:12px;color:#6b7280">Note</th>
                <th style="text-align:right;padding:9px 10px;font-size:12px;color:#6b7280">Action</th>
              </tr>
            </thead>
            <tbody id="ep-sessions-body">
              ${buildEditPlanSessionRows(plan.id, sessions, Number(plan.sessionsCount || sessions.length || 1), planTotal)}
            </tbody>
          </table>
        </div>
      </div>`;
    const html = `
      <div id="edit-plan-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px">
        <div style="background:#fff;border-radius:10px;padding:0;width:min(1120px,96vw);max-height:92vh;overflow:hidden;border:1px solid #e5e7eb;display:flex;flex-direction:column">
          <div style="padding:22px 24px 16px;border-bottom:1px solid #e5e7eb">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div>
              <h3 style="margin:0;font-size:20px;font-weight:700;color:#111827">Modifier le plan</h3>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280">${esc(plan.lastName || '')} ${esc(plan.firstName || '')}</p>
            </div>
            <button onclick="closeEditPlanModal()" class="btn btn-secondary btn-small" style="width:34px;height:34px;padding:0">&times;</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;font-weight:700">Total prévu</div>
              <div style="font-size:20px;font-weight:800;color:#111827">${planTotal.toLocaleString()} DA</div>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;font-weight:700">Déjà payé</div>
              <div style="font-size:20px;font-weight:800;color:#15803d">${planPaid.toLocaleString()} DA</div>
            </div>
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc">
              <div style="font-size:12px;color:#6b7280;text-transform:uppercase;font-weight:700">Reste</div>
              <div style="font-size:20px;font-weight:800;color:#b45309">${Math.max(0, planTotal - planPaid).toLocaleString()} DA</div>
            </div>
          </div>
          </div>
          <div style="padding:20px 24px;overflow:auto">
          <div style="display:grid;gap:14px">
            <label style="font-weight:600;font-size:14px;color:#374151">Titre
              <input id="ep-title" class="form-control" value="${esc(plan.title || '')}" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px">
            </label>
            <label style="font-weight:600;font-size:14px;color:#374151">Type de traitement
              <input id="ep-type" class="form-control" value="${esc(plan.treatmentType || '')}" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px">
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <label style="font-weight:600;font-size:14px;color:#374151">Coût total (DA)
                <input id="ep-cost" type="number" min="0" class="form-control" value="${Number(plan.totalCost || 0)}" oninput="refreshEditPlanSessionsTable()" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px">
              </label>
              <label style="font-weight:600;font-size:14px;color:#374151">Séances
                <input id="ep-sessions" type="number" min="1" max="100" class="form-control" value="${Number(plan.sessionsCount || sessions.length || 1)}" oninput="refreshEditPlanSessionsTable()" onchange="refreshEditPlanSessionsTable()" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px">
              </label>
            </div>
            <label style="font-weight:600;font-size:14px;color:#374151">Statut
              <select id="ep-status" class="form-control" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px">
                ${Object.entries(PLAN_STATUS_META).map(([value, meta]) => `<option value="${value}" ${plan.status === value ? 'selected' : ''}>${meta.label}</option>`).join('')}
              </select>
            </label>
            <label style="font-weight:600;font-size:14px;color:#374151">Description / Notes
              <textarea id="ep-desc" rows="4" class="form-control" style="width:100%;margin-top:6px;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;resize:vertical">${esc(plan.description || plan.notes || '')}</textarea>
            </label>
            ${sessionsHtml}
          </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;padding:14px 24px;border-top:1px solid #e5e7eb;background:#fff">
            <button onclick="closeEditPlanModal()" class="btn btn-secondary">Annuler</button>
            <button onclick="saveEditedPlan('${plan.id}')" class="btn btn-primary">Enregistrer</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    window.currentEditPlanSessionState = { planId: plan.id, sessions };
  } catch (e) {
    console.error(e);
    showNotification('Erreur', 'error');
  }
}

async function saveEditedPlan(planId) {
  const title = document.getElementById('ep-title')?.value?.trim();
  if (!title) {
    showNotification('Titre requis', 'warning');
    return;
  }
  try {
    const sessionRows = Array.from(document.querySelectorAll('#edit-plan-modal .ep-session-row'));
    const sessions = sessionRows.map(row => ({
      id: row.dataset.sessionId && !row.dataset.sessionId.startsWith('new-') ? row.dataset.sessionId : null,
      sessionNumber: parseInt(row.dataset.sessionNumber || '0'),
      status: row.dataset.status || 'pending',
      scheduledDate: row.querySelector('.ep-session-scheduled')?.value || null,
      expectedAmount: parseFloat(row.querySelector('.ep-session-expected')?.value || '0'),
      notes: row.querySelector('.ep-session-notes')?.value || null
    }));
    const sessionsTotal = sessions.reduce((sum, item) => sum + Number(item.expectedAmount || 0), 0);
    const result = await window.api.plans.update(planId, {
      title,
      treatmentType: document.getElementById('ep-type')?.value || null,
      description: document.getElementById('ep-desc')?.value || null,
      notes: document.getElementById('ep-desc')?.value || null,
      totalCost: sessionsTotal > 0 ? sessionsTotal : parseFloat(document.getElementById('ep-cost')?.value || '0'),
      sessionsCount: parseInt(document.getElementById('ep-sessions')?.value || '1'),
      status: document.getElementById('ep-status')?.value || 'active'
    });
    if (result.success) {
      if (sessions.length && window.api.plans.updateSessions) {
        const sessionsResult = await window.api.plans.updateSessions(planId, sessions);
        if (!sessionsResult.success) {
          showNotification('Plan modifié, mais erreur séances: ' + sessionsResult.error, 'warning');
          return;
        }
      }
      closeEditPlanModal();
      showNotification('Plan modifié', 'success');
      loadTreatmentPlans();
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) {
    showNotification('Erreur', 'error');
  }
}

async function encaisserPlanSession(planId, sessionId = '', expectedAmount = 0) {
  const currentPlan = treatmentPlansState.plans.find(p => p.id === planId);
  let totalCost = Number(currentPlan?.totalCost || 0);
  let totalPaid = Number(currentPlan?.totalPaid || 0);

  if (!currentPlan) {
    const res = await window.api.plans.getById(planId);
    if (res.success) {
      totalCost = Number(res.data?.totalCost || 0);
      totalPaid = Number(res.data?.totalPaid || 0);
    }
  }

  openAddPaymentModal(planId, totalCost, totalPaid, Number(expectedAmount || 0), sessionId);
}

function openPlanSessionPaymentChoice(planId, sessionId, expectedAmount = 0) {
  document.getElementById('plan-session-payment-choice')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="plan-session-payment-choice" class="inventory-detail-overlay">
      <div style="width:min(440px,100%);background:#fff;border-radius:16px;padding:24px;box-shadow:0 24px 70px rgba(15,23,42,.3)">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px"><div><h3 style="margin:0">Encaissement de la séance</h3><p style="margin:6px 0 0;color:#64748b">Montant prévu: <strong>${Number(expectedAmount || 0).toLocaleString()} DA</strong></p></div><button class="close-btn" onclick="document.getElementById('plan-session-payment-choice').remove()">&times;</button></div>
        <div style="display:grid;gap:10px">
          <label for="plan-session-choice-amount" style="font-size:13px;font-weight:700;color:#475569">Montant à encaisser ou demander (DA)</label>
          <input id="plan-session-choice-amount" class="form-control" type="number" min="1" step="0.01" value="${Number(expectedAmount || 0)}" style="width:100%;box-sizing:border-box">
          <button class="btn btn-primary" onclick="collectPlanSessionFromChoice('${planId}','${esc(sessionId)}')">Encaisser maintenant</button>
          <button class="btn btn-secondary" onclick="requestPlanSessionPaymentFromChoice('${planId}','${esc(sessionId)}')">Demander un paiement</button>
          <button class="btn btn-outline" onclick="document.getElementById('plan-session-payment-choice').remove()">Annuler</button>
        </div>
      </div>
    </div>`);
}

function getPlanSessionChoiceAmount() {
  const amount = Number(document.getElementById('plan-session-choice-amount')?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    showNotification('Veuillez saisir un montant valide', 'warning');
    return null;
  }
  return amount;
}

function collectPlanSessionFromChoice(planId, sessionId) {
  const amount = getPlanSessionChoiceAmount();
  if (amount === null) return;
  document.getElementById('plan-session-payment-choice')?.remove();
  encaisserPlanSession(planId, sessionId, amount);
}

function requestPlanSessionPaymentFromChoice(planId, sessionId) {
  const amount = getPlanSessionChoiceAmount();
  if (amount === null) return;
  requestPlanSessionPayment(planId, sessionId, amount);
}

async function requestPlanSessionPayment(planId, sessionId, expectedAmount = 0) {
  try {
    const result = await window.api.plans.getById(planId);
    if (!result?.success || !result.data) throw new Error(result?.error || 'Plan introuvable');
    const plan = result.data;
    document.getElementById('plan-session-payment-choice')?.remove();
    if (typeof openPaymentRequestModal !== 'function') throw new Error('Module de demande de paiement indisponible');
    await openPaymentRequestModal(plan.patientId, {
      amount: Number(expectedAmount || 0),
      patientName: `${plan.firstName || ''} ${plan.lastName || ''}`.trim(),
      service: 'other',
      notes: `${plan.title || 'Plan de traitement'} — séance ${sessionId}`,
      selectedActs: ['other'],
      planId,
      planSessionId: sessionId
    });
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}

function modifierEncaissementPlanSession(planId, sessionId, paidAmount = 0, paidDate = '', notes = '') {
  openEditPaymentModal(planId, sessionId, paidAmount, paidDate, notes);
}

// ─── Add Payment Modal ────────────────────────────────────────────────────────
function openPlanPaymentActionsModal(planId, totalCost, totalPaid) {
  const existing = document.getElementById('plan-payment-actions-modal');
  if (existing) existing.remove();
  const balance = Math.max(0, totalCost - totalPaid);
  const html = `
    <div id="plan-payment-actions-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10003;display:flex;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:12px;padding:24px;width:430px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;font-size:18px">Demander un paiement</h3>
          <button onclick="document.getElementById('plan-payment-actions-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">×</button>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
          Solde restant: <strong>${balance.toLocaleString()} DA</strong>
        </div>
        <div style="display:grid;gap:10px">
          <label style="font-weight:600;font-size:13px">Montant demandé (DA)</label>
          <input type="number" id="plan-request-amount" class="form-control" value="${balance}" min="1" max="${balance}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px">
          <input type="text" id="plan-request-notes" class="form-control" placeholder="Note optionnelle" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
          <button onclick="submitPlanPaymentRequest('${planId}',${totalCost},${totalPaid})" class="btn btn-secondary">Enregistrer la demande</button>
          <button onclick="openAddPaymentModalFromActions('${planId}',${totalCost},${totalPaid})" class="btn btn-primary">Encaisser maintenant</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function submitPlanPaymentRequest(planId, totalCost, totalPaid) {
  const amount = parseFloat(document.getElementById('plan-request-amount')?.value || '0');
  const notes = document.getElementById('plan-request-notes')?.value || '';
  if (!amount || amount <= 0) { showNotification('Montant invalide', 'warning'); return; }
  try {
    const result = await window.api.plans.requestPayment({
      planId,
      amount,
      notes,
      doctorId: typeof currentUserId !== 'undefined' ? currentUserId : null
    });
    if (result.success) {
      document.getElementById('plan-payment-actions-modal')?.remove();
      showNotification('Demande de paiement enregistrée', 'success');
      if (typeof loadPendingPaymentRequests === 'function') loadPendingPaymentRequests();
      if (typeof loadTreatmentPlans === 'function') await loadTreatmentPlans();
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) { showNotification('Erreur', 'error'); }
}

function openAddPaymentModalFromActions(planId, totalCost, totalPaid) {
  const amount = parseFloat(document.getElementById('plan-request-amount')?.value || '0');
  const notes = document.getElementById('plan-request-notes')?.value || '';
  document.getElementById('plan-payment-actions-modal')?.remove();
  openAddPaymentModal(planId, totalCost, totalPaid, amount > 0 ? amount : null, '', notes);
}

function openAddPaymentModal(planId, totalCost, totalPaid, presetAmount = null, sessionId = '', presetNotes = '') {
  const existing = document.getElementById('plan-payment-modal');
  if (existing) existing.remove();
  const balance = Math.max(0, totalCost - totalPaid);
  const defaultAmount = presetAmount && presetAmount > 0 ? Math.min(presetAmount, balance) : balance;
  const html = `
    <div id="plan-payment-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:#fff;border-radius:16px;padding:26px;width:460px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Nouveau Versement / Séance</h3>
            <p style="margin:4px 0 0;font-size:12.5px;color:#6b7280">Enregistrer un paiement de séance (s'ajoute au total payé)</p>
          </div>
          <button onclick="document.getElementById('plan-payment-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af">&times;</button>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;">
          <div><div style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:700">Total Plan</div><strong style="color:#111827;font-size:14px">${totalCost.toLocaleString()} DA</strong></div>
          <div><div style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:700">Déjà Payé</div><strong style="color:#16a34a;font-size:14px">${totalPaid.toLocaleString()} DA</strong></div>
          <div><div style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:700">Reste</div><strong style="color:#f97316;font-size:14px">${balance.toLocaleString()} DA</strong></div>
        </div>

        <div style="display:grid;gap:12px">
          <div>
            <label style="font-weight:600;font-size:13px;color:#374151">Montant de ce versement (DA) *</label>
            <input type="number" id="pp-amount" class="form-control" value="${defaultAmount}" min="1" max="${balance || 9999999}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;font-weight:600;font-size:15px">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="font-weight:600;font-size:13px;color:#374151">Date du paiement</label>
              <input type="date" id="pp-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
            </div>
            <div>
              <label style="font-weight:600;font-size:13px;color:#374151">Mode</label>
              <select id="pp-method" class="form-control" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
                <option value="Espèces">Espèces</option>
                <option value="Carte">Carte</option>
                <option value="Chèque">Chèque</option>
                <option value="Virement">Virement</option>
              </select>
            </div>
          </div>
          <div>
            <label style="font-weight:600;font-size:13px;color:#374151">Notes cliniques / Actes réalisés (Traçabilité)</label>
            <textarea id="pp-notes" class="form-control" placeholder="Ex: Séance de rééducation à la marche, travail de l'équilibre..." style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;min-height:60px;resize:vertical;font-family:inherit">${esc(presetNotes || '')}</textarea>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">
          <button onclick="document.getElementById('plan-payment-modal').remove()" class="btn btn-secondary">Annuler</button>
          <button onclick="submitPayment('${planId}')" class="btn btn-primary">✅ Enregistrer le versement</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('plan-payment-modal');
  if (modal) modal.dataset.sessionId = sessionId || '';
}

function openEditPaymentModal(planId, sessionId, paidAmount, paidDate, notes) {
  const existing = document.getElementById('plan-payment-modal');
  if (existing) existing.remove();
  const html = `
    <div id="plan-payment-modal" data-session-id="${esc(sessionId)}" data-edit-payment="true" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:#fff;border-radius:12px;padding:24px;width:440px;border:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div>
            <h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Modifier l'encaissement</h3>
            <p style="margin:4px 0 0;color:#6b7280;font-size:13px">Corriger le montant ou la date payée.</p>
          </div>
          <button onclick="document.getElementById('plan-payment-modal').remove()" class="btn btn-secondary btn-small" style="width:32px;height:32px;padding:0">&times;</button>
        </div>
        <div style="display:grid;gap:12px">
          <label style="font-weight:600;font-size:13px;color:#374151">Montant payé (DA)
            <input type="number" id="pp-amount" class="form-control" value="${Number(paidAmount || 0)}" min="1" style="width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:5px">
          </label>
          <label style="font-weight:600;font-size:13px;color:#374151">Date payé
            <input type="date" id="pp-date" class="form-control" value="${esc(paidDate || new Date().toISOString().slice(0, 10))}" style="width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:5px">
          </label>
          <label style="font-weight:600;font-size:13px;color:#374151">Mode de paiement
            <select id="pp-method" class="form-control" style="width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:5px">
              <option value="Espèces">Espèces</option>
              <option value="Carte">Carte</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
            </select>
          </label>
          <label style="font-weight:600;font-size:13px;color:#374151">Note
            <textarea id="pp-notes" class="form-control" style="width:100%;padding:9px 10px;border:1px solid #d1d5db;border-radius:6px;margin-top:5px;min-height:70px;resize:vertical">${esc(notes || '')}</textarea>
          </label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
          <button onclick="document.getElementById('plan-payment-modal').remove()" class="btn btn-secondary">Annuler</button>
          <button onclick="submitPayment('${planId}')" class="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function submitPayment(planId) {
  const amount = parseFloat(document.getElementById('pp-amount')?.value || '0');
  const paidDate = document.getElementById('pp-date')?.value;
  const notes = document.getElementById('pp-notes')?.value || null;
  if (!amount || amount <= 0) { showNotification('Montant invalide', 'warning'); return; }
  try {
    const sessionId = document.getElementById('plan-payment-modal')?.dataset.sessionId || null;
    const isEditPayment = document.getElementById('plan-payment-modal')?.dataset.editPayment === 'true';
    const payload = {
      planId, sessionId, paidAmount: amount, paidDate, notes,
      paymentMethod: document.getElementById('pp-method')?.value || 'Espèces',
      recordedBy: typeof currentUserId !== 'undefined' ? currentUserId : null
    };
    const result = isEditPayment
      ? await window.api.plans.updateSessionPayment(payload)
      : await window.api.plans.addPaymentSession(payload);
    if (result.success) {
      document.getElementById('plan-payment-modal')?.remove();
      const msg = isEditPayment ? 'Encaissement modifié' : (result.autoClosed ? 'Paiement complet — plan clôturé ✅' : 'Paiement enregistré');
      showNotification(msg, 'success');
      loadTreatmentPlans();
      const planFormModal = document.getElementById('create-plan-modal');
      const shouldRefreshPlanForm = planFormModal?.dataset.mode === 'edit' && planFormModal?.dataset.planId === planId;
      if (document.getElementById('edit-plan-modal') || shouldRefreshPlanForm) openEditPlanModal(planId);
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) { showNotification('Erreur', 'error'); }
}

// ─── Sessions view ────────────────────────────────────────────────────────────
async function openPlanDetailsModal(planId) {
  const existing = document.getElementById('plan-details-modal');
  if (existing) existing.remove();
  try {
    const result = await window.api.plans.getById(planId);
    if (!result.success) { showNotification('Erreur', 'error'); return; }
    const plan = result.data;
    const sessions = plan.sessions || [];
    const equipment = plan.equipment || [];
    const treatments = plan.treatments || [];
    const showAmounts = canSeeFullPlanFinancials();

    const cost = Number(plan.totalCost || 0);
    const paid = Number(plan.totalPaid || 0);
    const balance = cost - paid;
    const pct = cost > 0 ? Math.min(100, Math.round(paid / cost * 100)) : 0;
    const treatmentTypeLabel = (plan.treatmentType && plan.treatmentType !== 'null' && plan.treatmentType !== 'undefined')
      ? esc(plan.treatmentType) : 'Non spécifié';

    // --- Sessions rows ---
    const sessionsRows = sessions.length
      ? sessions.map(s => `
          <tr>
            <td style="padding:10px 14px;font-size:14px;border-bottom:${s.notes ? 'none' : '1px solid #f1f5f9'}">Séance ${s.sessionNumber}</td>
            <td style="padding:10px 14px;font-size:14px;color:#64748b;border-bottom:${s.notes ? 'none' : '1px solid #f1f5f9'}">${formatDisplayDate(s.paidDate || s.scheduledDate)}</td>
            <td style="padding:10px 14px;font-size:14px;text-align:right;border-bottom:${s.notes ? 'none' : '1px solid #f1f5f9'}">${showAmounts ? `<strong>${Number(s.paidAmount || 0).toLocaleString()} DA</strong>` : '—'}</td>
            <td style="padding:10px 14px;border-bottom:${s.notes ? 'none' : '1px solid #f1f5f9'}">
              <span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${s.status === 'paid' ? '#dcfce7' : '#f1f5f9'};color:${s.status === 'paid' ? '#16a34a' : '#64748b'}">
                ${s.status === 'paid' ? '✓ Payée' : 'À venir'}
              </span>
            </td>
          </tr>
          ${s.notes ? `<tr><td colspan="4" style="padding:0 14px 16px 14px;border-bottom:1px solid #f1f5f9"><div style="font-size:13px;color:#475569;background:#f8fafc;padding:10px 12px;border-radius:6px;border-left:3px solid #3b82f6"><strong style="color:#1e293b">Acte / Note :</strong> ${esc(s.notes).replace(/\\n/g, '<br>')}</div></td></tr>` : ''}
          `).join('')
      : '<tr><td colspan="4" style="text-align:center;padding:28px;color:#9ca3af;font-size:14px">Aucune séance enregistrée</td></tr>';

    // --- Treatments (fix: use treatmentType not actName) ---
    const treatmentsHtml = treatments.length > 0 ? `
      <div style="margin-top:24px">
        <h4 style="margin:0 0 12px 0;font-size:15px;font-weight:600;color:#374151">Traitements liés</h4>
        <div style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden">
          ${treatments.map(t => {
            const tdate = t.treatmentDate ? new Date(t.treatmentDate).toLocaleDateString('fr-FR') : '—';
            const ttype = (t.treatmentType && t.treatmentType !== 'undefined' && t.treatmentType !== 'null') ? esc(t.treatmentType) : (t.description ? esc(t.description) : 'Traitement');
            const tooth = t.toothNumber ? `Dent ${t.toothNumber}` : '';
            return `<div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">
              <span style="color:#0f172a">${tooth ? `<strong>${tooth}</strong> — ` : ''}${ttype}</span>
              <span style="color:#64748b">${tdate}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // --- Equipment ---
    const equipHtml = `
      <div style="margin-top:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h4 style="margin:0;font-size:15px;font-weight:600;color:#374151">Équipement utilisé</h4>
          ${plan.status === 'active' ? `<button onclick="showAddEquipmentSelect('${plan.id}')" class="btn btn-secondary" style="padding:7px 14px;font-size:13px;border-radius:8px">+ Ajouter</button>` : ''}
        </div>
        <div id="add-equip-section-${plan.id}" style="display:none;margin-bottom:12px;background:#f0f9ff;padding:12px 14px;border-radius:10px;border:1px solid #bae6fd">
          <div style="display:flex;gap:10px;align-items:center">
            <select id="equip-sel-${plan.id}" class="form-control" style="flex:1;padding:8px 12px;font-size:14px;border-radius:8px"></select>
            <button onclick="addPlanEquipment('${plan.id}')" class="btn btn-primary" style="padding:8px 16px;font-size:13px;border-radius:8px">Lier</button>
            <button onclick="document.getElementById('add-equip-section-${plan.id}').style.display='none'" class="btn btn-secondary" style="padding:8px 12px;font-size:13px;border-radius:8px">✕</button>
          </div>
        </div>
        <div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;font-size:14px">
          ${equipment.length ? equipment.map(e => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #f1f5f9">
              <span style="color:#0f172a;font-weight:500">${esc(e.equipmentName)}</span>
              <div style="display:flex;align-items:center;gap:14px;color:#64748b">
                <span>${new Date(e.usageDate).toLocaleDateString('fr-FR')}</span>
                ${plan.status === 'active' ? `<span style="color:#ef4444;cursor:pointer;font-size:18px;line-height:1" onclick="removePlanEquipment('${e.id}', '${plan.id}')" title="Retirer">&times;</span>` : ''}
              </div>
            </div>`).join('') : '<div style="padding:16px;text-align:center;color:#9ca3af">Aucun équipement lié</div>'}
        </div>
      </div>
    `;

    const html = `
      <div id="plan-details-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px">
        <div style="background:#fff;border-radius:16px;padding:30px;width:100%;max-width:720px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3)">

          <!-- HEADER -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
            <div>
              <h3 style="margin:0;font-size:20px;font-weight:700;color:#0f172a">${esc(plan.title)}</h3>
              <div style="font-size:13px;color:#64748b;margin-top:6px;display:flex;gap:12px;flex-wrap:wrap">
                <span>🏥 ${SPECIALTY_LABELS[plan.specialty] || plan.specialty}</span>
                <span>•</span>
                <span>🔧 ${treatmentTypeLabel}</span>
                <span>•</span>
                <span>${(PLAN_STATUS_META[plan.status] || {}).label || plan.status}</span>
              </div>
            </div>
            <button onclick="document.getElementById('plan-details-modal').remove()" style="background:#f1f5f9;border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;color:#64748b;flex-shrink:0">&times;</button>
          </div>

          <!-- FINANCIAL PROGRESS -->
          ${showAmounts ? `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center">
                <div style="font-size:12px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Payé</div>
                <div style="font-size:20px;font-weight:700;color:#15803d">${paid.toLocaleString()} DA</div>
              </div>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center">
                <div style="font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Total</div>
                <div style="font-size:20px;font-weight:700;color:#0f172a">${cost.toLocaleString()} DA</div>
              </div>
              <div style="background:${balance > 0 ? '#fff7ed' : '#f0fdf4'};border:1px solid ${balance > 0 ? '#fed7aa' : '#bbf7d0'};border-radius:10px;padding:14px;text-align:center">
                <div style="font-size:12px;color:${balance > 0 ? '#c2410c' : '#16a34a'};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Solde</div>
                <div style="font-size:20px;font-weight:700;color:${balance > 0 ? '#c2410c' : '#15803d'}">${balance.toLocaleString()} DA</div>
              </div>
            </div>
            <div style="margin-bottom:24px">
              <div style="display:flex;justify-content:space-between;font-size:13px;color:#64748b;margin-bottom:6px">
                <span>Progression</span><span style="font-weight:600;color:#0f172a">${pct}%</span>
              </div>
              <div style="background:#e2e8f0;border-radius:6px;height:10px;overflow:hidden">
                <div style="height:100%;border-radius:6px;width:${pct}%;background:linear-gradient(90deg,#22c55e,#16a34a);transition:width .5s ease"></div>
              </div>
            </div>
          ` : ''}

          <!-- SESSIONS TABLE -->
          <h4 style="margin:0 0 12px 0;font-size:15px;font-weight:600;color:#374151">Séances de paiement</h4>
          <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:4px">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:10px 14px;text-align:left;font-size:13px;color:#64748b;font-weight:600">Séance</th>
                  <th style="padding:10px 14px;text-align:left;font-size:13px;color:#64748b;font-weight:600">Date</th>
                  <th style="padding:10px 14px;text-align:right;font-size:13px;color:#64748b;font-weight:600">Montant</th>
                  <th style="padding:10px 14px;text-align:left;font-size:13px;color:#64748b;font-weight:600">Statut</th>
                </tr>
              </thead>
              <tbody>${sessionsRows}</tbody>
            </table>
          </div>

          ${treatmentsHtml}
          ${equipHtml}

        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) { console.error(e); showNotification('Erreur', 'error'); }
}

// ─── Archive ──────────────────────────────────────────────────────────────────
async function archivePlan(planId) {
  if (!confirm('Archiver ce plan ? Il ne sera plus modifiable.')) return;
  try {
    const result = await window.api.plans.updateStatus(planId, 'archived');
    if (result.success) { showNotification('Plan archivé', 'success'); loadTreatmentPlans(); }
    else showNotification('Erreur: ' + result.error, 'error');
  } catch (e) { showNotification('Erreur', 'error'); }
}

async function unarchivePlan(planId) {
  if (!confirm('Désarchiver ce plan et le rendre actif ?')) return;
  try {
    const result = await window.api.plans.updateStatus(planId, 'active');
    if (result.success) {
      showNotification('Plan désarchivé', 'success');
      loadTreatmentPlans();
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) {
    showNotification('Erreur lors du désarchivage', 'error');
  }
}

async function updatePlanStatus(planId, status) {
  try {
    const result = await window.api.plans.updateStatus(planId, status);
    if (!result?.success) throw new Error(result?.error || 'Changement de statut impossible');
    showNotification('Statut du plan mis à jour', 'success');
    await loadTreatmentPlans();
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
    await loadTreatmentPlans();
  }
}

// ─── Print ────────────────────────────────────────────────────────────────────
async function printPlanDocument(planId) {
  try {
    const result = await window.api.plans.getById(planId);
    if (!result.success) { showNotification('Erreur chargement plan', 'error'); return; }
    const plan = result.data;
    const patientName = plan.lastName ? `${plan.lastName} ${plan.firstName}` : 'Patient';
    const sessions = (plan.sessions || []);
    const balance = Number(plan.totalCost || 0) - Number(plan.totalPaid || 0);
    const pct = plan.totalCost > 0 ? Math.min(100, Math.round((plan.totalPaid / plan.totalCost) * 100)) : 100;

    let settings = {};
    try {
      const settingsResult = await window.api?.settings?.get?.();
      if (settingsResult?.success) settings = settingsResult.data || {};
    } catch (_) {}

    const cabinetName = String(settings.cabinetName || 'MedCareSO').trim();
    const cabinetPhone = String(settings.cabinetPhone || '').trim();
    const cabinetEmail = String(settings.cabinetEmail || '').trim();
    const cabinetAddress = String(settings.cabinetAddress || '').trim();
    const doctorName = String(settings.doctorName || plan.createdBy || '').trim();
    const logoDataUrl = String(settings.cabinetLogoDataUrl || '').trim();
    const todayLabel = new Date().toLocaleDateString('fr-FR');
    const planReference = `PLAN-${String(plan.id || Date.now()).replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;

    const sessionRows = sessions.map((s, i) => {
      const isPaid = s.status === 'paid' || Number(s.paidAmount || 0) > 0;
      return `
      <tr>
        <td>${s.sessionNumber || i + 1}</td>
        <td>${formatDisplayDate(s.paidDate || s.scheduledDate)}</td>
        <td class="amount">${Number(s.expectedAmount || s.paidAmount || 0).toLocaleString()} DA</td>
        <td class="center">${isPaid ? 'Payée' : 'En attente'}</td>
      </tr>`;
    }).join('');

    const printContent = `
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Plan de Traitement — ${patientName}</title>
        <style>
          @page { size: A5 portrait; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 148mm; min-height: 210mm; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 8.6pt; line-height: 1.32; color: #000; }
          .sheet { width: 148mm; min-height: 210mm; padding: 8mm 7mm 6mm; display: flex; flex-direction: column; background: #fff; }
          .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; padding-bottom: 4mm; border-bottom: 1.5px solid #000; }
          .brand { display: grid; grid-template-columns: auto 1fr; gap: 3mm; align-items: start; max-width: 78mm; }
          .logo { width: 18mm; height: 14mm; object-fit: contain; }
          .brand-name { font-size: 11pt; font-weight: 800; line-height: 1.05; }
          .brand-line { font-size: 7.2pt; margin-top: 0.6mm; color: #111; }
          .document-meta { text-align: right; min-width: 39mm; }
          .document-title { font-size: 16pt; font-weight: 800; letter-spacing: 0.03em; }
          .document-date { font-size: 7.2pt; margin-top: 1mm; }
          .barcode { width: 28mm; height: 6mm; margin: 2.5mm 0 1mm auto; background: repeating-linear-gradient(90deg, #000 0 0.45mm, transparent 0.45mm 0.85mm, #000 0.85mm 1.15mm, transparent 1.15mm 1.8mm); }
          .reference { font-size: 7pt; font-weight: 700; letter-spacing: 0.04em; }
          .patient-box { margin-top: 3.8mm; border: 1px solid #000; padding: 2mm 2.4mm; }
          .section-label { font-size: 7.1pt; font-weight: 800; text-transform: uppercase; margin-bottom: 1mm; }
          .patient-name { font-size: 9.5pt; font-weight: 800; }
          .details-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 3mm; margin-top: 3mm; }
          .detail-box { border: 1px solid #000; min-height: 18mm; padding: 2.2mm 2.6mm; }
          .detail-value { font-size: 9pt; font-weight: 800; margin-bottom: 1.2mm; }
          .detail-line { font-size: 7.7pt; margin-top: 0.8mm; }
          .note { border: 1px solid #000; padding: 2.2mm 2.6mm; margin-top: 3mm; font-size: 7.9pt; }
          table { width: 100%; border-collapse: collapse; margin-top: 3.8mm; font-size: 7.8pt; table-layout: fixed; }
          th, td { border: 1px solid #000; padding: 1.55mm 2mm; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
          th { text-align: left; font-weight: 800; background: #f1f1f1; }
          th:nth-child(1), td:nth-child(1) { width: 13%; text-align: center; }
          th:nth-child(2), td:nth-child(2) { width: 31%; }
          th:nth-child(3), td:nth-child(3) { width: 28%; }
          th:nth-child(4), td:nth-child(4) { width: 28%; }
          .amount { text-align: right; white-space: nowrap; }
          .center { text-align: center; }
          .spacer { flex: 1; min-height: 10mm; }
          .totals { width: 48mm; margin-left: auto; font-size: 7.8pt; }
          .totals .row { display: flex; justify-content: space-between; gap: 5mm; padding: 1.2mm 1.5mm; border-bottom: 1px solid #000; }
          .totals .row:first-child { border-top: 1px solid #000; }
          .totals .row strong { font-size: 8.4pt; }
          .signatures { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 19mm; font-size: 7.2pt; }
          .signature { width: 46mm; text-align: center; border-top: 1px solid #000; padding-top: 1.8mm; }
          .footer-note { margin-top: 2.5mm; border-top: 1px solid #bdbdbd; padding-top: 1.6mm; text-align: center; font-size: 6.8pt; color: #333; }
          @media print {
            html, body { width: 148mm; min-height: 210mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <header class="top">
            <div class="brand">
              ${logoDataUrl ? `<img class="logo" src="${esc(logoDataUrl)}" alt="">` : ''}
              <div>
                <div class="brand-name">${esc(cabinetName)}</div>
                ${doctorName ? `<div class="brand-line">Dr ${esc(doctorName)}</div>` : ''}
                ${cabinetPhone ? `<div class="brand-line">Tél: ${esc(cabinetPhone)}</div>` : ''}
                ${cabinetEmail ? `<div class="brand-line">${esc(cabinetEmail)}</div>` : ''}
                ${cabinetAddress ? `<div class="brand-line">${esc(cabinetAddress)}</div>` : ''}
              </div>
            </div>
            <div class="document-meta">
              <div class="document-title">PLAN</div>
              <div class="document-date">${todayLabel}</div>
              <div class="barcode"></div>
              <div class="reference">${planReference}</div>
            </div>
          </header>

          <section class="patient-box">
            <div class="section-label">Patient</div>
            <div class="patient-name">${esc(patientName)}</div>
          </section>

          <section class="details-grid">
            <div class="detail-box">
              <div class="section-label">Plan de traitement</div>
              <div class="detail-value">${esc(plan.title || '—')}</div>
              <div class="detail-line">Spécialité: ${esc(SPECIALTY_LABELS[plan.specialty] || plan.specialty || '—')}</div>
              <div class="detail-line">Séances: ${sessions.length || Number(plan.sessionsCount || 0) || 0}</div>
            </div>
            <div class="detail-box">
              <div class="section-label">Suivi</div>
              <div class="detail-value">Avancement ${pct}%</div>
              <div class="detail-line">Date de création: ${formatDisplayDate(plan.createdAt || plan.startDate)}</div>
              <div class="detail-line">Référence: ${planReference}</div>
            </div>
          </section>

          ${plan.description ? `<div class="note"><strong>Note:</strong> ${esc(plan.description)}</div>` : ''}

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th class="amount">Montant</th>
                <th class="center">Statut</th>
              </tr>
            </thead>
            <tbody>${sessionRows || '<tr><td colspan="4" class="center">Aucune séance enregistrée</td></tr>'}</tbody>
          </table>

          <div class="spacer"></div>

          <section class="totals">
            <div class="row"><span>Coût total</span><span>${Number(plan.totalCost || 0).toLocaleString()} DA</span></div>
            <div class="row"><span>Total payé</span><span>${Number(plan.totalPaid || 0).toLocaleString()} DA</span></div>
            <div class="row"><strong>Solde restant</strong><strong>${balance.toLocaleString()} DA</strong></div>
          </section>

          <section class="signatures">
            <div class="signature">Signature du patient</div>
            <div class="signature">Cachet & signature</div>
          </section>

          <div class="footer-note">Merci de votre confiance.</div>
        </main>
      </body>
      </html>`;

    // Show preview modal
    let previewModal = document.getElementById('plan-print-preview-modal');
    if (!previewModal) {
      previewModal = document.createElement('div');
      previewModal.id = 'plan-print-preview-modal';
      previewModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
      document.body.appendChild(previewModal);
    }

    previewModal.innerHTML = `
      <div style="background:#fff;border:1px solid #dbe3ea;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,0.30);width:min(96vw,1500px);height:min(93vh,980px);display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:18px 22px;border-bottom:1px solid #dbe3ea;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div style="font-size:18px;font-weight:800;color:#111827">Impression</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">Plan de traitement - aperçu A5</div>
          </div>
          <button onclick="document.getElementById('plan-print-preview-modal').style.display='none'" style="background:#fff;border:0;font-size:28px;line-height:1;cursor:pointer;color:#94a3b8;width:34px;height:34px;border-radius:8px">×</button>
        </div>
        <div style="padding:12px 20px;border-bottom:1px solid #e5edf3;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-shrink:0;background:#fbfdff">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="display:inline-flex;align-items:center;min-height:32px;padding:0 16px;border-radius:16px;border:1px solid #b9cbd8;background:#4b8d96;color:#fff;font-size:12px;font-weight:800">Plan A5</span>
            <span style="display:inline-flex;align-items:center;min-height:32px;padding:0 14px;border-radius:16px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-size:12px;font-weight:700">Séances</span>
            <span style="display:inline-flex;align-items:center;min-height:32px;padding:0 14px;border-radius:16px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-size:12px;font-weight:700">Résumé</span>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <button id="plan-preview-pdf-btn" style="padding:8px 16px;border:1px solid #c9d6e2;border-radius:16px;background:#fff;color:#334155;font-size:13px;cursor:pointer;font-weight:800">Enregistrer en PDF</button>
            <button id="plan-preview-print-btn" style="padding:8px 18px;border:1px solid #2f7f86;border-radius:16px;background:#3f8d94;color:#fff;font-size:13px;cursor:pointer;font-weight:800">Imprimer</button>
          </div>
        </div>
        <div style="flex:1;overflow:auto;padding:28px;background:#d9d9d9">
          <div style="width:148mm;min-height:210mm;background:#fff;margin:0 auto;box-shadow:0 14px 32px rgba(15,23,42,0.22)">
            <iframe id="plan-preview-iframe" style="width:148mm;height:210mm;border:none;display:block;background:#fff" srcdoc=""></iframe>
          </div>
        </div>
      </div>`;

    previewModal.style.display = 'flex';

    // Load content into iframe
    const iframe = document.getElementById('plan-preview-iframe');
    iframe.srcdoc = printContent;

    document.getElementById('plan-preview-pdf-btn').onclick = async () => {
      if (!window.api?.print?.savePdf) {
        showNotification('Export PDF indisponible', 'error');
        return;
      }

      const pdfResult = await window.api.print.savePdf({
        html: printContent,
        pageSize: 'A5',
        documentTitle: `Plan de traitement - ${patientName}`
      });

      if (pdfResult?.success) {
        showNotification('PDF enregistré', 'success');
        previewModal.style.display = 'none';
      } else if (!pdfResult?.canceled) {
        showNotification('Erreur export PDF: ' + (pdfResult?.error || ''), 'error');
      }
    };

    document.getElementById('plan-preview-print-btn').onclick = () => {
      const printWin = window.open('', '_blank', 'width=800,height=600');
      printWin.document.write(printContent);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); printWin.close(); }, 400);
      previewModal.style.display = 'none';
    };

  } catch (e) {
    console.error('Print error:', e);
    showNotification('Erreur impression', 'error');
  }
}

async function deletePlan(planId) {
  if (!confirm('Supprimer définitivement ce plan sans encaissement ?')) return;
  try {
    const res = await window.api.plans.delete(planId);
    if (res.success) { showNotification('Plan supprimé', 'success'); loadTreatmentPlans(); }
    else showNotification('Erreur: ' + res.error, 'error');
  } catch (e) { showNotification('Erreur', 'error'); }
}

async function showAddEquipmentSelect(planId) {
  document.getElementById(`add-equip-section-${planId}`).style.display = 'block';
  const sel = document.getElementById(`equip-sel-${planId}`);
  if (sel.children.length > 0) return;
  try {
    const res = await window.api.equipment.getAll({});
    if (res.success) {
      sel.innerHTML = res.data.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
    }
  } catch(e){}
}

async function addPlanEquipment(planId) {
  const equipmentId = document.getElementById(`equip-sel-${planId}`).value;
  if (!equipmentId) return;
  try {
    const res = await window.api.invoke('plans:addEquipment', { planId, equipmentId });
    if (res.success) { openPlanDetailsModal(planId); }
    else { showNotification('Erreur', 'error'); }
  } catch(e){}
}

async function removePlanEquipment(equipId, planId) {
  if (!confirm('Enlever cet équipement ?')) return;
  try {
    const res = await window.api.invoke('plans:removeEquipment', equipId);
    if (res.success) { openPlanDetailsModal(planId); }
  } catch(e){}
}

let planSearchTimeout;
function debouncePlanSearch() {
  clearTimeout(planSearchTimeout);
  treatmentPlansState.page = 1;
  planSearchTimeout = setTimeout(loadTreatmentPlans, 300);
}

function switchPlansTab(tab) {
  if (!['active', 'archived'].includes(tab)) return;
  treatmentPlansState.activeTab = tab;
  document.querySelectorAll('#treatment-plans .module-tabs-inline [data-tab]').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  document.getElementById('plans-filter-status').value = '';
  treatmentPlansState.page = 1;
  loadTreatmentPlans();
}

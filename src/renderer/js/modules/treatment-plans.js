// ========== MODULE PLANS DE TRAITEMENT ==========
let treatmentPlansWs = null;
let treatmentPlansState = { plans: [], filteredPlans: [], filterPatient: '', filterStatus: '', page: 1, pageSize: 9 };

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
    const currentTab = document.querySelector('#treatment-plans .feature-tab-btn.active')?.id === 'plans-tab-archived' ? 'archived' : 'active';
    
    if (searchInput?.value?.trim()) filters.search = searchInput.value.trim();
    
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

  return `
    <div class="plan-card" style="padding:20px;border-left:4px solid ${meta.color};cursor:pointer;transition:transform 0.18s;background:#fff;border-radius:8px;display:flex;flex-direction:column;gap:14px" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'" onclick="openEditPlanModal('${plan.id}')">

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

      <!-- FINANCIALS -->
      ${canSeeFullFinancials ? `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="display:flex;gap:20px">
              <span style="font-size:13px;color:#6b7280">Payé&nbsp;: <strong style="color:#16a34a;font-size:14px">${paid.toLocaleString()} DA</strong></span>
              <span style="font-size:13px;color:#6b7280">Total&nbsp;: <strong style="color:#475569;font-size:14px">${cost.toLocaleString()} DA</strong></span>
            </div>
            <span style="font-size:15px;font-weight:700;color:${meta.color}">${pct}%</span>
          </div>
          <div style="background:#e2e8f0;border-radius:6px;height:9px;overflow:hidden">
            <div style="height:100%;border-radius:6px;width:${pct}%;background:linear-gradient(90deg,${meta.color},${meta.color}bb);transition:width .5s ease"></div>
          </div>
          ${balance > 0 ? `<div style="margin-top:7px;font-size:13px;color:#f97316;font-weight:600">Solde restant : ${balance.toLocaleString()} DA</div>` : '<div style="margin-top:7px;font-size:13px;color:#16a34a;font-weight:600">✓ Intégralement payé</div>'}
        </div>
      ` : `
        <div style="font-size:14px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          Paiements du jour&nbsp;: <strong>${Number(plan.todayPaid || 0).toLocaleString()} DA</strong>
        </div>
      `}

      <!-- ACTIONS ROW -->
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px" onclick="event.stopPropagation()">
        ${plan.status === 'active' && canSeeFullFinancials ? `
          <button onclick="openPlanPaymentActionsModal('${plan.id}',${cost},${paid})" class="btn btn-primary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px">💳 Payer</button>
        ` : ''}
        <button onclick="openEditPlanModal('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#fff;border-color:#d1d5db;color:#374151">Modifier</button>
        ${canSeeFullFinancials ? `<button onclick="printPlanDocument('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#f8fafc;border-color:#e2e8f0;color:#475569">🖨️ Imprimer</button>` : ''}
        ${plan.status === 'active' ? `<button onclick="archivePlan('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#f8fafc;border-color:#e2e8f0;color:#475569">🗄️ Archiver</button>` : ''}
        <button onclick="deletePlan('${plan.id}')" class="btn btn-secondary btn-small" style="flex:1;padding:8px 6px;font-size:12px;border-radius:8px;background:#fef2f2;border-color:#fecaca;color:#ef4444">🗑️ Supprimer</button>
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
  const safeCount = Math.max(1, Math.min(100, parseInt(count || 1)));
  const sorted = [...(sessions || [])].sort((a, b) => Number(a.sessionNumber || 0) - Number(b.sessionNumber || 0));
  const byNumber = new Map(sorted.map((session, index) => [Number(session.sessionNumber || index + 1), session]));
  const fallbackSessionAmount = safeCount ? Number(totalCost || 0) / safeCount : 0;
  const rows = [];

  for (let index = 0; index < safeCount; index++) {
    const sessionNumber = index + 1;
    const s = byNumber.get(sessionNumber) || {
      id: `new-${sessionNumber}`,
      sessionNumber,
      expectedAmount: fallbackSessionAmount,
      paidAmount: 0,
      status: 'pending',
      scheduledDate: '',
      paidDate: '',
      notes: ''
    };
    const expected = Number(s.expectedAmount || s.paidAmount || fallbackSessionAmount || 0);
    const paid = Number(s.paidAmount || 0);
    const scheduled = formatDateInputValue(s.scheduledDate);
    const paidDate = formatDisplayDate(s.paidDate);
    const isPaid = paid > 0 || s.status === 'paid';
    const badgeBg = isPaid ? '#f0fdf4' : '#f8fafc';
    const badgeColor = isPaid ? '#15803d' : '#64748b';
    rows.push(`
      <tr class="ep-session-row" data-session-id="${esc(s.id)}" data-session-number="${sessionNumber}" data-status="${esc(s.status || 'pending')}">
        <td style="padding:8px 10px;font-weight:600;color:#111827">#${sessionNumber}</td>
        <td style="padding:8px 10px"><input class="ep-session-scheduled" type="date" value="${esc(scheduled)}" style="width:140px;padding:7px;border:1px solid #d1d5db;border-radius:6px"></td>
        <td style="padding:8px 10px"><input class="ep-session-expected" type="number" min="0" value="${expected}" style="width:110px;padding:7px;border:1px solid #d1d5db;border-radius:6px;text-align:right"></td>
        <td style="padding:8px 10px;text-align:right;color:#111827;font-weight:600">${paid.toLocaleString()} DA</td>
        <td style="padding:8px 10px;color:#475569;font-weight:600">${isPaid ? paidDate : '—'}</td>
        <td style="padding:8px 10px"><span style="display:inline-flex;align-items:center;min-height:24px;padding:2px 8px;border-radius:999px;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700">${isPaid ? 'Payée' : 'Prévue'}</span></td>
        <td style="padding:8px 10px"><input class="ep-session-notes" value="${esc(s.notes || '')}" onfocus="showSessionNotePreview(this)" oninput="showSessionNotePreview(this)" onblur="hideSessionNotePreview()" style="width:160px;padding:7px;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></td>
        <td style="padding:8px 10px;text-align:right">${isPaid ? `<button type="button" class="btn btn-secondary btn-small" onclick="event.stopPropagation(); modifierEncaissementPlanSession('${planId}', '${esc(s.id)}', ${paid}, '${esc(formatDateInputValue(s.paidDate))}', '${esc(s.notes || '')}')" style="padding:7px 10px;font-size:12px">Modifier paiement</button>` : `<button type="button" class="btn btn-secondary btn-small" onclick="event.stopPropagation(); encaisserPlanSession('${planId}', '${esc(s.id)}', ${expected})" style="padding:7px 10px;font-size:12px">Encaisser</button>`}</td>
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
  return currentUserIsSuperAdmin === true || currentUserIsAdmin === true;
}

function filterTreatmentPlans() {
  treatmentPlansState.page = 1;
  loadTreatmentPlans();
}

// ─── Unified Create/Edit Plan Modal ───────────────────────────────────────────
function openCreatePlanModal(patientId) {
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
}

async function populatePlanPatientPicker({ selectedPatientId = null, readOnly = false } = {}) {
  const res = await window.api.patient.getAll();
  const searchInput = document.getElementById('cp-patient-search');
  const hiddenInput = document.getElementById('cp-patient');
  const dropdown = document.getElementById('cp-patient-dropdown');
  if (!searchInput || !hiddenInput || !dropdown || !res.success) return;
  const patients = res.data || [];
  const selected = patients.find(p => p.id === selectedPatientId);
  if (selected) {
    hiddenInput.value = selected.id;
    searchInput.value = `${selected.lastName} ${selected.firstName}`;
  }
  if (readOnly) return;
  const renderDropdown = (filterText = '') => {
    const lowerFilter = filterText.toLowerCase();
    const filtered = patients.filter(p => `${p.lastName} ${p.firstName}`.toLowerCase().includes(lowerFilter));
    dropdown.innerHTML = filtered.length
      ? filtered.map(p => `<div class="patient-opt" data-id="${p.id}" data-name="${esc(p.lastName)} ${esc(p.firstName)}" style="padding:10px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid #f1f5f9">${esc(p.lastName)} ${esc(p.firstName)}</div>`).join('')
      : '<div style="padding:10px 12px;color:#64748b;font-size:14px;text-align:center">Aucun patient trouvé</div>';
    dropdown.querySelectorAll('.patient-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        hiddenInput.value = opt.getAttribute('data-id');
        searchInput.value = opt.getAttribute('data-name');
        dropdown.style.display = 'none';
      });
    });
  };
  searchInput.addEventListener('focus', () => { renderDropdown(searchInput.value); dropdown.style.display = 'block'; });
  searchInput.addEventListener('input', (e) => { hiddenInput.value = ''; renderDropdown(e.target.value); dropdown.style.display = 'block'; });
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
    const result = mode === 'edit'
      ? await window.api.plans.update(planId, payload)
      : await window.api.plans.create(payload);
    if (result.success) {
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
          <h4 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;color:#374151">Tarifs des séances</h4>
          <span id="ep-sessions-count-label" style="font-size:12px;color:#6b7280">${Number(plan.sessionsCount || sessions.length || 1)} séance(s) · encaissement séparé</span>
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:auto;max-height:360px;background:#fff">
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
      openAddPaymentModal(planId, totalCost, totalPaid, amount, '', notes);
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
  const balance = totalCost - totalPaid;
  const defaultAmount = presetAmount && presetAmount > 0 ? Math.min(presetAmount, balance) : balance;
  const html = `
    <div id="plan-payment-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10003;display:flex;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;padding:28px;width:440px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h3 style="margin:0">Enregistrer un Paiement</h3>
          <button onclick="document.getElementById('plan-payment-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px">
          Solde restant: <strong style="color:#16a34a">${balance.toLocaleString()} DA</strong>
        </div>
        <div style="display:grid;gap:12px">
          <div>
            <label style="font-weight:600;font-size:13px">Montant payé (DA) *</label>
            <input type="number" id="pp-amount" class="form-control" value="${defaultAmount}" min="1" max="${balance}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
          </div>
          <div>
            <label style="font-weight:600;font-size:13px">Date du paiement</label>
            <input type="date" id="pp-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
          </div>
          <div>
            <label style="font-weight:600;font-size:13px">Mode de paiement</label>
            <select id="pp-method" class="form-control" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">
              <option value="Espèces">Espèces</option>
              <option value="Carte">Carte</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
            </select>
          </div>
          <div>
            <label style="font-weight:600;font-size:13px">Notes cliniques / Actes réalisés (Traçabilité)</label>
            <textarea id="pp-notes" class="form-control" placeholder="Ex: Détartrage + préparation, dent 46..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;min-height:70px;resize:vertical;font-family:inherit">${esc(presetNotes || '')}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">
          <button onclick="document.getElementById('plan-payment-modal').remove()" class="btn btn-secondary">Annuler</button>
          <button onclick="submitPayment('${planId}')" class="btn btn-primary">✅ Enregistrer</button>
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
    const result = await window.api.plans.archive(planId);
    if (result.success) { showNotification('Plan archivé', 'success'); loadTreatmentPlans(); }
    else showNotification('Erreur: ' + result.error, 'error');
  } catch (e) { showNotification('Erreur', 'error'); }
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

    const sessionRows = sessions.map((s, i) => `
      <tr>
        <td>${s.sessionNumber || i + 1}</td>
        <td>${formatDisplayDate(s.paidDate || s.scheduledDate)}</td>
        <td class="amount">${Number(s.expectedAmount || s.paidAmount || 0).toLocaleString()} DA</td>
        <td class="center">${s.status === 'paid' ? 'Payée' : 'En attente'}</td>
      </tr>`).join('');

    const printContent = `
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Plan de Traitement — ${patientName}</title>
        <style>
          @page { size: A5 portrait; margin: 10mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 148mm; min-height: 210mm; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; color: #000; padding: 0; }
          .header { text-align: center; border-bottom: 1px solid #000; padding-bottom: 6mm; margin-bottom: 6mm; }
          .header h1 { font-size: 15pt; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
          .header .date { font-size: 9.5pt; margin-top: 2mm; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 5mm; }
          .info-box { border: 1px solid #000; padding: 3mm; min-height: 22mm; }
          .info-box .label { font-size: 8.5pt; text-transform: uppercase; font-weight: 700; margin-bottom: 2mm; }
          .info-box .value { font-size: 11pt; font-weight: 700; }
          .info-box .sub { font-size: 9pt; margin-top: 1mm; }
          .note { border: 1px solid #000; padding: 3mm; margin-bottom: 5mm; font-size: 9.5pt; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-size: 9.5pt; }
          th, td { border: 1px solid #000; padding: 2mm; vertical-align: top; }
          th { text-align: left; font-weight: 700; }
          .amount { text-align: right; white-space: nowrap; }
          .center { text-align: center; }
          .totals { margin-left: auto; width: 62%; border: 1px solid #000; margin-top: 3mm; }
          .totals .row { display: flex; justify-content: space-between; padding: 2mm 3mm; font-size: 10pt; border-bottom: 1px solid #000; }
          .totals .row:last-child { border-bottom: 0; font-weight: 700; }
          .footer { margin-top: 10mm; border-top: 1px solid #000; padding-top: 4mm; display: flex; justify-content: space-between; font-size: 8.5pt; }
          .sign-box { text-align: center; }
          .sign-box .line { width: 42mm; border-bottom: 1px solid #000; margin: 16mm auto 2mm; }
          @media print {
            html, body { width: 148mm; min-height: 210mm; }
            body { -webkit-print-color-adjust: economy; print-color-adjust: economy; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PLAN DE TRAITEMENT</h1>
          <div class="date">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>

        <div class="info-grid">
          <div class="info-box">
            <div class="label">Patient</div>
            <div class="value">${patientName}</div>
            <div class="sub">Praticien: ${esc(plan.createdBy || '—')}</div>
          </div>
          <div class="info-box">
            <div class="label">Plan</div>
            <div class="value">${esc(plan.title || '—')}</div>
            <div class="sub">${SPECIALTY_LABELS[plan.specialty] || plan.specialty || '-'} - ${sessions.length} séance(s) - Avancement ${pct}%</div>
          </div>
        </div>

        ${plan.description ? `<div class="note"><strong>Note:</strong> ${esc(plan.description)}</div>` : ''}

        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th class="amount">Montant</th>
              <th class="center">Statut</th>
            </tr>
          </thead>
          <tbody>${sessionRows || '<tr><td colspan="4" class="center">Aucune séance enregistrée</td></tr>'}</tbody>
        </table>

        <div class="totals">
          <div class="row"><span>Coût total</span><span>${Number(plan.totalCost || 0).toLocaleString()} DA</span></div>
          <div class="row"><span>Total payé</span><span>${Number(plan.totalPaid || 0).toLocaleString()} DA</span></div>
          <div class="row"><span>Solde restant</span><span>${balance.toLocaleString()} DA</span></div>
        </div>

        <div class="footer">
          <div>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
          <div class="sign-box"><div class="line"></div>Signature du praticien</div>
        </div>
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
      <div style="background:#fff;border:1px solid #d1d5db;border-radius:4px;box-shadow:0 18px 48px rgba(0,0,0,0.28);width:min(96vw,760px);height:min(94vh,920px);display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:12px 16px;border-bottom:1px solid #d1d5db;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div style="font-size:16px;font-weight:700;color:#111827">Aperçu du document</div>
            <div style="font-size:12px;color:#4b5563;margin-top:2px">Format A5 - Plan de traitement</div>
          </div>
          <button onclick="document.getElementById('plan-print-preview-modal').style.display='none'" style="background:#fff;border:1px solid #d1d5db;font-size:16px;cursor:pointer;color:#111827;padding:4px 9px;border-radius:3px">×</button>
        </div>
        <div style="flex:1;overflow:auto;padding:18px;background:#f3f4f6">
          <div style="width:148mm;min-height:210mm;background:#fff;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,0.16);border:1px solid #d1d5db">
            <iframe id="plan-preview-iframe" style="width:148mm;height:210mm;border:none;display:block" srcdoc=""></iframe>
          </div>
        </div>
        <div style="padding:12px 16px;border-top:1px solid #d1d5db;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:#fff">
          <button onclick="document.getElementById('plan-print-preview-modal').style.display='none'" style="padding:8px 16px;border:1px solid #9ca3af;border-radius:3px;background:#fff;color:#111827;font-size:13px;cursor:pointer;font-weight:600">Annuler</button>
          <button id="plan-preview-pdf-btn" style="padding:8px 16px;border:1px solid #111827;border-radius:3px;background:#fff;color:#111827;font-size:13px;cursor:pointer;font-weight:700">Enregistrer PDF</button>
          <button id="plan-preview-print-btn" style="padding:8px 18px;border:1px solid #111827;border-radius:3px;background:#111827;color:#fff;font-size:13px;cursor:pointer;font-weight:700">Imprimer</button>
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
  if (!confirm('Supprimer définitivement ce plan ? Impossible si des paiements ou traitements existent.')) return;
  try {
    const res = await window.api.plans.delete(planId);
    if (res.success) { showNotification('Plan supprimé', 'success'); loadTreatmentPlans(); }
    else { showNotification('Erreur: ' + res.error, 'error'); alert('Pour conserver les traces comptables/cliniques, veuillez utiliser la fonction ARCHIVER au lieu de SUPPRIMER.'); }
  } catch (e) { showNotification('Erreur', 'error'); }
}

async function showAddEquipmentSelect(planId) {
  document.getElementById(`add-equip-section-${planId}`).style.display = 'block';
  const sel = document.getElementById(`equip-sel-${planId}`);
  if (sel.children.length > 0) return;
  try {
    const res = await window.api.inventory.getAll();
    if (res.success) {
      sel.innerHTML = res.data.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
    }
  } catch(e){}
}

async function addPlanEquipment(planId) {
  const invId = document.getElementById(`equip-sel-${planId}`).value;
  if (!invId) return;
  try {
    const res = await window.api.invoke('plans:addEquipment', { planId, inventoryId: invId });
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
  document.querySelectorAll('#treatment-plans .feature-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('plans-tab-' + tab)?.classList.add('active');
  document.getElementById('plans-filter-status').value = '';
  treatmentPlansState.page = 1;
  loadTreatmentPlans();
}

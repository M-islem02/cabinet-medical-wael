/**
 * Module Opérations & Interventions Chirurgicales
 * Module transversal pour toutes spécialités (ORL, Dentisterie, Chirurgie générale, etc.)
 */

let operationsData = [];
let operationsCatalog = [];
let operationsFilters = {
  search: '',
  category: '',
  practitionerId: '',
  status: '',
  startDate: '',
  endDate: ''
};
let operationsInitialized = false;
let editingOperationId = null;
let operationConsumablesList = [];
function formatOperationCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('fr-DZ', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num) + ' DZD';
}

function formatOperationDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('fr-FR');
}

// ─── INITIALIZATION ─────────────────────────────────────────────────────────

async function initOperations() {
  try {
    if (!operationsInitialized) {
      await loadOperationsCatalog();
      await loadOperationsFilterOptions();
      operationsInitialized = true;
    }
    await loadOperationsStats();
    await loadOperations();
  } catch (error) {
    console.error('Error initializing operations module:', error);
  }
}

async function loadOperationsCatalog() {
  try {
    const specialty = getCurrentActiveSpecialty();
    const result = await window.api.operation.getTypesCatalog(specialty);
    operationsCatalog = result && result.success ? result.data : [];
    populateOperationTypeSelect();
  } catch (e) {
    console.error('Error loading operations catalog:', e);
    operationsCatalog = [];
  }
}

function getCurrentActiveSpecialty() {
  const cfg = window._packageConfig || {};
  if (typeof resolveActivePracticeSpecialty === 'function') {
    return resolveActivePracticeSpecialty(cfg);
  }
  return cfg.specialty || 'dentistry';
}

async function loadOperationsFilterOptions() {
  try {
    // Populate practitioners in filter
    const docSelect = document.getElementById('operations-practitioner-filter');
    if (docSelect && window.api.user) {
      const usersRes = await window.api.user.getAll();
      const users = usersRes && usersRes.success ? (usersRes.data || []) : [];
      const docs = users.filter(u => u.role === 'doctor' || u.role === 'dentist' || u.role === 'admin' || u.isAdmin);
      docSelect.innerHTML = '<option value="">Tous les praticiens</option>' +
        docs.map(d => `<option value="${d.id}">${escapeHTML((d.firstName ? `${d.firstName} ${d.lastName || ''}` : d.username) || '')}</option>`).join('');
    }

    // Populate type filter
    const typeSelect = document.getElementById('operations-type-filter');
    if (typeSelect && operationsCatalog.length > 0) {
      typeSelect.innerHTML = '<option value="">Tous les types d\'actes</option>' +
        operationsCatalog.map(t => `<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join('');
    }
  } catch (e) {
    console.warn('Error loading filter options:', e);
  }
}

// ─── STATS ──────────────────────────────────────────────────────────────────

async function loadOperationsStats() {
  try {
    const filters = {};
    if (operationsFilters.category) {
      filters.category = operationsFilters.category;
    }
    const result = await window.api.operation.getStats(filters);
    const stats = result && result.success ? result.data : {};

    const totalEl = document.getElementById('stat-op-total');
    const monthEl = document.getElementById('stat-op-month');
    const revenueEl = document.getElementById('stat-op-revenue');
    const scheduledEl = document.getElementById('stat-op-scheduled');

    if (totalEl) totalEl.textContent = stats.total || 0;
    if (monthEl) monthEl.textContent = stats.thisMonthCount || 0;
    if (revenueEl) revenueEl.textContent = formatOperationCurrency(stats.totalRevenue || 0);
    if (scheduledEl) scheduledEl.textContent = stats.scheduled || 0;
  } catch (e) {
    console.error('Error loading operations stats:', e);
  }
}

// ─── LIST & RENDER ──────────────────────────────────────────────────────────

async function loadOperations() {
  const tbody = document.getElementById('operations-tbody');
  if (!tbody) return;

  try {
    const filters = {
      ...operationsFilters
    };
    if (operationsFilters.category) {
      filters.category = operationsFilters.category;
    }
    const result = await window.api.operation.getAll(filters);
    operationsData = result && result.success ? (result.data || []) : [];
    displayOperations();
  } catch (error) {
    console.error('Error loading operations:', error);
    operationsData = [];
    displayOperations();
  }
}

function displayOperations() {
  const tbody = document.getElementById('operations-tbody');
  if (!tbody) return;

  if (!operationsData || operationsData.length === 0) {
    const hasFilters = Boolean(operationsFilters.search || operationsFilters.status || operationsFilters.practitionerId || operationsFilters.startDate);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center" style="padding: 48px 24px;">
          <div class="ant-empty" style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="ant-empty-image" style="margin-bottom: 16px;">
              <svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="#f8fafc"/>
                <line x1="8" y1="56" x2="56" y2="56"/>
              </svg>
            </div>
            <div style="font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">Aucune opération enregistrée</div>
            <div style="font-size: 13.5px; color: #64748b; max-width: 420px; line-height: 1.5; margin-bottom: ${hasFilters ? '16px' : '0'};">
              ${hasFilters ? 'Aucune intervention ne correspond aux critères de recherche sélectionnés.' : 'Enregistrez votre première intervention chirurgicale ou acte technique.'}
            </div>
            ${hasFilters ? '<button type="button" class="btn btn-secondary" onclick="resetOperationsFilters()" style="height: 36px; padding: 0 16px; margin-top: 14px;">Réinitialiser les filtres</button>' : ''}
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const statusTags = {
    completed: '<span class="ant-tag ant-tag-success" style="background:#f6ffed; color:#389e0d; border-color:#b7eb8f; font-weight:600;">Réalisée</span>',
    scheduled: '<span class="ant-tag ant-tag-processing" style="background:#e6f0ff; color:#1677ff; border-color:#91caff; font-weight:600;">Programmée</span>',
    in_progress: '<span class="ant-tag ant-tag-warning" style="background:#fffbe6; color:#d46b08; border-color:#ffd591; font-weight:600;">En cours</span>',
    cancelled: '<span class="ant-tag ant-tag-error" style="background:#fff1f0; color:#cf1322; border-color:#ffa39e; font-weight:600;">Annulée</span>'
  };

  tbody.innerHTML = operationsData.map(op => {
    const patientName = op.patientFirstName || op.patientLastName
      ? `${op.patientLastName || ''} ${op.patientFirstName || ''}`.trim()
      : 'Patient inconnu';
    const dateLabel = op.operationDate ? formatOperationDate(op.operationDate) : '-';
    const timeLabel = op.operationTime ? ` à ${escapeHTML(op.operationTime)}` : '';
    const statusHtml = statusTags[op.status] || `<span class="ant-tag">${escapeHTML(op.status || '')}</span>`;
    const totalCost = Number(op.cost) || 0;
    const paidAmount = Number(op.paidAmount) || 0;
    const remainingAmount = Math.max(0, totalCost - paidAmount);

    const costDisplay = totalCost > 0 ? formatOperationCurrency(totalCost) : '—';
    let paymentStatusHtml = '';
    if (op.paymentStatus === 'paid' || (totalCost > 0 && paidAmount >= totalCost)) {
      paymentStatusHtml = '<span class="ant-tag ant-tag-success" style="font-size:11px; background:#f6ffed; color:#389e0d; border-color:#b7eb8f;">Réglé (Totalité)</span>';
    } else if (op.paymentStatus === 'partial' || paidAmount > 0) {
      paymentStatusHtml = `
        <div style="font-size: 11px; margin-top: 2px;">
          <span class="ant-tag ant-tag-warning" style="font-size:11px; background:#fffbe6; color:#d46b08; border-color:#ffd591;">Acompte: ${formatOperationCurrency(paidAmount)}</span>
          <div style="color: #cf1322; font-weight: 600; font-size: 10.5px; margin-top: 1px;">Reste: ${formatOperationCurrency(remainingAmount)}</div>
        </div>
      `;
    } else {
      paymentStatusHtml = '<span class="ant-tag ant-tag-error" style="font-size:11px; background:#fff1f0; color:#cf1322; border-color:#ffa39e;">Non réglé</span>';
    }

    return `
      <tr>
        <td style="padding: 14px 16px;">
          <div style="font-weight: 600; color: #1e293b;">${escapeHTML(dateLabel)}</div>
          <div style="font-size: 12px; color: #64748b;">${escapeHTML(timeLabel)}</div>
        </td>
        <td style="padding: 14px 16px;">
          <a href="#" onclick="event.preventDefault(); showPatientDetails('${op.patientId}')" style="font-weight: 600; color: #1677ff; text-decoration: none;">
            ${escapeHTML(patientName)}
          </a>
          ${op.patientPhone ? `<div style="font-size: 12px; color: #64748b;">${escapeHTML(op.patientPhone)}</div>` : ''}
        </td>
        <td style="padding: 14px 16px;">
          <div style="font-weight: 600; color: #0f172a;">${escapeHTML(op.operationType)}</div>
          ${op.operationCode ? `<div style="font-size: 11.5px; color: #08979c; font-family: monospace;">${escapeHTML(op.operationCode)}</div>` : ''}
          ${op.anesthesiaType ? `<div style="font-size: 12px; color: #64748b;">Anesthésie : ${escapeHTML(op.anesthesiaType)}</div>` : ''}
        </td>
        <td style="padding: 14px 16px; color: #334155;">
          ${escapeHTML(op.practitionerName || '—')}
        </td>
        <td style="padding: 14px 16px; text-align: center;">
          ${statusHtml}
        </td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="font-weight: 700; color: #1e293b;">${costDisplay}</div>
          <div>${paymentStatusHtml}</div>
        </td>
        <td style="padding: 14px 16px; text-align: center;">
          <div style="display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap;">
            ${(() => {
              const isFullyPaid = totalCost > 0 && paidAmount >= totalCost;
              if (isFullyPaid) {
                return `
              <button type="button" disabled title="Opération réglée en totalité — aucun paiement supplémentaire possible" style="height: 32px; padding: 0 10px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; border: 1px solid #cbd5e1; color: #64748b; border-radius: 6px; cursor: not-allowed; opacity: 0.75;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Réglé
              </button>`;
              }
              if ((remainingAmount > 0 || op.paymentStatus !== 'paid') && totalCost > 0) {
                return `
              <button type="button" class="btn btn-small" onclick="openOperationPaymentModal('${op.id}')" title="Ajouter un versement ou solder le reste" style="height: 32px; padding: 0 10px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: #10b981; border: 1px solid #059669; color: #ffffff; border-radius: 6px; cursor: pointer;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                ${paidAmount > 0 ? 'Versement' : 'Payer'}
              </button>`;
              }
              return '';
            })()}
            <button type="button" class="btn btn-secondary btn-small" onclick="viewOperationReport('${op.id}')" title="Compte-rendu opératoire" style="height: 32px; padding: 0 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              CR
            </button>
            <button type="button" class="btn btn-secondary btn-small" onclick="editOperation('${op.id}')" title="Modifier" style="height: 32px; padding: 0 10px; font-size: 12px;">
              Modifier
            </button>
            <button type="button" class="btn btn-small" onclick="deleteOperation('${op.id}')" title="Supprimer" style="height: 32px; width: 32px; padding: 0; border-radius: 6px; background: #fff1f0; border: 1px solid #ffa39e; color: #e11d48; display: inline-flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateOperationsActiveFiltersUI() {
  const searchInput = document.getElementById('operations-search');
  const typeSelect = document.getElementById('operations-type-filter');
  const docSelect = document.getElementById('operations-practitioner-filter');
  const statusSelect = document.getElementById('operations-status-filter');
  const startInput = document.getElementById('operations-start-date');
  const endInput = document.getElementById('operations-end-date');
  const resetBtn = document.getElementById('operations-reset-btn');
  const rangeWrapper = document.querySelector('.ant-rangepicker-wrapper');

  const hasSearch = Boolean(searchInput && searchInput.value.trim());
  const hasType = Boolean(typeSelect && typeSelect.value);
  const hasDoc = Boolean(docSelect && docSelect.value);
  const hasStatus = Boolean(statusSelect && statusSelect.value);
  const hasDate = Boolean((startInput && startInput.value) || (endInput && endInput.value));

  if (searchInput) searchInput.classList.toggle('ant-filter-active', hasSearch);
  if (typeSelect) typeSelect.classList.toggle('ant-filter-active', hasType);
  if (docSelect) docSelect.classList.toggle('ant-filter-active', hasDoc);
  if (statusSelect) statusSelect.classList.toggle('ant-filter-active', hasStatus);
  if (rangeWrapper) rangeWrapper.classList.toggle('ant-filter-active', hasDate);

  const hasActiveFilters = hasSearch || hasType || hasDoc || hasStatus || hasDate;
  if (resetBtn) {
    resetBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';
  }
}

function filterOperations() {
  const searchInput = document.getElementById('operations-search');
  const typeSelect = document.getElementById('operations-type-filter');
  const docSelect = document.getElementById('operations-practitioner-filter');
  const statusSelect = document.getElementById('operations-status-filter');
  const startInput = document.getElementById('operations-start-date');
  const endInput = document.getElementById('operations-end-date');

  operationsFilters.search = searchInput ? searchInput.value.trim() : '';
  operationsFilters.operationType = typeSelect ? typeSelect.value : '';
  operationsFilters.practitionerId = docSelect ? docSelect.value : '';
  operationsFilters.status = statusSelect ? statusSelect.value : '';
  operationsFilters.startDate = startInput ? startInput.value : '';
  operationsFilters.endDate = endInput ? endInput.value : '';

  updateOperationsActiveFiltersUI();
  loadOperations();
}

function resetOperationsFilters() {
  operationsFilters = {
    search: '',
    category: '',
    practitionerId: '',
    status: '',
    startDate: '',
    endDate: ''
  };
  const ids = ['operations-search', 'operations-type-filter', 'operations-practitioner-filter', 'operations-status-filter', 'operations-start-date', 'operations-end-date'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  updateOperationsActiveFiltersUI();
  loadOperations();
}

// ─── MODAL: NOUVELLE / ÉDITION OPÉRATION ────────────────────────────────────

async function openNewOperationModal(prefillPatientId = null) {
  try {
    editingOperationId = null;
    const form = document.getElementById('operation-form');
    if (form) form.reset();

    const titleEl = document.getElementById('operation-modal-title');
    if (titleEl) {
      titleEl.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1677ff" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> <span>Nouvelle Opération / Intervention</span>';
    }

    const opId = document.getElementById('operation-id');
    if (opId) opId.value = '';
    const opDate = document.getElementById('operation-date');
    if (opDate) opDate.value = typeof moment === 'function' ? moment().format('YYYY-MM-DD') : new Date().toISOString().split('T')[0];
    const opTime = document.getElementById('operation-time');
    if (opTime) opTime.value = typeof moment === 'function' ? moment().format('HH:mm') : new Date().toTimeString().substring(0, 5);
    const opRoom = document.getElementById('operation-room');
    if (opRoom) opRoom.value = "Salle d'opération";
    const opStatus = document.getElementById('operation-status');
    if (opStatus) opStatus.value = 'completed';
    const opAnesth = document.getElementById('operation-anesthesia');
    if (opAnesth) opAnesth.value = 'Locale';
    const opDur = document.getElementById('operation-duration');
    if (opDur) opDur.value = '30';
    const opCost = document.getElementById('operation-cost');
    if (opCost) opCost.value = '';
    const opNotes = document.getElementById('operation-notes');
    if (opNotes) opNotes.value = '';
    const opInst = document.getElementById('operation-instructions');
    if (opInst) opInst.value = '';
    const opCreatePay = document.getElementById('operation-create-payment');
    if (opCreatePay) opCreatePay.checked = true;
    const opPaySec = document.getElementById('operation-payment-section');
    if (opPaySec) opPaySec.style.display = 'block';

    const typeInput = document.getElementById('operation-type-select');
    if (typeInput) typeInput.value = '';
    const typeDropdown = document.getElementById('operation-type-dropdown');
    if (typeDropdown) {
      typeDropdown.style.display = 'none';
      typeDropdown.innerHTML = '';
    }

    // Show modal immediately so user perceives 0 latency
    if (typeof showModal === 'function') {
      showModal('modal-operation');
    }

    // Parallel background loading using Promise.all
    await Promise.all([
      (!operationsCatalog || operationsCatalog.length === 0) ? loadOperationsCatalog() : Promise.resolve(),
      loadPatientsSelectForOperation(prefillPatientId),
      loadPractitionersSelectForOperation(),
      loadEquipmentCheckboxesForOperation(),
      loadInventoryArticlesForOperation()
    ]);

    operationConsumablesList = [];
    renderOperationConsumablesRows();
  } catch (error) {
    console.error('Error in openNewOperationModal:', error);
    if (typeof showModal === 'function') {
      showModal('modal-operation');
    }
  }
}

async function loadPractitionersSelectForOperation(selectedId = null) {
  const docSelect = document.getElementById('operation-practitioner');
  if (!docSelect) return;
  try {
    let docs = [];
    if (window.api?.user?.getAll) {
      const res = await window.api.user.getAll();
      const users = res && res.success ? (res.data || []) : [];
      docs = users.filter(u => u.role === 'doctor' || u.role === 'dentist' || u.role === 'admin' || u.isAdmin);
    }
    const currentUserId = selectedId || window.currentUser?.id || (typeof global !== 'undefined' && global.currentUser?.id) || '';
    docSelect.innerHTML = '<option value="">-- Praticien --</option>' +
      docs.map(d => {
        const name = (d.firstName ? `Dr. ${d.firstName} ${d.lastName || ''}` : d.username) || '';
        const isSel = currentUserId && String(d.id) === String(currentUserId) ? 'selected' : '';
        return `<option value="${d.id}" ${isSel}>${escapeHTML(name)}</option>`;
      }).join('');

    if (currentUserId && docs.some(d => String(d.id) === String(currentUserId))) {
      docSelect.value = String(currentUserId);
    }
  } catch (e) {
    console.warn('Error loading practitioners for operation:', e);
  }
}

async function loadPatientsSelectForOperation(selectedPatientId = null) {
  if (typeof window.initSearchablePatientSelect === 'function') {
    window.initSearchablePatientSelect(
      'operation-patient-search',
      'operation-patient-select',
      'operation-patient-dropdown',
      {
        minChars: 1,
        hideWhenEmpty: true,
        placeholder: "Tapez le nom d'un patient...",
        emptyMessage: 'Tapez la première lettre pour rechercher un patient',
        loadingMessage: 'Recherche des patients...',
        noResultsMessage: 'Aucun patient trouvé.'
      }
    );
  }

  const hiddenInput = document.getElementById('operation-patient-select');
  const searchInput = document.getElementById('operation-patient-search');

  if (selectedPatientId) {
    if (typeof window.setLazyPatientFieldValue === 'function') {
      await window.setLazyPatientFieldValue('operation-patient-select', selectedPatientId);
    } else if (hiddenInput) {
      hiddenInput.value = String(selectedPatientId);
    }
  } else {
    if (hiddenInput) hiddenInput.value = '';
    if (searchInput) searchInput.value = '';
  }
}

function populateOperationTypeSelect(selectedValue = null) {
  const input = document.getElementById('operation-type-select');
  if (input && selectedValue) {
    input.value = selectedValue;
  }
}

function onOperationTypeFocus(event) {
  const input = document.getElementById('operation-type-select');
  const dropdown = document.getElementById('operation-type-dropdown');
  if (!input || !dropdown) return;
  const list = operationsCatalog || [];
  if (!list.length) return;

  dropdown.innerHTML = list.map(t => {
    const costText = t.defaultCost ? `<span style="color: #166534; font-weight: 600; font-size: 11.5px; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">${t.defaultCost} DZD</span>` : '';
    const codeText = t.code ? `<span style="color: #64748b; font-size: 11.5px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${escapeHTML(t.code)}</span>` : '';
    const safeName = escapeHTML(t.name).replace(/'/g, "\\'");
    const safeCode = escapeHTML(t.code || '').replace(/'/g, "\\'");
    return `
      <div class="op-type-item" onclick="selectOperationTypeItem('${safeName}', '${safeCode}', ${t.defaultCost || 0}, ${t.defaultDuration || 30})" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b;" onmouseenter="this.style.background='#f0f7ff'" onmouseleave="this.style.background='#ffffff'">
        <span style="font-weight: 600;">${escapeHTML(t.name)}</span>
        <div style="display: flex; align-items: center; gap: 6px;">${codeText}${costText}</div>
      </div>
    `;
  }).join('');
  dropdown.style.display = 'block';
}

function onOperationTypeInput(event) {
  const input = document.getElementById('operation-type-select');
  const dropdown = document.getElementById('operation-type-dropdown');
  if (!input || !dropdown) return;

  const query = (input.value || '').trim().toLowerCase();

  if (!query || query.length === 0) {
    onOperationTypeFocus(event);
    return;
  }

  const matches = (operationsCatalog || []).filter(t => {
    const nameMatch = (t.name || '').toLowerCase().includes(query);
    const codeMatch = (t.code || '').toLowerCase().includes(query);
    return nameMatch || codeMatch;
  });

  if (matches.length === 0) {
    dropdown.innerHTML = `
      <div style="padding: 10px 14px; font-size: 12.5px; color: #64748b; background: #f8fafc;">
        <em>Acte personnalisé : "<strong>${escapeHTML(input.value)}</strong>"</em>
      </div>
    `;
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = matches.slice(0, 10).map(t => {
    const costText = t.defaultCost ? `<span style="color: #166534; font-weight: 600; font-size: 11.5px; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">${t.defaultCost} DZD</span>` : '';
    const codeText = t.code ? `<span style="color: #64748b; font-size: 11.5px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${escapeHTML(t.code)}</span>` : '';
    const safeName = escapeHTML(t.name).replace(/'/g, "\\'");
    const safeCode = escapeHTML(t.code || '').replace(/'/g, "\\'");
    return `
      <div class="op-type-item" onclick="selectOperationTypeItem('${safeName}', '${safeCode}', ${t.defaultCost || 0}, ${t.defaultDuration || 30})" style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b;" onmouseenter="this.style.background='#f0f7ff'" onmouseleave="this.style.background='#ffffff'">
        <span style="font-weight: 600;">${escapeHTML(t.name)}</span>
        <div style="display: flex; align-items: center; gap: 6px;">${codeText}${costText}</div>
      </div>
    `;
  }).join('');
  dropdown.style.display = 'block';
}

function selectOperationTypeItem(name, code, cost, duration) {
  const input = document.getElementById('operation-type-select');
  const dropdown = document.getElementById('operation-type-dropdown');
  const costInput = document.getElementById('operation-cost');
  const durInput = document.getElementById('operation-duration');
  const codeInput = document.getElementById('operation-code');

  if (input) input.value = name;
  if (codeInput) codeInput.value = code;
  if (costInput) {
    const numCost = Number(cost);
    costInput.value = !isNaN(numCost) && numCost > 0 ? numCost : (cost || '');
  }
  if (durInput && duration) durInput.value = duration;
  if (dropdown) dropdown.style.display = 'none';
}

// Close Acte dropdown on click outside
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const container = document.getElementById('operation-type-container');
    const dropdown = document.getElementById('operation-type-dropdown');
    if (container && dropdown && !container.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

async function loadEquipmentCheckboxesForOperation(selectedIds = []) {
  const container = document.getElementById('operation-equipment-container');
  if (!container) return;

  try {
    const result = await window.api.equipment.getAll({ limit: 100 });
    availableEquipmentList = result && result.success ? (result.data || []) : [];
    if (!availableEquipmentList.length) {
      container.innerHTML = '<div style="color: #64748b; font-size: 12.5px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">Aucun équipement enregistré (Optionnel).</div>';
      return;
    }

    const renderEquipmentItems = (filter = '') => {
      const items = filter
        ? availableEquipmentList.filter(eq => (eq.name || '').toLowerCase().includes(filter.toLowerCase()) || (eq.brand || '').toLowerCase().includes(filter.toLowerCase()))
        : availableEquipmentList;

      const grid = container.querySelector('.op-eq-grid');
      if (!grid) return;

      if (items.length === 0) {
        grid.innerHTML = `<div style="font-size:13px; color:#94a3b8; font-style:italic; grid-column: 1/-1; padding: 8px 0;">Aucun équipement trouvé.</div>`;
        return;
      }

      grid.innerHTML = items.map(eq => {
        const isChecked = Array.isArray(selectedIds) && selectedIds.includes(eq.id) ? 'checked' : '';
        const sub = escapeHTML(eq.brand || eq.category || 'Général');
        return `
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:500; color:#1e293b; cursor:pointer; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:7px 10px; transition:border-color 0.15s;" onmouseenter="this.style.borderColor='#1677ff'" onmouseleave="this.style.borderColor='#e2e8f0'">
            <input type="checkbox" name="operation_equipment" value="${eq.id}" data-name="${escapeHTML(eq.name)}" ${isChecked} style="width:15px;height:15px;accent-color:#1677ff;flex-shrink:0;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(eq.name)}">
              <span style="display:block;font-weight:600;">${escapeHTML(eq.name)}</span>
              <span style="font-size:11.5px;color:#64748b;">${sub}</span>
            </span>
          </label>
        `;
      }).join('');
    };

    container.innerHTML = `
      <div style="position:relative;margin-bottom:8px;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94a3b8" stroke-width="2" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="form-control op-eq-search" placeholder="Rechercher un équipement..." style="height:34px;padding-left:30px;font-size:13px;border-radius:6px;border:1px solid #d9d9d9;">
      </div>
      <div class="op-eq-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;max-height:160px;overflow-y:auto;padding-right:4px;"></div>
    `;

    renderEquipmentItems();

    const searchEl = container.querySelector('.op-eq-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => renderEquipmentItems(searchEl.value));
    }
  } catch (e) {
    container.innerHTML = '<div style="font-size:13px; color:#ef4444;">Erreur de chargement des équipements.</div>';
  }
}

async function loadInventoryArticlesForOperation() {
  try {
    const result = await window.api.inventory.getAll({ paginated: false });
    availableInventoryArticles = result && result.success ? (result.data || []) : [];
  } catch (e) {
    availableInventoryArticles = [];
  }
}

function addOperationConsumableRow(itemData = null) {
  const container = document.getElementById('operation-consumables-container');
  if (!container) return;

  const emptyNote = document.getElementById('op-consumables-empty-note');
  if (emptyNote) emptyNote.remove();

  const rowIdx = operationConsumablesList.length;
  const rowId = `op-consumable-row-${rowIdx}`;

  const rowDiv = document.createElement('div');
  rowDiv.id = rowId;
  rowDiv.style.cssText = 'display: flex; gap: 12px; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);';

  const optionsHtml = '<option value="">-- Sélectionner un consommable / matériel --</option>' +
    availableInventoryArticles.map(art => {
      const isSel = itemData && itemData.inventoryId === art.id ? 'selected' : '';
      return `<option value="${art.id}" data-unit="${escapeHTML(art.unit || '')}" data-stock="${art.quantity || 0}" ${isSel}>${escapeHTML(art.name)} (Stock: ${art.quantity || 0} ${art.unit || ''})</option>`;
    }).join('');

  rowDiv.innerHTML = `
    <select class="form-control op-consumable-select" style="flex: 1; min-width: 0; height: 38px; font-size: 13.5px; background: #ffffff;" onchange="onOperationConsumableSelect(${rowIdx})">
      ${optionsHtml}
    </select>
    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
      <input type="number" class="form-control op-consumable-qty" value="${itemData ? itemData.quantity : 1}" min="1" step="1" style="width: 100px; height: 38px; text-align: center; font-size: 13.5px; font-weight: 600;" placeholder="Qté">
      <span class="op-consumable-unit" style="min-width: 55px; font-size: 13px; color: #475569; font-weight: 600;">${itemData ? (itemData.unit || '') : ''}</span>
    </div>
    <button type="button" class="btn" onclick="removeOperationConsumableRow(${rowIdx})" style="height: 38px; width: 38px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ef4444; border: 1px solid #fca5a5; background: #fff1f0; border-radius: 6px; flex-shrink: 0; cursor: pointer;" title="Supprimer">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  container.appendChild(rowDiv);
  operationConsumablesList.push(itemData || { inventoryId: '', quantity: 1, unit: '' });
}

function onOperationConsumableSelect(idx) {
  const row = document.getElementById(`op-consumable-row-${idx}`);
  if (!row) return;
  const select = row.querySelector('.op-consumable-select');
  const unitSpan = row.querySelector('.op-consumable-unit');
  const opt = select.selectedOptions[0];
  if (opt && unitSpan) {
    unitSpan.textContent = opt.dataset.unit || '';
  }
}

function removeOperationConsumableRow(idx) {
  const row = document.getElementById(`op-consumable-row-${idx}`);
  if (row) row.remove();
  const container = document.getElementById('operation-consumables-container');
  if (container && container.children.length === 0) {
    container.innerHTML = '<div id="op-consumables-empty-note" style="font-size: 13px; color: #94a3b8; font-style: italic; padding: 6px 0;">Aucun consommable ajouté. Cliquez sur « Ajouter un article » pour déduire des articles du stock.</div>';
  }
}

function renderOperationConsumablesRows() {
  const container = document.getElementById('operation-consumables-container');
  if (!container) return;
  container.innerHTML = '<div id="op-consumables-empty-note" style="font-size: 13px; color: #94a3b8; font-style: italic; padding: 6px 0;">Aucun consommable ajouté. Cliquez sur « Ajouter un article » pour déduire des articles du stock.</div>';
}

// ─── SAVE OPERATION ─────────────────────────────────────────────────────────

async function saveOperation(event) {
  if (event) {
    try { event.preventDefault(); } catch (_) {}
  }

  const id = document.getElementById('operation-id')?.value || null;
  let patientId = document.getElementById('operation-patient-select')?.value;
  const operationTypeInput = document.getElementById('operation-type-select');
  const operationType = (operationTypeInput?.value || '').trim();

  // Fallback: if the hidden patient-select is empty but the search field has text,
  // try to resolve the patient by searching their name.
  if (!patientId) {
    const searchText = (document.getElementById('operation-patient-search')?.value || '').trim();
    if (searchText) {
      if (window.api?.patient?.search) {
        try {
          const res = await window.api.patient.search(searchText);
          const list = res?.success && Array.isArray(res.data) ? res.data : [];
          if (list.length > 0) {
            patientId = String(list[0].id);
            const hiddenEl = document.getElementById('operation-patient-select');
            if (hiddenEl) hiddenEl.value = patientId;
          }
        } catch (_) {}
      }
      if (!patientId && window.api?.patient?.getAll) {
        try {
          const res = await window.api.patient.getAll({ search: searchText, limit: 10 });
          const list = res?.success && Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
          if (list.length > 0) {
            patientId = String(list[0].id);
            const hiddenEl = document.getElementById('operation-patient-select');
            if (hiddenEl) hiddenEl.value = patientId;
          }
        } catch (_) {}
      }
    }
  }

  // Fallback: use global current patient if open
  if (!patientId && typeof window.currentPatientId !== 'undefined' && window.currentPatientId) {
    patientId = String(window.currentPatientId);
    const hiddenEl = document.getElementById('operation-patient-select');
    if (hiddenEl) hiddenEl.value = patientId;
  }

  if (!patientId) {
    showNotification('Veuillez sélectionner un patient dans la liste déroulante', 'warning');
    document.getElementById('operation-patient-search')?.focus();
    return;
  }
  if (!operationType) {
    showNotification('Veuillez spécifier le type d\'opération', 'warning');
    document.getElementById('operation-type-select')?.focus();
    return;
  }

  // Equipment used
  const selectedEquipment = [];
  document.querySelectorAll('input[name="operation_equipment"]:checked').forEach(cb => {
    selectedEquipment.push({ id: cb.value, name: cb.dataset.name });
  });

  // Consumables used
  const consumablesUsed = [];
  document.querySelectorAll('#operation-consumables-container > div').forEach(row => {
    const sel = row.querySelector('.op-consumable-select');
    const qtyInput = row.querySelector('.op-consumable-qty');
    if (sel && sel.value) {
      const opt = sel.selectedOptions[0];
      consumablesUsed.push({
        inventoryId: sel.value,
        itemName: opt ? opt.text : '',
        quantity: parseInt(qtyInput ? qtyInput.value : 1, 10) || 1,
        unit: opt ? opt.dataset.unit : ''
      });
    }
  });

  const docSelect = document.getElementById('operation-practitioner');
  const loggedDoctor = window.currentUser || window.activeUser || {};
  let practitionerId = docSelect && docSelect.value ? docSelect.value : (loggedDoctor.id || null);
  let practitionerName = docSelect && docSelect.value && docSelect.selectedOptions[0] && docSelect.selectedOptions[0].text !== '-- Praticien --'
    ? docSelect.selectedOptions[0].text
    : (loggedDoctor.firstName ? `Dr. ${loggedDoctor.firstName} ${loggedDoctor.lastName || ''}`.trim() : (loggedDoctor.username ? `Dr. ${loggedDoctor.username}` : 'Praticien'));

  const data = {
    patientId,
    operationType,
    operationCode: document.getElementById('operation-code')?.value || null,
    operationDate: document.getElementById('operation-date')?.value || moment().format('YYYY-MM-DD'),
    operationTime: document.getElementById('operation-time')?.value || moment().format('HH:mm'),
    category: getCurrentActiveSpecialty() || 'dentistry',
    practitionerId,
    practitionerName,
    room: document.getElementById('operation-room')?.value || 'Salle d\'intervention',
    status: document.getElementById('operation-status')?.value || 'completed',
    anesthesiaType: document.getElementById('operation-anesthesia')?.value || 'Locale',
    durationMinutes: parseInt(document.getElementById('operation-duration')?.value, 10) || 30,
    clinicalNotes: document.getElementById('operation-notes')?.value || '',
    postOpInstructions: document.getElementById('operation-instructions')?.value || '',
    cost: parseFloat(document.getElementById('operation-cost')?.value) || 0,
    createPayment: document.getElementById('operation-create-payment')?.checked || false,
    paymentMethod: document.getElementById('operation-payment-method')?.value || 'Espèces',
    equipmentUsed: selectedEquipment,
    consumablesUsed
  };

  // Vérification de la disponibilité du stock dans Inventaire avant validation
  if (consumablesUsed.length > 0 && window.api.operation?.checkStockAvailability) {
    try {
      const stockCheck = await window.api.operation.checkStockAvailability(consumablesUsed);
      if (stockCheck && stockCheck.success && !stockCheck.isAvailable && stockCheck.missing?.length > 0) {
        const missingDetails = stockCheck.missing.map(m => `• ${m.name} (demandé: ${m.requested}, en stock: ${m.available})`).join('\n');
        const proceed = confirm(`⚠️ Attention : Stock insuffisant dans l'inventaire pour :\n${missingDetails}\n\nVoulez-vous tout de même valider l'opération et décrémenter le stock ?`);
        if (!proceed) return;
      }
    } catch (stockErr) {
      console.warn('Stock availability check notice:', stockErr);
    }
  }

  try {
    let result;
    if (id) {
      result = await window.api.operation.update(id, data);
    } else {
      result = await window.api.operation.create(data);
    }

    if (result && result.success) {
      showNotification(id ? 'Opération mise à jour avec succès' : 'Opération enregistrée avec succès', 'success');
      closeModal('modal-operation');
      await loadOperations();
      await loadOperationsStats();

      // If current patient details is open, refresh medical timeline
      if (typeof currentPatientId !== 'undefined' && String(currentPatientId) === String(patientId)) {
        if (typeof loadPatientConsultations === 'function') {
          loadPatientConsultations(patientId);
        }
      }
    } else {
      showNotification(result?.error || 'Erreur lors de l\'enregistrement de l\'opération', 'error');
    }
  } catch (error) {
    console.error('Error saving operation:', error);
    showNotification('Erreur inattendue: ' + error.message, 'error');
  }
}

// ─── EDIT & DELETE ──────────────────────────────────────────────────────────

async function editOperation(id) {
  try {
    let op = null;
    try {
      const result = await window.api.operation.getById(id);
      if (result && result.success && result.data) {
        op = result.data;
      }
    } catch (apiErr) {
      console.warn('operation.getById IPC notice, falling back to cache:', apiErr);
    }

    if (!op) {
      if (typeof patientRecordsCache !== 'undefined' && Array.isArray(patientRecordsCache.operations)) {
        op = patientRecordsCache.operations.find(o => String(o.id) === String(id));
      }
      if (!op && typeof allOperations !== 'undefined' && Array.isArray(allOperations)) {
        op = allOperations.find(o => String(o.id) === String(id));
      }
    }

    if (!op) {
      showNotification('Opération introuvable', 'error');
      return;
    }
    editingOperationId = op.id;

    const titleEl = document.getElementById('operation-modal-title');
    if (titleEl) {
      titleEl.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1677ff" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Modifier l\'Opération / Intervention</span>';
    }

    document.getElementById('operation-id').value = op.id;
    await loadPatientsSelectForOperation(op.patientId);
    populateOperationTypeSelect(op.operationType);

    document.getElementById('operation-code').value = op.operationCode || '';
    document.getElementById('operation-date').value = op.operationDate || '';
    document.getElementById('operation-time').value = op.operationTime || '';
    document.getElementById('operation-status').value = op.status || 'completed';
    document.getElementById('operation-anesthesia').value = op.anesthesiaType || 'Locale';
    document.getElementById('operation-duration').value = op.durationMinutes || 30;
    document.getElementById('operation-cost').value = op.cost || '';
    document.getElementById('operation-room').value = op.room || '';
    document.getElementById('operation-notes').value = op.clinicalNotes || '';
    document.getElementById('operation-instructions').value = op.postOpInstructions || '';

    // Hide payment creation for existing
    const paySec = document.getElementById('operation-payment-section');
    if (paySec) paySec.style.display = 'none';

    // Equipment checkboxes
    let eqIds = [];
    if (op.equipmentUsed) {
      try {
        const parsed = typeof op.equipmentUsed === 'string' ? JSON.parse(op.equipmentUsed) : op.equipmentUsed;
        eqIds = Array.isArray(parsed) ? parsed.map(x => typeof x === 'string' ? x : x.id) : [];
      } catch (e) {}
    }
    await loadEquipmentCheckboxesForOperation(eqIds);

    // Consumables rows
    await loadInventoryArticlesForOperation();
    renderOperationConsumablesRows();
    if (op.consumablesUsed) {
      try {
        const parsed = typeof op.consumablesUsed === 'string' ? JSON.parse(op.consumablesUsed) : op.consumablesUsed;
        if (Array.isArray(parsed)) {
          parsed.forEach(item => addOperationConsumableRow(item));
        }
      } catch (e) {}
    }

    showModal('modal-operation');
  } catch (e) {
    console.error('Error editing operation:', e);
    showNotification('Erreur lors du chargement de l\'opération', 'error');
  }
}

async function deleteOperation(id) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette opération ?')) return;

  try {
    const result = await window.api.operation.delete(id);
    if (result && result.success) {
      showNotification('Opération supprimée', 'success');
      await loadOperations();
      await loadOperationsStats();
      if (typeof currentPatientId !== 'undefined' && currentPatientId) {
        if (typeof loadPatientConsultations === 'function') loadPatientConsultations(currentPatientId);
      }
    } else {
      showNotification(result?.error || 'Erreur lors de la suppression', 'error');
    }
  } catch (e) {
    showNotification('Erreur: ' + e.message, 'error');
  }
}

// ─── RAPPORT OPÉRATOIRE / PRINT ─────────────────────────────────────────────

let currentViewingOperation = null;
let currentViewingMode = 'report';

function switchOperationViewMode(mode) {
  currentViewingMode = mode === 'invoice' ? 'invoice' : 'report';
  const reportTabBtn = document.getElementById('op-view-tab-report');
  const invoiceTabBtn = document.getElementById('op-view-tab-invoice');

  if (reportTabBtn && invoiceTabBtn) {
    if (currentViewingMode === 'report') {
      reportTabBtn.className = 'btn btn-primary btn-small';
      invoiceTabBtn.className = 'btn btn-secondary btn-small';
    } else {
      reportTabBtn.className = 'btn btn-secondary btn-small';
      invoiceTabBtn.className = 'btn btn-primary btn-small';
    }
  }

  const modalBody = document.getElementById('operation-view-modal-body');
  if (modalBody && currentViewingOperation) {
    modalBody.innerHTML = currentViewingMode === 'invoice'
      ? renderOperationInvoiceHtml(currentViewingOperation)
      : renderOperationReportHtml(currentViewingOperation);
  }
}

function getClinicHeaderData() {
  const cfg = window._packageConfig || {};
  return {
    cabinetName: cfg.clinicName || cfg.cabinetName || 'CABINET MÉDICAL & CHIRURGICAL',
    specialty: (cfg.specialtyLabel || 'Chirurgie & Soins Spécialisés').toUpperCase(),
    address: cfg.address || cfg.clinicAddress || 'Cabinet Médical',
    phone: cfg.phone || cfg.clinicPhone || '',
    email: cfg.email || cfg.clinicEmail || ''
  };
}

function getSavedDocFormatPreference(docType, defaultFormat = 'A4') {
  try {
    const saved = JSON.parse(localStorage.getItem('medcareso_doc_formats') || '{}');
    if (saved && saved[docType]) return saved[docType];
  } catch (_) {}
  return defaultFormat;
}

function renderOperationReportHtml(op) {
  const clinic = getClinicHeaderData();
  const patientName = op.patientFirstName || op.patientLastName
    ? `${op.patientLastName || ''} ${op.patientFirstName || ''}`.trim()
    : 'Patient';
  const doctorName = op.practitionerName || (window.currentUser ? `Dr. ${window.currentUser.firstName || ''} ${window.currentUser.lastName || ''}`.trim() : 'Dr. Praticien');
  const opDate = formatOperationDate(op.operationDate);
  const ageStr = op.patientBirthDate ? `${new Date().getFullYear() - new Date(op.patientBirthDate).getFullYear()} ans` : '—';

  let equipmentList = '';
  if (op.equipmentUsed) {
    try {
      const parsed = JSON.parse(op.equipmentUsed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        equipmentList = parsed.map(e => e.name || e).join(', ');
      }
    } catch (_) {}
  }

  let consumablesList = '';
  if (op.consumablesUsed) {
    try {
      const parsed = JSON.parse(op.consumablesUsed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        consumablesList = parsed.map(c => `${c.itemName} (qté: ${c.quantity} ${c.unit || ''})`).join(', ');
      }
    } catch (_) {}
  }

  return `
    <div class="printable-medical-doc" style="background:#ffffff; color:#000000; font-family:'Times New Roman', Times, serif, Arial; padding: 28px 32px; line-height: 1.5; font-size: 13px; box-sizing: border-box;">
      
      <!-- En-tête Cabinet -->
      <div style="border-bottom: 2px solid #000000; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 17px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHTML(clinic.cabinetName)}</div>
          <div style="font-size: 12.5px; font-weight: 600; margin-top: 2px;">${escapeHTML(clinic.specialty)}</div>
          <div style="font-size: 11.5px; margin-top: 2px; color: #222;">${escapeHTML(clinic.address)} ${clinic.phone ? `• Tél : ${escapeHTML(clinic.phone)}` : ''}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14.5px; font-weight: bold;">${escapeHTML(doctorName)}</div>
          <div style="font-size: 11.5px; margin-top: 2px;">Date : <strong>${escapeHTML(opDate)}</strong> ${op.operationTime ? `à ${escapeHTML(op.operationTime)}` : ''}</div>
          <div style="font-size: 11px; margin-top: 2px; font-family: monospace;">RÉF : ${escapeHTML(op.operationCode || `CR-${(op.id || '').substring(0, 8).toUpperCase()}`)}</div>
        </div>
      </div>

      <!-- Titre du Document -->
      <div style="text-align: center; margin: 14px 0 18px 0;">
        <h2 style="margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 1.5px; text-decoration: underline; text-transform: uppercase;">
          COMPTE-RENDU OPÉRATOIRE
        </h2>
      </div>

      <!-- Affichage en Deux Colonnes : Acte & Intervention / Patient -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
        <!-- Colonne 1 : Détails de l'Acte & Intervention -->
        <div style="border: 1px solid #000000; padding: 10px 14px;">
          <div style="font-weight: bold; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px;">
            Détails de l'Intervention
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12.5px;">
            <div><strong>Acte :</strong> ${escapeHTML(op.operationType)} ${op.operationCode ? `(${escapeHTML(op.operationCode)})` : ''}</div>
            <div><strong>Chirurgien :</strong> ${escapeHTML(doctorName)}</div>
            <div><strong>Date &amp; Heure :</strong> ${escapeHTML(opDate)} ${op.operationTime ? `à ${escapeHTML(op.operationTime)}` : ''}</div>
            <div><strong>Lieu / Salle :</strong> ${escapeHTML(op.room || "Salle d'intervention")}</div>
            <div><strong>Anesthésie :</strong> ${escapeHTML(op.anesthesiaType || 'Locale')}</div>
            <div><strong>Durée :</strong> ${op.durationMinutes || 30} minutes</div>
          </div>
        </div>

        <!-- Colonne 2 : Identification du Patient -->
        <div style="border: 1px solid #000000; padding: 10px 14px;">
          <div style="font-weight: bold; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px;">
            Identification du Patient
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12.5px;">
            <div><strong>Patient :</strong> ${escapeHTML(patientName)}</div>
            <div><strong>Sexe / Âge :</strong> ${escapeHTML(op.patientGender || '—')} / ${escapeHTML(ageStr)}</div>
            <div><strong>Téléphone :</strong> ${escapeHTML(op.patientPhone || '—')}</div>
            <div><strong>Dossier N° :</strong> ${escapeHTML((op.patientId || '').substring(0, 10).toUpperCase())}</div>
            <div><strong>Statut intervention :</strong> ${escapeHTML(op.status === 'completed' ? 'Réalisée' : op.status)}</div>
          </div>
        </div>
      </div>

      <!-- Protocole Opératoire & Observations Cliniques -->
      <div style="margin-bottom: 16px;">
        <div style="font-weight: bold; font-size: 13px; text-transform: uppercase; border-bottom: 1px solid #000000; padding-bottom: 2px; margin-bottom: 6px;">
          Protocole Opératoire &amp; Observations Cliniques
        </div>
        <div style="padding: 4px 6px; white-space: pre-wrap; line-height: 1.55; font-size: 12.5px; text-align: justify;">
          ${escapeHTML(op.clinicalNotes || 'Intervention réalisée selon les règles de l\'art et le protocole opératoire standard sans complication immédiate.')}
        </div>
      </div>

      <!-- Deux Colonnes : Consignes Post-Op & Dispositifs Utilisés -->
      <div style="display: grid; grid-template-columns: ${op.postOpInstructions && (equipmentList || consumablesList) ? '1fr 1fr' : '1fr'}; gap: 14px; margin-bottom: 16px;">
        ${op.postOpInstructions ? `
        <div style="border: 1px solid #333; padding: 10px 12px;">
          <div style="font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #666; padding-bottom: 2px; margin-bottom: 6px;">
            Consignes &amp; Prescriptions Post-Opératoires
          </div>
          <div style="white-space: pre-wrap; font-size: 12px; line-height: 1.45;">
            ${escapeHTML(op.postOpInstructions)}
          </div>
        </div>` : ''}

        ${equipmentList || consumablesList ? `
        <div style="border: 1px solid #333; padding: 10px 12px;">
          <div style="font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #666; padding-bottom: 2px; margin-bottom: 6px;">
            Matériel &amp; Dispositifs Médicaux
          </div>
          <div style="font-size: 12px; line-height: 1.45;">
            ${equipmentList ? `<div>• <strong>Équipements :</strong> ${escapeHTML(equipmentList)}</div>` : ''}
            ${consumablesList ? `<div style="margin-top: 3px;">• <strong>Consommables :</strong> ${escapeHTML(consumablesList)}</div>` : ''}
          </div>
        </div>` : ''}
      </div>

      <!-- Signature et Cachet -->
      <div style="margin-top: 28px; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid;">
        <div style="font-size: 11px; color: #444;">
          <div>Document médical confidentiel établi le ${escapeHTML(opDate)}.</div>
          <div style="margin-top: 4px;">${typeof buildDocumentBarcodeHtml === 'function' ? buildDocumentBarcodeHtml(op.operationCode || `OP-${(op.id || '').substring(0, 10).toUpperCase()}`) : ''}</div>
        </div>
        <div style="text-align: center; width: 220px;">
          <div style="font-weight: bold; font-size: 12.5px; margin-bottom: 42px;">Signature et Cachet du Praticien</div>
          <div style="font-size: 12.5px; font-weight: 600; border-top: 1px dotted #000000; padding-top: 3px;">${escapeHTML(doctorName)}</div>
        </div>
      </div>

    </div>
  `;
}

function renderOperationInvoiceHtml(op) {
  const clinic = getClinicHeaderData();
  const patientName = op.patientFirstName || op.patientLastName
    ? `${op.patientLastName || ''} ${op.patientFirstName || ''}`.trim()
    : 'Patient';
  const doctorName = op.practitionerName || (window.currentUser ? `Dr. ${window.currentUser.firstName || ''} ${window.currentUser.lastName || ''}`.trim() : 'Dr. Praticien');
  const opDate = formatOperationDate(op.operationDate);
  const cost = Number(op.cost || 0);
  const isPaid = op.paymentStatus === 'paid';
  const paymentMethod = op.paymentMethod || 'Espèces';

  return `
    <div class="printable-invoice-doc" style="background:#ffffff; color:#000000; font-family:'Times New Roman', Times, serif, Arial; padding: 28px 32px; line-height: 1.5; font-size: 13px; box-sizing: border-box;">
      
      <!-- En-tête Cabinet -->
      <div style="border-bottom: 2px solid #000000; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 17px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHTML(clinic.cabinetName)}</div>
          <div style="font-size: 12.5px; font-weight: 600; margin-top: 2px;">${escapeHTML(clinic.specialty)}</div>
          <div style="font-size: 11.5px; margin-top: 2px; color: #222;">${escapeHTML(clinic.address)} ${clinic.phone ? `• Tél : ${escapeHTML(clinic.phone)}` : ''}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14.5px; font-weight: bold;">${escapeHTML(doctorName)}</div>
          <div style="font-size: 11.5px; margin-top: 2px;">Date d'émission : <strong>${escapeHTML(opDate)}</strong></div>
          <div style="font-size: 11.5px; margin-top: 2px; font-family: monospace; font-weight: bold;">FACTURE N° : FACT-${escapeHTML((op.id || '').substring(0, 8).toUpperCase())}</div>
        </div>
      </div>

      <!-- Titre de la Facture -->
      <div style="text-align: center; margin: 14px 0 18px 0;">
        <h2 style="margin: 0; font-size: 17.5px; font-weight: bold; letter-spacing: 1px; text-decoration: underline; text-transform: uppercase;">
          FACTURE D'INTERVENTION CHIRURGICALE &amp; TECHNIQUE
        </h2>
      </div>

      <!-- Deux Colonnes : Détails Prestation / Facturation Patient -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px;">
        <div style="border: 1px solid #000000; padding: 10px 14px;">
          <div style="font-weight: bold; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px;">
            Prestation / Acte Facturé
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12.5px;">
            <div><strong>Acte :</strong> ${escapeHTML(op.operationType)}</div>
            <div><strong>Code :</strong> ${escapeHTML(op.operationCode || '—')}</div>
            <div><strong>Praticien :</strong> ${escapeHTML(doctorName)}</div>
            <div><strong>Date de l'acte :</strong> ${escapeHTML(opDate)}</div>
          </div>
        </div>

        <div style="border: 1px solid #000000; padding: 10px 14px;">
          <div style="font-weight: bold; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px;">
            Destinataire (Patient)
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12.5px;">
            <div><strong>Nom &amp; Prénom :</strong> ${escapeHTML(patientName)}</div>
            <div><strong>Téléphone :</strong> ${escapeHTML(op.patientPhone || '—')}</div>
            <div><strong>Réf. Dossier :</strong> ${escapeHTML((op.patientId || '').substring(0, 10).toUpperCase())}</div>
            <div><strong>Mode paiement :</strong> ${escapeHTML(paymentMethod)}</div>
          </div>
        </div>
      </div>

      <!-- Tableau des Actes & Honoraires -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <thead>
          <tr style="border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000;">
            <th style="padding: 8px 6px; text-align: left; width: 55%;">Désignation de la prestation / Acte</th>
            <th style="padding: 8px 6px; text-align: center; width: 15%;">Date</th>
            <th style="padding: 8px 6px; text-align: center; width: 15%;">Quantité</th>
            <th style="padding: 8px 6px; text-align: right; width: 15%;">Montant (DZD)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #000000;">
            <td style="padding: 10px 6px;">
              <strong>${escapeHTML(op.operationType)}</strong>
              ${op.operationCode ? `<div style="font-size: 11.5px; color: #333;">Code : ${escapeHTML(op.operationCode)}</div>` : ''}
              ${op.anesthesiaType ? `<div style="font-size: 11px; color: #444;">Anesthésie : ${escapeHTML(op.anesthesiaType)}</div>` : ''}
            </td>
            <td style="padding: 10px 6px; text-align: center;">${escapeHTML(opDate)}</td>
            <td style="padding: 10px 6px; text-align: center;">1</td>
            <td style="padding: 10px 6px; text-align: right; font-weight: bold;">${formatOperationCurrency(cost)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Récapitulatif Règlement -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div style="border: 1px solid #000000; padding: 8px 12px; width: 50%; font-size: 12px;">
          <div><strong>Mode de règlement :</strong> ${escapeHTML(paymentMethod)}</div>
          <div style="margin-top: 3px;"><strong>Statut :</strong> ${isPaid ? 'RÉGLÉ (Acquitté en totalité)' : 'NON RÉGLÉ / EN ATTENTE'}</div>
          <div style="margin-top: 3px; font-style: italic; font-size: 11px;">Document faisant foi de quittance de paiement pour les actes indiqués.</div>
        </div>
        <div style="width: 42%;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-bottom: 1px solid #666;">
              <td style="padding: 5px 0;">Total Honoraires :</td>
              <td style="padding: 5px 0; text-align: right; font-weight: bold;">${formatOperationCurrency(cost)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #666;">
              <td style="padding: 5px 0;">Montant réglé :</td>
              <td style="padding: 5px 0; text-align: right; font-weight: bold;">${formatOperationCurrency(isPaid ? cost : 0)}</td>
            </tr>
            <tr style="border-bottom: 2px solid #000000; font-size: 14px;">
              <td style="padding: 7px 0; font-weight: bold;">Solde à payer :</td>
              <td style="padding: 7px 0; text-align: right; font-weight: bold;">${formatOperationCurrency(isPaid ? 0 : cost)}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Signature et Cachet pour Acquit -->
      <div style="margin-top: 28px; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-start; page-break-inside: avoid;">
        <div style="font-size: 11px; color: #444;">
          <div>Facture certifiée sincère et conforme.</div>
          <div style="margin-top: 4px;">${typeof buildDocumentBarcodeHtml === 'function' ? buildDocumentBarcodeHtml(`FACT-${(op.id || '').substring(0, 10).toUpperCase()}`) : ''}</div>
        </div>
        <div style="text-align: center; width: 220px;">
          <div style="font-weight: bold; font-size: 12.5px; margin-bottom: 42px;">Pour Acquit — Cachet et Signature</div>
          <div style="font-size: 12.5px; font-weight: 600; border-top: 1px dotted #000000; padding-top: 3px;">${escapeHTML(doctorName)}</div>
        </div>
      </div>

    </div>
  `;
}

async function viewOperationReport(id) {
  try {
    let op = null;
    try {
      const result = await window.api.operation.getById(id);
      if (result && result.success && result.data) {
        op = result.data;
      }
    } catch (apiErr) {
      console.warn('operation.getById IPC notice, falling back to cache:', apiErr);
    }

    if (!op) {
      if (typeof patientRecordsCache !== 'undefined' && Array.isArray(patientRecordsCache.operations)) {
        op = patientRecordsCache.operations.find(o => String(o.id) === String(id));
      }
      if (!op && typeof operationsData !== 'undefined' && Array.isArray(operationsData)) {
        op = operationsData.find(o => String(o.id) === String(id));
      }
    }

    if (!op) {
      showNotification('Opération introuvable', 'error');
      return;
    }

    currentViewingOperation = op;
    currentViewingMode = 'report';
    switchOperationViewMode('report');
    showModal('modal-operation-view');
  } catch (e) {
    console.error('Error viewing operation report:', e);
    showNotification('Erreur: ' + e.message, 'error');
  }
}

function printDocumentContent(htmlContent, title, docType = 'operation') {
  const paperFormat = getSavedDocFormatPreference(docType, docType === 'operation_facture' ? 'A5' : 'A4');
  const isA5 = paperFormat === 'A5';

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>${escapeHTML(title)}</title>
        <style>
          @page {
            size: ${isA5 ? 'A5 landscape' : 'A4 portrait'};
            margin: ${isA5 ? '10mm 10mm 10mm 10mm' : '15mm 15mm 15mm 15mm'};
          }
          * {
            box-sizing: border-box;
            background: transparent !important;
            color: #000000 !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: "Times New Roman", Times, Georgia, serif;
            color: #000000;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .printable-medical-doc, .printable-invoice-doc {
            padding: 0 !important;
            width: 100% !important;
          }
          table {
            border-collapse: collapse;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 250);
          };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function printCurrentOperationReport() {
  if (!currentViewingOperation) return;
  const html = renderOperationReportHtml(currentViewingOperation);
  printDocumentContent(html, 'Compte-Rendu Opératoire', 'operation');
}

function printCurrentOperationInvoice() {
  if (!currentViewingOperation) return;
  const html = renderOperationInvoiceHtml(currentViewingOperation);
  printDocumentContent(html, 'Facture Intervention', 'operation_facture');
}

// ─── OPERATION PAYMENT MODAL & ACTIONS ──────────────────────────────────────────

async function openOperationPaymentModal(operationId) {
  let op = operationsData.find(o => String(o.id) === String(operationId));
  if (!op) {
    const res = await window.api.operation.getById(operationId);
    if (res && res.success) op = res.data;
  }
  if (!op) {
    showNotification('Opération introuvable', 'error');
    return;
  }

  const patientName = op.patientFirstName || op.patientLastName
    ? `${op.patientLastName || ''} ${op.patientFirstName || ''}`.trim()
    : 'Patient';
  const totalCost = Number(op.cost) || 0;
  const alreadyPaid = Number(op.paidAmount) || 0;
  const remaining = Math.max(0, totalCost - alreadyPaid);

  const modalHtml = `
    <div id="modal-operation-payment" class="inventory-detail-overlay" style="position: fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index: 10050; display: flex; align-items: center; justify-content: center; padding: 16px;">
      <div style="background: #ffffff; border-radius: 12px; max-width: 480px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden;">
        <div style="padding: 16px 20px; background: #f0fdf4; border-bottom: 1px solid #bbf7d0; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #166534; display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#166534" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            ${alreadyPaid > 0 ? 'Ajouter un Versement / Solder' : 'Encaisser l\'opération'}
          </h3>
          <button type="button" onclick="document.getElementById('modal-operation-payment').remove()" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #64748b; line-height: 1;">&times;</button>
        </div>
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div>
              <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Patient</span>
              <div style="font-size: 13.5px; font-weight: 700; color: #0f172a;">${escapeHTML(patientName)}</div>
            </div>
            <div>
              <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Acte</span>
              <div style="font-size: 13px; font-weight: 600; color: #334155;">${escapeHTML(op.operationType)}</div>
            </div>
          </div>

          <!-- Recap financier -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center;">
            <div style="background: #f1f5f9; padding: 8px; border-radius: 6px;">
              <div style="font-size: 11px; color: #64748b;">Coût Total</div>
              <div style="font-size: 14px; font-weight: 700; color: #1e293b;">${formatOperationCurrency(totalCost)}</div>
            </div>
            <div style="background: #fef3c7; padding: 8px; border-radius: 6px;">
              <div style="font-size: 11px; color: #92400e;">Déjà Versé</div>
              <div style="font-size: 14px; font-weight: 700; color: #b45309;">${formatOperationCurrency(alreadyPaid)}</div>
            </div>
            <div style="background: #fee2e2; padding: 8px; border-radius: 6px;">
              <div style="font-size: 11px; color: #991b1b;">Reste à Payer</div>
              <div style="font-size: 14px; font-weight: 700; color: #dc2626;">${formatOperationCurrency(remaining)}</div>
            </div>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 4px; display: flex; justify-content: space-between;">
              <span>Montant du versement (DA)</span>
              ${remaining > 0 ? `<a href="#" onclick="event.preventDefault(); document.getElementById('op-pay-amount').value = ${remaining};" style="font-size: 11.5px; color: #1677ff; text-decoration: none;">Tout solder (${remaining} DA)</a>` : ''}
            </label>
            <input type="number" id="op-pay-amount" class="form-control" value="${remaining > 0 ? remaining : totalCost}" min="1" max="${remaining > 0 ? remaining : totalCost}" step="100" style="height: 38px; font-size: 16px; font-weight: 700; color: #15803d;">
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 4px; display: block;">Mode de règlement</label>
            <select id="op-pay-method" class="form-control" style="height: 38px;">
              <option value="Espèces">Espèces</option>
              <option value="Carte Bancaire">Carte Bancaire / CIB</option>
              <option value="Chèque">Chèque</option>
              <option value="Virement">Virement</option>
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 600; font-size: 13px; color: #1e293b; margin-bottom: 4px; display: block;">Date d'encaissement (Comptabilisée dans les stats du jour)</label>
            <input type="date" id="op-pay-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}" style="height: 38px;">
          </div>
        </div>
        <div style="padding: 14px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-operation-payment').remove()">Annuler</button>
          <button type="button" class="btn btn-primary" onclick="submitOperationPayment('${op.id}')" style="background: #10b981; border-color: #059669; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
            <span>Valider le versement</span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-operation-payment')?.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}
window.openOperationPaymentModal = openOperationPaymentModal;

async function submitOperationPayment(operationId) {
  const amount = parseFloat(document.getElementById('op-pay-amount')?.value) || 0;
  const paymentMethod = document.getElementById('op-pay-method')?.value || 'Espèces';
  const paymentDate = document.getElementById('op-pay-date')?.value || new Date().toISOString().slice(0, 10);

  if (amount <= 0) {
    showNotification('Veuillez saisir un montant valide', 'warning');
    return;
  }

  try {
    const result = await window.api.operation.recordPayment({
      operationId,
      amount,
      paymentMethod,
      paymentDate
    });

    if (result && result.success) {
      document.getElementById('modal-operation-payment')?.remove();
      showNotification('Paiement de l\'opération enregistré avec succès', 'success');
      await loadOperations();
      await loadOperationsStats();
      if (typeof loadPatientPayments === 'function' && typeof currentPatientId !== 'undefined') {
        loadPatientPayments(currentPatientId);
      }
      if (typeof loadPayments === 'function') {
        loadPayments();
      }
    } else {
      showNotification(result?.error || 'Erreur lors de l\'encaissement', 'error');
    }
  } catch (err) {
    console.error('Erreur encaissement opération:', err);
    showNotification('Erreur inattendue', 'error');
  }
}
window.submitOperationPayment = submitOperationPayment;

// ─── EXPOSE GLOBALS ─────────────────────────────────────────────────────────

window.initOperations = initOperations;
window.loadOperations = loadOperations;
window.filterOperations = filterOperations;
window.resetOperationsFilters = resetOperationsFilters;
window.openNewOperationModal = openNewOperationModal;
window.onOperationTypeChange = onOperationTypeChange;
window.onOperationTypeInput = onOperationTypeInput;
window.onOperationTypeFocus = onOperationTypeFocus;
window.selectOperationTypeItem = selectOperationTypeItem;
window.addOperationConsumableRow = addOperationConsumableRow;
window.removeOperationConsumableRow = removeOperationConsumableRow;
window.onOperationConsumableChange = onOperationConsumableChange;
window.saveOperation = saveOperation;
window.editOperation = editOperation;
window.deleteOperation = deleteOperation;
window.viewOperationReport = viewOperationReport;
window.switchOperationViewMode = switchOperationViewMode;
window.printCurrentOperationReport = printCurrentOperationReport;
window.printCurrentOperationInvoice = printCurrentOperationInvoice;
window.openOperationPaymentModal = openOperationPaymentModal;
window.submitOperationPayment = submitOperationPayment;

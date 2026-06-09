// ==================== PAYMENT MANAGEMENT ====================

function formatMoneyDZD(value) {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD'
  }).format(Number(value) || 0);
}

function formatReferenceCode(label, id, dateValue) {
  const rawId = String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (rawId.slice(-4) || '0000').padStart(4, '0');
  const parsedDate = dateValue ? new Date(dateValue) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const ymd = `${safeDate.getFullYear()}${String(safeDate.getMonth() + 1).padStart(2, '0')}${String(safeDate.getDate()).padStart(2, '0')}`;
  return `${label} N°${ymd}-${suffix}`;
}

const PAYMENT_SERVICE_CATALOG = [
  { value: 'consultation', label: 'Consultation médicale', defaultAmount: 2000 },
  { value: 'ecg', label: 'ECG de repos', defaultAmount: 0 },
  { value: 'ecgstress', label: 'ECG d\'effort', defaultAmount: 0 },
  { value: 'echo', label: 'Échographie', defaultAmount: 3000 },
  { value: 'holtermapa', label: 'Holter / MAPA', defaultAmount: 0 },
  { value: 'tecartherapie', label: 'Tecarthérapie', defaultAmount: 0 },
  { value: 'ondesdechoc', label: 'Ondes de choc', defaultAmount: 0 },
  { value: 'mesotherapie', label: 'Mésothérapie', defaultAmount: 0 },
  { value: 'lasertherapie', label: 'Laser thérapie', defaultAmount: 0 },
  { value: 'dryneedling', label: 'Dry needling', defaultAmount: 0 },
  { value: 'osteopathie', label: 'Ostéopathie', defaultAmount: 0 },
  { value: 'reduction', label: 'Réduction', defaultAmount: 0 },
  { value: 'kine', label: 'Séance kiné', defaultAmount: 1500 },
  { value: 'infiltration', label: 'Infiltration', defaultAmount: 2500 },
  { value: 'electrotherapie', label: 'Électrothérapie', defaultAmount: 1000 },
  { value: 'massage', label: 'Massage', defaultAmount: 1500 },
  { value: 'other', label: 'Autre acte', defaultAmount: 0 }
];

const PAYMENTS_PAGE_SIZE = 8;
const paymentListState = {
  page: 1,
  pageSize: PAYMENTS_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  filters: {},
  isLoading: false
};

const pendingPaymentRequestsCache = {
  items: [],
  loadedAt: 0,
  ttlMs: 10000
};

function setPendingPaymentRequestsCache(items) {
  pendingPaymentRequestsCache.items = Array.isArray(items) ? items : [];
  pendingPaymentRequestsCache.loadedAt = Date.now();
}

async function getPendingPaymentRequestsCached(force = false) {
  const canSeePendingRequests = currentUserRole === 'assistant' || currentUserRole === 'doctor' || currentUserRole === 'dentist';
  if (!canSeePendingRequests) {
    return [];
  }

  if (!force && pendingPaymentRequestsCache.loadedAt && (Date.now() - pendingPaymentRequestsCache.loadedAt) < pendingPaymentRequestsCache.ttlMs) {
    return pendingPaymentRequestsCache.items;
  }

  const requests = await window.api.paymentRequest.getPending();
  setPendingPaymentRequestsCache(requests);
  return pendingPaymentRequestsCache.items;
}

function updatePaymentPaginationState(pagination = null) {
  if (!pagination) {
    paymentListState.page = 1;
    paymentListState.total = 0;
    paymentListState.totalPages = 1;
    paymentListState.pageSize = PAYMENTS_PAGE_SIZE;
    return;
  }

  paymentListState.page = Number(pagination.page || 1);
  paymentListState.pageSize = Number(pagination.pageSize || PAYMENTS_PAGE_SIZE);
  paymentListState.total = Number(pagination.total || 0);
  paymentListState.totalPages = Math.max(1, Number(pagination.totalPages || 1));
}

function renderPaymentsPagination() {
  let container = document.getElementById('payments-pagination');
  if (!container) {
    const sectionCard = document.getElementById('payments-tbody')?.closest('.card') || document.querySelector('#payments .card');
    if (!sectionCard) return;
    container = document.createElement('div');
    container.id = 'payments-pagination';
    container.className = 'patients-pagination';
    container.style.display = 'none';
    container.style.padding = '16px 20px 20px';
    sectionCard.appendChild(container);
  }

  if (!container) return;

  if ((paymentListState.total || 0) <= paymentListState.pageSize) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const start = paymentListState.total > 0
    ? ((paymentListState.page - 1) * paymentListState.pageSize) + 1
    : 0;
  const end = paymentListState.total > 0
    ? Math.min(paymentListState.page * paymentListState.pageSize, paymentListState.total)
    : 0;
  const firstPage = Math.max(1, paymentListState.page - 2);
  const lastPage = Math.min(paymentListState.totalPages, paymentListState.page + 2);
  const pageButtons = [];

  for (let page = firstPage; page <= lastPage; page += 1) {
    pageButtons.push(`
      <button class="btn btn-small ${page === paymentListState.page ? 'btn-primary' : 'btn-secondary'}" ${page === paymentListState.page ? 'disabled' : ''} onclick="goToPaymentsPage(${page})">${page}</button>
    `);
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="patients-pagination-info">Affichage ${start}-${end} sur ${paymentListState.total} paiements</div>
    <div class="patients-pagination-actions">
      <button class="btn btn-small btn-secondary" ${paymentListState.page <= 1 ? 'disabled' : ''} onclick="goToPaymentsPage(1)">Debut</button>
      <button class="btn btn-small btn-secondary" ${paymentListState.page <= 1 ? 'disabled' : ''} onclick="changePaymentsPage(-1)">Precedent</button>
      ${pageButtons.join('')}
      <span class="patients-pagination-info">Page ${paymentListState.page} / ${paymentListState.totalPages}</span>
      <button class="btn btn-small btn-secondary" ${paymentListState.page >= paymentListState.totalPages ? 'disabled' : ''} onclick="changePaymentsPage(1)">Suivant</button>
      <button class="btn btn-small btn-secondary" ${paymentListState.page >= paymentListState.totalPages ? 'disabled' : ''} onclick="goToPaymentsPage(${paymentListState.totalPages})">Fin</button>
    </div>
  `;
}

function getPaymentFiltersFromInputs() {
  return {
    paymentMethod: document.getElementById('payment-filter-method')?.value || '',
    startDate: document.getElementById('payment-filter-start')?.value || '',
    endDate: document.getElementById('payment-filter-end')?.value || ''
  };
}

function getPaymentRequestFilters() {
  const isAssistant = typeof currentUserRole !== 'undefined' && currentUserRole === 'assistant';
  const inputFilters = paymentListState.filters || {};

  if (!isAssistant) {
    return inputFilters;
  }

  const today = new Date().toISOString().split('T')[0];
  return {
    ...inputFilters,
    startDate: today,
    endDate: today
  };
}

async function changePaymentsPage(direction) {
  const nextPage = Math.min(
    Math.max(1, paymentListState.page + direction),
    Math.max(1, paymentListState.totalPages)
  );
  if (nextPage === paymentListState.page) return;
  await loadPayments(null, { page: nextPage });
}

async function goToPaymentsPage(page) {
  const targetPage = Math.min(
    Math.max(1, Number(page) || 1),
    Math.max(1, paymentListState.totalPages)
  );
  if (targetPage === paymentListState.page) return;
  await loadPayments(null, { page: targetPage });
}

function getPaymentCatalogOptionLabel(option) {
  if (!option) return '';
  if (typeof window.getConsultationActLabel === 'function') {
    return window.getConsultationActLabel(option.value) || option.label || option.value;
  }
  return option.label || option.value || '';
}

function getAvailablePaymentServiceCatalog(selectedValue = '') {
  const allowedActs = typeof getAllowedConsultationActValues === 'function'
    ? new Set(getAllowedConsultationActValues())
    : null;
  const catalog = PAYMENT_SERVICE_CATALOG
    .filter((option) => !allowedActs || allowedActs.has(option.value))
    .map((option) => ({
      ...option,
      label: getPaymentCatalogOptionLabel(option)
    }));

  const resolvedSelected = resolvePaymentServiceOption(selectedValue);
  if (resolvedSelected?.value && (!allowedActs || allowedActs.has(resolvedSelected.value)) && !catalog.some((option) => option.value === resolvedSelected.value)) {
    catalog.push(resolvedSelected);
  }

  return catalog;
}

function resolvePaymentServiceOption(rawValue) {
  const value = typeof window.resolveConsultationActValue === 'function'
    ? window.resolveConsultationActValue(rawValue)
    : String(rawValue || '').trim();
  if (!value) return PAYMENT_SERVICE_CATALOG[0];
  const normalizedInput = String(rawValue || value).trim().toLowerCase();
  const matchedOption = PAYMENT_SERVICE_CATALOG.find((option) => {
    const optionLabel = String(option.label || '').trim().toLowerCase();
    const specialtyLabel = String(getPaymentCatalogOptionLabel(option) || '').trim().toLowerCase();
    return option.value === value || optionLabel === normalizedInput || specialtyLabel === normalizedInput;
  });
  if (matchedOption) {
    return {
      ...matchedOption,
      label: getPaymentCatalogOptionLabel(matchedOption)
    };
  }
  return {
    value,
    label: value,
    defaultAmount: 0
  };
}

function getPaymentServiceLabel(rawValue) {
  return resolvePaymentServiceOption(rawValue).label || 'Consultation médicale';
}

function populatePaymentServiceSelect(selectId, selectedValue = 'consultation') {
  const select = document.getElementById(selectId);
  if (!select) return;
  const resolved = resolvePaymentServiceOption(selectedValue);
  select.innerHTML = getAvailablePaymentServiceCatalog(selectedValue).map((option) => `
    <option value="${option.value}">${option.label}</option>
  `).join('');
  select.value = resolved.value;
}

function syncPaymentAmountFromService(selectId, amountInputId, force = false) {
  const select = document.getElementById(selectId);
  const amountInput = document.getElementById(amountInputId);
  if (!select || !amountInput) return;
  if (!force && String(amountInput.value || '').trim()) return;
  const option = resolvePaymentServiceOption(select.value);
  if (Number(option.defaultAmount) > 0) {
    amountInput.value = String(option.defaultAmount);
  }
}

function wirePaymentServiceAutoAmount(selectId, amountInputId) {
  const select = document.getElementById(selectId);
  if (!select || select.dataset.boundAutoAmount) return;
  select.addEventListener('change', () => syncPaymentAmountFromService(selectId, amountInputId, false));
  select.dataset.boundAutoAmount = '1';
}

function formatPaymentDateForInput(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function setPaymentConsultationLabel(consultationId, dateValue = '') {
  const consultationInput = document.getElementById('payment-consultation-label');
  if (!consultationInput) return;
  consultationInput.value = consultationId
    ? formatReferenceCode('Consultation', consultationId, dateValue || new Date().toISOString())
    : 'Sans consultation';
}

function resetPaymentModalState() {
  const modal = document.getElementById('modal-add-payment');
  if (!modal) return;

  delete modal.dataset.editId;
  delete modal.dataset.requestId;
  delete modal.dataset.dentalTreatmentId;

  const title = document.getElementById('payment-modal-title');
  const saveButton = document.getElementById('payment-save-btn');
  if (title) title.textContent = '💰 Enregistrer un Paiement';
  if (saveButton) saveButton.textContent = '💾 Enregistrer';

  setPaymentConsultationLabel('', '');
  wirePaymentServiceAutoAmount('payment-service', 'payment-amount');
  wirePaymentServiceActDefaults('payment-service', 'payment-acts-grid', 'payment-acts');
  renderPaymentModalActCheckboxes(['consultation']);
  setPaymentFormReadOnly(false);
}

function setPaymentFormReadOnly(isReadOnly, bannerText = '') {
  const modal = document.getElementById('modal-add-payment');
  if (!modal) return;

  modal.classList.toggle('is-readonly', !!isReadOnly);

  const lockBanner = document.getElementById('payment-lock-banner');
  if (lockBanner) {
    lockBanner.style.display = isReadOnly ? 'block' : 'none';
    if (isReadOnly && bannerText) {
      lockBanner.textContent = bannerText;
    }
  }

  ['payment-service', 'payment-amount', 'payment-date', 'payment-method', 'payment-notes'].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.disabled = !!isReadOnly;
    field.classList.toggle('disabled-field', !!isReadOnly);
  });

  document.querySelectorAll('#payment-acts-grid input[type="checkbox"]').forEach((checkbox) => {
    checkbox.disabled = !!isReadOnly;
  });
}

function resolvePaymentActValue(rawValue) {
  const value = typeof window.resolveConsultationActValue === 'function'
    ? window.resolveConsultationActValue(rawValue)
    : String(rawValue || '').trim();
  if (!value) return '';
  const normalized = value.toLowerCase();
  const matchedOption = PAYMENT_SERVICE_CATALOG.find((option) => {
    const specialtyLabel = String(getPaymentCatalogOptionLabel(option) || '').trim().toLowerCase();
    return option.value === value || option.label.toLowerCase() === normalized || specialtyLabel === normalized;
  });
  return matchedOption?.value || value;
}

function getPaymentActLabel(rawValue) {
  const value = resolvePaymentActValue(rawValue);
  if (!value) return '';
  const matchedOption = PAYMENT_SERVICE_CATALOG.find((option) => option.value === value);
  if (matchedOption) return getPaymentCatalogOptionLabel(matchedOption);
  if (typeof getConsultationActLabels === 'function') {
    const [consultationLabel] = getConsultationActLabels([value]);
    if (consultationLabel) return consultationLabel;
  }
  return String(rawValue || value).trim();
}

function getPaymentActChoices(selectedActs = []) {
  const choices = new Map(
    PAYMENT_SERVICE_CATALOG.map((option) => [
      option.value,
      { value: option.value, label: option.label }
    ])
  );
  const allowedActs = typeof getAllowedConsultationActValues === 'function'
    ? new Set(getAllowedConsultationActValues())
    : null;

  normalizePaymentActValues(selectedActs).forEach((value) => {
    if ((!allowedActs || allowedActs.has(value)) && !choices.has(value)) {
      choices.set(value, { value, label: getPaymentActLabel(value) });
    }
  });

  return Array.from(choices.values()).filter((choice) => !allowedActs || allowedActs.has(choice.value));
}

function normalizePaymentActValues(rawActs) {
  const normalizeList = (acts) => {
    const normalized = acts
      .map((item) => resolvePaymentActValue(item))
      .filter(Boolean);
    if (typeof filterConsultationActsByActiveSpecialty === 'function') {
      return filterConsultationActsByActiveSpecialty(normalized);
    }
    return normalized;
  };

  if (Array.isArray(rawActs)) {
    return normalizeList(rawActs);
  }

  if (!rawActs) return [];

  if (typeof rawActs === 'string') {
    try {
      const parsed = JSON.parse(rawActs);
      if (Array.isArray(parsed)) {
        return normalizeList(parsed);
      }
    } catch (_) {
      // Ignore JSON parsing errors and continue with CSV parsing.
    }
  }

  return normalizeList(String(rawActs)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean));
}

function extractPaymentActValuesFromNotes(notes = '') {
  return String(notes || '')
    .split(/\n|•/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => {
      const match = segment.match(/^Actes?\s*(selectionnes|sélectionnés|coches|cochés)?\s*:\s*(.+)$/i);
      if (!match) return [];
      return match[2]
        .split(',')
        .map((item) => resolvePaymentActValue(item.trim()))
        .filter(Boolean);
    });
}

function getInitialPaymentActValues(selectedActs = [], fallbackService = 'consultation', notes = '') {
  const mergedValues = Array.from(
    new Set([
      ...normalizePaymentActValues(selectedActs),
      ...extractPaymentActValuesFromNotes(notes)
    ])
  );

  if (mergedValues.length) return mergedValues;

  const fallbackValue = resolvePaymentActValue(fallbackService);
  return fallbackValue ? [fallbackValue] : ['consultation'];
}

function getSelectedPaymentActs(inputName = 'payment-acts') {
  return Array.from(document.querySelectorAll(`input[name="${inputName}"]:checked`))
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

function renderPaymentActCheckboxes(containerId, inputName, selectedActs = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const normalizedSelected = new Set(normalizePaymentActValues(selectedActs));
  const choices = getPaymentActChoices(selectedActs);

  container.innerHTML = choices.map((choice) => `
    <label class="payment-act-option">
      <input type="checkbox" name="${inputName}" value="${choice.value}" ${normalizedSelected.has(choice.value) ? 'checked' : ''}>
      <span>${choice.label}</span>
    </label>
  `).join('');
}

function renderPaymentModalActCheckboxes(selectedActs = []) {
  renderPaymentActCheckboxes('payment-acts-grid', 'payment-acts', selectedActs);
}

function getSelectedPaymentRequestActs() {
  return getSelectedPaymentActs('payment-request-acts');
}

function renderPaymentRequestActCheckboxes(selectedActs = []) {
  renderPaymentActCheckboxes('payment-request-acts-grid', 'payment-request-acts', selectedActs);
}

function stripPaymentActsFromNotes(notes = '') {
  return String(notes || '')
    .split(/\n|•/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/^Actes?\s*(selectionnes|sélectionnés|coches|cochés)?\s*:/i.test(segment))
    .join('\n');
}

function stripPaymentRequestActsFromNotes(notes = '') {
  return stripPaymentActsFromNotes(notes);
}

function buildPaymentNotesWithActs(freeNotes = '', selectedActs = []) {
  const notesParts = [];
  const selectedActLabels = normalizePaymentActValues(selectedActs).map((act) => getPaymentActLabel(act));
  if (selectedActLabels.length) {
    notesParts.push(`Actes cochés: ${selectedActLabels.join(', ')}`);
  }

  const freeText = String(freeNotes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' • ');

  if (freeText) {
    notesParts.push(freeText);
  }

  return notesParts.join(' • ');
}

function wirePaymentServiceActDefaults(selectId, containerId, inputName) {
  const select = document.getElementById(selectId);
  if (!select || select.dataset.boundActDefaults) return;

  select.addEventListener('change', () => {
    const selectedActs = getSelectedPaymentActs(inputName);
    if (selectedActs.length <= 1) {
      renderPaymentActCheckboxes(containerId, inputName, [select.value]);
    }
  });

  select.dataset.boundActDefaults = '1';
}

function buildPendingPaymentRow(request) {
  const data = JSON.parse(request.data || '{}');
  const createdAt = new Date(request.createdAt).toLocaleString('fr-FR');
  const amount = formatMoneyDZD(data.amount || 0);
  const requestRef = formatReferenceCode('Demande', request.id, request.createdAt);
  const consultationRef = data.consultationId
    ? formatReferenceCode('Consultation', data.consultationId, request.createdAt)
    : '';
  const serviceLabel = typeof escapeHTML === 'function' ? escapeHTML(data.service || '-') : (data.service || '-');
  const detailsLabel = typeof escapeHTML === 'function'
    ? escapeHTML(data.notes || 'Paiement demandé par le médecin, en attente d\'encaissement.')
    : (data.notes || 'Paiement demandé par le médecin, en attente d\'encaissement.');

  return `
    <tr class="pending-payment-row">
      <td>${createdAt}</td>
      <td>${data.patientName || '-'}</td>
      <td>${requestRef}</td>
      <td>${serviceLabel}</td>
      <td><strong>${amount}</strong></td>
      <td>
        <span class="payment-status-badge pending">Non reçu</span>
      </td>
      <td>${consultationRef ? `${consultationRef}<br>${detailsLabel}` : detailsLabel}</td>
      <td>
        <button class="btn btn-tiny btn-success" title="Encaisser / valider" onclick="collectPayment('${request.id}', '${data.patientId}', ${data.amount || 0})">Encaisser</button>
        ${currentUserRole !== 'assistant'
          ? `<button class="btn btn-tiny btn-outline" title="Clôturer" onclick="dismissPaymentRequest('${request.id}')">Clôturer</button>`
          : ''}
      </td>
    </tr>
  `;
}

async function getPendingPaymentRequestPayload(requestId) {
  const requests = await window.api.paymentRequest.getPending();
  const request = Array.isArray(requests)
    ? requests.find((item) => String(item.id) === String(requestId))
    : null;

  if (!request) return null;

  try {
    return {
      request,
      data: JSON.parse(request.data || '{}')
    };
  } catch (error) {
    console.error('Error parsing payment request payload:', error);
    return { request, data: {} };
  }
}

async function addPaymentForConsultation(consultationId, patientId) {
  try {
    resetPaymentModalState();

    // Get patient details
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success) {
      showNotification('Erreur lors du chargement des détails du patient', 'error');
      return;
    }
    
    const patient = patientResult.data;
    let consultationActs = ['consultation'];

    if (consultationId && window.api?.consultation?.getById) {
      const consultationResult = await window.api.consultation.getById(consultationId);
      if (consultationResult?.success && consultationResult.data) {
        consultationActs = getInitialPaymentActValues(
          typeof parseConsultationActs === 'function' ? parseConsultationActs(consultationResult.data.acts) : [],
          'consultation'
        );
      }
    }
    
    // Fill the form
    document.getElementById('payment-patient-id').value = patientId;
    document.getElementById('payment-consultation-id').value = consultationId;
    document.getElementById('payment-patient-name').value = `${patient.firstName} ${patient.lastName}`;
    populatePaymentServiceSelect('payment-service', 'consultation');
    wirePaymentServiceAutoAmount('payment-service', 'payment-amount');
    wirePaymentServiceActDefaults('payment-service', 'payment-acts-grid', 'payment-acts');
    renderPaymentModalActCheckboxes(consultationActs);
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('payment-date').value = today;
    setPaymentConsultationLabel(consultationId, today);
    
    // Reset other fields
    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-method').value = 'Espèces';
    document.getElementById('payment-notes').value = '';
    syncPaymentAmountFromService('payment-service', 'payment-amount', true);
    
    showModal('modal-add-payment');
  } catch (error) {
    console.error('Error opening payment modal:', error);
    showNotification('Erreur lors de l\'ouverture du formulaire', 'error');
  }
}

async function savePayment() {
  try {
    const modal = document.getElementById('modal-add-payment');
    const editId = modal?.dataset?.editId || '';
    const requestId = modal?.dataset?.requestId || '';

    if (currentUserRole === 'assistant' && editId) {
      showNotification('Modification d\'un paiement non autorisée pour l\'assistant', 'error');
      return;
    }

    const patientId = document.getElementById('payment-patient-id').value;
    const consultationId = document.getElementById('payment-consultation-id').value;
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const paymentDate = document.getElementById('payment-date').value;
    const paymentMethod = document.getElementById('payment-method').value;
    const serviceValue = document.getElementById('payment-service')?.value || 'consultation';
    const description = getPaymentServiceLabel(serviceValue);
    const freeNotes = document.getElementById('payment-notes').value;
    const selectedActs = getSelectedPaymentActs('payment-acts');
    const normalizedSelectedActs = selectedActs.length ? selectedActs : [resolvePaymentActValue(serviceValue)];
    const notes = buildPaymentNotesWithActs(freeNotes, normalizedSelectedActs);
    
    if (!amount || amount <= 0) {
      showNotification('Veuillez entrer un montant valide', 'error');
      return;
    }
    
    if (!paymentDate) {
      showNotification('Veuillez sélectionner une date', 'error');
      return;
    }
    
    const paymentData = {
      patientId,
      consultationId: consultationId || null,
      amount,
      paymentDate,
      paymentMethod,
      description,
      notes
    };
    
    const result = editId
      ? await window.api.payment.update(editId, paymentData)
      : await window.api.payment.create(paymentData);
    
    if (result.success) {
      showNotification(editId ? '✅ Paiement modifié avec succès' : '✅ Paiement enregistré avec succès', 'success');
      
      // Update dental treatment paid amount if this payment was for a dental treatment
      const dentalTreatmentId = modal?.dataset?.dentalTreatmentId;
      if (!editId && dentalTreatmentId) {
        try {
          // Get current treatment data and update paid amount
          const treatments = await window.api.dental.getTreatments(patientId);
          if (treatments.success && treatments.data) {
            const treatment = treatments.data.find(t => t.id === dentalTreatmentId);
            if (treatment) {
              const newPaid = (treatment.paid || 0) + amount;
              await window.api.dental.updateTreatment(dentalTreatmentId, {
                ...treatment,
                paid: newPaid
              });
            }
          }
        } catch (e) {
          console.error('Error updating dental treatment paid:', e);
        }
        delete modal.dataset.dentalTreatmentId;
      }
      
      // Mark payment request as complete if exists
      if (!editId && requestId) {
        await window.api.paymentRequest.complete(requestId);
        delete modal.dataset.requestId;
        // Reload payment requests for doctor & assistant
        if (typeof loadPendingPaymentRequests === 'function') {
          loadPendingPaymentRequests();
        }
      }
      
      closeModal('modal-add-payment');
      resetPaymentModalState();
      
      // Refresh payment section if currently viewing it
      const paymentsSection = document.getElementById('payments');
      if (paymentsSection && paymentsSection.classList.contains('active')) {
        loadPayments();
        loadPaymentStats();
      }

      // Refresh dental tab if currently viewing it
      const dentalTab = document.getElementById('tab-dental');
      if (dentalTab && dentalTab.classList.contains('active') && typeof loadPatientDentalTab === 'function') {
        loadPatientDentalTab(patientId);
      }
    } else {
      showNotification('Erreur: ' + (result.error || 'Impossible d\'enregistrer le paiement'), 'error');
    }
  } catch (error) {
    console.error('Error saving payment:', error);
    showNotification('Erreur lors de l\'enregistrement', 'error');
  }
}

async function findExistingPaymentByConsultationId(consultationId) {
  if (!consultationId) return null;

  try {
    const result = await window.api.payment.getByConsultation(consultationId);
    return result?.success ? (result.data || null) : null;
  } catch (error) {
    console.error('Error checking payment by consultation:', error);
    return null;
  }
}

async function loadPayments(filters = {}) {
  try {
    const isAssistant = typeof currentUserRole !== 'undefined' && currentUserRole === 'assistant';
    const result = await window.api.payment.getAll(filters);
    const tbody = document.getElementById('payments-tbody');
    tbody.innerHTML = '';
    
    let payments = result.success ? result.data : [];
    const canSeePendingRequests = currentUserRole === 'assistant' || currentUserRole === 'doctor' || currentUserRole === 'dentist';
    const pendingRequests = canSeePendingRequests ? await window.api.paymentRequest.getPending() : [];

    if (isAssistant) {
        const today = new Date().toISOString().split('T')[0];
        payments = payments.filter(p => p.paymentDate && p.paymentDate.startsWith(today));
    }

    if ((!payments || payments.length === 0) && (!pendingRequests || pendingRequests.length === 0)) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8" class="text-center">Aucun paiement trouvé</td></tr>';
      updatePaymentRequestBadge(0);
      return;
    }

    if (pendingRequests && pendingRequests.length > 0) {
      tbody.insertAdjacentHTML('beforeend', pendingRequests.map(buildPendingPaymentRow).join(''));
    }

    for (const payment of payments) {
      const row = document.createElement('tr');
      row.className = isAssistant ? 'payment-row-clickable payment-row-locked' : 'payment-row-clickable';
      if (!isAssistant) {
        row.addEventListener('click', () => openPaymentDetails(payment.id));
      }
      const date = new Date(payment.paymentDate).toLocaleDateString('fr-FR');

      // Get patient name
      let patientName = '-';
      if (payment.patientId) {
        const patientResult = await window.api.patient.getById(payment.patientId);
        if (patientResult.success) {
          const p = patientResult.data;
          patientName = `${p.firstName} ${p.lastName}`;
        }
      }

      const consultationInfo = payment.consultationId
        ? formatReferenceCode('Consultation', payment.consultationId, payment.paymentDate)
        : 'Sans consultation';
      const serviceInfo = typeof escapeHTML === 'function' ? escapeHTML(payment.description || '-') : (payment.description || '-');
      const detailsInfo = isAssistant
        ? '<span style="color:#94a3b8;">Non disponible</span>'
        : (typeof escapeHTML === 'function' ? escapeHTML(payment.notes || '-') : (payment.notes || '-'));
      const amount = formatMoneyDZD(payment.amount);

      const actions = isAssistant
        ? '<span style="color:#94a3b8; font-size:12px;">Verrouillé</span>'
        : `<button class="btn btn-tiny btn-danger" title="Supprimer" onclick="event.stopPropagation(); deletePayment('${payment.id}')">🗑️</button>`;

      row.innerHTML = `
        <td>${date}</td>
        <td>${typeof escapeHTML === 'function' ? escapeHTML(patientName) : patientName}</td>
        <td>${typeof escapeHTML === 'function' ? escapeHTML(consultationInfo) : consultationInfo}</td>
        <td>${serviceInfo}</td>
        <td><strong>${amount}</strong></td>
        <td><span class="payment-status-badge received">${payment.paymentMethod}</span></td>
        <td>${detailsInfo}</td>
        <td>${actions}</td>
      `;
      tbody.appendChild(row);
    }

    updatePaymentRequestBadge(pendingRequests.length);
  } catch (error) {
    console.error('Error loading payments:', error);
    showNotification('Erreur lors du chargement des paiements', 'error');
  }
}

async function loadPaymentStats() {
  try {
    const isAssistant = typeof currentUserRole !== 'undefined' && currentUserRole === 'assistant';

    // Load total income
    if (!isAssistant) {
        const totalResult = await window.api.payment.getTotalIncome();
        const totalEl = document.getElementById('stat-total-income');
        if (totalResult && totalResult.success && totalEl) {
          const formatted = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(parseFloat(totalResult.total) || 0);
          totalEl.textContent = formatted;
        } else if (totalEl) {
          totalEl.textContent = '0 DZD';
        }
    } else {
        const el = document.getElementById('stat-total-income');
        if(el) el.textContent = '---';
    }
    
    // Load today's income
    const today = new Date().toISOString().split('T')[0];
    const todayResult = await window.api.payment.getIncomeByPeriod('day', today, today);
    const todayEl = document.getElementById('stat-today-income');
    if (todayResult && todayResult.success && todayResult.data && todayResult.data.length > 0 && todayEl) {
      const formatted = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(parseFloat(todayResult.data[0].income) || 0);
      todayEl.textContent = formatted;
    } else if (todayEl) {
      todayEl.textContent = '0 DZD';
    }
    
    // Load this week's income (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    if (!isAssistant) {
        const weekResult = await window.api.payment.getIncomeByPeriod(
          'day',
          monday.toISOString().split('T')[0],
          sunday.toISOString().split('T')[0]
        );
        const weekEl = document.getElementById('stat-week-income');
        if (weekResult && weekResult.success && weekResult.data && weekResult.data.length > 0) {
          const total = weekResult.data.reduce((sum, item) => sum + (parseFloat(item.income) || 0), 0);
          const formatted = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(total);
          if (weekEl) weekEl.textContent = formatted;
        } else {
          if (weekEl) weekEl.textContent = '0 DZD';
        }
    } else {
        const el = document.getElementById('stat-week-income');
        if(el) el.textContent = '---';
    }
    
    // Load this month's income
    if (!isAssistant) {
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthResult = await window.api.payment.getIncomeByPeriod(
          'month',
          monthStart.toISOString().split('T')[0],
          today
        );
        const monthEl = document.getElementById('stat-month-income');
        if (monthResult && monthResult.success && monthResult.data && monthResult.data.length > 0 && monthEl) {
          const formatted = new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(parseFloat(monthResult.data[0].income) || 0);
          monthEl.textContent = formatted;
        } else if (monthEl) {
          monthEl.textContent = '0 DZD';
        }
    } else {
        const el = document.getElementById('stat-month-income');
        if(el) el.textContent = '---';
    }
  } catch (error) {
    console.error('Error loading payment stats:', error);
  }
}

async function filterPayments() {
  const filters = {};
  
  const method = document.getElementById('payment-filter-method').value;
  const startDate = document.getElementById('payment-filter-start').value;
  const endDate = document.getElementById('payment-filter-end').value;
  
  if (method) filters.paymentMethod = method;
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  
  await loadPayments(filters);
}

async function resetPaymentFilters() {
  document.getElementById('payment-filter-method').value = '';
  document.getElementById('payment-filter-start').value = '';
  document.getElementById('payment-filter-end').value = '';
  await loadPayments();
}

async function deletePayment(paymentId) {
  if (currentUserRole === 'assistant') {
    showNotification('Suppression non autorisée pour l\'assistant', 'error');
    return;
  }

  if (!confirm('Êtes-vous sûr de vouloir supprimer ce paiement ?')) {
    return;
  }
  
  try {
    const result = await window.api.payment.delete(paymentId);
    if (result.success) {
      showNotification('✅ Paiement supprimé', 'success');
      await loadPayments();
      await loadPaymentStats();
    } else {
      showNotification('Erreur: ' + (result.error || 'Impossible de supprimer'), 'error');
    }
  } catch (error) {
    console.error('Error deleting payment:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

// ==================== PAYMENT REQUEST SYSTEM (Doctor -> Assistant) ====================

/**
 * Doctor sends payment request to assistant
 */
async function sendPaymentRequestToAssistant(patientId, patientName, amount, consultationId = null, notes = '', service = '', selectedActs = []) {
  try {
    const result = await window.api.paymentRequest.create({
      patientId,
      patientName,
      amount,
      consultationId,
      service,
      notes,
      selectedActs,
      doctorId: currentUserId
    });
    
    if (result.success) {
      showNotification(`💰 Demande de paiement envoyée à l'assistante (${amount} DZD)`, 'success');
      return true;
    } else {
      showNotification('Erreur lors de l\'envoi de la demande', 'error');
      return false;
    }
  } catch (error) {
    console.error('Error sending payment request:', error);
    showNotification('Erreur lors de l\'envoi', 'error');
    return false;
  }
}

/**
 * Open modal to request payment (Doctor only)
 */
async function openPaymentRequestModal(patientId, defaults = {}) {
  try {
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success) {
      showNotification('Erreur lors du chargement du patient', 'error');
      return;
    }
    
    const patient = patientResult.data;
    
    document.getElementById('payment-request-patient-id').value = patientId;
    document.getElementById('payment-request-patient-name').value = `${patient.firstName} ${patient.lastName}`;
    populatePaymentServiceSelect('payment-request-service', defaults.service || 'consultation');
    wirePaymentServiceAutoAmount('payment-request-service', 'payment-request-amount');
    wirePaymentServiceActDefaults('payment-request-service', 'payment-request-acts-grid', 'payment-request-acts');
    renderPaymentRequestActCheckboxes(
      getInitialPaymentActValues(defaults.selectedActs, defaults.service || 'consultation', defaults.notes || '')
    );
    document.getElementById('payment-request-amount').value = defaults.amount || '';
    document.getElementById('payment-request-notes').value = stripPaymentActsFromNotes(defaults.notes || '');
    document.getElementById('modal-payment-request').dataset.consultationId = defaults.consultationId || '';
    syncPaymentAmountFromService('payment-request-service', 'payment-request-amount', !defaults.amount);
    
    showModal('modal-payment-request');
  } catch (error) {
    console.error('Error opening payment request modal:', error);
    showNotification('Erreur', 'error');
  }
}

/**
 * Submit payment request to assistant
 */
async function submitPaymentRequest() {
  const patientId = document.getElementById('payment-request-patient-id').value;
  const patientName = document.getElementById('payment-request-patient-name').value;
  const amount = parseFloat(document.getElementById('payment-request-amount').value);
  const serviceValue = document.getElementById('payment-request-service')?.value || 'consultation';
  const service = getPaymentServiceLabel(serviceValue);
  const freeNotes = document.getElementById('payment-request-notes').value;
  const consultationId = document.getElementById('modal-payment-request')?.dataset?.consultationId || null;
  const selectedActs = getSelectedPaymentRequestActs();
  const normalizedSelectedActs = selectedActs.length ? selectedActs : [resolvePaymentActValue(serviceValue)];
  
  if (!amount || amount <= 0) {
    showNotification('Veuillez entrer un montant valide', 'error');
    return;
  }

  const notes = buildPaymentNotesWithActs(freeNotes, normalizedSelectedActs);
  
  const success = await sendPaymentRequestToAssistant(
    patientId,
    patientName,
    amount,
    consultationId,
    notes,
    service,
    normalizedSelectedActs
  );
  
  if (success) {
    closeModal('modal-payment-request');
  }
}

/**
 * Load pending payment requests for assistant
 */
async function loadPendingPaymentRequests() {
  try {
    const requests = await getPendingPaymentRequestsCached(true);
    const container = document.getElementById('payment-requests-list');
    
    if (!container) return;
    
    if (!requests || requests.length === 0) {
      container.innerHTML = '<p class="empty-message">Aucune demande de paiement en attente</p>';
      updatePaymentRequestBadge(0);
      return;
    }
    
    container.innerHTML = requests.map(req => {
      const data = JSON.parse(req.data || '{}');
      const createdAt = new Date(req.createdAt).toLocaleString('fr-FR');
      const requestRef = formatReferenceCode('Demande', req.id, req.createdAt);
      const safeService = typeof escapeHTML === 'function' ? escapeHTML(data.service || '') : (data.service || '');
      const serviceLabel = safeService ? `<div class="request-time">Acte: ${safeService}</div>` : '';
      const consultationRef = data.consultationId
        ? `<div class="request-time">${formatReferenceCode('Consultation', data.consultationId, req.createdAt)}</div>`
        : '';
      
      return `
        <div class="payment-request-card" data-id="${req.id}">
          <div class="request-info">
            <div class="request-state">Paiement non reçu</div>
            <div class="request-patient">${data.patientName || 'Patient'}</div>
            <div class="request-time">${requestRef}</div>
            ${serviceLabel}
            ${consultationRef}
            <div class="request-amount">${formatMoneyDZD(data.amount || 0)}</div>
            <div class="request-time">${createdAt}</div>
            ${data.notes ? `<div class="request-notes">${data.notes}</div>` : ''}
          </div>
          <div class="request-actions">
            <button class="btn btn-success btn-sm" onclick="collectPayment('${req.id}', '${data.patientId}', ${data.amount})">
              💵 Encaisser
            </button>
            ${currentUserRole !== 'assistant' ? `
              <button class="btn btn-outline btn-sm" onclick="dismissPaymentRequest('${req.id}')">
                Clôturer
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    // Update badge count
    updatePaymentRequestBadge(requests.length);
    
  } catch (error) {
    console.error('Error loading payment requests:', error);
  }
}

/**
 * Collect payment (Assistant)
 */
async function collectPayment(requestId, patientId, amount) {
  try {
    const payload = await getPendingPaymentRequestPayload(requestId);
    const data = payload?.data || {};
    resetPaymentModalState();

    // Get patient details
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success) {
      showNotification('Erreur lors du chargement du patient', 'error');
      return;
    }
    
    const patient = patientResult.data;
    
    // Pre-fill payment modal
    document.getElementById('payment-patient-id').value = patientId;
    document.getElementById('payment-consultation-id').value = data.consultationId || '';
    document.getElementById('payment-patient-name').value = `${patient.firstName} ${patient.lastName}`;
    document.getElementById('payment-amount').value = data.amount || amount || '';
    document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('payment-method').value = 'Espèces';
    populatePaymentServiceSelect('payment-service', data.service || 'consultation');
    wirePaymentServiceAutoAmount('payment-service', 'payment-amount');
    wirePaymentServiceActDefaults('payment-service', 'payment-acts-grid', 'payment-acts');
    renderPaymentModalActCheckboxes(
      getInitialPaymentActValues(data.selectedActs, data.service || 'consultation', data.notes || '')
    );
    document.getElementById('payment-notes').value = stripPaymentActsFromNotes(data.notes || '');
    setPaymentConsultationLabel(data.consultationId || '', new Date().toISOString().split('T')[0]);
    
    // Store request ID to mark as complete after payment
    document.getElementById('modal-add-payment').dataset.requestId = requestId;
    if (currentUserRole === 'assistant') {
      setPaymentFormReadOnly(true, '🔒 Mode assistante: vous pouvez confirmer l’encaissement, mais pas modifier les informations demandées.');
      const saveButton = document.getElementById('payment-save-btn');
      if (saveButton) {
        saveButton.textContent = '✅ Confirmer l’encaissement';
      }
    }
    
    showModal('modal-add-payment');
  } catch (error) {
    console.error('Error collecting payment:', error);
    showNotification('Erreur', 'error');
  }
}

/**
 * Dismiss payment request
 */
async function dismissPaymentRequest(requestId) {
  if (currentUserRole === 'assistant') {
    showNotification('Clôture non autorisée pour l\'assistant', 'error');
    return;
  }

  if (!confirm('Êtes-vous sûr de vouloir ignorer cette demande de paiement ?')) {
    return;
  }
  
  try {
    const result = await window.api.paymentRequest.dismiss(requestId);
    if (!result?.success) {
      showNotification(result?.error || 'Clôture impossible', 'error');
      return;
    }
    showNotification('Demande ignorée', 'info');
    await loadPendingPaymentRequests();
  } catch (error) {
    console.error('Error dismissing payment request:', error);
  }
}

/**
 * Update payment request badge
 */
function updatePaymentRequestBadge(count) {
  const badge = document.getElementById('payment-requests-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Reflect pending count into payments list header badge if present
  const paymentsBadge = document.getElementById('payments-pending-badge');
  if (paymentsBadge) {
    if (count > 0) {
      paymentsBadge.textContent = `${count} en attente`;
      paymentsBadge.classList.remove('hidden');
    } else {
      paymentsBadge.classList.add('hidden');
    }
  }
}

/**
 * Initialize payment requests polling for doctor & assistant
 * Both roles can see and collect pending payment requests
 */
function initPaymentRequestsPolling() {
  if (currentUserRole === 'assistant' || currentUserRole === 'doctor' || currentUserRole === 'dentist') {
    // Show the payment requests section
    const section = document.getElementById('payment-requests-section');
    if (section) {
      section.style.display = 'block';
    }
    
    // Load immediately
    loadPendingPaymentRequests();
    
    // Poll every 15 seconds
    setInterval(loadPendingPaymentRequests, 15000);
  }
}

/**
 * Open payment modal for a patient (without specific consultation)
 * Used from waiting room when consultation is completed
 */
async function openPaymentModalForPatient(patientId, patientName) {
  try {
    resetPaymentModalState();

    // Fill the form
    document.getElementById('payment-patient-id').value = patientId;
    document.getElementById('payment-consultation-id').value = '';
    document.getElementById('payment-patient-name').value = patientName || 'Patient';
    populatePaymentServiceSelect('payment-service', 'consultation');
    wirePaymentServiceAutoAmount('payment-service', 'payment-amount');
    wirePaymentServiceActDefaults('payment-service', 'payment-acts-grid', 'payment-acts');
    renderPaymentModalActCheckboxes(['consultation']);
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('payment-date').value = today;
    
    // Reset other fields
    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-method').value = 'Espèces';
    document.getElementById('payment-notes').value = '';
    setPaymentConsultationLabel('', today);
    syncPaymentAmountFromService('payment-service', 'payment-amount', true);
    
    showModal('modal-add-payment');
  } catch (error) {
    console.error('Error opening payment modal:', error);
    showNotification('Erreur lors de l\'ouverture du formulaire', 'error');
  }
}

async function openPaymentDetails(paymentId) {
  try {
    if (currentUserRole === 'assistant') {
      showNotification('Le détail des paiements n\'est pas accessible à l\'assistant', 'warning');
      return;
    }

    resetPaymentModalState();

    const paymentResult = await window.api.payment.getById(paymentId);
    if (!paymentResult.success || !paymentResult.data) {
      showNotification('Paiement introuvable', 'error');
      return;
    }

    const payment = paymentResult.data;
    let patientName = 'Patient';

    if (payment.patientId) {
      const patientResult = await window.api.patient.getById(payment.patientId);
      if (patientResult.success && patientResult.data) {
        patientName = `${patientResult.data.firstName} ${patientResult.data.lastName}`;
      }
    }

    document.getElementById('payment-patient-id').value = payment.patientId || '';
    document.getElementById('payment-consultation-id').value = payment.consultationId || '';
    document.getElementById('payment-patient-name').value = patientName;
    populatePaymentServiceSelect('payment-service', payment.description || 'consultation');
    wirePaymentServiceAutoAmount('payment-service', 'payment-amount');
    wirePaymentServiceActDefaults('payment-service', 'payment-acts-grid', 'payment-acts');
    renderPaymentModalActCheckboxes(
      getInitialPaymentActValues([], payment.description || 'consultation', payment.notes || '')
    );
    document.getElementById('payment-amount').value = payment.amount || '';
    document.getElementById('payment-date').value = formatPaymentDateForInput(payment.paymentDate);
    document.getElementById('payment-method').value = payment.paymentMethod || 'Espèces';
    document.getElementById('payment-notes').value = stripPaymentActsFromNotes(payment.notes || '');
    setPaymentConsultationLabel(payment.consultationId || '', payment.paymentDate);

    const modal = document.getElementById('modal-add-payment');
    modal.dataset.editId = paymentId;
    const title = document.getElementById('payment-modal-title');
    const saveButton = document.getElementById('payment-save-btn');
    if (title) title.textContent = '✏️ Modifier le Paiement';
    if (saveButton) saveButton.textContent = '💾 Enregistrer les modifications';

    showModal('modal-add-payment');
  } catch (error) {
    console.error('Error opening payment details:', error);
    showNotification('Erreur lors de l\'ouverture du paiement', 'error');
  }
}

loadPayments = async function(filters = null, options = {}) {
  try {
    if (paymentListState.isLoading) {
      return;
    }

    paymentListState.isLoading = true;
    const isAssistant = typeof currentUserRole !== 'undefined' && currentUserRole === 'assistant';
    const tbody = document.getElementById('payments-tbody');
    const refreshButton = document.querySelector('#payments .section-header .btn.btn-secondary');
    const hadExistingRows = !!tbody?.children?.length;

    if (!hadExistingRows && tbody) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8" class="text-center">Chargement...</td></tr>';
    }

    if (filters !== null) {
      paymentListState.filters = { ...filters };
      if (!options.page) {
        paymentListState.page = 1;
      }
    }

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Actualisation...';
    }

    const requestFilters = {
      ...getPaymentRequestFilters(),
      paginated: true,
      page: options.page || paymentListState.page || 1,
      pageSize: paymentListState.pageSize || PAYMENTS_PAGE_SIZE
    };

    const [result, pendingRequests] = await Promise.all([
      window.api.payment.getAll(requestFilters),
      getPendingPaymentRequestsCached()
    ]);

    const payments = result.success ? (result.data || []) : [];
    updatePaymentPaginationState(result?.pagination);
    paymentListState.page = result?.pagination?.page || requestFilters.page || 1;

    if ((!payments || payments.length === 0) && (!pendingRequests || pendingRequests.length === 0)) {
      if (tbody) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="8" class="text-center">Aucun paiement trouvÃ©</td></tr>';
      }
      updatePaymentRequestBadge(0);
      renderPaymentsPagination();
      return;
    }

    const rowsHtml = [];

    if (pendingRequests && pendingRequests.length > 0) {
      rowsHtml.push(pendingRequests.map(buildPendingPaymentRow).join(''));
    }

    rowsHtml.push(payments.map((payment) => {
      const date = new Date(payment.paymentDate).toLocaleDateString('fr-FR');
      const patientName = `${payment.patientFirstName || ''} ${payment.patientLastName || ''}`.trim() || '-';
      const consultationInfo = payment.consultationId
        ? formatReferenceCode('Consultation', payment.consultationId, payment.paymentDate)
        : 'Sans consultation';
      const serviceInfo = typeof escapeHTML === 'function' ? escapeHTML(payment.description || '-') : (payment.description || '-');
      const detailsInfo = isAssistant
        ? '<span style="color:#94a3b8;">Non disponible</span>'
        : (typeof escapeHTML === 'function' ? escapeHTML(payment.notes || '-') : (payment.notes || '-'));
      const amount = formatMoneyDZD(payment.amount);
      const actions = isAssistant
        ? '<span style="color:#94a3b8; font-size:12px;">Verrouille</span>'
        : `<button class="btn btn-tiny btn-danger" title="Supprimer" onclick="event.stopPropagation(); deletePayment('${payment.id}')">Supprimer</button>`;

      return `
        <tr class="${isAssistant ? 'payment-row-clickable payment-row-locked' : 'payment-row-clickable'}" ${isAssistant ? '' : `onclick="openPaymentDetails('${payment.id}')"`}>
          <td>${date}</td>
          <td>${typeof escapeHTML === 'function' ? escapeHTML(patientName) : patientName}</td>
          <td>${typeof escapeHTML === 'function' ? escapeHTML(consultationInfo) : consultationInfo}</td>
          <td>${serviceInfo}</td>
          <td><strong>${amount}</strong></td>
          <td><span class="payment-status-badge received">${payment.paymentMethod}</span></td>
          <td>${detailsInfo}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join(''));

    if (tbody) {
      tbody.innerHTML = rowsHtml.join('');
    }
    updatePaymentRequestBadge(pendingRequests.length);
    renderPaymentsPagination();
  } catch (error) {
    console.error('Error loading payments:', error);
    showNotification('Erreur lors du chargement des paiements', 'error');
  } finally {
    paymentListState.isLoading = false;
    const refreshButton = document.querySelector('#payments .section-header .btn.btn-secondary');
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Actualiser';
    }
  }
};

filterPayments = async function() {
  const filters = getPaymentFiltersFromInputs();
  await loadPayments(filters, { page: 1 });
};

resetPaymentFilters = async function() {
  document.getElementById('payment-filter-method').value = '';
  document.getElementById('payment-filter-start').value = '';
  document.getElementById('payment-filter-end').value = '';
  await loadPayments({}, { page: 1 });
};

// Make functions global
window.addPaymentForConsultation = addPaymentForConsultation;
window.savePayment = savePayment;
window.loadPayments = loadPayments;
window.loadPaymentStats = loadPaymentStats;
window.initPaymentRequestsPolling = initPaymentRequestsPolling;
window.loadPendingPaymentRequests = loadPendingPaymentRequests;
window.openPaymentModalForPatient = openPaymentModalForPatient;
window.openPaymentDetails = openPaymentDetails;
window.resetPaymentModalState = resetPaymentModalState;
window.setPaymentConsultationLabel = setPaymentConsultationLabel;
window.findExistingPaymentByConsultationId = findExistingPaymentByConsultationId;
window.renderPaymentModalActCheckboxes = renderPaymentModalActCheckboxes;
window.stripPaymentActsFromNotes = stripPaymentActsFromNotes;
window.filterPayments = filterPayments;
window.resetPaymentFilters = resetPaymentFilters;
window.changePaymentsPage = changePaymentsPage;
window.goToPaymentsPage = goToPaymentsPage;

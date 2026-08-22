// ========== PATIENT DETAILS & MEDICAL RECORD ==========
let preparedConsultationAttachments = [];
let consultationPendingRequestsByConsultationId = new Map();
let consultationKineOptionsLoaded = false;
let consultationKineOptionsPromise = null;
const PATIENT_RECORD_PAGE_SIZES = {
  consultations: 5,
  prescriptions: 5,
  sickLeaves: 5,
  certificates: 5,
  workstops: 5,
  appointments: 5
};
const patientRecordPagination = {
  consultations: { page: 1, pageSize: PATIENT_RECORD_PAGE_SIZES.consultations, total: 0, totalPages: 1 },
  prescriptions: { page: 1, pageSize: PATIENT_RECORD_PAGE_SIZES.prescriptions, total: 0, totalPages: 1 },
  sickLeaves: { page: 1, pageSize: PATIENT_RECORD_PAGE_SIZES.sickLeaves, total: 0, totalPages: 1 },
  certificates: { page: 1, pageSize: PATIENT_RECORD_PAGE_SIZES.certificates, total: 0, totalPages: 1 },
  workstops: { page: 1, pageSize: PATIENT_RECORD_PAGE_SIZES.workstops, total: 0, totalPages: 1 },
  appointments: { page: 1, pageSize: PATIENT_RECORD_PAGE_SIZES.appointments, total: 0, totalPages: 1 }
};

function resetPatientRecordPagination(sectionKey = null) {
  const keys = sectionKey ? [sectionKey] : Object.keys(patientRecordPagination);
  keys.forEach((key) => {
    const pageSize = PATIENT_RECORD_PAGE_SIZES[key] || 5;
    patientRecordPagination[key] = {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1
    };
  });
}

function updatePatientRecordPagination(sectionKey, pagination = null) {
  const currentState = patientRecordPagination[sectionKey];
  if (!currentState) return;

  if (!pagination) {
    patientRecordPagination[sectionKey] = {
      ...currentState,
      page: 1,
      total: 0,
      totalPages: 1
    };
    return;
  }

  patientRecordPagination[sectionKey] = {
    ...currentState,
    page: Number(pagination.page || 1),
    pageSize: Number(pagination.pageSize || currentState.pageSize || 5),
    total: Number(pagination.total || 0),
    totalPages: Math.max(1, Number(pagination.totalPages || 1))
  };
}

function buildPatientRecordPaginationRow(sectionKey, colspan) {
  const pagination = patientRecordPagination[sectionKey];
  if (!pagination || pagination.total <= 0) {
    return '';
  }

  const currentPage = Math.min(Math.max(1, pagination.page), Math.max(1, pagination.totalPages));
  const start = pagination.total > 0 ? ((currentPage - 1) * pagination.pageSize) + 1 : 0;
  const end = pagination.total > 0 ? Math.min(currentPage * pagination.pageSize, pagination.total) : 0;

  return `
    <tr class="pagination-row">
      <td colspan="${colspan}">
        <div class="patients-pagination" style="display:flex;">
          <div class="patients-pagination-info">Affichage ${start}-${end} sur ${pagination.total}</div>
          <div class="patients-pagination-actions pagination-controls">
            <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${currentPage <= 1 ? 'disabled' : ''} onclick="changePatientRecordPage('${sectionKey}', -1)">‹</button>
            <span class="patients-pagination-info">${currentPage}/${pagination.totalPages}</span>
            <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${currentPage >= pagination.totalPages ? 'disabled' : ''} onclick="changePatientRecordPage('${sectionKey}', 1)">›</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

async function changePatientRecordPage(sectionKey, direction) {
  const pagination = patientRecordPagination[sectionKey];
  if (!pagination || !currentPatientId) return;

  const nextPage = Math.min(Math.max(1, pagination.page + direction), Math.max(1, pagination.totalPages));
  if (nextPage === pagination.page) return;

  if (sectionKey === 'consultations') {
    await loadPatientConsultations(currentPatientId, { page: nextPage });
  }
  if (sectionKey === 'prescriptions') {
    await loadPatientPrescriptions(currentPatientId, { page: nextPage });
  }
  if (sectionKey === 'sickLeaves') {
    await loadPatientSickLeaves(currentPatientId, { page: nextPage });
  }
  if (sectionKey === 'certificates') {
    await loadPatientSickLeaves(currentPatientId, { page: nextPage, documentKind: 'certificate', tbodyId: 'details-certificats-tbody', cacheKey: 'certificates' });
  }
  if (sectionKey === 'workstops') {
    await loadPatientSickLeaves(currentPatientId, { page: nextPage, documentKind: 'workstop', tbodyId: 'details-arrets-tbody', cacheKey: 'workstops' });
  }
  if (sectionKey === 'appointments') {
    updatePatientRecordPagination('appointments', {
      ...pagination,
      page: nextPage
    });
    renderPatientAppointments();
  }
}

function getPatientRecordsDateFilter() {
  return {
    start: document.getElementById('patient-records-filter-start')?.value || '',
    end: document.getElementById('patient-records-filter-end')?.value || ''
  };
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function isWithinPatientRecordsFilter(dateValue) {
  const { start, end } = getPatientRecordsDateFilter();
  if (!start && !end) return true;
  const current = normalizeDateOnly(dateValue);
  if (!current) return false;
  const startDate = normalizeDateOnly(start);
  const endDate = normalizeDateOnly(end);
  if (startDate && current < startDate) return false;
  if (endDate && current > endDate) return false;
  return true;
}

function filterPatientRecordsByDate(records = [], resolveDate) {
  if (!Array.isArray(records)) return [];
  if (typeof resolveDate !== 'function') return records;
  return records.filter((record) => isWithinPatientRecordsFilter(resolveDate(record)));
}

function getActivePatientDetailsTabId() {
  const activeButton = document.querySelector('.tabs-header .tab-btn.active');
  const onclickValue = activeButton?.getAttribute('onclick') || '';
  const match = onclickValue.match(/switchTab\('([^']+)'\)/);
  return match ? match[1] : 'tab-consultations';
}

function applyPatientRecordsDateFilter() {
  resetPatientRecordPagination();
  if (typeof window.resetPatientDocumentPagination === 'function') {
    window.resetPatientDocumentPagination();
  }
  switchTab(getActivePatientDetailsTabId());
}

function resetPatientRecordsDateFilter() {
  const startInput = document.getElementById('patient-records-filter-start');
  const endInput = document.getElementById('patient-records-filter-end');
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  resetPatientRecordPagination();
  if (typeof window.resetPatientDocumentPagination === 'function') {
    window.resetPatientDocumentPagination();
  }
  switchTab(getActivePatientDetailsTabId());
}

function syncUnpaidAmountWithConsultationPrice(force = false) {
  const consultationPriceInput = document.getElementById('consultation-price');
  const unpaidAmountInput = document.getElementById('consultation-unpaid-amount');
  if (!consultationPriceInput || !unpaidAmountInput) return;
  const shouldStayLinked = unpaidAmountInput.dataset.linkedToPrice !== '0';
  if (force || shouldStayLinked || !String(unpaidAmountInput.value || '').trim()) {
    unpaidAmountInput.value = consultationPriceInput.value || '';
    unpaidAmountInput.dataset.linkedToPrice = '1';
  }
}

function areConsultationAmountsEquivalent(leftValue, rightValue) {
  const left = String(leftValue || '').trim();
  const right = String(rightValue || '').trim();
  if (!left && !right) return true;
  if (!left || !right) return false;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber === rightNumber;
  }

  return left === right;
}

function buildConsultationPaymentRequestDetails() {
  const reason = document.getElementById('consultation-reason')?.value?.trim() || '';
  const treatment = document.getElementById('consultation-treatment')?.value?.trim() || '';
  const notes = document.getElementById('consultation-notes')?.value?.trim() || '';
  const actLabels = getConsultationActLabels(getSelectedConsultationActs());
  const consultationPrice = parseFloat(document.getElementById('consultation-price')?.value || '0');
  const requestedAmount = parseFloat(document.getElementById('consultation-unpaid-amount')?.value || '0');
  const dueDate = document.getElementById('consultation-unpaid-duedate')?.value || '';
  const unpaidChecked = Boolean(document.getElementById('consultation-unpaid')?.checked);
  const detailLines = [];
  const effectivePrice = consultationPrice > 0 ? consultationPrice : requestedAmount;

  if (actLabels.length) detailLines.push(`Actes sélectionnés: ${actLabels.join(', ')}`);
  if (reason) detailLines.push(`Motif: ${reason}`);
  if (treatment) detailLines.push(`Ce qui a été fait / avis: ${treatment}`);
  if (notes) detailLines.push(`Notes complémentaires: ${notes}`);
  if (effectivePrice > 0) detailLines.push(`Prix: ${effectivePrice.toLocaleString('fr-DZ')} DZD`);
  if (requestedAmount > 0 && consultationPrice > 0 && requestedAmount !== consultationPrice) {
    detailLines.push(`Montant demandé: ${requestedAmount.toLocaleString('fr-DZ')} DZD`);
  }
  if (dueDate) detailLines.push(`Date limite: ${new Date(dueDate).toLocaleDateString('fr-FR')}`);
  if (unpaidChecked) detailLines.push('Statut du dossier: impayé');

  return detailLines.join('\n');
}

function autoResizeConsultationPaymentDraftNotes() {
  const paymentDraftNotes = document.getElementById('consultation-payment-note');
  if (!paymentDraftNotes) return;

  paymentDraftNotes.style.height = 'auto';
  paymentDraftNotes.style.height = `${Math.max(paymentDraftNotes.scrollHeight, 160)}px`;
}

function syncConsultationPaymentDraftNotes(force = false) {
  const paymentDraftNotes = document.getElementById('consultation-payment-note');
  if (!paymentDraftNotes) return;

  const generatedValue = buildConsultationPaymentRequestDetails();
  const previousAutoValue = paymentDraftNotes.dataset.autoValue || '';
  const currentValue = paymentDraftNotes.value || '';
  const isManual = paymentDraftNotes.dataset.userEdited === '1';
  const canReplace = force || !currentValue.trim() || currentValue === previousAutoValue || !isManual;

  paymentDraftNotes.dataset.autoValue = generatedValue;

  if (canReplace) {
    paymentDraftNotes.value = generatedValue;
    paymentDraftNotes.dataset.userEdited = '0';
  }

  autoResizeConsultationPaymentDraftNotes();
}

function setConsultationEditorMode(isEdit = false) {
  const form = document.getElementById('consultation-form');
  const modalTitle = document.getElementById('modal-consultation-title');
  const saveButton = document.getElementById('consultation-save-btn');
  const finishButton = document.getElementById('consultation-finish-btn');

  if (form) {
    if (isEdit) {
      form.dataset.mode = 'edit';
    } else {
      delete form.dataset.mode;
    }
  }

  if (modalTitle) {
    modalTitle.textContent = isEdit ? '✏️ Modifier la Consultation' : 'Nouvelle Consultation';
  }

  if (saveButton) {
    saveButton.textContent = isEdit ? 'Mettre à jour' : 'Enregistrer';
  }

  if (finishButton) {
    finishButton.style.display = isEdit && !form?.dataset.waitingRoomId ? 'none' : '';
  }
}

function updateConsultationPaymentRequestVisibility() {
  const unpaidCheckbox = document.getElementById('consultation-unpaid');
  const paymentRequestFields = document.getElementById('consultation-payment-request-fields');
  if (!paymentRequestFields) return;
  paymentRequestFields.style.display = unpaidCheckbox?.checked ? 'none' : 'block';
}

function wireConsultationPaymentHelpers() {
  const consultationPriceInput = document.getElementById('consultation-price');
  const unpaidAmountInput = document.getElementById('consultation-unpaid-amount');
  const unpaidDueDate = document.getElementById('consultation-unpaid-duedate');
  const unpaidCheckbox = document.getElementById('consultation-unpaid');
  const paymentDraftNotes = document.getElementById('consultation-payment-note');
  const reasonInput = document.getElementById('consultation-reason');
  const treatmentInput = document.getElementById('consultation-treatment');
  const notesInput = document.getElementById('consultation-notes');
  const actInputs = Array.from(document.querySelectorAll('input[name="acts"]'));
  if (!consultationPriceInput || !unpaidAmountInput || !unpaidCheckbox) return;

  if (!consultationPriceInput.dataset.boundChange) {
    consultationPriceInput.addEventListener('input', () => syncUnpaidAmountWithConsultationPrice(false));
    consultationPriceInput.dataset.boundChange = '1';
  }

  if (!unpaidAmountInput.dataset.boundSyncTracking) {
    unpaidAmountInput.addEventListener('input', () => {
      unpaidAmountInput.dataset.linkedToPrice = areConsultationAmountsEquivalent(
        unpaidAmountInput.value,
        consultationPriceInput.value
      ) || !String(unpaidAmountInput.value || '').trim() ? '1' : '0';
      syncConsultationPaymentDraftNotes(false);
    });
    unpaidAmountInput.dataset.boundSyncTracking = '1';
  }

  if (!unpaidCheckbox.dataset.boundSync) {
    unpaidCheckbox.addEventListener('change', () => {
      if (unpaidCheckbox.checked) {
        unpaidAmountInput.dataset.linkedToPrice = '1';
        syncUnpaidAmountWithConsultationPrice(true);
      }
      updateConsultationPaymentRequestVisibility();
      syncConsultationPaymentDraftNotes(false);
    });
    unpaidCheckbox.dataset.boundSync = '1';
  }

  if (paymentDraftNotes && !paymentDraftNotes.dataset.boundManualTracking) {
    paymentDraftNotes.addEventListener('input', () => {
      const autoValue = paymentDraftNotes.dataset.autoValue || '';
      const currentValue = paymentDraftNotes.value || '';
      paymentDraftNotes.dataset.userEdited = currentValue.trim() && currentValue !== autoValue ? '1' : '0';
      autoResizeConsultationPaymentDraftNotes();
    });
    paymentDraftNotes.dataset.boundManualTracking = '1';
  }

  const bindAutoPaymentDetails = (input, eventName = 'input') => {
    if (!input || input.dataset.boundPaymentDetails) return;
    input.addEventListener(eventName, () => syncConsultationPaymentDraftNotes(false));
    input.dataset.boundPaymentDetails = '1';
  };

  bindAutoPaymentDetails(reasonInput);
  bindAutoPaymentDetails(treatmentInput);
  bindAutoPaymentDetails(notesInput);
  bindAutoPaymentDetails(consultationPriceInput);
  bindAutoPaymentDetails(unpaidDueDate, 'change');
  actInputs.forEach((input) => bindAutoPaymentDetails(input, 'change'));

  unpaidAmountInput.dataset.linkedToPrice = areConsultationAmountsEquivalent(
    unpaidAmountInput.value,
    consultationPriceInput.value
  ) || !String(unpaidAmountInput.value || '').trim() ? '1' : '0';

  updateConsultationPaymentRequestVisibility();
  syncConsultationPaymentDraftNotes(false);
  autoResizeConsultationPaymentDraftNotes();
}

const CONSULTATION_ACT_LABELS = typeof window !== 'undefined' && window.CONSULTATION_ACT_META
  ? Object.fromEntries(Object.entries(window.CONSULTATION_ACT_META).map(([key, meta]) => [key, meta.label]))
  : {
      consultation: 'Consultation médicale',
      ecg: 'ECG de repos',
      ecgstress: 'ECG d\'effort',
      echo: 'Échographie',
      holtermapa: 'Holter / MAPA',
      kine: 'Séance kiné',
      reduction: 'Réduction',
      infiltration: 'Infiltration',
      electrotherapie: 'Électrothérapie',
      massage: 'Massage',
      tecartherapie: 'Tecarthérapie',
      ondesdechoc: 'Ondes de choc',
      mesotherapie: 'Mésothérapie',
      lasertherapie: 'Laser thérapie',
      dryneedling: 'Dry needling',
      osteopathie: 'Ostéopathie',
      other: 'Autre acte'
    };

const CONSULTATION_ACT_ICONS = {
  consultation: '🩺',
  ecg: '🫀',
  ecgstress: '🏃',
  echo: '🔬',
  holtermapa: '📟',
  kine: '🏃',
  reduction: '🩹',
  infiltration: '💉',
  electrotherapie: '⚡',
  massage: '✋',
  tecartherapie: '🔥',
  ondesdechoc: '🌊',
  mesotherapie: '💉',
  lasertherapie: '🔴',
  dryneedling: '🪡',
  osteopathie: '🦴',
  other: '📝'
};

function parseConsultationActs(rawActs) {
  let acts = [];
  if (Array.isArray(rawActs)) {
    acts = rawActs.filter(Boolean);
  } else if (!rawActs) {
    acts = [];
  } else if (typeof rawActs === 'string') {
    try {
      const parsed = JSON.parse(rawActs);
      acts = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      acts = rawActs.split(',').map((item) => item.trim()).filter(Boolean);
    }
  } else {
    acts = [];
  }
  if (typeof filterConsultationActsByActiveSpecialty === 'function') {
    return filterConsultationActsByActiveSpecialty(acts);
  }
  return acts;
}

function getSelectedConsultationActs() {
  return Array.from(document.querySelectorAll('input[name="acts"]:checked'))
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

function getConsultationActLabels(rawActs) {
  return parseConsultationActs(rawActs).map((act) => {
    if (typeof window.getConsultationActLabel === 'function') {
      return window.getConsultationActLabel(act) || act;
    }
    return CONSULTATION_ACT_LABELS[act] || act;
  });
}

function getPrimaryConsultationServiceLabel(rawActs) {
  const labels = getConsultationActLabels(rawActs);
  return labels[0] || 'Consultation médicale';
}

function applyConsultationActsSelection(rawActs) {
  const selectedActs = parseConsultationActs(rawActs);
  const actsToApply = selectedActs.length ? selectedActs : ['consultation'];
  const allowedActs = typeof getAllowedConsultationActValues === 'function'
    ? new Set(getAllowedConsultationActValues())
    : null;

  document.querySelectorAll('input[name="acts"]').forEach((checkbox) => {
    const label = checkbox.closest('.checkbox-label');
    const isAllowed = allowedActs ? allowedActs.has(checkbox.value) : true;
    const labelText = typeof window.getConsultationActLabel === 'function'
      ? window.getConsultationActLabel(checkbox.value)
      : (CONSULTATION_ACT_LABELS[checkbox.value] || checkbox.value);
    const icon = CONSULTATION_ACT_ICONS[checkbox.value] || '📝';
    const textSpan = label?.querySelector('span');

    checkbox.checked = isAllowed && actsToApply.includes(checkbox.value);
    checkbox.disabled = !isAllowed;
    if (label) {
      label.style.display = isAllowed ? 'flex' : 'none';
    }
    if (textSpan) {
      textSpan.textContent = `${icon} ${labelText}`;
    }
  });

  if (typeof setupKineCheckboxBehavior === 'function') {
    setupKineCheckboxBehavior();
  } else if (typeof toggleKineSelection === 'function') {
    toggleKineSelection();
  }
}

async function preventDuplicateConsultationPayment(consultationId) {
  if (!consultationId) return false;

  const pendingRequest = consultationPendingRequestsByConsultationId.get(String(consultationId));
  if (pendingRequest) {
    showNotification('Une demande de paiement existe déjà pour cette consultation', 'info');
    return true;
  }

  if (typeof findExistingPaymentByConsultationId === 'function') {
    const existingPayment = await findExistingPaymentByConsultationId(consultationId);
    if (existingPayment) {
      showNotification('Un paiement existe déjà pour cette consultation', 'info');
      if (typeof openPaymentDetails === 'function') {
        await openPaymentDetails(existingPayment.id);
      }
      return true;
    }
  }

  return false;
}

async function persistConsultationDraft(options = {}) {
  const { keepModalOpen = false, silent = false } = options;

  pendingConsultationData = null;
  const form = document.getElementById('consultation-form');
  if (!form) {
    return { success: false, error: 'Formulaire de consultation introuvable' };
  }

  const editId = form.dataset.editId || '';
  const patientId = document.getElementById('consultation-patientId').value;
  const dateVal = document.getElementById('consultation-date').value;
  const timeVal = document.getElementById('consultation-time')?.value || new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = (dateVal && timeVal) ? `${dateVal} ${timeVal}:00` : (dateVal || new Date().toISOString());
  const treatmentField = document.getElementById('consultation-treatment');
  const notesField = document.getElementById('consultation-notes');

  const kineCheckbox = document.getElementById('act-kine');
  const isKineSession = kineCheckbox && kineCheckbox.checked;
  const selectedKineId = isKineSession ? document.getElementById('consultation-kine')?.value : null;

  const formData = {
    patientId,
    date,
    type: document.getElementById('consultation-type').value,
    reason: document.getElementById('consultation-reason').value,
    weight: document.getElementById('consultation-weight').value,
    height: document.getElementById('consultation-height').value,
    bloodPressure: document.getElementById('consultation-bloodPressure').value,
    temperature: document.getElementById('consultation-temperature').value,
    clinicalExamination: document.getElementById('consultation-clinicalExamination').value,
    diagnosis: document.getElementById('consultation-diagnosis').value,
    treatment: treatmentField ? treatmentField.value : '',
    notes: notesField ? notesField.value : ''
  };

  const unpaidChecked = Boolean(document.getElementById('consultation-unpaid')?.checked);
  const consultationPrice = parseFloat(document.getElementById('consultation-price')?.value || '0');
  const unpaidAmountRaw = parseFloat(document.getElementById('consultation-unpaid-amount')?.value || '0');
  const unpaidAmount = unpaidAmountRaw > 0 ? unpaidAmountRaw : consultationPrice;
  const unpaidDueDate = document.getElementById('consultation-unpaid-duedate')?.value || '';
  const selectedActs = getSelectedConsultationActs();

  formData.acts = selectedActs;
  formData.kineId = selectedKineId || null;
  formData.isUnpaid = unpaidChecked;
  formData.unpaidAmount = unpaidChecked ? unpaidAmount : 0;
  formData.unpaidDueDate = unpaidChecked ? unpaidDueDate : null;

  const fileInput = document.getElementById('consultation-attachments');
  const attachments = [...getPreparedConsultationAttachments()];
  if (fileInput && fileInput.files.length > 0) {
    console.log('📎 Processing', fileInput.files.length, 'attachment(s)...');
    for (const file of fileInput.files) {
      try {
        console.log('📎 Uploading file:', file.name, 'size:', file.size);
        const base64 = await readFileAsBase64(file);
        console.log('📎 File read as base64, length:', base64.length);
        const saveResult = await window.api.file.saveAttachment({
          name: file.name,
          data: base64,
          type: file.type,
          size: file.size
        });
        console.log('📎 Save result:', saveResult);

        if (saveResult.success) {
          attachments.push({
            name: saveResult.originalName,
            path: saveResult.path,
            type: saveResult.type,
            size: file.size,
            examFamily: typeof getSelectedAttachmentExamFamily === 'function'
              ? getSelectedAttachmentExamFamily('consultation-attachment-family')
              : 'Document'
          });
          console.log('📎 Attachment added:', saveResult.originalName);
        } else {
          console.error('📎 Save failed:', saveResult.error);
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        showNotification(`⚠️ Erreur lors de l'upload de ${file.name}`, 'warning');
      }
    }
  }

  if (attachments.length > 0) {
    if (editId) {
      try {
        const existingConsultation = await window.api.consultation.getById(editId);
        if (existingConsultation.success && existingConsultation.data.attachments) {
          const existingAttachments = typeof existingConsultation.data.attachments === 'string'
            ? JSON.parse(existingConsultation.data.attachments)
            : existingConsultation.data.attachments;
          formData.attachments = [...(existingAttachments || []), ...attachments];
        } else {
          formData.attachments = attachments;
        }
      } catch (e) {
        formData.attachments = attachments;
      }
    } else {
      formData.attachments = attachments;
    }

    console.log(`✅ ${attachments.length} pièce(s) jointe(s) préparée(s) avec succès`);
  }

  try {
    let result;
    let kineSessionInfo = null;

    if (editId) {
      result = await window.api.consultation.update(editId, formData);
    } else {
      result = await window.api.consultation.create(formData);
      if (result.success && isKineSession && selectedKineId) {
        try {
          const sessionResult = await window.api.kineSession.create({
            patientId,
            kineId: selectedKineId,
            consultationId: result.id,
            sessionDate: date,
            notes: `Consultation: ${formData.reason || 'Séance de kinésithérapie'}`
          });

          if (sessionResult.success) {
            kineSessionInfo = sessionResult;
          } else {
            showNotification(`✅ Consultation enregistrée mais erreur séance kiné: ${sessionResult.error}`, 'warning');
          }
        } catch (kineError) {
          console.error('Error creating kine session:', kineError);
          showNotification('✅ Consultation enregistrée mais erreur séance kiné', 'warning');
        }
      }
    }

    if (!result.success) {
      showNotification('❌ Erreur: ' + result.error, 'error');
      return { success: false, error: result.error };
    }

    const savedConsultationId = editId || result.id;
    const selectedEquipmentIds = Array.from(
      document.querySelectorAll('#consultation-equipment-list input[type="checkbox"]:checked')
    ).map(input => input.value);
    const equipmentSync = await window.api.equipment.syncConsultation(savedConsultationId, selectedEquipmentIds);
    if (equipmentSync?.success === false) {
      showNotification('Consultation enregistrée, mais les équipements n’ont pas pu être associés', 'warning');
    }

    // Auto-send payment request to assistant if price/unpaid amount was specified
    const targetAmount = unpaidChecked ? unpaidAmount : (consultationPrice > 0 ? consultationPrice : unpaidAmount);
    if (targetAmount > 0 && window.api?.paymentRequest?.create) {
      try {
        const patientName = currentPatientData ? `${currentPatientData.firstName || ''} ${currentPatientData.lastName || ''}`.trim() : 'Patient';
        const primaryService = parseConsultationActs(selectedActs)[0] || 'consultation';
        const paymentNotes = document.getElementById('consultation-payment-note')?.value?.trim() || '';
        await window.api.paymentRequest.create({
          patientId,
          patientName,
          amount: targetAmount,
          consultationId: savedConsultationId,
          service: primaryService,
          notes: paymentNotes,
          selectedActs,
          doctorId: currentUserId
        });
      } catch (payErr) {
        console.error('Error auto-transmitting payment request:', payErr);
      }
    }

    const attachmentCount = formData.attachments ? formData.attachments.length : 0;
    form.dataset.editId = savedConsultationId;
    currentConsultationId = savedConsultationId;
    currentConsultationId = savedConsultationId;

    setConsultationEditorMode(true);

    if (fileInput) {
      fileInput.value = '';
    }
    resetPreparedConsultationAttachments();
    updateConsultationAttachmentsPreview();

    loadPatientConsultations(currentPatientId || patientId);

    const consultationDate = date;
    const today = new Date().toISOString().split('T')[0];
    if (consultationDate === today && typeof loadDailySummary === 'function') {
      loadDailySummary();
    }

    if (isKineSession && selectedKineId && typeof loadKineStaff === 'function') {
      loadKineStaff();
    }

    if (!silent && keepModalOpen) {
      if (kineSessionInfo) {
        showNotification(`✅ Consultation enregistrée. La fenêtre reste ouverte pour le paiement. Séance kiné #${kineSessionInfo.sessionNumber} créée.`, 'success');
      } else if (editId) {
        showNotification('✅ Consultation mise à jour. La fenêtre reste ouverte pour le paiement.', 'success');
      } else if (attachmentCount > 0) {
        showNotification(`✅ Consultation enregistrée avec ${attachmentCount} pièce(s). La fenêtre reste ouverte pour le paiement.`, 'success');
      } else {
        showNotification('✅ Consultation enregistrée. La fenêtre reste ouverte pour le paiement.', 'success');
      }
    } else if (!silent) {
      if (kineSessionInfo) {
        showNotification(`✅ Consultation enregistrée + Séance kiné #${kineSessionInfo.sessionNumber} (${kineSessionInfo.price} DZD)`, 'success');
      } else if (editId) {
        showNotification('✅ Consultation modifiée', 'success');
      } else if (attachmentCount > 0) {
        showNotification(`✅ Consultation enregistrée avec ${attachmentCount} pièce(s) jointe(s)`, 'success');
      } else {
        showNotification('✅ Consultation enregistrée', 'success');
      }

    }

    if (!keepModalOpen) closeModal('modal-consultation');

    return {
      success: true,
      consultationId: savedConsultationId,
      created: !editId
    };
  } catch (error) {
    console.error('Error saving consultation:', error);
    showNotification('Erreur lors de l\'enregistrement', 'error');
    return { success: false, error: error.message };
  }
}

async function openManualPaymentRequestFromConsultationDraft() {
  const patientId = document.getElementById('consultation-patientId')?.value || currentPatientId;
  if (!patientId) {
    showNotification('Sélectionnez un patient avant d\'ouvrir la demande de paiement', 'warning');
    return;
  }

  syncConsultationPaymentDraftNotes(false);

  const consultationPrice = parseFloat(document.getElementById('consultation-price')?.value || '0');
  const unpaidAmount = parseFloat(document.getElementById('consultation-unpaid-amount')?.value || '0');
  const amount = unpaidAmount > 0 ? unpaidAmount : consultationPrice;
  if (!(amount > 0)) {
    showNotification('Saisissez un prix ou un montant demandé avant d\'ouvrir la demande', 'warning');
    return;
  }

  const dueDate = document.getElementById('consultation-unpaid-duedate')?.value || '';
  const paymentDraftNotes = document.getElementById('consultation-payment-note')?.value?.trim() || '';
  const acts = getSelectedConsultationActs();
  const persistence = await persistConsultationDraft({ keepModalOpen: true });
  if (!persistence.success) {
    return;
  }
  const consultationId = persistence.consultationId || null;
  const serviceValue = parseConsultationActs(acts)[0] || 'consultation';

  if (await preventDuplicateConsultationPayment(consultationId)) {
    return;
  }

  if (typeof openPaymentRequestModal !== 'function') {
    showNotification('Module de demande de paiement indisponible', 'error');
    return;
  }

  await openPaymentRequestModal(patientId, {
    amount: amount > 0 ? amount : '',
    consultationId,
    service: serviceValue,
    notes: paymentDraftNotes,
    selectedActs: acts,
    dueDate,
    context: 'consultation-draft'
  });
}

async function openDirectPaymentFromConsultationDraft() {
  try {
    const patientId = document.getElementById('consultation-patientId')?.value || currentPatientId;
    if (!patientId) {
      showNotification('Sélectionnez un patient avant d\'ouvrir le paiement', 'warning');
      return;
    }

    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success || !patientResult.data) {
      showNotification('Patient introuvable pour ce paiement', 'error');
      return;
    }

    const consultationPrice = parseFloat(document.getElementById('consultation-price')?.value || '0');
    const requestedAmount = parseFloat(document.getElementById('consultation-unpaid-amount')?.value || '0');
    const amount = requestedAmount > 0 ? requestedAmount : consultationPrice;
    const acts = getSelectedConsultationActs();
    const patient = patientResult.data;
    syncConsultationPaymentDraftNotes(false);
    const paymentDraftNotes = document.getElementById('consultation-payment-note')?.value?.trim() || '';
    const persistence = await persistConsultationDraft({ keepModalOpen: true });
    if (!persistence.success) {
      return;
    }
    const consultationId = persistence.consultationId || '';
    if (await preventDuplicateConsultationPayment(consultationId)) {
      return;
    }
    if (typeof resetPaymentModalState === 'function') {
      resetPaymentModalState();
    }

    document.getElementById('payment-patient-id').value = patientId;
    document.getElementById('payment-consultation-id').value = consultationId;
    document.getElementById('payment-patient-name').value = `${patient.firstName} ${patient.lastName}`;
    populatePaymentServiceSelect('payment-service', parseConsultationActs(acts)[0] || 'consultation');
    wirePaymentServiceAutoAmount('payment-service', 'payment-amount');
    if (typeof renderPaymentModalActCheckboxes === 'function') {
      renderPaymentModalActCheckboxes(acts);
    }
    document.getElementById('payment-amount').value = amount > 0 ? String(amount) : '';
    document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('payment-method').value = 'Espèces';
    document.getElementById('payment-notes').value = typeof stripPaymentActsFromNotes === 'function'
      ? stripPaymentActsFromNotes(paymentDraftNotes)
      : paymentDraftNotes;
    if (typeof setPaymentConsultationLabel === 'function') {
      setPaymentConsultationLabel(consultationId, new Date().toISOString().split('T')[0]);
    }

    showModal('modal-add-payment');
  } catch (error) {
    console.error('Error opening direct payment from consultation draft:', error);
    showNotification('Erreur lors de l\'ouverture du paiement', 'error');
  }
}

async function openPaymentRequestFromConsultationRecord(consultationId) {
  try {
    const result = await window.api.consultation.getById(consultationId);
    if (!result.success || !result.data) {
      showNotification('Consultation introuvable', 'error');
      return;
    }

    const consultation = result.data;
    const patientId = consultation.patientId || currentPatientId;
    if (!patientId) {
      showNotification('Patient introuvable pour cette consultation', 'warning');
      return;
    }

    if (await preventDuplicateConsultationPayment(consultation.id || consultationId)) {
      return;
    }

    const actLabels = getConsultationActLabels(consultation.acts);
    const notesParts = [];
    if (actLabels.length) notesParts.push(`Actes sélectionnés: ${actLabels.join(', ')}`);
    if (consultation.reason) notesParts.push(`Motif: ${consultation.reason}`);
    if (consultation.treatment) notesParts.push(`Ce qui a été fait / avis: ${consultation.treatment}`);
    if (consultation.notes) notesParts.push(`Notes complémentaires: ${consultation.notes}`);
    if (Number(consultation.unpaidAmount || 0) > 0) {
      notesParts.push(`Montant demandé: ${Number(consultation.unpaidAmount).toLocaleString('fr-DZ')} DZD`);
    }
    if (consultation.unpaidDueDate) {
      notesParts.push(`Date limite: ${new Date(consultation.unpaidDueDate).toLocaleDateString('fr-FR')}`);
    }
    if (consultation.isUnpaid) {
      notesParts.push('Statut du dossier: impayé');
    }

    await openPaymentRequestModal(patientId, {
      amount: Number(consultation.unpaidAmount || 0) > 0 ? Number(consultation.unpaidAmount) : '',
      consultationId: consultation.id || consultationId,
      service: parseConsultationActs(consultation.acts)[0] || 'consultation',
      notes: notesParts.join('\n'),
      selectedActs: parseConsultationActs(consultation.acts),
      dueDate: consultation.unpaidDueDate || '',
      context: 'consultation-record'
    });
  } catch (error) {
    console.error('Error opening consultation payment request:', error);
    showNotification('Erreur lors de l\'ouverture de la demande de paiement', 'error');
  }
}

if (typeof window !== 'undefined') {
  window.isWithinPatientRecordsFilter = isWithinPatientRecordsFilter;
  window.applyPatientRecordsDateFilter = applyPatientRecordsDateFilter;
  window.resetPatientRecordsDateFilter = resetPatientRecordsDateFilter;
  window.changePatientRecordPage = changePatientRecordPage;
  window.openPaymentRequestFromConsultationRecord = openPaymentRequestFromConsultationRecord;
  window.openManualPaymentRequestFromConsultationDraft = openManualPaymentRequestFromConsultationDraft;
  window.openDirectPaymentFromConsultationDraft = openDirectPaymentFromConsultationDraft;
}

function formatNumberedReference(id, dateValue, label = '') {
  const rawId = String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (rawId.slice(-4) || '0000').padStart(4, '0');
  const parsedDate = dateValue ? new Date(dateValue) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const ymd = `${safeDate.getFullYear()}${String(safeDate.getMonth() + 1).padStart(2, '0')}${String(safeDate.getDate()).padStart(2, '0')}`;
  const code = `N°${ymd}-${suffix}`;
  return label ? `${label} ${code}` : code;
}

function formatAppointmentDailyTicketCode(appointment) {
  const parsedDate = getAppointmentTicketDateObject(appointment) || new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const dateLabel = `${String(safeDate.getDate()).padStart(2, '0')}/${String(safeDate.getMonth() + 1).padStart(2, '0')}/${safeDate.getFullYear()}`;
  const ticketNumber = Math.max(0, Number(appointment?.dailyTicketNumber) || 0);
  return `${dateLabel} - ${ticketNumber}`;
}

function getPreparedConsultationAttachments() {
  return Array.isArray(preparedConsultationAttachments) ? preparedConsultationAttachments : [];
}

function resetPreparedConsultationAttachments() {
  preparedConsultationAttachments = [];
  updateConsultationAttachmentsPreview();
}

function updateConsultationAttachmentsPreview() {
  const preview = document.getElementById('consultation-attachments-preview');
  const fileInput = document.getElementById('consultation-attachments');
  if (!preview) return;

  const prepared = getPreparedConsultationAttachments();
  const uploadedFiles = Array.from(fileInput?.files || []);
  const allItems = [
    ...prepared.map((file) => ({
      icon: getFileIcon(file.originalName || file.name),
      visual: typeof buildAttachmentVisual === 'function'
        ? buildAttachmentVisual(file.path, file.originalName || file.name)
        : `<span style="font-size:24px;">${getFileIcon(file.originalName || file.name)}</span>`,
      name: file.originalName || file.name || 'Fichier importé',
      size: file.size || 0,
      source: file.scanner ? `Scanner USB: ${file.scanner.label || file.scanner.id}` : 'Importé depuis le PC / USB',
      examFamily: file.examFamily || 'Document'
    })),
    ...uploadedFiles.map((file) => ({
      icon: getFileIcon(file.name),
      visual: isImageAttachmentFile(file.name)
        ? `<div class="attachment-card-media"><img src="${escapeHTML(URL.createObjectURL(file))}" alt="${escapeHTML(file.name)}" class="attachment-card-thumb"></div>`
        : (typeof buildAttachmentVisual === 'function'
          ? buildAttachmentVisual('', file.name)
          : `<span style="font-size:24px;">${getFileIcon(file.name)}</span>`),
      name: file.name,
      size: file.size,
      source: 'Importé depuis le PC / USB',
      examFamily: typeof getSelectedAttachmentExamFamily === 'function'
        ? getSelectedAttachmentExamFamily('consultation-attachment-family')
        : 'Document'
    }))
  ];

  if (!allItems.length) {
    preview.innerHTML = '<p style="color: #666; font-size: 14px; margin-top: 10px;">✓ PDF, JPG, PNG, TIFF, DOCX autorisés</p>';
    return;
  }

  preview.innerHTML = `
    <div style="margin-top: 10px;">
      <p style="margin: 0 0 10px 0; color: #145da0; font-weight: 700; font-size: 15px;">
        ${allItems.length} pièce(s) jointe(s) prête(s)
      </p>
      ${allItems.map((item) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8fbff;border:1px solid #d6deea;border-radius:10px;margin-bottom:8px;">
          <div style="width:52px;height:52px;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #d6deea;flex-shrink:0;">
            ${item.visual}
          </div>
          <div style="flex:1;">
            <strong style="font-size:14px;display:block;">${escapeHTML(item.name)}</strong>
            <span style="font-size:12px;color:#64748b;">${formatFileSize(item.size)} • ${escapeHTML(item.source)}</span>
            <div style="font-size:11px;color:#145da0;font-weight:700;margin-top:2px;">${typeof formatAttachmentExamFamily === 'function' ? escapeHTML(formatAttachmentExamFamily(item.examFamily)) : 'Document'}</div>
          </div>
          <span style="color:#1f8a63;font-weight:700;">✓</span>
        </div>
      `).join('')}
    </div>
  `;
}

async function importConsultationAttachmentsFromDevice() {
  try {
    const result = await window.api.file.pickAttachments();
    if (!result?.success) {
      showNotification(`❌ ${result?.error || 'Import impossible'}`, 'error');
      return;
    }

    if (Array.isArray(result.data) && result.data.length > 0) {
      const examFamily = typeof getSelectedAttachmentExamFamily === 'function'
        ? getSelectedAttachmentExamFamily('consultation-attachment-family')
        : 'Document';
      preparedConsultationAttachments = [
        ...getPreparedConsultationAttachments(),
        ...result.data.map((file) => ({
          name: file.originalName || file.name,
          path: file.path,
          type: file.type,
          size: file.size,
          originalName: file.originalName || file.name,
          examFamily
        }))
      ];
      updateConsultationAttachmentsPreview();
      showNotification(`✅ ${result.data.length} fichier(s) importé(s)`, 'success');
    }
  } catch (error) {
    console.error('Error importing consultation attachments:', error);
    showNotification('❌ Erreur lors de l’import des pièces jointes', 'error');
  }
}

async function scanConsultationAttachment() {
  try {
    showNotification('⏳ Numérisation en cours...', 'info');
    const result = await window.api.file.scanDocument({ resolution: 200 });
    if (!result?.success) {
      showNotification(`❌ ${result?.error || 'Numérisation impossible'}`, 'error');
      return;
    }

    preparedConsultationAttachments = [
      ...getPreparedConsultationAttachments(),
      {
        name: result.originalName || result.name,
        originalName: result.originalName || result.name,
        path: result.path,
        type: result.type,
        size: result.size,
        scanner: result.scanner || null,
        examFamily: typeof getSelectedAttachmentExamFamily === 'function'
          ? getSelectedAttachmentExamFamily('consultation-attachment-family')
          : 'Document'
      }
    ];
    updateConsultationAttachmentsPreview();
    showNotification('✅ Scan enregistré dans les pièces jointes', 'success');
  } catch (error) {
    console.error('Error scanning consultation attachment:', error);
    showNotification('❌ Erreur lors du scan USB', 'error');
  }
}

async function openConsultationAttachmentImport() {
  if (!currentPatientId) {
    showNotification('Sélectionnez un patient avant d’ajouter une pièce jointe', 'warning');
    return;
  }

  try {
    const result = await window.api.file.pickAttachments();
    if (!result?.success) {
      showNotification(`❌ ${result?.error || 'Import impossible'}`, 'error');
      return;
    }

    const importedFiles = Array.isArray(result.data) ? result.data : [];
    if (!importedFiles.length) return;
    const examFamily = typeof getSelectedAttachmentExamFamily === 'function'
      ? getSelectedAttachmentExamFamily('patient-attachment-family')
      : 'Document';

    const saveResult = await window.api.patientAttachment.createBatch({
      patientId: currentPatientId,
      attachments: importedFiles.map((file) => ({
        fileName: file.originalName || file.name,
        filePath: file.path,
        mimeType: file.type,
        fileSize: file.size,
        examFamily,
        sourceType: 'import',
        sourceLabel: 'Importé dans le dossier patient'
      }))
    });

    if (!saveResult?.success) {
      showNotification(`❌ ${saveResult?.error || 'Enregistrement impossible'}`, 'error');
      return;
    }

    if (typeof loadPatientAttachments === 'function') {
      await loadPatientAttachments(currentPatientId);
    }

    showNotification(`✅ ${importedFiles.length} document(s) ajouté(s) au dossier patient`, 'success');
  } catch (error) {
    console.error('Error importing patient record attachments:', error);
    showNotification('❌ Erreur lors de l’import des documents du dossier', 'error');
  }
}

async function openConsultationScanner() {
  if (!currentPatientId) {
    showNotification('Sélectionnez un patient avant de scanner un document', 'warning');
    return;
  }

  try {
    showNotification('⏳ Numérisation du dossier patient...', 'info');
    const result = await window.api.file.scanDocument({ resolution: 200 });
    if (!result?.success) {
      showNotification(`❌ ${result?.error || 'Numérisation impossible'}`, 'error');
      return;
    }

    const saveResult = await window.api.patientAttachment.createBatch({
      patientId: currentPatientId,
      attachments: [{
        fileName: result.originalName || result.name,
        filePath: result.path,
        mimeType: result.type,
        fileSize: result.size,
        examFamily: typeof getSelectedAttachmentExamFamily === 'function'
          ? getSelectedAttachmentExamFamily('patient-attachment-family')
          : 'Document',
        sourceType: 'scanner',
        sourceLabel: result.scanner?.label ? `Scanner USB: ${result.scanner.label}` : 'Scanner USB'
      }]
    });

    if (!saveResult?.success) {
      showNotification(`❌ ${saveResult?.error || 'Enregistrement impossible'}`, 'error');
      return;
    }

    if (typeof loadPatientAttachments === 'function') {
      await loadPatientAttachments(currentPatientId);
    }

    showNotification('✅ Scan ajouté directement au dossier patient', 'success');
  } catch (error) {
    console.error('Error scanning patient record attachment:', error);
    showNotification('❌ Erreur lors du scan USB', 'error');
  }
}

function normalizePatientDetailValue(value) {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';

  const invalidValues = ['-', 'null', 'undefined', 'Invalid Date', 'NaN'];
  return invalidValues.includes(normalized) ? '' : normalized;
}

function summarizePatientDetailValue(value, fallback, maxLength = 110) {
  const normalized = normalizePatientDetailValue(value).replace(/\s+/g, ' ');
  if (!normalized) return fallback;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trim()}…`
    : normalized;
}

function renderImmediateMedicalSummary(patient) {
  if (!patient) return;

  const summaryTargets = ['patient-medical-overview', 'consultation-patient-summary']
    .map((targetId) => document.getElementById(targetId))
    .filter(Boolean);
  const canViewMedicalSummary = currentUserRole !== 'assistant' && currentUserRole !== 'director';
  summaryTargets.forEach((target) => {
    target.style.display = canViewMedicalSummary ? '' : 'none';
  });
  if (!canViewMedicalSummary) return;

  const ageYears = typeof calculatePatientAgeYears === 'function'
    ? calculatePatientAgeYears(patient.dateOfBirth)
    : null;
  const identityParts = [
    ageYears === null ? '' : `${ageYears} ans`,
    normalizePatientDetailValue(patient.bloodType)
  ].filter(Boolean);
  const allergies = summarizePatientDetailValue(patient.allergies, 'Non renseignées');
  const medicalHistory = summarizePatientDetailValue(patient.medicalHistory, 'Non renseignés');
  const latestConsultation = Array.isArray(patient.consultations) ? patient.consultations[0] : null;
  const latestDateValue = latestConsultation?.date || latestConsultation?.consultationDate;
  const latestDateObject = latestDateValue ? new Date(latestDateValue) : null;
  const latestDate = latestDateObject && !Number.isNaN(latestDateObject.getTime())
    ? latestDateObject.toLocaleDateString('fr-FR')
    : '';
  const normalizedAllergies = normalizePatientDetailValue(patient.allergies);
  const hasReportedAllergies = normalizedAllergies.length > 0
    && !['aucun', 'aucune', 'non', 'néant', 'neant', 'ras'].includes(normalizedAllergies.toLocaleLowerCase('fr-FR'));
  const latestDetails = latestConsultation
    ? [
        latestDate,
        summarizePatientDetailValue(
          latestConsultation.diagnosis || latestConsultation.reason,
          'Sans conclusion renseignée',
          80
        )
      ].filter(Boolean).join(' · ')
    : 'Aucune consultation antérieure';

  const summaryHtml = `
    <div class="medical-overview-heading">
      <span>Résumé médical</span>
      <small>À vérifier avant la consultation</small>
    </div>
    <div class="medical-overview-grid">
      <div class="medical-overview-item">
        <span>Patient</span>
        <strong>${escapeHTML(identityParts.join(' · ') || 'Informations à compléter')}</strong>
      </div>
      <div class="medical-overview-item ${hasReportedAllergies ? 'medical-overview-alert' : ''}">
        <span>Allergies</span>
        <strong>${escapeHTML(allergies)}</strong>
      </div>
      <div class="medical-overview-item">
        <span>Antécédents</span>
        <strong>${escapeHTML(medicalHistory)}</strong>
      </div>
      <div class="medical-overview-item">
        <span>Dernière consultation</span>
        <strong>${escapeHTML(latestDetails)}</strong>
      </div>
    </div>
  `;

  summaryTargets.forEach((target) => {
    target.innerHTML = summaryHtml;
  });
}

async function renderPatientAssignedMedecins(patient) {
  const container = document.getElementById('patient-assigned-medecins');
  if (!container) return;
  const isMultiple = typeof getCabinetType === 'function' && getCabinetType() === 'multiple';
  container.style.display = isMultiple ? '' : 'none';
  if (!isMultiple || !patient?.id) return;

  const usersResult = await window.api.user.getAll({ requestingUserId: currentUserId });
  const doctors = (usersResult.success ? usersResult.data : []).filter(user => user.role === 'doctor' || user.role === 'dentist');
  const assigned = new Set((patient.assignedMedecins || []).map(user => user.id));
  container.innerHTML = `<h4>Médecin(s) assigné(s)</h4><div class="patient-medecin-checklist">${doctors.map(user => `<label><input type="checkbox" value="${user.id}" ${assigned.has(user.id) ? 'checked' : ''}> ${user.name || user.fullName || user.username}</label>`).join('')}</div>`;
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', async () => {
      const result = input.checked
        ? await window.api.patient.assignMedecin({ patientId: patient.id, medecinId: input.value })
        : await window.api.patient.unassignMedecin({ patientId: patient.id, medecinId: input.value });
      if (!result.success) {
        input.checked = !input.checked;
        showNotification(result.error || 'Modification impossible', 'error');
      }
    });
  });
}

async function showPatientDetails(patientId) {
  if (!currentUserIsAdmin && currentUserRole === 'director') {
    showNotification('❌ Accès refusé: le directeur ne peut pas consulter le dossier médical détaillé', 'error');
    return null;
  }

  const normalizedId = (typeof patientId === 'object' && patientId !== null)
    ? (patientId.id || patientId.patientId || '')
    : String(patientId || '').trim();

  if (!normalizedId) {
    console.warn('showPatientDetails called without a valid patientId:', patientId);
    return null;
  }

  try {
    const result = await window.api.patient.getById({
      patientId: normalizedId,
      includeConsultations: currentUserRole !== 'assistant',
      consultationLimit: 1
    });
    if (result.success) {
      const patient = result.data;
      currentPatientId = normalizedId;
      window.currentPatientId = normalizedId;
      window.currentPatientData = patient;
      await setSelectedPatient(normalizedId, { patient, source: 'patient-details' });
      renderImmediateMedicalSummary(patient);
      void renderPatientAssignedMedecins(patient);
      if (typeof renderPatientDocumentWidget === 'function') {
        renderPatientDocumentWidget();
      }

      // Keep summary cards collapsed on first view; content is ready when opened.
      const personalCard = document.getElementById('patient-personal-card');
      const medicalCard = document.getElementById('patient-medical-card');
      if (personalCard) personalCard.removeAttribute('open');
      if (medicalCard) medicalCard.removeAttribute('open');

      // Update Header Info
      const nameEl = document.getElementById('details-patient-name');
      if (nameEl) nameEl.textContent = `${patient.firstName} ${patient.lastName}`;

      // Populate Info Card
      const infoContent = document.getElementById('patient-info-content');
      if (infoContent) {
        const ageYears = typeof calculatePatientAgeYears === 'function'
          ? calculatePatientAgeYears(patient.dateOfBirth)
          : null;
        const birthDate = patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('fr-FR') : '';
        const age = ageYears === null ? '' : `${ageYears} ans`;
        const photoUrl = typeof getPatientPhotoUrl === 'function'
          ? getPatientPhotoUrl(patientId)
          : '';
        const emergencyContact = [patient.emergencyContact, patient.emergencyPhone]
          .map((value) => normalizePatientDetailValue(value))
          .filter(Boolean)
          .join(' • ');

        const entries = [
          { label: 'Âge', value: age },
          { label: 'Date de naissance', value: birthDate },
          { label: 'Téléphone', value: patient.phone || '' },
          { label: 'Email', value: patient.email || '' },
          { label: 'Ville', value: patient.city || '' },
          { label: 'Code postal', value: patient.zipCode || '' },
          { label: 'Groupe sanguin', value: patient.bloodType || '' },
          { label: 'Adresse', value: patient.address || '', wide: true },
          { label: 'N° sécurité sociale', value: patient.socialSecurityNumber || '' },
          { label: 'Contact d\'urgence', value: emergencyContact || '', wide: true }
        ]
          .map((entry) => ({
            ...entry,
            value: normalizePatientDetailValue(entry.value)
          }))
          .filter((entry) => entry.value.length > 0);

        if (!entries.length) {
          if (personalCard) personalCard.style.display = '';
          infoContent.innerHTML = `
            <div class="patient-summary-layout">
              <button type="button" class="patient-profile-photo-card" onclick="triggerPatientPhotoPicker('details')">
                <img src="${escapeHTML(photoUrl)}" alt="${escapeHTML(`${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient')}" class="patient-profile-photo" data-patient-photo-preview data-photo-scope="details">
                <span class="patient-photo-edit-badge">Modifier</span>
              </button>
              <div class="patient-summary-grid">
                <div class="patient-summary-tile patient-summary-tile-wide">
                  <span class="patient-summary-label">Informations</span>
                  <strong class="patient-summary-value">Aucune information personnelle complémentaire</strong>
                </div>
              </div>
            </div>
          `;
        } else {
          if (personalCard) personalCard.style.display = '';
          infoContent.innerHTML = `
            <div class="patient-summary-layout">
              <button type="button" class="patient-profile-photo-card" onclick="triggerPatientPhotoPicker('details')">
                <img src="${escapeHTML(photoUrl)}" alt="${escapeHTML(`${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient')}" class="patient-profile-photo" data-patient-photo-preview data-photo-scope="details">
                <span class="patient-photo-edit-badge">Modifier</span>
              </button>
              <div class="patient-summary-grid">
                ${entries.map((entry) => `
                  <div class="patient-summary-tile ${entry.wide ? 'patient-summary-tile-wide' : ''}">
                    <span class="patient-summary-label">${entry.label}</span>
                    <strong class="patient-summary-value">${escapeHTML(entry.value)}</strong>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      // Populate History Card
      const historyContent = document.getElementById('patient-history-content');
      if (historyContent) {
        historyContent.innerHTML = `
          <div class="patient-summary-grid patient-history-grid">
            <div class="patient-summary-tile patient-summary-tile-wide">
              <span class="patient-summary-label">Allergies</span>
              <strong class="patient-summary-value patient-summary-rich">${formatRichTextHtml(patient.allergies, 'Aucune')}</strong>
            </div>
            <div class="patient-summary-tile patient-summary-tile-wide">
              <span class="patient-summary-label">Antécédents médicaux</span>
              <strong class="patient-summary-value patient-summary-rich">${formatRichTextHtml(patient.medicalHistory, 'Aucun')}</strong>
            </div>
          </div>
        `;
      }

    // Show Section
    showSection('patient-details');
    patientConsultationsLoading = true;
    resetPatientRecordPagination();
    if (typeof window.resetPatientDocumentPagination === 'function') {
      window.resetPatientDocumentPagination();
    }
    resetPatientRecordsView('Chargement...');
      
      // Load Default Tab based on role
      // Assistants should only see appointments tab
      if (currentUserRole === 'assistant') {
        switchTab('tab-appointments');
        enforceAssistantMode(); // Re-apply restrictions after loading patient details
      } else {
        switchTab('tab-consultations');
      }
      return patient;
    }
    showNotification(result.error || 'Patient non trouvé', 'error');
    return null;
  } catch (error) {
    console.error('❌ Erreur:', error);
    showNotification('Erreur lors du chargement du dossier patient', 'error');
    return null;
  }
}


function switchPatientCategory(categoryKey) {
  // Update category tab buttons
  document.querySelectorAll('#patient-category-tabs .patient-category-btn, #patient-category-tabs .ant-vertical-tabs-item, #patient-category-tabs .ant-tabs-tab').forEach(tab => {
    const isActive = tab.dataset.category === categoryKey || (tab.getAttribute('onclick') && tab.getAttribute('onclick').includes(categoryKey));
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  
  // Show/hide category panes
  document.querySelectorAll('.patient-category-pane').forEach(pane => {
    pane.style.display = 'none';
    pane.classList.remove('active');
  });
  const targetPane = document.getElementById('patient-cat-' + categoryKey);
  if (targetPane) {
    targetPane.style.display = 'block';
    targetPane.classList.add('active');
  }
  
  // Load data for the first tab in the category
  const categoryTabMap = {
    'suivi': 'tab-consultations',
    'documents': 'tab-prescriptions',
    'facturation': 'tab-factures',
    'rdv': 'tab-appointments',
  };
  const defaultTab = categoryTabMap[categoryKey];
  if (defaultTab) switchTab(defaultTab);
}
window.switchPatientCategory = switchPatientCategory;

function switchTab(tabId) {
  // Initialize or update Segmented control for Documents category
  if (typeof AntSegmented !== 'undefined') {
    const docsSegmented = document.getElementById('patient-docs-segmented');
    if (docsSegmented) {
      if (!docsSegmented.hasChildNodes()) {
        AntSegmented.create(docsSegmented, {
          options: [
            { label: 'Ordonnances', value: 'tab-prescriptions' },
            { label: 'Certificats', value: 'tab-certificats' },
            { label: 'Arrêts', value: 'tab-arrets' },
            { label: 'Rapports', value: 'tab-rapports' },
            { label: 'Bon Pour / Faire Svp', value: 'tab-bonpour' },
            { label: 'Orientations', value: 'tab-orientations' },
          ],
          defaultValue: tabId || 'tab-prescriptions',
          onChange: (value) => switchTab(value),
        });
      } else {
        // Just update visual state without triggering onChange to avoid loop
        const active = docsSegmented.querySelector('.ant-segmented-item.active');
        if (active && active.dataset.value !== tabId) {
          const newItem = docsSegmented.querySelector(`.ant-segmented-item[data-value="${tabId}"]`);
          if (newItem) {
            active.classList.remove('active');
            newItem.classList.add('active');
          }
        }
      }
    }
  }

  if (currentUserRole === 'assistant' && tabId !== 'tab-appointments') {
    tabId = 'tab-appointments';
  }

  // Update Tabs UI
  document.querySelectorAll('.tab-btn, .details-tab-btn, #patient-details .tab-btn').forEach(btn => {
    btn.classList.remove('active');
    const onclickAttr = btn.getAttribute('onclick') || '';
    if (onclickAttr && onclickAttr.includes(tabId)) {
      btn.classList.add('active');
    }
  });

  // Show Content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  const targetPane = document.getElementById(tabId);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  // Load Data
  if (tabId === 'tab-consultations') loadPatientConsultations(currentPatientId);
  if (tabId === 'tab-prescriptions') loadPatientPrescriptions(currentPatientId);
  if (tabId === 'tab-certificats') loadPatientSickLeaves(currentPatientId, { documentKind: 'certificate', tbodyId: 'details-certificats-tbody', cacheKey: 'certificates' });
  if (tabId === 'tab-arrets') loadPatientSickLeaves(currentPatientId, { documentKind: 'workstop', tbodyId: 'details-arrets-tbody', cacheKey: 'workstops' });
  if (tabId === 'tab-factures') loadPatientFactures(currentPatientId);
  if (tabId === 'tab-rapports') loadPatientRapports(currentPatientId);
  if (tabId === 'tab-bonpour') loadPatientBonPour(currentPatientId);
  if (tabId === 'tab-orientations') loadPatientOrientations(currentPatientId);
  if (tabId === 'tab-attachments') loadPatientAttachments(currentPatientId);
  if (tabId === 'tab-appointments') loadPatientAppointments(currentPatientId);
  if (tabId === 'tab-dental') loadPatientDentalTab(currentPatientId);
}

// --- Consultations ---

async function loadPatientConsultations(patientId, options = {}) {
  const tbody = document.getElementById('details-consultations-tbody');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    patientConsultationsLoading = false;
    renderPatientDocumentWidget();
    return;
  }

  if (!Array.isArray(patientRecordsCache.consultations) || !patientRecordsCache.consultations.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  }
  patientConsultationsLoading = true;
  renderPatientDocumentWidget();
  try {
    const currentPagination = patientRecordPagination.consultations;
    const requestedPage = Number(options.page || currentPagination.page || 1);
    const filters = getPatientRecordsDateFilter();
    const [result, pendingRequests, operationsResult, prescriptionsResult, certsResult, leavesResult] = await Promise.all([
      window.api.consultation.getByPatient({
        patientId,
        page: requestedPage,
        pageSize: currentPagination.pageSize,
        startDate: filters.start,
        endDate: filters.end,
        paginated: true
      }),
      window.api.paymentRequest?.getPending ? window.api.paymentRequest.getPending() : Promise.resolve([]),
      window.api.operation?.getByPatient ? window.api.operation.getByPatient(patientId) : Promise.resolve({ success: true, data: [] }),
      window.api.prescription?.getByPatient ? window.api.prescription.getByPatient(patientId) : Promise.resolve({ success: true, data: [] }),
      window.api.medicalCertificate?.getByPatient ? window.api.medicalCertificate.getByPatient(patientId) : Promise.resolve({ success: true, data: [] }),
      window.api.sickLeave?.getByPatient ? window.api.sickLeave.getByPatient(patientId) : Promise.resolve({ success: true, data: [] })
    ]);
    patientRecordsCache.consultations = result.success && Array.isArray(result.data) ? result.data : [];
    patientRecordsCache.operations = operationsResult && operationsResult.success && Array.isArray(operationsResult.data) ? operationsResult.data : [];
    patientRecordsCache.prescriptions = prescriptionsResult && prescriptionsResult.success && Array.isArray(prescriptionsResult.data) ? prescriptionsResult.data : [];
    patientRecordsCache.certificates = certsResult && certsResult.success && Array.isArray(certsResult.data) ? certsResult.data : [];
    patientRecordsCache.workLeaves = leavesResult && leavesResult.success && Array.isArray(leavesResult.data) ? leavesResult.data : [];
    updatePatientRecordPagination('consultations', result.pagination);
    consultationPendingRequestsByConsultationId = new Map();
    if (Array.isArray(pendingRequests)) {
      pendingRequests.forEach((request) => {
        const payload = JSON.parse(request.data || '{}');
        if (payload?.consultationId) {
          consultationPendingRequestsByConsultationId.set(String(payload.consultationId), payload);
        }
      });
    }
  } catch (error) {
    console.error('Error loading consultations:', error);
    patientRecordsCache.consultations = [];
    patientRecordsCache.operations = [];
    updatePatientRecordPagination('consultations', null);
    consultationPendingRequestsByConsultationId = new Map();
    showNotification('Erreur lors du chargement des consultations', 'error');
  } finally {
    patientConsultationsLoading = false;
  }

  renderPatientConsultations();
  renderPatientDocumentWidget();
}

function renderPatientConsultations() {
  const tbody = document.getElementById('details-consultations-tbody');
  const timelineEl = document.getElementById('details-consultations-timeline');

  const consultations = Array.isArray(patientRecordsCache.consultations) ? patientRecordsCache.consultations : [];
  const operations = Array.isArray(patientRecordsCache.operations) ? patientRecordsCache.operations : [];
  const prescriptions = Array.isArray(patientRecordsCache.prescriptions) ? patientRecordsCache.prescriptions : [];
  const certificates = Array.isArray(patientRecordsCache.certificates) ? patientRecordsCache.certificates : [];
  const workLeaves = Array.isArray(patientRecordsCache.workLeaves) ? patientRecordsCache.workLeaves : [];
  const orlHistory = typeof getORLHistory === 'function' ? getORLHistory(currentPatientId) : [];

  // Build unified chronological timeline
  const unifiedItems = [
    ...consultations.map(c => ({
      itemType: 'consultation',
      data: c,
      date: c.date || c.consultationDate || c.createdAt
    })),
    ...operations.map(op => ({
      itemType: 'operation',
      data: op,
      date: op.operationDate || op.createdAt
    }))
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (timelineEl) {
    if (!unifiedItems.length) {
      timelineEl.innerHTML = `
        <div class="ant-empty" style="padding: 48px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div class="ant-empty-image" style="margin-bottom: 16px;">
            <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="12" y="8" width="40" height="48" rx="4" fill="#f8fafc"/>
              <line x1="22" y1="20" x2="42" y2="20"/>
              <line x1="22" y1="28" x2="42" y2="28"/>
              <line x1="22" y1="36" x2="32" y2="36"/>
            </svg>
          </div>
          <div style="font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">Aucun historique de suivi médical</div>
          <div style="font-size: 13.5px; color: #64748b; max-width: 380px; line-height: 1.5; margin-bottom: 18px;">Démarrez une première consultation ou enregistrez une opération pour ce patient.</div>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-small" onclick="openNewConsultationModal()" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouvelle consultation
            </button>
            <button type="button" class="btn btn-secondary btn-small" onclick="goToOperationsFromPatientDetails()" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Opérations
            </button>
          </div>
        </div>
      `;
    } else {
      let timelineHtml = `<div class="ant-timeline">`;
      unifiedItems.forEach((item) => {
        if (item.itemType === 'operation') {
          const op = item.data;
          const dateLabel = op.operationDate ? new Date(op.operationDate).toLocaleDateString('fr-FR') : '-';
          const timeLabel = op.operationTime ? `à ${escapeHTML(op.operationTime)}` : '';
          const costDisplay = op.cost ? `${Number(op.cost).toLocaleString('fr-DZ')} DZD` : '';
          const paymentStatus = op.paymentStatus === 'paid'
            ? '<span class="ant-tag ant-tag-success" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f; font-weight: 600;">Réglé</span>'
            : (op.paymentStatus === 'partial'
              ? '<span class="ant-tag ant-tag-warning" style="background: #fffbe6; color: #d46b08; border-color: #ffd591; font-weight: 600;">Partiel</span>'
              : `<span class="ant-tag ant-tag-error" style="background: #fff1f0; color: #cf1322; border-color: #ffa39e; font-weight: 600;">Impayé • ${costDisplay}</span>`);

          let equipmentSummary = '';
          if (op.equipmentUsed) {
            try {
              const eq = JSON.parse(op.equipmentUsed);
              if (Array.isArray(eq) && eq.length > 0) {
                equipmentSummary = eq.map(e => e.name || e).join(', ');
              }
            } catch (e) {}
          }

          let consumablesSummary = '';
          if (op.consumablesUsed) {
            try {
              const cons = JSON.parse(op.consumablesUsed);
              if (Array.isArray(cons) && cons.length > 0) {
                consumablesSummary = cons.map(c => `${c.itemName} (${c.quantity})`).join(', ');
              }
            } catch (e) {}
          }

          timelineHtml += `
            <div class="ant-timeline-item">
              <div class="ant-timeline-item-tail"></div>
              <div class="ant-timeline-item-head" style="border-color: #722ed1; background: #f9f0ff;"></div>
              <div class="ant-timeline-item-content">
                <div style="background: #faf5ff; border: 1px solid #d3adf7; border-radius: 8px; padding: 14px 18px; box-shadow: 0 1px 2px rgba(114, 46, 209, 0.04); margin-bottom: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span style="font-weight: 700; font-size: 14px; color: #0f172a;">${escapeHTML(dateLabel)}</span>
                      ${timeLabel ? `<span style="font-size: 12px; color: #64748b;">${escapeHTML(timeLabel)}</span>` : ''}
                      <span class="ant-tag" style="background: #722ed1; color: #ffffff; border-color: #722ed1; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        Opération : ${escapeHTML(op.operationType)}
                      </span>
                      ${op.anesthesiaType ? `<span class="ant-tag" style="background: #f0f5ff; color: #2f54eb; border-color: #d6e4ff; font-size: 11px;">Anesthésie : ${escapeHTML(op.anesthesiaType)}</span>` : ''}
                    </div>
                    <div>${paymentStatus}</div>
                  </div>
                  <div style="font-size: 13.5px; color: #475569; margin-bottom: 6px;">
                    <strong>Praticien :</strong> ${escapeHTML(op.practitionerName || 'Non spécifié')} ${op.room ? `• <em>${escapeHTML(op.room)}</em>` : ''} • Durée : ${op.durationMinutes || 30} min
                  </div>
                  ${op.clinicalNotes ? `<div style="font-size: 13px; color: #334155; margin-bottom: 6px; background: #ffffff; border: 1px solid #e9d8fd; border-radius: 6px; padding: 8px 12px;"><strong>Observations :</strong> ${escapeHTML(op.clinicalNotes)}</div>` : ''}
                  ${equipmentSummary ? `<div style="font-size: 12.5px; color: #64748b; margin-bottom: 4px;">⚙️ <strong>Équipement :</strong> ${escapeHTML(equipmentSummary)}</div>` : ''}
                  ${consumablesSummary ? `<div style="font-size: 12.5px; color: #64748b; margin-bottom: 8px;">📦 <strong>Matériel / Consommables :</strong> ${escapeHTML(consumablesSummary)}</div>` : ''}
                  <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid #e9d8fd;">
                    <button type="button" class="btn btn-secondary btn-small" onclick="viewOperationReport('${op.id}')" style="height: 30px; padding: 0 10px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px;" title="Compte-rendu opératoire">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      CR Opératoire
                    </button>
                    <button type="button" class="btn btn-secondary btn-small" onclick="editOperation('${op.id}')" style="height: 30px; padding: 0 10px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px;" title="Modifier">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Modifier
                    </button>
                    <button type="button" class="btn btn-small" onclick="deleteOperation('${op.id}')" style="height: 30px; width: 30px; padding: 0; border-radius: 6px; background: #fff1f0; border: 1px solid #ffa39e; color: #e11d48; display: inline-flex; align-items: center; justify-content: center;" title="Supprimer">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          // Consultation item
          const c = item.data;
          const dateValue = c.date || c.consultationDate || c.createdAt;
          const dateStr = dateValue ? String(dateValue).slice(0, 10) : '';
          const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString('fr-FR') : '-';
          let timeLabel = '';
          if (c.time && String(c.time).includes(':')) {
            timeLabel = String(c.time).trim().slice(0, 5);
          } else if (dateValue && String(dateValue).includes(' ')) {
            const timePart = String(dateValue).split(' ')[1];
            if (timePart && timePart.includes(':')) timeLabel = timePart.slice(0, 5);
          }
          if ((!timeLabel || timeLabel === '00:00' || !timeLabel.includes(':')) && c.createdAt) {
            const parsed = new Date(c.createdAt);
            if (!isNaN(parsed.getTime())) {
              const str = parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              if (str && str !== '00:00') timeLabel = str;
            }
          }
          if (!/^\d{1,2}:\d{2}$/.test(timeLabel)) {
            timeLabel = '';
          }
          const reason = c.reason || 'Consultation médicale';
          const diagnosis = c.diagnosis || '—';
          const treatment = c.treatment || '';
          const pendingPayment = consultationPendingRequestsByConsultationId.get(String(c.id));
          const paymentStatus = pendingPayment
            ? `<span class="ant-tag ant-tag-warning" style="background: #fffbe6; color: #d46b08; border-color: #ffd591; font-weight: 600;">Impayé • ${(pendingPayment.amount || 0).toLocaleString('fr-DZ')} DZD</span>`
            : '<span class="ant-tag ant-tag-success" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f; font-weight: 600;">Réglé</span>';

          // Match ORL Report
          const matchedORLReport = orlHistory.find(r => (r.data && String(r.data.consultationId) === String(c.id)) || (r.date && r.date.slice(0, 10) === dateStr));

          // Match generated documents
          const matchingPrescriptions = prescriptions.filter(p => (p.consultationId && String(p.consultationId) === String(c.id)) || (p.prescriptionDate && String(p.prescriptionDate).slice(0, 10) === dateStr));
          const matchingCerts = certificates.filter(cert => (cert.consultationId && String(cert.consultationId) === String(c.id)) || (cert.certificateDate && String(cert.certificateDate).slice(0, 10) === dateStr));
          const matchingLeaves = workLeaves.filter(l => (l.consultationId && String(l.consultationId) === String(c.id)) || (l.startDate && String(l.startDate).slice(0, 10) === dateStr));

          timelineHtml += `
            <div class="ant-timeline-item">
              <div class="ant-timeline-item-tail"></div>
              <div class="ant-timeline-item-head"></div>
              <div class="ant-timeline-item-content">
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); margin-bottom: 12px; transition: all 0.2s ease;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span style="font-weight: 700; font-size: 14px; color: #0f172a;">${escapeHTML(dateLabel)}</span>
                      ${timeLabel ? `<span style="font-size: 12px; color: #64748b;">à ${escapeHTML(timeLabel)}</span>` : ''}
                      <span class="ant-tag ant-tag-processing" style="background: #e6f0ff; color: #1677ff; border-color: #91caff; font-size: 12px; font-weight: 600;">${escapeHTML(c.type || 'Consultation')}</span>
                      ${matchedORLReport ? `
                        <span class="ant-tag" style="background: #e6fffb; color: #08979c; border-color: #87e8de; font-weight: 700; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 2px rgba(8, 151, 156, 0.1);" onclick="openORLReportFromTimeline('${matchedORLReport.id}', '${currentPatientId}')" title="Cliquer pour ouvrir le compte-rendu ORL lié">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                          Consultation avec Compte-Rendu ORL
                        </span>
                      ` : ''}
                    </div>
                    <div>${paymentStatus}</div>
                  </div>

                  <!-- Synthesized Documents Summary Bar -->
                  ${(matchingPrescriptions.length > 0 || matchingCerts.length > 0 || matchingLeaves.length > 0) ? `
                    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; padding: 6px 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #f1f5f9;">
                      <span style="font-size: 11.5px; color: #64748b; font-weight: 600;">Documents émis :</span>
                      ${matchingPrescriptions.length > 0 ? `<span class="ant-tag" style="background: #f0f5ff; color: #1d39c4; border-color: #adc6ff; font-size: 11px; margin: 0;">Ordonnance (${matchingPrescriptions.length})</span>` : ''}
                      ${matchingCerts.length > 0 ? `<span class="ant-tag" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f; font-size: 11px; margin: 0;">Certificat (${matchingCerts.length})</span>` : ''}
                      ${matchingLeaves.length > 0 ? `<span class="ant-tag" style="background: #fff7e6; color: #d46b08; border-color: #ffd591; font-size: 11px; margin: 0;">Arrêt de travail (${matchingLeaves.length})</span>` : ''}
                    </div>
                  ` : ''}

                  <div style="font-size: 13.5px; color: #334155; margin-bottom: 6px;">
                    <strong>Motif :</strong> ${escapeHTML(reason)}
                  </div>
                  ${c.clinicalExamination ? `<div style="font-size: 13px; color: #475569; margin-bottom: 4px; background: #f8fafc; border-radius: 6px; padding: 6px 10px; border: 1px solid #f1f5f9;"><strong>Examen Clinique :</strong> ${escapeHTML(c.clinicalExamination)}</div>` : ''}
                  <div style="font-size: 13.5px; color: #059669; margin-bottom: 6px;">
                    <strong>Diagnostic :</strong> ${escapeHTML(diagnosis)}
                  </div>
                  ${treatment ? `<div style="font-size: 13px; color: #475569; margin-bottom: 4px;"><strong>Traitement :</strong> ${escapeHTML(treatment)}</div>` : ''}
                  ${c.notes ? `<div style="font-size: 12.5px; color: #64748b; margin-top: 4px; font-style: italic;"><strong>Notes :</strong> ${escapeHTML(c.notes)}</div>` : ''}

                  <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
                    <button type="button" class="btn btn-secondary btn-small" onclick="printConsultationDetails('${c.id}')" style="height: 30px; padding: 0 10px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px;">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      Aperçu
                    </button>
                    <button type="button" class="btn btn-secondary btn-small" onclick="editConsultation('${c.id}')" style="height: 30px; padding: 0 10px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px;">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Modifier
                    </button>
                    <button type="button" class="btn btn-small" onclick="deleteConsultation('${c.id}')" style="height: 30px; width: 30px; padding: 0; border-radius: 6px; background: #fff1f0; border: 1px solid #ffa39e; color: #e11d48; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;" title="Supprimer" onmouseenter="this.style.background='#ff4d4f'; this.style.color='#ffffff';" onmouseleave="this.style.background='#fff1f0'; this.style.color='#e11d48';">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
      });
      const pagination = patientRecordPagination.consultations;
      if (pagination && pagination.total > 0) {
        const currentPage = Math.min(Math.max(1, pagination.page), Math.max(1, pagination.totalPages));
        const start = ((currentPage - 1) * pagination.pageSize) + 1;
        const end = Math.min(currentPage * pagination.pageSize, pagination.total);
        timelineHtml += `
          <div class="timeline-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding:12px 14px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
            <div style="font-size:13px; color:#64748b; font-weight:500;">Affichage ${start}-${end} sur ${pagination.total} consultations</div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn btn-small btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="changePatientRecordPage('consultations', -1)">◀ Précédent</button>
              <span style="font-size:12.5px; font-weight:600; color:#334155; padding:0 6px;">Page ${currentPage} / ${pagination.totalPages}</span>
              <button type="button" class="btn btn-small btn-secondary" ${currentPage >= pagination.totalPages ? 'disabled' : ''} onclick="changePatientRecordPage('consultations', 1)">Suivant ▶</button>
            </div>
          </div>
        `;
      }
      timelineHtml += `</div>`;
      timelineEl.innerHTML = timelineHtml;
    }
  }

  if (tbody) {
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Aucune consultation</td></tr>';
      return;
    }

    const rowsHtml = data.map((c) => {
      const dateValue = c.date || c.consultationDate || c.createdAt;
      const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString('fr-FR') : '-';
      const reason = c.reason || '-';
      const diagnosis = c.diagnosis || '-';
      const pendingPayment = consultationPendingRequestsByConsultationId.get(String(c.id));
      const paymentStatus = pendingPayment
        ? `<span class="payment-status-badge pending">Non payé • ${(pendingPayment.amount || 0).toLocaleString('fr-DZ')} DZD</span>`
        : '<span class="payment-status-badge received">Payé</span>';
      return `
        <tr>
          <td>${escapeHTML(dateLabel)}</td>
          <td>${escapeHTML(reason)}</td>
          <td>${escapeHTML(diagnosis)}</td>
          <td>${paymentStatus}</td>
          <td>
            <div class="table-actions consultation-table-actions" style="display: flex; gap: 4px;">
              <button class="btn btn-tiny btn-secondary" title="Aperçu" onclick="printConsultationDetails('${c.id}')">Aperçu</button>
              <button class="btn btn-tiny btn-info" title="Modifier" onclick="editConsultation('${c.id}')">Modifier</button>
              <button class="btn btn-tiny btn-danger" title="Supprimer" onclick="deleteConsultation('${c.id}')">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientRecordPaginationRow('consultations', 5);
  }
}

async function openNewConsultationModal() {
  if (currentUserRole === 'assistant') {
    showNotification('❌ Accès refusé: le compte assistant ne peut pas créer de consultation', 'error');
    return;
  }

  if (!currentPatientId) return;
  renderImmediateMedicalSummary(currentPatientData);
  const form = document.getElementById('consultation-form');
  form.reset();
  resetPreparedConsultationAttachments();
  delete form.dataset.editId; // Clear edit mode
  delete form.dataset.waitingRoomId;
  document.getElementById('consultation-patientId').value = currentPatientId;
  
  setConsultationEditorMode(false);
  
  // Set default date to today (YYYY-MM-DD format for date input)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  document.getElementById('consultation-date').value = `${year}-${month}-${day}`;
  
  // Set default time to current time
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeInput = document.getElementById('consultation-time');
  if (timeInput) timeInput.value = `${hours}:${minutes}`;

  const unpaidCheckbox = document.getElementById('consultation-unpaid');
  const unpaidDetails = document.getElementById('unpaid-details');
  const consultationPrice = document.getElementById('consultation-price');
  const unpaidAmount = document.getElementById('consultation-unpaid-amount');
  const unpaidDueDate = document.getElementById('consultation-unpaid-duedate');
  const paymentDraftNotes = document.getElementById('consultation-payment-note');
  if (unpaidCheckbox) unpaidCheckbox.checked = false;
  if (unpaidDetails) unpaidDetails.style.display = 'block';
  if (consultationPrice) consultationPrice.value = '';
  if (unpaidAmount) unpaidAmount.value = '';
  if (unpaidDueDate) unpaidDueDate.value = '';
  if (paymentDraftNotes) {
    paymentDraftNotes.value = '';
    paymentDraftNotes.dataset.userEdited = '0';
    paymentDraftNotes.dataset.autoValue = '';
  }
  wireConsultationPaymentHelpers();
  applyConsultationActsSelection(['consultation']);
  syncConsultationPaymentDraftNotes(true);
  updateConsultationPaymentRequestVisibility();
  
  const fileInput = document.getElementById('consultation-attachments');
  if (fileInput) {
    fileInput.value = '';
  }
  updateConsultationAttachmentsPreview();
  
  // Setup kiné checkbox behavior
  setupKineCheckboxBehavior();
  await loadConsultationEquipmentPicker();
  
  showModal('modal-consultation');
}

let allConsultationEquipmentItems = [];
let selectedConsultationEquipmentIds = new Set();

async function loadConsultationEquipmentPicker(consultationId = '') {
  const container = document.getElementById('consultation-equipment-list');
  if (!container) return;
  container.innerHTML = '<span class="care-equipment-empty" style="font-size:13px; color:#64748b;">Chargement des équipements...</span>';
  try {
    const [allResult, selectedResult] = await Promise.all([
      window.api.equipment.getAll({}),
      consultationId ? window.api.equipment.getForConsultation(consultationId) : Promise.resolve({ success: true, data: [] })
    ]);
    let items = allResult?.success ? (allResult.data || []) : [];
    if (!items.length) {
      items = [
        { id: 'eq-dent-001', name: 'Fauteuil Dentaire Ergonomique Pro', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available' },
        { id: 'eq-dent-002', name: 'Autoclave Stérilisateur Classe B 24L', assignedRoom: 'Salle de Stérilisation', status: 'available' },
        { id: 'eq-dent-003', name: 'Détartreur Ultrasonique Piézoélectrique', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available' },
        { id: 'eq-dent-004', name: 'Capteur Radiologique Intra-oral Numérique HD', assignedRoom: 'Cabinet 1 (Radiologie Dentaire)', status: 'available' },
        { id: 'eq-dent-005', name: "Moteur d'Endodontie avec Localisateur d'Apex", assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available' },
        { id: 'eq-dent-006', name: 'Lampe à Photopolymériser LED Haute Puissance', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available' },
        { id: 'eq-dent-007', name: 'Compresseur Dentaire Silencieux Sans Huile 50L', assignedRoom: 'Local Technique', status: 'available' },
        { id: 'eq-dent-008', name: 'Aéropolisseur Prophylactique Sub/Supragingival', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available' },
        { id: 'eq-dent-009', name: "Moteur Chirurgical et d'Implantologie Dentaire", assignedRoom: 'Salle de Chirurgie Dentaire', status: 'available' },
        { id: 'eq-dent-010', name: 'Caméra Intra-orale HD avec Écran Tactile', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available' }
      ];
    }
    allConsultationEquipmentItems = items;
    selectedConsultationEquipmentIds = new Set((selectedResult?.success ? selectedResult.data : []).map(item => String(item.equipmentId)));
    renderConsultationEquipmentWidget();
  } catch (error) {
    container.innerHTML = '<span class="care-equipment-empty" style="font-size:13px; color:#ef4444;">Impossible de charger les équipements.</span>';
  }
}

function renderConsultationEquipmentWidget() {
  const container = document.getElementById('consultation-equipment-list');
  if (!container) return;

  container.innerHTML = `
    <div class="consultation-equipment-picker-box" style="position: relative; width: 100%;">
      <div style="position: relative;">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#94a3b8" stroke-width="2" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="consultation-eq-search-input" class="form-control" placeholder="Taper pour rechercher un équipement (ex: Fauteuil, Autoclave, Radio...)" autocomplete="off" style="padding-left: 36px; height: 38px; font-size: 13.5px; border-radius: 6px; border: 1px solid #d9d9d9; background: #ffffff; width: 100%;">
        <div id="consultation-eq-dropdown-list" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 1100; background: #ffffff; border: 1px solid #d9d9d9; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-height: 240px; overflow-y: auto;"></div>
      </div>
      <div id="consultation-eq-selected-tags" style="display: flex; flex-wrap: wrap; gap: 8px; min-height: 28px; margin-top: 10px; align-items: center;"></div>
      <div id="consultation-eq-hidden-inputs" style="display: none;"></div>
    </div>
  `;

  const searchInput = document.getElementById('consultation-eq-search-input');
  const dropdown = document.getElementById('consultation-eq-dropdown-list');

  const updateDropdown = (query = '') => {
    const q = query.toLowerCase().trim();
    if (!q || q.length < 1) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    const available = allConsultationEquipmentItems.filter(item => {
      return (item.name || '').toLowerCase().includes(q) || (item.assignedRoom || '').toLowerCase().includes(q);
    }).slice(0, 10);

    if (!available.length) {
      dropdown.innerHTML = `<div style="padding: 12px 16px; font-size: 12.5px; color: #94a3b8; font-style: italic; text-align: center;">Aucun équipement trouvé pour "${escapeHTML(q)}"</div>`;
    } else {
      dropdown.innerHTML = available.map(item => {
        const isSelected = selectedConsultationEquipmentIds.has(String(item.id));
        return `
          <div class="eq-dropdown-item" onclick="toggleConsultationEquipmentSelection('${escapeHTML(item.id)}')" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f1f5f9; background: ${isSelected ? '#f0fdf4' : '#ffffff'}; transition: background 0.15s;" onmouseenter="this.style.background='${isSelected ? '#dcfce7' : '#f8fafc'}'" onmouseleave="this.style.background='${isSelected ? '#f0fdf4' : '#ffffff'}'">
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <div>
                <span style="font-weight: 600; color: #1e293b;">${escapeHTML(item.name)}</span>
                <small style="display: block; font-size: 11.5px; color: #64748b;">${escapeHTML(item.assignedRoom || 'Cabinet de soins')}</small>
              </div>
            </div>
            <span style="font-size: 12px; font-weight: 700; color: ${isSelected ? '#16a34a' : '#1677ff'};">${isSelected ? 'Sélectionné' : '+ Ajouter'}</span>
          </div>
        `;
      }).join('');
    }
    dropdown.style.display = 'block';
  };

  if (searchInput) {
    searchInput.addEventListener('input', () => updateDropdown(searchInput.value));
  }

  document.addEventListener('click', (e) => {
    const box = container.querySelector('.consultation-equipment-picker-box');
    if (box && !box.contains(e.target) && dropdown) {
      dropdown.style.display = 'none';
    }
  });

  renderConsultationEquipmentSelectedTags();
}

function renderConsultationEquipmentSelectedTags() {
  const tagsContainer = document.getElementById('consultation-eq-selected-tags');
  const hiddenContainer = document.getElementById('consultation-eq-hidden-inputs');
  if (!tagsContainer || !hiddenContainer) return;

  if (selectedConsultationEquipmentIds.size === 0) {
    tagsContainer.innerHTML = '<span style="font-size: 12px; color: #94a3b8; font-style: italic;">Aucun équipement sélectionné pour cette consultation.</span>';
    hiddenContainer.innerHTML = '';
    return;
  }

  const selectedItems = allConsultationEquipmentItems.filter(item => selectedConsultationEquipmentIds.has(String(item.id)));

  tagsContainer.innerHTML = selectedItems.map(item => `
    <span style="display: inline-flex; align-items: center; gap: 6px; background: #e6f4ff; color: #0958d9; border: 1px solid #91caff; border-radius: 6px; padding: 5px 12px; font-size: 12.5px; font-weight: 600;">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      ${escapeHTML(item.name)}
      <button type="button" onclick="removeConsultationEquipmentSelection('${escapeHTML(item.id)}')" style="background: none; border: none; color: #0958d9; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; margin-left: 2px;" title="Retirer" onmouseenter="this.style.color='#ef4444'" onmouseleave="this.style.color='#0958d9'">&times;</button>
    </span>
  `).join('');

  hiddenContainer.innerHTML = selectedItems.map(item => `
    <input type="checkbox" value="${escapeHTML(item.id)}" checked style="display: none;">
  `).join('');
}

function toggleConsultationEquipmentSelection(id) {
  const strId = String(id);
  if (selectedConsultationEquipmentIds.has(strId)) {
    selectedConsultationEquipmentIds.delete(strId);
  } else {
    selectedConsultationEquipmentIds.add(strId);
  }
  renderConsultationEquipmentSelectedTags();
  const searchInput = document.getElementById('consultation-eq-search-input');
  const dropdown = document.getElementById('consultation-eq-dropdown-list');
  if (dropdown && searchInput) {
    dropdown.style.display = 'none';
    searchInput.value = '';
  }
}

function removeConsultationEquipmentSelection(id) {
  selectedConsultationEquipmentIds.delete(String(id));
  renderConsultationEquipmentSelectedTags();
}

window.toggleConsultationEquipmentSelection = toggleConsultationEquipmentSelection;
window.removeConsultationEquipmentSelection = removeConsultationEquipmentSelection;

// Setup kiné checkbox to show/hide kiné selection
function setupKineCheckboxBehavior() {
  const kineCheckbox = document.getElementById('act-kine');
  const kineSelection = document.getElementById('kine-selection');
  
  if (kineCheckbox && kineSelection) {
    kineSelection.style.display = kineCheckbox.checked ? 'block' : 'none';

    if (kineCheckbox.checked) {
      loadKineSelectOptions().catch((error) => {
        console.error('Error preloading kiné options:', error);
      });
    }

    kineCheckbox.onchange = async function() {
      kineSelection.style.display = this.checked ? 'block' : 'none';
      if (this.checked) {
        try {
          await loadKineSelectOptions();
          document.getElementById('consultation-kine')?.focus();
        } catch (error) {
          console.error('Error loading kiné options on demand:', error);
        }
      }
    };
  }
}

// Load kiné options for the consultation modal
async function loadKineSelectOptions(force = false) {
  try {
    const kineSelect = document.getElementById('consultation-kine');
    if (!kineSelect) return;

    if (force) {
      consultationKineOptionsLoaded = false;
      consultationKineOptionsPromise = null;
    }

    if (consultationKineOptionsLoaded) {
      return;
    }

    if (consultationKineOptionsPromise) {
      await consultationKineOptionsPromise;
      return;
    }

    const previousValue = kineSelect.value;
    kineSelect.innerHTML = '<option value="">-- Sélectionner un kiné --</option>';
    consultationKineOptionsPromise = (async () => {
      const kines = await window.api.kineStaff.getAll();
      kineSelect.innerHTML = '<option value="">-- Sélectionner un kiné --</option>';

      if (kines && kines.length > 0) {
        kines.forEach(kine => {
          const option = document.createElement('option');
          option.value = kine.id;
          option.textContent = `${kine.firstName} ${kine.lastName} - ${kine.sessionPrice || 0} DZD/séance`;
          kineSelect.appendChild(option);
        });
      }

      if (previousValue) {
        kineSelect.value = previousValue;
      }

      consultationKineOptionsLoaded = true;
    })();

    await consultationKineOptionsPromise;
  } catch (error) {
    console.error('Error loading kiné list for select:', error);
  } finally {
    consultationKineOptionsPromise = null;
  }
}

async function saveConsultation(e) {
  e.preventDefault();
  await persistConsultationDraft({ keepModalOpen: false });
}

function updateConsultationFinishChecklist() {
  const checks = Array.from(document.querySelectorAll('input[name="consultation-finish-check"]'));
  const completed = checks.filter((check) => check.checked).length;
  const progress = document.getElementById('consultation-finish-progress');
  const confirmButton = document.getElementById('consultation-finish-confirm');
  if (progress) progress.textContent = `${completed}/${checks.length} vérifiés`;
  if (confirmButton) confirmButton.disabled = checks.length === 0 || completed !== checks.length;
}

function openConsultationFinishChecklist() {
  const form = document.getElementById('consultation-form');
  if (!form || !form.reportValidity()) return;

  document.querySelectorAll('input[name="consultation-finish-check"]').forEach((check) => {
    check.checked = false;
  });
  updateConsultationFinishChecklist();
  showModal('modal-consultation-finish');
}

async function finishConsultationWithChecklist() {
  const checks = Array.from(document.querySelectorAll('input[name="consultation-finish-check"]'));
  if (!checks.length || checks.some((check) => !check.checked)) {
    showNotification('Vérifiez les quatre points avant de terminer', 'warning');
    return;
  }

  const form = document.getElementById('consultation-form');
  const confirmButton = document.getElementById('consultation-finish-confirm');
  const waitingRoomId = form?.dataset.waitingRoomId || '';
  if (confirmButton?.disabled) return;

  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Enregistrement...';
  }

  try {
    const persistence = await persistConsultationDraft({ keepModalOpen: true, silent: true });
    if (!persistence.success) return;

    if (waitingRoomId) {
      const waitingResult = await window.api.waitingRoom.updateStatus(waitingRoomId, 'completed');
      if (waitingResult?.success === false) {
        throw new Error(waitingResult.error || 'La consultation est enregistrée, mais la salle d’attente n’a pas été clôturée');
      }
    }

    closeModal('modal-consultation-finish');
    closeModal('modal-consultation');
    // Return the doctor to the operational queue immediately so the next
    // waiting patient can be called without navigating through the dossier.
    if (typeof showSection === 'function') showSection('waiting-room');
    if (typeof loadWaitingRoom === 'function') await loadWaitingRoom();
    showNotification('Consultation enregistrée et terminée', 'success');
  } catch (error) {
    console.error('Error finishing consultation:', error);
    showNotification(error.message || 'Erreur lors de la fin de consultation', 'error');
  } finally {
    if (confirmButton) {
      confirmButton.textContent = 'Enregistrer et terminer';
    }
    updateConsultationFinishChecklist();
  }
}

// View consultation details in a professional modal
async function viewConsultationDetails(consultationId) {
  try {
    currentConsultationId = consultationId; // Set for ordonnance/sickleave creation
    const result = await window.api.consultation.getById(consultationId);
    if (result.success) {
      const c = result.data;
      const date = new Date(c.date);
      const safeDate = Number.isNaN(date.getTime()) ? new Date(c.createdAt || Date.now()) : date;
      const content = document.getElementById('consultation-details-content');
      
      const [prescriptionsResult, sickLeavesResult] = await Promise.all([
        window.api.prescription.getByConsultation(consultationId),
        window.api.sickleave.getByConsultation(consultationId)
      ]);
      const prescriptions = (prescriptionsResult && Array.isArray(prescriptionsResult.data)) ? prescriptionsResult.data : [];
      const sickLeaves = (sickLeavesResult && Array.isArray(sickLeavesResult.data)) ? sickLeavesResult.data : [];
      
      // Build prescriptions HTML
      let prescriptionsHTML = '';
      if (prescriptions && prescriptions.length > 0) {
        prescriptionsHTML = `
          <div class="consultation-section">
            <h4>Ordonnances</h4>
            <div class="consultation-documents">
              ${prescriptions.map(p => {
                const dateLabel = new Date(p.date).toLocaleDateString('fr-FR');
                const medCount = Array.isArray(p.medications) ? p.medications.length : (p.medications ? JSON.parse(p.medications).length : 0);
                return `
                  <div class="document-card">
                    <div class="document-card-header">
                      <div>
                        <div class="document-card-title">Ordonnance du ${dateLabel}</div>
                        <div class="document-card-meta">${medCount} médicament${medCount > 1 ? 's' : ''}</div>
                      </div>
                      <div class="document-card-actions">
                        <button class="btn btn-secondary" onclick="viewPrescriptionDetails('${p.id}')">Voir</button>
                        <button class="btn btn-info" onclick="editPrescription('${p.id}')">Modifier</button>
                        <button class="btn btn-danger" onclick="deletePrescription('${p.id}')">Supprimer</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
      
      // Build sick leaves HTML
      let sickLeavesHTML = '';
      if (sickLeaves && sickLeaves.length > 0) {
        sickLeavesHTML = `
          <div class="consultation-section">
            <h4>Certificats médicaux</h4>
            <div class="consultation-documents">
              ${sickLeaves.map(sl => {
                const start = new Date(sl.startDate);
                const end = new Date(sl.endDate);
                const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                return `
                  <div class="document-card">
                    <div class="document-card-header">
                      <div>
                        <div class="document-card-title">Du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}</div>
                        <div class="document-card-meta">${duration} jour${duration > 1 ? 's' : ''}</div>
                      </div>
                      <div class="document-card-actions">
                        <button class="btn btn-secondary" onclick="viewSickLeaveDetails('${sl.id}')">Voir</button>
                        <button class="btn btn-info" onclick="editSickLeave('${sl.id}')">Modifier</button>
                        <button class="btn btn-danger" onclick="deleteSickLeave('${sl.id}')">Supprimer</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
      
      // Build attachments HTML
      const attachmentsHTML = await buildAttachmentsHTML(c.attachments, consultationId);
      const sidebarBlocks = [attachmentsHTML, prescriptionsHTML, sickLeavesHTML].filter(Boolean).join('');
      const hasSidebarContent = Boolean(sidebarBlocks);

      const consultationActs = getConsultationActLabels(c.acts);
      const paymentDetails = c.isUnpaid
        ? [
            'Impayé',
            Number(c.unpaidAmount || 0) > 0 ? `${Number(c.unpaidAmount).toLocaleString('fr-FR')} DZD` : '',
            c.unpaidDueDate ? `Échéance ${new Date(c.unpaidDueDate).toLocaleDateString('fr-FR')}` : ''
          ].filter(Boolean).join(' • ')
        : 'Non marqué impayé';

      const generalEntries = [
        { label: 'Type', value: c.type || 'Consultation' },
        { label: 'Motif', value: c.reason || 'Non précisé' },
        { label: 'Heure', value: safeDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) },
        consultationActs.length ? { label: 'Actes réalisés', value: consultationActs } : null,
        { label: 'Paiement', value: paymentDetails }
      ].filter(Boolean);

      const vitalEntries = [
        c.weight ? { label: 'Poids', value: `${c.weight} kg` } : null,
        c.height ? { label: 'Taille', value: `${c.height} cm` } : null,
        c.bloodPressure ? { label: 'Tension', value: c.bloodPressure } : null,
        c.temperature ? { label: 'Température', value: `${c.temperature} °C` } : null
      ].filter(Boolean);

      const textSections = [
        { title: 'Examen Clinique', value: c.clinicalExamination || 'Aucune donnée' },
        { title: 'Diagnostic', value: c.diagnosis || 'Aucun diagnostic' },
        c.treatment ? { title: 'Traitement', value: c.treatment } : null,
        c.notes ? { title: 'Notes', value: c.notes } : null
      ].filter(Boolean);

      const buildMetaGrid = (entries, emptyLabel) => {
        if (!entries.length) {
          return `
            <div class="consultation-meta-empty">${escapeHTML(emptyLabel)}</div>
          `;
        }

        return `
          <div class="consultation-meta-grid">
            ${entries.map((entry) => `
              <div class="consultation-meta-item">
                <span class="consultation-meta-label">${escapeHTML(entry.label)}</span>
                ${Array.isArray(entry.value)
                  ? `
                    <div class="consultation-chip-list">
                      ${entry.value.map((item) => `
                        <span class="consultation-chip">${escapeHTML(item)}</span>
                      `).join('')}
                    </div>
                  `
                  : `<span class="consultation-meta-value">${escapeHTML(entry.value)}</span>`
                }
              </div>
            `).join('')}
          </div>
        `;
      };

      content.innerHTML = `
        <div class="consultation-overview-grid">
          <div class="consultation-section consultation-section-compact">
            <h4>Informations Générales</h4>
            ${buildMetaGrid(generalEntries, 'Aucune information générale')}
          </div>
          <div class="consultation-section consultation-section-compact">
            <h4>Signes Vitaux</h4>
            ${buildMetaGrid(vitalEntries, 'Aucun signe vital renseigné')}
          </div>
        </div>

        <div class="consultation-grid${hasSidebarContent ? '' : ' consultation-grid-single'}">
          <div class="consultation-col-main">
            <div class="consultation-text-grid">
              ${textSections.map((section) => `
                <div class="consultation-section consultation-text-card">
                  <h4>${section.title}</h4>
                  <p>${escapeHTML(section.value)}</p>
                </div>
              `).join('')}
            </div>
          </div>

          ${hasSidebarContent ? `
            <div class="consultation-col-sidebar">
              ${sidebarBlocks}
            </div>
          ` : ''}
        </div>
      `;
      
      // Update modal header
      const modalHeader = document.querySelector('#modal-view-consultation .modal-header');
      modalHeader.innerHTML = `
        <div style="flex: 1;">
          <h2 style="margin: 0 0 8px 0;">Consultation du ${safeDate.toLocaleDateString('fr-FR')}</h2>
          <p style="margin: 0; font-size: 14px; color: #666;">${safeDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="minimize-btn" onclick="minimizeModal('modal-view-consultation')" title="Minimiser">&#8722;</button>
          <button class="close-btn" onclick="closeModal('modal-view-consultation')">&times;</button>
        </div>
      `;
      
      // Update modal footer with actions
      const modalFooter = document.querySelector('#modal-view-consultation .modal-footer');
      modalFooter.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; width:100%; gap:10px; justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="closeModal('modal-view-consultation'); editConsultation('${consultationId}')">Modifier</button>
          <button class="btn btn-primary" onclick="printConsultationDetails('${consultationId}')">Imprimer</button>
          <button class="btn btn-primary" onclick="openAddPrescriptionFromConsultation()">Ordonnance</button>
          <button class="btn" onclick="closeModal('modal-view-consultation')">Fermer</button>
        </div>
      `;
      
      showModal('modal-view-consultation');
    }
  } catch (error) {
    console.error('Error viewing consultation:', error);
    showNotification('Erreur lors de la lecture de la consultation', 'error');
  }
}

// Build attachments HTML for consultation details
async function buildAttachmentsHTML(attachmentsJson, consultationId = null) {
  if (!attachmentsJson) return '';
  
  try {
    const attachments = typeof attachmentsJson === 'string' ? JSON.parse(attachmentsJson) : attachmentsJson;
    if (!attachments || attachments.length === 0) return '';
    
    const attachmentsHTML = attachments.map((att, index) => {
      const fileName = att.name || att.originalName || 'Fichier sans nom';
      const fileSize = att.size || 0;
      const filePath = att.path || '';
      const encodedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeName = fileName.replace(/'/g, "\\'");
      const removeButton = consultationId !== null ? `
          <button class="btn btn-danger" onclick="event.stopPropagation(); removeConsultationAttachment('${consultationId}', ${index})">Supprimer</button>
        ` : '';
      
      return `
        <div class="document-card attachment-card attachment-card-interactive" onclick="openAttachment('${encodedPath}', '${safeName}', ${index})" role="button" tabindex="0" onkeydown="if(event.key==='Enter' || event.key===' '){event.preventDefault(); openAttachment('${encodedPath}', '${safeName}', ${index});}">
          <div class="document-card-header">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              ${typeof buildAttachmentVisual === 'function' ? buildAttachmentVisual(filePath, fileName) : `<div class="attachment-card-media attachment-card-icon"><span>${getFileIcon(fileName)}</span></div>`}
              <div>
                <div class="document-card-title">${fileName}</div>
                <div class="document-card-meta">${formatFileSize(fileSize)}</div>
                <div style="margin-top:6px;">${typeof formatAttachmentExamFamily === 'function' ? `<span class="attachment-family-chip">${escapeHTML(formatAttachmentExamFamily(att.examFamily || 'Document'))}</span>` : ''}</div>
              </div>
            </div>
            <div class="document-card-actions">
              <button class="btn btn-info" onclick="event.stopPropagation(); downloadAttachment('${encodedPath}', '${safeName}', ${index})">Télécharger</button>
              <button class="btn btn-primary" onclick="event.stopPropagation(); printAttachment('${encodedPath}', '${safeName}', ${index})">Imprimer</button>
              ${removeButton}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="consultation-section">
        <h4>📎 Pièces jointes (${attachments.length})</h4>
        <div class="consultation-documents">
          ${attachmentsHTML}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error building attachments HTML:', error);
    return `
      <div class="consultation-section" style="background: #fff3cd; border-left: 4px solid #ffc107; margin-top: 20px;">
        <h4 style="color: #856404;">⚠️ Erreur de chargement des pièces jointes</h4>
        <p style="color: #856404; font-size: 14px;">Impossible de charger les pièces jointes: ${error.message}</p>
      </div>
    `;
  }
}

async function removeConsultationAttachment(consultationId, attachmentIndex, refreshMode = 'consultation') {
  if (!consultationId) return;
  if (!confirm('Supprimer cette pièce jointe ?')) {
    return;
  }
  
  try {
    const consultationResult = await window.api.consultation.getById(consultationId);
    if (!consultationResult.success || !consultationResult.data) {
      showNotification('Erreur: Consultation introuvable', 'error');
      return;
    }
    
    const consultation = consultationResult.data;
    const attachments = consultation.attachments ? (typeof consultation.attachments === 'string' ? JSON.parse(consultation.attachments) : consultation.attachments) : [];
    if (!Array.isArray(attachments) || !attachments[attachmentIndex]) {
      showNotification('Pièce jointe introuvable', 'error');
      return;
    }
    attachments.splice(attachmentIndex, 1);

    const updatePayload = {
      type: consultation.type,
      reason: consultation.reason,
      clinicalExamination: consultation.clinicalExamination,
      bloodPressure: consultation.bloodPressure,
      temperature: consultation.temperature,
      weight: consultation.weight,
      height: consultation.height,
      diagnosis: consultation.diagnosis,
      treatment: consultation.treatment,
      notes: consultation.notes,
      attachments
    };

    const updateResult = await window.api.consultation.update(consultationId, updatePayload);
    if (updateResult.success) {
      showNotification('✅ Pièce jointe supprimée', 'success');
      if (refreshMode === 'attachments') {
        if (currentPatientId && typeof loadPatientAttachments === 'function') {
          await loadPatientAttachments(currentPatientId);
        }
      } else {
        viewConsultationDetails(consultationId);
      }
    } else {
      showNotification('Erreur lors de la mise à jour de la consultation', 'error');
    }
  } catch (error) {
    console.error('Error removing attachment:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

function getFileIcon(filename) {
  if (!filename) return '📎';
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tif', 'tiff'].includes(ext)) return '🩻';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['tiff', 'tif'].includes(ext)) return '🏥';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['txt'].includes(ext)) return '📃';
  return '📎';
}

async function openAttachment(filePath, fileName, index) {
  console.log('Opening attachment:', { filePath, fileName, index });
  
  if (!filePath) {
    showNotification('❌ Chemin de fichier invalide', 'error');
    return;
  }
  
  try {
    if (typeof viewFile === 'function') {
      await viewFile(filePath, fileName);
      return;
    }

    const result = await window.api.file.openAttachment(filePath);
    if (!result.success) {
      console.error('Error opening file:', result.error);
      showNotification(`❌ Impossible d'ouvrir ${fileName}: ${result.error || 'Erreur inconnue'}`, 'error');
    }
  } catch (error) {
    console.error('Error opening attachment:', error);
    showNotification(`❌ Erreur lors de l'ouverture: ${error.message}`, 'error');
  }
}

async function downloadAttachment(filePath, fileName, index) {
  console.log('Downloading attachment:', { filePath, fileName, index });
  
  if (!filePath) {
    showNotification('❌ Chemin de fichier invalide', 'error');
    return;
  }
  
  try {
    // Read the file as data URL
    const result = await window.api.file.readAsDataURL(filePath);
    if (result.success) {
      // Create a download link
      const link = document.createElement('a');
      link.href = result.dataURL;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showNotification(`✅ Téléchargement de ${fileName} démarré`, 'success');
    } else {
      console.error('Error reading file:', result.error);
      showNotification(`❌ Impossible de télécharger ${fileName}`, 'error');
    }
  } catch (error) {
    console.error('Error downloading attachment:', error);
    showNotification(`❌ Erreur lors du téléchargement: ${error.message}`, 'error');
  }
}

async function printAttachment(filePath, fileName, index) {
  console.log('Printing attachment:', { filePath, fileName, index });

  if (!filePath) {
    showNotification('❌ Chemin de fichier invalide', 'error');
    return;
  }

  const extension = (fileName?.split('.').pop() || '').toLowerCase();
  const isPdf = extension === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'].includes(extension);

  if (!isPdf && !isImage) {
    showNotification('⚠️ Impression disponible uniquement pour les PDF et images.', 'warning');
    return;
  }

  try {
    const result = await window.api.file.readAsDataURL(filePath);
    if (!result.success || !result.dataURL) {
      showNotification('❌ Impossible de charger le fichier pour impression', 'error');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showNotification('⚠️ Autorisez les pop-ups pour imprimer les pièces jointes.', 'warning');
      return;
    }

    const content = isPdf
      ? `<embed src="${result.dataURL}#toolbar=0&navpanes=0" type="application/pdf" style="width:100%;height:100%;" />`
      : `<img src="${result.dataURL}" alt="${escapeHTML(fileName)}" style="max-width:100%;max-height:100%;object-fit:contain;" />`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Impression - ${escapeHTML(fileName)}</title>
        <style>
          html, body { margin: 0; padding: 0; height: 100%; background: #111; }
          .wrapper { display: flex; align-items: center; justify-content: center; height: 100%; background: #fff; padding: 10px; box-sizing: border-box; }
          embed, img { box-shadow: 0 20px 45px rgba(15,23,42,0.25); background: #fff; }
          @media print { body { background: #fff; } .wrapper { box-shadow: none; padding: 0; } embed, img { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="wrapper">
          ${content}
        </div>
        <script>
          window.onload = function() {
            setTimeout(() => { window.print(); }, 400);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (error) {
    console.error('Error printing attachment:', error);
    showNotification('❌ Erreur lors de la préparation du fichier pour impression', 'error');
  }
}

// Add prescription to consultation
function addPrescriptionToConsultation(consultationId) {
  currentConsultationId = consultationId;
  pendingConsultationData = null;
  if (!prepareOrdonnanceModal()) {
    return;
  }
  showModal('modal-add-prescription');
}

// Edit consultation
async function editConsultation(consultationId) {
  try {
    const result = await window.api.consultation.getById(consultationId);
    if (result.success) {
      const c = result.data;
      resetPreparedConsultationAttachments();
      
      // Store consultation ID for update
      const consultationForm = document.getElementById('consultation-form');
      consultationForm.dataset.editId = consultationId;
      delete consultationForm.dataset.waitingRoomId;
      
      // Fill the form with existing data
      document.getElementById('consultation-patientId').value = c.patientId;
      document.getElementById('consultation-date').value = formatDateToInputValue(c.date);
      document.getElementById('consultation-type').value = c.type || 'Consultation générale';
      document.getElementById('consultation-reason').value = c.reason || '';
      document.getElementById('consultation-weight').value = c.weight || '';
      document.getElementById('consultation-height').value = c.height || '';
      document.getElementById('consultation-bloodPressure').value = c.bloodPressure || '';
      document.getElementById('consultation-temperature').value = c.temperature || '';
      document.getElementById('consultation-clinicalExamination').value = c.clinicalExamination || '';
      document.getElementById('consultation-diagnosis').value = c.diagnosis || '';
      const selectedKineId = c.kineId || '';
  const treatmentField = document.getElementById('consultation-treatment');
  if (treatmentField) treatmentField.value = c.treatment || '';
  const notesField = document.getElementById('consultation-notes');
  if (notesField) notesField.value = c.notes || '';

  const unpaidCheckbox = document.getElementById('consultation-unpaid');
  const unpaidDetails = document.getElementById('unpaid-details');
  const consultationPrice = document.getElementById('consultation-price');
  const unpaidAmount = document.getElementById('consultation-unpaid-amount');
  const unpaidDueDate = document.getElementById('consultation-unpaid-duedate');
  const paymentDraftNotes = document.getElementById('consultation-payment-note');
  if (unpaidCheckbox) unpaidCheckbox.checked = Boolean(c.isUnpaid);
  if (unpaidDetails) unpaidDetails.style.display = 'block';
  if (consultationPrice) consultationPrice.value = c.unpaidAmount || '';
  if (unpaidAmount) unpaidAmount.value = c.unpaidAmount || '';
  if (unpaidDueDate) unpaidDueDate.value = c.unpaidDueDate ? formatDateToInputValue(c.unpaidDueDate) : '';
  if (paymentDraftNotes) {
    paymentDraftNotes.value = '';
    paymentDraftNotes.dataset.userEdited = '0';
    paymentDraftNotes.dataset.autoValue = '';
  }
  wireConsultationPaymentHelpers();
      if (selectedKineId || parseConsultationActs(c.acts).includes('kine')) {
        await loadKineSelectOptions();
      }
      applyConsultationActsSelection(c.acts);
      syncConsultationPaymentDraftNotes(true);
      updateConsultationPaymentRequestVisibility();
      if (selectedKineId && document.getElementById('consultation-kine')) {
        document.getElementById('consultation-kine').value = selectedKineId;
      }
      
      setConsultationEditorMode(true);
      await loadConsultationEquipmentPicker(consultationId);
      
      showModal('modal-consultation');
    }
  } catch (error) {
    console.error('Error loading consultation for edit:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

// Delete consultation
async function deleteConsultation(consultationId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette consultation ?')) return;
  
  try {
    const result = await window.api.consultation.delete(consultationId);
    if (result.success) {
      showNotification('✅ Consultation supprimée', 'success');
      loadPatientConsultations(currentPatientId);
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting consultation:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

// --- Prescriptions ---

async function loadPatientPrescriptions(patientId, options = {}) {
  const tbody = document.getElementById('details-prescriptions-tbody');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    return;
  }

  const hasExistingContent = tbody.hasChildNodes() && tbody.innerHTML.trim() !== '' && !tbody.innerHTML.includes('Chargement...');
  if (Array.isArray(patientRecordsCache.prescriptions)) {
    renderPatientPrescriptions();
  } else if (!hasExistingContent) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Chargement...</td></tr>';
  }
  try {
    const currentPagination = patientRecordPagination.prescriptions;
    const filters = getPatientRecordsDateFilter();
    const result = await window.api.prescription.getByPatient({
      patientId,
      page: Number(options.page || currentPagination.page || 1),
      pageSize: currentPagination.pageSize,
      startDate: filters.start,
      endDate: filters.end,
      paginated: true
    });
    patientRecordsCache.prescriptions = result.success && Array.isArray(result.data) ? result.data : [];
    updatePatientRecordPagination('prescriptions', result.pagination);
  } catch (error) {
    console.error('Error loading prescriptions:', error);
    patientRecordsCache.prescriptions = [];
    updatePatientRecordPagination('prescriptions', null);
    showNotification('Erreur lors du chargement des ordonnances', 'error');
  }

  renderPatientPrescriptions();
}

function renderPatientPrescriptions() {
  const tbody = document.getElementById('details-prescriptions-tbody');
  if (!tbody) return;

  const data = Array.isArray(patientRecordsCache.prescriptions) ? patientRecordsCache.prescriptions : [];
  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="padding: 32px 16px;">
          <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="ant-empty-image" style="margin-bottom: 12px;">
              <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                <path d="M24 26h16M32 18v16" stroke="#1677ff" stroke-width="2"/>
                <line x1="20" y1="42" x2="44" y2="42"/>
              </svg>
            </div>
            <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucune ordonnance émise</div>
            <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Rédigez une prescription médicale pour ce patient.</div>
            <button type="button" class="btn btn-primary btn-small" onclick="openPatientPrescriptionModal()" style="display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouvelle Ordonnance
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = data.map((p) => {
    const meds = parseMedicationsField(p.medications);
    const medCount = meds.length;
    const rawDate = p.prescriptionDate || p.date || p.createdAt;
    const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString('fr-FR') : '-';
    return `
      <tr>
        <td><strong style="color: #0f172a;">${escapeHTML(formattedDate)}</strong></td>
        <td><span class="ant-tag ant-tag-processing" style="background: #e6f0ff; color: #1677ff; border-color: #91caff; font-size: 12.5px; font-weight: 600;">${escapeHTML(`${medCount} médicament${medCount > 1 ? 's' : ''}`)}</span></td>
        <td>
          <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
            <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="printPrescriptionDetails('${p.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              <span>Imprimer</span>
            </button>
            <button class="btn btn-secondary" title="Modifier" onclick="editPrescription('${p.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>Modifier</span>
            </button>
            <button type="button" class="btn" title="Supprimer" onclick="deletePrescription('${p.id}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml + buildPatientRecordPaginationRow('prescriptions', 3);
}

// View prescription details
async function viewPrescription(prescriptionId) {
  try {
    const result = await window.api.prescription.getById(prescriptionId);
    if (result.success) {
      const p = result.data;
      
  // Store current prescription ID for printing
  const scope = typeof window !== 'undefined' ? window : globalThis;
  scope.currentPrescriptionId = prescriptionId;
      
      const medications = Array.isArray(p.medications) ? p.medications : JSON.parse(p.medications || '[]');
      const rawDate = p.prescriptionDate || p.date || p.createdAt;
      const date = rawDate ? new Date(rawDate) : new Date();
      
      let medHTML = '';
      if (medications.length > 0) {
        medHTML = medications.map((m, idx) => `
          <div class="consultation-section" style="border-left: 4px solid #0d6efd;">
            <h4 style="margin-bottom: 10px; text-transform: uppercase;">${m.name || 'Médicament'}</h4>
            <div class="details-content" style="grid-template-columns: repeat(3, 1fr);">
              <div class="details-row">
                <span class="details-label">Prise</span>
                <span class="details-value">${m.intake || '-'}</span>
              </div>
              <div class="details-row">
                <span class="details-label">Durée</span>
                <span class="details-value">${m.duration || '-'}</span>
              </div>
              <div class="details-row">
                <span class="details-label">Boîtes</span>
                <span class="details-value">${m.boxes || '-'}</span>
              </div>
            </div>
            ${m.instructions ? `<p style="margin-top: 10px; font-style: italic;">${m.instructions}</p>` : ''}
          </div>
        `).join('');
      } else {
        medHTML = '<p style="color: var(--text-light);">Aucun médicament</p>';
      }
      
      const content = document.getElementById('prescription-details-content');
      content.innerHTML = `
        <div class="info-box">
          <h3 style="color: var(--primary-color); margin-bottom: 20px;">Ordonnance du ${date.toLocaleDateString('fr-FR')}</h3>
        </div>
        
        ${medHTML}
        
        ${p.notes ? `
          <div class="consultation-section">
            <h4>Instructions générales</h4>
            <p style="white-space: pre-wrap; line-height: 1.6;">${p.notes}</p>
          </div>
        ` : ''}
      `;
      
      // Update print button
      const printBtn = document.getElementById('btn-print-prescription');
      if (printBtn) {
        printBtn.onclick = () => printPrescriptionDetails(prescriptionId);
      }

      showModal('modal-view-prescription');
    }
  } catch (error) {
    console.error('Error viewing prescription:', error);
    showNotification('Erreur lors de la lecture de l\'ordonnance', 'error');
  }
}

// Delete prescription
async function deletePrescription(prescriptionId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette ordonnance ?')) return;
  
  try {
    const result = await window.api.prescription.delete(prescriptionId);
    if (result.success) {
      showNotification('✅ Ordonnance supprimée', 'success');
      loadPatientPrescriptions(currentPatientId);
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting prescription:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

// Edit prescription
async function editPrescription(prescriptionId) {
  try {
    const result = await window.api.prescription.getById(prescriptionId);
    if (!result.success) {
      showNotification('Erreur: Ordonnance introuvable', 'error');
      return;
    }
    
    const prescription = result.data;
    const medications = Array.isArray(prescription.medications) 
      ? prescription.medications 
      : JSON.parse(prescription.medications || '[]');

    editingPrescriptionId = prescriptionId;
    pendingConsultationData = null;

    const prescriptionDate = prescription.prescriptionDate || prescription.date || new Date().toISOString();
    updateOrdonnanceHeader(prescriptionDate);
    populateMedicationsForm(medications);

    const notesField = document.getElementById('prescription-general-notes');
    if (notesField) {
      notesField.value = prescription.notes || '';
    }

    const modalTitle = document.querySelector('#modal-add-prescription .modal-header h2');
    if (modalTitle) {
      modalTitle.textContent = '✏️ Modifier l\'Ordonnance';
    }

    showModal('modal-add-prescription');
  } catch (error) {
    console.error('Error loading prescription for edit:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

// --- Sick Leaves ---

async function loadPatientSickLeaves(patientId, options = {}) {
  const documentKind = options.documentKind || null;
  const tbodyId = options.tbodyId || 'details-sickleaves-tbody';
  // Use dedicated cache key for certificates vs arrêts to avoid shared-cache bug
  const cacheKey = options.cacheKey || (documentKind === 'certificate' ? 'certificates' : documentKind === 'workstop' ? 'workstops' : 'sickLeaves');
  const paginationKey = patientRecordPagination[cacheKey] ? cacheKey : 'sickLeaves';
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    return;
  }

  const hasExistingContent = tbody.hasChildNodes() && tbody.innerHTML.trim() !== '' && !tbody.innerHTML.includes('Chargement...');
  if (Array.isArray(patientRecordsCache[cacheKey])) {
    renderPatientSickLeaves(tbodyId, cacheKey, paginationKey);
  } else if (!hasExistingContent) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  }
  try {
    const currentPagination = patientRecordPagination[paginationKey];
    const filters = getPatientRecordsDateFilter();
    const result = await window.api.sickleave.getByPatient({
      patientId,
      page: Number(options.page || currentPagination.page || 1),
      pageSize: currentPagination.pageSize,
      startDate: filters.start,
      endDate: filters.end,
      documentKind,
      paginated: true
    });
    const records = result.success && Array.isArray(result.data) ? result.data : [];
    patientRecordsCache[cacheKey] = documentKind
      ? records.filter((record) => {
          const recordKind = record.documentKind === 'workstop' ? 'workstop' : 'certificate';
          return recordKind === documentKind;
        })
      : records;
    updatePatientRecordPagination(paginationKey, result.pagination);
  } catch (error) {
    console.error('Error loading sick leaves:', error);
    patientRecordsCache[cacheKey] = [];
    updatePatientRecordPagination(paginationKey, null);
    const label = documentKind === 'workstop' ? 'arrêts de travail' : 'certificats médicaux';
    showNotification(`Erreur lors du chargement des ${label}`, 'error');
  }

  renderPatientSickLeaves(tbodyId, cacheKey, paginationKey);
}

function renderPatientSickLeaves(tbodyId, cacheKey, paginationKey) {
  const resolvedCacheKey = cacheKey || 'sickLeaves';
  const resolvedPaginationKey = paginationKey || resolvedCacheKey;
  const tbody = document.getElementById(tbodyId || 'details-sickleaves-tbody');
  if (!tbody) return;

  const data = Array.isArray(patientRecordsCache[resolvedCacheKey]) ? patientRecordsCache[resolvedCacheKey] : [];
  const isWorkstop = resolvedCacheKey === 'workstops';
  const emptyLabel = isWorkstop ? 'Aucun arrêt de travail' : 'Aucun certificat médical';
  const emptyAction = isWorkstop ? 'showWorkStopForm()' : 'showSickLeaveForm()';
  const emptyBtnText = isWorkstop ? 'Nouvel arrêt de travail' : 'Nouveau certificat';
  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 32px 16px;">
          <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="ant-empty-image" style="margin-bottom: 12px;">
              <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                <line x1="20" y1="22" x2="44" y2="22"/>
                <line x1="20" y1="30" x2="44" y2="30"/>
                <line x1="20" y1="38" x2="32" y2="38"/>
              </svg>
            </div>
            <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">${escapeHTML(emptyLabel)}</div>
            <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Créez un document officiel pour ce patient.</div>
            <button type="button" class="btn btn-primary btn-small" onclick="${emptyAction}" style="display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              ${emptyBtnText}
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = data.map((s) => {
    const startDate = s.startDate ? new Date(s.startDate) : null;
    const endDate = s.endDate ? new Date(s.endDate) : null;
    const duration = startDate && endDate ? (Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1) : '-';
    const startLabel = startDate ? startDate.toLocaleDateString('fr-FR') : '-';
    const endLabel = endDate ? endDate.toLocaleDateString('fr-FR') : '-';
    const documentLabel = isWorkstop ? 'Arrêt de travail' : 'Certificat médical';
    const rawId = String(s.id || '');
    const safeIdAttr = escapeHTML(rawId);

    return `
      <tr>
        <td><strong style="color: #0f172a;">${escapeHTML(startLabel)}</strong></td>
        <td>${escapeHTML(endLabel)}</td>
        <td><span class="ant-tag ant-tag-processing" style="background: #e6f0ff; color: #1677ff; border-color: #91caff; font-weight: 600; font-size: 12.5px;">${escapeHTML(duration === '-' ? '-' : `${duration} jour${duration > 1 ? 's' : ''}`)}</span></td>
        <td>${escapeHTML(documentLabel)}</td>
        <td>
          <div class="table-actions" style="display: flex; flex-wrap: nowrap; gap: 8px; align-items: center; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" data-sickleave-action="print" data-id="${safeIdAttr}" title="Aperçu et Imprimer" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              <span>Imprimer</span>
            </button>
            <button type="button" class="btn btn-secondary" data-sickleave-action="edit" data-id="${safeIdAttr}" title="Modifier" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>Modifier</span>
            </button>
            <button type="button" class="btn" data-sickleave-action="delete" data-id="${safeIdAttr}" title="Supprimer" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml + buildPatientRecordPaginationRow(resolvedPaginationKey, 5);
}

function handleSickLeaveRowAction(action, id) {
  if (!action || !id) return;
  switch (action) {
    case 'view':
      printSickLeaveDetails(id);
      break;
    case 'print':
      printSickLeaveDetails(id);
      break;
    case 'edit':
      editSickLeave(id);
      break;
    case 'delete':
      deleteSickLeave(id);
      break;
    default:
      break;
  }
}

function handleSickLeaveTableClick(event) {
  const actionButton = event.target.closest('[data-sickleave-action]');
  if (!actionButton) return;

  event.preventDefault();
  const action = actionButton.getAttribute('data-sickleave-action');
  const id = actionButton.getAttribute('data-id');
  handleSickLeaveRowAction(action, id);
}

// Edit sick leave
async function editSickLeave(sickLeaveId) {
  try {
    const result = await window.api.sickleave.getById(sickLeaveId);
    if (!result?.success || !result.data) {
      showNotification(result?.error || 'Document médical introuvable', 'error');
      return;
    }
    if (result.success) {
      const sickLeave = result.data;

      if (typeof window.resetSickLeaveFormFields !== 'function') {
        throw new Error('Formulaire de document médical indisponible');
      }
      window.resetSickLeaveFormFields();

      const form = document.getElementById('sickleave-form');
      if (form) {
        form.dataset.editId = sickLeaveId;
        form.dataset.consultationId = sickLeave.consultationId || '';
      }

      const patientInput = document.getElementById('sickleave-patient-id');
      if (patientInput) {
        patientInput.value = sickLeave.patientId;
      }

      const startInput = document.getElementById('sickleave-start-date');
      if (startInput) {
        startInput.value = formatDateToInputValue(sickLeave.startDate);
      }

      const endInput = document.getElementById('sickleave-end-date');
      if (endInput) {
        endInput.value = formatDateToInputValue(sickLeave.endDate);
      }

      const templateFields = parseSickLeaveTemplateMetadata(sickLeave.cim10Code) || {
        careText: '',
        restDays: sickLeave.numberOfDays ? String(sickLeave.numberOfDays) : '',
        ippEstimate: ''
      };

      hydrateSickLeaveTemplateFields(templateFields, sickLeave);
      handleSickLeaveDateChange();

      const allowedCheckbox = document.getElementById('sickleave-allowed-outings');
      if (allowedCheckbox) {
        allowedCheckbox.checked = Boolean(sickLeave.allowedOutings);
      }

      if (typeof updateSickLeavePreview === 'function') {
        updateSickLeavePreview();
      }

      // Set document kind from the record so the save path knows which type this is
      const docKind = sickLeave.documentKind === 'workstop' ? 'workstop' : 'certificate';
      if (form) form.dataset.documentKind = docKind;

      const modalTitle = document.querySelector('#modal-add-sickleave .modal-header h2');
      if (modalTitle) modalTitle.textContent = docKind === 'workstop' ? '✏️ Modifier l\'arrêt de travail' : '✏️ Modifier le certificat médical';

      showModal('modal-add-sickleave');
    }
  } catch (error) {
    console.error('Error loading sick leave for edit:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

// Delete sick leave
async function deleteSickLeave(sickLeaveId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce document médical ?')) return;
  
  try {
    const result = await window.api.sickleave.delete(sickLeaveId);
    if (result.success) {
      showNotification('✅ Document supprimé', 'success');
      if (currentPatientId) {
        // Refresh the active sick-leave tab (certificats or arrêts) with correct cache key
        const activeTab = document.querySelector('#patient-details .tab-content.active');
        if (activeTab?.id === 'tab-arrets') {
          await loadPatientSickLeaves(currentPatientId, { documentKind: 'workstop', tbodyId: 'details-arrets-tbody', cacheKey: 'workstops' });
        } else if (activeTab?.id === 'tab-certificats') {
          await loadPatientSickLeaves(currentPatientId, { documentKind: 'certificate', tbodyId: 'details-certificats-tbody', cacheKey: 'certificates' });
        } else {
          await loadPatientSickLeaves(currentPatientId);
        }
      }
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting sick leave:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

// Add sick leave to consultation
function addSickLeaveToConsultation(consultationId) {
  // Store consultation ID to link sick leave
  sessionStorage.setItem('linkedConsultationId', consultationId);
  closeModal('modal-consultation');
  openNewSickLeaveModal();
}

function openNewSickLeaveModal() {
  if (!currentPatientId) return;
  if (typeof window.resetSickLeaveFormFields !== 'function') {
    showNotification('Formulaire de document médical indisponible', 'error');
    return;
  }
  window.resetSickLeaveFormFields({ prefillDates: true });
  showModal('modal-add-sickleave');
}

// --- Appointments ---

const DEFAULT_APPOINTMENT_TICKET_PHONE = '0542893268';

function getAppointmentTicketDateObject(appointment) {
  const rawValue = appointment?.appointmentDateTime || appointment?.date;
  if (!rawValue) return null;
  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAppointmentTicketDate(appointment) {
  const date = getAppointmentTicketDateObject(appointment);
  if (!date) return '-';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatAppointmentTicketShortDate(appointment) {
  const date = getAppointmentTicketDateObject(appointment);
  if (!date) return '-';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatAppointmentTicketWeekday(appointment) {
  const date = getAppointmentTicketDateObject(appointment);
  if (!date) return '-';
  return date.toLocaleDateString('fr-FR', { weekday: 'long' });
}

function formatAppointmentTicketTime(appointment) {
  if (appointment?.time) return appointment.time;
  const date = getAppointmentTicketDateObject(appointment);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildAppointmentTicketHtml(appointment, settings = {}, shareData = null, options = {}) {
  const autoPrint = options.autoPrint !== false;
  const patientName = escapeHTML(appointment.patientName || `${appointment.firstName || ''} ${appointment.lastName || ''}`.trim() || 'Patient');
  const cabinetName = escapeHTML(cleanTextValue(settings.cabinetName, 'Cabinet medical'));
  const cabinetPhone = escapeHTML(cleanTextValue(settings.cabinetPhone, DEFAULT_APPOINTMENT_TICKET_PHONE));
  const doctorName = escapeHTML(cleanTextValue(settings.doctorName, 'Cabinet medical'));
  const appointmentType = escapeHTML(cleanTextValue(appointment.type || appointment.appointmentType, 'Consultation'));
  const appointmentReason = escapeHTML(cleanTextValue(appointment.reason, 'Non precise'));
  const appointmentNotes = escapeHTML(cleanTextValue(appointment.notes, 'Aucune note'));
  const appointmentStatus = escapeHTML(cleanTextValue(formatAppointmentStatusLabel(appointment.status), 'Planifie'));
  const patientPhone = escapeHTML(cleanTextValue(appointment.phone, '-'));
  const patientEmail = escapeHTML(cleanTextValue(appointment.email, '-'));
  const createdAt = formatDateToDDMMYYYY(appointment.createdAt) || new Date().toLocaleDateString('fr-FR');
  const ticketCode = escapeHTML(formatAppointmentDailyTicketCode(appointment));
  const appointmentDateLabel = escapeHTML(formatAppointmentTicketDate(appointment));
  const appointmentShortDate = escapeHTML(formatAppointmentTicketShortDate(appointment));
  const appointmentWeekday = escapeHTML(formatAppointmentTicketWeekday(appointment));
  const appointmentTime = escapeHTML(formatAppointmentTicketTime(appointment));
  const bookingQrBlock = shareData?.qrDataUrl && shareData?.publicUrl
    ? `
        <div class="qr-box">
          <img src="${shareData.qrDataUrl}" alt="QR rendez-vous">
          <div class="qr-caption">Prendre un autre rendez-vous</div>
          <div class="qr-link">${escapeHTML(shareData.publicUrl)}</div>
        </div>
      `
    : '';

  return `<!DOCTYPE html>
  <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Ticket RDV</title>
      <style>
        @page {
          size: A5 portrait;
          margin: 0;
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          width: 148mm;
          min-height: 210mm;
          padding: 0;
          font-family: "Segoe UI", Tahoma, Arial, sans-serif;
          background: #ffffff;
          color: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ticket {
          width: 72mm;
          margin: 0 auto;
        }

        .ticket-header {
          text-align: center;
          padding-bottom: 10px;
          border-bottom: 2px dashed #94a3b8;
          margin-bottom: 10px;
        }

        .ticket-header h1 {
          margin: 0;
          font-size: 18px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .ticket-header p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #334155;
        }

        .ticket-code {
          display: inline-block;
          margin-top: 8px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 11px;
          font-weight: 700;
        }

        .ticket-highlight {
          margin: 12px 0 14px;
          padding: 12px;
          border-radius: 14px;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border: 1px solid #bfdbfe;
          text-align: center;
        }

        .ticket-highlight strong {
          display: block;
          font-size: 18px;
          color: #0f172a;
          text-transform: capitalize;
          margin-bottom: 2px;
        }

        .ticket-highlight span {
          display: block;
          font-size: 12px;
          color: #1e40af;
          font-weight: 700;
          letter-spacing: 0.4px;
        }

        .qr-box {
          margin: 12px 0;
          padding: 12px 0 2px;
          border-top: 1px dashed #cbd5e1;
          text-align: center;
        }

        .qr-box img {
          width: 108px;
          height: 108px;
          object-fit: contain;
        }

        .qr-caption {
          margin-top: 6px;
          font-size: 11px;
          font-weight: 700;
          color: #0f172a;
        }

        .qr-link {
          margin-top: 4px;
          font-size: 9px;
          color: #64748b;
          word-break: break-all;
        }

        .section {
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px dashed #cbd5e1;
        }

        .section:last-of-type {
          border-bottom: none;
        }

        .row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 6px;
          font-size: 12px;
        }

        .row strong {
          color: #475569;
          font-weight: 700;
        }

        .row span:last-child {
          text-align: right;
          font-weight: 600;
          color: #0f172a;
        }

        .note {
          margin-top: 12px;
          padding: 10px;
          border-radius: 10px;
          background: #eff6ff;
          color: #1e3a8a;
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
        }

        .footer {
          margin-top: 12px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="ticket-header">
          <h1>${cabinetName}</h1>
          <p>${doctorName}</p>
          <p>Telephone : ${cabinetPhone}</p>
          <span class="ticket-code">Numero ticket ${ticketCode}</span>
        </div>

        <div class="ticket-highlight">
          <strong>${appointmentWeekday}</strong>
          <span>${appointmentShortDate} • ${appointmentTime}</span>
        </div>

        <div class="section">
          <div class="row"><strong>Patient</strong><span>${patientName}</span></div>
          <div class="row"><strong>Telephone</strong><span>${patientPhone}</span></div>
          <div class="row"><strong>Email</strong><span>${patientEmail}</span></div>
        </div>

        <div class="section">
          <div class="row"><strong>Date</strong><span>${appointmentDateLabel}</span></div>
          <div class="row"><strong>Heure</strong><span>${appointmentTime}</span></div>
          <div class="row"><strong>Type</strong><span>${appointmentType}</span></div>
          <div class="row"><strong>Statut</strong><span>${appointmentStatus}</span></div>
        </div>

        <div class="section">
          <div class="row"><strong>Motif</strong><span>${appointmentReason}</span></div>
          <div class="row"><strong>Notes</strong><span>${appointmentNotes}</span></div>
          <div class="row"><strong>Cree le</strong><span>${escapeHTML(createdAt)}</span></div>
        </div>

        ${bookingQrBlock}

        <div class="note">
          Merci de conserver ce ticket.<br>
          Merci d'arriver 10 minutes avant votre rendez-vous.
        </div>

        <div class="footer">
          Impression automatique du ticket de rendez-vous
        </div>
      </div>
      ${autoPrint ? `<script>
        window.onload = () => {
          setTimeout(() => window.print(), 300);
        };
      </script>` : ''}
    </body>
  </html>`;
}

async function printAppointmentTicket(appointmentRef) {
  try {
    let appointment = appointmentRef;

    if (!appointment || typeof appointment === 'string') {
      const appointmentResult = await window.api.appointment.getById(appointmentRef);
      if (!appointmentResult.success || !appointmentResult.data) {
        showNotification('Impossible de charger le ticket du rendez-vous', 'error');
        return false;
      }
      appointment = appointmentResult.data;
    }

    const settingsResult = await window.api.settings.get();
    const settings = settingsResult.success ? (settingsResult.data || {}) : {};
    const shareDataResult = window.api.publicBooking
      ? await window.api.publicBooking.getShareData()
      : { success: false };
    const shareData = shareDataResult.success ? shareDataResult.data : null;
    if (!window.api?.print?.html) {
      showNotification('Impression du ticket non disponible', 'error');
      return false;
    }

    const printResult = await window.api.print.html({
      html: buildAppointmentTicketHtml(appointment, settings, shareData),
      pageSize: 'A5',
      documentTitle: 'Ticket RDV',
      printerType: 'thermal',
      printerName: settings.preferredThermalPrinter || ''
    });

    if (!printResult?.success) {
      showNotification(printResult?.error || 'Erreur lors de l\'impression du ticket', 'error');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error printing appointment ticket:', error);
    showNotification('Erreur lors de l\'impression du ticket', 'error');
    return false;
  }
}

async function previewAppointmentTicket(appointmentRef) {
  try {
    let appointment = appointmentRef;
    if (!appointment || typeof appointment === 'string') {
      const appointmentResult = await window.api.appointment.getById(appointmentRef);
      if (!appointmentResult.success || !appointmentResult.data) {
        showNotification('Impossible de charger le rendez-vous', 'error');
        return false;
      }
      appointment = appointmentResult.data;
    }
    const settingsResult = await window.api.settings.get();
    const settings = settingsResult.success ? (settingsResult.data || {}) : {};
    const shareDataResult = window.api.publicBooking
      ? await window.api.publicBooking.getShareData()
      : { success: false };
    const shareData = shareDataResult.success ? shareDataResult.data : null;
    const openPreview = sharedPrintScope?.openPreparedPrintWindow;
    if (typeof openPreview !== 'function') {
      showNotification('Aperçu du rendez-vous indisponible', 'error');
      return false;
    }
    return openPreview(buildAppointmentTicketHtml(appointment, settings, shareData, { autoPrint: false }), {
      pageSize: 'A5',
      documentTitle: 'Ticket RDV',
      printerType: 'thermal',
      printerName: settings.preferredThermalPrinter || ''
    });
  } catch (error) {
    console.error('Error previewing appointment ticket:', error);
    showNotification('Erreur lors de l’aperçu du rendez-vous', 'error');
    return false;
  }
}

async function loadPatientAppointmentsLegacy(patientId) {
  const tbody = document.getElementById('details-appointments-tbody');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  try {
    const result = await window.api.appointment.getByPatient(patientId);
    patientRecordsCache.appointments = result.success && Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error('Error loading appointments:', error);
    patientRecordsCache.appointments = [];
    showNotification('Erreur lors du chargement des rendez-vous', 'error');
  }

  renderPatientAppointments();
}

function renderPatientAppointmentsLegacy() {
  const tbody = document.getElementById('details-appointments-tbody');
  if (!tbody) return;

  const allData = Array.isArray(patientRecordsCache.appointments) ? patientRecordsCache.appointments : [];
  const data = filterPatientRecordsByDate(allData, (a) => a.date || a.appointmentDateTime || a.createdAt);
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Aucun rendez-vous</td></tr>';
    return;
  }

  const rowsHtml = data.map((a) => {
    const dateLabel = a.date ? new Date(a.date).toLocaleDateString('fr-FR') : '-';
    const timeLabel = a.time || '-';
    const reason = a.reason || a.type || '-';
    const status = formatAppointmentStatusLabel(a.status);
    const statusKey = String(a.status || 'scheduled').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return `
      <tr>
        <td>${escapeHTML(dateLabel)}</td>
        <td>${escapeHTML(timeLabel)}</td>
        <td>${escapeHTML(reason)}</td>
        <td><span class="appointment-status-pill appointment-status-pill-${statusKey}">${escapeHTML(status)}</span></td>
        <td>
          <div class="table-actions consultation-table-actions">
            <button class="btn btn-tiny btn-secondary consultation-action-chip consultation-action-chip-icon" onclick="previewAppointmentTicket('${a.id}')" title="Aperçu du ticket">👁️</button>
            <button class="btn btn-tiny btn-primary consultation-action-chip" onclick="printAppointmentTicket('${a.id}')" title="Imprimer le ticket du rendez-vous">Ticket</button>
            <button class="btn btn-tiny btn-danger consultation-action-chip" onclick="deleteAppointment('${a.id}')" title="Supprimer le rendez-vous">Supprimer</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

async function loadPatientAppointments(patientId) {
  const tbody = document.getElementById('details-appointments-tbody');
  if (!tbody) return;

  if (!patientId) {
    updatePatientRecordPagination('appointments', null);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Selectionnez un patient</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  try {
    const result = await window.api.appointment.getByPatient(patientId);
    patientRecordsCache.appointments = result.success && Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error('Error loading appointments:', error);
    patientRecordsCache.appointments = [];
    updatePatientRecordPagination('appointments', null);
    showNotification('Erreur lors du chargement des rendez-vous', 'error');
  }

  renderPatientAppointments();
}

function renderPatientAppointments() {
  const tbody = document.getElementById('details-appointments-tbody');
  if (!tbody) return;

  const allData = Array.isArray(patientRecordsCache.appointments) ? patientRecordsCache.appointments : [];
  const data = filterPatientRecordsByDate(allData, (a) => a.date || a.appointmentDateTime || a.createdAt);

  if (!data.length) {
    updatePatientRecordPagination('appointments', null);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 32px 16px;">
          <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="ant-empty-image" style="margin-bottom: 12px;">
              <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                <line x1="12" y1="22" x2="52" y2="22"/>
                <line x1="22" y1="6" x2="22" y2="12" stroke="#1677ff" stroke-width="2"/>
                <line x1="42" y1="6" x2="42" y2="12" stroke="#1677ff" stroke-width="2"/>
                <circle cx="24" cy="32" r="2" fill="#1677ff"/>
                <circle cx="32" cy="32" r="2" fill="#1677ff"/>
                <circle cx="40" cy="32" r="2" fill="#1677ff"/>
              </svg>
            </div>
            <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucun rendez-vous planifié</div>
            <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Planifiez un prochain rendez-vous ou une consultation de contrôle.</div>
            <button type="button" class="btn btn-primary btn-small" onclick="openNewAppointmentModal()" style="display: inline-flex; align-items: center; gap: 5px;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau RDV
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const pagination = patientRecordPagination.appointments || {
    page: 1,
    pageSize: PATIENT_RECORD_PAGE_SIZES.appointments || 5,
    total: 0,
    totalPages: 1
  };
  const pageSize = Number(pagination.pageSize || PATIENT_RECORD_PAGE_SIZES.appointments || 5);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(pagination.page || 1)), totalPages);
  updatePatientRecordPagination('appointments', {
    page: currentPage,
    pageSize,
    total: data.length,
    totalPages
  });

  const startIndex = (currentPage - 1) * pageSize;
  const pageRows = data.slice(startIndex, startIndex + pageSize);

  const rowsHtml = pageRows.map((a) => {
    const dateLabel = a.date ? new Date(a.date).toLocaleDateString('fr-FR') : '-';
    const timeLabel = a.time || '-';
    const reason = a.reason || a.type || '-';
    const status = formatAppointmentStatusLabel(a.status);
    const statusKey = String(a.status || 'scheduled').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return `
      <tr>
        <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
        <td><span style="font-weight: 600; color: #475569;">${escapeHTML(timeLabel)}</span></td>
        <td>${escapeHTML(reason)}</td>
        <td><span class="appointment-status-pill appointment-status-pill-${statusKey}">${escapeHTML(status)}</span></td>
        <td>
          <div class="table-actions" style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-tiny btn-secondary" onclick="printAppointmentTicket('${a.id}')" title="Imprimer le ticket du rendez-vous" style="display: inline-flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Ticket
            </button>
            <button class="btn btn-tiny" onclick="deleteAppointment('${a.id}')" title="Supprimer le rendez-vous" style="background: #fff1f0; border: 1px solid #ffa39e; color: #e11d48; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border-radius: 4px;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml + buildPatientRecordPaginationRow('appointments', 5);
}

async function openNewAppointmentModal() {
  if (!currentPatientId) return;
  document.getElementById('appointment-form').reset();
  document.getElementById('appointment-patientId').value = currentPatientId;
  document.getElementById('appointment-date').valueAsDate = new Date();
  const printTicketCheckbox = document.getElementById('appointment-print-ticket');
  if (printTicketCheckbox) {
    const settingsResult = await window.api.settings.get();
    const settings = settingsResult?.success ? settingsResult.data || {} : {};
    printTicketCheckbox.checked = settings.autoPrintAppointmentTicket === true || settings.autoPrintAppointmentTicket === 1;
  }
  showModal('modal-appointment');
}

function formatAppointmentStatusLabel(status) {
  const labels = {
    scheduled: 'Planifié',
    pending: 'En attente',
    confirmed: 'Confirmé',
    completed: 'Terminé',
    cancelled: 'Annulé',
    no_show: 'Absent'
  };
  return labels[String(status || 'scheduled').toLowerCase()] || (status || 'Planifié');
}

async function saveAppointment(e) {
  e.preventDefault();
  
  // Get patientId from select or hidden input
  let patientId = document.getElementById('appointment-patient-select')?.value;
  const appointmentPatientSearch = document.getElementById('appointment-patient-search');
  if (!patientId && !appointmentPatientSearch) {
    patientId = document.getElementById('appointment-patientId')?.value;
  }
  
  if (!patientId) {
    showNotification('❌ Veuillez sélectionner un patient', 'error');
    return;
  }
  
  const formData = {
    patientId: patientId,
    date: document.getElementById('appointment-date').value,
    time: document.getElementById('appointment-time').value,
    type: document.getElementById('appointment-type')?.value || 'Consultation',
    duration: parseInt(document.getElementById('appointment-duration')?.value) || 30,
    reason: document.getElementById('appointment-reason').value,
    notes: document.getElementById('appointment-notes').value
  };
  const shouldPrintTicket = document.getElementById('appointment-print-ticket')?.checked === true;

  try {
    const result = await window.api.appointment.create(formData);
    if (result.success) {
      const appointmentLabel = result.smsResult?.success ? '✅ Rendez-vous enregistré et SMS envoyé' : '✅ Rendez-vous enregistré';
      showNotification(appointmentLabel, 'success');
      closeModal('modal-appointment');
      
      // Refresh calendar if available
      if (window.refreshCalendar) {
        await window.refreshCalendar();
      }
      
      // Refresh patient appointments if viewing patient
      if (currentPatientId) {
        await loadPatientAppointments(currentPatientId);
      }

      if (shouldPrintTicket) {
        await printAppointmentTicket(result.data || result.id);
      }

      if (result.smsResult && !result.smsResult.success && !result.smsResult.skipped) {
        showNotification(`⚠️ RDV enregistré, mais le SMS a échoué: ${result.smsResult.error || 'Erreur inconnue'}`, 'warning');
      } else if (result.smsResult?.skipped && /Numero du patient/i.test(result.smsResult.reason || '')) {
        showNotification('ℹ️ RDV enregistré, mais aucun numéro patient n\'est disponible pour le SMS', 'warning');
      }
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error saving appointment:', error);
    showNotification('Erreur lors de l\'enregistrement', 'error');
  }
}

async function deleteAppointment(id) {
  if (confirm('Êtes-vous sûr de vouloir supprimer ce rendez-vous ?')) {
    try {
      const result = await window.api.appointment.delete(id);
      if (result.success) {
        showNotification('✅ Rendez-vous supprimé', 'success');
        loadPatientAppointments(currentPatientId);
      } else {
        showNotification('❌ Erreur: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('Error deleting appointment:', error);
    }
  }
}

// ==================== AI RAPPORT GENERATION ====================
/**
 * Generate an AI-powered medical report (compte rendu) from consultation data
 */
async function generateAIRapport() {
  // Collect consultation data from the form
  const patientId = document.getElementById('consultation-patientId').value;
  const consultationType = document.getElementById('consultation-type').value;
  const reason = document.getElementById('consultation-reason').value;
  const weight = document.getElementById('consultation-weight').value;
  const height = document.getElementById('consultation-height').value;
  const bloodPressure = document.getElementById('consultation-bloodPressure').value;
  const temperature = document.getElementById('consultation-temperature').value;
  const clinicalExam = document.getElementById('consultation-clinicalExamination').value;
  const diagnosis = document.getElementById('consultation-diagnosis').value;
  
  // Collect acts
  const actsCheckboxes = document.querySelectorAll('input[name="acts"]:checked');
  const acts = Array.from(actsCheckboxes).map(cb => cb.value);
  
  // Get patient info if available
  let patientInfo = '';
  if (patientId && currentPatient) {
    patientInfo = `Patient: ${currentPatient.lastName || ''} ${currentPatient.firstName || ''}, ${currentPatient.age || ''} ans`;
  }
  
  // Build the prompt for AI
  const consultationData = {
    patientInfo,
    type: consultationType,
    motif: reason,
    poids: weight ? `${weight} kg` : '',
    taille: height ? `${height} cm` : '',
    tension: bloodPressure || '',
    temperature: temperature ? `${temperature}°C` : '',
    examenClinique: clinicalExam || '',
    diagnostic: diagnosis || '',
    actes: acts.join(', ')
  };
  
  // Check if there's enough data
  if (!reason && !clinicalExam && !diagnosis) {
    showNotification('⚠️ Veuillez remplir au moins le motif, l\'examen clinique ou le diagnostic', 'warning');
    return;
  }
  
  // Show loading
  showNotification('🤖 Génération du rapport en cours...', 'info');
  
  try {
    // Check if AI is available
    const aiStatus = await window.api.ollama.getStatus();
    
    if (!aiStatus || !aiStatus.available) {
      // Show manual template if AI not available
      showManualRapportTemplate(consultationData);
      return;
    }
    
    // Generate with AI
    const prompt = buildRapportPrompt(consultationData);
    
    // Use timeout for AI response
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 60000)
    );
    
    const rapportPromise = window.api.ollama.generateReport({
      type: 'compte-rendu',
      data: consultationData,
      prompt: prompt
    });
    
    const result = await Promise.race([rapportPromise, timeoutPromise]);
    
    if (result && result.success && result.report) {
      // Display the generated report in a modal
      showGeneratedRapport(result.report, consultationData);
    } else {
      // Fallback to template
      showManualRapportTemplate(consultationData);
    }
    
  } catch (error) {
    console.error('Error generating AI rapport:', error);
    if (error.message === 'Timeout') {
      showNotification('⏱️ L\'IA prend trop de temps. Utilisation du modèle standard.', 'warning');
    }
    // Fallback to manual template
    showManualRapportTemplate(consultationData);
  }
}

/**
 * Build prompt for rapport generation
 */
function buildRapportPrompt(data) {
  const specialtyMeta = typeof getActivePracticeSpecialtyMeta === 'function'
    ? getActivePracticeSpecialtyMeta(window._packageConfig)
    : {
        aiPromptIntro: 'Tu es un médecin généraliste. Génère un compte rendu de consultation professionnel et concis en français.',
        report: {
          objectTitle: 'Motif',
          findingsTitle: 'Examen clinique',
          careTitle: 'Conduite à tenir',
          conclusionTitle: 'Conclusion'
        }
      };
  return `${specialtyMeta.aiPromptIntro}

Informations de la consultation:
- ${data.patientInfo}
- Type: ${data.type}
- Motif: ${data.motif}
- Constantes: Poids ${data.poids}, Taille ${data.taille}, TA ${data.tension}, T° ${data.temperature}
- Examen clinique: ${data.examenClinique}
- Diagnostic: ${data.diagnostic}
- Actes réalisés: ${data.actes}

Génère un compte rendu structuré avec: ${specialtyMeta.report.objectTitle}, ${specialtyMeta.report.findingsTitle}, ${specialtyMeta.report.careTitle}, ${specialtyMeta.report.conclusionTitle}.
Sois concis et professionnel. Réponds uniquement avec le compte rendu, sans commentaires.`;
}

/**
 * Show generated rapport in modal
 */
function showGeneratedRapport(rapportText, data) {
  const modalHtml = `
    <div id="modal-ai-rapport" class="modal active" style="display: flex;">
      <div class="modal-overlay" onclick="closeModal('modal-ai-rapport')"></div>
      <div class="modal-content" style="max-width: 700px; max-height: 85vh;">
        <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white;">
          <h2>🤖 Compte Rendu Généré par IA</h2>
          <button class="close-btn" onclick="closeModal('modal-ai-rapport')" style="color: white;">&times;</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div style="background: #f5f3ff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #8b5cf6;">
            <p style="margin: 0; font-size: 13px; color: #6d28d9;">
              <strong>ℹ️ Note:</strong> Ce rapport a été généré automatiquement. Veuillez le vérifier et le modifier si nécessaire avant utilisation.
            </p>
          </div>
          <textarea id="ai-rapport-text" class="form-control" style="min-height: 300px; font-family: 'Georgia', serif; font-size: 14px; line-height: 1.6;">${rapportText}</textarea>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: space-between;">
          <button class="btn btn-secondary" onclick="closeModal('modal-ai-rapport')">Fermer</button>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-info" onclick="copyRapportToClipboard()" style="background: #3b82f6;">📋 Copier</button>
            <button class="btn btn-success" onclick="insertRapportToConsultation()">✅ Insérer dans Diagnostic</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  const existingModal = document.getElementById('modal-ai-rapport');
  if (existingModal) existingModal.remove();
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Show manual template when AI is not available
 */
function showManualRapportTemplate(data) {
  const specialtyMeta = typeof getActivePracticeSpecialtyMeta === 'function'
    ? getActivePracticeSpecialtyMeta(window._packageConfig)
    : {
        report: {
          printTitle: 'COMPTE RENDU DE CONSULTATION',
          objectTitle: 'MOTIF DE CONSULTATION',
          findingsTitle: 'EXAMEN CLINIQUE',
          careTitle: 'CONDUITE À TENIR',
          conclusionTitle: 'CONCLUSION'
        }
      };
  const template = `${specialtyMeta.report.printTitle}

Patient: ${data.patientInfo}
Date: ${new Date().toLocaleDateString('fr-FR')}
Type: ${data.type}

${specialtyMeta.report.objectTitle.toUpperCase()}:
${data.motif || '...'}

${specialtyMeta.report.findingsTitle.toUpperCase()}:
- Constantes: ${data.poids ? 'Poids: ' + data.poids + ', ' : ''}${data.taille ? 'Taille: ' + data.taille + ', ' : ''}${data.tension ? 'TA: ' + data.tension + ', ' : ''}${data.temperature ? 'T°: ' + data.temperature : ''}
${data.examenClinique || '...'}

DIAGNOSTIC:
${data.diagnostic || '...'}

ACTES RÉALISÉS:
${data.actes || 'Consultation'}

${specialtyMeta.report.careTitle.toUpperCase()}:
...

${specialtyMeta.report.conclusionTitle.toUpperCase()}:
...`;

  showGeneratedRapport(template, data);
  showNotification('📝 Modèle standard chargé (IA non disponible)', 'info');
}

/**
 * Copy rapport to clipboard
 */
function copyRapportToClipboard() {
  const textarea = document.getElementById('ai-rapport-text');
  if (textarea) {
    textarea.select();
    document.execCommand('copy');
    showNotification('📋 Rapport copié dans le presse-papier', 'success');
  }
}

/**
 * Insert rapport into consultation diagnosis field
 */
function insertRapportToConsultation() {
  const rapportText = document.getElementById('ai-rapport-text')?.value;
  const diagnosisField = document.getElementById('consultation-diagnosis');
  
  if (rapportText && diagnosisField) {
    diagnosisField.value = rapportText;
    closeModal('modal-ai-rapport');
    showNotification('✅ Rapport inséré dans le diagnostic', 'success');
  }
}

// Make functions global
window.generateAIRapport = generateAIRapport;
window.copyRapportToClipboard = copyRapportToClipboard;
window.insertRapportToConsultation = insertRapportToConsultation;
window.openAttachment = openAttachment;
window.downloadAttachment = downloadAttachment;
window.printAttachment = printAttachment;
window.getFileIcon = getFileIcon;
window.removeConsultationAttachment = removeConsultationAttachment;

// ========== PATIENT DENTAL TAB ==========
// Embedded dental chart and treatments within patient details

async function loadPatientDentalTab(patientId) {
  if (!patientId) return;
  try {
    // Load stats
    const statsResult = await window.api.dental.getStats(patientId);
    if (statsResult.success && statsResult.data) {
      const s = statsResult.data;
      const el = (id) => document.getElementById(id);
      if (el('pd-dental-treatments')) el('pd-dental-treatments').textContent = s.totalTreatments || 0;
      if (el('pd-dental-cost')) el('pd-dental-cost').textContent = (s.totalCost || 0).toLocaleString() + ' DA';
      if (el('pd-dental-unpaid')) el('pd-dental-unpaid').textContent = (s.unpaidAmount || 0).toLocaleString() + ' DA';
      if (el('pd-dental-teeth')) el('pd-dental-teeth').textContent = s.teethAffected || 0;
    }

    // Load teeth for mini chart
    const teethResult = await window.api.dental.getTeeth(patientId);
    const teethMap = {};
    if (teethResult.success && teethResult.data) {
      teethResult.data.forEach(t => { teethMap[t.toothNumber] = t; });
    }
    renderMiniDentalChart(teethMap);

    // Load treatments
    const treatResult = await window.api.dental.getTreatments(patientId);
    renderPatientDentalTreatments(treatResult.success ? treatResult.data : [], patientId);

    // Load images
    const imgResult = await window.api.dental.getXrays(patientId);
    renderPatientDentalImages(imgResult.success ? imgResult.data : []);

  } catch (e) {
    console.error('Error loading dental tab:', e);
  }
}

function renderMiniDentalChart(teethMap) {
  const container = document.getElementById('pd-dental-chart-mini');
  if (!container) return;

  const STATUSES = {
    healthy:    { color: '#e8f5e9', border: '#4caf50', icon: '✓', tc: '#2e7d32' },
    cavity:     { color: '#fff3e0', border: '#ff9800', icon: '●', tc: '#e65100' },
    filled:     { color: '#e3f2fd', border: '#2196f3', icon: '■', tc: '#1565c0' },
    crown:      { color: '#f3e5f5', border: '#9c27b0', icon: '♛', tc: '#6a1b9a' },
    bridge:     { color: '#e8eaf6', border: '#3f51b5', icon: '⌒', tc: '#283593' },
    rootCanal:  { color: '#fce4ec', border: '#e91e63', icon: '✕', tc: '#c62828' },
    extraction: { color: '#ffebee', border: '#f44336', icon: '∅', tc: '#b71c1c' },
    implant:    { color: '#e0f7fa', border: '#00bcd4', icon: '⬡', tc: '#00838f' },
    missing:    { color: '#f5f5f5', border: '#9e9e9e', icon: '—', tc: '#616161' },
    fractured:  { color: '#fff8e1', border: '#ffc107', icon: '⚡', tc: '#f57f17' },
    abscess:    { color: '#fbe9e7', border: '#ff5722', icon: '!', tc: '#bf360c' },
    impacted:   { color: '#efebe9', border: '#795548', icon: '↓', tc: '#4e342e' },
    prosthesis: { color: '#e1f5fe', border: '#03a9f4', icon: '◊', tc: '#01579b' }
  };

  const upper = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  const lower = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

  function toothCell(num) {
    const data = teethMap[num];
    const status = data ? data.status : 'healthy';
    const si = STATUSES[status] || STATUSES.healthy;
    const gone = (status === 'extraction' || status === 'missing');
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer" onclick="goToFullDentalChartTooth(' + num + ')" title="Dent ' + num + ' - ' + (si.icon) + '">' +
      '<div style="width:28px;height:28px;border-radius:5px;background:' + si.color + ';border:1.5px solid ' + si.border + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:' + si.tc + ';' + (gone ? 'opacity:0.5;' : '') + '">' + si.icon + '</div>' +
      '<span style="font-size:9px;color:#6b7280;font-weight:600">' + num + '</span></div>';
  }

  container.innerHTML =
    '<div style="background:#fafbfc;border:1px solid #e5e7eb;border-radius:12px;padding:16px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;font-weight:600;color:#9ca3af">D</span>' +
    '<div style="display:flex;gap:3px;flex:1;justify-content:center">' + upper.map(toothCell).join('') + '</div>' +
    '<span style="font-size:11px;font-weight:600;color:#9ca3af">G</span></div>' +
    '<hr style="border:none;border-top:1px dashed #e5e7eb;margin:6px 0">' +
    '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;font-weight:600;color:#9ca3af">D</span>' +
    '<div style="display:flex;gap:3px;flex:1;justify-content:center">' + lower.map(toothCell).join('') + '</div>' +
    '<span style="font-size:11px;font-weight:600;color:#9ca3af">G</span></div>' +
    '</div>';
}

function renderPatientDentalTreatments(treatments, patientId) {
  const container = document.getElementById('pd-dental-treatments-list');
  if (!container) return;

  if (!treatments || treatments.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Aucun traitement dentaire</div>';
    return;
  }

  const TYPES = {
    checkup: '🔍 Contrôle', cleaning: '🪥 Détartrage', filling: '🔧 Obturation',
    extraction: '🦷 Extraction', rootCanal: '💉 Canal', crown: '👑 Couronne',
    bridge: '🌉 Bridge', implant: '🔩 Implant', veneer: '✨ Facette',
    whitening: '⚪ Blanchiment', orthodontics: '📐 Orthodontie', surgery: '🔪 Chirurgie',
    prosthesis: '🦿 Prothèse', xray: '📷 Radio', other: '📋 Autre'
  };

  // Show last 10 treatments
  const recent = treatments.slice(0, 10);
  let rows = '';
  for (const t of recent) {
    const typeLabel = TYPES[t.treatmentType] || ('📋 ' + (t.treatmentType || ''));
    const isPaid = (t.paid || 0) >= (t.cost || 0);
    const remaining = Math.max((t.cost || 0) - (t.paid || 0), 0);
    const dateStr = t.treatmentDate ? new Date(t.treatmentDate).toLocaleDateString('fr-FR') : '—';
    rows += '<tr>' +
      '<td style="padding:8px;font-size:13px">' + dateStr + '</td>' +
      '<td style="padding:8px;font-size:13px;font-weight:600">' + (t.toothNumber || '—') + '</td>' +
      '<td style="padding:8px;font-size:13px">' + typeLabel + '</td>' +
      '<td style="padding:8px;font-size:13px;text-align:right;font-weight:600">' + (t.cost || 0).toLocaleString() + ' DA</td>' +
      '<td style="padding:8px;text-align:center"><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:' +
      (isPaid ? '#dcfce7;color:#166534' : '#fef3c7;color:#92400e') + '">' +
      (isPaid ? '✓ Payé' : '⏳ Reste ' + remaining.toLocaleString() + ' DA') + '</span></td>' +
      '<td style="padding:8px;text-align:center">' +
      (isPaid ? '' : '<button onclick="payDentalTreatment(\'' + t.id + '\',' + (t.cost || 0) + ',' + (t.paid || 0) + ',\'' + patientId + '\')" class="btn btn-tiny btn-success" title="Payer" style="font-size:11px;padding:3px 8px">💰</button>') +
      '</td></tr>';
  }

  container.innerHTML = '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="background:#f8fafc">' +
    '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px">Date</th>' +
    '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px">Dent</th>' +
    '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px">Type</th>' +
    '<th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb;font-size:12px">Coût</th>' +
    '<th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:12px">Statut</th>' +
    '<th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb;font-size:12px">Action</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    (treatments.length > 10 ? '<p style="text-align:center;margin-top:10px"><button class="btn btn-small" onclick="goToFullDentalChart()" style="font-size:12px">Voir tous les ' + treatments.length + ' traitements →</button></p>' : '');
}

function renderPatientDentalImages(images) {
  const container = document.getElementById('pd-dental-images');
  if (!container) return;

  if (!images || images.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af;grid-column:1/-1">Aucune image médicale dentaire</div>';
    return;
  }

  const icons = { radio: '📡', scanner: '🖥️', echo: '📺', photo: '📷', image: '📎' };
  const labels = { radio: 'Radio', scanner: 'Scanner', echo: 'Écho', photo: 'Photo', image: 'Image' };

  container.innerHTML = images.slice(0, 8).map(img => {
    const fp = (img.filePath || '').replace(/'/g, "\\'");
    return '<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#f9fafb;cursor:pointer" onclick="openImageViewer(\'' + fp + '\')">' +
      '<div style="height:120px;background:#1e293b;display:flex;align-items:center;justify-content:center">' +
      '<img src="file://' + img.filePath + '" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.outerHTML=\'<span style=color:white;font-size:32px>' + (icons[img.type] || '📁') + '</span>\'"/></div>' +
      '<div style="padding:8px">' +
      '<div style="font-size:10px;display:flex;justify-content:space-between">' +
      '<span style="background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:8px;font-weight:600">' + (icons[img.type] || '📁') + ' ' + (labels[img.type] || img.type) + '</span>' +
      (img.toothNumber ? '<span style="color:#6b7280">Dent ' + img.toothNumber + '</span>' : '') + '</div></div></div>';
  }).join('') +
  (images.length > 8 ? '<div style="text-align:center;padding:20px;grid-column:1/-1"><button class="btn btn-small" onclick="goToFullDentalChart()" style="font-size:12px">Voir ' + images.length + ' images →</button></div>' : '');
}

// Navigate to full dental chart with the current patient pre-selected
function goToFullDentalChart() {
  if (!currentPatientId) return;
  if (typeof showSection === 'function') showSection('dentistry');
  const selectCurrentPatient = (attempt = 0) => {
    if (typeof switchDentalTab === 'function') switchDentalTab('chart');
    const selector = document.getElementById('dental-patient-selector');
    if (!selector && attempt < 10) {
      setTimeout(() => selectCurrentPatient(attempt + 1), 120);
      return;
    }
    if (typeof window.setLazyPatientFieldValue === 'function') {
      window.setLazyPatientFieldValue('dental-patient-selector', currentPatientId);
    }
    if (selector) selector.value = currentPatientId;
    if (typeof selectDentalPatient === 'function') selectDentalPatient(currentPatientId);
  };
  setTimeout(() => selectCurrentPatient(), 120);
}

function goToFullDentalChartTooth(toothNumber) {
  if (!currentPatientId) return;
  if (typeof showSection === 'function') showSection('dentistry');
  const selectCurrentPatientTooth = (attempt = 0) => {
    if (typeof switchDentalTab === 'function') switchDentalTab('chart');
    const selector = document.getElementById('dental-patient-selector');
    if (!selector && attempt < 10) {
      setTimeout(() => selectCurrentPatientTooth(attempt + 1), 120);
      return;
    }
    if (typeof window.setLazyPatientFieldValue === 'function') {
      window.setLazyPatientFieldValue('dental-patient-selector', currentPatientId);
    }
    if (selector) selector.value = currentPatientId;
    if (typeof selectDentalPatient === 'function') selectDentalPatient(currentPatientId);
    setTimeout(() => {
      if (typeof selectDentalTooth === 'function') selectDentalTooth(toothNumber);
    }, 450);
  };
  setTimeout(() => selectCurrentPatientTooth(), 120);
}

// Open treatment modal from patient details (using global dental patient context)
function openTreatmentModalFromPatient() {
  if (!currentPatientId) {
    showNotification('Aucun patient sélectionné', 'error');
    return;
  }
  // Set dental context
  if (typeof dentalSelectedPatientId !== 'undefined') {
    dentalSelectedPatientId = currentPatientId;
  }
  // Open the treatment modal
  if (typeof openTreatmentModal === 'function') {
    openTreatmentModal();
  }
}

// Pay dental treatment: creates a payment entry linked to patient
async function payDentalTreatment(treatmentId, cost, alreadyPaid, patientId) {
  const remaining = Math.max(cost - alreadyPaid, 0);
  if (remaining <= 0) {
    showNotification('Ce traitement est déjà payé', 'info');
    return;
  }

  // Pre-fill payment modal
  const pPatientId = document.getElementById('payment-patient-id');
  const pConsultId = document.getElementById('payment-consultation-id');
  const pName = document.getElementById('payment-patient-name');
  const pAmount = document.getElementById('payment-amount');
  const pDate = document.getElementById('payment-date');
  const pMethod = document.getElementById('payment-method');
  const pNotes = document.getElementById('payment-notes');
  if (typeof resetPaymentModalState === 'function') {
    resetPaymentModalState();
  }

  if (pPatientId) pPatientId.value = patientId;
  if (pConsultId) pConsultId.value = '';
  if (pName) {
    try {
      const res = await window.api.patient.getById(patientId);
      if (res.success) pName.value = res.data.firstName + ' ' + res.data.lastName;
    } catch (e) { pName.value = 'Patient'; }
  }
  if (pAmount) pAmount.value = remaining;
  if (pDate) pDate.value = new Date().toISOString().split('T')[0];
  if (pMethod) pMethod.value = 'Espèces';
  if (pNotes) pNotes.value = 'Traitement dentaire';
  if (typeof setPaymentConsultationLabel === 'function') {
    setPaymentConsultationLabel('', new Date().toISOString().split('T')[0]);
  }

  // Store treatment ID so we can update paid amount after payment
  const modal = document.getElementById('modal-add-payment');
  if (modal) modal.dataset.dentalTreatmentId = treatmentId;

  showModal('modal-add-payment');
}

// Make dental tab functions global
window.loadPatientDentalTab = loadPatientDentalTab;
window.goToFullDentalChart = goToFullDentalChart;
window.goToFullDentalChartTooth = goToFullDentalChartTooth;
window.openTreatmentModalFromPatient = openTreatmentModalFromPatient;
window.payDentalTreatment = payDentalTreatment;
window.printAppointmentTicket = printAppointmentTicket;
window.updateConsultationAttachmentsPreview = updateConsultationAttachmentsPreview;
window.importConsultationAttachmentsFromDevice = importConsultationAttachmentsFromDevice;
window.scanConsultationAttachment = scanConsultationAttachment;
window.openConsultationAttachmentImport = openConsultationAttachmentImport;
window.openConsultationScanner = openConsultationScanner;

// Navigate to ORL module from patient details
function goToORLFromPatientDetails() {
  const patientId = currentPatientId || window.currentPatientId || null;
  if (typeof showSection === 'function') {
    showSection('orl');
  }
  if (patientId && typeof selectORLPatient === 'function') {
    const sel = document.getElementById('orl-patient-selector');
    if (sel) sel.value = String(patientId);
    selectORLPatient(patientId);
  }
}
window.goToORLFromPatientDetails = goToORLFromPatientDetails;

function goToOperationsFromPatientDetails() {
  const patientId = currentPatientId || window.currentPatientId || null;
  if (typeof showSection === 'function') {
    showSection('operations');
  }
  if (patientId && currentPatientData) {
    setTimeout(() => {
      const searchInput = document.getElementById('operations-search');
      const patientName = `${currentPatientData.firstName || ''} ${currentPatientData.lastName || ''}`.trim();
      if (searchInput && patientName) {
        searchInput.value = patientName;
        if (typeof filterOperations === 'function') {
          filterOperations();
        }
      }
    }, 50);
  }
}
window.goToOperationsFromPatientDetails = goToOperationsFromPatientDetails;

function openORLNewReportFromPatientDetails() {
  const patientId = currentPatientId || window.currentPatientId || null;
  if (typeof showSection === 'function') {
    showSection('orl');
  }
  if (patientId && typeof selectORLPatient === 'function') {
    const sel = document.getElementById('orl-patient-selector');
    if (sel) sel.value = String(patientId);
    selectORLPatient(patientId);
  }
  if (typeof createNewORLReport === 'function') {
    createNewORLReport();
  }
}
window.openORLNewReportFromPatientDetails = openORLNewReportFromPatientDetails;

function addORLReportToConsultation() {
  const patientId = document.getElementById('consultation-patientId')?.value || currentPatientId || window.currentPatientId;
  const reason = document.getElementById('consultation-reason')?.value || '';
  const diagnosis = document.getElementById('consultation-diagnosis')?.value || '';
  const treatment = document.getElementById('consultation-treatment')?.value || '';
  const date = document.getElementById('consultation-date')?.value || '';

  if (typeof closeModal === 'function') {
    closeModal('modal-consultation');
  }

  if (typeof showSection === 'function') {
    showSection('orl');
  }

  if (patientId && typeof selectORLPatient === 'function') {
    const sel = document.getElementById('orl-patient-selector');
    if (sel) sel.value = String(patientId);
    selectORLPatient(patientId);
  }

  if (typeof createNewORLReport === 'function') {
    createNewORLReport();
  }

  if (reason) {
    const motifEl = document.getElementById('orl-motif');
    if (motifEl) motifEl.value = reason;
  }
  if (diagnosis) {
    const diagEl = document.getElementById('orl-diagnosis');
    if (diagEl) diagEl.value = diagnosis;
  }
  if (treatment) {
    const trtEl = document.getElementById('orl-treatment');
    if (trtEl) trtEl.value = treatment;
  }
  if (date) {
    const dateEl = document.getElementById('orl-date');
    if (dateEl) dateEl.value = date;
  }

  if (typeof renderORLWysiwygReport === 'function') {
    renderORLWysiwygReport(true);
  }

  if (typeof showNotification === 'function') {
    showNotification('Module ORL ouvert : nouveau compte-rendu lié au patient', 'info');
  }
}
window.addORLReportToConsultation = addORLReportToConsultation;

// Navigate to dental tab from consultation modal
function goToPatientDentalFromConsultation(patientId) {
  if (!patientId) return;
  // Make sure we're in patient details
  showPatientDetails(patientId);
  setTimeout(() => { switchTab('tab-dental'); }, 300);
}
window.goToPatientDentalFromConsultation = goToPatientDentalFromConsultation;
window.goToPatientORLFromConsultation = function(patientId) {
  if (!patientId) return;
  showPatientDetails(patientId);
  setTimeout(() => { switchTab('tab-orl'); }, 300);
};
window.showPatientDetails = showPatientDetails;
window.loadPatientDetails = showPatientDetails;

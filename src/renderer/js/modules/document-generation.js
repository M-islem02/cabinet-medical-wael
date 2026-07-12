// ========== INVOICE & REPORT GENERATION ==========
// NOTE: ensureSettingsLoaded and cachedSettings are now defined in globals.js

function normalizeDocumentTarget(target) {
  if (!target && currentPatientId) {
    return { patientId: currentPatientId, consultationId: null };
  }
  if (typeof target === 'string') {
    return { patientId: null, consultationId: target };
  }
  if (typeof target === 'object' && target !== null) {
    return {
      patientId: target.patientId ?? currentPatientId ?? null,
      consultationId: target.consultationId ?? null
    };
  }
  return { patientId: currentPatientId ?? null, consultationId: null };
}

async function fetchPatientDocumentContext({ patientId, consultationId }) {
  let patient = null;
  let consultation = null;

  if (patientId) {
    const patientResult = await window.api.patient.getById(patientId);
    if (patientResult.success && patientResult.data) {
      patient = patientResult.data;
    }
  }

  if (!patient && consultationId) {
    const consultationResult = await window.api.consultation.getById(consultationId);
    if (consultationResult.success && consultationResult.data) {
      consultation = consultationResult.data;
      const patientResult = await window.api.patient.getById(consultation.patientId);
      if (patientResult.success && patientResult.data) {
        patient = patientResult.data;
      }
    }
  }

  if (!patient) {
    throw new Error('Patient introuvable pour ce document');
  }

  if (!consultation && consultationId) {
    const consultationResult = await window.api.consultation.getById(consultationId);
    if (consultationResult.success && consultationResult.data) {
      consultation = consultationResult.data;
    }
  }

  return { patient, consultation };
}

async function fetchDocumentContext(consultationId) {
  const consultationResult = await window.api.consultation.getById(consultationId);
  if (!consultationResult.success || !consultationResult.data) {
    throw new Error('Consultation introuvable');
  }
  const consultation = consultationResult.data;
  const patientResult = await window.api.patient.getById(consultation.patientId);
  if (!patientResult.success || !patientResult.data) {
    throw new Error('Patient introuvable');
  }
  return { consultation, patient: patientResult.data };
}

function getPatientAgeLabel(patient) {
  if (!patient?.dateOfBirth) return '-';
  const birth = new Date(patient.dateOfBirth);
  if (Number.isNaN(birth.getTime())) return '-';
  const diff = Date.now() - birth.getTime();
  const years = Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
  return `${years} ans`;
}

function setFactureSummary({ patient, updatedAt }) {
  const nameEl = document.getElementById('facture-patient-name');
  const contactEl = document.getElementById('facture-patient-contact');
  const ageEl = document.getElementById('facture-age');
  const updatedEl = document.getElementById('facture-updated');
  if (nameEl) nameEl.textContent = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '-';
  if (contactEl) {
    const contactParts = [patient.phone, patient.email].filter(Boolean);
    contactEl.textContent = contactParts.length ? contactParts.join(' - ') : '-';
  }
  if (ageEl) ageEl.textContent = getPatientAgeLabel(patient);
  if (updatedEl) {
    updatedEl.textContent = updatedAt ? formatDateToDDMMYYYY(updatedAt) : '-';
  }
}

function setFieldValue(fieldId, value) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.value = value ?? '';
}

function getFieldValue(fieldId) {
  const field = document.getElementById(fieldId);
  return field ?field.value : '';
}

function fillFactureForm(data = {}) {
  const normalizedData = typeof normalizeFacturePayload === 'function'
    ? normalizeFacturePayload(data)
    : data;
  setFieldValue('facture-main-label', normalizedData.mainLabel ?? '');
  setFieldValue('facture-number-sessions', normalizedData.numberOfSessions ?? '');
  setFieldValue('facture-rhythm', normalizedData.rhythm ?? '');
  setFieldValue('facture-unit-price', normalizedData.unitPrice ?? '');
  setFieldValue('facture-total-price', normalizedData.totalPrice ?? '');
  setFieldValue('facture-notes', normalizedData.notes ?? '');
  renderFactureAdditionalItems(normalizedData.additionalItems ?? []);
  const invoiceDateInput = document.getElementById('facture-invoice-date');
  if (invoiceDateInput) {
    const value = normalizedData.invoiceDate || '';
    if (value) {
      invoiceDateInput.value = value.includes('-') ? value.slice(0, 10) : formatDateToInputValue(value);
    } else {
      invoiceDateInput.value = typeof getTodayInAlgeria === 'function'
        ? getTodayInAlgeria()
        : formatDateToInputValue(new Date());
    }
  }
}

function getFactureAdditionalItemsContainer() {
  return document.getElementById('facture-additional-items');
}

function renderFactureAdditionalItems(items = []) {
  const container = getFactureAdditionalItemsContainer();
  if (!container) return;

  const normalizedItems = Array.isArray(items) ?items : [];
  if (!normalizedItems.length) {
    container.innerHTML = `
      <div style="padding: 12px; border: 1px dashed #cbd5e1; border-radius: 10px; color: #64748b; background: #f8fafc;">
        Aucune ligne supplementaire pour le moment.
      </div>
    `;
    return;
  }

  container.innerHTML = normalizedItems.map((item, index) => `
    <div data-facture-additional-item="${index}" style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px; background: #fff;">
      <div class="form-row" style="margin-bottom: 0;">
        <div class="form-group" style="flex: 2 1 260px;">
          <label>Acte / designation</label>
          <input
            type="text"
            class="form-control"
            data-facture-item-field="label"
            value="${escapeHTML(item.label || '')}"
            oninput="handleFactureAdditionalItemChange()"
            placeholder="Ex: Consultation specialisee"
          >
        </div>
        <div class="form-group" style="flex: 1 1 150px;">
          <label>Montant (DA)</label>
          <input
            type="number"
            class="form-control"
            data-facture-item-field="amount"
            value="${item.amount === '' || item.amount === null || item.amount === undefined ?'' : escapeHTML(String(item.amount))}"
            min="0"
            step="0.01"
            oninput="handleFactureAdditionalItemChange()"
            placeholder="0.00"
          >
        </div>
        <div class="form-group" style="flex: 0 0 auto; align-self: flex-end;">
          <button type="button" class="btn btn-danger btn-small" onclick="removeFactureAdditionalItem(${index})">Supprimer</button>
        </div>
      </div>
    </div>
  `).join('');
}

function collectFactureAdditionalItems() {
  const container = getFactureAdditionalItemsContainer();
  if (!container) return [];

  return Array.from(container.querySelectorAll('[data-facture-additional-item]')).map((row) => {
    const label = row.querySelector('[data-facture-item-field="label"]')?.value?.trim() || '';
    const rawAmount = row.querySelector('[data-facture-item-field="amount"]')?.value || '';
    const parsedAmount = rawAmount === '' ?'' : Number(rawAmount);
    return {
      label,
      amount: Number.isFinite(parsedAmount) ?parsedAmount : ''
    };
  }).filter((item) => item.label || item.amount !== '');
}

function addFactureAdditionalItem(item = {}) {
  const currentItems = collectFactureAdditionalItems();
  currentItems.push({
    label: item.label || '',
    amount: item.amount ?? ''
  });
  renderFactureAdditionalItems(currentItems);
  autoComputeFactureTotal(false);
  renderFacturePreview();
}

function removeFactureAdditionalItem(index) {
  const currentItems = collectFactureAdditionalItems().filter((_, itemIndex) => itemIndex !== index);
  renderFactureAdditionalItems(currentItems);
  autoComputeFactureTotal(false);
  renderFacturePreview();
}

function handleFactureAdditionalItemChange() {
  autoComputeFactureTotal(false);
  renderFacturePreview();
}

function collectFactureFormData() {
  const mainLabel = getFieldValue('facture-main-label');
  const sessions = getFieldValue('facture-number-sessions');
  const rhythm = getFieldValue('facture-rhythm');
  const unitPrice = getFieldValue('facture-unit-price');
  const totalPrice = getFieldValue('facture-total-price');
  const notes = getFieldValue('facture-notes');
  const invoiceDate = getFieldValue('facture-invoice-date');
  const parsedSessions = sessions === '' ?'' : Number(sessions);
  const parsedUnit = unitPrice === '' ?'' : Number(unitPrice);
  const parsedTotal = totalPrice === '' ?'' : Number(totalPrice);
  return {
    mainLabel: mainLabel.trim() || 'Consultation',
    numberOfSessions: Number.isFinite(parsedSessions) ?parsedSessions : '',
    rhythm: rhythm || '',
    unitPrice: Number.isFinite(parsedUnit) ?parsedUnit : '',
    totalPrice: Number.isFinite(parsedTotal) ?parsedTotal : '',
    notes: notes || '',
    additionalItems: collectFactureAdditionalItems(),
    invoiceDate: invoiceDate || ''
  };
}

function autoComputeFactureTotal(force = false) {
  if (!force && factureTotalEditedManually) return;
  const totalField = document.getElementById('facture-total-price');
  if (!totalField) return;

  const sessionsValue = Number(getFieldValue('facture-number-sessions'));
  const unitValue = Number(getFieldValue('facture-unit-price'));
  const baseTotal = Number.isFinite(sessionsValue) && Number.isFinite(unitValue)
    ?sessionsValue * unitValue
    : Number.isFinite(unitValue)
      ?unitValue
    : 0;
  const additionalTotal = collectFactureAdditionalItems().reduce((sum, item) => {
    const amount = Number(item.amount);
    return Number.isFinite(amount) ?sum + amount : sum;
  }, 0);
  const grandTotal = baseTotal + additionalTotal;

  if (grandTotal > 0) {
    totalField.value = grandTotal.toFixed(2);
  } else {
    totalField.value = '';
  }
}

function formatDocumentCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DZD`;
}

function getPreviewTextHtml(text, emptyText = 'Aucun contenu pour le moment.') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return `<p class="document-live-preview-empty">${escapeHTML(emptyText)}</p>`;
  }

  return normalized
    .split(/\n+/)
    .map((line) => `<p>${escapeHTML(line)}</p>`)
    .join('');
}

function buildDocumentPreviewShell({ kicker, title, subtitle, badge, meta = [], sections = [], highlight = null }) {
  const metaHtml = meta.length ?`
    <div class="document-live-preview-meta">
      ${meta.map((item) => `
        <div class="document-live-preview-meta-item">
          <strong>${escapeHTML(item.label)}</strong>
          <span>${escapeHTML(item.value || '-')}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const highlightHtml = highlight ?`
    <div class="document-live-preview-highlight">
      <div class="document-live-preview-highlight-title">${escapeHTML(highlight.label)}</div>
      <div class="document-live-preview-highlight-value">${escapeHTML(highlight.value || '-')}</div>
    </div>
  ` : '';

  const sectionsHtml = sections.map((section) => `
    <div class="document-live-preview-section">
      <div class="document-live-preview-section-title">${escapeHTML(section.title)}</div>
      <div class="document-live-preview-body">${section.bodyHtml}</div>
    </div>
  `).join('');

  return `
    <div class="document-live-preview-header">
      <div>
        <div class="document-live-preview-kicker">${escapeHTML(kicker)}</div>
        <div class="document-live-preview-title">${escapeHTML(title)}</div>
        <div class="document-live-preview-subtitle">${escapeHTML(subtitle)}</div>
      </div>
      <div class="document-live-preview-badge">${escapeHTML(badge)}</div>
    </div>
    ${metaHtml}
    ${highlightHtml}
    ${sectionsHtml}
  `;
}

function renderFacturePreview() {
  const previewEl = document.getElementById('facture-preview');
  if (!previewEl) return;

  autoComputeFactureTotal(false);
  const data = typeof normalizeFacturePayload === 'function'
    ?normalizeFacturePayload(collectFactureFormData())
    : collectFactureFormData();
  const totals = typeof calculateFactureTotals === 'function'
    ?calculateFactureTotals(data)
    : { baseTotal: Number(data.totalPrice) || 0, additionalTotal: 0, grandTotal: Number(data.totalPrice) || 0 };
  const patientName = document.getElementById('facture-patient-name')?.textContent?.trim() || 'Patient';
  const contact = document.getElementById('facture-patient-contact')?.textContent?.trim() || '-';
  const invoiceDate = data.invoiceDate ?formatDateToDDMMYYYY(data.invoiceDate) : 'A preciser';
  const rawMainLabel = document.getElementById('facture-main-label')?.value?.trim() || '';
  const hasBaseRow = Boolean(rawMainLabel || data.numberOfSessions !== '' || data.unitPrice !== '' || totals.baseTotal);
  const baseDetails = [
    data.numberOfSessions !== '' ? `${data.numberOfSessions} seance${Number(data.numberOfSessions) > 1 ? 's' : ''}` : '',
    data.unitPrice !== '' ? `${formatDocumentCurrency(data.unitPrice)} / unite` : ''
  ].filter(Boolean).join(' - ');
  const detailRows = [];

  if (hasBaseRow) {
    detailRows.push({
      label: rawMainLabel || data.mainLabel || 'Consultation',
      details: baseDetails || 'Prestation principale',
      amount: (data.numberOfSessions !== '' || data.unitPrice !== '' || totals.baseTotal) ?totals.baseTotal : null
    });
  }

  (data.additionalItems || []).forEach((item) => {
    detailRows.push({
      label: item.label || 'Ligne supplementaire',
      details: 'Montant',
      amount: item.amount === '' || item.amount === null || item.amount === undefined ?null : Number(item.amount)
    });
  });

  const tableRowsHtml = detailRows.length
    ?detailRows.map((row) => `
        <tr>
          <td>${escapeHTML(row.label)}</td>
          <td>${escapeHTML(row.details || '-')}</td>
          <td>${row.amount === null ?'-' : escapeHTML(formatDocumentCurrency(row.amount))}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td colspan="3">Aucune ligne de facturation ajoutée pour le moment.</td>
      </tr>
    `;
  const totalLabel = data.totalPrice !== '' || totals.baseTotal || totals.additionalTotal
    ?formatDocumentCurrency(totals.grandTotal)
    : '-';
  const baseTotalLabel = totals.baseTotal ?formatDocumentCurrency(totals.baseTotal) : '-';
  const additionalTotalLabel = totals.additionalTotal ?formatDocumentCurrency(totals.additionalTotal) : '-';

  previewEl.innerHTML = buildDocumentPreviewShell({
    kicker: 'Document du cabinet',
    title: 'Facture professionnelle',
    subtitle: `Facture preparee pour ${patientName}`,
    badge: 'Facture',
    meta: [
      { label: 'Patient', value: patientName },
      { label: 'Date', value: invoiceDate },
      { label: 'Contact', value: contact }
    ],
    highlight: {
      label: 'Montant total',
      value: totalLabel
    },
    sections: [
      {
        title: 'Details de facturation',
        bodyHtml: `
          <table class="document-live-preview-table">
            <thead>
              <tr>
                <th>Designation</th>
                <th>Details</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        `
      },
      {
        title: 'Resume',
        bodyHtml: `
          <div class="document-live-preview-meta">
            <div class="document-live-preview-meta-item">
              <strong>Rythme</strong>
              <span>${escapeHTML(data.rhythm || '-')}</span>
            </div>
            <div class="document-live-preview-meta-item">
              <strong>Total principal</strong>
              <span>${escapeHTML(baseTotalLabel)}</span>
            </div>
            <div class="document-live-preview-meta-item">
              <strong>Autres montants</strong>
              <span>${escapeHTML(additionalTotalLabel)}</span>
            </div>
          </div>
        `
      },
      {
        title: 'Notes complementaires',
        bodyHtml: getPreviewTextHtml(data.notes, 'Aucune note complementaire.')
      }
    ]
  });
}

function renderRapportPreview() {
  const previewEl = document.getElementById('rapport-preview');
  if (!previewEl) return;

  const data = collectRapportFormData();
  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
    ?getPracticeSpecialtyMeta(data.specialtyKey)
    : { report: { kicker: 'Compte-rendu medical', heroTitle: 'Rapport medical structure', badge: 'Rapport', typeLabel: 'Rapport medical', objectTitle: 'Objet du rapport', contextTitle: 'Contexte clinique', findingsTitle: 'Constatations / Examen', careTitle: 'Prise en charge', conclusionTitle: 'Conclusion et recommandations' } };
  const patientName = document.getElementById('rapport-patient-name')?.textContent?.trim() || 'Patient';
  const doctorName = document.getElementById('rapport-doctor')?.textContent?.trim() || 'Medecin';
  const reportDate = data.date ?formatDateToDDMMYYYY(data.date) : 'A preciser';
  const previewSections = [];

  previewSections.push({
    title: 'Indications',
    bodyHtml: getPreviewTextHtml(data.motif, 'Les indications cliniques apparaitront ici.')
  });

  if (Array.isArray(data.organFindings) && data.organFindings.length) {
    previewSections.push({
      title: specialtyMeta.report.findingsTitle || 'Examen clinique',
      bodyHtml: getPreviewTextHtml(
        summarizeRapportOrganFindings(data.organFindings),
        'Les constatations cliniques apparaitront ici.'
      )
    });
  } else if (getRapportOrganOptionsForSpecialty(data.specialtyKey).length > 0) {
    previewSections.push({
      title: specialtyMeta.report.findingsTitle || 'Examen clinique',
      bodyHtml: getPreviewTextHtml('', 'Ajoutez un ou plusieurs organes pour afficher les constatations.')
    });
  } else if (data.organTarget) {
    previewSections.push({
      title: specialtyMeta.report.findingsTitle || 'Examen clinique',
      bodyHtml: getPreviewTextHtml(data.organTarget, 'Selectionnez un organe ou une zone.')
    });
  }

  previewSections.push({
    title: 'Conclusion',
    bodyHtml: getPreviewTextHtml(data.recommandations, 'La conclusion du compte rendu apparaitra ici.')
  });

  previewEl.innerHTML = buildDocumentPreviewShell({
    kicker: specialtyMeta.report.kicker,
    title: data.documentTitle || specialtyMeta.report.printTitle || specialtyMeta.report.heroTitle,
    subtitle: `${specialtyMeta.report.typeLabel} etabli pour ${patientName} par ${doctorName}`,
    badge: specialtyMeta.report.badge,
    meta: [
      { label: 'Patient', value: patientName },
      { label: 'Date', value: reportDate },
      { label: 'Emetteur', value: doctorName }
    ],
    sections: previewSections
  });
}

function renderOrientationPreview() {
  const previewEl = document.getElementById('orientation-preview');
  if (!previewEl) return;

  const patientName = document.getElementById('orientation-patient-name')?.textContent?.trim() || 'Patient';
  const dateValue = document.getElementById('orientation-date')?.value || '';
  const dateLabel = dateValue ? formatDateToDDMMYYYY(dateValue) : 'A preciser';
  const specialty = document.getElementById('orientation-specialty')?.value || 'Specialite a preciser';
  const destinataire = document.getElementById('orientation-destinataire')?.value || 'confrere (consoeur)';
  const antecedents = document.getElementById('orientation-antecedents')?.value?.trim() || '';
  const symptoms = document.getElementById('orientation-symptoms')?.value?.trim() || '';
  const motif = document.getElementById('orientation-motif')?.value?.trim() || '';
  const salutation = destinataire === 'confrere'
    ? 'Cher confrere'
    : destinataire === 'consoeur'
      ? 'Chere consoeur'
      : 'Cher confrere (consoeur)';

  previewEl.innerHTML = buildDocumentPreviewShell({
    kicker: 'Courrier medical',
    title: "Lettre d'orientation",
    subtitle: `Orientation vers ${specialty}`,
    badge: 'Orientation',
    meta: [
      { label: 'Patient', value: patientName },
      { label: 'Date', value: dateLabel },
      { label: 'Specialite', value: specialty }
    ],
    sections: [
      {
        title: "Formule d'appel",
        bodyHtml: getPreviewTextHtml(`${salutation},`)
      },
      {
        title: 'Presentation du patient',
        bodyHtml: getPreviewTextHtml(
          antecedents
            ? `Permettez-moi de vous adresser ${patientName}, avec pour antecedents: ${antecedents}.`
            : `Permettez-moi de vous adresser ${patientName} pour avis specialise.`
        )
      },
      {
        title: 'Tableau clinique',
        bodyHtml: getPreviewTextHtml(symptoms, 'Les symptomes ou le diagnostic apparaitront ici.')
      },
      {
        title: "Motif de l'orientation",
        bodyHtml: getPreviewTextHtml(motif, "Le motif de l'orientation apparaitra ici.")
      }
    ]
  });
}

function bindDocumentPreviewInputs(selectors, callback) {
  selectors.forEach((selector) => {
    const field = document.getElementById(selector);
    if (!field || field.dataset.previewBound) return;
    field.addEventListener('input', callback);
    field.addEventListener('change', callback);
    field.dataset.previewBound = '1';
  });
}

function initializeDocumentPreviewBindings() {
  bindDocumentPreviewInputs([
    'facture-invoice-date',
    'facture-main-label',
    'facture-number-sessions',
    'facture-rhythm',
    'facture-unit-price',
    'facture-total-price',
    'facture-notes'
  ], renderFacturePreview);

  bindDocumentPreviewInputs([
    'rapport-title',
    'rapport-date',
    'rapport-motif',
    'rapport-reco'
  ], renderRapportPreview);

  bindRapportDynamicFieldsOnce();
}

async function openFactureModal(consultationId) {
  try {
    const { consultation, patient } = await fetchDocumentContext(consultationId);
    await ensureSettingsLoaded();
    const docResult = await window.api.document.getByType({ consultationId, documentType: 'invoice' });
    const existingDoc = docResult.success ?docResult.data : null;
    const rawPayload = existingDoc ?parseDocumentPayload(existingDoc.payload) : null;
    const payload = typeof normalizeFacturePayload === 'function'
      ?normalizeFacturePayload(rawPayload, { consultation, settings: cachedSettings })
      : (rawPayload || getDefaultFactureData({ consultation, settings: cachedSettings }));
    factureTotalEditedManually = false;
    documentModalState.invoice = {
      consultationId,
      patientId: patient.id,
      documentId: existingDoc?.id || null,
      data: payload
    };
    setFactureSummary({
      patient,
      updatedAt: existingDoc?.updatedAt
        || existingDoc?.lastPrintedAt
        || consultation?.updatedAt
        || consultation?.createdAt
        || consultation?.consultationDate
        || new Date().toISOString()
    });
    fillFactureForm(payload);
    renderFacturePreview();
    showModal('modal-facture');
  } catch (error) {
    console.error('Error opening facture modal:', error);
    showNotification('Impossible d\'ouvrir la facture', 'error');
  }
}

async function saveInvoiceDocument(event, options = {}) {
  if (event?.preventDefault) {
    event.preventDefault();
  }
  const { silent = false } = options;
  const state = documentModalState.invoice || {};
  if (!state.patientId) {
    showNotification('Aucun patient selectionne', 'error');
    return { success: false };
  }
  const data = collectFactureFormData();
  state.data = data;
  const response = await window.api.document.save({
    id: state.documentId,
    patientId: state.patientId,
    consultationId: state.consultationId || null,
    documentType: 'invoice',
    title: 'Facture',
    data
  });
  if (response.success) {
    documentModalState.invoice.documentId = response.id;
    if (!state.consultationId && currentPatientId === state.patientId) {
      loadPatientFactures(currentPatientId);
    }
    if (!silent) {
      showNotification('Facture enregistree', 'success');
    }
  } else if (!silent) {
    showNotification(response.error || 'Erreur lors de la sauvegarde', 'error');
  }
  return response;
}

async function printInvoiceDocument() {
  const state = documentModalState.invoice;
  if (!state.patientId) {
    showNotification('Selectionnez un patient avant impression', 'error');
    return;
  }
  const saveResult = await saveInvoiceDocument(null, { silent: true });
  if (!saveResult.success) {
    showNotification('Impossible d\'enregistrer la facture', 'error');
    return;
  }
  
  const printState = {
    documentId: documentModalState.invoice.documentId,
    patientId: state.patientId,
    consultationId: state.consultationId || null,
    data: { ...state.data }
  };

  closeModal('modal-facture');
  showNotification('Facture enregistree, impression en cours', 'success');
  void runInvoicePrintPipeline(printState);
}

function setRapportSummary({ patient, updatedAt }) {
  const nameEl = document.getElementById('rapport-patient-name');
  const ageEl = document.getElementById('rapport-age');
  const doctorEl = document.getElementById('rapport-doctor');
  const updatedEl = document.getElementById('rapport-updated');
  if (nameEl) nameEl.textContent = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '-';
  if (ageEl) ageEl.textContent = getPatientAgeLabel(patient);
  const cleanDoctorName = typeof normalizeDoctorDisplayName === 'function'
    ? normalizeDoctorDisplayName(cachedSettings?.doctorName || '')
    : String(cachedSettings?.doctorName || '').trim();
  const doctorLabel = cleanDoctorName ? `Dr ${cleanDoctorName}` : 'Dr Medecin';
  if (doctorEl) doctorEl.textContent = doctorLabel;
  if (updatedEl) updatedEl.textContent = updatedAt ? formatDateToDDMMYYYY(updatedAt) : '-';
}

const RAPPORT_ORGAN_LIBRARY_BY_SPECIALTY = {
  cardiology: {
    options: [
      'Coeur',
      'Aorte',
      'Arteres coronaires',
      'Valves cardiaques',
      'Pericarde',
      'Ventricule gauche',
      'Ventricule droit'
    ],
    defaultEntries: [
      { key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: 'Ex: Dimensions conservees' },
      { key: 'parois', label: 'Parois', type: 'text', placeholder: 'Ex: Parois fines, non epaissies' },
      { key: 'cavites', label: 'Cavites', type: 'text', placeholder: 'Ex: Cavites non dilatees' },
      { key: 'valves', label: 'Valves / Doppler', type: 'textarea', rows: 2, placeholder: 'Ex: Valves continentes, flux conserve...' },
      { key: 'contractilite', label: 'Contractilite / Fonction', type: 'text', placeholder: 'Ex: Fonction systolique conservee' },
      { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Absence d\'epanchement pericardique...' }
    ]
  },
  mpr: {
    options: [
      'Epaule droite',
      'Epaule gauche',
      'Coude',
      'Poignet',
      'Main',
      'Rachis cervical',
      'Rachis dorsal',
      'Rachis lombaire',
      'Hanche droite',
      'Hanche gauche',
      'Genou droit',
      'Genou gauche',
      'Cheville',
      'Pied'
    ],
    defaultEntries: [
      { key: 'inspection', label: 'Inspection / Attitude', type: 'text', placeholder: 'Ex: Attitude antalgique, tumefaction absente...' },
      { key: 'douleur', label: 'Douleur', type: 'text', placeholder: 'Ex: Douleur a la mobilisation active' },
      { key: 'mobilite', label: 'Mobilite', type: 'text', placeholder: 'Ex: Mobilite limitee en abduction' },
      { key: 'force', label: 'Force / Fonction', type: 'text', placeholder: 'Ex: Force diminuee a 4/5' },
      { key: 'tests', label: 'Tests specifiques', type: 'textarea', rows: 2, placeholder: 'Ex: Test de Neer positif...' },
      { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Retentissement fonctionnel, marche, autonomie...' }
    ]
  },
  urology: {
    options: [
      'Rein droit',
      'Rein gauche',
      'Vessie',
      'Prostate',
      'Organes genitaux externes',
      'Voies urinaires'
    ],
    templates: [
      {
        organs: ['Rein droit', 'Rein gauche'],
        entries: [
          { key: 'topographie_dimensions', label: 'Topographie-dimensions', type: 'text', placeholder: 'Ex: Normales' },
          { key: 'contours', label: 'Contours', type: 'text', placeholder: 'Ex: Reguliers' },
          { key: 'voies_excretrices', label: 'Voies excretrices', type: 'text', placeholder: 'Ex: Non dilatees' },
          { key: 'echostructure', label: 'Echostructure', type: 'textarea', rows: 2, placeholder: 'Ex: Habituelle, parenchymateux conserve...' },
          { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Microlithiase calicielle...' }
        ]
      },
      {
        organs: ['Vessie'],
        entries: [
          { key: 'capacite', label: 'Capacite', type: 'text', placeholder: 'Ex: Semi repletion, RPM = 00 cm3' },
          { key: 'contenu', label: 'Contenu', type: 'text', placeholder: 'Ex: Transonore' },
          { key: 'paroi', label: 'Paroi', type: 'text', placeholder: 'Ex: Fine : 03.99 mm' },
          { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Absence d\'anomalie endoluminale...' }
        ]
      },
      {
        organs: ['Prostate'],
        entries: [
          { key: 'volume', label: 'Volume', type: 'text', placeholder: 'Ex: 18.65 cm3' },
          { key: 'echostructure', label: 'Echostructure', type: 'text', placeholder: 'Ex: Heterogene' },
          { key: 'contours', label: 'Contours', type: 'text', placeholder: 'Ex: Reguliers' },
          { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Prostatite heterogene de volume normal...' }
        ]
      },
      {
        organs: ['Organes genitaux externes'],
        entries: [
          { key: 'taille_echostructure', label: 'Taille et echostructure', type: 'text', placeholder: 'Ex: Taille et echostructure normales' },
          { key: 'vascularisation', label: 'Vascularisation au Doppler', type: 'text', placeholder: 'Ex: Bien vascularises au Doppler' },
          { key: 'hydrocele', label: 'Hydrocele', type: 'text', placeholder: 'Ex: Pas d\'hydrocele' },
          { key: 'varicocele', label: 'Varicocele', type: 'text', placeholder: 'Ex: Discrete varicocele gauche' },
          { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Testicules droit et gauche visibles...' }
        ]
      },
      {
        organs: ['Voies urinaires'],
        entries: [
          { key: 'permabilite', label: 'Permabilite', type: 'text', placeholder: 'Ex: Sans dilatation' },
          { key: 'retentissement', label: 'Retentissement', type: 'text', placeholder: 'Ex: Sans retentissement' },
          { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Ex: Microlithiases renales bilaterales...' }
        ]
      }
    ],
    defaultEntries: [
      { key: 'description', label: 'Description', type: 'textarea', rows: 2, placeholder: 'Decrire les constatations principales...' },
      { key: 'observations', label: 'Observations complementaires', type: 'textarea', rows: 2, placeholder: 'Details utiles pour cet organe...' }
    ]
  }
};

function getRapportOrganConfigForSpecialty(specialtyKey = '') {
  const key = String(specialtyKey || '').trim().toLowerCase();
  return RAPPORT_ORGAN_LIBRARY_BY_SPECIALTY[key] || null;
}

function getRapportOrganOptionsForSpecialty(specialtyKey = '') {
  return getRapportOrganConfigForSpecialty(specialtyKey)?.options || [];
}

function cloneRapportEntryTemplates(entries = []) {
  return entries.map((entry) => ({
    key: String(entry.key || '').trim(),
    label: String(entry.label || '').trim(),
    type: entry.type === 'textarea' ? 'textarea' : 'text',
    rows: Number(entry.rows || 0) || 2,
    placeholder: String(entry.placeholder || '').trim(),
    value: String(entry.value || '').trim()
  }));
}

function escapeRapportAttribute(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getRapportEntryTemplatesForOrgan(specialtyKey = '', organName = '') {
  const config = getRapportOrganConfigForSpecialty(specialtyKey);
  if (!config) return [];

  const normalizedOrgan = String(organName || '').trim().toLowerCase();
  if (Array.isArray(config.templates)) {
    const matchedTemplate = config.templates.find((template) => Array.isArray(template.organs)
      && template.organs.some((organ) => String(organ || '').trim().toLowerCase() === normalizedOrgan));
    if (matchedTemplate) {
      return cloneRapportEntryTemplates(matchedTemplate.entries || []);
    }
  }

  return cloneRapportEntryTemplates(config.defaultEntries || []);
}

function normalizeRapportOrganFindingEntries(entries = []) {
  return Array.isArray(entries)
    ? entries
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry, index) => ({
          key: String(entry.key || `entry_${index + 1}`).trim(),
          label: String(entry.label || `Champ ${index + 1}`).trim(),
          type: entry.type === 'textarea' ? 'textarea' : 'text',
          rows: Number(entry.rows || 0) || 2,
          placeholder: String(entry.placeholder || '').trim(),
          value: String(entry.value || '').trim()
        }))
    : [];
}

function normalizeRapportOrganFinding(finding = {}, specialtyKey = '') {
  const options = getRapportOrganOptionsForSpecialty(specialtyKey);
  const organValue = String(finding.organ || '').trim();
  const entries = normalizeRapportOrganFindingEntries(finding.entries || []);
  const selectValue = organValue && options.includes(organValue) ? organValue : (organValue ? '__custom__' : '');
  return {
    organ: organValue,
    selectValue,
    customOrgan: selectValue === '__custom__' ? organValue : '',
    entries: entries.length ? entries : getRapportEntryTemplatesForOrgan(specialtyKey, organValue)
  };
}

function getRapportOrganBlocksContainer() {
  return document.getElementById('rapport-organs-list');
}

function getRapportOrganEmptyState() {
  return document.getElementById('rapport-organs-empty');
}

function getSelectedRapportOrganFromBlock(block) {
  const select = block?.querySelector('.rapport-organ-select');
  const customInput = block?.querySelector('.rapport-organ-custom');
  if (!select) return '';
  if (select.value === '__custom__') {
    return String(customInput?.value || '').trim();
  }
  return String(select.value || '').trim();
}

function renderRapportOrganEntries(block, specialtyKey = '', organName = '', entries = []) {
  const entriesHost = block?.querySelector('.rapport-organ-fields');
  if (!entriesHost) return;

  const normalizedEntries = entries.length
    ? normalizeRapportOrganFindingEntries(entries)
    : getRapportEntryTemplatesForOrgan(specialtyKey, organName);

  entriesHost.innerHTML = normalizedEntries.map((entry, index) => {
    const fieldId = `${block.dataset.blockId || 'rapport-organ'}-${index + 1}-${entry.key}`;
    if (entry.type === 'textarea') {
      return `
        <div class="rapport-organ-field rapport-organ-field--wide">
          <label for="${escapeRapportAttribute(fieldId)}">${escapeHTML(entry.label)}</label>
          <textarea
            id="${escapeRapportAttribute(fieldId)}"
            class="form-control rapport-organ-entry"
            data-entry-key="${escapeRapportAttribute(entry.key)}"
            data-entry-label="${escapeRapportAttribute(entry.label)}"
            data-entry-type="${escapeRapportAttribute(entry.type)}"
            data-entry-rows="${escapeRapportAttribute(String(entry.rows || 2))}"
            data-entry-placeholder="${escapeRapportAttribute(entry.placeholder || '')}"
            rows="${escapeRapportAttribute(String(entry.rows || 2))}"
            placeholder="${escapeRapportAttribute(entry.placeholder || '')}"
          >${escapeHTML(entry.value || '')}</textarea>
        </div>
      `;
    }

    return `
      <div class="rapport-organ-field">
        <label for="${escapeRapportAttribute(fieldId)}">${escapeHTML(entry.label)}</label>
        <input
          id="${escapeRapportAttribute(fieldId)}"
          type="text"
          class="form-control rapport-organ-entry"
          data-entry-key="${escapeRapportAttribute(entry.key)}"
          data-entry-label="${escapeRapportAttribute(entry.label)}"
          data-entry-type="${escapeRapportAttribute(entry.type)}"
          data-entry-rows="${escapeRapportAttribute(String(entry.rows || 2))}"
          data-entry-placeholder="${escapeRapportAttribute(entry.placeholder || '')}"
          placeholder="${escapeRapportAttribute(entry.placeholder || '')}"
          value="${escapeRapportAttribute(entry.value || '')}"
        >
      </div>
    `;
  }).join('');
}

function createRapportOrganBlock(finding = {}, specialtyKey = '') {
  const options = getRapportOrganOptionsForSpecialty(specialtyKey);
  const normalizedFinding = normalizeRapportOrganFinding(finding, specialtyKey);
  const block = document.createElement('div');
  block.className = 'rapport-organ-block';
  block.dataset.blockId = `rapport-organ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const optionsHtml = [
    '<option value="">-- Selectionner --</option>',
    ...options.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`),
    '<option value="__custom__">Autre (preciser)</option>'
  ].join('');

  block.innerHTML = `
    <div class="rapport-organ-block-header">
      <button type="button" class="btn btn-danger btn-small rapport-organ-delete-btn">Supprimer</button>
    </div>
    <div class="rapport-organ-selector-row">
      <div class="form-group">
        <label>Organe / Zone *</label>
        <select class="form-control rapport-organ-select">
          ${optionsHtml}
        </select>
        <input type="text" class="form-control rapport-organ-custom" style="display: none; margin-top: 8px;" placeholder="Precisez l'organe ou la zone">
      </div>
    </div>
    <div class="rapport-organ-fields"></div>
  `;

  const select = block.querySelector('.rapport-organ-select');
  const customInput = block.querySelector('.rapport-organ-custom');
  if (select) {
    select.value = normalizedFinding.selectValue;
  }
  if (customInput) {
    customInput.value = normalizedFinding.customOrgan || '';
    customInput.style.display = normalizedFinding.selectValue === '__custom__' ? '' : 'none';
  }

  renderRapportOrganEntries(block, specialtyKey, normalizedFinding.organ, normalizedFinding.entries);
  return block;
}

function updateRapportOrganEmptyState() {
  const container = getRapportOrganBlocksContainer();
  const emptyState = getRapportOrganEmptyState();
  if (!container || !emptyState) return;
  emptyState.style.display = container.children.length ? 'none' : '';
}

function populateRapportOrganBlocks(findings = [], specialtyKey = '') {
  const container = getRapportOrganBlocksContainer();
  if (!container) return;

  container.innerHTML = '';
  const normalizedFindings = Array.isArray(findings) ? findings : [];
  normalizedFindings.forEach((finding) => {
    container.appendChild(createRapportOrganBlock(finding, specialtyKey));
  });
  updateRapportOrganEmptyState();
}

function addRapportOrganBlock(finding = null) {
  const specialtyKey = document.getElementById('rapport-specialty-key')?.value
    || documentModalState?.rapport?.specialtyKey
    || (typeof resolveActivePracticeSpecialty === 'function' ?resolveActivePracticeSpecialty(window._packageConfig) : 'general');
  const container = getRapportOrganBlocksContainer();
  if (!container) return;
  container.appendChild(createRapportOrganBlock(finding || {}, specialtyKey));
  updateRapportOrganEmptyState();
  container.lastElementChild?.querySelector('.rapport-organ-select')?.focus();
  renderRapportPreview();
}

function collectRapportOrganFindings() {
  const blocks = Array.from(document.querySelectorAll('#rapport-organs-list .rapport-organ-block'));
  return blocks
    .map((block) => {
      const organ = getSelectedRapportOrganFromBlock(block);
      const entries = Array.from(block.querySelectorAll('.rapport-organ-entry')).map((field, index) => ({
        key: String(field.dataset.entryKey || `entry_${index + 1}`).trim(),
        label: String(field.dataset.entryLabel || `Champ ${index + 1}`).trim(),
        type: String(field.dataset.entryType || 'text').trim() === 'textarea' ? 'textarea' : 'text',
        rows: Number(field.dataset.entryRows || 0) || 2,
        placeholder: String(field.dataset.entryPlaceholder || '').trim(),
        value: String(field.value || '').trim()
      }));

      const hasContent = organ || entries.some((entry) => entry.value);
      if (!hasContent) return null;

      return {
        organ,
        entries
      };
    })
    .filter(Boolean);
}

function summarizeRapportOrganFindings(findings = []) {
  return findings
    .map((finding) => {
      const organLabel = String(finding?.organ || '').trim();
      const lines = Array.isArray(finding?.entries)
        ? finding.entries
            .filter((entry) => String(entry?.value || '').trim())
            .map((entry) => `${String(entry.label || '').trim() || 'Detail'} : ${String(entry.value || '').trim()}`)
        : [];
      return [organLabel, ...lines].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatRapportOrganFindingPreviewHtml(finding = {}) {
  const entries = Array.isArray(finding.entries) ? finding.entries : [];
  const rows = entries
    .filter((entry) => String(entry?.value || '').trim())
    .map((entry) => `
      <div class="document-live-preview-meta-item">
        <strong>${escapeHTML(String(entry.label || 'Detail').trim())}</strong>
        <span>${escapeHTML(String(entry.value || '').trim())}</span>
      </div>
    `)
    .join('');

  if (!rows) {
    return getPreviewTextHtml('', 'La description de cet organe apparaitra ici.');
  }

  return `<div class="document-live-preview-meta">${rows}</div>`;
}

function bindRapportDynamicFieldsOnce() {
  const modal = document.getElementById('modal-rapport');
  const addButton = document.getElementById('rapport-add-organ-btn');
  if (!modal || !addButton || modal.dataset.rapportDynamicBound) {
    return;
  }

  addButton.addEventListener('click', () => {
    addRapportOrganBlock();
  });

  modal.addEventListener('input', (event) => {
    if (event.target.closest('#rapport-organs-list')) {
      renderRapportPreview();
    }
  });

  modal.addEventListener('change', (event) => {
    const block = event.target.closest('.rapport-organ-block');
    if (!block) return;

    if (event.target.classList.contains('rapport-organ-select')) {
      const specialtyKey = document.getElementById('rapport-specialty-key')?.value
        || documentModalState?.rapport?.specialtyKey
        || (typeof resolveActivePracticeSpecialty === 'function' ?resolveActivePracticeSpecialty(window._packageConfig) : 'general');
      const customInput = block.querySelector('.rapport-organ-custom');
      const currentEntries = Array.from(block.querySelectorAll('.rapport-organ-entry')).map((field, index) => ({
        key: String(field.dataset.entryKey || `entry_${index + 1}`).trim(),
        label: String(field.dataset.entryLabel || `Champ ${index + 1}`).trim(),
        type: String(field.dataset.entryType || 'text').trim() === 'textarea' ? 'textarea' : 'text',
        rows: Number(field.dataset.entryRows || 0) || 2,
        placeholder: String(field.dataset.entryPlaceholder || '').trim(),
        value: String(field.value || '').trim()
      }));
      const selectedOrgan = String(event.target.value || '').trim();
      if (customInput) {
        customInput.style.display = selectedOrgan === '__custom__' ? '' : 'none';
        if (selectedOrgan !== '__custom__') {
          customInput.value = '';
        }
      }
      renderRapportOrganEntries(block, specialtyKey, selectedOrgan === '__custom__' ? String(customInput?.value || '').trim() : selectedOrgan, currentEntries);
      renderRapportPreview();
    }

    if (event.target.classList.contains('rapport-organ-custom')) {
      const specialtyKey = document.getElementById('rapport-specialty-key')?.value
        || documentModalState?.rapport?.specialtyKey
        || (typeof resolveActivePracticeSpecialty === 'function' ?resolveActivePracticeSpecialty(window._packageConfig) : 'general');
      const currentEntries = Array.from(block.querySelectorAll('.rapport-organ-entry')).map((field, index) => ({
        key: String(field.dataset.entryKey || `entry_${index + 1}`).trim(),
        label: String(field.dataset.entryLabel || `Champ ${index + 1}`).trim(),
        type: String(field.dataset.entryType || 'text').trim() === 'textarea' ? 'textarea' : 'text',
        rows: Number(field.dataset.entryRows || 0) || 2,
        placeholder: String(field.dataset.entryPlaceholder || '').trim(),
        value: String(field.value || '').trim()
      }));
      renderRapportOrganEntries(block, specialtyKey, String(event.target.value || '').trim(), currentEntries);
      renderRapportPreview();
    }
  });

  modal.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.rapport-organ-delete-btn');
    if (!deleteButton) return;
    deleteButton.closest('.rapport-organ-block')?.remove();
    updateRapportOrganEmptyState();
    renderRapportPreview();
  });

  modal.dataset.rapportDynamicBound = '1';
}

function configureRapportStructuredFields(specialtyMeta, payload = {}) {
  const organsGroup = document.getElementById('rapport-organs-group');
  const organLabel = document.getElementById('rapport-label-organ');
  const addButton = document.getElementById('rapport-add-organ-btn');
  const organOptions = getRapportOrganOptionsForSpecialty(specialtyMeta?.key);
  const useStructuredMode = organOptions.length > 0;

  bindRapportDynamicFieldsOnce();

  if (organLabel) {
    organLabel.textContent = specialtyMeta?.report?.organLabel || 'Organes / Zones examines';
  }
  if (addButton) {
    addButton.textContent = '+ Ajouter un organe';
  }
  if (organsGroup) {
    organsGroup.style.display = useStructuredMode ? '' : 'none';
  }

  populateRapportOrganBlocks(payload?.organFindings || [], specialtyMeta?.key);
}

function applyRapportSpecialtyTemplate(specialtyKey = null) {
  const hiddenInput = document.getElementById('rapport-specialty-key');
  const resolvedKey = specialtyKey
    || hiddenInput?.value
    || documentModalState?.rapport?.data?.specialtyKey
    || (typeof resolveActivePracticeSpecialty === 'function' ?resolveActivePracticeSpecialty(window._packageConfig) : 'general');
  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
    ?getPracticeSpecialtyMeta(resolvedKey)
    : null;

  if (!specialtyMeta) return null;
  if (hiddenInput) hiddenInput.value = specialtyMeta.key;

  const assignments = [
    ['rapport-hero-kicker', specialtyMeta.report.kicker],
    ['rapport-hero-title', specialtyMeta.report.heroTitle],
    ['rapport-hero-subtitle', specialtyMeta.report.heroSubtitle],
    ['rapport-hero-badge', specialtyMeta.report.badge],
    ['rapport-type-label', specialtyMeta.report.typeLabel],
    ['rapport-label-motif', specialtyMeta.report.objectLabel],
    ['rapport-label-organ', specialtyMeta.report.organLabel || 'Organe / Zone *'],
    ['rapport-label-reco', specialtyMeta.report.recommendationsLabel]
  ];

  assignments.forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });

  const placeholders = [
    ['rapport-motif', specialtyMeta.report.objectPlaceholder],
    ['rapport-reco', specialtyMeta.report.recommendationsPlaceholder]
  ];

  placeholders.forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.placeholder = value;
    }
  });

  configureRapportStructuredFields(specialtyMeta, documentModalState?.rapport?.data || {});

  if (documentModalState?.rapport) {
    documentModalState.rapport.specialtyKey = specialtyMeta.key;
  }

  return specialtyMeta;
}

function fillRapportForm(data = {}) {
  const normalizedData = typeof normalizeRapportPayload === 'function'
    ?normalizeRapportPayload(data)
    : data;
  const specialtyMeta = applyRapportSpecialtyTemplate(normalizedData.specialtyKey);
  const dateInput = document.getElementById('rapport-date');
  if (dateInput) {
    const rawDate = normalizedData.date || normalizedData.emittedAt || new Date();
    dateInput.value = formatDateToInputValue(rawDate) || '';
  }
  const titleInput = document.getElementById('rapport-title');
  if (titleInput) {
    titleInput.value = normalizedData.documentTitle
      || specialtyMeta?.report?.printTitle
      || specialtyMeta?.report?.typeLabel
      || 'COMPTE RENDU';
  }
  document.getElementById('rapport-motif').value = normalizedData.motif || specialtyMeta?.report?.defaultMotif || '';
  document.getElementById('rapport-reco').value = normalizedData.recommandations || '';
  configureRapportStructuredFields(specialtyMeta, normalizedData);
}

function setRapportFormReadOnly(isReadOnly) {
  const modal = document.getElementById('modal-rapport');
  if (!modal) return;
  const fields = modal.querySelectorAll('input, textarea, select');
  fields.forEach((field) => {
    field.disabled = !!isReadOnly;
    field.classList.toggle('readonly-field', !!isReadOnly);
  });
  const actionButtons = modal.querySelectorAll('#rapport-add-organ-btn, .rapport-organ-delete-btn');
  actionButtons.forEach((button) => {
    button.disabled = !!isReadOnly;
  });
  const saveButton = document.getElementById('rapport-save-btn');
  if (saveButton) {
    saveButton.style.display = isReadOnly ?'none' : '';
  }
  const viewBanner = document.getElementById('rapport-view-banner');
  if (viewBanner) {
    viewBanner.style.display = isReadOnly ?'flex' : 'none';
  }
  if (documentModalState?.rapport) {
    documentModalState.rapport.readOnly = !!isReadOnly;
  }
}

function collectRapportFormData() {
  const specialtyKey = document.getElementById('rapport-specialty-key')?.value
    || documentModalState?.rapport?.specialtyKey
    || (typeof resolveActivePracticeSpecialty === 'function' ?resolveActivePracticeSpecialty(window._packageConfig) : 'general');
  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
    ?getPracticeSpecialtyMeta(specialtyKey)
    : { key: specialtyKey, label: 'Medecin generaliste', report: { typeLabel: 'Rapport medical' } };
  const organFindings = collectRapportOrganFindings();
  const organSummary = summarizeRapportOrganFindings(organFindings);

  return {
    specialtyKey: specialtyMeta.key,
    specialtyLabel: specialtyMeta.label,
    reportType: specialtyMeta.report.typeLabel,
    documentTitle: document.getElementById('rapport-title')?.value?.trim() || specialtyMeta.report.printTitle || specialtyMeta.report.typeLabel || 'COMPTE RENDU',
    date: document.getElementById('rapport-date').value,
    motif: document.getElementById('rapport-motif').value.trim(),
    organFindings,
    organTarget: organFindings[0]?.organ || '',
    contexte: organFindings[0]?.organ || '',
    constats: organSummary,
    priseEnCharge: '',
    recommandations: document.getElementById('rapport-reco').value.trim()
  };
}

async function openRapportModal(consultationId) {
  try {
    const { consultation, patient } = await fetchDocumentContext(consultationId);
    await ensureSettingsLoaded();
    const docResult = await window.api.document.getByType({ consultationId, documentType: 'rapport' });
    const existingDoc = docResult.success ?docResult.data : null;
    const rawPayload = existingDoc ?parseDocumentPayload(existingDoc.payload) : null;
    const payload = normalizeRapportPayload(rawPayload, { patient, consultation });
    documentModalState.rapport = {
      consultationId,
      patientId: patient.id,
      documentId: existingDoc?.id || null,
      data: payload,
      readOnly: false
    };
    setRapportSummary({
      patient,
      updatedAt: existingDoc?.updatedAt
        || existingDoc?.lastPrintedAt
        || consultation?.updatedAt
        || consultation?.createdAt
        || consultation?.consultationDate
        || new Date().toISOString()
    });
    fillRapportForm(payload);
    setRapportFormReadOnly(false);
    renderRapportPreview();
    showModal('modal-rapport');
  } catch (error) {
    console.error('Error opening rapport modal:', error);
    showNotification('Impossible d\'ouvrir le rapport', 'error');
  }
}

async function saveRapportDocument(event, options = {}) {
  if (event?.preventDefault) {
    event.preventDefault();
  }
  const { silent = false } = options;
  const state = documentModalState.rapport;
  if (state.readOnly) {
    if (!silent) {
      showNotification('Ce rapport est en lecture seule. Cliquez sur Modifier pour l\'?diter.', 'warning');
    }
    return { success: false };
  }
  if (!state.patientId) {
    showNotification('Aucun patient selectionne', 'error');
    return { success: false };
  }
  const data = collectRapportFormData();
  if (getRapportOrganOptionsForSpecialty(data.specialtyKey).length > 0 && (!Array.isArray(data.organFindings) || data.organFindings.length === 0)) {
    showNotification('Ajoutez au moins un organe avant d\'enregistrer le compte rendu', 'warning');
    return { success: false };
  }
  state.data = data;
  const response = await window.api.document.save({
    id: state.documentId,
    patientId: state.patientId,
    consultationId: state.consultationId || null,
    documentType: 'rapport',
    title: data.documentTitle || data.reportType || 'COMPTE RENDU',
    data
  });
  if (response.success) {
    documentModalState.rapport.documentId = response.id;
    documentModalState.rapport.readOnly = false;
    if (!state.consultationId && currentPatientId === state.patientId) {
      loadPatientRapports(currentPatientId);
    }
    if (!silent) {
      showNotification('Rapport enregistre', 'success');
    }
  } else if (!silent) {
    showNotification(response.error || 'Erreur lors de la sauvegarde', 'error');
  }
  return response;
}

async function printRapportDocument() {
  const state = documentModalState.rapport;
  if (!state.patientId) {
    showNotification('Selectionnez un patient avant impression', 'error');
    return;
  }
  const saveResult = await saveRapportDocument(null, { silent: true });
  if (!saveResult.success) {
    showNotification("Impossible d'enregistrer le rapport", 'error');
    return;
  }

  const printState = {
    documentId: documentModalState.rapport.documentId,
    patientId: state.patientId,
    consultationId: state.consultationId || null,
    data: { ...state.data }
  };

  closeModal('modal-rapport');
  showNotification('Rapport enregistre, impression en cours', 'success');
  void runRapportPrintPipeline(printState);
}

async function runInvoicePrintPipeline(state) {
  try {
    if (state.consultationId) {
      await generateInvoice(state.consultationId, { documentData: state.data, silentSuccess: true });
    } else {
      await generateInvoiceFromPatientDocument(state.patientId, state.data, { silentSuccess: true });
    }

    if (state.documentId) {
      await window.api.document.save({
        id: state.documentId,
        patientId: state.patientId,
        consultationId: state.consultationId,
        documentType: 'invoice',
        title: 'Facture',
        data: state.data,
        lastPrintedAt: new Date().toISOString()
      });
    }

    if (currentPatientId === state.patientId) {
      void loadPatientFactures(state.patientId);
    }
  } catch (error) {
    console.error('Error in invoice print pipeline:', error);
    showNotification("Erreur lors de l'impression de la facture", 'error');
  }
}

async function runRapportPrintPipeline(state) {
  try {
    if (state.consultationId) {
      await generateReport(state.consultationId, { documentData: state.data, silentSuccess: true });
    } else {
      await generateReportFromPatientDocument(state.patientId, state.data, { silentSuccess: true });
    }

    if (state.documentId) {
      await window.api.document.save({
        id: state.documentId,
        patientId: state.patientId,
        consultationId: state.consultationId,
        documentType: 'rapport',
        title: state.data?.documentTitle || state.data?.reportType || 'COMPTE RENDU',
        data: state.data,
        lastPrintedAt: new Date().toISOString()
      });
    }

    if (currentPatientId === state.patientId) {
      void loadPatientRapports(state.patientId);
    }
  } catch (error) {
    console.error('Error in rapport print pipeline:', error);
    showNotification("Erreur lors de l'impression du rapport", 'error');
  }
}

// Generate Invoice using shared A5 layout
async function generateInvoice(consultationId, options = {}) {
  try {
    await ensureSettingsLoaded();
    const { consultation, patient } = await fetchDocumentContext(consultationId);
    let invoiceData = options.documentData;
    if (!invoiceData) {
      const docResult = await window.api.document.getByType({ consultationId, documentType: 'invoice' });
      invoiceData = docResult.success && docResult.data
        ?parseDocumentPayload(docResult.data.payload)
        : getDefaultFactureData({ consultation, settings: cachedSettings });
    }
    await renderInvoiceDocument({ patient, invoiceData });
    if (!options.silentSuccess) {
      showNotification("Facture prete a l'impression", 'success');
    }
  } catch (error) {
    console.error('Error generating invoice:', error);
    showNotification("Erreur lors de l'impression de la facture", 'error');
  }
}

async function generateInvoiceFromPatientDocument(patientId, documentData, options = {}) {
  try {
    await ensureSettingsLoaded();
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success || !patientResult.data) {
      throw new Error('Patient introuvable');
    }
    let invoiceData = documentData;
    if (!invoiceData) {
      const docResult = await window.api.document.getByType({ patientId, documentType: 'invoice' });
      invoiceData = docResult.success && docResult.data
        ?parseDocumentPayload(docResult.data.payload)
        : getDefaultFactureData({ consultation: null, settings: cachedSettings });
    }
    await renderInvoiceDocument({ patient: patientResult.data, invoiceData });
    if (!options.silentSuccess) {
      showNotification("Facture prete a l'impression", 'success');
    }
  } catch (error) {
    console.error('Error generating patient invoice:', error);
    showNotification(`Erreur d'impression: ${error.message}`, 'error');
  }
}

// Generate Report using shared A5 layout
async function generateReport(consultationId, options = {}) {
  try {
    await ensureSettingsLoaded();
    const { consultation, patient } = await fetchDocumentContext(consultationId);
    let rapportData = options.documentData;
    if (!rapportData) {
      const docResult = await window.api.document.getByType({ consultationId, documentType: 'rapport' });
      rapportData = docResult.success && docResult.data
        ?parseDocumentPayload(docResult.data.payload)
        : getDefaultRapportData({ patient, consultation });
    }
    const normalizedData = normalizeRapportPayload(rapportData, { patient, consultation });
    await renderRapportDocument({
      patient,
      rapportData: normalizedData,
      dateHint: consultation.consultationDate || consultation.updatedAt || consultation.createdAt,
      consultation
    });
    if (!options.silentSuccess) {
      showNotification("Rapport pret a l'impression", 'success');
    }
  } catch (error) {
    console.error('Error generating report:', error);
    showNotification("Erreur lors de l'impression du rapport", 'error');
  }
}

async function generateReportFromPatientDocument(patientId, documentData, options = {}) {
  try {
    await ensureSettingsLoaded();
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success || !patientResult.data) {
      throw new Error('Patient introuvable');
    }
    let rapportData = documentData;
    let dateHint = documentData?.emittedAt || documentData?.date || null;
    if (!rapportData) {
      const docResult = await window.api.document.getByType({ patientId, documentType: 'rapport' });
      if (docResult.success && docResult.data) {
        rapportData = parseDocumentPayload(docResult.data.payload);
        dateHint = docResult.data.updatedAt || docResult.data.createdAt || dateHint;
      } else {
        rapportData = getDefaultRapportData({ patient: patientResult.data });
      }
    }
    const normalizedData = normalizeRapportPayload(rapportData, { patient: patientResult.data });
    await renderRapportDocument({ patient: patientResult.data, rapportData: normalizedData, dateHint, consultation: null });
    if (!options.silentSuccess) {
      showNotification("Rapport pret a l'impression", 'success');
    }
  } catch (error) {
    console.error('Error generating patient report:', error);
    showNotification(`Erreur d'impression: ${error.message}`, 'error');
  }
}

// Print Certificate Document (Sick Leave / Medical Certificate)
async function saveCertificateDocument() {
  await printCertificateDocument();
}

async function printCertificateDocument() {
  // This calls the printSickLeaveDetails function from documents-printing.js
  // The currentSickLeaveId should be set when viewing a sick leave document
  if (typeof printSickLeaveDetails === 'function') {
    await printSickLeaveDetails();
  } else {
    showNotification('Fonction d\'impression non disponible', 'error');
  }
}

window.saveCertificateDocument = saveCertificateDocument;
window.openFactureModal = openFactureModal;
window.saveInvoiceDocument = saveInvoiceDocument;
window.printInvoiceDocument = printInvoiceDocument;
window.openRapportModal = openRapportModal;
window.saveRapportDocument = saveRapportDocument;
window.printRapportDocument = printRapportDocument;

// ==================== BON POUR (MEDICAL REQUEST) ====================

/**
 * Open the "Bon Pour" modal for medical requests (analyses, radios, etc.)
 */
async function openBonPourModal(patientId, preset = null) {
  if (!patientId) {
    showNotification('Veuillez selectionner un patient', 'warning');
    return;
  }
  
  // Get patient info
  let patient = null;
  try {
    const result = await window.api.patient.getById(patientId);
    if (result.success) {
      patient = result.data;
    }
  } catch (error) {
    console.error('Error loading patient:', error);
  }
  
  const patientName = patient ?`${patient.lastName || ''} ${patient.firstName || ''}`.trim() : 'Patient';
  const today = typeof getTodayInAlgeria === 'function' ?getTodayInAlgeria() : formatDateToInputValue();
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('modal-bonpour');
  if (!modal) {
    const modalHtml = `
      <div id="modal-bonpour" class="modal medical-document-modal">
        <div class="modal-overlay" onclick="closeModal('modal-bonpour')"></div>
        <div class="modal-content modal-large">
          <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white;">
            <h2>Faire Svp - Demande médicale</h2>
            <button class="close-btn" onclick="closeModal('modal-bonpour')" style="color: white;">&times;</button>
          </div>
          <div class="modal-body document-modal-body bonpour-modal-body">
            <input type="hidden" id="bonpour-patient-id">
            
            <div class="document-editor-hero document-editor-hero--violet">
              <div class="document-editor-brand">
                <div class="document-editor-logo">
                  ${typeof getDocumentEditorLogoHTML === 'function' ?getDocumentEditorLogoHTML() : '<span>MC</span>'}
                </div>
                <div>
                  <div class="document-editor-kicker">Demande médicale</div>
                  <div class="document-editor-title">Faire Svp</div>
                  <div class="document-editor-subtitle">Préparez une demande claire pour l'imagerie, les analyses ou un examen spécialisé.</div>
                </div>
              </div>
              <div class="document-editor-badge">Demande</div>
            </div>

            <div class="document-summary-grid">
              <div>
                <p><strong>Patient :</strong> <span id="bonpour-patient-name"></span></p>
              </div>
              <div>
                <p><strong>Familles gérées :</strong> Radiographie, IRM, Scanner CT, Échographie, Mammographie</p>
              </div>
            </div>
            
            <div class="form-row bonpour-meta-row">
              <div class="form-group">
                <label>Date</label>
                <input type="date" id="bonpour-date" class="form-control">
              </div>
              <div class="form-group">
                <label>Côté (Latéralité)</label>
                <select id="bonpour-laterality" class="form-control">
                  <option value="">-- Non spécifié --</option>
                  <option value="droit">Droit</option>
                  <option value="gauche">Gauche</option>
                  <option value="bilatéral">Bilatéral (les deux)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Type de demande</label>
                <select id="bonpour-type" class="form-control" onchange="updateBonPourContent()">
                  <option value="analyses">Analyses biologiques</option>
                  <option value="radio">Radiographie</option>
                  <option value="scanner">Scanner</option>
                  <option value="irm">IRM</option>
                  <option value="echo">Échographie</option>
                  <option value="emg">EMG / ENMG</option>
                  <option value="doppler">Doppler</option>
                  <option value="kine">Kinésithérapie</option>
                  <option value="other">Autre</option>
                </select>
              </div>
              <div class="form-group">
                <label>Taille du texte du corps</label>
                <input type="number" id="bonpour-body-font-size" class="form-control" min="10" max="18" step="0.5" value="11">
                <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Ajuste uniquement le texte du contenu imprimé, pas l'en-tête ni le pied de page.</div>
              </div>
            </div>

            <div class="bonpour-top-grid">
              <div class="form-group bonpour-details-card">
                <label>Détails de la demande</label>
                <textarea id="bonpour-details" class="form-control bonpour-details-source" rows="6" placeholder="Précisez les examens demandés..."></textarea>
                <div class="bonpour-details-columns">
                  <textarea id="bonpour-details-left" class="form-control bonpour-details-column" rows="6" placeholder="- FNS complete&#10;- VS&#10;- CRP"></textarea>
                  <textarea id="bonpour-details-right" class="form-control bonpour-details-column" rows="6" placeholder="- Glycémie à jeun&#10;- Créatinine&#10;- Urée"></textarea>
                </div>
                <div class="bonpour-details-actions">
                  <button type="button" id="bonpour-add-analysis-btn" class="btn btn-outline" onclick="addAnotherBonPourAnalysis()">➕ Ajouter une autre analyse</button>
                  <button type="button" id="bonpour-remove-analysis-btn" class="btn btn-danger btn-small" onclick="removeLastBonPourAnalysis()">Supprimer la dernière</button>
                </div>
              </div>

              <div class="bonpour-side-stack">
                <div class="form-group">
                  <label>Indication clinique</label>
                  <input type="text" id="bonpour-indication" class="form-control" placeholder="Ex: Bilan pré-opératoire, contrôle glycémie...">
                </div>
                <div class="form-group">
                  <label>Notes complémentaires</label>
                  <textarea id="bonpour-notes" class="form-control" rows="3" placeholder="Informations supplémentaires..."></textarea>
                </div>
              </div>
            </div>
            
            <div id="bonpour-specialty-presets-container" class="bonpour-specialty-presets-container" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <label style="font-size: 13px; font-weight: 600; margin-bottom: 8px; display: block;">Modèles d'examens par spécialité</label>
              <div id="bonpour-specialty-presets" class="patient-documents-chip-grid" style="display: flex; gap: 8px; flex-wrap: wrap;">
                <!-- Populated dynamically by JS -->
              </div>
            </div>
            
            <div class="orientation-quick-panel bonpour-check-panel" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <label style="font-size: 13px; font-weight: 600; margin-bottom: 10px; display: block;">Examens courants (cochez pour ajouter)</label>
              <div id="bonpour-quick-items" class="checkbox-grid bonpour-checkbox-grid">
                <!-- Populated by JS based on type -->
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-split">
            <button class="btn btn-secondary" onclick="closeModal('modal-bonpour')">Annuler</button>
            <div class="modal-footer-actions">
              <button class="btn btn-primary" onclick="printBonPour()" style="background: #8b5cf6; border-color: #7c3aed;">Enregistrer et imprimer</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('modal-bonpour');
    if (typeof refreshDocumentEditorLogos === 'function') {
      refreshDocumentEditorLogos();
    }
  }
  
  // Fill in patient info
  document.getElementById('bonpour-patient-id').value = patientId;
  document.getElementById('bonpour-patient-name').textContent = patientName;
  document.getElementById('bonpour-date').value = today;
  document.getElementById('bonpour-details').value = '';
  document.getElementById('bonpour-indication').value = '';
  document.getElementById('bonpour-notes').value = '';
  document.getElementById('bonpour-type').value = preset?.type || 'analyses';
  document.getElementById('bonpour-body-font-size').value = '11';
  
  // Clear edit ID (for new documents)
  const existingEditId = document.getElementById('bonpour-edit-id');
  if (existingEditId) existingEditId.remove();
  
  if (document.getElementById('bonpour-laterality')) {
    document.getElementById('bonpour-laterality').value = '';
  }

  bindBonPourDetailsColumnSync();
  
  // Update quick items
  updateBonPourContent();

  const specialtyConfig = typeof getPatientDocumentSpecialtyConfig === 'function'
    ? getPatientDocumentSpecialtyConfig()
    : { label: 'Général', imaging: [], orientations: [] };

  const presetsContainer = document.getElementById('bonpour-specialty-presets');
  if (presetsContainer) {
    if (specialtyConfig.imaging && specialtyConfig.imaging.length > 0) {
      document.getElementById('bonpour-specialty-presets-container').style.display = 'block';
      window.patientDocumentPresetMap = window.patientDocumentPresetMap || {};
      
      presetsContainer.innerHTML = specialtyConfig.imaging.map((p) => {
        const id = `imaging-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        window.patientDocumentPresetMap[id] = p;
        return `
          <button type="button" class="patient-documents-chip btn btn-secondary btn-small" 
                  onclick="applyBonPourPreset('${id}')" 
                  style="cursor: pointer; background: #fff; border: 1px solid #d1d5db; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin: 2px;">
            ${escapeHTML(p.label)}
          </button>
        `;
      }).join('') + `
        <button type="button" class="patient-documents-chip btn btn-outline btn-small" 
                onclick="clearBonPourForm()" 
                style="cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin: 2px;">
          Demande libre (Vider)
        </button>
      `;
    } else {
      document.getElementById('bonpour-specialty-presets-container').style.display = 'none';
    }
  }

  if (preset) {
    const detailsTextarea = document.getElementById('bonpour-details');
    const indicationInput = document.getElementById('bonpour-indication');
    const notesInput = document.getElementById('bonpour-notes');

    if (detailsTextarea && preset.details) {
      detailsTextarea.value = String(preset.details || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.startsWith('-') ? line : `- ${line}`)
        .join('\n');
    }
    if (indicationInput && preset.indication) indicationInput.value = preset.indication;
    if (notesInput && preset.notes) notesInput.value = preset.notes;
    syncBonPourDetailColumnsFromTextarea();
    syncBonPourSelectionsFromTextarea();
  }

  const detailsTextarea = document.getElementById('bonpour-details');
  if (detailsTextarea && !detailsTextarea.dataset.syncBound) {
    detailsTextarea.addEventListener('input', () => {
      syncBonPourDetailColumnsFromTextarea();
      syncBonPourSelectionsFromTextarea();
    });
    detailsTextarea.dataset.syncBound = '1';
  }

  const lateralitySelect = document.getElementById('bonpour-laterality');
  if (lateralitySelect && !lateralitySelect.dataset.syncBound) {
    lateralitySelect.addEventListener('change', () => {
      updateBonPourContent();
    });
    lateralitySelect.dataset.syncBound = '1';
  }
  
  openModal('modal-bonpour');
}

function getBonPourDetailsColumns() {
  return [
    document.getElementById('bonpour-details-left'),
    document.getElementById('bonpour-details-right')
  ].filter(Boolean);
}

function parseBonPourDetailsLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitBonPourDetailsLines(lines) {
  const items = Array.isArray(lines) ?lines : [];
  const midpoint = Math.ceil(items.length / 2);
  return [items.slice(0, midpoint), items.slice(midpoint)];
}

function syncBonPourDetailColumnsFromTextarea() {
  const textarea = document.getElementById('bonpour-details');
  const [leftColumn, rightColumn] = getBonPourDetailsColumns();
  if (!textarea || !leftColumn || !rightColumn) return;

  const [leftLines, rightLines] = splitBonPourDetailsLines(parseBonPourDetailsLines(textarea.value));
  leftColumn.value = leftLines.join('\n');
  rightColumn.value = rightLines.join('\n');
}

function syncBonPourTextareaFromColumns() {
  const textarea = document.getElementById('bonpour-details');
  const [leftColumn, rightColumn] = getBonPourDetailsColumns();
  if (!textarea || !leftColumn || !rightColumn) return;

  const nextValue = [
    ...parseBonPourDetailsLines(leftColumn.value),
    ...parseBonPourDetailsLines(rightColumn.value)
  ].join('\n');

  textarea.value = nextValue;
  syncBonPourSelectionsFromTextarea();
}

function focusBonPourDetailsEnd() {
  const [leftColumn, rightColumn] = getBonPourDetailsColumns();
  const target = rightColumn && rightColumn.value.trim() ?rightColumn : leftColumn || rightColumn;
  if (!target) return;

  target.focus();
  const caretIndex = target.value.length;
  target.selectionStart = caretIndex;
  target.selectionEnd = caretIndex;
}

function bindBonPourDetailsColumnSync() {
  getBonPourDetailsColumns().forEach((column) => {
    if (!column || column.dataset.syncBound) return;
    column.addEventListener('input', syncBonPourTextareaFromColumns);
    column.dataset.syncBound = '1';
  });
}

/**
 * Update quick item buttons based on selected type
 */
function updateBonPourContent() {
  const type = document.getElementById('bonpour-type').value;
  const container = document.getElementById('bonpour-quick-items');
  if (!container) return;
  
  const quickItems = {
    analyses: [
      // Hématologie
      'FNS complete', 'VS', 'CRP', 'TP/INR', 'Fibrinogene',
      // Glycémie
      'Glycémie à jeun', 'HbA1c', 'Glycémie post-prandiale',
      // Fonction rénale
      'Urée', 'Créatinine', 'Acide urique', 'Ionogramme sanguin',
      // Fonction hépatique
      'ASAT', 'ALAT', 'GGT', 'PAL', 'Bilirubine totale',
      // Bilan lipidique
      'Cholestérol total', 'HDL', 'LDL', 'Triglycérides',
      // Thyroïde
      'TSH us', 'T3', 'T4', 'Ac anti-TPO',
      // Rhumatologie / Auto-immunité
      'Facteur rhumatoïde', 'Ac anti-CCP', 'Ac anti-nucléaires (ANA)', 'HLA B27',
      // Autres
      'Vitamine D', 'Vitamine B12', 'Fer sérique', 'Ferritine', 'Transferrine',
      'Calcémie', 'Phosphorémie', 'Magnésémie', 'Albumine',
      'Électrophorèse des protéines', 'CPK', 'LDH', 'Homocystéine',
      // Urines
      'ECBU', 'Protéinurie des 24h', 'Microalbuminurie'
    ],
    radio: [
      // Membre supérieur
      'Rx de l\'épaule face et profil',
      'Rx du coude face et profil',
      'Rx du poignet face et profil',
      'Rx de la main face et profil',
      'Rx du bras face et profil',
      'Rx de l\'avant-bras face et profil',
      // Membre inférieur
      'Rx de la hanche face et profil',
      'Rx du fémur face et profil',
      'Rx du genou face et profil',
      'Rx du genou en charge',
      'Rx de la jambe face et profil',
      'Rx de la cheville face et profil',
      'Rx du pied face et profil',
      // Rachis
      'Rx du rachis cervical face et profil',
      'Rx du rachis dorsal face et profil',
      'Rx du rachis lombaire face et profil',
      'Rx du rachis entier F/P (Télémétrie)',
      // Autres
      'Rx du bassin face',
      'Rx du thorax face',
      'Rx des sacro-iliaques'
    ],
    scanner: ['Scanner cérébral', 'Scanner rachis cervical', 'Scanner rachis dorsal', 'Scanner rachis lombaire', 'Scanner épaule', 'Scanner genou', 'Scanner cheville', 'Scanner hanche', 'TDM thoracique', 'TDM abdomino-pelvien'],
    irm: ['IRM cérébrale', 'IRM rachis cervical', 'IRM rachis dorsal', 'IRM rachis lombaire', 'IRM épaule', 'IRM genou', 'IRM hanche', 'IRM cheville', 'IRM poignet', 'IRM coude'],
    echo: ['Écho abdominale', 'Écho thyroïde', 'Écho parties molles', 'Écho articulaire', 'Écho épaule', 'Écho genou', 'Écho hanche'],
    emg: ['EMG membres supérieurs', 'EMG membres inférieurs', 'EMG 4 membres', 'ENMG', 'Vitesses de conduction nerveuse'],
    doppler: ['Doppler TSA', 'Doppler membres inférieurs artériel', 'Doppler membres inférieurs veineux', 'Doppler membres supérieurs'],
    kine: ['Rééducation fonctionnelle', 'Renforcement musculaire', 'Mobilisation passive', 'Drainage lymphatique', 'Électrothérapie', 'Massage', 'Physiothérapie'],
    other: []
  };
  
  const items = quickItems[type] || [];
  container.innerHTML = items.map((item) => `
    <label class="bonpour-check-item">
      <input type="checkbox" data-item="${encodeURIComponent(item)}" onchange="toggleBonPourItemSelection(this)">
      <span>${escapeHTML(item)}</span>
    </label>
  `).join('');

  const addAnalysisBtn = document.getElementById('bonpour-add-analysis-btn');
  const removeAnalysisBtn = document.getElementById('bonpour-remove-analysis-btn');
  if (addAnalysisBtn) {
    addAnalysisBtn.style.display = type === 'analyses' ?'inline-flex' : 'none';
  }
  if (removeAnalysisBtn) {
    removeAnalysisBtn.style.display = type === 'analyses' ?'inline-flex' : 'none';
  }

  syncBonPourDetailColumnsFromTextarea();
  syncBonPourSelectionsFromTextarea();
}

function addAnotherBonPourAnalysis() {
  const typeSelect = document.getElementById('bonpour-type');
  const textarea = document.getElementById('bonpour-details');
  if (!typeSelect || !textarea || typeSelect.value !== 'analyses') {
    return;
  }

  const current = textarea.value.trim();
  if (!current) {
    textarea.value = '- ';
    syncBonPourDetailColumnsFromTextarea();
    focusBonPourDetailsEnd();
    return;
  }

  textarea.value = `${current}\n- `;
  syncBonPourDetailColumnsFromTextarea();
  focusBonPourDetailsEnd();
}

function removeLastBonPourAnalysis() {
  const typeSelect = document.getElementById('bonpour-type');
  const textarea = document.getElementById('bonpour-details');
  if (!typeSelect || !textarea || typeSelect.value !== 'analyses') {
    return;
  }

  const lines = textarea.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return;
  }

  lines.pop();
  textarea.value = lines.join('\n');
  syncBonPourDetailColumnsFromTextarea();
  syncBonPourSelectionsFromTextarea();
}

function formatBonPourItem(item) {
  const lateralitySelect = document.getElementById('bonpour-laterality');
  let itemText = item;
  if (lateralitySelect && lateralitySelect.value) {
    const laterality = lateralitySelect.value;
    const noLateralityItems = ['rachis', 'thorax', 'bassin', 'telemetrie', 'sacro-iliaques'];
    const isNoLaterality = noLateralityItems.some((term) => item.toLowerCase().includes(term));
    if (!isNoLaterality) {
      itemText = `${item} ${laterality}`;
    }
  }
  return itemText;
}

function normalizeBonPourLine(value) {
  return String(value || '').replace(/^[-?]\s*/, '').trim().toLowerCase();
}

function matchesBonPourItemLine(line, item) {
  const normalizedLine = normalizeBonPourLine(line);
  const normalizedItem = normalizeBonPourLine(item);
  return normalizedLine === normalizedItem || normalizedLine.startsWith(`${normalizedItem} `);
}

function toggleBonPourItemSelection(checkbox) {
  const textarea = document.getElementById('bonpour-details');
  const rawItem = checkbox?.dataset?.item ?decodeURIComponent(checkbox.dataset.item) : '';
  if (!textarea || !rawItem) return;

  const formattedItem = formatBonPourItem(rawItem);
  const currentLines = textarea.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const nextLines = checkbox.checked
    ?[...currentLines]
    : currentLines.filter((line) => {
        return !matchesBonPourItemLine(line, formattedItem) && !matchesBonPourItemLine(line, rawItem);
      });

  if (checkbox.checked) {
    const exists = nextLines.some((line) => matchesBonPourItemLine(line, rawItem));
    if (!exists) {
      nextLines.push(`- ${formattedItem}`);
    }
  }

  textarea.value = nextLines.join('\n');
  syncBonPourDetailColumnsFromTextarea();
}

function syncBonPourSelectionsFromTextarea() {
  const textarea = document.getElementById('bonpour-details');
  const checkboxes = document.querySelectorAll('#bonpour-quick-items input[type="checkbox"]');
  if (!textarea || !checkboxes.length) return;

  const normalizedLines = textarea.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  checkboxes.forEach((checkbox) => {
    const rawItem = checkbox?.dataset?.item ?decodeURIComponent(checkbox.dataset.item) : '';
    const formattedItem = formatBonPourItem(rawItem);
    checkbox.checked = normalizedLines.some((line) => matchesBonPourItemLine(line, rawItem) || matchesBonPourItemLine(line, formattedItem));
  });
}

/**
 * Add quick item to details with laterality
 */
function addBonPourItem(item) {
  const checkbox = document.querySelector(`#bonpour-quick-items input[data-item="${encodeURIComponent(item)}"]`);
  if (checkbox) {
    checkbox.checked = true;
    toggleBonPourItemSelection(checkbox);
  }
}

/**
 * Print the Bon Pour document using the same A5 structure as ordonnance
 */
async function printBonPour() {
  try {
    await ensureSettingsLoaded();

    const patientId = document.getElementById('bonpour-patient-id').value;
    const date = document.getElementById('bonpour-date').value;
    const type = document.getElementById('bonpour-type').selectedOptions[0]?.text || 'Demande medicale';
    const details = document.getElementById('bonpour-details').value;
    const indication = document.getElementById('bonpour-indication').value;
    const notes = document.getElementById('bonpour-notes').value;
    const requestedBodyFontSize = parseFloat(document.getElementById('bonpour-body-font-size')?.value || '11') || 11;
    const bodyFontSize = Math.min(11.5, Math.max(10.5, requestedBodyFontSize));

    if (!details.trim()) {
      showNotification('Veuillez preciser les examens demandes', 'warning');
      return;
    }

    let patient = null;
    try {
      const result = await window.api.patient.getById(patientId);
      if (result.success) {
        patient = result.data;
      }
    } catch (error) {
      console.error('Error loading patient:', error);
    }

    const detailsLines = details.split('\n').filter(line => line.trim());
    let detailsHtml = `<div class="exam-list" style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px 10px; font-size:${bodyFontSize}pt;">`;
    detailsLines.forEach((line) => {
      const cleanLine = line.replace(/^[-?]\s*/, '').trim();
      detailsHtml += `<div class="exam-item">- ${escapeHTML(cleanLine)}</div>`;
    });
    detailsHtml += '</div>';

    const frontPageContent = `
      <div class="content-box">
        <h3>Examens demandes</h3>
        <style>
          .exam-item { font-size: ${Math.min(bodyFontSize, 10.4)}pt; padding: 2px 0; line-height: 1.4; break-inside: avoid; word-break: break-word; }
          .exam-list { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px 10px; align-items:start; }
          .bonpour-body-text { font-size: ${bodyFontSize}pt; line-height: 1.6; }
        </style>
        ${detailsHtml}
      </div>
    `;

    const backPageContent = `
      ${indication ?`
        <div class="content-box">
          <h3>Indication clinique</h3>
          <div class="content-text bonpour-body-text">${escapeHTML(indication)}</div>
        </div>
      ` : ''}
      ${notes ?`
        <div class="content-box">
          <h3>Notes complementaires</h3>
          <div class="content-text bonpour-body-text">${escapeHTML(notes)}</div>
        </div>
      ` : ''}
    `;

    const editIdEl = document.getElementById('bonpour-edit-id');
    const existingDocId = editIdEl ?editIdEl.value : null;
    const savePayload = {
      patientId,
      documentType: 'bonpour',
      title: type,
      data: {
        date,
        type,
        details,
        indication,
        notes,
        bodyFontSize,
        examCount: detailsLines.length
      }
    };

    if (existingDocId) {
      savePayload.id = existingDocId;
      console.log('?Updating existing Bon Pour:', existingDocId);
    }

    const saveResult = await window.api.document.save(savePayload);
    if (!saveResult?.success) {
      showNotification(saveResult?.error || "Erreur lors de l'enregistrement du document", 'error');
      return;
    }

    closeModal('modal-bonpour');
    showNotification('Bon pour enregistre, impression en cours', 'success');
    void runBonPourPrintPipeline({
      patientId,
      title: type,
      dateLabel: formatDocumentDateLabel(date),
      patient,
      frontPageContent,
      backPageContent
    });
  } catch (error) {
    console.error('Error printing bon pour:', error);
    showNotification("Erreur lors de l'impression", 'error');
  }
}
// Make functions globally available
window.openBonPourModal = openBonPourModal;
window.updateBonPourContent = updateBonPourContent;
window.addBonPourItem = addBonPourItem;
window.toggleBonPourItemSelection = toggleBonPourItemSelection;
window.printBonPour = printBonPour;
window.syncBonPourDetailColumnsFromTextarea = syncBonPourDetailColumnsFromTextarea;
window.syncBonPourSelectionsFromTextarea = syncBonPourSelectionsFromTextarea;


// ==================== LETTRE D'ORIENTATION (ORIENTATION LETTER) ====================

/**
 * Open the "Lettre d'orientation" modal for referral letters to specialists
 */
async function openOrientationModal(patientId, preset = null) {
  if (!patientId) {
    showNotification('Veuillez selectionner un patient', 'warning');
    return;
  }
  
  // Get patient info
  let patient = null;
  try {
    const result = await window.api.patient.getById(patientId);
    if (result.success) {
      patient = result.data;
    }
  } catch (error) {
    console.error('Error loading patient:', error);
  }
  
  const patientName = patient ?`${patient.lastName || ''} ${patient.firstName || ''}`.trim() : 'Patient';
  const today = typeof getTodayInAlgeria === 'function' ?getTodayInAlgeria() : formatDateToInputValue();
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('modal-orientation');
  if (!modal) {
    const modalHtml = `
      <div id="modal-orientation" class="modal medical-document-modal">
        <div class="modal-overlay" onclick="closeModal('modal-orientation')"></div>
        <div class="modal-content modal-large">
          <div class="modal-header" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white;">
            <h2>Lettre d'orientation</h2>
            <button class="close-btn" onclick="closeModal('modal-orientation')" style="color: white;">&times;</button>
          </div>
          <div class="modal-body document-modal-body orientation-modal-body">
            <input type="hidden" id="orientation-patient-id">
            
            <div class="document-editor-hero document-editor-hero--emerald">
              <div class="document-editor-brand">
                <div class="document-editor-logo">
                  ${typeof getDocumentEditorLogoHTML === 'function' ?getDocumentEditorLogoHTML() : '<span>MC</span>'}
                </div>
                <div>
                  <div class="document-editor-kicker">Courrier medical</div>
                  <div class="document-editor-title">Lettre d'orientation</div>
                  <div class="document-editor-subtitle">Adressez le patient a un specialiste avec un courrier plus propre et plus lisible.</div>
                </div>
              </div>
              <div class="document-editor-badge">Orientation</div>
            </div>

            <div class="document-summary-grid">
              <div>
                <p><strong>Patient :</strong> <span id="orientation-patient-name"></span></p>
              </div>
              <div>
                <p><strong>Type :</strong> Orientation vers confrere, consoeur ou specialiste</p>
              </div>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label>Date</label>
              <input type="date" id="orientation-date" class="form-control">
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label>Destinataire (Cher confrere/consoeur)</label>
              <select id="orientation-destinataire" class="form-control">
                <option value="confrere">Cher confrere</option>
                <option value="consoeur">Chere consoeur</option>
                <option value="confrere (consoeur)">Cher confrere (consoeur)</option>
              </select>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label>Specialite d'orientation</label>
              <select id="orientation-specialty" class="form-control">
                <option value="">-- Selectionner --</option>
                <option value="Medecin generaliste">Medecin generaliste</option>
                <option value="Rhumatologue">Rhumatologue</option>
                <option value="Neurologue">Neurologue</option>
                <option value="Orthopediste">Orthopediste</option>
                <option value="Neurochirurgien">Neurochirurgien</option>
                <option value="Cardiologue">Cardiologue</option>
                <option value="Pneumologue">Pneumologue</option>
                <option value="Endocrinologue">Endocrinologue</option>
                <option value="Gastro-enterologue">Gastro-enterologue</option>
                <option value="Dermatologue">Dermatologue</option>
                <option value="ORL">ORL</option>
                <option value="Ophtalmologue">Ophtalmologue</option>
                <option value="Urologue">Urologue</option>
                <option value="Gynecologue">Gynecologue</option>
                <option value="Psychiatre">Psychiatre</option>
                <option value="Radiologue">Radiologue</option>
                <option value="Kinesitherapeute">Kinesitherapeute</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label>Antecedents</label>
              <textarea id="orientation-antecedents" class="form-control" rows="2" placeholder="Antecedents medicaux du patient..."></textarea>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label>Presente (symptomes/diagnostic)</label>
              <textarea id="orientation-symptoms" class="form-control" rows="3" placeholder="Symptomes et diagnostic actuel..."></textarea>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label>Motif d'orientation (je vous le confie pour...)</label>
              <textarea id="orientation-motif" class="form-control" rows="3" placeholder="Motif de l'orientation et prise en charge demandee..."></textarea>
            </div>

            <div class="form-group document-preview-card document-preview-span-full">
              <label>Apercu de la lettre</label>
              <div id="orientation-preview" class="document-live-preview"></div>
              <small style="color: #666; display: block; margin-top: 6px;">
                Le texte du courrier se met a jour selon les champs saisis.
              </small>
            </div>
            
            <div id="orientation-specialty-presets-container" class="orientation-specialty-presets-container" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <label style="font-size: 13px; font-weight: 600; margin-bottom: 8px; display: block;">Modèles courants par spécialité</label>
              <div id="orientation-specialty-presets" class="patient-documents-chip-grid" style="display: flex; gap: 8px; flex-wrap: wrap;">
                <!-- Populated dynamically by JS -->
              </div>
            </div>
            
            <div class="orientation-quick-panel" style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <label style="font-size: 13px; font-weight: 600; margin-bottom: 10px; display: block;">Motifs courants (cliquez pour ajouter)</label>
              <div id="orientation-quick-items" style="display: flex; flex-wrap: wrap; gap: 8px;">
                <button type="button" class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="addOrientationMotif('Avis specialise')">Avis specialise</button>
                <button type="button" class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="addOrientationMotif('Prise en charge')">Prise en charge</button>
                <button type="button" class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="addOrientationMotif('Bilan complementaire')">Bilan complementaire</button>
                <button type="button" class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="addOrientationMotif('Suivi')">Suivi</button>
                <button type="button" class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="addOrientationMotif('Traitement specialise')">Traitement specialise</button>
                <button type="button" class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="addOrientationMotif('Intervention chirurgicale')">Intervention chirurgicale</button>
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-split">
            <button class="btn btn-secondary" onclick="closeModal('modal-orientation')">Annuler</button>
            <div class="modal-footer-actions">
              <button class="btn btn-primary" onclick="printOrientation()" style="background: #059669; border-color: #047857;">Enregistrer et imprimer</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('modal-orientation');
    if (typeof refreshDocumentEditorLogos === 'function') {
      refreshDocumentEditorLogos();
    }
    bindDocumentPreviewInputs([
      'orientation-date',
      'orientation-destinataire',
      'orientation-specialty',
      'orientation-antecedents',
      'orientation-symptoms',
      'orientation-motif'
    ], renderOrientationPreview);
  }
  
  // Fill in patient info
  document.getElementById('orientation-patient-id').value = patientId;
  document.getElementById('orientation-patient-name').textContent = patientName;
  document.getElementById('orientation-date').value = today;
  document.getElementById('orientation-destinataire').value = 'confrere (consoeur)';
  document.getElementById('orientation-specialty').value = '';
  document.getElementById('orientation-antecedents').value = '';
  document.getElementById('orientation-symptoms').value = '';
  document.getElementById('orientation-motif').value = '';

  const specialtyConfig = typeof getPatientDocumentSpecialtyConfig === 'function'
    ? getPatientDocumentSpecialtyConfig()
    : { label: 'Général', imaging: [], orientations: [] };

  const presetsContainer = document.getElementById('orientation-specialty-presets');
  if (presetsContainer) {
    if (specialtyConfig.orientations && specialtyConfig.orientations.length > 0) {
      document.getElementById('orientation-specialty-presets-container').style.display = 'block';
      window.patientDocumentPresetMap = window.patientDocumentPresetMap || {};
      
      presetsContainer.innerHTML = specialtyConfig.orientations.map((p) => {
        const id = `orientation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        window.patientDocumentPresetMap[id] = p;
        return `
          <button type="button" class="patient-documents-chip btn btn-secondary btn-small" 
                  onclick="applyOrientationPreset('${id}')" 
                  style="cursor: pointer; background: #fff; border: 1px solid #d1d5db; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin: 2px;">
            ${escapeHTML(p.label)}
          </button>
        `;
      }).join('') + `
        <button type="button" class="patient-documents-chip btn btn-outline btn-small" 
                onclick="clearOrientationForm()" 
                style="cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin: 2px;">
          Orientation libre (Vider)
        </button>
      `;
    } else {
      document.getElementById('orientation-specialty-presets-container').style.display = 'none';
    }
  }

  if (preset) {
    const specialtySelect = document.getElementById('orientation-specialty');
    if (specialtySelect && preset.specialty) {
      const presetSpecialty = String(preset.specialty || '').trim();
      const hasOption = Array.from(specialtySelect.options).some((option) => option.value === presetSpecialty);
      if (!hasOption) {
        const option = document.createElement('option');
        option.value = presetSpecialty;
        option.textContent = presetSpecialty;
        specialtySelect.appendChild(option);
      }
      specialtySelect.value = presetSpecialty;
    }
    if (preset.antecedents) document.getElementById('orientation-antecedents').value = preset.antecedents;
    if (preset.symptoms) document.getElementById('orientation-symptoms').value = preset.symptoms;
    if (preset.motif) document.getElementById('orientation-motif').value = preset.motif;
  }
  renderOrientationPreview();
  
  // Clear edit ID (for new documents)
  const existingEditId = document.getElementById('orientation-edit-id');
  if (existingEditId) existingEditId.remove();
  
  openModal('modal-orientation');
}

/**
 * Add quick motif to the motif textarea
 */
function addOrientationMotif(motif) {
  const textarea = document.getElementById('orientation-motif');
  if (textarea) {
    const current = textarea.value.trim();
    if (current) {
      textarea.value = current + ', ' + motif.toLowerCase();
    } else {
      textarea.value = motif;
    }
    renderOrientationPreview();
  }
}

/**
 * Print the Lettre d'orientation document
 */
async function printOrientation() {
  try {
    await ensureSettingsLoaded();

    const patientId = document.getElementById('orientation-patient-id').value;
    const date = document.getElementById('orientation-date').value;
    const destinataire = document.getElementById('orientation-destinataire').value;
    const specialty = document.getElementById('orientation-specialty').value;
    const antecedents = document.getElementById('orientation-antecedents').value.trim();
    const symptoms = document.getElementById('orientation-symptoms').value.trim();
    const motif = document.getElementById('orientation-motif').value.trim();

    if (!symptoms && !motif) {
      showNotification("Veuillez preciser les symptomes ou le motif d'orientation", 'warning');
      return;
    }

    let patient = null;
    try {
      const result = await window.api.patient.getById(patientId);
      if (result.success) {
        patient = result.data;
      }
    } catch (error) {
      console.error('Error loading patient:', error);
    }

    const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : 'le patient';
    const normalizedDestinataire = String(destinataire || '').toLowerCase();
    const salutation = normalizedDestinataire === 'confrere' || normalizedDestinataire === 'confrère'
      ? 'Cher confrère,'
      : normalizedDestinataire === 'consoeur' || normalizedDestinataire === 'consœur'
        ? 'Chère consœur,'
        : 'Cher confrère (consœur),';
    const presentationSentence = antecedents
      ? `Permettez-moi de vous adresser le patient(e) <strong>${escapeHTML(patientName)}</strong> aux antécédents de ${escapeHTML(antecedents)}.`
      : `Permettez-moi de vous adresser le patient(e) <strong>${escapeHTML(patientName)}</strong>.`;
    const letterContent = `
      <div class="orientation-letter">
        <p class="orientation-salutation">${escapeHTML(salutation)}</p>
        <p>${presentationSentence}</p>
        ${symptoms ? `<p>Qui présente: ${escapeHTML(symptoms)}.</p>` : ''}
        ${motif ? `<p>Je vous le confie pour: ${escapeHTML(motif)}.</p>` : ''}
        <p class="orientation-closing">Avec mes remerciements anticipés et mes salutations confraternelles.</p>
      </div>
    `;

    const pageContent = `
      <div class="content-box orientation-letter-shell">
        <div class="content-text orientation-letter">${letterContent}</div>
      </div>
    `;

    const editIdEl = document.getElementById('orientation-edit-id');
    const existingDocId = editIdEl ?editIdEl.value : null;
    const savePayload = {
      patientId,
      documentType: 'orientation',
      title: `Lettre d'orientation${specialty ?' - ' + specialty : ''}`,
      data: {
        date,
        destinataire,
        specialty,
        antecedents,
        symptoms,
        motif
      }
    };

    if (existingDocId) {
      savePayload.id = existingDocId;
      console.log('Updating existing Orientation:', existingDocId);
    }

    const saveResult = await window.api.document.save(savePayload);
    if (!saveResult?.success) {
      showNotification(saveResult?.error || "Erreur lors de l'enregistrement du document", 'error');
      return;
    }

    closeModal('modal-orientation');
    showNotification("Lettre d'orientation enregistree, impression en cours", 'success');
    void runOrientationPrintPipeline({
      patientId,
      specialty,
      dateLabel: formatDocumentDateLabel(date),
      patient,
      pageContent
    });
  } catch (error) {
    console.error('Error printing orientation letter:', error);
    showNotification("Erreur lors de l'impression", 'error');
  }
}

// Make orientation functions globally available
window.openOrientationModal = openOrientationModal;
window.addOrientationMotif = addOrientationMotif;
window.printOrientation = printOrientation;
window.addFactureAdditionalItem = addFactureAdditionalItem;
window.removeFactureAdditionalItem = removeFactureAdditionalItem;
window.handleFactureAdditionalItemChange = handleFactureAdditionalItemChange;
window.renderFacturePreview = renderFacturePreview;
window.renderRapportPreview = renderRapportPreview;
window.applyRapportSpecialtyTemplate = applyRapportSpecialtyTemplate;
window.renderOrientationPreview = renderOrientationPreview;

document.addEventListener('DOMContentLoaded', initializeDocumentPreviewBindings);

async function runBonPourPrintPipeline({ patientId, title, dateLabel, patient, frontPageContent, backPageContent }) {
  try {
    const printFn = (typeof sharedPrintScope !== 'undefined' && sharedPrintScope.openA5PrintDocument)
      ?sharedPrintScope.openA5PrintDocument
      : (typeof openA5PrintDocument === 'function' ?openA5PrintDocument : null);

    if (!printFn) {
      throw new Error("Fonction d'impression non disponible");
    }

    const pages = [frontPageContent];
    if (String(backPageContent || '').trim()) {
      pages.push(backPageContent);
    }

    await printFn({
      title: 'Faire Svp',
      subtitle: title,
      dateLabel,
      patient,
      documentType: 'bonpour',
      pages
    });

    if (typeof loadPatientBonPour === 'function' && currentPatientId === patientId) {
      void loadPatientBonPour(patientId);
    }
  } catch (error) {
    console.error('Error in bon pour print pipeline:', error);
    showNotification(error.message || "Erreur lors de l'impression", 'error');
  }
}

async function runOrientationPrintPipeline({ patientId, specialty, dateLabel, patient, pageContent }) {
  try {
    const printFn = (typeof sharedPrintScope !== 'undefined' && sharedPrintScope.openA5PrintDocument)
      ?sharedPrintScope.openA5PrintDocument
      : (typeof openA5PrintDocument === 'function' ?openA5PrintDocument : null);

    if (!printFn) {
      throw new Error("Fonction d'impression non disponible");
    }

    await printFn({
      title: "LETTRE D'ORIENTATION",
      subtitle: specialty || 'Orientation medicale',
      dateLabel,
      patient,
      documentType: 'orientation',
      pages: [pageContent]
    });

    if (typeof loadPatientOrientations === 'function' && currentPatientId === patientId) {
      void loadPatientOrientations(patientId);
    }
  } catch (error) {
    console.error('Error in orientation print pipeline:', error);
    showNotification(error.message || "Erreur lors de l'impression", 'error');
  }
}

// Preset and Form Helpers for "Faire Svp" and "Orientations"
function applyBonPourPreset(presetId) {
  const preset = window.patientDocumentPresetMap?.[presetId];
  if (!preset) return;

  const detailsTextarea = document.getElementById('bonpour-details');
  const indicationInput = document.getElementById('bonpour-indication');
  const typeSelect = document.getElementById('bonpour-type');

  if (typeSelect) {
    typeSelect.value = preset.type || 'analyses';
    updateBonPourContent();
  }

  if (detailsTextarea) {
    detailsTextarea.value = String(preset.details || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.startsWith('-') ? line : `- ${line}`)
      .join('\n');
  }
  if (indicationInput) {
    indicationInput.value = preset.indication || '';
  }
  
  syncBonPourDetailColumnsFromTextarea();
  syncBonPourSelectionsFromTextarea();
}

function clearBonPourForm() {
  const detailsTextarea = document.getElementById('bonpour-details');
  const indicationInput = document.getElementById('bonpour-indication');
  const notesInput = document.getElementById('bonpour-notes');
  if (detailsTextarea) detailsTextarea.value = '';
  if (indicationInput) indicationInput.value = '';
  if (notesInput) notesInput.value = '';
  syncBonPourDetailColumnsFromTextarea();
  syncBonPourSelectionsFromTextarea();
}

function applyOrientationPreset(presetId) {
  const preset = window.patientDocumentPresetMap?.[presetId];
  if (!preset) return;

  const specialtySelect = document.getElementById('orientation-specialty');
  const motifInput = document.getElementById('orientation-motif');

  if (specialtySelect && preset.specialty) {
    const presetSpecialty = String(preset.specialty || '').trim();
    const hasOption = Array.from(specialtySelect.options).some((option) => option.value === presetSpecialty);
    if (!hasOption) {
      const option = document.createElement('option');
      option.value = presetSpecialty;
      option.textContent = presetSpecialty;
      specialtySelect.appendChild(option);
    }
    specialtySelect.value = presetSpecialty;
  }
  if (motifInput && preset.motif) {
    motifInput.value = preset.motif;
  }
  
  if (typeof renderOrientationPreview === 'function') {
    renderOrientationPreview();
  }
}

function clearOrientationForm() {
  const specialtySelect = document.getElementById('orientation-specialty');
  const motifInput = document.getElementById('orientation-motif');
  const antecedentsInput = document.getElementById('orientation-antecedents');
  const symptomsInput = document.getElementById('orientation-symptoms');

  if (specialtySelect) specialtySelect.value = '';
  if (motifInput) motifInput.value = '';
  if (antecedentsInput) antecedentsInput.value = '';
  if (symptomsInput) symptomsInput.value = '';
  
  if (typeof renderOrientationPreview === 'function') {
    renderOrientationPreview();
  }
}

window.applyBonPourPreset = applyBonPourPreset;
window.clearBonPourForm = clearBonPourForm;
window.applyOrientationPreset = applyOrientationPreset;
window.clearOrientationForm = clearOrientationForm;


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
  const metaHtml = meta.length ? `
    <div class="document-live-preview-meta">
      ${meta.map((item) => `
        <div class="document-live-preview-meta-item">
          <strong>${escapeHTML(item.label)}</strong>
          <span>${escapeHTML(item.value || '-')}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const highlightHtml = highlight ? `
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
    <div class="document-a5-sheet" style="width: 500px; min-width: 500px; max-width: 500px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px 22px; box-shadow: 0 8px 25px rgba(0,0,0,0.18); font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; box-sizing: border-box;">
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
    </div>
  `;
}

function renderFacturePreview() {
  const container = document.getElementById('facture-preview');
  if (!container) return;

  autoComputeFactureTotal(false);
  const data = typeof normalizeFacturePayload === 'function'
    ? normalizeFacturePayload(collectFactureFormData())
    : collectFactureFormData();
  const totals = typeof calculateFactureTotals === 'function'
    ? calculateFactureTotals(data)
    : { baseTotal: Number(data.totalPrice) || 0, additionalTotal: 0, grandTotal: Number(data.totalPrice) || 0 };
  
  const patient = currentPatientData || {
    firstName: document.getElementById('facture-patient-name')?.textContent || 'Patient',
    lastName: ''
  };

  const invoiceDate = data.invoiceDate ? formatDateToDDMMYYYY(data.invoiceDate) : (typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(new Date()) : new Date().toLocaleDateString('fr-FR'));
  const rawMainLabel = document.getElementById('facture-main-label')?.value?.trim() || '';
  const hasBaseRow = Boolean(rawMainLabel || data.numberOfSessions !== '' || data.unitPrice !== '' || totals.baseTotal);
  const baseDetails = [
    data.numberOfSessions !== '' ? `${data.numberOfSessions} séance${Number(data.numberOfSessions) > 1 ? 's' : ''}` : '',
    data.unitPrice !== '' ? `${formatDocumentCurrency(data.unitPrice)} / unité` : ''
  ].filter(Boolean).join(' • ');

  const invoiceRows = [];
  if (hasBaseRow) {
    const hasBaseAmount = Boolean(totals.baseTotal || data.numberOfSessions !== '' || data.unitPrice !== '');
    invoiceRows.push(`
      <tr>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">${escapePrintingHtml(rawMainLabel || data.mainLabel || 'Consultation')}</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">${baseDetails || 'Prestation principale'}</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000; text-align:right; font-weight:700;">${hasBaseAmount ? escapePrintingHtml(formatPrintCurrency(totals.baseTotal)) : '-'}</td>
      </tr>
    `);
  }

  (data.additionalItems || []).forEach((item) => {
    const hasAmount = item.amount !== '' && item.amount !== null && item.amount !== undefined;
    const amount = hasAmount ? Number(item.amount) : null;
    invoiceRows.push(`
      <tr>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">${escapePrintingHtml(item.label || 'Ligne supplémentaire')}</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">Montant</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000; text-align:right; font-weight:700;">${hasAmount ? escapePrintingHtml(formatPrintCurrency(amount)) : '-'}</td>
      </tr>
    `);
  });

  const servicesTable = `
    <table style="width:100%; border-collapse:collapse; font-size:10.8pt; margin-top:3mm;">
      <thead>
        <tr style="border-bottom:1.5px solid #000;">
          <th style="text-align:left; padding:2.2mm; font-weight:700;">Désignation</th>
          <th style="text-align:left; padding:2.2mm; font-weight:700;">Détails</th>
          <th style="text-align:right; padding:2.2mm; font-weight:700;">Montant</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRows.length ? invoiceRows.join('') : `
          <tr>
            <td colspan="3" style="padding:2.2mm; border-bottom:1px solid #000;">Remplissez les champs de facturation pour visualiser le tableau.</td>
          </tr>
        `}
      </tbody>
    </table>
  `;

  const pageContent = `
    <div style="margin-bottom: 4mm;">
      <h3 style="font-size: ${typeof getPrintLayout === 'function' ? getPrintLayout('A5').sectionTitleFont : '11.5pt'}; margin-bottom: 2mm; border-bottom: 1px solid #000; padding-bottom: 1mm;">Détails de facturation</h3>
      ${servicesTable}
    </div>
    <div style="margin-bottom: 4mm;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.2pt; font-weight: 700;">
        <span>Montant total</span>
        <span>${escapePrintingHtml(formatPrintCurrency(totals.grandTotal))}</span>
      </div>
    </div>
    ${data.notes ? `
      <div class="content-box">
        <h3>Notes</h3>
        <div class="content-text">${formatPrintingRichTextHtml(data.notes, '')}</div>
      </div>
    ` : ''}
  `;

  if (typeof buildPrintableHtml === 'function') {
    const html = buildPrintableHtml({
      title: 'FACTURE',
      subtitle: 'Facture',
      dateLabel: invoiceDate,
      patient,
      bodyContentHtml: pageContent,
      documentType: 'invoice',
      documentNumber: 'FAC-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      pages: [pageContent]
    });
    if (typeof renderLiveDocumentPreviewFrame === 'function') {
      renderLiveDocumentPreviewFrame(container, html);
    }
  }
}

function renderRapportPreview() {
  const container = document.getElementById('rapport-preview');
  if (!container) return;

  const data = collectRapportFormData();
  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
    ? getPracticeSpecialtyMeta(data.specialtyKey)
    : { report: { kicker: 'Compte-rendu médical', heroTitle: 'Rapport médical structuré', badge: 'Rapport', typeLabel: 'Rapport médical', printTitle: 'COMPTE RENDU MÉDICAL' } };
  
  const patient = currentPatientData || {
    firstName: document.getElementById('rapport-patient-name')?.textContent || 'Patient',
    lastName: ''
  };

  const reportDate = data.date ? formatDateToDDMMYYYY(data.date) : (typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(new Date()) : new Date().toLocaleDateString('fr-FR'));

  const previewSections = [];
  if (data.motif) {
    previewSections.push(`
      <div class="content-box">
        <h3>Indications</h3>
        <div class="content-text">${formatPrintingRichTextHtml(data.motif, '')}</div>
      </div>
    `);
  }

  if (Array.isArray(data.organFindings) && data.organFindings.length) {
    previewSections.push(`
      <div class="content-box">
        <h3>${escapePrintingHtml(specialtyMeta?.report?.findingsTitle || 'Examen clinique')}</h3>
        <div class="content-text">${formatPrintingRichTextHtml(summarizeRapportOrganFindings(data.organFindings), '')}</div>
      </div>
    `);
  } else if (data.organTarget) {
    previewSections.push(`
      <div class="content-box">
        <h3>${escapePrintingHtml(specialtyMeta?.report?.findingsTitle || 'Examen clinique')}</h3>
        <div class="content-text">${formatPrintingRichTextHtml(data.organTarget, '')}</div>
      </div>
    `);
  }

  if (data.recommandations) {
    previewSections.push(`
      <div class="content-box">
        <h3>Conclusion</h3>
        <div class="content-text">${formatPrintingRichTextHtml(data.recommandations, '')}</div>
      </div>
    `);
  }

  const pageContent = previewSections.length ? previewSections.join('') : `
    <div class="content-box">
      <h3>Observations</h3>
      <div class="content-text">Remplissez les champs du formulaire pour visualiser le compte-rendu.</div>
    </div>
  `;

  const reportTitle = (data.documentTitle || specialtyMeta?.report?.printTitle || 'COMPTE RENDU MÉDICAL').toUpperCase();

  if (typeof buildPrintableHtml === 'function') {
    const html = buildPrintableHtml({
      title: reportTitle,
      subtitle: specialtyMeta?.report?.typeLabel || 'Rapport médical',
      dateLabel: reportDate,
      patient,
      bodyContentHtml: pageContent,
      documentType: 'rapport',
      documentNumber: 'RAP-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      pages: [pageContent]
    });
    if (typeof renderLiveDocumentPreviewFrame === 'function') {
      renderLiveDocumentPreviewFrame(container, html);
    }
  }
}

function renderOrientationPreview() {
  const container = document.getElementById('orientation-preview');
  if (!container) return;

  const patient = currentPatientData || {
    firstName: document.getElementById('orientation-patient-name')?.textContent || 'Patient',
    lastName: ''
  };

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : 'le patient';
  const dateValue = document.getElementById('orientation-date')?.value || '';
  const dateLabel = dateValue ? formatDateToDDMMYYYY(dateValue) : (typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(new Date()) : new Date().toLocaleDateString('fr-FR'));
  const specialty = document.getElementById('orientation-specialty')?.value || '';
  const destinataire = document.getElementById('orientation-destinataire')?.value || 'confrere (consoeur)';
  const antecedents = document.getElementById('orientation-antecedents')?.value?.trim() || '';
  const symptoms = document.getElementById('orientation-symptoms')?.value?.trim() || '';
  const motif = document.getElementById('orientation-motif')?.value?.trim() || '';

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
    <div class="orientation-letter" style="font-size: 11pt; line-height: 1.7;">
      <p class="orientation-salutation" style="margin-bottom: 3mm; font-weight: 600;">${escapeHTML(salutation)}</p>
      <p style="margin-bottom: 3mm;">${presentationSentence}</p>
      ${symptoms ? `<p style="margin-bottom: 3mm;">Qui présente: ${escapeHTML(symptoms)}.</p>` : ''}
      ${motif ? `<p style="margin-bottom: 3mm;">Je vous le confie pour: ${escapeHTML(motif)}.</p>` : ''}
      <p class="orientation-closing" style="margin-top: 4mm;">Avec mes remerciements anticipés et mes salutations confraternelles.</p>
    </div>
  `;

  const pageContent = `
    <div class="content-box orientation-letter-shell">
      <div class="content-text orientation-letter">${letterContent}</div>
    </div>
  `;

  const titleText = specialty ? `LETTRE D'ORIENTATION - ${specialty.toUpperCase()}` : "LETTRE D'ORIENTATION";

  if (typeof buildPrintableHtml === 'function') {
    const html = buildPrintableHtml({
      title: titleText,
      subtitle: `Orientation vers ${specialty || 'spécialité'}`,
      dateLabel,
      patient,
      bodyContentHtml: pageContent,
      documentType: 'orientation',
      documentNumber: 'ORI-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      pages: [pageContent]
    });
    if (typeof renderLiveDocumentPreviewFrame === 'function') {
      renderLiveDocumentPreviewFrame(container, html);
    }
  }
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
  if (!documentModalState.invoice) {
    documentModalState.invoice = {};
  }
  const state = documentModalState.invoice;
  const patientId = state.patientId || window.currentPatientId || (typeof currentPatient !== 'undefined' ? currentPatient?.id : null);
  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Aucun patient sélectionné', 'error');
    }
    return { success: false };
  }
  state.patientId = patientId;
  const data = collectFactureFormData();
  state.data = data;
  
  try {
    const response = await window.api.document.save({
      id: state.documentId || undefined,
      patientId: state.patientId,
      consultationId: state.consultationId || null,
      documentType: 'invoice',
      title: 'Facture',
      data
    });
    if (response && response.success) {
      documentModalState.invoice.documentId = response.id;
      if (typeof loadPatientFactures === 'function' && currentPatientId === state.patientId) {
        loadPatientFactures(currentPatientId);
      }
      if (!silent && typeof showNotification === 'function') {
        showNotification('Facture enregistrée', 'success');
      }
    } else if (!silent && typeof showNotification === 'function') {
      showNotification(response?.error || 'Erreur lors de la sauvegarde', 'error');
    }
    return response;
  } catch (error) {
    console.error('Error saving invoice:', error);
    if (!silent && typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'enregistrement de la facture', 'error');
    }
    return { success: false, error: error?.message };
  }
}

async function printInvoiceDocument() {
  const state = documentModalState.invoice || {};
  const patientId = state.patientId || window.currentPatientId || (typeof currentPatient !== 'undefined' ? currentPatient?.id : null);
  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Sélectionnez un patient avant impression', 'error');
    }
    return;
  }
  state.patientId = patientId;

  const saveResult = await saveInvoiceDocument(null, { silent: true });
  if (!saveResult || !saveResult.success) {
    if (typeof showNotification === 'function') {
      showNotification('Impossible d\'enregistrer la facture', 'error');
    }
    return;
  }
  
  const printState = {
    documentId: documentModalState.invoice.documentId,
    patientId: state.patientId,
    consultationId: state.consultationId || null,
    data: { ...(state.data || collectFactureFormData()) }
  };

  if (typeof closeModal === 'function') {
    closeModal('modal-facture');
  }
  if (typeof showNotification === 'function') {
    showNotification('Facture enregistrée, ouverture de l\'impression...', 'success');
  }
  void runInvoicePrintPipeline(printState);
}

async function saveFactureDocument() {
  return printInvoiceDocument();
}

async function printFactureDocument() {
  return printInvoiceDocument();
}

window.saveFactureDocument = saveFactureDocument;
window.printFactureDocument = printFactureDocument;

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
  orl: {
    options: [
      'Oreille droite (Otoscopie OD)',
      'Oreille gauche (Otoscopie OG)',
      'Fosses nasales, Septum & Sinus',
      'Cavité buccale, Langue & Dents',
      'Oropharynx & Amygdales palatines',
      'Cavum & Rhinopharynx (Végétations)',
      'Larynx, Épiglotte & Cordes vocales',
      'Aires ganglionnaires cervicales & Cou',
      'Glandes salivaires (Parotides / Sous-maxillaires)',
      'Système vestibulaire & Équilibre'
    ],
    templates: [
      {
        organs: ['Oreille droite (Otoscopie OD)', 'Oreille gauche (Otoscopie OG)'],
        entries: [
          { key: 'conduit', label: 'Conduit auditif externe (CAE)', type: 'text', placeholder: 'Ex: Libre, non inflammatoire, absence de bouchon' },
          { key: 'tympan', label: 'Tympan & Reliefs', type: 'text', placeholder: 'Ex: Tympan gris perle, triangle lumineux présent, intègre' },
          { key: 'mobilite', label: 'Mobilité / Aérateur', type: 'text', placeholder: 'Ex: Bonne mobilité au Valsalva / Absence d\'épanchement' },
          { key: 'observations', label: 'Observations otologiques', type: 'textarea', rows: 2, placeholder: 'Ex: Pas de perforation, pas d\'otorrhée...' }
        ]
      },
      {
        organs: ['Fosses nasales, Septum & Sinus', 'Cavum & Rhinopharynx (Végétations)'],
        entries: [
          { key: 'muqueuse', label: 'Aspect de la muqueuse nasale', type: 'text', placeholder: 'Ex: Muqueuse rose normotrophe, non sécrétante' },
          { key: 'cloisons_cornets', label: 'Cloison (Septum) & Cornets', type: 'text', placeholder: 'Ex: Septum centré, cornets inférieurs normotrophiques' },
          { key: 'meats', label: 'Méats moyens / Écoulement', type: 'text', placeholder: 'Ex: Méats libres, absence de pus ou de polype' },
          { key: 'cavum', label: 'Cavum / Végétations adénoïdes', type: 'text', placeholder: 'Ex: Cavum libre, torus tubaires normaux' },
          { key: 'observations', label: 'Observations rhinologiques', type: 'textarea', rows: 2, placeholder: 'Ex: Pas d\'obstacle ni de formation suspecte...' }
        ]
      },
      {
        organs: ['Cavité buccale, Langue & Dents', 'Oropharynx & Amygdales palatines'],
        entries: [
          { key: 'buccal_dents', label: 'Lèvres, Gencives & Dents', type: 'text', placeholder: 'Ex: État bucco-dentaire satisfaisant, muqueuses saines' },
          { key: 'langue_plancher', label: 'Langue & Plancher buccal', type: 'text', placeholder: 'Ex: Langue mobile, plancher buccal souple sans induration' },
          { key: 'voile_palais', label: 'Voile du palais & Luette', type: 'text', placeholder: 'Ex: Voile mobile et symétrique, luette médiane' },
          { key: 'amygdales', label: 'Amygdales palatines (Tonsilles)', type: 'text', placeholder: 'Ex: Amygdales normotrophes (Grade 1), saines, sans enduit ni caséum' },
          { key: 'observations', label: 'Observations pharyngo-buccales', type: 'textarea', rows: 2, placeholder: 'Ex: Pas de lésion ulcéreuse ni de foyer infectieux...' }
        ]
      },
      {
        organs: ['Larynx, Épiglotte & Cordes vocales'],
        entries: [
          { key: 'larynx_epiglotte', label: 'Épiglotte & Margelle laryngée', type: 'text', placeholder: 'Ex: Épiglotte souple, replis ary-épiglottiques libres' },
          { key: 'cordes_vocales', label: 'Cordes vocales & Mobilité', type: 'text', placeholder: 'Ex: Cordes vocales blanches nacrées, mobiles, bon accolement glottique' },
          { key: 'sinus_piriformes', label: 'Sinus piriformes & Hypopharynx', type: 'text', placeholder: 'Ex: Sinus piriformes libres, pas de stase salivaire' },
          { key: 'observations', label: 'Observations endoscopiques', type: 'textarea', rows: 2, placeholder: 'Ex: Absence de nodule, polype ou dysphonie...' }
        ]
      }
    ],
    defaultEntries: [
      { key: 'description', label: 'Constatations cliniques', type: 'textarea', rows: 2, placeholder: 'Examen de la zone...' },
      { key: 'observations', label: 'Observations complémentaires', type: 'textarea', rows: 2, placeholder: 'Détails et explorations utiles...' }
    ]
  },
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
  let key = String(specialtyKey || '').trim().toLowerCase();
  if (!key || !RAPPORT_ORGAN_LIBRARY_BY_SPECIALTY[key]) {
    key = typeof resolveActivePracticeSpecialty === 'function'
      ? resolveActivePracticeSpecialty(window._packageConfig)
      : (currentUserSpecialty || 'orl');
  }
  return RAPPORT_ORGAN_LIBRARY_BY_SPECIALTY[key] || RAPPORT_ORGAN_LIBRARY_BY_SPECIALTY['orl'] || null;
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
      await generateInvoice(state.consultationId, {
        documentData: state.data,
        silentSuccess: true,
        onEdit: state.documentId ? () => editPatientFacture(state.documentId) : null
      });
    } else {
      await generateInvoiceFromPatientDocument(state.patientId, state.data, {
        silentSuccess: true,
        onEdit: state.documentId ? () => editPatientFacture(state.documentId) : null
      });
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
      await generateReport(state.consultationId, {
        documentData: state.data,
        silentSuccess: true,
        onEdit: state.documentId ? () => editPatientRapport(state.documentId) : null
      });
    } else {
      await generateReportFromPatientDocument(state.patientId, state.data, {
        silentSuccess: true,
        onEdit: state.documentId ? () => editPatientRapport(state.documentId) : null
      });
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
    await renderInvoiceDocument({ patient, invoiceData, onEdit: options.onEdit || null });
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
    await renderInvoiceDocument({ patient: patientResult.data, invoiceData, onEdit: options.onEdit || null });
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
      consultation,
      onEdit: options.onEdit || null
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
    await renderRapportDocument({
      patient: patientResult.data,
      rapportData: normalizedData,
      dateHint,
      consultation: null,
      onEdit: options.onEdit || null
    });
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
    const docTitle = typeof resolveBonPourDocumentTitle === 'function' ? resolveBonPourDocumentTitle() : 'Demande de Bilan';
    const modalHtml = `
      <div id="modal-bonpour" class="modal medical-document-modal">
        <div class="modal-overlay" onclick="closeModal('modal-bonpour')"></div>
        <div class="modal-content modal-large">
          <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white;">
            <h2 id="bonpour-modal-header-title">${escapeHTML(docTitle)} - Demande médicale</h2>
            <button class="close-btn" onclick="closeModal('modal-bonpour')" style="color: white;">&times;</button>
          </div>
          <div class="modal-body document-modal-body bonpour-modal-body">
            <input type="hidden" id="bonpour-patient-id">
            
            <div class="document-editor-hero document-editor-hero--violet">
              <div class="document-editor-brand">
                <div class="document-editor-logo">
                  ${typeof getDocumentEditorLogoHTML === 'function' ? getDocumentEditorLogoHTML() : '<span>MC</span>'}
                </div>
                <div>
                  <div class="document-editor-kicker">Demande médicale</div>
                  <div class="document-editor-title" id="bonpour-modal-hero-title">${escapeHTML(docTitle)}</div>
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
                  <option value="analyses">Analyses Biologiques (NFS, Coagulation, CRP, Pré-opératoire...)</option>
                  <option value="scanner">Scanner / TDM (Rochers, Sinus, Cavum, Cou, Dentascan...)</option>
                  <option value="irm">IRM (CAI, Sinus, Cavum, Cou, ATM, Cérébrale...)</option>
                  <option value="radio">Radiographie & Cône Beam 3D (Panoramique, CBCT, Blondeau...)</option>
                  <option value="echo">Échographie & Doppler (Cervicale, Thyroïde, Salivaires, TSA...)</option>
                  <option value="audio_orl">Explorations ORL (Audiométrie, PEA, VNG, Nasofibroscopie...)</option>
                  <option value="kine">Kinésithérapie & Rééducation (Vestibulaire, Maxillo-faciale...)</option>
                  <option value="emg">EMG / ENMG (Nerf facial, Neuro-musculaire...)</option>
                  <option value="other">Autre demande d'examen</option>
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
                <label>Détails de la demande générée</label>
                <textarea id="bonpour-details" class="form-control bonpour-details-source" rows="6" placeholder="Précisez les examens demandés..."></textarea>
                <div class="bonpour-details-columns">
                  <textarea id="bonpour-details-left" class="form-control bonpour-details-column" rows="6" placeholder="- TDM des rochers sans injection&#10;- IRM des CAI avec Gadolinium&#10;- Panoramique dentaire"></textarea>
                  <textarea id="bonpour-details-right" class="form-control bonpour-details-column" rows="6" placeholder="- Cone Beam 3D maxillo-mandibulaire&#10;- NFS complete, TP, INR&#10;- Audiometrie tonale et vocale"></textarea>
                </div>
                <div class="bonpour-details-actions">
                  <button type="button" id="bonpour-add-analysis-btn" class="btn btn-outline" onclick="addAnotherBonPourAnalysis()">+ Ajouter une ligne</button>
                  <button type="button" id="bonpour-remove-analysis-btn" class="btn btn-danger btn-small" onclick="removeLastBonPourAnalysis()">Supprimer la dernière</button>
                </div>
              </div>

              <div class="bonpour-side-stack">
                <div class="form-group">
                  <label>Indication clinique</label>
                  <input type="text" id="bonpour-indication" class="form-control" placeholder="Ex: Bilan d'otite chronique, bilan pré-implantaire, hypoacousie...">
                </div>
                <div class="form-group">
                  <label>Notes complémentaires</label>
                  <textarea id="bonpour-notes" class="form-control" rows="3" placeholder="Renseignements cliniques ou précisions utiles..."></textarea>
                </div>
              </div>
            </div>

            <div id="bonpour-specialty-presets-container" class="bonpour-specialty-presets-container" style="background: #f8fafc; padding: 12px 16px; border-radius: 10px; margin-bottom: 12px; border: 1px solid #e2e8f0; width: 100%; box-sizing: border-box;">
              <label style="font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 6px; display: block;">⚡ Modèles d'examens rapides par spécialité :</label>
              <div id="bonpour-specialty-presets" class="patient-documents-chip-grid" style="display: flex; gap: 8px; flex-wrap: wrap;">
                <!-- Populated dynamically by JS -->
              </div>
            </div>

            <!-- SECTION COCHABLE DES ANALYSES & EXAMENS -->
            <div class="orientation-quick-panel bonpour-check-panel" style="background: #ffffff; border: 1.5px solid #8b5cf6; padding: 14px 16px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(139, 92, 246, 0.09); width: 100%; box-sizing: border-box;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                <label style="font-size: 14px; font-weight: 700; color: #6d28d9; margin: 0; display: flex; align-items: center; gap: 8px;">
                  <span>📋 Examens & Analyses à cocher directement :</span>
                </label>
                <span style="font-size: 12px; color: #6d28d9; font-weight: 600; background: #ede9fe; padding: 3px 10px; border-radius: 20px;">Cochez pour insérer automatiquement</span>
              </div>
              <div id="bonpour-quick-items" class="checkbox-grid bonpour-checkbox-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; max-height: none; overflow: visible; padding: 6px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fdfdfe;">
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
  const customTemplate = typeof getDocumentCustomTemplate === 'function' ? getDocumentCustomTemplate('bonpour') : null;
  document.getElementById('bonpour-details').value = (!preset && customTemplate) ? customTemplate : '';
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
  const items = Array.isArray(lines) ? lines : [];
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
  const target = rightColumn && rightColumn.value.trim() ? rightColumn : leftColumn || rightColumn;
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
      // 1. Radiologie & Imagerie (En premier)
      'RADIO DU THORAX',
      'ECG',
      'Orthopantomogramme (Panoramique dentaire)',
      'Cone Beam 3D (CBCT)',
      'Rx des os propres du nez (OPN)',
      'Incidence de Blondeau (Sinus)',
      'TDM des rochers sans injection',
      'TDM des sinus de la face',
      'IRM des CAI avec Gadolinium',
      'Échographie cervicale et thyroïde',
      // 2. Biologie & Analyses (Demande de Bilan)
      'Groupage/Rh',
      'FNS',
      'TP/TCK',
      'Glycémie à jeun',
      'HbA1C',
      'VS-CRP',
      'Ionogramme sanguin',
      'Urée-créatininémie',
      'Calcémie-Phosphorémie',
      'ASLO',
      'Cholestérol total, HDL, LDL, TG',
      'Fer sérique',
      'Bilirubine totale et directe',
      'TSH',
      'FT3, FT4',
      'Sérologie (HIV, Syphilis, VHB, VHC)',
      'Bilan hépatique (ASAT, ALAT, GGT, PAL)',
      'Vitamine D (25-OH-D3)',
      'Anticorps anti-TPO / anti-TG',
      'Prélèvement bactériologique + Antibiogramme',
      'Autre : ______'
    ],
    scanner: [
      // ORL & Rochers / Sinus / Cou
      'TDM des rochers (Os temporaux) sans injection',
      'TDM des sinus de la face (Massif facial) sans injection',
      'TDM des sinus de la face avec injection de PDC',
      'TDM du cavum / rhino-pharynx',
      'TDM du cou et du larynx avec injection',
      'TDM des glandes salivaires (parotides / sous-maxillaires)',
      'TDM maxillo-facial 3D',
      'Dentascan maxillaire et mandibulaire 3D',
      'TDM des articulations temporo-mandibulaires (ATM)',
      'TDM cérébrale sans et avec injection',
      'TDM thoracique',
      'TDM rachis cervical'
    ],
    irm: [
      // ORL & Tête et Cou
      'IRM des conduits auditifs internes (CAI / APC) avec Gadolinium',
      'IRM cérébrale et des voies auditives',
      'IRM des sinus de la face et cavum avec injection',
      'IRM du cou et des parties molles cervicales',
      'IRM des glandes salivaires (parotides et submandibulaires)',
      'IRM laryngo-pharyngée',
      'IRM des articulations temporo-mandibulaires (ATM bouche ouverte et fermée)',
      'IRM du plancher buccal et de la langue',
      'IRM cérébrale',
      'IRM médullaire / rachis cervical'
    ],
    radio: [
      // ORL & Crâne
      'Incidence de Blondeau (Sinus fronto-maxillaires)',
      'Incidence de Hirtz (Base du crâne)',
      'Rx cavum profil (Végétations adénoïdes)',
      'Rx des os propres du nez (OPN face et profil)',
      'Rx du thorax face',
      'Rx du rachis cervical face et profil',
      // Dentaire & Panoramique
      'Orthopantomogramme (Panoramique dentaire numérique)',
      'Cone Beam 3D (CBCT) maxillaire',
      'Cone Beam 3D (CBCT) mandibulaire',
      'Cone Beam 3D (CBCT) bi-maxillaire',
      'Radiographie des ATM bouche ouverte et fermée'
    ],
    echo: [
      // Échographie Cervico-Faciale & Doppler
      'Échographie cervicale et des aires ganglionnaires',
      'Échographie de la glande thyroïde',
      'Échographie des glandes parotides',
      'Échographie des glandes sous-maxillaires (submandibulaires)',
      'Échographie du plancher buccal',
      'Écho-Doppler des troncs supra-aortiques (TSA)',
      'Échographie abdominale générale'
    ],
    audio_orl: [
      // Explorations Spécifiques ORL
      'Audiométrie tonale liminaire (conduction aérienne et osseuse)',
      'Audiométrie vocale (seuil d\'intelligibilité et discrimination)',
      'Tympanométrie bilatérale',
      'Recherche des réflexes stapédiens (ipsi et controlatéraux)',
      'Potentiels Évoqués Auditifs du tronc cérébral (PEA / BERA)',
      'Vidéonystagmographie (VNG / Vestibulométrie)',
      'Épreuves caloriques vestibulaires',
      'Oto-émissions acoustiques provoquées (OEAP / DPOEA)',
      'Nasofibroscopie diagnostique des VADS',
      'Laryngoscopie / Évaluation vidéo-stroboscopique des cordes vocales',
      'Manométrie tubaire / Exploration trompe d\'Eustache',
      'Rhinomanométrie antérieure'
    ],
    kine: [
      'Rééducation vestibulaire instrumentale / VNG',
      'Rééducation maxillo-faciale et des ATM',
      'Rééducation vocale et orthophonique',
      'Rééducation tubaire fonctionnelle',
      'Kinésithérapie respiratoire de désencombrement',
      'Drainage lymphatique cervico-facial'
    ],
    emg: [
      'EMG du nerf facial (Bilan de paralysie faciale)',
      'Électroneuronographie du nerf facial',
      'EMG / ENMG membres supérieurs',
      'EMG / ENMG membres inférieurs',
      'Vitesses de conduction motrice et sensitive'
    ],
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
    let detailsHtml = '<div class="bonpour-exam-list" style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:4px 10px; margin-bottom: 6px;">';
    detailsLines.forEach((line) => {
      const cleanLine = line.replace(/^[-•]\s*/, '').trim();
      detailsHtml += `<div class="bonpour-exam-item" style="font-size: ${Math.min(bodyFontSize, 9.8)}pt; padding: 1.5px 0; line-height: 1.35; color: #000000; break-inside: avoid; word-break: break-word;">- ${escapeHTML(cleanLine)}</div>`;
    });
    detailsHtml += '</div>';

    const pageContent = `
      <div class="content-box bon-pour-shell">
        <style>
          .bonpour-section-header { font-size: 10pt; font-weight: 750; color: #0284c7; text-transform: uppercase; margin: 6px 0 3px 0; }
          .bonpour-body-text { font-size: ${Math.min(bodyFontSize, 9.8)}pt; line-height: 1.4; color: #000000; }
        </style>
        <div class="bonpour-section-header" style="margin-top: 0;">Examens demandés :</div>
        ${detailsHtml}
        ${indication ? `
          <div class="bonpour-section-header">Indication clinique :</div>
          <div class="bonpour-body-text">${escapeHTML(indication)}</div>
        ` : ''}
        ${notes ? `
          <div class="bonpour-section-header">Notes complémentaires :</div>
          <div class="bonpour-body-text">${escapeHTML(notes)}</div>
        ` : ''}
      </div>
    `;

    const editIdEl = document.getElementById('bonpour-edit-id');
    const existingDocId = editIdEl ? editIdEl.value : null;
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
      console.log('✏️ Updating existing Bon Pour:', existingDocId);
    }

    const saveResult = await window.api.document.save(savePayload);
    if (!saveResult?.success) {
      showNotification(saveResult?.error || "Erreur lors de l'enregistrement du document", 'error');
      return;
    }

    if (details && typeof saveDocumentCustomTemplate === 'function') {
      const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : '';
      saveDocumentCustomTemplate('bonpour', details, { patientName });
    }

    closeModal('modal-bonpour');
    showNotification('Bon pour enregistré, impression en cours', 'success');
    void runBonPourPrintPipeline({
      patientId,
      title: type,
      dateLabel: formatDocumentDateLabel(date),
      patient,
      pageContent
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
        <div class="modal-content modal-large" style="max-width: 1240px; width: min(1240px, 96vw); max-height: 94vh; height: 94vh;">
          <div class="modal-header" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
              ✉️ Lettre d'orientation
            </h2>
            <button class="close-btn" onclick="closeModal('modal-orientation')" style="color: white; background: none; border: none; font-size: 22px; cursor: pointer;">&times;</button>
          </div>
          <div class="modal-body document-modal-body orientation-modal-body" style="padding: 14px 20px; overflow: hidden;">
            <input type="hidden" id="orientation-patient-id">

            <!-- 2-COLUMN SPLIT WORKSTATION: Inputs on Left (38%), Live Preview on Right (62%) -->
            <div class="document-workstation-layout">
              <!-- Colonne Gauche : Formulaire de saisie -->
              <div class="document-workstation-form">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Patient :</span>
                    <strong id="orientation-patient-name" style="font-size: 13.5px; color: #0f172a; margin-left: 6px;"></strong>
                  </div>
                  <span style="font-size: 11.5px; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Orientation confrère</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div class="form-group" style="margin: 0;">
                    <label style="font-weight: 650; font-size: 12.5px; color: #334155; margin-bottom: 3px; display: block;">Date</label>
                    <input type="date" id="orientation-date" class="form-control" style="height: 36px; font-size: 13px;">
                  </div>
                  <div class="form-group" style="margin: 0;">
                    <label style="font-weight: 650; font-size: 12.5px; color: #334155; margin-bottom: 3px; display: block;">Destinataire</label>
                    <select id="orientation-destinataire" class="form-control" style="height: 36px; font-size: 13px;">
                      <option value="confrere">Cher confrère</option>
                      <option value="consoeur">Chère consœur</option>
                      <option value="confrere (consoeur)">Cher confrère (consœur)</option>
                    </select>
                  </div>
                </div>

                <div class="form-group" style="margin: 0;">
                  <label style="font-weight: 650; font-size: 12.5px; color: #334155; margin-bottom: 3px; display: block;">Spécialité d'orientation</label>
                  <select id="orientation-specialty" class="form-control" style="height: 36px; font-size: 13px;">
                    <option value="">-- Sélectionner --</option>
                    <option value="Médecin généraliste">Médecin généraliste</option>
                    <option value="Rhumatologue">Rhumatologue</option>
                    <option value="Neurologue">Neurologue</option>
                    <option value="Orthopédiste">Orthopédiste</option>
                    <option value="Neurochirurgien">Neurochirurgien</option>
                    <option value="Cardiologue">Cardiologue</option>
                    <option value="Pneumologue">Pneumologue</option>
                    <option value="Endocrinologue">Endocrinologue</option>
                    <option value="Gastro-entérologue">Gastro-entérologue</option>
                    <option value="Dermatologue">Dermatologue</option>
                    <option value="ORL">ORL</option>
                    <option value="Ophtalmologue">Ophtalmologue</option>
                    <option value="Urologue">Urologue</option>
                    <option value="Gynécologue">Gynécologue</option>
                    <option value="Psychiatre">Psychiatre</option>
                    <option value="Radiologue">Radiologue</option>
                    <option value="Kinésithérapeute">Kinésithérapeute</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div id="orientation-specialty-presets-container" class="orientation-specialty-presets-container" style="background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <label style="font-size: 12px; font-weight: 650; color: #475569; margin-bottom: 6px; display: block;">Modèles par spécialité</label>
                  <div id="orientation-specialty-presets" class="patient-documents-chip-grid" style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <!-- Populated dynamically by JS -->
                  </div>
                </div>

                <div class="form-group" style="margin: 0;">
                  <label style="font-weight: 650; font-size: 12.5px; color: #334155; margin-bottom: 3px; display: block;">Antécédents</label>
                  <textarea id="orientation-antecedents" class="form-control" rows="2" placeholder="Antécédents médicaux du patient..." style="font-size: 12.5px; line-height: 1.4; resize: vertical; min-height: 52px;"></textarea>
                </div>

                <div class="form-group" style="margin: 0;">
                  <label style="font-weight: 650; font-size: 12.5px; color: #334155; margin-bottom: 3px; display: block;">Présente (symptômes / diagnostic)</label>
                  <textarea id="orientation-symptoms" class="form-control" rows="2" placeholder="Symptômes et diagnostic actuel..." style="font-size: 12.5px; line-height: 1.4; resize: vertical; min-height: 52px;"></textarea>
                </div>

                <div class="form-group" style="margin: 0;">
                  <label style="font-weight: 650; font-size: 12.5px; color: #334155; margin-bottom: 3px; display: block;">Motif d'orientation (je vous le confie pour...)</label>
                  <textarea id="orientation-motif" class="form-control" rows="2" placeholder="Motif de l'orientation et prise en charge demandée..." style="font-size: 12.5px; line-height: 1.4; resize: vertical; min-height: 52px;"></textarea>
                </div>

                <div class="orientation-quick-panel" style="background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                  <label style="font-size: 12px; font-weight: 650; color: #475569; margin-bottom: 6px; display: block;">Motifs rapides (cliquez pour insérer)</label>
                  <div id="orientation-quick-items" style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <button type="button" class="btn btn-small btn-secondary" style="font-size: 11px; padding: 3px 8px; height: 26px;" onclick="addOrientationMotif('Avis spécialisé')">Avis spécialisé</button>
                    <button type="button" class="btn btn-small btn-secondary" style="font-size: 11px; padding: 3px 8px; height: 26px;" onclick="addOrientationMotif('Prise en charge')">Prise en charge</button>
                    <button type="button" class="btn btn-small btn-secondary" style="font-size: 11px; padding: 3px 8px; height: 26px;" onclick="addOrientationMotif('Bilan complémentaire')">Bilan complémentaire</button>
                    <button type="button" class="btn btn-small btn-secondary" style="font-size: 11px; padding: 3px 8px; height: 26px;" onclick="addOrientationMotif('Suivi')">Suivi</button>
                    <button type="button" class="btn btn-small btn-secondary" style="font-size: 11px; padding: 3px 8px; height: 26px;" onclick="addOrientationMotif('Traitement spécialisé')">Traitement spécialisé</button>
                    <button type="button" class="btn btn-small btn-secondary" style="font-size: 11px; padding: 3px 8px; height: 26px;" onclick="addOrientationMotif('Intervention chirurgicale')">Intervention chirurgicale</button>
                  </div>
                </div>
              </div>

              <!-- Colonne Droite : Aperçu en Direct -->
              <div class="document-workstation-preview">
                <div class="form-group document-preview-card">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label style="font-weight: 750; font-size: 13px; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 6px;">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#059669" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span>Aperçu de la lettre en direct</span>
                    </label>
                    <span style="font-size: 11px; font-weight: 600; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 4px;">⚡ Mise à jour automatique</span>
                  </div>
                  <div id="orientation-preview" class="document-live-preview"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-split">
            <button class="btn btn-secondary" onclick="closeModal('modal-orientation')">Annuler</button>
            <div class="modal-footer-actions">
              <button class="btn btn-primary" onclick="printOrientation()" style="background: #059669; border-color: #047857; font-weight: 700; height: 38px; padding: 0 20px; border-radius: 6px;">Enregistrer et imprimer</button>
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

async function runBonPourPrintPipeline({ patientId, title, dateLabel, patient, pageContent, frontPageContent, backPageContent }) {
  try {
    const printFn = (typeof sharedPrintScope !== 'undefined' && sharedPrintScope.openA5PrintDocument)
      ? sharedPrintScope.openA5PrintDocument
      : (typeof openA5PrintDocument === 'function' ? openA5PrintDocument : null);

    if (!printFn) {
      throw new Error("Fonction d'impression non disponible");
    }

    const content = pageContent || frontPageContent;
    const pages = [content];
    if (backPageContent && String(backPageContent).trim()) {
      pages.push(backPageContent);
    }

    const docTitle = typeof resolveBonPourDocumentTitle === 'function' ? resolveBonPourDocumentTitle() : 'Demande de Bilan';
    await printFn({
      title: docTitle,
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

/**
 * Open document in new WYSIWYG preview drawer
 * @param {string} docType - 'ordonnance', 'certificat', 'arret', 'facture', 'rapport', 'svp', 'orientation'
 * @param {object} context - { patientId, consultationId, content }
 */
function openDocumentPreview(docType, context = {}) {
  if (typeof DocumentPreview === 'undefined') {
    showNotification('Le composant d\'aperçu n\'est pas disponible', 'warning');
    return;
  }

  const doctorInfo = {
    name: '',
    specialty: 'Médecin ORL & Chirurgie Cervico-Faciale',
    address: '',
    phone: '',
    license: '',
  };

  // Load doctor info from cached settings
  if (typeof ensureSettingsLoaded === 'function') {
    ensureSettingsLoaded().then(() => {
      if (typeof cachedSettings !== 'undefined' && cachedSettings) {
        doctorInfo.name = 'Dr. ' + (cachedSettings.doctorName || cachedSettings.doctor_name || '');
        doctorInfo.address = cachedSettings.cabinetAddress || cachedSettings.cabinet_address || '';
        doctorInfo.phone = cachedSettings.cabinetPhone || cachedSettings.cabinet_phone || '';
        doctorInfo.license = cachedSettings.licenseNumber || cachedSettings.license_number || '';
        doctorInfo.specialty = cachedSettings.specialty || doctorInfo.specialty;
      }
    }).catch(() => {});
  }

  const patientInfo = {};
  if (typeof currentPatientData !== 'undefined' && currentPatientData) {
    patientInfo.name = (currentPatientData.nom || currentPatientData.lastName || '') + ' ' + (currentPatientData.prenom || currentPatientData.firstName || '');
    patientInfo.age = currentPatientData.age || '';
    patientInfo.phone = currentPatientData.telephone || currentPatientData.phone || '';
  }

  const typeLabels = {
    ordonnance: 'Ordonnance',
    certificat: 'Certificat médical',
    arret: 'Arrêt de travail',
    facture: 'Facture',
    rapport: 'Rapport médical',
    svp: 'Bon Pour',
    orientation: 'Orientation',
  };

  DocumentPreview.open({
    type: docType,
    title: (typeLabels[docType] || docType) + (patientInfo.name ? ' — ' + patientInfo.name.trim() : ''),
    format: (typeof DEFAULT_DOC_FORMATS !== 'undefined' ? DEFAULT_DOC_FORMATS[docType] : null) || 'A4',
    content: context.content || '<p></p>',
    editable: true,
    doctorInfo: doctorInfo,
    patientInfo: patientInfo,
    onSave: (content) => {
      // Store the edited content for later use
      if (typeof showNotification === 'function') {
        showNotification('Document enregistré', 'success');
      }
    },
  });
}

window.openDocumentPreview = openDocumentPreview;

// Initialize document format toggles in Settings
function initDocFormatSettings() {
  if (typeof AntSegmented === 'undefined') return;
  const docTypes = ['ordonnance', 'certificat', 'arret', 'facture', 'rapport', 'orientation', 'operation', 'operation_facture'];
  const defaults = { ordonnance: 'A5', certificat: 'A5', arret: 'A5', facture: 'A5', rapport: 'A4', orientation: 'A4', operation: 'A4', operation_facture: 'A5' };
  
  // Load saved preferences
  let savedFormats = {};
  try {
    savedFormats = JSON.parse(localStorage.getItem('medcareso_doc_formats') || '{}');
  } catch(e) {}
  
  docTypes.forEach(type => {
    const el = document.getElementById('fmt-' + type);
    if (!el) return;
    AntSegmented.create(el, {
      options: [{ label: 'A4', value: 'A4' }, { label: 'A5', value: 'A5' }],
      defaultValue: savedFormats[type] || defaults[type],
      onChange: (value) => {
        savedFormats[type] = value;
        localStorage.setItem('medcareso_doc_formats', JSON.stringify(savedFormats));
        // Update global defaults
        if (typeof DEFAULT_DOC_FORMATS !== 'undefined') DEFAULT_DOC_FORMATS[type] = value;
      },
    });
  });
}
// ==========================================
// NASOFIBROSCOPIE (ORL DOCUMENT GENERATION)
// ==========================================

let currentNasofibroPatient = null;

async function openNasofibroscopieModal(patientId, documentId = null, existingData = null) {
  const targetPatientId = patientId || window.currentPatientId || null;
  if (!targetPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient avant de créer une nasofibroscopie', 'warning');
    }
    return;
  }

  // Retrieve patient information
  let patient = null;
  try {
    if (window.currentPatientData && (window.currentPatientData.id === targetPatientId || window.currentPatientData.patientId === targetPatientId)) {
      patient = window.currentPatientData;
    } else if (window.api && window.api.patient && typeof window.api.patient.getById === 'function') {
      const res = await window.api.patient.getById(targetPatientId);
      if (res && res.success && res.data) {
        patient = res.data;
      }
    }
  } catch (err) {
    console.warn('Erreur lors du chargement du patient pour la nasofibroscopie:', err);
  }

  currentNasofibroPatient = patient || { id: targetPatientId, firstName: '', lastName: '' };

  const form = document.getElementById('nasofibro-form');
  if (form) form.reset();

  const patientIdInput = document.getElementById('nasofibro-patient-id');
  const docIdInput = document.getElementById('nasofibro-doc-id');
  const summaryEl = document.getElementById('nasofibro-patient-summary');
  const dateInput = document.getElementById('nasofibro-date');
  const modalTitle = document.getElementById('nasofibro-modal-title');

  if (patientIdInput) patientIdInput.value = targetPatientId;
  if (docIdInput) docIdInput.value = documentId || '';

  const patientName = `${patient?.lastName || patient?.nom || ''} ${patient?.firstName || patient?.prenom || ''}`.trim() || 'Patient';
  const patientAge = patient?.dateOfBirth ? (typeof computeAge === 'function' ? `${computeAge(patient.dateOfBirth)} ans` : '') : (patient?.age ? `${patient.age} ans` : '');
  if (summaryEl) {
    summaryEl.textContent = `${patientName}${patientAge ? ` (${patientAge})` : ''}`;
  }

  // Pre-fill fields if editing existing document
  if (existingData) {
    if (modalTitle) modalTitle.textContent = 'Modifier la Nasofibroscopie';
    if (dateInput) dateInput.value = existingData.date ? String(existingData.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const fdEl = document.getElementById('nasofibro-fosses-droite');
    const fgEl = document.getElementById('nasofibro-fosses-gauche');
    const chEl = document.getElementById('nasofibro-choanes');
    const cvEl = document.getElementById('nasofibro-cavum');
    const phEl = document.getElementById('nasofibro-pharynx');
    const lxEl = document.getElementById('nasofibro-larynx');
    const cclEl = document.getElementById('nasofibro-conclusion');

    if (fdEl) fdEl.value = existingData.fossesNasalesDroite || '';
    if (fgEl) fgEl.value = existingData.fossesNasalesGauche || '';
    if (chEl) chEl.value = existingData.choanes || '';
    if (cvEl) cvEl.value = existingData.cavum || '';
    if (phEl) phEl.value = existingData.pharynx || '';
    if (lxEl) lxEl.value = existingData.larynx || '';
    if (cclEl) cclEl.value = existingData.conclusion || '';
  } else {
    if (modalTitle) modalTitle.textContent = 'Compte-rendu de Nasofibroscopie';
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    const fdEl = document.getElementById('nasofibro-fosses-droite');
    const fgEl = document.getElementById('nasofibro-fosses-gauche');
    const chEl = document.getElementById('nasofibro-choanes');
    const cvEl = document.getElementById('nasofibro-cavum');
    const phEl = document.getElementById('nasofibro-pharynx');
    const lxEl = document.getElementById('nasofibro-larynx');
    const cclEl = document.getElementById('nasofibro-conclusion');
    if (fdEl) fdEl.value = '';
    if (fgEl) fgEl.value = '';
    if (chEl) chEl.value = '';
    if (cvEl) cvEl.value = '';
    if (phEl) phEl.value = '';
    if (lxEl) lxEl.value = '';
    if (cclEl) cclEl.value = '';
  }

  // Bind live preview input events
  bindNasofibroscopieLiveInputs();
  updateNasofibroscopieLivePreview();

  if (typeof openModal === 'function') {
    openModal('modal-nasofibroscopie');
  } else if (typeof showModal === 'function') {
    showModal('modal-nasofibroscopie');
  }
}

function bindNasofibroscopieLiveInputs() {
  const ids = [
    'nasofibro-date',
    'nasofibro-fosses-droite', 'nasofibro-fosses-gauche',
    'nasofibro-choanes', 'nasofibro-cavum',
    'nasofibro-pharynx', 'nasofibro-larynx',
    'nasofibro-conclusion'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.liveBound) {
      el.addEventListener('input', updateNasofibroscopieLivePreview);
      el.addEventListener('change', updateNasofibroscopieLivePreview);
      el.dataset.liveBound = '1';
    }
  });
}

function applyNasofibroscopiePreset(presetKey) {
  const fdEl = document.getElementById('nasofibro-fosses-droite');
  const fgEl = document.getElementById('nasofibro-fosses-gauche');
  const chEl = document.getElementById('nasofibro-choanes');
  const cvEl = document.getElementById('nasofibro-cavum');
  const phEl = document.getElementById('nasofibro-pharynx');
  const lxEl = document.getElementById('nasofibro-larynx');
  const cclEl = document.getElementById('nasofibro-conclusion');

  if (fdEl) fdEl.value = '';
  if (fgEl) fgEl.value = '';
  if (chEl) chEl.value = '';
  if (cvEl) cvEl.value = '';
  if (phEl) phEl.value = '';
  if (lxEl) lxEl.value = '';
  if (cclEl) cclEl.value = '';

  updateNasofibroscopieLivePreview();
}

function updateNasofibroscopieLivePreview() {
  const container = document.getElementById('nasofibro-live-preview-sheet');
  if (!container) return;

  const dateVal = document.getElementById('nasofibro-date')?.value || new Date().toISOString().slice(0, 10);
  const fdVal = document.getElementById('nasofibro-fosses-droite')?.value || '';
  const fgVal = document.getElementById('nasofibro-fosses-gauche')?.value || '';
  const chVal = document.getElementById('nasofibro-choanes')?.value || '';
  const cvVal = document.getElementById('nasofibro-cavum')?.value || '';
  const phVal = document.getElementById('nasofibro-pharynx')?.value || '';
  const lxVal = document.getElementById('nasofibro-larynx')?.value || '';
  const cclVal = document.getElementById('nasofibro-conclusion')?.value || '';

  const patient = currentNasofibroPatient || window.currentPatientData || {
    firstName: document.getElementById('nasofibro-patient-summary')?.textContent || 'Patient',
    lastName: '',
    dateOfBirth: null
  };

  const data = {
    date: dateVal,
    fossesNasalesDroite: fdVal,
    fossesNasalesGauche: fgVal,
    choanes: chVal,
    cavum: cvVal,
    pharynx: phVal,
    larynx: lxVal,
    conclusion: cclVal
  };

  const bodyHtml = typeof buildNasofibroscopieBodyHtml === 'function'
    ? buildNasofibroscopieBodyHtml(data)
    : (window.buildNasofibroscopieBodyHtml ? window.buildNasofibroscopieBodyHtml(data) : '');

  const dateLabel = typeof formatPrintingDocumentDateLabel === 'function'
    ? formatPrintingDocumentDateLabel(dateVal)
    : new Date(dateVal).toLocaleDateString('fr-FR');

  const docPageSize = typeof resolveDocumentPageSize === 'function'
    ? resolveDocumentPageSize('nasofibroscopie', 'A5')
    : 'A5';

  const formatLabel = document.getElementById('nasofibro-preview-format-label');
  if (formatLabel) formatLabel.textContent = `Aperçu en direct (Format ${docPageSize})`;

  const buildDoc = docPageSize === 'A4'
    ? (typeof buildA4Html === 'function' ? buildA4Html : (window.buildA4Html || window.buildPrintableHtml))
    : (typeof buildA5Html === 'function' ? buildA5Html : (window.buildA5Html || window.buildPrintableHtml));

  if (typeof buildDoc === 'function') {
    const fullDocHtml = buildDoc({
      title: 'NASOFIBROSCOPIE',
      subtitle: 'Compte-rendu d\'exploration endoscopique ORL',
      dateLabel,
      patient,
      bodyContentHtml: bodyHtml,
      documentType: 'nasofibroscopie',
      pageSize: docPageSize,
      documentNumber: 'REF-' + dateVal.replace(/-/g, ''),
      pages: [bodyHtml]
    });

    if (typeof renderLiveDocumentPreviewFrame === 'function') {
      renderLiveDocumentPreviewFrame(container, fullDocHtml);
    } else {
      container.innerHTML = fullDocHtml;
    }
  }
}

async function saveAndPrintNasofibroscopie() {
  const patientId = document.getElementById('nasofibro-patient-id')?.value || window.currentPatientId || null;
  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient', 'error');
    }
    return;
  }

  const existingDocId = document.getElementById('nasofibro-doc-id')?.value || null;
  const date = document.getElementById('nasofibro-date')?.value || new Date().toISOString().slice(0, 10);
  const fossesNasalesDroite = document.getElementById('nasofibro-fosses-droite')?.value || '';
  const fossesNasalesGauche = document.getElementById('nasofibro-fosses-gauche')?.value || '';
  const choanes = document.getElementById('nasofibro-choanes')?.value || '';
  const cavum = document.getElementById('nasofibro-cavum')?.value || '';
  const pharynx = document.getElementById('nasofibro-pharynx')?.value || '';
  const larynx = document.getElementById('nasofibro-larynx')?.value || '';
  const conclusion = document.getElementById('nasofibro-conclusion')?.value || '';

  const docPayload = {
    patientId,
    documentType: 'nasofibroscopie',
    title: 'NASOFIBROSCOPIE',
    data: {
      date,
      fossesNasalesDroite,
      fossesNasalesGauche,
      choanes,
      cavum,
      pharynx,
      larynx,
      conclusion
    }
  };

  if (existingDocId) {
    docPayload.id = existingDocId;
  }

  try {
    if (window.api && window.api.document && typeof window.api.document.save === 'function') {
      const saveResult = await window.api.document.save(docPayload);
      if (!saveResult || !saveResult.success) {
        if (typeof showNotification === 'function') {
          showNotification(saveResult?.error || 'Erreur lors de l\'enregistrement de la nasofibroscopie', 'error');
        }
        return;
      }
    }

    if (typeof closeModal === 'function') {
      closeModal('modal-nasofibroscopie');
    }

    if (typeof showNotification === 'function') {
      showNotification('Nasofibroscopie enregistree, ouverture de l\'impression...', 'success');
    }

    // Refresh patient documents table if loaded
    if (typeof loadPatientNasofibroscopies === 'function') {
      loadPatientNasofibroscopies(patientId);
    }

    // Launch print window
    const patient = currentNasofibroPatient || { id: patientId };
    const dateLabel = typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(date) : date;

    if (typeof renderNasofibroscopieDocument === 'function') {
      await renderNasofibroscopieDocument({
        patient,
        data: docPayload.data,
        dateLabel,
        onEdit: () => openNasofibroscopieModal(patientId, existingDocId, docPayload.data)
      });
    }
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement / impression de la nasofibroscopie:', err);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'enregistrement', 'error');
    }
  }
}

window.openNasofibroscopieModal = openNasofibroscopieModal;
window.applyNasofibroscopiePreset = applyNasofibroscopiePreset;
window.updateNasofibroscopieLivePreview = updateNasofibroscopieLivePreview;
window.saveAndPrintNasofibroscopie = saveAndPrintNasofibroscopie;

// ==========================================
// ÉCHOGRAPHIE CERVICALE (EXPLORATION ÉCHOGRAPHIQUE)
// ==========================================

let currentEchoCervicalePatient = null;

async function openEchographieCervicaleModal(patientId, documentId = null, existingData = null) {
  const targetPatientId = patientId || window.currentPatientId || null;
  if (!targetPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient avant de créer une échographie cervicale', 'warning');
    }
    return;
  }

  let patient = null;
  try {
    if (window.currentPatientData && (window.currentPatientData.id === targetPatientId || window.currentPatientData.patientId === targetPatientId)) {
      patient = window.currentPatientData;
    } else if (window.api && window.api.patient && typeof window.api.patient.getById === 'function') {
      const res = await window.api.patient.getById(targetPatientId);
      if (res && res.success && res.data) {
        patient = res.data;
      }
    }
  } catch (err) {
    console.warn('Erreur lors du chargement du patient pour l\'échographie cervicale:', err);
  }

  currentEchoCervicalePatient = patient || { id: targetPatientId, firstName: '', lastName: '' };

  const form = document.getElementById('echocervicale-form');
  if (form) form.reset();

  const patientIdInput = document.getElementById('echocervicale-patient-id');
  const docIdInput = document.getElementById('echocervicale-doc-id');
  const summaryEl = document.getElementById('echocervicale-patient-summary');
  const dateInput = document.getElementById('echocervicale-date');
  const modalTitle = document.getElementById('echocervicale-modal-title');

  if (patientIdInput) patientIdInput.value = targetPatientId;
  if (docIdInput) docIdInput.value = documentId || '';

  const patientName = `${patient?.lastName || patient?.nom || ''} ${patient?.firstName || patient?.prenom || ''}`.trim() || 'Patient';
  const patientAge = patient?.dateOfBirth ? (typeof computeAge === 'function' ? `${computeAge(patient.dateOfBirth)} ans` : '') : (patient?.age ? `${patient.age} ans` : '');
  if (summaryEl) {
    summaryEl.textContent = `${patientName}${patientAge ? ` (${patientAge})` : ''}`;
  }

  const techEl = document.getElementById('echocervicale-technique');
  const ldEl = document.getElementById('echocervicale-lobe-droit');
  const lgEl = document.getElementById('echocervicale-lobe-gauche');
  const isthmeEl = document.getElementById('echocervicale-isthme');
  const airesEl = document.getElementById('echocervicale-aires');
  const smEl = document.getElementById('echocervicale-glandes-sm');
  const parotidesEl = document.getElementById('echocervicale-parotides');
  const axesEl = document.getElementById('echocervicale-axes');
  const cclEl = document.getElementById('echocervicale-conclusion');

  if (existingData) {
    if (modalTitle) modalTitle.textContent = 'Modifier le Compte-rendu d\'Échographie Cervicale';
    if (dateInput) dateInput.value = existingData.date ? String(existingData.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    if (techEl) techEl.value = existingData.technique !== undefined ? existingData.technique : 'Balayage avec une sonde de 7-10 MHz de la région cervicale';
    if (ldEl) ldEl.value = existingData.lobeDroit || '';
    if (lgEl) lgEl.value = existingData.lobeGauche || '';
    if (isthmeEl) isthmeEl.value = existingData.isthme || '';
    if (airesEl) airesEl.value = existingData.airesGanglionnaires || '';
    if (smEl) smEl.value = existingData.glandesSousMandibulaires || '';
    if (parotidesEl) parotidesEl.value = existingData.glandesParotides || '';
    if (axesEl) axesEl.value = existingData.axesVasculaires || '';
    if (cclEl) cclEl.value = existingData.conclusion || '';
  } else {
    if (modalTitle) modalTitle.textContent = 'Compte-rendu d\'Échographie Cervicale';
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    if (techEl) techEl.value = 'Balayage avec une sonde de 7-10 MHz de la région cervicale';
    if (ldEl) ldEl.value = '';
    if (lgEl) lgEl.value = '';
    if (isthmeEl) isthmeEl.value = '';
    if (airesEl) airesEl.value = '';
    if (smEl) smEl.value = '';
    if (parotidesEl) parotidesEl.value = '';
    if (axesEl) axesEl.value = '';
    if (cclEl) cclEl.value = '';
  }

  bindEchographieCervicaleLiveInputs();
  updateEchographieCervicaleLivePreview();

  if (typeof openModal === 'function') {
    openModal('modal-echographie-cervicale');
  } else if (typeof showModal === 'function') {
    showModal('modal-echographie-cervicale');
  }
}

function bindEchographieCervicaleLiveInputs() {
  const ids = [
    'echocervicale-date',
    'echocervicale-technique',
    'echocervicale-lobe-droit',
    'echocervicale-lobe-gauche',
    'echocervicale-isthme',
    'echocervicale-aires',
    'echocervicale-glandes-sm',
    'echocervicale-parotides',
    'echocervicale-axes',
    'echocervicale-conclusion'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.liveBound) {
      el.addEventListener('input', updateEchographieCervicaleLivePreview);
      el.addEventListener('change', updateEchographieCervicaleLivePreview);
      el.dataset.liveBound = '1';
    }
  });
}

function updateEchographieCervicaleLivePreview() {
  const container = document.getElementById('echocervicale-live-preview-sheet');
  if (!container) return;

  const dateVal = document.getElementById('echocervicale-date')?.value || new Date().toISOString().slice(0, 10);
  const techVal = document.getElementById('echocervicale-technique')?.value || '';
  const ldVal = document.getElementById('echocervicale-lobe-droit')?.value || '';
  const lgVal = document.getElementById('echocervicale-lobe-gauche')?.value || '';
  const isthmeVal = document.getElementById('echocervicale-isthme')?.value || '';
  const airesVal = document.getElementById('echocervicale-aires')?.value || '';
  const smVal = document.getElementById('echocervicale-glandes-sm')?.value || '';
  const parotidesVal = document.getElementById('echocervicale-parotides')?.value || '';
  const axesVal = document.getElementById('echocervicale-axes')?.value || '';
  const cclVal = document.getElementById('echocervicale-conclusion')?.value || '';

  const patient = currentEchoCervicalePatient || window.currentPatientData || {
    firstName: document.getElementById('echocervicale-patient-summary')?.textContent || 'Patient',
    lastName: '',
    dateOfBirth: null
  };

  const data = {
    date: dateVal,
    technique: techVal,
    lobeDroit: ldVal,
    lobeGauche: lgVal,
    isthme: isthmeVal,
    airesGanglionnaires: airesVal,
    glandesSousMandibulaires: smVal,
    glandesParotides: parotidesVal,
    axesVasculaires: axesVal,
    conclusion: cclVal
  };

  const bodyHtml = typeof buildEchographieCervicaleBodyHtml === 'function'
    ? buildEchographieCervicaleBodyHtml(data)
    : (window.buildEchographieCervicaleBodyHtml ? window.buildEchographieCervicaleBodyHtml(data) : '');

  const dateLabel = typeof formatPrintingDocumentDateLabel === 'function'
    ? formatPrintingDocumentDateLabel(dateVal)
    : new Date(dateVal).toLocaleDateString('fr-FR');

  const docPageSize = typeof resolveDocumentPageSize === 'function'
    ? resolveDocumentPageSize('echographie_cervicale', 'A5')
    : 'A5';

  const formatLabel = document.getElementById('echocervicale-preview-format-label');
  if (formatLabel) formatLabel.textContent = `Aperçu en direct (Format ${docPageSize})`;

  const buildDoc = docPageSize === 'A4'
    ? (typeof buildA4Html === 'function' ? buildA4Html : (window.buildA4Html || window.buildPrintableHtml))
    : (typeof buildA5Html === 'function' ? buildA5Html : (window.buildA5Html || window.buildPrintableHtml));

  if (typeof buildDoc === 'function') {
    const fullDocHtml = buildDoc({
      title: 'ÉCHOGRAPHIE CERVICALE',
      subtitle: 'Compte-rendu d\'exploration échographique cervicale',
      dateLabel,
      patient,
      bodyContentHtml: bodyHtml,
      documentType: 'echographie_cervicale',
      pageSize: docPageSize,
      documentNumber: 'REF-' + dateVal.replace(/-/g, ''),
      pages: [bodyHtml]
    });

    if (typeof renderLiveDocumentPreviewFrame === 'function') {
      renderLiveDocumentPreviewFrame(container, fullDocHtml);
    } else {
      container.innerHTML = fullDocHtml;
    }
  }
}

async function saveAndPrintEchographieCervicale() {
  const patientId = document.getElementById('echocervicale-patient-id')?.value || window.currentPatientId || null;
  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient', 'error');
    }
    return;
  }

  const existingDocId = document.getElementById('echocervicale-doc-id')?.value || null;
  const date = document.getElementById('echocervicale-date')?.value || new Date().toISOString().slice(0, 10);
  const technique = document.getElementById('echocervicale-technique')?.value || '';
  const lobeDroit = document.getElementById('echocervicale-lobe-droit')?.value || '';
  const lobeGauche = document.getElementById('echocervicale-lobe-gauche')?.value || '';
  const isthme = document.getElementById('echocervicale-isthme')?.value || '';
  const airesGanglionnaires = document.getElementById('echocervicale-aires')?.value || '';
  const glandesSousMandibulaires = document.getElementById('echocervicale-glandes-sm')?.value || '';
  const glandesParotides = document.getElementById('echocervicale-parotides')?.value || '';
  const axesVasculaires = document.getElementById('echocervicale-axes')?.value || '';
  const conclusion = document.getElementById('echocervicale-conclusion')?.value || '';

  const docPayload = {
    patientId,
    documentType: 'echographie_cervicale',
    title: 'ÉCHOGRAPHIE CERVICALE',
    data: {
      date,
      technique,
      lobeDroit,
      lobeGauche,
      isthme,
      airesGanglionnaires,
      glandesSousMandibulaires,
      glandesParotides,
      axesVasculaires,
      conclusion
    }
  };

  if (existingDocId) {
    docPayload.id = existingDocId;
  }

  try {
    if (window.api && window.api.document && typeof window.api.document.save === 'function') {
      const saveResult = await window.api.document.save(docPayload);
      if (!saveResult || !saveResult.success) {
        if (typeof showNotification === 'function') {
          showNotification(saveResult?.error || 'Erreur lors de l\'enregistrement de l\'échographie cervicale', 'error');
        }
        return;
      }
    }

    if (typeof closeModal === 'function') {
      closeModal('modal-echographie-cervicale');
    }

    if (typeof showNotification === 'function') {
      showNotification('Échographie cervicale enregistrée, ouverture de l\'impression...', 'success');
    }

    // Refresh patient documents table if loaded
    if (typeof loadPatientEchographies === 'function') {
      loadPatientEchographies(patientId);
    }

    // Launch print window
    const patient = currentEchoCervicalePatient || { id: patientId };
    const dateLabel = typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(date) : date;

    if (typeof renderEchographieCervicaleDocument === 'function') {
      await renderEchographieCervicaleDocument({
        patient,
        data: docPayload.data,
        dateLabel,
        onEdit: () => openEchographieCervicaleModal(patientId, existingDocId, docPayload.data)
      });
    }
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement / impression de l\'échographie cervicale:', err);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'enregistrement', 'error');
    }
  }
}

window.openEchographieCervicaleModal = openEchographieCervicaleModal;
window.bindEchographieCervicaleLiveInputs = bindEchographieCervicaleLiveInputs;
window.updateEchographieCervicaleLivePreview = updateEchographieCervicaleLivePreview;
window.saveAndPrintEchographieCervicale = saveAndPrintEchographieCervicale;

// ==========================================
// AUDIOGRAMME DOCUMENT WORKSTATION (ORL)
// ==========================================

let currentAudiogrammePatient = null;
const AUDIO_FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000];

function calculateAudiogramPTA(caMap = {}) {
  const ptaFreqs = [500, 1000, 2000];
  const validVals = [];
  ptaFreqs.forEach(f => {
    const v = caMap[f];
    if (v !== undefined && v !== null && String(v).trim() !== '' && !isNaN(Number(v))) {
      validVals.push(Number(v));
    }
  });
  if (!validVals.length) return '';
  const avg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
  return Math.round(avg * 10) / 10;
}

async function openAudiogrammeModal(patientId, documentId = null, existingData = null) {
  const targetPatientId = patientId || window.currentPatientId || null;
  if (!targetPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient avant de créer un audiogramme', 'warning');
    }
    return;
  }

  // Retrieve patient information
  let patient = null;
  try {
    if (window.currentPatientData && (window.currentPatientData.id === targetPatientId || window.currentPatientData.patientId === targetPatientId)) {
      patient = window.currentPatientData;
    } else if (window.api && window.api.patient && typeof window.api.patient.getById === 'function') {
      const res = await window.api.patient.getById(targetPatientId);
      if (res && res.success && res.data) {
        patient = res.data;
      }
    }
  } catch (err) {
    console.warn('Erreur lors du chargement du patient pour l\'audiogramme:', err);
  }

  currentAudiogrammePatient = patient || { id: targetPatientId, firstName: '', lastName: '' };

  const form = document.getElementById('audiogramme-form');
  if (form) form.reset();

  const patientIdInput = document.getElementById('audio-patient-id');
  const docIdInput = document.getElementById('audio-doc-id');
  const summaryEl = document.getElementById('audio-patient-summary');
  const dateInput = document.getElementById('audio-date');
  const modalTitle = document.getElementById('audio-modal-title');

  if (patientIdInput) patientIdInput.value = targetPatientId;
  if (docIdInput) docIdInput.value = documentId || '';

  const patientName = `${patient?.lastName || patient?.nom || ''} ${patient?.firstName || patient?.prenom || ''}`.trim() || 'Patient';
  const patientAge = patient?.dateOfBirth ? (typeof computeAge === 'function' ? `${computeAge(patient.dateOfBirth)} ans` : '') : (patient?.age ? `${patient.age} ans` : '');
  if (summaryEl) {
    summaryEl.textContent = `${patientName}${patientAge ? ` (${patientAge})` : ''}`;
  }

  // Clear or fill form fields
  AUDIO_FREQUENCIES.forEach(f => {
    const cadEl = document.getElementById(`audio-cad-${f}`);
    const codEl = document.getElementById(`audio-cod-${f}`);
    const cagEl = document.getElementById(`audio-cag-${f}`);
    const cogEl = document.getElementById(`audio-cog-${f}`);

    if (existingData) {
      if (cadEl) cadEl.value = existingData.caDroite?.[f] !== undefined ? existingData.caDroite[f] : '';
      if (codEl) codEl.value = existingData.coDroite?.[f] !== undefined ? existingData.coDroite[f] : '';
      if (cagEl) cagEl.value = existingData.caGauche?.[f] !== undefined ? existingData.caGauche[f] : '';
      if (cogEl) cogEl.value = existingData.coGauche?.[f] !== undefined ? existingData.coGauche[f] : '';
    } else {
      if (cadEl) cadEl.value = '';
      if (codEl) codEl.value = '';
      if (cagEl) cagEl.value = '';
      if (cogEl) cogEl.value = '';
    }
  });

  const obsEl = document.getElementById('audio-conclusion') || document.getElementById('audio-observation');

  if (existingData) {
    if (modalTitle) modalTitle.textContent = 'Modifier le Rapport Audiologique';
    if (dateInput) dateInput.value = existingData.date ? String(existingData.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    if (obsEl) obsEl.value = existingData.observation || existingData.observations || existingData.conclusion || '';
  } else {
    if (modalTitle) modalTitle.textContent = 'Rapport Audiologique';
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    if (obsEl) obsEl.value = '';
  }

  // Bind live inputs & trigger live update
  bindAudiogrammeLiveInputs();
  updateAudiogrammeLivePreview();

  if (typeof openModal === 'function') {
    openModal('modal-audiogramme');
  } else if (typeof showModal === 'function') {
    showModal('modal-audiogramme');
  }
}

function bindAudiogrammeLiveInputs() {
  const ids = [
    'audio-date',
    'audio-conclusion',
    'audio-observation'
  ];
  AUDIO_FREQUENCIES.forEach(f => {
    ids.push(`audio-cad-${f}`, `audio-cod-${f}`, `audio-cag-${f}`, `audio-cog-${f}`);
  });

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.liveBound) {
      el.addEventListener('input', updateAudiogrammeLivePreview);
      el.addEventListener('change', updateAudiogrammeLivePreview);
      el.dataset.liveBound = '1';
    }
  });
}

function updateAudiogrammeLivePreview() {
  const container = document.getElementById('audio-live-preview-sheet');
  if (!container) return;

  const dateVal = document.getElementById('audio-date')?.value || new Date().toISOString().slice(0, 10);
  const obsEl = document.getElementById('audio-conclusion') || document.getElementById('audio-observation');
  const observation = obsEl?.value || '';

  const caDroite = {};
  const coDroite = {};
  const caGauche = {};
  const coGauche = {};

  AUDIO_FREQUENCIES.forEach(f => {
    const cadVal = document.getElementById(`audio-cad-${f}`)?.value;
    const codVal = document.getElementById(`audio-cod-${f}`)?.value;
    const cagVal = document.getElementById(`audio-cag-${f}`)?.value;
    const cogVal = document.getElementById(`audio-cog-${f}`)?.value;

    if (cadVal !== undefined && cadVal !== null && cadVal.trim() !== '') caDroite[f] = Number(cadVal);
    if (codVal !== undefined && codVal !== null && codVal.trim() !== '') coDroite[f] = Number(codVal);
    if (cagVal !== undefined && cagVal !== null && cagVal.trim() !== '') caGauche[f] = Number(cagVal);
    if (cogVal !== undefined && cogVal !== null && cogVal.trim() !== '') coGauche[f] = Number(cogVal);
  });

  const ptaDroite = calculateAudiogramPTA(caDroite);
  const ptaGauche = calculateAudiogramPTA(caGauche);

  // Update PTA indicator in form
  const ptaDIndicator = document.getElementById('audio-pta-indicator-droite');
  const ptaGIndicator = document.getElementById('audio-pta-indicator-gauche');
  if (ptaDIndicator) ptaDIndicator.textContent = ptaDroite ? `${ptaDroite} dB` : '-';
  if (ptaGIndicator) ptaGIndicator.textContent = ptaGauche ? `${ptaGauche} dB` : '-';

  const patient = currentAudiogrammePatient || window.currentPatientData || {
    firstName: document.getElementById('audio-patient-summary')?.textContent || 'Patient',
    lastName: '',
    dateOfBirth: null
  };

  const data = {
    date: dateVal,
    caDroite,
    coDroite,
    caGauche,
    coGauche,
    ptaDroite,
    ptaGauche,
    observation,
    conclusion: observation
  };

  const bodyHtml = typeof buildAudiogrammeBodyHtml === 'function'
    ? buildAudiogrammeBodyHtml(data)
    : (window.buildAudiogrammeBodyHtml ? window.buildAudiogrammeBodyHtml(data) : '');

  const dateLabel = typeof formatPrintingDocumentDateLabel === 'function'
    ? formatPrintingDocumentDateLabel(dateVal)
    : new Date(dateVal).toLocaleDateString('fr-FR');

  const docPageSize = typeof resolveDocumentPageSize === 'function'
    ? resolveDocumentPageSize('audiogramme', 'A5')
    : 'A5';

  const formatLabel = document.getElementById('audio-preview-format-label');
  if (formatLabel) formatLabel.textContent = `Aperçu en direct (Format ${docPageSize})`;

  const buildDoc = docPageSize === 'A4'
    ? (typeof buildA4Html === 'function' ? buildA4Html : (window.buildA4Html || window.buildPrintableHtml))
    : (typeof buildA5Html === 'function' ? buildA5Html : (window.buildA5Html || window.buildPrintableHtml));

  if (typeof buildDoc === 'function') {
    const fullDocHtml = buildDoc({
      title: 'RAPPORT AUDIOLOGIQUE',
      subtitle: 'Compte-rendu d\'audiométrie tonale',
      dateLabel,
      patient,
      bodyContentHtml: bodyHtml,
      documentType: 'audiogramme',
      pageSize: docPageSize,
      documentNumber: 'REF-' + dateVal.replace(/-/g, ''),
      pages: [bodyHtml]
    });

    if (typeof renderLiveDocumentPreviewFrame === 'function') {
      renderLiveDocumentPreviewFrame(container, fullDocHtml);
    } else {
      let iframe = container.querySelector('iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.background = '#ffffff';
        container.innerHTML = '';
        container.appendChild(iframe);
      }
      iframe.srcdoc = fullDocHtml;
    }
  }
}

async function saveAndPrintAudiogramme() {
  const patientId = document.getElementById('audio-patient-id')?.value || window.currentPatientId || currentAudiogrammePatient?.id || null;
  const existingDocId = document.getElementById('audio-doc-id')?.value || null;
  const date = document.getElementById('audio-date')?.value || new Date().toISOString().slice(0, 10);

  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient', 'warning');
    }
    return;
  }

  const obsEl = document.getElementById('audio-conclusion') || document.getElementById('audio-observation');
  const observation = obsEl?.value || '';

  const caDroite = {};
  const coDroite = {};
  const caGauche = {};
  const coGauche = {};

  AUDIO_FREQUENCIES.forEach(f => {
    const cadVal = document.getElementById(`audio-cad-${f}`)?.value;
    const codVal = document.getElementById(`audio-cod-${f}`)?.value;
    const cagVal = document.getElementById(`audio-cag-${f}`)?.value;
    const cogVal = document.getElementById(`audio-cog-${f}`)?.value;

    if (cadVal !== undefined && cadVal !== null && String(cadVal).trim() !== '') caDroite[f] = Number(cadVal);
    if (codVal !== undefined && codVal !== null && String(codVal).trim() !== '') coDroite[f] = Number(codVal);
    if (cagVal !== undefined && cagVal !== null && String(cagVal).trim() !== '') caGauche[f] = Number(cagVal);
    if (cogVal !== undefined && cogVal !== null && String(cogVal).trim() !== '') coGauche[f] = Number(cogVal);
  });

  const ptaDroite = calculateAudiogramPTA(caDroite);
  const ptaGauche = calculateAudiogramPTA(caGauche);

  const docPayload = {
    patientId,
    documentType: 'audiogramme',
    title: 'Rapport Audiologique',
    data: {
      date,
      caDroite,
      coDroite,
      caGauche,
      coGauche,
      ptaDroite,
      ptaGauche,
      observation,
      conclusion: observation
    }
  };

  if (existingDocId) {
    docPayload.id = existingDocId;
  }

  try {
    if (window.api && window.api.document && typeof window.api.document.save === 'function') {
      const saveResult = await window.api.document.save(docPayload);
      if (!saveResult || !saveResult.success) {
        if (typeof showNotification === 'function') {
          showNotification(saveResult?.error || 'Erreur lors de l\'enregistrement de l\'audiogramme', 'error');
        }
        return;
      }
    }

    if (typeof closeModal === 'function') {
      closeModal('modal-audiogramme');
    }

    if (typeof showNotification === 'function') {
      showNotification('Audiogramme enregistré, ouverture de l\'impression...', 'success');
    }

    // Refresh patient documents table if loaded
    if (typeof loadPatientAudiogrammes === 'function') {
      loadPatientAudiogrammes(patientId);
    }

    // Launch print window
    let patient = currentAudiogrammePatient;
    if (!patient || !patient.firstName) {
      if (window.api?.patient?.getById && patientId) {
        try {
          const patRes = await window.api.patient.getById(patientId);
          if (patRes?.success && patRes.data) {
            patient = patRes.data;
          }
        } catch (_) {}
      }
    }
    if (!patient) {
      patient = { id: patientId, firstName: '', lastName: 'Patient' };
    }

    const dateLabel = typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(date) : date;

    if (typeof renderAudiogrammeDocument === 'function') {
      await renderAudiogrammeDocument({
        patient,
        data: docPayload.data,
        dateLabel,
        onEdit: () => openAudiogrammeModal(patientId, existingDocId, docPayload.data)
      });
    }
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement / impression de l\'audiogramme:', err);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'enregistrement', 'error');
    }
  }
}

window.openAudiogrammeModal = openAudiogrammeModal;
window.bindAudiogrammeLiveInputs = bindAudiogrammeLiveInputs;
window.updateAudiogrammeLivePreview = updateAudiogrammeLivePreview;
window.saveAndPrintAudiogramme = saveAndPrintAudiogramme;
window.calculateAudiogramPTA = calculateAudiogramPTA;


const PATIENT_DOCUMENT_PAGE_SIZES = {
  factures: 5,
  rapports: 5,
  bonpour: 5,
  orientations: 5
};
const patientDocumentPagination = {
  factures: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.factures, total: 0, totalPages: 1 },
  rapports: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.rapports, total: 0, totalPages: 1 },
  bonpour: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.bonpour, total: 0, totalPages: 1 },
  orientations: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.orientations, total: 0, totalPages: 1 }
};

function resetPatientDocumentPagination(sectionKey = null) {
  const keys = sectionKey ? [sectionKey] : Object.keys(patientDocumentPagination);
  keys.forEach((key) => {
    patientDocumentPagination[key] = {
      page: 1,
      pageSize: PATIENT_DOCUMENT_PAGE_SIZES[key] || 5,
      total: 0,
      totalPages: 1
    };
  });
}

function updatePatientDocumentPagination(sectionKey, pagination = null) {
  const currentState = patientDocumentPagination[sectionKey];
  if (!currentState) return;

  if (!pagination) {
    patientDocumentPagination[sectionKey] = {
      ...currentState,
      page: 1,
      total: 0,
      totalPages: 1
    };
    return;
  }

  patientDocumentPagination[sectionKey] = {
    ...currentState,
    page: Number(pagination.page || 1),
    pageSize: Number(pagination.pageSize || currentState.pageSize || 5),
    total: Number(pagination.total || 0),
    totalPages: Math.max(1, Number(pagination.totalPages || 1))
  };
}

function buildPatientDocumentPaginationRow(sectionKey, colspan) {
  const pagination = patientDocumentPagination[sectionKey];
  if (!pagination || pagination.totalPages <= 1) {
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
            <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${currentPage <= 1 ? 'disabled' : ''} onclick="changePatientDocumentPage('${sectionKey}', -1)">‹</button>
            <span class="patients-pagination-info">${currentPage}/${pagination.totalPages}</span>
            <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${currentPage >= pagination.totalPages ? 'disabled' : ''} onclick="changePatientDocumentPage('${sectionKey}', 1)">›</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function getPatientDocumentFilters() {
  if (typeof getPatientRecordsDateFilter === 'function') {
    return getPatientRecordsDateFilter();
  }
  return { start: '', end: '' };
}

async function fetchPatientDocumentPage(patientId, sectionKey, documentType, page = null) {
  const pagination = patientDocumentPagination[sectionKey];
  const filters = getPatientDocumentFilters();
  const result = await window.api.document.listByPatient({
    patientId,
    documentType,
    page: Number(page || pagination.page || 1),
    pageSize: pagination.pageSize,
    startDate: filters.start,
    endDate: filters.end,
    paginated: true
  });
  updatePatientDocumentPagination(sectionKey, result?.pagination);
  return result?.success && Array.isArray(result.data) ? result.data : [];
}

async function changePatientDocumentPage(sectionKey, direction) {
  if (!currentPatientId) return;
  const pagination = patientDocumentPagination[sectionKey];
  if (!pagination) return;

  const nextPage = Math.min(Math.max(1, pagination.page + direction), Math.max(1, pagination.totalPages));
  if (nextPage === pagination.page) return;

  if (sectionKey === 'factures') await loadPatientFactures(currentPatientId, { page: nextPage });
  if (sectionKey === 'rapports') await loadPatientRapports(currentPatientId, { page: nextPage });
  if (sectionKey === 'bonpour') await loadPatientBonPour(currentPatientId, { page: nextPage });
  if (sectionKey === 'orientations') await loadPatientOrientations(currentPatientId, { page: nextPage });
}

if (typeof window !== 'undefined') {
  window.changePatientDocumentPage = changePatientDocumentPage;
  window.resetPatientDocumentPagination = resetPatientDocumentPagination;
}

// ========== FACTURES (PATIENT-LEVEL) ==========

async function loadPatientFactures(patientId, options = {}) {
  const tbody = document.getElementById('details-factures-tbody');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Chargement...</td></tr>';
  
  try {
    const factures = await fetchPatientDocumentPage(patientId, 'factures', 'invoice', options.page);

    if (!factures.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Aucune facture</td></tr>';
      return;
    }

    const rowsHtml = factures.map(f => {
      const date = f.updatedAt || f.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      const payload = parseDocumentPayload(f.payload);
      const totals = typeof calculateFactureTotals === 'function'
        ? calculateFactureTotals(payload)
        : { grandTotal: payload.totalPrice !== '' && payload.totalPrice !== undefined ? payload.totalPrice : payload.unitPrice };
      const montant = formatCurrencyDisplay(totals.grandTotal);
      return `
        <tr>
          <td>${escapeHTML(dateLabel)}</td>
          <td>${escapeHTML(montant)}</td>
          <td>
            <div class="table-actions" style="display:flex; gap:6px;">
              <button class="btn btn-tiny btn-secondary consultation-action-chip-icon" title="Modifier" onclick="editPatientFacture('${f.id}')">✏️</button>
              <button class="btn btn-tiny btn-primary consultation-action-chip-icon" title="Imprimer" onclick="printPatientFacture('${f.id}')">🖨️</button>
              <button class="btn btn-tiny btn-danger consultation-action-chip-icon" title="Supprimer" onclick="deletePatientDocument('${f.id}', 'facture')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('factures', 3);
  } catch (error) {
    console.error('Error loading factures:', error);
    updatePatientDocumentPagination('factures', null);
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}

function openPatientFactureModal() {
  if (!currentPatientId) {
    showNotification('Sélectionnez un patient', 'warning');
    return;
  }
  // Open facture modal without consultation
  openPatientLevelFactureModal(currentPatientId);
}

async function openPatientLevelFactureModal(patientId, existingDoc = null) {
  try {
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success) {
      showNotification('Patient introuvable', 'error');
      return;
    }
    const patient = patientResult.data;
    
    if (typeof ensureSettingsLoaded === 'function') {
      await ensureSettingsLoaded();
    }
    const rawPayload = existingDoc ? parseDocumentPayload(existingDoc.payload) : null;
    const payload = typeof normalizeFacturePayload === 'function'
      ? normalizeFacturePayload(rawPayload, { consultation: null, settings: cachedSettings })
      : (rawPayload || (typeof getDefaultFactureData === 'function'
        ? getDefaultFactureData({ consultation: null, settings: cachedSettings })
        : {}));
    factureTotalEditedManually = false;
    
    documentModalState.invoice = {
      consultationId: existingDoc?.consultationId || null,
      patientId: patient.id,
      documentId: existingDoc?.id || null,
      data: payload
    };
    
    if (typeof setFactureSummary === 'function') {
      setFactureSummary({
        patient,
        updatedAt: existingDoc?.updatedAt || existingDoc?.createdAt || new Date().toISOString()
      });
    }
    
    if (typeof fillFactureForm === 'function') {
      fillFactureForm(payload);
    }
    if (typeof renderFacturePreview === 'function') {
      renderFacturePreview();
    }
    if (typeof showModal === 'function') {
      showModal('modal-facture');
    }
  } catch (error) {
    console.error('Error opening patient facture modal:', error);
    showNotification('Impossible d\'ouvrir la facture', 'error');
  }
}

async function editPatientFacture(documentId) {
  // Similar to openPatientLevelFactureModal but load by document ID
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Facture introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    await openPatientLevelFactureModal(doc.patientId, doc);
  } catch (error) {
    console.error('Error editing facture:', error);
    showNotification('Erreur', 'error');
  }
}

async function printPatientFacture(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Facture introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);
    
    // Use the existing generateInvoice but pass patient-level data
    await generateInvoiceFromPatientDocument(doc.patientId, payload);
  } catch (error) {
    console.error('Error printing facture:', error);
    showNotification('Erreur d\'impression', 'error');
  }
}

async function deletePatientDocument(documentId, typeName) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer cette ${typeName} ?`)) {
    return;
  }
  
  try {
    const result = await window.api.document.delete(documentId);
    if (result.success) {
      showNotification(`✅ ${typeName.charAt(0).toUpperCase() + typeName.slice(1)} supprimée`, 'success');
      if (typeName === 'facture') loadPatientFactures(currentPatientId);
      if (typeName === 'rapport') loadPatientRapports(currentPatientId);
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting document:', error);
    showNotification('Erreur de suppression', 'error');
  }
}

// ========== RAPPORTS (PATIENT-LEVEL) ==========

async function loadPatientRapports(patientId, options = {}) {
  const tbody = document.getElementById('details-rapports-tbody');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Chargement...</td></tr>';
  
  try {
    const rapports = await fetchPatientDocumentPage(patientId, 'rapports', 'rapport', options.page);

    if (!rapports.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Aucun rapport</td></tr>';
      return;
    }

    const rowsHtml = rapports.map(r => {
      const date = r.updatedAt || r.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      const title = r.title || 'Rapport médical';
      return `
        <tr>
          <td>${escapeHTML(dateLabel)}</td>
          <td>${escapeHTML(title)}</td>
          <td>
            <div class="table-actions" style="display:flex; gap:6px;">
              <button class="btn btn-tiny btn-secondary consultation-action-chip-icon" title="Voir" data-rapport-action="view" data-document-id="${r.id}">👁️</button>
              <button class="btn btn-tiny btn-info consultation-action-chip-icon" title="Modifier" data-rapport-action="edit" data-document-id="${r.id}">✏️</button>
              <button class="btn btn-tiny btn-primary consultation-action-chip-icon" title="Imprimer" data-rapport-action="print" data-document-id="${r.id}">🖨️</button>
              <button class="btn btn-tiny btn-danger consultation-action-chip-icon" title="Supprimer" data-rapport-action="delete" data-document-id="${r.id}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('rapports', 3);
  } catch (error) {
    console.error('Error loading rapports:', error);
    updatePatientDocumentPagination('rapports', null);
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}

function openPatientRapportModal() {
  if (!currentPatientId) {
    showNotification('Sélectionnez un patient', 'warning');
    return;
  }
  openPatientLevelRapportModal(currentPatientId);
}

async function openPatientLevelRapportModal(patientId, existingDoc = null, options = {}) {
  try {
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success) {
      showNotification('Patient introuvable', 'error');
      return;
    }
    const patient = patientResult.data;
    
    if (typeof ensureSettingsLoaded === 'function') {
      await ensureSettingsLoaded();
    }
    const rawPayload = existingDoc ? parseDocumentPayload(existingDoc.payload) : null;
    const payload = typeof normalizeRapportPayload === 'function'
      ? normalizeRapportPayload(rawPayload, { patient })
      : {
        date: new Date().toISOString().slice(0, 10),
        motif: '',
        contexte: '',
        constats: '',
        priseEnCharge: '',
        recommandations: ''
      };
    
    documentModalState.rapport = {
      consultationId: existingDoc?.consultationId || null,
      patientId: patient.id,
      documentId: existingDoc?.id || null,
      data: payload,
      readOnly: Boolean(options.readOnly)
    };
    
    if (typeof setRapportSummary === 'function') {
      setRapportSummary({
        patient,
        updatedAt: existingDoc?.updatedAt || existingDoc?.createdAt || new Date().toISOString()
      });
    }
    
    if (typeof fillRapportForm === 'function') {
      fillRapportForm(payload);
    }
    if (typeof setRapportFormReadOnly === 'function') {
      setRapportFormReadOnly(Boolean(options.readOnly));
    }
    if (typeof renderRapportPreview === 'function') {
      renderRapportPreview();
    }
    if (typeof showModal === 'function') {
      showModal('modal-rapport');
    }
  } catch (error) {
    console.error('Error opening patient rapport modal:', error);
    showNotification('Impossible d\'ouvrir le rapport', 'error');
  }
}

async function editPatientRapport(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Rapport introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    await openPatientLevelRapportModal(doc.patientId, doc, { readOnly: false });
  } catch (error) {
    console.error('Error editing rapport:', error);
    showNotification('Erreur', 'error');
  }
}

async function printPatientRapport(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Rapport introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);
    
    await generateReportFromPatientDocument(doc.patientId, payload);
  } catch (error) {
    console.error('Error printing rapport:', error);
    showNotification('Erreur d\'impression', 'error');
  }
}

async function viewPatientRapport(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Rapport introuvable', 'error');
      return;
    }
    await openPatientLevelRapportModal(docResult.data.patientId, docResult.data, { readOnly: true });
  } catch (error) {
    console.error('Error viewing rapport:', error);
    showNotification('Erreur lors de l\'ouverture du rapport', 'error');
  }
}

function handleRapportRowAction(action, documentId) {
  if (!documentId) return;
  switch (action) {
    case 'view':
      viewPatientRapport(documentId);
      break;
    case 'edit':
      editPatientRapport(documentId);
      break;
    case 'print':
      printPatientRapport(documentId);
      break;
    case 'delete':
      deletePatientDocument(documentId, 'rapport');
      break;
    default:
      break;
  }
}

function initializeRapportTableActions() {
  const tbody = document.getElementById('details-rapports-tbody');
  if (!tbody || tbody.dataset.rapportActionsBound) {
    return;
  }
  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rapport-action]');
    if (!button) {
      return;
    }
    event.preventDefault();
    const { rapportAction, documentId } = button.dataset;
    if (!rapportAction || !documentId) {
      return;
    }
    handleRapportRowAction(rapportAction, documentId);
  });
  tbody.dataset.rapportActionsBound = 'true';
}

document.addEventListener('DOMContentLoaded', initializeRapportTableActions);


// ========== BONS POUR (PATIENT-LEVEL) ==========

async function loadPatientBonPour(patientId, options = {}) {
  const tbody = document.getElementById('details-bonpour-tbody');
  const emptyState = document.getElementById('details-bonpour-empty');
  if (!tbody) return;

  if (!patientId) {
    updatePatientDocumentPagination('bonpour', null);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Selectionnez un patient</td></tr>';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Chargement...</td></tr>';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const bonpours = await fetchPatientDocumentPage(patientId, 'bonpour', 'bonpour', options.page);

    if (!bonpours.length) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const rowsHtml = bonpours.map(bp => {
      const payload = parseDocumentPayload(bp.payload);
      const date = payload.date || bp.updatedAt || bp.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      const type = payload.type || bp.title || 'Demande medicale';
      const examCount = payload.examCount || '-';
      return `
        <tr>
          <td>${escapeHTML(dateLabel)}</td>
          <td>${escapeHTML(type)}</td>
          <td>${examCount} examen(s)</td>
          <td>
            <div class="table-actions" style="display:flex; gap:6px;">
              <button class="btn btn-tiny btn-primary" title="Voir/Modifier" onclick="viewBonPour('${bp.id}')">Voir</button>
              <button class="btn btn-tiny btn-secondary" title="Reimprimer" onclick="reprintBonPour('${bp.id}')">Imprimer</button>
              <button class="btn btn-tiny btn-danger" title="Supprimer" onclick="deleteBonPour('${bp.id}')">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('bonpour', 4);
  } catch (error) {
    console.error('Error loading bons pour:', error);
    updatePatientDocumentPagination('bonpour', null);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}
async function reprintBonPour(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Bon pour introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);
    
    // Get patient data
    let patient = null;
    try {
      const patientResult = await window.api.patient.getById(doc.patientId);
      if (patientResult.success) {
        patient = patientResult.data;
      }
    } catch (e) {
      console.error('Error loading patient:', e);
    }
    
    // Format the details as a single ordered list to avoid cropped first-row items
    const details = payload.details || '';
    const detailsLines = details.split('\n').filter(line => line.trim());

    let detailsHtml = '<div class="exam-list" style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px 10px;">';
    detailsLines.forEach((line) => {
      const cleanLine = line.replace(/^[-?]\s*/, '').trim();
      detailsHtml += `<div class="exam-item">- ${escapeHTML(cleanLine)}</div>`;
    });
    detailsHtml += '</div>';

    const pageContent = `
      <div class="content-box">
        <h3>Examens demandes</h3>
        <style>
          .exam-item { font-size: 10.4pt; padding: 2px 0; line-height: 1.4; break-inside: avoid; word-break: break-word; }
          .exam-list { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px 10px; align-items:start; }
        </style>
        ${detailsHtml}
      </div>
      ${payload.indication ? `
        <div class="content-box">
          <h3>Indication clinique</h3>
          <div class="content-text">${escapeHTML(payload.indication)}</div>
        </div>
      ` : ''}
      ${payload.notes ? `
        <div class="content-box">
          <h3>Notes complementaires</h3>
          <div class="content-text">${escapeHTML(payload.notes)}</div>
        </div>
      ` : ''}
    `;
    
    if (typeof sharedPrintScope !== 'undefined' && sharedPrintScope.openA5PrintDocument) {
      await sharedPrintScope.openA5PrintDocument({
        title: 'Faire Svp',
        subtitle: payload.type || 'Demande médicale',
        dateLabel: payload.date ? new Date(payload.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
        patient: patient,
        documentType: 'bonpour',
        pages: [pageContent]
      });
    }
    
    showNotification('✅ Faire Svp réimprimé', 'success');
  } catch (error) {
    console.error('Error reprinting bon pour:', error);
    showNotification('Erreur lors de la réimpression', 'error');
  }
}

async function deleteBonPour(documentId) {
  if (!confirm('Supprimer ce bon pour ?')) return;
  
  try {
    const result = await window.api.document.delete(documentId);
    if (result.success) {
      showNotification('✅ Bon pour supprimé', 'success');
      if (currentPatientId) {
        loadPatientBonPour(currentPatientId);
      }
    } else {
      showNotification('Erreur de suppression', 'error');
    }
  } catch (error) {
    console.error('Error deleting bon pour:', error);
    showNotification('Erreur de suppression', 'error');
  }
}

/**
 * View/Edit a saved Bon Pour document
 */
async function viewBonPour(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Bon pour introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);
    
    // Open the modal with existing data
    if (typeof openBonPourModal === 'function') {
      await openBonPourModal(doc.patientId);
      
      // Wait for modal to be ready, then populate fields
      setTimeout(() => {
        const dateInput = document.getElementById('bonpour-date');
        const typeSelect = document.getElementById('bonpour-type');
        const detailsTextarea = document.getElementById('bonpour-details');
        const indicationInput = document.getElementById('bonpour-indication');
        const notesInput = document.getElementById('bonpour-notes');
        const bodyFontSizeInput = document.getElementById('bonpour-body-font-size');
        
        if (dateInput && payload.date) dateInput.value = payload.date;
        if (typeSelect && payload.type) {
          for (let opt of typeSelect.options) {
            if (opt.text === payload.type) {
              typeSelect.value = opt.value;
              break;
            }
          }
          if (typeof updateBonPourContent === 'function') {
            updateBonPourContent();
          }
        }
        if (detailsTextarea) detailsTextarea.value = payload.details || '';
        if (indicationInput && payload.indication) indicationInput.value = payload.indication;
        if (notesInput && payload.notes) notesInput.value = payload.notes;
        if (bodyFontSizeInput && payload.bodyFontSize) bodyFontSizeInput.value = payload.bodyFontSize;
        if (typeof syncBonPourDetailColumnsFromTextarea === 'function') {
          syncBonPourDetailColumnsFromTextarea();
        }
        if (typeof syncBonPourSelectionsFromTextarea === 'function') {
          syncBonPourSelectionsFromTextarea();
        }
        
        // Store document ID for potential update
        const hiddenId = document.createElement('input');
        hiddenId.type = 'hidden';
        hiddenId.id = 'bonpour-edit-id';
        hiddenId.value = documentId;
        const existingHidden = document.getElementById('bonpour-edit-id');
        if (existingHidden) existingHidden.remove();
        const modal = document.getElementById('modal-bonpour');
        if (modal) modal.querySelector('.modal-body')?.appendChild(hiddenId);
      }, 200);
    }
  } catch (error) {
    console.error('Error viewing bon pour:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

// Make functions globally available
window.loadPatientBonPour = loadPatientBonPour;
window.reprintBonPour = reprintBonPour;
window.deleteBonPour = deleteBonPour;
window.viewBonPour = viewBonPour;


// ========== ORIENTATIONS (PATIENT-LEVEL) ==========

async function loadPatientOrientations(patientId, options = {}) {
  const tbody = document.getElementById('details-orientations-tbody');
  const emptyState = document.getElementById('details-orientations-empty');
  if (!tbody) return;

  if (!patientId) {
    updatePatientDocumentPagination('orientations', null);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Selectionnez un patient</td></tr>';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Chargement...</td></tr>';
  if (emptyState) emptyState.style.display = 'none';

  try {
    const orientations = await fetchPatientDocumentPage(patientId, 'orientations', 'orientation', options.page);

    if (!orientations.length) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const rowsHtml = orientations.map(o => {
      const payload = parseDocumentPayload(o.payload);
      const date = payload.date || o.updatedAt || o.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      const specialty = payload.specialty || 'Non specifie';
      const motif = payload.motif || payload.symptoms || '-';
      const motifShort = motif.length > 40 ? motif.substring(0, 40) + '...' : motif;
      return `
        <tr>
          <td>${escapeHTML(dateLabel)}</td>
          <td>${escapeHTML(specialty)}</td>
          <td title="${escapeHTML(motif)}">${escapeHTML(motifShort)}</td>
          <td>
            <div class="table-actions" style="display:flex; gap:6px;">
              <button class="btn btn-tiny btn-primary" title="Voir/Modifier" onclick="viewOrientation('${o.id}')">Voir</button>
              <button class="btn btn-tiny btn-secondary" title="Reimprimer" onclick="reprintOrientation('${o.id}')">Imprimer</button>
              <button class="btn btn-tiny btn-danger" title="Supprimer" onclick="deleteOrientation('${o.id}')">Supprimer</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('orientations', 4);
  } catch (error) {
    console.error('Error loading orientations:', error);
    updatePatientDocumentPagination('orientations', null);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}
async function reprintOrientation(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Lettre d\'orientation introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);
    
    // Get patient data
    let patient = null;
    try {
      const patientResult = await window.api.patient.getById(doc.patientId);
      if (patientResult.success) {
        patient = patientResult.data;
      }
    } catch (e) {
      console.error('Error loading patient:', e);
    }
    
    const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : 'le patient';
    const destinataire = String(payload.destinataire || 'confrere (consoeur)')
      .replace(/confrère/g, 'confrere')
      .replace(/consœur/g, 'consoeur');
    const antecedents = payload.antecedents || '';
    const symptoms = payload.symptoms || '';
    const motif = payload.motif || '';
    
    // Build the letter content
    const salutation = destinataire === 'confrere'
      ? 'Cher confrère,'
      : destinataire === 'consoeur'
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
    
    if (typeof sharedPrintScope !== 'undefined' && sharedPrintScope.openA5PrintDocument) {
      await sharedPrintScope.openA5PrintDocument({
        title: 'LETTRE D\'ORIENTATION',
        subtitle: payload.specialty || 'Orientation médicale',
        dateLabel: payload.date ? new Date(payload.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
        patient: patient,
        documentType: 'orientation',
        pages: [pageContent]
      });
    }
    
    showNotification('✅ Lettre d\'orientation réimprimée', 'success');
  } catch (error) {
    console.error('Error reprinting orientation:', error);
    showNotification('Erreur lors de la réimpression', 'error');
  }
}

async function deleteOrientation(documentId) {
  if (!confirm('Supprimer cette lettre d\'orientation ?')) return;
  
  try {
    const result = await window.api.document.delete(documentId);
    if (result.success) {
      showNotification('✅ Lettre d\'orientation supprimée', 'success');
      if (currentPatientId) {
        loadPatientOrientations(currentPatientId);
      }
    } else {
      showNotification('Erreur de suppression', 'error');
    }
  } catch (error) {
    console.error('Error deleting orientation:', error);
    showNotification('Erreur de suppression', 'error');
  }
}

/**
 * View/Edit a saved Orientation document
 */
async function viewOrientation(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Lettre d\'orientation introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);
    
    // Open the modal with existing data
    if (typeof openOrientationModal === 'function') {
      await openOrientationModal(doc.patientId);
      
      // Wait for modal to be ready, then populate fields
      setTimeout(() => {
        const dateInput = document.getElementById('orientation-date');
        const destSelect = document.getElementById('orientation-destinataire');
        const specialtySelect = document.getElementById('orientation-specialty');
        const antecedentsTextarea = document.getElementById('orientation-antecedents');
        const symptomsTextarea = document.getElementById('orientation-symptoms');
        const motifTextarea = document.getElementById('orientation-motif');
        
        if (dateInput && payload.date) dateInput.value = payload.date;
        if (destSelect && payload.destinataire) {
          destSelect.value = String(payload.destinataire)
            .replace(/confrère/g, 'confrere')
            .replace(/consœur/g, 'consoeur');
        }
        if (specialtySelect && payload.specialty) {
          for (let opt of specialtySelect.options) {
            if (opt.value === payload.specialty || opt.text === payload.specialty) {
              specialtySelect.value = opt.value;
              break;
            }
          }
        }
        if (antecedentsTextarea && payload.antecedents) antecedentsTextarea.value = payload.antecedents;
        if (symptomsTextarea && payload.symptoms) symptomsTextarea.value = payload.symptoms;
        if (motifTextarea && payload.motif) motifTextarea.value = payload.motif;
        if (typeof renderOrientationPreview === 'function') {
          renderOrientationPreview();
        }
        
        // Store document ID for potential update
        const hiddenId = document.createElement('input');
        hiddenId.type = 'hidden';
        hiddenId.id = 'orientation-edit-id';
        hiddenId.value = documentId;
        const existingHidden = document.getElementById('orientation-edit-id');
        if (existingHidden) existingHidden.remove();
        const modal = document.getElementById('modal-orientation');
        if (modal) modal.querySelector('.modal-body')?.appendChild(hiddenId);
      }, 200);
    }
  } catch (error) {
    console.error('Error viewing orientation:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

// Make orientation functions globally available
window.loadPatientFactures = loadPatientFactures;
window.openPatientFactureModal = openPatientFactureModal;
window.openPatientLevelFactureModal = openPatientLevelFactureModal;
window.editPatientFacture = editPatientFacture;
window.printPatientFacture = printPatientFacture;
window.loadPatientRapports = loadPatientRapports;
window.openPatientRapportModal = openPatientRapportModal;
window.openPatientLevelRapportModal = openPatientLevelRapportModal;
window.editPatientRapport = editPatientRapport;
window.viewPatientRapport = viewPatientRapport;
window.printPatientRapport = printPatientRapport;
window.deletePatientDocument = deletePatientDocument;
window.loadPatientOrientations = loadPatientOrientations;
window.reprintOrientation = reprintOrientation;
window.deleteOrientation = deleteOrientation;
window.viewOrientation = viewOrientation;

const PATIENT_DOCUMENT_PAGE_SIZES = {
  factures: 5,
  rapports: 5,
  bonpour: 5,
  orientations: 5,
  nasofibroscopies: 5,
  echographies: 5,
  audiogrammes: 5
};
const patientDocumentPagination = {
  factures: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.factures, total: 0, totalPages: 1 },
  rapports: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.rapports, total: 0, totalPages: 1 },
  bonpour: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.bonpour, total: 0, totalPages: 1 },
  orientations: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.orientations, total: 0, totalPages: 1 },
  nasofibroscopies: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.nasofibroscopies, total: 0, totalPages: 1 },
  echographies: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.echographies, total: 0, totalPages: 1 },
  audiogrammes: { page: 1, pageSize: PATIENT_DOCUMENT_PAGE_SIZES.audiogrammes, total: 0, totalPages: 1 }
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
  const currentState = patientDocumentPagination[sectionKey] || { page: 1, pageSize: 5, total: 0, totalPages: 1 };
  if (!patientDocumentPagination[sectionKey]) {
    patientDocumentPagination[sectionKey] = currentState;
  }

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
  const pagination = patientDocumentPagination[sectionKey] || { page: 1, pageSize: 5 };
  const filters = getPatientDocumentFilters();
  const result = await window.api.document.listByPatient({
    patientId,
    documentType,
    page: Number(page || pagination.page || 1),
    pageSize: pagination.pageSize || 5,
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
  if (sectionKey === 'nasofibroscopies') await loadPatientNasofibroscopies(currentPatientId, { page: nextPage });
  if (sectionKey === 'echographies') await loadPatientEchographies(currentPatientId, { page: nextPage });
  if (sectionKey === 'audiogrammes') await loadPatientAudiogrammes(currentPatientId, { page: nextPage });
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

  const hasExistingContent = tbody.hasChildNodes() && tbody.innerHTML.trim() !== '' && !tbody.innerHTML.includes('Chargement...');
  if (!hasExistingContent) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Chargement...</td></tr>';
  }
  
  try {
    const factures = await fetchPatientDocumentPage(patientId, 'factures', 'invoice', options.page);

    if (!factures.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                  <line x1="20" y1="22" x2="44" y2="22"/>
                  <line x1="20" y1="30" x2="44" y2="30"/>
                  <line x1="20" y1="38" x2="32" y2="38"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucune facture émise</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Générez une facture ou note d'honoraires pour les soins de ce patient.</div>
              <button type="button" class="btn btn-primary btn-small" onclick="openPatientFactureModal()" style="display: inline-flex; align-items: center; gap: 5px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouvelle Facture
              </button>
            </div>
          </td>
        </tr>
      `;
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
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td><span class="ant-tag ant-tag-success" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f; font-weight: 600; font-size: 13px;">${escapeHTML(montant)}</span></td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="printPatientFacture('${f.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="editPatientFacture('${f.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="deletePatientDocument('${f.id}', 'facture')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
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
    await generateInvoiceFromPatientDocument(doc.patientId, payload, {
      onEdit: () => editPatientFacture(documentId)
    });
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

// ========== RAPPORTS (PATIENT-LEVEL & MODULE ORL) ==========

function deleteORLReportFromHistory(reportId, patientId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce compte-rendu ORL ?')) return;
  try {
    const targetPatientId = patientId || currentPatientId;
    const raw = localStorage.getItem(`orl_history_${targetPatientId}`);
    if (raw) {
      const list = JSON.parse(raw);
      const filtered = list.filter(item => item.id !== reportId);
      localStorage.setItem(`orl_history_${targetPatientId}`, JSON.stringify(filtered));
      showNotification('✅ Compte-rendu ORL supprimé', 'success');
      loadPatientRapports(targetPatientId);
    }
  } catch (err) {
    console.error('Error deleting ORL report:', err);
    showNotification('Erreur de suppression', 'error');
  }
}
if (typeof window !== 'undefined') {
  window.deleteORLReportFromHistory = deleteORLReportFromHistory;
}

async function loadPatientRapports(patientId, options = {}) {
  const tbody = document.getElementById('details-rapports-tbody');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Sélectionnez un patient</td></tr>';
    return;
  }

  const hasExistingContent = tbody.hasChildNodes() && tbody.innerHTML.trim() !== '' && !tbody.innerHTML.includes('Chargement...');
  if (!hasExistingContent) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center empty-row">Chargement...</td></tr>';
  }
  
  try {
    const generalRapports = await fetchPatientDocumentPage(patientId, 'rapports', 'rapport', options.page);
    
    // Charger les comptes-rendus du Module ORL pour ce patient
    let orlReports = [];
    try {
      const raw = localStorage.getItem(`orl_history_${patientId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          orlReports = parsed.map(item => ({
            id: item.id,
            isORL: true,
            createdAt: item.savedAt || item.date || new Date().toISOString(),
            title: item.data?.reportTitle || item.motif || item.diagnosis || 'Compte-rendu ORL',
            diagnosis: item.diagnosis || '',
            motif: item.motif || ''
          }));
        }
      }
    } catch (e) {
      console.warn('Could not read ORL history for patient rapports:', e);
    }

    const allRapports = [...orlReports, ...generalRapports].sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    if (!allRapports.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                  <line x1="20" y1="22" x2="44" y2="22"/>
                  <line x1="20" y1="30" x2="44" y2="30"/>
                  <line x1="20" y1="38" x2="34" y2="38"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucun compte-rendu ou rapport enregistré</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Créez un compte-rendu ORL ou un rapport médical pour ce patient.</div>
              <button type="button" class="btn btn-primary" onclick="openPatientRapportModal()" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; background: #0d9488; border-color: #0d9488;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouveau Compte-Rendu / Rapport
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = allRapports.map(r => {
      const date = r.updatedAt || r.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      const title = r.title || 'Compte-rendu ORL';
      const isORL = Boolean(r.isORL);
      const badgeHtml = isORL 
        ? '<span class="ant-tag" style="background: #e6fffb; color: #08979c; border-color: #87e8de; font-weight: 700; font-size: 11.5px; margin-right: 6px;">ORL</span>' 
        : '<span class="ant-tag" style="background: #f0fdf4; color: #166534; border-color: #bbf7d0; font-weight: 700; font-size: 11.5px; margin-right: 6px;">Rapport</span>';
      
      const printAction = isORL 
        ? `openORLReportFromTimeline('${r.id}', '${patientId}')`
        : `printPatientRapport('${r.id}')`;
      const editAction = isORL 
        ? `openORLReportFromTimeline('${r.id}', '${patientId}')`
        : `editPatientRapport('${r.id}')`;
      const deleteAction = isORL 
        ? `deleteORLReportFromHistory('${r.id}', '${patientId}')`
        : `deletePatientDocument('${r.id}', 'rapport')`;

      return `
        <tr>
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${badgeHtml}
              <span style="font-weight: 600; color: #1e293b;">${escapeHTML(title)}</span>
            </div>
          </td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="${printAction}" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="${editAction}" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="${deleteAction}" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
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
  const patientId = currentPatientId || window.currentPatientId;
  if (!patientId) {
    showNotification('Sélectionnez un patient', 'warning');
    return;
  }
  
  if (typeof openORLNewReportFromPatientDetails === 'function') {
    openORLNewReportFromPatientDetails();
    return;
  }

  openPatientLevelRapportModal(patientId);
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
    
    await generateReportFromPatientDocument(doc.patientId, payload, {
      onEdit: () => editPatientRapport(documentId)
    });
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
      printPatientRapport(documentId);
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

  const hasExistingContent = tbody.hasChildNodes() && tbody.innerHTML.trim() !== '' && !tbody.innerHTML.includes('Chargement...');
  if (!hasExistingContent) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Chargement...</td></tr>';
  }
  if (emptyState) emptyState.style.display = 'none';

  try {
    const bonpours = await fetchPatientDocumentPage(patientId, 'bonpour', 'bonpour', options.page);

    if (!bonpours.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                  <line x1="20" y1="22" x2="44" y2="22"/>
                  <line x1="20" y1="30" x2="44" y2="30"/>
                  <line x1="20" y1="38" x2="34" y2="38"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucun faire svp enregistré</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Créez une demande d'examens ou de soins pour ce patient.</div>
              <button type="button" class="btn btn-primary btn-small" onclick="openBonPourModal(currentPatientId)" style="background: #8b5cf6; border-color: #8b5cf6; display: inline-flex; align-items: center; gap: 5px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouveau Faire Svp
              </button>
            </div>
          </td>
        </tr>
      `;
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const rowsHtml = bonpours.map(bp => {
      const payload = parseDocumentPayload(bp.payload);
      const date = payload.date || bp.updatedAt || bp.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      const type = payload.type || bp.title || 'Demande médicale';
      const examCount = payload.examCount || '-';
      return `
        <tr>
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td><span style="font-weight: 600; color: #1e293b;">${escapeHTML(type)}</span></td>
          <td><span class="ant-tag ant-tag-processing" style="background: #f3e8ff; color: #7c3aed; border-color: #d8b4fe; font-weight: 600; font-size: 12.5px;">${escapeHTML(`${examCount} examen(s)`)}</span></td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="reprintBonPour('${bp.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="viewBonPour('${bp.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="deleteBonPour('${bp.id}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
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
    
    // Format the details as a 3-column grid on a single page
    const details = payload.details || '';
    const indication = payload.indication || '';
    const notes = payload.notes || '';
    const detailsLines = details.split('\n').filter(line => line.trim());

    let detailsHtml = '<div class="bonpour-exam-list" style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:4px 10px; margin-bottom: 6px;">';
    detailsLines.forEach(line => {
      const cleanLine = line.replace(/^[-•]\s*/, '').trim();
      detailsHtml += `<div class="bonpour-exam-item" style="font-size: 9.8pt; padding: 1.5px 0; line-height: 1.35; color: #000000; break-inside: avoid; word-break: break-word;">- ${escapeHTML(cleanLine)}</div>`;
    });
    detailsHtml += '</div>';

    const pageContent = `
      <div class="content-box bon-pour-shell">
        <style>
          .bonpour-section-header { font-size: 10pt; font-weight: 750; color: #0284c7; text-transform: uppercase; margin: 6px 0 3px 0; }
          .bonpour-body-text { font-size: 9.8pt; line-height: 1.4; color: #000000; }
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

    if (typeof sharedPrintScope !== 'undefined' && sharedPrintScope.openA5PrintDocument) {
      const docTitle = typeof resolveBonPourDocumentTitle === 'function' ? resolveBonPourDocumentTitle() : 'Demande de Bilan';
      await sharedPrintScope.openA5PrintDocument({
        title: docTitle,
        subtitle: payload.type || 'Prescription d\'actes',
        dateLabel: payload.date ? new Date(payload.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
        patient: patient,
        documentType: 'bonpour',
        pages: [pageContent],
        onEdit: () => viewBonPour(documentId)
      });
    }

    showNotification('Bon pour prêt pour impression', 'success');
  } catch (error) {
    console.error('Error reprinting bon pour:', error);
    showNotification('Erreur de réimpression', 'error');
  }
}

async function deleteBonPour(documentId) {
  if (!confirm('Supprimer ce bon pour / faire svp ?')) return;
  
  try {
    const result = await window.api.document.delete(documentId);
    if (result.success) {
      showNotification('Bon pour supprimé', 'success');
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
          typeSelect.value = payload.type;
          for (let opt of typeSelect.options) {
            if (opt.value === payload.type || opt.text === payload.type) {
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

  const hasExistingContent = tbody.hasChildNodes() && tbody.innerHTML.trim() !== '' && !tbody.innerHTML.includes('Chargement...');
  if (!hasExistingContent) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center empty-row">Chargement...</td></tr>';
  }
  if (emptyState) emptyState.style.display = 'none';

  try {
    const orientations = await fetchPatientDocumentPage(patientId, 'orientations', 'orientation', options.page);

    if (!orientations.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#94a3b8" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f8fafc"/>
                  <path d="M22 24l10 8 10-8" stroke="#1677ff" stroke-width="1.5"/>
                  <line x1="20" y1="40" x2="44" y2="40"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucune lettre d'orientation enregistrée</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Rédigez une lettre de recommandation ou d'orientation pour un confrère.</div>
              <button type="button" class="btn btn-primary btn-small" onclick="openOrientationModal(currentPatientId)" style="background: #059669; border-color: #059669; display: inline-flex; align-items: center; gap: 5px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouvelle Orientation
              </button>
            </div>
          </td>
        </tr>
      `;
      if (emptyState) emptyState.style.display = 'none';
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
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td><span class="ant-tag ant-tag-processing" style="background: #ecfdf5; color: #059669; border-color: #a7f3d0; font-weight: 600; font-size: 12.5px;">${escapeHTML(specialty)}</span></td>
          <td title="${escapeHTML(motif)}">${escapeHTML(motifShort)}</td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="reprintOrientation('${o.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="viewOrientation('${o.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="deleteOrientation('${o.id}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
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
        pages: [pageContent],
        onEdit: () => viewOrientation(documentId)
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

// ==========================================
// NASOFIBROSCOPIES PATIENT HISTORY
// ==========================================

async function loadPatientNasofibroscopies(patientId, options = {}) {
  const tbody = document.getElementById('details-nasofibroscopies-tbody');
  const emptyState = document.getElementById('details-nasofibroscopies-empty');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Veuillez sélectionner un patient</td></tr>';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }

  if (!options.preserveContent) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  }
  if (emptyState) emptyState.style.display = 'none';

  try {
    const list = await fetchPatientDocumentPage(patientId, 'nasofibroscopies', 'nasofibroscopie', options.page);

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#0284c7" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f0f9ff" stroke="#38bdf8"/>
                  <circle cx="32" cy="28" r="8" stroke="#0284c7" stroke-width="1.5"/>
                  <path d="M22 44c0-5 4-8 10-8s10 3 10 8" stroke="#0284c7" stroke-width="1.5"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucun examen de nasofibroscopie enregistré</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Réalisez et imprimez un compte-rendu d'exploration endoscopique ORL.</div>
              <button type="button" class="btn btn-primary btn-small" onclick="openNasofibroscopieModal(currentPatientId)" style="background: #0284c7; border-color: #0369a1; display: inline-flex; align-items: center; gap: 5px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouvelle Nasofibroscopie
              </button>
            </div>
          </td>
        </tr>
      `;
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const rowsHtml = list.map(item => {
      const payload = parseDocumentPayload(item.payload);
      const date = payload.date || item.updatedAt || item.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      
      const fossesD = payload.fossesNasalesDroite || '';
      const fossesG = payload.fossesNasalesGauche || '';
      const fossesSummary = (fossesD || fossesG) ? `${fossesD ? `D: ${fossesD}` : ''}${fossesG ? ` | G: ${fossesG}` : ''}` : 'Libres';
      const fossesShort = fossesSummary.length > 35 ? fossesSummary.substring(0, 35) + '...' : fossesSummary;

      const larynx = payload.larynx || 'Normal';
      const larynxShort = larynx.length > 35 ? larynx.substring(0, 35) + '...' : larynx;

      const conclusion = payload.conclusion || 'Examen normal';
      const conclusionShort = conclusion.length > 40 ? conclusion.substring(0, 40) + '...' : conclusion;

      return `
        <tr>
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td title="${escapeHTML(fossesSummary)}"><span class="ant-tag" style="background: #f0f9ff; color: #0369a1; border-color: #bae6fd; font-size: 12px;">${escapeHTML(fossesShort)}</span></td>
          <td title="${escapeHTML(larynx)}"><span style="color: #334155; font-size: 12.5px;">${escapeHTML(larynxShort)}</span></td>
          <td title="${escapeHTML(conclusion)}"><strong style="color: #0369a1; font-size: 12.5px;">${escapeHTML(conclusionShort)}</strong></td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="reprintNasofibroscopie('${item.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="viewNasofibroscopie('${item.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="deleteNasofibroscopie('${item.id}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('nasofibroscopies', 5);
  } catch (error) {
    console.error('Error loading nasofibroscopies:', error);
    updatePatientDocumentPagination('nasofibroscopies', null);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}

async function reprintNasofibroscopie(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult || !docResult.success || !docResult.data) {
      if (typeof showNotification === 'function') {
        showNotification('Compte-rendu de nasofibroscopie introuvable', 'error');
      }
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);

    let patient = null;
    try {
      const patientResult = await window.api.patient.getById(doc.patientId);
      if (patientResult && patientResult.success) {
        patient = patientResult.data;
      }
    } catch (e) {
      console.error('Error loading patient:', e);
    }

    const date = payload.date || doc.updatedAt || doc.createdAt;
    const dateLabel = typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(date) : date;

    if (typeof renderNasofibroscopieDocument === 'function') {
      await renderNasofibroscopieDocument({
        patient: patient || { id: doc.patientId },
        data: payload,
        dateLabel,
        documentNumber: doc.id,
        onEdit: () => openNasofibroscopieModal(doc.patientId, doc.id, payload)
      });
    }
  } catch (error) {
    console.error('Error reprinting nasofibroscopie:', error);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'impression', 'error');
    }
  }
}

async function viewNasofibroscopie(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult || !docResult.success || !docResult.data) {
      if (typeof showNotification === 'function') {
        showNotification('Document introuvable', 'error');
      }
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);

    if (typeof openNasofibroscopieModal === 'function') {
      await openNasofibroscopieModal(doc.patientId, doc.id, payload);
    }
  } catch (error) {
    console.error('Error viewing nasofibroscopie:', error);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'ouverture du document', 'error');
    }
  }
}

async function deleteNasofibroscopie(documentId) {
  if (typeof deletePatientDocument === 'function') {
    await deletePatientDocument(documentId, 'nasofibroscopie');
    if (window.currentPatientId && typeof loadPatientNasofibroscopies === 'function') {
      loadPatientNasofibroscopies(window.currentPatientId);
    }
  }
}

// ==========================================
// ÉCHOGRAPHIES CERVICALES PATIENT HISTORY
// ==========================================

async function loadPatientEchographies(patientId, options = {}) {
  const tbody = document.getElementById('details-echographies-tbody');
  const emptyState = document.getElementById('details-echographies-empty');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Veuillez sélectionner un patient</td></tr>';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }

  if (!options.preserveContent) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  }
  if (emptyState) emptyState.style.display = 'none';

  try {
    const list = await fetchPatientDocumentPage(patientId, 'echographies', 'echographie_cervicale', options.page);

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#0284c7" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f0f9ff" stroke="#38bdf8"/>
                  <circle cx="32" cy="28" r="8" stroke="#0284c7" stroke-width="1.5"/>
                  <path d="M22 44c0-5 4-8 10-8s10 3 10 8" stroke="#0284c7" stroke-width="1.5"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucun compte-rendu d'échographie cervicale enregistré</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Réalisez et imprimez un compte-rendu d'exploration échographique cervicale.</div>
              <button type="button" class="btn btn-primary btn-small" onclick="openEchographieCervicaleModal(currentPatientId)" style="background: #0284c7; border-color: #0369a1; display: inline-flex; align-items: center; gap: 5px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouvelle Échographie
              </button>
            </div>
          </td>
        </tr>
      `;
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const rowsHtml = list.map(item => {
      const payload = parseDocumentPayload(item.payload);
      const date = payload.date || item.updatedAt || item.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      
      const ld = payload.lobeDroit || '';
      const lg = payload.lobeGauche || '';
      const thyroideSummary = (ld || lg) ? `D: ${ld || '-'}${lg ? ` | G: ${lg}` : ''}` : (payload.isthme ? `Isthme: ${payload.isthme}` : 'Aspect normal');
      const thyroideShort = thyroideSummary.length > 35 ? thyroideSummary.substring(0, 35) + '...' : thyroideSummary;

      const aires = payload.airesGanglionnaires || 'Libres';
      const airesShort = aires.length > 35 ? aires.substring(0, 35) + '...' : aires;

      const conclusion = payload.conclusion || 'Examen sans anomalie décelable';
      const conclusionShort = conclusion.length > 40 ? conclusion.substring(0, 40) + '...' : conclusion;

      return `
        <tr>
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td title="${escapeHTML(thyroideSummary)}"><span class="ant-tag" style="background: #f0f9ff; color: #0369a1; border-color: #bae6fd; font-size: 12px;">${escapeHTML(thyroideShort)}</span></td>
          <td title="${escapeHTML(aires)}"><span style="color: #334155; font-size: 12.5px;">${escapeHTML(airesShort)}</span></td>
          <td title="${escapeHTML(conclusion)}"><strong style="color: #0369a1; font-size: 12.5px;">${escapeHTML(conclusionShort)}</strong></td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="reprintEchographieCervicale('${item.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="viewEchographieCervicale('${item.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="deleteEchographieCervicale('${item.id}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('echographies', 5);
  } catch (error) {
    console.error('Error loading echographies:', error);
    updatePatientDocumentPagination('echographies', null);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}

async function reprintEchographieCervicale(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult || !docResult.success || !docResult.data) {
      if (typeof showNotification === 'function') {
        showNotification('Compte-rendu d\'échographie cervicale introuvable', 'error');
      }
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);

    let patient = null;
    try {
      const patientResult = await window.api.patient.getById(doc.patientId);
      if (patientResult && patientResult.success) {
        patient = patientResult.data;
      }
    } catch (e) {
      console.error('Error loading patient:', e);
    }

    const date = payload.date || doc.updatedAt || doc.createdAt;
    const dateLabel = typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(date) : date;

    if (typeof renderEchographieCervicaleDocument === 'function') {
      await renderEchographieCervicaleDocument({
        patient: patient || { id: doc.patientId },
        data: payload,
        dateLabel,
        documentNumber: doc.id,
        onEdit: () => openEchographieCervicaleModal(doc.patientId, doc.id, payload)
      });
    }
  } catch (error) {
    console.error('Error reprinting echographie cervicale:', error);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'impression', 'error');
    }
  }
}

async function viewEchographieCervicale(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult || !docResult.success || !docResult.data) {
      if (typeof showNotification === 'function') {
        showNotification('Document introuvable', 'error');
      }
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);

    if (typeof openEchographieCervicaleModal === 'function') {
      await openEchographieCervicaleModal(doc.patientId, doc.id, payload);
    }
  } catch (error) {
    console.error('Error viewing echographie cervicale:', error);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'ouverture du document', 'error');
    }
  }
}

async function deleteEchographieCervicale(documentId) {
  if (typeof deletePatientDocument === 'function') {
    await deletePatientDocument(documentId, 'echographie_cervicale');
    if (window.currentPatientId && typeof loadPatientEchographies === 'function') {
      loadPatientEchographies(window.currentPatientId);
    }
  }
}

// ==========================================
// AUDIOGRAMMES PATIENT HISTORY
// ==========================================

async function loadPatientAudiogrammes(patientId, options = {}) {
  const tbody = document.getElementById('details-audiogrammes-tbody');
  const emptyState = document.getElementById('details-audiogrammes-empty');
  if (!tbody) return;

  if (!patientId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Veuillez sélectionner un patient</td></tr>';
    if (emptyState) emptyState.style.display = 'none';
    return;
  }

  if (!options.preserveContent) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Chargement...</td></tr>';
  }
  if (emptyState) emptyState.style.display = 'none';

  try {
    const list = await fetchPatientDocumentPage(patientId, 'audiogrammes', 'audiogramme', options.page);

    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 32px 16px;">
            <div class="ant-empty" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <div class="ant-empty-image" style="margin-bottom: 12px;">
                <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#0284c7" stroke-width="1.5">
                  <rect x="12" y="10" width="40" height="44" rx="4" fill="#f0f9ff" stroke="#38bdf8"/>
                  <path d="M22 36v-8a10 10 0 0 1 20 0v8" stroke="#0284c7" stroke-width="2"/>
                  <rect x="18" y="32" width="6" height="10" rx="2" fill="#0284c7"/>
                  <rect x="40" y="32" width="6" height="10" rx="2" fill="#0284c7"/>
                </svg>
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">Aucun rapport audiologique enregistré</div>
              <div style="font-size: 13px; color: #64748b; margin-bottom: 14px;">Réalisez et imprimez un rapport d'audiométrie tonale en format A5.</div>
              <button type="button" class="btn btn-primary btn-small" onclick="openAudiogrammeModal(currentPatientId)" style="background: #0284c7; border-color: #0369a1; display: inline-flex; align-items: center; gap: 5px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nouveau Rapport Audiologique
              </button>
            </div>
          </td>
        </tr>
      `;
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const rowsHtml = list.map(item => {
      const payload = parseDocumentPayload(item.payload);
      const date = payload.date || item.updatedAt || item.createdAt;
      const dateLabel = date ? formatDateToDDMMYYYY(date) : '-';
      
      const odPta = payload.ptaDroite ? `PTA: ${payload.ptaDroite} dB` : 'OD';
      const ogPta = payload.ptaGauche ? `PTA: ${payload.ptaGauche} dB` : 'OG';

      const observation = payload.observation || payload.conclusion || 'Audiométrie normale';
      const observationShort = observation.length > 45 ? observation.substring(0, 45) + '...' : observation;

      return `
        <tr>
          <td><strong style="color: #0f172a;">${escapeHTML(dateLabel)}</strong></td>
          <td><span class="ant-tag" style="background: #fef2f2; color: #dc2626; border-color: #fca5a5; font-size: 12px; font-weight: 600;">${escapeHTML(odPta)}</span></td>
          <td><span class="ant-tag" style="background: #eff6ff; color: #2563eb; border-color: #93c5fd; font-size: 12px; font-weight: 600;">${escapeHTML(ogPta)}</span></td>
          <td title="${escapeHTML(observation)}"><strong style="color: #0369a1; font-size: 12.5px;">${escapeHTML(observationShort)}</strong></td>
          <td>
            <div class="table-actions" style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
              <button class="btn btn-secondary" title="Aperçu et Imprimer" onclick="reprintAudiogramme('${item.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
              <button class="btn btn-secondary" title="Modifier" onclick="viewAudiogramme('${item.id}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 6px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>Modifier</span>
              </button>
              <button type="button" class="btn" title="Supprimer" onclick="deleteAudiogramme('${item.id}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml + buildPatientDocumentPaginationRow('audiogrammes', 5);
  } catch (error) {
    console.error('Error loading audiogrammes:', error);
    updatePatientDocumentPagination('audiogrammes', null);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center empty-row">Erreur de chargement</td></tr>';
  }
}

async function reprintAudiogramme(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult || !docResult.success || !docResult.data) {
      if (typeof showNotification === 'function') {
        showNotification('Compte-rendu d\'audiogramme introuvable', 'error');
      }
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);

    let patient = null;
    try {
      const patientResult = await window.api.patient.getById(doc.patientId);
      if (patientResult && patientResult.success) {
        patient = patientResult.data;
      }
    } catch (e) {
      console.error('Error loading patient:', e);
    }

    const date = payload.date || doc.updatedAt || doc.createdAt;
    const dateLabel = typeof formatPrintingDocumentDateLabel === 'function' ? formatPrintingDocumentDateLabel(date) : date;

    if (typeof renderAudiogrammeDocument === 'function') {
      await renderAudiogrammeDocument({
        patient: patient || { id: doc.patientId },
        data: payload,
        dateLabel,
        documentNumber: doc.id,
        onEdit: () => openAudiogrammeModal(doc.patientId, doc.id, payload)
      });
    }
  } catch (error) {
    console.error('Error reprinting audiogramme:', error);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'impression', 'error');
    }
  }
}

async function viewAudiogramme(documentId) {
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult || !docResult.success || !docResult.data) {
      if (typeof showNotification === 'function') {
        showNotification('Document introuvable', 'error');
      }
      return;
    }
    const doc = docResult.data;
    const payload = parseDocumentPayload(doc.payload);

    if (typeof openAudiogrammeModal === 'function') {
      await openAudiogrammeModal(doc.patientId, doc.id, payload);
    }
  } catch (error) {
    console.error('Error viewing audiogramme:', error);
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'ouverture du document', 'error');
    }
  }
}

async function deleteAudiogramme(documentId) {
  if (typeof deletePatientDocument === 'function') {
    await deletePatientDocument(documentId, 'audiogramme');
    if (window.currentPatientId && typeof loadPatientAudiogrammes === 'function') {
      loadPatientAudiogrammes(window.currentPatientId);
    }
  }
}

// Make orientation, nasofibroscopie, echographie and audiogramme functions globally available
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
window.loadPatientNasofibroscopies = loadPatientNasofibroscopies;
window.reprintNasofibroscopie = reprintNasofibroscopie;
window.viewNasofibroscopie = viewNasofibroscopie;
window.deleteNasofibroscopie = deleteNasofibroscopie;
window.loadPatientEchographies = loadPatientEchographies;
window.reprintEchographieCervicale = reprintEchographieCervicale;
window.viewEchographieCervicale = viewEchographieCervicale;
window.deleteEchographieCervicale = deleteEchographieCervicale;
window.loadPatientAudiogrammes = loadPatientAudiogrammes;
window.reprintAudiogramme = reprintAudiogramme;
window.viewAudiogramme = viewAudiogramme;
window.deleteAudiogramme = deleteAudiogramme;



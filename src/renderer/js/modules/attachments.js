// ========== ATTACHMENTS (PIECES JOINTES) ==========

const ATTACHMENT_EXAM_FAMILIES = [
  { value: 'Document', label: 'Document', icon: '📎' },
  { value: 'Radiographie', label: 'Radiographie', icon: '🩻' },
  { value: 'IRM', label: 'IRM', icon: '🧲' },
  { value: 'Scanner CT', label: 'Scanner CT', icon: '🖥️' },
  { value: 'Échographie', label: 'Échographie', icon: '🔬' },
  { value: 'Mammographie', label: 'Mammographie', icon: '🎗️' }
];

const ATTACHMENTS_PAGE_SIZE = 5;
let attachmentsPagination = {
  page: 1,
  pageSize: ATTACHMENTS_PAGE_SIZE,
  total: 0,
  totalPages: 1
};
let attachmentsPatientId = null;

function normalizeAttachmentExamFamily(value = '') {
  const raw = String(value || '').trim();
  const match = ATTACHMENT_EXAM_FAMILIES.find((family) => family.value.toLowerCase() === raw.toLowerCase());
  return match ? match.value : 'Document';
}

function getAttachmentExamFamilyMeta(value = '') {
  const normalized = normalizeAttachmentExamFamily(value);
  return ATTACHMENT_EXAM_FAMILIES.find((family) => family.value === normalized) || ATTACHMENT_EXAM_FAMILIES[0];
}

function formatAttachmentExamFamily(value = '') {
  return getAttachmentExamFamilyMeta(value).label;
}

function getSelectedAttachmentExamFamily(selectId) {
  const select = document.getElementById(selectId);
  return normalizeAttachmentExamFamily(select?.value || 'Document');
}

function buildAttachmentFamilyBadge(value = '') {
  const meta = getAttachmentExamFamilyMeta(value);
  return `<span class="attachment-family-chip attachment-family-${meta.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${meta.icon} ${escapeHTML(meta.label)}</span>`;
}

function renderAttachmentFamilySummary(attachments = []) {
  const container = document.getElementById('details-attachments-family-summary');
  if (!container) return;

  const counts = new Map();
  attachments.forEach((attachment) => {
    const family = normalizeAttachmentExamFamily(attachment.examFamily);
    counts.set(family, (counts.get(family) || 0) + 1);
  });

  if (!attachments.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = ATTACHMENT_EXAM_FAMILIES
    .filter((family) => counts.get(family.value))
    .map((family) => `
      <div class="attachment-family-summary-card">
        <span class="attachment-family-summary-icon">${family.icon}</span>
        <div>
          <strong>${escapeHTML(family.label)}</strong>
          <span>${counts.get(family.value)} fichier(s)</span>
        </div>
      </div>
    `)
    .join('');
}

function isImageAttachmentFile(fileName = '') {
  return /\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/i.test(String(fileName || '').trim());
}

function buildAttachmentPreviewUrl(filePath = '') {
  const normalizedPath = String(filePath || '').trim().replace(/\\/g, '/');
  if (!normalizedPath) return '';

  if (normalizedPath.startsWith('data:') || normalizedPath.startsWith('file://')) {
    return normalizedPath;
  }

  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${encodeURI(normalizedPath)}`;
  }

  const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `file://${encodeURI(absolutePath)}`;
}

function buildAttachmentVisual(filePath, fileName) {
  const safeName = escapeHTML(fileName || 'Document');

  if (isImageAttachmentFile(fileName) && filePath) {
    const previewUrl = escapeHTML(buildAttachmentPreviewUrl(filePath));
    return `
      <div class="attachment-card-media">
        <img src="${previewUrl}" alt="${safeName}" class="attachment-card-thumb" loading="lazy">
      </div>
    `;
  }

  return `
    <div class="attachment-card-media attachment-card-icon">
      <span>${getFileIcon(fileName)}</span>
    </div>
  `;
}

function updateAttachmentsPaginationMeta(totalItems = 0) {
  const safeTotal = Math.max(0, Number(totalItems || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / ATTACHMENTS_PAGE_SIZE));
  const currentPage = Math.min(
    Math.max(1, Number(attachmentsPagination.page || 1)),
    totalPages
  );

  attachmentsPagination = {
    page: currentPage,
    pageSize: ATTACHMENTS_PAGE_SIZE,
    total: safeTotal,
    totalPages
  };
}

function renderAttachmentsPagination() {
  const container = document.getElementById('attachments-pagination');
  if (!container) return;

  const total = Number(attachmentsPagination.total || 0);
  const totalPages = Math.max(1, Number(attachmentsPagination.totalPages || 1));
  const currentPage = Math.max(1, Number(attachmentsPagination.page || 1));
  const pageSize = Number(attachmentsPagination.pageSize || ATTACHMENTS_PAGE_SIZE);

  if (total <= pageSize || totalPages <= 1) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const start = total > 0 ? ((currentPage - 1) * pageSize) + 1 : 0;
  const end = total > 0 ? Math.min(currentPage * pageSize, total) : 0;

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="patients-pagination-info">Affichage ${start}-${end} sur ${total} éléments</div>
    <div class="patients-pagination-actions pagination-controls">
      <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${currentPage <= 1 ? 'disabled' : ''} onclick="changeAttachmentsPage(-1)">‹</button>
      <span class="patients-pagination-info">${currentPage}/${totalPages}</span>
      <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changeAttachmentsPage(1)">›</button>
    </div>
  `;
}

async function changeAttachmentsPage(direction) {
  if (!currentPatientId) return;
  const nextPage = Math.min(
    Math.max(1, attachmentsPagination.page + direction),
    Math.max(1, attachmentsPagination.totalPages)
  );
  if (nextPage === attachmentsPagination.page) return;
  await loadPatientAttachments(currentPatientId, { page: nextPage });
}

async function loadPatientAttachments(patientId, options = {}) {
  const grid = document.getElementById('details-attachments-grid');
  const emptyState = document.getElementById('details-attachments-empty');
  const countBadge = document.getElementById('attachments-count-badge');

  if (!grid || !emptyState) return;

  if (!patientId) {
    attachmentsPatientId = null;
    attachmentsPagination = { page: 1, pageSize: ATTACHMENTS_PAGE_SIZE, total: 0, totalPages: 1 };
    grid.innerHTML = '';
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    if (countBadge) countBadge.textContent = '0 fichier(s)';
    renderAttachmentFamilySummary([]);
    renderAttachmentsPagination();
    return;
  }

  if (attachmentsPatientId !== patientId) {
    attachmentsPatientId = patientId;
    attachmentsPagination = { page: 1, pageSize: ATTACHMENTS_PAGE_SIZE, total: 0, totalPages: 1 };
  }

  if (!grid.children.length) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">Chargement...</div>';
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
  }

  try {
    attachmentsPagination.page = Number(options.page || attachmentsPagination.page || 1);
    const [result, directAttachmentsResult] = await Promise.all([
      window.api.consultation.getByPatient({
        patientId,
        attachmentsOnly: true,
        paginated: false
      }),
      window.api.patientAttachment?.getByPatient
        ? window.api.patientAttachment.getByPatient({
            patientId,
            paginated: false
          })
        : Promise.resolve({ success: true, data: [] })
    ]);

    const consultations = result.success && Array.isArray(result.data) ? result.data : [];
    const directAttachments = directAttachmentsResult.success && Array.isArray(directAttachmentsResult.data)
      ? directAttachmentsResult.data
      : [];

    const allAttachments = [];

    consultations.forEach((consultation) => {
      if (!consultation.attachments) return;

      let attachmentsList = [];
      try {
        attachmentsList = typeof consultation.attachments === 'string'
          ? JSON.parse(consultation.attachments)
          : consultation.attachments;
      } catch (error) {
        attachmentsList = [];
      }

      if (Array.isArray(attachmentsList) && attachmentsList.length > 0) {
        attachmentsList.forEach((att, attachmentIndex) => {
          allAttachments.push({
            ...att,
            attachmentIndex,
            attachmentOrigin: 'consultation',
            consultationId: consultation.id,
            consultationDate: consultation.consultationDate || consultation.date || consultation.createdAt,
            consultationReason: consultation.reason || consultation.consultationType || 'Consultation'
          });
        });
      }
    });

    directAttachments.forEach((attachment) => {
      allAttachments.push({
        id: attachment.id,
        name: attachment.fileName,
        originalName: attachment.fileName,
        path: attachment.filePath,
        type: attachment.mimeType,
        size: attachment.fileSize,
        consultationId: attachment.consultationId,
        consultationDate: attachment.createdAt,
        consultationReason: attachment.sourceLabel || 'Document du dossier patient',
        attachmentOrigin: 'patient-record',
        sourceType: attachment.sourceType || 'import',
        examFamily: attachment.examFamily || 'Document'
      });
    });

    updateAttachmentsPaginationMeta(allAttachments.length);

    if (countBadge) {
      countBadge.textContent = `${allAttachments.length} fichier(s) chargés`;
    }

    if (allAttachments.length === 0) {
      grid.innerHTML = '';
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      renderAttachmentFamilySummary([]);
      renderAttachmentsPagination();
      return;
    }

    allAttachments.sort((a, b) => {
      const dateA = new Date(a.consultationDate || 0);
      const dateB = new Date(b.consultationDate || 0);
      return dateB - dateA;
    });

    renderAttachmentFamilySummary(allAttachments);
    const startIndex = (attachmentsPagination.page - 1) * ATTACHMENTS_PAGE_SIZE;
    const pageAttachments = allAttachments.slice(startIndex, startIndex + ATTACHMENTS_PAGE_SIZE);

    const cardsHtml = pageAttachments.map((att, index) => {
      const fileName = att.name || att.originalName || 'Fichier sans nom';
      const fileSize = att.size ? formatFileSize(att.size) : '-';
      const filePath = att.path || '';
      const encodedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeName = fileName.replace(/'/g, "\\'");
      const consultationDate = att.consultationDate ? formatDateToDDMMYYYY(att.consultationDate) : '-';
      const consultationReason = att.consultationReason || 'Consultation';
      const familyBadge = buildAttachmentFamilyBadge(att.examFamily);
      const deleteAction = att.attachmentOrigin === 'patient-record'
        ? `deletePatientRecordAttachment('${att.id}')`
        : `removeConsultationAttachment('${att.consultationId}', ${att.attachmentIndex}, 'attachments')`;

      return `
        <div class="attachment-card attachment-card-interactive" onclick="openAttachment('${encodedPath}', '${safeName}', ${index})" role="button" tabindex="0" onkeydown="if(event.key==='Enter' || event.key===' '){event.preventDefault(); openAttachment('${encodedPath}', '${safeName}', ${index});}">
          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
            ${buildAttachmentVisual(filePath, fileName)}
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(fileName)}">${escapeHTML(fileName)}</div>
              <div style="font-size: 12px; color: #64748b; margin-bottom: 2px;">${fileSize}</div>
              <div style="font-size: 11px; color: #94a3b8;">
                <span style="color: #3b82f6;">📅 ${consultationDate}</span> • ${escapeHTML(consultationReason)}
              </div>
            </div>
          </div>
          <div class="attachment-card-footer">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="attachment-origin-chip">${att.attachmentOrigin === 'patient-record' ? 'Dossier patient' : 'Consultation'}</span>
              ${familyBadge}
            </div>
            <div class="attachment-card-actions">
              <button class="btn btn-tiny btn-secondary consultation-action-chip-icon" title="Aperçu" onclick="event.stopPropagation(); openAttachment('${encodedPath}', '${safeName}', ${index})">👁️</button>
              <button class="btn btn-tiny btn-info" onclick="event.stopPropagation(); downloadAttachment('${encodedPath}', '${safeName}', ${index})">Télécharger</button>
              <button class="btn btn-tiny btn-primary" onclick="event.stopPropagation(); printAttachment('${encodedPath}', '${safeName}', ${index})">Imprimer</button>
              <button class="btn btn-tiny btn-danger" onclick="event.stopPropagation(); ${deleteAction}">Supprimer</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.innerHTML = cardsHtml;
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    renderAttachmentsPagination();
  } catch (error) {
    console.error('Error loading attachments:', error);
    updateAttachmentsPaginationMeta(0);
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">Erreur de chargement</div>';
    if (countBadge) countBadge.textContent = '0 fichier(s)';
    renderAttachmentFamilySummary([]);
    renderAttachmentsPagination();
  }
}

async function loadAttachmentScannerStatus() {
  const scannerStatus = document.getElementById('attachments-scanner-status');
  if (!scannerStatus) return;

  try {
    const result = await window.api.file.listScanners();
    const scanners = result?.success && Array.isArray(result.data) ? result.data : [];
    if (!scanners.length) {
      scannerStatus.textContent = 'Scanner USB: aucun scanner détecté';
      return;
    }

    scannerStatus.textContent = `Scanner USB: ${scanners.map((scanner) => scanner.label || scanner.id).join(' • ')}`;
  } catch (error) {
    console.error('Error loading scanner status:', error);
    scannerStatus.textContent = 'Scanner USB: indisponible';
  }
}

async function deletePatientRecordAttachment(attachmentId) {
  if (!attachmentId) return;
  if (!confirm('Supprimer ce document du dossier patient ?')) return;

  try {
    const result = await window.api.patientAttachment.delete(attachmentId);
    if (!result?.success) {
      showNotification(`❌ ${result?.error || 'Suppression impossible'}`, 'error');
      return;
    }

    showNotification('Document supprimé du dossier patient', 'success');
    const activePatientId = typeof currentPatientId !== 'undefined'
      ? currentPatientId
      : document.getElementById('consultation-patientId')?.value;
    if (activePatientId) {
      await loadPatientAttachments(activePatientId, { page: attachmentsPagination.page });
    }
  } catch (error) {
    console.error('Error deleting patient record attachment:', error);
    showNotification('Erreur lors de la suppression du document', 'error');
  }
}

window.loadPatientAttachments = loadPatientAttachments;
window.loadAttachmentScannerStatus = loadAttachmentScannerStatus;
window.deletePatientRecordAttachment = deletePatientRecordAttachment;
window.buildAttachmentVisual = buildAttachmentVisual;
window.isImageAttachmentFile = isImageAttachmentFile;
window.normalizeAttachmentExamFamily = normalizeAttachmentExamFamily;
window.formatAttachmentExamFamily = formatAttachmentExamFamily;
window.getSelectedAttachmentExamFamily = getSelectedAttachmentExamFamily;
window.changeAttachmentsPage = changeAttachmentsPage;

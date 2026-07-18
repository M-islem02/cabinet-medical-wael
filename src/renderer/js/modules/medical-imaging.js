const IMAGING_FAMILIES = ['Radiographie', 'IRM', 'Scanner CT', 'Échographie', 'Mammographie'];

const medicalImagingState = {
  initialized: false,
  patients: [],
  records: [],
  devices: [],
  selectedPatientId: '',
  selectedFamily: 'Radiographie',
  filterFamily: 'all',
  selectedRecordId: null,
  recordsPage: 1
};
const IMAGING_RECORDS_PAGE_SIZE = 10;

function isImagingAttachment(record) {
  if (!record) return false;
  if (IMAGING_FAMILIES.includes(record.examFamily)) return true;
  const fileName = String(record.fileName || '').toLowerCase();
  return ['.dcm', '.dicom', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.pdf', '.zip'].some((ext) => fileName.endsWith(ext));
}

function getImagingPatientName(patient) {
  return `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || 'Patient';
}

function getMedicalImagingSelectedFamily() {
  return document.getElementById('imaging-family-select')?.value || 'Radiographie';
}

function setMedicalImagingDeviceStatus(message) {
  const statusEl = document.getElementById('imaging-device-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function renderMedicalImagingDeviceOptions(selectedValue = '') {
  const select = document.getElementById('imaging-device-select');
  if (!select) return;

  const options = [
    { value: '', label: 'Import manuel / dossier exporté' },
    ...medicalImagingState.devices.map((device) => ({
      value: device.id,
      label: device.label || device.id
    }))
  ];

  select.innerHTML = options.map((option) => `
    <option value="${escapeHTML(String(option.value))}">${escapeHTML(String(option.label))}</option>
  `).join('');

  if (selectedValue) {
    select.value = selectedValue;
  }
}

function getMedicalImagingPreviewMode(record) {
  const fileName = String(record?.fileName || '').toLowerCase();
  if (fileName.endsWith('.pdf')) return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.gif', '.bmp', '.webp'].some((ext) => fileName.endsWith(ext))) {
    return 'image';
  }
  if (fileName.endsWith('.dcm') || fileName.endsWith('.dicom')) return 'dicom';
  if (fileName.endsWith('.zip')) return 'zip';
  return 'other';
}

function renderMedicalImagingPatients() {
  const select = document.getElementById('imaging-patient-select');
  if (!select) return;

  const options = [
    '<option value="">Sélectionner un patient</option>',
    ...medicalImagingState.patients.map((patient) => `
      <option value="${patient.id}">${escapeHTML(getImagingPatientName(patient))}</option>
    `)
  ];

  select.innerHTML = options.join('');

  if (medicalImagingState.selectedPatientId) {
    select.value = medicalImagingState.selectedPatientId;
  } else if (typeof currentPatientId !== 'undefined' && currentPatientId) {
    select.value = currentPatientId;
    medicalImagingState.selectedPatientId = currentPatientId;
  }
}

function renderMedicalImagingPreviewPlaceholder(message) {
  const panel = document.getElementById('imaging-preview-panel');
  if (!panel) return;
  panel.innerHTML = `<div class="imaging-preview-placeholder">${escapeHTML(message)}</div>`;
}

async function renderMedicalImagingPreview(recordId) {
  const panel = document.getElementById('imaging-preview-panel');
  if (!panel) return;

  const record = medicalImagingState.records.find((item) => String(item.id) === String(recordId));
  if (!record) {
    renderMedicalImagingPreviewPlaceholder('Choisissez un examen pour afficher son aperçu.');
    return;
  }

  medicalImagingState.selectedRecordId = record.id;
  const previewMode = getMedicalImagingPreviewMode(record);
  const fileName = record.fileName || 'Examen';
  const family = record.examFamily || 'Imagerie';
  const createdLabel = record.createdAt ? new Date(record.createdAt).toLocaleDateString('fr-FR') : '-';
  const sizeLabel = typeof formatFileSize === 'function' ? formatFileSize(record.fileSize || 0) : `${record.fileSize || 0} B`;

  if (previewMode === 'image' || previewMode === 'pdf') {
    const result = await window.api.file.readAsDataURL(record.filePath);
    if (!result?.success || !result.dataURL) {
      renderMedicalImagingPreviewPlaceholder('Impossible de charger l’aperçu de cet examen.');
      return;
    }

    panel.innerHTML = `
      <div class="imaging-preview-meta">
        <div>
          <div class="imaging-preview-kicker">${escapeHTML(family)}</div>
          <h3>${escapeHTML(fileName)}</h3>
          <p>${escapeHTML(createdLabel)} · ${escapeHTML(sizeLabel)}</p>
        </div>
        <button type="button" class="btn btn-secondary" onclick="openMedicalImagingRecord('${record.id}')">Ouvrir en grand</button>
      </div>
      <div class="imaging-preview-stage">
        ${previewMode === 'image'
          ? `<img src="${result.dataURL}" alt="${escapeHTML(fileName)}" class="imaging-preview-image">`
          : `<iframe src="${result.dataURL}#toolbar=0&navpanes=0" class="imaging-preview-frame" title="${escapeHTML(fileName)}"></iframe>`
        }
      </div>
    `;
    return;
  }

  const supportText = previewMode === 'dicom'
    ? 'Le fichier DICOM est bien importé dans le dossier patient. La lecture Cornerstone avancée est préparée dans le guide technique du projet.'
    : 'Cette archive est enregistrée dans le dossier patient. Vous pouvez la télécharger ou la rattacher à une intégration Cornerstone.';

  panel.innerHTML = `
    <div class="imaging-preview-meta imaging-preview-meta-stack">
      <div class="imaging-preview-kicker">${escapeHTML(family)}</div>
      <h3>${escapeHTML(fileName)}</h3>
      <p>${escapeHTML(createdLabel)} · ${escapeHTML(sizeLabel)}</p>
      <div class="imaging-preview-note">${escapeHTML(supportText)}</div>
      <div class="imaging-preview-actions">
        <button type="button" class="btn btn-secondary" onclick="downloadCurrentMedicalImagingRecord()">Télécharger</button>
      </div>
    </div>
  `;
}

function getFilteredMedicalImagingRecords() {
  const filterFamily = document.getElementById('imaging-filter-family')?.value || medicalImagingState.filterFamily;
  if (filterFamily === 'all') {
    return medicalImagingState.records;
  }
  return medicalImagingState.records.filter((record) => record.examFamily === filterFamily);
}

function renderMedicalImagingRecords() {
  const list = document.getElementById('imaging-records-list');
  if (!list) return;

  if (!medicalImagingState.selectedPatientId) {
    list.innerHTML = '<div class="empty-calendar-note">Sélectionnez un patient pour voir ses examens.</div>';
    renderMedicalImagingPreviewPlaceholder('Choisissez un patient, importez un examen, puis cliquez sur une carte pour afficher l’aperçu.');
    return;
  }

  const records = getFilteredMedicalImagingRecords();
  if (!records.length) {
    list.innerHTML = '<div class="empty-calendar-note">Aucun examen d’imagerie enregistré pour ce patient.</div>';
    renderMedicalImagingPreviewPlaceholder('Aucun examen à afficher pour ce filtre.');
    return;
  }

  const totalPages = Math.max(1, Math.ceil(records.length / IMAGING_RECORDS_PAGE_SIZE));
  if (medicalImagingState.recordsPage > totalPages) medicalImagingState.recordsPage = totalPages;
  if (medicalImagingState.recordsPage < 1) medicalImagingState.recordsPage = 1;

  const startIndex = (medicalImagingState.recordsPage - 1) * IMAGING_RECORDS_PAGE_SIZE;
  const pageRows = records.slice(startIndex, startIndex + IMAGING_RECORDS_PAGE_SIZE);

  const cardsHtml = pageRows.map((record) => {
    const isActive = String(record.id) === String(medicalImagingState.selectedRecordId);
    const sizeLabel = typeof formatFileSize === 'function' ? formatFileSize(record.fileSize || 0) : `${record.fileSize || 0} B`;
    const createdLabel = record.createdAt ? new Date(record.createdAt).toLocaleDateString('fr-FR') : '-';
    const previewMode = getMedicalImagingPreviewMode(record);
    const icon = previewMode === 'dicom' ? '🩻' : previewMode === 'pdf' ? '📄' : previewMode === 'zip' ? '🗜️' : '🖼️';
    const visual = (previewMode === 'image' && typeof buildAttachmentVisual === 'function')
      ? buildAttachmentVisual(record.filePath, record.fileName || 'Examen')
      : `<span>${icon}</span>`;
    return `
      <button type="button" class="imaging-record-card ${isActive ? 'is-active' : ''}" data-record-id="${record.id}">
        <div class="imaging-record-icon">${visual}</div>
        <div class="imaging-record-body">
          <div class="imaging-record-title">${escapeHTML(record.fileName || 'Examen')}</div>
          <div class="imaging-record-meta">${escapeHTML(record.examFamily || 'Imagerie')} · ${escapeHTML(createdLabel)} · ${escapeHTML(sizeLabel)}</div>
        </div>
      </button>
    `;
  }).join('');

  const paginationHtml = totalPages > 1
    ? `
      <div class="list-pagination">
        <div class="list-pagination-info">${startIndex + 1}-${Math.min(startIndex + IMAGING_RECORDS_PAGE_SIZE, records.length)} / ${records.length}</div>
        <div class="list-pagination-actions pagination-controls">
          <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${medicalImagingState.recordsPage <= 1 ? 'disabled' : ''} onclick="changeMedicalImagingRecordsPage(-1)">‹</button>
          <span class="list-pagination-info">${medicalImagingState.recordsPage}/${totalPages}</span>
          <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${medicalImagingState.recordsPage >= totalPages ? 'disabled' : ''} onclick="changeMedicalImagingRecordsPage(1)">›</button>
        </div>
      </div>
    `
    : '';

  list.innerHTML = `${cardsHtml}${paginationHtml}`;

  if (!medicalImagingState.selectedRecordId && pageRows[0]) {
    renderMedicalImagingPreview(pageRows[0].id);
  }
}

function changeMedicalImagingRecordsPage(direction) {
  medicalImagingState.recordsPage += direction;
  renderMedicalImagingRecords();
}

async function loadMedicalImagingRecords(patientId) {
  if (!patientId) {
    medicalImagingState.records = [];
    medicalImagingState.selectedRecordId = null;
    renderMedicalImagingRecords();
    return;
  }

  const result = await window.api.patientAttachment.getByPatient(patientId);
  medicalImagingState.records = result.success
    ? (result.data || []).filter(isImagingAttachment)
    : [];
  medicalImagingState.recordsPage = 1;
  medicalImagingState.selectedRecordId = medicalImagingState.records[0]?.id || null;
  renderMedicalImagingRecords();
}

async function loadMedicalImagingPatients() {
  const result = await window.api.patient.getAll();
  medicalImagingState.patients = result.success ? (result.data || []) : [];
  renderMedicalImagingPatients();
  if (medicalImagingState.selectedPatientId) {
    await loadMedicalImagingRecords(medicalImagingState.selectedPatientId);
  }
}

async function loadMedicalImagingDevices() {
  try {
    const [settingsResult, scannersResult] = await Promise.all([
      window.api.settings.get(),
      window.api.settings.listScanners()
    ]);

    const settings = settingsResult?.success ? (settingsResult.data || {}) : {};
    medicalImagingState.devices = scannersResult?.success ? (scannersResult.data || []) : [];
    renderMedicalImagingDeviceOptions(settings.preferredScanner || '');

    if (medicalImagingState.devices.length) {
      setMedicalImagingDeviceStatus(`Source détectée: ${medicalImagingState.devices.map((device) => device.label || device.id).join(' • ')}`);
    } else {
      setMedicalImagingDeviceStatus('Aucune source installée détectée. Après installation du driver, cliquez sur Actualiser.');
    }
  } catch (error) {
    console.error('Error loading medical imaging devices:', error);
    renderMedicalImagingDeviceOptions('');
    setMedicalImagingDeviceStatus('Détection des sources indisponible.');
  }
}

async function setMedicalImagingPatient(patientId) {
  medicalImagingState.selectedPatientId = patientId || '';
  if (patientId) {
    const patient = medicalImagingState.patients.find((item) => String(item.id) === String(patientId));
    if (typeof window.setSelectedPatient === 'function') {
      await window.setSelectedPatient(patientId, { patient: patient || null, source: 'medical-imaging' });
    }
  }
  await loadMedicalImagingRecords(patientId);
}

async function saveMedicalImagingImports(importedItems, sourceLabel = '') {
  if (!medicalImagingState.selectedPatientId) {
    showNotification('Veuillez sélectionner un patient avant l’import', 'warning');
    return;
  }

  if (!importedItems?.length) {
    showNotification('Aucun fichier valide trouvé pour cet import', 'warning');
    return;
  }

  const examFamily = getMedicalImagingSelectedFamily();
  const attachments = importedItems.map((item) => ({
    fileName: item.originalName || item.name,
    filePath: item.path,
    mimeType: item.type,
    fileSize: item.size,
    examFamily,
    sourceType: sourceLabel ? 'folder-import' : 'import',
    sourceLabel: sourceLabel || 'Import manuel imagerie',
    notes: `Famille: ${examFamily}`
  }));

  const saveResult = await window.api.patientAttachment.createBatch({
    patientId: medicalImagingState.selectedPatientId,
    attachments
  });

  if (!saveResult?.success) {
    showNotification(`Erreur d’import imagerie: ${saveResult?.error || 'Échec inconnu'}`, 'error');
    return;
  }

  showNotification(`✅ ${attachments.length} examen(s) enregistré(s) dans le dossier patient`, 'success');
  await loadMedicalImagingRecords(medicalImagingState.selectedPatientId);
}

async function pickMedicalImagingFiles() {
  if (!medicalImagingState.selectedPatientId) {
    showNotification('Sélectionnez d’abord un patient', 'warning');
    return;
  }

  const result = await window.api.file.pickImagingAttachments();
  if (!result?.success) {
    showNotification(`Erreur import imagerie: ${result?.error || 'Échec inconnu'}`, 'error');
    return;
  }

  await saveMedicalImagingImports(result.data || []);
}

async function pickMedicalImagingFolder() {
  if (!medicalImagingState.selectedPatientId) {
    showNotification('Sélectionnez d’abord un patient', 'warning');
    return;
  }

  const result = await window.api.file.pickImagingFolder();
  if (!result?.success) {
    showNotification(`Erreur dossier imagerie: ${result?.error || 'Échec inconnu'}`, 'error');
    return;
  }

  const folderLabel = document.getElementById('imaging-folder-label');
  if (folderLabel) {
    folderLabel.textContent = result.folderPath || 'Aucun dossier chargé';
  }
  await saveMedicalImagingImports(result.data || [], result.folderPath || '');
}

async function openMedicalImagingRecord(recordId) {
  const record = medicalImagingState.records.find((item) => String(item.id) === String(recordId));
  if (!record) return;

  medicalImagingState.selectedRecordId = recordId;
  renderMedicalImagingRecords();
  await renderMedicalImagingPreview(recordId);

  const previewMode = getMedicalImagingPreviewMode(record);
  if (previewMode === 'image' || previewMode === 'pdf') {
    await viewFile(record.filePath, record.fileName);
  }
}

function downloadCurrentMedicalImagingRecord() {
  const record = medicalImagingState.records.find((item) => String(item.id) === String(medicalImagingState.selectedRecordId));
  if (!record) return;
  downloadFile(record.filePath, record.fileName);
}

async function refreshMedicalImagingDevices() {
  await loadMedicalImagingDevices();
  showNotification('Sources d’imagerie actualisées', 'success');
}

async function saveMedicalImagingDevicePreference() {
  const selectedDevice = document.getElementById('imaging-device-select')?.value || '';

  try {
    const currentSettingsResult = await window.api.settings.get();
    const currentSettings = currentSettingsResult?.success ? (currentSettingsResult.data || {}) : {};
    const payload = {
      ...currentSettings,
      preferredScanner: selectedDevice
    };

    const result = await window.api.settings.save(payload);
    if (!result?.success) {
      showNotification(`Erreur enregistrement source: ${result?.error || 'Échec inconnu'}`, 'error');
      return;
    }

    const selectedLabel = medicalImagingState.devices.find((device) => device.id === selectedDevice)?.label || 'Import manuel / dossier exporté';
    setMedicalImagingDeviceStatus(`Source enregistrée: ${selectedLabel}`);
    showNotification('✅ Source d’imagerie enregistrée', 'success');
  } catch (error) {
    console.error('Error saving imaging device preference:', error);
    showNotification('Erreur lors de l’enregistrement de la source', 'error');
  }
}

async function captureMedicalImagingFromDevice() {
  if (!medicalImagingState.selectedPatientId) {
    showNotification('Sélectionnez d’abord un patient', 'warning');
    return;
  }

  const scannerId = document.getElementById('imaging-device-select')?.value || '';
  if (!scannerId) {
    showNotification('Choisissez une source installée avant la capture', 'warning');
    return;
  }

  try {
    const result = await window.api.file.scanDocument({ scannerId, resolution: 200 });
    if (!result?.success) {
      showNotification(`Capture impossible: ${result?.error || 'Source non compatible'}`, 'error');
      return;
    }

    await saveMedicalImagingImports([result], result.scanner?.label ? `Source: ${result.scanner.label}` : 'Source installée');
  } catch (error) {
    console.error('Error capturing imaging from device:', error);
    showNotification('La source installée ne peut pas être capturée directement par MedCare', 'error');
  }
}

async function initMedicalImaging() {
  if (!medicalImagingState.initialized) {
    document.getElementById('imaging-patient-select')?.addEventListener('change', async (event) => {
      await setMedicalImagingPatient(event.target.value);
    });

    document.getElementById('imaging-filter-family')?.addEventListener('change', () => {
      medicalImagingState.filterFamily = document.getElementById('imaging-filter-family')?.value || 'all';
      medicalImagingState.recordsPage = 1;
      renderMedicalImagingRecords();
    });

    document.getElementById('imaging-records-list')?.addEventListener('click', async (event) => {
      const card = event.target.closest('.imaging-record-card');
      if (!card) return;
      await openMedicalImagingRecord(card.dataset.recordId);
    });

    medicalImagingState.initialized = true;
  }

  if (typeof currentPatientId !== 'undefined' && currentPatientId) {
    medicalImagingState.selectedPatientId = currentPatientId;
  }

  await loadMedicalImagingPatients();
  await loadMedicalImagingDevices();
}

window.initMedicalImaging = initMedicalImaging;
window.pickMedicalImagingFiles = pickMedicalImagingFiles;
window.pickMedicalImagingFolder = pickMedicalImagingFolder;
window.openMedicalImagingRecord = openMedicalImagingRecord;
window.downloadCurrentMedicalImagingRecord = downloadCurrentMedicalImagingRecord;
window.refreshMedicalImagingDevices = refreshMedicalImagingDevices;
window.saveMedicalImagingDevicePreference = saveMedicalImagingDevicePreference;
window.captureMedicalImagingFromDevice = captureMedicalImagingFromDevice;
window.changeMedicalImagingRecordsPage = changeMedicalImagingRecordsPage;

// ========== LAZY PATIENT SEARCH OVERRIDES ==========

loadMedicalImagingPatients = async function() {
  const select = document.getElementById('imaging-patient-select');
  if (!select) return;

  if (typeof window.attachLazyPatientSearchToSelect === 'function') {
    window.attachLazyPatientSearchToSelect('imaging-patient-select', {
      selectedPatientId: medicalImagingState.selectedPatientId || currentPatientId || '',
      placeholder: 'Tapez la premiere lettre du patient...',
      emptyMessage: 'Tapez la premiere lettre du patient',
      loadingMessage: 'Recherche des patients...',
      noResultsMessage: 'Aucun patient commence par cette recherche',
      restoreCommittedOnBlur: true
    });
  }

  if (medicalImagingState.selectedPatientId) {
    await loadMedicalImagingRecords(medicalImagingState.selectedPatientId);
  }
};

setMedicalImagingPatient = async function(patientId) {
  medicalImagingState.selectedPatientId = patientId || '';

  if (typeof window.setLazyPatientFieldValue === 'function') {
    window.setLazyPatientFieldValue('imaging-patient-select', medicalImagingState.selectedPatientId);
  }

  if (patientId) {
    if (typeof window.setSelectedPatient === 'function') {
      await window.setSelectedPatient(patientId, { source: 'medical-imaging' });
    }
  }

  await loadMedicalImagingRecords(patientId);
};

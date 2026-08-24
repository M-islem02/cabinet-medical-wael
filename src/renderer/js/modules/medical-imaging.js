const IMAGING_FAMILIES = [
  'Scanner CT / TDM (Rochers, Sinus, Cou)',
  'IRM ORL (CPA, Glandes salivaires, Sinus)',
  'Radiographie ORL (Blondeau, Cavum, OPN)',
  'Échographie Cervicale & Salivaire',
  'Endoscopie & Fibroscopie ORL',
  'Audiométrie & Tympanométrie',
  'Cone Beam / CBCT (Massif facial & Rochers)',
  'Vidéonystagmographie / VNG & Équilibre'
];

const medicalImagingState = {
  initialized: false,
  patients: [],
  records: [],
  devices: [],
  selectedPatientId: '',
  selectedFamily: 'Scanner CT / TDM (Rochers, Sinus, Cou)',
  filterFamily: 'all',
  selectedRecordId: null,
  recordsPage: 1
};
const IMAGING_RECORDS_PAGE_SIZE = 10;

function isImagingAttachment(record) {
  if (!record) return false;
  if (IMAGING_FAMILIES.includes(record.examFamily)) return true;
  const legacyFamilies = ['Radiographie', 'IRM', 'Scanner CT', 'Échographie', 'Mammographie'];
  if (legacyFamilies.includes(record.examFamily)) return true;
  const fileName = String(record.fileName || '').toLowerCase();
  return ['.dcm', '.dicom', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.pdf', '.zip'].some((ext) => fileName.endsWith(ext));
}

function getImagingPatientName(patient) {
  return `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || 'Patient';
}

function getMedicalImagingSelectedFamily() {
  return document.getElementById('imaging-family-select')?.value || 'Scanner CT / TDM (Rochers, Sinus, Cou)';
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

function normalizeImagingSearchStr(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function renderMedicalImagingPatients() {
  const select = document.getElementById('imaging-patient-select');
  const searchInput = document.getElementById('imaging-patient-search-input');
  const dropdown = document.getElementById('imaging-patient-dropdown');

  if (select) {
    const options = [
      '<option value="">-- Sélectionner un patient --</option>',
      ...medicalImagingState.patients.map((patient) => {
        const name = getImagingPatientName(patient);
        const secondary = [patient.phone, patient.socialSecurityNumber].filter(Boolean).join(' • ');
        return `<option value="${patient.id}" data-secondary="${escapeHTML(secondary)}">${escapeHTML(name)}</option>`;
      })
    ];
    select.innerHTML = options.join('');
  }

  const targetId = medicalImagingState.selectedPatientId || (typeof currentPatientId !== 'undefined' ? currentPatientId : '');
  if (targetId) {
    if (select) select.value = targetId;
    medicalImagingState.selectedPatientId = targetId;
    const currentPatient = medicalImagingState.patients.find((p) => String(p.id) === String(targetId));
    if (searchInput && currentPatient && document.activeElement !== searchInput) {
      searchInput.value = getImagingPatientName(currentPatient);
    }
  }

  if (searchInput && dropdown && !searchInput.dataset.imagingBound) {
    searchInput.dataset.imagingBound = '1';

    const renderResults = (query = '') => {
      const q = normalizeImagingSearchStr(query);
      if (!q || q.trim().length === 0) {
        dropdown.style.display = 'none';
        dropdown.replaceChildren();
        return;
      }

      const filtered = medicalImagingState.patients.filter((p) => {
        const fullName = normalizeImagingSearchStr((p.lastName || '') + ' ' + (p.firstName || '') + ' ' + (p.firstName || '') + ' ' + (p.lastName || ''));
        const phone = normalizeImagingSearchStr(p.phone);
        const ssn = normalizeImagingSearchStr(p.socialSecurityNumber);
        const cin = normalizeImagingSearchStr(p.cin);
        return fullName.includes(q) || phone.includes(q) || ssn.includes(q) || cin.includes(q);
      });

      dropdown.replaceChildren();
      if (!filtered.length) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.padding = '12px 14px';
        emptyDiv.style.fontSize = '13px';
        emptyDiv.style.color = 'rgba(0,0,0,0.45)';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.textContent = 'Aucun patient trouvé pour cette recherche';
        dropdown.appendChild(emptyDiv);
      } else {
        filtered.slice(0, 10).forEach((patient) => {
          const item = document.createElement('div');
          item.style.padding = '10px 14px';
          item.style.cursor = 'pointer';
          item.style.fontSize = '13.5px';
          item.style.borderBottom = '1px solid #f1f5f9';
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.gap = '10px';
          item.style.transition = 'background 0.15s ease';
          item.onmouseenter = () => { item.style.background = '#eff6ff'; };
          item.onmouseleave = () => { item.style.background = '#ffffff'; };

          const leftWrap = document.createElement('div');
          leftWrap.style.display = 'flex';
          leftWrap.style.alignItems = 'center';
          leftWrap.style.gap = '10px';

          const avatar = document.createElement('div');
          avatar.style.width = '28px';
          avatar.style.height = '28px';
          avatar.style.borderRadius = '50%';
          avatar.style.background = '#1677ff';
          avatar.style.color = '#ffffff';
          avatar.style.display = 'flex';
          avatar.style.alignItems = 'center';
          avatar.style.justifyContent = 'center';
          avatar.style.fontSize = '12px';
          avatar.style.fontWeight = '700';
          avatar.textContent = (patient.lastName?.[0] || patient.firstName?.[0] || 'P').toUpperCase();

          const nameSpan = document.createElement('span');
          nameSpan.style.fontWeight = '600';
          nameSpan.style.color = '#0f172a';
          nameSpan.textContent = getImagingPatientName(patient);

          leftWrap.appendChild(avatar);
          leftWrap.appendChild(nameSpan);

          const metaSpan = document.createElement('span');
          metaSpan.style.fontSize = '12px';
          metaSpan.style.color = '#64748b';
          metaSpan.textContent = patient.phone || patient.socialSecurityNumber || '';

          item.appendChild(leftWrap);
          item.appendChild(metaSpan);

          item.addEventListener('mousedown', (e) => e.preventDefault());
          item.addEventListener('click', async () => {
            searchInput.value = getImagingPatientName(patient);
            dropdown.style.display = 'none';
            if (select) select.value = patient.id;
            await setMedicalImagingPatient(patient.id);
          });

          dropdown.appendChild(item);
        });
      }
      dropdown.style.display = 'block';
    };

    searchInput.addEventListener('input', () => {
      const val = searchInput.value.trim();
      if (val.length > 0) {
        renderResults(val);
      } else {
        dropdown.style.display = 'none';
        dropdown.replaceChildren();
      }
    });
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 250);
    });
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
    let iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    if (previewMode === 'pdf') {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e11d48" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    } else if (previewMode === 'dicom') {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2563eb" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
    } else if (previewMode === 'zip') {
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#d97706" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';
    }
    const visual = (previewMode === 'image' && typeof buildAttachmentVisual === 'function')
      ? buildAttachmentVisual(record.filePath, record.fileName || 'Examen')
      : `<span style="display: flex; align-items: center; justify-content: center;">${iconSvg}</span>`;
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
      <div class="imaging-pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; margin-top: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
        <span style="font-size: 12px; color: #64748b; font-weight: 500;">Affichage ${startIndex + 1}-${Math.min(startIndex + IMAGING_RECORDS_PAGE_SIZE, records.length)} sur ${records.length}</span>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" class="btn btn-small btn-secondary" style="height: 28px; padding: 0 10px; font-size: 12px;" aria-label="Page précédente" ${medicalImagingState.recordsPage <= 1 ? 'disabled' : ''} onclick="changeMedicalImagingRecordsPage(-1)">◀ Précédent</button>
          <span style="font-size: 12px; font-weight: 600; color: #334155; padding: 0 4px;">Page ${medicalImagingState.recordsPage} / ${totalPages}</span>
          <button type="button" class="btn btn-small btn-secondary" style="height: 28px; padding: 0 10px; font-size: 12px;" aria-label="Page suivante" ${medicalImagingState.recordsPage >= totalPages ? 'disabled' : ''} onclick="changeMedicalImagingRecordsPage(1)">Suivant ▶</button>
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
  const folderLabel = document.getElementById('imaging-folder-label');
  if (!patientId) {
    medicalImagingState.records = [];
    medicalImagingState.selectedRecordId = null;
    if (folderLabel) folderLabel.textContent = 'Aucun dossier chargé';
    renderMedicalImagingRecords();
    return;
  }

  const result = await window.api.patientAttachment.getByPatient(patientId);
  medicalImagingState.records = result.success
    ? (result.data || []).filter(isImagingAttachment)
    : [];
  medicalImagingState.recordsPage = 1;
  medicalImagingState.selectedRecordId = medicalImagingState.records[0]?.id || null;

  if (folderLabel) {
    const patient = medicalImagingState.patients.find((item) => String(item.id) === String(patientId));
    const patientName = patient ? getImagingPatientName(patient) : 'Patient';
    folderLabel.textContent = `${patientName} (${medicalImagingState.records.length} examens)`;
  }

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

  const familySelect = document.getElementById('imaging-family-select');
  if (familySelect && typeof AntSelect !== 'undefined') {
    AntSelect.destroy(familySelect);
    AntSelect.enhance(familySelect, {
      showSearch: false,
      placeholder: 'Famille d\'examen',
      onSelect: (val) => {
        medicalImagingState.selectedFamily = val;
      }
    });
  }

  const filterFamilySelect = document.getElementById('imaging-filter-family');
  if (filterFamilySelect && typeof AntSelect !== 'undefined') {
    AntSelect.destroy(filterFamilySelect);
    AntSelect.enhance(filterFamilySelect, {
      showSearch: false,
      placeholder: 'Toutes les familles',
      onSelect: (val) => {
        medicalImagingState.filterFamily = val || 'all';
        medicalImagingState.recordsPage = 1;
        renderMedicalImagingRecords();
      }
    });
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

  try {
    let patients = [];
    if (window.api?.patient?.getAll) {
      try {
        const res = await window.api.patient.getAll();
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          patients = res.data;
        }
      } catch (e) {}
    }
    if ((!patients || patients.length === 0) && window.api?.patient?.getDirectory) {
      try {
        const resDir = await window.api.patient.getDirectory();
        if (resDir?.success && Array.isArray(resDir.data)) {
          patients = resDir.data;
        }
      } catch (e) {}
    }
    if ((!patients || patients.length === 0) && Array.isArray(window.patients) && window.patients.length > 0) {
      patients = window.patients;
    }

    const activeId = medicalImagingState.selectedPatientId || currentPatientId || window.currentPatientId;
    if (activeId && !patients.some(p => String(p.id) === String(activeId))) {
      if (window.currentPatientData && String(window.currentPatientData.id) === String(activeId)) {
        patients.unshift(window.currentPatientData);
      } else if (window.api?.patient?.getById) {
        try {
          const singleRes = await window.api.patient.getById(activeId);
          if (singleRes?.success && singleRes.data) {
            patients.unshift(singleRes.data);
          }
        } catch (e) {}
      }
    }

    medicalImagingState.patients = patients || [];
    window._imagingPatientsCache = medicalImagingState.patients;

    renderMedicalImagingPatients();
  } catch (err) {
    console.error('Error loading imaging patients:', err);
  }

  if (medicalImagingState.selectedPatientId) {
    await loadMedicalImagingRecords(medicalImagingState.selectedPatientId);
  }
};

setMedicalImagingPatient = async function(patientId) {
  const normalizedId = patientId ? String(patientId).trim() : '';
  medicalImagingState.selectedPatientId = normalizedId;

  const select = document.getElementById('imaging-patient-select');
  if (select) {
    if (typeof AntSelect !== 'undefined') {
      AntSelect.setValue(select, normalizedId);
    } else {
      select.value = normalizedId;
    }
  }

  if (typeof window.setLazyPatientFieldValue === 'function') {
    let patientName = '';
    const cached = medicalImagingState.patients?.find(p => String(p.id) === normalizedId);
    if (cached) {
      patientName = `${cached.lastName || ''} ${cached.firstName || ''}`.trim();
    }
    window.setLazyPatientFieldValue('imaging-patient-select', normalizedId, patientName);
  }

  if (normalizedId) {
    if (typeof window.setSelectedPatient === 'function') {
      await window.setSelectedPatient(normalizedId, { source: 'medical-imaging' });
    }
  }

  await loadMedicalImagingRecords(normalizedId);
};

// ==================== IMPORT DIRECT DEPUIS APPAREIL RADIO (X-RAY) ====================

let radioExportFilesCache = [];

function formatFileSizeHuman(bytes) {
  if (!bytes || bytes <= 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function openImportRadioModal() {
  const patientId = medicalImagingState.selectedPatientId || (typeof currentPatientId !== 'undefined' ? currentPatientId : window.currentPatientId);
  if (!patientId) {
    showNotification('Veuillez sélectionner un patient avant d\'importer des clichés radio', 'warning');
    return;
  }

  let patient = medicalImagingState.patients?.find((p) => String(p.id) === String(patientId));
  if (!patient && window.currentPatientData) {
    patient = window.currentPatientData;
  }
  const patientName = patient ? getImagingPatientName(patient) : 'Patient';

  const patientDisplay = document.getElementById('radio-modal-patient-name');
  if (patientDisplay) {
    patientDisplay.textContent = patientName;
    patientDisplay.dataset.patientId = patientId;
  }

  showModal('modal-import-radio');
  await refreshRadioExportFilesModal();
}

async function refreshRadioExportFilesModal() {
  const folderDisplay = document.getElementById('radio-modal-folder-display');
  const listContainer = document.getElementById('radio-modal-files-list');
  const countEl = document.getElementById('radio-modal-files-count');
  const importBtn = document.getElementById('radio-modal-import-btn');

  if (listContainer) {
    listContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #94a3b8;"><div>Recherche des clichés dans le dossier Radio...</div></div>';
  }
  if (importBtn) importBtn.disabled = true;

  try {
    const res = await window.api.file.listRadioExportFiles();
    if (!res?.success) {
      if (folderDisplay) folderDisplay.textContent = res?.folderPath || 'Non configuré';
      if (listContainer) {
        listContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 25px 15px; color: #64748b;">
            <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
            <div style="font-weight: 600; color: #b91c1c; margin-bottom: 6px;">${escapeHTML(res?.error || 'Dossier Radio introuvable')}</div>
            <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Vérifiez le chemin du dossier d'export de votre appareil radio ou sélectionnez-le directement ci-dessous.</div>
            <button type="button" class="btn btn-primary btn-small" onclick="pickRadioExportFolderModal()" style="background: #0284c7; border-color: #0284c7;">Parcourir le dossier...</button>
          </div>
        `;
      }
      if (countEl) countEl.textContent = '0';
      return;
    }

    if (folderDisplay) folderDisplay.textContent = res.folderPath || 'Dossier configuré';
    radioExportFilesCache = res.files || [];
    if (countEl) countEl.textContent = String(radioExportFilesCache.length);

    if (radioExportFilesCache.length === 0) {
      if (listContainer) {
        listContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 35px 20px; color: #64748b;">
            <div style="font-size: 36px; margin-bottom: 8px;">📁</div>
            <div style="font-weight: 600; color: #334155;">Aucun cliché récent trouvé dans le dossier</div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Le dossier est vide ou ne contient pas de fichiers images ou DICOM.</div>
          </div>
        `;
      }
      return;
    }

    renderRadioExportFilesGrid();
  } catch (err) {
    console.error('Error in refreshRadioExportFilesModal:', err);
    if (listContainer) {
      listContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #ef4444;">Erreur: ${escapeHTML(err.message)}</div>`;
    }
  }
}

function renderRadioExportFilesGrid() {
  const listContainer = document.getElementById('radio-modal-files-list');
  if (!listContainer) return;

  listContainer.innerHTML = radioExportFilesCache.map((file) => {
    const dateStr = file.mtime ? new Date(file.mtime).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const sizeStr = formatFileSizeHuman(file.size);
    const thumbHtml = file.thumbnail
      ? `<img src="${file.thumbnail}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 4px;" alt="${escapeHTML(file.name)}">`
      : `<div style="width: 100%; height: 110px; background: #e2e8f0; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b;"><span style="font-size: 24px;">🩻</span><span style="font-size: 11px; font-weight: 600; margin-top: 4px;">${escapeHTML(file.ext.toUpperCase())}</span></div>`;

    return `
      <label class="radio-file-card" style="display: flex; flex-direction: column; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px; cursor: pointer; transition: all 0.15s ease; position: relative; user-select: none;">
        <input type="checkbox" class="radio-file-checkbox" data-path="${escapeHTML(file.path)}" onchange="updateRadioSelectionCount()" style="position: absolute; top: 12px; left: 12px; z-index: 10; width: 18px; height: 18px; cursor: pointer;">
        <div style="margin-bottom: 6px; overflow: hidden; border-radius: 4px;">${thumbHtml}</div>
        <div style="font-size: 12px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; margin-top: 4px;">
          <span>${escapeHTML(sizeStr)}</span>
          <span>${escapeHTML(dateStr)}</span>
        </div>
      </label>
    `;
  }).join('');

  updateRadioSelectionCount();
}

async function pickRadioExportFolderModal() {
  try {
    const res = await window.api.file.selectFolder();
    if (res?.success && res.folderPath) {
      const folderDisplay = document.getElementById('radio-modal-folder-display');
      if (folderDisplay) folderDisplay.textContent = res.folderPath;
      const settingsInput = document.getElementById('radio-export-folder-path');
      if (settingsInput) settingsInput.value = res.folderPath;

      // Save to settings
      try {
        const cur = await window.api.settings.get();
        const curData = cur?.success ? (cur.data || {}) : {};
        await window.api.settings.save({ ...curData, radioExportFolderPath: res.folderPath });
      } catch (_) {}

      showNotification('Dossier Radio mis à jour', 'success');
      await refreshRadioExportFilesModal();
    }
  } catch (err) {
    console.error('Error picking radio export folder:', err);
  }
}

function toggleSelectAllRadioFiles() {
  const checkboxes = Array.from(document.querySelectorAll('.radio-file-checkbox'));
  if (!checkboxes.length) return;
  const anyUnchecked = checkboxes.some((cb) => !cb.checked);
  checkboxes.forEach((cb) => { cb.checked = anyUnchecked; });
  updateRadioSelectionCount();
}

function updateRadioSelectionCount() {
  const checkboxes = Array.from(document.querySelectorAll('.radio-file-checkbox'));
  const selectedCount = checkboxes.filter((cb) => cb.checked).length;
  const countDisplay = document.getElementById('radio-modal-selection-count');
  const importBtn = document.getElementById('radio-modal-import-btn');

  if (countDisplay) {
    countDisplay.textContent = `${selectedCount} cliché(s) sélectionné(s)`;
  }
  if (importBtn) {
    importBtn.disabled = selectedCount === 0;
    importBtn.textContent = selectedCount > 0
      ? `Importer ${selectedCount} cliché(s) dans le dossier`
      : 'Importer dans le dossier patient';
  }

  // Update card border styles
  checkboxes.forEach((cb) => {
    const card = cb.closest('.radio-file-card');
    if (card) {
      if (cb.checked) {
        card.style.borderColor = '#0284c7';
        card.style.background = '#f0f9ff';
      } else {
        card.style.borderColor = '#e2e8f0';
        card.style.background = '#ffffff';
      }
    }
  });
}

async function submitRadioFilesImport() {
  const patientId = document.getElementById('radio-modal-patient-name')?.dataset?.patientId || medicalImagingState.selectedPatientId || (typeof currentPatientId !== 'undefined' ? currentPatientId : '');
  if (!patientId) {
    showNotification('Patient non spécifié', 'error');
    return;
  }

  const selectedPaths = Array.from(document.querySelectorAll('.radio-file-checkbox:checked')).map((cb) => cb.dataset.path).filter(Boolean);
  if (!selectedPaths.length) {
    showNotification('Veuillez cocher au moins un cliché à importer', 'warning');
    return;
  }

  const examFamily = document.getElementById('radio-modal-exam-family')?.value || 'Radiographie ORL (Blondeau, Cavum, OPN)';
  const importBtn = document.getElementById('radio-modal-import-btn');
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.textContent = 'Importation en cours...';
  }

  try {
    const result = await window.api.file.importRadioFiles({
      patientId,
      filePaths: selectedPaths,
      examFamily,
      notes: `Import Radio direct (${selectedPaths.length} cliché(s))`
    });

    if (!result?.success) {
      showNotification(`Erreur lors de l'import : ${result?.error || 'Échec'}`, 'error');
      if (importBtn) importBtn.disabled = false;
      return;
    }

    showNotification(`✅ ${result.importedCount || selectedPaths.length} cliché(s) importé(s) avec succès dans le dossier patient !`, 'success');
    closeModal('modal-import-radio');

    // Reload imaging records
    if (typeof loadMedicalImagingRecords === 'function') {
      await loadMedicalImagingRecords(patientId);
    }
  } catch (err) {
    console.error('Error importing radio files:', err);
    showNotification('Erreur inattendue lors de l\'import des clichés', 'error');
    if (importBtn) importBtn.disabled = false;
  }
}

window.openImportRadioModal = openImportRadioModal;
window.refreshRadioExportFilesModal = refreshRadioExportFilesModal;
window.pickRadioExportFolderModal = pickRadioExportFolderModal;
window.toggleSelectAllRadioFiles = toggleSelectAllRadioFiles;
window.updateRadioSelectionCount = updateRadioSelectionCount;
window.submitRadioFilesImport = submitRadioFilesImport;

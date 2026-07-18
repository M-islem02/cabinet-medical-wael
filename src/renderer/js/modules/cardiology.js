let cardiologyState = {
  patientId: null,
  patient: null,
  documentId: null,
  data: {},
  documents: []
};

const CARDIOLOGY_DOCUMENT_TYPE = 'cardiology_profile';
let cardiologyCurrentTab = 'summary';
let cardiologyViewState = {
  documentId: null,
  patientId: null,
  data: null
};

function getDefaultCardiologyProfile() {
  return {
    date: formatDateToInputValue(new Date()),
    motif: '',
    antecedents: '',
    riskFactors: '',
    symptoms: '',
    bloodPressure: '',
    heartRate: '',
    spo2: '',
    clinicalExam: '',
    ecgRest: '',
    ecgStress: '',
    echo: '',
    holterMapa: '',
    biology: '',
    otherTests: '',
    treatment: '',
    conclusion: ''
  };
}

function normalizeCardiologyProfile(raw = {}) {
  const defaults = getDefaultCardiologyProfile();
  return {
    date: formatDateToInputValue(raw.date || defaults.date) || defaults.date,
    motif: cleanTextValue(raw.motif, defaults.motif),
    antecedents: cleanTextValue(raw.antecedents, defaults.antecedents),
    riskFactors: cleanTextValue(raw.riskFactors, defaults.riskFactors),
    symptoms: cleanTextValue(raw.symptoms, defaults.symptoms),
    bloodPressure: cleanTextValue(raw.bloodPressure, defaults.bloodPressure),
    heartRate: cleanTextValue(raw.heartRate, defaults.heartRate),
    spo2: cleanTextValue(raw.spo2, defaults.spo2),
    clinicalExam: cleanTextValue(raw.clinicalExam, defaults.clinicalExam),
    ecgRest: cleanTextValue(raw.ecgRest || raw.ecg, defaults.ecgRest),
    ecgStress: cleanTextValue(raw.ecgStress, defaults.ecgStress),
    echo: cleanTextValue(raw.echo, defaults.echo),
    holterMapa: cleanTextValue(raw.holterMapa || raw.holter, defaults.holterMapa),
    biology: cleanTextValue(raw.biology, defaults.biology),
    otherTests: cleanTextValue(raw.otherTests, defaults.otherTests),
    treatment: cleanTextValue(raw.treatment, defaults.treatment),
    conclusion: cleanTextValue(raw.conclusion, defaults.conclusion)
  };
}

function fillCardiologyProfileForm(data = {}) {
  const profile = normalizeCardiologyProfile(data);
  document.getElementById('cardiology-date').value = profile.date || '';
  document.getElementById('cardiology-motif').value = profile.motif || '';
  document.getElementById('cardiology-antecedents').value = profile.antecedents || '';
  document.getElementById('cardiology-risk-factors').value = profile.riskFactors || '';
  document.getElementById('cardiology-symptoms').value = profile.symptoms || '';
  document.getElementById('cardiology-blood-pressure').value = profile.bloodPressure || '';
  document.getElementById('cardiology-heart-rate').value = profile.heartRate || '';
  document.getElementById('cardiology-spo2').value = profile.spo2 || '';
  document.getElementById('cardiology-clinical-exam').value = profile.clinicalExam || '';
  document.getElementById('cardiology-ecg-rest').value = profile.ecgRest || '';
  document.getElementById('cardiology-ecg-stress').value = profile.ecgStress || '';
  document.getElementById('cardiology-echo').value = profile.echo || '';
  document.getElementById('cardiology-holter-mapa').value = profile.holterMapa || '';
  document.getElementById('cardiology-biology').value = profile.biology || '';
  document.getElementById('cardiology-other-tests').value = profile.otherTests || '';
  document.getElementById('cardiology-treatment').value = profile.treatment || '';
  document.getElementById('cardiology-conclusion').value = profile.conclusion || '';
}

function collectCardiologyProfileData() {
  return {
    date: document.getElementById('cardiology-date')?.value || formatDateToInputValue(new Date()),
    motif: document.getElementById('cardiology-motif')?.value?.trim() || '',
    antecedents: document.getElementById('cardiology-antecedents')?.value?.trim() || '',
    riskFactors: document.getElementById('cardiology-risk-factors')?.value?.trim() || '',
    symptoms: document.getElementById('cardiology-symptoms')?.value?.trim() || '',
    bloodPressure: document.getElementById('cardiology-blood-pressure')?.value?.trim() || '',
    heartRate: document.getElementById('cardiology-heart-rate')?.value?.trim() || '',
    spo2: document.getElementById('cardiology-spo2')?.value?.trim() || '',
    clinicalExam: document.getElementById('cardiology-clinical-exam')?.value?.trim() || '',
    ecgRest: document.getElementById('cardiology-ecg-rest')?.value?.trim() || '',
    ecgStress: document.getElementById('cardiology-ecg-stress')?.value?.trim() || '',
    echo: document.getElementById('cardiology-echo')?.value?.trim() || '',
    holterMapa: document.getElementById('cardiology-holter-mapa')?.value?.trim() || '',
    biology: document.getElementById('cardiology-biology')?.value?.trim() || '',
    otherTests: document.getElementById('cardiology-other-tests')?.value?.trim() || '',
    treatment: document.getElementById('cardiology-treatment')?.value?.trim() || '',
    conclusion: document.getElementById('cardiology-conclusion')?.value?.trim() || ''
  };
}

function resetCardiologyDisplay() {
  cardiologyState = {
    patientId: null,
    patient: null,
    documentId: null,
    data: getDefaultCardiologyProfile(),
    documents: []
  };

  const hiddenPatientId = document.getElementById('cardiology-patient-id');
  if (hiddenPatientId) hiddenPatientId.value = '';
  const patientDisplay = document.getElementById('cardiology-current-patient-display');
  if (patientDisplay) patientDisplay.textContent = 'Aucun patient sélectionné';

  fillCardiologyProfileForm(getDefaultCardiologyProfile());

  document.getElementById('cardiology-stat-last-report').textContent = '-';
  document.getElementById('cardiology-stat-blood-pressure').textContent = '-';
  document.getElementById('cardiology-stat-rapport-count').textContent = '0';
  document.getElementById('cardiology-stat-orientation-count').textContent = '0';

  const summary = document.getElementById('cardiology-patient-summary');
  if (summary) {
    summary.innerHTML = '<div class="cardiology-empty-state">Sélectionnez un patient pour afficher le résumé cardiovasculaire.</div>';
  }

  const history = document.getElementById('cardiology-recent-items');
  if (history) {
    history.innerHTML = '<div class="cardiology-empty-state">Aucune activité à afficher.</div>';
  }

  switchCardiologyTab('summary');
}

function renderCardiologyStats() {
  const documents = Array.isArray(cardiologyState.documents) ? cardiologyState.documents : [];
  const reportLikeDocuments = documents.filter((doc) => ['rapport', CARDIOLOGY_DOCUMENT_TYPE].includes(doc.documentType));
  const lastReport = reportLikeDocuments
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
  const bloodPressure = cardiologyState.data?.bloodPressure
    || '-';
  const rapportCount = documents.filter((doc) => doc.documentType === 'rapport').length;
  const orientationCount = documents.filter((doc) => doc.documentType === 'orientation').length;

  document.getElementById('cardiology-stat-last-report').textContent = lastReport
    ? formatDateToDDMMYYYY(lastReport.updatedAt || lastReport.createdAt)
    : '-';
  document.getElementById('cardiology-stat-blood-pressure').textContent = bloodPressure || '-';
  document.getElementById('cardiology-stat-rapport-count').textContent = String(rapportCount);
  document.getElementById('cardiology-stat-orientation-count').textContent = String(orientationCount);
}

function renderCardiologyPatientSummary() {
  const summary = document.getElementById('cardiology-patient-summary');
  if (!summary) return;
  if (!cardiologyState.patient) {
    summary.innerHTML = '<div class="cardiology-empty-state">Sélectionnez un patient pour afficher le résumé cardiovasculaire.</div>';
    return;
  }

  const patient = cardiologyState.patient;
  const profile = cardiologyState.data || getDefaultCardiologyProfile();
  const ageLabel = typeof getPatientAgeLabel === 'function' ? getPatientAgeLabel(patient) : '-';

  summary.innerHTML = `
    <div class="cardiology-summary-grid">
      <div class="cardiology-summary-item">
        <span class="cardiology-summary-label">Patient</span>
        <strong class="cardiology-summary-value">${escapeHTML(`${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '-')}</strong>
      </div>
      <div class="cardiology-summary-item">
        <span class="cardiology-summary-label">Âge</span>
        <strong class="cardiology-summary-value">${escapeHTML(ageLabel)}</strong>
      </div>
      <div class="cardiology-summary-item">
        <span class="cardiology-summary-label">Motif principal</span>
        <strong class="cardiology-summary-value">${escapeHTML(profile.motif || 'Non renseigné')}</strong>
      </div>
      <div class="cardiology-summary-item">
        <span class="cardiology-summary-label">Dernier traitement</span>
        <strong class="cardiology-summary-value">${escapeHTML(profile.treatment || 'Non renseigné')}</strong>
      </div>
      <div class="cardiology-summary-item">
        <span class="cardiology-summary-label">Exploration clé</span>
        <strong class="cardiology-summary-value">${escapeHTML(profile.ecgStress || profile.ecgRest || profile.echo || 'Non renseigné')}</strong>
      </div>
      <div class="cardiology-summary-item cardiology-summary-item-wide">
        <span class="cardiology-summary-label">Conclusion actuelle</span>
        <strong class="cardiology-summary-value cardiology-summary-rich">${formatRichTextHtml(profile.conclusion || 'Aucune conclusion enregistrée.', 'Aucune conclusion enregistrée.')}</strong>
      </div>
    </div>
  `;
}

function buildCardiologyHistoryAction(doc) {
  if (doc.documentType === 'rapport') {
    return `<button class="btn btn-tiny btn-primary" onclick="viewPatientRapport('${doc.id}')">Ouvrir</button>`;
  }
  if (doc.documentType === 'orientation') {
    return `<button class="btn btn-tiny btn-primary" onclick="viewOrientation('${doc.id}')">Ouvrir</button>`;
  }
  if (doc.documentType === CARDIOLOGY_DOCUMENT_TYPE) {
    return `<button class="btn btn-tiny btn-primary" onclick="viewCardiologyProfile('${doc.id}')">Voir / modifier</button>`;
  }
  return '';
}

function renderCardiologyHistory() {
  const history = document.getElementById('cardiology-recent-items');
  if (!history) return;

  const documentItems = (cardiologyState.documents || [])
    .filter((doc) => ['rapport', 'orientation', CARDIOLOGY_DOCUMENT_TYPE].includes(doc.documentType))
    .slice(0, 6)
    .map((doc) => {
      const payload = parseDocumentPayload(doc.payload);
      const title = doc.documentType === CARDIOLOGY_DOCUMENT_TYPE
        ? (payload.motif || 'Bilan cardiologique')
        : (doc.title || payload.motif || doc.documentType);
      const subtitle = doc.documentType === 'orientation'
        ? (payload.specialty || 'Orientation médicale')
        : doc.documentType === CARDIOLOGY_DOCUMENT_TYPE
          ? (payload.conclusion || payload.ecgStress || payload.ecgRest || 'Bilan cardiologique enregistré')
        : (payload.conclusion || payload.constats || payload.symptoms || 'Document médical');
      return {
        type: doc.documentType,
        typeLabel: doc.documentType === CARDIOLOGY_DOCUMENT_TYPE ? 'BILAN CARDIO' : String(doc.documentType || '').toUpperCase(),
        title,
        date: doc.updatedAt || doc.createdAt,
        subtitle,
        actionHtml: buildCardiologyHistoryAction(doc)
      };
    });

  const items = [...documentItems]
    .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))
    .slice(0, 8);

  if (!items.length) {
    history.innerHTML = '<div class="cardiology-empty-state">Aucune activité à afficher.</div>';
    return;
  }

  history.innerHTML = items.map((item) => `
    <div class="cardiology-history-item">
      <div class="cardiology-history-meta">
        <span class="cardiology-history-type">${escapeHTML(item.typeLabel || String(item.type || '').toUpperCase())}</span>
        <span class="cardiology-history-date">${escapeHTML(formatDateToDDMMYYYY(item.date) || '-')}</span>
      </div>
      <strong class="cardiology-history-title">${escapeHTML(item.title || '-')}</strong>
      <p class="cardiology-history-subtitle">${escapeHTML(String(item.subtitle || '-')).slice(0, 160)}</p>
      <div class="cardiology-history-actions">${item.actionHtml || ''}</div>
    </div>
  `).join('');
}

async function loadCardiologyPatient(patientId) {
  if (!patientId) {
    resetCardiologyDisplay();
    return;
  }

  try {
    const [patientResult, documentResult, profileResult] = await Promise.all([
      window.api.patient.getById(patientId),
      window.api.document.listByPatient(patientId),
      window.api.document.getByType({ patientId, documentType: CARDIOLOGY_DOCUMENT_TYPE })
    ]);

    if (!patientResult.success || !patientResult.data) {
      showNotification('Patient introuvable', 'error');
      resetCardiologyDisplay();
      return;
    }

    const patient = patientResult.data;
    const documents = documentResult.success && Array.isArray(documentResult.data) ? documentResult.data : [];
    const profileDoc = profileResult.success ? profileResult.data : null;
    const profileData = profileDoc ? normalizeCardiologyProfile(parseDocumentPayload(profileDoc.payload)) : getDefaultCardiologyProfile();

    cardiologyState = {
      patientId,
      patient,
      documentId: profileDoc?.id || null,
      data: profileData,
      documents
    };

    document.getElementById('cardiology-patient-id').value = patientId;
    document.getElementById('cardiology-current-patient-display').textContent = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient';
    fillCardiologyProfileForm(profileData);
    renderCardiologyStats();
    renderCardiologyPatientSummary();
    renderCardiologyHistory();
  } catch (error) {
    console.error('Error loading cardiology workspace:', error);
    showNotification('Erreur lors du chargement de la section cardiologie', 'error');
  }
}

async function refreshCardiologyPatientList() {
  const selector = document.getElementById('cardiology-patient-selector');
  if (!selector) return;

  const previousValue = selector.value || cardiologyState.patientId || '';
  selector.innerHTML = '<option value="">-- Sélectionner un patient --</option>';

  try {
    const result = await window.api.patient.getAll();
    const patients = result.success && Array.isArray(result.data) ? result.data : [];

    patients.forEach((patient) => {
      const option = document.createElement('option');
      option.value = patient.id;
      option.textContent = `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || 'Patient';
      selector.appendChild(option);
    });

    if (previousValue && patients.some((patient) => patient.id === previousValue)) {
      selector.value = previousValue;
    } else if (currentPatientId && patients.some((patient) => patient.id === currentPatientId)) {
      selector.value = currentPatientId;
    }
  } catch (error) {
    console.error('Error refreshing cardiology patients:', error);
  }
}

async function initCardiology(force = false) {
  const selector = document.getElementById('cardiology-patient-selector');
  if (!selector) return;
  switchCardiologyTab(cardiologyCurrentTab || 'summary');
  if (selector.dataset.initialized === '1' && !force) {
    if (currentPatientId && String(cardiologyState.patientId || '') !== String(currentPatientId)) {
      selector.value = currentPatientId;
      await loadCardiologyPatient(currentPatientId);
    }
    return;
  }

  selector.dataset.initialized = '1';
  await refreshCardiologyPatientList();

  const initialPatientId = currentPatientId || selector.value || '';
  if (initialPatientId) {
    selector.value = initialPatientId;
    await loadCardiologyPatient(initialPatientId);
  } else {
    resetCardiologyDisplay();
  }
}

async function selectCardiologyPatient(patientId) {
  await loadCardiologyPatient(patientId);
  if (patientId && cardiologyState.patient && typeof window.setSelectedPatient === 'function') {
    await window.setSelectedPatient(patientId, { patient: cardiologyState.patient, source: 'cardiology' });
  }
}

async function saveCardiologyProfile() {
  const patientId = document.getElementById('cardiology-patient-id')?.value || cardiologyState.patientId;
  if (!patientId) {
    showNotification('Sélectionnez un patient avant enregistrement', 'warning');
    return;
  }

  const data = collectCardiologyProfileData();
  try {
    const result = await window.api.document.save({
      id: cardiologyState.documentId,
      patientId,
      documentType: CARDIOLOGY_DOCUMENT_TYPE,
      title: data.motif || 'Bilan cardiologique',
      data
    });

    if (!result.success) {
      showNotification(result.error || 'Erreur lors de l’enregistrement cardio', 'error');
      return;
    }

    cardiologyState.documentId = result.id;
    cardiologyState.data = data;
    showNotification('✅ Bilan cardiologique enregistré', 'success');
    await loadCardiologyPatient(patientId);
  } catch (error) {
    console.error('Error saving cardiology profile:', error);
    showNotification('Erreur lors de l’enregistrement du bilan cardiologique', 'error');
  }
}

function resetCardiologyProfile() {
  fillCardiologyProfileForm(getDefaultCardiologyProfile());
  switchCardiologyTab('summary');
}

async function openCardiologyReportWorkspace() {
  const patientId = document.getElementById('cardiology-patient-id')?.value || cardiologyState.patientId;
  if (!patientId) {
    showNotification('Sélectionnez un patient avant de générer le rapport', 'warning');
    return;
  }

  if (typeof openPatientLevelRapportModal !== 'function') {
    showNotification('Module rapport indisponible', 'error');
    return;
  }

  await openPatientLevelRapportModal(patientId);

  const profile = collectCardiologyProfileData();
  const profileParts = [
    profile.antecedents ? `Antécédents: ${profile.antecedents}` : '',
    profile.riskFactors ? `Facteurs de risque: ${profile.riskFactors}` : '',
    profile.symptoms ? `Symptômes: ${profile.symptoms}` : ''
  ].filter(Boolean).join('\n');

  const findingsParts = [
    profile.clinicalExam,
    profile.bloodPressure ? `TA: ${profile.bloodPressure}` : '',
    profile.heartRate ? `FC: ${profile.heartRate}` : '',
    profile.spo2 ? `SpO2: ${profile.spo2}` : '',
    profile.ecgRest ? `ECG de repos: ${profile.ecgRest}` : '',
    profile.ecgStress ? `ECG d'effort: ${profile.ecgStress}` : '',
    profile.echo ? `Échocardiographie: ${profile.echo}` : '',
    profile.holterMapa ? `Holter / MAPA: ${profile.holterMapa}` : '',
    profile.biology ? `Biologie: ${profile.biology}` : '',
    profile.otherTests ? `Autres examens: ${profile.otherTests}` : ''
  ].filter(Boolean).join('\n');

  if (typeof applyRapportSpecialtyTemplate === 'function') {
    applyRapportSpecialtyTemplate('cardiology');
  }

  const motifInput = document.getElementById('rapport-motif');
  const contexteInput = document.getElementById('rapport-contexte');
  const constatsInput = document.getElementById('rapport-constats');
  const careInput = document.getElementById('rapport-prise-charge');
  const recoInput = document.getElementById('rapport-reco');

  if (motifInput) motifInput.value = profile.motif || 'Bilan cardiologique';
  if (contexteInput) contexteInput.value = profileParts;
  if (constatsInput) constatsInput.value = findingsParts;
  if (careInput) careInput.value = profile.treatment || '';
  if (recoInput) recoInput.value = profile.conclusion || '';

  if (typeof renderRapportPreview === 'function') {
    renderRapportPreview();
  }
}

function switchCardiologyTab(tabName = 'summary') {
  cardiologyCurrentTab = tabName;

  document.querySelectorAll('.cardiology-tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('.cardiology-tab-content').forEach((content) => {
    content.classList.remove('active');
    content.style.display = 'none';
  });

  const activeTab = document.getElementById(`cardiology-tab-${tabName}`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.display = 'block';
  }
}

function formatCardiologyTextBlock(text, emptyText = 'Aucune donnée enregistrée.') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return `<p class="document-live-preview-empty">${escapeHTML(emptyText)}</p>`;
  }

  return normalized
    .split(/\n+/)
    .map((line) => `<p>${escapeHTML(line)}</p>`)
    .join('');
}

function renderCardiologyProfileView(data = {}) {
  const container = document.getElementById('cardiology-profile-view-content');
  if (!container) return;

  const profile = normalizeCardiologyProfile(data);
  const cards = [
    {
      title: 'Contexte clinique',
      body: [
        profile.antecedents ? `Antécédents: ${profile.antecedents}` : '',
        profile.riskFactors ? `Facteurs de risque: ${profile.riskFactors}` : '',
        profile.symptoms ? `Symptômes: ${profile.symptoms}` : '',
        profile.clinicalExam ? `Examen clinique: ${profile.clinicalExam}` : ''
      ].filter(Boolean).join('\n')
    },
    {
      title: 'Explorations',
      body: [
        profile.ecgRest ? `ECG de repos: ${profile.ecgRest}` : '',
        profile.ecgStress ? `ECG d'effort: ${profile.ecgStress}` : '',
        profile.echo ? `Échocardiographie: ${profile.echo}` : '',
        profile.holterMapa ? `Holter / MAPA: ${profile.holterMapa}` : '',
        profile.biology ? `Biologie: ${profile.biology}` : '',
        profile.otherTests ? `Autres examens: ${profile.otherTests}` : ''
      ].filter(Boolean).join('\n')
    },
    {
      title: 'Prise en charge',
      body: profile.treatment
    },
    {
      title: 'Conclusion',
      body: profile.conclusion
    }
  ];

  container.innerHTML = cards.map((card) => `
    <div class="cardiology-profile-view-card">
      <div class="cardiology-profile-view-title">${escapeHTML(card.title)}</div>
      <div class="cardiology-profile-view-body">${formatCardiologyTextBlock(card.body)}</div>
    </div>
  `).join('');
}

async function viewCardiologyProfile(documentId) {
  if (!documentId) return;

  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Bilan cardiologique introuvable', 'error');
      return;
    }

    const doc = docResult.data;
    const profile = normalizeCardiologyProfile(parseDocumentPayload(doc.payload));
    const patientResult = await window.api.patient.getById(doc.patientId);
    const patient = patientResult.success ? patientResult.data : null;

    cardiologyViewState = {
      documentId: doc.id,
      patientId: doc.patientId,
      data: profile
    };

    const patientNameEl = document.getElementById('cardiology-view-patient-name');
    const motifEl = document.getElementById('cardiology-view-motif');
    const dateEl = document.getElementById('cardiology-view-date');
    const bloodPressureEl = document.getElementById('cardiology-view-blood-pressure');

    if (patientNameEl) {
      patientNameEl.textContent = patient
        ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient'
        : 'Patient';
    }
    if (motifEl) motifEl.textContent = profile.motif || 'Bilan cardiologique';
    if (dateEl) dateEl.textContent = formatDateToDDMMYYYY(profile.date) || '-';
    if (bloodPressureEl) bloodPressureEl.textContent = profile.bloodPressure || '-';

    renderCardiologyProfileView(profile);
    showModal('modal-cardiology-profile-view');
  } catch (error) {
    console.error('Error viewing cardiology profile:', error);
    showNotification('Impossible d’ouvrir ce bilan cardiologique', 'error');
  }
}

async function openViewedCardiologyProfileInWorkspace() {
  const patientId = cardiologyViewState.patientId;
  if (!patientId) {
    closeModal('modal-cardiology-profile-view');
    return;
  }

  const viewedProfile = cardiologyViewState.data
    ? normalizeCardiologyProfile(cardiologyViewState.data)
    : null;

  if (typeof showSection === 'function') {
    showSection('cardiology');
  }

  if (typeof window.setSelectedPatient === 'function') {
    await window.setSelectedPatient(patientId, { source: 'cardiology-profile' });
  }

  const selector = document.getElementById('cardiology-patient-selector');
  if (selector) {
    selector.value = patientId;
  }

  await loadCardiologyPatient(patientId);

  if (cardiologyViewState.documentId) {
    cardiologyState.documentId = cardiologyViewState.documentId;
  }

  if (viewedProfile) {
    cardiologyState.data = viewedProfile;
    fillCardiologyProfileForm(viewedProfile);
  }

  switchCardiologyTab('summary');
  closeModal('modal-cardiology-profile-view');

  const cardiologySection = document.getElementById('cardiology');
  if (cardiologySection?.scrollIntoView) {
    cardiologySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.requestAnimationFrame(() => {
    document.getElementById('cardiology-motif')?.focus();
  });
}

window.initCardiology = initCardiology;
window.refreshCardiologyPatientList = refreshCardiologyPatientList;
window.selectCardiologyPatient = selectCardiologyPatient;
window.saveCardiologyProfile = saveCardiologyProfile;
window.resetCardiologyProfile = resetCardiologyProfile;
window.openCardiologyReportWorkspace = openCardiologyReportWorkspace;
window.switchCardiologyTab = switchCardiologyTab;
window.viewCardiologyProfile = viewCardiologyProfile;
window.openViewedCardiologyProfileInWorkspace = openViewedCardiologyProfileInWorkspace;

// ========== LAZY PATIENT SEARCH OVERRIDES ==========

const originalRefreshCardiologyPatientList = refreshCardiologyPatientList;
refreshCardiologyPatientList = async function() {
  const selector = document.getElementById('cardiology-patient-selector');
  if (!selector) return;

  if (typeof window.attachLazyPatientSearchToSelect === 'function') {
    window.attachLazyPatientSearchToSelect('cardiology-patient-selector', {
      selectedPatientId: currentPatientId || cardiologyState.patientId || '',
      placeholder: 'Tapez la premiere lettre du patient...',
      emptyMessage: 'Tapez la premiere lettre du patient',
      loadingMessage: 'Recherche des patients...',
      noResultsMessage: 'Aucun patient commence par cette recherche',
      restoreCommittedOnBlur: true
    });
    return;
  }

  return originalRefreshCardiologyPatientList();
};

const originalLoadCardiologyPatient = loadCardiologyPatient;
loadCardiologyPatient = async function(patientId) {
  if (typeof window.setLazyPatientFieldValue === 'function') {
    window.setLazyPatientFieldValue('cardiology-patient-selector', patientId || '');
  }
  return originalLoadCardiologyPatient(patientId);
};

window.refreshCardiologyPatientList = refreshCardiologyPatientList;

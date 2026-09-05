/**
 * Module Spécialité Cardiologie
 * PhysioCare / MedCareSO Cardiology Edition
 * 2-Column Workspace, Sider Navigation, Grille KPI 2x2, WYSIWYG Report
 */

let currentCardioPatientId = null;

function getCardioStorageKey(patientId) {
  return `cardio_profile_${patientId || 'temp'}`;
}

export async function initCardiology(force = false) {
  console.log('Initializing cardiology module...');

  const selector = document.getElementById('cardio-patient-selector');
  if (!selector) return;

  await refreshCardiologyPatientList();

  const dateInput = document.getElementById('cardio-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  if (window.currentPatientId) {
    await selectCardioPatient(window.currentPatientId, { fromGlobalSync: true });
  } else {
    renderCardioWysiwygReport(false);
  }

  window.removeEventListener('medcare:patient-selected', handleCardioGlobalPatientSelected);
  window.addEventListener('medcare:patient-selected', handleCardioGlobalPatientSelected);

  // Wire step items and subtab buttons directly for guaranteed clickability
  document.querySelectorAll('#cardiology .orl-section-step-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
      const tab = item.dataset.tab;
      if (tab) switchCardioTab(tab);
    });
  });

  document.querySelectorAll('#cardiology .orl-subtab-btn').forEach(btn => {
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', (e) => {
      const subtab = btn.dataset.subtab;
      if (subtab) switchCardioSubTab(currentActiveCardioTab || 'anamnese', subtab);
    });
  });

  document.querySelectorAll('#cardiology .orl-step-dot').forEach(dot => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step, 10);
      if (step) goToCardioStep(step);
    });
  });

  // Initialize AntCollapse on all cardiology collapse groups
  document.querySelectorAll('#cardiology [data-collapse-group]').forEach(group => {
    if (typeof AntCollapse !== 'undefined') {
      AntCollapse.init('#cardiology [data-collapse-group="' + group.dataset.collapseGroup + '"]');
    }
  });

  // Initialize AntCheckableTag for motif & risk presets
  if (typeof AntCheckableTag !== 'undefined') {
    const motifContainer = document.getElementById('cardio-motif-tags');
    if (motifContainer) {
      AntCheckableTag.init(motifContainer, {
        options: ['HTA', 'Douleur thoracique', 'Palpitations', 'Dyspnée', 'Syncope', 'Œdèmes', 'Fatigue', 'Vertiges', 'Souffle', 'Surveillance'],
        targetField: 'cardio-motif',
        multiple: true
      });
    }
    const riskContainer = document.getElementById('cardio-risk-tags');
    if (riskContainer) {
      AntCheckableTag.init(riskContainer, {
        options: ['Tabagisme', 'Diabète', 'Dyslipidémie', 'Obésité', 'Sédentarité', 'Antécédents familiaux', 'Stress', 'Alcool', 'HTA'],
        targetField: 'cardio-risk-factors',
        multiple: true
      });
    }
  }

  // Initialize dropdown for More Actions button
  if (typeof AntDropdown !== 'undefined') {
    const moreBtn = document.getElementById('cardio-more-actions-btn');
    if (moreBtn) {
      AntDropdown.create(moreBtn, [
        { key: 'expand', label: 'Déplier tout', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' },
        { key: 'collapse', label: 'Replier tout', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>' },
        { divider: true },
        { key: 'reset', label: 'Réinitialiser le dossier', danger: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' },
      ], {
        onClick: (key) => {
          if (key === 'expand') {
            const activePane = document.querySelector('#cardiology .ant-tabs-pane.active');
            if (activePane) {
              const selector = '#cardiology .ant-tabs-pane.active .ant-collapse';
              if (typeof AntCollapse !== 'undefined') AntCollapse.expandAll(selector);
            }
          } else if (key === 'collapse') {
            const activePane = document.querySelector('#cardiology .ant-tabs-pane.active');
            if (activePane) {
              const selector = '#cardiology .ant-tabs-pane.active .ant-collapse';
              if (typeof AntCollapse !== 'undefined') AntCollapse.collapseAll(selector);
            }
          } else if (key === 'reset') {
            if (confirm('Réinitialiser tout le dossier cardiologique ? Toutes les modifications non enregistrées seront perdues.')) {
              resetCardioProfile();
            }
          }
        }
      });
    }
  }

  if (selector.dataset.initialized === '1' && !force) return;
  selector.dataset.initialized = '1';
  if (window.currentPatientId && String(currentCardioPatientId || '') !== String(window.currentPatientId)) {
    selector.value = window.currentPatientId;
    await selectCardioPatient(window.currentPatientId, { fromGlobalSync: true });
  }
}

function handleCardioGlobalPatientSelected(e) {
  const patientId = e.detail?.patientId;
  const patient = e.detail?.patient;
  if (patientId && String(patientId) !== String(currentCardioPatientId)) {
    selectCardioPatient(patientId, { patient, fromGlobalSync: true });
  }
}

export async function refreshCardiologyPatientList() {
  const select = document.getElementById('cardio-patient-selector');
  if (!select) return;

  try {
    let patients = [];

    if (window.api?.patient?.getAll) {
      try {
        const res = await window.api.patient.getAll();
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          patients = res.data;
        }
      } catch (e) {
        console.warn('api.patient.getAll error in Cardiology:', e);
      }
    }

    if ((!patients || patients.length === 0) && window.api?.patient?.getDirectory) {
      try {
        const resDir = await window.api.patient.getDirectory();
        if (resDir?.success && Array.isArray(resDir.data)) {
          patients = resDir.data;
        }
      } catch (e) {
        console.warn('api.patient.getDirectory error in Cardiology:', e);
      }
    }

    if ((!patients || patients.length === 0) && Array.isArray(window.patients) && window.patients.length > 0) {
      patients = window.patients;
    }

    const activeId = currentCardioPatientId || window.currentPatientId;
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

    window._cardioPatientsCache = patients;

    const currentVal = select.value || activeId;
    select.innerHTML = '<option value="">-- Sélectionner un patient --</option>';

    patients.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const name = `${p.lastName || ''} ${p.firstName || ''}`.trim() || `Patient #${p.id}`;
      const contact = p.phone || p.cin || 'Sans contact';
      opt.textContent = `${name} (${contact})`;
      select.appendChild(opt);
    });

    if (currentVal && patients.some(p => String(p.id) === String(currentVal))) {
      select.value = String(currentVal);
    }

    if (typeof AntSelect !== 'undefined') {
      AntSelect.destroy(select);
      AntSelect.enhance(select, {
        showSearch: true,
        requireSearch: true,
        minSearchLength: 1,
        maxResults: 10,
        allowClear: true,
        showAvatar: true,
        placeholder: 'Rechercher un patient...',
        searchPromptText: 'Tapez une lettre pour rechercher (max 10)...',
        onSelect: (val) => {
          selectCardioPatient(val, { fromGlobalSync: false });
        }
      });
    }
  } catch (err) {
    console.error('Error loading patients for Cardiology:', err);
  }
}

export async function selectCardioPatient(patientId, options = {}) {
  const normalizedId = patientId ? String(patientId).trim() : null;
  if (!normalizedId) {
    currentCardioPatientId = null;
    updateCardioPatientDisplay(null);
    resetCardioFields();
    const select = document.getElementById('cardio-patient-selector');
    if (select && typeof AntSelect !== 'undefined') {
      AntSelect.setValue(select, '');
    }
    return;
  }

  currentCardioPatientId = normalizedId;
  window.currentPatientId = normalizedId;

  const select = document.getElementById('cardio-patient-selector');
  if (select) {
    let opt = select.querySelector(`option[value="${normalizedId}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = normalizedId;
      opt.textContent = options.patient ? `${options.patient.lastName || ''} ${options.patient.firstName || ''}`.trim() : 'Patient';
      select.appendChild(opt);
    }
    if (typeof AntSelect !== 'undefined') {
      AntSelect.setValue(select, normalizedId);
    } else {
      select.value = normalizedId;
    }
  }

  try {
    let patient = options.patient || (window.currentPatientData && String(window.currentPatientData.id) === normalizedId ? window.currentPatientData : null);
    if (!patient && window.api?.patient?.getById) {
      const res = await window.api.patient.getById(normalizedId);
      if (res?.success && res.data) {
        patient = res.data;
      }
    }

    const patientIdField = document.getElementById('cardio-patient-id');
    if (patientIdField) patientIdField.value = normalizedId;

    if (patient) {
      window.currentPatientData = patient;
      updateCardioPatientDisplay(patient);
      await loadCardioProfile(normalizedId);
      renderCardioSiderHistory(normalizedId);
      renderCardioWysiwygReport(true);

      if (!options.fromGlobalSync && typeof window.setSelectedPatient === 'function') {
        window.setSelectedPatient(normalizedId, { patient, source: 'cardiology' });
      }
    } else {
      renderCardioWysiwygReport(true);
    }
  } catch (e) {
    console.error('Error in selectCardioPatient:', e);
    renderCardioWysiwygReport(true);
  }
}

export async function selectCardiologyPatient(patientId) {
  await selectCardioPatient(patientId);
}

function updateCardioPatientDisplay(patient) {
  const display = document.getElementById('cardio-current-patient-display');
  const avatar = document.getElementById('cardio-patient-avatar');

  if (!patient) {
    if (display) display.textContent = 'Aucun patient sélectionné';
    if (avatar) {
      avatar.style.backgroundColor = '#d9d9d9';
      avatar.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }
    return;
  }

  const name = `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || `Patient #${patient.id}`;
  if (avatar) {
    avatar.style.backgroundColor = '#1677ff';
    const initials = `${(patient.lastName || '').charAt(0)}${(patient.firstName || '').charAt(0)}`.trim().toUpperCase() || 'P';
    avatar.textContent = initials;
  }

  const details = [];
  const dossierNum = formatCardioDossierNumber(patient);
  if (dossierNum && dossierNum !== '—') details.push(dossierNum);
  if (patient.age || patient.birthDate) {
    const ageVal = patient.age || (typeof calculatePatientAgeYears === 'function' ? calculatePatientAgeYears(patient.birthDate) : null);
    if (ageVal) details.push(`${ageVal} ans`);
  }
  if (patient.phone) details.push(patient.phone);
  if (patient.cin) details.push(`CIN: ${patient.cin}`);
  if (patient.gender) details.push(patient.gender === 'female' || patient.gender === 'F' ? 'Femme' : (patient.gender === 'male' || patient.gender === 'M' ? 'Homme' : ''));

  const filteredDetails = details.filter(Boolean);
  const extra = filteredDetails.length > 0 ? ` — ${filteredDetails.join(' • ')}` : '';
  if (display) display.textContent = `${name}${extra}`;
}

function renderCardioSiderHistory(patientId) {
  const box = document.getElementById('cardio-sider-history-box');
  const itemsContainer = document.getElementById('cardio-sider-history-items');
  if (!box || !itemsContainer) return;

  if (!patientId) {
    box.style.display = 'none';
    itemsContainer.innerHTML = '';
    return;
  }

  const history = getCardioHistory(patientId);
  if (!history || history.length === 0) {
    box.style.display = 'none';
    itemsContainer.innerHTML = '';
    return;
  }

  box.style.display = 'block';
  itemsContainer.innerHTML = history.slice(0, 5).map((item, index) => {
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const motif = item.motif || 'Bilan cardiologique';
    return `
      <div onclick="loadCardioHistoricalReport(${index})" style="padding: 4px 6px; background: #ffffff; border: 1px solid #f0f0f0; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; transition: border-color 0.2s;" title="Charger ce bilan (${formattedDate})">
        <span style="font-weight: 600; color: #1677ff;">${formattedDate}</span>
        <span style="color: rgba(0,0,0,0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">${motif}</span>
      </div>
    `;
  }).join('');
}

export const CARDIO_TAB_LIST = [
  { id: 'anamnese', label: '1. Anamnèse & FRCV', step: 1 },
  { id: 'clinical', label: '2. Examen & Constantes', step: 2 },
  { id: 'ecg', label: '3. ECG & Rythme', step: 3 },
  { id: 'echo', label: '4. Échographie & Doppler', step: 4 },
  { id: 'effort', label: '5. Effort & Holter', step: 5 },
  { id: 'conclusion', label: '6. Diagnostic & Traitement', step: 6 },
  { id: 'report', label: '7. Compte-Rendu & Impression', step: 7 }
];

let currentActiveCardioTab = 'anamnese';
const cardioIncludedSubjects = new Set(['motif', 'conclusion']);

export function toggleCardioSubject(subjectKey, forceState = null) {
  const isIncluded = forceState !== null ? forceState : !cardioIncludedSubjects.has(subjectKey);
  if (isIncluded) {
    cardioIncludedSubjects.add(subjectKey);
  } else {
    cardioIncludedSubjects.delete(subjectKey);
  }

  document.querySelectorAll(`.orl-add-subject-btn[data-subject="${subjectKey}"]`).forEach(btn => {
    btn.classList.toggle('is-included', isIncluded);
    const icon = btn.querySelector('.plus-icon');
    const text = btn.querySelector('.btn-text');
    if (icon) icon.textContent = isIncluded ? '✓' : '+';
    if (text) text.textContent = isIncluded ? 'Inclus au rapport' : 'Ajouter au rapport';
  });

  renderCardioWysiwygReport(true);
  updateCardioSectionStepStatus();

  if (typeof showNotification === 'function') {
    const actionLabel = isIncluded ? '✓ Ajouté au compte-rendu' : 'Retiré du compte-rendu';
    showNotification(`${actionLabel} : ${subjectKey}`, isIncluded ? 'success' : 'info');
  }
}

export function isCardioSubjectIncluded(subjectKey) {
  return cardioIncludedSubjects.has(subjectKey);
}

export function getCurrentCardioTab() {
  return currentActiveCardioTab;
}

export function goToNextCardioTab() {
  const currentIndex = CARDIO_TAB_LIST.findIndex(t => t.id === currentActiveCardioTab);
  if (currentIndex >= 0 && currentIndex < CARDIO_TAB_LIST.length - 1) {
    switchCardioTab(CARDIO_TAB_LIST[currentIndex + 1].id);
  }
}

export function goToPrevCardioTab() {
  const currentIndex = CARDIO_TAB_LIST.findIndex(t => t.id === currentActiveCardioTab);
  if (currentIndex > 0) {
    switchCardioTab(CARDIO_TAB_LIST[currentIndex - 1].id);
  }
}

export function goToCardioStep(stepNumber) {
  const target = CARDIO_TAB_LIST.find(t => t.step === stepNumber);
  if (target) {
    switchCardioTab(target.id);
  }
}

export function addCurrentCardioTabToReport(tabName = currentActiveCardioTab) {
  const tabSubjectsMap = {
    anamnese: ['motif', 'antecedents', 'risques', 'symptomes'],
    clinical: ['clinical', 'auscultation', 'omi'],
    ecg: ['ecg', 'rythme'],
    echo: ['echo', 'doppler'],
    effort: ['effort', 'holter', 'mapa'],
    conclusion: ['conclusion', 'traitement', 'ordonnance']
  };

  const subjects = tabSubjectsMap[tabName] || [tabName];
  subjects.forEach(s => cardioIncludedSubjects.add(s));

  subjects.forEach(s => {
    document.querySelectorAll(`.orl-add-subject-btn[data-subject="${s}"]`).forEach(btn => {
      btn.classList.add('is-included');
      const icon = btn.querySelector('.plus-icon');
      const text = btn.querySelector('.btn-text');
      if (icon) icon.textContent = '✓';
      if (text) text.textContent = 'Inclus au rapport';
    });
  });

  renderCardioWysiwygReport(true);
  updateCardioSectionStepStatus();

  if (typeof showNotification === 'function') {
    showNotification('Étape ajoutée au compte-rendu médical', 'success');
  }
}

export function switchCardioSubTab(sectionId, subTabId) {
  const sectionEl = document.getElementById('cardio-tab-' + sectionId);
  if (!sectionEl) return;

  sectionEl.querySelectorAll('.orl-subtab-btn').forEach(btn => {
    const isTarget = btn.dataset.subtab === subTabId;
    btn.classList.toggle('active', isTarget);
  });

  sectionEl.querySelectorAll('.orl-subtab-pane').forEach(pane => {
    const isTarget = pane.dataset.subtab === subTabId;
    pane.classList.toggle('active', isTarget);
    pane.style.display = isTarget ? 'block' : 'none';
  });

  const headerAddBtn = sectionEl.querySelector('.orl-master-card-header .orl-add-subject-btn');
  if (headerAddBtn) {
    headerAddBtn.dataset.subject = subTabId;
    headerAddBtn.setAttribute('onclick', `event.stopPropagation(); toggleCardioSubject('${subTabId}')`);
    const isInc = isCardioSubjectIncluded(subTabId);
    headerAddBtn.classList.toggle('is-included', isInc);
    const icon = headerAddBtn.querySelector('.plus-icon');
    const text = headerAddBtn.querySelector('.btn-text');
    if (icon) icon.textContent = isInc ? '✓' : '+';
    if (text) text.textContent = isInc ? 'Inclus au rapport' : 'Ajouter au rapport';
  }
}

export function switchCardioTab(tabName) {
  currentActiveCardioTab = tabName;

  document.querySelectorAll('#cardiology .orl-section-step-item, #cardiology .orl-tab-pill-btn').forEach(btn => {
    btn.classList.remove('active');
    const tab = btn.dataset.tab;
    const onclickAttr = btn.getAttribute('onclick') || '';
    if (tab === tabName || onclickAttr.includes(`'${tabName}'`) || onclickAttr.includes(`"${tabName}"`)) {
      btn.classList.add('active');
    }
  });

  const currentStep = CARDIO_TAB_LIST.find(t => t.id === tabName)?.step || 1;
  document.querySelectorAll('#cardiology .orl-step-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step, 10);
    dot.classList.toggle('active', dotStep === currentStep);
    dot.classList.toggle('completed', dotStep < currentStep);
  });

  const stepIndicator = document.getElementById('cardio-step-indicator');
  if (stepIndicator) {
    stepIndicator.textContent = `Étape ${currentStep} sur ${CARDIO_TAB_LIST.length}`;
  }

  document.querySelectorAll('#cardiology .ant-tabs-pane').forEach(pane => {
    pane.classList.remove('active');
    pane.style.display = 'none';
  });
  const activePane = document.getElementById('cardio-tab-' + tabName);
  if (activePane) {
    activePane.classList.add('active');
    activePane.style.display = 'block';
  }

  if (tabName === 'report') {
    renderCardioWysiwygReport();
  }
}

export async function loadCardioProfile(patientId) {
  if (!patientId) return;

  try {
    // 1. Try document-based profile from DB (preferred)
    let profileData = null;
    let documentId = null;
    if (window.api?.document?.getByType) {
      try {
        const res = await window.api.document.getByType({ patientId, documentType: 'cardiology_profile' });
        if (res?.success && res.data) {
          profileData = res.data;
          documentId = res.data.id;
        }
      } catch (e) {
        console.warn('getByType error in loadCardioProfile:', e);
      }
    }

    // 2. Fallback to localStorage
    let data = null;
    if (profileData) {
      data = typeof parseDocumentPayload === 'function'
        ? parseDocumentPayload(profileData.payload)
        : (typeof profileData.payload === 'string' ? JSON.parse(profileData.payload || '{}') : profileData.payload);
    }
    if (!data) {
      try {
        const raw = localStorage.getItem(getCardioStorageKey(patientId));
        data = raw ? JSON.parse(raw) : null;
      } catch (_) {}
    }

    const dateInput = document.getElementById('cardio-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    if (data) {
      setCardioVal('cardio-motif', data.motif);
      setCardioVal('cardio-date', data.date || new Date().toISOString().split('T')[0]);
      setCardioVal('cardio-antecedents', data.antecedents);
      setCardioVal('cardio-antecedents-chirurgicaux', data.antecedentsChirurgicaux);
      setCardioVal('cardio-risk-factors', data.riskFactors);
      setCardioVal('cardio-symptoms', data.symptoms);
      setCardioVal('cardio-blood-pressure', data.bloodPressure);
      setCardioVal('cardio-heart-rate', data.heartRate);
      setCardioVal('cardio-spo2', data.spo2);
      setCardioVal('cardio-weight', data.weight);
      setCardioVal('cardio-auscultation', data.auscultation);
      setCardioVal('cardio-omi', data.omi);
      setCardioVal('cardio-clinical-exam', data.clinicalExam);
      setCardioVal('cardio-ecg-rest', data.ecgRest);
      setCardioVal('cardio-ecg-rythme', data.ecgRythme);
      setCardioVal('cardio-echo', data.echo);
      setCardioVal('cardio-doppler', data.doppler);
      setCardioVal('cardio-ecg-stress', data.ecgStress);
      setCardioVal('cardio-holter-rythmique', data.holterRythmique || data.holter);
      setCardioVal('cardio-mapa', data.mapa);
      setCardioVal('cardio-diagnosis', data.diagnosis);
      setCardioVal('cardio-conclusion', data.conclusion);
      setCardioVal('cardio-treatment', data.treatment);
      setCardioVal('cardio-biology', data.biology);
      setCardioVal('cardio-other-tests', data.otherTests);
      setCardioVal('cardio-followup', data.followup);

      const editor = document.getElementById('cardio-wysiwyg-editor');
      if (editor && data.reportWysiwygHtml) {
        editor.innerHTML = data.reportWysiwygHtml;
      }

      updateCardioStats(data);
    } else {
      resetCardioFields();
      setCardioVal('cardio-date', new Date().toISOString().split('T')[0]);
    }

    updateCardioSectionStepStatus();
  } catch (err) {
    console.error('Error loading cardiology data:', err);
  }
}

function setCardioVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val !== undefined && val !== null ? String(val) : '';
}

function getCardioVal(id) {
  return document.getElementById(id)?.value || '';
}

let currentCardioEditingReportId = null;

export function saveCardiologyProfile() {
  if (!currentCardioPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient avant d\'enregistrer', 'warning');
    }
    return;
  }

  const data = {
    patientId: currentCardioPatientId,
    motif: getCardioVal('cardio-motif'),
    date: getCardioVal('cardio-date') || new Date().toISOString().split('T')[0],
    antecedents: getCardioVal('cardio-antecedents'),
    antecedentsChirurgicaux: getCardioVal('cardio-antecedents-chirurgicaux'),
    riskFactors: getCardioVal('cardio-risk-factors'),
    symptoms: getCardioVal('cardio-symptoms'),
    bloodPressure: getCardioVal('cardio-blood-pressure'),
    heartRate: getCardioVal('cardio-heart-rate'),
    spo2: getCardioVal('cardio-spo2'),
    weight: getCardioVal('cardio-weight'),
    auscultation: getCardioVal('cardio-auscultation'),
    omi: getCardioVal('cardio-omi'),
    clinicalExam: getCardioVal('cardio-clinical-exam'),
    ecgRest: getCardioVal('cardio-ecg-rest'),
    ecgRythme: getCardioVal('cardio-ecg-rythme'),
    echo: getCardioVal('cardio-echo'),
    doppler: getCardioVal('cardio-doppler'),
    ecgStress: getCardioVal('cardio-ecg-stress'),
    holterRythmique: getCardioVal('cardio-holter-rythmique'),
    mapa: getCardioVal('cardio-mapa'),
    diagnosis: getCardioVal('cardio-diagnosis'),
    conclusion: getCardioVal('cardio-conclusion'),
    treatment: getCardioVal('cardio-treatment'),
    biology: getCardioVal('cardio-biology'),
    otherTests: getCardioVal('cardio-other-tests'),
    followup: getCardioVal('cardio-followup'),
    reportWysiwygHtml: document.getElementById('cardio-wysiwyg-editor')?.innerHTML || '',
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(getCardioStorageKey(currentCardioPatientId), JSON.stringify(data));
  saveCardioHistoryEntry(currentCardioPatientId, data, currentCardioEditingReportId);

  // Persist to DB as a cardiology_profile document (best-effort)
  if (window.api?.document?.save) {
    try {
      window.api.document.save({
        patientId: currentCardioPatientId,
        documentType: 'cardiology_profile',
        title: data.motif || 'Bilan cardiologique',
        data
      }).then((result) => {
        if (result?.success) {
          currentCardioEditingReportId = result.id || currentCardioEditingReportId;
        }
      });
    } catch (e) {
      console.warn('DB save error in saveCardiologyProfile:', e);
    }
  }

  if (typeof showNotification === 'function') {
    showNotification('Bilan cardiologique sauvegardé avec succès', 'success');
  }

  updateCardioStats(data);
  updateCardioSectionStepStatus();
  renderCardioSiderHistory(currentCardioPatientId);
}

function getCardioHistoryStorageKey(patientId) {
  return `cardio_history_${patientId}`;
}

function getCardioHistory(patientId) {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(getCardioHistoryStorageKey(patientId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCardioHistoryEntry(patientId, snapshotData, existingEntryId = null) {
  if (!patientId) return;
  try {
    const list = getCardioHistory(patientId);

    if (existingEntryId) {
      const idx = list.findIndex(e => e.id === existingEntryId);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          savedAt: new Date().toISOString(),
          date: snapshotData.date || list[idx].date,
          motif: snapshotData.motif || list[idx].motif,
          diagnosis: snapshotData.diagnosis || list[idx].diagnosis,
          data: snapshotData
        };
        localStorage.setItem(getCardioHistoryStorageKey(patientId), JSON.stringify(list));
        return list;
      }
    }

    const newEntry = {
      id: 'cardio_rep_' + Date.now(),
      savedAt: new Date().toISOString(),
      date: snapshotData.date || new Date().toISOString().split('T')[0],
      motif: snapshotData.motif || 'Bilan cardiologique',
      diagnosis: snapshotData.diagnosis || 'Bilan standard',
      data: snapshotData
    };
    list.unshift(newEntry);
    if (list.length > 50) list.length = 50;
    localStorage.setItem(getCardioHistoryStorageKey(patientId), JSON.stringify(list));
    currentCardioEditingReportId = newEntry.id;
    return list;
  } catch (e) {
    console.error('Error saving cardiology history:', e);
  }
}

function updateCardioStats(data) {
  const lastReport = document.getElementById('cardio-stat-last-report');
  if (lastReport) lastReport.textContent = data.date ? new Date(data.date).toLocaleDateString('fr-FR') : '-';

  const bp = document.getElementById('cardio-stat-blood-pressure');
  if (bp) bp.textContent = data.bloodPressure || '-';

  const history = currentCardioPatientId ? getCardioHistory(currentCardioPatientId) : [];
  const rapportCount = document.getElementById('cardio-stat-rapport-count');
  if (rapportCount) rapportCount.textContent = `${Math.max(history.length, 0)}`;

  const orientationCount = document.getElementById('cardio-stat-orientation-count');
  if (orientationCount) orientationCount.textContent = '0';
}

/**
 * =========================================================================
 * HISTORIQUE DES BILANS CARDIOLOGIQUES
 * =========================================================================
 */

export async function openCardioReportHistoryModal() {
  const modal = document.getElementById('cardio-report-history-modal');
  if (!modal) return;

  const subtitle = document.getElementById('cardio-history-patient-subtitle');
  const body = document.getElementById('cardio-history-list-body');

  let patient = window.currentPatientData;
  if (!patient && currentCardioPatientId && window.api?.patient?.getById) {
    try {
      const res = await window.api.patient.getById(currentCardioPatientId);
      if (res?.success) patient = res.data;
    } catch (_) {}
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (document.getElementById('cardio-current-patient-display')?.textContent || 'Patient non sélectionné');
  if (subtitle) {
    subtitle.innerHTML = currentCardioPatientId ? `Patient : <strong>${patientName}</strong> (#${currentCardioPatientId})` : `Patient : <em>Aucun patient sélectionné</em>`;
  }

  if (!currentCardioPatientId) {
    if (body) {
      body.innerHTML = `
        <div style="padding: 40px 20px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.88);">Aucun patient sélectionné</div>
          <div style="font-size: 12.5px; color: rgba(0,0,0,0.45); margin-top: 4px;">Veuillez d'abord sélectionner un patient pour consulter l'historique de ses bilans.</div>
        </div>
      `;
    }
    modal.style.display = 'flex';
    return;
  }

  let history = getCardioHistory(currentCardioPatientId);

  if (history.length === 0) {
    const raw = localStorage.getItem(getCardioStorageKey(currentCardioPatientId));
    if (raw) {
      try {
        const initialData = JSON.parse(raw);
        saveCardioHistoryEntry(currentCardioPatientId, initialData);
      } catch (_) {}
    }
  }

  const updatedHistory = getCardioHistory(currentCardioPatientId);

  if (updatedHistory.length === 0) {
    if (body) {
      body.innerHTML = `
        <div style="padding: 40px 20px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
          <div style="font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.88);">Aucun bilan enregistré</div>
          <div style="font-size: 12.5px; color: rgba(0,0,0,0.45); margin-top: 4px;">Enregistrez un premier bilan cardiologique pour ce patient pour créer un historique.</div>
        </div>
      `;
    }
    modal.style.display = 'flex';
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 12px;">`;

  updatedHistory.forEach((item, index) => {
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const savedTime = item.savedAt ? new Date(item.savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const diagnosis = item.diagnosis || 'Bilan standard';
    const motif = item.motif || 'Bilan cardiologique';

    html += `
      <div style="background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: border-color 0.2s; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span class="ant-tag ant-tag-processing" style="background: #e6f0ff; color: #1677ff; border-color: #91caff; font-weight: 600;">
              ${formattedDate} ${savedTime ? `(${savedTime})` : ''}
            </span>
            <span class="ant-tag" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f;">Cardiologie</span>
          </div>
          <div style="font-size: 13.5px; font-weight: 700; color: rgba(0,0,0,0.88); margin-bottom: 2px;">
            ${motif}
          </div>
          <div style="font-size: 12.5px; color: rgba(0,0,0,0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <strong style="color: rgba(0,0,0,0.88);">Diagnostic :</strong> ${diagnosis}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button type="button" class="btn btn-primary" onclick="editCardioHistoricalReport(${index})" style="height: 32px; padding: 0 12px; font-size: 12.5px; display: flex; align-items: center; gap: 5px; background: #1677ff; border-color: #1677ff;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Modifier
          </button>
          <button type="button" class="btn" onclick="loadCardioHistoricalReport(${index})" style="height: 32px; padding: 0 10px; font-size: 12.5px; display: flex; align-items: center; gap: 4px;" title="Charger les formulaires d'examen">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Charger
          </button>
          <button type="button" class="btn" onclick="previewCardioHistoricalReport(${index})" style="height: 32px; padding: 0 10px; font-size: 12.5px;" title="Aperçu avant impression">
            Aperçu
          </button>
          <button type="button" class="btn btn-danger" onclick="deleteCardioHistoricalReport(${index})" style="height: 32px; width: 32px; padding: 0; color: #ff4d4f; border-color: #ffccc7;" title="Supprimer">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="display: block; margin: 0 auto;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  if (body) body.innerHTML = html;
  modal.style.display = 'flex';
}

export function closeCardioReportHistoryModal() {
  const modal = document.getElementById('cardio-report-history-modal');
  if (modal) modal.style.display = 'none';
}

export function editCardioHistoricalReport(index) {
  if (!currentCardioPatientId) return;
  const history = getCardioHistory(currentCardioPatientId);
  const entry = history[index];
  if (!entry || !entry.data) return;

  currentCardioEditingReportId = entry.id;
  loadCardioHistoricalReport(index);
  closeCardioReportHistoryModal();
  switchCardioTab('report');

  if (typeof showNotification === 'function') {
    showNotification(`Bilan du ${entry.date || ''} ouvert en mode édition`, 'info');
  }
}

export function loadCardioHistoricalReport(index) {
  if (!currentCardioPatientId) return;
  const history = getCardioHistory(currentCardioPatientId);
  const entry = history[index];
  if (!entry || !entry.data) return;

  const data = entry.data;

  setCardioVal('cardio-motif', data.motif);
  setCardioVal('cardio-date', data.date || new Date().toISOString().split('T')[0]);
  setCardioVal('cardio-antecedents', data.antecedents);
  setCardioVal('cardio-antecedents-chirurgicaux', data.antecedentsChirurgicaux);
  setCardioVal('cardio-risk-factors', data.riskFactors);
  setCardioVal('cardio-symptoms', data.symptoms);
  setCardioVal('cardio-blood-pressure', data.bloodPressure);
  setCardioVal('cardio-heart-rate', data.heartRate);
  setCardioVal('cardio-spo2', data.spo2);
  setCardioVal('cardio-weight', data.weight);
  setCardioVal('cardio-auscultation', data.auscultation);
  setCardioVal('cardio-omi', data.omi);
  setCardioVal('cardio-clinical-exam', data.clinicalExam);
  setCardioVal('cardio-ecg-rest', data.ecgRest);
  setCardioVal('cardio-ecg-rythme', data.ecgRythme);
  setCardioVal('cardio-echo', data.echo);
  setCardioVal('cardio-doppler', data.doppler);
  setCardioVal('cardio-ecg-stress', data.ecgStress);
  setCardioVal('cardio-holter-rythmique', data.holterRythmique || data.holter);
  setCardioVal('cardio-mapa', data.mapa);
  setCardioVal('cardio-diagnosis', data.diagnosis);
  setCardioVal('cardio-conclusion', data.conclusion);
  setCardioVal('cardio-treatment', data.treatment);
  setCardioVal('cardio-biology', data.biology);
  setCardioVal('cardio-other-tests', data.otherTests);
  setCardioVal('cardio-followup', data.followup);

  const editor = document.getElementById('cardio-wysiwyg-editor');
  if (editor && data.reportWysiwygHtml) {
    editor.innerHTML = data.reportWysiwygHtml;
  }

  updateCardioStats(data);
  updateCardioSectionStepStatus();
  closeCardioReportHistoryModal();

  if (typeof showNotification === 'function') {
    showNotification(`Bilan du ${entry.date || 'consultation'} chargé dans le dossier`, 'success');
  }
}

export function previewCardioHistoricalReport(index) {
  loadCardioHistoricalReport(index);
  openCardioPrintPreview();
}

export function deleteCardioHistoricalReport(index) {
  if (!currentCardioPatientId) return;
  if (!confirm('Supprimer ce bilan de l\'historique ?')) return;

  const history = getCardioHistory(currentCardioPatientId);
  history.splice(index, 1);
  localStorage.setItem(getCardioHistoryStorageKey(currentCardioPatientId), JSON.stringify(history));

  openCardioReportHistoryModal();
  if (typeof showNotification === 'function') {
    showNotification('Bilan supprimé de l\'historique', 'info');
  }
}

/**
 * =========================================================================
 * WYSIWYG COMPTE-RENDU CARDIOLOGIQUE
 * =========================================================================
 */

export function genererContenuCardioInitial() {
  const motif = getCardioVal('cardio-motif');
  const antecedents = getCardioVal('cardio-antecedents');
  const antecedentsChir = getCardioVal('cardio-antecedents-chirurgicaux');
  const riskFactors = getCardioVal('cardio-risk-factors');
  const symptoms = getCardioVal('cardio-symptoms');

  const bloodPressure = getCardioVal('cardio-blood-pressure');
  const heartRate = getCardioVal('cardio-heart-rate');
  const spo2 = getCardioVal('cardio-spo2');
  const auscultation = getCardioVal('cardio-auscultation');
  const omi = getCardioVal('cardio-omi');
  const clinicalExam = getCardioVal('cardio-clinical-exam');

  const ecgRest = getCardioVal('cardio-ecg-rest');
  const ecgRythme = getCardioVal('cardio-ecg-rythme');

  const echo = getCardioVal('cardio-echo');
  const doppler = getCardioVal('cardio-doppler');

  const ecgStress = getCardioVal('cardio-ecg-stress');
  const holterRythmique = getCardioVal('cardio-holter-rythmique');
  const mapa = getCardioVal('cardio-mapa');

  const diagnosis = getCardioVal('cardio-diagnosis');
  const treatment = getCardioVal('cardio-treatment');
  const biology = getCardioVal('cardio-biology');
  const otherTests = getCardioVal('cardio-other-tests');
  const followup = getCardioVal('cardio-followup');
  const conclusion = getCardioVal('cardio-conclusion');

  let html = '';

  if (isCardioSubjectIncluded('motif') || motif || antecedents || riskFactors || symptoms) {
    html += `<h3>1. Motif de Consultation & Anamnèse</h3>`;
    html += `<p><strong>Motif :</strong> ${motif || 'Consultation et bilan cardiologique spécialisé.'}</p>`;
    if (antecedents || antecedentsChir || riskFactors) {
      html += `<p><strong>Antécédents :</strong> ${[antecedents, antecedentsChir ? `Chirurgicaux: ${antecedentsChir}` : '', riskFactors ? `Facteurs de risque: ${riskFactors}` : ''].filter(Boolean).join(' • ')}</p>`;
    }
    if (symptoms) html += `<p><strong>Symptômes :</strong> ${symptoms}</p>`;
  }

  if (isCardioSubjectIncluded('clinical') || isCardioSubjectIncluded('auscultation') || isCardioSubjectIncluded('omi') || bloodPressure || heartRate || auscultation || omi || clinicalExam) {
    html += `<h3>2. Examen Clinique & Constantes Vitales</h3>`;
    if (bloodPressure || heartRate || spo2) {
      html += `<p><strong>Constantes :</strong> ${[bloodPressure ? `TA: ${bloodPressure}` : '', heartRate ? `FC: ${heartRate}` : '', spo2 ? `SpO₂: ${spo2}` : ''].filter(Boolean).join(' | ')}</p>`;
    }
    if (auscultation) html += `<p><strong>Auscultation cardiaque :</strong> ${auscultation}</p>`;
    if (omi) html += `<p><strong>OMI & congestion :</strong> ${omi}</p>`;
    if (clinicalExam) html += `<p><strong>Examen clinique :</strong> ${clinicalExam}</p>`;
  }

  if (isCardioSubjectIncluded('ecg') || isCardioSubjectIncluded('rythme') || ecgRest || ecgRythme) {
    html += `<h3>3. Électrocardiogramme & Rythme</h3>`;
    if (ecgRest) html += `<p><strong>ECG de repos :</strong> ${ecgRest}</p>`;
    if (ecgRythme) html += `<p><strong>Rythme & conduction :</strong> ${ecgRythme}</p>`;
  }

  if (isCardioSubjectIncluded('echo') || isCardioSubjectIncluded('doppler') || echo || doppler) {
    html += `<h3>4. Échocardiographie & Doppler</h3>`;
    if (echo) html += `<p><strong>Échocardiographie :</strong> ${echo}</p>`;
    if (doppler) html += `<p><strong>Doppler & pressions :</strong> ${doppler}</p>`;
  }

  if (isCardioSubjectIncluded('effort') || isCardioSubjectIncluded('holter') || isCardioSubjectIncluded('mapa') || ecgStress || holterRythmique || mapa) {
    html += `<h3>5. Épreuve d'Effort & Holter</h3>`;
    if (ecgStress) html += `<p><strong>Épreuve d'effort :</strong> ${ecgStress}</p>`;
    if (holterRythmique) html += `<p><strong>Holter ECG :</strong> ${holterRythmique}</p>`;
    if (mapa) html += `<p><strong>MAPA :</strong> ${mapa}</p>`;
  }

  if (isCardioSubjectIncluded('conclusion') || isCardioSubjectIncluded('traitement') || diagnosis || treatment || conclusion) {
    html += `<h3>6. Conclusion Diagnostique & Prescriptions</h3>`;
    html += `<p><strong>Diagnostic principal :</strong> ${diagnosis || 'Bilan cardiologique sans anomalie évolutive majeure.'}</p>`;
    if (treatment) html += `<p><strong>Traitement :</strong> ${treatment}</p>`;
    if (biology) html += `<p><strong>Biologie :</strong> ${biology}</p>`;
    if (otherTests) html += `<p><strong>Autres examens :</strong> ${otherTests}</p>`;
    if (followup) html += `<p><strong>Suivi :</strong> ${followup}</p>`;
    if (conclusion) html += `<p><strong>Conclusion :</strong> ${conclusion}</p>`;
  }

  return html;
}

export function formatCardioDossierNumber(patient) {
  if (!patient) return currentCardioPatientId ? `#${currentCardioPatientId}` : '—';

  const rawName = (patient.lastName || patient.firstName || '').trim().toUpperCase();
  const nameCode = rawName.replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PAT';

  let birthCode = '';
  if (patient.birthDate) {
    const d = new Date(patient.birthDate);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      birthCode = `${day}${month}${year}`;
    }
  }

  if (birthCode) {
    return `DOS-${nameCode}-${birthCode}`;
  }

  const idShort = patient.id ? String(patient.id).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() : '01';
  return `DOS-${nameCode}-${idShort}`;
}

export async function renderCardioWysiwygReport(forceRegenerate = false) {
  const clinicHeaderEl = document.getElementById('cardio-wysiwyg-clinic-header');
  const patientBannerEl = document.getElementById('cardio-wysiwyg-patient-banner');
  const reportTitleEl = document.getElementById('cardio-report-title');
  const editorEl = document.getElementById('cardio-wysiwyg-editor');
  if (!editorEl) return;

  let settings = {};
  if (window.api?.settings?.get) {
    try {
      const sRes = await window.api.settings.get();
      if (sRes?.success && sRes.data) settings = sRes.data;
    } catch (_) {}
  }

  const rawDoctor = settings.doctorName
    || window.currentUserData?.fullName
    || localStorage.getItem('doctor_name')
    || localStorage.getItem('currentUsername')
    || 'Médecin Spécialiste';

  const doctorTitle = rawDoctor.toLowerCase().startsWith('dr') ? rawDoctor : `Dr. ${rawDoctor}`;
  const cabinetName = settings.cabinetName || "Cabinet Médical de Cardiologie";
  const cabinetPhone = settings.cabinetPhone || '';
  const cabinetAddress = settings.cabinetAddress || '';
  const doctorSpecialty = settings.doctorSpecialty || 'Cardiologie & Explorations Cardiovasculaires';

  let patient = window.currentPatientData;
  if ((!patient || (currentCardioPatientId && String(patient.id) !== String(currentCardioPatientId))) && currentCardioPatientId) {
    if (window.api?.patient?.getById) {
      try {
        const res = await window.api.patient.getById(currentCardioPatientId);
        if (res?.success && res.data) {
          patient = res.data;
          window.currentPatientData = patient;
        }
      } catch (_) {}
    }
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (currentCardioPatientId ? `Patient #${currentCardioPatientId}` : 'AUCUN PATIENT SÉLECTIONNÉ');

  let patientBirth = '—';
  let patientAge = '—';
  if (patient?.birthDate) {
    patientBirth = new Date(patient.birthDate).toLocaleDateString('fr-FR');
    if (patient.age) {
      patientAge = `${patient.age} ans`;
    } else {
      const bYear = new Date(patient.birthDate).getFullYear();
      if (!isNaN(bYear)) patientAge = `${new Date().getFullYear() - bYear} ans`;
    }
  } else if (patient?.age) {
    patientAge = `${patient.age} ans`;
  }

  let patientGender = '—';
  if (patient?.gender === 'female' || patient?.gender === 'F' || patient?.gender === 'Femme') {
    patientGender = 'Féminin';
  } else if (patient?.gender === 'male' || patient?.gender === 'M' || patient?.gender === 'Homme') {
    patientGender = 'Masculin';
  } else if (patient?.gender) {
    patientGender = patient.gender;
  }

  const patientPhone = patient?.phone || '—';
  const patientCin = patient?.cin || '—';
  const rawDateExam = document.getElementById('cardio-date')?.value;
  const dateExam = rawDateExam ? new Date(rawDateExam).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dossierNumber = formatCardioDossierNumber(patient);
  const patientIdDisplay = patient?.id || currentCardioPatientId || '—';

  if (clinicHeaderEl) {
    clinicHeaderEl.innerHTML = `
      <div style="padding-bottom: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827;">
        <div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #111827;">
            ${doctorTitle}
          </h1>
          <p style="margin: 3px 0 0 0; font-size: 13px; font-weight: 600; color: #374151;">
            ${doctorSpecialty}
          </p>
          <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">
            Explorations Cardiovasculaires • ECG • Échographie ${cabinetPhone ? `• Tél: ${cabinetPhone}` : ''}
          </p>
          ${cabinetAddress ? `<p style="margin: 2px 0 0 0; font-size: 10.5px; color: #9ca3af;">${cabinetAddress}</p>` : ''}
        </div>
        <div style="text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5;">
          <p style="margin: 0; font-weight: 700; color: #111827; font-size: 13px;">${cabinetName}</p>
          <p style="margin: 0;">Date du rapport : <strong>${dateExam}</strong></p>
          <p style="margin: 0;">Dossier N° : <strong style="color: #1677ff; font-family: monospace; font-size: 12.5px;">${dossierNumber}</strong></p>
        </div>
      </div>
    `;
  }

  if (patientBannerEl) {
    patientBannerEl.innerHTML = `
      <div style="background: #ffffff; border: 1px solid #374151; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 12.5px; color: #111827;">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;">
          <div><span>Patient :</span> <strong style="font-size: 13px; text-transform: uppercase; color: #111827;">${patientName}</strong></div>
          <div><span>Né(e) le / Âge :</span> <strong>${patientBirth} (${patientAge})</strong></div>
          <div><span>Genre :</span> <strong>${patientGender}</strong></div>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #e5e7eb;">
          <div><span>Téléphone :</span> <strong>${patientPhone}</strong></div>
          <div><span>CIN :</span> <strong>${patientCin}</strong></div>
          <div><span>Date de consultation :</span> <strong>${dateExam}</strong></div>
        </div>
      </div>
    `;
  }

  if (reportTitleEl) {
    reportTitleEl.innerHTML = `
      <h2 style="margin: 0; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #0f172a; background: #f1f5f9; display: inline-block; padding: 6px 18px; border-radius: 20px; border: 1px solid #cbd5e1;">
        BILAN CARDIOLOGIQUE DU ${dateExam}
      </h2>
    `;
  }

  const existingContent = editorEl.innerHTML.trim();
  if (!existingContent || forceRegenerate) {
    editorEl.innerHTML = genererContenuCardioInitial();
  }
}

export function setCardioReportFormat(format) {
  const sheet = document.getElementById('cardio-wysiwyg-sheet');
  if (sheet) {
    sheet.classList.remove('format-a4', 'format-a5');
    sheet.classList.add(format === 'A5' ? 'format-a5' : 'format-a4');
  }
  const segmented = document.getElementById('cardio-report-format-segmented');
  if (segmented) {
    segmented.querySelectorAll('.ant-segmented-item').forEach(btn => {
      const isActive = btn.textContent.trim().toUpperCase() === format.toUpperCase();
      btn.classList.toggle('active', isActive);
      btn.style.background = isActive ? '#fff' : 'transparent';
      btn.style.boxShadow = isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
      btn.style.color = isActive ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.65)';
    });
  }
}

export function regenerateCardioReportContent() {
  renderCardioWysiwygReport(true);
  if (typeof showNotification === 'function') {
    showNotification('Contenu du rapport actualisé à partir des données du dossier', 'success');
  }
}

export function updateCardioSectionStepStatus() {
  const checks = {
    anamnese: Boolean(getCardioVal('cardio-motif') || getCardioVal('cardio-antecedents') || getCardioVal('cardio-risk-factors') || getCardioVal('cardio-symptoms')),
    clinical: Boolean(getCardioVal('cardio-blood-pressure') || getCardioVal('cardio-heart-rate') || getCardioVal('cardio-clinical-exam') || getCardioVal('cardio-auscultation') || getCardioVal('cardio-omi')),
    ecg: Boolean(getCardioVal('cardio-ecg-rest') || getCardioVal('cardio-ecg-rythme')),
    echo: Boolean(getCardioVal('cardio-echo') || getCardioVal('cardio-doppler')),
    effort: Boolean(getCardioVal('cardio-ecg-stress') || getCardioVal('cardio-holter-rythmique') || getCardioVal('cardio-mapa')),
    conclusion: Boolean(getCardioVal('cardio-diagnosis') || getCardioVal('cardio-treatment') || getCardioVal('cardio-conclusion')),
    report: Boolean(document.getElementById('cardio-wysiwyg-editor')?.textContent?.trim())
  };

  document.querySelectorAll('#cardiology .orl-section-step-item').forEach(step => {
    const tabKey = step.dataset.tab;
    const isCompleted = Boolean(checks[tabKey]);
    step.classList.toggle('is-completed', isCompleted);
    const circle = step.querySelector('.ant-step-circle');
    if (circle) {
      if (isCompleted) {
        circle.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="3" style="display:block; margin: 0 auto;"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else {
        circle.innerHTML = '';
      }
    }
  });
}

export function resetCardioProfile() {
  resetCardioFields();
}

export function createNewCardioReport() {
  currentCardioEditingReportId = null;
  resetCardioFields();
  const dateInput = document.getElementById('cardio-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const editor = document.getElementById('cardio-wysiwyg-editor');
  if (editor) {
    editor.innerHTML = genererContenuCardioInitial();
  }

  renderCardioWysiwygReport(true);
  updateCardioSectionStepStatus();
  switchCardioTab('anamnese');

  if (typeof showNotification === 'function') {
    showNotification('Nouveau bilan cardiologique initialisé', 'success');
  }
}

export function resetCardiologyProfile() {
  resetCardioFields();
  switchCardioTab('anamnese');
}

function resetCardioFields() {
  const fields = [
    'cardio-motif', 'cardio-date', 'cardio-antecedents', 'cardio-antecedents-chirurgicaux', 'cardio-risk-factors', 'cardio-symptoms',
    'cardio-blood-pressure', 'cardio-heart-rate', 'cardio-spo2', 'cardio-weight', 'cardio-auscultation', 'cardio-omi', 'cardio-clinical-exam',
    'cardio-ecg-rest', 'cardio-ecg-rythme', 'cardio-echo', 'cardio-doppler', 'cardio-ecg-stress', 'cardio-holter-rythmique', 'cardio-mapa',
    'cardio-diagnosis', 'cardio-conclusion', 'cardio-treatment', 'cardio-biology', 'cardio-other-tests', 'cardio-followup'
  ];

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const dateInput = document.getElementById('cardio-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
}

/**
 * =========================================================================
 * APERÇU INTERACTIF AVANT IMPRESSION (A4 PRINT PREVIEW MODAL)
 * =========================================================================
 */

export async function openCardioPrintPreview() {
  if (!currentCardioPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez d\'abord sélectionner un patient pour afficher son bilan', 'warning');
    }
    return;
  }

  let settings = {};
  if (window.api?.settings?.get) {
    try {
      const sRes = await window.api.settings.get();
      if (sRes?.success && sRes.data) settings = sRes.data;
    } catch (_) {}
  }

  const rawDoctor = settings.doctorName
    || window.currentUserData?.fullName
    || localStorage.getItem('doctor_name')
    || localStorage.getItem('currentUsername')
    || 'Médecin Spécialiste';

  const doctorTitle = rawDoctor.toLowerCase().startsWith('dr') ? rawDoctor : `Dr. ${rawDoctor}`;
  const cabinetName = settings.cabinetName || "Cabinet Médical de Cardiologie";
  const cabinetPhone = settings.cabinetPhone || '';
  const cabinetAddress = settings.cabinetAddress || '';
  const doctorSpecialty = settings.doctorSpecialty || 'Cardiologie & Explorations Cardiovasculaires';

  let patient = window.currentPatientData;
  if (!patient || String(patient.id) !== String(currentCardioPatientId)) {
    try {
      if (window.api?.patient?.getById) {
        const res = await window.api.patient.getById(currentCardioPatientId);
        if (res?.success && res.data) {
          patient = res.data;
          window.currentPatientData = patient;
        }
      }
    } catch (_) {}
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (document.getElementById('cardio-current-patient-display')?.textContent || 'Patient');
  let patientBirth = '—';
  let patientAge = '—';
  if (patient?.birthDate) {
    patientBirth = new Date(patient.birthDate).toLocaleDateString('fr-FR');
    if (patient.age) {
      patientAge = `${patient.age} ans`;
    } else {
      const bYear = new Date(patient.birthDate).getFullYear();
      if (!isNaN(bYear)) patientAge = `${new Date().getFullYear() - bYear} ans`;
    }
  } else if (patient?.age) {
    patientAge = `${patient.age} ans`;
  }

  let patientGender = '—';
  if (patient?.gender === 'female' || patient?.gender === 'F' || patient?.gender === 'Femme') {
    patientGender = 'Féminin';
  } else if (patient?.gender === 'male' || patient?.gender === 'M' || patient?.gender === 'Homme') {
    patientGender = 'Masculin';
  } else if (patient?.gender) {
    patientGender = patient.gender;
  }

  const patientPhone = patient?.phone || '—';
  const patientCin = patient?.cin || '—';

  const rawDateExam = document.getElementById('cardio-date')?.value;
  const dateExam = rawDateExam ? new Date(rawDateExam).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dossierNumber = formatCardioDossierNumber(patient);
  const reportTitle = `BILAN CARDIOLOGIQUE DU ${dateExam}`;
  const editorHtml = document.getElementById('cardio-wysiwyg-editor')?.innerHTML || genererContenuCardioInitial();

  const sheet = document.getElementById('cardio-preview-sheet');
  if (!sheet) return;

  sheet.innerHTML = `
    <!-- En-tête Cabinet Médical -->
    <div style="padding-bottom: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827;">
      <div>
        <h1 style="margin: 0; font-size: 19px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #111827;">
          ${doctorTitle}
        </h1>
        <p style="margin: 3px 0 0 0; font-size: 13px; font-weight: 600; color: #374151;">
          ${doctorSpecialty}
        </p>
        <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">
          Explorations Cardiovasculaires • ECG • Échographie ${cabinetPhone ? `• Tél: ${cabinetPhone}` : ''}
        </p>
        ${cabinetAddress ? `<p style="margin: 2px 0 0 0; font-size: 10.5px; color: #9ca3af;">${cabinetAddress}</p>` : ''}
      </div>
      <div style="text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5;">
        <p style="margin: 0; font-weight: 700; color: #111827; font-size: 13px;">${cabinetName}</p>
        <p style="margin: 0;">Date du rapport : <strong>${dateExam}</strong></p>
        <p style="margin: 0;">Dossier N° : <strong style="color: #1677ff; font-family: monospace; font-size: 12.5px;">${dossierNumber}</strong></p>
      </div>
    </div>

    <!-- Bannière Patient Formelle -->
    <div style="background: #ffffff; border: 1px solid #374151; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #111827;">
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;">
        <div><span>Patient :</span> <strong style="font-size: 13px; text-transform: uppercase; color: #111827;">${patientName}</strong></div>
        <div><span>Né(e) le / Âge :</span> <strong>${patientBirth} (${patientAge})</strong></div>
        <div><span>Genre :</span> <strong>${patientGender}</strong></div>
      </div>
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #e5e7eb;">
        <div><span>Téléphone :</span> <strong>${patientPhone}</strong></div>
        <div><span>CIN :</span> <strong>${patientCin}</strong></div>
        <div><span>Date de consultation :</span> <strong>${dateExam}</strong></div>
      </div>
    </div>

    <!-- Titre du Compte-Rendu -->
    <div style="text-align: center; margin-bottom: 16px;">
      <h2 style="margin: 0; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #111827; border-bottom: 1.5px solid #111827; display: inline-block; padding: 2px 8px;">
        ${reportTitle}
      </h2>
    </div>

    <!-- Contenu du rapport -->
    <div style="font-size: 12px; line-height: 1.6; color: #1f2937;">
      ${editorHtml}
    </div>

    <!-- Signature & Cachet -->
    <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid;">
      <div style="font-size: 10.5px; color: #6b7280;">
        <p style="margin: 0;">Document médical confidentiel émis le ${new Date().toLocaleDateString('fr-FR')}.</p>
        <p style="margin: 2px 0 0 0;">Certifié conforme par le médecin praticien.</p>
      </div>
      <div style="border: 1.5px solid #111827; border-radius: 4px; width: 220px; height: 95px; padding: 8px; text-align: center; font-size: 11px; color: #374151; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff;">
        <span style="font-weight: 600; text-transform: uppercase;">Cachet & Signature du Médecin</span>
        <span style="font-size: 11px; font-weight: 700; color: #111827;">${doctorTitle}</span>
      </div>
    </div>
  `;

  const modal = document.getElementById('cardio-print-preview-modal');
  if (modal) {
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

export function closeCardioPrintPreview() {
  const modal = document.getElementById('cardio-print-preview-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
  }
}

export function toggleCardioPreviewHeader(show) {
  const header = document.querySelector('#cardio-preview-sheet > div:first-child');
  if (header) {
    header.style.display = show ? 'flex' : 'none';
  }
}

export function triggerCardioDirectPrint() {
  const sheet = document.getElementById('cardio-preview-sheet');
  if (!sheet) return;

  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Bilan Cardiologique</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm 12mm 15mm;
        }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 0;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-size: 12px;
          line-height: 1.5;
        }
        table { border-collapse: collapse; width: 100%; }
        @media print { body { width: 100%; } }
      </style>
    </head>
    <body>
      ${sheet.innerHTML}
    </body>
    </html>
  `);
  doc.close();

  printFrame.contentWindow.focus();
  setTimeout(() => {
    printFrame.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(printFrame);
    }, 1000);
  }, 300);
}

export function openCardioReportWorkspace() {
  openCardioPrintPreview();
}

export function toggleCardioCardCollapse(element) {
  const card = element.closest('.orl-panel-card, .ant-collapse-panel, .card');
  if (!card) return;
  const body = card.querySelector('.orl-panel-body, .ant-collapse-content');
  const arrow = card.querySelector('.ant-collapse-arrow');
  if (!body) return;

  const isCollapsed = body.style.display === 'none' || card.classList.contains('is-collapsed');
  if (isCollapsed) {
    body.style.display = 'block';
    card.classList.remove('is-collapsed');
    if (arrow) arrow.style.transform = 'rotate(90deg)';
  } else {
    body.style.display = 'none';
    card.classList.add('is-collapsed');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
}

export function toggleAllCardioSections() {
  const activePane = document.querySelector('#cardiology .ant-tabs-pane.active');
  if (!activePane) return;
  const selector = '#cardiology .ant-tabs-pane.active .ant-collapse';
  if (typeof AntCollapse !== 'undefined') {
    if (AntCollapse.isAllCollapsed(selector)) {
      AntCollapse.expandAll(selector);
    } else {
      AntCollapse.collapseAll(selector);
    }
  }
}

// ====================== Legacy view profile (modal) ======================

export async function viewCardiologyProfile(documentId) {
  if (!documentId) return;
  try {
    const docResult = await window.api.document.getById(documentId);
    if (!docResult.success || !docResult.data) {
      showNotification('Bilan cardiologique introuvable', 'error');
      return;
    }
    const doc = docResult.data;
    const payload = typeof parseDocumentPayload === 'function' ? parseDocumentPayload(doc.payload) : {};
    const patientResult = await window.api.patient.getById(doc.patientId);
    const patient = patientResult.success ? patientResult.data : null;

    window._cardioViewState = { documentId: doc.id, patientId: doc.patientId, data: payload };

    const patientNameEl = document.getElementById('cardiology-view-patient-name');
    const motifEl = document.getElementById('cardiology-view-motif');
    const dateEl = document.getElementById('cardiology-view-date');
    const bloodPressureEl = document.getElementById('cardiology-view-blood-pressure');

    if (patientNameEl) {
      patientNameEl.textContent = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient' : 'Patient';
    }
    if (motifEl) motifEl.textContent = payload.motif || 'Bilan cardiologique';
    if (dateEl) dateEl.textContent = formatDateToDDMMYYYY(payload.date) || '-';
    if (bloodPressureEl) bloodPressureEl.textContent = payload.bloodPressure || '-';

    const container = document.getElementById('cardiology-profile-view-content');
    if (container) {
      const cards = [
        { title: 'Contexte clinique', body: [payload.antecedents ? `Antécédents: ${payload.antecedents}` : '', payload.riskFactors ? `Facteurs de risque: ${payload.riskFactors}` : '', payload.symptoms ? `Symptômes: ${payload.symptoms}` : '', payload.clinicalExam ? `Examen clinique: ${payload.clinicalExam}` : ''].filter(Boolean).join('\n') },
        { title: 'Explorations', body: [payload.ecgRest ? `ECG repos: ${payload.ecgRest}` : '', payload.ecgStress ? `ECG effort: ${payload.ecgStress}` : '', payload.echo ? `Échographie: ${payload.echo}` : '', payload.holterRythmique || payload.holterMapa ? `Holter/MAPA: ${payload.holterRythmique || payload.holterMapa}` : '', payload.biology ? `Biologie: ${payload.biology}` : '', payload.otherTests ? `Autres examens: ${payload.otherTests}` : ''].filter(Boolean).join('\n') },
        { title: 'Prise en charge', body: payload.treatment },
        { title: 'Conclusion', body: payload.conclusion }
      ];
      container.innerHTML = cards.map((card) => `
        <div class="cardiology-profile-view-card">
          <div class="cardiology-profile-view-title">${escapeHTML(card.title)}</div>
          <div class="cardiology-profile-view-body">${formatCardioTextBlock(card.body)}</div>
        </div>
      `).join('');
    }

    showModal('modal-cardiology-profile-view');
  } catch (error) {
    console.error('Error viewing cardiology profile:', error);
    showNotification('Impossible d’ouvrir ce bilan cardiologique', 'error');
  }
}

export async function openViewedCardiologyProfileInWorkspace() {
  const state = window._cardioViewState;
  if (!state?.patientId) {
    closeModal('modal-cardiology-profile-view');
    return;
  }

  if (typeof showSection === 'function') {
    showSection('cardiology');
  }

  if (typeof window.setSelectedPatient === 'function') {
    await window.setSelectedPatient(state.patientId, { source: 'cardiology-profile' });
  }

  const selector = document.getElementById('cardio-patient-selector');
  if (selector) {
    selector.value = state.patientId;
  }

  await selectCardioPatient(state.patientId, { fromGlobalSync: true });
  switchCardioTab('anamnese');
  closeModal('modal-cardiology-profile-view');

  const cardiologySection = document.getElementById('cardiology');
  if (cardiologySection?.scrollIntoView) {
    cardiologySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function formatCardioTextBlock(text, emptyText = 'Aucune donnée enregistrée.') {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return `<p class="document-live-preview-empty">${escapeHTML(emptyText)}</p>`;
  }
  return normalized
    .split(/\n+/)
    .map((line) => `<p>${escapeHTML(line)}</p>`)
    .join('');
}

// ====================== Alias exports (backwards compatibility) ======================

export function switchCardiologyTab(tabName) {
  switchCardioTab(tabName);
}

// Global attachments
window.initCardiology = initCardiology;
window.refreshCardiologyPatientList = refreshCardiologyPatientList;
window.selectCardioPatient = selectCardioPatient;
window.selectCardiologyPatient = selectCardiologyPatient;
window.switchCardioTab = switchCardioTab;
window.switchCardiologyTab = switchCardiologyTab;
window.saveCardiologyProfile = saveCardiologyProfile;
window.resetCardioProfile = resetCardioProfile;
window.resetCardiologyProfile = resetCardiologyProfile;
window.openCardioReportWorkspace = openCardioReportWorkspace;
window.openCardioPrintPreview = openCardioPrintPreview;
window.closeCardioPrintPreview = closeCardioPrintPreview;
window.triggerCardioDirectPrint = triggerCardioDirectPrint;
window.toggleCardioCardCollapse = toggleCardioCardCollapse;
window.toggleAllCardioSections = toggleAllCardioSections;
window.setCardioReportFormat = setCardioReportFormat;
window.regenerateCardioReportContent = regenerateCardioReportContent;
window.renderCardioWysiwygReport = renderCardioWysiwygReport;
window.updateCardioSectionStepStatus = updateCardioSectionStepStatus;
window.openCardioReportHistoryModal = openCardioReportHistoryModal;
window.closeCardioReportHistoryModal = closeCardioReportHistoryModal;
window.loadCardioHistoricalReport = loadCardioHistoricalReport;
window.previewCardioHistoricalReport = previewCardioHistoricalReport;
window.deleteCardioHistoricalReport = deleteCardioHistoricalReport;
window.createNewCardioReport = createNewCardioReport;
window.toggleCardioSubject = toggleCardioSubject;
window.isCardioSubjectIncluded = isCardioSubjectIncluded;
window.goToNextCardioTab = goToNextCardioTab;
window.goToPrevCardioTab = goToPrevCardioTab;
window.goToCardioStep = goToCardioStep;
window.addCurrentCardioTabToReport = addCurrentCardioTabToReport;
window.switchCardioSubTab = switchCardioSubTab;
window.editCardioHistoricalReport = editCardioHistoricalReport;
window.formatCardioDossierNumber = formatCardioDossierNumber;
window.viewCardiologyProfile = viewCardiologyProfile;
window.openViewedCardiologyProfileInWorkspace = openViewedCardiologyProfileInWorkspace;
window.toggleCardioPreviewHeader = toggleCardioPreviewHeader;
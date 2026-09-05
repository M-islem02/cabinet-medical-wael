/**
 * Module Spécialité Rééducation / MPR
 * PhysioCare / MedCareSO Rehabilitation Edition
 * 2-Column Workspace, Sider Navigation, Grille KPI 2x2, WYSIWYG Report
 */

let currentRehabPatientId = null;
let rehabViewMode = 'empty'; // 'empty' | 'history' | 'workspace'

function getRehabStorageKey(patientId) {
  return `rehab_profile_${patientId || 'temp'}`;
}

export function showRehabEmptyView() {
  rehabViewMode = 'empty';
  const emptyPanel = document.getElementById('rehab-empty-view');
  const historyPanel = document.getElementById('rehab-history-view');
  const workspacePanel = document.getElementById('rehab-workspace-view');
  if (emptyPanel) {
    emptyPanel.classList.remove('orl-view-hidden');
    emptyPanel.style.display = 'block';
  }
  if (historyPanel) {
    historyPanel.classList.add('orl-view-hidden');
    historyPanel.style.display = 'none';
  }
  if (workspacePanel) {
    workspacePanel.classList.add('orl-view-hidden');
    workspacePanel.style.display = 'none';
  }
  updateRehabPatientDisplay(null);
}

export function showRehabHistoryView() {
  const patientId = currentRehabPatientId || window.currentPatientId || (window.currentPatientData && window.currentPatientData.id);
  if (!patientId) {
    showRehabEmptyView();
    return;
  }
  currentRehabPatientId = String(patientId);
  rehabViewMode = 'history';
  const emptyPanel = document.getElementById('rehab-empty-view');
  const historyPanel = document.getElementById('rehab-history-view');
  const workspacePanel = document.getElementById('rehab-workspace-view');
  if (emptyPanel) {
    emptyPanel.classList.add('orl-view-hidden');
    emptyPanel.style.display = 'none';
  }
  if (historyPanel) {
    historyPanel.classList.remove('orl-view-hidden');
    historyPanel.style.display = 'block';
  }
  if (workspacePanel) {
    workspacePanel.classList.add('orl-view-hidden');
    workspacePanel.style.display = 'none';
  }
  renderRehabHistoryList();
}

export function showRehabWorkspaceView() {
  const patientId = currentRehabPatientId || window.currentPatientId || (window.currentPatientData && window.currentPatientData.id);
  if (!patientId) {
    showRehabEmptyView();
    return;
  }
  currentRehabPatientId = String(patientId);
  rehabViewMode = 'workspace';
  const emptyPanel = document.getElementById('rehab-empty-view');
  const historyPanel = document.getElementById('rehab-history-view');
  const workspacePanel = document.getElementById('rehab-workspace-view');
  if (emptyPanel) {
    emptyPanel.classList.add('orl-view-hidden');
    emptyPanel.style.display = 'none';
  }
  if (historyPanel) {
    historyPanel.classList.add('orl-view-hidden');
    historyPanel.style.display = 'none';
  }
  if (workspacePanel) {
    workspacePanel.classList.remove('orl-view-hidden');
    workspacePanel.style.display = 'flex';
  }
}

export function deselectRehabPatient(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  selectRehabPatient(null);
}

export async function initRehabilitation(force = false) {
  console.log('Initializing rehabilitation module...');

  const selector = document.getElementById('rehab-patient-selector');
  if (!selector) return;

  await refreshRehabPatientList();

  const dateInput = document.getElementById('rehab-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const initialPatientId = window.currentPatientId || null;
  if (initialPatientId) {
    await selectRehabPatient(initialPatientId, { fromGlobalSync: true });
    showRehabHistoryView();
  } else {
    showRehabEmptyView();
  }

  window.removeEventListener('medcare:patient-selected', handleRehabGlobalPatientSelected);
  window.addEventListener('medcare:patient-selected', handleRehabGlobalPatientSelected);

  // Wire step items and subtab buttons directly for guaranteed clickability
  document.querySelectorAll('#rehabilitation .orl-section-step-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
      const tab = item.dataset.tab;
      if (tab) switchRehabTab(tab);
    });
  });

  document.querySelectorAll('#rehabilitation .orl-subtab-btn').forEach(btn => {
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', (e) => {
      const subtab = btn.dataset.subtab;
      if (subtab) switchRehabSubTab(currentActiveRehabTab || 'anamnese', subtab);
    });
  });

  document.querySelectorAll('#rehabilitation .orl-step-dot').forEach(dot => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step, 10);
      if (step) goToRehabStep(step);
    });
  });

  // Initialize AntCheckableTag for motif & actes presets
  if (typeof AntCheckableTag !== 'undefined') {
    const motifContainer = document.getElementById('rehab-motif-tags');
    if (motifContainer) {
      AntCheckableTag.init(motifContainer, {
        options: ['Lombalgie', 'Post-opératoire', 'AVC', 'Traumatisme', 'Arthrose', 'Prothèse', 'Tendinopathie', 'Scoliose', 'Fracture', 'Réadaptation'],
        targetField: 'rehab-motif',
        multiple: true
      });
    }
    const actesContainer = document.getElementById('rehab-actes-tags');
    if (actesContainer) {
      AntCheckableTag.init(actesContainer, {
        options: ['Électrothérapie', 'Massage', 'Tecar', 'Ondes de choc', 'Mobilisation', 'Renforcement', 'Étirements', 'Proprioception', 'Balnéothérapie', 'Électrostimulation'],
        targetField: 'rehab-actes',
        multiple: true
      });
    }
  }

  // Initialize dropdown for More Actions button
  if (typeof AntDropdown !== 'undefined') {
    const moreBtn = document.getElementById('rehab-more-actions-btn');
    if (moreBtn) {
      AntDropdown.create(moreBtn, [
        { key: 'new', label: 'Nouveau bilan / plan', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' },
        { key: 'reset', label: 'Réinitialiser le dossier', danger: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' },
      ], {
        onClick: (key) => {
          if (key === 'new') {
            createNewRehabReport();
          } else if (key === 'reset') {
            if (confirm('Réinitialiser tout le dossier de rééducation ? Toutes les modifications non enregistrées seront perdues.')) {
              resetRehabProfile();
            }
          }
        }
      });
    }
  }

  if (selector.dataset.initialized === '1' && !force) return;
  selector.dataset.initialized = '1';
  if (window.currentPatientId && String(currentRehabPatientId || '') !== String(window.currentPatientId)) {
    selector.value = window.currentPatientId;
    await selectRehabPatient(window.currentPatientId, { fromGlobalSync: true });
  }
}

function handleRehabGlobalPatientSelected(e) {
  const patientId = e.detail?.patientId;
  const patient = e.detail?.patient;
  if (patientId && String(patientId) !== String(currentRehabPatientId)) {
    selectRehabPatient(patientId, { patient, fromGlobalSync: true });
  }
}

export async function refreshRehabPatientList() {
  const select = document.getElementById('rehab-patient-selector');
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
        console.warn('api.patient.getAll error in Rehabilitation:', e);
      }
    }

    if ((!patients || patients.length === 0) && window.api?.patient?.getDirectory) {
      try {
        const resDir = await window.api.patient.getDirectory();
        if (resDir?.success && Array.isArray(resDir.data)) {
          patients = resDir.data;
        }
      } catch (e) {
        console.warn('api.patient.getDirectory error in Rehabilitation:', e);
      }
    }

    if ((!patients || patients.length === 0) && Array.isArray(window.patients) && window.patients.length > 0) {
      patients = window.patients;
    }

    const activeId = currentRehabPatientId || window.currentPatientId;
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

    window._rehabPatientsCache = patients;

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
          selectRehabPatient(val, { fromGlobalSync: false });
        }
      });
    }
  } catch (err) {
    console.error('Error loading patients for Rehabilitation:', err);
  }
}

export async function selectRehabPatient(patientId, options = {}) {
  const normalizedId = patientId ? String(patientId).trim() : null;
  if (!normalizedId) {
    currentRehabPatientId = null;
    window.currentPatientId = null;
    window.currentPatientData = null;
    updateRehabPatientDisplay(null);
    resetRehabFields();
    showRehabEmptyView();
    const select = document.getElementById('rehab-patient-selector');
    if (select && typeof AntSelect !== 'undefined') {
      AntSelect.setValue(select, '');
    } else if (select) {
      select.value = '';
    }
    return;
  }

  currentRehabPatientId = normalizedId;
  window.currentPatientId = normalizedId;

  const select = document.getElementById('rehab-patient-selector');
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

    const patientIdField = document.getElementById('rehab-patient-id');
    if (patientIdField) patientIdField.value = normalizedId;

    if (patient) {
      window.currentPatientData = patient;
      updateRehabPatientDisplay(patient);
      await loadRehabProfile(normalizedId);
      renderRehabSiderHistory(normalizedId);
      renderRehabWysiwygReport(true);
      showRehabHistoryView();

      if (!options.fromGlobalSync && typeof window.setSelectedPatient === 'function') {
        window.setSelectedPatient(normalizedId, { patient, source: 'rehabilitation' });
      }
    } else {
      updateRehabPatientDisplay(null);
      showRehabHistoryView();
    }
  } catch (e) {
    console.error('Error in selectRehabPatient:', e);
    showRehabHistoryView();
  }
}

function updateRehabPatientDisplay(patient) {
  const display = document.getElementById('rehab-current-patient-display');
  const avatar = document.getElementById('rehab-patient-avatar');

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
    avatar.style.backgroundColor = '#0d9488';
    const initials = `${(patient.lastName || '').charAt(0)}${(patient.firstName || '').charAt(0)}`.trim().toUpperCase() || 'P';
    avatar.textContent = initials;
  }

  const details = [];
  const dossierNum = formatRehabDossierNumber(patient);
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

function renderRehabSiderHistory(patientId) {
  const box = document.getElementById('rehab-sider-history-box');
  const itemsContainer = document.getElementById('rehab-sider-history-items');
  if (!box || !itemsContainer) return;

  if (!patientId) {
    box.style.display = 'none';
    itemsContainer.innerHTML = '';
    return;
  }

  const history = getRehabHistory(patientId);
  if (!history || history.length === 0) {
    box.style.display = 'none';
    itemsContainer.innerHTML = '';
    return;
  }

  box.style.display = 'block';
  itemsContainer.innerHTML = history.slice(0, 5).map((item, index) => {
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const motif = item.motif || 'Bilan de rééducation';
    return `
      <div onclick="loadRehabHistoricalReport(${index})" style="padding: 4px 6px; background: #ffffff; border: 1px solid #f0f0f0; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; transition: border-color 0.2s;" title="Charger ce bilan (${formattedDate})">
        <span style="font-weight: 600; color: #0d9488;">${formattedDate}</span>
        <span style="color: rgba(0,0,0,0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">${motif}</span>
      </div>
    `;
  }).join('');
}

export const REHAB_TAB_LIST = [
  { id: 'anamnese', label: '1. Motif & Anamnèse', step: 1 },
  { id: 'articular', label: '2. Bilan Articulaire & Musculaire', step: 2 },
  { id: 'neuro', label: '3. Bilan Neuro & Rachidien', step: 3 },
  { id: 'posture', label: '4. Posture, Marche & Équilibre', step: 4 },
  { id: 'plan', label: '5. Plan de Rééducation & Actes', step: 5 },
  { id: 'evolution', label: '6. Évolution & Objectifs', step: 6 },
  { id: 'report', label: '7. Compte-Rendu & Fiche de Liaison', step: 7 }
];

let currentActiveRehabTab = 'anamnese';
const rehabIncludedSubjects = new Set(['motif', 'plan']);

export function toggleRehabSubject(subjectKey, forceState = null) {
  const isIncluded = forceState !== null ? forceState : !rehabIncludedSubjects.has(subjectKey);
  if (isIncluded) {
    rehabIncludedSubjects.add(subjectKey);
  } else {
    rehabIncludedSubjects.delete(subjectKey);
  }

  document.querySelectorAll(`.orl-add-subject-btn[data-subject="${subjectKey}"]`).forEach(btn => {
    btn.classList.toggle('is-included', isIncluded);
    const icon = btn.querySelector('.plus-icon');
    const text = btn.querySelector('.btn-text');
    if (icon) icon.textContent = isIncluded ? '✓' : '+';
    if (text) text.textContent = isIncluded ? 'Inclus au rapport' : 'Ajouter au rapport';
  });

  renderRehabWysiwygReport(true);
  updateRehabSectionStepStatus();

  if (typeof showNotification === 'function') {
    const actionLabel = isIncluded ? '✓ Ajouté au compte-rendu' : 'Retiré du compte-rendu';
    showNotification(`${actionLabel} : ${subjectKey}`, isIncluded ? 'success' : 'info');
  }
}

export function isRehabSubjectIncluded(subjectKey) {
  return rehabIncludedSubjects.has(subjectKey);
}

export function getCurrentRehabTab() {
  return currentActiveRehabTab;
}

export function goToNextRehabTab() {
  const currentIndex = REHAB_TAB_LIST.findIndex(t => t.id === currentActiveRehabTab);
  if (currentIndex >= 0 && currentIndex < REHAB_TAB_LIST.length - 1) {
    switchRehabTab(REHAB_TAB_LIST[currentIndex + 1].id);
  }
}

export function goToPrevRehabTab() {
  const currentIndex = REHAB_TAB_LIST.findIndex(t => t.id === currentActiveRehabTab);
  if (currentIndex > 0) {
    switchRehabTab(REHAB_TAB_LIST[currentIndex - 1].id);
  }
}

export function goToRehabStep(stepNumber) {
  const target = REHAB_TAB_LIST.find(t => t.step === stepNumber);
  if (target) {
    switchRehabTab(target.id);
  }
}

export function addCurrentRehabTabToReport(tabName = currentActiveRehabTab) {
  const tabSubjectsMap = {
    anamnese: ['motif', 'antecedents', 'fonctionnelle'],
    articular: ['articular', 'articulaire', 'musculaire', 'mesures'],
    neuro: ['neurologique', 'rachidien'],
    posture: ['posture', 'marche', 'equilibre'],
    plan: ['plan', 'actes', 'frequence'],
    evolution: ['objectifs', 'evolution']
  };

  const subjects = tabSubjectsMap[tabName] || [tabName];
  subjects.forEach(s => rehabIncludedSubjects.add(s));

  subjects.forEach(s => {
    document.querySelectorAll(`.orl-add-subject-btn[data-subject="${s}"]`).forEach(btn => {
      btn.classList.add('is-included');
      const icon = btn.querySelector('.plus-icon');
      const text = btn.querySelector('.btn-text');
      if (icon) icon.textContent = '✓';
      if (text) text.textContent = 'Inclus au rapport';
    });
  });

  renderRehabWysiwygReport(true);
  updateRehabSectionStepStatus();

  if (typeof showNotification === 'function') {
    showNotification('Étape ajoutée au compte-rendu médical', 'success');
  }
}

export function switchRehabSubTab(sectionId, subTabId) {
  const sectionEl = document.getElementById('rehab-tab-' + sectionId);
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
    headerAddBtn.setAttribute('onclick', `event.stopPropagation(); toggleRehabSubject('${subTabId}')`);
    const isInc = isRehabSubjectIncluded(subTabId);
    headerAddBtn.classList.toggle('is-included', isInc);
    const icon = headerAddBtn.querySelector('.plus-icon');
    const text = headerAddBtn.querySelector('.btn-text');
    if (icon) icon.textContent = isInc ? '✓' : '+';
    if (text) text.textContent = isInc ? 'Inclus au rapport' : 'Ajouter au rapport';
  }
}

export function switchRehabTab(tabName) {
  currentActiveRehabTab = tabName;

  document.querySelectorAll('#rehabilitation .orl-section-step-item, #rehabilitation .orl-tab-pill-btn').forEach(btn => {
    btn.classList.remove('active');
    const tab = btn.dataset.tab;
    const onclickAttr = btn.getAttribute('onclick') || '';
    if (tab === tabName || onclickAttr.includes(`'${tabName}'`) || onclickAttr.includes(`"${tabName}"`)) {
      btn.classList.add('active');
    }
  });

  const currentStep = REHAB_TAB_LIST.find(t => t.id === tabName)?.step || 1;
  document.querySelectorAll('#rehabilitation .orl-step-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step, 10);
    dot.classList.toggle('active', dotStep === currentStep);
    dot.classList.toggle('completed', dotStep < currentStep);
  });

  const stepIndicator = document.getElementById('rehab-step-indicator');
  if (stepIndicator) {
    stepIndicator.textContent = `Étape ${currentStep} sur ${REHAB_TAB_LIST.length}`;
  }

  document.querySelectorAll('#rehabilitation .ant-tabs-pane').forEach(pane => {
    pane.classList.remove('active');
    pane.style.display = 'none';
  });
  const activePane = document.getElementById('rehab-tab-' + tabName);
  if (activePane) {
    activePane.classList.add('active');
    activePane.style.display = 'block';
  }

  if (tabName === 'report') {
    renderRehabWysiwygReport();
  }
}

export async function loadRehabProfile(patientId) {
  if (!patientId) return;

  try {
    // 1. Try document-based profile from DB (preferred)
    let profileData = null;
    let documentId = null;
    if (window.api?.document?.getByType) {
      try {
        const res = await window.api.document.getByType({ patientId, documentType: 'rehabilitation_profile' });
        if (res?.success && res.data) {
          profileData = res.data;
          documentId = res.data.id;
        }
      } catch (e) {
        console.warn('getByType error in loadRehabProfile:', e);
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
        const raw = localStorage.getItem(getRehabStorageKey(patientId));
        data = raw ? JSON.parse(raw) : null;
      } catch (_) {}
    }

    const dateInput = document.getElementById('rehab-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    if (data) {
      setRehabVal('rehab-motif', data.motif);
      setRehabVal('rehab-date', data.date || new Date().toISOString().split('T')[0]);
      setRehabVal('rehab-event-date', data.eventDate);
      setRehabVal('rehab-antecedents', data.antecedents);
      setRehabVal('rehab-current-treatment', data.currentTreatment);
      setRehabVal('rehab-functional-history', data.functionalHistory);
      setRehabVal('rehab-pain', data.pain);
      setRehabVal('rehab-amplitudes', data.amplitudes);
      setRehabVal('rehab-stability', data.stability);
      setRehabVal('rehab-muscle-strength', data.muscleStrength);
      setRehabVal('rehab-tonus', data.tonus);
      setRehabVal('rehab-measures', data.measures);
      setRehabVal('rehab-neuro-exam', data.neuroExam);
      setRehabVal('rehab-spine-exam', data.spineExam);
      setRehabVal('rehab-posture', data.posture);
      setRehabVal('rehab-gait', data.gait);
      setRehabVal('rehab-balance', data.balance);
      setRehabVal('rehab-plan', data.rehabPlan);
      setRehabVal('rehab-actes', data.actes);
      setRehabVal('rehab-sessions-per-week', data.sessionsPerWeek);
      setRehabVal('rehab-duration-weeks', data.durationWeeks);
      setRehabVal('rehab-cautions', data.cautions);
      setRehabVal('rehab-objectives', data.objectives);
      setRehabVal('rehab-evolution', data.evolution);

      const editor = document.getElementById('rehab-wysiwyg-editor');
      if (editor && data.reportWysiwygHtml) {
        editor.innerHTML = data.reportWysiwygHtml;
      }

      updateRehabStats(data);
    } else {
      resetRehabFields();
      setRehabVal('rehab-date', new Date().toISOString().split('T')[0]);
    }

    updateRehabSectionStepStatus();
  } catch (err) {
    console.error('Error loading rehabilitation data:', err);
  }
}

function setRehabVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val !== undefined && val !== null ? String(val) : '';
}

function getRehabVal(id) {
  return document.getElementById(id)?.value || '';
}

let currentRehabEditingReportId = null;

export function saveRehabProfile() {
  if (!currentRehabPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient avant d\'enregistrer', 'warning');
    }
    return;
  }

  const data = {
    patientId: currentRehabPatientId,
    motif: getRehabVal('rehab-motif'),
    date: getRehabVal('rehab-date') || new Date().toISOString().split('T')[0],
    eventDate: getRehabVal('rehab-event-date'),
    antecedents: getRehabVal('rehab-antecedents'),
    currentTreatment: getRehabVal('rehab-current-treatment'),
    functionalHistory: getRehabVal('rehab-functional-history'),
    pain: getRehabVal('rehab-pain'),
    amplitudes: getRehabVal('rehab-amplitudes'),
    stability: getRehabVal('rehab-stability'),
    muscleStrength: getRehabVal('rehab-muscle-strength'),
    tonus: getRehabVal('rehab-tonus'),
    measures: getRehabVal('rehab-measures'),
    neuroExam: getRehabVal('rehab-neuro-exam'),
    spineExam: getRehabVal('rehab-spine-exam'),
    posture: getRehabVal('rehab-posture'),
    gait: getRehabVal('rehab-gait'),
    balance: getRehabVal('rehab-balance'),
    rehabPlan: getRehabVal('rehab-plan'),
    actes: getRehabVal('rehab-actes'),
    sessionsPerWeek: getRehabVal('rehab-sessions-per-week'),
    durationWeeks: getRehabVal('rehab-duration-weeks'),
    cautions: getRehabVal('rehab-cautions'),
    objectives: getRehabVal('rehab-objectives'),
    evolution: getRehabVal('rehab-evolution'),
    reportWysiwygHtml: document.getElementById('rehab-wysiwyg-editor')?.innerHTML || '',
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(getRehabStorageKey(currentRehabPatientId), JSON.stringify(data));
  saveRehabHistoryEntry(currentRehabPatientId, data, currentRehabEditingReportId);

  // Persist to DB as a rehabilitation_profile document (best-effort)
  if (window.api?.document?.save) {
    try {
      window.api.document.save({
        patientId: currentRehabPatientId,
        documentType: 'rehabilitation_profile',
        title: data.motif || 'Compte-rendu de rééducation',
        data
      }).then((result) => {
        if (result?.success) {
          currentRehabEditingReportId = result.id || currentRehabEditingReportId;
        }
      });
    } catch (e) {
      console.warn('DB save error in saveRehabProfile:', e);
    }
  }

  if (typeof showNotification === 'function') {
    showNotification('Compte-rendu de rééducation sauvegardé avec succès', 'success');
  }

  updateRehabStats(data);
  updateRehabSectionStepStatus();
  renderRehabSiderHistory(currentRehabPatientId);
  renderRehabHistoryList();
}

function getRehabHistoryStorageKey(patientId) {
  return `rehab_history_${patientId}`;
}

function getRehabHistory(patientId) {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(getRehabHistoryStorageKey(patientId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveRehabHistoryEntry(patientId, snapshotData, existingEntryId = null) {
  if (!patientId) return;
  try {
    const list = getRehabHistory(patientId);

    if (existingEntryId) {
      const idx = list.findIndex(e => e.id === existingEntryId);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          savedAt: new Date().toISOString(),
          date: snapshotData.date || list[idx].date,
          motif: snapshotData.motif || list[idx].motif,
          objectives: snapshotData.objectives || list[idx].objectives,
          data: snapshotData
        };
        localStorage.setItem(getRehabHistoryStorageKey(patientId), JSON.stringify(list));
        return list;
      }
    }

    const newEntry = {
      id: 'rehab_rep_' + Date.now(),
      savedAt: new Date().toISOString(),
      date: snapshotData.date || new Date().toISOString().split('T')[0],
      motif: snapshotData.motif || 'Compte-rendu de rééducation',
      objectives: snapshotData.objectives || 'Bilan standard',
      data: snapshotData
    };
    list.unshift(newEntry);
    if (list.length > 50) list.length = 50;
    localStorage.setItem(getRehabHistoryStorageKey(patientId), JSON.stringify(list));
    currentRehabEditingReportId = newEntry.id;
    return list;
  } catch (e) {
    console.error('Error saving rehabilitation history:', e);
  }
}

function updateRehabStats(data) {
  const lastReport = document.getElementById('rehab-stat-last-report');
  if (lastReport) lastReport.textContent = data.date ? new Date(data.date).toLocaleDateString('fr-FR') : '-';

  const history = currentRehabPatientId ? getRehabHistory(currentRehabPatientId) : [];
  const plans = document.getElementById('rehab-stat-plans');
  if (plans) plans.textContent = `${Math.max(history.length, 0)}`;

  const objectives = document.getElementById('rehab-stat-objectives');
  if (objectives) {
    const objText = data.objectives || getRehabVal('rehab-objectives');
    objectives.textContent = objText ? objText.split(/\n+/).filter(l => l.trim()).length : '0';
  }

  const sessions = document.getElementById('rehab-stat-sessions');
  if (sessions) sessions.textContent = data.sessionsPerWeek || getRehabVal('rehab-sessions-per-week') || '0';
}

/**
 * =========================================================================
 * HISTORIQUE DES COMPTES-RENDUS DE RÉÉDUCATION
 * =========================================================================
 */

export function renderRehabHistoryList() {
  const listEl = document.getElementById('rehab-history-list');
  const patientSubEl = document.getElementById('rehab-history-view-patient-subtitle');
  if (!listEl) return;

  let patient = window.currentPatientData;
  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (currentRehabPatientId ? `Patient #${currentRehabPatientId}` : 'Aucun patient sélectionné');
  if (patientSubEl) {
    if (currentRehabPatientId && patient) {
      patientSubEl.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
          <span style="font-size: 14px; font-weight: 600; color: #64748b;">Patient :</span>
          <div class="orl-patient-selected-tag" style="display: inline-flex; align-items: center; gap: 8px; background: #f0fdfa; border: 1.5px solid #99f6e4; padding: 4px 10px 4px 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(13,148,136,0.06);">
            <div style="width: 22px; height: 22px; border-radius: 50%; background: #0d9488; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;">
              ${(patient.lastName?.[0] || patient.firstName?.[0] || 'P').toUpperCase()}
            </div>
            <strong style="color: #0f766e; font-size: 14.5px; font-weight: 750;">${typeof escapeHTML === 'function' ? escapeHTML(patientName) : patientName}</strong>
            <button type="button" class="rehab-deselect-btn" onclick="deselectRehabPatient(event)" title="Désélectionner ce patient" style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; background: #ffffff; border: 1.5px solid #f87171; color: #dc2626; cursor: pointer; font-size: 13px; font-weight: 800; line-height: 1; padding: 0; margin-left: 6px; transition: all 0.15s ease; box-shadow: 0 1px 2px rgba(220,38,38,0.12);" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#dc2626';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#f87171';">
              ✕
            </button>
          </div>
        </div>
      `;
    } else {
      patientSubEl.innerHTML = `Patient : <em style="color: #94a3b8;">Aucun patient sélectionné</em>`;
    }
  }

  if (!currentRehabPatientId) {
    listEl.innerHTML = `
      <div class="ant-empty" style="padding: 56px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div class="ant-empty-image" style="margin-bottom: 20px;">
          <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="32" cy="18" r="8" fill="#f8fafc"/>
            <path d="M18 50h28v-4c0-6-6-10-14-10s-14 4-14 10v4z" fill="#f8fafc"/>
            <path d="M32 30v14"/>
          </svg>
        </div>
        <div style="font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Aucun patient sélectionné</div>
        <div style="font-size: 15px; color: #64748b; max-width: 480px; line-height: 1.6;">Veuillez sélectionner un patient dans la barre supérieure pour consulter ou créer des bilans MPR.</div>
      </div>
    `;
    return;
  }

  let history = getRehabHistory(currentRehabPatientId);
  if (history.length === 0) {
    const raw = localStorage.getItem(getRehabStorageKey(currentRehabPatientId));
    if (raw) {
      try {
        const initialData = JSON.parse(raw);
        saveRehabHistoryEntry(currentRehabPatientId, initialData);
      } catch (_) {}
    }
  }

  const updatedHistory = getRehabHistory(currentRehabPatientId);
  const headerActions = document.getElementById('rehab-history-header-actions');

  if (updatedHistory.length === 0) {
    if (headerActions) headerActions.style.display = 'none';
    listEl.innerHTML = `
      <div class="ant-empty" style="padding: 56px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div class="ant-empty-image" style="margin-bottom: 20px;">
          <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 6h24l12 12v38a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" fill="#f8fafc"/>
            <polyline points="40 6 40 18 52 18"/>
            <line x1="22" y1="28" x2="42" y2="28"/>
            <line x1="22" y1="36" x2="42" y2="36"/>
            <line x1="22" y1="44" x2="34" y2="44"/>
          </svg>
        </div>
        <div style="font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Aucun bilan MPR enregistré</div>
        <div style="font-size: 15px; color: #64748b; max-width: 460px; line-height: 1.6; margin-bottom: 22px;">Créez un premier bilan médical pour ce patient afin d'initialiser son dossier de rééducation.</div>
        <button type="button" class="btn btn-primary" onclick="createNewRehabReport()" style="height: 42px; padding: 0 24px; font-size: 14.5px; font-weight: 650; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px; background: #0d9488; border-color: #0d9488; box-shadow: 0 2px 6px rgba(13, 148, 136, 0.25);">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Créer un premier bilan</span>
        </button>
      </div>
    `;
    return;
  }

  if (headerActions) headerActions.style.display = 'block';

  const safeEscape = (val) => (typeof escapeHTML === 'function' ? escapeHTML(val || '') : String(val || ''));

  let html = `<div style="display: flex; flex-direction: column; gap: 14px;">`;

  updatedHistory.forEach((item, index) => {
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const savedTime = item.savedAt ? new Date(item.savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const motif = item.motif || 'Compte-rendu de rééducation';
    const objectives = item.objectives || 'Bilan standard';
    const sessions = item.data?.sessionsCount || item.sessionsCount;

    html += `
      <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
            <span class="ant-tag ant-tag-processing" style="background: #f0fdfa; color: #0d9488; border-color: #99f6e4; font-weight: 700; font-size: 13px; padding: 3px 10px; border-radius: 6px;">
              ${formattedDate} ${savedTime ? `(${savedTime})` : ''}
            </span>
            <span class="ant-tag" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f; font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 6px;">Rééducation MPR</span>
            ${sessions ? `<span class="ant-tag" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 6px;">${safeEscape(sessions)} séances</span>` : ''}
          </div>
          <div style="font-size: 16.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
            ${safeEscape(motif)}
          </div>
          <div style="font-size: 14.5px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <strong style="color: #1e293b;">Objectifs :</strong> ${safeEscape(objectives)}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
          <button type="button" class="btn btn-primary" onclick="editRehabHistoricalReport(${index})" style="height: 36px; padding: 0 14px; font-size: 13.5px; font-weight: 600; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; background: #0d9488; border-color: #0d9488; cursor: pointer;" title="Modifier ce bilan">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Modifier</span>
          </button>
          <button type="button" class="btn btn-secondary" onclick="previewRehabHistoricalReport(${index})" style="height: 36px; padding: 0 14px; font-size: 13.5px; font-weight: 600; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; background: #ffffff; border: 1.5px solid #cbd5e1; color: #334155; cursor: pointer;" title="Aperçu avant impression">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>Imprimer</span>
          </button>
          <button type="button" class="btn" onclick="deleteRehabHistoricalReport(${index})" style="height: 36px; width: 36px; min-width: 36px; padding: 0; border-radius: 7px; background: #fff1f2; border: 1.5px solid #fca5a5; color: #e11d48; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);" title="Supprimer ce bilan">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  listEl.innerHTML = html;
}

export async function openRehabReportHistoryModal() {
  const modal = document.getElementById('rehab-report-history-modal');
  if (!modal) return;

  const subtitle = document.getElementById('rehab-history-patient-subtitle');
  const body = document.getElementById('rehab-history-list-body');

  let patient = window.currentPatientData;
  if (!patient && currentRehabPatientId && window.api?.patient?.getById) {
    try {
      const res = await window.api.patient.getById(currentRehabPatientId);
      if (res?.success) patient = res.data;
    } catch (_) {}
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (document.getElementById('rehab-current-patient-display')?.textContent || 'Patient non sélectionné');
  if (subtitle) {
    subtitle.innerHTML = currentRehabPatientId ? `Patient : <strong>${patientName}</strong> (#${currentRehabPatientId})` : `Patient : <em>Aucun patient sélectionné</em>`;
  }

  if (!currentRehabPatientId) {
    if (body) {
      body.innerHTML = `
        <div style="padding: 40px 20px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.88);">Aucun patient sélectionné</div>
          <div style="font-size: 12.5px; color: rgba(0,0,0,0.45); margin-top: 4px;">Veuillez d'abord sélectionner un patient pour consulter l'historique de ses comptes-rendus.</div>
        </div>
      `;
    }
    modal.style.display = 'flex';
    return;
  }

  let history = getRehabHistory(currentRehabPatientId);

  if (history.length === 0) {
    const raw = localStorage.getItem(getRehabStorageKey(currentRehabPatientId));
    if (raw) {
      try {
        const initialData = JSON.parse(raw);
        saveRehabHistoryEntry(currentRehabPatientId, initialData);
      } catch (_) {}
    }
  }

  const updatedHistory = getRehabHistory(currentRehabPatientId);

  if (updatedHistory.length === 0) {
    if (body) {
      body.innerHTML = `
        <div style="padding: 40px 20px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
          <div style="font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.88);">Aucun compte-rendu enregistré</div>
          <div style="font-size: 12.5px; color: rgba(0,0,0,0.45); margin-top: 4px;">Enregistrez un premier compte-rendu de rééducation pour ce patient pour créer un historique.</div>
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
    const objectives = item.objectives || 'Bilan standard';
    const motif = item.motif || 'Compte-rendu de rééducation';

    html += `
      <div style="background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: border-color 0.2s; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span class="ant-tag ant-tag-processing" style="background: #f0fdf4; color: #0d9488; border-color: #99f6e4; font-weight: 600;">
              ${formattedDate} ${savedTime ? `(${savedTime})` : ''}
            </span>
            <span class="ant-tag" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f;">Rééducation MPR</span>
          </div>
          <div style="font-size: 13.5px; font-weight: 700; color: rgba(0,0,0,0.88); margin-bottom: 2px;">
            ${motif}
          </div>
          <div style="font-size: 12.5px; color: rgba(0,0,0,0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <strong style="color: rgba(0,0,0,0.88);">Objectifs :</strong> ${objectives}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button type="button" class="btn btn-primary" onclick="editRehabHistoricalReport(${index})" style="height: 32px; padding: 0 12px; font-size: 12.5px; display: flex; align-items: center; gap: 5px; background: #0d9488; border-color: #0d9488;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Modifier
          </button>
          <button type="button" class="btn" onclick="loadRehabHistoricalReport(${index})" style="height: 32px; padding: 0 10px; font-size: 12.5px; display: flex; align-items: center; gap: 4px;" title="Charger les formulaires d'examen">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Charger
          </button>
          <button type="button" class="btn" onclick="previewRehabHistoricalReport(${index})" style="height: 32px; padding: 0 10px; font-size: 12.5px;" title="Aperçu avant impression">
            Aperçu
          </button>
          <button type="button" class="btn btn-danger" onclick="deleteRehabHistoricalReport(${index})" style="height: 32px; width: 32px; padding: 0; color: #ff4d4f; border-color: #ffccc7;" title="Supprimer">
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

export function closeRehabReportHistoryModal() {
  const modal = document.getElementById('rehab-report-history-modal');
  if (modal) modal.style.display = 'none';
}

export function editRehabHistoricalReport(index) {
  if (!currentRehabPatientId) return;
  const history = getRehabHistory(currentRehabPatientId);
  const entry = history[index];
  if (!entry || !entry.data) return;

  currentRehabEditingReportId = entry.id;
  loadRehabHistoricalReport(index);
  closeRehabReportHistoryModal();
  showRehabWorkspaceView();
  switchRehabTab('report');

  if (typeof showNotification === 'function') {
    showNotification(`Compte-rendu du ${entry.date || ''} ouvert en mode édition`, 'info');
  }
}

export function loadRehabHistoricalReport(index) {
  if (!currentRehabPatientId) return;
  const history = getRehabHistory(currentRehabPatientId);
  const entry = history[index];
  if (!entry || !entry.data) return;

  const data = entry.data;

  setRehabVal('rehab-motif', data.motif);
  setRehabVal('rehab-date', data.date || new Date().toISOString().split('T')[0]);
  setRehabVal('rehab-event-date', data.eventDate);
  setRehabVal('rehab-antecedents', data.antecedents);
  setRehabVal('rehab-current-treatment', data.currentTreatment);
  setRehabVal('rehab-functional-history', data.functionalHistory);
  setRehabVal('rehab-pain', data.pain);
  setRehabVal('rehab-amplitudes', data.amplitudes);
  setRehabVal('rehab-stability', data.stability);
  setRehabVal('rehab-muscle-strength', data.muscleStrength);
  setRehabVal('rehab-tonus', data.tonus);
  setRehabVal('rehab-measures', data.measures);
  setRehabVal('rehab-neuro-exam', data.neuroExam);
  setRehabVal('rehab-spine-exam', data.spineExam);
  setRehabVal('rehab-posture', data.posture);
  setRehabVal('rehab-gait', data.gait);
  setRehabVal('rehab-balance', data.balance);
  setRehabVal('rehab-plan', data.rehabPlan);
  setRehabVal('rehab-actes', data.actes);
  setRehabVal('rehab-sessions-per-week', data.sessionsPerWeek);
  setRehabVal('rehab-duration-weeks', data.durationWeeks);
  setRehabVal('rehab-cautions', data.cautions);
  setRehabVal('rehab-objectives', data.objectives);
  setRehabVal('rehab-evolution', data.evolution);

  const editor = document.getElementById('rehab-wysiwyg-editor');
  if (editor && data.reportWysiwygHtml) {
    editor.innerHTML = data.reportWysiwygHtml;
  }

  updateRehabStats(data);
  updateRehabSectionStepStatus();
  closeRehabReportHistoryModal();
  showRehabWorkspaceView();

  if (typeof showNotification === 'function') {
    showNotification(`Compte-rendu du ${entry.date || 'bilan'} chargé dans le dossier`, 'success');
  }
}

export function previewRehabHistoricalReport(index) {
  loadRehabHistoricalReport(index);
  openRehabPrintPreview();
}

export function deleteRehabHistoricalReport(index) {
  if (!currentRehabPatientId) return;
  if (!confirm('Supprimer ce compte-rendu de l\'historique ?')) return;

  const history = getRehabHistory(currentRehabPatientId);
  history.splice(index, 1);
  localStorage.setItem(getRehabHistoryStorageKey(currentRehabPatientId), JSON.stringify(history));

  renderRehabHistoryList();
  renderRehabSiderHistory(currentRehabPatientId);
  openRehabReportHistoryModal();
  if (typeof showNotification === 'function') {
    showNotification('Compte-rendu supprimé de l\'historique', 'info');
  }
}

/**
 * =========================================================================
 * WYSIWYG COMPTE-RENDU DE RÉÉDUCATION
 * =========================================================================
 */

function rehabSubjectIncluded(...keys) {
  return keys.some(k => isRehabSubjectIncluded(k));
}

export function genererContenuRehabInitial() {
  const motif = getRehabVal('rehab-motif');
  const antecedents = getRehabVal('rehab-antecedents');
  const currentTreatment = getRehabVal('rehab-current-treatment');
  const functionalHistory = getRehabVal('rehab-functional-history');
  const pain = getRehabVal('rehab-pain');

  const amplitudes = getRehabVal('rehab-amplitudes');
  const stability = getRehabVal('rehab-stability');
  const muscleStrength = getRehabVal('rehab-muscle-strength');
  const tonus = getRehabVal('rehab-tonus');
  const measures = getRehabVal('rehab-measures');

  const neuroExam = getRehabVal('rehab-neuro-exam');
  const spineExam = getRehabVal('rehab-spine-exam');

  const posture = getRehabVal('rehab-posture');
  const gait = getRehabVal('rehab-gait');
  const balance = getRehabVal('rehab-balance');

  const rehabPlan = getRehabVal('rehab-plan');
  const actes = getRehabVal('rehab-actes');
  const sessionsPerWeek = getRehabVal('rehab-sessions-per-week');
  const durationWeeks = getRehabVal('rehab-duration-weeks');
  const cautions = getRehabVal('rehab-cautions');

  const objectives = getRehabVal('rehab-objectives');
  const evolution = getRehabVal('rehab-evolution');

  let html = '';

  if (rehabSubjectIncluded('motif', 'antecedents', 'fonctionnelle') || motif || antecedents || functionalHistory || pain) {
    html += `<h3>1. Motif & Anamnèse Fonctionnelle</h3>`;
    html += `<p><strong>Motif de la prise en charge :</strong> ${motif || 'Bilan de rééducation fonctionnelle.'}</p>`;
    if (antecedents) html += `<p><strong>Antécédents :</strong> ${antecedents}</p>`;
    if (currentTreatment) html += `<p><strong>Traitements en cours :</strong> ${currentTreatment}</p>`;
    if (functionalHistory) html += `<p><strong>Anamnèse fonctionnelle :</strong> ${functionalHistory}</p>`;
    if (pain) html += `<p><strong>Douleur :</strong> ${pain}</p>`;
  }

  if (rehabSubjectIncluded('articular', 'articulaire', 'musculaire', 'mesures') || amplitudes || stability || muscleStrength || tonus || measures) {
    html += `<h3>2. Bilan Articulaire & Musculaire</h3>`;
    if (amplitudes) html += `<p><strong>Amplitudes articulaires :</strong> ${amplitudes}</p>`;
    if (stability) html += `<p><strong>Stabilité & laxité :</strong> ${stability}</p>`;
    if (muscleStrength) html += `<p><strong>Force musculaire (MRC) :</strong> ${muscleStrength}</p>`;
    if (tonus) html += `<p><strong>Tonus & spasticité (Ashworth) :</strong> ${tonus}</p>`;
    if (measures) html += `<p><strong>Mesures & métrologie :</strong> ${measures}</p>`;
  }

  if (rehabSubjectIncluded('neuro', 'neurologique', 'rachidien') || neuroExam || spineExam) {
    html += `<h3>3. Bilan Neurologique & Rachidien</h3>`;
    if (neuroExam) html += `<p><strong>Examen neurologique :</strong> ${neuroExam}</p>`;
    if (spineExam) html += `<p><strong>Examen rachidien :</strong> ${spineExam}</p>`;
  }

  if (rehabSubjectIncluded('posture', 'marche', 'equilibre') || posture || gait || balance) {
    html += `<h3>4. Posture, Marche & Équilibre</h3>`;
    if (posture) html += `<p><strong>Analyse posturale :</strong> ${posture}</p>`;
    if (gait) html += `<p><strong>Analyse de la marche :</strong> ${gait}</p>`;
    if (balance) html += `<p><strong>Équilibre & coordination :</strong> ${balance}</p>`;
  }

  if (rehabSubjectIncluded('plan', 'actes', 'frequence') || rehabPlan || actes || sessionsPerWeek || cautions) {
    html += `<h3>5. Plan de Rééducation & Actes Kiné</h3>`;
    if (rehabPlan) html += `<p><strong>Plan de rééducation :</strong> ${rehabPlan}</p>`;
    if (actes) html += `<p><strong>Actes de kinésithérapie prescrits :</strong> ${actes}</p>`;
    if (sessionsPerWeek || durationWeeks) {
      html += `<p><strong>Fréquence :</strong> ${[sessionsPerWeek ? `${sessionsPerWeek} séances / semaine` : '', durationWeeks ? `durée : ${durationWeeks} semaines` : ''].filter(Boolean).join(' • ')}</p>`;
    }
    if (cautions) html += `<p><strong>Contre-indications / précautions :</strong> ${cautions}</p>`;
  }

  if (rehabSubjectIncluded('evolution', 'objectifs') || objectives || evolution) {
    html += `<h3>6. Évolution & Objectifs Thérapeutiques</h3>`;
    if (objectives) html += `<p><strong>Objectifs thérapeutiques :</strong> ${objectives}</p>`;
    if (evolution) html += `<p><strong>Évolution clinique :</strong> ${evolution}</p>`;
  }

  return html;
}

export function formatRehabDossierNumber(patient) {
  if (!patient) return currentRehabPatientId ? `#${currentRehabPatientId}` : '—';

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
    return `REH-${nameCode}-${birthCode}`;
  }

  const idShort = patient.id ? String(patient.id).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() : '01';
  return `REH-${nameCode}-${idShort}`;
}

export async function renderRehabWysiwygReport(forceRegenerate = false) {
  const clinicHeaderEl = document.getElementById('rehab-wysiwyg-clinic-header');
  const patientBannerEl = document.getElementById('rehab-wysiwyg-patient-banner');
  const reportTitleEl = document.getElementById('rehab-report-title');
  const editorEl = document.getElementById('rehab-wysiwyg-editor');
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
  const cabinetName = settings.cabinetName || "Cabinet Médical de Rééducation";
  const cabinetPhone = settings.cabinetPhone || '';
  const cabinetAddress = settings.cabinetAddress || '';
  const doctorSpecialty = settings.doctorSpecialty || 'Médecine Physique & de Réadaptation (MPR)';

  let patient = window.currentPatientData;
  if ((!patient || (currentRehabPatientId && String(patient.id) !== String(currentRehabPatientId))) && currentRehabPatientId) {
    if (window.api?.patient?.getById) {
      try {
        const res = await window.api.patient.getById(currentRehabPatientId);
        if (res?.success && res.data) {
          patient = res.data;
          window.currentPatientData = patient;
        }
      } catch (_) {}
    }
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (currentRehabPatientId ? `Patient #${currentRehabPatientId}` : 'AUCUN PATIENT SÉLECTIONNÉ');

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
  const rawDateExam = document.getElementById('rehab-date')?.value;
  const dateExam = rawDateExam ? new Date(rawDateExam).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dossierNumber = formatRehabDossierNumber(patient);
  const patientIdDisplay = patient?.id || currentRehabPatientId || '—';

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
            Bilans fonctionnels • Kinésithérapie • Éducation thérapeutique ${cabinetPhone ? `• Tél: ${cabinetPhone}` : ''}
          </p>
          ${cabinetAddress ? `<p style="margin: 2px 0 0 0; font-size: 10.5px; color: #9ca3af;">${cabinetAddress}</p>` : ''}
        </div>
        <div style="text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5;">
          <p style="margin: 0; font-weight: 700; color: #111827; font-size: 13px;">${cabinetName}</p>
          <p style="margin: 0;">Date du rapport : <strong>${dateExam}</strong></p>
          <p style="margin: 0;">Dossier N° : <strong style="color: #0d9488; font-family: monospace; font-size: 12.5px;">${dossierNumber}</strong></p>
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
          <div><span>Date de bilan :</span> <strong>${dateExam}</strong></div>
        </div>
      </div>
    `;
  }

  if (reportTitleEl) {
    reportTitleEl.innerHTML = `
      <h2 style="margin: 0; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #0f172a; background: #f0fdf4; display: inline-block; padding: 6px 18px; border-radius: 20px; border: 1px solid #99f6e4;">
        COMPTE-RENDU DE RÉÉDUCATION DU ${dateExam}
      </h2>
    `;
  }

  const existingContent = editorEl.innerHTML.trim();
  if (!existingContent || forceRegenerate) {
    editorEl.innerHTML = genererContenuRehabInitial();
  }
}

export function setRehabReportFormat(format) {
  const sheet = document.getElementById('rehab-wysiwyg-sheet');
  if (sheet) {
    sheet.classList.remove('format-a4', 'format-a5');
    sheet.classList.add(format === 'A5' ? 'format-a5' : 'format-a4');
  }
  const segmented = document.getElementById('rehab-report-format-segmented');
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

export function regenerateRehabReportContent() {
  renderRehabWysiwygReport(true);
  if (typeof showNotification === 'function') {
    showNotification('Contenu du rapport actualisé à partir des données du dossier', 'success');
  }
}

export function updateRehabSectionStepStatus() {
  const checks = {
    anamnese: Boolean(getRehabVal('rehab-motif') || getRehabVal('rehab-antecedents') || getRehabVal('rehab-functional-history') || getRehabVal('rehab-pain')),
    articular: Boolean(getRehabVal('rehab-amplitudes') || getRehabVal('rehab-muscle-strength') || getRehabVal('rehab-tonus') || getRehabVal('rehab-measures')),
    neuro: Boolean(getRehabVal('rehab-neuro-exam') || getRehabVal('rehab-spine-exam')),
    posture: Boolean(getRehabVal('rehab-posture') || getRehabVal('rehab-gait') || getRehabVal('rehab-balance')),
    plan: Boolean(getRehabVal('rehab-plan') || getRehabVal('rehab-actes') || getRehabVal('rehab-sessions-per-week')),
    evolution: Boolean(getRehabVal('rehab-objectives') || getRehabVal('rehab-evolution')),
    report: Boolean(document.getElementById('rehab-wysiwyg-editor')?.textContent?.trim())
  };

  document.querySelectorAll('#rehabilitation .orl-section-step-item').forEach(step => {
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

export function resetRehabProfile() {
  resetRehabFields();
}

export function createNewRehabReport() {
  if (!currentRehabPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez d\'abord sélectionner un patient', 'warning');
    }
    showRehabEmptyView();
    return;
  }
  currentRehabEditingReportId = null;
  resetRehabFields();
  const dateInput = document.getElementById('rehab-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const editor = document.getElementById('rehab-wysiwyg-editor');
  if (editor) {
    editor.innerHTML = genererContenuRehabInitial();
  }

  renderRehabWysiwygReport(true);
  updateRehabSectionStepStatus();
  showRehabWorkspaceView();
  switchRehabTab('anamnese');

  if (typeof showNotification === 'function') {
    showNotification('Nouveau bilan de rééducation initialisé', 'success');
  }
}

export function resetRehabilitationProfile() {
  resetRehabFields();
  switchRehabTab('anamnese');
}

function resetRehabFields() {
  const fields = [
    'rehab-motif', 'rehab-date', 'rehab-event-date', 'rehab-antecedents', 'rehab-current-treatment', 'rehab-functional-history', 'rehab-pain',
    'rehab-amplitudes', 'rehab-stability', 'rehab-muscle-strength', 'rehab-tonus', 'rehab-measures',
    'rehab-neuro-exam', 'rehab-spine-exam',
    'rehab-posture', 'rehab-gait', 'rehab-balance',
    'rehab-plan', 'rehab-actes', 'rehab-sessions-per-week', 'rehab-duration-weeks', 'rehab-cautions',
    'rehab-objectives', 'rehab-evolution'
  ];

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const dateInput = document.getElementById('rehab-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
}

/**
 * =========================================================================
 * APERÇU INTERACTIF AVANT IMPRESSION (A4 PRINT PREVIEW MODAL)
 * =========================================================================
 */

export async function openRehabPrintPreview() {
  if (!currentRehabPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez d\'abord sélectionner un patient pour afficher son compte-rendu', 'warning');
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
  const cabinetName = settings.cabinetName || "Cabinet Médical de Rééducation";
  const cabinetPhone = settings.cabinetPhone || '';
  const cabinetAddress = settings.cabinetAddress || '';
  const doctorSpecialty = settings.doctorSpecialty || 'Médecine Physique & de Réadaptation (MPR)';

  let patient = window.currentPatientData;
  if (!patient || String(patient.id) !== String(currentRehabPatientId)) {
    try {
      if (window.api?.patient?.getById) {
        const res = await window.api.patient.getById(currentRehabPatientId);
        if (res?.success && res.data) {
          patient = res.data;
          window.currentPatientData = patient;
        }
      }
    } catch (_) {}
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (document.getElementById('rehab-current-patient-display')?.textContent || 'Patient');
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

  const rawDateExam = document.getElementById('rehab-date')?.value;
  const dateExam = rawDateExam ? new Date(rawDateExam).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dossierNumber = formatRehabDossierNumber(patient);
  const reportTitle = `COMPTE-RENDU DE RÉÉDUCATION DU ${dateExam}`;
  const editorHtml = document.getElementById('rehab-wysiwyg-editor')?.innerHTML || genererContenuRehabInitial();

  const sheet = document.getElementById('rehab-preview-sheet');
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
          Bilans fonctionnels • Kinésithérapie • Éducation thérapeutique ${cabinetPhone ? `• Tél: ${cabinetPhone}` : ''}
        </p>
        ${cabinetAddress ? `<p style="margin: 2px 0 0 0; font-size: 10.5px; color: #9ca3af;">${cabinetAddress}</p>` : ''}
      </div>
      <div style="text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5;">
        <p style="margin: 0; font-weight: 700; color: #111827; font-size: 13px;">${cabinetName}</p>
        <p style="margin: 0;">Date du rapport : <strong>${dateExam}</strong></p>
        <p style="margin: 0;">Dossier N° : <strong style="color: #0d9488; font-family: monospace; font-size: 12.5px;">${dossierNumber}</strong></p>
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
        <div><span>Date de bilan :</span> <strong>${dateExam}</strong></div>
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
        <p style="margin: 2px 0 0 0;">Fiche de liaison remise au kinésithérapeute traitant.</p>
      </div>
      <div style="border: 1.5px solid #111827; border-radius: 4px; width: 220px; height: 95px; padding: 8px; text-align: center; font-size: 11px; color: #374151; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff;">
        <span style="font-weight: 600; text-transform: uppercase;">Cachet & Signature du Médecin</span>
        <span style="font-size: 11px; font-weight: 700; color: #111827;">${doctorTitle}</span>
      </div>
    </div>
  `;

  const modal = document.getElementById('rehab-print-preview-modal');
  if (modal) {
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

export function closeRehabPrintPreview() {
  const modal = document.getElementById('rehab-print-preview-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
  }
}

export function toggleRehabPreviewHeader(show) {
  const header = document.querySelector('#rehab-preview-sheet > div:first-child');
  if (header) {
    header.style.display = show ? 'flex' : 'none';
  }
}

export function triggerRehabDirectPrint() {
  const sheet = document.getElementById('rehab-preview-sheet');
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
      <title>Compte-Rendu de Rééducation</title>
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

export function openRehabReportWorkspace() {
  openRehabPrintPreview();
}

// ====================== Legacy aliases (backwards compatibility) ======================

export async function switchRehabMainTab(tabName) {
  const map = { bilans: 'anamnese', plans: 'plan', progression: 'evolution' };
  switchRehabTab(map[tabName] || tabName);
}

export async function loadRehabDataForPatient(patientId) {
  await selectRehabPatient(patientId, { fromGlobalSync: true });
}

export async function openEvaluationModal(patientId = null) {
  if (patientId) await selectRehabPatient(patientId, { fromGlobalSync: true });
  switchRehabTab('anamnese');
}

export async function openRehabPlanModal(patientId = null) {
  if (patientId) await selectRehabPatient(patientId, { fromGlobalSync: true });
  switchRehabTab('plan');
}

export async function saveEvaluation() { await saveRehabProfile(); }
export async function saveRehabPlan() { await saveRehabProfile(); }
export async function viewEvaluation() {}
export async function viewRehabPlan() {}
export async function printEvaluation() { await openRehabPrintPreview(); }
export async function printRehabPlan() { await openRehabPrintPreview(); }
export async function deleteEvaluation() {}
export async function deleteRehabPlan() {}
export function changeRehabBilansPage() {}
export function changeRehabPlansPage() {}

// ====================== Global attachments ======================

window.initRehabilitation = initRehabilitation;
window.refreshRehabPatientList = refreshRehabPatientList;
window.selectRehabPatient = selectRehabPatient;
window.switchRehabTab = switchRehabTab;
window.switchRehabMainTab = switchRehabMainTab;
window.saveRehabProfile = saveRehabProfile;
window.resetRehabProfile = resetRehabProfile;
window.resetRehabilitationProfile = resetRehabilitationProfile;
window.openRehabReportWorkspace = openRehabReportWorkspace;
window.openRehabPrintPreview = openRehabPrintPreview;
window.closeRehabPrintPreview = closeRehabPrintPreview;
window.triggerRehabDirectPrint = triggerRehabDirectPrint;
window.setRehabReportFormat = setRehabReportFormat;
window.regenerateRehabReportContent = regenerateRehabReportContent;
window.renderRehabWysiwygReport = renderRehabWysiwygReport;
window.updateRehabSectionStepStatus = updateRehabSectionStepStatus;
window.openRehabReportHistoryModal = openRehabReportHistoryModal;
window.closeRehabReportHistoryModal = closeRehabReportHistoryModal;
window.loadRehabHistoricalReport = loadRehabHistoricalReport;
window.previewRehabHistoricalReport = previewRehabHistoricalReport;
window.deleteRehabHistoricalReport = deleteRehabHistoricalReport;
window.createNewRehabReport = createNewRehabReport;
window.toggleRehabSubject = toggleRehabSubject;
window.isRehabSubjectIncluded = isRehabSubjectIncluded;
window.goToNextRehabTab = goToNextRehabTab;
window.goToPrevRehabTab = goToPrevRehabTab;
window.goToRehabStep = goToRehabStep;
window.addCurrentRehabTabToReport = addCurrentRehabTabToReport;
window.switchRehabSubTab = switchRehabSubTab;
window.editRehabHistoricalReport = editRehabHistoricalReport;
window.formatRehabDossierNumber = formatRehabDossierNumber;
window.loadRehabDataForPatient = loadRehabDataForPatient;
window.openEvaluationModal = openEvaluationModal;
window.openRehabPlanModal = openRehabPlanModal;
window.saveEvaluation = saveEvaluation;
window.saveRehabPlan = saveRehabPlan;
window.viewEvaluation = viewEvaluation;
window.viewRehabPlan = viewRehabPlan;
window.printEvaluation = printEvaluation;
window.printRehabPlan = printRehabPlan;
window.deleteEvaluation = deleteEvaluation;
window.deleteRehabPlan = deleteRehabPlan;
window.changeRehabBilansPage = changeRehabBilansPage;
window.changeRehabPlansPage = changeRehabPlansPage;
window.toggleRehabPreviewHeader = toggleRehabPreviewHeader;
window.showRehabEmptyView = showRehabEmptyView;
window.showRehabHistoryView = showRehabHistoryView;
window.showRehabWorkspaceView = showRehabWorkspaceView;
window.deselectRehabPatient = deselectRehabPatient;
window.renderRehabHistoryList = renderRehabHistoryList;
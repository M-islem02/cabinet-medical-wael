/**
 * Module Spécialité ORL (Oto-Rhino-Laryngologie & Explorations)
 * PhysioCare / MedCareSO ORL Edition
 */

let currentORLPatientId = null;
let currentEditingReportId = null;
let orlViewMode = 'empty'; // 'empty' | 'history' | 'wizard'

function getORLStorageKey(patientId) {
  return `orl_profile_${patientId || 'temp'}`;
}

export function hasORLReportContent() {
  const checkFields = [
    'orl-motif', 'orl-antecedents', 'orl-risk-factors', 'orl-antecedents-chirurgicaux',
    'orl-otoscopy-od', 'orl-otoscopy-og', 'orl-acouphenes', 'orl-rinne', 'orl-weber',
    'orl-audio-od-250', 'orl-audio-od-500', 'orl-audio-od-1k', 'orl-audio-od-2k', 'orl-audio-od-4k', 'orl-audio-od-8k',
    'orl-audio-og-250', 'orl-audio-og-500', 'orl-audio-og-1k', 'orl-audio-og-2k', 'orl-audio-og-4k', 'orl-audio-og-8k',
    'orl-rhinoscopy', 'orl-rhino-symptoms', 'orl-rhino-septum', 'orl-rhino-cornets', 'orl-rhino-discharge',
    'orl-mouth-symptoms', 'orl-pharynx-tonsils', 'orl-pharynx-wall', 'orl-mouth-palate',
    'orl-fibro-larynx', 'orl-fibro-epiglottis', 'orl-larynx-mobility', 'orl-fibro-pyriform',
    'orl-cervical', 'orl-vertigo-type', 'orl-dix-hallpike',
    'orl-diagnosis', 'orl-diagnosis-secondary', 'orl-treatment', 'orl-procedures', 'orl-investigations', 'orl-followup'
  ];
  return checkFields.some(id => Boolean(document.getElementById(id)?.value?.trim()));
}

export function updateORLToolbar() {
  const btnNew = document.getElementById('orl-btn-new-report');
  const btnSave = document.getElementById('orl-btn-save');
  const btnPrint = document.getElementById('orl-btn-print');
  const btnHistory = document.getElementById('orl-btn-history');
  const btnEditor = document.getElementById('orl-btn-editor');
  const btnMore = document.getElementById('orl-more-actions-btn');

  const hasPatient = Boolean(currentORLPatientId);
  const isWizard = orlViewMode === 'wizard';
  const isHistory = orlViewMode === 'history';

  const setBtnState = (btn, enabled) => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.45';
    btn.style.pointerEvents = enabled ? 'auto' : 'none';
    btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  };

  // + Nouveau Rapport: show in top bar only in wizard mode (hidden in history view to avoid duplicate buttons)
  if (btnNew) {
    btnNew.style.display = isHistory ? 'none' : 'inline-flex';
    setBtnState(btnNew, hasPatient);
  }

  // Historique: active whenever a patient is selected
  setBtnState(btnHistory, hasPatient);
  if (btnHistory) {
    if (isHistory && hasPatient) {
      btnHistory.style.borderColor = '#1677ff';
      btnHistory.style.color = '#1677ff';
      btnHistory.style.background = '#e6f0ff';
    } else {
      btnHistory.style.borderColor = '';
      btnHistory.style.color = '';
      btnHistory.style.background = '';
    }
  }

  // Enregistrer: active only when editing a report in wizard
  setBtnState(btnSave, hasPatient && isWizard);

  // Éditeur: active only when in wizard mode with a patient
  setBtnState(btnEditor, hasPatient && isWizard);

  // More actions: active only when in wizard mode with a patient
  setBtnState(btnMore, hasPatient && isWizard);

  // Imprimer / Aperçu: active in wizard mode (if at least one section has data or on tab report)
  const hasContent = hasORLReportContent();
  const printEnabled = hasPatient && isWizard && (hasContent || currentActiveORLTab === 'report');
  setBtnState(btnPrint, printEnabled);
}

export function showORLEmptyView() {
  orlViewMode = 'empty';
  const emptyPanel = document.getElementById('orl-empty-view');
  const historyPanel = document.getElementById('orl-history-view');
  const wizardPanel = document.getElementById('orl-wizard-view');
  if (emptyPanel) {
    emptyPanel.classList.remove('orl-view-hidden');
    emptyPanel.style.display = 'block';
  }
  if (historyPanel) {
    historyPanel.classList.add('orl-view-hidden');
    historyPanel.style.display = 'none';
  }
  if (wizardPanel) {
    wizardPanel.classList.add('orl-view-hidden');
    wizardPanel.style.display = 'none';
  }
  updateORLPatientDisplay(null);
  updateORLToolbar();
}

export function showORLHistoryView() {
  const patientId = currentORLPatientId || window.currentPatientId || (window.currentPatientData && window.currentPatientData.id);
  if (!patientId) {
    showORLEmptyView();
    return;
  }
  currentORLPatientId = String(patientId);
  orlViewMode = 'history';
  const emptyPanel = document.getElementById('orl-empty-view');
  const historyPanel = document.getElementById('orl-history-view');
  const wizardPanel = document.getElementById('orl-wizard-view');
  if (emptyPanel) {
    emptyPanel.classList.add('orl-view-hidden');
    emptyPanel.style.display = 'none';
  }
  if (historyPanel) {
    historyPanel.classList.remove('orl-view-hidden');
    historyPanel.style.display = 'block';
  }
  if (wizardPanel) {
    wizardPanel.classList.add('orl-view-hidden');
    wizardPanel.style.display = 'none';
  }
  renderORLHistoryList();
  updateORLToolbar();
}

export function showORLWizardView() {
  const patientId = currentORLPatientId || window.currentPatientId || (window.currentPatientData && window.currentPatientData.id);
  if (!patientId) {
    showORLEmptyView();
    return;
  }
  currentORLPatientId = String(patientId);
  orlViewMode = 'wizard';
  const emptyPanel = document.getElementById('orl-empty-view');
  const historyPanel = document.getElementById('orl-history-view');
  const wizardPanel = document.getElementById('orl-wizard-view');
  if (emptyPanel) {
    emptyPanel.classList.add('orl-view-hidden');
    emptyPanel.style.display = 'none';
  }
  if (historyPanel) {
    historyPanel.classList.add('orl-view-hidden');
    historyPanel.style.display = 'none';
  }
  if (wizardPanel) {
    wizardPanel.classList.remove('orl-view-hidden');
    wizardPanel.style.display = 'flex';
  }
  updateORLToolbar();
}

export async function initORL() {
  console.log('Initializing ORL module...');
  await refreshORLPatientList();
  
  const dateInput = document.getElementById('orl-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const initialPatientId = window.currentPatientId || null;
  if (initialPatientId) {
    await selectORLPatient(initialPatientId, { fromGlobalSync: true });
    showORLHistoryView();
  } else {
    showORLEmptyView();
  }

  window.removeEventListener('medcare:patient-selected', handleGlobalPatientSelected);
  window.addEventListener('medcare:patient-selected', handleGlobalPatientSelected);

  // Track user input to live-update toolbar print state
  document.querySelectorAll('#orl input, #orl textarea, #orl select').forEach(input => {
    input.addEventListener('input', () => updateORLToolbar());
    input.addEventListener('change', () => updateORLToolbar());
  });

  // Initialize AntCollapse on all ORL collapse groups
  document.querySelectorAll('#orl [data-collapse-group]').forEach(group => {
    if (typeof AntCollapse !== 'undefined') {
      AntCollapse.init('#orl [data-collapse-group="' + group.dataset.collapseGroup + '"]');
    }
  });

  // Initialize AntCheckableTag for motif presets
  if (typeof AntCheckableTag !== 'undefined') {
    const motifContainer = document.getElementById('orl-motif-tags');
    if (motifContainer) {
      AntCheckableTag.init(motifContainer, {
        options: ['Hypoacousie', 'Otalgie', 'Acouphènes', 'Vertiges', 'Rhinite', 'Sinusite', 'Angine', 'Dysphonie', 'Bouchon cérumen', 'Otite', 'Epistaxis', 'Dysphagie'],
        targetField: 'orl-motif',
        multiple: true
      });
    }
    const riskContainer = document.getElementById('orl-risk-tags');
    if (riskContainer) {
      AntCheckableTag.init(riskContainer, {
        options: ['Tabagisme', 'Alcool', 'Exposition sonore', 'Allergie médicamenteuse', 'Diabète', 'HTA', 'Immunodépression'],
        targetField: 'orl-risk-factors',
        multiple: true
      });
    }
  }

  // Initialize dropdown for More Actions button (Spec 11)
  if (typeof AntDropdown !== 'undefined') {
    const moreBtn = document.getElementById('orl-more-actions-btn');
    if (moreBtn) {
      AntDropdown.create(moreBtn, [
        { key: 'expand', label: 'Déplier tout', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' },
        { key: 'collapse', label: 'Replier tout', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>' },
        { divider: true },
        { key: 'reset', label: 'Réinitialiser le dossier', danger: true, icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' },
      ], {
        onClick: (key) => {
          if (key === 'expand') {
            const activePane = document.querySelector('#orl .ant-tabs-pane.active');
            if (activePane) {
              const selector = '#orl .ant-tabs-pane.active .ant-collapse';
              if (typeof AntCollapse !== 'undefined') AntCollapse.expandAll(selector);
            }
          } else if (key === 'collapse') {
            const activePane = document.querySelector('#orl .ant-tabs-pane.active');
            if (activePane) {
              const selector = '#orl .ant-tabs-pane.active .ant-collapse';
              if (typeof AntCollapse !== 'undefined') AntCollapse.collapseAll(selector);
            }
          } else if (key === 'reset') {
            if (confirm('Réinitialiser tout le dossier ? Toutes les modifications non enregistrées seront perdues.')) {
              resetORLProfile();
            }
          }
        }
      });
    }
  }

  updateORLToolbar();
  updateORLSaveButtonsUI();
}

function handleGlobalPatientSelected(e) {
  const patientId = e.detail?.patientId;
  const patient = e.detail?.patient;
  if (patientId && String(patientId) !== String(currentORLPatientId)) {
    selectORLPatient(patientId, { patient, fromGlobalSync: true });
  } else if (!patientId) {
    selectORLPatient(null);
  }
}

export function renderORLHistoryList() {
  const listEl = document.getElementById('orl-history-list');
  const patientSubEl = document.getElementById('orl-history-view-patient-subtitle');
  if (!listEl) return;

  let patient = window.currentPatientData;
  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (currentORLPatientId ? `Patient #${currentORLPatientId}` : 'Aucun patient sélectionné');
  if (patientSubEl) {
    patientSubEl.innerHTML = currentORLPatientId ? `Patient : <strong style="color: #1677ff; font-size: 15.5px;">${patientName}</strong>` : `Patient : <em>Aucun patient sélectionné</em>`;
  }

  if (!currentORLPatientId) {
    listEl.innerHTML = `
      <div class="ant-empty" style="padding: 56px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div class="ant-empty-image" style="margin-bottom: 20px;">
          <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 18h48v36a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18z" fill="#f8fafc"/>
            <path d="M8 18l6-10h36l6 10H8z" fill="#f1f5f9"/>
            <line x1="26" y1="34" x2="38" y2="34"/>
          </svg>
        </div>
        <div style="font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Aucun patient sélectionné</div>
        <div style="font-size: 15px; color: #64748b; max-width: 480px; line-height: 1.6;">Veuillez sélectionner un patient dans la barre supérieure pour consulter ou créer des comptes-rendus ORL.</div>
      </div>
    `;
    return;
  }

  const history = getORLHistory(currentORLPatientId);

  if (history.length === 0) {
    const raw = localStorage.getItem(getORLStorageKey(currentORLPatientId));
    if (raw) {
      try {
        const initialData = JSON.parse(raw);
        saveORLHistoryEntry(currentORLPatientId, initialData);
      } catch (_) {}
    }
  }

  const updatedHistory = getORLHistory(currentORLPatientId);
  const headerActions = document.getElementById('orl-history-header-actions');

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
        <div style="font-size: 19px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Aucun compte-rendu enregistré</div>
        <div style="font-size: 15px; color: #64748b; max-width: 460px; line-height: 1.6; margin-bottom: 22px;">Créez un premier rapport médical pour ce patient afin d'initialiser son historique.</div>
        <button type="button" class="btn btn-primary" onclick="createNewORLReport()" style="height: 42px; padding: 0 24px; font-size: 14.5px; font-weight: 650; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px; background: #1677ff; border-color: #1677ff; box-shadow: 0 2px 6px rgba(22, 119, 255, 0.25);">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Créer un premier rapport</span>
        </button>
      </div>
    `;
    return;
  }

  if (headerActions) headerActions.style.display = 'block';

  let html = `<div style="display: flex; flex-direction: column; gap: 14px;">`;

  updatedHistory.forEach((item, index) => {
    const reportId = item.id || `orl_rep_${index}`;
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const savedTime = item.savedAt ? new Date(item.savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const diagnosis = item.diagnosis || 'Bilan standard';
    const motif = item.motif || 'Consultation ORL';
    const hearing = item.hearingType || 'Normale';
    const status = item.status || (item.date ? 'Enregistré' : 'Brouillon');

    html += `
      <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
            <span class="ant-tag ant-tag-processing" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 700; font-size: 13px; padding: 3px 10px; border-radius: 6px;">
              ${formattedDate} ${savedTime ? `(${savedTime})` : ''}
            </span>
            ${item.hasFibro ? '<span class="ant-tag ant-tag-warning" style="font-size: 13px; padding: 3px 10px; border-radius: 6px;">Fibroscopie</span>' : ''}
            <span class="ant-tag" style="background: #f0fdf4; color: #15803d; border-color: #bbf7d0; font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 6px;">${hearing}</span>
            <span class="ant-tag" style="background: #f8fafc; color: #475569; border-color: #cbd5e1; font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 6px;">${status}</span>
          </div>
          <div style="font-size: 16.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
            ${escapeHTML(motif)}
          </div>
          <div style="font-size: 14.5px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <strong style="color: #1e293b;">Diagnostic :</strong> ${escapeHTML(diagnosis)}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
          <button type="button" class="btn btn-primary" onclick="editORLHistoricalReport('${reportId}')" style="height: 36px; padding: 0 14px; font-size: 13.5px; font-weight: 600; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; background: #1677ff; border-color: #1677ff; cursor: pointer;" title="Modifier ce compte-rendu">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Modifier</span>
          </button>
          <button type="button" class="btn btn-secondary" onclick="previewORLHistoricalReport('${reportId}')" style="height: 36px; padding: 0 14px; font-size: 13.5px; font-weight: 600; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; background: #ffffff; border: 1.5px solid #cbd5e1; color: #334155; cursor: pointer;" title="Aperçu avant impression">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>Imprimer</span>
          </button>
          <button type="button" class="btn" onclick="deleteORLHistoricalReport('${reportId}')" style="height: 36px; width: 36px; min-width: 36px; padding: 0; border-radius: 7px; background: #fff1f2; border: 1.5px solid #fca5a5; color: #e11d48; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);" title="Supprimer ce compte-rendu">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  listEl.innerHTML = html;
}

export async function refreshORLPatientList() {
  const select = document.getElementById('orl-patient-selector');
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
        console.warn('api.patient.getAll error in ORL:', e);
      }
    }

    if ((!patients || patients.length === 0) && window.api?.patient?.getDirectory) {
      try {
        const resDir = await window.api.patient.getDirectory();
        if (resDir?.success && Array.isArray(resDir.data)) {
          patients = resDir.data;
        }
      } catch (e) {
        console.warn('api.patient.getDirectory error in ORL:', e);
      }
    }

    if ((!patients || patients.length === 0) && Array.isArray(window.patients) && window.patients.length > 0) {
      patients = window.patients;
    }

    const activeId = currentORLPatientId || window.currentPatientId;
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

    window._orlPatientsCache = patients;

    const currentVal = select.value || activeId;
    select.innerHTML = '<option value="">Rechercher un patient...</option>';
    
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
        maxResults: 8,
        allowClear: true,
        showAvatar: true,
        placeholder: 'Rechercher un patient (nom, prénom, tél)...',
        searchPromptText: 'Tapez au moins 1 caractère pour rechercher...',
        searchEmptyText: 'Aucun patient trouvé',
        onSelect: (val) => {
          selectORLPatient(val, { fromGlobalSync: false });
        }
      });
    }
  } catch (err) {
    console.error('Error loading patients for ORL:', err);
  }
}

export async function selectORLPatient(patientId, options = {}) {
  const normalizedId = patientId ? String(patientId).trim() : null;
  if (!normalizedId) {
    currentORLPatientId = null;
    window.currentPatientId = null;
    window.currentPatientData = null;
    updateORLPatientDisplay(null);
    resetORLFields();
    showORLEmptyView();
    const select = document.getElementById('orl-patient-selector');
    if (select && typeof AntSelect !== 'undefined') {
      AntSelect.setValue(select, '');
    } else if (select) {
      select.value = '';
    }
    return;
  }

  currentORLPatientId = normalizedId;
  window.currentPatientId = normalizedId;

  const select = document.getElementById('orl-patient-selector');
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

    if (patient) {
      window.currentPatientData = patient;
      updateORLPatientDisplay(patient);
      loadORLProfile(normalizedId);
      renderSiderHistory(normalizedId);
      renderORLWysiwygReport(true);
      showORLHistoryView();

      if (!options.fromGlobalSync && typeof window.setSelectedPatient === 'function') {
        window.setSelectedPatient(normalizedId, { patient, source: 'orl' });
      }
    } else {
      updateORLPatientDisplay(null);
      showORLHistoryView();
    }
  } catch (e) {
    console.error('Error in selectORLPatient:', e);
    showORLHistoryView();
  }
}

function updateORLPatientDisplay(patient) {
  const display = document.getElementById('orl-current-patient-display');
  const avatar = document.getElementById('orl-patient-avatar');

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
  const dossierNum = formatORLDossierNumber(patient);
  if (dossierNum && dossierNum !== '—') details.push(dossierNum);
  if (patient.age || patient.birthDate) {
    const ageVal = patient.age || (typeof calculatePatientAgeYears === 'function' ? calculatePatientAgeYears(patient.birthDate) : null);
    if (ageVal) details.push(`${ageVal} ans`);
  }
  if (patient.phone) details.push(patient.phone);
  if (patient.gender) details.push(patient.gender === 'female' || patient.gender === 'F' ? 'Femme' : (patient.gender === 'male' || patient.gender === 'M' ? 'Homme' : ''));

  const filteredDetails = details.filter(Boolean);
  const extra = filteredDetails.length > 0 ? ` — ${filteredDetails.join(' • ')}` : '';
  if (display) display.textContent = `${name}${extra}`;
  renderSiderHistory(patient ? patient.id : null);
}

function renderSiderHistory(patientId) {
  const box = document.getElementById('orl-sider-history-box');
  const itemsContainer = document.getElementById('orl-sider-history-items');
  if (!box || !itemsContainer) return;

  if (!patientId) {
    box.style.display = 'none';
    itemsContainer.innerHTML = '';
    return;
  }

  const history = getORLHistory(patientId);
  if (!history || history.length === 0) {
    box.style.display = 'none';
    itemsContainer.innerHTML = '';
    return;
  }

  box.style.display = 'block';
  itemsContainer.innerHTML = history.slice(0, 5).map((item, index) => {
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const motif = item.motif || 'Consultation ORL';
    return `
      <div onclick="loadORLHistoricalReport(${index})" style="padding: 4px 6px; background: #ffffff; border: 1px solid #f0f0f0; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; transition: border-color 0.2s;" title="Charger ce rapport (${formattedDate})">
        <span style="font-weight: 600; color: #1677ff;">${formattedDate}</span>
        <span style="color: rgba(0,0,0,0.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">${motif}</span>
      </div>
    `;
  }).join('');
}

export const ORL_TAB_LIST = [
  { id: 'anamnese', label: '1. Anamnèse & Motif', step: 1 },
  { id: 'clinical', label: '2. Oreilles & Otoscopie', step: 2 },
  { id: 'audio', label: '3. Audiométrie & Impédance', step: 3 },
  { id: 'rhino', label: '4. Nez & Sinus', step: 4 },
  { id: 'pharynx', label: '5. Bouche & Pharynx', step: 5 },
  { id: 'larynx', label: '6. Larynx & Fibroscopie', step: 6 },
  { id: 'vestibular', label: '7. Vestibulaire & Cou', step: 7 },
  { id: 'conclusion', label: '8. Diagnostic & Soins', step: 8 },
  { id: 'report', label: '9. Compte-Rendu & Impression', step: 9 }
];

let currentActiveORLTab = 'anamnese';
const ORL_DEFAULT_INCLUDED_SUBJECTS = ['motif', 'conclusion'];
const orlIncludedSubjects = new Set(ORL_DEFAULT_INCLUDED_SUBJECTS);

const ORL_SECTION_SUBJECTS = {
  anamnese: ['motif', 'risks', 'antecedents'],
  clinical: ['otoscopy-od', 'otoscopy-og', 'acouphenes'],
  audio: ['audio-type', 'audio-freq', 'audio-tympanometry'],
  rhino: ['rhinoscopy', 'rhino-symptoms'],
  pharynx: ['mouth', 'pharynx-tonsils'],
  larynx: ['fibro-larynx', 'larynx-symptoms'],
  vestibular: ['cervical', 'vestibular-tests'],
  conclusion: ['conclusion', 'treatment']
};

function orlSectionIncluded(sectionKey) {
  const subjects = ORL_SECTION_SUBJECTS[sectionKey] || [sectionKey];
  return subjects.some(s => orlIncludedSubjects.has(s));
}

export function toggleORLSubject(subjectKey, forceState = null) {
  const isIncluded = forceState !== null ? forceState : !orlIncludedSubjects.has(subjectKey);
  if (isIncluded) {
    orlIncludedSubjects.add(subjectKey);
  } else {
    orlIncludedSubjects.delete(subjectKey);
  }

  // Update button visual state across the document
  document.querySelectorAll(`.orl-add-subject-btn[data-subject="${subjectKey}"]`).forEach(btn => {
    btn.classList.toggle('is-included', isIncluded);
    const icon = btn.querySelector('.plus-icon');
    const text = btn.querySelector('.btn-text');
    if (icon) icon.textContent = isIncluded ? '✓' : '+';
    if (text) text.textContent = isIncluded ? 'Inclus au rapport' : 'Ajouter au rapport';
  });

  renderORLWysiwygReport(true);
  updateORLSectionStepStatus();

  if (typeof showNotification === 'function') {
    const actionLabel = isIncluded ? '✓ Ajouté au compte-rendu' : 'Retiré du compte-rendu';
    showNotification(`${actionLabel} : ${subjectKey}`, isIncluded ? 'success' : 'info');
  }
}

export function isORLSubjectIncluded(subjectKey) {
  return orlIncludedSubjects.has(subjectKey);
}

export function isORLSectionComplete(tabKey) {
  const fieldMap = {
    anamnese: ['orl-motif', 'orl-antecedents', 'orl-risk-factors', 'orl-antecedents-chirurgicaux'],
    clinical: ['orl-otoscopy-od', 'orl-otoscopy-og', 'orl-acouphenes'],
    audio: ['orl-audio-od-250', 'orl-audio-od-500', 'orl-audio-od-1k', 'orl-audio-od-2k', 'orl-audio-od-4k', 'orl-audio-od-8k', 'orl-audio-og-250', 'orl-audio-og-500', 'orl-audio-og-1k', 'orl-audio-og-2k', 'orl-audio-og-4k', 'orl-audio-og-8k', 'orl-audio-speech', 'orl-hearing-degree', 'orl-hearing-type', 'orl-rinne'],
    rhino: ['orl-rhinoscopy', 'orl-rhino-symptoms', 'orl-rhino-septum', 'orl-rhino-cornets', 'orl-rhino-external'],
    pharynx: ['orl-mouth-lips-teeth', 'orl-mouth-tongue', 'orl-mouth-palate', 'orl-mouth-symptoms', 'orl-pharynx-tonsils', 'orl-pharynx-wall', 'orl-salivary'],
    larynx: ['orl-fibro-larynx', 'orl-fibro-epiglottis', 'orl-fibro-pyriform', 'orl-larynx-mobility', 'orl-larynx-symptoms'],
    vestibular: ['orl-cervical', 'orl-dix-hallpike'],
    conclusion: ['orl-diagnosis', 'orl-diagnosis-secondary', 'orl-procedures', 'orl-investigations', 'orl-followup'],
    report: ['orl-wysiwyg-editor']
  };

  const ids = fieldMap[tabKey] || [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    let value = '';
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      value = el.value || '';
    } else {
      value = el.textContent || '';
    }
    if (String(value).trim() !== '') return true;
  }
  return false;
}

export function syncORLIncludeToggles() {
  document.querySelectorAll('.orl-add-subject-btn[data-subject]').forEach(btn => {
    const subjectKey = btn.dataset.subject;
    const isInc = orlIncludedSubjects.has(subjectKey);
    btn.classList.toggle('is-included', isInc);
    const icon = btn.querySelector('.plus-icon');
    const text = btn.querySelector('.btn-text');
    if (icon) icon.textContent = isInc ? '✓' : '+';
    if (text) text.textContent = isInc ? 'Inclus au rapport' : 'Ajouter au rapport';
  });
}

export function getCurrentORLTab() {
  return currentActiveORLTab;
}

let isNavigatingStep = false;

export function goToNextORLTab() {
  if (isNavigatingStep) return;
  isNavigatingStep = true;
  setTimeout(() => { isNavigatingStep = false; }, 200);

  const currentIndex = ORL_TAB_LIST.findIndex(t => t.id === currentActiveORLTab);
  if (currentIndex >= 0 && currentIndex < ORL_TAB_LIST.length - 1) {
    switchORLTab(ORL_TAB_LIST[currentIndex + 1].id);
  }
}

export function goToPrevORLTab() {
  if (isNavigatingStep) return;
  isNavigatingStep = true;
  setTimeout(() => { isNavigatingStep = false; }, 200);

  const currentIndex = ORL_TAB_LIST.findIndex(t => t.id === currentActiveORLTab);
  if (currentIndex > 0) {
    switchORLTab(ORL_TAB_LIST[currentIndex - 1].id);
  }
}

export function goToORLStep(stepNumber) {
  const target = ORL_TAB_LIST.find(t => t.step === stepNumber);
  if (target) {
    switchORLTab(target.id);
  }
}

export function addCurrentTabToReport(tabName = currentActiveORLTab) {
  const tabSubjectsMap = {
    anamnese: ['motif', 'risks', 'antecedents'],
    clinical: ['otoscopy-od', 'otoscopy-og', 'acouphenes'],
    audio: ['audio-type', 'audio-freq', 'audio-tympanometry'],
    rhino: ['rhinoscopy', 'rhino-symptoms'],
    pharynx: ['mouth', 'pharynx-tonsils'],
    larynx: ['fibro-larynx', 'larynx-symptoms'],
    vestibular: ['cervical', 'vestibular-tests'],
    conclusion: ['conclusion', 'treatment']
  };

  const subjects = tabSubjectsMap[tabName] || [tabName];
  subjects.forEach(s => orlIncludedSubjects.add(s));

  subjects.forEach(s => {
    document.querySelectorAll(`.orl-add-subject-btn[data-subject="${s}"]`).forEach(btn => {
      btn.classList.add('is-included');
      const icon = btn.querySelector('.plus-icon');
      const text = btn.querySelector('.btn-text');
      if (icon) icon.textContent = '✓';
      if (text) text.textContent = 'Inclus au rapport';
    });
  });

  renderORLWysiwygReport(true);
  updateORLSectionStepStatus();

  if (typeof showNotification === 'function') {
    showNotification('Étape ajoutée au compte-rendu médical', 'success');
  }
}

export function switchORLSubTab(sectionId, subTabId) {
  const sectionEl = document.getElementById('orl-tab-' + sectionId);
  if (!sectionEl) return;

  // Update subtab buttons
  sectionEl.querySelectorAll('.orl-subtab-btn').forEach(btn => {
    const isTarget = btn.dataset.subtab === subTabId;
    btn.classList.toggle('active', isTarget);
  });

  // Update subtab panes
  sectionEl.querySelectorAll('.orl-subtab-pane').forEach(pane => {
    const isTarget = pane.dataset.subtab === subTabId;
    pane.classList.toggle('active', isTarget);
  });

  // Update the add button in header
  const headerAddBtn = sectionEl.querySelector('.orl-master-card-header .orl-add-subject-btn');
  if (headerAddBtn) {
    headerAddBtn.dataset.subject = subTabId;
    headerAddBtn.setAttribute('onclick', `event.stopPropagation(); toggleORLSubject('${subTabId}')`);
    const isInc = isORLSubjectIncluded(subTabId);
    headerAddBtn.classList.toggle('is-included', isInc);
    const icon = headerAddBtn.querySelector('.plus-icon');
    const text = headerAddBtn.querySelector('.btn-text');
    if (icon) icon.textContent = isInc ? '✓' : '+';
    if (text) text.textContent = isInc ? 'Inclus au rapport' : 'Ajouter au rapport';
  }
}

export function switchORLTab(tabName) {
  currentActiveORLTab = tabName;

  // Update vertical steps and pill buttons
  document.querySelectorAll('#orl .orl-section-step-item, #orl .orl-tab-pill-btn, #orl .ant-tabs-tab').forEach(btn => {
    btn.classList.remove('active');
    const tab = btn.dataset.tab;
    const onclickAttr = btn.getAttribute('onclick') || '';
    if (tab === tabName || onclickAttr.includes(`'${tabName}'`) || onclickAttr.includes(`"${tabName}"`)) {
      btn.classList.add('active');
    }
  });

  // Update pagination step dots in all footers
  const currentStep = ORL_TAB_LIST.find(t => t.id === tabName)?.step || 1;
  document.querySelectorAll('#orl .orl-step-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step, 10);
    dot.classList.toggle('active', dotStep === currentStep);
    dot.classList.toggle('completed', dotStep < currentStep);
  });

  // Update tab panes
  document.querySelectorAll('#orl .ant-tabs-pane').forEach(pane => pane.classList.remove('active'));
  const activePane = document.getElementById('orl-tab-' + tabName);
  if (activePane) activePane.classList.add('active');

  if (tabName === 'report') {
    renderORLWysiwygReport(true);
  }

  updateORLToolbar();
}

export function insertPresetText(fieldId, text) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  if (!field.value || field.value.trim() === '') {
    field.value = text;
  } else {
    field.value = field.value.trim() + ' — ' + text;
  }
  field.focus();
}

export function loadORLProfile(patientId) {
  if (!patientId) return;

  try {
    const raw = localStorage.getItem(getORLStorageKey(patientId));
    const data = raw ? JSON.parse(raw) : null;
    
    if (data) {
      // Restore included subjects for report
      orlIncludedSubjects.clear();
      if (Array.isArray(data.includedSubjects) && data.includedSubjects.length > 0) {
        data.includedSubjects.forEach(s => orlIncludedSubjects.add(s));
      } else {
        ORL_DEFAULT_INCLUDED_SUBJECTS.forEach(s => orlIncludedSubjects.add(s));
      }
      if (typeof syncORLIncludeToggles === 'function') syncORLIncludeToggles();

      // 1. Anamnèse
      setVal('orl-motif', data.motif);
      setVal('orl-date', data.date || new Date().toISOString().split('T')[0]);
      setVal('orl-antecedents', data.antecedents);
      setVal('orl-risk-factors', data.riskFactors);
      if (data.antecedentsChirurgicaux) setVal('orl-antecedents-chirurgicaux', data.antecedentsChirurgicaux);

      // Report WYSIWYG
      const editor = document.getElementById('orl-wysiwyg-editor');
      if (editor && data.reportWysiwygHtml) {
        editor.innerHTML = data.reportWysiwygHtml;
      }

      // 2. Ears
      setVal('orl-otoscopy-od', data.otoscopyOd);
      setVal('orl-otoscopy-og', data.otoscopyOg);
      setVal('orl-acouphenes', data.acouphenes);
      setVal('orl-rinne', data.rinne);
      setVal('orl-weber', data.weber);

      // 3. Audio
      setVal('orl-hearing-type', data.hearingType || 'Normale');
      setVal('orl-hearing-degree', data.hearingDegree || 'Aucune');
      setVal('orl-audio-od-250', data.audioOd250);
      setVal('orl-audio-od-500', data.audioOd500);
      setVal('orl-audio-od-1k', data.audioOd1k);
      setVal('orl-audio-od-2k', data.audioOd2k);
      setVal('orl-audio-od-4k', data.audioOd4k);
      setVal('orl-audio-od-8k', data.audioOd8k);
      setVal('orl-audio-og-250', data.audioOg250);
      setVal('orl-audio-og-500', data.audioOg500);
      setVal('orl-audio-og-1k', data.audioOg1k);
      setVal('orl-audio-og-2k', data.audioOg2k);
      setVal('orl-audio-og-4k', data.audioOg4k);
      setVal('orl-audio-og-8k', data.audioOg8k);
      setVal('orl-audio-speech', data.audioSpeech);
      setVal('orl-tympanometry', data.tympanometry);

      // 4. Nose & Sinus
      setVal('orl-rhino-symptoms', data.rhinoSymptoms);
      setVal('orl-rhino-external', data.rhinoExternal);
      setVal('orl-rhinoscopy', data.rhinoscopy);
      setVal('orl-rhino-septum', data.rhinoSeptum);
      setVal('orl-rhino-cornets', data.rhinoCornets);
      setVal('orl-rhino-discharge', data.rhinoDischarge);

      // 5. Mouth & Pharynx
      setVal('orl-mouth-symptoms', data.mouthSymptoms);
      setVal('orl-mouth-lips-teeth', data.mouthLipsTeeth);
      setVal('orl-mouth-tongue', data.mouthTongue);
      setVal('orl-mouth-palate', data.mouthPalate);
      setVal('orl-pharynx-tonsils', data.pharynxTonsils || data.pharynx);
      setVal('orl-pharynx-wall', data.pharynxWall);
      setVal('orl-pharynx-cavum', data.pharynxCavum || data.fibroCavum);

      // 6. Larynx & Fibroscopy
      setVal('orl-larynx-symptoms', data.larynxSymptoms);
      setVal('orl-fibro-epiglottis', data.fibroEpiglottis);
      setVal('orl-fibro-larynx', data.fibroLarynx);
      setVal('orl-larynx-mobility', data.larynxMobility);
      setVal('orl-fibro-pyriform', data.fibroPyriform);

      // 7. Vestibular & Neck
      setVal('orl-cervical', data.cervical);
      setVal('orl-salivary', data.salivary);
      setVal('orl-vertigo-type', data.vertigoType);
      setVal('orl-vertigo-signs', data.vertigoSigns);
      setVal('orl-dix-hallpike', data.dixHallpike);
      setVal('orl-hit-test', data.hitTest);
      setVal('orl-vestibular-posture', data.vestibularPosture);

      // 8. Conclusion & Treatment
      setVal('orl-diagnosis', data.diagnosis);
      setVal('orl-diagnosis-secondary', data.diagnosisSecondary);
      setVal('orl-treatment', data.treatment);
      setVal('orl-procedures', data.procedures);
      setVal('orl-investigations', data.investigations);
      setVal('orl-followup', data.followup);

      // 9. Report
      setVal('orl-report-title', data.reportTitle || 'COMPTE-RENDU D\'EXAMEN & EXPLORATIONS ORL');
      setVal('orl-report-custom-notes', data.reportCustomNotes);

      // Update stats
      updateORLStats(data);
    } else {
      resetORLFields();
      setVal('orl-date', new Date().toISOString().split('T')[0]);
    }
  } catch (err) {
    console.error('Error loading ORL data:', err);
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val !== undefined && val !== null ? String(val) : '';
}

function getVal(id) {
  return document.getElementById(id)?.value || '';
}

function isChecked(id) {
  const el = document.getElementById(id);
  return el ? el.checked : true;
}


export function saveORLProfile() {
  if (!currentORLPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient avant d\'enregistrer', 'warning');
    }
    return;
  }

  const getVal = (id) => (document.getElementById(id)?.value || '').trim();

  const data = {
    patientId: currentORLPatientId,
    motif: getVal('orl-motif'),
    date: getVal('orl-date') || new Date().toISOString().split('T')[0],
    antecedents: getVal('orl-antecedents'),
    antecedentsChirurgicaux: getVal('orl-antecedents-chirurgicaux'),
    riskFactors: getVal('orl-risk-factors'),

    otoscopyOd: getVal('orl-otoscopy-od'),
    otoscopyOg: getVal('orl-otoscopy-og'),
    acouphenes: getVal('orl-acouphenes'),
    rinne: getVal('orl-rinne'),
    weber: getVal('orl-weber'),

    rhinoSymptoms: getVal('orl-rhino-symptoms'),
    rhinoExternal: getVal('orl-rhino-external'),
    rhinoscopy: getVal('orl-rhinoscopy'),
    rhinoSeptum: getVal('orl-rhino-septum'),
    rhinoCornets: getVal('orl-rhino-cornets'),
    rhinoDischarge: getVal('orl-rhino-discharge'),

    mouthSymptoms: getVal('orl-mouth-symptoms'),
    mouthLipsTeeth: getVal('orl-mouth-lips-teeth'),
    mouthTongue: getVal('orl-mouth-tongue'),
    mouthPalate: getVal('orl-mouth-palate'),
    pharynxTonsils: getVal('orl-pharynx-tonsils'),
    pharynxWall: getVal('orl-pharynx-wall'),
    pharynxCavum: getVal('orl-pharynx-cavum'),

    larynxSymptoms: getVal('orl-larynx-symptoms'),
    fibroEpiglottis: getVal('orl-fibro-epiglottis'),
    fibroLarynx: getVal('orl-fibro-larynx'),
    larynxMobility: getVal('orl-larynx-mobility'),
    fibroPyriform: getVal('orl-fibro-pyriform'),
    
    hearingType: getVal('orl-hearing-type') || 'Normale',
    hearingDegree: getVal('orl-hearing-degree') || 'Aucune',
    audioOd250: getVal('orl-audio-od-250'),
    audioOd500: getVal('orl-audio-od-500'),
    audioOd1k: getVal('orl-audio-od-1k'),
    audioOd2k: getVal('orl-audio-od-2k'),
    audioOd4k: getVal('orl-audio-od-4k'),
    audioOd8k: getVal('orl-audio-od-8k'),
    audioOg250: getVal('orl-audio-og-250'),
    audioOg500: getVal('orl-audio-og-500'),
    audioOg1k: getVal('orl-audio-og-1k'),
    audioOg2k: getVal('orl-audio-og-2k'),
    audioOg4k: getVal('orl-audio-og-4k'),
    audioOg8k: getVal('orl-audio-og-8k'),
    audioSpeech: getVal('orl-audio-speech'),
    tympanometry: getVal('orl-tympanometry'),

    cervical: getVal('orl-cervical'),
    salivary: getVal('orl-salivary'),
    vertigoType: getVal('orl-vertigo-type'),
    vertigoSigns: getVal('orl-vertigo-signs'),
    dixHallpike: getVal('orl-dix-hallpike'),
    hitTest: getVal('orl-hit-test'),
    vestibularPosture: getVal('orl-vestibular-posture'),

    diagnosis: getVal('orl-diagnosis'),
    diagnosisSecondary: getVal('orl-diagnosis-secondary'),
    treatment: getVal('orl-treatment'),
    procedures: getVal('orl-procedures'),
    investigations: getVal('orl-investigations'),
    followup: getVal('orl-followup'),

    reportTitle: getVal('orl-report-title'),
    reportCustomNotes: getVal('orl-report-custom-notes'),
    reportWysiwygHtml: document.getElementById('orl-wysiwyg-editor')?.innerHTML || '',
    includedSubjects: [...orlIncludedSubjects],
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(getORLStorageKey(currentORLPatientId), JSON.stringify(data));
  const wasEditing = Boolean(currentEditingReportId);
  saveORLHistoryEntry(currentORLPatientId, data, currentEditingReportId);
  
  if (typeof showNotification === 'function') {
    showNotification(wasEditing ? 'Compte-rendu ORL mis à jour avec succès ✓' : 'Compte-rendu ORL enregistré avec succès ✓', 'success');
  }

  updateORLStats(data);
  updateORLSectionStepStatus();
  renderSiderHistory(currentORLPatientId);
  updateORLSaveButtonsUI();

  // Switch back to history view so the user sees the newly saved report
  showORLHistoryView();
}

function getORLHistoryStorageKey(patientId) {
  return `orl_history_${patientId}`;
}

function getORLHistory(patientId) {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(getORLHistoryStorageKey(patientId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveORLHistoryEntry(patientId, snapshotData, existingEntryId = null) {
  if (!patientId) return;
  try {
    const list = getORLHistory(patientId);
    
    if (existingEntryId) {
      const idx = list.findIndex(e => e.id === existingEntryId);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          savedAt: new Date().toISOString(),
          date: snapshotData.date || list[idx].date,
          motif: snapshotData.motif || list[idx].motif,
          diagnosis: snapshotData.diagnosis || list[idx].diagnosis,
          hearingType: snapshotData.hearingType || list[idx].hearingType,
          hasFibro: Boolean(snapshotData.fibroLarynx),
          data: snapshotData
        };
        localStorage.setItem(getORLHistoryStorageKey(patientId), JSON.stringify(list));
        return list;
      }
    }

    const newEntry = {
      id: 'orl_rep_' + Date.now(),
      savedAt: new Date().toISOString(),
      date: snapshotData.date || new Date().toISOString().split('T')[0],
      motif: snapshotData.motif || 'Consultation ORL',
      diagnosis: snapshotData.diagnosis || 'Bilan standard',
      hearingType: snapshotData.hearingType || 'Normale',
      hasFibro: Boolean(snapshotData.fibroLarynx),
      data: snapshotData
    };
    list.unshift(newEntry);
    if (list.length > 50) list.length = 50;
    localStorage.setItem(getORLHistoryStorageKey(patientId), JSON.stringify(list));
    currentEditingReportId = newEntry.id;
    return list;
  } catch (e) {
    console.error('Error saving ORL history:', e);
  }
}

function updateORLStats(data) {
  const lastVisit = document.getElementById('orl-stat-last-visit');
  if (lastVisit) lastVisit.textContent = data.date || '-';

  const audioStat = document.getElementById('orl-stat-audiogram');
  if (audioStat) audioStat.textContent = data.hearingType || 'Enregistrée';

  const fibroStat = document.getElementById('orl-stat-fibro-count');
  if (fibroStat) fibroStat.textContent = data.fibroLarynx ? '1 examen' : '0';

  const history = currentORLPatientId ? getORLHistory(currentORLPatientId) : [];
  const count = Math.max(history.length, 1);
  const totalReports = document.getElementById('orl-stat-total-reports');
  if (totalReports) totalReports.textContent = `${count} ${count > 1 ? 'dossiers' : 'dossier'}`;
}

/**
 * =========================================================================
 * HISTORIQUE DES COMPTES-RENDUS & CONSULTATIONS ORL
 * =========================================================================
 */

export async function openORLReportHistoryModal() {
  const modal = document.getElementById('orl-report-history-modal');
  if (!modal) return;

  const subtitle = document.getElementById('orl-history-patient-subtitle');
  const body = document.getElementById('orl-history-list-body');

  let patient = window.currentPatientData;
  if (!patient && currentORLPatientId && window.api?.patient?.getById) {
    try {
      const res = await window.api.patient.getById(currentORLPatientId);
      if (res?.success) patient = res.data;
    } catch (_) {}
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (document.getElementById('orl-current-patient-display')?.textContent || 'Patient non sélectionné');
  if (subtitle) {
    subtitle.innerHTML = currentORLPatientId ? `Patient : <strong>${patientName}</strong> (#${currentORLPatientId})` : `Patient : <em>Aucun patient sélectionné</em>`;
  }

  if (!currentORLPatientId) {
    if (body) {
      body.innerHTML = `
        <div class="ant-empty" style="padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div class="ant-empty-image" style="margin-bottom: 16px;">
            <svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 18h48v36a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18z" fill="#f8fafc"/>
              <path d="M8 18l6-10h36l6 10H8z" fill="#f1f5f9"/>
              <line x1="26" y1="34" x2="38" y2="34"/>
            </svg>
          </div>
          <div style="font-size: 17px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">Aucun patient sélectionné</div>
          <div style="font-size: 14px; color: #64748b; max-width: 420px; line-height: 1.5;">Veuillez d'abord sélectionner un patient pour consulter l'historique de ses comptes-rendus.</div>
        </div>
      `;
    }
    modal.style.display = 'flex';
    return;
  }

  const history = getORLHistory(currentORLPatientId);

  if (history.length === 0) {
    const raw = localStorage.getItem(getORLStorageKey(currentORLPatientId));
    if (raw) {
      try {
        const initialData = JSON.parse(raw);
        saveORLHistoryEntry(currentORLPatientId, initialData);
      } catch (_) {}
    }
  }

  const updatedHistory = getORLHistory(currentORLPatientId);

  if (updatedHistory.length === 0) {
    if (body) {
      body.innerHTML = `
        <div class="ant-empty" style="padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div class="ant-empty-image" style="margin-bottom: 16px;">
            <svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 6h24l12 12v38a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" fill="#f8fafc"/>
              <polyline points="40 6 40 18 52 18"/>
              <line x1="22" y1="28" x2="42" y2="28"/>
              <line x1="22" y1="36" x2="42" y2="36"/>
              <line x1="22" y1="44" x2="34" y2="44"/>
            </svg>
          </div>
          <div style="font-size: 17px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">Aucun compte-rendu enregistré</div>
          <div style="font-size: 14px; color: #64748b; max-width: 420px; line-height: 1.5; margin-bottom: 20px;">Enregistrez un premier dossier ORL pour ce patient pour créer un historique.</div>
          <button type="button" class="btn btn-primary" onclick="closeORLReportHistoryModal(); createNewORLReport();" style="height: 38px; padding: 0 20px; font-size: 14px; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; background: #1677ff; border-color: #1677ff; box-shadow: 0 2px 4px rgba(22, 119, 255, 0.2);">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouveau Rapport
          </button>
        </div>
      `;
    }
    modal.style.display = 'flex';
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 12px;">`;

  updatedHistory.forEach((item, index) => {
    const reportId = item.id || `orl_rep_${index}`;
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '—';
    const savedTime = item.savedAt ? new Date(item.savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const diagnosis = item.diagnosis || 'Bilan standard';
    const motif = item.motif || 'Consultation ORL';
    const hearing = item.hearingType || 'Normale';

    html += `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.03); flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap;">
            <span class="ant-tag ant-tag-processing" style="background: #e6f0ff; color: #1677ff; border-color: #91caff; font-weight: 600; font-size: 12px;">
              ${formattedDate} ${savedTime ? `(${savedTime})` : ''}
            </span>
            ${item.hasFibro ? '<span class="ant-tag ant-tag-warning" style="font-size: 12px;">Fibroscopie</span>' : ''}
            <span class="ant-tag" style="background: #f6ffed; color: #389e0d; border-color: #b7eb8f; font-size: 12px;">${hearing}</span>
          </div>
          <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 2px;">
            ${escapeHTML(motif)}
          </div>
          <div style="font-size: 13.5px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            <strong style="color: #1e293b;">Diagnostic :</strong> ${escapeHTML(diagnosis)}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button type="button" class="btn btn-primary" onclick="editORLHistoricalReport('${reportId}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; background: #1677ff; border-color: #1677ff; cursor: pointer;" title="Modifier ce compte-rendu">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span>Modifier</span>
          </button>
          <button type="button" class="btn btn-secondary" onclick="previewORLHistoricalReport('${reportId}')" style="height: 32px; padding: 0 12px; font-size: 13px; font-weight: 550; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; background: #ffffff; border: 1px solid #cbd5e1; color: #334155; cursor: pointer;" title="Aperçu avant impression">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#475569" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>Imprimer</span>
          </button>
          <button type="button" class="btn" onclick="deleteORLHistoricalReport('${reportId}')" style="height: 32px; width: 34px; min-width: 34px; padding: 0; border-radius: 6px; background: #fff1f2; border: 1.5px solid #fca5a5; color: #e11d48; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 2px rgba(225,29,72,0.06);" title="Supprimer ce compte-rendu">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e11d48" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  if (body) body.innerHTML = html;
  modal.style.display = 'flex';
}

export function editORLHistoricalReport(target) {
  if (!currentORLPatientId) return;
  const history = getORLHistory(currentORLPatientId);
  const entry = typeof target === 'number' 
    ? history[target] 
    : history.find(e => String(e.id) === String(target)) || history.find((_, i) => `orl_rep_${i}` === String(target));
  if (!entry || !entry.data) return;

  currentEditingReportId = entry.id;
  loadORLHistoricalReport(target);
  closeORLReportHistoryModal();
  showORLWizardView();
  switchORLTab('report');
  updateORLSaveButtonsUI();

  if (typeof showNotification === 'function') {
    const dStr = entry.date ? new Date(entry.date).toLocaleDateString('fr-FR') : '';
    showNotification(`Compte-rendu du ${dStr} ouvert en mode édition`, 'info');
  }
}

export function updateORLSaveButtonsUI() {
  const isEditing = Boolean(currentEditingReportId);
  const labelText = isEditing ? 'Mettre à jour' : 'Enregistrer';

  document.querySelectorAll('.orl-save-btn-label').forEach(el => {
    el.textContent = labelText;
  });

  const topSaveBtn = document.getElementById('orl-btn-save-top');
  if (topSaveBtn) {
    if (isEditing) {
      topSaveBtn.style.background = '#d97706';
      topSaveBtn.style.borderColor = '#d97706';
      topSaveBtn.title = 'Mettre à jour le compte-rendu existant (Mode Édition)';
    } else {
      topSaveBtn.style.background = '#059669';
      topSaveBtn.style.borderColor = '#059669';
      topSaveBtn.title = 'Enregistrer un nouveau compte-rendu';
    }
  }

  const reportSaveBtn = document.getElementById('orl-report-save-btn');
  if (reportSaveBtn) {
    const textSpan = reportSaveBtn.querySelector('span:last-child') || reportSaveBtn;
    if (textSpan) {
      textSpan.textContent = isEditing ? 'Mettre à jour le compte-rendu' : 'Enregistrer le compte-rendu';
    }
    if (isEditing) {
      reportSaveBtn.style.background = '#d97706';
      reportSaveBtn.style.borderColor = '#d97706';
    } else {
      reportSaveBtn.style.background = '#059669';
      reportSaveBtn.style.borderColor = '#059669';
    }
  }
}

export function closeORLReportHistoryModal() {
  const modal = document.getElementById('orl-report-history-modal');
  if (modal) modal.style.display = 'none';
}

export function loadORLHistoricalReport(target) {
  if (!currentORLPatientId) return;
  const history = getORLHistory(currentORLPatientId);
  const entry = typeof target === 'number' 
    ? history[target] 
    : history.find(e => String(e.id) === String(target)) || history.find((_, i) => `orl_rep_${i}` === String(target));
  if (!entry || !entry.data) return;

  currentEditingReportId = entry.id;
  updateORLSaveButtonsUI();
  const data = entry.data;

  // Restore included subjects
  orlIncludedSubjects.clear();
  if (Array.isArray(data.includedSubjects) && data.includedSubjects.length > 0) {
    data.includedSubjects.forEach(s => orlIncludedSubjects.add(s));
  } else {
    ORL_DEFAULT_INCLUDED_SUBJECTS.forEach(s => orlIncludedSubjects.add(s));
  }
  if (typeof syncORLIncludeToggles === 'function') syncORLIncludeToggles();

  // Anamnèse
  setVal('orl-motif', data.motif);
  setVal('orl-date', data.date || new Date().toISOString().split('T')[0]);
  setVal('orl-antecedents', data.antecedents);
  setVal('orl-risk-factors', data.riskFactors);
  if (data.antecedentsChirurgicaux) setVal('orl-antecedents-chirurgicaux', data.antecedentsChirurgicaux);

  // Ears
  setVal('orl-otoscopy-od', data.otoscopyOd);
  setVal('orl-otoscopy-og', data.otoscopyOg);
  setVal('orl-acouphenes', data.acouphenes);
  setVal('orl-rinne', data.rinne);
  setVal('orl-weber', data.weber);

  // Audio
  setVal('orl-hearing-type', data.hearingType || 'Normale');
  setVal('orl-hearing-degree', data.hearingDegree || 'Aucune');
  setVal('orl-audio-od-250', data.audioOd250);
  setVal('orl-audio-od-500', data.audioOd500);
  setVal('orl-audio-od-1k', data.audioOd1k);
  setVal('orl-audio-od-2k', data.audioOd2k);
  setVal('orl-audio-od-4k', data.audioOd4k);
  setVal('orl-audio-od-8k', data.audioOd8k);
  setVal('orl-audio-og-250', data.audioOg250);
  setVal('orl-audio-og-500', data.audioOg500);
  setVal('orl-audio-og-1k', data.audioOg1k);
  setVal('orl-audio-og-2k', data.audioOg2k);
  setVal('orl-audio-og-4k', data.audioOg4k);
  setVal('orl-audio-og-8k', data.audioOg8k);
  setVal('orl-audio-speech', data.audioSpeech);
  setVal('orl-tympanometry', data.tympanometry);

  // Nose
  setVal('orl-rhino-symptoms', data.rhinoSymptoms);
  setVal('orl-rhino-external', data.rhinoExternal);
  setVal('orl-rhinoscopy', data.rhinoscopy);
  setVal('orl-rhino-septum', data.rhinoSeptum);
  setVal('orl-rhino-cornets', data.rhinoCornets);
  setVal('orl-rhino-discharge', data.rhinoDischarge);

  // Mouth
  setVal('orl-mouth-symptoms', data.mouthSymptoms);
  setVal('orl-mouth-lips-teeth', data.mouthLipsTeeth);
  setVal('orl-mouth-tongue', data.mouthTongue);
  setVal('orl-mouth-palate', data.mouthPalate);
  setVal('orl-pharynx-tonsils', data.pharynxTonsils);
  setVal('orl-pharynx-wall', data.pharynxWall);
  setVal('orl-pharynx-cavum', data.pharynxCavum);

  // Larynx
  setVal('orl-larynx-symptoms', data.larynxSymptoms);
  setVal('orl-fibro-epiglottis', data.fibroEpiglottis);
  setVal('orl-fibro-larynx', data.fibroLarynx);
  setVal('orl-larynx-mobility', data.larynxMobility);
  setVal('orl-fibro-pyriform', data.fibroPyriform);

  // Vestibular
  setVal('orl-cervical', data.cervical);
  setVal('orl-salivary', data.salivary);
  setVal('orl-vertigo-type', data.vertigoType);
  setVal('orl-vertigo-signs', data.vertigoSigns);
  setVal('orl-dix-hallpike', data.dixHallpike);
  setVal('orl-hit-test', data.hitTest);
  setVal('orl-vestibular-posture', data.vestibularPosture);

  // Conclusion
  setVal('orl-diagnosis', data.diagnosis);
  setVal('orl-diagnosis-secondary', data.diagnosisSecondary);
  setVal('orl-treatment', data.treatment);
  setVal('orl-procedures', data.procedures);
  setVal('orl-investigations', data.investigations);
  setVal('orl-followup', data.followup);

  // Report WYSIWYG
  const editor = document.getElementById('orl-wysiwyg-editor');
  if (editor && data.reportWysiwygHtml) {
    editor.innerHTML = data.reportWysiwygHtml;
  }

  updateORLStats(data);
  updateORLSectionStepStatus();
  closeORLReportHistoryModal();
  showORLWizardView();
  switchORLTab('anamnese');
  renderORLWysiwygReport(true);

  if (typeof showNotification === 'function') {
    const dStr = entry.date ? new Date(entry.date).toLocaleDateString('fr-FR') : 'consultation';
    showNotification(`Compte-rendu du ${dStr} chargé dans le dossier`, 'success');
  }
}

export function previewORLHistoricalReport(target) {
  loadORLHistoricalReport(target);
  openORLPrintPreview();
}

export function deleteORLHistoricalReport(target) {
  const patientId = currentORLPatientId || window.currentPatientId || (window.currentPatientData && window.currentPatientData.id);
  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Aucun patient sélectionné', 'error');
    }
    return;
  }

  const history = getORLHistory(patientId);
  if (!history || !history.length) {
    localStorage.removeItem(getORLStorageKey(patientId));
    localStorage.removeItem(getORLHistoryStorageKey(patientId));
    renderORLHistoryList();
    renderSiderHistory(patientId);
    return;
  }

  let idx = -1;
  if (typeof target === 'number') {
    idx = target;
  } else if (typeof target === 'string') {
    idx = history.findIndex(e => String(e.id) === String(target));
    if (idx === -1 && !isNaN(Number(target))) {
      idx = Number(target);
    }
  }

  if (idx < 0 || idx >= history.length) {
    if (history.length === 1) {
      idx = 0;
    } else {
      return;
    }
  }

  const entry = history[idx];
  const reportDate = entry?.date ? new Date(entry.date).toLocaleDateString('fr-FR') : 'cette consultation';

  if (!confirm(`Supprimer ce compte-rendu du ${reportDate} ? Cette action est irréversible.`)) {
    return;
  }

  if (entry && currentEditingReportId === entry.id) {
    currentEditingReportId = null;
  }

  history.splice(idx, 1);
  localStorage.setItem(getORLHistoryStorageKey(patientId), JSON.stringify(history));

  // If all history entries are deleted, also remove the legacy storage key
  // to avoid resurrecting the deleted report in renderORLHistoryList()
  if (history.length === 0) {
    localStorage.removeItem(getORLStorageKey(patientId));
  } else {
    const latest = history[0];
    if (latest && latest.data) {
      localStorage.setItem(getORLStorageKey(patientId), JSON.stringify(latest.data));
    }
  }

  renderORLHistoryList();
  renderSiderHistory(patientId);

  const modal = document.getElementById('orl-report-history-modal');
  if (modal && modal.style.display === 'flex') {
    openORLReportHistoryModal();
  }

  if (typeof showNotification === 'function') {
    showNotification('Compte-rendu définitivement supprimé de l\'historique', 'success');
  }
}

/**
 * =========================================================================
 * COMPTE-RENDU GENERATOR (WYSIWYG & PRINT PREVIEW)
 * Real-time form extraction, sequential continuous numbering, no stale cache
 * =========================================================================
 */

export function buildORLAudiometryTableHtml({ isPrint = false } = {}) {
  const freqs = [
    { label: '250 Hz', od: 'orl-audio-od-250', og: 'orl-audio-og-250' },
    { label: '500 Hz', od: 'orl-audio-od-500', og: 'orl-audio-og-500' },
    { label: '1 000 Hz', od: 'orl-audio-od-1k', og: 'orl-audio-og-1k' },
    { label: '2 000 Hz', od: 'orl-audio-od-2k', og: 'orl-audio-og-2k' },
    { label: '4 000 Hz', od: 'orl-audio-od-4k', og: 'orl-audio-og-4k' },
    { label: '8 000 Hz', od: 'orl-audio-od-8k', og: 'orl-audio-og-8k' }
  ];

  const hasAnyValue = freqs.some(f => Boolean(getVal(f.od)) || Boolean(getVal(f.og)));
  if (!hasAnyValue && !orlSectionIncluded('audio')) return '';

  const border = '1px solid #111827';

  const freqHeaders = freqs.map(f => `<th style="border: ${border}; padding: 6px 8px; font-weight: 700; text-align: center; color: #111827; background: #ffffff;">${f.label}</th>`).join('');

  const odCells = freqs.map(f => {
    const odVal = getVal(f.od);
    return `<td style="border: ${border}; padding: 6px 8px; text-align: center; font-weight: 600; color: #111827; background: #ffffff;">${odVal ? `${odVal} dB` : '—'}</td>`;
  }).join('');

  const ogCells = freqs.map(f => {
    const ogVal = getVal(f.og);
    return `<td style="border: ${border}; padding: 6px 8px; text-align: center; font-weight: 600; color: #111827; background: #ffffff;">${ogVal ? `${ogVal} dB` : '—'}</td>`;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11.5px; margin: 8px 0 10px 0; border: ${border}; background: #ffffff;">
      <thead>
        <tr>
          <th style="border: ${border}; padding: 6px 8px; font-weight: 700; text-align: left; color: #111827; background: #ffffff; width: 140px;">Fréquence</th>
          ${freqHeaders}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: ${border}; padding: 6px 8px; font-weight: 700; text-align: left; color: #111827; background: #ffffff;">Oreille Droite (OD)</td>
          ${odCells}
        </tr>
        <tr>
          <td style="border: ${border}; padding: 6px 8px; font-weight: 700; text-align: left; color: #111827; background: #ffffff;">Oreille Gauche (OG)</td>
          ${ogCells}
        </tr>
      </tbody>
    </table>
  `;
}

export function buildORLReportBodyHTML({ isPrint = false } = {}) {
  let html = '';
  let sectionIndex = 1;

  // 1. Motif & Anamnèse
  if (orlSectionIncluded('anamnese')) {
    const motif = getVal('orl-motif');
    const antecedents = getVal('orl-antecedents');
    const antecedentsChir = getVal('orl-antecedents-chirurgicaux');
    const riskFactors = getVal('orl-risk-factors');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Motif de Consultation & Anamnèse</div><div style="padding: 2px 4px; font-size: 12px; line-height: 1.5; color: #1f2937;">`
      : `<h3>${sectionIndex++}. Motif de Consultation & Anamnèse</h3>`;

    html += `<p style="margin: 0 0 3px 0;"><strong>Motif :</strong> ${motif || '—'}</p>`;
    if (antecedents || antecedentsChir || riskFactors) {
      const parts = [
        antecedents ? `Médicaux: ${antecedents}` : '',
        antecedentsChir ? `Chirurgicaux: ${antecedentsChir}` : '',
        riskFactors ? `Facteurs de risque: ${riskFactors}` : ''
      ].filter(Boolean);
      html += `<p style="margin: 0 0 3px 0;"><strong>Antécédents & Terrain :</strong> ${parts.join(' • ')}</p>`;
    }
    if (isPrint) html += `</div></div>`;
  }

  // 2. Oreilles & Otoscopie
  if (orlSectionIncluded('clinical')) {
    const otoscopyOd = getVal('orl-otoscopy-od');
    const otoscopyOg = getVal('orl-otoscopy-og');
    const acouphenes = getVal('orl-acouphenes');
    const rinne = getVal('orl-rinne');
    const weber = getVal('orl-weber');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Examen Otologique & Otoscopie</div><div style="padding: 2px 4px; font-size: 12px;">`
      : `<h3>${sectionIndex++}. Examen Otologique & Otoscopie</h3>`;

    if (isPrint) {
      html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 4px;">
          <div><strong style="color: #111827; text-decoration: underline;">Oreille Droite (OD) :</strong><p style="margin: 3px 0 0 0; color: #1f2937;">${otoscopyOd || 'Sans particularité'}</p></div>
          <div><strong style="color: #111827; text-decoration: underline;">Oreille Gauche (OG) :</strong><p style="margin: 3px 0 0 0; color: #1f2937;">${otoscopyOg || 'Sans particularité'}</p></div>
        </div>
      `;
    } else {
      if (otoscopyOd || otoscopyOg) {
        if (otoscopyOd) html += `<p><strong>Otoscopie OD :</strong> ${otoscopyOd}</p>`;
        if (otoscopyOg) html += `<p><strong>Otoscopie OG :</strong> ${otoscopyOg}</p>`;
      } else {
        html += `<p style="color: #475569; font-style: italic;">Conduits auditifs et tympans sans particularité.</p>`;
      }
    }

    if (acouphenes || rinne || weber) {
      const parts = [
        acouphenes ? `Acouphènes: ${acouphenes}` : '',
        rinne ? `Rinne: ${rinne}` : '',
        weber ? `Weber: ${weber}` : ''
      ].filter(Boolean);
      html += `<p style="margin: 0; color: #374151;"><strong>Acouphènes & Diapasons :</strong> ${parts.join(' | ')}</p>`;
    }

    if (isPrint) html += `</div></div>`;
  }

  // 3. Audiométrie & Impédance
  if (orlSectionIncluded('audio')) {
    const hearingType = getVal('orl-hearing-type') || 'Normale';
    const hearingDegree = getVal('orl-hearing-degree') || 'Aucune';
    const audioSpeech = getVal('orl-audio-speech');
    const tympanometry = getVal('orl-tympanometry');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Audiométrie Tonale Liminaire & Impédancemétrie</div><div style="padding: 2px 4px; font-size: 12px;">`
      : `<h3>${sectionIndex++}. Audiométrie Tonale Liminaire & Impédancemétrie</h3>`;

    html += `<p style="margin: 0 0 4px 0;"><strong>Profil auditif :</strong> ${hearingType} (Degré: ${hearingDegree})</p>`;
    
    const tableHtml = buildORLAudiometryTableHtml({ isPrint });
    if (tableHtml) html += tableHtml;

    if (audioSpeech) html += `<p style="margin: 3px 0;"><strong>Audiométrie vocale :</strong> ${audioSpeech}</p>`;
    if (tympanometry) html += `<p style="margin: 3px 0;"><strong>Tympanométrie / Réflexes stapédiens :</strong> ${tympanometry}</p>`;

    if (isPrint) html += `</div></div>`;
  }

  // 4. Rhinologie
  if (orlSectionIncluded('rhino')) {
    const rhinoSymptoms = getVal('orl-rhino-symptoms');
    const rhinoscopy = getVal('orl-rhinoscopy');
    const rhinoSeptum = getVal('orl-rhino-septum');
    const rhinoCornets = getVal('orl-rhino-cornets');
    const rhinoDischarge = getVal('orl-rhino-discharge');
    const rhinoExternal = getVal('orl-rhino-external');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Examen Rhinologique (Nez & Sinus)</div><div style="padding: 2px 4px; font-size: 12px; line-height: 1.5; color: #1f2937;">`
      : `<h3>${sectionIndex++}. Examen Rhinologique (Nez & Sinus)</h3>`;

    const rhinoItems = [
      rhinoSymptoms ? `<strong>Symptômes :</strong> ${rhinoSymptoms}` : '',
      rhinoscopy ? `<strong>Rhinoscopie :</strong> ${rhinoscopy}` : '',
      rhinoSeptum ? `<strong>Septum :</strong> ${rhinoSeptum}` : '',
      rhinoCornets ? `<strong>Cornets :</strong> ${rhinoCornets}` : '',
      rhinoDischarge ? `<strong>Sécrétions :</strong> ${rhinoDischarge}` : '',
      rhinoExternal ? `<strong>Pyramide nasale :</strong> ${rhinoExternal}` : ''
    ].filter(Boolean);

    if (rhinoItems.length) {
      rhinoItems.forEach(item => { html += `<p style="margin: 0 0 3px 0;">${item}</p>`; });
    } else {
      html += `<p style="margin: 0; color: #475569; font-style: italic;">Fosses nasales perméables, muqueuse et cavités sans anomalie.</p>`;
    }

    if (isPrint) html += `</div></div>`;
  }

  // 5. Bouche & Pharynx
  if (orlSectionIncluded('pharynx')) {
    const mouthSymptoms = getVal('orl-mouth-symptoms');
    const pharynxTonsils = getVal('orl-pharynx-tonsils');
    const pharynxWall = getVal('orl-pharynx-wall');
    const mouthTongue = getVal('orl-mouth-tongue');
    const mouthPalate = getVal('orl-mouth-palate');
    const mouthLipsTeeth = getVal('orl-mouth-lips-teeth');
    const pharynxCavum = getVal('orl-pharynx-cavum');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Cavité Buccale & Oropharynx</div><div style="padding: 2px 4px; font-size: 12px; line-height: 1.5; color: #1f2937;">`
      : `<h3>${sectionIndex++}. Cavité Buccale & Oropharynx</h3>`;

    const mouthItems = [
      mouthSymptoms ? `<strong>Examen buccal :</strong> ${mouthSymptoms}` : '',
      mouthPalate ? `<strong>Voile & Palais :</strong> ${mouthPalate}` : '',
      pharynxTonsils ? `<strong>Amygdales / Piliers :</strong> ${pharynxTonsils}` : '',
      pharynxWall ? `<strong>Paroi postérieure :</strong> ${pharynxWall}` : '',
      mouthTongue ? `<strong>Langue :</strong> ${mouthTongue}` : '',
      mouthLipsTeeth ? `<strong>Dents & Lèvres :</strong> ${mouthLipsTeeth}` : '',
      pharynxCavum ? `<strong>Cavum :</strong> ${pharynxCavum}` : ''
    ].filter(Boolean);

    if (mouthItems.length) {
      mouthItems.forEach(item => { html += `<p style="margin: 0 0 3px 0;">${item}</p>`; });
    } else {
      html += `<p style="margin: 0; color: #475569; font-style: italic;">Muqueuse buccale saine, oropharynx libre sans lésion suspecte.</p>`;
    }

    if (isPrint) html += `</div></div>`;
  }

  // 6. Larynx & Fibroscopie
  if (orlSectionIncluded('larynx')) {
    const larynxSymptoms = getVal('orl-larynx-symptoms');
    const fibroLarynx = getVal('orl-fibro-larynx');
    const fibroEpiglottis = getVal('orl-fibro-epiglottis');
    const larynxMobility = getVal('orl-larynx-mobility');
    const fibroPyriform = getVal('orl-fibro-pyriform');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Laryngoscopie & Nasofibroscopie</div><div style="padding: 2px 4px; font-size: 12px; line-height: 1.5; color: #1f2937;">`
      : `<h3>${sectionIndex++}. Larynx & Nasofibroscopie</h3>`;

    const larynxItems = [
      larynxSymptoms ? `<strong>Symptômes :</strong> ${larynxSymptoms}` : '',
      fibroLarynx ? `<strong>Cordes vocales & Glotte :</strong> ${fibroLarynx}` : '',
      fibroEpiglottis ? `<strong>Épiglotte :</strong> ${fibroEpiglottis}` : '',
      larynxMobility ? `<strong>Mobilité cordale :</strong> ${larynxMobility}` : '',
      fibroPyriform ? `<strong>Sinus piriformes :</strong> ${fibroPyriform}` : ''
    ].filter(Boolean);

    if (larynxItems.length) {
      larynxItems.forEach(item => { html += `<p style="margin: 0 0 3px 0;">${item}</p>`; });
    } else {
      html += `<p style="margin: 0; color: #475569; font-style: italic;">Larynx normal, cordes vocales mobiles et symétriques.</p>`;
    }

    if (isPrint) html += `</div></div>`;
  }

  // 7. Vestibulaire & Cou
  if (orlSectionIncluded('vestibular')) {
    const vertigoType = getVal('orl-vertigo-type');
    const vertigoSigns = getVal('orl-vertigo-signs');
    const cervical = getVal('orl-cervical');
    const salivary = getVal('orl-salivary');
    const dixHallpike = getVal('orl-dix-hallpike');
    const hitTest = getVal('orl-hit-test');
    const vestibularPosture = getVal('orl-vestibular-posture');

    const titleStyle = isPrint 
      ? 'border-bottom: 1px solid #111827; padding-bottom: 2px; margin-bottom: 6px; font-weight: 700; font-size: 12.5px; text-transform: uppercase; color: #111827;'
      : '';

    html += isPrint
      ? `<div style="margin-bottom: 12px;"><div style="${titleStyle}">${sectionIndex++}. Bilan Vestibulaire & Aires Cervicales</div><div style="padding: 2px 4px; font-size: 12px; line-height: 1.5; color: #1f2937;">`
      : `<h3>${sectionIndex++}. Bilan Vestibulaire & Aires Cervicales</h3>`;

    const vestItems = [
      vertigoType ? `<strong>Vertiges / Équilibre :</strong> ${vertigoType}` : '',
      vertigoSigns ? `<strong>Signes associés :</strong> ${vertigoSigns}` : '',
      dixHallpike ? `<strong>Dix-Hallpike :</strong> ${dixHallpike}` : '',
      hitTest ? `<strong>Head Impulse Test :</strong> ${hitTest}` : '',
      vestibularPosture ? `<strong>Romberg / Posture :</strong> ${vestibularPosture}` : '',
      cervical ? `<strong>Palpation cervicale :</strong> ${cervical}` : '',
      salivary ? `<strong>Glandes salivaires :</strong> ${salivary}` : ''
    ].filter(Boolean);

    if (vestItems.length) {
      vestItems.forEach(item => { html += `<p style="margin: 0 0 3px 0;">${item}</p>`; });
    } else {
      html += `<p style="margin: 0; color: #475569; font-style: italic;">Pas d'adénopathie palpable, bilan vestibulaire sans anomalie.</p>`;
    }

    if (isPrint) html += `</div></div>`;
  }

  // 8. Conclusion Diagnostique & Prescriptions
  if (orlSectionIncluded('conclusion')) {
    const diagnosis = getVal('orl-diagnosis');
    const diagnosisSecondary = getVal('orl-diagnosis-secondary');
    const treatment = getVal('orl-treatment');
    const procedures = getVal('orl-procedures');
    const investigations = getVal('orl-investigations');
    const followup = getVal('orl-followup');
    const customNotes = getVal('orl-report-custom-notes');

    if (isPrint) {
      html += `
        <div style="margin-top: 14px; margin-bottom: 14px; border: 1.5px solid #111827; border-radius: 4px; padding: 10px 14px; background: #ffffff;">
          <div style="margin: 0 0 6px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
            ${sectionIndex++}. Conclusion Clinique & Conduite à Tenir
          </div>
          <div style="font-size: 12px; line-height: 1.6; color: #111827;">
            <p style="margin: 0 0 4px 0;"><strong>Diagnostic ORL :</strong> <span style="font-weight: 700; font-size: 13px;">${diagnosis || '—'}</span></p>
            ${diagnosisSecondary ? `<p style="margin: 0 0 4px 0;"><strong>Diagnostic secondaire :</strong> ${diagnosisSecondary}</p>` : ''}
            ${procedures ? `<p style="margin: 0 0 4px 0;"><strong>Actes réalisés :</strong> ${procedures}</p>` : ''}
            ${treatment ? `<p style="margin: 0 0 4px 0;"><strong>Prescription / Traitement :</strong> ${treatment}</p>` : ''}
            ${investigations ? `<p style="margin: 0 0 4px 0;"><strong>Examens complémentaires :</strong> ${investigations}</p>` : ''}
            ${followup ? `<p style="margin: 0 0 4px 0;"><strong>Recommandations :</strong> ${followup}</p>` : ''}
            ${customNotes ? `<p style="margin: 4px 0 0 0; font-style: italic; color: #4b5563;"><strong>Notes :</strong> ${customNotes}</p>` : ''}
          </div>
        </div>
      `;
    } else {
      html += `<h3>${sectionIndex++}. Conclusion Diagnostique & Prescriptions</h3>`;
      html += `<p><strong>Diagnostic principal :</strong> ${diagnosis || '—'}</p>`;
      if (diagnosisSecondary) html += `<p><strong>Diagnostic associé :</strong> ${diagnosisSecondary}</p>`;
      if (treatment) html += `<p><strong>Traitement & Prescriptions :</strong> ${treatment}</p>`;
      if (procedures) html += `<p><strong>Actes réalisés / programmés :</strong> ${procedures}</p>`;
      if (investigations) html += `<p><strong>Examens complémentaires :</strong> ${investigations}</p>`;
      if (followup) html += `<p><strong>Conduite à tenir & Suivi :</strong> ${followup}</p>`;
      if (customNotes) html += `<p style="font-style: italic; color: #475569;"><strong>Notes :</strong> ${customNotes}</p>`;
    }
  }

  return html;
}

export function genererContenuORLInitial() {
  return buildORLReportBodyHTML({ isPrint: false });
}

export function formatORLDossierNumber(patient) {
  if (!patient) return currentORLPatientId ? `#${currentORLPatientId}` : '—';
  
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

export async function renderORLWysiwygReport(forceRegenerate = false) {
  const clinicHeaderEl = document.getElementById('orl-wysiwyg-clinic-header');
  const patientBannerEl = document.getElementById('orl-wysiwyg-patient-banner');
  const reportTitleEl = document.getElementById('orl-wysiwyg-report-title');
  const editorEl = document.getElementById('orl-wysiwyg-editor');
  if (!editorEl) return;

  // Load Real Cabinet & Doctor Settings
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
    || '';

  const doctorTitle = rawDoctor ? (rawDoctor.toLowerCase().startsWith('dr') ? rawDoctor : `Dr. ${rawDoctor}`) : '';
  const cabinetName = settings.cabinetName || '';
  const cabinetPhone = settings.cabinetPhone || '';
  const cabinetAddress = settings.cabinetAddress || '';
  const doctorSpecialty = settings.doctorSpecialty || '';
  const doctorRPPS = settings.doctorRPPS || '';

  // Load Real Patient Details
  let patient = window.currentPatientData;
  if ((!patient || (currentORLPatientId && String(patient.id) !== String(currentORLPatientId))) && currentORLPatientId) {
    if (window.api?.patient?.getById) {
      try {
        const res = await window.api.patient.getById(currentORLPatientId);
        if (res?.success && res.data) {
          patient = res.data;
          window.currentPatientData = patient;
        }
      } catch (_) {}
    }
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (currentORLPatientId ? `Patient #${currentORLPatientId}` : 'AUCUN PATIENT SÉLECTIONNÉ');
  
  let patientAge = 'Non renseigné';
  if (patient?.age) {
    patientAge = `${patient.age} ans`;
  } else if (patient?.birthDate && typeof calculatePatientAgeYears === 'function') {
    const ageVal = calculatePatientAgeYears(patient.birthDate);
    if (ageVal !== null && ageVal !== undefined) patientAge = `${ageVal} ans`;
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
  const rawDateExam = document.getElementById('orl-date')?.value;
  const dateExam = rawDateExam ? new Date(rawDateExam).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dossierNumber = formatORLDossierNumber(patient);
  const patientIdDisplay = patient?.id || currentORLPatientId || '—';

  if (clinicHeaderEl) {
    const specialtyLine = doctorSpecialty ? `<p style="margin: 3px 0 0 0; font-size: 13px; font-weight: 600; color: #374151;">${doctorSpecialty}</p>` : '';
    const rppsLine = doctorRPPS ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">N° RPPS : ${doctorRPPS}</p>` : '';
    const phoneLine = cabinetPhone ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Tél : ${cabinetPhone}</p>` : '';
    const addressLine = cabinetAddress ? `<p style="margin: 2px 0 0 0; font-size: 10.5px; color: #9ca3af;">${cabinetAddress}</p>` : '';
    const cabinetTitle = cabinetName ? `<p style="margin: 0; font-weight: 700; color: #111827; font-size: 13px;">${cabinetName}</p>` : '';

    clinicHeaderEl.innerHTML = `
      <div style="padding-bottom: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827;">
        <div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #111827;">
            ${doctorTitle || 'Cabinet Médical'}
          </h1>
          ${specialtyLine}
          ${rppsLine}
          ${phoneLine}
          ${addressLine}
        </div>
        <div style="text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5;">
          ${cabinetTitle}
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
          <div><span>Âge :</span> <strong>${patientAge}</strong></div>
          <div><span>Genre :</span> <strong>${patientGender}</strong></div>
        </div>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #e5e7eb;">
          <div><span>Téléphone :</span> <strong>${patientPhone}</strong></div>
          <div><span>Date de consultation :</span> <strong>${dateExam}</strong></div>
          <div><span></span></div>
        </div>
      </div>
    `;
  }

  if (reportTitleEl) {
    reportTitleEl.innerHTML = `
      <div style="text-align: center; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #0f172a; display: inline-block; padding: 4px 0; border-bottom: 2px solid #0f172a;">
          COMPTE RENDU
        </h2>
      </div>
    `;
  }

  const existingContent = editorEl.innerHTML.trim();
  if (!existingContent || forceRegenerate) {
    editorEl.innerHTML = genererContenuORLInitial();
  }
}

export function setORLReportFormat(format) {
  const sheet = document.getElementById('orl-wysiwyg-sheet');
  if (sheet) {
    sheet.classList.remove('format-a4', 'format-a5');
    sheet.classList.add(format === 'A5' ? 'format-a5' : 'format-a4');
  }
  const segmented = document.getElementById('orl-report-format-segmented');
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

export function regenerateORLReportContent() {
  renderORLWysiwygReport(true);
  if (typeof showNotification === 'function') {
    showNotification('Contenu du rapport actualisé à partir des données du dossier', 'success');
  }
}

export function updateORLSectionStepStatus() {
  const stepNumbers = {
    anamnese: 1,
    clinical: 2,
    audio: 3,
    rhino: 4,
    pharynx: 5,
    larynx: 6,
    vestibular: 7,
    conclusion: 8,
    report: 9
  };

  const steps = document.querySelectorAll('#orl-section-steps .orl-section-step-item');
  steps.forEach(step => {
    const tabKey = step.dataset.tab;
    const isCompleted = isORLSectionComplete(tabKey);
    step.classList.toggle('completed', isCompleted);

    const circle = step.querySelector('.ant-step-circle');
    if (circle) {
      if (isCompleted) {
        circle.innerHTML = '✓';
      } else {
        circle.textContent = String(stepNumbers[tabKey] || '');
      }
    }
  });
}

export function resetORLProfile() {
  resetORLFields();
}

export async function createNewORLReport() {
  const patientId = currentORLPatientId || window.currentPatientId || (window.currentPatientData && window.currentPatientData.id);
  if (!patientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez sélectionner un patient', 'warning');
    }
    showORLEmptyView();
    return;
  }
  currentORLPatientId = String(patientId);

  currentEditingReportId = null;
  resetORLFields();
  updateORLSaveButtonsUI();

  const dateInput = document.getElementById('orl-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  
  try {
    const editor = document.getElementById('orl-wysiwyg-editor');
    if (editor) {
      editor.innerHTML = genererContenuORLInitial();
    }
    await renderORLWysiwygReport(true);
  } catch (err) {
    console.warn('WYSIWYG init notice:', err);
  }

  updateORLSectionStepStatus();
  showORLWizardView();
  switchORLTab('anamnese');

  if (typeof showNotification === 'function') {
    showNotification('Nouveau compte-rendu médical ORL initialisé', 'success');
  }
}

function resetORLFields() {
  const fields = [
    'orl-motif', 'orl-date', 'orl-antecedents', 'orl-risk-factors', 'orl-antecedents-chirurgicaux',
    'orl-otoscopy-od', 'orl-otoscopy-og', 'orl-acouphenes', 'orl-rinne', 'orl-weber',
    'orl-rhino-symptoms', 'orl-rhino-external', 'orl-rhinoscopy', 'orl-rhino-septum', 'orl-rhino-cornets', 'orl-rhino-discharge',
    'orl-mouth-symptoms', 'orl-mouth-lips-teeth', 'orl-mouth-tongue', 'orl-mouth-palate', 'orl-pharynx-tonsils', 'orl-pharynx-wall', 'orl-pharynx-cavum',
    'orl-larynx-symptoms', 'orl-fibro-epiglottis', 'orl-fibro-larynx', 'orl-larynx-mobility', 'orl-fibro-pyriform',
    'orl-audio-od-250', 'orl-audio-od-500', 'orl-audio-od-1k', 'orl-audio-od-2k', 'orl-audio-od-4k', 'orl-audio-od-8k',
    'orl-audio-og-250', 'orl-audio-og-500', 'orl-audio-og-1k', 'orl-audio-og-2k', 'orl-audio-og-4k', 'orl-audio-og-8k',
    'orl-audio-speech', 'orl-tympanometry',
    'orl-cervical', 'orl-salivary', 'orl-vertigo-type', 'orl-vertigo-signs', 'orl-dix-hallpike', 'orl-hit-test', 'orl-vestibular-posture',
    'orl-diagnosis', 'orl-diagnosis-secondary', 'orl-treatment', 'orl-procedures', 'orl-investigations', 'orl-followup',
    'orl-report-custom-notes'
  ];

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset AntCheckableTag instances
  if (typeof AntCheckableTag !== 'undefined') {
    const motifContainer = document.getElementById('orl-motif-tags');
    if (motifContainer) AntCheckableTag.reset(motifContainer);
    const riskContainer = document.getElementById('orl-risk-tags');
    if (riskContainer) AntCheckableTag.reset(riskContainer);
  }

  // Remove any lingering checked tag classes across the whole ORL module
  document.querySelectorAll('#orl .ant-tag-checkable, #orl .ant-checkable-tag').forEach(tag => {
    tag.classList.remove('checked', 'active', 'ant-tag-checkable-checked');
  });

  const dateInput = document.getElementById('orl-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const hType = document.getElementById('orl-hearing-type');
  if (hType) hType.value = 'Normale';
  const hDeg = document.getElementById('orl-hearing-degree');
  if (hDeg) hDeg.value = 'Aucune';
  const title = document.getElementById('orl-report-title');
  if (title) title.value = 'COMPTE-RENDU D\'EXAMEN & EXPLORATIONS ORL';

  orlIncludedSubjects.clear();
  ORL_DEFAULT_INCLUDED_SUBJECTS.forEach(s => orlIncludedSubjects.add(s));
  syncORLIncludeToggles();
}

/**
 * =========================================================================
 * SYSTÈME D'APERÇU INTERACTIF AVANT IMPRESSION (A4 PRINT PREVIEW MODAL)
 * =========================================================================
 */

export async function openORLPrintPreview() {
  if (!currentORLPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez d\'abord sélectionner un patient pour afficher son compte-rendu', 'warning');
    }
    return;
  }

  if (!hasORLReportContent() && currentActiveORLTab !== 'report') {
    if (typeof showNotification === 'function') {
      showNotification('Le compte-rendu ne contient aucune donnée. Veuillez renseigner au moins une section avant de prévisualiser ou d\'imprimer.', 'warning');
    }
    return;
  }

  // Load Real Cabinet & Doctor Settings
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
    || '';

  const doctorTitle = rawDoctor ? (rawDoctor.toLowerCase().startsWith('dr') ? rawDoctor : `Dr. ${rawDoctor}`) : '';
  const cabinetName = settings.cabinetName || '';
  const cabinetPhone = settings.cabinetPhone || '';
  const cabinetAddress = settings.cabinetAddress || '';
  const doctorSpecialty = settings.doctorSpecialty || '';
  const doctorRPPS = settings.doctorRPPS || '';

  let patient = window.currentPatientData;
  if (!patient || String(patient.id) !== String(currentORLPatientId)) {
    try {
      if (window.api?.patient?.getById) {
        const res = await window.api.patient.getById(currentORLPatientId);
        if (res?.success && res.data) {
          patient = res.data;
          window.currentPatientData = patient;
        }
      }
    } catch (_) {}
  }

  const patientName = patient ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim() : (document.getElementById('orl-current-patient-display')?.textContent || 'Patient');
  let patientAge = 'Non renseigné';
  if (patient?.age) {
    patientAge = `${patient.age} ans`;
  } else if (patient?.birthDate && typeof calculatePatientAgeYears === 'function') {
    const ageVal = calculatePatientAgeYears(patient.birthDate);
    if (ageVal !== null && ageVal !== undefined) patientAge = `${ageVal} ans`;
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
  const rawDateExam = document.getElementById('orl-date')?.value;
  const dateExam = rawDateExam ? new Date(rawDateExam).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  const dossierNumber = formatORLDossierNumber(patient);
  const reportTitle = getVal('orl-report-title') || 'COMPTE RENDU';

  const sheet = document.getElementById('orl-preview-sheet');
  if (!sheet) return;

  const reportBodyHtml = buildORLReportBodyHTML({ isPrint: true });

  sheet.innerHTML = `
    <div class="orl-print-document-container" style="position: relative; min-height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
      <table class="orl-print-layout-table" style="width: 100%; border-collapse: collapse; border: none;">
        <thead>
          <tr>
            <td class="orl-print-layout-td" style="padding: 0; border: none;">
              <div class="orl-print-header-space" style="height: 0px;"></div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="orl-print-layout-td" style="padding: 0; border: none;">
              <!-- En-tête Cabinet Médical -->
              <div class="orl-preview-clinic-header" style="padding-bottom: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827;">
                <div>
                  <h1 style="margin: 0; font-size: 19px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #111827;">
                    ${doctorTitle || 'Cabinet Médical'}
                  </h1>
                  ${doctorSpecialty ? `<p style="margin: 3px 0 0 0; font-size: 13px; font-weight: 600; color: #374151;">${doctorSpecialty}</p>` : ''}
                  ${doctorRPPS ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">N° RPPS : ${doctorRPPS}</p>` : ''}
                  ${cabinetPhone ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Tél : ${cabinetPhone}</p>` : ''}
                  ${cabinetAddress ? `<p style="margin: 2px 0 0 0; font-size: 10.5px; color: #9ca3af;">${cabinetAddress}</p>` : ''}
                </div>
                <div style="text-align: right; font-size: 11.5px; color: #374151; line-height: 1.5;">
                  ${cabinetName ? `<p style="margin: 0; font-weight: 700; color: #111827; font-size: 13px;">${cabinetName}</p>` : ''}
                  <p style="margin: 0;">Date du rapport : <strong>${dateExam}</strong></p>
                  <p style="margin: 0;">Dossier N° : <strong style="color: #0d9488; font-family: monospace; font-size: 12.5px;">${dossierNumber}</strong></p>
                </div>
              </div>

              <!-- Bannière Patient Formelle -->
              <div class="orl-preview-patient-banner" style="background: #ffffff; border: 1px solid #374151; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; color: #111827;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;">
                  <div><span>Patient :</span> <strong style="font-size: 13px; text-transform: uppercase; color: #111827;">${patientName}</strong></div>
                  <div><span>Âge :</span> <strong>${patientAge}</strong></div>
                  <div><span>Genre :</span> <strong>${patientGender}</strong></div>
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #e5e7eb;">
                  <div><span>Téléphone :</span> <strong>${patientPhone}</strong></div>
                  <div><span>Date de consultation :</span> <strong>${dateExam}</strong></div>
                  <div><span></span></div>
                </div>
              </div>

              <!-- Titre du Compte-Rendu -->
              <div style="text-align: center; margin-bottom: 16px;">
                <h2 style="margin: 0; font-size: 14.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #111827; border-bottom: 2px solid #111827; display: inline-block; padding: 2px 4px;">
                  ${reportTitle}
                </h2>
              </div>

              <!-- Corps du Rapport (Sections Incluses avec Numérotation Séquentielle) -->
              <div class="orl-report-body-content">
                ${reportBodyHtml || '<p style="text-align: center; color: #6b7280; font-style: italic; padding: 24px;">Aucune section renseignée dans ce rapport.</p>'}
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="orl-print-layout-td" style="padding: 0; border: none;">
              <div class="orl-print-footer-space" style="height: 110px;"></div>
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Bas de page fixe avec Cachet & Signature positionné en bas de page -->
      <div class="orl-print-fixed-footer">
        <div class="orl-footer-inner" style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%; border-top: 1px solid #cbd5e1; padding-top: 8px; background: #ffffff;">
          <div style="font-size: 10px; color: #64748b; line-height: 1.45;">
            <p style="margin: 0; font-weight: 600; color: #1e293b;">Document médical confidentiel émis le ${new Date().toLocaleDateString('fr-FR')}.</p>
            <p style="margin: 2px 0 0 0;">Certifié conforme par le médecin praticien • Dossier N° ${dossierNumber}</p>
            ${cabinetName ? `<p style="margin: 2px 0 0 0; font-size: 9px; color: #94a3b8;">${cabinetName} ${cabinetPhone ? '• Tél : ' + cabinetPhone : ''}</p>` : ''}
            <div style="margin-top: 4px;">
              ${(typeof buildDocumentBarcodeHtml === 'function' ? buildDocumentBarcodeHtml(dossierNumber || `ORL-${dateExam}`) : '')}
            </div>
          </div>
          <div class="orl-signature-box" style="border: 1.5px solid #111827; border-radius: 4px; width: 220px; height: 95px; padding: 8px; text-align: center; font-size: 10.5px; color: #374151; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; flex-shrink: 0;">
            <span style="font-weight: 700; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.3px; color: #111827;">Cachet & Signature du Médecin</span>
            <span style="font-size: 11px; font-weight: 700; color: #111827;">${doctorTitle || ''}</span>
            <span style="font-size: 9.5px; color: #6b7280;">${doctorSpecialty ? doctorSpecialty + ' ' : ''}${doctorRPPS ? '• N° RPPS : ' + doctorRPPS : ''}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const modal = document.getElementById('orl-print-preview-modal');
  if (modal) {
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

export function closeORLPrintPreview() {
  const modal = document.getElementById('orl-print-preview-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
  }
}

export function toggleORLPreviewHeader(show) {
  const header = document.querySelector('.orl-preview-clinic-header');
  if (header) {
    header.style.display = show ? 'flex' : 'none';
  }
}

export async function triggerORLDirectPrint() {
  if (!currentORLPatientId) {
    if (typeof showNotification === 'function') {
      showNotification('Veuillez d\'abord sélectionner un patient pour imprimer son compte-rendu', 'warning');
    }
    return;
  }

  // Always rebuild the preview sheet from current entered values first so the
  // printed document matches exactly what is shown and saved.
  await openORLPrintPreview();

  const sheet = document.getElementById('orl-preview-sheet');
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
      <title>Compte-Rendu ORL</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm 12mm 15mm;
        }
        * {
          box-sizing: border-box;
        }
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
        .orl-print-layout-table {
          width: 100%;
          border-collapse: collapse;
          border: none;
        }
        .orl-print-layout-td {
          padding: 0;
          border: none;
        }
        .orl-print-fixed-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          background: #ffffff;
          z-index: 999;
        }
        .orl-print-footer-space {
          height: 110px;
        }
        .orl-report-body-content > div {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        @media screen {
          .orl-print-fixed-footer {
            margin-top: 30px;
            position: relative;
          }
          .orl-print-footer-space {
            display: none;
          }
        }
        @media print {
          html, body {
            width: 100%;
            height: 100%;
            background: #ffffff;
          }
          .orl-print-fixed-footer {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            background: #ffffff !important;
          }
          .orl-print-footer-space {
            height: 110px !important;
            display: block !important;
          }
        }
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

export function openORLReportWorkspace() {
  openORLPrintPreview();
}

export function toggleORLCardCollapse(element) {
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

export function toggleAllORLSections() {
  const activePane = document.querySelector('#orl .ant-tabs-pane.active');
  if (!activePane) return;
  const collapseContainer = activePane.querySelector('.ant-collapse');
  if (!collapseContainer) return;
  
  const selector = '#orl .ant-tabs-pane.active .ant-collapse';
  if (typeof AntCollapse !== 'undefined') {
    if (AntCollapse.isAllCollapsed(selector)) {
      AntCollapse.expandAll(selector);
      const btn = document.getElementById('orl-collapse-all-btn');
      if (btn) btn.querySelector('span').textContent = 'Replier tout';
    } else {
      AntCollapse.collapseAll(selector);
      const btn = document.getElementById('orl-collapse-all-btn');
      if (btn) btn.querySelector('span').textContent = 'Déplier tout';
    }
  }
}

// Global attachments
window.initORL = initORL;
window.refreshORLPatientList = refreshORLPatientList;
window.selectORLPatient = selectORLPatient;
window.switchORLTab = switchORLTab;
window.insertPresetText = insertPresetText;
window.saveORLProfile = saveORLProfile;
window.resetORLProfile = resetORLProfile;
window.openORLReportWorkspace = openORLReportWorkspace;
window.openORLPrintPreview = openORLPrintPreview;
window.closeORLPrintPreview = closeORLPrintPreview;
window.toggleORLPreviewHeader = toggleORLPreviewHeader;
window.triggerORLDirectPrint = triggerORLDirectPrint;
export function openORLReportFromTimeline(reportId, patientId) {
  if (patientId && typeof selectORLPatient === 'function') {
    selectORLPatient(patientId);
  }
  if (typeof showSection === 'function') {
    showSection('orl');
  }
  if (reportId) {
    setTimeout(() => {
      editORLHistoricalReport(reportId);
    }, 60);
  }
}

window.openORLReportFromTimeline = openORLReportFromTimeline;
window.toggleORLCardCollapse = toggleORLCardCollapse;
window.toggleAllORLSections = toggleAllORLSections;
window.setORLReportFormat = setORLReportFormat;
window.regenerateORLReportContent = regenerateORLReportContent;
window.renderORLWysiwygReport = renderORLWysiwygReport;
window.updateORLSectionStepStatus = updateORLSectionStepStatus;
window.openORLReportHistoryModal = openORLReportHistoryModal;
window.closeORLReportHistoryModal = closeORLReportHistoryModal;
window.loadORLHistoricalReport = loadORLHistoricalReport;
window.previewORLHistoricalReport = previewORLHistoricalReport;
window.deleteORLHistoricalReport = deleteORLHistoricalReport;
window.createNewORLReport = createNewORLReport;
window.toggleORLSubject = toggleORLSubject;
window.isORLSubjectIncluded = isORLSubjectIncluded;
window.goToNextORLTab = goToNextORLTab;
window.goToPrevORLTab = goToPrevORLTab;
window.goToORLStep = goToORLStep;
window.addCurrentTabToReport = addCurrentTabToReport;
window.switchORLSubTab = switchORLSubTab;
window.editORLHistoricalReport = editORLHistoricalReport;
window.formatORLDossierNumber = formatORLDossierNumber;
window.showORLEmptyView = showORLEmptyView;
window.showORLHistoryView = showORLHistoryView;
window.showORLWizardView = showORLWizardView;
window.renderORLHistoryList = renderORLHistoryList;
window.syncORLIncludeToggles = syncORLIncludeToggles;
window.updateORLToolbar = updateORLToolbar;
window.hasORLReportContent = hasORLReportContent;
window.updateORLSaveButtonsUI = updateORLSaveButtonsUI;

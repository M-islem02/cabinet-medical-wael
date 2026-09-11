/**
 * Module Traumatologie & Chirurgie Orthopédique
 * Carte squelettique anatomique vectorielle interactive (Face & Dos)
 * Bilan lésionnel, classification des fractures, EVA, Cauchoix, immobilisations et chirurgie
 */

import { registerLegacyGlobals, unregisterLegacyGlobals } from '../../core/legacy/legacy-bridge.js';

let traumatoSelectedPatientId = null;
let traumatoSelectedBone = null;
let traumatoLesionsData = {};
let traumatoTreatmentsCache = {};
let allTraumatoPatients = [];
let currentTraumatoView = 'anterior'; // 'anterior' | 'posterior'
let traumatoHistoricalData = null;
let traumatoHistoryDateFilter = '';
let traumatoPatientHistoryItems = [];
let isTraumatoInitialized = false;

// Dictionnaire des pièces osseuses & articulaires
const BONE_DEFINITIONS = {
  // Tête et Rachis
  skull: { name: 'Crâne / Voûte crânienne', category: 'head', region: 'axial' },
  face: { name: 'Massif facial / Mandibule', category: 'head', region: 'axial' },
  spine_cervical: { name: 'Rachis cervical (C1-C7)', category: 'spine', region: 'axial' },
  spine_thoracic: { name: 'Rachis dorsal / thoracique (Th1-Th12)', category: 'spine', region: 'axial' },
  spine_lumbar: { name: 'Rachis lombaire (L1-L5)', category: 'spine', region: 'axial' },
  sacrum_pelvis: { name: 'Bassin / Sacrum / Anneau pelvien', category: 'pelvis', region: 'axial' },
  thorax_ribs: { name: 'Gril costal / Côtes / Sternum', category: 'spine', region: 'axial' },

  // Membre Supérieur Droit
  clavicle_r: { name: 'Clavicule Droite', category: 'upper_limb', side: 'right' },
  scapula_r: { name: 'Épaule / Scapula Droite', category: 'upper_limb', side: 'right' },
  humerus_r: { name: 'Bras / Humérus Droit', category: 'upper_limb', side: 'right' },
  elbow_r: { name: 'Coude Droit', category: 'upper_limb', side: 'right' },
  forearm_r: { name: 'Avant-bras (Radius / Ulna) Droit', category: 'upper_limb', side: 'right' },
  wrist_r: { name: 'Poignet / Carpe Droit', category: 'upper_limb', side: 'right' },
  hand_r: { name: 'Main / Métacarpes / Phalanges Droites', category: 'upper_limb', side: 'right' },

  // Membre Supérieur Gauche
  clavicle_l: { name: 'Clavicule Gauche', category: 'upper_limb', side: 'left' },
  scapula_l: { name: 'Épaule / Scapula Gauche', category: 'upper_limb', side: 'left' },
  humerus_l: { name: 'Bras / Humérus Gauche', category: 'upper_limb', side: 'left' },
  elbow_l: { name: 'Coude Gauche', category: 'upper_limb', side: 'left' },
  forearm_l: { name: 'Avant-bras (Radius / Ulna) Gauche', category: 'upper_limb', side: 'left' },
  wrist_l: { name: 'Poignet / Carpe Gauche', category: 'upper_limb', side: 'left' },
  hand_l: { name: 'Main / Métacarpes / Phalanges Gauches', category: 'upper_limb', side: 'left' },

  // Membre Inférieur Droit
  hip_r: { name: 'Hanche Droite', category: 'lower_limb', side: 'right' },
  femur_r: { name: 'Cuisse / Fémur Droit', category: 'lower_limb', side: 'right' },
  knee_r: { name: 'Genou / Rotule (Patella) Droit', category: 'lower_limb', side: 'right' },
  leg_r: { name: 'Jambe (Tibia / Fibula) Droite', category: 'lower_limb', side: 'right' },
  ankle_r: { name: 'Cheville / Malléoles Droite', category: 'lower_limb', side: 'right' },
  foot_r: { name: 'Pied / Tarse / Métatarse Droit', category: 'lower_limb', side: 'right' },

  // Membre Inférieur Gauche
  hip_l: { name: 'Hanche Gauche', category: 'lower_limb', side: 'left' },
  femur_l: { name: 'Cuisse / Fémur Gauche', category: 'lower_limb', side: 'left' },
  knee_l: { name: 'Genou / Rotule (Patella) Gauche', category: 'lower_limb', side: 'left' },
  leg_l: { name: 'Jambe (Tibia / Fibula) Gauche', category: 'lower_limb', side: 'left' },
  ankle_l: { name: 'Cheville / Malléoles Gauche', category: 'lower_limb', side: 'left' },
  foot_l: { name: 'Pied / Tarse / Métatarse Gauche', category: 'lower_limb', side: 'left' }
};

// Statuts lésionnels traumatologiques
const LESION_STATUSES = {
  healthy:        { label: 'Indemne / Sain',          color: '#f8fafc', border: '#cbd5e1', tc: '#334155', badge: '' },
  fracture_closed:{ label: 'Fracture fermée',        color: '#fee2e2', border: '#ef4444', tc: '#991b1b', badge: '' },
  fracture_open:  { label: 'Fracture ouverte (Cauchoix)', color: '#f3e8ff', border: '#9333ea', tc: '#581c87', badge: '' },
  sprain:         { label: 'Entorse ligamentaire',   color: '#ffedd5', border: '#f97316', tc: '#9a3412', badge: '' },
  dislocation:    { label: 'Luxation / Déboîtement', color: '#fef9c3', border: '#eab308', tc: '#854d0e', badge: '' },
  tendon_tear:    { label: 'Lésion tendineuse / Rupture', color: '#cffafe', border: '#06b6d4', tc: '#155e75', badge: '' },
  contusion:      { label: 'Contusion osseuse / Hématome', color: '#e0f2fe', border: '#0284c7', tc: '#075985', badge: '' },
  cast:           { label: 'Immobilisation / Plâtre', color: '#e0e7ff', border: '#6366f1', tc: '#3730a3', badge: '' },
  osteosynthesis: { label: 'Ostéosynthèse / Matériel', color: '#f1f5f9', border: '#475569', tc: '#1e293b', badge: '' }
};

function safeEscapeHTML(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTraumatoSearchAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ========== INITIALISATION ==========

export function initTraumatology() {
  if (isTraumatoInitialized) {
    refreshTraumatoPatientList();
    return;
  }
  isTraumatoInitialized = true;
  console.log('Initializing Traumatology Module...');

  setupViewSwitchers();
  loadTraumatoPatientList();
  renderTraumatoChart();
}

export function destroyTraumatologyLegacy() {
  isTraumatoInitialized = false;
  unregisterLegacyGlobals('traumatology');
}

function setupViewSwitchers() {
  const btnAnt = document.getElementById('btn-traumato-view-ant');
  const btnPost = document.getElementById('btn-traumato-view-post');

  if (btnAnt && btnPost) {
    btnAnt.addEventListener('click', () => setTraumatoView('anterior'));
    btnPost.addEventListener('click', () => setTraumatoView('posterior'));
  }
}

export function setTraumatoView(view) {
  currentTraumatoView = view === 'posterior' ? 'posterior' : 'anterior';
  const btnAnt = document.getElementById('btn-traumato-view-ant');
  const btnPost = document.getElementById('btn-traumato-view-post');

  if (btnAnt && btnPost) {
    if (currentTraumatoView === 'anterior') {
      btnAnt.classList.add('active');
      btnAnt.style.background = '#0284c7';
      btnAnt.style.color = '#ffffff';
      btnPost.classList.remove('active');
      btnPost.style.background = '#ffffff';
      btnPost.style.color = '#64748b';
    } else {
      btnPost.classList.add('active');
      btnPost.style.background = '#0284c7';
      btnPost.style.color = '#ffffff';
      btnAnt.classList.remove('active');
      btnAnt.style.background = '#ffffff';
      btnAnt.style.color = '#64748b';
    }
  }

  const svgAnt = document.getElementById('traumato-svg-anterior');
  const svgPost = document.getElementById('traumato-svg-posterior');
  if (svgAnt) svgAnt.style.display = currentTraumatoView === 'anterior' ? 'block' : 'none';
  if (svgPost) svgPost.style.display = currentTraumatoView === 'posterior' ? 'block' : 'none';

  updateBoneVisualStyles();
}

// ========== GESTION DES PATIENTS ==========

export async function loadTraumatoPatientList() {
  try {
    let patients = [];
    if (window.api?.patient?.getAll) {
      try {
        const res = await window.api.patient.getAll();
        if (Array.isArray(res)) patients = res;
        else if (res?.success && Array.isArray(res.data)) patients = res.data;
      } catch (_) {}
    }
    if (window.api?.patient?.getDirectory) {
      try {
        const dir = await window.api.patient.getDirectory({ pageSize: 500, paginated: true });
        if (dir?.success && Array.isArray(dir.data)) {
          const seen = new Set(patients.map(p => p.id));
          dir.data.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); patients.push(p); } });
        }
      } catch (_) {}
    }
    if (Array.isArray(window.patients) && window.patients.length > 0) {
      const seen = new Set(patients.map(p => p.id));
      window.patients.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); patients.push(p); } });
    }

    allTraumatoPatients = patients;
    renderTraumatoPatientSelectorOptions(allTraumatoPatients);

    // Matching ORL logic: if current patient is already globally selected, use it, else do NOT auto-select
    if (typeof currentPatientId !== 'undefined' && currentPatientId && allTraumatoPatients.some(p => p.id === currentPatientId)) {
      await selectTraumatoPatient(currentPatientId);
    } else if (traumatoSelectedPatientId && allTraumatoPatients.some(p => p.id === traumatoSelectedPatientId)) {
      await selectTraumatoPatient(traumatoSelectedPatientId);
    } else {
      // Empty state
      await selectTraumatoPatient(null);
    }
  } catch (err) {
    console.error('Error loading traumato patients:', err);
  }
}

function renderTraumatoPatientSelectorOptions(patients) {
  const select = document.getElementById('traumato-patient-selector');
  if (!select) return;
  let html = '<option value="">-- Sélectionner un patient --</option>';
  patients.forEach(p => {
    const name = `${p.lastName || ''} ${p.firstName || ''}`.trim() || 'Patient sans nom';
    html += `<option value="${safeEscapeHTML(p.id)}">${safeEscapeHTML(name)}</option>`;
  });
  select.innerHTML = html;
}

export function handleTraumatoPatientSearchInput(value) {
  const clearBtn = document.getElementById('traumato-patient-search-clear');
  if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
  performTraumatoPatientSearch(value);
}

export function handleTraumatoPatientSearchFocus() {
  const input = document.getElementById('traumato-patient-search-bar');
  const val = input?.value?.trim();
  if (val) {
    performTraumatoPatientSearch(val);
  } else {
    const dropdown = document.getElementById('traumato-patient-search-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }
}

export function performTraumatoPatientSearch(query) {
  const q = stripTraumatoSearchAccents(query).trim();
  const dropdown = document.getElementById('traumato-patient-search-dropdown');
  if (!dropdown) return;

  // Afficher la liste de resultats uniquement apres la saisie de caracteres
  if (!q) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    return;
  }

  const matches = (allTraumatoPatients || []).filter(p => {
    const name = stripTraumatoSearchAccents(`${p.lastName || ''} ${p.firstName || ''}`);
    const phone = String(p.phone || '');
    return name.includes(q) || phone.includes(q);
  });

  const top10 = matches.slice(0, 10);
  renderTraumatoPatientSearchResults(top10.slice(0, 5));
}

export function renderTraumatoPatientSearchResults(patients) {
  const dropdown = document.getElementById('traumato-patient-search-dropdown');
  if (!dropdown) return;

  if (!patients || patients.length === 0) {
    dropdown.innerHTML = '<div style="padding: 12px; font-size: 12.5px; color: #64748b; text-align: center;">Aucun patient trouvé</div>';
    dropdown.style.display = 'block';
    return;
  }

  let html = '';
  patients.slice(0, 5).forEach(p => {
    const isSelected = p.id === traumatoSelectedPatientId;
    const name = `${p.lastName || ''} ${p.firstName || ''}`.trim() || 'Patient sans nom';
    const phone = p.phone ? `Tél: ${p.phone}` : '';
    const age = p.dateOfBirth ? ` · ${getPatientAge(p.dateOfBirth)}` : '';
    html += `
      <div class="traumato-search-item"
           onclick="selectTraumatoPatientFromSearch('${safeEscapeHTML(p.id)}')"
           style="padding: 7px 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; transition: background 0.15s; ${isSelected ? 'background: #eff6ff;' : ''}">
        <div>
          <div style="font-size: 13px; color: #1e293b; font-weight: 600; line-height: 1.3;">${safeEscapeHTML(name)}</div>
          <div style="font-size: 11px; color: #64748b; line-height: 1.2; margin-top: 2px;">${safeEscapeHTML([phone, age].filter(Boolean).join('') || 'Dossier traumatologique')}</div>
        </div>
        ${isSelected ? '<span style="color: #0284c7; font-weight: 600; font-size: 12px;">Sélectionné</span>' : ''}
      </div>
    `;
  });
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

export function selectTraumatoPatientFromSearch(patientId) {
  const dropdown = document.getElementById('traumato-patient-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  selectTraumatoPatient(patientId);
}

export function clearTraumatoPatientSearch() {
  const input = document.getElementById('traumato-patient-search-bar');
  if (input) input.value = '';
  const clearBtn = document.getElementById('traumato-patient-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  const dropdown = document.getElementById('traumato-patient-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function getPatientAge(dob) {
  if (!dob) return '';
  try {
    const diff = Date.now() - new Date(dob).getTime();
    const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return (age >= 0 && age < 130) ? `${age} ans` : '';
  } catch (_) { return ''; }
}

export async function selectTraumatoPatient(patientId) {
  traumatoSelectedPatientId = patientId;
  traumatoSelectedBone = null;

  const display = document.getElementById('traumato-current-patient-display');
  const searchInput = document.getElementById('traumato-patient-search-bar');
  const clearBtn = document.getElementById('traumato-patient-search-clear');
  const select = document.getElementById('traumato-patient-selector');
  if (select) select.value = patientId || '';

  if (!patientId) {
    if (display) display.textContent = 'Aucun patient sélectionné';
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    traumatoLesionsData = {};
    traumatoTreatmentsCache = {};
    renderTraumatoEmptyState();
    loadTraumatoHistoryCards(null);
    return;
  }

  try {
    let pName = '';
    const localPatient = (allTraumatoPatients || []).find(p => p.id === patientId);
    if (localPatient) pName = `${localPatient.lastName || ''} ${localPatient.firstName || ''}`.trim();

    let res = null;
    if (window.api?.patient?.getById) {
      try { res = await window.api.patient.getById(patientId); } catch (_) {}
    }
    if (res?.success && res.data) {
      pName = `${res.data.lastName || ''} ${res.data.firstName || ''}`.trim();
      if (typeof window.setSelectedPatient === 'function') {
        await window.setSelectedPatient(patientId, { patient: res.data, source: 'traumatology' });
      }
    } else if (localPatient && typeof window.setSelectedPatient === 'function') {
      await window.setSelectedPatient(patientId, { patient: localPatient, source: 'traumatology' });
    }

    if (display) display.textContent = pName || 'Patient';
    if (searchInput) searchInput.value = pName;
    if (clearBtn) clearBtn.style.display = 'block';

    await loadTraumatoLesions(patientId);
    await loadTraumatoRecord(patientId);
    await loadTraumatoTreatments(patientId);
    await loadTraumatoHistoryCards(patientId);
    renderTraumatoChart();
  } catch (e) {
    console.error('Error selecting traumato patient:', e);
  }
}

export function refreshTraumatoPatientList() {
  loadTraumatoPatientList();
}

// ========== CHARGEMENT DES DONNÉES CLINIQUE TRAUMATO ==========

async function loadTraumatoLesions(patientId) {
  traumatoLesionsData = {};
  if (!patientId || !window.api?.traumato?.getLesions) return;
  try {
    const res = await window.api.traumato.getLesions(patientId);
    if (res?.success && Array.isArray(res.data)) {
      res.data.forEach(item => {
        traumatoLesionsData[item.boneCode] = item;
      });
    }
  } catch (err) {
    console.warn('Could not load traumato lesions:', err);
  }
}

async function loadTraumatoRecord(patientId) {
  if (!patientId || !window.api?.traumato?.getRecord) return;
  try {
    const res = await window.api.traumato.getRecord(patientId);
    const data = res?.data || {};
    populateTraumatoRecordForm(data);
  } catch (err) {
    console.warn('Could not load traumato record:', err);
  }
}

function populateTraumatoRecordForm(data) {
  const form = document.getElementById('traumato-clinical-form');
  if (!form) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };

  setVal('trauma-eva-slider', data.evaScore || 0);
  updateEvaDisplay(data.evaScore || 0);
  setVal('trauma-mechanism', data.mechanism || '');
  setVal('trauma-cauchoix', data.cauchoixStage || 'fermee');
  setVal('trauma-neuro-vasc', data.neuroVascularExam || '');
  setVal('trauma-loges', data.compartmentSyndromeNotes || '');
  setVal('trauma-general-notes', data.generalNotes || '');
}

export function updateEvaDisplay(val) {
  const num = parseInt(val, 10) || 0;
  const badge = document.getElementById('trauma-eva-val');
  if (!badge) return;
  badge.textContent = `${num} / 10`;

  let color = '#22c55e'; // 0-2
  let desc = 'Douleur absente ou faible';
  if (num >= 3 && num <= 4) { color = '#eab308'; desc = 'Douleur modérée'; }
  else if (num >= 5 && num <= 6) { color = '#f97316'; desc = 'Douleur intense'; }
  else if (num >= 7 && num <= 8) { color = '#ef4444'; desc = 'Douleur très intense'; }
  else if (num >= 9) { color = '#991b1b'; desc = 'Douleur intolérable / insupportable'; }

  badge.style.background = color;
  const descEl = document.getElementById('trauma-eva-desc');
  if (descEl) descEl.textContent = desc;
}

// ========== RENDU DU SQUELETTE ET SCHÉMA ==========

function renderTraumatoEmptyState() {
  const container = document.getElementById('traumato-chart-container');
  if (!container) return;
  container.innerHTML = `
    <div class="traumato-empty-state" style="text-align: center; padding: 60px 20px; color: #64748b;">
      <div style="margin-bottom: 16px; display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: #f0f9ff; color: #0284c7;">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 10c.7-.7 1.69-1 2.5-1a2.5 2.5 0 1 0-2.5-2.5c0 .81-.3 1.8-1 2.5l-7 7c-.7.7-1.69 1-2.5 1a2.5 2.5 0 1 0 2.5 2.5c0-.81.3-1.8 1-2.5l7-7z"/>
        </svg>
      </div>
      <h3 style="color: #1e293b; font-size: 18px; margin: 0 0 8px 0;">Aucun patient sélectionné</h3>
      <p style="max-width: 440px; margin: 0 auto 20px auto; font-size: 13.5px; line-height: 1.5;">
        Veuillez rechercher et sélectionner un patient dans la barre latérale pour afficher son bilan squelettique, ses radiographies et ses lésions traumatologiques.
      </p>
    </div>
  `;
}

let currentTraumatoBoneFilter = 'all';
let isTraumatoQuickBarCollapsed = false;
let collapsedBoneGroups = {
  head: false,
  upper_limb: false,
  lower_limb: false
};

export function toggleTraumatoQuickBar() {
  isTraumatoQuickBarCollapsed = !isTraumatoQuickBarCollapsed;
  const content = document.getElementById('traumato-quick-bar-content');
  const filters = document.getElementById('traumato-bone-category-filters');
  const chevron = document.getElementById('traumato-quick-bar-chevron');
  const textEl = document.getElementById('traumato-quick-bar-toggle-text');
  const header = document.getElementById('traumato-quick-bar-header');

  if (content) {
    content.style.display = isTraumatoQuickBarCollapsed ? 'none' : 'block';
  }
  if (filters) {
    filters.style.display = isTraumatoQuickBarCollapsed ? 'none' : 'flex';
  }
  if (chevron) {
    chevron.style.transform = isTraumatoQuickBarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  }
  if (textEl) {
    textEl.textContent = isTraumatoQuickBarCollapsed ? 'Développer' : 'Réduire';
  }
  if (header) {
    header.style.marginBottom = isTraumatoQuickBarCollapsed ? '0' : '12px';
    header.style.paddingBottom = isTraumatoQuickBarCollapsed ? '0' : '10px';
    header.style.borderBottom = isTraumatoQuickBarCollapsed ? 'none' : '1px solid #f1f5f9';
  }
}

export function toggleBoneGroup(groupId) {
  collapsedBoneGroups[groupId] = !collapsedBoneGroups[groupId];
  const isCollapsed = collapsedBoneGroups[groupId];
  const body = document.getElementById(`bone-grp-body-${groupId}`);
  const chevron = document.getElementById(`chevron-bone-grp-${groupId}`);

  if (body) {
    body.style.display = isCollapsed ? 'none' : 'flex';
  }
  if (chevron) {
    chevron.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

export function renderUpperBoneQuickSelectorHTML() {
  const categories = [
    { id: 'all', label: 'Tout le corps' },
    { id: 'head', label: 'Tête & Rachis' },
    { id: 'upper_limb', label: 'Membres Supérieurs' },
    { id: 'lower_limb', label: 'Membres Inférieurs' }
  ];

  return `
    <div id="traumato-upper-quick-bar" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: all 0.2s;">
      <div id="traumato-quick-bar-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: ${isTraumatoQuickBarCollapsed ? '0' : '12px'}; padding-bottom: ${isTraumatoQuickBarCollapsed ? '0' : '10px'}; border-bottom: ${isTraumatoQuickBarCollapsed ? 'none' : '1px solid #f1f5f9'};">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span style="font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
            </svg>
            Sélecteur rapide des zones anatomiques
          </span>
          <button type="button"
                  id="btn-toggle-traumato-quick-bar"
                  onclick="toggleTraumatoQuickBar()"
                  title="Réduire ou afficher la section du sélecteur"
                  style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; font-size: 11.5px; font-weight: 600; color: #0284c7; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; cursor: pointer; transition: all 0.15s;">
            <span id="traumato-quick-bar-toggle-text">${isTraumatoQuickBarCollapsed ? 'Développer' : 'Réduire'}</span>
            <svg id="traumato-quick-bar-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: ${isTraumatoQuickBarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'};">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
        <div id="traumato-bone-category-filters" style="display: ${isTraumatoQuickBarCollapsed ? 'none' : 'flex'}; gap: 6px; background: #f8fafc; padding: 3px; border-radius: 8px; border: 1px solid #e2e8f0;">
          ${categories.map(c => {
            const isActive = currentTraumatoBoneFilter === c.id;
            return `
              <button type="button"
                      id="btn-filter-bone-${c.id}"
                      class="btn btn-small ${isActive ? 'btn-primary' : 'btn-secondary'}"
                      onclick="filterBoneCategory('${c.id}')"
                      style="font-size: 11.5px; padding: 4px 12px; border-radius: 6px; font-weight: ${isActive ? '600' : '500'}; background: ${isActive ? '#0284c7' : 'transparent'}; color: ${isActive ? '#ffffff' : '#64748b'}; border: none; cursor: pointer; transition: all 0.15s;">
                ${c.label}
              </button>
            `;
          }).join('')}
        </div>
      </div>
      <div id="traumato-quick-bar-content" style="display: ${isTraumatoQuickBarCollapsed ? 'none' : 'block'};">
        <div id="traumato-bone-chips-list">
          ${renderBoneChipsHTML(currentTraumatoBoneFilter)}
        </div>
      </div>
    </div>
  `;
}

function renderSingleBoneChip(code) {
  const bone = BONE_DEFINITIONS[code];
  if (!bone) return '';
  const lesion = traumatoLesionsData[code];
  const isAffected = lesion && lesion.status && lesion.status !== 'healthy';
  const statusStyle = isAffected ? (LESION_STATUSES[lesion.status] || LESION_STATUSES.healthy) : null;
  const isSelected = traumatoSelectedBone === code;

  const bg = isSelected ? '#0284c7' : (isAffected ? statusStyle.color : '#ffffff');
  const textCol = isSelected ? '#ffffff' : (isAffected ? statusStyle.tc : '#334155');
  const borderCol = isSelected ? '#0284c7' : (isAffected ? statusStyle.border : '#cbd5e1');
  const dotIndicator = isAffected && !isSelected
    ? `<span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusStyle.border}; display: inline-block; margin-right: 5px; flex-shrink: 0;"></span>`
    : '';

  return `
    <button type="button"
            id="bone-chip-${code}"
            class="bone-chip ${isAffected ? 'has-lesion' : ''} ${isSelected ? 'selected' : ''}"
            onclick="selectTraumatoBone('${code}')"
            title="${safeEscapeHTML(bone.name)}"
            style="background: ${bg}; color: ${textCol}; border: 1px solid ${borderCol}; border-radius: 6px; padding: 4px 10px; font-size: 11.5px; font-weight: 500; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; white-space: nowrap;">
      ${dotIndicator}${safeEscapeHTML(bone.name)}
    </button>
  `;
}

function renderBoneChipsHTML(cat = 'all') {
  const groups = [
    {
      id: 'head',
      region: 'spine',
      title: 'Tête & Rachis',
      codes: ['skull', 'face', 'spine_cervical', 'spine_thoracic', 'spine_lumbar', 'thorax_ribs', 'sacrum_pelvis']
    },
    {
      id: 'upper_limb',
      region: 'upper_limb',
      title: 'Membres Supérieurs',
      codes: ['clavicle_r', 'clavicle_l', 'scapula_r', 'scapula_l', 'humerus_r', 'humerus_l', 'elbow_r', 'elbow_l', 'forearm_r', 'forearm_l', 'wrist_r', 'wrist_l', 'hand_r', 'hand_l']
    },
    {
      id: 'lower_limb',
      region: 'lower_limb',
      title: 'Membres Inférieurs',
      codes: ['hip_r', 'hip_l', 'femur_r', 'femur_l', 'knee_r', 'knee_l', 'leg_r', 'leg_l', 'ankle_r', 'ankle_l', 'foot_r', 'foot_l']
    }
  ];

  const filteredGroups = cat === 'all'
    ? groups
    : groups.filter(g => g.id === cat || (cat === 'head' && (g.id === 'head' || g.region === 'spine')));

  return `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${filteredGroups.map(grp => {
        const isCollapsed = Boolean(collapsedBoneGroups[grp.id]);
        return `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; transition: all 0.15s;">
            <div onclick="toggleBoneGroup('${grp.id}')"
                 style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;"
                 title="Cliquer pour afficher / masquer les segments de ${safeEscapeHTML(grp.title)}">
              <span style="font-size: 11px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #0284c7;"></span>
                ${grp.title}
              </span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10.5px; color: #94a3b8; font-weight: 500;">${grp.codes.length} segments</span>
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; background: #f1f5f9; color: #64748b;">
                  <svg id="chevron-bone-grp-${grp.id}" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: ${isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'};">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </span>
              </div>
            </div>
            <div id="bone-grp-body-${grp.id}" style="display: ${isCollapsed ? 'none' : 'flex'}; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
              ${grp.codes.map(c => renderSingleBoneChip(c)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function filterBoneCategory(cat) {
  currentTraumatoBoneFilter = cat;
  const categories = ['all', 'head', 'upper_limb', 'lower_limb'];
  categories.forEach(c => {
    const btn = document.getElementById(`btn-filter-bone-${c}`);
    if (btn) {
      const isActive = c === cat;
      btn.className = `btn btn-small ${isActive ? 'btn-primary' : 'btn-secondary'}`;
      btn.style.background = isActive ? '#0284c7' : 'transparent';
      btn.style.color = isActive ? '#ffffff' : '#64748b';
      btn.style.fontWeight = isActive ? '600' : '500';
    }
  });

  const container = document.getElementById('traumato-bone-chips-list');
  if (container) container.innerHTML = renderBoneChipsHTML(cat);
}

export function renderTraumatoChart() {
  if (!traumatoSelectedPatientId) {
    renderTraumatoEmptyState();
    return;
  }

  const container = document.getElementById('traumato-chart-container');
  if (!container) return;

  container.innerHTML = `
    ${renderUpperBoneQuickSelectorHTML()}
    <div class="traumato-workspace-grid" style="display: grid; grid-template-columns: minmax(360px, 460px) minmax(420px, 1fr); gap: 16px; align-items: start;">
      
      <!-- Squelette Vectoriel SVG Interactif -->
      <div class="card traumato-skeleton-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div>
            <h4 style="margin: 0; color: #0f172a; font-size: 15px; font-weight: 700;">Cartographie Squelettique</h4>
            <span style="font-size: 12px; color: #64748b;">Cliquez sur un os ou une articulation pour l'examiner</span>
          </div>
          <div class="traumato-view-toggle" style="display: inline-flex; background: #f1f5f9; padding: 3px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <button type="button" id="btn-traumato-view-ant" class="btn btn-small active" onclick="setTraumatoView('anterior')" style="border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; background: #0284c7; color: #ffffff;">
              Face (Antérieur)
            </button>
            <button type="button" id="btn-traumato-view-post" class="btn btn-small" onclick="setTraumatoView('posterior')" style="border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; background: #ffffff; color: #64748b;">
              Dos (Postérieur)
            </button>
          </div>
        </div>

        <div class="traumato-svg-wrapper" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; position: relative; min-height: 520px; display: flex; align-items: center; justify-content: center;">
          ${renderInteractiveSkeletonSVG('anterior')}
          ${renderInteractiveSkeletonSVG('posterior')}
        </div>

        <!-- Légende des lésions -->
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px;">
          ${Object.entries(LESION_STATUSES).map(([key, st]) => `
            <span style="display: inline-flex; align-items: center; gap: 6px; background: ${st.color}; color: ${st.tc}; border: 1px solid ${st.border}; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 500;">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${st.border}; display: inline-block;"></span>
              ${st.label}
            </span>
          `).join('')}
        </div>
      </div>

      <!-- Panneau d'Examen et Dossier Traumatologique -->
      <div class="traumato-editor-col" style="display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Cartouche Os Sélectionné -->
        <div id="traumato-bone-inspector" class="card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          ${renderBoneInspectorHTML()}
        </div>

        <!-- Formulaire d'Examen Clinique Traumatologique -->
        <div class="card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h4 style="margin: 0; color: #0f172a; font-size: 15px; font-weight: 700;">Évaluation Clinique & Bilan Lésionnel</h4>
            <button type="button" class="btn btn-secondary btn-small" onclick="printTraumatoReport()" style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimer Compte-Rendu
            </button>
          </div>

          <form id="traumato-clinical-form" onsubmit="event.preventDefault(); saveTraumatoClinicalRecord();">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Mécanisme lésionnel / Circonstance</label>
                <select id="trauma-mechanism" class="form-control" style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px;">
                  <option value="">Sélectionner...</option>
                  <option value="chute_hauteur">Chute de sa hauteur</option>
                  <option value="chute_lieu_eleve">Chute d'un lieu élevé / défenestration</option>
                  <option value="avp_auto">Accident de circulation (Voiture)</option>
                  <option value="avp_deux_roues">Accident 2 roues (Moto / Vélo)</option>
                  <option value="sport">Accident sportif</option>
                  <option value="travail">Accident de travail</option>
                  <option value="choc_direct">Choc direct / Traumatisme balistique</option>
                  <option value="torsion">Torsion violente / Mouvement forcé</option>
                </select>
              </div>

              <div>
                <label style="display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">
                  <span>Douleur (Échelle EVA 0-10)</span>
                  <span id="trauma-eva-val" style="background: #22c55e; color: #ffffff; padding: 1px 7px; border-radius: 4px; font-size: 12px;">0 / 10</span>
                </label>
                <input type="range" id="trauma-eva-slider" min="0" max="10" value="0" oninput="updateEvaDisplay(this.value)" style="width: 100%; cursor: pointer;">
                <div id="trauma-eva-desc" style="font-size: 11px; color: #64748b; margin-top: 2px;">Douleur absente ou faible</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">État cutané (Classification Cauchoix-Duparc)</label>
                <select id="trauma-cauchoix" class="form-control" style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px;">
                  <option value="fermee">Fracture fermée (Peau saine / contuse)</option>
                  <option value="stade_1">Stade I : Ouverture punctiforme ou linéaire sans décollement</option>
                  <option value="stade_2">Stade II : Plaie avec décollement ou risque de nécrose secondaire</option>
                  <option value="stade_3">Stade III : Délabrement cutané étendu avec perte de substance</option>
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Bilan Vasculo-Nerveux Distal</label>
                <input type="text" id="trauma-neuro-vasc" class="form-control" placeholder="Pouls périphériques +, TRC < 2s, sensibilité..." style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px;">
              </div>
            </div>

            <div style="margin-bottom: 12px;">
              <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Surveillance Syndrome des Loges & Signes d'alerte</label>
              <input type="text" id="trauma-loges" class="form-control" placeholder="Loges souples et dépressibles, absence de douleur à l'étirement passif..." style="width: 100%; height: 36px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px;">
            </div>

            <div style="margin-bottom: 12px;">
              <label style="display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px;">Observations cliniques & Protocole de soins</label>
              <textarea id="trauma-general-notes" rows="3" class="form-control" placeholder="Compte-rendu de consultation traumatologique, consignes au patient..." style="width: 100%; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; padding: 8px;"></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button type="submit" class="btn btn-primary" style="background: #0284c7; border: none; font-weight: 600; padding: 7px 18px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Enregistrer la Consultation
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  `;

  updateBoneVisualStyles();
}

function renderInteractiveSkeletonSVG(view) {
  // id="traumato-svg-anterior" and id="traumato-svg-posterior"
  const isAnt = view === 'anterior';
  const displayStyle = (currentTraumatoView === view) ? 'block' : 'none';

  return `
    <svg id="${view === 'anterior' ? 'traumato-svg-anterior' : 'traumato-svg-posterior'}" viewBox="0 0 380 620" width="100%" height="520" style="max-width: 360px; display: ${displayStyle}; margin: 0 auto; user-select: none;">
      <defs>
        <filter id="bone-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#0284c7" flood-opacity="0.8"/>
        </filter>
      </defs>

      <!-- Silhouette squelettique haute fidélité -->
      <g id="svg-bones-group-${view}" class="svg-bones-group">
        
        <!-- TÊTE ET RACHIS -->
        <!-- Crâne -->
        <path id="bone-svg-${view}-skull" data-bone-code="skull" class="anatomical-bone"
              d="M190,25 C165,25 155,45 155,68 C155,90 170,105 190,105 C210,105 225,90 225,68 C225,45 215,25 190,25 Z"
              onclick="selectTraumatoBone('skull')" />
        <text x="190" y="68" font-size="10" text-anchor="middle" fill="#64748b" pointer-events="none">Crâne</text>

        <!-- Face / Mandibule -->
        <path id="bone-svg-${view}-face" data-bone-code="face" class="anatomical-bone"
              d="M170,88 L210,88 L202,112 L178,112 Z"
              onclick="selectTraumatoBone('face')" />

        <!-- Rachis cervical C1-C7 -->
        <rect id="bone-svg-${view}-spine_cervical" data-bone-code="spine_cervical" class="anatomical-bone"
              x="184" y="114" width="12" height="24" rx="3"
              onclick="selectTraumatoBone('spine_cervical')" />

        <!-- MEMBRE SUPÉRIEUR DROIT (Vu à gauche sur l'image en vue antérieure) -->
        <!-- Clavicule D -->
        <path id="bone-svg-${view}-clavicle_r" data-bone-code="clavicle_r" class="anatomical-bone"
              d="M182,140 C165,136 142,142 125,148 L126,154 C144,148 166,143 182,145 Z"
              onclick="selectTraumatoBone('clavicle_r')" />

        <!-- Scapula / Épaule D -->
        <path id="bone-svg-${view}-scapula_r" data-bone-code="scapula_r" class="anatomical-bone"
              d="M110,148 C105,148 98,155 100,165 C102,175 116,182 124,175 C128,165 125,152 110,148 Z"
              onclick="selectTraumatoBone('scapula_r')" />

        <!-- Humérus D -->
        <path id="bone-svg-${view}-humerus_r" data-bone-code="humerus_r" class="anatomical-bone"
              d="M100,172 L85,250 L98,252 L112,174 Z" rx="4"
              onclick="selectTraumatoBone('humerus_r')" />

        <!-- Coude D -->
        <circle id="bone-svg-${view}-elbow_r" data-bone-code="elbow_r" class="anatomical-bone"
                cx="91" cy="256" r="8"
                onclick="selectTraumatoBone('elbow_r')" />

        <!-- Avant-bras (Radius/Ulna) D -->
        <path id="bone-svg-${view}-forearm_r" data-bone-code="forearm_r" class="anatomical-bone"
              d="M86,266 L72,335 L86,337 L98,268 Z" rx="3"
              onclick="selectTraumatoBone('forearm_r')" />

        <!-- Poignet D -->
        <circle id="bone-svg-${view}-wrist_r" data-bone-code="wrist_r" class="anatomical-bone"
                cx="78" cy="342" r="6"
                onclick="selectTraumatoBone('wrist_r')" />

        <!-- Main / Doigts D -->
        <path id="bone-svg-${view}-hand_r" data-bone-code="hand_r" class="anatomical-bone"
              d="M74,348 C68,362 65,378 72,382 C78,384 84,374 86,355 Z"
              onclick="selectTraumatoBone('hand_r')" />

        <!-- MEMBRE SUPÉRIEUR GAUCHE (Vu à droite sur l'image en vue antérieure) -->
        <!-- Clavicule G -->
        <path id="bone-svg-${view}-clavicle_l" data-bone-code="clavicle_l" class="anatomical-bone"
              d="M198,140 C215,136 238,142 255,148 L254,154 C236,148 214,143 198,145 Z"
              onclick="selectTraumatoBone('clavicle_l')" />

        <!-- Scapula / Épaule G -->
        <path id="bone-svg-${view}-scapula_l" data-bone-code="scapula_l" class="anatomical-bone"
              d="M270,148 C275,148 282,155 280,165 C278,175 264,182 256,175 C252,165 255,152 270,148 Z"
              onclick="selectTraumatoBone('scapula_l')" />

        <!-- Humérus G -->
        <path id="bone-svg-${view}-humerus_l" data-bone-code="humerus_l" class="anatomical-bone"
              d="M268,174 L282,252 L295,250 L280,172 Z" rx="4"
              onclick="selectTraumatoBone('humerus_l')" />

        <!-- Coude G -->
        <circle id="bone-svg-${view}-elbow_l" data-bone-code="elbow_l" class="anatomical-bone"
                cx="289" cy="256" r="8"
                onclick="selectTraumatoBone('elbow_l')" />

        <!-- Avant-bras (Radius/Ulna) G -->
        <path id="bone-svg-${view}-forearm_l" data-bone-code="forearm_l" class="anatomical-bone"
              d="M282,268 L294,337 L308,335 L294,266 Z" rx="3"
              onclick="selectTraumatoBone('forearm_l')" />

        <!-- Poignet G -->
        <circle id="bone-svg-${view}-wrist_l" data-bone-code="wrist_l" class="anatomical-bone"
                cx="302" cy="342" r="6"
                onclick="selectTraumatoBone('wrist_l')" />

        <!-- Main / Doigts G -->
        <path id="bone-svg-${view}-hand_l" data-bone-code="hand_l" class="anatomical-bone"
              d="M294,355 C296,374 302,384 308,382 C315,378 312,362 306,348 Z"
              onclick="selectTraumatoBone('hand_l')" />

        <!-- TRONC & RACHIS -->
        <!-- Cage Thoracique / Gril costal -->
        <path id="bone-svg-${view}-thorax_ribs" data-bone-code="thorax_ribs" class="anatomical-bone"
              d="M152,154 C135,165 130,220 156,238 L224,238 C250,220 245,165 228,154 Z"
              onclick="selectTraumatoBone('thorax_ribs')" />
        <text x="190" y="196" font-size="9" text-anchor="middle" fill="#64748b" pointer-events="none">Thorax / Côtes</text>

        <!-- Rachis dorsal / lombaire -->
        <rect id="bone-svg-${view}-spine_thoracic" data-bone-code="spine_thoracic" class="anatomical-bone"
              x="183" y="145" width="14" height="60" rx="3"
              onclick="selectTraumatoBone('spine_thoracic')" />

        <rect id="bone-svg-${view}-spine_lumbar" data-bone-code="spine_lumbar" class="anatomical-bone"
              x="183" y="210" width="14" height="42" rx="3"
              onclick="selectTraumatoBone('spine_lumbar')" />

        <!-- Bassin / Sacrum -->
        <path id="bone-svg-${view}-sacrum_pelvis" data-bone-code="sacrum_pelvis" class="anatomical-bone"
              d="M142,255 C132,260 135,295 160,305 C172,310 182,310 190,302 C198,310 208,310 220,305 C245,295 248,260 238,255 C222,252 208,258 190,258 C172,258 158,252 142,255 Z"
              onclick="selectTraumatoBone('sacrum_pelvis')" />
        <text x="190" y="284" font-size="9" text-anchor="middle" fill="#64748b" pointer-events="none">Bassin</text>

        <!-- MEMBRE INFÉRIEUR DROIT -->
        <!-- Hanche D -->
        <circle id="bone-svg-${view}-hip_r" data-bone-code="hip_r" class="anatomical-bone"
                cx="155" cy="305" r="9"
                onclick="selectTraumatoBone('hip_r')" />

        <!-- Fémur D -->
        <path id="bone-svg-${view}-femur_r" data-bone-code="femur_r" class="anatomical-bone"
              d="M148,315 L155,420 L169,418 L163,314 Z" rx="5"
              onclick="selectTraumatoBone('femur_r')" />

        <!-- Genou / Rotule D -->
        <circle id="bone-svg-${view}-knee_r" data-bone-code="knee_r" class="anatomical-bone"
                cx="162" cy="428" r="9"
                onclick="selectTraumatoBone('knee_r')" />

        <!-- Tibia / Fibula D -->
        <path id="bone-svg-${view}-leg_r" data-bone-code="leg_r" class="anatomical-bone"
              d="M156,440 L152,538 L166,538 L170,440 Z" rx="4"
              onclick="selectTraumatoBone('leg_r')" />

        <!-- Cheville D -->
        <circle id="bone-svg-${view}-ankle_r" data-bone-code="ankle_r" class="anatomical-bone"
                cx="159" cy="546" r="7"
                onclick="selectTraumatoBone('ankle_r')" />

        <!-- Pied D -->
        <path id="bone-svg-${view}-foot_r" data-bone-code="foot_r" class="anatomical-bone"
              d="M152,552 L132,582 L158,582 L166,554 Z"
              onclick="selectTraumatoBone('foot_r')" />

        <!-- MEMBRE INFÉRIEUR GAUCHE -->
        <!-- Hanche G -->
        <circle id="bone-svg-${view}-hip_l" data-bone-code="hip_l" class="anatomical-bone"
                cx="225" cy="305" r="9"
                onclick="selectTraumatoBone('hip_l')" />

        <!-- Fémur G -->
        <path id="bone-svg-${view}-femur_l" data-bone-code="femur_l" class="anatomical-bone"
              d="M217,314 L211,418 L225,420 L232,315 Z" rx="5"
              onclick="selectTraumatoBone('femur_l')" />

        <!-- Genou / Rotule G -->
        <circle id="bone-svg-${view}-knee_l" data-bone-code="knee_l" class="anatomical-bone"
                cx="218" cy="428" r="9"
                onclick="selectTraumatoBone('knee_l')" />

        <!-- Tibia / Fibula G -->
        <path id="bone-svg-${view}-leg_l" data-bone-code="leg_l" class="anatomical-bone"
              d="M210,440 L214,538 L228,538 L224,440 Z" rx="4"
              onclick="selectTraumatoBone('leg_l')" />

        <!-- Cheville G -->
        <circle id="bone-svg-${view}-ankle_l" data-bone-code="ankle_l" class="anatomical-bone"
                cx="221" cy="546" r="7"
                onclick="selectTraumatoBone('ankle_l')" />

        <!-- Pied G -->
        <path id="bone-svg-${view}-foot_l" data-bone-code="foot_l" class="anatomical-bone"
              d="M214,554 L222,582 L248,582 L228,552 Z"
              onclick="selectTraumatoBone('foot_l')" />

      </g>
    </svg>
  `;
}

function updateBoneVisualStyles() {
  const views = ['anterior', 'posterior'];
  views.forEach(view => {
    Object.keys(BONE_DEFINITIONS).forEach(code => {
      const el = document.getElementById(`bone-svg-${view}-${code}`);
      if (!el) return;

      const lesion = traumatoLesionsData[code];
      const isAffected = lesion && lesion.status && lesion.status !== 'healthy';
      const st = isAffected ? (LESION_STATUSES[lesion.status] || LESION_STATUSES.healthy) : LESION_STATUSES.healthy;
      const isSelected = traumatoSelectedBone === code;

      el.setAttribute('fill', st.color);
      el.setAttribute('stroke', isSelected ? '#0284c7' : st.border);
      el.setAttribute('stroke-width', isSelected ? '3.5' : (isAffected ? '2' : '1.2'));
      el.style.cursor = 'pointer';
      el.style.transition = 'all 0.2s';
      if (isSelected) {
        el.setAttribute('filter', 'url(#bone-glow)');
      } else {
        el.removeAttribute('filter');
      }
    });
  });
}

// ========== SÉLECTION ET INSPECTEUR D'OS ==========

export function selectTraumatoBone(boneCode) {
  traumatoSelectedBone = boneCode;
  updateBoneVisualStyles();

  // Mise à jour des boutons chips
  document.querySelectorAll('.bone-chip').forEach(chip => {
    const isSel = chip.id === `bone-chip-${boneCode}`;
    chip.classList.toggle('selected', isSel);
    const code = chip.id.replace('bone-chip-', '');
    const lesion = traumatoLesionsData[code];
    const isAffected = lesion && lesion.status && lesion.status !== 'healthy';
    const statusStyle = isAffected ? (LESION_STATUSES[lesion.status] || LESION_STATUSES.healthy) : null;

    if (isSel) {
      chip.style.background = '#0284c7';
      chip.style.color = '#ffffff';
      chip.style.borderColor = '#0284c7';
    } else {
      chip.style.background = isAffected ? statusStyle.color : '#ffffff';
      chip.style.color = isAffected ? statusStyle.tc : '#334155';
      chip.style.borderColor = isAffected ? statusStyle.border : '#cbd5e1';
    }
  });

  const inspector = document.getElementById('traumato-bone-inspector');
  if (inspector) {
    inspector.innerHTML = renderBoneInspectorHTML();
  }
}

function renderBoneInspectorHTML() {
  if (!traumatoSelectedBone) {
    return `
      <div style="text-align: center; padding: 28px 16px; color: #64748b;">
        <div style="margin-bottom: 12px; display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: #f1f5f9; color: #64748b;">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 10c.7-.7 1.69-1 2.5-1a2.5 2.5 0 1 0-2.5-2.5c0 .81-.3 1.8-1 2.5l-7 7c-.7.7-1.69 1-2.5 1a2.5 2.5 0 1 0 2.5 2.5c0-.81.3-1.8 1-2.5l7-7z"/>
          </svg>
        </div>
        <strong style="color: #1e293b; font-size: 14px; display: block; margin-bottom: 4px;">Aucune pièce osseuse sélectionnée</strong>
        <p style="font-size: 12.5px; margin: 0; line-height: 1.5; color: #64748b;">Cliquez sur un os sur le squelette ou utilisez le sélecteur ci-dessus pour examiner ou définir son état.</p>
      </div>
    `;
  }

  const bone = BONE_DEFINITIONS[traumatoSelectedBone] || { name: traumatoSelectedBone };
  const lesion = traumatoLesionsData[traumatoSelectedBone] || { status: 'healthy' };
  const currentStatus = lesion.status || 'healthy';
  const statusInfo = LESION_STATUSES[currentStatus] || LESION_STATUSES.healthy;

  return `
    <div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;">
        <div>
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #0284c7; letter-spacing: 0.5px;">Segment Anatomique</span>
          <h3 style="margin: 2px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 700;">${safeEscapeHTML(bone.name)}</h3>
        </div>
        <span style="background: ${statusInfo.color}; color: ${statusInfo.tc}; border: 1px solid ${statusInfo.border}; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusInfo.border}; display: inline-block;"></span>
          ${statusInfo.label}
        </span>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px;">Définir le Statut Lésionnel :</label>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px;">
          ${Object.entries(LESION_STATUSES).map(([key, st]) => `
            <button type="button"
                    class="btn btn-small"
                    onclick="setTraumatoBoneStatus('${key}')"
                    style="background: ${currentStatus === key ? st.border : '#ffffff'}; color: ${currentStatus === key ? '#ffffff' : st.tc}; border: 1px solid ${st.border}; border-radius: 6px; padding: 6px 9px; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px;">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${currentStatus === key ? '#ffffff' : st.border}; display: inline-block; flex-shrink: 0;"></span>
              ${st.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Classification fracturaire</label>
          <input type="text" id="trauma-bone-classif" class="form-control"
                 placeholder="Ex: Garden III, Weber B, Neer 3..."
                 value="${safeEscapeHTML(lesion.fractureClassification || '')}"
                 style="width: 100%; height: 34px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Trait / Déplacement</label>
          <input type="text" id="trauma-bone-displacement" class="form-control"
                 placeholder="Ex: Spiroïde, chevauchement 2cm..."
                 value="${safeEscapeHTML(lesion.displacement || '')}"
                 style="width: 100%; height: 34px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;">
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Traitement appliqué / Immobilisation</label>
        <select id="trauma-bone-treatment-mode" class="form-control" style="width: 100%; height: 34px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;">
          <option value="none" ${!lesion.treatmentMode || lesion.treatmentMode === 'none' ? 'selected' : ''}>Aucun traitement particulier</option>
          <option value="cast_plaster" ${lesion.treatmentMode === 'cast_plaster' ? 'selected' : ''}>Plâtre circulaire ou gouttière</option>
          <option value="splint" ${lesion.treatmentMode === 'splint' ? 'selected' : ''}>Attelle amovible / Orthèse</option>
          <option value="surgery_plate" ${lesion.treatmentMode === 'surgery_plate' ? 'selected' : ''}>Chirurgie : Plaque d'ostéosynthèse vissée</option>
          <option value="surgery_nail" ${lesion.treatmentMode === 'surgery_nail' ? 'selected' : ''}>Chirurgie : Enclouage centro-médullaire</option>
          <option value="surgery_pin" ${lesion.treatmentMode === 'surgery_pin' ? 'selected' : ''}>Chirurgie : Embrochage percutané</option>
          <option value="prosthesis" ${lesion.treatmentMode === 'prosthesis' ? 'selected' : ''}>Chirurgie : Prothèse articulaire (PTH/PTG/PTE)</option>
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Notes spécifiques à cette lésion</label>
        <input type="text" id="trauma-bone-notes" class="form-control"
               placeholder="Observations, contrôle radiologique prévu..."
               value="${safeEscapeHTML(lesion.notes || '')}"
               style="width: 100%; height: 34px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" class="btn btn-secondary btn-small" onclick="setTraumatoBoneStatus('healthy')" style="font-size: 12px;">
          Remettre à Sain
        </button>
        <button type="button" class="btn btn-primary btn-small" onclick="saveCurrentBoneStatus()" style="background: #0284c7; border: none; font-size: 12px; font-weight: 600; padding: 6px 14px;">
          Valider la Lésion
        </button>
      </div>
    </div>
  `;
}

export function setTraumatoBoneStatus(status) {
  if (!traumatoSelectedBone) return;
  const bone = BONE_DEFINITIONS[traumatoSelectedBone] || { name: traumatoSelectedBone };

  traumatoLesionsData[traumatoSelectedBone] = {
    ...(traumatoLesionsData[traumatoSelectedBone] || {}),
    patientId: traumatoSelectedPatientId,
    boneCode: traumatoSelectedBone,
    boneName: bone.name,
    status: status
  };

  updateBoneVisualStyles();
  const inspector = document.getElementById('traumato-bone-inspector');
  if (inspector) inspector.innerHTML = renderBoneInspectorHTML();

  // Mettre à jour les chips du haut
  const upperContainer = document.getElementById('traumato-bone-chips-list');
  if (upperContainer) upperContainer.innerHTML = renderBoneChipsHTML(currentTraumatoBoneFilter);
}

export async function saveCurrentBoneStatus() {
  if (!traumatoSelectedPatientId || !traumatoSelectedBone) return;
  const bone = BONE_DEFINITIONS[traumatoSelectedBone] || { name: traumatoSelectedBone };
  const currentLesion = traumatoLesionsData[traumatoSelectedBone] || { status: 'healthy' };

  const classif = document.getElementById('trauma-bone-classif')?.value || '';
  const displacement = document.getElementById('trauma-bone-displacement')?.value || '';
  const treatmentMode = document.getElementById('trauma-bone-treatment-mode')?.value || '';
  const notes = document.getElementById('trauma-bone-notes')?.value || '';

  const payload = {
    patientId: traumatoSelectedPatientId,
    boneCode: traumatoSelectedBone,
    boneName: bone.name,
    status: currentLesion.status || 'healthy',
    side: bone.side || 'unilateral',
    fractureClassification: classif,
    displacement: displacement,
    treatmentMode: treatmentMode,
    notes: notes
  };

  try {
    if (window.api?.traumato?.saveLesion) {
      const res = await window.api.traumato.saveLesion(payload);
      if (res?.success) {
        traumatoLesionsData[traumatoSelectedBone] = payload;
        updateBoneVisualStyles();
        if (typeof showNotification === 'function') {
          showNotification('Statut osseux enregistré avec succès', 'success');
        }
        await loadTraumatoHistoryCards(traumatoSelectedPatientId);
      }
    }
  } catch (err) {
    console.error('Error saving bone status:', err);
  }
}

// ========== ENREGISTREMENT DOSSIER CLINIQUE TRAUMATO ==========

export async function saveTraumatoClinicalRecord() {
  if (!traumatoSelectedPatientId) {
    if (typeof showNotification === 'function') showNotification('Veuillez sélectionner un patient', 'warning');
    return;
  }

  const getVal = id => document.getElementById(id)?.value || '';
  const eva = parseInt(document.getElementById('trauma-eva-slider')?.value || '0', 10);

  const payload = {
    patientId: traumatoSelectedPatientId,
    mechanism: getVal('trauma-mechanism'),
    evaScore: eva,
    cauchoixStage: getVal('trauma-cauchoix'),
    neuroVascularExam: getVal('trauma-neuro-vasc'),
    compartmentSyndromeNotes: getVal('trauma-loges'),
    generalNotes: getVal('trauma-general-notes')
  };

  try {
    if (window.api?.traumato?.saveRecord) {
      const res = await window.api.traumato.saveRecord(payload);
      if (res?.success) {
        if (typeof showNotification === 'function') {
          showNotification('Dossier clinique traumatologique enregistré', 'success');
        }
      }
    }
  } catch (err) {
    console.error('Error saving traumato record:', err);
  }
}

// ========== IMPRESSION COMPTE-RENDU TRAUMATOLOGIQUE ==========

export function printTraumatoReport() {
  if (!traumatoSelectedPatientId) return;

  const patient = (allTraumatoPatients || []).find(p => p.id === traumatoSelectedPatientId) || {};
  const patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim() || 'Patient';
  const age = getPatientAge(patient.dateOfBirth);

  const getVal = id => document.getElementById(id)?.value || '';
  const mechanism = getVal('trauma-mechanism') || 'Non précisé';
  const eva = document.getElementById('trauma-eva-slider')?.value || '0';
  const cauchoix = getVal('trauma-cauchoix') || 'Fermée';
  const neuroVasc = getVal('trauma-neuro-vasc') || 'Examen normal';
  const loges = getVal('trauma-loges') || 'Absence de syndrome des loges';
  const notes = getVal('trauma-general-notes') || 'Néant';

  const lesionsList = Object.entries(traumatoLesionsData)
    .filter(([code, item]) => item.status && item.status !== 'healthy')
    .map(([code, item]) => {
      const bone = BONE_DEFINITIONS[code] || { name: code };
      const st = LESION_STATUSES[item.status] || { label: item.status };
      return `
        <tr>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">${safeEscapeHTML(bone.name)}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: #b91c1c; font-weight: 600;">${safeEscapeHTML(st.label)}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${safeEscapeHTML(item.fractureClassification || '-')}</td>
          <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">${safeEscapeHTML(item.treatmentMode || '-')}</td>
        </tr>
      `;
    }).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Compte-Rendu Traumatologique - ${safeEscapeHTML(patientName)}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 28px; color: #0f172a; line-height: 1.5; font-size: 13px; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; }
          h2 { margin: 0 0 4px 0; color: #0284c7; font-size: 20px; }
          .section-title { font-size: 14px; font-weight: 700; color: #0284c7; margin: 16px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12.5px; }
          th { background: #f8fafc; padding: 6px 10px; border: 1px solid #cbd5e1; text-align: left; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h2>CABINET DE TRAUMATOLOGIE & CHIRURGIE ORTHOPÉDIQUE</h2>
            <div style="color: #64748b; font-size: 12px;">Certificat Médical Initial & Bilan Lésionnel d'Urgence</div>
          </div>
          <div style="text-align: right; font-size: 12px;">
            <div>Date : <strong>${new Date().toLocaleDateString('fr-FR')}</strong></div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <strong>Patient :</strong> ${safeEscapeHTML(patientName)} ${age ? `(${age})` : ''} &nbsp;|&nbsp;
          <strong>Mécanisme :</strong> ${safeEscapeHTML(mechanism)} &nbsp;|&nbsp;
          <strong>Douleur EVA :</strong> ${safeEscapeHTML(eva)}/10
        </div>

        <div class="section-title">BILAN DES LÉSIONS OSSEUSES & ARTICULAIRES</div>
        <table>
          <thead>
            <tr>
              <th>Segment Anatomique</th>
              <th>Type de Lésion</th>
              <th>Classification</th>
              <th>Traitement Entrepris</th>
            </tr>
          </thead>
          <tbody>
            ${lesionsList || '<tr><td colspan="4" style="text-align: center; padding: 12px; color: #64748b;">Aucune lésion traumatique active constatée</td></tr>'}
          </tbody>
        </table>

        <div class="section-title">EXAMEN CLINIQUE D'URGENCE</div>
        <p><strong>État cutané (Cauchoix-Duparc) :</strong> ${safeEscapeHTML(cauchoix)}</p>
        <p><strong>Bilan vasculo-nerveux distal :</strong> ${safeEscapeHTML(neuroVasc)}</p>
        <p><strong>Surveillance syndrome des loges :</strong> ${safeEscapeHTML(loges)}</p>

        <div class="section-title">OBSERVATIONS & CONSIGNES</div>
        <p>${safeEscapeHTML(notes)}</p>

        <div style="margin-top: 40px; text-align: right;">
          <p>Signature et Cachet du Chirurgien :</p>
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 250);
}

// ========== HISTORIQUE ET TRAITEMENTS ==========

async function loadTraumatoTreatments(patientId) {
  if (!patientId || !window.api?.traumato?.getTreatments) return;
  try {
    const res = await window.api.traumato.getTreatments(patientId);
    // Peut être injecté dans un tableau d'actes si présent
  } catch (err) {
    console.warn('Could not load traumato treatments:', err);
  }
}

async function loadTraumatoHistoryCards(patientId) {
  const container = document.getElementById('traumato-patient-history-cards');
  if (!container) return;

  if (!patientId) {
    container.innerHTML = '<div style="padding: 12px; color: #64748b; font-size: 12.5px; text-align: center;">Sélectionnez un patient pour afficher son historique.</div>';
    return;
  }

  const affectedBones = Object.entries(traumatoLesionsData).filter(([code, l]) => l.status && l.status !== 'healthy');
  if (affectedBones.length === 0) {
    container.innerHTML = '<div style="padding: 12px; color: #64748b; font-size: 12.5px; text-align: center;">Aucune lésion active pour ce patient.</div>';
    return;
  }

  let html = '<div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">';
  affectedBones.forEach(([code, item]) => {
    const bone = BONE_DEFINITIONS[code] || { name: code };
    const st = LESION_STATUSES[item.status] || { label: item.status, color: '#f1f5f9', tc: '#334155' };
    html += `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid ${st.border}; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
        <div style="font-weight: 700; color: #0f172a;">${safeEscapeHTML(bone.name)}</div>
        <div style="color: ${st.tc}; font-weight: 600; font-size: 11px;">${st.badge} ${safeEscapeHTML(st.label)}</div>
        ${item.fractureClassification ? `<div style="color: #64748b; font-size: 11px;">Classification: ${safeEscapeHTML(item.fractureClassification)}</div>` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

// ========== EXPOSITION GLOBALE VIA LEGACY-BRIDGE ==========

registerLegacyGlobals('traumatology', {
  initTraumatology,
  selectTraumatoPatient,
  selectTraumatoPatientFromSearch,
  handleTraumatoPatientSearchInput,
  handleTraumatoPatientSearchFocus,
  clearTraumatoPatientSearch,
  refreshTraumatoPatientList,
  setTraumatoView,
  selectTraumatoBone,
  setTraumatoBoneStatus,
  saveCurrentBoneStatus,
  saveTraumatoClinicalRecord,
  printTraumatoReport,
  updateEvaDisplay,
  filterBoneCategory,
  toggleTraumatoQuickBar,
  toggleBoneGroup
});

// Polyfill window direct
if (typeof window !== 'undefined') {
  window.initTraumatology = initTraumatology;
  window.selectTraumatoPatient = selectTraumatoPatient;
  window.selectTraumatoPatientFromSearch = selectTraumatoPatientFromSearch;
  window.handleTraumatoPatientSearchInput = handleTraumatoPatientSearchInput;
  window.handleTraumatoPatientSearchFocus = handleTraumatoPatientSearchFocus;
  window.clearTraumatoPatientSearch = clearTraumatoPatientSearch;
  window.refreshTraumatoPatientList = refreshTraumatoPatientList;
  window.setTraumatoView = setTraumatoView;
  window.selectTraumatoBone = selectTraumatoBone;
  window.setTraumatoBoneStatus = setTraumatoBoneStatus;
  window.saveCurrentBoneStatus = saveCurrentBoneStatus;
  window.saveTraumatoClinicalRecord = saveTraumatoClinicalRecord;
  window.printTraumatoReport = printTraumatoReport;
  window.updateEvaDisplay = updateEvaDisplay;
  window.filterBoneCategory = filterBoneCategory;
  window.toggleTraumatoQuickBar = toggleTraumatoQuickBar;
  window.toggleBoneGroup = toggleBoneGroup;
}

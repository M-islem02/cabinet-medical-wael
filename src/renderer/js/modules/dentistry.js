import { registerLegacyGlobals, unregisterLegacyGlobals } from '../../core/legacy/legacy-bridge.js';
import {
  initDental3D,
  updateDental3DData,
  selectToothIn3D,
  setDental3DView,
  resetDental3DCamera,
  destroyDental3D,
  isDental3DInitialized
} from './dental-3d.js';

// ========== DENTISTRY MODULE ==========
// Professional dental chart with realistic curved mouth diagram
// Medical imaging integration (Radio, Scanner, Echo)

let dentalSelectedPatientId = null;
let dentalSelectedTooth = null;
let dentalTeethData = {};
let dentalCurrentTab = 'chart';
let currentDentalSchemaMode = '2d';
const DENTAL_LANGUAGE_KEY = 'medcareso_dental_language';
let currentDentalLanguage = 'fr';

function setDentalSchemaMode(mode) {
  const targetMode = mode === '3d' ? '3d' : '2d';
  currentDentalSchemaMode = targetMode;

  const btn2d = document.getElementById('btn-dental-mode-2d');
  const btn3d = document.getElementById('btn-dental-mode-3d');
  const toolbar3d = document.getElementById('dental-3d-toolbar');
  const svgEl = document.getElementById('dental-svg');
  const viewport3d = document.getElementById('dental-3d-viewport');

  if (btn2d && btn3d) {
    if (targetMode === '3d') {
      btn2d.style.background = 'transparent';
      btn2d.style.color = '#64748b';
      btn2d.style.boxShadow = 'none';
      btn2d.classList.remove('active');

      btn3d.style.background = '#ffffff';
      btn3d.style.color = '#0284c7';
      btn3d.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
      btn3d.classList.add('active');
    } else {
      btn2d.style.background = '#ffffff';
      btn2d.style.color = '#1e293b';
      btn2d.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
      btn2d.classList.add('active');

      btn3d.style.background = 'transparent';
      btn3d.style.color = '#64748b';
      btn3d.style.boxShadow = 'none';
      btn3d.classList.remove('active');
    }
  }

  if (toolbar3d) {
    toolbar3d.style.display = targetMode === '3d' ? 'flex' : 'none';
  }

  if (svgEl) {
    svgEl.style.display = targetMode === '3d' ? 'none' : 'block';
  }

  if (viewport3d) {
    viewport3d.style.display = targetMode === '3d' ? 'block' : 'none';
    if (targetMode === '3d') {
      if (!isDental3DInitialized()) {
        initDental3D(viewport3d, {
          onSelect: (num) => selectDentalTooth(num)
        });
      }
      updateDental3DData(dentalTeethData, dentalTreatmentsCache, dentalSelectedTooth);
      if (dentalSelectedTooth) {
        selectToothIn3D(dentalSelectedTooth);
      }
    }
  }
}
// Cache: toothNumber -> most recent treatment (for color overlay)
let dentalTreatmentsCache = {};
let dentalRealtimeWs = null;
let dentalHistoryNoteCache = {};
let dentalPatientHistoryItems = [];
let dentalPatientHistoryPage = 0;
let dentalSelectedHistoryDayKey = null;
let dentalHistoryDateFilter = '';
let dentalHistoricalTeethData = {};

// Treatment status → tooth color overlay
const TREATMENT_STATUS_COLORS = {
  completed:   { color: '#dcfce7', border: '#22c55e', tc: '#15803d' },
  in_progress: { color: '#dbeafe', border: '#3b82f6', tc: '#1d4ed8' },
  planned:     { color: '#ffedd5', border: '#f97316', tc: '#c2410c' },
  proposed:    { color: '#f3f4f6', border: '#9ca3af', tc: '#6b7280' },
  cancelled:   { color: '#fef2f2', border: '#fca5a5', tc: '#b91c1c' }
};

function getToothColorOverride(toothNumber) {
  const t = dentalTreatmentsCache[toothNumber];
  if (!t) return null;
  return TREATMENT_STATUS_COLORS[t.status] || null;
}

function dentalEscapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tooth numbering (FDI / ISO 3950)
const ADULT_TEETH = {
  18: 'Dent de sagesse sup. droite', 17: '2e molaire sup. droite', 16: '1re molaire sup. droite',
  15: '2e prémolaire sup. droite', 14: '1re prémolaire sup. droite', 13: 'Canine sup. droite',
  12: 'Incisive latérale sup. droite', 11: 'Incisive centrale sup. droite',
  21: 'Incisive centrale sup. gauche', 22: 'Incisive latérale sup. gauche', 23: 'Canine sup. gauche',
  24: '1re prémolaire sup. gauche', 25: '2e prémolaire sup. gauche', 26: '1re molaire sup. gauche',
  27: '2e molaire sup. gauche', 28: 'Dent de sagesse sup. gauche',
  38: 'Dent de sagesse inf. gauche', 37: '2e molaire inf. gauche', 36: '1re molaire inf. gauche',
  35: '2e prémolaire inf. gauche', 34: '1re prémolaire inf. gauche', 33: 'Canine inf. gauche',
  32: 'Incisive latérale inf. gauche', 31: 'Incisive centrale inf. gauche',
  41: 'Incisive centrale inf. droite', 42: 'Incisive latérale inf. droite', 43: 'Canine inf. droite',
  44: '1re prémolaire inf. droite', 45: '2e prémolaire inf. droite', 46: '1re molaire inf. droite',
  47: '2e molaire inf. droite', 48: 'Dent de sagesse inf. droite'
};

const TOOTH_STATUSES = {
  healthy:    { label: 'Saine',       color: '#e8f5e9', border: '#4caf50', tc: '#2e7d32' },
  cavity:     { label: 'Carie',       color: '#fff3e0', border: '#ff9800', tc: '#e65100' },
  filled:     { label: 'Obturée',     color: '#e3f2fd', border: '#2196f3', tc: '#1565c0' },
  crown:      { label: 'Couronne',    color: '#f3e5f5', border: '#9c27b0', tc: '#6a1b9a' },
  bridge:     { label: 'Bridge',      color: '#e8eaf6', border: '#3f51b5', tc: '#283593' },
  rootCanal:  { label: 'Dévitalisée', color: '#fce4ec', border: '#e91e63', tc: '#c62828' },
  extraction: { label: 'Extraite',    color: '#ffebee', border: '#f44336', tc: '#b71c1c' },
  implant:    { label: 'Implant',     color: '#e0f7fa', border: '#00bcd4', tc: '#00838f' },
  missing:    { label: 'Absente',     color: '#f5f5f5', border: '#9e9e9e', tc: '#616161' },
  fractured:  { label: 'Fracturée',   color: '#fff8e1', border: '#ffc107', tc: '#f57f17' },
  abscess:    { label: 'Abcès',       color: '#fbe9e7', border: '#ff5722', tc: '#bf360c' },
  impacted:   { label: 'Incluse',     color: '#efebe9', border: '#795548', tc: '#4e342e' },
  prosthesis: { label: 'Prothèse',    color: '#e1f5fe', border: '#03a9f4', tc: '#01579b' }
};

const TOOTH_STATUS_LABELS = {
  fr: {
    healthy: 'Saine', cavity: 'Carie', filled: 'Obturée', crown: 'Couronne', bridge: 'Bridge',
    rootCanal: 'Dévitalisée', extraction: 'Extraite', implant: 'Implant', missing: 'Absente',
    fractured: 'Fracturée', abscess: 'Abcès', impacted: 'Incluse', prosthesis: 'Prothèse'
  },
  en: {
    healthy: 'Saine', cavity: 'Carie', filled: 'Obturée', crown: 'Couronne', bridge: 'Bridge',
    rootCanal: 'Dévitalisée', extraction: 'Extraite', implant: 'Implant', missing: 'Absente',
    fractured: 'Fracturée', abscess: 'Abcès', impacted: 'Incluse', prosthesis: 'Prothèse'
  }
};

function getToothStatusLabel(key) {
  return TOOTH_STATUS_LABELS.fr[key] || TOOTH_STATUSES[key]?.label || key;
}

function applyDentalLanguageToUI() {
  const selector = document.getElementById('dental-language-selector');
  if (selector) selector.value = currentDentalLanguage;
}

function setDentalLanguage(language) {
  const normalized = language === 'en' ? 'en' : 'fr';
  currentDentalLanguage = normalized;
  localStorage.setItem(DENTAL_LANGUAGE_KEY, normalized);
  applyDentalLanguageToUI();
  renderDentalChart();
}

const TREATMENT_TYPES = [
  { value: 'checkup', label: 'Examen / Contrôle' },
  { value: 'cleaning', label: 'Détartrage' },
  { value: 'filling', label: 'Obturation (Plombage)' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'rootCanal', label: 'Traitement de canal' },
  { value: 'crown', label: 'Couronne' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'implant', label: 'Implant dentaire' },
  { value: 'veneer', label: 'Facette' },
  { value: 'whitening', label: 'Blanchiment' },
  { value: 'orthodontics', label: 'Orthodontie' },
  { value: 'surgery', label: 'Chirurgie' },
  { value: 'prosthesis', label: 'Prothèse' },
  { value: 'xray', label: 'Radiographie' },
  { value: 'note', label: 'Note clinique' },
  { value: 'other', label: 'Autre' }
];

const STATUS_TO_TREATMENT_TYPE = {
  healthy:    'checkup',
  cavity:     'checkup',
  filled:     'filling',
  crown:      'crown',
  bridge:     'bridge',
  rootCanal:  'rootCanal',
  extraction: 'extraction',
  implant:    'implant',
  missing:    'extraction',
  fractured:  'surgery',
  abscess:    'surgery',
  impacted:   'surgery',
  prosthesis: 'prosthesis'
};

// ========== REALISTIC CURVED TOOTH POSITIONS ==========
// Each tooth on a U-shaped parabolic arch like a real mouth

function getToothPositions() {
  const CX = 400;
  const upperCY = 165;
  const lowerCY = 335;
  const upperTeeth = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  const lowerTeeth = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  const N = 16;
  const upperRX = 300, upperRY = 130;
  const lowerRX = 270, lowerRY = 110;
  const positions = {};

  for (let i = 0; i < N; i++) {
    const angle = -82 + (164 * i / (N - 1));
    const rad = angle * Math.PI / 180;

    const idx = i;
    const isMolar = idx < 3 || idx > 12;
    const isPremolar = (idx >= 3 && idx <= 4) || (idx >= 11 && idx <= 12);
    const isCanine = (idx === 5 || idx === 10);
    const tw = isMolar ? 34 : isPremolar ? 28 : isCanine ? 24 : 22;
    const th = isMolar ? 38 : isPremolar ? 34 : isCanine ? 36 : 30;

    // Upper: teeth on convex side of arch (pointing down into mouth)
    const ux = CX + upperRX * Math.sin(rad);
    const uy = upperCY - upperRY * Math.cos(rad);
    const uAngle = angle * 0.3;
    positions[upperTeeth[i]] = { x: ux, y: uy, angle: uAngle, w: tw, h: th, jaw: 'upper' };

    // Lower: flipped arch
    const lx = CX + lowerRX * Math.sin(rad);
    const ly = lowerCY + lowerRY * Math.cos(rad);
    const lAngle = -angle * 0.3;
    positions[lowerTeeth[i]] = { x: lx, y: ly, angle: lAngle, w: tw, h: th, jaw: 'lower' };
  }
  return positions;
}

// ========== INIT ==========
async function initDentistry() {
  currentDentalLanguage = localStorage.getItem(DENTAL_LANGUAGE_KEY) === 'en' ? 'en' : 'fr';
  applyDentalLanguageToUI();
  if (typeof currentPatientId !== 'undefined' && currentPatientId) {
    dentalSelectedPatientId = currentPatientId;
  }
  await loadDentalPatientList();
  if (dentalSelectedPatientId) {
    await selectDentalPatient(dentalSelectedPatientId);
  }
  updateDentalStats();
  connectDentalRealtimeWs();
  renderDentalChart();
}

async function connectDentalRealtimeWs() {
  if (dentalRealtimeWs) return;
  try {
    const config = await window.api.realtime.getConfig();
    if (!config || !config.enabled) return;
    dentalRealtimeWs = new WebSocket(`ws://127.0.0.1:${config.port}?token=${config.token}`);
    dentalRealtimeWs.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!dentalSelectedPatientId) return;
        if (msg.type === 'dental:tooth-updated' || msg.type === 'dental:treatment-updated') {
          if (msg.patientId === dentalSelectedPatientId) {
            loadDentalTeeth(dentalSelectedPatientId).then(() => {
              renderDentalChart();
              if (dentalSelectedTooth) {
                showToothDetail(dentalSelectedTooth);
              }
            });
            loadDentalTreatmentColors(dentalSelectedPatientId);
            loadDentalPatientHistoryCards(dentalSelectedPatientId);
          }
        }
      } catch (_) {}
    });
    dentalRealtimeWs.addEventListener('close', () => { dentalRealtimeWs = null; });
  } catch (e) { console.warn('Dental WS not available:', e.message); }
}

let allDentalPatients = [];

function toggleDentalFdiGuide() {
  const card = document.getElementById('dental-fdi-guide-card');
  const btn = document.getElementById('btn-dental-fdi-guide');
  if (!card) return;
  const isShown = card.style.display !== 'none';
  card.style.display = isShown ? 'none' : 'block';
  if (btn) {
    btn.style.background = isShown ? '' : '#e2e8f0';
  }
}

function renderDentalPatientSelectorOptions(patients) {
  const select = document.getElementById('dental-patient-selector');
  if (!select) return;
  select.innerHTML = '<option value="">-- Sélectionner un patient --</option>';
  patients.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const phoneInfo = p.phone ? ' (' + p.phone + ')' : '';
    opt.textContent = p.lastName + ' ' + p.firstName + phoneInfo;
    if (p.id === dentalSelectedPatientId) opt.selected = true;
    select.appendChild(opt);
  });
}

function filterDentalPatientList(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    renderDentalPatientSelectorOptions(allDentalPatients);
    return;
  }
  const filtered = allDentalPatients.filter(p => {
    const name1 = ((p.lastName || '') + ' ' + (p.firstName || '')).toLowerCase();
    const name2 = ((p.firstName || '') + ' ' + (p.lastName || '')).toLowerCase();
    const phone = String(p.phone || '').toLowerCase();
    return name1.includes(q) || name2.includes(q) || phone.includes(q);
  });
  renderDentalPatientSelectorOptions(filtered);
  if (filtered.length === 1 && filtered[0].id !== dentalSelectedPatientId) {
    selectDentalPatient(filtered[0].id);
  }
}

async function loadDentalPatientList() {
  try {
    const result = await window.api.patient.getAll();
    allDentalPatients = (result.success && Array.isArray(result.data)) ? result.data : [];
    renderDentalPatientSelectorOptions(allDentalPatients);
  } catch (e) { console.error('Error loading dental patients:', e); }
}

async function selectDentalPatient(patientId) {
  dentalSelectedPatientId = patientId;
  dentalSelectedTooth = null;
  const display = document.getElementById('dental-current-patient-display');
  updateDentalPatientActionState();
  if (!patientId) {
    if (display) display.textContent = 'Aucun patient sélectionné';
    dentalTeethData = {};
    dentalTreatmentsCache = {};
    loadDentalPatientHistoryCards(null);
    renderDentalChart();
    return;
  }
  try {
    const res = await window.api.patient.getById(patientId);
    if (res.success && res.data) {
      if (display) display.textContent = res.data.lastName + ' ' + res.data.firstName;
      if (typeof window.setSelectedPatient === 'function') {
        await window.setSelectedPatient(patientId, { patient: res.data, source: 'dentistry' });
      }
    }
    updateDentalPatientActionState();
    await loadDentalTeeth(patientId);
    await loadDentalTreatmentColors(patientId);
    renderDentalChart();
    await loadDentalPatientHistoryCards(patientId);
    await updatePatientDentalStats(patientId);
    if (dentalCurrentTab === 'treatments') await loadDentalTreatments(patientId);
    if (dentalCurrentTab === 'plans') await loadDentalPlans(patientId);
  } catch (e) { console.error('Error selecting dental patient:', e); }
}

async function loadDentalTreatmentColors(patientId) {
  try {
    const result = await window.api.dental.getTreatmentsByPatient(patientId);
    if (result.success) dentalTreatmentsCache = result.data || {};
  } catch (e) { console.warn('Treatment color load failed:', e); }
}

function refreshDentalPatientList() { loadDentalPatientList(); }

function updateDentalPatientActionState() {
  ['dental-open-dossier-btn', 'dental-import-image-btn'].forEach(function(id) {
    var button = document.getElementById(id);
    if (button) button.disabled = !dentalSelectedPatientId;
  });
}

function openDentalPatientForm() {
  if (typeof showPatientForm === 'function') {
    showPatientForm();
  }
}

function openDentalPatientDossier() {
  if (!dentalSelectedPatientId) {
    showNotification('Sélectionnez un patient', 'warning');
    return;
  }
  if (typeof showPatientDetails === 'function') {
    showPatientDetails(dentalSelectedPatientId);
  }
}

// ========== LOAD TEETH ==========
async function loadDentalTeeth(patientId) {
  dentalTeethData = {};
  try {
    const result = await window.api.dental.getTeeth(patientId);
    if (result.success && result.data) {
      result.data.forEach(t => { dentalTeethData[t.toothNumber] = t; });
    }
  } catch (e) { console.error('Error loading teeth:', e); }
}

function getDentalNotesEmptyHTML() {
  return '<div class="card" style="padding: 12px; border: 1px dashed rgba(148, 163, 184, 0.35); border-radius: 10px; background: #fafcff; display: flex; align-items: center; justify-content: center; min-height: 70px; color: #64748b; font-size: 13px; font-weight: 500; margin-top: 8px;">' +
         'Sélectionnez une dent du schéma pour afficher ou modifier ses notes cliniques.' +
         '</div>';
}

function getDentalStatusGridHTML(toothNumber, status, disabled) {
  return '<div class="dental-status-grid' + (disabled ? ' dental-status-grid-disabled' : '') + '">' +
    Object.entries(TOOTH_STATUSES).map(function(e) {
      var k = e[0], s = e[1];
      var isActive = !disabled && k === status;
      var clickAttr = disabled ? '' : ' onclick="changeToothStatus(' + toothNumber + ',\'' + k + '\')"';
      return '<button' + clickAttr + (disabled ? ' disabled' : '') + ' style="border-color:' + s.border + ';background:' + (isActive ? s.border : s.color) + ';color:' + (isActive ? '#fff' : s.tc) + ';display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:8px;font-size:12px;">' +
             '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + (isActive ? '#ffffff' : s.border) + ';flex-shrink:0;"></span>' +
             '<span class="dental-status-label" style="font-weight:600;">' + getToothStatusLabel(k) + '</span>' +
             '</button>';
    }).join('') +
    '</div>';
}

function getDentalDetailEmptyHTML() {
  return '<div class="dental-detail-head dental-detail-head-empty">' +
    '<div><span>Fiche clinique</span><h3>Choisir une dent</h3><p>Les actions seront disponibles après sélection sur le schéma.</p></div>' +
    '</div>' +
    '<div class="dental-current-status dental-current-status-empty">' +
    '<strong>État actuel</strong><span>Aucune dent sélectionnée</span>' +
    '</div>' +
    '<div class="dental-field-block"><label>Changer l\'état</label>' +
    getDentalStatusGridHTML(null, 'healthy', true) +
    '</div>';
}

function renderDentalChart() {
  const container = document.getElementById('dental-chart-container');
  if (!container) return;

  const positions = getToothPositions();
  const is3D = currentDentalSchemaMode === '3d';

  const svgEl = document.getElementById('dental-svg');
  const viewport3d = document.getElementById('dental-3d-viewport');
  const teethLayer = document.getElementById('dental-teeth-layer');

  // If workspace already exists in DOM, update in-place to avoid tearing down WebGL canvas
  if (svgEl && viewport3d && teethLayer) {
    svgEl.style.display = is3D ? 'none' : 'block';
    viewport3d.style.display = is3D ? 'block' : 'none';

    // Update 2D SVG layer in-place
    teethLayer.innerHTML = renderAllTeeth(positions);

    // Update 3D viewport in-place (preserves camera orbit angle and zoom)
    if (isDental3DInitialized()) {
      updateDental3DData(dentalTeethData, dentalTreatmentsCache, dentalSelectedTooth);
      if (dentalSelectedTooth) {
        selectToothIn3D(dentalSelectedTooth);
      }
    } else if (is3D) {
      initDental3D(viewport3d, {
        onSelect: (num) => selectDentalTooth(num)
      });
      updateDental3DData(dentalTeethData, dentalTreatmentsCache, dentalSelectedTooth);
    }
    return;
  }

  container.innerHTML =
    '<div class="dental-workspace">' +
    '<div class="dental-chart-main">' +

    '<svg id="dental-svg" class="dental-svg" viewBox="0 0 800 500" style="' + (is3D ? 'display:none;' : '') + '">' +
    '<defs>' +
    '<filter id="tSh" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(15,23,42,0.18)"/></filter>' +
    '<linearGradient id="gU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffdce4"/><stop offset="52%" stop-color="#f8b7c4"/><stop offset="100%" stop-color="#f09cac"/></linearGradient>' +
    '<linearGradient id="gL" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#ffdce4"/><stop offset="52%" stop-color="#f8b7c4"/><stop offset="100%" stop-color="#f09cac"/></linearGradient>' +
    '</defs>' +

    // D/G markers
    '<text x="55" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">D</text>' +
    '<text x="745" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">G</text>' +

    // Center line
    '<line x1="400" y1="28" x2="400" y2="480" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="5,4" opacity="0.4"/>' +

    // Upper gum arch (U-shape, realistic pink)
    '<path d="M 90,165 Q 110,28 400,18 Q 690,28 710,165" fill="url(#gU)" stroke="#d4818f" stroke-width="1.2" opacity="0.22"/>' +

    // Lower gum arch (inverted U)
    '<path d="M 120,335 Q 140,468 400,478 Q 660,468 680,335" fill="url(#gL)" stroke="#d4818f" stroke-width="1.2" opacity="0.22"/>' +

    // Gum line separators
    '<path d="M 90,195 Q 250,210 400,214 Q 550,210 710,195" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +
    '<path d="M 120,305 Q 260,292 400,288 Q 540,292 680,305" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +

    // Teeth layer
    '<g id="dental-teeth-layer">' +
    renderAllTeeth(positions) +
    '</g>' +

    '</svg>' +

    '<div id="dental-3d-viewport" style="' + (is3D ? 'display:block;' : 'display:none;') + ' width:100%; height:500px; position:relative; border-radius:8px; overflow:hidden; background:radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%);"></div>' +

    '<div id="dental-chart-notes-container">' + getDentalNotesEmptyHTML() + '</div>' +
    '</div>' +
    '<aside id="dental-tooth-detail" class="dental-detail-panel">' +
      getDentalDetailEmptyHTML() +
    '</aside>' +
    '</div>';

  if (is3D) {
    const viewport3d = document.getElementById('dental-3d-viewport');
    if (viewport3d) {
      initDental3D(viewport3d, {
        onSelect: (num) => selectDentalTooth(num)
      });
      updateDental3DData(dentalTeethData, dentalTreatmentsCache, dentalSelectedTooth);
    }
  }
}

function renderAllTeeth(positions) {
  // Draw order: back teeth first, front teeth on top
  var upperOrder = [18,17,16,15,14,28,27,26,25,24,13,12,23,22,11,21];
  var lowerOrder = [48,47,46,45,44,38,37,36,35,34,43,42,33,32,41,31];
  var order = upperOrder.concat(lowerOrder);
  var svg = '';
  for (var i = 0; i < order.length; i++) {
    var num = order[i];
    var pos = positions[num];
    if (pos) svg += renderOneTooth(num, pos);
  }
  return svg;
}

function renderOneTooth(num, pos) {
  var data = dentalTeethData[num];
  var status = data ? data.status : 'healthy';
  var si = TOOTH_STATUSES[status] || TOOTH_STATUSES.healthy;
  // Apply treatment color overlay (C3)
  var colorOverride = getToothColorOverride(num);
  if (colorOverride) si = Object.assign({}, si, colorOverride);
  var sel = dentalSelectedTooth === num;
  var gone = (status === 'extraction' || status === 'missing');

  var isMolar = [18,17,16,28,27,26,38,37,36,48,47,46].indexOf(num) >= 0;
  var isPremolar = [15,14,25,24,35,34,45,44].indexOf(num) >= 0;
  var isCanine = [13,23,33,43].indexOf(num) >= 0;

  var hw = pos.w / 2, hh = pos.h / 2;
  var rootLen = isMolar ? 20 : isPremolar ? 16 : isCanine ? 20 : 14;
  var rd = pos.jaw === 'upper' ? -1 : 1;
  var ry = rd === -1 ? -hh : hh;

  // Roots
  var roots = '';
  if (!gone) {
    if (isMolar) {
      roots = '<line x1="-7" y1="' + ry + '" x2="-9" y2="' + (ry + rd * rootLen) + '" stroke="#c9a87c" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>' +
              '<line x1="0" y1="' + ry + '" x2="0" y2="' + (ry + rd * (rootLen + 3)) + '" stroke="#c9a87c" stroke-width="2" stroke-linecap="round" opacity="0.45"/>' +
              '<line x1="7" y1="' + ry + '" x2="9" y2="' + (ry + rd * rootLen) + '" stroke="#c9a87c" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>';
    } else if (isPremolar) {
      roots = '<line x1="-4" y1="' + ry + '" x2="-5" y2="' + (ry + rd * rootLen) + '" stroke="#c9a87c" stroke-width="2" stroke-linecap="round" opacity="0.5"/>' +
              '<line x1="4" y1="' + ry + '" x2="5" y2="' + (ry + rd * rootLen) + '" stroke="#c9a87c" stroke-width="2" stroke-linecap="round" opacity="0.5"/>';
    } else {
      roots = '<line x1="0" y1="' + ry + '" x2="0" y2="' + (ry + rd * rootLen) + '" stroke="#c9a87c" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>';
    }
  }

  // Crown shape
  var rx = isMolar ? 5 : isPremolar ? 4 : 3;
  var dash = gone ? ' stroke-dasharray="4,3"' : '';
  var opa = gone ? ' opacity="0.45"' : '';

  // Surface cross for molars/premolars
  var surf = '';
  if ((isMolar || isPremolar) && !gone) {
    surf = '<line x1="' + (-hw) + '" y1="0" x2="' + hw + '" y2="0" stroke="' + si.border + '" stroke-width="0.4" opacity="0.2"/>' +
           '<line x1="0" y1="' + (-hh) + '" x2="0" y2="' + hh + '" stroke="' + si.border + '" stroke-width="0.4" opacity="0.2"/>';
  }

  // Status indicator (clean geometrical SVG marker, no emojis)
  var icon = '';
  if (status !== 'healthy') {
    if (gone) {
      icon = '<line x1="-5" y1="-5" x2="5" y2="5" stroke="' + si.tc + '" stroke-width="1.8"/><line x1="5" y1="-5" x2="-5" y2="5" stroke="' + si.tc + '" stroke-width="1.8"/>';
    } else {
      icon = '<circle cx="0" cy="0" r="3.2" fill="' + si.tc + '"/>';
    }
  }

  // Number label
  var ny = pos.jaw === 'upper' ? (hh + 14) : (-hh - 6);

  return '<g class="tooth-g' + (sel ? ' sel' : '') + '" transform="translate(' + pos.x + ',' + pos.y + ') rotate(' + pos.angle + ')" onclick="selectDentalTooth(' + num + ')" filter="url(#tSh)">' +
     roots +
     '<rect class="tb" x="' + (-hw) + '" y="' + (-hh) + '" width="' + pos.w + '" height="' + pos.h + '" rx="' + rx + '" ry="' + rx + '" fill="' + si.color + '" stroke="' + (sel ? '#1d4ed8' : si.border) + '" stroke-width="' + (sel ? 2.5 : 1.5) + '"' + dash + opa + '/>' +
     '<rect x="' + (-hw + 3) + '" y="' + (-hh + 3) + '" width="' + Math.max(4, pos.w - 6) + '" height="' + Math.max(4, pos.h * 0.34) + '" rx="' + Math.max(2, rx - 1) + '" ry="' + Math.max(2, rx - 1) + '" fill="#ffffff" opacity="' + (gone ? 0.12 : 0.38) + '"/>' +
     surf + icon +
     '<text x="0" y="' + ny + '" text-anchor="middle" font-size="11" fill="' + (sel ? '#1d4ed8' : '#6b7280') + '" font-weight="' + (sel ? '700' : '600') + '">' + num + '</text>' +
     '</g>';
}

// ========== TOOTH SELECTION ==========
function selectDentalTooth(toothNumber) {
  if (!dentalSelectedPatientId) {
    showNotification('Sélectionnez d\'abord un patient', 'warning');
    return;
  }
  if (dentalSelectedHistoryDayKey) {
    openDentalPatientHistoryDayWindow(dentalSelectedHistoryDayKey, toothNumber);
    return;
  }
  dentalSelectedTooth = toothNumber;
  if (isDental3DInitialized()) {
    selectToothIn3D(toothNumber);
  }
  renderDentalChart();
  showToothDetail(toothNumber);
}

function showToothDetail(toothNumber) {
  var panel = document.getElementById('dental-tooth-detail');
  if (!panel) return;
  var data = dentalTeethData[toothNumber];
  var status = data ? data.status : 'healthy';
  var si = TOOTH_STATUSES[status] || TOOTH_STATUSES.healthy;
  var name = ADULT_TEETH[toothNumber] || ('Dent ' + toothNumber);

  // 1. Render status options on the right sidebar
  panel.innerHTML =
    '<div class="dental-detail-head">' +
    '<div><span>Fiche clinique</span><h3>Dent N° ' + toothNumber + '</h3><p>' + name + '</p></div>' +
    '<button onclick="closeDentalDetail()" class="dental-detail-close">×</button></div>' +
    '<div class="dental-current-status" style="background:' + si.color + ';border-color:' + si.border + ';color:' + si.tc + ';display:flex;align-items:center;gap:8px;">' +
    '<strong>État actuel</strong><span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + si.border + ';"></span>' + getToothStatusLabel(status) + '</span></div>' +
    '<div class="dental-field-block"><label>Changer l\'état</label>' +
    getDentalStatusGridHTML(toothNumber, status, false) +
    '</div>';

  // 2. Render notes textarea directly under the schema
  var notesContainer = document.getElementById('dental-chart-notes-container');
  if (notesContainer) {
    notesContainer.innerHTML =
      '<div class="card" style="padding: 16px; border: 1px solid #d8e3ef; border-radius: 16px; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);">' +
      '  <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px;">' +
      '    <h4 style="margin: 0; font-size: 20px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 10px;">' +
      '      <span style="display: inline-block; width: 8px; height: 24px; background: #2563eb; border-radius: 99px;"></span>' +
      '      Notes cliniques — Dent N° ' + toothNumber +
      '    </h4>' +
      '    <button onclick="saveToothNotes(' + toothNumber + ')" class="btn btn-primary" style="height: 46px; padding: 0 22px; font-size: 15px; font-weight: 800; margin: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; white-space: nowrap;">' +
      '      Sauvegarder la note' +
      '    </button>' +
      '  </div>' +
      '  <textarea id="dental-tooth-notes" rows="4" class="form-control" placeholder="Saisir une nouvelle note clinique pour la dent ' + toothNumber + '..." style="width: 100%; min-height: 105px; font-size: 17px; line-height: 1.5; padding: 14px 16px; resize: vertical; margin-bottom: 0; border-radius: 14px; border: 1px solid #cbd5e1; color: #111827; background: #fff;">' + (data && data.notes ? data.notes : '') + '</textarea>' +
      '</div>';
  }
}

function closeDentalDetail() {
  var panel = document.getElementById('dental-tooth-detail');
  if (panel) {
    panel.innerHTML = getDentalDetailEmptyHTML();
  }
  var notesContainer = document.getElementById('dental-chart-notes-container');
  if (notesContainer) {
    notesContainer.innerHTML = getDentalNotesEmptyHTML();
  }
  dentalSelectedTooth = null;
  if (isDental3DInitialized()) {
    selectToothIn3D(null);
  }
  renderDentalChart();
}

async function changeToothStatus(toothNumber, newStatus) {
  if (!dentalSelectedPatientId) {
    showNotification('Sélectionnez d\'abord un patient', 'warning');
    return;
  }
  // Read what the user has typed in the notes textarea BEFORE any re-render wipes it
  var notesEl = document.getElementById('dental-tooth-notes');
  var notesVal = notesEl ? notesEl.value
    : (dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].notes || '') : '');
  try {
    var toothName = ADULT_TEETH[toothNumber] || ('Dent ' + toothNumber);
    await window.api.dental.saveTooth({
      patientId: dentalSelectedPatientId,
      toothNumber: toothNumber,
      toothName: toothName,
      status: newStatus,
      surfaces: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].surfaces || '') : '',
      notes: notesVal
    });
    if (!dentalTeethData[toothNumber]) dentalTeethData[toothNumber] = {};
    dentalTeethData[toothNumber].status = newStatus;
    dentalTeethData[toothNumber].notes = notesVal;

    // Automatically record edit in patient daily history
    var statusLabel = getToothStatusLabel(newStatus);
    var tType = STATUS_TO_TREATMENT_TYPE[newStatus] || 'other';
    try {
      await window.api.dental.createTreatment({
        patientId: dentalSelectedPatientId,
        toothNumber: toothNumber,
        treatmentDate: new Date().toISOString(),
        treatmentType: tType,
        description: toothName + ' : ' + statusLabel,
        surfaces: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].surfaces || '') : '',
        cost: 0,
        status: 'completed',
        notes: notesVal || ''
      });
    } catch (histErr) {
      console.warn('Auto treatment history log notice:', histErr);
    }

    // Instantly update both 2D SVG and 3D WebGL scenes
    renderDentalChart();
    if (isDental3DInitialized()) {
      updateDental3DData(dentalTeethData, dentalTreatmentsCache, dentalSelectedTooth);
      selectToothIn3D(dentalSelectedTooth);
    }
    // Repopulate the right-side panel for the same tooth (status badge + buttons)
    showToothDetail(toothNumber);

    var restoredEl = document.getElementById('dental-tooth-notes');
    if (restoredEl && notesVal) restoredEl.value = notesVal;
    
    // Automatically refresh history cards so the day's record appears immediately
    await loadDentalPatientHistoryCards(dentalSelectedPatientId);

    showNotification('Dent ' + toothNumber + ' : ' + statusLabel, 'success');
  } catch (e) {
    console.error('Error changing tooth status:', e);
    showNotification('Erreur lors de la mise à jour', 'error');
  }
}

async function saveToothNotes(toothNumber) {
  if (!dentalSelectedPatientId) {
    showNotification('Sélectionnez d\'abord un patient', 'warning');
    return;
  }
  var notesEl = document.getElementById('dental-tooth-notes');
  var notes = notesEl ? notesEl.value : '';
  if (!notes.trim()) {
    showNotification('Veuillez saisir une note', 'warning');
    return;
  }
  // Build full datetime string: DD/MM/YYYY à HH:MM
  var now = new Date();
  var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
  var dateLabel = pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() +
                  ' à ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  try {
    // 1. Save the note to dental_teeth
    var saveRes = await window.api.dental.saveTooth({
      patientId: dentalSelectedPatientId,
      toothNumber: toothNumber,
      toothName: ADULT_TEETH[toothNumber] || ('Dent ' + toothNumber),
      status: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].status || 'healthy') : 'healthy',
      surfaces: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].surfaces || '') : '',
      notes: ''
    });
    if (saveRes && saveRes.success === false) throw new Error(saveRes.error || 'Erreur saveTooth');

    // 2. Append a history entry in dental_treatments
    var treatRes = await window.api.dental.createTreatment({
      patientId: dentalSelectedPatientId,
      toothNumber: toothNumber,
      treatmentDate: now.toISOString(),
      treatmentType: 'note',
      description: notes, // No need to duplicate dateLabel, viewToothHistory already shows datetime
      surfaces: '', // Explicit empty string to prevent SQLite undefined parameter error
      cost: 0,
      status: 'completed',
      notes: ''
    });
    if (treatRes && treatRes.success === false) throw new Error(treatRes.error || 'Erreur createTreatment');

    // 3. Render the input note empty so it's ready for the next one
    if (notesEl) {
      notesEl.value = '';
      notesEl.blur();
      notesEl.focus();
    }
    
    // Clear local cache so it doesn't prefill next time we click the tooth
    if (!dentalTeethData[toothNumber]) dentalTeethData[toothNumber] = {};
    dentalTeethData[toothNumber].notes = '';
    await loadDentalPatientHistoryCards(dentalSelectedPatientId);

    showNotification('Note enregistrée dans l\'historique', 'success');
  } catch (e) {
    console.error('Error saving notes:', e);
    showNotification('Erreur lors de la sauvegarde : ' + (e.message || ''), 'error');
  }
}

// ========== MEDICAL IMAGING ==========
async function importDentalImage(type, toothNumber) {
  if (!dentalSelectedPatientId) { showNotification('Sélectionnez d\'abord un patient', 'error'); return; }
  var labels = { radio: 'Radiographie', scanner: 'Scanner CBCT', echo: 'Échographie', photo: 'Photo Intra-Orale', image: 'Image Médicale' };
  var input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,.dcm,.dicom,.nii,.nii.gz,.pdf';
  input.onchange = async function(e) {
    var files = Array.from(e.target.files);
    if (files.length === 0) return;
    var count = 0;
    for (var i = 0; i < files.length; i++) {
      try {
        var file = files[i];
        var base64 = await new Promise(function(resolve, reject) {
          var reader = new FileReader();
          reader.onload = function() { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        var att = await window.api.file.saveAttachment({ name: file.name, data: base64, type: file.type || 'application/octet-stream' });
        if (att.success) {
          await window.api.dental.createXray({
            patientId: dentalSelectedPatientId,
            toothNumber: toothNumber || null,
            type: type,
            filePath: att.path,
            description: labels[type] + ' - ' + file.name,
            xrayDate: new Date().toISOString().split('T')[0]
          });
          count++;
        }
      } catch (err) { console.error('Error importing image:', err); }
    }
    if (count > 0) showNotification(count + ' image(s) importée(s)', 'success');
    else showNotification('Erreur lors de l\'importation', 'error');
  };
  input.click();
}

async function viewDentalGallery() {
  if (!dentalSelectedPatientId) { showNotification('Sélectionnez d\'abord un patient', 'error'); return; }
  try {
    var result = await window.api.dental.getXrays(dentalSelectedPatientId);
    var images = (result.success && result.data) ? result.data : [];
    var icons = { radio: '📡', scanner: '🖥️', echo: '📺', photo: '📷', image: '📎' };
    var labels = { radio: 'Radio', scanner: 'Scanner', echo: 'Écho', photo: 'Photo', image: 'Image' };
    var html = '<div id="dental-gallery-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px">' +
      '<div style="background:#fff;border-radius:16px;padding:30px;width:90%;max-width:900px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h3 style="margin:0">Galerie d\'imagerie</h3>' +
      '<button onclick="document.getElementById(\'dental-gallery-modal\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button></div>';

    if (images.length === 0) {
      html += '<div style="text-align:center;padding:60px;color:#9ca3af"><p style="font-size:48px">🖼️</p><p>Aucune image médicale</p></div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">';
      for (var i = 0; i < images.length; i++) {
        var img = images[i];
        var fp = img.filePath ? img.filePath.replace(/'/g, "\\'") : '';
        html += '<div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#f9fafb">' +
          '<div style="height:160px;background:#1e293b;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="openImageViewer(\'' + fp + '\')">' +
          '<img src="file://' + img.filePath + '" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display=\'none\'"/></div>' +
          '<div style="padding:10px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:11px;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:10px;font-weight:600">' + (icons[img.type] || '📁') + ' ' + (labels[img.type] || img.type) + '</span>' +
          (img.toothNumber ? '<span style="font-size:11px;color:#6b7280">Dent ' + img.toothNumber + '</span>' : '') + '</div>' +
          '<p style="margin:6px 0 0;font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (img.description || '') + '</p>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
          '<span style="font-size:10px;color:#9ca3af">' + formatDate(img.xrayDate) + '</span>' +
          '<button onclick="deleteDentalXray(\'' + img.id + '\')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px" title="Supprimer">🗑️</button></div></div></div>';
      }
      html += '</div>';
    }
    html += '</div></div>';

    var existing = document.getElementById('dental-gallery-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) {
    console.error('Error loading gallery:', e);
    showNotification('Erreur galerie', 'error');
  }
}

function openImageViewer(filePath) {
  if (!filePath) return;
  var fileName = String(filePath).split(/[\\/]/).pop() || 'Imagerie';
  if (typeof viewFile === 'function') {
    viewFile(filePath, fileName);
  }
}

async function deleteDentalXray(xrayId) {
  if (!confirm('Supprimer cette image ?')) return;
  try {
    await window.api.dental.deleteXray(xrayId);
    showNotification('Image supprimée', 'success');
    viewDentalGallery();
  } catch (e) { showNotification('Erreur', 'error'); }
}

// ========== TABS ==========
function switchDentalTab(tabName) {
  dentalCurrentTab = tabName;
  document.querySelectorAll('.dental-tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.dental-tab-content').forEach(function(c) { c.style.display = 'none'; });
  var target = document.getElementById('dental-tab-' + tabName);
  if (target) target.style.display = 'block';
  if (tabName === 'chart') renderDentalChart();
}

// ========== TREATMENTS ==========
async function loadDentalTreatments(patientId) {
  var container = document.getElementById('dental-treatments-list');
  if (!container) return;
  if (!patientId) { container.innerHTML = '<div class="dental-empty-state"><h4>Sélectionnez un patient</h4><p>Les actes dentaires du dossier apparaîtront ici.</p></div>'; return; }
  try {
    var result = await window.api.dental.getTreatments(patientId);
    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = '<div class="dental-empty-state"><h4>Aucun traitement enregistré</h4><p>Ajoutez un premier acte pour commencer le suivi clinique.</p></div>';
      return;
    }
    var rows = '';
    for (var i = 0; i < result.data.length; i++) {
      var t = result.data[i];
      var ti = TREATMENT_TYPES.find(function(tt) { return tt.value === t.treatmentType; }) || { label: t.treatmentType || 'Acte', icon: '' };
      var isPaid = (t.paid || 0) >= (t.cost || 0);
      rows += '<tr class="dental-treatment-row">' +
        '<td>' + formatDate(t.treatmentDate) + '</td>' +
        '<td class="dental-treatment-tooth">' + (t.toothNumber || '—') + '</td>' +
        '<td>' + ti.label + '</td>' +
        '<td class="dental-treatment-description">' + (t.description || '—') + '</td>' +
        '<td class="dental-treatment-cost">' + (t.cost || 0).toLocaleString() + ' DA</td>' +
        '<td class="dental-treatment-status-cell"><span class="dental-payment-badge ' + (isPaid ? 'paid' : 'pending') + '">' + (isPaid ? '✓ Payé' : 'Non réglé: ' + (t.paid || 0).toLocaleString() + ' DA') + '</span></td>' +
        '<td class="dental-treatment-actions">' +
        (isPaid ? '' : '<button class="btn btn-tiny dental-inline-btn-success" onclick="payDentalTreatmentFromChart(\'' + t.id + '\',' + (t.cost || 0) + ',' + (t.paid || 0) + ')" title="Payer">Paiement</button>') +
        '<button class="btn btn-tiny dental-inline-btn-danger" onclick="deleteDentalTreatment(\'' + t.id + '\')" title="Supprimer">Supprimer</button></td></tr>';
    }
    container.innerHTML = '<div class="dental-table-shell"><table class="dental-treatment-table"><thead><tr>' +
      '<th>Date</th>' +
      '<th>Dent</th>' +
      '<th>Type</th>' +
      '<th>Description</th>' +
      '<th>Coût</th>' +
      '<th>Statut</th>' +
      '<th>Actions</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch (e) {
    console.error('Error loading treatments:', e);
    container.innerHTML = '<p style="color:red">Erreur de chargement</p>';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch (e) { return dateStr; }
}

function formatDentalDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return dateStr;
  }
}

function getDentalDayKey(dateStr) {
  if (!dateStr) return 'sans-date';
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  } catch (e) {
    return String(dateStr).slice(0, 10);
  }
}

function formatDentalDayLabel(dayKey) {
  if (!dayKey || dayKey === 'sans-date') return 'Sans date';
  try {
    var parts = dayKey.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var todayKey = getDentalDayKey(new Date().toISOString());
    var label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return dayKey === todayKey ? 'Aujourd’hui - ' + label : label;
  } catch (e) {
    return dayKey;
  }
}

function getDentalHistoryDayGroups() {
  var groupsByKey = {};
  dentalPatientHistoryItems.filter(function(item) {
    return !dentalHistoryDateFilter || getDentalDayKey(item.treatmentDate) === dentalHistoryDateFilter;
  }).forEach(function(item) {
    var key = getDentalDayKey(item.treatmentDate);
    if (!groupsByKey[key]) {
      groupsByKey[key] = {
        key: key,
        dayLabel: formatDentalDayLabel(key),
        latestDate: item.treatmentDate || '',
        items: [],
        teeth: []
      };
    }
    groupsByKey[key].items.push(item);
    if (item.toothNumber && groupsByKey[key].teeth.indexOf(item.toothNumber) === -1) {
      groupsByKey[key].teeth.push(item.toothNumber);
    }
    if (new Date(item.treatmentDate || 0) > new Date(groupsByKey[key].latestDate || 0)) {
      groupsByKey[key].latestDate = item.treatmentDate || '';
    }
  });
  return Object.values(groupsByKey).sort(function(a, b) {
    return new Date(b.latestDate || 0) - new Date(a.latestDate || 0);
  });
}

async function loadDentalPatientHistoryCards(patientId) {
  var container = document.getElementById('dental-patient-history-cards');
  if (!container) return;
  if (!patientId) {
    dentalPatientHistoryItems = [];
    dentalPatientHistoryPage = 0;
    dentalSelectedHistoryDayKey = null;
    container.className = 'dental-history-cards-empty';
    container.textContent = 'Sélectionnez un malade pour voir l\'historique.';
    return;
  }
  container.className = 'dental-history-cards-empty';
  container.textContent = 'Chargement historique...';
  try {
    var result = await window.api.dental.getTreatments(patientId);
    dentalPatientHistoryItems = result.success ? (result.data || []) : [];
    dentalPatientHistoryPage = 0;
    dentalSelectedHistoryDayKey = null;
    renderDentalPatientHistoryCards();
  } catch (e) {
    console.error('Error loading dental patient history cards:', e);
    container.className = 'dental-history-cards-empty';
    container.textContent = 'Impossible de charger l\'historique.';
  }
}

function renderDentalPatientHistoryCards() {
  var container = document.getElementById('dental-patient-history-cards');
  if (!container) return;
  if (!dentalSelectedPatientId) {
    container.className = 'dental-history-cards-empty';
    container.textContent = 'Sélectionnez un malade pour voir l\'historique.';
    return;
  }
  var groups = getDentalHistoryDayGroups();
  if (!groups.length) {
    container.className = 'dental-history-cards-empty';
    container.textContent = dentalHistoryDateFilter ? 'Aucun historique pour cette date.' : 'Aucun historique pour ce malade.';
    return;
  }

  var pageSize = 4;
  var totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  dentalPatientHistoryPage = Math.min(Math.max(0, dentalPatientHistoryPage), totalPages - 1);
  var start = dentalPatientHistoryPage * pageSize;
  var pageItems = groups.slice(start, start + pageSize);
  var cards = pageItems.map(function(group) {
    return '<button type="button" class="dental-history-card' + (dentalSelectedHistoryDayKey === group.key ? ' is-active' : '') + '" onclick="showDentalHistoricalSchema(\'' + dentalEscapeHtml(group.key) + '\')">' +
      '<strong>' + dentalEscapeHtml(group.dayLabel) + '</strong>' +
      '</button>';
  }).join('');

  container.className = 'dental-history-cards-panel';
  container.innerHTML =
    '<div class="dental-history-cards-head">' +
      '<span>Historique</span>' +
      '<b>' + (dentalPatientHistoryPage + 1) + '/' + totalPages + '</b>' +
    '</div>' +
    '<div class="dental-history-card-list">' + cards + '</div>' +
    '<div class="dental-history-cards-pager pagination-controls">' +
      '<button type="button" class="btn btn-secondary" aria-label="Page précédente" onclick="changeDentalHistoryPage(-1)" ' + (dentalPatientHistoryPage <= 0 ? 'disabled' : '') + '>‹</button>' +
      '<span>' + (dentalPatientHistoryPage + 1) + '/' + totalPages + '</span>' +
      '<button type="button" class="btn btn-secondary" aria-label="Page suivante" onclick="changeDentalHistoryPage(1)" ' + (dentalPatientHistoryPage >= totalPages - 1 ? 'disabled' : '') + '>›</button>' +
    '</div>';
}

function changeDentalHistoryPage(direction) {
  var totalPages = Math.max(1, Math.ceil(getDentalHistoryDayGroups().length / 4));
  dentalPatientHistoryPage = Math.min(Math.max(0, dentalPatientHistoryPage + direction), totalPages - 1);
  renderDentalPatientHistoryCards();
}

function setDentalHistoryDateFilter(value) {
  dentalHistoryDateFilter = value || '';
  dentalPatientHistoryPage = 0;
  if (dentalSelectedHistoryDayKey && dentalSelectedHistoryDayKey !== dentalHistoryDateFilter) {
    showCurrentDentalSchema();
    return;
  }
  renderDentalPatientHistoryCards();
}

function buildDentalHistoricalTeethData(group) {
  var statusByTreatment = {
    filling: 'filled',
    extraction: 'extraction',
    rootCanal: 'rootCanal',
    crown: 'crown',
    bridge: 'bridge',
    implant: 'implant',
    prosthesis: 'prosthesis'
  };
  var teethData = {};
  (group?.items || []).forEach(function(item) {
    if (!item.toothNumber) return;
    teethData[item.toothNumber] = {
      status: statusByTreatment[item.treatmentType] || 'healthy',
      surfaces: '',
      notes: item.description || item.notes || ''
    };
  });
  return teethData;
}

function mapDentalTreatmentToToothStatus(treatmentType) {
  return {
    filling: 'filled',
    extraction: 'extraction',
    rootCanal: 'rootCanal',
    crown: 'crown',
    bridge: 'bridge',
    implant: 'implant',
    prosthesis: 'prosthesis'
  }[treatmentType] || 'healthy';
}

async function showDentalHistoricalSchema(dayKey) {
  var group = getDentalHistoryDayGroups().find(function(item) { return item.key === dayKey; });
  if (!group) {
    showNotification('Historique dentaire introuvable pour cette date', 'warning');
    return;
  }

  dentalSelectedHistoryDayKey = dayKey;
  dentalSelectedTooth = null;
  dentalHistoricalTeethData = buildDentalHistoricalTeethData(group);
  try {
    var schemaResult = await window.api.dental.getSchemaAtDate(dentalSelectedPatientId, dayKey);
    if (schemaResult?.success && schemaResult.data) {
      (schemaResult.data.treatments || []).forEach(function(treatment) {
        dentalHistoricalTeethData[treatment.toothNumber] = {
          status: mapDentalTreatmentToToothStatus(treatment.treatmentType),
          surfaces: '',
          notes: treatment.description || treatment.notes || ''
        };
      });
      (schemaResult.data.teeth || []).forEach(function(tooth) {
        dentalHistoricalTeethData[tooth.toothNumber] = {
          status: tooth.status || dentalHistoricalTeethData[tooth.toothNumber]?.status || 'healthy',
          surfaces: tooth.surfaces || '',
          notes: tooth.notes || dentalHistoricalTeethData[tooth.toothNumber]?.notes || ''
        };
      });
      (schemaResult.data.history || []).forEach(function(tooth) {
        dentalHistoricalTeethData[tooth.toothNumber] = {
          status: tooth.status || 'healthy',
          surfaces: tooth.surfaces || '',
          notes: tooth.notes || ''
        };
      });
    }
  } catch (error) {
    console.error('Unable to reconstruct complete historical schema:', error);
  }

  // Build modal with historical chart
  var currentTeethData = dentalTeethData;
  dentalTeethData = dentalHistoricalTeethData;
  var positions = getToothPositions();
  var teethSvg = renderAllTeeth(positions);
  dentalTeethData = currentTeethData;

  var existing = document.getElementById('dental-historical-modal');
  if (existing) existing.remove();

  var html =
    '<div id="dental-historical-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center">' +
      '<div style="background:#fff;border-radius:18px;padding:24px;width:min(920px,94vw);max-height:92vh;overflow-y:auto;box-shadow:0 18px 60px rgba(0,0,0,.26)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div>' +
            '<span style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6366f1">Schéma historique</span>' +
            '<h3 style="margin:4px 0 0;font-size:24px;color:#1e293b;font-weight:900">' + dentalEscapeHtml(group.dayLabel) + '</h3>' +
            '<p style="margin:2px 0 0;color:#64748b;font-size:15px">' + group.items.length + ' acte(s) · ' + (group.teeth.length || 0) + ' dent(s) · Consultation en lecture seule</p>' +
          '</div>' +
          '<button onclick="closeDentalHistoricalModal()" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;width:42px;height:42px;font-size:24px;cursor:pointer;color:#64748b;line-height:1">×</button>' +
        '</div>' +
        '<svg class="dental-svg" viewBox="0 0 800 500" style="width:100%;height:auto;max-height:420px;margin:10px 0">' +
          '<defs>' +
            '<filter id="tSh" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(15,23,42,0.18)"/></filter>' +
            '<linearGradient id="gU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffdce4"/><stop offset="52%" stop-color="#f8b7c4"/><stop offset="100%" stop-color="#f09cac"/></linearGradient>' +
            '<linearGradient id="gL" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#ffdce4"/><stop offset="52%" stop-color="#f8b7c4"/><stop offset="100%" stop-color="#f09cac"/></linearGradient>' +
          '</defs>' +
          '<text x="55" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">D</text>' +
          '<text x="745" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">G</text>' +
          '<line x1="400" y1="28" x2="400" y2="480" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="5,4" opacity="0.4"/>' +
          '<path d="M 90,165 Q 110,28 400,18 Q 690,28 710,165" fill="url(#gU)" stroke="#d4818f" stroke-width="1.2" opacity="0.22"/>' +
          '<path d="M 120,335 Q 140,468 400,478 Q 660,468 680,335" fill="url(#gL)" stroke="#d4818f" stroke-width="1.2" opacity="0.22"/>' +
          '<path d="M 90,195 Q 250,210 400,214 Q 550,210 710,195" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +
          '<path d="M 120,305 Q 260,292 400,288 Q 540,292 680,305" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +
          teethSvg +
        '</svg>' +
        '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:12px">' +
          '<button type="button" class="btn btn-primary" onclick="closeDentalHistoricalModal()">Revenir au schéma actuel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
  renderDentalPatientHistoryCards();
}

function closeDentalHistoricalModal() {
  dentalSelectedHistoryDayKey = null;
  var modal = document.getElementById('dental-historical-modal');
  if (modal) modal.remove();
}

function showCurrentDentalSchema() {
  dentalSelectedHistoryDayKey = null;
  dentalHistoricalTeethData = {};
  dentalSelectedTooth = null;
  renderDentalChart();
  var notesContainer = document.getElementById('dental-chart-notes-container');
  if (notesContainer) notesContainer.innerHTML = getDentalNotesEmptyHTML();
  var panel = document.getElementById('dental-tooth-detail');
  if (panel) panel.innerHTML = getDentalDetailEmptyHTML();
  renderDentalPatientHistoryCards();
}

function renderDentalDayHistoryPanel(group) {
  var notesContainer = document.getElementById('dental-chart-notes-container');
  if (!notesContainer || !group) return;
  var rows = group.items.map(function(item) {
    var typeInfo = TREATMENT_TYPES.find(function(t) { return t.value === item.treatmentType; }) || { icon: '', label: item.treatmentType || 'Acte' };
    var toothNumber = item.toothNumber || '—';
    var historicalData = buildDentalHistoricalTeethData(group);
    var toothData = item.toothNumber ? historicalData[item.toothNumber] : null;
    var status = toothData && toothData.status ? getToothStatusLabel(toothData.status) : 'État non défini';
    var desc = item.description || item.notes || '';
    return '<div class="dental-day-action-row">' +
      '<div><strong>' + dentalEscapeHtml(typeInfo.icon + ' ' + typeInfo.label) + '</strong><span>Dent ' + dentalEscapeHtml(toothNumber) + ' · ' + dentalEscapeHtml(status) + '</span></div>' +
      '<time>' + dentalEscapeHtml(formatDentalDateTime(item.treatmentDate)) + '</time>' +
      (desc ? '<p>' + dentalEscapeHtml(desc) + '</p>' : '') +
      '</div>';
  }).join('');
  notesContainer.innerHTML =
    '<div class="dental-day-history-panel">' +
      '<div class="dental-day-history-head">' +
        '<div><span>Consultation / journée</span><h4>' + dentalEscapeHtml(group.dayLabel) + '</h4></div>' +
        '<b>' + group.items.length + ' acte(s)</b>' +
      '</div>' +
      '<div class="dental-day-schema-note">Le schéma interactif affiche la dernière situation enregistrée. La dent la plus récente de cette journée est sélectionnée.</div>' +
      '<div class="dental-day-action-list">' + rows + '</div>' +
    '</div>';
}

function renderDentalHistoryDaySvg(group, selectedTooth) {
  var latestWithTooth = group.items.find(function(item) { return item.toothNumber; });
  var previousSelected = dentalSelectedTooth;
  var previousTeethData = dentalTeethData;
  var modalSelectedTooth = selectedTooth || (latestWithTooth ? latestWithTooth.toothNumber : null);
  var previousTreatmentsCache = dentalTreatmentsCache;
  var dayTeethData = dentalSelectedHistoryDayKey === group.key && Object.keys(dentalHistoricalTeethData).length
    ? dentalHistoricalTeethData
    : buildDentalHistoricalTeethData(group);
  dentalSelectedTooth = modalSelectedTooth;
  dentalTeethData = dayTeethData;
  dentalTreatmentsCache = {};
  var teethSvg = renderAllTeeth(getToothPositions())
    .replaceAll('filter="url(#tSh)"', 'filter="url(#tShHistory)"')
    .replace(/onclick="selectDentalTooth\((\d+)\)"/g, function(match, toothNumber) {
      return 'onclick="openDentalHistoryModalTooth(\'' + dentalEscapeHtml(group.key) + '\',' + toothNumber + ')"';
    });
  var svg =
    '<svg class="dental-history-modal-svg" viewBox="0 0 800 500">' +
    '<defs>' +
    '<filter id="tShHistory" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(15,23,42,0.18)"/></filter>' +
    '<linearGradient id="gUHistory" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffdce4"/><stop offset="52%" stop-color="#f8b7c4"/><stop offset="100%" stop-color="#f09cac"/></linearGradient>' +
    '<linearGradient id="gLHistory" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#ffdce4"/><stop offset="52%" stop-color="#f8b7c4"/><stop offset="100%" stop-color="#f09cac"/></linearGradient>' +
    '</defs>' +
    '<text x="55" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">D</text>' +
    '<text x="745" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">G</text>' +
    '<line x1="400" y1="28" x2="400" y2="480" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="5,4" opacity="0.4"/>' +
    '<path d="M 90,165 Q 110,28 400,18 Q 690,28 710,165" fill="url(#gUHistory)" stroke="#d4818f" stroke-width="1.2" opacity="0.22"/>' +
    '<path d="M 120,335 Q 140,468 400,478 Q 660,468 680,335" fill="url(#gLHistory)" stroke="#d4818f" stroke-width="1.2" opacity="0.22"/>' +
    '<path d="M 90,195 Q 250,210 400,214 Q 550,210 710,195" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +
    '<path d="M 120,305 Q 260,292 400,288 Q 540,292 680,305" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +
    teethSvg +
    '</svg>';
  dentalSelectedTooth = previousSelected;
  dentalTeethData = previousTeethData;
  dentalTreatmentsCache = previousTreatmentsCache;
  return svg;
}

function openDentalPatientHistoryDayWindow(dayKey, selectedTooth) {
  var groups = getDentalHistoryDayGroups();
  var group = groups.find(function(g) { return g.key === dayKey; });
  if (!group) return;
  dentalSelectedHistoryDayKey = dayKey;
  var latestWithTooth = group.items.find(function(item) { return item.toothNumber; });
  var modalSelectedTooth = selectedTooth || (latestWithTooth ? latestWithTooth.toothNumber : null);
  var modal = document.getElementById('dental-day-history-modal');
  if (modal) modal.remove();
  var selectedToothData = modalSelectedTooth ? dentalTeethData[modalSelectedTooth] : null;
  var selectedStatus = selectedToothData && selectedToothData.status ? selectedToothData.status : 'healthy';
  var selectedStatusInfo = TOOTH_STATUSES[selectedStatus] || TOOTH_STATUSES.healthy;
  var selectedActions = modalSelectedTooth ? group.items.filter(function(item) { return Number(item.toothNumber) === Number(modalSelectedTooth); }) : [];
  var rows = group.items.map(function(item) {
    var typeInfo = TREATMENT_TYPES.find(function(t) { return t.value === item.treatmentType; }) || { icon: '', label: item.treatmentType || 'Acte' };
    var toothNumber = item.toothNumber || '—';
    var toothData = item.toothNumber ? dentalTeethData[item.toothNumber] : null;
    var status = toothData && toothData.status ? getToothStatusLabel(toothData.status) : 'État non défini';
    var desc = item.description || item.notes || '';
    return '<div class="dental-day-action-row">' +
      '<div><strong>' + dentalEscapeHtml(typeInfo.icon + ' ' + typeInfo.label) + '</strong><span>Dent ' + dentalEscapeHtml(toothNumber) + ' · ' + dentalEscapeHtml(status) + '</span></div>' +
      '<time>' + dentalEscapeHtml(formatDentalDateTime(item.treatmentDate)) + '</time>' +
      (desc ? '<p>' + dentalEscapeHtml(desc) + '</p>' : '') +
      '</div>';
  }).join('');
  var html = '<div id="dental-day-history-modal" class="dental-day-history-modal">' +
    '<div class="dental-day-history-window">' +
      '<div class="dental-day-history-window-head">' +
        '<div><span>Historique consultation / journée</span><h3>' + dentalEscapeHtml(group.dayLabel) + '</h3><p>' + group.items.length + ' acte(s) · Dent(s) ' + dentalEscapeHtml(group.teeth.join(', ') || '—') + '</p></div>' +
        '<button onclick="document.getElementById(\'dental-day-history-modal\').remove()">×</button>' +
      '</div>' +
      '<div class="dental-history-modal-layout">' +
        renderDentalHistoryDaySvg(group, modalSelectedTooth) +
        '<aside class="dental-history-modal-tooth">' +
          '<span>Dent sélectionnée</span>' +
          '<h4>' + (modalSelectedTooth ? 'Dent N° ' + dentalEscapeHtml(modalSelectedTooth) : 'Aucune dent') + '</h4>' +
          '<p>' + dentalEscapeHtml(modalSelectedTooth ? (ADULT_TEETH[modalSelectedTooth] || '') : 'Cliquez sur une dent du schéma.') + '</p>' +
          (modalSelectedTooth ? '<div style="background:' + selectedStatusInfo.color + ';border-color:' + selectedStatusInfo.border + ';color:' + selectedStatusInfo.tc + ';" class="dental-history-modal-status">' + selectedStatusInfo.icon + ' ' + getToothStatusLabel(selectedStatus) + '</div>' : '') +
          '<small>' + selectedActions.length + ' acte(s) ce jour pour cette dent</small>' +
        '</aside>' +
      '</div>' +
      '<div class="dental-day-action-list">' + rows + '</div>' +
    '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
  renderDentalPatientHistoryCards();
}

function openDentalHistoryModalTooth(dayKey, toothNumber) {
  openDentalPatientHistoryDayWindow(dayKey, toothNumber);
}

function openTreatmentModal(toothNumber) {
  if (!dentalSelectedPatientId) { showNotification('Sélectionnez d\'abord un patient', 'error'); return; }
  closeDentalTreatmentModal();
  var opts = TREATMENT_TYPES.map(function(t) { return '<option value="' + t.value + '">' + t.icon + ' ' + t.label + '</option>'; }).join('');
  var surfaces = ['M (Mésial)', 'D (Distal)', 'O (Occlusal)', 'V (Vestibulaire)', 'L (Lingual)'];
  var surfHtml = surfaces.map(function(s) { return '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" class="dt-surface" value="' + s.charAt(0) + '"> ' + s + '</label>'; }).join('');
  var statusOpts = [
    '<option value="proposed">Proposé</option>',
    '<option value="planned">Planifié</option>',
    '<option value="in_progress">En cours</option>',
    '<option value="completed">Terminé</option>'
  ].join('');
  var html = '<div id="dental-treatment-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center">' +
    '<div style="background:#fff;border-radius:16px;padding:30px;width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h3 style="margin:0">Nouveau traitement' + (toothNumber ? ' — Dent ' + toothNumber : '') + '</h3>' +
    '<button onclick="closeDentalTreatmentModal()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button></div>' +
    '<div style="display:grid;gap:12px">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="font-weight:600;font-size:13px">Type *</label><select id="dt-type" class="form-control" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">' + opts + '</select></div>' +
    '<div><label style="font-weight:600;font-size:13px">Statut</label><select id="dt-status" class="form-control" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">' + statusOpts + '</select></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="font-weight:600;font-size:13px">N° Dent</label><input type="number" id="dt-tooth" class="form-control" value="' + (toothNumber || '') + '" min="11" max="48" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '<div><label style="font-weight:600;font-size:13px">Date</label><input type="date" id="dt-date" class="form-control" value="' + new Date().toISOString().split('T')[0] + '" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '</div>' +
    '<div><label style="font-weight:600;font-size:13px">Surfaces</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' + surfHtml + '</div></div>' +
    '<div><label style="font-weight:600;font-size:13px">Description</label><textarea id="dt-description" rows="2" class="form-control" placeholder="Description..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></textarea></div>' +
    '<div><label style="font-weight:600;font-size:13px">Coût (DA)</label><input type="number" id="dt-cost" class="form-control" value="0" min="0" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '<div><label style="font-weight:600;font-size:13px">Notes</label><textarea id="dt-notes" rows="2" class="form-control" placeholder="Notes..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></textarea></div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
    '<button onclick="closeDentalTreatmentModal()" class="btn btn-secondary">Annuler</button>' +
    '<button onclick="saveDentalTreatment()" class="btn btn-primary">💾 Enregistrer</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeDentalTreatmentModal() { var m = document.getElementById('dental-treatment-modal'); if (m) m.remove(); }

async function saveDentalTreatment() {
  if (!dentalSelectedPatientId) return;
  var surfaces = Array.from(document.querySelectorAll('.dt-surface:checked')).map(function(c) { return c.value; }).join(',');
  var data = {
    patientId: dentalSelectedPatientId,
    toothNumber: parseInt(document.getElementById('dt-tooth') ? document.getElementById('dt-tooth').value : '') || null,
    treatmentDate: (document.getElementById('dt-date') ? document.getElementById('dt-date').value : '') || new Date().toISOString().split('T')[0],
    treatmentType: (document.getElementById('dt-type') ? document.getElementById('dt-type').value : '') || 'checkup',
    status: (document.getElementById('dt-status') ? document.getElementById('dt-status').value : '') || 'proposed',
    surfaces: surfaces,
    description: document.getElementById('dt-description') ? document.getElementById('dt-description').value : '',
    cost: parseFloat(document.getElementById('dt-cost') ? document.getElementById('dt-cost').value : '0') || 0,
    notes: document.getElementById('dt-notes') ? document.getElementById('dt-notes').value : '',
    doctorId: typeof currentUserId !== 'undefined' ? currentUserId : null
  };
  try {
    var result = await window.api.dental.createTreatment(data);
    if (result.success) {
      showNotification('Traitement enregistré', 'success');
      closeDentalTreatmentModal();
      if (dentalSelectedPatientId) {
        await loadDentalTeeth(dentalSelectedPatientId);
        await loadDentalTreatmentColors(dentalSelectedPatientId);
        renderDentalChart();
        await loadDentalPatientHistoryCards(dentalSelectedPatientId);
        await updatePatientDentalStats(dentalSelectedPatientId);
        if (typeof loadPatientDentalTab === 'function') {
          var dentalTab = document.getElementById('tab-dental');
          if (dentalTab && dentalTab.classList.contains('active')) loadPatientDentalTab(dentalSelectedPatientId);
        }
      }
    } else { showNotification('Erreur: ' + result.error, 'error'); }
  } catch (e) { showNotification('Erreur', 'error'); }
}

async function deleteDentalTreatment(tid) {
  if (!confirm('Supprimer ce traitement ?')) return;
  try {
    await window.api.dental.deleteTreatment(tid);
    showNotification('Traitement supprimé', 'success');
    if (dentalSelectedPatientId) { await loadDentalTreatments(dentalSelectedPatientId); await updatePatientDentalStats(dentalSelectedPatientId); }
  } catch (e) { showNotification('Erreur', 'error'); }
}

// ========== TOOTH HISTORY ==========
async function viewToothHistory(toothNumber) {
  if (!dentalSelectedPatientId) return;
  try {
    var result = await window.api.dental.getToothHistory(dentalSelectedPatientId, toothNumber);
    var history = result.success ? result.data : [];
    var items = '';
    dentalHistoryNoteCache = {};
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var isNote = h.treatmentType === 'note';
      var ti = TREATMENT_TYPES.find(function(tt) { return tt.value === h.treatmentType; }) || { label: h.treatmentType || 'Acte', icon: '' };
      var dateStr = '—';
      if (h.treatmentDate) {
        try {
          var d = new Date(h.treatmentDate);
          var p2 = function(n) { return n < 10 ? '0' + n : '' + n; };
          dateStr = p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear()
                  + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
        } catch(ex) { dateStr = h.treatmentDate; }
      }
      var borderColor = isNote ? '#7c3aed' : '#2563eb';
      var hasDesc = h.description && h.description.trim().length > 0;
      var noteKey = 'note_' + toothNumber + '_' + i + '_' + Date.now();
      if (isNote && hasDesc) {
        dentalHistoryNoteCache[noteKey] = {
          toothNumber: toothNumber,
          toothName: ADULT_TEETH[toothNumber] || '',
          title: ti.label,
          date: dateStr,
          text: h.description
        };
      }
      items +=
        '<div ' +
          (isNote && hasDesc ? 'onclick="openDentalHistoryNote(\'' + noteKey + '\')" title="Cliquer pour agrandir la note" ' : '') +
          'style="border-left:5px solid ' + borderColor + ';padding:18px 20px;background:#fafafa;border-radius:0 14px 14px 0;margin-bottom:12px;' + (isNote && hasDesc ? 'cursor:pointer;' : '') + 'box-shadow:0 8px 20px rgba(15,23,42,0.05);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:18px;">' +
            '<span style="font-size:18px;font-weight:900;color:#1e293b;">' + dentalEscapeHtml(ti.label) + '</span>' +
            '<span style="font-size:14px;color:#64748b;font-weight:700;white-space:nowrap;">' + dentalEscapeHtml(dateStr) + '</span>' +
          '</div>' +
          (hasDesc
            ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:18px;color:#334155;line-height:1.7;white-space:pre-wrap;">' + dentalEscapeHtml(h.description) + '</div>'
            : '') +
          (isNote && hasDesc ? '<div style="margin-top:12px;font-size:13px;font-weight:800;color:#7c3aed;">Cliquer pour voir en grand</div>' : '') +
          (h.cost > 0
            ? '<div style="margin-top:10px;font-size:15px;font-weight:800;color:#16a34a;">' + h.cost.toLocaleString() + ' DA</div>'
            : '') +
        '</div>';
    }
    var html =
      '<div id="dental-history-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:10001;display:flex;align-items:center;justify-content:center">' +
        '<div style="background:#fff;border-radius:18px;padding:34px;width:min(920px,92vw);max-height:86vh;overflow-y:auto;box-shadow:0 18px 60px rgba(0,0,0,.26)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<h3 style="margin:0;font-size:26px;color:#1e293b;font-weight:900;">Historique — Dent ' + toothNumber + '</h3>' +
            '<button onclick="document.getElementById(\'dental-history-modal\').remove()" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;width:42px;height:42px;font-size:24px;cursor:pointer;color:#64748b;line-height:1">×</button>' +
          '</div>' +
          '<p style="color:#64748b;margin-bottom:22px;font-size:17px;font-weight:700;">' + dentalEscapeHtml(ADULT_TEETH[toothNumber] || '') + '</p>' +
          (history.length === 0
            ? '<p style="text-align:center;color:#94a3b8;padding:34px 0;font-size:18px;">Aucun historique pour cette dent.</p>'
            : '<div style="display:flex;flex-direction:column;gap:12px;">' + items + '</div>') +
        '</div>' +
      '</div>';
    var existing = document.getElementById('dental-history-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) { console.error('Error loading tooth history:', e); }
}

function openDentalHistoryNote(noteKey) {
  var note = dentalHistoryNoteCache[noteKey];
  if (!note) return;
  var existing = document.getElementById('dental-note-large-modal');
  if (existing) existing.remove();
  var html =
    '<div id="dental-note-large-modal" style="position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:10002;display:flex;align-items:center;justify-content:center;padding:28px;">' +
      '<div style="width:min(980px,94vw);max-height:88vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.32);padding:38px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:24px;">' +
          '<div>' +
            '<div style="font-size:14px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed;margin-bottom:8px;">Note clinique</div>' +
            '<h2 style="margin:0;font-size:34px;line-height:1.15;color:#111827;">Dent ' + dentalEscapeHtml(note.toothNumber) + '</h2>' +
            '<p style="margin:8px 0 0;color:#64748b;font-size:18px;font-weight:700;">' + dentalEscapeHtml(note.toothName || '') + ' · ' + dentalEscapeHtml(note.date || '') + '</p>' +
          '</div>' +
          '<button onclick="document.getElementById(\'dental-note-large-modal\').remove()" style="width:48px;height:48px;border-radius:14px;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;font-size:28px;line-height:1;cursor:pointer;">×</button>' +
        '</div>' +
        '<div style="border-left:6px solid #7c3aed;background:#faf5ff;border-radius:0 18px 18px 0;padding:28px 32px;font-size:26px;line-height:1.75;color:#1f2937;white-space:pre-wrap;font-weight:600;">' + dentalEscapeHtml(note.text || '') + '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

// ========== DENTAL PLANS ==========
async function loadDentalPlans(patientId) {
  var container = document.getElementById('dental-plans-list');
  if (!container) return;
  if (!patientId) { container.innerHTML = '<div class="dental-empty-state"><h4>Sélectionnez un patient</h4><p>Les plans de traitement apparaîtront ici.</p></div>'; return; }
  try {
    var result = await window.api.dental.getPlans(patientId);
    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = '<div class="dental-empty-state"><h4>Aucun plan de traitement</h4><p>Créez un plan pour organiser les prochaines étapes du soin.</p></div>';
      return;
    }
    var html = '';
    var labels = { pending: '⏳ En attente', active: '🟢 Actif', completed: '✅ Terminé', cancelled: '❌ Annulé' };
    for (var i = 0; i < result.data.length; i++) {
      var p = result.data[i];
      html += '<div class="dental-plan-card dental-plan-card-' + (p.status || 'pending') + '">' +
        '<div class="dental-plan-header">' +
        '<div><h4>' + p.title + '</h4><p>' + (p.description || 'Plan de traitement dentaire') + '</p></div>' +
        '<div class="dental-plan-summary"><span class="dental-plan-status">' + (labels[p.status] || p.status) + '</span><strong>' + (p.estimatedCost || 0).toLocaleString() + ' DA</strong></div></div>' +
        '<div class="dental-plan-footer">' +
        '<span class="dental-plan-notes">' + (p.notes || 'Sans note complémentaire') + '</span>' +
        '<button onclick="deleteDentalPlan(\'' + p.id + '\')" class="btn btn-danger btn-small">🗑️ Supprimer</button></div></div>';
    }
    container.innerHTML = html;
  } catch (e) { console.error('Error loading plans:', e); }
}

function openDentalPlanModal() {
  if (!dentalSelectedPatientId) { showNotification('Sélectionnez d\'abord un patient', 'error'); return; }
  var existing = document.getElementById('dental-plan-modal');
  if (existing) existing.remove();
  var html = '<div id="dental-plan-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center">' +
    '<div style="background:#fff;border-radius:16px;padding:30px;width:500px;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h3 style="margin:0">Nouveau plan de traitement</h3>' +
    '<button onclick="document.getElementById(\'dental-plan-modal\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button></div>' +
    '<div style="display:grid;gap:12px">' +
    '<div><label style="font-weight:600">Titre *</label><input type="text" id="dp-title" class="form-control" placeholder="Ex: Traitement carie + couronne" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '<div><label style="font-weight:600">Description</label><textarea id="dp-description" rows="3" class="form-control" placeholder="Détails..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></textarea></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="font-weight:600">Coût estimé (DA)</label><input type="number" id="dp-cost" class="form-control" value="0" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '<div><label style="font-weight:600">Statut</label><select id="dp-status" class="form-control" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"><option value="pending">En attente</option><option value="active">Actif</option><option value="completed">Terminé</option></select></div></div>' +
    '<div><label style="font-weight:600">Notes</label><textarea id="dp-notes" rows="2" class="form-control" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></textarea></div></div>' +
    '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">' +
    '<button onclick="document.getElementById(\'dental-plan-modal\').remove()" class="btn btn-secondary">Annuler</button>' +
    '<button onclick="saveDentalPlan()" class="btn btn-primary">💾 Enregistrer</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

async function saveDentalPlan() {
  if (!dentalSelectedPatientId) return;
  var title = document.getElementById('dp-title') ? document.getElementById('dp-title').value : '';
  if (!title) { showNotification('Titre requis', 'error'); return; }
  try {
    var result = await window.api.dental.createPlan({
      patientId: dentalSelectedPatientId,
      title: title,
      description: document.getElementById('dp-description') ? document.getElementById('dp-description').value : '',
      estimatedCost: parseFloat(document.getElementById('dp-cost') ? document.getElementById('dp-cost').value : '0') || 0,
      status: document.getElementById('dp-status') ? document.getElementById('dp-status').value : 'pending',
      notes: document.getElementById('dp-notes') ? document.getElementById('dp-notes').value : ''
    });
    if (result.success) {
      showNotification('Plan créé', 'success');
      var m = document.getElementById('dental-plan-modal'); if (m) m.remove();
      await loadDentalPlans(dentalSelectedPatientId);
    }
  } catch (e) { showNotification('Erreur', 'error'); }
}

async function deleteDentalPlan(planId) {
  if (!confirm('Supprimer ce plan ?')) return;
  try {
    await window.api.dental.deletePlan(planId);
    showNotification('Plan supprimé', 'success');
    if (dentalSelectedPatientId) loadDentalPlans(dentalSelectedPatientId);
  } catch (e) { showNotification('Erreur', 'error'); }
}

// ========== STATS ==========
async function updateDentalStats() {
  try {
    var result = await window.api.dental.getStats();
    if (result.success && result.data) {
      var s = result.data;
      var el = function(id) { return document.getElementById(id); };
      if (el('dental-stat-patients')) el('dental-stat-patients').textContent = s.totalPatients || 0;
      if (el('dental-stat-treatments')) el('dental-stat-treatments').textContent = s.totalTreatments || 0;
      if (el('dental-stat-month')) el('dental-stat-month').textContent = s.monthTreatments || 0;
      if (el('dental-stat-active-plans')) el('dental-stat-active-plans').textContent = s.activePlans || 0;
    }
  } catch (e) { console.error('Error updating dental stats:', e); }
}

async function updatePatientDentalStats(patientId) {
  try {
    var result = await window.api.dental.getStats(patientId);
    if (result.success && result.data) {
      var s = result.data;
      var el = function(id) { return document.getElementById(id); };
      if (el('dental-patient-treatments')) el('dental-patient-treatments').textContent = s.totalTreatments || 0;
      if (el('dental-patient-plans')) el('dental-patient-plans').textContent = s.activePlans || 0;
      if (el('dental-patient-images')) el('dental-patient-images').textContent = s.totalImages || 0;
      if (el('dental-patient-teeth')) el('dental-patient-teeth').textContent = s.teethAffected || 0;
    }
  } catch (e) { console.error('Error updating patient stats:', e); }
}

// Pay dental treatment from the dentistry chart view
async function payDentalTreatmentFromChart(treatmentId, cost, alreadyPaid) {
  if (!dentalSelectedPatientId) { showNotification('Aucun patient sélectionné', 'error'); return; }
  var remaining = Math.max(cost - alreadyPaid, 0);
  if (remaining <= 0) { showNotification('Ce traitement est déjà payé', 'info'); return; }

  var pPatientId = document.getElementById('payment-patient-id');
  var pConsultId = document.getElementById('payment-consultation-id');
  var pName = document.getElementById('payment-patient-name');
  var pAmount = document.getElementById('payment-amount');
  var pDate = document.getElementById('payment-date');
  var pMethod = document.getElementById('payment-method');
  var pNotes = document.getElementById('payment-notes');
  if (typeof resetPaymentModalState === 'function') {
    resetPaymentModalState();
  }

  if (pPatientId) pPatientId.value = dentalSelectedPatientId;
  if (pConsultId) pConsultId.value = '';
  if (pName) {
    try {
      var res = await window.api.patient.getById(dentalSelectedPatientId);
      if (res.success) pName.value = res.data.firstName + ' ' + res.data.lastName;
    } catch (e) { pName.value = 'Patient'; }
  }
  if (pAmount) pAmount.value = remaining;
  if (pDate) pDate.value = new Date().toISOString().split('T')[0];
  if (pMethod) pMethod.value = 'Espèces';
  if (pNotes) pNotes.value = 'Traitement dentaire';
  if (typeof setPaymentConsultationLabel === 'function') {
    setPaymentConsultationLabel('', new Date().toISOString().split('T')[0]);
  }

  var modal = document.getElementById('modal-add-payment');
  if (modal) modal.dataset.dentalTreatmentId = treatmentId;

showModal('modal-add-payment');
}

// ========== LAZY PATIENT SEARCH OVERRIDES ==========

const originalLoadDentalPatientList = loadDentalPatientList;
loadDentalPatientList = async function() {
  const select = document.getElementById('dental-patient-selector');
  if (!select) return;

  if (typeof window.attachLazyPatientSearchToSelect === 'function') {
    window.attachLazyPatientSearchToSelect('dental-patient-selector', {
      selectedPatientId: dentalSelectedPatientId || '',
      placeholder: 'Rechercher par nom...',
      emptyMessage: '',
      loadingMessage: 'Recherche des patients...',
      noResultsMessage: 'Aucun patient commence par cette recherche',
      minChars: 1,
      debounceMs: 220,
      hideWhenEmpty: true,
      restoreCommittedOnBlur: true
    });
    return;
  }

  return originalLoadDentalPatientList();
};

const originalSelectDentalPatient = selectDentalPatient;
selectDentalPatient = async function(patientId) {
  if (typeof window.setLazyPatientFieldValue === 'function') {
    window.setLazyPatientFieldValue('dental-patient-selector', patientId || '');
  }
  return originalSelectDentalPatient(patientId);
};

registerLegacyGlobals('dentistry', {
  applyDentalLanguageToUI,
  changeDentalHistoryPage,
  changeToothStatus,
  closeDentalDetail,
  closeDentalHistoricalModal,
  closeDentalTreatmentModal,
  deleteDentalPlan,
  deleteDentalTreatment,
  deleteDentalXray,
  importDentalImage,
  initDentistry,
  loadDentalPatientHistoryCards,
  loadDentalPatientList,
  loadDentalPlans,
  loadDentalTeeth,
  loadDentalTreatments,
  openDentalHistoryModalTooth,
  openDentalHistoryNote,
  openDentalPatientDossier,
  openDentalPatientForm,
  openDentalPatientHistoryDayWindow,
  openDentalPlanModal,
  openImageViewer,
  openTreatmentModal,
  payDentalTreatmentFromChart,
  refreshDentalPatientList,
  saveDentalPlan,
  saveDentalTreatment,
  saveToothNotes,
  selectDentalPatient,
  selectDentalTooth,
  setDental3DView,
  setDentalHistoryDateFilter,
  setDentalLanguage,
  setDentalSchemaMode,
  showDentalHistoricalSchema,
  showCurrentDentalSchema,
  showToothDetail,
  switchDentalTab,
  updateDentalStats,
  updatePatientDentalStats,
  viewDentalGallery,
  viewToothHistory,
  resetDental3DCamera,
  toggleDentalFdiGuide,
  filterDentalPatientList
});

window.setDentalSchemaMode = setDentalSchemaMode;
window.setDental3DView = setDental3DView;
window.resetDental3DCamera = resetDental3DCamera;
window.toggleDentalFdiGuide = toggleDentalFdiGuide;
window.filterDentalPatientList = filterDentalPatientList;

export function destroyDentistryLegacy() {
  destroyDental3D();
  dentalRealtimeWs?.close?.();
  dentalRealtimeWs = null;
  unregisterLegacyGlobals('dentistry');
}

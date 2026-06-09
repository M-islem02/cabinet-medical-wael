// ========== DENTISTRY MODULE ==========
// Professional dental chart with realistic curved mouth diagram
// Medical imaging integration (Radio, Scanner, Echo)

let dentalSelectedPatientId = null;
let dentalSelectedTooth = null;
let dentalTeethData = {};
let dentalCurrentTab = 'chart';
const DENTAL_LANGUAGE_KEY = 'medcareso_dental_language';
let currentDentalLanguage = 'fr';

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
  healthy:    { label: 'Saine',       color: '#e8f5e9', border: '#4caf50', icon: '✓', tc: '#2e7d32' },
  cavity:     { label: 'Carie',       color: '#fff3e0', border: '#ff9800', icon: '●', tc: '#e65100' },
  filled:     { label: 'Obturée',     color: '#e3f2fd', border: '#2196f3', icon: '■', tc: '#1565c0' },
  crown:      { label: 'Couronne',    color: '#f3e5f5', border: '#9c27b0', icon: '♛', tc: '#6a1b9a' },
  bridge:     { label: 'Bridge',      color: '#e8eaf6', border: '#3f51b5', icon: '⌒', tc: '#283593' },
  rootCanal:  { label: 'Dévitalisée', color: '#fce4ec', border: '#e91e63', icon: '✕', tc: '#c62828' },
  extraction: { label: 'Extraite',    color: '#ffebee', border: '#f44336', icon: '∅', tc: '#b71c1c' },
  implant:    { label: 'Implant',     color: '#e0f7fa', border: '#00bcd4', icon: '⬡', tc: '#00838f' },
  missing:    { label: 'Absente',     color: '#f5f5f5', border: '#9e9e9e', icon: '—', tc: '#616161' },
  fractured:  { label: 'Fracturée',   color: '#fff8e1', border: '#ffc107', icon: '⚡', tc: '#f57f17' },
  abscess:    { label: 'Abcès',       color: '#fbe9e7', border: '#ff5722', icon: '!', tc: '#bf360c' },
  impacted:   { label: 'Incluse',     color: '#efebe9', border: '#795548', icon: '↓', tc: '#4e342e' },
  prosthesis: { label: 'Prothèse',    color: '#e1f5fe', border: '#03a9f4', icon: '◊', tc: '#01579b' }
};

const TOOTH_STATUS_LABELS = {
  fr: {
    healthy: 'Saine', cavity: 'Carie', filled: 'Obturée', crown: 'Couronne', bridge: 'Bridge',
    rootCanal: 'Dévitalisée', extraction: 'Extraite', implant: 'Implant', missing: 'Absente',
    fractured: 'Fracturée', abscess: 'Abcès', impacted: 'Incluse', prosthesis: 'Prothèse'
  },
  en: {
    healthy: 'Healthy', cavity: 'Cavity', filled: 'Filled', crown: 'Crown', bridge: 'Bridge',
    rootCanal: 'Root canal', extraction: 'Extracted', implant: 'Implant', missing: 'Missing',
    fractured: 'Fractured', abscess: 'Abscess', impacted: 'Impacted', prosthesis: 'Prosthesis'
  }
};

function getToothStatusLabel(key) {
  return TOOTH_STATUS_LABELS[currentDentalLanguage]?.[key] || TOOTH_STATUS_LABELS.fr[key] || TOOTH_STATUSES[key]?.label || key;
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
  { value: 'checkup', label: 'Examen / Contrôle', icon: '🔍' },
  { value: 'cleaning', label: 'Détartrage', icon: '🪥' },
  { value: 'filling', label: 'Obturation (Plombage)', icon: '🔧' },
  { value: 'extraction', label: 'Extraction', icon: '🦷' },
  { value: 'rootCanal', label: 'Traitement de canal', icon: '💉' },
  { value: 'crown', label: 'Couronne', icon: '👑' },
  { value: 'bridge', label: 'Bridge', icon: '🌉' },
  { value: 'implant', label: 'Implant dentaire', icon: '🔩' },
  { value: 'veneer', label: 'Facette', icon: '✨' },
  { value: 'whitening', label: 'Blanchiment', icon: '⚪' },
  { value: 'orthodontics', label: 'Orthodontie', icon: '📐' },
  { value: 'surgery', label: 'Chirurgie', icon: '🔪' },
  { value: 'prosthesis', label: 'Prothèse', icon: '🦿' },
  { value: 'xray', label: 'Radiographie', icon: '📷' },
  { value: 'other', label: 'Autre', icon: '📋' }
];

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
  await loadDentalPatientList();
  updateDentalStats();
}

async function loadDentalPatientList() {
  try {
    const result = await window.api.patient.getAll();
    const select = document.getElementById('dental-patient-selector');
    if (!select) return;
    select.innerHTML = '<option value="">-- Sélectionner un patient --</option>';
    if (result.success && result.data) {
      result.data.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.lastName + ' ' + p.firstName;
        if (p.id === dentalSelectedPatientId) opt.selected = true;
        select.appendChild(opt);
      });
    }
  } catch (e) { console.error('Error loading dental patients:', e); }
}

async function selectDentalPatient(patientId) {
  dentalSelectedPatientId = patientId;
  dentalSelectedTooth = null;
  const display = document.getElementById('dental-current-patient-display');
  if (!patientId) {
    if (display) display.textContent = 'Aucun patient sélectionné';
    dentalTeethData = {};
    renderDentalChart();
    return;
  }
  try {
    const res = await window.api.patient.getById(patientId);
    if (res.success && res.data) {
      if (display) display.textContent = res.data.lastName + ' ' + res.data.firstName;
    }
    await loadDentalTeeth(patientId);
    renderDentalChart();
    await loadDentalTreatments(patientId);
    await updatePatientDentalStats(patientId);
  } catch (e) { console.error('Error selecting dental patient:', e); }
}

function refreshDentalPatientList() { loadDentalPatientList(); }

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

// ========== RENDER DENTAL CHART (CURVED MOUTH) ==========
function renderDentalChart() {
  const container = document.getElementById('dental-chart-container');
  if (!container) return;

  if (!dentalSelectedPatientId) {
    container.innerHTML = `
      <div class="dental-empty-state dental-empty-state-large">
        <div class="dental-empty-state-icon">D</div>
        <div>
          <h4>Sélectionnez un patient</h4>
          <p>Le schéma clinique, les actes et l'imagerie du dossier dentaire s'affichent ici.</p>
        </div>
      </div>
    `;
    return;
  }

  const positions = getToothPositions();

  container.innerHTML =
    '<style>' +
    '.tooth-g{cursor:pointer;transition:transform .12s}' +
    '.tooth-g:hover .tb{filter:brightness(.9);stroke-width:2.5px}' +
    '.tooth-g.sel .tb{stroke:#1d4ed8!important;stroke-width:3px!important}' +
    '.dleg{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:18px}' +
    '.dleg span{padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;box-shadow:0 8px 18px rgba(15,37,63,.05)}' +
    '</style>' +

    '<div class="dental-chart-wrapper">' +

    // Legend
    '<div class="dleg">' +
    Object.entries(TOOTH_STATUSES).map(function(e) {
      var k = e[0], s = e[1];
      return '<span style="background:' + s.color + ';border:1.5px solid ' + s.border + ';color:' + s.tc + '"><b>' + s.icon + '</b> ' + getToothStatusLabel(k) + '</span>';
    }).join('') +
    '</div>' +

    // SVG mouth
    '<svg id="dental-svg" viewBox="0 0 800 500" style="width:100%;max-width:860px;display:block;margin:0 auto;background:linear-gradient(180deg,#fbfdff 0%,#f7fbff 100%);border-radius:22px;border:1px solid rgba(20,93,160,.10);box-shadow:inset 0 1px 0 rgba(255,255,255,.8);">' +
    '<defs>' +
    '<filter id="tSh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.08)"/></filter>' +
    '<linearGradient id="gU" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f9a8b8"/><stop offset="100%" stop-color="#e88da0"/></linearGradient>' +
    '<linearGradient id="gL" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#f9a8b8"/><stop offset="100%" stop-color="#e88da0"/></linearGradient>' +
    '</defs>' +

    // Labels
    '<text x="400" y="24" text-anchor="middle" font-size="14" font-weight="800" fill="#334155">MAXILLAIRE SUPÉRIEUR</text>' +
    '<text x="400" y="490" text-anchor="middle" font-size="14" font-weight="800" fill="#334155">MANDIBULE INFÉRIEURE</text>' +

    // D/G markers
    '<text x="55" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">D</text>' +
    '<text x="745" y="252" font-size="18" font-weight="700" fill="#d1d5db" text-anchor="middle">G</text>' +

    // Center line
    '<line x1="400" y1="28" x2="400" y2="480" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="5,4" opacity="0.4"/>' +

    // Upper gum arch (U-shape, realistic pink)
    '<path d="M 90,165 Q 110,28 400,18 Q 690,28 710,165" fill="url(#gU)" stroke="#d4818f" stroke-width="1.5" opacity="0.3"/>' +

    // Lower gum arch (inverted U)
    '<path d="M 120,335 Q 140,468 400,478 Q 660,468 680,335" fill="url(#gL)" stroke="#d4818f" stroke-width="1.5" opacity="0.3"/>' +

    // Gum line separators
    '<path d="M 90,195 Q 250,210 400,214 Q 550,210 710,195" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +
    '<path d="M 120,305 Q 260,292 400,288 Q 540,292 680,305" fill="none" stroke="#e88da0" stroke-width="1.5" opacity="0.35"/>' +

    // Teeth
    renderAllTeeth(positions) +

    '</svg>' +

    // Tooth detail panel
    '<div id="dental-tooth-detail" style="display:none;margin-top:16px"></div>' +

    '</div>';
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

  // Status icon
  var icon = status !== 'healthy'
    ? '<text x="0" y="5" text-anchor="middle" font-size="' + (isMolar ? 16 : 14) + '" fill="' + si.tc + '" font-weight="bold"' + opa + '>' + si.icon + '</text>'
    : '';

  // Number label
  var ny = pos.jaw === 'upper' ? (hh + 14) : (-hh - 6);

  return '<g class="tooth-g' + (sel ? ' sel' : '') + '" transform="translate(' + pos.x + ',' + pos.y + ') rotate(' + pos.angle + ')" onclick="selectDentalTooth(' + num + ')" filter="url(#tSh)">' +
    roots +
    '<rect class="tb" x="' + (-hw) + '" y="' + (-hh) + '" width="' + pos.w + '" height="' + pos.h + '" rx="' + rx + '" ry="' + rx + '" fill="' + si.color + '" stroke="' + (sel ? '#1d4ed8' : si.border) + '" stroke-width="' + (sel ? 2.5 : 1.5) + '"' + dash + opa + '/>' +
    surf + icon +
    '<text x="0" y="' + ny + '" text-anchor="middle" font-size="11" fill="' + (sel ? '#1d4ed8' : '#6b7280') + '" font-weight="' + (sel ? '700' : '600') + '">' + num + '</text>' +
    '</g>';
}

// ========== TOOTH SELECTION ==========
function selectDentalTooth(toothNumber) {
  dentalSelectedTooth = toothNumber;
  renderDentalChart();
  showToothDetail(toothNumber);
}

function showToothDetail(toothNumber) {
  var panel = document.getElementById('dental-tooth-detail');
  if (!panel) return;
  var data = dentalTeethData[toothNumber];
  var status = data ? data.status : 'healthy';
  var si = TOOTH_STATUSES[status];
  var name = ADULT_TEETH[toothNumber] || ('Dent ' + toothNumber);

  panel.style.display = 'block';
  panel.innerHTML =
    '<div style="background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);border:1px solid rgba(20,93,160,.14);border-radius:20px;padding:24px;box-shadow:0 14px 30px rgba(15,37,63,.08)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:16px;flex-wrap:wrap">' +
    '<div><div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#64748b;text-transform:uppercase;margin-bottom:6px">Fiche clinique</div><h3 style="margin:0;color:#16324f;font-size:22px">Dent N° ' + toothNumber + '</h3><p style="margin:6px 0 0;color:#64748b;font-size:14px">' + name + '</p></div>' +
    '<button onclick="closeDentalDetail()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af">✕</button></div>' +

    '<div style="background:' + si.color + ';border:1px solid ' + si.border + ';border-radius:14px;padding:14px 16px;margin-bottom:16px">' +
    '<strong style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#475569">État actuel</strong><span style="display:block;font-size:18px;margin-top:6px;color:' + si.tc + ';font-weight:800">' + si.icon + ' ' + getToothStatusLabel(status) + '</span></div>' +

    '<div style="margin-bottom:15px"><label style="font-weight:600;display:block;margin-bottom:8px;font-size:14px">Changer l\'état:</label>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px">' +
    Object.entries(TOOTH_STATUSES).map(function(e) {
      var k = e[0], s = e[1];
      return '<button onclick="changeToothStatus(' + toothNumber + ',\'' + k + '\')" style="padding:7px 10px;border-radius:6px;border:1.5px solid ' + s.border + ';background:' + (k === status ? s.border : s.color) + ';color:' + (k === status ? '#fff' : s.tc) + ';cursor:pointer;font-size:13px;font-weight:600;text-align:center">' + s.icon + ' ' + getToothStatusLabel(k) + '</button>';
    }).join('') +
    '</div></div>' +

    '<div style="margin-bottom:15px"><label style="font-weight:600;display:block;margin-bottom:6px;font-size:14px">Notes:</label>' +
    '<textarea id="dental-tooth-notes" rows="2" class="form-control" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:14px" placeholder="Notes sur cette dent...">' + (data && data.notes ? data.notes : '') + '</textarea></div>' +

    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button onclick="saveToothNotes(' + toothNumber + ')" class="btn btn-primary" style="font-size:13px;padding:8px 16px">Sauvegarder</button>' +
    '<button onclick="openTreatmentModal(' + toothNumber + ')" class="btn btn-success" style="font-size:13px;padding:8px 16px">Nouveau traitement</button>' +
    '<button onclick="viewToothHistory(' + toothNumber + ')" class="btn btn-info" style="font-size:13px;padding:8px 16px">Historique</button>' +
    '<button onclick="importDentalImage(\'image\',' + toothNumber + ')" class="btn" style="font-size:13px;padding:8px 16px;background:#f0fdf4;border:1px solid #22c55e;color:#166534">Ajouter image</button>' +
    '<button onclick="viewDentalGallery()" class="btn" style="font-size:13px;padding:8px 16px;background:#eff6ff;border:1px solid #3b82f6;color:#1d4ed8">Imagerie</button>' +
    '</div></div>';
}

function closeDentalDetail() {
  var panel = document.getElementById('dental-tooth-detail');
  if (panel) panel.style.display = 'none';
  dentalSelectedTooth = null;
  renderDentalChart();
}

async function changeToothStatus(toothNumber, newStatus) {
  if (!dentalSelectedPatientId) return;
  try {
    await window.api.dental.saveTooth({
      patientId: dentalSelectedPatientId,
      toothNumber: toothNumber,
      toothName: ADULT_TEETH[toothNumber] || ('Dent ' + toothNumber),
      status: newStatus,
      surfaces: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].surfaces || '') : '',
      notes: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].notes || '') : ''
    });
    if (!dentalTeethData[toothNumber]) dentalTeethData[toothNumber] = {};
    dentalTeethData[toothNumber].status = newStatus;
    renderDentalChart();
    showToothDetail(toothNumber);
    showNotification('Dent ' + toothNumber + ': ' + getToothStatusLabel(newStatus), 'success');
  } catch (e) {
    console.error('Error changing tooth status:', e);
    showNotification('Erreur lors de la mise à jour', 'error');
  }
}

async function saveToothNotes(toothNumber) {
  if (!dentalSelectedPatientId) return;
  var notes = document.getElementById('dental-tooth-notes') ? document.getElementById('dental-tooth-notes').value : '';
  try {
    await window.api.dental.saveTooth({
      patientId: dentalSelectedPatientId,
      toothNumber: toothNumber,
      toothName: ADULT_TEETH[toothNumber] || ('Dent ' + toothNumber),
      status: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].status || 'healthy') : 'healthy',
      surfaces: dentalTeethData[toothNumber] ? (dentalTeethData[toothNumber].surfaces || '') : '',
      notes: notes
    });
    if (!dentalTeethData[toothNumber]) dentalTeethData[toothNumber] = {};
    dentalTeethData[toothNumber].notes = notes;
    showNotification('Notes sauvegardées', 'success');
  } catch (e) { showNotification('Erreur', 'error'); }
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
  if (tabName === 'treatments' && dentalSelectedPatientId) loadDentalTreatments(dentalSelectedPatientId);
  if (tabName === 'plans' && dentalSelectedPatientId) loadDentalPlans(dentalSelectedPatientId);
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
      var ti = TREATMENT_TYPES.find(function(tt) { return tt.value === t.treatmentType; }) || { label: t.treatmentType, icon: '📋' };
      var isPaid = (t.paid || 0) >= (t.cost || 0);
      rows += '<tr class="dental-treatment-row">' +
        '<td>' + formatDate(t.treatmentDate) + '</td>' +
        '<td class="dental-treatment-tooth">' + (t.toothNumber || '—') + '</td>' +
        '<td>' + ti.icon + ' ' + ti.label + '</td>' +
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

function openTreatmentModal(toothNumber) {
  if (!dentalSelectedPatientId) { showNotification('Sélectionnez d\'abord un patient', 'error'); return; }
  closeDentalTreatmentModal();
  var opts = TREATMENT_TYPES.map(function(t) { return '<option value="' + t.value + '">' + t.icon + ' ' + t.label + '</option>'; }).join('');
  var surfaces = ['M (Mésial)', 'D (Distal)', 'O (Occlusal)', 'V (Vestibulaire)', 'L (Lingual)'];
  var surfHtml = surfaces.map(function(s) { return '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" class="dt-surface" value="' + s.charAt(0) + '"> ' + s + '</label>'; }).join('');
  var html = '<div id="dental-treatment-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center">' +
    '<div style="background:#fff;border-radius:16px;padding:30px;width:550px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h3 style="margin:0">Nouveau traitement' + (toothNumber ? ' — Dent ' + toothNumber : '') + '</h3>' +
    '<button onclick="closeDentalTreatmentModal()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button></div>' +
    '<div style="display:grid;gap:12px">' +
    '<div><label style="font-weight:600;font-size:13px">Type *</label><select id="dt-type" class="form-control" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px">' + opts + '</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="font-weight:600;font-size:13px">N° Dent</label><input type="number" id="dt-tooth" class="form-control" value="' + (toothNumber || '') + '" min="11" max="48" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '<div><label style="font-weight:600;font-size:13px">Date</label><input type="date" id="dt-date" class="form-control" value="' + new Date().toISOString().split('T')[0] + '" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div></div>' +
    '<div><label style="font-weight:600;font-size:13px">Surfaces</label><div style="display:flex;gap:8px;margin-top:4px">' + surfHtml + '</div></div>' +
    '<div><label style="font-weight:600;font-size:13px">Description</label><textarea id="dt-description" rows="2" class="form-control" placeholder="Description..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></textarea></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="font-weight:600;font-size:13px">Coût (DA)</label><input type="number" id="dt-cost" class="form-control" value="0" min="0" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div>' +
    '<div><label style="font-weight:600;font-size:13px">Payé (DA)</label><input type="number" id="dt-paid" class="form-control" value="0" min="0" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></div></div>' +
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
    surfaces: surfaces,
    description: document.getElementById('dt-description') ? document.getElementById('dt-description').value : '',
    cost: parseFloat(document.getElementById('dt-cost') ? document.getElementById('dt-cost').value : '0') || 0,
    paid: parseFloat(document.getElementById('dt-paid') ? document.getElementById('dt-paid').value : '0') || 0,
    notes: document.getElementById('dt-notes') ? document.getElementById('dt-notes').value : ''
  };
  try {
    var result = await window.api.dental.createTreatment(data);
    if (result.success) {
      showNotification('Traitement enregistré', 'success');
      closeDentalTreatmentModal();
      if (dentalSelectedPatientId) {
        await loadDentalTreatments(dentalSelectedPatientId);
        await loadDentalTeeth(dentalSelectedPatientId);
        renderDentalChart();
        await updatePatientDentalStats(dentalSelectedPatientId);
        // Also refresh patient-details dental tab if open
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
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var ti = TREATMENT_TYPES.find(function(tt) { return tt.value === h.treatmentType; }) || { label: h.treatmentType, icon: '📋' };
      items += '<div style="border-left:3px solid #0ea5e9;padding:12px 16px;background:#f8fafc;border-radius:0 8px 8px 0">' +
        '<div style="display:flex;justify-content:space-between"><strong>' + ti.icon + ' ' + ti.label + '</strong><span style="color:#6b7280;font-size:12px">' + formatDate(h.treatmentDate) + '</span></div>' +
        (h.description ? '<p style="margin:5px 0 0;color:#374151;font-size:13px">' + h.description + '</p>' : '') +
        (h.cost ? '<p style="margin:3px 0 0;font-weight:600;font-size:13px">' + h.cost.toLocaleString() + ' DA</p>' : '') +
        '</div>';
    }
    var html = '<div id="dental-history-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center">' +
      '<div style="background:#fff;border-radius:16px;padding:30px;width:600px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h3 style="margin:0">Historique clinique — Dent ' + toothNumber + '</h3>' +
      '<button onclick="document.getElementById(\'dental-history-modal\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button></div>' +
      '<p style="color:#6b7280;margin-bottom:15px">' + (ADULT_TEETH[toothNumber] || '') + '</p>' +
      (history.length === 0 ? '<p style="text-align:center;color:#9ca3af;padding:30px">Aucun historique</p>' : '<div style="display:flex;flex-direction:column;gap:12px">' + items + '</div>') +
      '</div></div>';
    var existing = document.getElementById('dental-history-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) { console.error('Error loading tooth history:', e); }
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
      placeholder: 'Tapez la premiere lettre du patient...',
      emptyMessage: 'Tapez la premiere lettre du patient',
      loadingMessage: 'Recherche des patients...',
      noResultsMessage: 'Aucun patient commence par cette recherche',
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

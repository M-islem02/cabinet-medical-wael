// --- Settings ---

const DEFAULT_CABINET_PHONE = '';
const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;
const DEFAULT_DOCUMENT_TYPE_COLORS = {
  prescription: '#1a8c7e',
  certificate: '#0ea5e9',
  invoice: '#f59e0b',
  rapport: '#8b5cf6',
  consultation: '#ef4444',
  generic: '#1a8c7e'
};
const DOCUMENT_STYLE_VARIANTS = new Set([
  'classic', 'sidebar', 'gradient-header', 'minimal',
  'letterhead', 'dental-letterhead', 'professional-center',
  'executive', 'clinical-grid', 'wave'
]);

let activeSettingsPage = 'general';
let selectedSignedLicenseContent = '';

function ensureSettingsAdminCardsVisibility() {
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  const role = typeof currentUserRole !== 'undefined' ? currentUserRole : (localStorage.getItem('currentUserRole') || '');
  const isDoctor = role === 'doctor' || role === 'dentist' || role === 'test';
  const isAdmin = currentUserIsAdmin === true || isDoctor || isSuperAdminUser;
  const userManagementCard = document.getElementById('user-management-card');
  const licenseInfoCard = document.getElementById('license-info-card');
  const dbConfigCard = document.getElementById('db-config-card');

  const setCardVisibility = (card, visible) => {
    if (!card) return;
    card.classList.toggle('role-hidden', !visible);
    card.classList.toggle('hidden', !visible);
    if (visible) {
      card.style.removeProperty('display');
      card.removeAttribute('aria-hidden');
    } else {
      card.style.display = 'none';
      card.setAttribute('aria-hidden', 'true');
    }
  };

  setCardVisibility(userManagementCard, isAdmin || isSuperAdminUser);
  setCardVisibility(licenseInfoCard, isSuperAdminUser);
  setCardVisibility(dbConfigCard, isSuperAdminUser);
}

function switchSettingsPage(page = 'general') {
  document.documentElement.classList.add('settings-pages-ready');
  ensureSettingsAdminCardsVisibility();
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';

  const visiblePages = new Set();
  document.querySelectorAll('[data-settings-page]').forEach((card) => {
    if (card.classList.contains('role-hidden')) return;
    String(card.dataset.settingsPage || '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((pageKey) => visiblePages.add(pageKey));
  });

  document.querySelectorAll('.settings-page-tab').forEach((button) => {
    const tabName = button.dataset.settingsTab || '';
    const isSuperAdminOnly = tabName === 'license' || tabName === 'database';
    const isVisible = isSuperAdminOnly ? isSuperAdminUser : visiblePages.has(tabName);
    button.classList.toggle('role-hidden', !isVisible);
    button.disabled = !isVisible;
    if (!isVisible) {
      button.style.display = 'none';
    } else {
      button.style.removeProperty('display');
    }
  });

  const requestedPage = page || 'general';
  activeSettingsPage = visiblePages.has(requestedPage)
    ? requestedPage
    : (visiblePages.values().next().value || 'general');

  document.querySelectorAll('.settings-page-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsTab === activeSettingsPage);
  });

  document.querySelectorAll('[data-settings-page]').forEach((card) => {
    if (card.classList.contains('role-hidden')) {
      card.classList.remove('settings-page-hidden');
      card.style.display = 'none';
      return;
    }
    const pages = String(card.dataset.settingsPage || '')
      .split(/\s+/)
      .filter(Boolean);
    const matches = pages.includes(activeSettingsPage);
    card.classList.toggle('settings-page-hidden', !matches);
    if (matches) {
      card.style.removeProperty('display');
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });

  if (activeSettingsPage === 'prescriptions' && typeof loadPrescriptionTemplateSettings === 'function') {
    loadPrescriptionTemplateSettings();
  }
  if (activeSettingsPage === 'users' && typeof loadUsersList === 'function') {
    loadUsersList();
  }
  if (activeSettingsPage === 'license' && typeof loadLicenseStatus === 'function') {
    loadLicenseStatus();
  }
  if (activeSettingsPage === 'database' && typeof refreshDbStatus === 'function') {
    refreshDbStatus();
  }
  if (activeSettingsPage === 'devices' && typeof refreshDeviceOptions === 'function') {
    refreshDeviceOptions();
  }
  if (activeSettingsPage === 'operations' && typeof loadSettingsOperationsCatalog === 'function') {
    loadSettingsOperationsCatalog();
  }
}

function normalizeHexColor(value, fallback = '#1a8c7e') {
  const raw = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

function normalizeDocumentStyleVariant(value) {
  const raw = String(value || '').trim();
  if (raw === 'modern') return 'gradient-header';
  return DOCUMENT_STYLE_VARIANTS.has(raw) ? raw : 'classic';
}

function mixHexColor(color, target = '#ffffff', amount = 0.82) {
  const parse = (value) => {
    const raw = String(value || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  };
  const from = parse(color) || parse('#1a8c7e');
  const to = parse(target) || parse('#ffffff');
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function getReadableTextColor(backgroundColor) {
  const raw = String(backgroundColor || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '#ffffff';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? '#111827' : '#ffffff';
}

function updateDocumentStylePreview() {
  const preview = document.getElementById('document-style-preview');
  if (!preview) return;
  const accent = normalizeHexColor(document.getElementById('document-primary-color')?.value, '#1a8c7e');
  const style = normalizeDocumentStyleVariant(document.getElementById('document-style-variant')?.value);
  const opacity = Math.min(35, Math.max(2, Number(document.getElementById('document-watermark-opacity')?.value) || 5));
  const logoDataUrl = document.getElementById('cabinet-logo-data')?.value || '';
  const fontKey = String(document.getElementById('document-font-family')?.value || 'segoe').toLowerCase().trim();
  const fontMap = {
    segoe: '"Segoe UI", "Calibri", "Noto Sans", "Arial", sans-serif',
    arial: 'Arial, Helvetica, "Nimbus Sans L", sans-serif',
    times: '"Times New Roman", Times, "Liberation Serif", serif',
    georgia: 'Georgia, "Bitstream Charter", "Century Schoolbook L", serif',
    garamond: '"EB Garamond", "Garamond", "Baskerville", "Palatino Linotype", serif',
    tahoma: 'Tahoma, Geneva, Verdana, sans-serif',
    trebuchet: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif',
    verdana: 'Verdana, Geneva, sans-serif'
  };
  preview.style.fontFamily = fontMap[fontKey] || fontMap.segoe;
  preview.dataset.style = style;
  preview.style.setProperty('--preview-accent', accent);
  preview.style.setProperty('--preview-accent-soft', mixHexColor(accent, '#ffffff', 0.35));
  preview.style.setProperty('--preview-on-accent', getReadableTextColor(accent));
  preview.style.setProperty('--preview-watermark-opacity', (opacity / 100).toFixed(2));
  preview.querySelectorAll('.preview-logo').forEach((logo) => {
    const hasLogo = logoDataUrl.startsWith('data:image/');
    logo.textContent = hasLogo ? '' : 'LOGO';
    logo.style.backgroundImage = hasLogo ? `url("${logoDataUrl}")` : '';
    logo.style.backgroundPosition = hasLogo ? 'center' : '';
    logo.style.backgroundRepeat = hasLogo ? 'no-repeat' : '';
    logo.style.backgroundSize = hasLogo ? 'contain' : '';
  });

  updateHeaderLivePreview();
}

function getComposedDoctorSpecialty() {
  const line1 = document.getElementById('doctor-specialty-line1')?.value?.trim() || '';
  const line2 = document.getElementById('doctor-specialty-line2')?.value?.trim() || '';
  if (line1 && line2) {
    return `${line1}\n${line2}`;
  }
  if (line1) return line1;
  if (line2) return line2;
  return document.getElementById('doctor-specialty')?.value?.trim() || '';
}

function onDoctorSpecialtyLineInput() {
  const composed = getComposedDoctorSpecialty();
  const hiddenEl = document.getElementById('doctor-specialty');
  if (hiddenEl) hiddenEl.value = composed;
  updateHeaderLivePreview();
  if (typeof triggerDocumentSettingsAutoSave === 'function') {
    triggerDocumentSettingsAutoSave();
  }
}
window.getComposedDoctorSpecialty = getComposedDoctorSpecialty;
window.onDoctorSpecialtyLineInput = onDoctorSpecialtyLineInput;

function updateHeaderLivePreview() {
  const container = document.getElementById('settings-header-live-preview-box');
  if (!container) return;

  const doctorName = document.getElementById('doctor-name-input')?.value?.trim() || document.getElementById('cabinet-name')?.value?.trim() || cachedSettings?.doctorName || cachedSettings?.cabinetName || 'DR. NADIR MALOUM';
  const doctorSpecialty = getComposedDoctorSpecialty() || document.getElementById('cabinet-specialty')?.value?.trim() || cachedSettings?.doctorSpecialty || cachedSettings?.cabinetSpecialty || 'ORL ET CHIRURGIE CERVICO-FACIALE\nCHIRURGIE ENDOSCOPIQUE DU NEZ ET DES SINUS';
  const doctorRPPS = document.getElementById('doctor-rpps')?.value?.trim() || document.getElementById('cabinet-rpps')?.value?.trim() || cachedSettings?.doctorRPPS || cachedSettings?.cabinetRPPS || '3149/23';
  const primaryColor = normalizeHexColor(document.getElementById('document-primary-color')?.value, '#0284c7');
  
  const docNameScale = (Number(document.getElementById('document-doctor-name-scale')?.value) || 120) / 100;
  const specialtyScale = (Number(document.getElementById('document-specialty-scale')?.value) || 100) / 100;
  const metaScale = (Number(document.getElementById('document-meta-scale')?.value) || 100) / 100;
  const logoScale = (Number(document.getElementById('document-logo-scale')?.value) || 100) / 100;

  const docNameFont = (10.5 * docNameScale).toFixed(1) + 'pt';
  const specialtyFont = (7.8 * specialtyScale).toFixed(1) + 'pt';
  const metaFont = (7.5 * metaScale).toFixed(1) + 'pt';
  const logoSize = Math.round(52 * logoScale) + 'px';

  const logoDataUrl = document.getElementById('cabinet-logo-data')?.value || (typeof getCabinetLogoDataUrl === 'function' ? getCabinetLogoDataUrl() : '') || 'assets/logo.png';

  const formatSpecialty = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return ['', ''];
    if (raw.includes('\n')) {
      const parts = raw.split('\n').map(p => p.trim()).filter(Boolean);
      return [parts[0] || '', parts.slice(1).join(' ')];
    }
    const medMatch = raw.match(/^(Médecin\s+spécialiste\s+en|Spécialiste\s+en)\s+(.*)$/i);
    if (medMatch) return [medMatch[1].toUpperCase(), medMatch[2].toUpperCase()];
    const orlMatch = raw.match(/^(ORL\s*(?:&|et)\s*Chirurgi[a-z]*\s*cervico[\s-]faciale)\s*(?:[-/&,]|\s)\s*(Chirurgi[a-z]*\s*endoscopique.*)$/i);
    if (orlMatch) return [orlMatch[1].toUpperCase(), orlMatch[2].toUpperCase()];
    let bestIdx = -1, bestDelta = Infinity;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === ' ') {
        const delta = Math.abs(i - raw.length / 2);
        if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
      }
    }
    if (bestIdx > 0) return [raw.substring(0, bestIdx).trim().toUpperCase(), raw.substring(bestIdx + 1).trim().toUpperCase()];
    return [raw.toUpperCase(), ''];
  };

  const specParts = formatSpecialty(doctorSpecialty);
  const dateStr = new Date().toLocaleDateString('fr-FR');
  const safeDoctorName = typeof escapeHtml === 'function' ? escapeHtml(doctorName.toUpperCase()) : doctorName.toUpperCase();

  container.innerHTML = `
    <div style="width: 100%; max-width: 780px; margin: 0 auto; background: #ffffff; padding: 18px 16px; border-top: 2.2px solid ${primaryColor}; border-bottom: 2.2px solid ${primaryColor}; font-family: Segoe UI, sans-serif;">
      <div style="display: grid; grid-template-columns: minmax(0, 1.25fr) auto minmax(0, 1fr); align-items: center; gap: 14px;">
        <!-- Left: Doctor Info -->
        <div style="text-align: left; min-width: 0;">
          <div style="font-size: ${docNameFont}; font-weight: 800; color: ${primaryColor}; text-transform: uppercase; line-height: 1.2; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            DR. ${safeDoctorName}
          </div>
          <div style="font-size: ${specialtyFont}; font-weight: 700; color: #000000; text-transform: uppercase; line-height: 1.25; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${specParts[0]}
          </div>
          ${specParts[1] ? `
            <div style="font-size: ${specialtyFont}; font-weight: 700; color: #000000; text-transform: uppercase; line-height: 1.25; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${specParts[1]}
            </div>
          ` : ''}
          ${doctorRPPS ? `
            <div style="font-size: ${metaFont}; font-weight: 700; color: #1e293b; margin-top: 4px;">
              <span style="color: ${primaryColor}; font-weight: 800;">N° D'ORDRE :</span> ${doctorRPPS}
            </div>
          ` : ''}
        </div>

        <!-- Center: Logo -->
        <div style="display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <div style="width: ${logoSize}; height: ${logoSize}; max-width: 120px; max-height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <img src="${logoDataUrl}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;">
          </div>
        </div>

        <!-- Right: Patient Info -->
        <div style="text-align: left; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3.5px; font-size: ${metaFont}; min-width: 0; padding-left: 8px;">
          <div style="white-space: nowrap;"><span style="font-weight: 800; color: ${primaryColor};">NOM :</span> <span style="font-weight: 700; color: #000000;">BENALI</span></div>
          <div style="white-space: nowrap;"><span style="font-weight: 800; color: ${primaryColor};">PRÉNOM :</span> <span style="font-weight: 700; color: #000000;">KARIM</span></div>
          <div style="white-space: nowrap;"><span style="font-weight: 800; color: ${primaryColor};">ÂGE :</span> <span style="font-weight: 700; color: #000000;">34 ans</span></div>
          <div style="white-space: nowrap;"><span style="font-weight: 800; color: ${primaryColor};">ÉMIS LE :</span> <span style="font-weight: 700; color: #000000;">${dateStr}</span></div>
        </div>
      </div>
    </div>
  `;
}

window.updateHeaderLivePreview = updateHeaderLivePreview;

function parseDocumentTypeColors(rawValue) {
  if (!rawValue) return { ...DEFAULT_DOCUMENT_TYPE_COLORS };
  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    return {
      prescription: normalizeHexColor(parsed?.prescription, DEFAULT_DOCUMENT_TYPE_COLORS.prescription),
      certificate: normalizeHexColor(parsed?.certificate, DEFAULT_DOCUMENT_TYPE_COLORS.certificate),
      invoice: normalizeHexColor(parsed?.invoice, DEFAULT_DOCUMENT_TYPE_COLORS.invoice),
      rapport: normalizeHexColor(parsed?.rapport, DEFAULT_DOCUMENT_TYPE_COLORS.rapport),
      consultation: normalizeHexColor(parsed?.consultation, DEFAULT_DOCUMENT_TYPE_COLORS.consultation),
      generic: normalizeHexColor(parsed?.generic, DEFAULT_DOCUMENT_TYPE_COLORS.generic)
    };
  } catch (_) {
    return { ...DEFAULT_DOCUMENT_TYPE_COLORS };
  }
}

function collectDocumentTypeColorsFromInputs() {
  const globalColor = normalizeHexColor(document.getElementById('document-primary-color')?.value, '#1a8c7e');
  return {
    prescription: globalColor,
    certificate: globalColor,
    invoice: globalColor,
    rapport: globalColor,
    consultation: globalColor,
    generic: globalColor
  };
}

function updateCabinetLogoPreview(logoDataUrl = '') {
  const hiddenField = document.getElementById('cabinet-logo-data');
  const previewImg = document.getElementById('cabinet-logo-preview');
  const placeholder = document.getElementById('cabinet-logo-placeholder');

  const safeLogo = typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')
    ? logoDataUrl
    : '';

  if (hiddenField) hiddenField.value = safeLogo;

  if (previewImg) {
    if (safeLogo) {
      previewImg.src = safeLogo;
      previewImg.style.display = 'block';
    } else {
      previewImg.removeAttribute('src');
      previewImg.style.display = 'none';
    }
  }

  if (placeholder) {
    placeholder.style.display = safeLogo ? 'none' : 'flex';
  }

  updateDocumentStylePreview();
}

function updateAppLogoPreview(logoDataUrl = '') {
  const hiddenField = document.getElementById('app-logo-data');
  const previewImg = document.getElementById('app-logo-preview');
  const placeholder = document.getElementById('app-logo-placeholder');
  const safeLogo = typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/') ? logoDataUrl : '';

  if (hiddenField) hiddenField.value = safeLogo;
  if (previewImg) {
    if (safeLogo) {
      previewImg.src = safeLogo;
      previewImg.style.display = 'block';
    } else {
      previewImg.removeAttribute('src');
      previewImg.style.display = 'none';
    }
  }
  if (placeholder) placeholder.style.display = safeLogo ? 'none' : 'flex';

  document.querySelectorAll('.app-brand-logo').forEach((logo) => {
    logo.src = safeLogo || (typeof getDefaultAppBrandLogoSrc === 'function' ? getDefaultAppBrandLogoSrc() : 'assets/logo.png');
    logo.classList.toggle('app-brand-logo-custom', Boolean(safeLogo));
  });
}

function updateCabinetWatermarkLogoPreview(logoDataUrl = '') {
  const hiddenField = document.getElementById('cabinet-watermark-logo-data');
  const previewImg = document.getElementById('cabinet-watermark-logo-preview');
  const placeholder = document.getElementById('cabinet-watermark-logo-placeholder');

  const safeLogo = typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')
    ? logoDataUrl
    : '';

  if (hiddenField) hiddenField.value = safeLogo;

  if (previewImg) {
    if (safeLogo) {
      previewImg.src = safeLogo;
      previewImg.style.display = 'block';
    } else {
      previewImg.removeAttribute('src');
      previewImg.style.display = 'none';
    }
  }

  if (placeholder) {
    placeholder.style.display = safeLogo ? 'none' : 'flex';
  }
}

let explicitClearCabinetLogo = false;
let explicitClearAppLogo = false;
let explicitClearWatermarkLogo = false;

function clearCabinetLogo() {
  explicitClearCabinetLogo = true;
  try { localStorage.removeItem('medcareso_cabinet_logo'); } catch {}
  updateCabinetLogoPreview('');
  const fileInput = document.getElementById('cabinet-logo-file');
  if (fileInput) fileInput.value = '';
}

function clearAppLogo() {
  explicitClearAppLogo = true;
  try { localStorage.removeItem('medcareso_app_logo'); } catch {}
  updateAppLogoPreview('');
  updateAppLogoSelectionStatus('');
  const fileInput = document.getElementById('app-logo-file');
  if (fileInput) fileInput.value = '';
}

function updateAppLogoSelectionStatus(fileName = '') {
  const status = document.getElementById('app-logo-selection-status');
  if (!status) return;
  status.textContent = fileName
    ? `${fileName} sélectionné. Cliquez sur « Enregistrer le logo » pour le conserver.`
    : 'Logo MedCareSO sélectionné. Cliquez sur « Enregistrer le logo » pour confirmer.';
  status.classList.toggle('has-selection', Boolean(fileName));
}

function clearCabinetWatermarkLogo() {
  explicitClearWatermarkLogo = true;
  try { localStorage.removeItem('medcareso_watermark_logo'); } catch {}
  updateCabinetWatermarkLogoPreview('');
  const fileInput = document.getElementById('cabinet-watermark-logo-file');
  if (fileInput) fileInput.value = '';
}

function updateWatermarkOpacityLabel(value) {
  const output = document.getElementById('document-watermark-opacity-value');
  if (!output) return;
  const safe = Math.min(35, Math.max(2, Number(value) || 5));
  output.textContent = `${safe}%`;
  updateDocumentStylePreview();
}

async function handleCabinetLogoChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) {
    showNotification('Le logo doit être une image (PNG, JPG, WEBP ou SVG)', 'error');
    event.target.value = '';
    return;
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    showNotification('Logo trop lourd (max 2 MB)', 'error');
    event.target.value = '';
    return;
  }

  try {
    explicitClearCabinetLogo = false;
    const logoDataUrl = await readFileAsBase64(file);
    try { localStorage.setItem('medcareso_cabinet_logo', logoDataUrl); } catch {}
    updateCabinetLogoPreview(logoDataUrl);
  } catch (error) {
    console.error('Error reading logo file:', error);
    showNotification('Impossible de lire le fichier logo', 'error');
  }
}

async function handleAppLogoChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    showNotification('Le logo de l’application doit être une image', 'error');
    event.target.value = '';
    return;
  }
  if (file.size > MAX_LOGO_FILE_SIZE) {
    showNotification('Logo trop lourd (max 2 MB)', 'error');
    event.target.value = '';
    return;
  }
  try {
    explicitClearAppLogo = false;
    const logoDataUrl = await readFileAsBase64(file);
    try { localStorage.setItem('medcareso_app_logo', logoDataUrl); } catch {}
    updateAppLogoPreview(logoDataUrl);
    updateAppLogoSelectionStatus(file.name);
  } catch (error) {
    console.error('Error reading application logo:', error);
    showNotification('Impossible de lire le logo de l’application', 'error');
  }
}

async function ensurePracticeAdminAccess() {
  if (currentUserIsAdmin) return true;
  const claimResult = await window.api.settings.claimPracticeAdmin();
  if (!claimResult?.success) {
    showNotification(claimResult?.error || 'Accès réservé au médecin administrateur', 'warning');
    return false;
  }
  currentUserIsAdmin = true;
  localStorage.setItem('currentUserIsAdmin', 'true');
  document.body.classList.add('doctor-admin-mode');
  if (typeof updateAdminUI === 'function') updateAdminUI();
  ensureSettingsAdminCardsVisibility();
  if (claimResult.claimed) {
    showNotification('Administration du cabinet restaurée pour ce compte praticien', 'success');
  }
  return true;
}

async function chooseApplicationLogo() {
  try {
    if (!await ensurePracticeAdminAccess()) return;
    const result = await window.api.settings.chooseAppLogo();
    if (result?.canceled) return;
    if (!result?.success || !result.dataUrl) {
      throw new Error(result?.error || 'Impossible de choisir ce logo');
    }
    updateAppLogoPreview(result.dataUrl);
    updateAppLogoSelectionStatus(result.fileName || 'Logo');
  } catch (error) {
    showNotification(error.message || 'Impossible de choisir le logo', 'error');
  }
}

async function useBundledTransparentAppLogo() {
  try {
    const response = await fetch('../../assets/app-logo-tooth-transparent.png');
    if (!response.ok) throw new Error('Logo introuvable');
    const blob = await response.blob();
    updateAppLogoPreview(await readFileAsBase64(blob));
    updateAppLogoSelectionStatus('Logo dent transparent');
  } catch (error) {
    console.error('Error loading bundled application logo:', error);
    showNotification('Impossible de charger le logo dent transparent', 'error');
  }
}

async function handleCabinetWatermarkLogoChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) {
    showNotification('Le watermark doit être une image (PNG, JPG, WEBP ou SVG)', 'error');
    event.target.value = '';
    return;
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    showNotification('Watermark trop lourd (max 2 MB)', 'error');
    event.target.value = '';
    return;
  }

  try {
    const logoDataUrl = await readFileAsBase64(file);
    updateCabinetWatermarkLogoPreview(logoDataUrl);
  } catch (error) {
    console.error('Error reading watermark logo file:', error);
    showNotification('Impossible de lire le fichier watermark', 'error');
  }
}

function setSelectOptions(selectId, options, selectedValue, placeholderLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const normalizedOptions = Array.isArray(options) ? [...options] : [];
  if (selectedValue && !normalizedOptions.some((option) => (option.value ?? option.id ?? option.name) === selectedValue)) {
    normalizedOptions.unshift({
      value: selectedValue,
      label: `${selectedValue} • enregistré`
    });
  }
  select.innerHTML = [
    `<option value="">${placeholderLabel}</option>`,
    ...normalizedOptions.map((option) => {
      const value = option.value ?? option.id ?? option.name ?? '';
      const label = option.label ?? option.displayName ?? option.name ?? option.id ?? value;
      return `<option value="${escapeHTML(String(value))}">${escapeHTML(String(label))}</option>`;
    })
  ].join('');

  if (selectedValue) {
    select.value = selectedValue;
  }
}

async function loadPeripheralOptions(settings = {}) {
  try {
    const printersResult = await window.api.settings.listPrinters();
    const printerOptions = printersResult.success
      ? (printersResult.data || []).map((printer) => ({
          value: printer.name,
          label: `${printer.displayName || printer.name}${printer.isDefault ? ' • défaut' : ''}`
        }))
      : [];

    const defaultPrinterValue = settings.preferredPrinter
      || (printersResult.success
        ? (printersResult.data || []).find((printer) => printer.isDefault)?.name || ''
        : '');

    setSelectOptions('preferred-printer', printerOptions, defaultPrinterValue, 'Imprimante A4 / standard');
    setSelectOptions('preferred-thermal-printer', printerOptions, settings.preferredThermalPrinter, 'Imprimante ticket / thermique');

    const scannersResult = await window.api.settings.listScanners();
    const scannerOptions = scannersResult.success
      ? (scannersResult.data || []).map((scanner) => ({
          value: scanner.id,
          label: scanner.label || scanner.id
        }))
      : [];

    setSelectOptions('preferred-scanner', scannerOptions, settings.preferredScanner, 'Scanner USB');

    const radioExportFolderEl = document.getElementById('radio-export-folder-path');
    if (radioExportFolderEl) {
      radioExportFolderEl.value = settings.radioExportFolderPath || '';
    }
  } catch (error) {
    console.error('Error loading device options:', error);
  }
}

async function pickRadioExportFolder() {
  try {
    const res = await window.api.file.selectFolder();
    if (res?.success && res.folderPath) {
      const input = document.getElementById('radio-export-folder-path');
      if (input) input.value = res.folderPath;
      showNotification('Dossier Radio sélectionné : ' + res.folderPath, 'success');
    }
  } catch (err) {
    console.error('Error selecting radio folder:', err);
  }
}
window.pickRadioExportFolder = pickRadioExportFolder;

async function loadPublicBookingShareData() {
  const statusEl = document.getElementById('public-booking-status');
  const localUrlEl = document.getElementById('public-booking-local-url');
  const publicUrlEl = document.getElementById('public-booking-public-url-display');
  const qrImg = document.getElementById('public-booking-qr-image');
  const qrEmpty = document.getElementById('public-booking-qr-empty');

  try {
    const result = await window.api.publicBooking.getStatus();
    const shareData = result.data || null;
    if (!shareData) {
      if (statusEl) statusEl.textContent = 'Portail patient indisponible';
      if (localUrlEl) localUrlEl.value = '';
      if (publicUrlEl) publicUrlEl.value = '';
      if (qrImg) qrImg.style.display = 'none';
      if (qrEmpty) qrEmpty.style.display = 'block';
      return;
    }
    if (statusEl) {
      if (!result.success) {
        statusEl.textContent = `Erreur portail patient: ${result.error || shareData.lastError || 'indisponible'}`;
      } else if (!shareData.enabled) {
        statusEl.textContent = 'Portail patient désactivé';
      } else if (shareData.running) {
        statusEl.textContent = `Portail actif sur le port ${shareData.port}`;
      } else {
        statusEl.textContent = shareData.lastError
          ? `Erreur portail patient: ${shareData.lastError}`
          : 'Portail patient en attente';
      }
    }

    if (localUrlEl) localUrlEl.value = shareData.localUrl || '';
    if (publicUrlEl) publicUrlEl.value = shareData.publicUrl || '';

    if (qrImg && shareData.qrDataUrl) {
      qrImg.src = shareData.qrDataUrl;
      qrImg.style.display = 'block';
      if (qrEmpty) qrEmpty.style.display = 'none';
    } else {
      if (qrImg) qrImg.style.display = 'none';
      if (qrEmpty) qrEmpty.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading public booking share data:', error);
    if (statusEl) statusEl.textContent = 'Erreur chargement portail patient';
  }
}

async function copyPublicBookingLink() {
  const link = document.getElementById('public-booking-public-url-display')?.value
    || document.getElementById('public-booking-local-url')?.value
    || '';
  if (!link) {
    showNotification('Activez et enregistrez d’abord le portail patient', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showNotification('Lien du portail copié', 'success');
  } catch (error) {
    console.error('Unable to copy public portal link:', error);
    showNotification('Copie du lien impossible', 'error');
  }
}

function printPublicBookingQr() {
  const qrDataUrl = document.getElementById('public-booking-qr-image')?.src || '';
  if (!qrDataUrl.startsWith('data:image/')) {
    showNotification('Activez et enregistrez d’abord le portail patient', 'warning');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=620,height=760');
  if (!printWindow) {
    showNotification('Fenêtre d’impression bloquée', 'error');
    return;
  }
  printWindow.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QR accueil patient</title>
    <style>body{font-family:Segoe UI,sans-serif;text-align:center;padding:48px;color:#0f172a}img{width:360px;height:360px}h1{font-size:28px;margin:0 0 12px}p{font-size:18px;line-height:1.5;color:#475569}</style>
    </head><body><h1>Scannez pour signaler votre arrivée</h1><p>Avec ou sans rendez-vous, rejoignez la file d’attente depuis votre téléphone.</p><img src="${qrDataUrl}" alt="QR code"><p>Connectez-vous au Wi-Fi du cabinet avant de scanner.</p></body></html>`);
  printWindow.document.close();
  printWindow.addEventListener('load', () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
}

function getInterfaceTextScalePercent() {
  const storageKey = (typeof APP_ZOOM_STORAGE_KEY !== 'undefined') ? APP_ZOOM_STORAGE_KEY : 'medcareso_app_zoom_factor';
  const raw = Number(localStorage.getItem(storageKey));
  let factor = Number.isFinite(raw) ? raw : 1;
  if (typeof clampAppZoom === 'function') {
    factor = clampAppZoom(factor);
  } else {
    factor = Math.min(1.4, Math.max(0.75, factor));
  }
  return Math.round(factor * 100);
}

function loadInterfaceTextScale() {
  const slider = document.getElementById('app-text-scale');
  const label = document.getElementById('app-text-scale-label');
  if (!slider) return;
  const percent = getInterfaceTextScalePercent();
  slider.value = String(percent);
  if (label) label.textContent = `${percent}%`;
}

async function applyInterfaceTextScale() {
  const slider = document.getElementById('app-text-scale');
  if (!slider) return;
  const percent = Number(slider.value) || 100;
  if (typeof applyAppZoom === 'function') {
    await applyAppZoom(percent / 100);
  } else {
    const storageKey = (typeof APP_ZOOM_STORAGE_KEY !== 'undefined') ? APP_ZOOM_STORAGE_KEY : 'medcareso_app_zoom_factor';
    const safe = Math.min(1.4, Math.max(0.75, percent / 100));
    localStorage.setItem(storageKey, String(safe));
  }
  loadInterfaceTextScale();
}

async function resetInterfaceTextScale() {
  const slider = document.getElementById('app-text-scale');
  if (!slider) return;
  const defaultZoom = (typeof APP_ZOOM_DEFAULT !== 'undefined') ? APP_ZOOM_DEFAULT : 1;
  if (typeof applyAppZoom === 'function') {
    await applyAppZoom(defaultZoom);
  } else {
    const storageKey = (typeof APP_ZOOM_STORAGE_KEY !== 'undefined') ? APP_ZOOM_STORAGE_KEY : 'medcareso_app_zoom_factor';
    localStorage.setItem(storageKey, String(defaultZoom));
  }
  loadInterfaceTextScale();
}

function setupInterfaceTextScaleControls() {
  const slider = document.getElementById('app-text-scale');
  if (!slider) return;
  if (slider.dataset.textScaleBound === 'true') return;
  slider.dataset.textScaleBound = 'true';
  slider.addEventListener('input', () => { applyInterfaceTextScale(); });
  slider.addEventListener('change', () => { applyInterfaceTextScale(); });
}

window.applyInterfaceTextScale = applyInterfaceTextScale;
window.resetInterfaceTextScale = resetInterfaceTextScale;

const APP_DISPLAY_MODE_STORAGE_KEY = 'medcareso_app_display_mode';
let cachedDisplayInfo = null;

async function loadDisplayResolutionSettings() {
  const select = document.getElementById('app-display-mode-select');
  const resText = document.getElementById('detected-screen-resolution-text');
  const badge = document.getElementById('detected-screen-resolution-badge');

  try {
    const res = typeof window.api?.settings?.getDisplayInfo === 'function'
      ? await window.api.settings.getDisplayInfo()
      : (typeof window.api?.app?.getDisplayInfo === 'function' ? await window.api.app.getDisplayInfo() : null);

    if (res && res.success && res.data) {
      cachedDisplayInfo = res.data;
      if (resText) {
        resText.textContent = `${cachedDisplayInfo.formattedResolution} (${cachedDisplayInfo.ratioLabel})`;
      }
      if (badge) {
        badge.className = cachedDisplayInfo.isSquareOrCompact ? 'badge badge-warning' : 'badge badge-success';
        badge.textContent = cachedDisplayInfo.isSquareOrCompact ? 'Format compact détecté' : 'Format 16:9 standard';
      }
    } else {
      const screenW = window.screen?.width || window.innerWidth;
      const screenH = window.screen?.height || window.innerHeight;
      const ratio = screenW / (screenH || 1);
      const isSquare = ratio < 1.55;
      cachedDisplayInfo = {
        width: screenW,
        height: screenH,
        ratio: Number(ratio.toFixed(2)),
        isSquareOrCompact: isSquare,
        formattedResolution: `${screenW} × ${screenH}`,
        ratioLabel: isSquare ? 'Format compact / carré (~5:4 ou 4:3)' : 'Format large (16:9 / 16:10)'
      };
      if (resText) {
        resText.textContent = `${screenW} × ${screenH} (${cachedDisplayInfo.ratioLabel})`;
      }
      if (badge) {
        badge.className = isSquare ? 'badge badge-warning' : 'badge badge-success';
        badge.textContent = isSquare ? 'Format compact détecté' : 'Format standard';
      }
    }
  } catch (err) {
    console.warn('Error reading display info:', err);
  }

  const savedMode = localStorage.getItem(APP_DISPLAY_MODE_STORAGE_KEY) || 'auto';
  if (select) {
    select.value = savedMode;
  }
  applyDisplayMode(savedMode);
}

function onDisplayModeChange(mode) {
  localStorage.setItem(APP_DISPLAY_MODE_STORAGE_KEY, mode || 'auto');
  applyDisplayMode(mode);
  if (typeof showNotification === 'function') {
    showNotification('Mode d\'affichage d\'écran mis à jour', 'success');
  }
}

function applyDisplayMode(mode = 'auto') {
  const isCompact = mode === 'compact-square' || (mode === 'auto' && cachedDisplayInfo?.isSquareOrCompact);
  document.documentElement.classList.toggle('display-compact-square', Boolean(isCompact));
  document.body.classList.toggle('display-compact-square', Boolean(isCompact));
  document.documentElement.setAttribute('data-screen-mode', isCompact ? 'compact-square' : 'standard');
}

window.loadDisplayResolutionSettings = loadDisplayResolutionSettings;
window.onDisplayModeChange = onDisplayModeChange;
window.applyDisplayMode = applyDisplayMode;

async function loadSettings() {
  try {
    const result = await window.api.settings.get();
    const s = result.success && result.data ? result.data : {};
    cachedSettings = s;
    setupInterfaceTextScaleControls();
    loadInterfaceTextScale();
    loadDisplayResolutionSettings();
    document.getElementById('cabinet-name').value = s.cabinetName || '';
    if (document.getElementById('cabinet-name-arabic')) {
      document.getElementById('cabinet-name-arabic').value = s.cabinetNameArabic || '';
    }
    document.getElementById('cabinet-address').value = s.cabinetAddress || '';
    document.getElementById('cabinet-phone').value = s.cabinetPhone || DEFAULT_CABINET_PHONE;
    document.getElementById('cabinet-email').value = s.cabinetEmail || '';
    document.getElementById('doctor-name-input').value = s.doctorName || '';
    document.getElementById('doctor-rpps').value = s.doctorRPPS || '';
    const rawSpecialty = s.doctorSpecialty || '';
    let specL1 = '';
    let specL2 = '';
    if (rawSpecialty.includes('\n')) {
      const parts = rawSpecialty.split('\n');
      specL1 = (parts[0] || '').trim();
      specL2 = (parts.slice(1).join(' ') || '').trim();
    } else {
      specL1 = rawSpecialty.trim();
    }
    if (document.getElementById('doctor-specialty-line1')) {
      document.getElementById('doctor-specialty-line1').value = specL1;
    }
    if (document.getElementById('doctor-specialty-line2')) {
      document.getElementById('doctor-specialty-line2').value = specL2;
    }
    if (document.getElementById('doctor-specialty')) {
      document.getElementById('doctor-specialty').value = rawSpecialty;
    }
    if (document.getElementById('default-consultation-fee')) {
      document.getElementById('default-consultation-fee').value = s.defaultConsultationFee !== undefined && s.defaultConsultationFee !== null ? s.defaultConsultationFee : 2000;
    }
    if(document.getElementById('custom-treatment-types')) document.getElementById('custom-treatment-types').value = s.customTreatmentTypes || '';
    const documentColorModeEl = document.getElementById('document-color-mode');
    if (documentColorModeEl) {
      documentColorModeEl.value = s.documentColorMode === 'bw' ? 'bw' : 'color';
    }
    const documentPrimaryColorEl = document.getElementById('document-primary-color');
    if (documentPrimaryColorEl) {
      const rawColor = String(s.documentPrimaryColor || '').trim();
      const safeColor = normalizeHexColor(rawColor, '#1a8c7e');
      documentPrimaryColorEl.value = safeColor;
    }
    const documentFontFamilyEl = document.getElementById('document-font-family');
    if (documentFontFamilyEl) {
      documentFontFamilyEl.value = s.documentFontFamily || 'segoe';
    }
    const documentBonPourTitleEl = document.getElementById('document-bonpour-title');
    if (documentBonPourTitleEl) {
      documentBonPourTitleEl.value = s.documentBonPourTitle || 'Demande de Bilan';
    }
    const documentTextScaleEl = document.getElementById('document-text-scale');
    if (documentTextScaleEl) {
      const textScale = Number(s.documentTextScale);
      const safeScale = Number.isFinite(textScale) ? Math.min(120, Math.max(90, textScale)) : 100;
      documentTextScaleEl.value = String(safeScale);
    }
    const documentDoctorNameScaleEl = document.getElementById('document-doctor-name-scale');
    if (documentDoctorNameScaleEl) {
      const docNameScale = Number(s.documentDoctorNameScale);
      const safeDocNameScale = Number.isFinite(docNameScale) ? Math.min(160, Math.max(70, docNameScale)) : 120;
      documentDoctorNameScaleEl.value = String(safeDocNameScale);
    }
    const documentSpecialtyScaleEl = document.getElementById('document-specialty-scale');
    if (documentSpecialtyScaleEl) {
      const specScale = Number(s.documentSpecialtyScale);
      const safeSpecScale = Number.isFinite(specScale) ? Math.min(150, Math.max(70, specScale)) : 100;
      documentSpecialtyScaleEl.value = String(safeSpecScale);
    }
    const documentMetaScaleEl = document.getElementById('document-meta-scale');
    if (documentMetaScaleEl) {
      const metaScale = Number(s.documentMetaScale);
      const safeMetaScale = Number.isFinite(metaScale) ? Math.min(150, Math.max(70, metaScale)) : 100;
      documentMetaScaleEl.value = String(safeMetaScale);
    }
    const documentLogoScaleEl = document.getElementById('document-logo-scale');
    if (documentLogoScaleEl) {
      const logoScale = Number(s.documentLogoScale);
      const safeLogoScale = Number.isFinite(logoScale) ? Math.min(200, Math.max(80, logoScale)) : 90;
      documentLogoScaleEl.value = String(safeLogoScale);
    }
    const documentStyleVariantEl = document.getElementById('document-style-variant');
    if (documentStyleVariantEl) {
      documentStyleVariantEl.value = normalizeDocumentStyleVariant(s.documentStyleVariant);
    }
    const documentWatermarkOpacityEl = document.getElementById('document-watermark-opacity');
    if (documentWatermarkOpacityEl) {
      const opacity = Number(s.documentWatermarkOpacity);
      const safeOpacity = Number.isFinite(opacity) ? Math.min(35, Math.max(2, opacity)) : 5;
      documentWatermarkOpacityEl.value = String(safeOpacity);
      updateWatermarkOpacityLabel(safeOpacity);
    }
    const documentHideSignatureEl = document.getElementById('document-hide-signature');
    if (documentHideSignatureEl) {
      documentHideSignatureEl.checked = s.documentHideSignature === 1 || s.documentHideSignature === true;
    }
    const documentShowBarcodeEl = document.getElementById('document-show-barcode');
    if (documentShowBarcodeEl) {
      documentShowBarcodeEl.checked = s.documentShowBarcode !== 0 && s.documentShowBarcode !== false;
    }

    const defaultDocumentPageSizeEl = document.getElementById('default-document-page-size');
    if (defaultDocumentPageSizeEl) {
      const storedDefault = s.defaultDocumentPageSize || localStorage.getItem('medcareso_default_doc_page_size');
      defaultDocumentPageSizeEl.value = String(storedDefault || 'A5').toUpperCase() === 'A4' ? 'A4' : 'A5';
    }

    let parsedDocFormats = {};
    if (typeof s.documentFormats === 'string' && s.documentFormats.trim()) {
      try { parsedDocFormats = JSON.parse(s.documentFormats); } catch {}
    } else if (typeof s.documentFormats === 'object' && s.documentFormats) {
      parsedDocFormats = s.documentFormats;
    }
    if (!parsedDocFormats || !Object.keys(parsedDocFormats).length) {
      try {
        const local = localStorage.getItem('medcareso_doc_formats');
        if (local) parsedDocFormats = JSON.parse(local);
      } catch {}
    }

    const defaultPageSize = String(storedDefault || 'A5').toUpperCase() === 'A4' ? 'A4' : 'A5';

    document.querySelectorAll('.doc-custom-format-select').forEach(sel => {
      const type = sel.dataset.docType;
      if (type) {
        if (parsedDocFormats && parsedDocFormats[type]) {
          sel.value = String(parsedDocFormats[type]).toUpperCase() === 'A4' ? 'A4' : 'A5';
        } else {
          sel.value = defaultPageSize;
        }
      }
    });

    let parsedTextScales = {};
    if (typeof s.documentTextScales === 'string' && s.documentTextScales.trim()) {
      try { parsedTextScales = JSON.parse(s.documentTextScales); } catch {}
    } else if (typeof s.documentTextScales === 'object' && s.documentTextScales) {
      parsedTextScales = s.documentTextScales;
    }
    if (!parsedTextScales || !Object.keys(parsedTextScales).length) {
      try {
        const local = localStorage.getItem('medcareso_doc_text_scales');
        if (local) parsedTextScales = JSON.parse(local);
      } catch {}
    }
    document.querySelectorAll('.doc-text-scale-select').forEach(sel => {
      const type = sel.dataset.docType;
      const val = type ? Number(parsedTextScales[type]) : NaN;
      sel.value = Number.isFinite(val) ? String(Math.min(120, Math.max(90, val))) : '';
    });

    const autoPrintAppointmentTicketEl = document.getElementById('auto-print-appointment-ticket');
    if (autoPrintAppointmentTicketEl) {
      autoPrintAppointmentTicketEl.checked = s.autoPrintAppointmentTicket === 1 || s.autoPrintAppointmentTicket === true;
    }

    const effectiveCabinetLogo = s.cabinetLogoDataUrl || localStorage.getItem('medcareso_cabinet_logo') || '';
    const effectiveAppLogo = s.appLogoDataUrl || localStorage.getItem('medcareso_app_logo') || '';
    const effectiveWatermarkLogo = s.cabinetWatermarkLogoDataUrl || localStorage.getItem('medcareso_watermark_logo') || '';

    if (effectiveCabinetLogo && !s.cabinetLogoDataUrl) s.cabinetLogoDataUrl = effectiveCabinetLogo;
    if (effectiveAppLogo && !s.appLogoDataUrl) s.appLogoDataUrl = effectiveAppLogo;
    if (effectiveWatermarkLogo && !s.cabinetWatermarkLogoDataUrl) s.cabinetWatermarkLogoDataUrl = effectiveWatermarkLogo;

    if (effectiveCabinetLogo) {
      try { localStorage.setItem('medcareso_cabinet_logo', effectiveCabinetLogo); } catch {}
    }
    if (effectiveAppLogo) {
      try { localStorage.setItem('medcareso_app_logo', effectiveAppLogo); } catch {}
    }
    if (effectiveWatermarkLogo) {
      try { localStorage.setItem('medcareso_watermark_logo', effectiveWatermarkLogo); } catch {}
    }

    updateCabinetLogoPreview(effectiveCabinetLogo);
    updateAppLogoPreview(effectiveAppLogo);
    updateCabinetWatermarkLogoPreview(effectiveWatermarkLogo);
    updateDocumentStylePreview();

    const publicBookingEnabledEl = document.getElementById('public-booking-enabled');
    const publicBookingPortEl = document.getElementById('public-booking-port');
    const publicBookingUrlEl = document.getElementById('public-booking-public-url');
    const publicBookingQrEl = document.getElementById('public-booking-qr-enabled');

    if (publicBookingEnabledEl) publicBookingEnabledEl.checked = !!s.publicBookingEnabled;
    if (publicBookingPortEl) publicBookingPortEl.value = s.publicBookingPort || 4580;
    if (publicBookingUrlEl) publicBookingUrlEl.value = s.publicBookingPublicUrl || '';
    if (publicBookingQrEl) publicBookingQrEl.checked = s.publicBookingQrEnabled !== 0;

    await loadPeripheralOptions(s);
    await loadPublicBookingShareData();

    await loadLicenseStatus();
    if (typeof refreshDocumentEditorLogos === 'function') {
      refreshDocumentEditorLogos();
    }

    // Load users list for superadmin and doctor-admin.
    if (
      currentUserIsSuperAdmin
      || currentUserIsAdmin
      || localStorage.getItem('currentUserIsSuperAdmin') === 'true'
      || localStorage.getItem('currentUserIsAdmin') === 'true'
    ) {
      await loadUsersList();
    }
    switchSettingsPage(activeSettingsPage);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function collectDocumentFormatsFromInputs() {
  const formats = {};
  document.querySelectorAll('.doc-custom-format-select').forEach(sel => {
    const type = sel.dataset.docType;
    if (type) {
      formats[type] = sel.value === 'A4' ? 'A4' : 'A5';
    }
  });
  return formats;
}

function collectDocumentTextScalesFromInputs() {
  const scales = {};
  document.querySelectorAll('.doc-text-scale-select').forEach(sel => {
    const type = sel.dataset.docType;
    const val = Number(sel.value);
    if (type && Number.isFinite(val) && val >= 90 && val <= 120) {
      scales[type] = Math.min(120, Math.max(90, val));
    }
  });
  return scales;
}

function buildSettingsPayload({
  includePractice = true,
  includeDevices = true,
  includePublicBooking = true
} = {}) {
  const existing = cachedSettings || {};

  return {
    cabinetName: includePractice ? document.getElementById('cabinet-name')?.value?.trim() || '' : (existing.cabinetName || ''),
    cabinetNameArabic: includePractice ? document.getElementById('cabinet-name-arabic')?.value?.trim() || '' : (existing.cabinetNameArabic || ''),
    cabinetAddress: includePractice ? document.getElementById('cabinet-address')?.value?.trim() || '' : (existing.cabinetAddress || ''),
    cabinetPhone: includePractice ? document.getElementById('cabinet-phone')?.value?.trim() || '' : (existing.cabinetPhone || ''),
    cabinetEmail: includePractice ? document.getElementById('cabinet-email')?.value?.trim() || '' : (existing.cabinetEmail || ''),
    doctorName: includePractice ? document.getElementById('doctor-name-input')?.value?.trim() || '' : (existing.doctorName || ''),
    doctorRPPS: includePractice ? document.getElementById('doctor-rpps')?.value?.trim() || '' : (existing.doctorRPPS || ''),
    doctorSpecialty: includePractice ? getComposedDoctorSpecialty() : (existing.doctorSpecialty || ''),
    defaultConsultationFee: includePractice ? (Number(document.getElementById('default-consultation-fee')?.value) || 2000) : (Number(existing.defaultConsultationFee) || 2000),
    customTreatmentTypes: includePractice ? document.getElementById('custom-treatment-types')?.value?.trim() || '' : (existing.customTreatmentTypes || ''),
    documentColorMode: includePractice ? (document.getElementById('document-color-mode')?.value === 'bw' ? 'bw' : 'color') : (existing.documentColorMode === 'bw' ? 'bw' : 'color'),
    documentPrimaryColor: includePractice
      ? normalizeHexColor(String(document.getElementById('document-primary-color')?.value || '').trim(), '#1a8c7e')
      : normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e'),
    documentTypeColors: includePractice
      ? JSON.stringify(collectDocumentTypeColorsFromInputs())
      : JSON.stringify({
          prescription: normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e'),
          certificate: normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e'),
          invoice: normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e'),
          rapport: normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e'),
          consultation: normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e'),
          generic: normalizeHexColor(String(existing.documentPrimaryColor || '').trim(), '#1a8c7e')
        }),
    defaultDocumentPageSize: includePractice
      ? (document.getElementById('default-document-page-size')?.value === 'A4' ? 'A4' : 'A5')
      : (existing.defaultDocumentPageSize || 'A5'),
    documentFormats: includePractice
      ? JSON.stringify(collectDocumentFormatsFromInputs())
      : (typeof existing.documentFormats === 'string' ? existing.documentFormats : JSON.stringify(existing.documentFormats || {})),
    documentTextScales: includePractice
      ? JSON.stringify(collectDocumentTextScalesFromInputs())
      : (typeof existing.documentTextScales === 'string' ? existing.documentTextScales : JSON.stringify(existing.documentTextScales || {})),
    documentFontFamily: includePractice
      ? (document.getElementById('document-font-family')?.value || 'segoe')
      : (existing.documentFontFamily || 'segoe'),
    documentBonPourTitle: includePractice
      ? (document.getElementById('document-bonpour-title')?.value?.trim() || 'Demande de Bilan')
      : (existing.documentBonPourTitle || 'Demande de Bilan'),
    documentTextScale: includePractice
      ? Math.min(120, Math.max(90, Number(document.getElementById('document-text-scale')?.value) || 100))
      : (Math.min(120, Math.max(90, Number(existing.documentTextScale) || 100))),
    documentDoctorNameScale: includePractice
      ? Math.min(160, Math.max(70, Number(document.getElementById('document-doctor-name-scale')?.value) || 120))
      : (Math.min(160, Math.max(70, Number(existing.documentDoctorNameScale) || 120))),
    documentSpecialtyScale: includePractice
      ? Math.min(150, Math.max(70, Number(document.getElementById('document-specialty-scale')?.value) || 100))
      : (Math.min(150, Math.max(70, Number(existing.documentSpecialtyScale) || 100))),
    documentMetaScale: includePractice
      ? Math.min(150, Math.max(70, Number(document.getElementById('document-meta-scale')?.value) || 100))
      : (Math.min(150, Math.max(70, Number(existing.documentMetaScale) || 100))),
    documentLogoScale: includePractice
      ? Math.min(200, Math.max(80, Number(document.getElementById('document-logo-scale')?.value) || 90))
      : (Math.min(200, Math.max(80, Number(existing.documentLogoScale) || 90))),
    documentStyleVariant: includePractice
      ? normalizeDocumentStyleVariant(document.getElementById('document-style-variant')?.value)
      : normalizeDocumentStyleVariant(existing.documentStyleVariant),
    documentWatermarkOpacity: includePractice
      ? Math.min(35, Math.max(2, Number(document.getElementById('document-watermark-opacity')?.value) || 5))
      : (Math.min(35, Math.max(2, Number(existing.documentWatermarkOpacity) || 5))),
    documentHideSignature: includePractice
      ? Boolean(document.getElementById('document-hide-signature')?.checked)
      : Boolean(existing.documentHideSignature),
    documentShowBarcode: includePractice
      ? document.getElementById('document-show-barcode')?.checked !== false
      : (existing.documentShowBarcode !== 0 && existing.documentShowBarcode !== false),
    cabinetLogoDataUrl: explicitClearCabinetLogo
      ? ''
      : ((includePractice ? document.getElementById('cabinet-logo-data')?.value : '') || existing.cabinetLogoDataUrl || localStorage.getItem('medcareso_cabinet_logo') || ''),
    clearCabinetLogo: explicitClearCabinetLogo,
    appLogoDataUrl: explicitClearAppLogo
      ? ''
      : ((includePractice ? document.getElementById('app-logo-data')?.value : '') || existing.appLogoDataUrl || localStorage.getItem('medcareso_app_logo') || ''),
    clearAppLogo: explicitClearAppLogo,
    cabinetWatermarkLogoDataUrl: explicitClearWatermarkLogo
      ? ''
      : ((includePractice ? document.getElementById('cabinet-watermark-logo-data')?.value : '') || existing.cabinetWatermarkLogoDataUrl || localStorage.getItem('medcareso_watermark_logo') || ''),
    clearWatermarkLogo: explicitClearWatermarkLogo,
    preferredPrinter: includeDevices ? document.getElementById('preferred-printer')?.value || '' : (existing.preferredPrinter || ''),
    preferredScanner: includeDevices ? document.getElementById('preferred-scanner')?.value || '' : (existing.preferredScanner || ''),
    radioExportFolderPath: includeDevices ? document.getElementById('radio-export-folder-path')?.value || '' : (existing.radioExportFolderPath || ''),
    preferredThermalPrinter: includeDevices ? document.getElementById('preferred-thermal-printer')?.value || '' : (existing.preferredThermalPrinter || ''),
    autoPrintAppointmentTicket: includeDevices
      ? Boolean(document.getElementById('auto-print-appointment-ticket')?.checked)
      : Boolean(existing.autoPrintAppointmentTicket),
    publicBookingEnabled: includePublicBooking ? Boolean(document.getElementById('public-booking-enabled')?.checked) : Boolean(existing.publicBookingEnabled),
    publicBookingPort: includePublicBooking
      ? (parseInt(document.getElementById('public-booking-port')?.value, 10) || Number(existing.publicBookingPort) || 4580)
      : (Number(existing.publicBookingPort) || 4580),
    publicBookingPublicUrl: includePublicBooking
      ? document.getElementById('public-booking-public-url')?.value?.trim() || ''
      : (existing.publicBookingPublicUrl || ''),
    publicBookingQrEnabled: includePublicBooking
      ? (document.getElementById('public-booking-qr-enabled')
        ? document.getElementById('public-booking-qr-enabled').checked
        : existing.publicBookingQrEnabled !== 0)
      : (existing.publicBookingQrEnabled !== 0)
  };
}

async function persistSettings(settingsData, successMessage = 'Parametres enregistres') {
  try {
    if (settingsData.cabinetLogoDataUrl) {
      try { localStorage.setItem('medcareso_cabinet_logo', settingsData.cabinetLogoDataUrl); } catch {}
    }
    if (settingsData.appLogoDataUrl) {
      try { localStorage.setItem('medcareso_app_logo', settingsData.appLogoDataUrl); } catch {}
    }
    if (settingsData.cabinetWatermarkLogoDataUrl) {
      try { localStorage.setItem('medcareso_watermark_logo', settingsData.cabinetWatermarkLogoDataUrl); } catch {}
    }

    const result = await window.api.settings.save(settingsData);
    if (result.success) {
      cachedSettings = { ...(cachedSettings || {}), ...settingsData };
      if (typeof refreshAppBrandLogo === 'function') refreshAppBrandLogo();
      if (typeof refreshDocumentEditorLogos === 'function') {
        refreshDocumentEditorLogos();
      }
      await loadPeripheralOptions(cachedSettings);
      await loadPublicBookingShareData();
      showNotification(
        result.warning ? `OK ${successMessage} - Portail RDV: ${result.warning}` : `OK ${successMessage}`,
        result.warning ? 'warning' : 'success'
      );
      return result;
    }

    showNotification('Erreur: ' + result.error, 'error');
    return result;
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification("Erreur lors de l'enregistrement", 'error');
    return { success: false, error: error.message };
  }
}

async function saveSettings() {
  if (currentUserIsSuperAdmin) {
    showNotification('Connectez-vous avec un compte médecin pour personnaliser le cabinet.', 'warning');
    return;
  }
  if (!currentUserIsAdmin) {
    showNotification('Accès réservé au médecin admin', 'warning');
    return;
  }
  const settingsData = {
    cabinetName: document.getElementById('cabinet-name')?.value || cachedSettings?.cabinetName || '',
    cabinetAddress: document.getElementById('cabinet-address')?.value || cachedSettings?.cabinetAddress || '',
    cabinetPhone: document.getElementById('cabinet-phone')?.value || cachedSettings?.cabinetPhone || '',
    cabinetEmail: document.getElementById('cabinet-email')?.value || cachedSettings?.cabinetEmail || '',
    doctorName: document.getElementById('doctor-name-input')?.value || document.getElementById('cabinet-name')?.value || cachedSettings?.doctorName || '',
    doctorRPPS: document.getElementById('doctor-rpps')?.value || cachedSettings?.doctorRPPS || '',
    doctorSpecialty: getComposedDoctorSpecialty() || cachedSettings?.doctorSpecialty || '',
    customTreatmentTypes: document.getElementById('custom-treatment-types')?.value || cachedSettings?.customTreatmentTypes || '',
    documentColorMode: document.getElementById('document-color-mode')?.value === 'bw' ? 'bw' : (cachedSettings?.documentColorMode || 'color'),
    documentPrimaryColor: normalizeHexColor(String(document.getElementById('document-primary-color')?.value || cachedSettings?.documentPrimaryColor || '').trim(), '#1a8c7e'),
    documentTypeColors: JSON.stringify(collectDocumentTypeColorsFromInputs()),
    defaultDocumentPageSize: document.getElementById('default-document-page-size')?.value === 'A4' ? 'A4' : (cachedSettings?.defaultDocumentPageSize || 'A5'),
    documentFormats: JSON.stringify(collectDocumentFormatsFromInputs()),
    documentTextScales: JSON.stringify(collectDocumentTextScalesFromInputs()),
    documentFontFamily: document.getElementById('document-font-family')?.value || cachedSettings?.documentFontFamily || 'segoe',
    documentBonPourTitle: document.getElementById('document-bonpour-title')?.value?.trim() || cachedSettings?.documentBonPourTitle || 'Demande de Bilan',
    documentTextScale: Math.min(120, Math.max(90, Number(document.getElementById('document-text-scale')?.value || cachedSettings?.documentTextScale) || 100)),
    documentDoctorNameScale: Math.min(160, Math.max(70, Number(document.getElementById('document-doctor-name-scale')?.value || cachedSettings?.documentDoctorNameScale) || 120)),
    documentSpecialtyScale: Math.min(150, Math.max(70, Number(document.getElementById('document-specialty-scale')?.value || cachedSettings?.documentSpecialtyScale) || 100)),
    documentMetaScale: Math.min(150, Math.max(70, Number(document.getElementById('document-meta-scale')?.value || cachedSettings?.documentMetaScale) || 100)),
    documentLogoScale: Math.min(200, Math.max(80, Number(document.getElementById('document-logo-scale')?.value || cachedSettings?.documentLogoScale) || 90)),
    documentStyleVariant: normalizeDocumentStyleVariant(document.getElementById('document-style-variant')?.value || cachedSettings?.documentStyleVariant),
    documentWatermarkOpacity: Math.min(35, Math.max(2, Number(document.getElementById('document-watermark-opacity')?.value || cachedSettings?.documentWatermarkOpacity) || 5)),
    documentHideSignature: Boolean(document.getElementById('document-hide-signature')?.checked),
    documentShowBarcode: document.getElementById('document-show-barcode')?.checked !== false,
    cabinetLogoDataUrl: explicitClearCabinetLogo
      ? ''
      : (document.getElementById('cabinet-logo-data')?.value || cachedSettings?.cabinetLogoDataUrl || localStorage.getItem('medcareso_cabinet_logo') || ''),
    clearCabinetLogo: explicitClearCabinetLogo,
    appLogoDataUrl: explicitClearAppLogo
      ? ''
      : (document.getElementById('app-logo-data')?.value || cachedSettings?.appLogoDataUrl || localStorage.getItem('medcareso_app_logo') || ''),
    clearAppLogo: explicitClearAppLogo,
    cabinetWatermarkLogoDataUrl: explicitClearWatermarkLogo
      ? ''
      : (document.getElementById('cabinet-watermark-logo-data')?.value || cachedSettings?.cabinetWatermarkLogoDataUrl || localStorage.getItem('medcareso_watermark_logo') || ''),
    clearWatermarkLogo: explicitClearWatermarkLogo,
    preferredPrinter: document.getElementById('preferred-printer')?.value || cachedSettings?.preferredPrinter || '',
    preferredScanner: document.getElementById('preferred-scanner')?.value || cachedSettings?.preferredScanner || '',
    radioExportFolderPath: document.getElementById('radio-export-folder-path')?.value || cachedSettings?.radioExportFolderPath || '',
    preferredThermalPrinter: document.getElementById('preferred-thermal-printer')?.value || cachedSettings?.preferredThermalPrinter || '',
    autoPrintAppointmentTicket: Boolean(document.getElementById('auto-print-appointment-ticket')?.checked),
    publicBookingEnabled: document.getElementById('public-booking-enabled')?.checked || false,
    publicBookingPort: parseInt(document.getElementById('public-booking-port')?.value, 10) || 4580,
    publicBookingPublicUrl: document.getElementById('public-booking-public-url')?.value?.trim() || cachedSettings?.publicBookingPublicUrl || '',
    publicBookingQrEnabled: document.getElementById('public-booking-qr-enabled')
      ? document.getElementById('public-booking-qr-enabled').checked
      : false
  };

  return persistSettings(settingsData, 'Paramètres enregistrés');
}

async function savePracticeSettings() {
  if (currentUserIsSuperAdmin) {
    showNotification('Le super administrateur ne peut pas modifier les informations medicales du cabinet.', 'warning');
    return { success: false };
  }
  if (!await ensurePracticeAdminAccess()) return { success: false };

  return persistSettings(
    buildSettingsPayload({
      includePractice: true,
      includeDevices: false,
      includePublicBooking: false
    }),
    'Informations du cabinet enregistrees'
  );
}

async function savePeripheralSettings() {
  return persistSettings(
    buildSettingsPayload({
      includePractice: false,
      includeDevices: true,
      includePublicBooking: false
    }),
    'Imprimantes et scanners enregistres'
  );
}

async function savePublicBookingSettings() {
  return persistSettings(
    buildSettingsPayload({
      includePractice: false,
      includeDevices: false,
      includePublicBooking: true
    }),
    'Parametres du portail RDV enregistres'
  );
}

async function refreshDeviceOptions() {
  await loadPeripheralOptions(cachedSettings || {});
  showNotification('Périphériques actualisés', 'success');
}

async function loadLicenseStatus() {
  const licenseInfo = document.getElementById('license-info');
  if (!licenseInfo) return;

  loadLicenseMachineId();
  const role = typeof currentUserRole !== 'undefined' ? currentUserRole : (localStorage.getItem('currentUserRole') || '');
  const isSuperAdmin = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  const canManageLicense = isSuperAdmin || currentUserIsAdmin || role === 'doctor' || role === 'dentist' || role === 'test';

  const maskLicenseKey = (licenseKey) => (licenseKey ? '*****' : '-');

  try {
    const status = await window.api.license.getStatus();
    const managementForm = document.getElementById('license-management-form');
    if (managementForm) {
      managementForm.style.display = canManageLicense ? 'block' : 'none';
    }

    if (!status || !status.hasActiveLicense) {
      licenseInfo.innerHTML = `
        <p><strong>Aucune licence active.</strong></p>
        <p>${escapeHTML(status?.message || 'Connectez-vous avec le super administrateur pour installer une licence signée.')}</p>
        <p>Choisissez le fichier de licence fourni par MedCareSO.</p>
      `;
      return;
    }

    if (status.expired) {
      licenseInfo.innerHTML = `
        <p><strong>Licence actuelle:</strong> <code>${maskLicenseKey(status.licenseKey)}</code></p>
        <p><strong>Type:</strong> ${formatLicenseTypeLabel(status)}</p>
        <p style="color: #dc3545; font-weight: 600;">Licence expirée le ${status.expirationDate}</p>
        <p>${status.message || 'Veuillez activer une nouvelle licence.'}</p>
      `;
    } else {
      const remainingLabel = status.daysRemaining === null || status.daysRemaining === undefined
        ? 'Illimitée'
        : `${status.daysRemaining} jour(s)`;
      licenseInfo.innerHTML = `
        <p><strong>Client:</strong> ${escapeHTML(status.clientName || '-')}</p>
        <p><strong>Clé active:</strong> <code>${maskLicenseKey(status.licenseKey)}</code></p>
        <p><strong>Type:</strong> ${formatLicenseTypeLabel(status)}</p>
        <p><strong>Expiration:</strong> ${status.expirationDate}</p>
        <p><strong>Jours restants:</strong> ${remainingLabel}</p>
        <p><strong>Statut:</strong> ${status.status === 'activated' ? '✅ Active' : escapeHTML(status.status || '-')}</p>
      `;
    }
  } catch (error) {
    console.error('Error loading license status:', error);
    licenseInfo.innerHTML = '<p>Erreur lors du chargement de la licence.</p>';
  }
}

async function loadLicenseMachineId() {
  const target = document.getElementById('license-machine-id');
  if (!target || target.dataset.loaded === 'true') return;
  try {
    const result = await window.api.license.getMachineId();
    target.textContent = result?.success && result.machineId ? result.machineId : 'Indisponible';
    target.dataset.loaded = 'true';
  } catch (_) {
    target.textContent = 'Indisponible';
  }
}

async function copyLicenseMachineId() {
  const machineId = document.getElementById('license-machine-id')?.textContent?.trim();
  if (!machineId || machineId === 'Chargement…' || machineId === 'Indisponible') {
    showNotification('Identifiant du poste indisponible', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(machineId);
    showNotification('Identifiant du poste copié', 'success');
  } catch (_) {
    showNotification('Impossible de copier l’identifiant', 'error');
  }
}

function formatLicenseTypeLabel(status = {}) {
  return status.licenseType === 'subscription' ? 'Abonnement signé' : 'Licence signée illimitée';
}

async function chooseSignedLicenseFile() {
  if (!currentUserIsSuperAdmin) {
    showNotification('Accès réservé au super administrateur', 'error');
    return;
  }
  const result = await window.api.license.chooseFile();
  if (result?.canceled) return;
  if (!result?.success) {
    showNotification(result?.error || 'Impossible de lire la licence', 'error');
    return;
  }
  selectedSignedLicenseContent = result.content;
  const input = document.getElementById('license-key-input');
  if (input) input.value = result.fileName || 'Licence sélectionnée';
}

async function disableCurrentLicense() {
  if (!currentUserIsSuperAdmin) {
    showNotification('Accès réservé au super administrateur', 'error');
    return;
  }

  try {
    const status = await window.api.license.getStatus();
    if (!status?.licenseKey) {
      showNotification('Aucune licence active à désactiver', 'warning');
      return;
    }

    const result = await window.api.license.deactivate(status.licenseKey);
    if (!result.success) {
      showNotification(result.reason || 'Désactivation impossible', 'error');
      return;
    }

    showNotification('Licence désactivée', 'success');
    await loadLicenseStatus();
  } catch (error) {
    console.error('Error disabling license:', error);
    showNotification('Erreur lors de la désactivation', 'error');
  }
}

document.getElementById('license-management-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentUserIsSuperAdmin) {
    showNotification('Accès réservé au super administrateur', 'error');
    return;
  }

  const input = document.getElementById('license-key-input');
  const pasteInput = document.getElementById('license-paste-textarea');
  const licenseContent = pasteInput?.value?.trim() || selectedSignedLicenseContent;

  if (!licenseContent) {
    showNotification('Collez le texte JSON de la licence ou choisissez un fichier .json', 'error');
    return;
  }

  try {
    const result = await window.api.license.activate(licenseContent);
    if (!result.success) {
      showNotification(result.reason || 'Activation impossible', 'error');
      return;
    }

    if (input) input.value = '';
    if (pasteInput) pasteInput.value = '';
    selectedSignedLicenseContent = '';
    showNotification('Licence signée activée avec succès', 'success');
    await loadLicenseStatus();
  } catch (error) {
    console.error('Error activating license:', error);
    showNotification('Erreur lors de l\'activation de la licence', 'error');
  }
});

window.chooseSignedLicenseFile = chooseSignedLicenseFile;
window.copyLicenseMachineId = copyLicenseMachineId;
window.disableCurrentLicense = disableCurrentLicense;
window.handleCabinetWatermarkLogoChange = handleCabinetWatermarkLogoChange;
window.clearCabinetWatermarkLogo = clearCabinetWatermarkLogo;

async function loadLicenseInventory() {
  const container = document.getElementById('license-keys-container');
  if (!container) return;

  if (!currentUserIsSuperAdmin) {
    container.innerHTML = '<p style="color: #666;">Accès réservé au super administrateur.</p>';
    return;
  }

  updateLicensePricePreview();
  container.innerHTML = '<p style="color:#64748b;">Générez un lot pour afficher les clés ici. Les clés générées sont sauvegardées dans la base et synchronisées via cloud/VPS.</p>';
}

function getSuggestedLicenseUnitPrice(durationDays) {
  const days = Number(durationDays) || 7;
  if (days <= 5) return 1500;
  if (days <= 7) return 2000;
  if (days <= 15) return 4000;
  if (days >= 365) return 60000;
  return Math.ceil(days * 300 / 500) * 500;
}

function updateLicensePricePreview() {
  const durationDays = Number(document.getElementById('license-duration-days')?.value || 7);
  const count = Math.max(1, Number(document.getElementById('license-count')?.value || 1));
  const unit = getSuggestedLicenseUnitPrice(durationDays);
  const total = unit * count;
  const target = document.getElementById('license-price-preview');
  if (target) {
    target.textContent = `${unit.toLocaleString('fr-FR')} DZD / clé · Total: ${total.toLocaleString('fr-FR')} DZD`;
  }
}

async function copyLicenseKey(key) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(key);
    } else {
      const tempInput = document.createElement('input');
      tempInput.value = key;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }
    showNotification('Clé copiée dans le presse-papiers', 'success');
  } catch (error) {
    console.error('Error copying license key:', error);
    showNotification('Impossible de copier la clé', 'error');
  }
}

async function handleGenerateLicensePack(event) {
  event.preventDefault();

  if (!currentUserIsSuperAdmin) {
    showNotification('Accès réservé au super administrateur', 'error');
    return;
  }

  const form = event.target;
  const clientName = form.querySelector('#license-client-name')?.value?.trim() || 'Licence cabinet';
  const durationDays = Number(form.querySelector('#license-duration-days')?.value || 7);
  const countValue = form.querySelector('#license-count')?.value;
  const count = countValue ? parseInt(countValue, 10) : undefined;

  const submitBtn = form.querySelector('#btn-generate-license-pack');
  const initialText = submitBtn ? submitBtn.innerHTML : '';

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Génération...';
    }

    const result = await window.api.license.generateKeys({ durationDays, quantity: count, clientName });
    if (!result.success) {
      showNotification(result.error || 'Génération impossible', 'error');
      return;
    }

    const container = document.getElementById('license-keys-container');
    if (container) {
      container.innerHTML = `
        <div class="info-box" style="padding: 12px;">
          <strong>${result.generated.length} clé(s) générée(s)</strong>
          <div style="display:grid;gap:8px;margin-top:10px;">
            ${result.generated.map((entry) => `
              <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
                <code>${entry.key}</code>
                <button type="button" class="btn btn-sm btn-secondary" onclick="copyLicenseKey('${entry.key}')">Copier</button>
              </div>
            `).join('')}
          </div>
          <p style="margin:10px 0 0;color:#64748b;">Sauvegardé en base locale. Inclus dans la synchronisation cloud/VPS via la table <code>licenses</code>.</p>
        </div>
      `;
    }
    showNotification('Clés générées avec succès', 'success');
  } catch (error) {
    console.error('Error generating license pack:', error);
    showNotification('Erreur inattendue lors de la génération', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = initialText || '⚙️ Générer la série';
    }
  }
}

window.handleGenerateLicensePack = handleGenerateLicensePack;
window.copyLicenseKey = copyLicenseKey;
window.loadLicenseInventory = loadLicenseInventory;
window.updateLicensePricePreview = updateLicensePricePreview;

// --- Test Data Seeding ---
async function seedTestData() {
  if (!confirm('⚠️ Êtes-vous sûr de vouloir ajouter les données de test?\n\nCeci ajoutera:\n• 8 patients\n• 3 kinésithérapeutes\n• Consultations\n• Ordonnances\n• Paiements')) {
    return;
  }

  try {
    showNotification('🌱 Création des données de test en cours...', 'info');
    
    const result = await window.api.dev.seedTestData();
    
    if (result.success) {
      showNotification('✅ ' + result.message, 'success');
      // Refresh current view
      await loadPatients();
      if (typeof loadKineStaff === 'function') {
        await loadKineStaff();
      }
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error seeding test data:', error);
    showNotification('❌ Erreur lors de la création des données: ' + error.message, 'error');
  }
}

// --- Clear All Data ---
async function clearAllData() {
  if (!confirm('🗑️ ATTENTION - Cette action est irréversible!\n\nÊtes-vous sûr de vouloir SUPPRIMER toutes les données?\n\n• Tous les patients\n• Toutes les consultations\n• Toutes les ordonnances\n• Tous les paiements\n• Tous les kinés et séances\n\nLes utilisateurs et paramètres seront conservés.')) {
    return;
  }
  
  // Double confirmation
  if (!confirm('⚠️ DERNIÈRE CHANCE!\n\nCliquez sur OK pour confirmer la suppression de toutes les données.')) {
    return;
  }

  try {
    showNotification('🗑️ Suppression des données en cours...', 'info');
    
    const result = await window.api.dev.clearAllData();
    
    if (result.success) {
      showNotification('✅ ' + result.message, 'success');
      // Refresh current view
      await loadPatients();
      if (typeof loadKineStaff === 'function') {
        await loadKineStaff();
      }
      if (typeof loadDailySummary === 'function') {
        loadDailySummary();
      }
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error clearing data:', error);
    showNotification('❌ Erreur lors de la suppression: ' + error.message, 'error');
  }
}

// --- Database Configuration ---
async function loadDbConfigStatus() {
  try {
    const statusResult = await window.api.dbConfig.getStatus();
    const status = statusResult?.data || {};
    const modeDisplay = document.getElementById('db-mode-display');
    if (modeDisplay) {
      const modeLabel = status.mode === 'network' ? 'Réseau' : 'Local';
      const badgeClass = status.connected ? 'success' : 'danger';
      modeDisplay.innerHTML = `<span class="badge ${badgeClass}">PostgreSQL</span> ${modeLabel} - ${status.host || 'localhost'}:${status.port || 5432}`;
    }

    const connectionDisplay = document.getElementById('db-connection-display');
    if (connectionDisplay) {
      connectionDisplay.textContent = status.connected
        ? 'Connecté - SELECT 1 réussi'
        : `Déconnecté - ${status.error || 'connexion impossible'}`;
      connectionDisplay.style.color = status.connected ? 'var(--color-success)' : 'var(--color-danger)';
    }

    const counts = status.tableCounts || {};
    const tableCounts = document.getElementById('db-table-counts');
    if (tableCounts) {
      tableCounts.innerHTML = `
        <span class="stat-item"><span class="stat-value">${counts.patients ?? 0}</span><span class="stat-label">patients</span></span>
        <span class="stat-item"><span class="stat-value">${counts.treatment_plans ?? 0}</span><span class="stat-label">plans</span></span>
        <span class="stat-item"><span class="stat-value">${counts.inventory ?? 0}</span><span class="stat-label">articles</span></span>
      `;
    }
    
    // Show the card for superadmin only
    const dbConfigCard = document.getElementById('db-config-card');
    if (dbConfigCard && currentUserIsSuperAdmin) {
      dbConfigCard.style.display = 'block';
      await loadSpecialtyBasesStatus();
    }
  } catch (error) {
    console.error('Error loading DB config status:', error);
  }
}

async function loadSpecialtyBasesStatus() {
  const container = document.getElementById('specialty-bases-list');
  if (!container || !currentUserIsSuperAdmin) return;

  try {
    const result = await window.api.package.getLoadedBases();
    const bases = result.success && Array.isArray(result.data) ? result.data.filter((base) => base.enabled) : [];
    if (!bases.length) {
      container.innerHTML = '<div class="db-status-help">Aucune base de spécialité activée.</div>';
      return;
    }

    container.innerHTML = bases.map((base) => `
      <div class="specialty-base-row">
        <div>
          <strong>${base.label}</strong>
          <div class="db-status-help">
            Logo: ${base.logoExists ? base.logoFile : 'logo général'} ·
            Médicaments: ${base.medicationFileName} (${base.medicationCount}) ·
            Examens: ${base.examsCount} ·
            Imagerie: ${base.imagingFamiliesCount} ·
            Équipements: ${base.equipmentCategoriesCount}
          </div>
        </div>
        <div class="specialty-base-actions">
          <button type="button" class="btn btn-sm btn-primary" onclick="refreshSpecialtyBase('${base.key}')">Mettre à jour la base ${base.label}</button>
          <button type="button" class="btn btn-sm btn-info" onclick="exportSpecialtyMedicationsJson('${base.key}')">Télécharger la liste des médicaments (.json)</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading specialty bases:', error);
    container.innerHTML = '<div class="db-status-help">Erreur de chargement des bases de spécialité.</div>';
  }
}

async function refreshSpecialtyBase(specialtyKey) {
  if (!currentUserIsSuperAdmin) return;
  const result = await window.api.package.refreshSpecialtyBase(specialtyKey);
  if (result.success) {
    showNotification(`Base mise à jour: ${result.inserted} ajout(s), ${result.updated} mise(s) à jour`, 'success');
    await loadSpecialtyBasesStatus();
  } else {
    showNotification(result.error || 'Impossible de mettre à jour la base', 'error');
  }
}

async function exportSpecialtyMedicationsJson(specialtyKey) {
  if (!currentUserIsSuperAdmin) return;
  const result = await window.api.package.exportMedicationsJson(specialtyKey);
  if (result.success && result.data?.filePath) {
    const fileName = result.data.filePath.split(/[\\/]/).pop();
    const downloadResult = await window.api.system.downloadFile(result.data.filePath, fileName);
    if (downloadResult?.success) {
      showNotification('Liste des médicaments téléchargée', 'success');
    } else if (!downloadResult?.canceled) {
      showNotification(downloadResult?.error || 'Impossible de télécharger le JSON', 'error');
    }
  } else {
    showNotification(result.error || 'Impossible de télécharger le JSON', 'error');
  }
}

let inlineDbInitialType = 'local';
let inlineDbLastConnectionCheckSucceeded = false;

function setInlineDbTypeSelection(type) {
  const localRadio = document.querySelector('input[name="inline-db-type"][value="local"]');
  const networkRadio = document.querySelector('input[name="inline-db-type"][value="network"]');
  const localOption = document.getElementById('inline-db-option-local');
  const networkOption = document.getElementById('inline-db-option-network');
  const postgresqlConfig = document.getElementById('inline-postgresql-config');
  const migrationBox = document.getElementById('inline-db-migration-box');
  const migrateCheckbox = document.getElementById('inline-migrate-data-checkbox');

  if (localRadio) localRadio.checked = type === 'local';
  if (networkRadio) networkRadio.checked = type === 'network';
  if (localOption) localOption.classList.toggle('selected', type === 'local');
  if (networkOption) networkOption.classList.toggle('selected', type === 'network');
  if (postgresqlConfig) postgresqlConfig.style.display = 'block';

  if (migrationBox) {
    migrationBox.style.display = 'none';
    if (migrateCheckbox) migrateCheckbox.checked = false;
  }

  inlineDbLastConnectionCheckSucceeded = false;
  hideInlineDbStatus('inline-db-connection-status');
}

function showInlineDbStatus(elementId, type, message) {
  const target = document.getElementById(elementId);
  if (!target) return;
  target.textContent = message;
  target.className = `inline-db-status is-${type}`;
  target.style.display = 'block';
}

function hideInlineDbStatus(elementId) {
  const target = document.getElementById(elementId);
  if (!target) return;
  target.className = 'inline-db-status';
  target.textContent = '';
  target.style.display = 'none';
}

async function loadInlineDbConfigModalData() {
  const config = await window.api.dbConfig.get();
  const database = config.database || {};
  const currentModeEl = document.getElementById('inline-db-current-mode');
  const currentServerEl = document.getElementById('inline-db-current-server');

  if (currentModeEl) {
    currentModeEl.textContent = database.mode === 'network' ? 'PostgreSQL (Réseau)' : 'PostgreSQL (Local)';
  }
  if (currentServerEl) {
    currentServerEl.textContent = `${database.host || 'localhost'}:${database.port || 5432}`;
  }

  inlineDbInitialType = database.mode || 'local';
  document.getElementById('inline-db-host').value = database.host || 'localhost';
  document.getElementById('inline-db-port').value = database.port || 5432;
  document.getElementById('inline-db-name').value = database.database || 'cabinet_db';
  document.getElementById('inline-db-user').value = database.user || 'cabinet_app';
  document.getElementById('inline-db-password').value = database.password || '';

  setInlineDbTypeSelection(database.mode === 'network' ? 'network' : 'local');
  hideInlineDbStatus('inline-db-config-message');
}

async function openDbConfigWindow() {
  try {
    await loadInlineDbConfigModalData();
    showModal('modal-db-config');
  } catch (error) {
    console.error('Error opening DB config window:', error);
    showNotification('Erreur lors de l\'ouverture de la configuration', 'error');
  }
}

function closeDbConfigModal() {
  closeModal('modal-db-config');
}

async function testInlineDbConnection() {
  const btnTest = document.getElementById('inline-db-test-btn');
  const config = {
    host: document.getElementById('inline-db-host')?.value?.trim(),
    port: parseInt(document.getElementById('inline-db-port')?.value, 10) || 5432,
    database: document.getElementById('inline-db-name')?.value?.trim(),
    user: document.getElementById('inline-db-user')?.value?.trim(),
    password: document.getElementById('inline-db-password')?.value || ''
  };

  if (!config.host || !config.user) {
    inlineDbLastConnectionCheckSucceeded = false;
    showInlineDbStatus('inline-db-connection-status', 'error', 'Veuillez remplir au minimum l\'hote et l\'utilisateur PostgreSQL.');
    return;
  }

  if (btnTest) {
    btnTest.disabled = true;
    btnTest.textContent = 'Test en cours...';
  }

  try {
    const result = await window.api.dbConfig.testConnection({ database: config });
    if (result.success) {
      inlineDbLastConnectionCheckSucceeded = true;
      showInlineDbStatus('inline-db-connection-status', 'success', 'Connexion réussie. PostgreSQL est accessible.');
    } else {
      inlineDbLastConnectionCheckSucceeded = false;
      showInlineDbStatus('inline-db-connection-status', 'error', `Echec de connexion: ${result.error}`);
    }
  } catch (error) {
    inlineDbLastConnectionCheckSucceeded = false;
    showInlineDbStatus('inline-db-connection-status', 'error', `Erreur: ${error.message}`);
  } finally {
    if (btnTest) {
      btnTest.disabled = false;
      btnTest.textContent = 'Tester la connexion';
    }
  }
}

async function saveInlineDbConfig(event) {
  event.preventDefault();

  const dbType = document.querySelector('input[name="inline-db-type"]:checked')?.value || 'local';
  const config = {
    database: {
      mode: dbType,
      host: document.getElementById('inline-db-host')?.value?.trim(),
      port: parseInt(document.getElementById('inline-db-port')?.value, 10) || 5432,
      database: document.getElementById('inline-db-name')?.value?.trim(),
      user: document.getElementById('inline-db-user')?.value?.trim(),
      password: document.getElementById('inline-db-password')?.value || ''
    }
  };
  const messageId = 'inline-db-config-message';

  if (dbType === 'network') {
    if (!config.database.host || !config.database.user) {
      showInlineDbStatus(messageId, 'error', 'Veuillez remplir tous les champs obligatoires PostgreSQL.');
      return;
    }

    if (!inlineDbLastConnectionCheckSucceeded) {
      showInlineDbStatus(messageId, 'loading', 'Vérification de la connexion PostgreSQL avant sauvegarde...');
      const testBeforeSave = await window.api.dbConfig.testConnection(config);
      if (!testBeforeSave.success) {
        showInlineDbStatus(messageId, 'error', `Connexion PostgreSQL impossible: ${testBeforeSave.error || 'Erreur inconnue'}`);
        return;
      }
    }
  }

  showInlineDbStatus(messageId, 'loading', 'Sauvegarde de la configuration PostgreSQL en cours...');

  try {
    const result = await window.api.dbConfig.save(config);
    if (!result.success) {
      showInlineDbStatus(messageId, 'error', `Erreur: ${result.error}`);
      return;
    }

    const warningInfo = result.warning ? `\nAttention: ${result.warning}` : '';

    showInlineDbStatus(messageId, 'success', `Configuration PostgreSQL sauvegardée.${warningInfo}\nRedémarrage en cours...`);
    await loadDbConfigStatus();
    setTimeout(() => {
      window.api.dbConfig.restart();
    }, 1800);
  } catch (error) {
    showInlineDbStatus(messageId, 'error', `Erreur: ${error.message}`);
  }
}

function initializeInlineDbConfigModal() {
  const form = document.getElementById('inline-db-config-form');
  if (!form || form.dataset.bound === 'true') return;

  form.dataset.bound = 'true';
  form.addEventListener('submit', saveInlineDbConfig);
  document.getElementById('inline-db-test-btn')?.addEventListener('click', testInlineDbConnection);
  document.getElementById('inline-db-option-local')?.addEventListener('click', () => setInlineDbTypeSelection('local'));
  document.getElementById('inline-db-option-network')?.addEventListener('click', () => setInlineDbTypeSelection('network'));
}

window.openDbConfigWindow = openDbConfigWindow;
window.closeDbConfigModal = closeDbConfigModal;
window.refreshDbStatus = loadDbConfigStatus;
window.refreshSpecialtyBase = refreshSpecialtyBase;
window.exportSpecialtyMedicationsJson = exportSpecialtyMedicationsJson;

// Call loadDbConfigStatus when settings page loads
document.addEventListener('DOMContentLoaded', () => {
  ensureSettingsLoaded().then(() => {
    if (typeof refreshDocumentEditorLogos === 'function') {
      refreshDocumentEditorLogos();
    }
  }).catch(() => {});

  setTimeout(() => {
    loadDbConfigStatus();
  }, 1000);

  initializeInlineDbConfigModal();
  updateLicensePricePreview();

  const watermarkOpacityInput = document.getElementById('document-watermark-opacity');
  if (watermarkOpacityInput && !watermarkOpacityInput.dataset.bound) {
    watermarkOpacityInput.addEventListener('input', (event) => {
      updateWatermarkOpacityLabel(event?.target?.value);
    });
    watermarkOpacityInput.dataset.bound = '1';
    updateWatermarkOpacityLabel(watermarkOpacityInput.value);
  }

  let documentSettingsAutoSaveTimer = null;
  const triggerDocumentSettingsAutoSave = () => {
    try {
      const formats = collectDocumentFormatsFromInputs();
      const textScales = collectDocumentTextScalesFromInputs();
      const defaultPageSize = document.getElementById('default-document-page-size')?.value === 'A4' ? 'A4' : 'A5';
      const docNameScale = Math.min(160, Math.max(70, Number(document.getElementById('document-doctor-name-scale')?.value) || 120));
      const specialtyScale = Math.min(150, Math.max(70, Number(document.getElementById('document-specialty-scale')?.value) || 100));
      const metaScale = Math.min(150, Math.max(70, Number(document.getElementById('document-meta-scale')?.value) || 100));
      const textScale = Math.min(120, Math.max(90, Number(document.getElementById('document-text-scale')?.value) || 100));

      localStorage.setItem('medcareso_doc_formats', JSON.stringify(formats));
      localStorage.setItem('medcareso_doc_text_scales', JSON.stringify(textScales));
      localStorage.setItem('medcareso_default_doc_page_size', defaultPageSize);
      localStorage.setItem('medcareso_doc_name_scale', String(docNameScale));
      localStorage.setItem('medcareso_doc_spec_scale', String(specialtyScale));
      localStorage.setItem('medcareso_doc_meta_scale', String(metaScale));
      localStorage.setItem('medcareso_doc_text_scale', String(textScale));

      if (cachedSettings) {
        cachedSettings.documentFormats = JSON.stringify(formats);
        cachedSettings.documentTextScales = JSON.stringify(textScales);
        cachedSettings.defaultDocumentPageSize = defaultPageSize;
        cachedSettings.documentDoctorNameScale = docNameScale;
        cachedSettings.documentSpecialtyScale = specialtyScale;
        cachedSettings.documentMetaScale = metaScale;
        cachedSettings.documentTextScale = textScale;
      }
    } catch (_) {}

    clearTimeout(documentSettingsAutoSaveTimer);
    documentSettingsAutoSaveTimer = setTimeout(async () => {
      try {
        if (window.api?.settings?.save) {
          const payload = buildSettingsPayload({
            includePractice: true,
            includeDevices: false,
            includePublicBooking: false
          });
          const res = await window.api.settings.save(payload);
          if (res?.success) {
            cachedSettings = { ...(cachedSettings || {}), ...payload };
          }
        }
      } catch (e) {
        console.warn('Auto-save error:', e);
      }
    }, 400);
  };

  ['cabinet-name', 'cabinet-specialty', 'cabinet-rpps', 'doctor-name-input', 'doctor-rpps', 'doctor-specialty-line1', 'doctor-specialty-line2', 'document-style-variant', 'document-primary-color', 'document-color-mode', 'document-text-scale', 'document-doctor-name-scale', 'document-specialty-scale', 'document-meta-scale', 'document-logo-scale', 'document-font-family', 'default-document-page-size', 'document-bonpour-title'].forEach((id) => {
    const field = document.getElementById(id);
    if (field && !field.dataset.previewBound) {
      field.addEventListener('input', () => {
        updateDocumentStylePreview();
        triggerDocumentSettingsAutoSave();
      });
      field.addEventListener('change', () => {
        updateDocumentStylePreview();
        triggerDocumentSettingsAutoSave();
      });
      field.dataset.previewBound = '1';
    }
  });

  document.querySelectorAll('.doc-custom-format-select, .doc-text-scale-select').forEach((sel) => {
    if (!sel.dataset.autoBound) {
      sel.addEventListener('change', triggerDocumentSettingsAutoSave);
      sel.dataset.autoBound = '1';
    }
  });

  updateDocumentStylePreview();
});

let lastSettingsGeneratedTokenResult = null;

async function useCurrentMachineIdInSettings() {
  try {
    const res = await window.api.license.getMachineId();
    if (res?.success) {
      document.getElementById('settings-gen-device-id').value = res.machineId;
    }
  } catch (_) {}
}

function setSettingsPresetDays(days) {
  const expiryInput = document.getElementById('settings-gen-expiry');
  if (!expiryInput) return;
  const now = new Date();
  now.setDate(now.getDate() + Number(days));
  expiryInput.value = now.toISOString().split('T')[0];
}

function setSettingsPresetDuration(months) {
  const expiryInput = document.getElementById('settings-gen-expiry');
  if (!expiryInput) return;
  if (months === 0) {
    expiryInput.value = '';
    return;
  }
  const now = new Date();
  now.setMonth(now.getMonth() + months);
  expiryInput.value = now.toISOString().split('T')[0];
}

async function generateClientTokenInSettings() {
  const deviceId = document.getElementById('settings-gen-device-id')?.value?.trim();
  const clientName = document.getElementById('settings-gen-client-name')?.value?.trim();
  const expiryDate = document.getElementById('settings-gen-expiry')?.value;
  const resultBox = document.getElementById('settings-gen-result');
  const outputArea = document.getElementById('settings-gen-output');

  if (!deviceId) {
    showNotification('Veuillez entrer le Device ID du client', 'error');
    return;
  }

  try {
    const res = await window.api.license.generateClientToken({
      machineId: deviceId,
      cabinetName: clientName || 'Cabinet Médical',
      expiresAt: expiryDate || null
    });

    if (res && res.success) {
      lastSettingsGeneratedTokenResult = res;
      outputArea.value = res.jsonContent;
      resultBox.style.display = 'block';
      showNotification('⚡ Licence client générée avec succès!', 'success');
    } else {
      showNotification('Erreur: ' + (res?.error || 'Échec de génération'), 'error');
    }
  } catch (err) {
    console.error('Erreur génération licence:', err);
    showNotification('Erreur: ' + err.message, 'error');
  }
}

async function copySettingsGeneratedToken() {
  if (!lastSettingsGeneratedTokenResult?.jsonContent) return;
  try {
    await navigator.clipboard.writeText(lastSettingsGeneratedTokenResult.jsonContent);
    showNotification('📋 Token de licence copié !', 'success');
  } catch (_) {
    showNotification('Utilisez Ctrl+C pour copier la licence', 'warning');
  }
}

async function saveSettingsGeneratedFile() {
  if (!lastSettingsGeneratedTokenResult?.jsonContent) return;
  try {
    const filename = `licence_${(lastSettingsGeneratedTokenResult.cabinetName || 'client').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const res = await window.api.license.saveToFile({
      jsonContent: lastSettingsGeneratedTokenResult.jsonContent,
      defaultFilename: filename
    });
    if (res?.success) {
      showNotification(`💾 Fichier enregistré sous : ${res.filePath}`, 'success');
    }
  } catch (err) {
    showNotification('Erreur sauvegarde: ' + err.message, 'error');
  }
}

async function activateSettingsGeneratedLocally() {
  if (!lastSettingsGeneratedTokenResult?.jsonContent) return;
  try {
    const res = await window.api.license.activate(lastSettingsGeneratedTokenResult.jsonContent);
    if (res?.success) {
      showNotification('✅ Licence activée sur ce poste avec succès !', 'success');
      loadLicenseStatus();
    } else {
      showNotification('Erreur d\'activation: ' + (res?.reason || res?.error), 'error');
    }
  } catch (err) {
    showNotification('Erreur: ' + err.message, 'error');
  }
}

// ─── TYPES D'OPÉRATIONS & NOMENCLATURE CATALOG MANAGEMENT ────────────────────
let settingsOperationsCatalogData = [];
let settingsOperationsCurrentPage = 1;
const SETTINGS_OPERATIONS_PAGE_SIZE = 10;

async function loadSettingsOperationsCatalog(page = 1) {
  const tbody = document.getElementById('settings-operations-catalog-tbody');
  if (!tbody) return;

  const filterSpecialty = document.getElementById('settings-op-specialty-filter')?.value || null;

  try {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 24px; color: #64748b;">Chargement des types d\'opérations...</td></tr>';
    const result = await window.api.operation.getTypesCatalog(filterSpecialty);
    settingsOperationsCatalogData = result && result.success ? (result.data || []) : [];
    settingsOperationsCurrentPage = Number(page) || 1;
    renderSettingsOperationsCatalogTable();
  } catch (error) {
    console.error('Error loading settings operations catalog:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: #ef4444; padding: 18px;">Erreur lors du chargement : ${error.message}</td></tr>`;
  }
}

function renderSettingsOperationsCatalogTable() {
  const tbody = document.getElementById('settings-operations-catalog-tbody');
  if (!tbody) return;

  if (!settingsOperationsCatalogData.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="padding: 36px 16px;">
          <div class="ant-empty" style="display:flex; flex-direction:column; align-items:center;">
            <div style="font-size:14px; font-weight:600; color:#1e293b; margin-bottom:4px;">Aucun type d'acte configuré</div>
            <div style="font-size:12.5px; color:#64748b; margin-bottom:12px;">Ajoutez votre premier acte ou sélectionnez une autre spécialité.</div>
            <button type="button" class="btn btn-primary btn-small" onclick="openOperationTypeEditModal()">+ Ajouter un acte</button>
          </div>
        </td>
      </tr>
    `;
    renderSettingsOperationsPagination(0, 1, 1);
    return;
  }

  const total = settingsOperationsCatalogData.length;
  const totalPages = Math.max(1, Math.ceil(total / SETTINGS_OPERATIONS_PAGE_SIZE));
  if (settingsOperationsCurrentPage > totalPages) settingsOperationsCurrentPage = totalPages;
  if (settingsOperationsCurrentPage < 1) settingsOperationsCurrentPage = 1;

  const startIndex = (settingsOperationsCurrentPage - 1) * SETTINGS_OPERATIONS_PAGE_SIZE;
  const pageItems = settingsOperationsCatalogData.slice(startIndex, startIndex + SETTINGS_OPERATIONS_PAGE_SIZE);

  const specialtyLabels = {
    orl: 'ORL',
    dentistry: 'Dentisterie',
    general: 'Général'
  };

  const specialtyBadges = {
    orl: 'background: #eff6ff; color: #1677ff; border: 1px solid #bfdbfe;',
    dentistry: 'background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;',
    general: 'background: #f8fafc; color: #475569; border: 1px solid #e2e8f0;'
  };

  tbody.innerHTML = pageItems.map(item => {
    const specialty = item.specialty || 'general';
    const specLabel = specialtyLabels[specialty] || specialty;
    const specBadge = specialtyBadges[specialty] || specialtyBadges.general;
    const costVal = item.defaultCost !== undefined ? item.defaultCost : (item.defaultcost !== undefined ? item.defaultcost : (item.cost || 0));
    const costFormatted = (Number(costVal) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' DZD';
    const durationVal = item.defaultDuration !== undefined ? item.defaultDuration : (item.defaultduration !== undefined ? item.defaultduration : (item.duration || 30));
    const duration = durationVal ? `${durationVal} min` : '—';
    const code = item.code || '—';
    const category = item.category || 'Chirurgie';

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 700; color: #1677ff;">${escapeHTML(code)}</td>
        <td>
          <div style="font-weight: 700; color: #1e293b;">${escapeHTML(item.name || '')}</div>
          ${item.description ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">${escapeHTML(item.description)}</div>` : ''}
        </td>
        <td>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; ${specBadge}">${specLabel}</span>
        </td>
        <td>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #334155;">${escapeHTML(category)}</span>
        </td>
        <td style="font-weight: 700; color: #166534;">${costFormatted}</td>
        <td style="font-size: 13px; color: #475569;">${duration}</td>
        <td class="text-right" style="white-space: nowrap;">
          <button type="button" class="btn btn-secondary btn-small" onclick="openOperationTypeEditModal('${item.id}')" style="height: 28px; padding: 0 8px; font-size: 12px; margin-right: 4px;">
            Modifier
          </button>
          <button type="button" class="btn btn-danger btn-small" onclick="deleteSettingsOperationType('${item.id}')" style="height: 28px; padding: 0 8px; font-size: 12px;">
            Supprimer
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderSettingsOperationsPagination(total, settingsOperationsCurrentPage, totalPages);
}

function renderSettingsOperationsPagination(total, page, totalPages) {
  const infoEl = document.getElementById('settings-operations-pagination-info');
  const controlsEl = document.getElementById('settings-operations-pagination-controls');
  if (!infoEl || !controlsEl) return;

  if (total === 0) {
    infoEl.textContent = 'Aucun acte';
    controlsEl.innerHTML = '';
    return;
  }

  const start = (page - 1) * SETTINGS_OPERATIONS_PAGE_SIZE + 1;
  const end = Math.min(total, page * SETTINGS_OPERATIONS_PAGE_SIZE);
  infoEl.textContent = `Affichage de ${start} à ${end} sur ${total} actes (10 par page)`;

  let html = `
    <button type="button" class="btn btn-secondary btn-small" onclick="changeSettingsOperationsPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} style="height:30px; padding:0 10px; font-size:12px;">
      ◀ Précédent
    </button>
    <span style="font-size:13px; font-weight:600; color:#334155; padding:0 6px;">Page ${page} / ${totalPages}</span>
    <button type="button" class="btn btn-secondary btn-small" onclick="changeSettingsOperationsPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''} style="height:30px; padding:0 10px; font-size:12px;">
      Suivant ▶
    </button>
  `;
  controlsEl.innerHTML = html;
}

function changeSettingsOperationsPage(newPage) {
  settingsOperationsCurrentPage = Number(newPage) || 1;
  renderSettingsOperationsCatalogTable();
}

function openOperationTypeEditModal(typeId = null) {
  const form = document.getElementById('operation-type-form');
  if (form) form.reset();

  const titleEl = document.getElementById('modal-op-type-title');
  const idInput = document.getElementById('op-type-id');
  const specSelect = document.getElementById('op-type-specialty');
  const codeInput = document.getElementById('op-type-code');
  const nameInput = document.getElementById('op-type-name');
  const catSelect = document.getElementById('op-type-category');
  const costInput = document.getElementById('op-type-cost');
  const durationInput = document.getElementById('op-type-duration');
  const descInput = document.getElementById('op-type-desc');

  if (typeId) {
    const item = settingsOperationsCatalogData.find(t => String(t.id) === String(typeId));
    if (item) {
      if (titleEl) titleEl.textContent = 'Modifier le Type d\'Opération';
      if (idInput) idInput.value = item.id;
      if (specSelect) specSelect.value = item.specialty || 'orl';
      if (codeInput) codeInput.value = item.code || '';
      if (nameInput) nameInput.value = item.name || '';
      if (catSelect) catSelect.value = item.category || 'Chirurgie';
      const costVal = item.defaultCost !== undefined ? item.defaultCost : (item.defaultcost !== undefined ? item.defaultcost : (item.cost || 0));
      const durationVal = item.defaultDuration !== undefined ? item.defaultDuration : (item.defaultduration !== undefined ? item.defaultduration : (item.duration || 30));
      if (costInput) costInput.value = costVal;
      if (durationInput) durationInput.value = durationVal;
      if (descInput) descInput.value = item.description || '';
    }
  } else {
    if (titleEl) titleEl.textContent = 'Nouveau Type d\'Opération / Acte';
    if (idInput) idInput.value = '';
    const activeSpecialty = (typeof getCurrentActiveSpecialty === 'function') ? getCurrentActiveSpecialty() : 'orl';
    if (specSelect) specSelect.value = activeSpecialty || 'orl';
    if (catSelect) catSelect.value = 'Chirurgie';
    if (costInput) costInput.value = '';
    if (durationInput) durationInput.value = '30';
  }

  showModal('modal-operation-type-edit');
}

async function saveSettingsOperationType(event) {
  if (event) event.preventDefault();

  const id = document.getElementById('op-type-id')?.value || null;
  const specialty = document.getElementById('op-type-specialty')?.value || 'orl';
  const code = document.getElementById('op-type-code')?.value || '';
  const name = document.getElementById('op-type-name')?.value || '';
  const category = document.getElementById('op-type-category')?.value || 'Chirurgie';
  const defaultCost = parseFloat(document.getElementById('op-type-cost')?.value) || 0;
  const defaultDuration = parseInt(document.getElementById('op-type-duration')?.value, 10) || 30;
  const description = document.getElementById('op-type-desc')?.value || '';

  if (!name.trim()) {
    showNotification('Le libellé de l\'acte est obligatoire', 'warning');
    return;
  }

  try {
    const payload = {
      id: id || undefined,
      specialty,
      code,
      name: name.trim(),
      category,
      defaultCost,
      defaultDuration,
      description: description.trim()
    };

    const res = await window.api.operation.saveTypeCatalog(payload);
    if (res && res.success) {
      showNotification('Type d\'opération enregistré avec succès', 'success');
      closeModal('modal-operation-type-edit');
      await loadSettingsOperationsCatalog();
      if (typeof loadOperationsCatalog === 'function') {
        await loadOperationsCatalog();
      }
    } else {
      showNotification('Erreur : ' + (res?.error || 'Impossible d\'enregistrer'), 'error');
    }
  } catch (error) {
    console.error('Error saving operation type:', error);
    showNotification('Erreur : ' + error.message, 'error');
  }
}

async function deleteSettingsOperationType(typeId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce type d\'opération du catalogue ?')) return;

  try {
    const res = await window.api.operation.deleteTypeCatalog(typeId);
    if (res && res.success) {
      showNotification('Type d\'opération supprimé', 'success');
      await loadSettingsOperationsCatalog();
      if (typeof loadOperationsCatalog === 'function') {
        await loadOperationsCatalog();
      }
    } else {
      showNotification('Erreur : ' + (res?.error || 'Suppression impossible'), 'error');
    }
  } catch (error) {
    console.error('Error deleting operation type:', error);
    showNotification('Erreur : ' + error.message, 'error');
  }
}

window.refreshDeviceOptions = refreshDeviceOptions;
window.loadPublicBookingShareData = loadPublicBookingShareData;
window.copyPublicBookingLink = copyPublicBookingLink;
window.printPublicBookingQr = printPublicBookingQr;
window.handleCabinetLogoChange = handleCabinetLogoChange;
window.clearCabinetLogo = clearCabinetLogo;
window.handleAppLogoChange = handleAppLogoChange;
window.chooseApplicationLogo = chooseApplicationLogo;
window.clearAppLogo = clearAppLogo;
window.useBundledTransparentAppLogo = useBundledTransparentAppLogo;
window.saveSettings = savePracticeSettings;
window.savePracticeSettings = savePracticeSettings;
window.savePeripheralSettings = savePeripheralSettings;
window.savePublicBookingSettings = savePublicBookingSettings;
window.useCurrentMachineIdInSettings = useCurrentMachineIdInSettings;
window.setSettingsPresetDays = setSettingsPresetDays;
window.setSettingsPresetDuration = setSettingsPresetDuration;
window.copySettingsGeneratedToken = copySettingsGeneratedToken;
window.switchSettingsPage = switchSettingsPage;
window.saveSettingsGeneratedFile = saveSettingsGeneratedFile;
window.activateSettingsGeneratedLocally = activateSettingsGeneratedLocally;
window.loadSettingsOperationsCatalog = loadSettingsOperationsCatalog;
window.changeSettingsOperationsPage = changeSettingsOperationsPage;
window.openOperationTypeEditModal = openOperationTypeEditModal;
window.saveSettingsOperationType = saveSettingsOperationType;
window.deleteSettingsOperationType = deleteSettingsOperationType;

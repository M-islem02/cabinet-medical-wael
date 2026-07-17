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
const DOCUMENT_STYLE_VARIANTS = new Set(['classic', 'sidebar', 'gradient-header', 'minimal']);

let activeSettingsPage = 'general';

function ensureSettingsAdminCardsVisibility() {
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  const isDoctorAdminUser = currentUserIsAdmin === true && !isSuperAdminUser;
  const userManagementCard = document.getElementById('user-management-card');
  const licenseInfoCard = document.getElementById('license-info-card');
  const dbConfigCard = document.getElementById('db-config-card');

  const setCardVisibility = (card, visible) => {
    if (!card) return;
    card.classList.toggle('role-hidden', !visible);
    card.classList.toggle('hidden', !visible);
    card.style.display = visible ? '' : 'none';
    card.setAttribute('aria-hidden', String(!visible));
  };

  setCardVisibility(userManagementCard, isSuperAdminUser || isDoctorAdminUser);
  setCardVisibility(licenseInfoCard, isSuperAdminUser);
  setCardVisibility(dbConfigCard, isSuperAdminUser);
}

function switchSettingsPage(page = 'general') {
  document.documentElement.classList.add('settings-pages-ready');
  ensureSettingsAdminCardsVisibility();

  const visiblePages = new Set();
  document.querySelectorAll('[data-settings-page]').forEach((card) => {
    if (card.classList.contains('role-hidden')) return;
    String(card.dataset.settingsPage || '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((pageKey) => visiblePages.add(pageKey));
  });

  document.querySelectorAll('.settings-page-tab').forEach((button) => {
    const hasVisibleCards = visiblePages.has(button.dataset.settingsTab || '');
    button.classList.toggle('role-hidden', !hasVisibleCards);
    button.disabled = !hasVisibleCards;
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
      return;
    }
    const pages = String(card.dataset.settingsPage || '')
      .split(/\s+/)
      .filter(Boolean);
    card.classList.toggle('settings-page-hidden', !pages.includes(activeSettingsPage));
  });
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
  preview.dataset.style = style;
  preview.style.setProperty('--preview-accent', accent);
  preview.style.setProperty('--preview-accent-soft', mixHexColor(accent, '#ffffff', 0.35));
  preview.style.setProperty('--preview-on-accent', getReadableTextColor(accent));
  preview.style.setProperty('--preview-watermark-opacity', (opacity / 100).toFixed(2));
}

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

function clearCabinetLogo() {
  updateCabinetLogoPreview('');
  const fileInput = document.getElementById('cabinet-logo-file');
  if (fileInput) fileInput.value = '';
}

function clearCabinetWatermarkLogo() {
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
    const logoDataUrl = await readFileAsBase64(file);
    updateCabinetLogoPreview(logoDataUrl);
  } catch (error) {
    console.error('Error reading logo file:', error);
    showNotification('Impossible de lire le fichier logo', 'error');
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
  } catch (error) {
    console.error('Error loading device options:', error);
  }
}

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
      if (statusEl) statusEl.textContent = 'Portail RDV indisponible';
      if (localUrlEl) localUrlEl.value = '';
      if (publicUrlEl) publicUrlEl.value = '';
      if (qrImg) qrImg.style.display = 'none';
      if (qrEmpty) qrEmpty.style.display = 'block';
      return;
    }
    if (statusEl) {
      if (!result.success) {
        statusEl.textContent = `Erreur portail RDV: ${result.error || shareData.lastError || 'indisponible'}`;
      } else if (!shareData.enabled) {
        statusEl.textContent = 'Portail RDV désactivé';
      } else if (shareData.running) {
        statusEl.textContent = `Portail actif sur le port ${shareData.port}`;
      } else {
        statusEl.textContent = shareData.lastError
          ? `Erreur portail RDV: ${shareData.lastError}`
          : 'Portail RDV en attente';
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
    if (statusEl) statusEl.textContent = 'Erreur chargement portail RDV';
  }
}

async function loadSettings() {
  try {
    const result = await window.api.settings.get();
    const s = result.success && result.data ? result.data : {};
    cachedSettings = s;
    document.getElementById('cabinet-name').value = s.cabinetName || '';
    document.getElementById('cabinet-address').value = s.cabinetAddress || '';
    document.getElementById('cabinet-phone').value = s.cabinetPhone || DEFAULT_CABINET_PHONE;
    document.getElementById('cabinet-email').value = s.cabinetEmail || '';
    document.getElementById('doctor-name-input').value = s.doctorName || '';
    document.getElementById('doctor-rpps').value = s.doctorRPPS || '';
    document.getElementById('doctor-specialty').value = s.doctorSpecialty || '';
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
    const documentTextScaleEl = document.getElementById('document-text-scale');
    if (documentTextScaleEl) {
      const textScale = Number(s.documentTextScale);
      const safeScale = Number.isFinite(textScale) ? Math.min(120, Math.max(90, textScale)) : 100;
      documentTextScaleEl.value = String(safeScale);
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
    updateCabinetLogoPreview(s.cabinetLogoDataUrl || '');
    updateCabinetWatermarkLogoPreview(s.cabinetWatermarkLogoDataUrl || '');
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

function buildSettingsPayload({
  includePractice = true,
  includeDevices = true,
  includePublicBooking = true
} = {}) {
  const existing = cachedSettings || {};

  return {
    cabinetName: includePractice ? document.getElementById('cabinet-name')?.value?.trim() || '' : (existing.cabinetName || ''),
    cabinetAddress: includePractice ? document.getElementById('cabinet-address')?.value?.trim() || '' : (existing.cabinetAddress || ''),
    cabinetPhone: includePractice ? document.getElementById('cabinet-phone')?.value?.trim() || '' : (existing.cabinetPhone || ''),
    cabinetEmail: includePractice ? document.getElementById('cabinet-email')?.value?.trim() || '' : (existing.cabinetEmail || ''),
    doctorName: includePractice ? document.getElementById('doctor-name-input')?.value?.trim() || '' : (existing.doctorName || ''),
    doctorRPPS: includePractice ? document.getElementById('doctor-rpps')?.value?.trim() || '' : (existing.doctorRPPS || ''),
    doctorSpecialty: includePractice ? document.getElementById('doctor-specialty')?.value?.trim() || '' : (existing.doctorSpecialty || ''),
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
    documentTextScale: includePractice
      ? Math.min(120, Math.max(90, Number(document.getElementById('document-text-scale')?.value) || 100))
      : (Math.min(120, Math.max(90, Number(existing.documentTextScale) || 100))),
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
    cabinetLogoDataUrl: includePractice ? document.getElementById('cabinet-logo-data')?.value || '' : (existing.cabinetLogoDataUrl || ''),
    cabinetWatermarkLogoDataUrl: includePractice ? document.getElementById('cabinet-watermark-logo-data')?.value || '' : (existing.cabinetWatermarkLogoDataUrl || ''),
    preferredPrinter: includeDevices ? document.getElementById('preferred-printer')?.value || '' : (existing.preferredPrinter || ''),
    preferredScanner: includeDevices ? document.getElementById('preferred-scanner')?.value || '' : (existing.preferredScanner || ''),
    preferredThermalPrinter: includeDevices ? document.getElementById('preferred-thermal-printer')?.value || '' : (existing.preferredThermalPrinter || ''),
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
    const result = await window.api.settings.save(settingsData);
    if (result.success) {
      cachedSettings = { ...(cachedSettings || {}), ...settingsData };
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
    cabinetName: document.getElementById('cabinet-name').value,
    cabinetAddress: document.getElementById('cabinet-address').value,
    cabinetPhone: document.getElementById('cabinet-phone').value,
    cabinetEmail: document.getElementById('cabinet-email').value,
    doctorName: document.getElementById('doctor-name-input').value,
    doctorRPPS: document.getElementById('doctor-rpps').value,
    doctorSpecialty: document.getElementById('doctor-specialty').value,
    customTreatmentTypes: document.getElementById('custom-treatment-types')?.value || '',
    documentColorMode: document.getElementById('document-color-mode')?.value === 'bw' ? 'bw' : 'color',
    documentPrimaryColor: normalizeHexColor(String(document.getElementById('document-primary-color')?.value || '').trim(), '#1a8c7e'),
    documentTypeColors: JSON.stringify(collectDocumentTypeColorsFromInputs()),
    documentTextScale: Math.min(120, Math.max(90, Number(document.getElementById('document-text-scale')?.value) || 100)),
    documentLogoScale: Math.min(200, Math.max(80, Number(document.getElementById('document-logo-scale')?.value) || 90)),
    documentStyleVariant: normalizeDocumentStyleVariant(document.getElementById('document-style-variant')?.value),
    documentWatermarkOpacity: Math.min(35, Math.max(2, Number(document.getElementById('document-watermark-opacity')?.value) || 5)),
    documentHideSignature: Boolean(document.getElementById('document-hide-signature')?.checked),
    cabinetLogoDataUrl: document.getElementById('cabinet-logo-data')?.value || '',
    cabinetWatermarkLogoDataUrl: document.getElementById('cabinet-watermark-logo-data')?.value || '',
    preferredPrinter: document.getElementById('preferred-printer')?.value || '',
    preferredScanner: document.getElementById('preferred-scanner')?.value || '',
    preferredThermalPrinter: document.getElementById('preferred-thermal-printer')?.value || '',
    publicBookingEnabled: document.getElementById('public-booking-enabled')?.checked || false,
    publicBookingPort: parseInt(document.getElementById('public-booking-port')?.value, 10) || 4580,
    publicBookingPublicUrl: document.getElementById('public-booking-public-url')?.value?.trim() || '',
    publicBookingQrEnabled: document.getElementById('public-booking-qr-enabled')
      ? document.getElementById('public-booking-qr-enabled').checked
      : false
  };

  try {
    const result = await window.api.settings.save(settingsData);
    if (result.success) {
      cachedSettings = { ...(cachedSettings || {}), ...settingsData };
      if (typeof refreshDocumentEditorLogos === 'function') {
        refreshDocumentEditorLogos();
      }
      await loadPublicBookingShareData();
      showNotification(result.warning ? `✅ Paramètres enregistrés • Portail RDV: ${result.warning}` : '✅ Paramètres enregistrés', result.warning ? 'warning' : 'success');
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Erreur lors de l\'enregistrement', 'error');
  }
}

async function savePracticeSettings() {
  if (currentUserIsSuperAdmin) {
    showNotification('Le super administrateur ne peut pas modifier les informations medicales du cabinet.', 'warning');
    return { success: false };
  }
  if (!currentUserIsAdmin) {
    showNotification('Accès réservé au médecin admin', 'warning');
    return { success: false };
  }

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
  const canManageLicense = currentUserIsSuperAdmin;

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
        <p>${escapeHTML(status?.message || 'Connectez-vous avec le super administrateur pour activer une clé.')}</p>
        <p><strong>Clés disponibles:</strong> <code>*****</code></p>
        <p>Utilisez les boutons <strong>5 jours</strong>, <strong>7 jours</strong>, <strong>15 jours</strong>, <strong>1 an</strong> ou <strong>illimitée</strong> pour remplir le champ sans afficher la clé.</p>
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

function formatLicenseTypeLabel(status = {}) {
  if (status.licenseType === 'trial' || status.licenseType === 'duration') {
    return `Essai ${status.durationDays || 7} jours`;
  }
  return status.licenseType === 'annual' ? '1 an' : 'Illimitée';
}

function fillDurationLicenseKey(days = 7) {
  const input = document.getElementById('license-key-input');
  const keyMap = {
    5: 'MEDPRO-TRIAL-5JOURS',
    7: 'MEDPRO-TRIAL-7JOURS',
    15: 'MEDPRO-TRIAL-15JOURS'
  };
  if (input) input.value = keyMap[Number(days)] || keyMap[7];
}

function fillTrialLicenseKey() {
  fillDurationLicenseKey(7);
}

function fillUnlimitedLicenseKey() {
  const input = document.getElementById('license-key-input');
  if (input) input.value = 'MEDPRO-ILLIMITEE-ACTIVE';
}

function fillAnnualLicenseKey() {
  const input = document.getElementById('license-key-input');
  if (input) input.value = 'MEDPRO-ANNUELLE-1AN';
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
  const licenseKey = input?.value?.trim()?.toUpperCase();

  if (!licenseKey) {
    showNotification('Veuillez entrer une clé de licence', 'error');
    return;
  }

  try {
    const result = await window.api.license.activate(licenseKey);
    if (!result.success) {
      showNotification(result.reason || 'Activation impossible', 'error');
      return;
    }

    if (input) input.value = '';
    showNotification(
      result.licenseType === 'trial' || result.licenseType === 'duration'
        ? `Licence ${result.durationDays || 7} jours activée`
        : (result.licenseType === 'annual' ? 'Licence 1 an activée' : 'Licence illimitée activée'),
      'success'
    );
    await loadLicenseStatus();
  } catch (error) {
    console.error('Error activating license:', error);
    showNotification('Erreur lors de l\'activation de la licence', 'error');
  }
});

window.fillTrialLicenseKey = fillTrialLicenseKey;
window.fillDurationLicenseKey = fillDurationLicenseKey;
window.fillAnnualLicenseKey = fillAnnualLicenseKey;
window.fillUnlimitedLicenseKey = fillUnlimitedLicenseKey;
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

  ['document-style-variant', 'document-primary-color', 'document-color-mode', 'document-text-scale', 'document-logo-scale'].forEach((id) => {
    const field = document.getElementById(id);
    if (field && !field.dataset.previewBound) {
      field.addEventListener('input', updateDocumentStylePreview);
      field.addEventListener('change', updateDocumentStylePreview);
      field.dataset.previewBound = '1';
    }
  });
  updateDocumentStylePreview();
});

window.refreshDeviceOptions = refreshDeviceOptions;
window.loadPublicBookingShareData = loadPublicBookingShareData;
window.handleCabinetLogoChange = handleCabinetLogoChange;
window.clearCabinetLogo = clearCabinetLogo;
window.saveSettings = savePracticeSettings;
window.savePracticeSettings = savePracticeSettings;
window.savePeripheralSettings = savePeripheralSettings;
window.savePublicBookingSettings = savePublicBookingSettings;

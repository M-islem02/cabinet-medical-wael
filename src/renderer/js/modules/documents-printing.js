const sharedPrintScope = typeof window !== "undefined" ?window : globalThis

function getDocumentLogoHTML() {
  const logoDataUrl = typeof getCabinetLogoDataUrl === 'function' ?getCabinetLogoDataUrl() : '';
  const appLogoSrc = typeof getAppBrandLogoSrc === 'function' ?getAppBrandLogoSrc() : 'assets/logo.png';
  const safeSrc = String(logoDataUrl || appLogoSrc).replace(/"/g, '&quot;');
  return `
    <div class="logo-circle">
      <img src="${safeSrc}" alt="Logo du cabinet">
    </div>
  `;
}

function getDocumentWatermarkHTML(layout = getPrintLayout("A5"), opacityPercent = 5) {
  const watermarkDataUrl = typeof getCabinetWatermarkLogoDataUrl === 'function' ?getCabinetWatermarkLogoDataUrl() : '';
  const logoDataUrl = typeof getCabinetLogoDataUrl === 'function' ?getCabinetLogoDataUrl() : '';
  const appLogoSrc = typeof getAppBrandLogoSrc === 'function' ?getAppBrandLogoSrc() : 'assets/logo.png';
  const source = String(watermarkDataUrl || logoDataUrl || appLogoSrc || '').trim();
  if (!source) return '';

  const safeSrc = source.replace(/"/g, '&quot;');
  const watermarkClass = layout?.pageSize === 'A4' ?'is-a4' : 'is-a5';
  const safeOpacity = Math.min(35, Math.max(2, Number(opacityPercent) || 5));
  return `
    <div class="page-watermark ${watermarkClass}" aria-hidden="true">
      <img src="${safeSrc}" alt="" style="opacity:${(safeOpacity / 100).toFixed(2)};">
    </div>
  `;
}

function computeAge(dateString) {
  if (!dateString) return "-"
  const dob = new Date(dateString)
  if (Number.isNaN(dob.getTime())) return "-"
  const diff = Date.now() - dob.getTime()
  const age = new Date(diff).getUTCFullYear() - 1970
  return age >= 0 && Number.isFinite(age) ?age : "-"
}

function escapeHTML(str) {
  if (!str) return ""
  const div = document.createElement("div")
  div.textContent = str
  return div.innerHTML
}

function formatDocumentDateLabel(date) {
  if (!date) return new Date().toLocaleDateString("fr-FR")
  const d = new Date(date)
  return d.toLocaleDateString("fr-FR")
}

function formatRichTextHtml(text, fallback = "") {
  return text ?escapeHTML(text) : fallback
}

function getPrintLayout(pageSize = "A5") {
  const normalizedPageSize = String(pageSize || "A5").toUpperCase() === "A4" ?"A4" : "A5"
  const isA4 = normalizedPageSize === "A4"

  return {
    pageSize: normalizedPageSize,
    pageWidth: isA4 ?"210mm" : "148mm",
    pageHeight: isA4 ?"297mm" : "210mm",
    pagePadding: isA4 ?"0mm 8mm" : "0mm 6mm",
    bodyFontSize: isA4 ?"11.6pt" : "9.8pt",
    doctorNameFont: isA4 ?"14pt" : "11.8pt",
    doctorSpecialtyFont: isA4 ?"10pt" : "8.6pt",
    metaFont: isA4 ?"10pt" : "8.4pt",
    logoSize: isA4 ?"44mm" : "30mm",
    titleFont: isA4 ?"22pt" : "16pt",
    sectionTitleFont: isA4 ?"12pt" : "10.4pt",
    contentFont: isA4 ?"11.6pt" : "9.6pt",
    contentLineHeight: isA4 ?"1.6" : "1.45",
    footerFont: isA4 ?"10.6pt" : "8.8pt",
    headerGap: isA4 ?"10mm" : "6mm",
    windowFeatures: isA4 ?"width=1000,height=1200" : "width=820,height=980"
  }
}

function resolveDocumentTextScale(settings = {}) {
  const raw = Number(settings?.documentTextScale);
  const safe = Number.isFinite(raw) ? Math.min(120, Math.max(90, raw)) : 100;
  return safe / 100;
}

function resolveDocumentLogoScale(settings = {}) {
  const raw = Number(settings?.documentLogoScale);
  const safe = Number.isFinite(raw) ? Math.min(200, Math.max(80, raw)) : 90;
  return safe / 100;
}

function resolveDocumentWatermarkOpacity(settings = {}) {
  const raw = Number(settings?.documentWatermarkOpacity);
  return Number.isFinite(raw) ? Math.min(35, Math.max(2, raw)) : 5;
}

function resolveDocumentStyleVariant(settings = {}) {
  const raw = String(settings?.documentStyleVariant || '').trim();
  if (raw === 'modern') return 'gradient-header';
  return ['classic', 'sidebar', 'gradient-header', 'minimal'].includes(raw) ? raw : 'classic';
}

function scalePtValue(value, factor = 1) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)pt$/i);
  if (!match) return value;
  const numeric = Number(match[1]);
  return `${(numeric * factor).toFixed(2)}pt`;
}

function scaleMmValue(value, factor = 1) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)mm$/i);
  if (!match) return value;
  const numeric = Number(match[1]);
  return `${(numeric * factor).toFixed(2)}mm`;
}

function applyLayoutTextScale(layout, factor = 1) {
  if (!layout || factor === 1) return layout;
  return {
    ...layout,
    bodyFontSize: scalePtValue(layout.bodyFontSize, factor),
    doctorNameFont: scalePtValue(layout.doctorNameFont, factor),
    doctorSpecialtyFont: scalePtValue(layout.doctorSpecialtyFont, factor),
    metaFont: scalePtValue(layout.metaFont, factor),
    titleFont: scalePtValue(layout.titleFont, factor),
    sectionTitleFont: scalePtValue(layout.sectionTitleFont, factor),
    contentFont: scalePtValue(layout.contentFont, factor),
    footerFont: scalePtValue(layout.footerFont, factor)
  }
}

function applyLayoutLogoScale(layout, factor = 1) {
  if (!layout || factor === 1) return layout;
  return {
    ...layout,
    logoSize: scaleMmValue(layout.logoSize, factor)
  }
}

function resolveDocumentColorMode(settings = {}) {
  return settings?.documentColorMode === 'bw' ? 'bw' : 'color'
}

function getDefaultDocumentTypeColors() {
  return {
    prescription: '#1a8c7e',
    certificate: '#0ea5e9',
    invoice: '#f59e0b',
    rapport: '#8b5cf6',
    consultation: '#ef4444',
    generic: '#1a8c7e'
  }
}

function parseDocumentTypeColors(settings = {}) {
  const defaults = getDefaultDocumentTypeColors()
  const normalizeHex = (value, fallback) => {
    const raw = String(value || '').trim()
    return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback
  }

  const rawPayload = settings?.documentTypeColors
  if (!rawPayload) return defaults

  try {
    const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload
    return {
      prescription: normalizeHex(parsed?.prescription, defaults.prescription),
      certificate: normalizeHex(parsed?.certificate, defaults.certificate),
      invoice: normalizeHex(parsed?.invoice, defaults.invoice),
      rapport: normalizeHex(parsed?.rapport, defaults.rapport),
      consultation: normalizeHex(parsed?.consultation, defaults.consultation),
      generic: normalizeHex(parsed?.generic, defaults.generic)
    }
  } catch (_) {
    return defaults
  }
}

function resolveDocumentPrimaryColor(settings = {}, documentType = 'generic') {
  if (resolveDocumentColorMode(settings) === 'bw') return '#000000'
  const rawPrimary = String(settings?.documentPrimaryColor || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(rawPrimary)) return rawPrimary
  return '#1a8c7e'
}

function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  }
}

function rgbToHex(r, g, b) {
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

function mixHexColor(color, target = '#ffffff', amount = 0.82) {
  const from = hexToRgb(color) || hexToRgb('#1a8c7e')
  const to = hexToRgb(target) || hexToRgb('#ffffff')
  return rgbToHex(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount
  )
}

function getReadableTextColor(backgroundColor) {
  const rgb = hexToRgb(backgroundColor)
  if (!rgb) return '#ffffff'
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return luminance > 0.58 ? '#111827' : '#ffffff'
}

function generateMedicationColor(baseColor, index, colorMode = 'color') {
  if (colorMode === 'bw') return '#000000'
  const rgb = hexToRgb(baseColor)
  if (!rgb) return '#1a8c7e'
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function getLiveDocumentColorOverrides() {
  if (typeof document === 'undefined') return null

  const normalizeHex = (value) => {
    const raw = String(value || '').trim()
    return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null
  }

  const colorModeRaw = document.getElementById('document-color-mode')?.value
  const styleVariantRaw = document.getElementById('document-style-variant')?.value
  const textScaleRaw = document.getElementById('document-text-scale')?.value
  const logoScaleRaw = document.getElementById('document-logo-scale')?.value
  const watermarkOpacityRaw = document.getElementById('document-watermark-opacity')?.value
  const documentPrimaryColor = normalizeHex(document.getElementById('document-primary-color')?.value)
  const rawTypeColors = {
    prescription: normalizeHex(document.getElementById('document-color-prescription')?.value),
    certificate: normalizeHex(document.getElementById('document-color-certificate')?.value),
    invoice: normalizeHex(document.getElementById('document-color-invoice')?.value),
    rapport: normalizeHex(document.getElementById('document-color-rapport')?.value),
    consultation: normalizeHex(document.getElementById('document-color-consultation')?.value),
    generic: normalizeHex(document.getElementById('document-color-generic')?.value)
  }

  const liveTypeColors = Object.fromEntries(
    Object.entries(rawTypeColors).filter(([, value]) => Boolean(value))
  )
  const hasAnyTypeColor = Object.keys(liveTypeColors).length > 0

  const styleVariant = resolveDocumentStyleVariant({ documentStyleVariant: styleVariantRaw })
  const textScale = Number(textScaleRaw)
  const logoScale = Number(logoScaleRaw)
  const watermarkOpacity = Number(watermarkOpacityRaw)
  const hasAnyOverride = Boolean(documentPrimaryColor) || hasAnyTypeColor || colorModeRaw === 'bw' || colorModeRaw === 'color' || Boolean(styleVariantRaw) || Number.isFinite(textScale) || Number.isFinite(logoScale) || Number.isFinite(watermarkOpacity)
  if (!hasAnyOverride) return null

  const mergedTypeColors = hasAnyTypeColor
    ? { ...getDefaultDocumentTypeColors(), ...liveTypeColors }
    : null

  return {
    documentColorMode: colorModeRaw === 'bw' ? 'bw' : 'color',
    ...(documentPrimaryColor ? { documentPrimaryColor } : {}),
    ...(mergedTypeColors ? { documentTypeColors: mergedTypeColors } : {}),
    ...(styleVariantRaw ? { documentStyleVariant: styleVariant } : {}),
    ...(Number.isFinite(textScale) ? { documentTextScale: Math.min(120, Math.max(90, textScale)) } : {}),
    ...(Number.isFinite(logoScale) ? { documentLogoScale: Math.min(200, Math.max(80, logoScale)) } : {}),
    ...(Number.isFinite(watermarkOpacity) ? { documentWatermarkOpacity: Math.min(35, Math.max(2, watermarkOpacity)) } : {})
  }
}

function getEffectivePrintSettings() {
  const baseSettings = (typeof cachedSettings !== 'undefined' && cachedSettings)
    ? cachedSettings
    : (sharedPrintScope.__printSettingsCache || {})
  const liveOverrides = getLiveDocumentColorOverrides()
  return liveOverrides ? { ...baseSettings, ...liveOverrides } : baseSettings
}

async function ensurePrintSettingsLoaded() {
  if (typeof cachedSettings !== 'undefined' && cachedSettings) {
    sharedPrintScope.__printSettingsCache = cachedSettings
    return cachedSettings
  }

  if (typeof ensureSettingsLoaded === 'function') {
    const loaded = await ensureSettingsLoaded()
    if (loaded) {
      sharedPrintScope.__printSettingsCache = loaded
      return loaded
    }
  }

  if (window.api?.settings?.get) {
    try {
      const result = await window.api.settings.get()
      if (result?.success && result?.data) {
        sharedPrintScope.__printSettingsCache = result.data
        if (typeof cachedSettings !== 'undefined') {
          cachedSettings = result.data
        }
        return result.data
      }
    } catch (error) {
      console.error('Error loading print settings:', error)
    }
  }

  return sharedPrintScope.__printSettingsCache || {}
}

function buildPrintableHtml(opts = {}) {
  const {
    title,
    subtitle,
    dateLabel,
    patient,
    bodyContentHtml,
    documentType = "generic",
    pages = [],
    specialtyKey = null,
    pageSize = "A5"
  } = opts
  let layout = getPrintLayout(pageSize)

  const dateText = escapeHTML(dateLabel || formatDocumentDateLabel(new Date()))
  const ageLabel = computeAge(patient?.dateOfBirth)
  const patientLast = escapeHTML(patient?.lastName || "-")
  const patientFirst = escapeHTML(patient?.firstName || "-")

  // Get settings from cache or use defaults
  const settings = getEffectivePrintSettings();
  const rawDoctorName = typeof normalizeDoctorDisplayName === 'function'
    ?normalizeDoctorDisplayName(settings.doctorName || '')
    : String(settings.doctorName || '').trim();
  const doctorName = rawDoctorName || 'Docteur';
  const doctorSpecialty = typeof getPracticeDoctorSpecialtyText === 'function'
    ?getPracticeDoctorSpecialtyText(settings, specialtyKey)
    : (settings.doctorSpecialty || 'Spécialité non renseignée');
  const doctorRPPS = String(settings.doctorRPPS || '').trim();
  const cabinetPhone = settings.cabinetPhone || 'Téléphone non renseigné';
  const cabinetAddress = settings.cabinetAddress || 'Adresse du cabinet non renseignée';
  const primaryColor = resolveDocumentPrimaryColor(settings, documentType)
  const colorMode = resolveDocumentColorMode(settings)
  const textScale = resolveDocumentTextScale(settings)
  const logoScale = resolveDocumentLogoScale(settings)
  const watermarkOpacity = resolveDocumentWatermarkOpacity(settings)
  const styleVariant = resolveDocumentStyleVariant(settings)
  const hideSignature = settings?.documentHideSignature === 1 || settings?.documentHideSignature === true
  layout = applyLayoutTextScale(layout, textScale)
  layout = applyLayoutLogoScale(layout, logoScale)
  
  // Split specialty into two lines if it's long
  const specialtyLines = doctorSpecialty.length > 50 
    ?[doctorSpecialty.substring(0, doctorSpecialty.indexOf(' ', 40) || 50), doctorSpecialty.substring(doctorSpecialty.indexOf(' ', 40) || 50)]
    : [doctorSpecialty, ''];

  // Generate header HTML (appears on every page)
  const headerHtml = `
    <div class="page-header">
      <div class="header-top">
        <div class="doctor-info">
          <div class="doctor-name">DR. ${escapeHTML(doctorName.toUpperCase())}</div>
          <div class="doctor-specialty">${escapeHTML(specialtyLines[0])}</div>
          ${specialtyLines[1] ?`<div class="doctor-specialty">${escapeHTML(specialtyLines[1])}</div>` : ''}

          <div class="header-meta-inline">
            ${doctorRPPS ?`<span class="meta-item"><span class="meta-label">NUMÉRO D'ORDRE:</span> <span class="meta-value">${escapeHTML(doctorRPPS)}</span></span><span class="meta-separator">|</span>` : ''}
            <span class="meta-item"><span class="meta-label">DATE</span> <span class="meta-value">${dateText}</span></span>
          </div>

          <div class="patient-line-inline">
            <div class="patient-line-main">
              <span class="patient-field"><span class="patient-label">NOM</span> <span class="patient-value">${patientLast.toUpperCase()}</span></span>
              <span class="patient-separator">|</span>
              <span class="patient-field"><span class="patient-label">PRÉNOM</span> <span class="patient-value">${patientFirst.toUpperCase()}</span></span>
            </div>
            <div class="patient-line-age">
              <span class="patient-field"><span class="patient-label">AGE</span> <span class="patient-value">${ageLabel === "-" ?"-" : `${ageLabel} ANS`}</span></span>
            </div>
          </div>
        </div>
        <div class="logo-container">${getDocumentLogoHTML()}</div>
      </div>
      <div class="header-meta">
        
      </div>
      <div class="patient-line">
        </div>
    </div>
  `

  // Generate footer HTML (appears on every page)
  const footerHtml = `
    <div class="page-footer">
      <div class="footer-signature">
        <div class="footer-date">ÉMIS LE ${dateText}</div>
        ${hideSignature ? '' : `<div class="footer-sign">Dr. ${escapeHTML(doctorName)} - Signature et cachet</div>`}
      </div>
      <div class="footer-divider"></div>
      <div class="footer-contact">
        <div class="contact-phone">📞 ${escapeHTML(cabinetPhone)}</div>
        <div class="contact-address">📍 ${escapeHTML(cabinetAddress)}</div>
      </div>
    </div>
  `

  const watermarkHtml = getDocumentWatermarkHTML(layout, watermarkOpacity)

  if (Array.isArray(pages) && pages.length > 0) {
    const pagesHtml = pages.map((pageContent, idx) => `
      <div class="page">
        ${headerHtml}
        <div class="header-divider"></div>

        <div class="page-body">
          ${watermarkHtml}
          <div class="page-body-content">
            ${idx === 0 ?`
              <div class="title-section">
                <h1 class="doc-title">${escapeHTML(title || "CERTIFICAT MÉDICAL")}</h1>
              </div>
            ` : ''}
            ${pageContent}
          </div>
        </div>
        ${footerHtml}
      </div>
    `).join('')

    return generateHtmlDocument(pagesHtml, { documentType, layout, primaryColor, colorMode, styleVariant })
  }

  const singlePageHtml = `
    <div class="page">
      ${headerHtml}
      <div class="header-divider"></div>
      <div class="page-body">
        ${watermarkHtml}
        <div class="page-body-content">
          <div class="title-section">
            <h1 class="doc-title">${escapeHTML(title || "CERTIFICAT MÉDICAL")}</h1>
          </div>
          ${bodyContentHtml || ""}
        </div>
      </div>
      ${footerHtml}
    </div>
  `

  return generateHtmlDocument(singlePageHtml, { documentType, layout, subtitle, primaryColor, colorMode, styleVariant })
}

function buildA5Html(opts) {
  return buildPrintableHtml({ ...(opts || {}), pageSize: "A5" })
}

function buildA4Html(opts) {
  return buildPrintableHtml({ ...(opts || {}), pageSize: "A4" })
}

function generateHtmlDocument(bodyContent, options = {}) {
  const documentType = typeof options === "string" ?options : (options.documentType || "generic")
  const layout = typeof options === "string" ?getPrintLayout("A5") : (options.layout || getPrintLayout("A5"))
  const primaryColor = typeof options === 'string' ?'#1a8c7e' : (options.primaryColor || '#1a8c7e')
  const primarySoftColor = mixHexColor(primaryColor, '#ffffff', 0.35)
  const primaryTintColor = mixHexColor(primaryColor, '#ffffff', 0.94)
  const onPrimaryColor = getReadableTextColor(primaryColor)
  const colorMode = typeof options === 'string' ?'color' : (options.colorMode === 'bw' ? 'bw' : 'color')
  const styleVariant = typeof options === 'string' ?'classic' : resolveDocumentStyleVariant({ documentStyleVariant: options.styleVariant })
  return `<!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Document Médical</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --doc-primary: ${primaryColor};
          --doc-primary-soft: ${primarySoftColor};
          --doc-primary-tint: ${primaryTintColor};
          --doc-on-primary: ${onPrimaryColor};
          --doc-text: #000000;
          --doc-muted: ${colorMode === 'bw' ? '#000000' : '#0f4f47'};
          --doc-border: ${colorMode === 'bw' ? '#000000' : '#1a8c7e'};
        }
        html, body {
          margin: 0;
          padding: 0;
          width: ${layout.pageWidth};
          min-height: ${layout.pageHeight};
          font-family: "Segoe UI", "Calibri", "Noto Sans", "Arial", sans-serif;
          font-size: ${layout.bodyFontSize};
          color: #000000;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          overflow-wrap: break-word;
          word-wrap: break-word;
        }
        @page {
          size: ${layout.pageWidth} ${layout.pageHeight};
          margin: 0;
        }
        @media print {
          html, body { min-height: ${layout.pageHeight}; background: #ffffff; }
          .page {
            box-shadow: none;
            border: none;
            width: ${layout.pageWidth};
            min-height: ${layout.pageHeight};
            padding: ${layout.pagePadding};
            margin: 0;
          }
        }

        .page {
          width: ${layout.pageWidth};
          height: ${layout.pageHeight};
          min-height: ${layout.pageHeight};
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #d4d4d4;
          border-radius: 0;
          padding: ${layout.pagePadding};
          display: grid;
          grid-template-rows: auto auto 1fr auto;
          page-break-after: always;
          page-break-inside: avoid;
          position: relative;
          overflow: hidden;
        }
        .page:last-child { page-break-after: auto; margin-bottom: 0; }

        /* HEADER STYLES */
        .page-header {
          margin-bottom: 0;
          padding: 5px;
        }
        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: ${layout.headerGap};
          margin-bottom: 0;
        }
        .doctor-info {
          flex: 1;
          text-align: left;
        }
        .doctor-name {
          font-size: ${layout.doctorNameFont};
          font-weight: 700;
          margin-bottom: 1mm;
          text-transform: uppercase;
          color: var(--doc-primary);
        }
        .doctor-specialty {
          font-size: ${layout.doctorSpecialtyFont};
          font-weight: 500;
          line-height: 1.2;
          text-transform: uppercase;
          margin-bottom: 0;
          color: var(--doc-primary);
        }
        .doctor-info br { display: none; }
        .doctor-info .meta-item,
        .doctor-info .patient-field { display: inline-block; margin-right: 6mm; margin-left: 0; font-size: ${layout.metaFont}; vertical-align: middle; }
        .meta-label, .patient-label { font-weight: 700; font-size: ${layout.metaFont}; margin-right: 5px; text-transform: uppercase; }
        .meta-value, .patient-value { font-weight: 400; font-size: ${layout.metaFont}; }
        .patient-line-inline {
          margin-top: 0.6mm;
        }
        .patient-line-main {
          display: flex;
          align-items: center;
          gap: 2.8mm;
          flex-wrap: wrap;
        }
        .patient-line-age {
          margin-top: 4px;
        }
        .patient-line-inline .patient-field {
          margin-right: 0;
        }
        .patient-separator {
          font-size: ${layout.metaFont};
          font-weight: 700;
          line-height: 1;
        }

        .logo-container {
          width: ${layout.logoSize};
          height: ${layout.logoSize};
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-circle {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-circle img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .logo-fallback-mark {
          width: 70%;
          height: 70%;
          display: none;
        }
        .logo-fallback .logo-fallback-mark {
          display: block;
        }

        .header-meta {
          font-size: ${layout.metaFont};
          font-weight: 600;
          margin-bottom: 0;
          margin-top: 0;
          display: flex;
          gap: 6mm;
        }
        .meta-separator { color: #000000; }

        .patient-line {
          font-size: ${layout.metaFont};
          font-weight: 400;
          margin-bottom: 0;
          margin-top: 0;
          display: flex;
          gap: 8mm;
        }
        .patient-field strong {
          font-weight: 700;
        }

        .header-divider {
          border-bottom: 0.8px solid var(--doc-border);
          margin-top: 0.8mm;
          margin-bottom: 1.6mm;
        }

        /* BODY STYLES */
        .page-body {
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          isolation: isolate;
          min-height: 0;
        }
        .page-watermark {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          user-select: none;
        }
        .page-watermark img {
          width: 86%;
          max-width: 130mm;
          max-height: 86%;
          object-fit: contain;
          opacity: 0.05;
          filter: grayscale(100%);
        }
        .page-watermark.is-a4 img {
          max-width: 170mm;
          opacity: 0.05;
        }
        .page-body-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }

        .title-section {
          text-align: center;
          margin: 1.6mm 0 2.6mm 0;
        }
        .doc-title {
          font-size: ${layout.titleFont};
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: none;
          letter-spacing: 1px;
          color: var(--doc-primary);
        }
        .doc-title::after {
          content: "••••••••••";
          display: block;
          font-size: 11pt;
          letter-spacing: 2px;
          line-height: 1;
          margin-top: 1.2mm;
          color: var(--doc-primary);
        }

        .content-box {
          border: 1px solid var(--doc-border);
          border-radius: 0;
          padding: 4mm;
          margin-bottom: 4mm;
          background: transparent;
        }
        .content-box h3 {
          font-size: ${layout.sectionTitleFont};
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 2.5mm;
          color: #000000;
          border-bottom: 1px solid var(--doc-border);
          padding-bottom: 1.6mm;
        }
        .content-text {
          font-size: ${layout.contentFont};
          line-height: ${layout.contentLineHeight};
          white-space: pre-wrap;
          color: #000000;
        }
        body[data-document-type="rapport"] .rapport-content {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        body[data-document-type="rapport"] .content-text {
          font-size: 12.4pt;
          line-height: 1.7;
          text-align: justify;
        }
        body[data-document-type="prescription"] .title-section {
          margin: 1.2mm 0 2.4mm 0;
        }
        body[data-document-type="prescription"] .doc-title {
          font-size: 13.6pt;
          letter-spacing: 0.6px;
        }
        body[data-document-type="prescription"] .prescription-summary {
          display: block;
          margin-bottom: 1mm;
          font-size: 8.8pt;
          font-weight: 700;
          text-transform: uppercase;
          color: #111827;
          text-align: right;
        }
        body[data-document-type="prescription"] .prescription-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.8mm 2.2mm;
          border: 1px solid #111827;
          border-radius: 2px;
          font-size: 8.2pt;
          font-weight: 700;
          letter-spacing: 0;
          background: transparent;
        }
        body[data-document-type="prescription"] .page {
          padding-top: 1.2mm;
          padding-bottom: 1.8mm;
        }
        body[data-document-type="prescription"] .header-top {
          align-items: flex-start;
          gap: 4mm;
        }
        body[data-document-type="prescription"] .logo-container {
          width: calc(${layout.logoSize} * 0.72);
          height: calc(${layout.logoSize} * 0.72);
        }
        body[data-document-type="prescription"] .doctor-name {
          margin-bottom: 0.6mm;
          font-size: 14.2pt;
          letter-spacing: 0.25px;
          font-weight: 800;
        }
        body[data-document-type="prescription"] .doctor-specialty {
          font-size: 7.8pt;
          font-weight: 600;
          letter-spacing: 0.2px;
          line-height: 1.12;
        }
        body[data-document-type="prescription"] .header-divider {
          margin-top: 0.6mm;
          margin-bottom: 1.2mm;
        }
        body[data-document-type="prescription"] .medication-list {
          gap: 0;
        }
        body[data-document-type="prescription"] .content-box {
          border: none;
          padding: 1mm 0 0.6mm;
        }
        body[data-document-type="prescription"] .medication-item {
          padding: 1.8mm 0;
          font-size: 9.2pt;
          line-height: 1.34;
          gap: 0.8mm;
          page-break-inside: avoid;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          border-bottom: none;
        }
        body[data-document-type="prescription"] .medication-item .med-name {
          min-width: 0;
          flex: 0 0 auto;
          font-size: 9.6pt;
          color: var(--doc-primary);
        }
        body[data-document-type="prescription"] .medication-item .med-details {
          flex: 1 1 auto;
          font-size: 8.2pt;
        }
        body[data-document-type="prescription"] .med-line {
          display: flex;
          flex-wrap: wrap;
          gap: 2.2mm;
          align-items: baseline;
        }
        body[data-document-type="prescription"] .med-line.med-line-1 {
          width: 100%;
          justify-content: space-between;
          align-items: baseline;
        }
        body[data-document-type="prescription"] .med-line.med-line-2 {
          width: 100%;
          justify-content: flex-start;
          text-align: left;
          color: #1f2937;
          margin-top: 0.2mm;
        }
        body[data-document-type="prescription"] .med-line .med-field {
          font-size: 8.6pt;
          color: #111827;
        }
        body[data-document-type="prescription"] .med-line .med-field.med-field-strong {
          font-weight: 700;
        }
        body[data-document-type="prescription"] .med-line.med-line-2 .med-field {
          font-size: 8.4pt;
        }
        body[data-document-type="prescription"] .med-qty {
          font-size: 8.8pt;
          font-weight: 700;
          color: #111827;
          margin-left: 8mm;
          white-space: nowrap;
          text-transform: uppercase;
        }
        body[data-document-type="prescription"] .page-footer {
          padding-top: 1.6mm;
        }
        body[data-document-type="certificate"] .content-box {
          padding: 3mm;
          margin-bottom: 3mm;
        }
        body[data-document-type="certificate"] .content-box h3 {
          margin-bottom: 1.8mm;
          padding-bottom: 1mm;
          font-size: 10.2pt;
        }
        body[data-document-type="certificate"] .content-text {
          font-size: 9pt;
          line-height: 1.45;
        }
        body[data-document-type="certificate"] .info-row {
          display: block;
          margin-bottom: 0;
        }
        body[data-document-type="certificate"] .info-item {
          display: block;
          border: none;
          padding: 1.2mm 0;
          background: transparent;
          font-size: 8.8pt;
        }
        body[data-document-type="certificate"] .content-box.content-box-plain {
          border: none;
          padding: 0;
          margin-bottom: 2.2mm;
          background: transparent;
        }
        body[data-document-type="certificate"] .period-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.6mm 6mm;
          margin-top: 0.8mm;
        }
        body[data-document-type="certificate"] .period-item {
          display: flex;
          align-items: baseline;
          gap: 1.4mm;
          font-size: 9pt;
          line-height: 1.35;
          padding: 0.2mm 0;
          border: none;
          background: transparent;
        }
        body[data-document-type="certificate"] .period-label {
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.25px;
          color: #0f172a;
          min-width: 16mm;
        }
        body[data-document-type="certificate"] .period-value {
          font-weight: 700;
          color: #000000;
        }
        body[data-document-type="certificate"] .page-footer {
          padding-top: 1.2mm;
        }
        body[data-document-type="orientation"] .title-section {
          margin: 1.6mm 0 2.6mm 0;
        }
        body[data-document-type="orientation"] .doc-title {
          font-size: 13.2pt;
          letter-spacing: 0.55px;
        }
        body[data-document-type="orientation"] .content-box {
          border: none;
          background: transparent;
          padding: 0 1mm;
          margin-bottom: 0;
        }
        body[data-document-type="orientation"] .content-text {
          font-size: 10.7pt;
          line-height: 1.72;
          white-space: normal;
        }
        body[data-document-type="orientation"] .orientation-letter-shell {
          flex: 1;
        }
        body[data-document-type="orientation"] .orientation-letter {
          padding: 0 0.6mm;
        }
        body[data-document-type="orientation"] .orientation-letter .orientation-salutation {
          font-weight: 600;
        }
        body[data-document-type="orientation"] .orientation-letter .orientation-closing {
          margin-top: 4mm;
          margin-bottom: 0;
        }
        body[data-document-type="orientation"] .content-text p {
          margin: 0 0 5.2mm 0;
          text-align: left;
        }
        body[data-document-type="orientation"] .page-footer {
          padding-top: 1.2mm;
        }
        .rapport-meta-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 4mm;
          margin-bottom: 5mm;
        }
        .rapport-meta-item {
          flex: 1 1 30%;
          min-width: 42mm;
          border: 1px solid #000000;
          padding: 2.5mm 3.5mm;
          font-size: ${layout.metaFont};
          background: transparent;
        }
        .rapport-meta-item strong {
          display: block;
          margin-bottom: 1mm;
          text-transform: uppercase;
        }
        .rapport-intro {
          margin-bottom: 4mm;
        }
        .rapport-signoff {
          margin-top: 8mm;
          text-align: right;
          font-size: ${layout.contentFont};
        }

        .info-row {
          display: flex;
          gap: 5mm;
          font-size: ${layout.contentFont};
          margin-bottom: 4mm;
          flex-wrap: wrap;
        }
        .info-item {
          padding: 3mm 5mm;
          background: transparent;
          border: 1px solid #000000;
          border-radius: 0;
          white-space: nowrap;
        }
        .info-item strong {
          font-weight: 700;
        }

        .medication-list {
          display: flex;
          flex-direction: column;
          gap: 3mm;
        }
        .medication-item {
          border-bottom: 1px solid #d0d0d0;
          padding: 3mm 0;
          background: transparent;
          font-size: 11pt;
          line-height: 1.5;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 4mm;
        }
        .medication-item:last-child {
          border-bottom: none;
        }
        .medication-item .med-name {
          font-weight: 700;
          min-width: 35%;
        }
        .medication-item .med-details {
          color: #000000;
          font-size: ${layout.metaFont};
        }
        .prescription-notes-body {
          font-size: ${layout.contentFont};
          line-height: ${layout.contentLineHeight};
          white-space: pre-wrap;
          color: #000000;
        }

        .page-footer {
          padding-top: 2.2mm;
          border-top: 1px solid var(--doc-border);
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .footer-signature {
          display: flex;
          justify-content: space-between;
          font-size: ${layout.footerFont};
          font-weight: 600;
          gap: 5mm;
        }
        .footer-date {
          text-transform: uppercase;
        }
        .footer-sign {
          text-transform: uppercase;
          text-align: right;
          color: var(--doc-primary);
        }
        .footer-divider {
          margin: 1.4mm 0 1.2mm;
          border-top: 1px solid var(--doc-border);
        }
        .footer-contact {
          text-align: center;
          font-size: ${layout.footerFont};
          color: var(--doc-muted);
        }
        .contact-phone,
        .contact-address {
          margin: 0.8mm 0;
          font-weight: 600;
        }
        .contact-subline {
          font-size: 9pt;
          color: #555555;
        }

        body[data-document-style="modern"] .header-top {
          align-items: flex-start;
          gap: 4.5mm;
        }
        body[data-document-style="modern"] .logo-container {
          width: calc(${layout.logoSize} * 0.84);
          height: calc(${layout.logoSize} * 0.84);
        }
        body[data-document-style="modern"] .doctor-name {
          font-size: calc(${layout.doctorNameFont} * 1.10);
          letter-spacing: 0.3px;
          margin-bottom: 0.4mm;
        }
        body[data-document-style="modern"] .doctor-specialty {
          font-size: calc(${layout.doctorSpecialtyFont} * 0.96);
          letter-spacing: 0.2px;
        }
        body[data-document-style="modern"] .header-divider {
          border-bottom-width: 1.2px;
          margin-top: 0.2mm;
          margin-bottom: 0.9mm;
        }
        body[data-document-style="modern"] .title-section {
          margin: 0.6mm 0 1.4mm;
        }
        body[data-document-style="modern"] .doc-title {
          font-size: calc(${layout.titleFont} * 0.94);
          letter-spacing: 1.1px;
        }
        body[data-document-style="modern"] .page-footer {
          padding-top: 0.8mm;
        }
        body[data-document-style="modern"] .footer-signature {
          align-items: baseline;
        }
        body[data-document-style="modern"] .footer-sign {
          font-size: calc(${layout.footerFont} * 0.92);
        }
        body[data-document-style="modern"] .footer-divider {
          margin: 0.8mm 0 0.6mm;
        }

        body[data-document-style="sidebar"] .page {
          grid-template-columns: 30% 70%;
          grid-template-rows: 1fr auto;
          padding: 0;
        }
        body[data-document-style="sidebar"] .page-header {
          grid-column: 1;
          grid-row: 1 / span 2;
          margin: 0;
          padding: 10mm 7mm;
          background: linear-gradient(180deg, var(--doc-primary), var(--doc-primary-soft));
          color: var(--doc-on-primary);
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }
        body[data-document-style="sidebar"] .header-top {
          display: flex;
          flex-direction: column-reverse;
          align-items: flex-start;
          gap: 7mm;
        }
        body[data-document-style="sidebar"] .doctor-info {
          color: var(--doc-on-primary);
        }
        body[data-document-style="sidebar"] .doctor-name,
        body[data-document-style="sidebar"] .doctor-specialty,
        body[data-document-style="sidebar"] .meta-label,
        body[data-document-style="sidebar"] .meta-value,
        body[data-document-style="sidebar"] .patient-label,
        body[data-document-style="sidebar"] .patient-value,
        body[data-document-style="sidebar"] .patient-separator,
        body[data-document-style="sidebar"] .meta-separator {
          color: var(--doc-on-primary);
        }
        body[data-document-style="sidebar"] .doctor-info .meta-item,
        body[data-document-style="sidebar"] .doctor-info .patient-field {
          display: block;
          margin: 0 0 2mm;
        }
        body[data-document-style="sidebar"] .patient-line-main {
          display: block;
        }
        body[data-document-style="sidebar"] .patient-separator {
          display: none;
        }
        body[data-document-style="sidebar"] .logo-container {
          filter: none;
        }
        body[data-document-style="sidebar"] .header-divider {
          display: none;
        }
        body[data-document-style="sidebar"] .page-body {
          grid-column: 2;
          grid-row: 1;
          padding: 9mm 9mm 5mm;
          background: #ffffff;
        }
        body[data-document-style="sidebar"] .page-footer {
          grid-column: 2;
          grid-row: 2;
          margin: 0 9mm 7mm;
        }
        body[data-document-style="sidebar"] .title-section {
          text-align: left;
          margin-top: 0;
        }
        body[data-document-style="sidebar"] .doc-title::after {
          content: "";
          width: 28mm;
          height: 1px;
          margin-top: 2mm;
          background: var(--doc-primary);
        }

        body[data-document-style="gradient-header"] .page {
          padding: 0;
          grid-template-rows: auto 1fr auto;
        }
        body[data-document-style="gradient-header"] .page-header {
          margin: 0;
          padding: 9mm 9mm 8mm;
          background: linear-gradient(135deg, var(--doc-primary), var(--doc-primary-soft));
          color: var(--doc-on-primary);
        }
        body[data-document-style="gradient-header"] .doctor-name,
        body[data-document-style="gradient-header"] .doctor-specialty,
        body[data-document-style="gradient-header"] .meta-label,
        body[data-document-style="gradient-header"] .meta-value,
        body[data-document-style="gradient-header"] .patient-label,
        body[data-document-style="gradient-header"] .patient-value,
        body[data-document-style="gradient-header"] .patient-separator,
        body[data-document-style="gradient-header"] .meta-separator {
          color: var(--doc-on-primary);
        }
        body[data-document-style="gradient-header"] .header-divider {
          display: none;
        }
        body[data-document-style="gradient-header"] .page-body {
          padding: 8mm 9mm 5mm;
          background: #ffffff;
        }
        body[data-document-style="gradient-header"] .page-footer {
          margin: 0 9mm 7mm;
        }
        body[data-document-style="gradient-header"] .title-section {
          text-align: left;
          margin-top: 0;
        }
        body[data-document-style="gradient-header"] .doc-title::after {
          content: "";
          width: 24mm;
          height: 1px;
          margin-top: 2mm;
          background: var(--doc-primary);
        }

        body[data-document-style="minimal"] .page {
          padding: ${layout.pageSize === 'A4' ? '12mm 16mm' : '9mm 11mm'};
        }
        body[data-document-style="minimal"] .page-header {
          padding: 0;
        }
        body[data-document-style="minimal"] .doctor-name {
          color: #111827;
          letter-spacing: 0;
        }
        body[data-document-style="minimal"] .doctor-specialty {
          color: #374151;
          letter-spacing: 0;
        }
        body[data-document-style="minimal"] .header-divider,
        body[data-document-style="minimal"] .footer-divider,
        body[data-document-style="minimal"] .page-footer {
          border-color: var(--doc-primary);
        }
        body[data-document-style="minimal"] .title-section {
          text-align: left;
          margin: 5mm 0 6mm;
        }
        body[data-document-style="minimal"] .doc-title {
          color: #111827;
          letter-spacing: 0.04em;
        }
        body[data-document-style="minimal"] .doc-title::after {
          content: "";
          width: 18mm;
          height: 1px;
          background: var(--doc-primary);
          margin-top: 2mm;
        }
        body[data-document-style="minimal"] .content-box,
        body[data-document-style="minimal"] .rapport-meta-item,
        body[data-document-style="minimal"] .info-item {
          border-color: var(--doc-primary);
          background: transparent;
        }
      </style>
    </head>
    <body data-document-type="${documentType}" data-document-style="${styleVariant}">
      ${bodyContent}
    </body>
    </html>
  `
}

function ensurePreviewMessageBridge() {
  if (sharedPrintScope.__documentPreviewBridgeReady) return
  sharedPrintScope.__documentPreviewBridgeReady = true

  window.addEventListener('message', async (event) => {
    const data = event?.data || {}
    if (data?.source !== 'medcare-print-preview') return

    if (data?.type === 'print') {
      const payload = sharedPrintScope.__pendingPreviewPrintPayload || null
      if (!payload) return
      try {
        await printHtmlDocument(payload)
      } catch (error) {
        console.error('Preview print error:', error)
      }
      return
    }

    if (data?.type === 'close-preview') {
      try {
        if (sharedPrintScope.__documentPreviewWindow && !sharedPrintScope.__documentPreviewWindow.closed) {
          sharedPrintScope.__documentPreviewWindow.close()
        }
      } catch (_) {}
    }
  })
}

function buildPreviewShellHtml(previewUrl = '') {
  const safePreviewUrl = String(previewUrl || '').replace(/"/g, '&quot;')
  return `<!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Aperçu document</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; font-family: "Segoe UI", Arial, sans-serif; background: #f1f5f9; }
      .preview-bar {
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        border-bottom: 1px solid #dbe2ea;
        background: #ffffff;
      }
      .preview-title { font-size: 13px; font-weight: 600; color: #111827; }
      .preview-actions { display: flex; gap: 8px; }
      .preview-btn {
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
        border-radius: 6px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .preview-btn.preview-btn-primary {
        background: #1a8c7e;
        color: #ffffff;
        border-color: #1a8c7e;
      }
      .preview-body { height: calc(100% - 52px); }
      .preview-frame { width: 100%; height: 100%; border: none; background: #ffffff; }
    </style>
  </head>
  <body>
    <div class="preview-bar">
      <div class="preview-title">Aperçu exact du document (A5/A4)</div>
      <div class="preview-actions">
        <button class="preview-btn preview-btn-primary" onclick="window.opener && window.opener.postMessage({ source: 'medcare-print-preview', type: 'print' }, '*')">Imprimer</button>
        <button class="preview-btn" onclick="window.opener && window.opener.postMessage({ source: 'medcare-print-preview', type: 'close-preview' }, '*'); window.close();">Fermer</button>
      </div>
    </div>
    <div class="preview-body">
      <iframe class="preview-frame" src="${safePreviewUrl}"></iframe>
    </div>
    <script>
      window.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
          e.preventDefault();
          if (window.opener) {
            window.opener.postMessage({ source: 'medcare-print-preview', type: 'print' }, '*');
          }
        }
      });
    </script>
  </body>
  </html>`
}

function openPreparedPrintWindow(html, { pageSize = 'A5', documentTitle = 'Document médical', printerType = 'standard', printerName = '', duplexMode = 'longEdge', windowFeatures = "width=980,height=1100" } = {}) {
  ensurePreviewMessageBridge()

  const printWindow = window.open("", "medcare-print-preview", windowFeatures)
  if (!printWindow) {
    if (typeof showNotification === 'function') {
      showNotification("Autorisez les pop-ups pour l'aperçu d'impression", "error")
    } else {
      alert("Autorisez les pop-ups pour l'aperçu d'impression")
    }
    return false
  }

  try {
    const oldUrl = sharedPrintScope.__documentPreviewBlobUrl
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl)
    }
  } catch (_) {}

  const blob = new Blob([String(html || '')], { type: 'text/html;charset=utf-8' })
  const previewUrl = URL.createObjectURL(blob)
  sharedPrintScope.__documentPreviewBlobUrl = previewUrl
  sharedPrintScope.__pendingPreviewPrintPayload = {
    html,
    pageSize,
    documentTitle,
    printerType,
    printerName,
    duplexMode
  }

  printWindow.document.write(buildPreviewShellHtml(previewUrl))
  printWindow.document.close()
  try {
    printWindow.document.title = `Aperçu - ${documentTitle}`
    printWindow.focus()
  } catch (_) {}
  sharedPrintScope.__documentPreviewWindow = printWindow
  return true
}

async function printHtmlDocument({ html, pageSize = "A5", documentTitle = "Document médical", printerType = "standard", printerName = "", duplexMode = "longEdge" } = {}) {
  if (typeof ensureSettingsLoaded === 'function') {
    await ensureSettingsLoaded();
  }

  if (typeof showNotification === 'function') {
    showNotification("En train d'imprimer...", "success")
  }

  if (!window.api?.print?.html) {
    throw new Error("Impression silencieuse non disponible");
  }

  const result = await window.api.print.html({
    html,
    pageSize,
    documentTitle,
    printerType,
    printerName: printerName || cachedSettings?.preferredPrinter || "",
    duplexMode
  });

  if (!result?.success) {
    throw new Error(result?.error || "Impossible d'imprimer le document");
  }

  return result;
}

async function openPrintDocument(opts = {}, pageSize = "A5") {
  try {
    await ensurePrintSettingsLoaded();

    const html = buildPrintableHtml({ ...(opts || {}), pageSize })
    const opened = openPreparedPrintWindow(html, {
      html,
      pageSize,
      documentTitle: opts?.title || "Document médical",
      printerType: opts?.printerType || 'standard',
      printerName: opts?.printerName || (cachedSettings?.preferredPrinter || ''),
      duplexMode: opts?.duplexMode || (String(pageSize || 'A5').toUpperCase() === 'A5' ? 'longEdge' : undefined)
    })
    if (!opened) {
      await printHtmlDocument({
        html,
        pageSize,
        documentTitle: opts?.title || "Document médical",
        printerType: opts?.printerType || 'standard',
        printerName: opts?.printerName || (cachedSettings?.preferredPrinter || ''),
        duplexMode: opts?.duplexMode || (String(pageSize || 'A5').toUpperCase() === 'A5' ? 'longEdge' : undefined)
      })
    } else if (typeof showNotification === 'function') {
      showNotification("Aperçu ouvert. Cliquez sur Imprimer dans la popup.", "success")
    }
  } catch (error) {
    console.error('Error opening print document:', error)
    if (typeof showNotification === 'function') {
      showNotification(error?.message || "Erreur lors de l'impression du document", "error")
    }
    throw error
  }
}

async function openA5PrintDocument(opts) {
  return openPrintDocument(opts, "A5")
}

async function openA4PrintDocument(opts) {
  return openPrintDocument(opts, "A4")
}

function renderPrescriptionModal(prescription, patient) {
  const medications = Array.isArray(prescription.medications)
    ?prescription.medications
    : JSON.parse(prescription.medications || "[]")
  const medHTML = medications.length
    ?medications.map(m => `
        <div class="consultation-section" style="border-left: 4px solid #0d6efd; padding-left: 12px;">
          <h4 style="margin-bottom: 8px; text-transform: uppercase;">${escapeHTML(m.name || 'Médicament')}</h4>
          <div class="details-content" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            <div><span class="details-label">Prise</span><div class="details-value">${escapeHTML(m.intake || '-')}</div></div>
            <div><span class="details-label">Durée</span><div class="details-value">${escapeHTML(m.duration || '-')}</div></div>
            <div><span class="details-label">Boîtes</span><div class="details-value">${escapeHTML(m.boxes || '-')}</div></div>
          </div>
          ${m.instructions ?`<p style="margin-top: 8px; font-style: italic;">${formatRichTextHtml(m.instructions, '')}</p>` : ''}
        </div>
      `).join('')
    : '<p style="color: var(--text-light);">Aucun médicament</p>'

  const container = document.getElementById('prescription-details-content')
  if (container) {
    const date = new Date(prescription.date || prescription.prescriptionDate || Date.now())
    container.innerHTML = `
      <div class="info-box">
        <h3 style="color: var(--primary-color); margin-bottom: 16px;">Ordonnance du ${date.toLocaleDateString('fr-FR')}</h3>
        <p style="margin:0; color: var(--text-light);">${escapeHTML(`${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient')}</p>
      </div>
      ${medHTML}
      ${prescription.notes ?`
        <div class="consultation-section">
          <h4>Instructions générales</h4>
          <p style="white-space: pre-wrap; line-height: 1.6;">${formatRichTextHtml(prescription.notes, '')}</p>
        </div>
      ` : ''}
    `
  }

  const printBtn = document.getElementById('btn-print-prescription')
  if (printBtn) {
    printBtn.onclick = () => printPrescriptionDetails(prescription.id)
  }

  if (typeof showModal === 'function') {
    showModal('modal-view-prescription')
  }
}

async function viewPrescriptionDetails(prescriptionId) {
  try {
    if (!prescriptionId) {
      showNotification('Aucune ordonnance sélectionnée', 'error')
      return
    }
    const result = await window.api.prescription.getById(prescriptionId)
    if (!result.success) throw new Error(result.error || 'Prescription introuvable')
    const prescription = result.data

    const patResult = await window.api.patient.getById(prescription.patientId)
    if (!patResult.success) throw new Error('Patient introuvable')
    const patient = patResult.data

    sharedPrintScope.currentPrescriptionId = prescriptionId
    sharedPrintScope.currentPrescriptionDetails = prescription
    sharedPrintScope.currentPrescriptionPatient = patient

    renderPrescriptionModal(prescription, patient)
  } catch (error) {
    console.error('Error viewing prescription:', error)
    showNotification('Erreur lors de la lecture de l\'ordonnance', 'error')
  }
}

async function printPrescriptionDetails(prescriptionId) {
  try {
    if (typeof ensureSettingsLoaded === 'function') {
      await ensureSettingsLoaded()
    }
    const idToUse = prescriptionId || sharedPrintScope.currentPrescriptionId || null
    if (!idToUse) {
      showNotification('Aucune ordonnance sélectionnée', 'error')
      return
    }

    let prescription = sharedPrintScope.currentPrescriptionDetails
    if (!prescription || prescription.id !== idToUse) {
      const pResult = await window.api.prescription.getById(idToUse)
      if (!pResult.success) throw new Error('Prescription introuvable')
      prescription = pResult.data
    }

    let patient = sharedPrintScope.currentPrescriptionPatient
    if (!patient || patient.id !== prescription.patientId) {
      const patResult = await window.api.patient.getById(prescription.patientId)
      if (!patResult.success) throw new Error('Patient introuvable')
      patient = patResult.data
    }

    const rawMedications = Array.isArray(prescription.medications)
      ?prescription.medications
      : JSON.parse(prescription.medications || '[]')
    const medications = (Array.isArray(rawMedications) ?rawMedications : [])
      .map((med) => ({
        name: String(med?.name || '').trim(),
        dosage: String(med?.dosage || '').trim(),
        intake: String(med?.intake || '').trim(),
        duration: String(med?.duration || '').trim(),
        boxes: String(med?.boxes || '').trim(),
        instructions: String(med?.instructions || '').trim()
      }))
      .filter((med) => med.name || med.dosage || med.intake || med.duration || med.boxes || med.instructions)

    const rawDate = prescription.prescriptionDate || prescription.date || new Date().toISOString()
    const formattedDate = formatDocumentDateLabel(rawDate)
    const generalNotes = formatRichTextHtml(prescription.notes || '', '')

    // Règle demandée: 8 médicaments par page autant que possible.
    const medsCount = medications.length
    const pageDistribution = []
    if (medsCount <= 0) {
      pageDistribution.push(0)
    } else if (medsCount <= 8) {
      pageDistribution.push(medsCount)
    } else {
      let remaining = medsCount
      while (remaining > 0) {
        if (remaining <= 8) {
          pageDistribution.push(remaining)
          remaining = 0
        } else {
          pageDistribution.push(8)
          remaining -= 8
        }
      }
    }

    const totalPages = pageDistribution.length
    const lastPageMedicationCount = pageDistribution[pageDistribution.length - 1] || 0
    const splitNotesToExtraPage = Boolean(generalNotes) && (
      lastPageMedicationCount >= 8
      || String(prescription.notes || '').trim().length > 220
    )

    const pageContents = []
    const documentSettings = typeof cachedSettings !== 'undefined' ? cachedSettings : {}
    const docColorMode = resolveDocumentColorMode(documentSettings)
    const docPrimaryColor = resolveDocumentPrimaryColor(documentSettings, 'prescription')
    let cursor = 0
    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      const pageCount = pageDistribution[pageNum] || 0
      const startIdx = cursor
      const endIdx = Math.min(startIdx + pageCount, medications.length)
      const pageMeds = medications.slice(startIdx, endIdx)
      cursor = endIdx

      const medsHtml = pageMeds.map((med, idx) => {
        const safeName = escapeHTML(med.name || 'Médicament')
        const safeDosage = escapeHTML(med.dosage || '')
        const safeDuration = escapeHTML(med.duration || '')
        const safeFrequency = escapeHTML(med.intake || '')
        const safeNotes = escapeHTML(med.instructions || '')
        const safeQty = escapeHTML(med.boxes || '-')
        const medColor = generateMedicationColor(docPrimaryColor, startIdx + idx, docColorMode)

        const posologyParts = [
          safeDosage ? `Dosage: ${safeDosage}` : '',
          safeFrequency ? `${safeFrequency}` : '',
          safeDuration ? `Durée: ${safeDuration}` : '',
          safeNotes ? `Infos: ${safeNotes}` : ''
        ].filter(Boolean)
        const posologyLine = posologyParts.length ? posologyParts.join(' - ') : ''

        return `
          <div class="medication-item">
            <div class="med-line med-line-1">
              <span class="med-name" style="color:${medColor}">${String(startIdx + idx + 1)}. ${safeName}</span>
              <span class="med-qty" style="color:${medColor}">Qté: ${safeQty}</span>
            </div>
            <div class="med-line med-line-2">
              ${posologyLine ?`<span class="med-field med-field-strong">${posologyLine}</span>` : ''}
            </div>
          </div>
        `
      }).join('')

      let pageContent = `
        ${pageNum === 0 ?`
          <div class="prescription-summary">
            <div class="prescription-count">${medications.length} médicament${medications.length > 1 ?'s' : ''}</div>
          </div>
        ` : ''}
        <div class="content-box">
          <div class="medication-list">
            ${medsHtml || `
              <div class="medication-item">
                <span class="med-name">Aucun médicament</span>
                <span class="med-details">Aucune ligne de traitement n'a été renseignée.</span>
              </div>
            `}
          </div>
        </div>
      `

      if (pageNum === totalPages - 1 && generalNotes && !splitNotesToExtraPage) {
        pageContent += `
          <div class="content-box">
            <h3>Instructions generales</h3>
            <div class="prescription-notes-body">${generalNotes}</div>
          </div>
        `
      }

      pageContents.push(pageContent)
    }

    if (generalNotes && splitNotesToExtraPage) {
      pageContents.push(`
        <div class="content-box">
          <h3>Instructions generales</h3>
          <div class="prescription-notes-body">${generalNotes}</div>
        </div>
      `)
    }

    await openA5PrintDocument({
      title: 'ORDONNANCE',
      subtitle: 'Prescription médicale',
      dateLabel: formattedDate,
      patient,
      documentType: 'prescription',
      pages: pageContents,
      duplexMode: pageContents.length > 1 ? 'longEdge' : 'simplex'
    })
  } catch (error) {
    console.error('Error printing prescription:', error)
    showNotification('Erreur lors de l\'impression', 'error')
  }
}

function renderSickLeaveModal(sickLeave, patient) {
  const startDateObj = sickLeave.startDate ?new Date(sickLeave.startDate) : null
  const endDateObj = sickLeave.endDate ?new Date(sickLeave.endDate) : null
  const createdDateObj = sickLeave.createdAt ?new Date(sickLeave.createdAt) : new Date()
  const daysCount = sickLeave.numberOfDays || (startDateObj && endDateObj
    ?Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1
    : '-')
  const daysLabel = daysCount === '-'
    ?'-'
    : (typeof formatRestDaysWithWords === 'function'
      ?formatRestDaysWithWords(daysCount)
      : `${daysCount} jour${daysCount > 1 ?'s' : ''}`)
  const outingsLabel = sickLeave.allowedOutings ?'Autorisées' : 'Non autorisées'

  const container = document.getElementById('sickleave-details-content')
  if (container) {
    container.innerHTML = `
      <div class="info-box">
        <h3 style="color: var(--primary-color); margin-bottom: 8px;">Certificat médical</h3>
        <p style="margin:0; color: var(--text-light);">${escapeHTML(`${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient')}</p>
      </div>
      <div class="consultation-section">
        <h4>Période</h4>
        <p>Du ${startDateObj ?startDateObj.toLocaleDateString('fr-FR') : '-'} au ${endDateObj ?endDateObj.toLocaleDateString('fr-FR') : '-'} (${escapeHTML(String(daysLabel))})</p>
      </div>
      <div class="consultation-section">
        <h4>Sorties</h4>
        <p>${outingsLabel}</p>
      </div>
      <div class="consultation-section">
        <h4>Texte du certificat</h4>
        <p>${formatRichTextHtml((sickLeave.diagnosis || '').trim() || 'Repos médical prescrit.', '')}</p>
      </div>
      ${sickLeave.notes ?`<div class="consultation-section"><h4>Notes complémentaires</h4><p>${formatRichTextHtml(sickLeave.notes, '')}</p></div>` : ''}
      <div class="consultation-section">
        <h4>Créé le</h4>
        <p>${createdDateObj.toLocaleDateString('fr-FR')}</p>
      </div>
    `
  }

  const printBtn = document.getElementById('btn-print-sickleave')
  if (printBtn) {
    printBtn.onclick = () => printSickLeaveDetails(sickLeave.id)
  }

  if (typeof showModal === 'function') {
    showModal('modal-view-sickleave')
  }
}

async function viewSickLeaveDetails(sickLeaveId) {
  try {
    if (!sickLeaveId) {
      showNotification('Aucun certificat médical sélectionné', 'error')
      return
    }

    const result = await window.api.sickleave.getById(sickLeaveId)
    if (!result.success) throw new Error('Certificat introuvable')
    const sickLeave = result.data

    const patResult = await window.api.patient.getById(sickLeave.patientId)
    if (!patResult.success) throw new Error('Patient introuvable')
    const patient = patResult.data

    sharedPrintScope.currentSickLeaveId = sickLeaveId
    sharedPrintScope.currentSickLeaveDetails = sickLeave
    sharedPrintScope.currentSickLeavePatient = patient

    renderSickLeaveModal(sickLeave, patient)
  } catch (error) {
    console.error('Error viewing sick leave:', error)
    showNotification('Erreur lors de la lecture du certificat', 'error')
  }
}

async function printSickLeaveDetails(sickLeaveId) {
  try {
    const idToUse = sickLeaveId || sharedPrintScope.currentSickLeaveId || null
    if (!idToUse) {
      showNotification('Aucun certificat médical sélectionné', 'error')
      return
    }

    let sickLeave = sharedPrintScope.currentSickLeaveDetails
    if (!sickLeave || sickLeave.id !== idToUse) {
      const result = await window.api.sickleave.getById(idToUse)
      if (!result.success) throw new Error('Certificat introuvable')
      sickLeave = result.data
    }

    let patient = sharedPrintScope.currentSickLeavePatient
    if (!patient || patient.id !== sickLeave.patientId) {
      const patResult = await window.api.patient.getById(sickLeave.patientId)
      if (!patResult.success) throw new Error('Patient introuvable')
      patient = patResult.data
    }

    const startDateObj = new Date(sickLeave.startDate)
    const endDateObj = new Date(sickLeave.endDate)
    const createdDateObj = new Date(sickLeave.createdAt || sickLeave.startDate || Date.now())
    const daysCount = sickLeave.numberOfDays || Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1
    const daysLabel = typeof formatRestDaysWithWords === 'function'
      ?formatRestDaysWithWords(daysCount)
      : `${daysCount} jour${daysCount > 1 ?'s' : ''}`
    const diagnosis = formatRichTextHtml((sickLeave.diagnosis || '').trim() || 'Repos medical prescrit.')
    const notesText = formatRichTextHtml((sickLeave.notes || '').trim(), '')
    const outingsLabel = sickLeave.allowedOutings ?'Autorisees' : 'Non autorisees'

    const pageContent = `
      <div class="content-box content-box-plain">
        <h3>Periode</h3>
        <div class="period-grid">
          <div class="period-item"><span class="period-label">Debut:</span> <span class="period-value">${startDateObj.toLocaleDateString('fr-FR')}</span></div>
          <div class="period-item"><span class="period-label">Fin:</span> <span class="period-value">${endDateObj.toLocaleDateString('fr-FR')}</span></div>
          <div class="period-item"><span class="period-label">Duree:</span> <span class="period-value">${escapeHTML(String(daysLabel))}</span></div>
          <div class="period-item"><span class="period-label">Sorties:</span> <span class="period-value">${outingsLabel}</span></div>
        </div>
      </div>
      <div class="content-box">
        <h3>Texte du certificat</h3>
        <div class="content-text">${diagnosis}</div>
      </div>
      ${notesText ?`
        <div class="content-box">
          <h3>Notes complementaires</h3>
          <div class="content-text">${notesText}</div>
        </div>
      ` : ''}
    `

    await openA5PrintDocument({
      title: 'CERTIFICAT MEDICAL',
      subtitle: 'Certificat medical',
      dateLabel: formatDocumentDateLabel(createdDateObj),
      patient,
      bodyContentHtml: pageContent,
      documentType: 'certificate',
      pages: [pageContent]
    })
  } catch (error) {
    console.error('Error printing sick leave:', error)
    showNotification('Erreur lors de l\'impression du certificat', 'error')
  }
}

function normalizeInvoicePrintData(raw = {}) {
  const normalized = typeof normalizeFacturePayload === 'function'
    ? normalizeFacturePayload(raw)
    : {
        mainLabel: raw.mainLabel || 'Consultation',
        invoiceDate: raw.invoiceDate || new Date().toISOString(),
        numberOfSessions: raw.numberOfSessions ?? '',
        rhythm: raw.rhythm || 'Selon prescription',
        unitPrice: raw.unitPrice ?? '',
        totalPrice: raw.totalPrice ?? '',
        notes: raw.notes || '',
        additionalItems: Array.isArray(raw.additionalItems) ? raw.additionalItems : []
      }
  const totals = typeof calculateFactureTotals === 'function'
    ? calculateFactureTotals(normalized)
    : {
        baseTotal: Number(normalized.totalPrice) || 0,
        additionalTotal: 0,
        grandTotal: Number(normalized.totalPrice) || 0
      }

  return {
    ...normalized,
    ...totals
  }
}

function formatPrintCurrency(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return "-"
  return `${numericValue.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DZD`
}

function extractCityFromAddress(address) {
  const raw = String(address || '').trim()
  if (!raw) return ''
  const tokens = raw
    .split(/[-,]/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!tokens.length) return ''
  return tokens[tokens.length - 1].toUpperCase()
}

function isImagingExamTitle(title) {
  const value = String(title || '').toLowerCase()
  if (!value) return false
  return /(echograph|échograph|mammograph|scanner|tomodensit|irm|radiograph|doppler|imagerie|echo|échocardiograph)/.test(value)
}

function normalizeDoctorDisplayName(name) {
  const value = String(name || '').trim()
  if (!value) return ''
  return value.replace(/^dr\.?\s+/i, '').trim()
}

function buildConsultationContextText(consultation = null) {
  if (!consultation || typeof consultation !== 'object') return ''
  const actsText = Array.isArray(consultation.acts)
    ?consultation.acts.map((act) => String(act || '').trim()).filter(Boolean).join(' ')
    : ''
  return [
    consultation.consultationType,
    consultation.type,
    actsText
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
}

function isReductionContext(value) {
  return /(reduction|réduction|luxation|fracture|platre|plâtre)/i.test(String(value || ''))
}

function shouldUseMotifAsReportTitle() {
  return false
}

function joinReportTexts(values = []) {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

function formatRapportOrganFindingForPrint(finding = {}) {
  const entries = Array.isArray(finding?.entries) ? finding.entries : []
  return entries
    .filter((entry) => String(entry?.value || '').trim())
    .map((entry) => {
      const label = String(entry?.label || 'Detail').trim()
      const value = String(entry?.value || '').trim()
      return label ? `${label} : ${value}` : value
    })
    .join('\n')
}

function formatRapportOrganFindingsForPrint(findings = []) {
  return (Array.isArray(findings) ? findings : [])
    .map((finding, index) => {
      const organLabel = String(finding?.organ || '').trim() || `Organe ${index + 1}`
      const details = formatRapportOrganFindingForPrint(finding)
      return [organLabel, details].filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

function buildSpecialtyReportSections({ specialtyKey, specialtyMeta, consultation, motif, organFindings, organTarget, contexte, constats, priseEnCharge, recommandations, notes }) {
  const safeSpecialty = String(specialtyKey || 'general').trim().toLowerCase()
  const contextSignals = `${motif || ''} ${buildConsultationContextText(consultation)}`.trim()
  const isImaging = isImagingExamTitle(contextSignals)
  const isReduction = isReductionContext(contextSignals)
  const mergedResults = joinReportTexts([constats, priseEnCharge])
  const selectedOrganOrZone = String(organTarget || '').trim() || String(contexte || '').trim()
  const reportMeta = specialtyMeta?.report || {}
  const defaultObjectTitle = reportMeta.objectTitle || 'Motif / Objet'
  const defaultContextTitle = reportMeta.contextTitle || 'Contexte clinique'
  const defaultFindingsTitle = reportMeta.findingsTitle || 'Constatations cliniques'
  const defaultCareTitle = reportMeta.careTitle || 'Prise en charge'
  const defaultConclusionTitle = reportMeta.conclusionTitle || 'Conclusion et recommandations'
  const structuredFindings = Array.isArray(organFindings)
    ? organFindings.filter((finding) => {
        const organ = String(finding?.organ || '').trim()
        const hasEntries = Array.isArray(finding?.entries) && finding.entries.some((entry) => String(entry?.value || '').trim())
        return organ || hasEntries
      })
    : []

  let blocks = []

  if (structuredFindings.length > 0) {
    blocks = [
      { title: 'Indications', content: motif },
      {
        title: reportMeta.findingsTitle || 'Examen clinique',
        content: formatRapportOrganFindingsForPrint(structuredFindings)
      },
      {
        title: reportMeta.conclusionTitle || 'Conclusion',
        content: recommandations
      }
    ]
  } else if (['cardiology', 'mpr', 'urology'].includes(safeSpecialty)) {
    const organTitle = reportMeta.organTitle || reportMeta.contextTitle || 'Organe / Zone examinee'
    const findingsTitle = reportMeta.findingsTitle || 'Description et resultats'
    const conclusionTitle = reportMeta.conclusionTitle || 'Conclusion'
    blocks = [
      { title: 'Indication', content: motif },
      { title: organTitle, content: selectedOrganOrZone },
      { title: 'Résultats et explorations', content: mergedResults || constats },
      { title: 'Conclusion et suivi', content: recommandations }
    ]
    blocks = [
      { title: 'Indications', content: motif },
      { title: organTitle, content: selectedOrganOrZone },
      { title: findingsTitle, content: mergedResults || constats },
      { title: conclusionTitle, content: recommandations }
    ]
  } else if (safeSpecialty === 'dentistry') {
    blocks = [
      { title: 'Motif', content: motif },
      { title: 'Contexte bucco-dentaire', content: contexte },
      { title: 'Constatations et soins', content: mergedResults || constats },
      { title: 'Conclusion et recommandations', content: recommandations }
    ]
  } else if (safeSpecialty === 'mpr') {
    blocks = [
      { title: 'Indication', content: motif },
      { title: 'Antécédents et contexte fonctionnel', content: contexte },
      { title: 'Examen clinique et bilan fonctionnel', content: constats },
      { title: 'Prise en charge thérapeutique et rééducative', content: priseEnCharge },
      { title: 'Conclusion', content: recommandations }
    ]
  } else if (isReduction) {
    blocks = [
      { title: 'Objet / Type de réduction', content: motif },
      { title: 'Examen initial', content: contexte },
      { title: 'Geste réalisé et contrôle', content: mergedResults || constats },
      { title: 'Conclusion et consignes', content: recommandations }
    ]
  } else if (isImaging) {
    blocks = [
      { title: 'Technique', content: contexte },
      { title: 'Résultats', content: mergedResults || constats },
      { title: 'Conclusion', content: recommandations }
    ]
  } else {
    blocks = [
      { title: defaultObjectTitle, content: motif },
      { title: defaultContextTitle, content: contexte },
      { title: defaultFindingsTitle, content: constats },
      { title: defaultCareTitle, content: priseEnCharge },
      { title: defaultConclusionTitle, content: recommandations }
    ]
  }

  if (notes && String(notes).trim()) {
    blocks.push({ title: 'Notes complémentaires', content: notes })
  }

  return blocks.filter((block) => String(block.content || '').trim())
}

async function renderInvoiceDocument({ patient, invoiceData }) {
  const normalized = normalizeInvoicePrintData(invoiceData || {})
  const dateLabel = formatDocumentDateLabel(normalized.invoiceDate)

  const baseDetailParts = [
    normalized.numberOfSessions !== '' ?`${escapeHTML(String(normalized.numberOfSessions))} séance${Number(normalized.numberOfSessions) > 1 ?'s' : ''}` : '',
    normalized.unitPrice !== '' ?`${escapeHTML(String(normalized.unitPrice))} DZD / unité` : ''
  ].filter(Boolean)
  const invoiceRows = []
  const hasBaseRow = Boolean(
    normalized.baseTotal
    || normalized.numberOfSessions !== ''
    || normalized.unitPrice !== ''
    || ((normalized.additionalItems || []).length === 0 && normalized.mainLabel)
  )

  if (hasBaseRow) {
    const hasBaseAmount = normalized.baseTotal || normalized.numberOfSessions !== '' || normalized.unitPrice !== ''
    invoiceRows.push(`
      <tr>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">${escapeHTML(normalized.mainLabel || 'Consultation')}</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">${baseDetailParts.join(' • ') || '-'}</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000; text-align:right; font-weight:700;">${hasBaseAmount ?escapeHTML(formatPrintCurrency(normalized.baseTotal)) : '-'}</td>
      </tr>
    `)
  }

  ;(normalized.additionalItems || []).forEach((item) => {
    const hasAmount = item.amount !== '' && item.amount !== null && item.amount !== undefined
    const amount = hasAmount ?Number(item.amount) : null
    invoiceRows.push(`
      <tr>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">${escapeHTML(item.label || 'Ligne supplémentaire')}</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000;">Montant</td>
        <td style="padding:2.2mm; border-bottom:1px solid #000; text-align:right; font-weight:700;">${hasAmount ?escapeHTML(formatPrintCurrency(amount)) : '-'}</td>
      </tr>
    `)
  })

  const servicesTable = `
    <table style="width:100%; border-collapse:collapse; font-size:10.8pt; margin-top:3mm;">
      <thead>
        <tr style="border-bottom:1.5px solid #000;">
          <th style="text-align:left; padding:2.2mm; font-weight:700;">Désignation</th>
          <th style="text-align:left; padding:2.2mm; font-weight:700;">Détails</th>
          <th style="text-align:right; padding:2.2mm; font-weight:700;">Montant</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRows.length ?invoiceRows.join('') : `
          <tr>
            <td colspan="3" style="padding:2.2mm; border-bottom:1px solid #000;">Aucune ligne de facturation renseignée.</td>
          </tr>
        `}
      </tbody>
    </table>
  `

  const pageContent = `
    <div style="margin-bottom: 4mm;">
      <h3 style="font-size: ${getPrintLayout("A5").sectionTitleFont}; margin-bottom: 2mm; border-bottom: 1px solid #000; padding-bottom: 1mm;">Détails de facturation</h3>
      ${servicesTable}
    </div>
    <div style="margin-bottom: 4mm;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; font-size: 11.2pt; font-weight: 700;">
        <span>Montant total</span>
        <span>${escapeHTML(formatPrintCurrency(normalized.grandTotal))}</span>
      </div>
    </div>
    ${normalized.notes ?`
      <div class="content-box">
        <h3>Notes</h3>
        <div class="content-text">${formatRichTextHtml(normalized.notes, '')}</div>
      </div>
    ` : ''}
  `

  const printableInvoiceContent = pageContent
    .replace('Supplements', 'Autres montants')
    .replace('Suppl?ments', 'Autres montants')

  await openA5PrintDocument({
    title: 'FACTURE',
    subtitle: 'Facture',
    dateLabel,
    patient,
    bodyContentHtml: printableInvoiceContent,
    documentType: 'invoice',
    pages: [printableInvoiceContent]
  })
}

function buildMprRapportDocumentHtml({ patient, rapportData, dateLabel, consultation, specialtyMeta }) {
  const settings = typeof cachedSettings !== 'undefined' ?cachedSettings : {}
  const rapportLayout = getPrintLayout("A5")
  const cabinetName = escapeHTML((settings.cabinetName || 'Cabinet medical').toUpperCase())
  const cleanDoctorName = normalizeDoctorDisplayName(settings.doctorName || '') || 'Docteur'
  const doctorName = escapeHTML(cleanDoctorName.toUpperCase())
  const doctorSpecialty = escapeHTML(
    typeof getPracticeDoctorSpecialtyText === 'function'
      ?getPracticeDoctorSpecialtyText(settings, specialtyMeta?.key)
      : (settings.doctorSpecialty || '')
  )
  const doctorRPPS = escapeHTML(settings.doctorRPPS || '')
  const cabinetPhone = escapeHTML(settings.cabinetPhone || '')
  const cabinetAddress = escapeHTML(settings.cabinetAddress || '')
  const cabinetCity = escapeHTML(extractCityFromAddress(settings.cabinetAddress || ''))
  const logoDataUrl = typeof getCabinetLogoDataUrl === 'function' ?getCabinetLogoDataUrl() : ''
  const patientFullName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || 'Patient'
  const safePatientFullName = escapeHTML(patientFullName)
  const ageLabel = computeAge(patient?.dateOfBirth)
  const ageText = escapeHTML(ageLabel === '-' ?'-' : `${ageLabel} ans`)
  const defaultReportTitle = specialtyMeta?.report?.printTitle || 'COMPTE RENDU MPR'
  const reportTitleSource = shouldUseMotifAsReportTitle({ motif: rapportData?.motif, consultation })
    ?String(rapportData?.motif || '').trim()
    : (String(rapportData?.documentTitle || '').trim() || defaultReportTitle)
  const reportTitle = escapeHTML((reportTitleSource || defaultReportTitle).toUpperCase())
  const reportSubtitle = escapeHTML(
    specialtyMeta?.report?.printSubtitle
    || specialtyMeta?.report?.typeLabel
    || 'Medecine Physique et Readaptation'
  )
  const consultationRaw = consultation?.consultationType || consultation?.type || ''
  const consultationLabel = escapeHTML(
    (typeof getConsultationActLabel === 'function' ?getConsultationActLabel(consultationRaw) : consultationRaw)
    || specialtyMeta?.report?.printSubtitle
    || 'Consultation MPR'
  )
  const referringDoctorSource = consultation?.referringDoctor || consultation?.treatingDoctor || consultation?.doctorName || ''
  const referringDoctorName = normalizeDoctorDisplayName(referringDoctorSource)
  const hasReferringDoctor = Boolean(referringDoctorName) && referringDoctorName.toLowerCase() !== cleanDoctorName.toLowerCase()
  const referringDoctor = hasReferringDoctor ?escapeHTML(`Dr ${referringDoctorName}`) : ''
  const sections = buildSpecialtyReportSections({
    specialtyKey: 'mpr',
    specialtyMeta,
    consultation,
    motif: rapportData?.motif,
    organFindings: rapportData?.organFindings,
    organTarget: rapportData?.organTarget,
    contexte: rapportData?.contexte,
    constats: rapportData?.constats,
    priseEnCharge: rapportData?.priseEnCharge,
    recommandations: rapportData?.recommandations,
    notes: rapportData?.notes
  })
  const sectionsHtml = sections.length
    ?sections.map((section) => `
        <div class="report-section">
          <div class="report-section-title">${escapeHTML(section.title.toUpperCase())}</div>
          <div class="report-section-body">${formatRichTextHtml(section.content, '')}</div>
        </div>
      `).join('')
    : `
      <div class="report-section">
        <div class="report-section-title">OBSERVATIONS</div>
        <div class="report-section-body">${formatRichTextHtml(rapportData?.motif || 'Compte rendu MPR', '')}</div>
      </div>
    `
  const logoHtml = logoDataUrl ?`
    <div class="report-logo">
      <img src="${escapeHTML(logoDataUrl)}" alt="Logo du cabinet">
    </div>
  ` : ''

  return `<!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Compte rendu MPR</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          width: ${rapportLayout.pageWidth};
          min-height: ${rapportLayout.pageHeight};
          background: #ffffff;
          color: #000000;
          font-family: "Times New Roman", "Georgia", serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page {
          size: ${rapportLayout.pageWidth} ${rapportLayout.pageHeight};
          margin: 0;
        }
        .page {
          width: ${rapportLayout.pageWidth};
          min-height: ${rapportLayout.pageHeight};
          margin: 0 auto;
          padding: 6.5mm 7mm 8mm;
          display: flex;
          flex-direction: column;
        }
        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 5mm;
          padding-bottom: 3mm;
          border-bottom: 1px solid #000000;
        }
        .report-header-main {
          flex: 1;
        }
        .report-logo {
          width: 18mm;
          display: flex;
          justify-content: flex-end;
        }
        .report-logo img {
          max-width: 18mm;
          max-height: 18mm;
          object-fit: contain;
        }
        .report-cabinet {
          font-size: 10pt;
          font-weight: 700;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .report-doctor {
          margin-top: 1mm;
          font-size: 11pt;
          font-weight: 700;
          text-transform: uppercase;
        }
        .report-specialty {
          margin-top: 0.8mm;
          font-size: 8.5pt;
          line-height: 1.28;
          text-transform: uppercase;
        }
        .report-rpps-row {
          margin-top: 1.3mm;
          display: flex;
          flex-wrap: wrap;
          gap: 2mm 6mm;
          font-size: 8.1pt;
          line-height: 1.25;
        }
        .report-title-block {
          text-align: center;
          margin: 4mm 0 4.5mm;
        }
        .report-kicker {
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 1mm;
        }
        .report-title {
          font-size: 12.2pt;
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: underline;
          letter-spacing: 0.4px;
        }
        .report-patient-card {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 2.4mm 5mm;
          padding: 2.4mm 0;
          margin-bottom: 4mm;
          border-top: 1px solid #000000;
          border-bottom: 1px solid #000000;
          font-size: 8.5pt;
          line-height: 1.24;
        }
        .report-patient-item {
          display: flex;
          flex-direction: column;
          gap: 0.6mm;
        }
        .report-patient-label {
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.2px;
        }
        .report-section {
          margin-bottom: 3.4mm;
          font-size: 8.9pt;
          line-height: 1.34;
        }
        .report-section-title {
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: underline;
          margin-bottom: 0.9mm;
        }
        .report-section-body {
          white-space: pre-wrap;
          text-align: justify;
        }
        .report-signature {
          margin-top: 5mm;
          text-align: right;
          font-size: 8.6pt;
          line-height: 1.35;
        }
        .report-signature-doctor {
          margin-top: 4mm;
          font-weight: 700;
          text-transform: uppercase;
        }
        .report-footer {
          margin-top: auto;
          padding-top: 3mm;
          border-top: 1px solid #000000;
          text-align: center;
          font-size: 8.2pt;
          line-height: 1.35;
        }
        .report-footer-line {
          font-weight: 600;
        }
        @media print {
          .page {
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="report-header">
          <div class="report-header-main">
            <div class="report-cabinet">${cabinetName}</div>
            <div class="report-doctor">DR ${doctorName}</div>
            ${doctorSpecialty ?`<div class="report-specialty">${doctorSpecialty}</div>` : ''}
            <div class="report-rpps-row">
              ${doctorRPPS ?`<span><strong>N&deg; d'ordre :</strong> ${doctorRPPS}</span>` : ''}
              <span><strong>Date :</strong> ${cabinetCity ?`${cabinetCity}, ` : ''}${escapeHTML(dateLabel)}</span>
            </div>
          </div>
          ${logoHtml}
        </div>

        <div class="report-title-block">
          <div class="report-kicker">${reportSubtitle}</div>
          <div class="report-title">${reportTitle}</div>
        </div>

        <div class="report-patient-card">
          <div class="report-patient-item">
            <span class="report-patient-label">Patient</span>
            <span>${safePatientFullName}</span>
          </div>
          <div class="report-patient-item">
            <span class="report-patient-label">Age</span>
            <span>${ageText}</span>
          </div>
          <div class="report-patient-item">
            <span class="report-patient-label">Consultation</span>
            <span>${consultationLabel}</span>
          </div>
          ${hasReferringDoctor ?`
            <div class="report-patient-item">
              <span class="report-patient-label">Medecin traitant</span>
              <span>${referringDoctor}</span>
            </div>
          ` : ''}
        </div>

        ${sectionsHtml}

        <div class="report-signature">
          <div>${cabinetCity ?`${cabinetCity}, le ` : 'Le '}${escapeHTML(dateLabel)}</div>
          <div class="report-signature-doctor">Dr ${doctorName}</div>
        </div>

        <div class="report-footer">
          ${cabinetPhone ?`<div class="report-footer-line">📞 ${cabinetPhone}</div>` : ''}
          ${cabinetAddress ?`<div class="report-footer-line">📍 ${cabinetAddress}</div>` : ''}
        </div>
      </div>
    </body>
    </html>`
}

function buildRapportDocumentHtml({ patient, rapportData, dateLabel, consultation, specialtyMeta }) {
  if ((specialtyMeta?.key || rapportData?.specialtyKey || '').toLowerCase() === 'mpr') {
    return buildMprRapportDocumentHtml({ patient, rapportData, dateLabel, consultation, specialtyMeta })
  }

  const settings = typeof cachedSettings !== 'undefined' ?cachedSettings : {}
  const rapportLayout = getPrintLayout("A5")
  const cabinetName = escapeHTML((settings.cabinetName || 'Cabinet Médical').toUpperCase())
  const cleanDoctorName = normalizeDoctorDisplayName(settings.doctorName || '') || 'Docteur'
  const doctorName = escapeHTML(cleanDoctorName.toUpperCase())
  const doctorSpecialty = escapeHTML(
    typeof getPracticeDoctorSpecialtyText === 'function'
      ?getPracticeDoctorSpecialtyText(settings, specialtyMeta?.key)
      : (settings.doctorSpecialty || '')
  )
  const doctorRPPS = escapeHTML(settings.doctorRPPS || '')
  const cabinetPhone = escapeHTML(settings.cabinetPhone || '')
  const cabinetAddress = escapeHTML(settings.cabinetAddress || '')
  const cabinetCity = escapeHTML(extractCityFromAddress(settings.cabinetAddress || ''))
  const logoDataUrl = typeof getCabinetLogoDataUrl === 'function' ?getCabinetLogoDataUrl() : ''
  const patientFullName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || 'Patient'
  const safePatientFullName = escapeHTML(patientFullName)
  const ageLabel = computeAge(patient?.dateOfBirth)
  const ageText = ageLabel === '-' ?'' : ` ${ageLabel} ans`
  const defaultReportTitle = specialtyMeta?.report?.printTitle || 'Rapport médical'
  const reportTitleSource = shouldUseMotifAsReportTitle({ motif: rapportData?.motif, consultation })
    ?String(rapportData?.motif || '').trim()
    : (String(rapportData?.documentTitle || '').trim() || defaultReportTitle)
  const reportTitle = escapeHTML((reportTitleSource || defaultReportTitle).toUpperCase())
  const consultationRaw = consultation?.consultationType || consultation?.type || ''
  const consultationLabel = escapeHTML(
    (typeof getConsultationActLabel === 'function' ?getConsultationActLabel(consultationRaw) : consultationRaw)
    || specialtyMeta?.report?.printSubtitle
    || 'Rapport médical'
  )
  const referringDoctorSource = consultation?.referringDoctor || consultation?.treatingDoctor || consultation?.doctorName || settings.doctorName || ''
  const referringDoctorName = normalizeDoctorDisplayName(referringDoctorSource)
  const referringDoctor = referringDoctorName
    ?escapeHTML(`Dr ${referringDoctorName}`)
    : escapeHTML('Médecin traitant')

  const sections = buildSpecialtyReportSections({
    specialtyKey: specialtyMeta?.key || rapportData?.specialtyKey || 'general',
    specialtyMeta,
    consultation,
    motif: rapportData?.motif,
    organFindings: rapportData?.organFindings,
    organTarget: rapportData?.organTarget,
    contexte: rapportData?.contexte,
    constats: rapportData?.constats,
    priseEnCharge: rapportData?.priseEnCharge,
    recommandations: rapportData?.recommandations,
    notes: rapportData?.notes
  })

  const sectionsHtml = sections.length
    ?sections.map((section) => `
        <div class="report-section">
          <div class="report-section-title">${escapeHTML(section.title.toUpperCase())}:</div>
          <div class="report-section-body">${formatRichTextHtml(section.content, '')}</div>
        </div>
      `).join('')
    : `
      <div class="report-section">
        <div class="report-section-title">RAPPORT:</div>
        <div class="report-section-body">${formatRichTextHtml(rapportData?.motif || specialtyMeta?.report?.printSubtitle || 'Rapport médical', '')}</div>
      </div>
    `

  const logoHtml = logoDataUrl ?`
    <div class="report-logo">
      <img src="${escapeHTML(logoDataUrl)}" alt="Logo du cabinet">
    </div>
  ` : ''

  return `<!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Rapport médical</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          width: ${rapportLayout.pageWidth};
          min-height: ${rapportLayout.pageHeight};
          background: #ffffff;
          color: #000000;
          font-family: "Times New Roman", "Georgia", serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @page {
          size: ${rapportLayout.pageWidth} ${rapportLayout.pageHeight};
          margin: 0;
        }
        .page {
          width: ${rapportLayout.pageWidth};
          min-height: ${rapportLayout.pageHeight};
          margin: 0 auto;
          padding: 8mm 9mm 10mm;
          display: flex;
          flex-direction: column;
        }
        .report-header {
          text-align: center;
          margin-bottom: 5mm;
        }
        .report-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 3mm;
        }
        .report-logo img {
          max-width: 20mm;
          max-height: 20mm;
          object-fit: contain;
        }
        .report-cabinet {
          font-size: 11.8pt;
          font-weight: 700;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .report-doctor {
          margin-top: 1mm;
          font-size: 10.8pt;
          font-weight: 700;
          text-transform: uppercase;
        }
        .report-specialty,
        .report-rpps {
          margin-top: 1mm;
          font-size: 8.6pt;
          line-height: 1.28;
        }
        .report-meta-row {
          display: flex;
          justify-content: space-between;
          gap: 6mm;
          margin-bottom: 2mm;
          font-size: 9.3pt;
          line-height: 1.28;
        }
        .report-meta-row div:last-child {
          text-align: right;
        }
        .report-ref-row {
          margin-bottom: 4mm;
          font-size: 9.3pt;
          line-height: 1.28;
        }
        .report-title {
          text-align: center;
          margin: 5mm 0 6mm;
          font-size: 13.4pt;
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: underline;
        }
        .report-section {
          margin-bottom: 4.2mm;
          font-size: 9.4pt;
          line-height: 1.42;
        }
        .report-section-title {
          font-weight: 700;
          text-transform: uppercase;
          text-decoration: underline;
          margin-bottom: 1.2mm;
        }
        .report-section-body {
          white-space: pre-wrap;
          text-align: justify;
        }
        .report-closing {
          margin-top: 10mm;
          text-align: right;
          font-size: 9.4pt;
        }
        .report-footer {
          margin-top: auto;
          padding-top: 4mm;
          border-top: 1px solid #000000;
          text-align: center;
          font-size: 8.8pt;
          line-height: 1.4;
        }
        .report-footer-line {
          font-weight: 600;
        }
        @media print {
          .page {
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="report-header">
          ${logoHtml}
          <div class="report-cabinet">${cabinetName}</div>
          <div class="report-doctor">DR ${doctorName}</div>
          ${doctorSpecialty ?`<div class="report-specialty">${doctorSpecialty}</div>` : ''}
          ${doctorRPPS ?`<div class="report-rpps">N° d'ordre: ${doctorRPPS}</div>` : ''}
        </div>

        <div class="report-meta-row">
          <div><strong>Patient :</strong> ${safePatientFullName}${escapeHTML(ageText)}</div>
          <div>${cabinetCity ?`${cabinetCity} le ` : ''}${escapeHTML(dateLabel)}</div>
        </div>
        <div class="report-meta-row">
          <div><strong>Consultation :</strong> ${consultationLabel}</div>
          <div></div>
        </div>
        <div class="report-ref-row"><strong>Médecin traitant :</strong> ${referringDoctor}</div>

        <div class="report-title">${reportTitle}</div>

        ${sectionsHtml}

        <div class="report-closing">Cordialement.</div>

        <div class="report-footer">
          ${cabinetPhone ?`<div class="report-footer-line">📞 ${cabinetPhone}</div>` : ''}
          ${cabinetAddress ?`<div class="report-footer-line">📍 ${cabinetAddress}</div>` : ''}
        </div>
      </div>
    </body>
    </html>`
}

async function renderRapportDocument({ patient, rapportData, dateHint, consultation }) {
  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
    ?getPracticeSpecialtyMeta(rapportData?.specialtyKey || rapportData?.specialtyLabel)
    : { report: { typeLabel: 'Rapport medical', defaultMotif: 'Rapport medical', objectTitle: 'Objet du rapport', contextTitle: 'Contexte clinique', findingsTitle: 'Constatations cliniques', careTitle: 'Prise en charge', conclusionTitle: 'Conclusion et recommandations', printTitle: 'COMPTE RENDU', printSubtitle: 'Rapport de consultation' } };
  const dateLabel = formatDocumentDateLabel(rapportData?.date || rapportData?.emittedAt || dateHint || new Date())
  const sections = buildSpecialtyReportSections({
    specialtyKey: specialtyMeta?.key || rapportData?.specialtyKey || 'general',
    specialtyMeta,
    consultation,
    motif: rapportData?.motif,
    organFindings: rapportData?.organFindings,
    organTarget: rapportData?.organTarget,
    contexte: rapportData?.contexte,
    constats: rapportData?.constats,
    priseEnCharge: rapportData?.priseEnCharge,
    recommandations: rapportData?.recommandations,
    notes: rapportData?.notes
  })
  const reportTitle = String(rapportData?.documentTitle || '').trim() || specialtyMeta?.report?.printTitle || rapportData?.reportType || 'COMPTE RENDU'
  const reportSubtitle = specialtyMeta?.report?.printSubtitle || specialtyMeta?.report?.typeLabel || 'Rapport medical'
  const pageContent = `
    <div class="content-box" style="padding:3mm 3.5mm;">
      <style>
        .rapport-compact-section + .rapport-compact-section { margin-top: 2.5mm; }
        .rapport-compact-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 0.7mm; margin-bottom: 1.2mm; }
        .rapport-compact-text { font-size: 9.4pt; line-height: 1.35; text-align: justify; }
      </style>
      ${sections.map((section) => `
        <div class="rapport-compact-section">
          <div class="rapport-compact-title">${escapeHTML(section.title)}</div>
          <div class="rapport-compact-text">${formatRichTextHtml(section.content, '')}</div>
        </div>
      `).join('')}
    </div>
  `

  await openA5PrintDocument({
    title: reportTitle,
    subtitle: reportSubtitle,
    dateLabel,
    patient,
    bodyContentHtml: pageContent,
    documentType: 'rapport',
    pages: [pageContent]
  })
}

async function printConsultationDetails(consultationId) {
  try {
    const idToUse = consultationId || sharedPrintScope.currentConsultationId || null
    if (!idToUse) {
      if (typeof showNotification === 'function') {
        showNotification('Aucune consultation sélectionnée', 'error')
      }
      return
    }

    const consultResult = await window.api.consultation.getById(idToUse)
    if (!consultResult.success) throw new Error('Consultation introuvable')
    const consultation = consultResult.data

    const patResult = await window.api.patient.getById(consultation.patientId)
    if (!patResult.success) throw new Error('Patient introuvable')
    const patient = patResult.data

    const dateLabel = formatDocumentDateLabel(consultation.consultationDate || consultation.date || consultation.createdAt)

    const sections = []

    if (consultation.reason) {
      sections.push(`
        <div class="content-box">
          <h3>Motif</h3>
          <div class="content-text">${formatRichTextHtml(consultation.reason, '')}</div>
        </div>
      `)
    }

    // Build vital signs
    const vitalParts = []
    if (consultation.weight) vitalParts.push(`Poids: ${consultation.weight} kg`)
    if (consultation.height) vitalParts.push(`Taille: ${consultation.height} cm`)
    if (consultation.bloodPressure) vitalParts.push(`TA: ${consultation.bloodPressure}`)
    if (consultation.temperature) vitalParts.push(`T°: ${consultation.temperature} °C`)

    if (vitalParts.length > 0) {
      sections.push(`
        <div class="content-box">
          <h3>Signes Vitaux</h3>
          <div class="info-row">
            ${vitalParts.map(v => `<div class="info-item">${escapeHTML(v)}</div>`).join('')}
          </div>
        </div>
      `)
    }

    if (consultation.clinicalExamination) {
      sections.push(`
        <div class="content-box">
          <h3>Examen Clinique</h3>
          <div class="content-text">${formatRichTextHtml(consultation.clinicalExamination, '')}</div>
        </div>
      `)
    }

    if (consultation.diagnosis) {
      sections.push(`
        <div class="content-box">
          <h3>Diagnostic</h3>
          <div class="content-text">${formatRichTextHtml(consultation.diagnosis, '')}</div>
        </div>
      `)
    }

    if (consultation.treatment) {
      sections.push(`
        <div class="content-box">
          <h3>Traitement</h3>
          <div class="content-text">${formatRichTextHtml(consultation.treatment, '')}</div>
        </div>
      `)
    }

    if (consultation.notes) {
      sections.push(`
        <div class="content-box">
          <h3>Notes</h3>
          <div class="content-text">${formatRichTextHtml(consultation.notes, '')}</div>
        </div>
      `)
    }

    // Split sections into pages if needed (3 sections per page max)
    const SECTIONS_PER_PAGE = 3
    const totalPages = Math.ceil(sections.length / SECTIONS_PER_PAGE) || 1
    const pageContents = []

    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      const startIdx = pageNum * SECTIONS_PER_PAGE
      const endIdx = Math.min(startIdx + SECTIONS_PER_PAGE, sections.length)
      const pageSections = sections.slice(startIdx, endIdx)
      pageContents.push(pageSections.join(''))
    }

    await openA5PrintDocument({
      title: 'CONSULTATION MÉDICALE',
      subtitle: consultation.type || 'Compte rendu de consultation',
      dateLabel,
      patient,
      documentType: 'consultation',
      pages: pageContents.length > 0 ?pageContents : [sections.join('')]
    })

    if (typeof showNotification === 'function') {
      showNotification('✅ Consultation prête à l\'impression', 'success')
    }
  } catch (error) {
    console.error('Error printing consultation:', error)
    if (typeof showNotification === 'function') {
      showNotification('Erreur lors de l\'impression de la consultation', 'error')
    }
  }
}

// Expose functions globally for existing UI hooks
sharedPrintScope.buildA5Html = buildA5Html
sharedPrintScope.buildA4Html = buildA4Html
sharedPrintScope.generateHtmlDocument = generateHtmlDocument
sharedPrintScope.openA5PrintDocument = openA5PrintDocument
sharedPrintScope.openA4PrintDocument = openA4PrintDocument
sharedPrintScope.renderPrescriptionModal = renderPrescriptionModal
sharedPrintScope.viewPrescriptionDetails = viewPrescriptionDetails
sharedPrintScope.printPrescriptionDetails = printPrescriptionDetails
sharedPrintScope.renderSickLeaveModal = renderSickLeaveModal
sharedPrintScope.viewSickLeaveDetails = viewSickLeaveDetails
sharedPrintScope.printSickLeaveDetails = printSickLeaveDetails
sharedPrintScope.printConsultationDetails = printConsultationDetails
sharedPrintScope.renderInvoiceDocument = renderInvoiceDocument
sharedPrintScope.renderRapportDocument = renderRapportDocument
sharedPrintScope.computeAge = computeAge
sharedPrintScope.formatDocumentDateLabel = formatDocumentDateLabel
sharedPrintScope.formatRichTextHtml = formatRichTextHtml
sharedPrintScope.escapeHTML = escapeHTML

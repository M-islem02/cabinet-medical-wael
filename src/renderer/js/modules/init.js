const APP_ZOOM_STORAGE_KEY = 'medcareso_app_zoom_factor';
const APP_ZOOM_DEFAULT = 1.0;
const APP_ZOOM_MIN = 0.75;
const APP_ZOOM_MAX = 1.4;
const APP_ZOOM_STEP = 0.05;

function clampAppZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return APP_ZOOM_DEFAULT;
  return Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, zoom));
}

function formatAppZoom(value) {
  return `${Math.round(clampAppZoom(value) * 100)}%`;
}

async function applyAppZoom(value, { persist = true } = {}) {
  const zoom = clampAppZoom(value);
  try {
    const result = await window.api?.appZoom?.set?.(zoom);
    const appliedZoom = clampAppZoom(result?.zoom ?? zoom);
    if (persist) {
      localStorage.setItem(APP_ZOOM_STORAGE_KEY, String(appliedZoom));
    }
    updateAppZoomControls(appliedZoom);
    return appliedZoom;
  } catch (error) {
    console.warn('Unable to apply app zoom:', error?.message || error);
    updateAppZoomControls(zoom);
    return zoom;
  }
}

function updateAppZoomControls(value) {
  const zoom = clampAppZoom(value);
  const resetBtn = document.getElementById('app-zoom-reset');
  const zoomOutBtn = document.getElementById('app-zoom-out');
  const zoomInBtn = document.getElementById('app-zoom-in');

  if (resetBtn) resetBtn.textContent = formatAppZoom(zoom);
  if (zoomOutBtn) zoomOutBtn.disabled = zoom <= APP_ZOOM_MIN + 0.001;
  if (zoomInBtn) zoomInBtn.disabled = zoom >= APP_ZOOM_MAX - 0.001;
}

function getStoredAppZoom() {
  const stored = localStorage.getItem(APP_ZOOM_STORAGE_KEY);
  if (stored === '0.9') {
    localStorage.setItem(APP_ZOOM_STORAGE_KEY, String(APP_ZOOM_DEFAULT));
    return clampAppZoom(APP_ZOOM_DEFAULT);
  }
  return clampAppZoom(stored || APP_ZOOM_DEFAULT);
}

function setupAppZoomControls() {
  const zoomOutBtn = document.getElementById('app-zoom-out');
  const zoomInBtn = document.getElementById('app-zoom-in');
  const resetBtn = document.getElementById('app-zoom-reset');

  let currentZoom = getStoredAppZoom();
  applyAppZoom(currentZoom, { persist: false });

  try {
    const savedMode = localStorage.getItem('medcareso_app_display_mode') || 'auto';
    const isCompact = savedMode === 'compact-square' || (savedMode === 'auto' && (window.screen.width / (window.screen.height || 1) < 1.55));
    document.documentElement.classList.toggle('display-compact-square', Boolean(isCompact));
    document.body.classList.toggle('display-compact-square', Boolean(isCompact));
    document.documentElement.setAttribute('data-screen-mode', isCompact ? 'compact-square' : 'standard');
  } catch (_) {}

  const changeZoom = async (delta) => {
    currentZoom = await applyAppZoom(currentZoom + delta);
  };

  zoomOutBtn?.addEventListener('click', () => changeZoom(-APP_ZOOM_STEP));
  zoomInBtn?.addEventListener('click', () => changeZoom(APP_ZOOM_STEP));
  resetBtn?.addEventListener('click', async () => {
    try {
      await window.api?.appZoom?.reset?.();
    } catch (_) {
      // Fall back to set below.
    }
    currentZoom = await applyAppZoom(APP_ZOOM_DEFAULT);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'F5') {
      event.preventDefault();
      refreshApp();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = String(event.key || '').toLowerCase();
    if (key === '+' || key === '=') {
      event.preventDefault();
      changeZoom(APP_ZOOM_STEP);
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      changeZoom(-APP_ZOOM_STEP);
    } else if (key === '0') {
      event.preventDefault();
      resetBtn?.click();
    }
  });

  window.appZoomIn = () => changeZoom(APP_ZOOM_STEP);
  window.appZoomOut = () => changeZoom(-APP_ZOOM_STEP);
  window.appZoomReset = () => resetBtn?.click();
}

// Smoothly refresh all displayed data without disconnecting the user or reloading the page.
async function refreshApp() {
  try {
    const activeNav = document.querySelector('.nav-item.active') || document.querySelector('.sidebar-menu .active');
    const activeSection = activeNav ? (activeNav.getAttribute('data-section') || activeNav.getAttribute('data-view')) : null;

    if (activeSection === 'dashboard' && typeof loadDashboardData === 'function') await loadDashboardData();
    else if (activeSection === 'patients' && typeof loadPatients === 'function') await loadPatients();
    else if ((activeSection === 'agenda' || activeSection === 'calendar') && typeof loadAppointments === 'function') await loadAppointments();
    else if (activeSection === 'waiting-room' && typeof loadWaitingRoom === 'function') await loadWaitingRoom();
    else if (activeSection === 'treatment-plans' && typeof loadTreatmentPlans === 'function') await loadTreatmentPlans();
    else if (activeSection === 'inventory' && typeof loadInventory === 'function') await loadInventory();
    else if (activeSection === 'equipment' && typeof loadEquipment === 'function') await loadEquipment();
    else if (activeSection === 'operations' && typeof loadOperations === 'function') await loadOperations();
    else if (activeSection === 'statistics' && typeof loadStatistics === 'function') await loadStatistics();
    else if (activeSection === 'payments') {
      if (typeof loadPaymentPractitionerFilter === 'function') await loadPaymentPractitionerFilter();
      if (typeof loadPayments === 'function') await loadPayments();
    }
    else if (activeSection === 'day-summary' && typeof loadDailySummary === 'function') await loadDailySummary();
    else if (activeSection === 'imaging' && typeof loadImagingData === 'function') await loadImagingData();
    else {
      if (typeof loadAppointments === 'function') loadAppointments();
      if (typeof loadWaitingRoom === 'function') loadWaitingRoom();
      if (typeof loadPatients === 'function') loadPatients();
    }

    if (typeof showNotification === 'function') {
      showNotification('Données actualisées avec succès', 'success');
    }
  } catch (err) {
    console.warn('Error refreshing app data:', err);
  }
}

window.refreshApp = refreshApp;
window.startTopbarClock = startTopbarClock;

function startTopbarClock() {
  const update = () => {
    const timeEl = document.getElementById('topbar-clock-time');
    const dateEl = document.getElementById('topbar-clock-date');
    if (!timeEl && !dateEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
  };
  update();
  setInterval(update, 1000);
}

function markNavigationReady() {
  document.documentElement.classList.remove('app-booting');
  document.body?.classList.add('app-ready');
}

// ========== INITIALISATION ==========
async function initializeLegacyApplication() {
  console.log('🚀 DOMContentLoaded event fired');
  
  try {
    setupAppZoomControls();
    startTopbarClock();

    const normalizeUiRole = (role) => role === 'director' ? 'doctor' : (role || 'doctor');
    if (typeof repairUiMojibake === 'function') {
      repairUiMojibake(document.body);
      let mojibakeRepairTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(mojibakeRepairTimer);
        mojibakeRepairTimer = setTimeout(() => {
          mojibakeRepairTimer = null;
          repairUiMojibake(document.body);
        }, 120);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'title', 'aria-label', 'value']
      });
    }

    // Listen for user data from main process (passed from login window)
    if (window.api && window.api.user && window.api.user.onUserData) {
      window.api.user.onUserData((userData) => {
        console.log('=== RECEIVED USER DATA FROM MAIN PROCESS ===');
        console.log('User data:', userData);
        
        // Store in localStorage of main window
        localStorage.setItem('currentUserId', userData.id);
        localStorage.setItem('currentUsername', userData.username);
        localStorage.setItem('currentUserIsAdmin', userData.isAdmin ? 'true' : 'false');
        localStorage.setItem('currentUserRole', normalizeUiRole(userData.role));
        localStorage.setItem('currentUserIsSuperAdmin', userData.isSuperAdmin ? 'true' : 'false');
        localStorage.setItem('currentUserSpecialty', userData.specialty || '');
        
        console.log('Stored in localStorage:');
        console.log('  - currentUserId:', localStorage.getItem('currentUserId'));
        console.log('  - currentUsername:', localStorage.getItem('currentUsername'));
        console.log('  - currentUserIsAdmin:', localStorage.getItem('currentUserIsAdmin'));
        console.log('  - currentUserRole:', localStorage.getItem('currentUserRole'));
        console.log('  - currentUserIsSuperAdmin:', localStorage.getItem('currentUserIsSuperAdmin'));
        
        // Update global variables
        currentUserId = userData.id;
        currentUserIsAdmin = userData.isAdmin;
        currentUserRole = normalizeUiRole(userData.role);
        currentUsername = userData.username;
        currentUserIsSuperAdmin = userData.isSuperAdmin || false;
        currentUserSpecialty = userData.specialty || '';
        
        // Update UI
        updateUserDisplay();
        updateAdminUI();
        if (typeof initRealtimeNotifications === 'function') {
          initRealtimeNotifications();
        }
      });
    }
    
    // Load current user ID and admin status from localStorage
    currentUserId = localStorage.getItem('currentUserId');
    currentUserIsAdmin = localStorage.getItem('currentUserIsAdmin') === 'true';
    currentUserRole = normalizeUiRole(localStorage.getItem('currentUserRole'));
    localStorage.setItem('currentUserRole', currentUserRole);
    currentUsername = localStorage.getItem('currentUsername') || 'Utilisateur';
    currentUserIsSuperAdmin = localStorage.getItem('currentUserIsSuperAdmin') === 'true';
    currentUserSpecialty = localStorage.getItem('currentUserSpecialty') || '';
    if (typeof initRealtimeNotifications === 'function') {
      initRealtimeNotifications();
    }
    
    console.log('=== USER INFO DEBUG ===');
    console.log('localStorage raw values:');
    console.log('  - currentUserId:', localStorage.getItem('currentUserId'));
    console.log('  - currentUserIsAdmin:', localStorage.getItem('currentUserIsAdmin'));
    console.log('  - currentUserRole:', localStorage.getItem('currentUserRole'));
    console.log('  - currentUsername:', localStorage.getItem('currentUsername'));
    console.log('  - currentUserIsSuperAdmin:', localStorage.getItem('currentUserIsSuperAdmin'));
    console.log('Parsed values:');
    console.log(`  - currentUserId: ${currentUserId}`);
    console.log(`  - currentUserIsAdmin: ${currentUserIsAdmin}`);
    console.log(`  - currentUserRole: ${currentUserRole}`);
    console.log(`  - currentUsername: ${currentUsername}`);
    console.log(`  - currentUserIsSuperAdmin: ${currentUserIsSuperAdmin}`);
    
    updateUserDisplay();
    updateAdminUI();
    if (typeof refreshAppBrandLogo === 'function') {
      refreshAppBrandLogo();
    }
    if (typeof applySpecialtyAccent === 'function') {
      applySpecialtyAccent();
    }

    window.addEventListener('resize', () => {
      document.querySelectorAll('.modal.active .document-live-preview').forEach((preview) => {
        if (typeof fitDocumentPreviewA5 === 'function') {
          fitDocumentPreviewA5(preview);
        }
      });
    });

    ['details-sickleaves-tbody', 'details-certificats-tbody', 'details-arrets-tbody'].forEach((tbodyId) => {
      const sickLeaveTableBody = document.getElementById(tbodyId);
      if (sickLeaveTableBody && !sickLeaveTableBody.dataset.actionsBound) {
        sickLeaveTableBody.addEventListener('click', handleSickLeaveTableClick);
        sickLeaveTableBody.dataset.actionsBound = 'true';
      }
    });

  // Apply package restrictions early to avoid nav flicker
  await applyPackageRestrictions();
  // For superadmin: re-enforce config-only nav AFTER package restrictions
  // (package restrictions may restore nav items that should stay hidden for superadmin).
  if (currentUserIsSuperAdmin) {
    enforceAdminMode();
  }
  markNavigationReady();
  console.log('✅ Package restrictions applied');

  console.log('✅ Historique des médicaments initialisé');
  
  // Initialiser le module AI Assistant (pour les médecins seulement)
  if (false && typeof initAIModule === 'function' && (currentUserRole === 'doctor' || currentUserRole === 'dentist')) {
    await initAIModule();
    console.log('✅ Module AI Assistant initialisé (praticien)');
  }
  
  // Modules lourds (agenda/imagerie/rééducation/kiné/résumé) sont chargés à la demande via navigation.
  
  // Keep payment requests current for everyone who can see or validate them.
  if (typeof initPaymentRequestsPolling === 'function' && ['assistant', 'doctor', 'dentist'].includes(currentUserRole)) {
    initPaymentRequestsPolling();
    console.log('✅ Module demandes de paiement initialisé');
  }
  
  // Initialiser le module configuration packages (superadmin uniquement)
  if (typeof initializePackageConfig === 'function' && currentUserIsSuperAdmin) {
    initializePackageConfig();
    console.log('✅ Module configuration packages initialisé (admin)');
  }
  
    if (typeof initializeSidebarState === 'function') {
      initializeSidebarState();
    }
  
    // Initialize date inputs with French locale format hints
    initializeDateInputs();
    console.log('✅ Date inputs initialized with French format');
    
    // Initialize 24-hour time inputs
    initializeTimeInputs();
    console.log('✅ Time inputs initialized with 24h format');

    if (typeof initializePasswordToggles === 'function') {
      initializePasswordToggles();
      console.log('✅ Password visibility toggles initialized');
    }
    
    setupEventListeners();
    console.log('✅ Event listeners setup complete');
    resetPatientRecordsView();
    loadSettings();
    if (currentUserIsSuperAdmin) {
      enforceAdminMode();
      showSection('package-config');
    } else {
      void Promise.resolve()
        .then(() => loadDashboardStats())
        .then(() => console.log('✅ Dashboard stats loaded'))
        .catch((error) => console.warn('Dashboard stats load failed:', error));
    }

    if (typeof loadPatients === 'function' && currentPage === 'patients') {
      await loadPatients();
    }

    if (typeof window.initORL === 'function') {
      void window.initORL();
    }
    
    // Initialize EHR alert state observer
    setupAlertStateObserver();
  } catch (error) {
    console.error('❌ Error during initialization:', error);
    markNavigationReady();
  }
}

window.initializeLegacyApplication = initializeLegacyApplication;

function setupAlertStateObserver() {
  const targets = [
    { id: 'stat-low-stock', alertClass: 'alert-active' },
    { id: 'inventory-expiring', alertClass: 'alert-active' },
    { id: 'equip-stat-upcoming', alertClass: 'alert-active' },
    { id: 'equip-stat-inmai', alertClass: 'alert-urgent' },
    { id: 'payments-pending-badge', alertClass: 'alert-active' },
    { id: 'payment-requests-badge', alertClass: 'alert-active' }
  ];

  const updateElementAlert = (el, alertClass) => {
    if (!el) return;
    const valText = el.textContent.trim().replace(/[^\d]/g, '');
    const val = parseInt(valText, 10) || 0;
    if (val > 0) {
      el.classList.add(alertClass);
    } else {
      el.classList.remove(alertClass);
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        const el = mutation.target.parentElement || mutation.target;
        const targetConfig = targets.find(t => t.id === el.id || t.id === mutation.target.id);
        if (targetConfig) {
          updateElementAlert(document.getElementById(targetConfig.id), targetConfig.alertClass);
        }
      }
    }
  });

  targets.forEach(({ id, alertClass }) => {
    const el = document.getElementById(id);
    if (el) {
      updateElementAlert(el, alertClass);
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    }
  });
}

/**
 * Apply package feature restrictions
 * Hide navigation items and sections for features not included in package
 */
async function applyPackageRestrictions() {
  try {
    if (currentUserRole === 'director') {
      enforceDirectorMode();
      return;
    }

    const normalizedConfig = window.medcareApp?.packageConfigService?.get?.();
    const config = normalizedConfig?.raw || window._packageConfig || null;
    if (!config) {
      console.log('📦 No package config found, all features enabled');
      return;
    }
    console.log('📦 Package config:', config);
    
    applyPackageRestrictionsFromCache(config);
    const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
      ? resolveActivePracticeSpecialty(config)
      : 'orl';
    const isTestAccount = isDemoOrTestAccount();
    
    document.querySelectorAll('.btn-ai-report, .btn-ai-chat, [onclick*="openAIReportGenerator"], [onclick*="openAIChatbot"]').forEach(btn => {
      btn.style.display = 'none';
    });
    
    // Hide dentistry tab in patient-details when feature is disabled
    if (config.featureDentistry === 0 || (activeSpecialty !== 'dentistry' && !isTestAccount)) {
      // Hide the dental tab button in patient details
      const dentalTabBtn = document.querySelector('.tab-btn[onclick*="tab-dental"]');
      if (dentalTabBtn) {
        dentalTabBtn.style.display = 'none';
        dentalTabBtn.classList.add('feature-disabled');
      }
      // Hide dental tab content
      const dentalTabContent = document.getElementById('tab-dental');
      if (dentalTabContent) {
        dentalTabContent.style.display = 'none';
      }
      // Hide 🦷 buttons in consultation actions
      document.querySelectorAll('[onclick*="goToPatientDentalFromConsultation"], [onclick*="goToFullDentalChart"]').forEach(btn => {
        btn.style.display = 'none';
      });
      console.log('📦 Dentistry feature inactive: dental tab & buttons hidden');
    } else {
      const dentalTabBtn = document.querySelector('.tab-btn[onclick*="tab-dental"]');
      if (dentalTabBtn) {
        dentalTabBtn.style.display = '';
        dentalTabBtn.classList.remove('feature-disabled');
      }
      const dentalTabContent = document.getElementById('tab-dental');
      if (dentalTabContent) {
        dentalTabContent.style.display = '';
      }
    }
    
    // Hide rehabilitation tab/section elements when feature is disabled
    if (config.featureRehabilitation === 0 || (activeSpecialty !== 'mpr' && !isTestAccount)) {
      // Hide rehab-related buttons in patient details
      document.querySelectorAll('[onclick*="rehabilitation"], [onclick*="rehab"]').forEach(btn => {
        if (!btn.classList.contains('nav-item')) {
          btn.style.display = 'none';
        }
      });
      console.log('📦 Rehabilitation feature inactive: related buttons hidden');
    }
    
    // Hide kiné staff elements when feature is disabled
    if (config.featureKineStaff === 0 || (activeSpecialty !== 'mpr' && !isTestAccount)) {
      // Hide kiné-related buttons and elements
      document.querySelectorAll('[onclick*="kine"], [data-section="kine-staff"]').forEach(el => {
        el.style.display = 'none';
      });
      console.log('📦 Kiné staff feature inactive: related elements hidden');
    }
    
    // Store package config globally for runtime checks
    window._packageConfig = config;
    updateUserDisplay();
    if (typeof applySpecialtyAccent === 'function') {
      applySpecialtyAccent();
    }
    
  } catch (error) {
    console.error('Error applying package restrictions:', error);
  }
}

function isFeatureEnabled(config, key, defaultValue = true) {
  const value = config?.[key];
  if (value === undefined || value === null) return defaultValue;
  return value === true || value === 1 || value === '1';
}

function setSectionFeatureVisibility(sectionId, enabled) {
  const isTestAccount = isDemoOrTestAccount();

  if (isTestAccount) {
    enabled = true;
  }

  const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (navItem) {
    const isAdminUser = currentUserIsSuperAdmin || isTestAccount;
    navItem.dataset.featureDisabled = enabled ? '0' : '1';
    if (enabled) {
      navItem.classList.remove('feature-disabled', 'hidden', 'role-hidden');
      if (!navItem.classList.contains('admin-only') || isAdminUser) {
        navItem.style.display = 'flex';
      }
    } else {
      navItem.classList.add('feature-disabled', 'hidden', 'role-hidden');
      navItem.style.display = 'none';
    }
  }

  const section = document.getElementById(sectionId);
  if (section) {
    if (enabled) {
      section.classList.remove('role-hidden', 'feature-disabled');
      if (section.classList.contains('active')) {
        section.style.display = '';
      }
    } else {
      section.classList.add('role-hidden', 'feature-disabled');
      section.style.display = 'none';
    }
  }
}

function applyMprDependencyRestrictions(config = window._packageConfig || null) {
  const isTestAccount = isDemoOrTestAccount();

  const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
    ? resolveActivePracticeSpecialty(config)
    : (currentUserSpecialty || 'orl');

  const orlEnabled = isTestAccount || (activeSpecialty === 'orl');
  const mprEnabled = isTestAccount || (activeSpecialty === 'mpr' || activeSpecialty === 'rehabilitation');
  const dentistryEnabled = isTestAccount || (activeSpecialty === 'dentistry');
  const cardiologyEnabled = isTestAccount || (activeSpecialty === 'cardiology');
  window._mprFeatureEnabled = mprEnabled;
  window._activeSpecialtyKey = activeSpecialty;

  setSectionFeatureVisibility('orl', orlEnabled);
  setSectionFeatureVisibility('rehabilitation', mprEnabled);
  setSectionFeatureVisibility('kine-staff', isTestAccount || (mprEnabled && isFeatureEnabled(config, 'featureKineStaff', true)));
  setSectionFeatureVisibility('daily-summary', isTestAccount || isFeatureEnabled(config, 'featureDailySummary', true));
  setSectionFeatureVisibility('dentistry', dentistryEnabled);
  setSectionFeatureVisibility('cardiology', cardiologyEnabled);

  if (typeof enforceSpecialtySidebarVisibility === 'function') {
    enforceSpecialtySidebarVisibility(activeSpecialty);
  }

  if (typeof applyConsultationActsSelection === 'function') {
    applyConsultationActsSelection(typeof getSelectedConsultationActs === 'function' ? getSelectedConsultationActs() : ['consultation']);
  }
  if (typeof renderPaymentModalActCheckboxes === 'function') {
    renderPaymentModalActCheckboxes(typeof getSelectedPaymentActs === 'function' ? getSelectedPaymentActs('payment-acts') : ['consultation']);
  }
  if (typeof renderPaymentRequestActCheckboxes === 'function') {
    renderPaymentRequestActCheckboxes(typeof getSelectedPaymentActs === 'function' ? getSelectedPaymentActs('payment-request-acts') : ['consultation']);
  }
  if (typeof populatePaymentServiceSelect === 'function') {
    populatePaymentServiceSelect('payment-service', document.getElementById('payment-service')?.value || 'consultation');
    populatePaymentServiceSelect('payment-request-service', document.getElementById('payment-request-service')?.value || 'consultation');
  }

  [
    'act-kine',
    'act-electrothérapie',
    'act-massage',
    'act-tecartherapie',
    'act-ondesdechoc',
    'act-mesotherapie',
    'act-lasertherapie',
    'act-dryneedling',
    'act-osteopathie'
  ].forEach((inputId) => {
    const input = document.getElementById(inputId);
    if (input && !mprEnabled && !isTestAccount) {
      input.checked = false;
    }
    const label = input?.closest('.checkbox-label');
    if (label) {
      label.style.display = (mprEnabled || isTestAccount) ? '' : 'none';
    }
  });

  const kineSelection = document.getElementById('kine-selection');
  if (kineSelection && !mprEnabled && !isTestAccount) {
    kineSelection.style.display = 'none';
  }

  const summaryKineCard = document.getElementById('summary-kine-card');
  if (summaryKineCard && !mprEnabled && !isTestAccount) {
    summaryKineCard.style.display = 'none';
  }
  const summaryKineTableCard = document.getElementById('summary-kine-table-card');
  if (summaryKineTableCard && !mprEnabled && !isTestAccount) {
    summaryKineTableCard.style.display = 'none';
  }

}

function applyPackageRestrictionsFromCache(config = window._packageConfig || null) {
  if (!config) {
    applyMprDependencyRestrictions(config);
    return;
  }

  const isTestAccount = isDemoOrTestAccount();

  const featureToSection = {
    featureWaitingRoom: 'waiting-room',
    featureDailySummary: 'daily-summary',
    featureStatistics: 'statistics',
    featureInventory: 'inventory',
    featureMedicalImaging: 'medical-imaging',
    featureDebts: 'debts',
    featureCalendar: 'appointments-calendar'
  };

  Object.entries(featureToSection).forEach(([featureKey, sectionId]) => {
    const enabled = isTestAccount || isFeatureEnabled(config, featureKey, true);
    setSectionFeatureVisibility(sectionId, enabled);
  });

  applyMprDependencyRestrictions(config);
}

function enforceDoctorPackageNav() {
  const config = window._packageConfig || null;
  const isTestAccount = isDemoOrTestAccount();

  if (isTestAccount) {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.style.display = 'flex';
      item.classList.remove('hidden', 'role-hidden', 'feature-disabled');
    });
    document.querySelectorAll('.section').forEach((section) => {
      section.classList.remove('role-hidden', 'feature-disabled');
    });
    return;
  }

  if (!config) return;

  const isSuperAdmin = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';

  // Reset then re-apply only allowed doctor nav according to package.
  document.querySelectorAll('.nav-item').forEach((item) => {
    const isSuperAdminOnly = item.classList.contains('admin-only') || ['package-config', 'sms-config', 'cloud-sync'].includes(item.dataset.section);
    if (!isSuperAdminOnly || isSuperAdmin) {
      item.style.display = '';
      item.classList.remove('hidden', 'feature-disabled');
    } else {
      item.style.display = 'none';
      item.classList.add('hidden', 'role-hidden');
    }
  });

  applyPackageRestrictionsFromCache(config);

  // Never show admin-only or superadmin links in doctor mode unless superadmin.
  if (!isSuperAdmin) {
    document.querySelectorAll('.nav-item.admin-only, .nav-item[data-section="package-config"], .nav-item[data-section="sms-config"], .nav-item[data-section="cloud-sync"]').forEach((item) => {
      item.style.display = 'none';
      item.classList.add('hidden', 'role-hidden');
    });
  }
}

function enforceDirectorMode() {
  const allowedDirectorSections = new Set(['statistics', 'settings']);

  document.body.classList.remove('assistant-mode');

  document.querySelectorAll('.nav-item').forEach((item) => {
    const sectionId = item.dataset.section || '';
    if (allowedDirectorSections.has(sectionId)) {
      item.style.display = 'flex';
      item.classList.remove('hidden');
    } else {
      item.style.display = 'none';
      item.classList.add('hidden');
    }
  });

  document.querySelectorAll('.section').forEach((section) => {
    section.classList.remove('active');
  });

  showSection('statistics');
}

// Update user display in UI
function updateUserDisplay() {
  const doctorNameEl = document.getElementById('doctor-name');
  const avatarEl = document.querySelector('.sidebar-footer .avatar');
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';

  if (isSuperAdminUser) {
    if (avatarEl) avatarEl.textContent = 'SA';
    if (doctorNameEl) {
      doctorNameEl.innerHTML = `Super Administrateur <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 6px;">SUPERADMIN</span>`;
    }
    const licenseStatusEl = document.getElementById('license-status');
    if (licenseStatusEl) licenseStatusEl.textContent = 'Console Système';
    return;
  }

  if (doctorNameEl) {
    const activeSpecialtyMeta = typeof getActivePracticeSpecialtyMeta === 'function'
      ? getActivePracticeSpecialtyMeta(window._packageConfig)
      : { doctorBadgeLabel: window._mprFeatureEnabled === false ? 'MÉDECIN' : 'MÉDECIN MPR' };
    // Add role badge with colors matching calendar
    const roleBadges = {
      'admin': { bg: '#ef4444', label: 'ADMIN' },
      'director': { bg: '#8b5cf6', label: 'DIRECTEUR' },
      'doctor': { bg: '#3b82f6', label: activeSpecialtyMeta.doctorBadgeLabel || 'MÉDECIN' },
      'dentist': { bg: '#0ea5e9', label: 'DENTISTE' },
      'kinesitherapeute': { bg: '#8b5cf6', label: 'KINÉ' },
      'ergotherapeute': { bg: '#06b6d4', label: 'ERGO' },
      'orthophoniste': { bg: '#f59e0b', label: 'ORTHO' },
      'nurse': { bg: '#10b981', label: 'INFIRMIER' },
      'assistant': { bg: '#6b7280', label: 'ASSISTANT' },
      'test': { bg: '#6366f1', label: 'TEST / DÉMO' }
    };
    
    const roleInfo = roleBadges[currentUserRole] || { bg: '#6366f1', label: currentUserRole.toUpperCase() };
    const roleBadge = `<span style="background: ${roleInfo.bg}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">${roleInfo.label}</span>`;
    
    doctorNameEl.innerHTML = `${currentUsername} ${roleBadge}`;
    console.log('✅ Updated user display to:', currentUsername, 'role:', currentUserRole);
  }
}

// Update admin UI visibility
function updateAdminUI() {
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  const isAdminUser = currentUserIsAdmin === true || localStorage.getItem('currentUserIsAdmin') === 'true';
  const isTestAccount = isDemoOrTestAccount();
  const isDirectorUser = false;
  const userManagementCard = document.getElementById('user-management-card');
  const addUserBtn = document.getElementById('btn-add-user');
  const licenseAdminCard = document.getElementById('license-admin-card');
  const licenseInfoCard = document.getElementById('license-info-card');
  const dbConfigCard = document.getElementById('db-config-card');
  const practiceInfoCard = document.getElementById('practice-info-card');
  const adminSetupCard = document.getElementById('admin-setup-card');
  const devicesSettingsCard = document.getElementById('devices-settings-card');
  const publicBookingCard = document.getElementById('public-booking-card');
  const settingsForm = document.getElementById('settings-form');
  const packageConfigNav = document.querySelector('.nav-item[data-section="package-config"]');

  const setRoleVisibility = (element, visible) => {
    if (!element) return;
    element.classList.toggle('role-hidden', !visible);
    element.classList.remove('hidden');
    if (visible) {
      element.style.display = '';
      element.removeAttribute('aria-hidden');
    } else {
      element.removeAttribute('style');
      element.setAttribute('aria-hidden', 'true');
    }
  };

  if (isTestAccount) {
    document.documentElement.classList.add('demo-account');
    document.body.classList.add('demo-account');
    document.querySelectorAll('.nav-item').forEach(item => {
      item.style.display = 'flex';
      item.classList.remove('hidden', 'role-hidden', 'feature-disabled');
    });
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('role-hidden', 'feature-disabled');
    });
    setRoleVisibility(userManagementCard, true);
    setRoleVisibility(licenseAdminCard, true);
    setRoleVisibility(licenseInfoCard, true);
    setRoleVisibility(dbConfigCard, true);
    setRoleVisibility(practiceInfoCard, true);
    setRoleVisibility(devicesSettingsCard, true);
    setRoleVisibility(publicBookingCard, true);
    if (packageConfigNav) {
      packageConfigNav.style.display = 'flex';
      packageConfigNav.classList.remove('hidden', 'role-hidden');
    }
    return;
  }
  
  // Handle assistant role restrictions first
  if (currentUserRole === 'assistant') {
    enforceAssistantMode();
  }
  
  // Keep user management visible for all roles; backend still enforces permissions for actions.
  setRoleVisibility(userManagementCard, true);
  if (addUserBtn) {
    if (isDirectorUser) {
      addUserBtn.classList.add('role-hidden');
      addUserBtn.setAttribute('aria-hidden', 'true');
      addUserBtn.disabled = true;
    } else {
      addUserBtn.classList.remove('role-hidden');
      addUserBtn.removeAttribute('aria-hidden');
      addUserBtn.disabled = false;
    }
  }

  // Handle license and settings subtab cards visibility
  setRoleVisibility(licenseAdminCard, isSuperAdminUser);
  setRoleVisibility(licenseInfoCard, true);
  setRoleVisibility(dbConfigCard, true);
  setRoleVisibility(practiceInfoCard, true);
  setRoleVisibility(adminSetupCard, false);
  setRoleVisibility(devicesSettingsCard, true);
  if (packageConfigNav) {
    packageConfigNav.classList.toggle('role-hidden', !isSuperAdminUser);
    packageConfigNav.classList.remove('hidden');
    if (isSuperAdminUser) {
      packageConfigNav.style.display = 'flex';
      packageConfigNav.removeAttribute('aria-hidden');
    } else {
      packageConfigNav.removeAttribute('style');
      packageConfigNav.setAttribute('aria-hidden', 'true');
    }
  }

  if (settingsForm) {
    settingsForm.querySelectorAll('input, select, textarea').forEach(input => {
      if (input.name === 'defaultSpecialty' || input.name === 'licenseKey') {
        return;
      }
      if (isDirectorUser) {
        input.disabled = true;
        input.classList.add('disabled-for-director');
      } else {
        input.disabled = false;
        input.classList.remove('disabled-for-director');
      }
    });
  }

  if (publicBookingCard) {
    if (isDirectorUser) {
      setRoleVisibility(publicBookingCard, false);
    } else {
      setRoleVisibility(publicBookingCard, true);
    }
  }

  if (isSuperAdminUser) {
    enforceAdminMode();
  } else {
    adminModeEnabled = false;
    document.body.classList.remove('admin-mode');
    document.documentElement.classList.remove('superadmin-session');
    const adminBadge = document.getElementById('admin-mode-badge');
    if (adminBadge) adminBadge.classList.add('hidden');
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('hidden');
      if (item.dataset.featureDisabled === '1') {
        item.style.display = 'none';
      } else {
        item.style.display = '';
      }
    });
    // Hide admin-only nav items and sections for non-admin users
    document.querySelectorAll('.nav-item.admin-only, .nav-item[data-section="package-config"], .nav-item[data-section="sms-config"], .nav-item[data-section="cloud-sync"]').forEach(item => {
      item.style.display = 'none';
      item.classList.add('hidden', 'role-hidden');
    });
    document.querySelectorAll('.section.admin-only, #package-config, #sms-config, #cloud-sync').forEach(el => {
      el.style.display = 'none';
      el.classList.add('role-hidden');
    });

    if (currentUserRole === 'director') {
      enforceDirectorMode();
    } else {
      enforceDoctorPackageNav();
    }

    const brandBlock = document.querySelector('.sidebar .logo');
    if (brandBlock) {
      brandBlock.style.display = '';
    }
  }

  // Handle superadmin configuration visibility (superadmin only)
  document.querySelectorAll('.nav-item.admin-only, .nav-item[data-section="package-config"], .nav-item[data-section="sms-config"], .nav-item[data-section="cloud-sync"]').forEach(item => {
    if (isSuperAdminUser) {
      item.style.display = 'flex';
      item.classList.remove('hidden', 'role-hidden');
    } else {
      item.style.display = 'none';
      item.classList.add('hidden', 'role-hidden');
    }
  });

  // Re-apply feature locks outside the superadmin configuration console.
  if (!isSuperAdminUser && !isDirectorUser) {
    applyPackageRestrictionsFromCache();
    if (typeof enforceSpecialtySidebarVisibility === 'function') {
      enforceSpecialtySidebarVisibility();
    }
  }

  // Les modules réservés au compte test/démo restent masqués pour tous les autres comptes.
  if (!isTestAccount) {
    document.documentElement.classList.remove('demo-account');
    document.body.classList.remove('demo-account');
    document.querySelectorAll('.nav-item.demo-only').forEach((item) => {
      item.style.display = 'none';
      item.classList.add('hidden', 'role-hidden', 'feature-disabled');
      item.dataset.featureDisabled = '1';
    });
    document.querySelectorAll('.section.demo-only').forEach((section) => {
      section.style.display = 'none';
      section.classList.add('role-hidden', 'feature-disabled');
    });
  }

  if (typeof switchSettingsPage === 'function' && document.getElementById('settings')?.classList.contains('active')) {
    switchSettingsPage(typeof activeSettingsPage !== 'undefined' ? activeSettingsPage : 'general');
  }
}

function enforceAdminMode() {
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  if (!isSuperAdminUser) return;

  adminModeEnabled = true;
  const allowedAdminSections = new Set(['package-config', 'sms-config', 'cloud-sync', 'settings']);

  document.documentElement.classList.add('superadmin-session');
  document.body.classList.add('admin-mode');
  const adminBadge = document.getElementById('admin-mode-badge');
  if (adminBadge) adminBadge.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(item => {
    const sectionId = item.dataset.section || '';
    const isAllowed = item.classList.contains('admin-allowed-nav') && allowedAdminSections.has(sectionId);
    if (!isAllowed) {
      item.style.display = 'none';
      item.classList.add('hidden');
    } else {
      item.style.display = 'flex';
      item.classList.remove('hidden');
    }
  });

  const brandBlock = document.querySelector('.sidebar .logo');
  if (brandBlock) {
    brandBlock.style.display = 'none';
  }

  // Show admin-only sections
  document.querySelectorAll('.section.admin-only').forEach(el => {
    el.style.display = '';
    el.classList.remove('role-hidden');
  });

  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = 'Console Administrateur';
  }

  // Always land on an authorized admin section (default: Config Client)
  const currentActiveSection = document.querySelector('.section.active')?.id;
  if (!currentActiveSection || !allowedAdminSections.has(currentActiveSection) || currentActiveSection === 'dashboard') {
    showSection('package-config');
  }
}

/**
 * Enforce assistant mode restrictions
 * Assistants can: manage patients, appointments, waiting room, record payments
 * Assistants cannot: view consultations, prescriptions, medical records, statistics
 */
function enforceAssistantMode() {
  const isTestAccount = isDemoOrTestAccount();
  if (isTestAccount) return;

  console.log('🔒 Enforcing assistant mode configuration');
  
  // Add assistant-mode class to body for CSS-based adjustments
  document.body.classList.add('assistant-mode');
  
  // Hide administrative and practitioner-only sections that assistants shouldn't access
  const doctorOnlySections = ['orl', 'operations', 'settings', 'statistics', 'equipment', 'medical-imaging', 'treatment-plans', 'rehabilitation', 'kine-staff', 'daily-summary', 'package-config', 'sms-config', 'cloud-sync'];
  
  document.querySelectorAll('.nav-item').forEach(item => {
    const section = item.dataset.section;
    if (doctorOnlySections.includes(section)) {
      item.style.display = 'none';
      item.classList.add('hidden-for-assistant');
    }
  });

  // Also hide elements with doctor-only class
  document.querySelectorAll('.doctor-only').forEach(el => {
    el.style.display = 'none';
    el.classList.add('hidden-for-assistant');
  });

  console.log('✅ Assistant mode configuration applied');
  
  // Show assistant-only sections (like payment requests)
  document.querySelectorAll('.assistant-only').forEach(el => {
    el.style.display = 'block';
    el.classList.remove('hidden');
  });
  
  // Show the payment requests section specifically
  const paymentRequestsSection = document.getElementById('payment-requests-section');
  if (paymentRequestsSection) {
    paymentRequestsSection.style.display = 'block';
    console.log('✅ Payment requests section shown for assistant');
  }
}

/**
 * Check if current user can access medical data (consultations, prescriptions, etc.)
 */
function canAccessMedicalData() {
  return currentUserRole !== 'assistant';
}

/**
 * Check if current user can manage appointments
 */
function canManageAppointments() {
  return true; // All roles can manage appointments
}

/**
 * Check if current user can manage patients
 */
function canManagePatients() {
  return true; // All roles can manage patients
}

function setupEventListeners() {
  console.log('📌 Setting up event listeners...');
  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  console.log(`Found ${navItems.length} navigation items`);
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      console.log(`Navigation clicked: ${section}`);
      showSection(section);
    });
  });

  // Patients search — only search when user has typed at least 1 character, debounced
  const searchInput = document.getElementById('patients-search');
  if (searchInput) {
    let patientsSearchTimer = null;
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value || '';
      clearTimeout(patientsSearchTimer);
      patientsSearchTimer = setTimeout(() => {
        if (val.trim().length === 0) {
          // Clear results when search is empty to avoid loading all patients
          searchPatients('');
        } else {
          searchPatients(val);
        }
      }, 300);
    });
  }

  // Forms
  const patientForm = document.getElementById('patient-form');
  if (patientForm) {
    patientForm.addEventListener('submit', savePatient);
  }

  const consultationForm = document.getElementById('consultation-form');
  if (consultationForm) {
    consultationForm.addEventListener('submit', saveConsultation);
  }

  const appointmentForm = document.getElementById('appointment-form');
  if (appointmentForm) {
    appointmentForm.addEventListener('submit', saveAppointment);
  }

  const sickLeaveForm = document.getElementById('sickleave-form');
  if (sickLeaveForm) {
    sickLeaveForm.addEventListener('submit', saveSickLeave);
  }

  const factureSessionsInput = document.getElementById('facture-number-sessions');
  if (factureSessionsInput) {
    factureSessionsInput.addEventListener('input', () => autoComputeFactureTotal());
  }

  const factureUnitInput = document.getElementById('facture-unit-price');
  if (factureUnitInput) {
    factureUnitInput.addEventListener('input', () => autoComputeFactureTotal());
  }

  const factureTotalInput = document.getElementById('facture-total-price');
  if (factureTotalInput) {
    factureTotalInput.addEventListener('input', () => {
      factureTotalEditedManually = factureTotalInput.value.trim() !== '';
    });
  }
  // File attachments preview
  const attachmentsInput = document.getElementById('consultation-attachments');
  if (attachmentsInput) {
    attachmentsInput.addEventListener('change', () => {
      if (typeof updateConsultationAttachmentsPreview === 'function') {
        updateConsultationAttachmentsPreview();
      }
    });
  }

  attachSickLeaveTemplateListeners();
  handleSickLeaveDateChange();
  updateSickLeavePreview();
}

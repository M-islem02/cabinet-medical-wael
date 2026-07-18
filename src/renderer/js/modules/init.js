const APP_ZOOM_STORAGE_KEY = 'medcareso_app_zoom_factor';
const APP_ZOOM_DEFAULT = 0.9;
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
  return clampAppZoom(localStorage.getItem(APP_ZOOM_STORAGE_KEY) || APP_ZOOM_DEFAULT);
}

function setupAppZoomControls() {
  const zoomOutBtn = document.getElementById('app-zoom-out');
  const zoomInBtn = document.getElementById('app-zoom-in');
  const resetBtn = document.getElementById('app-zoom-reset');

  let currentZoom = getStoredAppZoom();
  applyAppZoom(currentZoom, { persist: false });

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

function markNavigationReady() {
  document.documentElement.classList.remove('app-booting');
  document.body?.classList.add('app-ready');
}

// ========== INITIALISATION ==========
async function initializeLegacyApplication() {
  console.log('🚀 DOMContentLoaded event fired');
  
  try {
    setupAppZoomControls();

    const normalizeUiRole = (role) => role === 'director' ? 'doctor' : (role || 'doctor');
    if (typeof repairUiMojibake === 'function') {
      repairUiMojibake(document.body);
      const observer = new MutationObserver(() => repairUiMojibake(document.body));
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
    if (typeof applySpecialtyAccent === 'function') {
      applySpecialtyAccent();
    }

    const sickLeaveTableBody = document.getElementById('details-sickleaves-tbody');
    if (sickLeaveTableBody && !sickLeaveTableBody.dataset.actionsBound) {
      sickLeaveTableBody.addEventListener('click', handleSickLeaveTableClick);
      sickLeaveTableBody.dataset.actionsBound = 'true';
    }

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
  
  // Initialiser le module de demandes de paiement (pour assistantes)
  if (typeof initPaymentRequestsPolling === 'function' && currentUserRole === 'assistant') {
    initPaymentRequestsPolling();
    console.log('✅ Module demandes de paiement initialisé (assistante)');
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
    console.log('✅ Settings loaded');

    void Promise.resolve()
      .then(() => loadDashboardStats())
      .then(() => console.log('✅ Dashboard stats loaded'))
      .catch((error) => console.warn('Dashboard stats load failed:', error));

    if (typeof loadPatients === 'function' && currentPage === 'patients') {
      await loadPatients();
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
      : 'general';
    
    document.querySelectorAll('.btn-ai-report, .btn-ai-chat, [onclick*="openAIReportGenerator"], [onclick*="openAIChatbot"]').forEach(btn => {
      btn.style.display = 'none';
    });
    
    // Hide dentistry tab in patient-details when feature is disabled
    if (config.featureDentistry === 0 || activeSpecialty !== 'dentistry') {
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
    if (config.featureRehabilitation === 0 || activeSpecialty !== 'mpr') {
      // Hide rehab-related buttons in patient details
      document.querySelectorAll('[onclick*="rehabilitation"], [onclick*="rehab"]').forEach(btn => {
        if (!btn.classList.contains('nav-item')) {
          btn.style.display = 'none';
        }
      });
      console.log('📦 Rehabilitation feature inactive: related buttons hidden');
    }
    
    // Hide kiné staff elements when feature is disabled
    if (config.featureKineStaff === 0 || activeSpecialty !== 'mpr') {
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
  const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (navItem) {
    const isAdminUser = currentUserIsSuperAdmin;
    navItem.dataset.featureDisabled = enabled ? '0' : '1';
    if (enabled) {
      navItem.classList.remove('feature-disabled');
      if (!navItem.classList.contains('admin-only') || isAdminUser) {
        navItem.style.display = '';
      }
    } else {
      navItem.classList.add('feature-disabled');
      navItem.style.display = 'none';
    }
  }

  const section = document.getElementById(sectionId);
  if (section) {
    if (enabled) {
      section.style.display = '';
    } else {
      section.style.display = 'none';
    }
  }
}

function applyMprDependencyRestrictions(config = window._packageConfig || null) {
  if (!config) return;

  const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
    ? resolveActivePracticeSpecialty(config)
    : 'general';
  const mprEnabled = activeSpecialty === 'mpr' && isFeatureEnabled(config, 'featureRehabilitation', true);
  const dentistryEnabled = activeSpecialty === 'dentistry' && isFeatureEnabled(config, 'featureDentistry', false);
  const cardiologyEnabled = activeSpecialty === 'cardiology' && isFeatureEnabled(config, 'featureCardiology', false);
  window._mprFeatureEnabled = mprEnabled;
  window._activeSpecialtyKey = activeSpecialty;

  setSectionFeatureVisibility('rehabilitation', mprEnabled);
  setSectionFeatureVisibility('kine-staff', mprEnabled && isFeatureEnabled(config, 'featureKineStaff', true));
  setSectionFeatureVisibility('daily-summary', mprEnabled && isFeatureEnabled(config, 'featureDailySummary', true));
  setSectionFeatureVisibility('dentistry', dentistryEnabled);
  setSectionFeatureVisibility('cardiology', cardiologyEnabled);

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
    if (input && !mprEnabled) {
      input.checked = false;
    }
    const label = input?.closest('.checkbox-label');
    if (label) {
      label.style.display = mprEnabled ? '' : 'none';
    }
  });

  const kineSelection = document.getElementById('kine-selection');
  if (kineSelection && !mprEnabled) {
    kineSelection.style.display = 'none';
  }

}

function applyPackageRestrictionsFromCache(config = window._packageConfig || null) {
  if (currentUserRole === 'director') return;
  if (!config) return;

  const featureToSection = {
    featureWaitingRoom: 'waiting-room',
    featureStatistics: 'statistics',
    featureInventory: 'inventory',
    featureMedicalImaging: 'medical-imaging',
    featureDebts: 'debts',
    featureCalendar: 'appointments-calendar'
  };

  Object.entries(featureToSection).forEach(([featureKey, sectionId]) => {
    const enabled = isFeatureEnabled(config, featureKey, true);
    setSectionFeatureVisibility(sectionId, enabled);
  });

  applyMprDependencyRestrictions(config);
}

function enforceDoctorPackageNav() {
  const config = window._packageConfig || null;
  if (!config) return;

  // Reset then re-apply only allowed doctor nav according to package.
  document.querySelectorAll('.nav-item').forEach((item) => {
    if (!item.classList.contains('admin-only')) {
      item.style.display = '';
    }
  });

  applyPackageRestrictionsFromCache(config);

  // Never show admin-only links in doctor mode.
  document.querySelectorAll('.nav-item.admin-only').forEach((item) => {
    item.style.display = 'none';
  });
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
  if (doctorNameEl) {
    const activeSpecialtyMeta = typeof getActivePracticeSpecialtyMeta === 'function'
      ? getActivePracticeSpecialtyMeta(window._packageConfig)
      : { doctorBadgeLabel: window._mprFeatureEnabled === false ? 'MÉDECIN' : 'MÉDECIN MPR' };
    // Add role badge with colors matching calendar
    const roleBadges = {
      'admin': { bg: '#ef4444', label: 'ADMIN' },
      'doctor': { bg: '#3b82f6', label: activeSpecialtyMeta.doctorBadgeLabel || 'MÉDECIN' },
      'dentist': { bg: '#0ea5e9', label: 'DENTISTE' },
      'kinesitherapeute': { bg: '#8b5cf6', label: 'KINÉ' },
      'ergotherapeute': { bg: '#06b6d4', label: 'ERGO' },
      'orthophoniste': { bg: '#f59e0b', label: 'ORTHO' },
      'nurse': { bg: '#10b981', label: 'INFIRMIER' },
      'assistant': { bg: '#6b7280', label: 'ASSISTANT' }
    };
    
    const roleInfo = roleBadges[currentUserRole] || { bg: '#6b7280', label: currentUserRole.toUpperCase() };
    const roleBadge = `<span style="background: ${roleInfo.bg}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">${roleInfo.label}</span>`;
    
    doctorNameEl.innerHTML = `${currentUsername} ${roleBadge}`;
    console.log('✅ Updated user display to:', currentUsername, 'role:', currentUserRole);
  }
}

// Update admin UI visibility
function updateAdminUI() {
  const isSuperAdminUser = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  const isAdminUser = currentUserIsAdmin === true || localStorage.getItem('currentUserIsAdmin') === 'true';
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
  
  // Handle assistant role restrictions first
  if (currentUserRole === 'assistant') {
    enforceAssistantMode();
  }
  
  // Keep user management visible for all roles; backend still enforces permissions for actions.
  const canManageUsers = isSuperAdminUser || isAdminUser;
  
  if (userManagementCard) {
    if (canManageUsers) {
      setRoleVisibility(userManagementCard, true);
      console.log('✅ User management panel shown');
    } else {
      setRoleVisibility(userManagementCard, false);
      console.log('✅ User management panel hidden');
    }
  }

  // Hide license info card for doctors (only show for admin)
  if (licenseInfoCard) {
    if (isSuperAdminUser) {
      setRoleVisibility(licenseInfoCard, true);
    } else {
      setRoleVisibility(licenseInfoCard, false);
      console.log('✅ License info card hidden for doctor');
    }
  }

  if (licenseAdminCard) {
    if (isSuperAdminUser) {
      setRoleVisibility(licenseAdminCard, true);
    } else {
      setRoleVisibility(licenseAdminCard, false);
    }
  }

  if (dbConfigCard) {
    setRoleVisibility(dbConfigCard, isSuperAdminUser);
  }
  
  if (addUserBtn) {
    if (canManageUsers) {
      addUserBtn.style.display = 'inline-block';
      addUserBtn.classList.remove('hidden');
    } else {
      addUserBtn.style.display = 'none';
      addUserBtn.classList.add('hidden');
    }
  }

  const toggleDoctorSettings = (enabled) => {
    if (!settingsForm) return;
    const inputs = settingsForm.querySelectorAll('input, button, select, textarea');
    inputs.forEach(input => {
      input.disabled = !enabled;
      if (!enabled) {
        input.classList.add('disabled-field');
      } else {
        input.classList.remove('disabled-field');
      }
    });
  };

  if (practiceInfoCard) {
    if (isSuperAdminUser || isDirectorUser) {
      setRoleVisibility(practiceInfoCard, false);
      toggleDoctorSettings(false);
    } else {
      setRoleVisibility(practiceInfoCard, true);
      toggleDoctorSettings(currentUserIsAdmin === true && !isSuperAdminUser);
    }
  }

  if (adminSetupCard) {
    if (isSuperAdminUser) {
      setRoleVisibility(adminSetupCard, true);
    } else {
      setRoleVisibility(adminSetupCard, false);
    }
  }

  if (devicesSettingsCard) {
    if (isDirectorUser) {
      setRoleVisibility(devicesSettingsCard, false);
    } else {
      setRoleVisibility(devicesSettingsCard, true);
    }
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
    document.querySelectorAll('.nav-item.admin-only').forEach(item => {
      item.style.display = 'none';
    });
    document.querySelectorAll('.section.admin-only').forEach(el => {
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

  // Handle package configuration visibility (superadmin only)
  if (packageConfigNav) {
    if (isSuperAdminUser) {
      packageConfigNav.style.display = '';
      packageConfigNav.classList.remove('hidden');
    } else {
      packageConfigNav.style.display = 'none';
      packageConfigNav.classList.add('hidden');
    }
  }

  // Re-apply feature locks outside the superadmin configuration console.
  if (!isSuperAdminUser && !isDirectorUser) {
    applyPackageRestrictionsFromCache();
  }

  if (typeof switchSettingsPage === 'function' && document.getElementById('settings')?.classList.contains('active')) {
    switchSettingsPage(typeof activeSettingsPage !== 'undefined' ? activeSettingsPage : 'general');
  }
}

function enforceAdminMode() {
  if (!currentUserIsSuperAdmin) return;
  // Always re-apply — never block on adminModeEnabled so package restrictions
  // can't accidentally restore clinical nav items for the superadmin.
  adminModeEnabled = true;
  const allowedAdminSections = new Set(['package-config', 'sms-config', 'cloud-sync', 'settings']);

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

  // Only navigate to settings on first enforcement to avoid interrupting the user.
  if (!document.getElementById('settings')?.classList.contains('active') &&
      !document.getElementById('package-config')?.classList.contains('active') &&
      !document.getElementById('sms-config')?.classList.contains('active') &&
      !document.getElementById('cloud-sync')?.classList.contains('active')) {
    showSection('settings');
  }
}

/**
 * Enforce assistant mode restrictions
 * Assistants can: manage patients, appointments, waiting room, record payments
 * Assistants cannot: view consultations, prescriptions, medical records, statistics
 */
function enforceAssistantMode() {
  console.log('🔒 Enforcing assistant mode restrictions');
  
  // Add assistant-mode class to body for CSS-based hiding
  document.body.classList.add('assistant-mode');
  
  // Hide navigation items that assistants shouldn't access
  // Assistants can access: dashboard, waiting-room, daily-summary, appointments-calendar, patients, payments, inventory (view only), settings
  // Assistants cannot access: statistics, rehabilitation, kine-staff, daily-summary (doctor only sections)
  const doctorOnlySections = ['statistics', 'rehabilitation', 'kine-staff', 'daily-summary'];
  
  document.querySelectorAll('.nav-item').forEach(item => {
    const section = item.dataset.section;
    if (doctorOnlySections.includes(section)) {
      item.style.display = 'none';
      item.classList.add('hidden-for-assistant');
    }
  });
  
  // Also hide any elements with doctor-only class
  document.querySelectorAll('.doctor-only').forEach(el => {
    el.style.display = 'none';
    el.classList.add('hidden-for-assistant');
  });
  
  // Hide consultation-related tab buttons in patient details
  // Assistants can see appointments tab only
  const tabsToHide = [
    'tab-consultations',
    'tab-prescriptions', 
    'tab-sickleaves',
    'tab-factures',
    'tab-rapports',
    'tab-bonpour',
    'tab-orientations',
    'tab-attachments'
  ];
  
  document.querySelectorAll('.tabs-header .tab-btn').forEach(btn => {
    const onclickAttr = btn.getAttribute('onclick') || '';
    tabsToHide.forEach(tabId => {
      if (onclickAttr.includes(tabId)) {
        btn.style.display = 'none';
        btn.classList.add('hidden-for-assistant');
      }
    });
  });
  
  // Hide the tab content for medical data
  tabsToHide.forEach(tabId => {
    const tabContent = document.getElementById(tabId);
    if (tabContent) {
      tabContent.style.display = 'none';
      tabContent.classList.add('hidden-for-assistant');
    }
  });
  
  // Make appointments tab active by default for patient details
  const appointmentsTabBtn = document.querySelector('.tab-btn[onclick*="tab-appointments"]');
  const appointmentsTab = document.getElementById('tab-appointments');
  if (appointmentsTabBtn && appointmentsTab) {
    // Remove active from all tabs first
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    // Activate appointments tab
    appointmentsTabBtn.classList.add('active');
    appointmentsTab.classList.add('active');
  }
  
  // Hide medical data sections in patient info card
  const hideSelectors = [
    '#patient-medical-history',
    '#patient-allergies', 
    '#patient-blood-type',
    '.medical-info-section',
    '#patient-documents-card',
    '#patient-history-content'
  ];
  
  hideSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = 'none';
      el.classList.add('hidden-for-assistant');
    });
  });

  // Hide patient medical action buttons for assistant
  document.querySelectorAll('button[onclick*="openNewConsultationModal"], button[onclick*="openOrientationModal"]').forEach((button) => {
    button.style.display = 'none';
    button.classList.add('hidden-for-assistant');
  });
  
  console.log('✅ Assistant mode restrictions applied');
  
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

  // Patients search
  const searchInput = document.getElementById('patients-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchPatients(e.target.value || '');
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

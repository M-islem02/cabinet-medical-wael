// ========== INITIALISATION ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOMContentLoaded event fired');
  
  try {
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

    const sickLeaveTableBody = document.getElementById('details-sickleaves-tbody');
    if (sickLeaveTableBody && !sickLeaveTableBody.dataset.actionsBound) {
      sickLeaveTableBody.addEventListener('click', handleSickLeaveTableClick);
      sickLeaveTableBody.dataset.actionsBound = 'true';
    }

  // Apply package restrictions early to avoid nav flicker
  await applyPackageRestrictions();
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
  
  // Initialiser le module configuration packages (pour admin/superadmin uniquement)
  if (typeof initializePackageConfig === 'function' && (currentUserIsAdmin || currentUserIsSuperAdmin)) {
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
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
});

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

    const result = await window.api.package.getConfig();
    if (!result.success || !result.data) {
      console.log('📦 No package config found, all features enabled');
      return;
    }
    
    const config = result.data;
    console.log('📦 Package config:', config);
    
    applyPackageRestrictionsFromCache(config);
    const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
      ? resolveActivePracticeSpecialty(config)
      : 'general';
    
    // Handle AI-specific features visibility
    if (config.featureAiReports === 0) {
      // Hide AI report buttons
      const aiReportButtons = document.querySelectorAll('.btn-ai-report, [onclick*="openAIReportGenerator"]');
      aiReportButtons.forEach(btn => btn.style.display = 'none');
    }
    
    if (config.featureAiChatbot === 0) {
      // Keep sidebar doctor AI entry visible; hide only optional inline AI chat buttons
      const aiChatButtons = document.querySelectorAll('.btn-ai-chat');
      aiChatButtons.forEach(btn => btn.style.display = 'none');
    }
    
    // If both AI features are disabled, hide the AI nav item
    if (config.featureAiReports === 0 && config.featureAiChatbot === 0) {
      const aiNavItem = document.querySelector('.nav-item[data-section="ai-assistant"]');
      if (aiNavItem) {
        aiNavItem.style.display = 'none';
      }
    }
    
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
    const isAdminUser = currentUserIsAdmin || currentUserIsSuperAdmin;
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

function setAIAssistantNavVisibility(enabled) {
  const aiNavItem = document.querySelector('.nav-item[onclick*="openAIChatbot"]');
  if (!aiNavItem) return;

  aiNavItem.dataset.featureDisabled = enabled ? '0' : '1';
  if (enabled) {
    aiNavItem.classList.remove('feature-disabled');
    aiNavItem.style.display = '';
  } else {
    aiNavItem.classList.add('feature-disabled');
    aiNavItem.style.display = 'none';
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

  const aiRehabOption = document.querySelector('#ai-report-type option[value="rehabilitation_plan"]');
  if (aiRehabOption) {
    aiRehabOption.style.display = mprEnabled ? '' : 'none';
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

  const hasDoctorChatAccess = currentUserRole === 'doctor' || currentUserRole === 'dentist';
  const aiEnabled = hasDoctorChatAccess || isFeatureEnabled(config, 'featureAiReports', false) || isFeatureEnabled(config, 'featureAiChatbot', false);
  setSectionFeatureVisibility('ai-assistant', aiEnabled);
  setAIAssistantNavVisibility(hasDoctorChatAccess ? true : aiEnabled);
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
  const isAdminUser = currentUserIsAdmin || currentUserIsSuperAdmin;
  const isDirectorUser = false;
  const userManagementCard = document.getElementById('user-management-card');
  const addUserBtn = document.getElementById('btn-add-user');
  const licenseAdminCard = document.getElementById('license-admin-card');
  const licenseInfoCard = document.getElementById('license-info-card');
  const practiceInfoCard = document.getElementById('practice-info-card');
  const adminSetupCard = document.getElementById('admin-setup-card');
  const devicesSettingsCard = document.getElementById('devices-settings-card');
  const publicBookingCard = document.getElementById('public-booking-card');
  const settingsForm = document.getElementById('settings-form');
  const packageConfigNav = document.querySelector('.nav-item[data-section="package-config"]');
  
  // Handle assistant role restrictions first
  if (currentUserRole === 'assistant') {
    enforceAssistantMode();
  }
  
  // Keep user management visible for all roles; backend still enforces permissions for actions.
  const canManageUsers = isAdminUser;
  
  if (userManagementCard) {
    if (canManageUsers) {
      userManagementCard.style.display = 'block';
      userManagementCard.classList.remove('hidden');
      userManagementCard.removeAttribute('aria-hidden');
      console.log('✅ User management panel shown');
    } else {
      userManagementCard.style.display = 'none';
      userManagementCard.classList.add('hidden');
      userManagementCard.setAttribute('aria-hidden', 'true');
      console.log('✅ User management panel hidden');
    }
  }

  // Hide license info card for doctors (only show for admin)
  if (licenseInfoCard) {
    if (isAdminUser) {
      licenseInfoCard.style.display = 'block';
      licenseInfoCard.classList.remove('hidden');
      licenseInfoCard.removeAttribute('aria-hidden');
    } else {
      licenseInfoCard.style.display = 'none';
      licenseInfoCard.classList.add('hidden');
      licenseInfoCard.setAttribute('aria-hidden', 'true');
      console.log('✅ License info card hidden for doctor');
    }
  }

  if (licenseAdminCard) {
    if (isAdminUser) {
      licenseAdminCard.style.display = 'block';
      licenseAdminCard.classList.remove('hidden');
      licenseAdminCard.removeAttribute('aria-hidden');
    } else {
      licenseAdminCard.style.display = 'none';
      licenseAdminCard.classList.add('hidden');
      licenseAdminCard.setAttribute('aria-hidden', 'true');
    }
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
    if (isAdminUser || isDirectorUser) {
      practiceInfoCard.style.display = 'none';
      practiceInfoCard.setAttribute('aria-hidden', 'true');
      toggleDoctorSettings(false);
    } else {
      practiceInfoCard.style.display = '';
      practiceInfoCard.removeAttribute('aria-hidden');
      toggleDoctorSettings(true);
    }
  }

  if (adminSetupCard) {
    if (isAdminUser) {
      adminSetupCard.style.display = 'block';
      adminSetupCard.removeAttribute('aria-hidden');
    } else {
      adminSetupCard.style.display = 'none';
      adminSetupCard.setAttribute('aria-hidden', 'true');
    }
  }

  if (devicesSettingsCard) {
    if (isDirectorUser) {
      devicesSettingsCard.style.display = 'none';
      devicesSettingsCard.setAttribute('aria-hidden', 'true');
    } else {
      devicesSettingsCard.style.display = '';
      devicesSettingsCard.removeAttribute('aria-hidden');
    }
  }

  if (publicBookingCard) {
    if (isDirectorUser) {
      publicBookingCard.style.display = 'none';
      publicBookingCard.setAttribute('aria-hidden', 'true');
    } else {
      publicBookingCard.style.display = '';
      publicBookingCard.removeAttribute('aria-hidden');
    }
  }

  if (isAdminUser) {
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

  // Handle package configuration visibility (admin/superadmin only)
  if (packageConfigNav) {
    if (isAdminUser) {
      packageConfigNav.style.display = '';
      packageConfigNav.classList.remove('hidden');
    } else {
      packageConfigNav.style.display = 'none';
      packageConfigNav.classList.add('hidden');
    }
  }

  // Re-apply feature locks only for non-admin users.
  // Admin mode has a strict fixed navbar (Config Client, SMS, Cloud, Paramètres).
  if (!isAdminUser && !isDirectorUser) {
    applyPackageRestrictionsFromCache();
  }
}

function enforceAdminMode() {
  if (!(currentUserIsAdmin || currentUserIsSuperAdmin) || adminModeEnabled) return;
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

  // Always hide AI chat item in admin mode (it has no data-section attribute).
  const aiNavItem = document.querySelector('.nav-item[onclick*="openAIChatbot"]');
  if (aiNavItem) {
    aiNavItem.style.display = 'none';
  }

  // Show admin-only sections
  document.querySelectorAll('.section.admin-only').forEach(el => {
    el.style.display = '';
  });

  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = 'Console Administrateur';
  }

  showSection('settings');
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
  // Assistants can access: dashboard, waiting-room, daily-summary, appointments-calendar, patients, payments, settings
  // Assistants cannot access: statistics, inventory, rehabilitation, kine-staff, daily-summary (doctor only sections)
  const doctorOnlySections = ['statistics', 'inventory', 'rehabilitation', 'kine-staff', 'daily-summary'];
  
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
      if (e.target.value.length > 0) {
        searchPatients(e.target.value);
      } else {
        loadPatients();
      }
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

// ========== NAVIGATION ==========
const SIDEBAR_COLLAPSED_KEY = 'medcareso_sidebar_collapsed';

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  document.documentElement.classList.toggle('sidebar-collapsed', !!collapsed);
  const toggleButton = document.getElementById('sidebar-toggle-btn');
  if (toggleButton) {
    toggleButton.title = collapsed ? 'Agrandir la navigation' : 'Réduire la navigation';
    toggleButton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
  }
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
}

function toggleSidebar() {
  const isCollapsed = document.body.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(!isCollapsed);
}

function initializeSidebarState() {
  const storedState = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  setSidebarCollapsed(storedState);
}

const DASHBOARD_TODAY_APPOINTMENTS_PREVIEW_SIZE = 3;
const DASHBOARD_TODAY_APPOINTMENTS_PAGE_SIZE = 8;
const dashboardTodayAppointmentsState = {
  appointments: [],
  searchTerm: '',
  page: 1
};

function escapeDashboardHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDashboardSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeDashboardAppointmentTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '00:00';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function getDashboardAppointmentStatusMeta(status) {
  const normalizedStatus = normalizeDashboardSearchValue(status || 'prevu');

  if (['confirme', 'confirmed'].includes(normalizedStatus)) {
    return { label: 'Confirmé', toneClass: 'is-confirmed', accentColor: '#145da0' };
  }

  if (['en attente', 'pending'].includes(normalizedStatus)) {
    return { label: 'En attente', toneClass: 'is-pending', accentColor: '#d99212' };
  }

  if (['annule', 'annulee', 'cancelled', 'canceled', 'no show', 'no_show'].includes(normalizedStatus)) {
    return { label: 'Annulé', toneClass: 'is-cancelled', accentColor: '#c83b4d' };
  }

  if (['termine', 'terminee', 'completed', 'done'].includes(normalizedStatus)) {
    return { label: 'Terminé', toneClass: 'is-completed', accentColor: '#1f8a63' };
  }

  return { label: 'Prévu', toneClass: 'is-scheduled', accentColor: '#8c6a16' };
}

function getDashboardAppointmentDisplayData(appointment = {}) {
  const patientName = appointment.patientName
    || `${appointment.firstName || ''} ${appointment.lastName || ''}`.trim()
    || 'Patient';
  const appointmentType = appointment.type || appointment.reason || appointment.appointmentType || 'Consultation';
  const statusMeta = getDashboardAppointmentStatusMeta(appointment.status);
  const time = normalizeDashboardAppointmentTime(appointment.time || appointment.appointmentTime || '00:00');

  return {
    patientName,
    appointmentType,
    statusMeta,
    time,
    searchIndex: normalizeDashboardSearchValue([
      patientName,
      appointmentType,
      appointment.reason || '',
      appointment.status || ''
    ].join(' '))
  };
}

function getFilteredDashboardTodayAppointments() {
  const searchTerm = normalizeDashboardSearchValue(dashboardTodayAppointmentsState.searchTerm);
  if (!searchTerm) {
    return dashboardTodayAppointmentsState.appointments;
  }

  return dashboardTodayAppointmentsState.appointments.filter((appointment) => {
    const displayData = getDashboardAppointmentDisplayData(appointment);
    return displayData.searchIndex.includes(searchTerm);
  });
}

function getDashboardTodayAppointmentsDateLabel() {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function renderDashboardTodayAppointmentsPreview() {
  const container = document.getElementById('dashboard-today-appointments');
  const openButton = document.getElementById('dashboard-open-day-appointments');
  if (!container) return;

  const appointments = dashboardTodayAppointmentsState.appointments;
  if (openButton) {
    openButton.disabled = appointments.length === 0;
  }

  if (!appointments.length) {
    container.innerHTML = '<div class="dashboard-appointments-empty">Aucun rendez-vous aujourd\'hui.</div>';
    return;
  }

  const previewAppointments = appointments.slice(0, DASHBOARD_TODAY_APPOINTMENTS_PREVIEW_SIZE);
  const previewHtml = previewAppointments.map((appointment, index) => {
    const displayData = getDashboardAppointmentDisplayData(appointment);

    return `
      <div class="appointment-mini-item dashboard-appointment-preview-item" style="border-left-color: ${displayData.statusMeta.accentColor};">
        <div class="apt-index">${index + 1}</div>
        <div class="apt-timing">
          <span class="apt-time">${escapeDashboardHtml(displayData.time)}</span>
          <span class="apt-status ${displayData.statusMeta.toneClass}">${escapeDashboardHtml(displayData.statusMeta.label)}</span>
        </div>
        <div class="apt-info">
          <span class="apt-patient">${escapeDashboardHtml(displayData.patientName)}</span>
          <span class="apt-type">${escapeDashboardHtml(displayData.appointmentType)}</span>
        </div>
      </div>
    `;
  }).join('');

  const remainingCount = Math.max(0, appointments.length - previewAppointments.length);
  const summaryHtml = `
    <div class="dashboard-appointments-summary">
      ${remainingCount > 0
        ? `+ ${remainingCount} autre${remainingCount > 1 ? 's' : ''} rendez-vous disponible${remainingCount > 1 ? 's' : ''} dans le d&eacute;tail du jour.`
        : 'Tous les rendez-vous du jour sont disponibles dans le d&eacute;tail pagin&eacute;.'}
    </div>
  `;

  container.innerHTML = `
    <div class="appointments-mini-list dashboard-appointments-mini-list">
      ${previewHtml}
    </div>
    ${summaryHtml}
  `;
}

function renderDashboardTodayAppointmentsModal() {
  const title = document.getElementById('dashboard-today-appointments-title');
  const listContainer = document.getElementById('dashboard-today-appointments-list');
  const paginationContainer = document.getElementById('dashboard-today-appointments-pagination');
  if (!listContainer || !paginationContainer) return;

  if (title) {
    title.textContent = `Rendez-vous du ${getDashboardTodayAppointmentsDateLabel()}`;
  }

  const filteredAppointments = getFilteredDashboardTodayAppointments();
  if (!filteredAppointments.length) {
    listContainer.innerHTML = `
      <div class="daily-appointments-empty">
        ${dashboardTodayAppointmentsState.searchTerm
          ? 'Aucun rendez-vous ne correspond à cette recherche.'
          : 'Aucun rendez-vous prévu pour aujourd\'hui.'}
      </div>
    `;
    paginationContainer.style.display = 'none';
    paginationContainer.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filteredAppointments.length / DASHBOARD_TODAY_APPOINTMENTS_PAGE_SIZE));
  dashboardTodayAppointmentsState.page = Math.min(
    Math.max(1, dashboardTodayAppointmentsState.page),
    totalPages
  );

  const startIndex = (dashboardTodayAppointmentsState.page - 1) * DASHBOARD_TODAY_APPOINTMENTS_PAGE_SIZE;
  const pageAppointments = filteredAppointments.slice(
    startIndex,
    startIndex + DASHBOARD_TODAY_APPOINTMENTS_PAGE_SIZE
  );

  listContainer.innerHTML = pageAppointments.map((appointment, index) => {
    const displayData = getDashboardAppointmentDisplayData(appointment);

    return `
      <div class="daily-appointment-row dashboard-daily-appointment-row" style="border-color: ${displayData.statusMeta.accentColor}22;">
        <span class="daily-appointment-index">${startIndex + index + 1}</span>
        <div class="daily-appointment-main">
          <div class="daily-appointment-heading">
            <span class="daily-appointment-time">${escapeDashboardHtml(displayData.time)}</span>
            <span class="daily-appointment-badge" style="background: ${displayData.statusMeta.accentColor}18; color: ${displayData.statusMeta.accentColor};">
              ${escapeDashboardHtml(displayData.statusMeta.label)}
            </span>
          </div>
          <div class="daily-appointment-patient">${escapeDashboardHtml(displayData.patientName)}</div>
          <div class="daily-appointment-meta">${escapeDashboardHtml(displayData.appointmentType)} &middot; ${escapeDashboardHtml(appointment.reason || 'Sans motif')}</div>
        </div>
      </div>
    `;
  }).join('');

  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    paginationContainer.innerHTML = '';
    return;
  }

  paginationContainer.style.display = 'flex';
  paginationContainer.innerHTML = `
    <div class="list-pagination-info">
      ${startIndex + 1}-${Math.min(startIndex + DASHBOARD_TODAY_APPOINTMENTS_PAGE_SIZE, filteredAppointments.length)} / ${filteredAppointments.length}
    </div>
    <div class="list-pagination-actions pagination-controls">
      <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${dashboardTodayAppointmentsState.page <= 1 ? 'disabled' : ''} onclick="changeDashboardTodayAppointmentsPage(-1)">‹</button>
      <span class="list-pagination-info">${dashboardTodayAppointmentsState.page}/${totalPages}</span>
      <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${dashboardTodayAppointmentsState.page >= totalPages ? 'disabled' : ''} onclick="changeDashboardTodayAppointmentsPage(1)">›</button>
    </div>
  `;
}

function filterDashboardTodayAppointments(value = '') {
  dashboardTodayAppointmentsState.searchTerm = value;
  dashboardTodayAppointmentsState.page = 1;
  renderDashboardTodayAppointmentsModal();
}

function changeDashboardTodayAppointmentsPage(direction) {
  dashboardTodayAppointmentsState.page += direction;
  renderDashboardTodayAppointmentsModal();
}

function openDashboardTodayAppointmentsModal() {
  if (!dashboardTodayAppointmentsState.appointments.length) {
    return;
  }

  const searchInput = document.getElementById('dashboard-today-appointments-search');
  if (searchInput) {
    searchInput.value = '';
  }

  dashboardTodayAppointmentsState.searchTerm = '';
  dashboardTodayAppointmentsState.page = 1;
  renderDashboardTodayAppointmentsModal();

  if (typeof showModal === 'function') {
    showModal('modal-dashboard-today-appointments');
  }
}

function showSection(sectionId) {
  if (currentUserIsSuperAdmin && sectionId === 'dashboard') {
    sectionId = 'package-config';
  }
  const packageConfig = window._packageConfig || null;
  const sectionFeatureMap = {
    'waiting-room': 'featureWaitingRoom',
    'daily-summary': 'featureDailySummary',
    'statistics': 'featureStatistics',
    'inventory': 'featureInventory',
    'equipment': 'featureInventory',
    'kine-staff': 'featureKineStaff',
    'orl': 'featureORL',
    'medical-imaging': 'featureMedicalImaging',
    'appointments-calendar': 'featureCalendar'
  };

  const isTestAccount = (typeof isDemoOrTestAccount === 'function' && isDemoOrTestAccount())
    || (typeof currentUserRole !== 'undefined' && currentUserRole === 'test')
    || (typeof currentUsername !== 'undefined' && String(currentUsername).trim().toLowerCase() === 'test')
    || (String(localStorage.getItem('currentUsername') || '').trim().toLowerCase() === 'test')
    || (localStorage.getItem('currentUserRole') === 'test');

  if (!isTestAccount) {
    const featureKey = sectionFeatureMap[sectionId];
    if (packageConfig && featureKey && sectionId !== 'daily-summary') {
      const isEnabled = typeof isFeatureEnabled === 'function'
        ? isFeatureEnabled(packageConfig, featureKey, true)
        : (packageConfig[featureKey] === 1 || packageConfig[featureKey] === true || packageConfig[featureKey] === '1');
      if (!isEnabled) {
        showNotification('Fonctionnalité désactivée dans Config Client', 'warning');
        return;
      }
    }

    const specialtySectionMap = {
      'orl': 'orl'
    };
    const requiredSpecialty = specialtySectionMap[sectionId];
    if (packageConfig && requiredSpecialty) {
      const activeSpecialty = typeof resolveActivePracticeSpecialty === 'function'
        ? resolveActivePracticeSpecialty(packageConfig)
        : 'general';
      if (activeSpecialty !== requiredSpecialty && !packageConfig[sectionFeatureMap[sectionId]]) {
        const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
          ? getPracticeSpecialtyMeta(requiredSpecialty)
          : null;
        showNotification(
          `Section inactive. Activez la spécialité ${specialtyMeta?.label || requiredSpecialty} dans Config Client.`,
          'warning'
        );
        return;
      }
    }

    // Check role-based access for assistant
    if (currentUserRole === 'assistant') {
      const assistantRestrictedSections = ['orl', 'operations', 'settings', 'statistics', 'equipment', 'rehabilitation', 'dentistry', 'cardiology', 'medical-imaging', 'daily-summary', 'sms-config', 'cloud-sync', 'treatment-plans'];
      if (assistantRestrictedSections.includes(sectionId)) {
        showNotification('Accès non autorisé', 'error');
        return;
      }
    }

    if (currentUserRole === 'director') {
      const directorAllowedSections = new Set(['statistics', 'settings']);
      if (!directorAllowedSections.has(sectionId)) {
        showNotification('Accès réservé au directeur : Statistiques et Paramètres', 'error');
        return;
      }
    }

    // Restrict client config and integrations to superadmin only.
    if (['package-config', 'sms-config', 'cloud-sync'].includes(sectionId) && !currentUserIsSuperAdmin) {
      showNotification('Accès réservé au super administrateur', 'error');
      return;
    }
  }
  
  // Hide all sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });

  // Show target section
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.style.display = 'block';
    targetSection.classList.remove('role-hidden', 'feature-disabled', 'hidden');
    targetSection.classList.add('active');
  }

  // Update navigation active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    // Patient details should highlight the patients nav item
    const matchSection = sectionId === 'patient-details' ? 'patients' : sectionId;
    if (item.dataset.section === matchSection) {
      item.classList.add('active');
    }
  });

  // Update page title
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    const titles = {
      'dashboard': 'Tableau de Bord',
      'package-config': 'Configuration Client & Spécialités',
      'waiting-room': 'Salle d\'Attente',
      'daily-summary': 'Résumé du Jour',
      'appointments-calendar': 'Agenda RDV',
      'patients': 'Gestion des Patients',
      'medical-imaging': 'Imagerie Médicale',
      'orl': 'Module ORL & Explorations',
      'operations': 'Gestion des Opérations & Interventions',
      'patient-details': 'Détails du Patient',
      'consultations': 'Consultations',
      'prescriptions': 'Ordonnances',
      'sick-leaves': 'Certificats médicaux',
      'payments': 'Gestion des Paiements',
      'statistics': 'Statistiques',
      'settings': 'Paramètres',
      'expenses': 'Gestion des Dépenses',
      'inventory': 'Gestion du Stock',
      'equipment': 'Équipement du Cabinet',
      'debts': 'Gestion des Impayés',
      'kine-staff': 'Kinésithérapeutes (Staff)',
      'rehabilitation': 'Rééducation',
      'dentistry': 'Dentisterie',
      'treatment-plans': 'Plans de Traitement',
      'cardiology': 'Cardiologie',
      'sms-config': 'SMS Rappels',
      'cloud-sync': 'Cloud Sync'
    };
    pageTitle.textContent = titles[sectionId] || 'MedCareSO';

    const breadcrumbMap = {
      'dashboard': null,
      'waiting-room': null,
      'daily-summary': null,
      'appointments-calendar': null,
      'patients': null,
      'medical-imaging': 'Patients',
      'orl': 'Module Médical',
      'patient-details': 'Patients',
      'payments': null,
      'inventory': null,
      'equipment': null,
      'statistics': null,
      'package-config': 'Administration',
      'sms-config': 'Administration',
      'cloud-sync': 'Administration',
      'settings': 'Administration',
      'consultations': 'Patients',
      'prescriptions': 'Patients',
      'sick-leaves': 'Patients',
    };

    const breadcrumbEl = document.getElementById('topbar-breadcrumb');
    if (breadcrumbEl) {
      breadcrumbEl.style.display = 'none';
    }
  }

  // Load section-specific data
  currentPage = sectionId;
  
  if (sectionId === 'patients') {
    if (typeof loadPatients === 'function') {
      loadPatients();
    } else if (typeof switchPatientsView === 'function') {
      switchPatientsView('mine');
    }
  } else if (sectionId === 'payments') {
    if (typeof loadPaymentPractitionerFilter === 'function') loadPaymentPractitionerFilter();
    loadPayments();
    loadPaymentStats();
  } else if (sectionId === 'statistics') {
    loadStatistics();
  } else if (sectionId === 'settings') {
    loadSettings();
    if (typeof switchSettingsPage === 'function') {
      switchSettingsPage(typeof activeSettingsPage !== 'undefined' ? activeSettingsPage : 'general');
    }
    if (typeof loadLicenseStatus === 'function') {
      loadLicenseStatus();
    }
    if (typeof loadUsersList === 'function') {
      loadUsersList();
    }
  } else if (sectionId === 'appointments-calendar') {
    if (window.initCalendar) {
      window.initCalendar();
    }
  } else if (sectionId === 'dashboard') {
    loadDashboardStats();
  } else if (sectionId === 'expenses') {
    if (typeof initExpenses === 'function') initExpenses();
  } else if (sectionId === 'inventory') {
    if (typeof initInventory === 'function') initInventory();
  } else if (sectionId === 'equipment') {
    if (typeof initEquipment === 'function') initEquipment();
  } else if (sectionId === 'debts') {
    if (typeof initDebts === 'function') initDebts();
  } else if (sectionId === 'waiting-room') {
    if (typeof loadWaitingRoom === 'function') loadWaitingRoom();
  } else if (sectionId === 'kine-staff') {
    if (typeof loadKineStaff === 'function') loadKineStaff();
  } else if (sectionId === 'daily-summary') {
    if (typeof initDailySummary === 'function') {
      initDailySummary();
    } else if (typeof loadDailySummary === 'function') {
      loadDailySummary(true);
    }
  } else if (sectionId === 'medical-imaging') {
    if (typeof initMedicalImaging === 'function') initMedicalImaging();
  } else if (sectionId === 'orl') {
    if (typeof initORL === 'function') {
      void initORL();
    } else if (typeof window.initORL === 'function') {
      void window.initORL();
    } else if (typeof refreshORLPatientList === 'function') {
      void refreshORLPatientList();
    } else if (typeof window.refreshORLPatientList === 'function') {
      void window.refreshORLPatientList();
    }
  } else if (sectionId === 'operations') {
    if (typeof initOperations === 'function') initOperations();
    else if (typeof window.initOperations === 'function') window.initOperations();
  } else if (sectionId === 'dentistry') {
    if (typeof initDentistry === 'function') initDentistry();
    else if (typeof window.initDentistry === 'function') window.initDentistry();
  } else if (sectionId === 'treatment-plans') {
    if (typeof initTreatmentPlans === 'function') initTreatmentPlans();
    else if (typeof window.initTreatmentPlans === 'function') window.initTreatmentPlans();
  } else if (sectionId === 'rehabilitation') {
    if (typeof initRehabilitation === 'function') initRehabilitation();
    else if (typeof window.initRehabilitation === 'function') window.initRehabilitation();
  } else if (sectionId === 'cardiology') {
    if (typeof initCardiology === 'function') initCardiology();
    else if (typeof window.initCardiology === 'function') window.initCardiology();
  } else if (sectionId === 'package-config') {
    if (typeof loadPackageConfig === 'function') loadPackageConfig();
    else if (typeof window.loadPackageConfig === 'function') window.loadPackageConfig();
  } else if (sectionId === 'sms-config') {
    if (typeof initSMSConfig === 'function') initSMSConfig();
  } else if (sectionId === 'cloud-sync') {
    if (typeof initCloudSync === 'function') initCloudSync();
  }
}

window.toggleSidebar = toggleSidebar;
window.initializeSidebarState = initializeSidebarState;
window.showSection = showSection;

// ========== DASHBOARD STATS ==========
async function loadDashboardStats() {
  const statPatientsEl = document.getElementById('stat-patients');
  const statConsultationsEl = document.getElementById('stat-consultations');
  const statPrescriptionsEl = document.getElementById('stat-prescriptions');
  const statAppointmentsTodayEl = document.getElementById('stat-appointments-today');

  // Avoid showing 0 while stats are loading (large datasets can take a moment).
  if (statPatientsEl) statPatientsEl.textContent = '…';
  if (statConsultationsEl) statConsultationsEl.textContent = '…';
  if (statPrescriptionsEl) statPrescriptionsEl.textContent = '…';
  if (statAppointmentsTodayEl) statAppointmentsTodayEl.textContent = '…';

  try {
    const quickStats = await window.api.dashboard.getQuickStats();
    const stats = quickStats?.success ? (quickStats.data || {}) : {};
    let patientsCount = Number(stats.patients || 0);
    if (!patientsCount && window.api?.patient?.getCount) {
      const countResult = await window.api.patient.getCount();
      if (countResult?.success && Number.isFinite(Number(countResult.count))) {
        patientsCount = Number(countResult.count);
      }
    }

    document.getElementById('stat-patients').textContent = patientsCount;
    document.getElementById('stat-consultations').textContent = currentUserRole === 'assistant'
      ? '—'
      : Number(stats.consultationsMonth || 0);
    document.getElementById('stat-prescriptions').textContent = currentUserRole === 'assistant'
      ? '—'
      : Number(stats.prescriptionsMonth || 0);

    const summary = document.getElementById('dashboard-summary-text');
    if (summary) {
      const roleLabel = currentUserRole === 'assistant' ? 'assistant(e)' : 'praticien(ne)';
      summary.textContent = `${patientsCount} patient(s) dans le répertoire · ${roleLabel} connecté(e) · données mises à jour maintenant.`;
    }

    // Load today's appointments
    await loadTodayAppointments();

    // Load license status
    try {
      const licenseStatus = await window.api.license.getStatus();
      const licenseEl = document.getElementById('license-days');
      const licenseFooter = document.getElementById('license-footer');
      if (licenseStatus && licenseEl) {
        if (licenseStatus.hasActiveLicense === false) {
          licenseEl.textContent = '0';
          licenseEl.style.color = '#ef4444';
          if (licenseFooter) licenseFooter.textContent = 'Aucune licence active';
        } else if (licenseStatus.daysRemaining === -1 || licenseStatus.daysRemaining === null || licenseStatus.daysRemaining === undefined) {
          // Unlimited license
          licenseEl.textContent = '\u221E';
          licenseEl.style.color = '#10b981';
          if (licenseFooter) licenseFooter.textContent = 'Licence illimitée';
        } else {
          licenseEl.textContent = licenseStatus.daysRemaining;
          if (licenseStatus.daysRemaining <= 7) {
            licenseEl.style.color = '#ef4444';
          } else if (licenseStatus.daysRemaining <= 30) {
            licenseEl.style.color = '#f59e0b';
          } else {
            licenseEl.style.color = '#10b981';
          }
        }
      }
    } catch (e) {
      console.log('Could not load license status:', e);
    }

  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

async function loadTodayAppointments() {
  const container = document.getElementById('dashboard-today-appointments');
  const countBadge = document.getElementById('today-appointments-count');
  const statCard = document.getElementById('stat-appointments-today');
  
  if (!container || !countBadge) return;
  
  try {
    let todayAppointments = [];
    if (window.api?.appointment?.getToday) {
      const result = await window.api.appointment.getToday();
      if (result?.success && Array.isArray(result.data)) {
        todayAppointments = [...result.data];
      }
    }
    
    // Si la liste est vide ou en cas de problème, tentative de repli avec getByDateRange
    if (!todayAppointments.length && window.api?.appointment?.getByDateRange) {
      const todayStr = new Date().toISOString().split('T')[0];
      try {
        const rangeRes = await window.api.appointment.getByDateRange(todayStr, todayStr);
        if (rangeRes?.success && Array.isArray(rangeRes.data)) {
          todayAppointments = [...rangeRes.data];
        }
      } catch (e) {
        console.warn('Fallback getByDateRange notice:', e);
      }
    }

    todayAppointments.sort((a, b) => {
      const timeA = a.time || '00:00:00';
      const timeB = b.time || '00:00:00';
      return timeA.localeCompare(timeB);
    });

    dashboardTodayAppointmentsState.appointments = todayAppointments;
    dashboardTodayAppointmentsState.page = 1;
    
    const count = todayAppointments.length;
    countBadge.textContent = count;
    if (statCard) {
      statCard.textContent = count;
    }

    renderDashboardTodayAppointmentsPreview();
    if (document.getElementById('modal-dashboard-today-appointments')?.classList.contains('active')) {
      renderDashboardTodayAppointmentsModal();
    }
  } catch (error) {
    console.error('Error loading today appointments:', error);
    dashboardTodayAppointmentsState.appointments = [];
    dashboardTodayAppointmentsState.searchTerm = '';
    dashboardTodayAppointmentsState.page = 1;
    countBadge.textContent = '0';
    if (statCard) {
      statCard.textContent = '0';
    }
    renderDashboardTodayAppointmentsPreview();
  }
}

function viewPatientFromAppointment(patientId) {
  viewPatientDetails(patientId);
}

// Calendar state
// ========== CALENDAR (DEPRECATED - MOVED TO calendar.js) ==========
/*
let currentCalendarDate = new Date();
let calendarView = 'week'; // 'day', 'week', 'month'

async function loadAppointmentsCalendar() {
  // ... deprecated
}
*/
// Functions moved to calendar.js
// function changeCalendarView(view) { ... }
// function navigateCalendar(direction) { ... }
// function getCalendarDateRange() { ... }
// function renderAppointmentsCalendar(allAppointments = []) { ... }


function getCalendarDateRange() {
  const start = new Date(currentCalendarDate);
  const end = new Date(currentCalendarDate);
  
  if (calendarView === 'day') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (calendarView === 'week') {
    // Get start of week (Monday)
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    
    // Get end of week (Sunday)
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (calendarView === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    
    end.setMonth(start.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  }
  
  return { start, end };
}

function renderAppointmentsCalendar(allAppointments = []) {
  try {
    const container = document.getElementById('appointments-calendar-view');
    const titleEl = document.getElementById('calendar-period-title');
    if (!container) return;
    
    const { start, end } = getCalendarDateRange();
    const now = new Date();
    
    // Filter appointments for the current period
    const filteredAppointments = allAppointments.filter(apt => {
      const aptDate = new Date(apt.date);
      return aptDate >= start && aptDate <= end;
    });
    
    // Update title
    if (calendarView === 'day') {
      titleEl.textContent = currentCalendarDate.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (calendarView === 'week') {
      titleEl.textContent = `Semaine du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`;
    } else if (calendarView === 'month') {
      titleEl.textContent = currentCalendarDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
    }
    
    container.innerHTML = '';
    
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const groupedByDate = {};

    filteredAppointments.forEach(apt => {
      const date = apt.date.split(' ')[0];
      if (!groupedByDate[date]) groupedByDate[date] = [];
      groupedByDate[date].push(apt);
    });

    // Create day view for each day in range
    if (calendarView === 'day' || calendarView === 'week') {
      const daysToShow = calendarView === 'day' ? 1 : 7;
      const currentDate = new Date(start);
      
      // Collect all days data first
      const daysData = [];
      for (let i = 0; i < daysToShow; i++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = days[currentDate.getDay()];
        const displayDate = currentDate.toLocaleDateString('fr-FR');
        const isToday = currentDate.toDateString() === now.toDateString();
        const isPast = currentDate < now && !isToday;
        const dayAppointments = groupedByDate[dateStr] || [];
        
        daysData.push({
          dateStr,
          dayName,
          displayDate,
          isToday,
          isPast,
          dayAppointments,
          date: new Date(currentDate)
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Sort: Today first, then future days, then past days
      daysData.sort((a, b) => {
        if (a.isToday) return -1;
        if (b.isToday) return 1;
        if (a.isPast && !b.isPast) return 1;
        if (!a.isPast && b.isPast) return -1;
        return a.date - b.date;
      });
      
      // Render sorted days
      daysData.forEach(dayData => {
        const { dayName, displayDate, isToday, isPast, dayAppointments } = dayData;
        
        let dayHtml = `
          <div class="calendar-day" style="border: 2px solid ${isToday ? '#2196F3' : '#e0e0e0'}; background: ${isToday ? '#e3f2fd' : '#fff'}; padding: 15px; margin-bottom: 15px; border-radius: 8px;">
            <h3 style="margin-bottom: 15px; color: ${isToday ? '#2196F3' : '#666'}; border-bottom: 2px solid ${isToday ? '#2196F3' : '#e0e0e0'}; padding-bottom: 8px;">
              ${isToday ? '📅 Aujourd\'hui' : dayName} - ${displayDate} ${isPast ? '(Passé)' : ''}
            </h3>
            <div class="appointments-list">
        `;
        
        if (dayAppointments.length === 0) {
          dayHtml += '<p style="color: #999; font-style: italic; padding: 20px; text-align: center;">Aucun rendez-vous</p>';
        } else {
          dayAppointments.forEach(apt => {
            const statusColors = {
              'Confirmé': '#4caf50',
              'En attente': '#ff9800',
              'Annulé': '#f44336',
              'Terminé': '#9e9e9e'
            };
            const statusColor = statusColors[apt.status] || '#2196F3';
            
            dayHtml += `
              <div class="appointment-card" style="padding: 12px; margin-bottom: 10px; background: #f9f9f9; border-radius: 6px; border-left: 4px solid ${statusColor};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: bold; font-size: 14px;">⏰ ${apt.time} - ${apt.reason || 'RDV'}</div>
                    <div style="font-size: 13px; color: #666; margin-top: 4px;">👤 ${apt.patientName}</div>
                  </div>
                  <div style="font-size: 12px; padding: 6px 12px; background: ${statusColor}; border-radius: 4px; color: white; font-weight: bold;">
                    ${apt.status || 'Prévu'}
                  </div>
                </div>
              </div>
            `;
          });
        }

        dayHtml += '</div></div>';
        container.innerHTML += dayHtml;
      });
      
    } else if (calendarView === 'month') {
      // Month grid view
      const monthStart = new Date(start);
      const monthEnd = new Date(end);
      
      // Create grid
      let gridHtml = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px;">';
      
      // Day headers
      days.forEach(day => {
        gridHtml += `<div style="text-align: center; font-weight: bold; padding: 10px; background: #2196F3; color: white; border-radius: 4px;">${day.substring(0, 3)}</div>`;
      });
      
      // Fill in days
      const firstDay = monthStart.getDay();
      const lastDate = monthEnd.getDate();
      
      // Empty cells for days before month start
      for (let i = 0; i < firstDay; i++) {
        gridHtml += '<div style="background: #f5f5f5; border-radius: 4px; padding: 10px; min-height: 100px;"></div>';
      }
      
      // Days of the month
      for (let day = 1; day <= lastDate; day++) {
        const currentDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        const dateStr = currentDate.toISOString().split('T')[0];
        const isToday = currentDate.toDateString() === now.toDateString();
        const dayAppointments = groupedByDate[dateStr] || [];
        
        gridHtml += `
          <div style="background: ${isToday ? '#e3f2fd' : '#fff'}; border: 2px solid ${isToday ? '#2196F3' : '#e0e0e0'}; border-radius: 4px; padding: 10px; min-height: 100px;">
            <div style="font-weight: bold; margin-bottom: 5px; color: ${isToday ? '#2196F3' : '#333'};">${day}</div>
        `;
        
        dayAppointments.forEach(apt => {
          const statusColors = {
            'Confirmé': '#4caf50',
            'En attente': '#ff9800',
            'Annulé': '#f44336',
            'Terminé': '#9e9e9e'
          };
          const statusColor = statusColors[apt.status] || '#2196F3';
          
          gridHtml += `
            <div style="font-size: 10px; padding: 4px; margin-bottom: 2px; background: ${statusColor}; color: white; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${apt.time} - ${apt.patientName}
            </div>
          `;
        });
        
        gridHtml += '</div>';
      }
      
      gridHtml += '</div>';
      container.innerHTML = gridHtml;
    }

  } catch (error) {
    console.error('Error rendering appointments calendar:', error);
  }
}

import { appointmentApi } from '../../features/appointments/appointment-api.js';
import { renderAppointmentPatientOptions } from '../../features/appointments/patient-selector.js';
import { eventBus } from '../../core/state/event-bus.js';
import { registerLegacyGlobals } from '../../core/legacy/legacy-bridge.js';

// ========== CALENDAR MODULE (Professional EasyClinic-Style) ==========

// Calendar state
let currentCalendarDate = new Date();
let currentCalendarView = 'day'; // day, week, month
let selectedTeamMembers = []; // Filter by team members
let calendarAppointments = [];
let calendarListenersBound = false;
let todayAppointmentsPage = 1;
const TODAY_APPOINTMENTS_PAGE_SIZE = 8;

const DEFAULT_APPOINTMENT_CATEGORIES = [
  { name: 'Consultation', color: '#ef4444' },
  { name: 'Rééducation', color: '#f59e0b' },
  { name: 'Contrôle', color: '#10b981' },
  { name: 'Kinésithérapie', color: '#8b5cf6' },
  { name: 'Ergothérapie', color: '#06b6d4' }
];
const APPOINTMENT_CATEGORIES_KEY = 'medcareso_appointment_categories';

// Initialize Calendar
async function initCalendar() {
  console.log('🗓️ Initializing professional calendar...');

  // Load appointment categories UI + appointment type select
  loadAppointmentCategories();
  
  // Load team members
  await loadTeamMembers();
  
  // Load appointments
  await loadCalendarAppointments();
  
  // Setup calendar event listeners
  setupCalendarEventListeners();
  
  // Setup search functionality
  setupCalendarSearch();
  
  // Render calendar
  renderCalendar();
  
  console.log('✅ Calendar initialized');
}

function getAppointmentCategories() {
  try {
    const raw = localStorage.getItem(APPOINTMENT_CATEGORIES_KEY);
    if (!raw) return [...DEFAULT_APPOINTMENT_CATEGORIES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_APPOINTMENT_CATEGORIES];
    return parsed.filter(c => c && c.name).map(c => ({
      name: String(c.name).trim(),
      color: c.color || '#3b82f6'
    }));
  } catch (error) {
    console.error('Error reading appointment categories:', error);
    return [...DEFAULT_APPOINTMENT_CATEGORIES];
  }
}

function setAppointmentCategories(categories) {
  localStorage.setItem(APPOINTMENT_CATEGORIES_KEY, JSON.stringify(categories));
}

function renderAppointmentCategories() {
  const categories = getAppointmentCategories();
  const container = document.getElementById('categories-list');
  if (container) {
    container.innerHTML = categories.map(cat => `
      <div class="category-item">
        <span class="category-color" style="background: ${cat.color};"></span>
        <span class="category-name">${escapeHtml(cat.name)}</span>
        <button class="btn btn-tiny btn-outline category-remove-btn" title="Supprimer" onclick="removeAppointmentCategory('${encodeURIComponent(cat.name)}')">✕</button>
      </div>
    `).join('');
  }

  const typeSelect = document.getElementById('appointment-type');
  if (typeSelect) {
    const currentValue = typeSelect.value;
    typeSelect.innerHTML = categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
    if (currentValue && categories.some(c => c.name === currentValue)) {
      typeSelect.value = currentValue;
    }
  }
}

function loadAppointmentCategories() {
  const categories = getAppointmentCategories();
  setAppointmentCategories(categories);
  renderAppointmentCategories();
}

function toggleCalendarCategoryForm(show = null) {
  const form = document.getElementById('calendar-category-form');
  if (!form) return;

  const shouldShow = typeof show === 'boolean' ? show : form.classList.contains('hidden');
  form.classList.toggle('hidden', !shouldShow);

  if (shouldShow) {
    document.getElementById('calendar-category-name')?.focus();
  }
}

function removeAppointmentCategory(encodedName) {
  const name = decodeURIComponent(encodedName || '');
  if (!name) return;

  let categories = getAppointmentCategories();
  if (categories.length <= 1) {
    showNotification('❌ Impossible de supprimer la dernière catégorie', 'error');
    return;
  }

  if (!confirm(`Supprimer la catégorie « ${name} » ?`)) return;
  categories = categories.filter(c => c.name !== name);
  setAppointmentCategories(categories);
  renderAppointmentCategories();
  showNotification('✅ Catégorie supprimée', 'success');
}

// Setup calendar search functionality
function setupCalendarSearch() {
  const searchInput = document.getElementById('calendar-patient-search');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    filterTodayAppointmentsList(searchTerm);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      filterTodayAppointmentsList('');
    }
  });
}

// Load team members from database
async function loadTeamMembers() {
  try {
    const usersResult = await appointmentApi.getUsers();
    const users = Array.isArray(usersResult?.data)
      ? usersResult.data
      : Array.isArray(usersResult)
        ? usersResult
        : [];
    const teamList = document.getElementById('team-list');
    
    if (!teamList) return;
    
    // Filter only medical staff
    const medicalStaff = users.filter(u => 
      ['doctor', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse'].includes(u.role)
    );
    
    if (medicalStaff.length === 0) {
      teamList.innerHTML = '<div class="empty-calendar-note">Aucun membre d’équipe médical à afficher.</div>';
      selectedTeamMembers = [];
      return;
    }

    teamList.innerHTML = medicalStaff.map(user => {
      const color = user.color || getDefaultColorForRole(user.role);
      
      return `
        <div class="team-member" data-user-id="${user.id}" data-checked="true">
          <input type="checkbox" checked style="display: none;">
          <div class="member-color" style="background: ${color}"></div>
          <span class="member-name">${user.fullName || user.username}</span>
          <span class="member-count" id="count-user-${user.id}">0</span>
        </div>
      `;
    }).join('');
    
    // Select all by default
    selectedTeamMembers = medicalStaff.map(u => u.id);
    
  } catch (error) {
    console.error('Error loading team members:', error);
  }
}

// Get default color for role
function getDefaultColorForRole(role) {
  const colors = {
    doctor: '#3b82f6',
    kinesitherapeute: '#8b5cf6',
    ergotherapeute: '#06b6d4',
    orthophoniste: '#f59e0b',
    nurse: '#10b981',
    admin: '#ef4444',
    assistant: '#6b7280'
  };
  return colors[role] || '#6b7280';
}

// Get initials from name
function getInitials(name) {
  if (!name) return '??';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Load appointments for current view
async function loadCalendarAppointments() {
  try {
    const startDate = getViewStartDate();
    const endDate = getViewEndDate();
    
    console.log('📅 Loading appointments from', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
    
    const res = await appointmentApi.getByDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    
    console.log('📅 API response:', res);
    
    let appointments = (res && res.success ? res.data : res) || [];
    
    // Normalize dates - MariaDB returns Date objects, convert to strings
    appointments = appointments.map(apt => {
      let dateStr = apt.date;
      if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
      } else if (typeof dateStr === 'string' && dateStr.includes(' ')) {
        dateStr = dateStr.split(' ')[0];
      } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }
      
      let timeStr = apt.time;
      if (timeStr && typeof timeStr !== 'string') {
        timeStr = String(timeStr);
      }
      
      return {
        ...apt,
        date: dateStr,
        time: timeStr
      };
    });
    
    console.log('📅 Normalized appointments:', appointments.length, appointments);
    
    calendarAppointments = appointments;
    
    // Update team member counts
    updateTeamMemberCounts();
    
    // Update quick stats
    updateQuickStats();
    
    // Update today's appointments list
    updateTodayAppointmentsList();
    
    // Update present patients from waiting room
    updatePresentPatientsFromWaitingRoom();
    
  } catch (error) {
    console.error('Error loading calendar appointments:', error);
    calendarAppointments = [];
  }
}

// Get view start date
function getViewStartDate() {
  const date = new Date(currentCalendarDate);
  if (currentCalendarView === 'week') {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Start from Monday
    date.setDate(diff);
  } else if (currentCalendarView === 'month') {
    date.setDate(1);
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

// Get view end date
function getViewEndDate() {
  const date = new Date(currentCalendarDate);
  if (currentCalendarView === 'week') {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? 0 : 7);
    date.setDate(diff);
  } else if (currentCalendarView === 'month') {
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
  }
  date.setHours(23, 59, 59, 999);
  return date;
}

// Update team member appointment counts
function updateTeamMemberCounts() {
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = calendarAppointments.filter(a => a.date === today);
  
  // Count by user (would need userId in appointments)
  // For now, show total
  const counts = {};
  todayAppointments.forEach(apt => {
    const userId = apt.userId || 'default';
    counts[userId] = (counts[userId] || 0) + 1;
  });
  
  document.querySelectorAll('.team-member').forEach(el => {
    const userId = el.dataset.userId;
    const countEl = document.getElementById(`count-user-${userId}`);
    if (countEl) {
      countEl.textContent = counts[userId] || 0;
    }
  });
}

// Update quick stats
function updateQuickStats() {
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = calendarAppointments.filter(a => a.date === today);
  
  const total = todayAppointments.length;
  const completed = todayAppointments.filter(a => a.status === 'completed').length;
  const pending = todayAppointments.filter(a => a.status === 'pending' || !a.status).length;
  
  const statToday = document.getElementById('stat-today-count');
  const statPending = document.getElementById('stat-pending-count');
  const statCompleted = document.getElementById('stat-completed-count');
  
  if (statToday) statToday.textContent = total;
  if (statPending) statPending.textContent = pending;
  if (statCompleted) statCompleted.textContent = completed;
}

// Update present patients from waiting room
async function updatePresentPatientsFromWaitingRoom() {
  try {
    const waitingRoom = await appointmentApi.getWaitingRoomToday();
    const presentPatients = Array.isArray(waitingRoom) 
      ? waitingRoom.filter(p => p.status === 'waiting' || p.status === 'in-consultation')
      : [];
    
    const presentCount = document.getElementById('present-count');
    const presentList = document.getElementById('present-patients-list');
    
    if (presentCount) {
      presentCount.textContent = `(${presentPatients.length})`;
    }
    
    if (presentList) {
      if (presentPatients.length === 0) {
        presentList.innerHTML = '<p class="text-muted">Aucun patient présent</p>';
      } else {
        presentList.innerHTML = presentPatients.map(p => {
          const statusIcon = p.status === 'in-consultation' ? '👨‍⚕️' : '⏳';
          const statusClass = p.status === 'in-consultation' ? 'in-consultation' : 'waiting';
          const arrivalTime = p.arrivalTime ? new Date(p.arrivalTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
          return `
            <div class="present-patient-item ${statusClass}">
              <span class="patient-status-icon">${statusIcon}</span>
              <div class="patient-info">
                <span class="patient-name">${p.lastName || ''} ${p.firstName || ''}</span>
                <span class="patient-arrival">Arrivée: ${arrivalTime}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (error) {
    console.error('Error updating present patients:', error);
  }
}

// Update today's appointments list in right panel
function updateTodayAppointmentsList(searchTerm = '') {
  const todayAppointments = getAppointmentsForDate(getTodayDateString(), searchTerm);
  
  const listContainer = document.getElementById('today-appointments-list');
  if (!listContainer) return;
  
  if (todayAppointments.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted);">
        <p>${searchTerm ? 'Aucun résultat trouvé' : 'Aucun rendez-vous aujourd\'hui'}</p>
      </div>
    `;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(todayAppointments.length / TODAY_APPOINTMENTS_PAGE_SIZE));
  if (todayAppointmentsPage > totalPages) todayAppointmentsPage = totalPages;
  if (todayAppointmentsPage < 1) todayAppointmentsPage = 1;

  const startIndex = (todayAppointmentsPage - 1) * TODAY_APPOINTMENTS_PAGE_SIZE;
  const pageRows = todayAppointments.slice(startIndex, startIndex + TODAY_APPOINTMENTS_PAGE_SIZE);
  
  const cardsHtml = pageRows.map((apt, index) => {
    const typeClass = getAppointmentTypeClass(apt.type);
    const statusClass = getAppointmentStatusClass(apt.status);
    return `
      <div class="appointment-mini-item ${typeClass}" data-appointment-id="${apt.id}" data-patient-name="${apt.patientName || ''}" data-apt-type="${apt.type || ''}">
        <div class="apt-index">${startIndex + index + 1}</div>
        <div class="apt-timing">
          <span class="apt-time">⏰ ${apt.time}</span>
          <span class="apt-status ${statusClass}">${formatCalendarAppointmentStatus(apt.status)}</span>
        </div>
        <div class="apt-info">
          <span class="apt-patient">👤 ${apt.patientName || 'Patient'}</span>
          <span class="apt-type">${apt.type || 'Consultation'}</span>
        </div>
      </div>
    `;
  }).join('');

  const paginationHtml = totalPages > 1
    ? `
      <div class="list-pagination">
        <div class="list-pagination-info">${startIndex + 1}-${Math.min(startIndex + TODAY_APPOINTMENTS_PAGE_SIZE, todayAppointments.length)} / ${todayAppointments.length}</div>
        <div class="list-pagination-actions">
          <button class="btn btn-small btn-secondary" ${todayAppointmentsPage <= 1 ? 'disabled' : ''} onclick="changeTodayAppointmentsPage(-1)">◀</button>
          <span class="list-pagination-info">${todayAppointmentsPage}/${totalPages}</span>
          <button class="btn btn-small btn-secondary" ${todayAppointmentsPage >= totalPages ? 'disabled' : ''} onclick="changeTodayAppointmentsPage(1)">▶</button>
        </div>
      </div>
    `
    : '';

  listContainer.innerHTML = `${cardsHtml}${paginationHtml}`;
}

// Filter today's appointments list by search term
function filterTodayAppointmentsList(searchTerm) {
  todayAppointmentsPage = 1;
  updateTodayAppointmentsList(searchTerm);
}

function changeTodayAppointmentsPage(direction) {
  todayAppointmentsPage += direction;
  const searchTerm = document.getElementById('calendar-patient-search')?.value || '';
  updateTodayAppointmentsList(searchTerm);
}

// Get CSS class for appointment type
function getAppointmentTypeClass(type) {
  if (!type) return 'consultation';
  const normalizedType = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const typeMap = {
    'consultation': 'consultation',
    'reeducation': 'reeducation',
    'controle': 'controle',
    'kinesitherapie': 'kine',
    'ergotherapie': 'ergo',
    'orthophonie': 'ortho',
    'bilan': 'bilan',
    'suivi': 'suivi',
    'urgence': 'urgence'
  };
  return typeMap[normalizedType] || 'consultation';
}

function getAppointmentStatusClass(status) {
  const normalized = String(status || 'scheduled').toLowerCase();
  const map = {
    scheduled: 'is-scheduled',
    pending: 'is-pending',
    confirmed: 'is-confirmed',
    completed: 'is-completed',
    cancelled: 'is-cancelled',
    no_show: 'is-cancelled'
  };
  return map[normalized] || 'is-scheduled';
}

function formatCalendarAppointmentStatus(status) {
  const labels = {
    scheduled: 'planifié',
    pending: 'en attente',
    confirmed: 'confirmé',
    completed: 'terminé',
    cancelled: 'annulé',
    no_show: 'absent'
  };
  return labels[String(status || 'scheduled').toLowerCase()] || String(status || 'planifié');
}

// Get color for appointment type
function getAppointmentTypeColor(type) {
  if (!type) return '#3b82f6';
  const normalizedType = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const colorMap = {
    'consultation': '#ef4444',
    'reeducation': '#f59e0b',
    'controle': '#10b981',
    'kinesitherapie': '#8b5cf6',
    'ergotherapie': '#06b6d4',
    'orthophonie': '#ec4899',
    'bilan': '#6366f1',
    'suivi': '#14b8a6',
    'urgence': '#dc2626'
  };
  return colorMap[normalizedType] || '#3b82f6';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCalendarDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string' && value.includes(' ')) {
    return value.split(' ')[0];
  }
  if (typeof value === 'string' && value.includes('T')) {
    return value.split('T')[0];
  }
  return String(value);
}

function normalizeTimeValue(value) {
  if (!value) return '09:00';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '09:00';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function floorToHalfHourSlot(timeValue) {
  const [hours, minutes] = normalizeTimeValue(timeValue).split(':').map(Number);
  const slotMinutes = minutes >= 30 ? 30 : 0;
  return `${String(hours).padStart(2, '0')}:${String(slotMinutes).padStart(2, '0')}`;
}

function buildHalfHourSlots(startHour = 7, endHour = 20) {
  const slots = [];
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

function getAgendaCardClass(type) {
  const normalizedType = String(type || 'consultation')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalizedType.includes('reeducation')) return 'c-green';
  if (normalizedType.includes('controle')) return 'c-orange';
  if (normalizedType.includes('kinesitherapie')) return 'c-violet';
  if (normalizedType.includes('ergotherapie') || normalizedType.includes('orthophonie')) return 'c-pink';
  return 'c-blue';
}

function createAgendaCardMarkup(appointment, extraCount = 0) {
  const patientName = escapeHtml(appointment.patientName || 'Patient');
  const timeValue = escapeHtml(normalizeTimeValue(appointment.time));
  const typeValue = escapeHtml(appointment.type || 'Consultation');
  const moreText = extraCount > 0
    ? `<div class="time">+${extraCount} autre${extraCount > 1 ? 's' : ''}</div>`
    : '';

  return `
    <div class="rdv-card agenda-rdv-card ${getAgendaCardClass(appointment.type)}" data-appointment-id="${appointment.id}" draggable="true">
      <div class="name">${patientName}</div>
      <div class="time">${timeValue} · ${typeValue}</div>
      ${moreText}
    </div>
  `;
}

function getCurrentCalendarDateString() {
  return currentCalendarDate.toISOString().split('T')[0];
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

function getAppointmentsForDate(dateString, searchTerm = '') {
  let appointments = calendarAppointments
    .filter((appointment) => normalizeCalendarDate(appointment.date) === dateString)
    .sort((a, b) => normalizeTimeValue(a.time).localeCompare(normalizeTimeValue(b.time)));

  if (!searchTerm) {
    return appointments;
  }

  const normalizedSearch = String(searchTerm).trim().toLowerCase();
  return appointments.filter((appointment) => {
    const patientName = String(appointment.patientName || '').toLowerCase();
    const aptType = String(appointment.type || '').toLowerCase();
    const reason = String(appointment.reason || '').toLowerCase();
    return patientName.includes(normalizedSearch) || aptType.includes(normalizedSearch) || reason.includes(normalizedSearch);
  });
}

async function moveCalendarAppointment(appointmentId, newDate, newTime) {
  const appointment = calendarAppointments.find((item) => String(item.id) === String(appointmentId));
  if (!appointment) {
    return;
  }

  const conflictResult = await appointmentApi.checkConflict(newDate, newTime, appointmentId);
  if (conflictResult.success && conflictResult.hasConflict) {
    if (window.showNotification) {
      window.showNotification('Conflit de rendez-vous détecté', 'warning');
    } else {
      alert('Conflit de rendez-vous détecté');
    }
    return;
  }

  const updateResult = await appointmentApi.update(appointmentId, {
    date: newDate,
    time: normalizeTimeValue(newTime),
    reason: appointment.reason,
    status: appointment.status,
    notes: appointment.notes,
    source: appointment.source || appointment.bookingSource || 'manual'
  });

  if (!updateResult?.success) {
    throw new Error(updateResult?.error || 'Impossible de déplacer le rendez-vous');
  }

  eventBus.emit('appointment:updated', { appointmentId });

  if (window.showNotification) {
    window.showNotification('Rendez-vous déplacé', 'success');
  }

  await refreshCalendar();
}

function renderDailyAppointmentsModal(searchTerm = '') {
  const listContainer = document.getElementById('daily-appointments-list');
  const title = document.getElementById('daily-appointments-title');
  if (!listContainer) return;

  const selectedDate = new Date(getTodayDateString()).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  if (title) {
    title.textContent = `Planning du ${selectedDate}`;
  }

  const appointments = getAppointmentsForDate(getTodayDateString(), searchTerm);
  if (!appointments.length) {
    listContainer.innerHTML = `
      <div class="daily-appointments-empty">
        ${searchTerm ? 'Aucun rendez-vous trouvé pour cette recherche.' : 'Aucun rendez-vous prévu sur cette journée.'}
      </div>
    `;
    return;
  }

  listContainer.innerHTML = appointments.map((appointment, index) => `
    <button type="button" class="daily-appointment-row" data-appointment-id="${appointment.id}">
      <span class="daily-appointment-index">${index + 1}</span>
      <div class="daily-appointment-main">
        <div class="daily-appointment-heading">
          <span class="daily-appointment-time">${escapeHtml(normalizeTimeValue(appointment.time))}</span>
          <span class="daily-appointment-badge">${escapeHtml(formatCalendarAppointmentStatus(appointment.status))}</span>
        </div>
        <div class="daily-appointment-patient">${escapeHtml(appointment.patientName || 'Patient')}</div>
        <div class="daily-appointment-meta">${escapeHtml(appointment.type || 'Consultation')} · ${escapeHtml(appointment.reason || 'Sans motif')}</div>
      </div>
      <span class="daily-appointment-open">Ouvrir</span>
    </button>
  `).join('');
}

function openDailyAppointmentsModal() {
  const searchInput = document.getElementById('daily-appointments-search');
  if (searchInput) {
    searchInput.value = '';
  }
  renderDailyAppointmentsModal();
  if (window.showModal) {
    window.showModal('modal-daily-appointments');
  } else {
    document.getElementById('modal-daily-appointments')?.classList.add('active');
  }
}

// Setup calendar event listeners
function setupCalendarEventListeners() {
  if (calendarListenersBound) return;
  calendarListenersBound = true;

  // Navigation buttons
  document.getElementById('btn-calendar-prev')?.addEventListener('click', () => {
    navigateCalendar(-1);
  });
  
  document.getElementById('btn-calendar-next')?.addEventListener('click', () => {
    navigateCalendar(1);
  });
  
  document.getElementById('btn-calendar-today')?.addEventListener('click', () => {
    currentCalendarDate = new Date();
    refreshCalendar();
  });
  
  // View tabs
  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCalendarView = btn.dataset.view;
      refreshCalendar();
    });
  });
  
  // Team member toggle
  document.getElementById('team-list')?.addEventListener('click', (e) => {
    const memberEl = e.target.closest('.team-member');
    if (memberEl) {
      toggleTeamMember(memberEl);
    }
  });
  
  // New appointment button
  document.getElementById('btn-new-appointment-calendar')?.addEventListener('click', () => {
    openNewAppointmentModal();
  });
  
  // Search patients
  document.getElementById('calendar-patient-search')?.addEventListener('input', (e) => {
    searchPatientsForCalendar(e.target.value);
  });

  document.getElementById('today-appointments-list')?.addEventListener('click', (e) => {
    const appointmentEl = e.target.closest('.appointment-mini-item');
    if (!appointmentEl) return;
    const appointmentId = appointmentEl.dataset.appointmentId;
    if (appointmentId) {
      openAppointmentDetails(appointmentId);
    }
  });

  document.getElementById('daily-appointments-list')?.addEventListener('click', (e) => {
    const appointmentEl = e.target.closest('.daily-appointment-row');
    if (!appointmentEl) return;
    const appointmentId = appointmentEl.dataset.appointmentId;
    if (appointmentId) {
      closeModal('modal-daily-appointments');
      openAppointmentDetails(appointmentId);
    }
  });

  document.getElementById('daily-appointments-search')?.addEventListener('input', (e) => {
    renderDailyAppointmentsModal(e.target.value);
  });

  document.getElementById('calendar-category-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.saveAppointmentCategory?.();
    }
    if (e.key === 'Escape') {
      toggleCalendarCategoryForm(false);
    }
  });
  
  // Calendar grid appointment clicks
  const grid = document.getElementById('appointments-calendar-view');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const emptySlot = e.target.closest('.agenda-slot-cell.is-empty');
      if (emptySlot) {
        openNewAppointmentModal(emptySlot.dataset.date, emptySlot.dataset.time);
        return;
      }

      const agendaCard = e.target.closest('.agenda-rdv-card');
      if (agendaCard) {
        const aptId = agendaCard.dataset.appointmentId;
        if (aptId) {
          openAppointmentDetails(aptId);
        }
        return;
      }

      const aptEl = e.target.closest('.calendar-appointment');
      if (aptEl) {
        const aptId = aptEl.dataset.appointmentId;
        openAppointmentDetails(aptId);
      }
    });

    // Drag and Drop
    grid.addEventListener('dragover', (e) => {
      const targetCell = e.target.closest('.agenda-slot-cell');
      if (currentCalendarView === 'day' && targetCell) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.agenda-slot-cell.is-drop-target').forEach((cell) => cell.classList.remove('is-drop-target'));
        targetCell.classList.add('is-drop-target');
        return;
      }

      if (currentCalendarView !== 'day') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });

    grid.addEventListener('drop', async (e) => {
      e.preventDefault();
      const aptId = e.dataTransfer.getData('text/plain');
      document.querySelectorAll('.agenda-slot-cell.is-drop-target').forEach((cell) => cell.classList.remove('is-drop-target'));

      if (currentCalendarView === 'day') {
        const targetCell = e.target.closest('.agenda-slot-cell');
        if (!targetCell?.dataset.time) {
          return;
        }

        try {
          await moveCalendarAppointment(aptId, targetCell.dataset.date || getCurrentCalendarDateString(), targetCell.dataset.time);
        } catch (error) {
          console.error('Error moving appointment in day view:', error);
          showNotification('Erreur lors du déplacement du rendez-vous', 'error');
        }
        return;
      }

      try {
        const rect = grid.getBoundingClientRect();
        const offsetY = e.clientY - rect.top + grid.scrollTop;
        const pixelsPerMinute = 80 / 60;
        const totalMinutes = Math.floor(offsetY / pixelsPerMinute);
        const hour = Math.floor(totalMinutes / 60) + 7;
        const minutes = totalMinutes % 60;
        const roundedMinutes = Math.round(minutes / 15) * 15;
        const newTime = `${String(hour).padStart(2, '0')}:${String(roundedMinutes % 60).padStart(2, '0')}`;

        let newDate = getCurrentCalendarDateString();
        if (currentCalendarView === 'week') {
          const offsetX = e.clientX - rect.left;
          const colWidth = rect.width / 7;
          const dayIndex = Math.floor(offsetX / colWidth);
          const startOfWeek = getViewStartDate();
          const date = new Date(startOfWeek);
          date.setDate(date.getDate() + dayIndex);
          newDate = date.toISOString().split('T')[0];
        }

        await moveCalendarAppointment(aptId, newDate, newTime);
      } catch (error) {
        console.error('Error moving appointment:', error);
        showNotification('Erreur lors du déplacement du rendez-vous', 'error');
      }
    });

    grid.addEventListener('dragleave', (e) => {
      const targetCell = e.target.closest('.agenda-slot-cell');
      if (targetCell) {
        targetCell.classList.remove('is-drop-target');
      }
    });

    grid.addEventListener('dragstart', (e) => {
      const agendaCard = e.target.closest('.agenda-rdv-card');
      if (!agendaCard) return;
      e.dataTransfer.setData('text/plain', agendaCard.dataset.appointmentId);
      e.dataTransfer.effectAllowed = 'move';
      agendaCard.classList.add('dragging');
    });

    grid.addEventListener('dragend', (e) => {
      const agendaCard = e.target.closest('.agenda-rdv-card');
      if (agendaCard) {
        agendaCard.classList.remove('dragging');
      }
      document.querySelectorAll('.agenda-slot-cell.is-drop-target').forEach((cell) => cell.classList.remove('is-drop-target'));
    });
  }
  
  // View buttons in left panel
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Handle view change (list, calendar, etc.)
    });
  });
}

// Navigate calendar
function navigateCalendar(direction) {
  if (currentCalendarView === 'day') {
    currentCalendarDate.setDate(currentCalendarDate.getDate() + direction);
  } else if (currentCalendarView === 'week') {
    currentCalendarDate.setDate(currentCalendarDate.getDate() + (7 * direction));
  } else if (currentCalendarView === 'month') {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
  }
  refreshCalendar();
}

// Toggle team member filter
function toggleTeamMember(memberEl) {
  const userId = memberEl.dataset.userId;
  const isChecked = memberEl.dataset.checked === 'true';
  
  if (isChecked) {
    memberEl.dataset.checked = 'false';
    memberEl.classList.add('inactive');
    selectedTeamMembers = selectedTeamMembers.filter(id => id !== userId);
  } else {
    memberEl.dataset.checked = 'true';
    memberEl.classList.remove('inactive');
    selectedTeamMembers.push(userId);
  }
  
  renderCalendar();
}

// Refresh calendar
async function refreshCalendar() {
  await loadCalendarAppointments();
  renderCalendar();
}

// Render calendar based on current view
function renderCalendar() {
  updateCalendarHeader();
  const timeColumn = document.getElementById('calendar-time-column');
  if (timeColumn) {
    timeColumn.innerHTML = generateTimeSlots();
  }
  const gridContainer = document.querySelector('.calendar-grid-container');
  gridContainer?.classList.remove('month-view', 'day-table-mode');
  
  if (currentCalendarView === 'day') {
    renderDayView();
  } else if (currentCalendarView === 'week') {
    renderWeekView();
  } else if (currentCalendarView === 'month') {
    renderMonthView();
  }
}

// Update calendar header with current date
function updateCalendarHeader() {
  const titleEl = document.getElementById('calendar-period-title');
  if (!titleEl) return;
  
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  
  if (currentCalendarView === 'day') {
    titleEl.textContent = currentCalendarDate.toLocaleDateString('fr-FR', options);
  } else if (currentCalendarView === 'week') {
    const startOfWeek = getViewStartDate();
    const endOfWeek = getViewEndDate();
    titleEl.textContent = `${startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${endOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else if (currentCalendarView === 'month') {
    titleEl.textContent = currentCalendarDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
}

// Render day view
function renderDayView() {
  const gridContainer = document.getElementById('appointments-calendar-view');
  const timeColumn = document.getElementById('calendar-time-column');
  const dayHeader = document.getElementById('calendar-day-header');
  const gridWrapper = document.querySelector('.calendar-grid-container');

  if (!gridContainer || !gridWrapper) return;

  const currentDateStr = currentCalendarDate.toISOString().split('T')[0];

  const dayAppointments = calendarAppointments.filter(a => {
    return normalizeCalendarDate(a.date) === currentDateStr;
  });

  const slotMap = new Map();
  buildHalfHourSlots().forEach((slot) => slotMap.set(slot, []));
  dayAppointments
    .sort((a, b) => normalizeTimeValue(a.time).localeCompare(normalizeTimeValue(b.time)))
    .forEach((appointment) => {
      const slotKey = floorToHalfHourSlot(appointment.time);
      if (slotMap.has(slotKey)) {
        slotMap.get(slotKey).push(appointment);
      }
    });

  if (dayHeader) {
    dayHeader.style.display = 'none';
    dayHeader.innerHTML = '';
  }

  if (timeColumn) {
    timeColumn.style.display = 'none';
    timeColumn.innerHTML = '';
  }

  gridWrapper.classList.add('day-table-mode');

  const rowsHtml = buildHalfHourSlots().map((slot, index) => {
    const appointments = slotMap.get(slot) || [];
    const isHalfHour = slot.endsWith(':30');
    const hourLabel = slot.endsWith(':00') ? slot : '';

    let slotCells = '';
    if (appointments.length === 0) {
      slotCells = `
        <td class="agenda-slot-cell is-empty" data-date="${currentDateStr}" data-time="${slot}"></td>
        <td class="agenda-slot-cell is-empty" data-date="${currentDateStr}" data-time="${slot}"></td>
      `;
    } else {
      slotCells = `
        <td class="agenda-slot-cell" colspan="2" data-date="${currentDateStr}" data-time="${slot}">
          <div class="agenda-slot-multi">
            ${appointments.map((appointment) => createAgendaCardMarkup(appointment)).join('')}
          </div>
        </td>
      `;
    }

    return `
      <tr class="agenda-slot-row ${isHalfHour ? 'is-half-hour' : 'is-full-hour'}" data-slot-index="${index}">
        <td class="agenda-hour-cell">${hourLabel}</td>
        ${slotCells}
      </tr>
    `;
  }).join('');

  gridContainer.innerHTML = `
    <table class="agenda-day-table" aria-label="Agenda jour">
      <thead>
        <tr>
          <th class="agenda-table-head agenda-hour-head">Heure</th>
          <th class="agenda-table-head">Créneau 1</th>
          <th class="agenda-table-head">Créneau 2</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

// Calculate positions for overlapping appointments
function calculateOverlappingPositions(appointments) {
  if (!appointments.length) return [];
  
  // Convert time to minutes for easier comparison
  const getMinutes = (timeStr) => {
    const [h, m] = (timeStr || '09:00').split(':').map(Number);
    return h * 60 + (m || 0);
  };
  
  // Sort by start time
  const sorted = [...appointments].sort((a, b) => getMinutes(a.time) - getMinutes(b.time));
  
  // Find overlapping groups
  const groups = [];
  let currentGroup = [];
  let groupEndTime = 0;
  
  sorted.forEach(apt => {
    const startTime = getMinutes(apt.time);
    const endTime = startTime + (apt.duration || 30);
    
    if (startTime < groupEndTime) {
      // Overlaps with current group
      currentGroup.push(apt);
      groupEndTime = Math.max(groupEndTime, endTime);
    } else {
      // Start new group
      if (currentGroup.length) groups.push(currentGroup);
      currentGroup = [apt];
      groupEndTime = endTime;
    }
  });
  if (currentGroup.length) groups.push(currentGroup);
  
  // Assign columns within each group
  const result = [];
  groups.forEach(group => {
    const totalColumns = group.length;
    group.forEach((apt, idx) => {
      result.push({
        ...apt,
        column: idx,
        totalColumns: totalColumns
      });
    });
  });
  
  return result;
}

// Render week view
function renderWeekView() {
  const gridContainer = document.getElementById('appointments-calendar-view');
  const dayHeader = document.getElementById('calendar-day-header');
  const timeColumn = document.getElementById('calendar-time-column');
  document.querySelector('.calendar-grid-container')?.classList.remove('day-table-mode');
  if (!gridContainer || !dayHeader) return;

  if (timeColumn) {
    timeColumn.style.display = '';
  }
  
  const startOfWeek = getViewStartDate();
  
  // Reset grid display for week view
  dayHeader.style.display = 'grid';
  dayHeader.style.gridTemplateColumns = '86px repeat(7, 1fr)';
  
  // Generate day headers
  dayHeader.innerHTML = '<div class="calendar-day-corner">Heure</div>';
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + i);
    const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
    
    dayHeader.innerHTML += `
      <div class="day-header-cell ${isToday ? 'today' : ''}" data-date="${date.toISOString().split('T')[0]}">
        <div>${date.toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
        <div style="font-size: 18px; font-weight: 600;">${date.getDate()}</div>
      </div>
    `;
  }
  
  // Render appointments in grid with overlap handling
  gridContainer.innerHTML = '';
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayAppointments = calendarAppointments.filter(a => a.date === dateStr);
    
    const dayColumn = document.createElement('div');
    dayColumn.className = 'calendar-day-column';
    dayColumn.style.cssText = `
      position: absolute;
      left: ${(i * 100 / 7)}%;
      width: ${100 / 7}%;
      height: 100%;
    `;
    
    // Calculate overlapping positions for this day
    const positionedAppointments = calculateOverlappingPositions(dayAppointments);
    
    positionedAppointments.forEach(apt => {
      const aptElement = createAppointmentElement(apt, apt.column, apt.totalColumns);
      // For week view, adjust width within the day column
      if (apt.totalColumns > 1) {
        const colWidth = 100 / apt.totalColumns;
        aptElement.style.left = `${apt.column * colWidth}%`;
        aptElement.style.width = `${colWidth - 2}%`;
        aptElement.style.right = 'auto';
      } else {
        aptElement.style.left = '2px';
        aptElement.style.right = '2px';
        aptElement.style.width = 'auto';
      }
      dayColumn.appendChild(aptElement);
    });
    
    gridContainer.appendChild(dayColumn);
  }
}

// Render month view
function renderMonthView() {
  // Simplified month view
  const gridContainer = document.getElementById('appointments-calendar-view');
  const dayHeader = document.getElementById('calendar-day-header');
  const timeColumn = document.getElementById('calendar-time-column');
  if (!gridContainer) return;
  document.querySelector('.calendar-grid-container')?.classList.add('month-view');
  document.querySelector('.calendar-grid-container')?.classList.remove('day-table-mode');

  if (timeColumn) {
    timeColumn.style.display = 'none';
  }
  
  // Hide day header in month view - show day names instead
  if (dayHeader) {
    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    dayHeader.innerHTML = dayNames.map(day => 
      `<div class="day-header-cell" style="text-align: center; font-weight: 600; font-size: 14px; padding: 10px;">${day}</div>`
    ).join('');
    dayHeader.style.display = 'grid';
    dayHeader.style.gridTemplateColumns = 'repeat(7, 1fr)';
  }
  
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday = 0
  
  let html = '<div class="month-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; height: 100%;">';
  
  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    html += '<div style="background: #f5f5f5; border-radius: 8px;"></div>';
  }
  
  // Days of month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayAppointments = calendarAppointments.filter(a => a.date === dateStr);
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    
    // Calculate overlapping for month view display
    const positioned = calculateOverlappingPositions(dayAppointments);
    const hasOverlap = positioned.some(a => a.totalColumns > 1);
    
    html += `
      <div class="month-day-cell" style="border: 1px solid #eee; border-radius: 8px; padding: 8px; min-height: 80px; cursor: pointer; ${isToday ? 'background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);' : 'background: #fff;'}" data-date="${dateStr}">
        <div style="font-weight: 700; font-size: 22px; ${isToday ? 'color: #1976D2;' : 'color: #333;'}">${day}</div>
        ${dayAppointments.length > 0 ? `<div style="font-size: 12px; font-weight: 600; color: var(--primary-color); margin-top: 4px;">${dayAppointments.length} RDV${hasOverlap ? ' ⚠️' : ''}</div>` : ''}
      </div>
    `;
  }
  
  html += '</div>';
  gridContainer.innerHTML = html;
  
  // Click handler for month cells
  gridContainer.querySelectorAll('.month-day-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      currentCalendarDate = new Date(cell.dataset.date);
      currentCalendarView = 'day';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tab-btn[data-view="day"]')?.classList.add('active');
      refreshCalendar();
    });
  });
}

// Create appointment element for grid
function createAppointmentElement(apt, column = 0, totalColumns = 1) {
  const el = document.createElement('div');
  const typeClass = getAppointmentTypeClass(apt.type);
  const typeColor = getAppointmentTypeColor(apt.type);
  el.className = `calendar-appointment ${typeClass}`;
  el.dataset.appointmentId = apt.id;
  
  // Make draggable
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', apt.id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
  });
  
  // Calculate position based on time
  const timeParts = (apt.time || '09:00').split(':');
  const hour = parseInt(timeParts[0]);
  const minutes = parseInt(timeParts[1] || 0);
  const startMinutes = (hour - 7) * 60 + minutes; // Starting from 07:00
  const duration = apt.duration || 30;
  
  // 80px per hour (40px per 30min slot)
  const pixelsPerMinute = 80 / 60;
  
  el.style.top = `${startMinutes * pixelsPerMinute}px`; 
  el.style.height = `${Math.max(duration * pixelsPerMinute, 30)}px`;
  el.style.borderLeftColor = typeColor;
  el.style.backgroundColor = typeColor + '15'; // Add transparency
  
  // Handle overlapping appointments - position side by side
  if (totalColumns > 1) {
    const columnWidth = 100 / totalColumns;
    el.style.left = `${column * columnWidth}%`;
    el.style.width = `${columnWidth - 1}%`; // Small gap between columns
    el.style.right = 'auto';
  }
  
  el.innerHTML = `
    <div class="apt-name" style="color: ${typeColor};">${apt.patientName || 'Patient'}</div>
    <div class="apt-time">${apt.time || ''} - ${apt.type || 'Consultation'}</div>
  `;
  
  return el;
}

// Generate time slots HTML
function generateTimeSlots() {
  let html = '';
  for (let hour = 7; hour < 20; hour++) {
    const h = String(hour).padStart(2, '0');
    const hNext = String(hour + 1).padStart(2, '0');
    html += `<div class="time-slot">${h}:00 - ${h}:30</div>`;
    html += `<div class="time-slot half-hour">${h}:30 - ${hNext}:00</div>`;
  }
  return html;
}

// Open new appointment modal
async function openNewAppointmentModal(date = null, time = null) {
  const modalId = 'modal-appointment';
  const modal = document.getElementById(modalId);
  
  if (modal) {
    const form = document.getElementById('appointment-form');
    if (form) {
      form.reset();
    }

    const printTicketCheckbox = document.getElementById('appointment-print-ticket');
    if (printTicketCheckbox) {
      printTicketCheckbox.checked = true;
    }

    try {
      initSearchablePatientSelect(
        'appointment-patient-search',
        'appointment-patient-select',
        'appointment-patient-dropdown',
        {
          minChars: 1,
          placeholder: 'Tapez la premiere lettre du patient...',
          emptyMessage: 'Tapez la premiere lettre du patient',
          loadingMessage: 'Recherche des patients...',
          noResultsMessage: 'Aucun patient commence par cette recherche',
          selectedPatientId: typeof currentPatientId !== 'undefined' ? currentPatientId || '' : '',
          selectedPatientName: currentPatientData ? `${currentPatientData.lastName || ''} ${currentPatientData.firstName || ''}`.trim() : '',
          onSelect: (patient) => {
            const patientIdInput = document.getElementById('appointment-patientId');
            if (patientIdInput) {
              patientIdInput.value = patient?.id || '';
            }
          }
        }
      );

      const patientIdInput = document.getElementById('appointment-patientId');
      if (patientIdInput) {
        patientIdInput.value = typeof currentPatientId !== 'undefined' ? currentPatientId || '' : '';
      }
    } catch (error) {
      console.error('Error preparing patient search for appointment:', error);
    }
    
    // Use global showModal if available, otherwise manual class manipulation
    if (window.showModal) {
      window.showModal(modalId);
    } else {
      modal.classList.remove('hidden');
      modal.classList.add('active');
    }
    
    // Set date if provided
    const dateInput = document.getElementById('appointment-date');
    if (dateInput) {
      if (date) {
        dateInput.value = date;
      } else {
        dateInput.value = currentCalendarDate.toISOString().split('T')[0];
      }
    }
    
    // Set default time to next slot
    const timeInput = document.getElementById('appointment-time');
    if (timeInput) {
      if (time) {
        timeInput.value = normalizeTimeValue(time);
      } else {
        const now = new Date();
        const nextHour = now.getHours() + 1;
        timeInput.value = `${String(nextHour).padStart(2, '0')}:00`;
      }
    }
  }
}

// Open appointment details
async function openAppointmentDetails(appointmentId) {
  try {
    const aptResult = await appointmentApi.getById(appointmentId);
    if (aptResult?.success && aptResult.data?.patientId) {
      // Navigate to patient and show appointment
      await showPatientDetails(aptResult.data.patientId);
      // Could also open an edit modal here
    }
  } catch (error) {
    console.error('Error opening appointment details:', error);
  }
}

// Search patients for calendar
async function searchPatientsForCalendar(query) {
  if (!query || query.length < 2) return;
  
  try {
    const patients = await appointmentApi.searchPatients(query);
    // Could show a dropdown with results
    console.log('Found patients:', patients);
  } catch (error) {
    console.error('Error searching patients:', error);
  }
}

function openCategoryModal() {
  toggleCalendarCategoryForm();
}

function saveAppointmentCategory() {
  const nameInput = document.getElementById('calendar-category-name');
  const colorInput = document.getElementById('calendar-category-color');
  const normalizedName = nameInput?.value?.trim();
  const color = colorInput?.value?.trim() || '#0f5fa8';

  if (!normalizedName) {
    showNotification('❌ Merci d’indiquer le nom de la catégorie', 'error');
    return;
  }

  const categories = getAppointmentCategories();
  if (categories.some((category) => category.name.toLowerCase() === normalizedName.toLowerCase())) {
    showNotification('❌ Cette catégorie existe déjà', 'error');
    return;
  }

  categories.push({ name: normalizedName, color });
  setAppointmentCategories(categories);
  renderAppointmentCategories();
  if (nameInput) nameInput.value = '';
  if (colorInput) colorInput.value = '#0f5fa8';
  toggleCalendarCategoryForm(false);
  showNotification('✅ Catégorie ajoutée', 'success');
}

// Change calendar view
function changeCalendarView(view) {
  currentCalendarView = view;
  
  // Update active buttons
  document.querySelectorAll('.view-btn, .tab-btn').forEach(btn => {
    if (btn.dataset.view === view || btn.textContent.toLowerCase().includes(view === 'workweek' ? 'travail' : view === 'timeline' ? 'chronologie' : view)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Special handling for tab buttons text matching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    const text = btn.textContent.trim().toLowerCase();
    if (view === 'day' && text === 'jour') btn.classList.add('active');
    if (view === 'week' && text === 'semaine') btn.classList.add('active');
    if (view === 'workweek' && text === 'semaine de travail') btn.classList.add('active');
    if (view === 'month' && text === 'mois') btn.classList.add('active');
    if (view === 'timeline' && text === 'chronologie') btn.classList.add('active');
  });

  refreshCalendar();
}

// ========== SEARCHABLE PATIENT SELECT ==========

/**
 * Initialize a searchable patient select dropdown
 * @param {string} searchInputId - ID of the text input for searching
 * @param {string} hiddenInputId - ID of the hidden input that stores the selected patient ID
 * @param {string} dropdownId - ID of the dropdown container
 * @param {Array} patients - Array of patient objects with id, firstName, lastName
 */

// ========== LAZY PATIENT SEARCH OVERRIDE ==========

const patientSearchLabelCache = new Map();
const patientSearchResultCache = new Map();

function normalizePatientSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getPatientDisplayLabel(patient) {
  return `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim() || 'Patient';
}

function storePatientSearchRecord(patient) {
  if (!patient?.id) return '';
  const label = getPatientDisplayLabel(patient);
  patientSearchLabelCache.set(String(patient.id), label);
  return label;
}

function normalizePatientSearchResponse(result) {
  if (Array.isArray(result)) return result;
  if (result?.success && Array.isArray(result.data)) return result.data;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function patientStartsWithSearch(patient, rawSearchTerm) {
  const searchTerm = normalizePatientSearchText(rawSearchTerm);
  if (!searchTerm) return false;

  const candidates = [
    patient?.lastName,
    patient?.firstName,
    `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim(),
    `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
    patient?.phone,
    patient?.socialSecurityNumber,
    patient?.email
  ];

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizePatientSearchText(candidate);
    if (!normalizedCandidate) return false;
    if (normalizedCandidate.startsWith(searchTerm)) return true;
    return normalizedCandidate.split(/\s+/).some((part) => part.startsWith(searchTerm));
  });
}

async function resolvePatientDisplayLabel(patientId, fallbackLabel = '') {
  const normalizedId = String(patientId || '').trim();
  if (!normalizedId) return '';

  if (fallbackLabel) {
    patientSearchLabelCache.set(normalizedId, fallbackLabel);
    return fallbackLabel;
  }

  const cachedLabel = patientSearchLabelCache.get(normalizedId);
  if (cachedLabel) {
    return cachedLabel;
  }

  try {
    const result = await appointmentApi.getPatient(normalizedId);
    const patient = result?.success ? result.data : null;
    if (!patient) return '';
    return storePatientSearchRecord(patient);
  } catch (error) {
    console.error('Error resolving patient display label:', error);
    return '';
  }
}

async function searchPatientsByPrefix(searchTerm, staticPatients = null) {
  const normalizedTerm = normalizePatientSearchText(searchTerm);
  if (!normalizedTerm) {
    return [];
  }

  if (Array.isArray(staticPatients)) {
    return staticPatients.filter((patient) => patientStartsWithSearch(patient, normalizedTerm));
  }

  if (patientSearchResultCache.has(normalizedTerm)) {
    return patientSearchResultCache.get(normalizedTerm);
  }

  try {
    const result = await appointmentApi.searchPatients({
      searchTerm: normalizedTerm,
      limit: 50
    });
    const patients = normalizePatientSearchResponse(result)
      .filter((patient) => patientStartsWithSearch(patient, normalizedTerm));
    patients.forEach(storePatientSearchRecord);
    patientSearchResultCache.set(normalizedTerm, patients);
    return patients;
  } catch (error) {
    console.error('Error searching patients:', error);
    return [];
  }
}

function createPatientSearchMessage(dropdown, message) {
  if (!dropdown) return;
  dropdown.innerHTML = '';
  const messageEl = document.createElement('div');
  messageEl.className = 'searchable-select-no-results';
  messageEl.textContent = message;
  dropdown.appendChild(messageEl);
}

function getPatientFieldElements(valueInput) {
  if (!valueInput) return { searchInput: null, dropdown: null };
  const searchInput = document.getElementById(valueInput.dataset.patientSearchInputId || '');
  const dropdown = document.getElementById(valueInput.dataset.patientSearchDropdownId || '');
  return { searchInput, dropdown };
}

function applyPatientFieldValue(valueInput, patientId, patientName = '', options = {}) {
  if (!valueInput) return;

  const normalizedId = String(patientId || '').trim();
  const cachedLabel = normalizedId ? (patientName || patientSearchLabelCache.get(normalizedId) || '') : '';
  const commitSelection = options.commit !== false;
  const shouldTriggerChange = options.triggerChange === true;
  const shouldUpdateSearchInput = options.updateSearchInput !== false;
  const { searchInput, dropdown } = getPatientFieldElements(valueInput);

  if (valueInput.tagName === 'SELECT') {
    const placeholderText = valueInput.dataset.patientPlaceholderOption || '-- Selectionner un patient --';
    valueInput.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholderText;
    valueInput.appendChild(placeholderOption);

    if (normalizedId) {
      const patientOption = document.createElement('option');
      patientOption.value = normalizedId;
      patientOption.textContent = cachedLabel || 'Patient';
      patientOption.selected = true;
      valueInput.appendChild(patientOption);
    }

    valueInput.value = normalizedId;
  } else {
    valueInput.value = normalizedId;
  }

  if (searchInput && shouldUpdateSearchInput) {
    searchInput.value = cachedLabel;
    if (commitSelection) {
      searchInput.dataset.committedPatientId = normalizedId;
      searchInput.dataset.committedPatientName = cachedLabel;
    }
  } else if (searchInput && commitSelection) {
    searchInput.dataset.committedPatientId = normalizedId;
    searchInput.dataset.committedPatientName = cachedLabel;
  }

  if (commitSelection) {
    valueInput.dataset.committedPatientId = normalizedId;
    valueInput.dataset.committedPatientName = cachedLabel;
  }

  if (dropdown) {
    dropdown.classList.remove('active');
  }

  if (shouldTriggerChange) {
    valueInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function setLazyPatientFieldValue(valueInputId, patientId, patientName = '', options = {}) {
  const valueInput = document.getElementById(valueInputId);
  if (!valueInput) return;

  applyPatientFieldValue(valueInput, patientId, patientName, options);

  if (!patientId || patientName) {
    return;
  }

  const resolvedLabel = await resolvePatientDisplayLabel(patientId, patientName);
  if (!resolvedLabel) return;
  applyPatientFieldValue(valueInput, patientId, resolvedLabel, {
    ...options,
    triggerChange: false
  });
}

function renderPatientDropdown(dropdownId, patients) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;

  const valueInputId = dropdown.dataset.patientValueInputId || dropdownId.replace('-dropdown', '-select');
  const valueInput = document.getElementById(valueInputId);
  const { searchInput } = getPatientFieldElements(valueInput);
  if (!valueInput || !searchInput) return;

  renderAppointmentPatientOptions({
    dropdown,
    patients,
    onSelect: (patient, patientName) => {
      storePatientSearchRecord(patient);
      setLazyPatientFieldValue(valueInput.id, patient.id, patientName, {
        triggerChange: valueInput.tagName === 'SELECT'
      });
      if (typeof searchInput._patientSearchOnSelect === 'function') {
        searchInput._patientSearchOnSelect(patient);
      }
    }
  });
}

function initSearchablePatientSelect(searchInputId, valueInputId, dropdownId, configOrPatients = {}) {
  const originalInput = document.getElementById(searchInputId);
  const valueInput = document.getElementById(valueInputId);
  const dropdown = document.getElementById(dropdownId);

  if (!originalInput || !valueInput || !dropdown) return;

  patientSearchResultCache.clear();

  const options = Array.isArray(configOrPatients)
    ? { staticPatients: configOrPatients }
    : (configOrPatients || {});
  const minChars = Math.max(1, Number(options.minChars || 1));
  const clearOnInput = options.clearOnInput !== false;
  const restoreCommittedOnBlur = options.restoreCommittedOnBlur === true;

  const searchInput = originalInput.cloneNode(true);
  originalInput.parentNode.replaceChild(searchInput, originalInput);
  searchInput.placeholder = options.placeholder || searchInput.placeholder || 'Tapez la premiere lettre du patient...';
  searchInput._patientSearchOnSelect = typeof options.onSelect === 'function' ? options.onSelect : null;

  valueInput.dataset.patientSearchInputId = searchInput.id;
  valueInput.dataset.patientSearchDropdownId = dropdownId;
  dropdown.dataset.patientValueInputId = valueInputId;
  searchInput.dataset.patientValueInputId = valueInputId;
  searchInput.dataset.patientDropdownId = dropdownId;

  let debounceTimer = null;
  let searchRequestId = 0;

  const closeDropdown = () => {
    dropdown.classList.remove('active');
  };

  const restoreCommittedSelection = () => {
    const committedId = searchInput.dataset.committedPatientId || valueInput.dataset.committedPatientId || '';
    const committedName = searchInput.dataset.committedPatientName || valueInput.dataset.committedPatientName || '';
    if (!restoreCommittedOnBlur || !committedId) return;
    if (valueInput.value) return;
    if (!searchInput.value.trim()) return;
    applyPatientFieldValue(valueInput, committedId, committedName, { commit: true, triggerChange: false });
  };

  const runSearch = async (rawTerm) => {
    const currentRequestId = ++searchRequestId;
    const value = String(rawTerm || '').trim();

    if (value.length < minChars) {
      if (options.hideWhenEmpty) {
        dropdown.innerHTML = '';
        closeDropdown();
        return;
      }
      dropdown.classList.add('active');
      createPatientSearchMessage(dropdown, options.emptyMessage || 'Tapez la premiere lettre du patient');
      return;
    }

    dropdown.classList.add('active');
    createPatientSearchMessage(dropdown, options.loadingMessage || 'Recherche des patients...');

    const patients = await searchPatientsByPrefix(value, options.staticPatients || null);
    if (currentRequestId !== searchRequestId) return;

    renderPatientDropdown(dropdownId, patients);
    if (!patients.length) {
      createPatientSearchMessage(dropdown, options.noResultsMessage || 'Aucun patient commence par cette recherche');
    }
  };

  searchInput.addEventListener('focus', () => {
    const currentValue = searchInput.value.trim();
    if (currentValue.length >= minChars) {
      runSearch(currentValue);
      return;
    }
    if (options.hideWhenEmpty) {
      dropdown.innerHTML = '';
      closeDropdown();
      return;
    }
    dropdown.classList.add('active');
    createPatientSearchMessage(dropdown, options.emptyMessage || 'Tapez la premiere lettre du patient');
  });

  searchInput.addEventListener('input', (event) => {
    if (clearOnInput) {
      applyPatientFieldValue(valueInput, '', '', {
        commit: false,
        triggerChange: false,
        updateSearchInput: false
      });
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runSearch(event.target.value);
    }, Number(options.debounceMs || 150));
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      restoreCommittedSelection();
      closeDropdown();
    }, 180);
  });

  searchInput.addEventListener('keydown', (event) => {
    const optionElements = Array.from(dropdown.querySelectorAll('.searchable-select-option'));
    const highlighted = dropdown.querySelector('.searchable-select-option.highlighted');

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!highlighted && optionElements.length) {
        optionElements[0].classList.add('highlighted');
        return;
      }
      if (highlighted?.nextElementSibling) {
        highlighted.classList.remove('highlighted');
        highlighted.nextElementSibling.classList.add('highlighted');
        highlighted.nextElementSibling.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (highlighted?.previousElementSibling) {
        highlighted.classList.remove('highlighted');
        highlighted.previousElementSibling.classList.add('highlighted');
        highlighted.previousElementSibling.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted) {
        highlighted.click();
      }
    } else if (event.key === 'Escape') {
      closeDropdown();
      searchInput.blur();
    }
  });

  if (options.hideWhenEmpty) {
    dropdown.innerHTML = '';
    closeDropdown();
  } else {
    createPatientSearchMessage(dropdown, options.emptyMessage || 'Tapez la premiere lettre du patient');
  }

  if (options.selectedPatientId) {
    setLazyPatientFieldValue(valueInputId, options.selectedPatientId, options.selectedPatientName || '', {
      triggerChange: false
    });
  } else {
    applyPatientFieldValue(valueInput, '', '', { commit: true, triggerChange: false });
  }
}

function attachLazyPatientSearchToSelect(selectId, config = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;

  patientSearchResultCache.clear();

  const wrapperId = `${selectId}-lazy-patient-wrapper`;
  const searchInputId = `${selectId}-lazy-patient-search`;
  const dropdownId = `${selectId}-lazy-patient-dropdown`;
  let wrapper = document.getElementById(wrapperId);

  if (!select.dataset.patientPlaceholderOption) {
    const placeholderOption = Array.from(select.options || []).find((option) => option.value === '');
    select.dataset.patientPlaceholderOption = placeholderOption?.textContent || '-- Selectionner un patient --';
  }

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = wrapperId;
    wrapper.className = 'searchable-select-container lazy-patient-select-wrapper';
    wrapper.dataset.lazyPatientWrapperFor = selectId;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = searchInputId;
    searchInput.autocomplete = 'off';
    searchInput.className = ['form-control', 'searchable-select-input', ...Array.from(select.classList)].join(' ').trim();
    searchInput.placeholder = config.placeholder || 'Tapez la premiere lettre du patient...';

    const dropdown = document.createElement('div');
    dropdown.id = dropdownId;
    dropdown.className = 'searchable-select-dropdown';

    wrapper.appendChild(searchInput);
    wrapper.appendChild(dropdown);
    select.insertAdjacentElement('afterend', wrapper);
  }

  select.classList.add('lazy-patient-select-native');
  select.setAttribute('tabindex', '-1');

  document.querySelectorAll(`label[for="${selectId}"]`).forEach((label) => {
    label.setAttribute('for', searchInputId);
  });

  initSearchablePatientSelect(searchInputId, selectId, dropdownId, {
    ...config,
    clearOnInput: config.clearOnInput !== false,
    restoreCommittedOnBlur: config.restoreCommittedOnBlur === true
  });
}

registerLegacyGlobals('appointments', {
  attachLazyPatientSearchToSelect,
  changeCalendarView,
  changeTodayAppointmentsPage,
  initCalendar,
  initSearchablePatientSelect,
  navigateCalendar,
  openCategoryModal,
  openDailyAppointmentsModal,
  openNewAppointmentModal,
  openQuickAppointmentModal: openNewAppointmentModal,
  refreshCalendar,
  removeAppointmentCategory,
  renderPatientDropdown,
  resolvePatientDisplayLabel,
  saveAppointmentCategory,
  setLazyPatientFieldValue
});

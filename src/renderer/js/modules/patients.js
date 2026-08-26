import { patientApi } from '../../features/patients/patient-api.js';
import { patientState } from '../../features/patients/patient-state.js';
import { renderPatientRows } from '../../features/patients/patient-list.js';
import { collectPatientFormData } from '../../features/patients/patient-form.js';
import { eventBus } from '../../core/state/event-bus.js';
import { registerLegacyGlobals } from '../../core/legacy/legacy-bridge.js';

// ========== PATIENTS ==========
const PATIENTS_PAGE_SIZE = 10;
const ASSISTANT_DIRECTORY_PAGE_SIZE = 500;
let patientsFilteredData = [];
let patientsSearchTerm = '';
let patientsPagination = {
  page: 1,
  pageSize: PATIENTS_PAGE_SIZE,
  total: 0,
  totalPages: 1
};
let patientsCurrentPage = 1;
let patientsView = 'mine';
let patientsScope = null;
let selectedPatientsDoctorId = '';
let patientsListFilterDoctorId = '';
let selectedPatientIds = new Set();
let appointmentHistoryPatientId = '';

function isDirectorUser() {
  return false;
}

function createPatientActionButtons(patientId) {
  if (isDirectorUser()) {
    return '<span style="color: #999; font-size: 13px;">Lecture seule</span>';
  }

  return `
    <div class="patients-table-actions">
      <button class="btn btn-small btn-primary patient-table-action" onclick="editPatient('${patientId}')">Modifier</button>
      <button class="btn btn-small btn-danger patient-table-action" onclick="deletePatient('${patientId}')">Supprimer</button>
    </div>
  `;
}

function isMultiPractitionerActive() {
  if (typeof getCabinetType === 'function' && getCabinetType() === 'single') {
    return false;
  }
  if (typeof getEnabledPracticeSpecialties === 'function' && getEnabledPracticeSpecialties().length <= 1) {
    return false;
  }
  return patientsScope?.multiPractitioner === true && patientsScope?.cabinetMode === true;
}

function renderPatientsRows(patients) {
  const tbody = document.getElementById('patients-tbody');
  if (!tbody) return;
  const isMulti = isMultiPractitionerActive();
  const isAssistant = currentUserRole === 'assistant';
  const thSelect = document.getElementById('patients-th-select');
  if (thSelect) thSelect.style.display = isAssistant ? '' : 'none';

  renderPatientRows({
    tbody,
    patients,
    readOnly: isDirectorUser(),
    onOpen: (id) => window.showPatientDetails?.(id),
    onEdit: editPatient,
    onDelete: deletePatient,
    onAttach: attachPatientToCurrentDoctor,
    onDetach: detachPatientFromCurrentDoctor,
    onToggleSelection: togglePatientSelection,
    onAppointment: openAppointmentForPatient,
    onAppointmentsHistory: showPatientAppointmentHistory,
    directory: isMulti && patientsView === 'directory',
    multiPractitioner: isMulti,
    selectable: isAssistant,
    assistantActions: isAssistant && isMulti && patientsView === 'directory',
    selectedPatientIds
  });
  updatePatientsBulkBar();
}

function renderPatientsScopeControls() {
  const scopeBar = document.getElementById('patients-scope-bar');
  const doctorWrap = document.getElementById('patients-doctor-scope-wrap');
  const doctorSelect = document.getElementById('patients-doctor-scope');
  const doctorSearch = document.getElementById('patients-doctor-search');
  const listFilterWrap = document.getElementById('patients-list-filter-wrap');
  const listFilter = document.getElementById('patients-list-filter');
  const mineTab = document.getElementById('patients-my-list-tab');
  const directoryTab = document.getElementById('patients-directory-tab');
  const assignmentActions = document.getElementById('patients-assignment-actions');
  const selectionCount = document.getElementById('patients-selection-count');
  const assignSelectedButton = document.getElementById('patients-assign-selected-btn');
  const fourthHeading = document.querySelector('#patients-table thead th:nth-child(4)');

  const isMulti = isMultiPractitionerActive();
  const assistantDirectoryMode = currentUserRole === 'assistant' && isMulti;
  
  if (scopeBar) {
    scopeBar.hidden = !isMulti;
    scopeBar.style.display = isMulti ? '' : 'none';
  }
  if (!isMulti) {
    if (mineTab) mineTab.style.display = 'none';
    if (directoryTab) directoryTab.style.display = 'none';
  } else {
    if (mineTab) mineTab.style.display = '';
    if (directoryTab) directoryTab.style.display = '';
  }
  if (listFilterWrap) listFilterWrap.hidden = !assistantDirectoryMode;
  if (doctorWrap) {
    doctorWrap.hidden = !(assistantDirectoryMode && (patientsScope?.practitioners?.length || 0) > 0);
  }
  if (mineTab && assistantDirectoryMode) mineTab.hidden = true;
  if (directoryTab && assistantDirectoryMode) directoryTab.textContent = 'Tous les patients';
  const showAssignmentActions = assistantDirectoryMode && patientsView === 'directory';
  if (assignmentActions) assignmentActions.hidden = !showAssignmentActions;
  if (selectionCount) selectionCount.textContent = `${selectedPatientIds.size} sélectionné${selectedPatientIds.size === 1 ? '' : 's'}`;
  if (assignSelectedButton) assignSelectedButton.disabled = selectedPatientIds.size === 0 || !selectedPatientsDoctorId;
  mineTab?.classList.toggle('active', patientsView === 'mine');
  directoryTab?.classList.toggle('active', patientsView === 'directory');
  if (fourthHeading) fourthHeading.textContent = (isMulti && patientsView === 'directory') ? 'Médecins' : 'Numéro SS';

  if (doctorSelect && patientsScope?.practitioners) {
    doctorSelect.innerHTML = patientsScope.practitioners.map((doctor) => {
      const name = doctor.fullName || doctor.username || 'Médecin';
      return `<option value="${doctor.id}">${name}</option>`;
    }).join('');
    doctorSelect.value = selectedPatientsDoctorId;
    const selectedDoctor = patientsScope.practitioners.find((doctor) => doctor.id === selectedPatientsDoctorId);
    if (doctorSearch && document.activeElement !== doctorSearch) {
      doctorSearch.value = formatPractitionerName(selectedDoctor);
    }
    setupDoctorSearch();
  }

  if (listFilter && patientsScope?.practitioners) {
    listFilter.replaceChildren();
    const cabinetOption = document.createElement('option');
    cabinetOption.value = '';
    cabinetOption.textContent = 'Cabinet — tous les patients';
    listFilter.appendChild(cabinetOption);
    patientsScope.practitioners.forEach((doctor) => {
      const option = document.createElement('option');
      option.value = doctor.id;
      option.textContent = formatPractitionerName(doctor);
      listFilter.appendChild(option);
    });
    listFilter.value = patientsListFilterDoctorId;
  }
}

function formatPractitionerName(doctor) {
  if (!doctor) return '';
  const name = String(doctor.fullName || '').trim() || String(doctor.username || '').trim();
  return name ? `Dr. ${name}` : 'Médecin';
}

function renderDoctorSearchResults(query = '') {
  const dropdown = document.getElementById('patients-doctor-dropdown');
  if (!dropdown || !patientsScope?.practitioners) return;
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  const doctors = patientsScope.practitioners.filter((doctor) => {
    const searchable = `${doctor.fullName || ''} ${doctor.username || ''}`.toLocaleLowerCase();
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });
  dropdown.replaceChildren();
  if (!doctors.length) {
    dropdown.appendChild(Object.assign(document.createElement('div'), {
      className: 'searchable-select-no-results', textContent: 'Aucun médecin trouvé'
    }));
  } else {
    doctors.forEach((doctor) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `searchable-select-option${doctor.id === selectedPatientsDoctorId ? ' selected' : ''}`;
      option.textContent = formatPractitionerName(doctor);
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', async () => {
        const search = document.getElementById('patients-doctor-search');
        if (search) search.value = formatPractitionerName(doctor);
        dropdown.classList.remove('active');
        await changePatientsDoctorScope(doctor.id);
      });
      dropdown.appendChild(option);
    });
  }
  dropdown.classList.add('active');
}

function setupDoctorSearch() {
  const search = document.getElementById('patients-doctor-search');
  const dropdown = document.getElementById('patients-doctor-dropdown');
  if (!search || !dropdown || search.dataset.bound) return;
  search.addEventListener('input', () => renderDoctorSearchResults(search.value));
  search.addEventListener('focus', () => renderDoctorSearchResults(search.value));
  search.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('active'), 150));
  search.dataset.bound = '1';
}

async function ensurePatientsScope() {
  try {
    const result = await patientApi.getScope({ doctorId: selectedPatientsDoctorId });
    if (result?.success && result?.data) {
      patientsScope = result.data;
      const isMulti = isMultiPractitionerActive();
      if (!selectedPatientsDoctorId) selectedPatientsDoctorId = result.data.selectedDoctorId || '';
      if (!isMulti) {
        patientsView = 'mine';
      } else if (currentUserRole === 'assistant' && result.data.multiPractitioner) {
        patientsView = 'directory';
      }
      window.activePatientDoctorId = selectedPatientsDoctorId;
      renderPatientsScopeControls();
    }
  } catch (err) {
    console.warn('Patient scope retrieval notice:', err);
  }
}

async function switchPatientsView(view) {
  patientsView = view === 'directory' ? 'directory' : 'mine';
  patientsSearchTerm = '';
  selectedPatientIds.clear();
  const search = document.getElementById('patients-search');
  if (search) search.value = '';
  renderPatientsScopeControls();
  await loadPatients(1);
}

async function changePatientsDoctorScope(doctorId) {
  selectedPatientsDoctorId = doctorId || '';
  selectedPatientIds.clear();
  window.activePatientDoctorId = selectedPatientsDoctorId;
  await loadPatients(1);
}

async function changePatientsListFilter(doctorId) {
  patientsListFilterDoctorId = doctorId || '';
  selectedPatientIds.clear();
  await loadPatients(1);
}

async function attachPatientToCurrentDoctor(patientId) {
  const result = await patientApi.attach({ patientId, doctorId: selectedPatientsDoctorId });
  if (!result.success) return showNotification(`Erreur: ${result.error}`, 'error');
  showNotification('Patient ajouté à la liste', 'success');
  await loadPatients(patientsCurrentPage);
}

async function openAppointmentForPatient(patientId) {
  const patient = await window.setSelectedPatient?.(patientId, { source: 'patients-directory' });
  if (!patient) return showNotification('Impossible de sélectionner ce patient', 'error');
  await window.openNewAppointmentModal?.();
}

async function showPatientAppointmentHistory(patientId) {
  const modal = document.getElementById('modal-patient-appointment-history');
  const title = document.getElementById('patient-appointment-history-title');
  const tbody = document.getElementById('patient-appointment-history-tbody');
  if (!modal || !tbody) return;

  appointmentHistoryPatientId = patientId;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center">Chargement...</td></tr>';
  showModal('modal-patient-appointment-history');

  try {
    const [patientResult, appointmentsResult] = await Promise.all([
      patientApi.getById(patientId),
      patientApi.getAppointments(patientId)
    ]);
    if (!appointmentsResult.success) throw new Error(appointmentsResult.error || 'Chargement impossible');

    const patient = patientResult.success ? patientResult.data : null;
    if (title) {
      const name = `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim();
      title.textContent = name ? `Rendez-vous de ${name}` : 'Historique des rendez-vous';
    }

    const appointments = Array.isArray(appointmentsResult.data) ? appointmentsResult.data : [];
    tbody.replaceChildren();
    if (!appointments.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'text-center empty-row';
      cell.textContent = 'Aucun rendez-vous pour ce patient';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    const statusLabels = {
      scheduled: 'Planifié', pending: 'En attente', confirmed: 'Confirmé',
      completed: 'Terminé', cancelled: 'Annulé', no_show: 'Absent'
    };
    appointments.forEach((appointment) => {
      const row = document.createElement('tr');
      const statusKey = String(appointment.status || 'scheduled').toLowerCase();
      const values = [
        appointment.date ? formatDateToDDMMYYYY(appointment.date) : '-',
        appointment.time || '-',
        appointment.type || 'Consultation',
        appointment.reason || '-'
      ];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });

      const statusCell = document.createElement('td');
      const status = document.createElement('span');
      status.className = `appointment-status-pill appointment-status-pill-${statusKey.replace(/[^a-z0-9_-]/g, '-')}`;
      status.textContent = statusLabels[statusKey] || appointment.status || 'Planifié';
      statusCell.appendChild(status);
      row.appendChild(statusCell);

      const actionCell = document.createElement('td');
      const ticketButton = document.createElement('button');
      ticketButton.type = 'button';
      ticketButton.className = 'btn btn-small btn-secondary';
      ticketButton.textContent = 'Ticket';
      ticketButton.addEventListener('click', () => window.printAppointmentTicket?.(appointment.id));
      actionCell.appendChild(ticketButton);
      row.appendChild(actionCell);
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error('Erreur historique RDV patient:', error);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center empty-row">Impossible de charger les rendez-vous</td></tr>';
    showNotification(error.message || 'Erreur lors du chargement des rendez-vous', 'error');
  }
}

async function openAppointmentForHistoryPatient() {
  if (!appointmentHistoryPatientId) return;
  closeModal('modal-patient-appointment-history');
  await openAppointmentForPatient(appointmentHistoryPatientId);
}

function togglePatientSelection(patientId, isSelected) {
  if (isSelected) selectedPatientIds.add(patientId);
  else selectedPatientIds.delete(patientId);
  updatePatientsBulkBar();
  renderPatientsScopeControls();
}

function toggleSelectAllPatients(isChecked) {
  const patients = Array.isArray(patientsFilteredData) ? patientsFilteredData : [];
  if (isChecked) {
    patients.forEach(p => { if (p && p.id) selectedPatientIds.add(p.id); });
  } else {
    selectedPatientIds.clear();
  }
  const checkboxes = document.querySelectorAll('.patient-row-select');
  checkboxes.forEach(cb => cb.checked = isChecked);
  updatePatientsBulkBar();
}
window.toggleSelectAllPatients = toggleSelectAllPatients;

function clearPatientSelection() {
  selectedPatientIds.clear();
  const selectAll = document.getElementById('patients-select-all');
  if (selectAll) selectAll.checked = false;
  const checkboxes = document.querySelectorAll('.patient-row-select');
  checkboxes.forEach(cb => cb.checked = false);
  updatePatientsBulkBar();
}
window.clearPatientSelection = clearPatientSelection;

function updatePatientsBulkBar() {
  const bulkBar = document.getElementById('patients-bulk-bar');
  const countSpan = document.getElementById('patients-bulk-count');
  const selectAll = document.getElementById('patients-select-all');
  const doctorSelect = document.getElementById('patients-bulk-doctor-select');
  
  const count = selectedPatientIds.size;
  if (!bulkBar) return;

  if (count > 0 && currentUserRole === 'assistant') {
    bulkBar.style.display = 'flex';
    if (countSpan) countSpan.textContent = `${count} patient${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`;
    
    // Populate doctor select if not populated
    if (doctorSelect && patientsScope?.practitioners && doctorSelect.children.length === 0) {
      doctorSelect.innerHTML = '<option value="">-- Sélectionner le médecin --</option>' +
        patientsScope.practitioners.map(d => `<option value="${d.id}">${formatPractitionerName(d)}</option>`).join('');
    }
  } else {
    bulkBar.style.display = 'none';
  }

  const patients = Array.isArray(patientsFilteredData) ? patientsFilteredData : [];
  if (selectAll && patients.length > 0) {
    selectAll.checked = patients.every(p => selectedPatientIds.has(p.id));
  }
}
window.updatePatientsBulkBar = updatePatientsBulkBar;

async function assignSelectedPatientsToDoctor() {
  const patientIds = [...selectedPatientIds];
  const doctorSelect = document.getElementById('patients-bulk-doctor-select');
  const targetDoctorId = doctorSelect ? doctorSelect.value : '';

  if (!targetDoctorId) {
    showNotification('Veuillez sélectionner un médecin destinataire', 'warning');
    return;
  }
  if (!patientIds.length) {
    showNotification('Veuillez sélectionner au moins un patient', 'warning');
    return;
  }

  try {
    const results = await Promise.all(patientIds.map(patientId =>
      window.api.patient.assignMedecin({ patientId, medecinId: targetDoctorId })
    ));
    const failed = results.filter(r => !r || !r.success);
    if (failed.length) {
      showNotification(`Erreur lors de l'assignation de certains patients: ${failed[0]?.error || 'Échec'}`, 'error');
    } else {
      const selectedDoctor = (patientsScope?.practitioners || []).find(d => d.id === targetDoctorId);
      const doctorName = selectedDoctor ? formatPractitionerName(selectedDoctor) : 'le médecin';
      showNotification(`✅ ${patientIds.length} patient${patientIds.length > 1 ? 's' : ''} assigné${patientIds.length > 1 ? 's' : ''} au ${doctorName}`, 'success');
    }
    clearPatientSelection();
    await loadPatients(patientsCurrentPage);
  } catch (err) {
    console.error('Erreur assignation groupée:', err);
    showNotification('Erreur lors de l\'assignation groupée', 'error');
  }
}
window.assignSelectedPatientsToDoctor = assignSelectedPatientsToDoctor;

async function assignSelectedPatientsToCurrentDoctor() {
  const patientIds = [...selectedPatientIds];
  if (!selectedPatientsDoctorId || !patientIds.length) return;

  const results = await Promise.all(patientIds.map((patientId) => (
    patientApi.attach({ patientId, doctorId: selectedPatientsDoctorId })
  )));
  const failed = results.filter((result) => !result.success);
  if (failed.length) {
    showNotification(`Erreur: ${failed[0].error || 'certains patients n’ont pas été ajoutés'}`, 'error');
  } else {
    showNotification(`${patientIds.length} patient${patientIds.length === 1 ? '' : 's'} ajouté${patientIds.length === 1 ? '' : 's'} à la liste du médecin`, 'success');
  }
  selectedPatientIds.clear();
  await loadPatients(patientsCurrentPage);
}

async function detachPatientFromCurrentDoctor(patientId) {
  if (!confirm('Retirer ce patient de cette liste ? Son dossier global sera conservé.')) return;
  const result = await patientApi.detach({ patientId, doctorId: selectedPatientsDoctorId });
  if (!result.success) return showNotification(`Erreur: ${result.error}`, 'error');
  showNotification('Patient retiré de la liste', 'success');
  await loadPatients(patientsCurrentPage);
}

function renderPatientsPagination() {
  const container = document.getElementById('patients-pagination');
  if (!container) return;

  const total = Number(patientsPagination.total || 0);
  const currentPage = Math.min(Math.max(1, Number(patientsPagination.page || 1)), Math.max(1, Number(patientsPagination.totalPages || 1)));
  const totalPages = Math.max(1, Number(patientsPagination.totalPages || 1));

  if (total <= patientsPagination.pageSize) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const start = total > 0 ? ((currentPage - 1) * patientsPagination.pageSize) + 1 : 0;
  const end = total > 0 ? Math.min(currentPage * patientsPagination.pageSize, total) : 0;

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="patients-pagination-info">Affichage ${start}-${end} sur ${total} patients</div>
    <div class="patients-pagination-actions pagination-controls">
      <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${patientsCurrentPage <= 1 ? 'disabled' : ''} onclick="changePatientsPage(-1)">‹</button>
      <span class="patients-pagination-info">${patientsCurrentPage}/${totalPages}</span>
      <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${patientsCurrentPage >= totalPages ? 'disabled' : ''} onclick="changePatientsPage(1)">›</button>
    </div>
  `;
}

function renderPatientsPage() {
  if (!patientsFilteredData.length) {
    renderPatientsRows([]);
    renderPatientsPagination();
    return;
  }

  renderPatientsRows(patientsFilteredData);
  renderPatientsPagination();
}

function setPatientsData(rows = [], pagination = null) {
  patientsFilteredData = Array.isArray(rows) ? rows : [];

  if (pagination) {
    patientsPagination = {
      page: Number(pagination.page || 1),
      pageSize: Number(pagination.pageSize || PATIENTS_PAGE_SIZE),
      total: Number(pagination.total || 0),
      totalPages: Math.max(1, Number(pagination.totalPages || 1))
    };
    patientsCurrentPage = patientsPagination.page;
  } else {
    patientsPagination = {
      page: 1,
      pageSize: PATIENTS_PAGE_SIZE,
      total: patientsFilteredData.length,
      totalPages: Math.max(1, Math.ceil(patientsFilteredData.length / PATIENTS_PAGE_SIZE))
    };
    patientsCurrentPage = 1;
  }

  renderPatientsPage();
}

async function changePatientsPage(direction) {
  const totalPages = Math.max(1, Number(patientsPagination.totalPages || 1));
  const nextPage = Math.min(totalPages, Math.max(1, Number(patientsPagination.page || 1) + direction));
  if (nextPage === patientsPagination.page) return;
  await loadPatients(nextPage);
}

async function loadPatients(page = 1) {
  // If we already have patients loaded in memory, render immediately so user sees 0ms delay
  if (Array.isArray(patientsFilteredData) && patientsFilteredData.length > 0 && !patientsSearchTerm && page === patientsCurrentPage) {
    renderPatientsPage();
  }

  const requestVersion = patientState.beginRequest();
  try {
    const scopePromise = patientsScope ? Promise.resolve() : ensurePatientsScope();
    const loader = patientsView === 'directory' ? patientApi.getDirectory : patientApi.getAll;
    const pageSize = patientsView === 'directory' && currentUserRole === 'assistant'
      ? ASSISTANT_DIRECTORY_PAGE_SIZE
      : PATIENTS_PAGE_SIZE;
    
    let result = null;
    try {
      const [_, apiResult] = await Promise.all([
        scopePromise,
        loader({
          searchTerm: patientsSearchTerm,
          page,
          pageSize,
          paginated: true,
          doctorId: selectedPatientsDoctorId,
          filterDoctorId: patientsListFilterDoctorId
        })
      ]);
      result = apiResult;
    } catch (apiErr) {
      console.warn('Initial loader call failed, trying fallback:', apiErr);
    }

    // If primary loader returned failure or threw, try directory as resilient fallback
    if ((!result || !result.success) && patientsView !== 'directory') {
      try {
        result = await patientApi.getDirectory({
          searchTerm: patientsSearchTerm,
          page,
          pageSize,
          paginated: true
        });
      } catch (fallbackErr) {
        console.warn('Directory fallback also failed:', fallbackErr);
      }
    }

    // Ignore les réponses périmées : une recherche plus récente a déjà pris le dessus
    if (!patientState.isCurrent(requestVersion)) {
      return;
    }

    if (result && result.success) {
      if ((patientsView === 'mine' || patientsView === 'my-patients') && (!result.data || result.data.length === 0) && !patientsSearchTerm) {
        try {
          const dirRes = await patientApi.getDirectory({ searchTerm: patientsSearchTerm, page, pageSize, paginated: true });
          if (!patientState.isCurrent(requestVersion)) {
            return;
          }
          if (dirRes && dirRes.success && dirRes.data && dirRes.data.length > 0) {
            result = dirRes;
          }
        } catch (_) {}
      }
      patientState.setPatients(result.data || [], result.pagination);
      setPatientsData(result.data || [], result.pagination);
    } else if (result && !result.success) {
      console.warn('Patient loading returned unsuccessful status:', result.error);
      if (!patientsFilteredData || !patientsFilteredData.length) {
        setPatientsData([], null);
      }
    } else if (!patientsFilteredData || !patientsFilteredData.length) {
      setPatientsData([], null);
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement des patients:', error);
    if (!patientsFilteredData || !patientsFilteredData.length) {
      setPatientsData([], null);
    }
  } finally {
    patientState.finishRequest(requestVersion);
  }
}

function getActivePatientDetailsTabId() {
  return document.querySelector('#patient-details .tab-content.active')?.id || null;
}

async function searchPatients(term = '') {
  try {
    patientsSearchTerm = String(term || '').trim();
    if (!patientsSearchTerm) {
      await loadPatients(1);
      return;
    }
    await loadPatients(1);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error);
  }
}

const PATIENT_PHOTO_STORAGE_PREFIX = 'medcare:patient-photo:';
const PATIENT_DRAFT_PHOTO_KEY = `${PATIENT_PHOTO_STORAGE_PREFIX}draft`;

function getPatientPhotoStorageKey(patientId) {
  return `${PATIENT_PHOTO_STORAGE_PREFIX}${patientId}`;
}

function getDefaultPatientAvatarDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
      <rect width="96" height="96" rx="24" fill="#0d9488"/>
      <circle cx="48" cy="28" r="14" fill="#ffffff"/>
      <path d="M26 74c3-16 14-26 22-26s19 10 22 26" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
      <path d="M48 38v28" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
      <path d="M35 51h26" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getPatientPhotoUrl(patientId) {
  if (!patientId) {
    return localStorage.getItem(PATIENT_DRAFT_PHOTO_KEY) || getDefaultPatientAvatarDataUri();
  }
  return localStorage.getItem(getPatientPhotoStorageKey(patientId)) || getDefaultPatientAvatarDataUri();
}

function setPatientPhotoUrl(patientId, dataUrl) {
  if (!dataUrl) return;
  if (patientId) {
    localStorage.setItem(getPatientPhotoStorageKey(patientId), dataUrl);
  } else {
    localStorage.setItem(PATIENT_DRAFT_PHOTO_KEY, dataUrl);
  }
}

function clearDraftPatientPhoto() {
  localStorage.removeItem(PATIENT_DRAFT_PHOTO_KEY);
}

function commitDraftPatientPhoto(patientId) {
  const draftPhoto = localStorage.getItem(PATIENT_DRAFT_PHOTO_KEY);
  if (draftPhoto && patientId) {
    localStorage.setItem(getPatientPhotoStorageKey(patientId), draftPhoto);
  }
  clearDraftPatientPhoto();
}

function refreshPatientPhotoUI(patientId = currentPatientId, scope = 'all') {
  const photoUrl = getPatientPhotoUrl(patientId);
  const selector = scope === 'all'
    ? '[data-patient-photo-preview]'
    : `[data-patient-photo-preview][data-photo-scope="${scope}"]`;
  const previewTargets = document.querySelectorAll(selector);
  previewTargets.forEach((img) => {
    img.src = photoUrl;
  });
}

function updatePatientAgeDisplay() {
  const ageDisplay = document.getElementById('patient-age-display');
  const dateInput = document.getElementById('patient-dateOfBirth');
  if (!ageDisplay || !dateInput) return;

  const ageYears = typeof calculatePatientAgeYears === 'function'
    ? calculatePatientAgeYears(dateInput.value)
    : null;
  ageDisplay.value = ageYears === null ? '' : `${ageYears} ans`;
}

function readPatientImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lecture image impossible'));
    reader.readAsDataURL(file);
  });
}

async function handlePatientPhotoSelection(event, patientId = currentPatientId) {
  const [file] = Array.from(event?.target?.files || []);
  if (!file) return;
  const scope = event?.target?.id === 'patient-photo-details-input' ? 'details' : 'modal';

  try {
    const dataUrl = await readPatientImageFile(file);
    setPatientPhotoUrl(patientId, dataUrl);
    refreshPatientPhotoUI(patientId, scope);

    if (patientId && typeof showPatientDetails === 'function' && document.getElementById('patient-details')?.classList.contains('active')) {
      await showPatientDetails(patientId);
    }
  } catch (error) {
    console.error('❌ Erreur photo patient:', error);
    showNotification('Erreur lors du chargement de la photo', 'error');
  } finally {
    if (event?.target) {
      event.target.value = '';
    }
  }
}

function triggerPatientPhotoPicker(context = 'modal') {
  const inputId = context === 'details' ? 'patient-photo-details-input' : 'patient-photo-input';
  document.getElementById(inputId)?.click();
}

function setupPatientModalEnhancements() {
  const dateInput = document.getElementById('patient-dateOfBirth');
  if (dateInput && !dateInput.dataset.ageBound) {
    dateInput.addEventListener('input', updatePatientAgeDisplay);
    dateInput.dataset.ageBound = '1';
  }

  const modalPhotoInput = document.getElementById('patient-photo-input');
  if (modalPhotoInput && !modalPhotoInput.dataset.bound) {
    modalPhotoInput.addEventListener('change', (event) => {
      const editingPatientId = document.getElementById('patient-form')?.dataset.editingPatientId || null;
      handlePatientPhotoSelection(event, editingPatientId);
    });
    modalPhotoInput.dataset.bound = '1';
  }

  const detailsPhotoInput = document.getElementById('patient-photo-details-input');
  if (detailsPhotoInput && !detailsPhotoInput.dataset.bound) {
    detailsPhotoInput.addEventListener('change', (event) => handlePatientPhotoSelection(event, currentPatientId));
    detailsPhotoInput.dataset.bound = '1';
  }
}

function resetSickLeaveFormFields({ prefillDates = false, documentKind = 'certificate' } = {}) {
  const form = document.getElementById('sickleave-form');
  if (form) {
    form.reset();
    delete form.dataset.editId;
    delete form.dataset.consultationId;
    form.dataset.documentKind = documentKind === 'workstop' ? 'workstop' : 'certificate';
  }

  sickLeaveRestDaysDirty = false;

  const patientInput = document.getElementById('sickleave-patient-id');
  if (patientInput) {
    patientInput.value = currentPatientId || '';
  }

  const today = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById('sickleave-start-date');
  const endInput = document.getElementById('sickleave-end-date');

  if (prefillDates) {
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;
  }

  const allowedOutingsCheckbox = document.getElementById('sickleave-allowed-outings');
  if (allowedOutingsCheckbox) {
    allowedOutingsCheckbox.checked = false;
  }

  hydrateSickLeaveTemplateFields({ careText: '', restDays: '', ippEstimate: '' });

  const daysDisplay = document.getElementById('sickleave-days-display');
  const restInput = document.getElementById('sickleave-rest-days');
  if (!prefillDates && daysDisplay) {
    daysDisplay.value = '';
  }
  if (!prefillDates && restInput) {
    restInput.value = '';
  }

  handleSickLeaveDateChange();

  if (!prefillDates && typeof updateSickLeavePreview === 'function') {
    updateSickLeavePreview();
  }

  const datesRow = document.getElementById('sickleave-dates-row');
  const daysRow = document.getElementById('sickleave-days-row');
  if (datesRow) datesRow.style.display = documentKind === 'workstop' ? 'grid' : 'none';
  if (daysRow) daysRow.style.display = documentKind === 'workstop' ? 'block' : 'none';

  const modalTitle = document.querySelector('#modal-add-sickleave .modal-header h2');
  if (modalTitle) {
    modalTitle.textContent = documentKind === 'workstop' ? 'Arrêt de travail' : 'Certificat médical';
  }

  const quickChips = document.getElementById('sickleave-quick-chips');
  if (quickChips) {
    if (documentKind === 'workstop') {
      quickChips.innerHTML = `
        <button type="button" class="btn btn-secondary btn-small" onclick="applySickLeavePreset('arret_3j')" style="font-size: 11px; height: 26px; padding: 0 8px;">Arrêt 3J</button>
        <button type="button" class="btn btn-secondary btn-small" onclick="applySickLeavePreset('arret_5j')" style="font-size: 11px; height: 26px; padding: 0 8px;">Arrêt 5J</button>
        <button type="button" class="btn btn-secondary btn-small" onclick="applySickLeavePreset('arret_7j')" style="font-size: 11px; height: 26px; padding: 0 8px;">Arrêt 7J</button>
      `;
    } else {
      quickChips.innerHTML = `
        <button type="button" class="btn btn-secondary btn-small" onclick="applySickLeavePreset('certif_soins')" style="font-size: 11px; height: 26px; padding: 0 8px;">Soins et surveillance</button>
      `;
    }
  }

  if (typeof updateSickLeaveSummary === 'function') {
    updateSickLeaveSummary();
  }

  if (typeof renderSickLeaveDocumentPreview === 'function') {
    renderSickLeaveDocumentPreview();
  }
}

function showSickLeaveForm() {
  if (!currentPatientId) {
  showNotification('Veuillez sélectionner un patient avant de créer un certificat médical', 'warning');
    showSection('patients');
    return;
  }

  resetSickLeaveFormFields({ prefillDates: true, documentKind: 'certificate' });
  if (typeof updateSickLeaveSummary === 'function') {
    updateSickLeaveSummary();
  }
  showModal('modal-add-sickleave');
}

function showWorkStopForm() {
  if (!currentPatientId) {
    showNotification('Veuillez sélectionner un patient avant de créer un arrêt de travail', 'warning');
    showSection('patients');
    return;
  }

  resetSickLeaveFormFields({ prefillDates: true, documentKind: 'workstop' });
  if (typeof updateSickLeaveSummary === 'function') {
    updateSickLeaveSummary();
  }
  showModal('modal-add-sickleave');
}

function showPatientForm() {
  if (isDirectorUser()) {
    showNotification('❌ Accès refusé: le directeur est en lecture seule sur les patients', 'error');
    return;
  }

  document.getElementById('modal-patient-title').textContent = 'Ajouter un Patient';
  document.getElementById('patient-submit-btn').textContent = 'Sauvegarder';
  const patientForm = document.getElementById('patient-form');
  patientForm.reset();
  delete patientForm.dataset.editingPatientId;
  
  if (currentUserRole === 'assistant') {
    const drContainer = document.getElementById('patient-doctor-selector-container');
    if (drContainer) drContainer.style.display = 'block';
    window.selectedDoctorSpecialty = '';
    if (typeof applyPackageRestrictionsFromCache === 'function') {
      applyPackageRestrictionsFromCache(window._packageConfig || null);
    }
    
    // Charger la liste des médecins pour l'assistant
    patientApi.getUsers({ requestingUserId: currentUserId }).then(res => {
      if (res.success) {
        const doctors = (res.data || []).filter((user) => {
          if (!user || !user.id || user.isSuperAdmin) return false;
          return user.role === 'doctor' || user.role === 'dentist';
        });
        if (doctors.length > 0 && drContainer) {
          drContainer.style.display = 'block';
        }
        const select = document.getElementById('patient-primaryDoctorId');
        if (select) {
          select.innerHTML = '<option value="">-- Sélectionner un Médecin --</option>' + 
            doctors.map((doctor) => {
              const displayName = doctor.fullName || doctor.username || 'Médecin';
              const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
                ? getPracticeSpecialtyMeta(doctor.specialty || doctor.role)
                : null;
              const specialtyLabel = specialtyMeta?.shortLabel || specialtyMeta?.label || '';
              return `<option value="${doctor.id}" data-specialty="${doctor.specialty || ''}">${displayName}${specialtyLabel ? ` (${specialtyLabel})` : ''}</option>`;
            }).join('');

          select.value = selectedPatientsDoctorId || patientsScope?.selectedDoctorId || (doctors[0]?.id || '');
          select.onchange = (event) => {
            const selectedOption = event?.target?.selectedOptions?.[0] || null;
            window.selectedDoctorSpecialty = selectedOption?.dataset?.specialty || '';
            if (typeof applyPackageRestrictionsFromCache === 'function') {
              applyPackageRestrictionsFromCache(window._packageConfig || null);
            }
          };
        }
      }
    });
  } else {
    // Cacher le sélecteur de médecin si on n'est pas assistant
    const drContainer = document.getElementById('patient-doctor-selector-container');
    if (drContainer) drContainer.style.display = 'none';
    window.selectedDoctorSpecialty = '';
  }

  clearDraftPatientPhoto();
  updatePatientAgeDisplay();
  refreshPatientPhotoUI(null, 'modal');
  showModal('modal-patient');
}

async function editPatient(patientId) {
  if (isDirectorUser()) {
    showNotification('❌ Accès refusé: le directeur ne peut pas modifier un patient', 'error');
    return;
  }

  try {
    const result = await patientApi.getById(patientId);

    if (result.success) {
      const patient = result.data;
      document.getElementById('modal-patient-title').textContent = 'Modifier un Patient';
      document.getElementById('patient-submit-btn').textContent = 'Enregistrer les modifications';
      
      // Remplir le formulaire
      document.getElementById('patient-firstName').value = patient.firstName || '';
      document.getElementById('patient-lastName').value = patient.lastName || '';
      document.getElementById('patient-dateOfBirth').value = typeof formatDateToInputValue === 'function'
        ? formatDateToInputValue(patient.dateOfBirth)
        : (patient.dateOfBirth || '');
      document.getElementById('patient-gender').value = patient.gender || '';
      document.getElementById('patient-socialSecurityNumber').value = patient.socialSecurityNumber || '';
      document.getElementById('patient-email').value = patient.email || '';
      document.getElementById('patient-phone').value = patient.phone || '';
      document.getElementById('patient-address').value = patient.address || '';
      document.getElementById('patient-city').value = patient.city || '';
      document.getElementById('patient-zipCode').value = patient.zipCode || '';
      document.getElementById('patient-bloodType').value = patient.bloodType || '';
      document.getElementById('patient-allergies').value = patient.allergies || '';
      document.getElementById('patient-medicalHistory').value = patient.medicalHistory || '';
      document.getElementById('patient-emergencyContact').value = patient.emergencyContact || '';
      document.getElementById('patient-emergencyPhone').value = patient.emergencyPhone || '';

      // Sélecteur de médecin pour l'assistant
      const drContainer = document.getElementById('patient-doctor-selector-container');
      if (currentUserRole === 'assistant') {
        if (drContainer) drContainer.style.display = 'block';
        patientApi.getUsers({ requestingUserId: currentUserId }).then(res => {
          if (res.success) {
            const doctors = (res.data || []).filter((user) => {
              if (!user || !user.id || user.isSuperAdmin) return false;
              return user.role === 'doctor' || user.role === 'dentist';
            });
            const select = document.getElementById('patient-primaryDoctorId');
            if (select) {
              select.innerHTML = '<option value="">-- Sélectionner un Médecin --</option>' + 
                doctors.map((doctor) => {
                  const displayName = doctor.fullName || doctor.username || 'Médecin';
                  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
                    ? getPracticeSpecialtyMeta(doctor.specialty || doctor.role)
                    : null;
                  const specialtyLabel = specialtyMeta?.shortLabel || specialtyMeta?.label || '';
                  return `<option value="${doctor.id}" data-specialty="${doctor.specialty || ''}">${displayName}${specialtyLabel ? ` (${specialtyLabel})` : ''}</option>`;
                }).join('');
              select.value = patient.primaryDoctorId || selectedPatientsDoctorId || '';
            }
          }
        });
      } else {
        if (drContainer) drContainer.style.display = 'none';
      }

      document.getElementById('patient-form').dataset.editingPatientId = patientId;
      updatePatientAgeDisplay();
      refreshPatientPhotoUI(patientId, 'modal');
      showModal('modal-patient');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    showNotification('Erreur lors du chargement du patient', 'error');
  }
}

async function savePatient(e) {
  e.preventDefault();

  if (isDirectorUser()) {
    showNotification('❌ Accès refusé: le directeur ne peut pas modifier un patient', 'error');
    return;
  }

  const getValue = (id) => (document.getElementById(id)?.value || '').trim();
  const editingPatientId = document.getElementById('patient-form')?.dataset.editingPatientId || null;
  const activePatientTabId = getActivePatientDetailsTabId();
  const patientDetailsVisible = document.getElementById('patient-details')?.classList.contains('active') === true;

  const patientData = collectPatientFormData();
  patientData.scopeDoctorId = selectedPatientsDoctorId;

  // Ajout du champ médecin traitant si sélectionné par un assistant
  if (currentUserRole === 'assistant') {
    const drVal = getValue('patient-primaryDoctorId') || selectedPatientsDoctorId;
    if (drVal) {
      patientData.primaryDoctorId = drVal;
    }
  }

  try {
    let result;
    let savedPatientId = editingPatientId;

    if (editingPatientId) {
      result = await patientApi.update(editingPatientId, patientData);
    } else {
      result = await patientApi.create(patientData);
      savedPatientId = result.id || null;
    }

    if (result.success) {
      if (savedPatientId) {
        commitDraftPatientPhoto(savedPatientId);
        refreshPatientPhotoUI(savedPatientId);
      }
      showNotification(
        editingPatientId ? '✅ Patient modifié' : '✅ Patient créé',
        'success'
      );
      if (!editingPatientId && currentUserRole === 'assistant') {
        window.selectedDoctorSpecialty = '';
        if (typeof applyPackageRestrictionsFromCache === 'function') {
          applyPackageRestrictionsFromCache(window._packageConfig || null);
        }
      }
      closeModal('modal-patient');
      await loadPatients();
      eventBus.emit(editingPatientId ? 'patient:updated' : 'patient:created', { patientId: savedPatientId });

      if (editingPatientId && savedPatientId && patientDetailsVisible && typeof showPatientDetails === 'function') {
        await showPatientDetails(savedPatientId);
        if (activePatientTabId && typeof switchTab === 'function') {
          switchTab(activePatientTabId);
        }
      }
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    showNotification('Erreur lors de l\'enregistrement', 'error');
  }
}

async function deletePatient(patientId) {
  if (isDirectorUser()) {
    showNotification('❌ Accès refusé: le directeur ne peut pas supprimer un patient', 'error');
    return;
  }

  if (confirm('Êtes-vous sûr de vouloir supprimer ce patient?')) {
    try {
      const result = await patientApi.delete(patientId);

      if (result.success) {
        localStorage.removeItem(getPatientPhotoStorageKey(patientId));
        showNotification('✅ Patient supprimé', 'success');
        loadPatients();
        eventBus.emit('patient:list-refreshed');
      } else {
        showNotification('❌ Erreur: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('❌ Erreur:', error);
      showNotification('Erreur lors de la suppression', 'error');
    }
  }
}

setupPatientModalEnhancements();

registerLegacyGlobals('patients', {
  changePatientsDoctorScope,
  changePatientsListFilter,
  changePatientsPage,
  assignSelectedPatientsToCurrentDoctor,
  deletePatient,
  editPatient,
  getDefaultPatientAvatarDataUri,
  getPatientPhotoUrl,
  loadPatients,
  openAppointmentForPatient,
  openAppointmentForHistoryPatient,
  showPatientAppointmentHistory,
  resetSickLeaveFormFields,
  savePatient,
  searchPatients,
  switchPatientsView,
  showPatientForm,
  showSickLeaveForm,
  showWorkStopForm,
  triggerPatientPhotoPicker,
  updatePatientAgeDisplay
});

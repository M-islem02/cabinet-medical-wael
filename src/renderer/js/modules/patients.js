import { patientApi } from '../../features/patients/patient-api.js';
import { patientState } from '../../features/patients/patient-state.js';
import { renderPatientRows } from '../../features/patients/patient-list.js';
import { collectPatientFormData } from '../../features/patients/patient-form.js';
import { eventBus } from '../../core/state/event-bus.js';
import { registerLegacyGlobals } from '../../core/legacy/legacy-bridge.js';

// ========== PATIENTS ==========
const PATIENTS_PAGE_SIZE = 15;
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

function renderPatientsRows(patients) {
  const tbody = document.getElementById('patients-tbody');
  if (!tbody) return;
  renderPatientRows({
    tbody,
    patients,
    readOnly: isDirectorUser(),
    onOpen: (id) => window.showPatientDetails?.(id),
    onEdit: editPatient,
    onDelete: deletePatient,
    onAttach: attachPatientToCurrentDoctor,
    onDetach: detachPatientFromCurrentDoctor,
    directory: patientsView === 'directory',
    multiPractitioner: patientsScope?.multiPractitioner === true
  });
}

function renderPatientsScopeControls() {
  const scopeBar = document.getElementById('patients-scope-bar');
  const doctorWrap = document.getElementById('patients-doctor-scope-wrap');
  const doctorSelect = document.getElementById('patients-doctor-scope');
  const mineTab = document.getElementById('patients-my-list-tab');
  const directoryTab = document.getElementById('patients-directory-tab');
  const fourthHeading = document.querySelector('#patients-table thead th:nth-child(4)');

  const assistantGlobalDirectory = currentUserRole === 'assistant' && patientsScope?.multiPractitioner;
  if (scopeBar) scopeBar.hidden = !patientsScope?.multiPractitioner || assistantGlobalDirectory;
  if (doctorWrap) doctorWrap.hidden = !(patientsScope?.assistantDoctorSelectorEnabled && currentUserRole === 'assistant');
  mineTab?.classList.toggle('active', patientsView === 'mine');
  directoryTab?.classList.toggle('active', patientsView === 'directory');
  if (fourthHeading) fourthHeading.textContent = patientsView === 'directory' ? 'Médecins' : 'Numéro SS';

  if (doctorSelect && patientsScope?.practitioners) {
    doctorSelect.innerHTML = patientsScope.practitioners.map((doctor) => {
      const name = doctor.fullName || doctor.username || 'Médecin';
      return `<option value="${doctor.id}">${name}</option>`;
    }).join('');
    doctorSelect.value = selectedPatientsDoctorId;
  }
}

async function ensurePatientsScope() {
  const result = await patientApi.getScope({ doctorId: selectedPatientsDoctorId });
  if (!result.success) throw new Error(result.error || 'Configuration patient indisponible');
  patientsScope = result.data;
  selectedPatientsDoctorId = result.data.selectedDoctorId || '';
  if (currentUserRole === 'assistant' && patientsScope.multiPractitioner) {
    patientsView = 'directory';
  } else if (!patientsScope.multiPractitioner) {
    patientsView = 'mine';
  }
  window.activePatientDoctorId = selectedPatientsDoctorId;
  renderPatientsScopeControls();
}

async function switchPatientsView(view) {
  patientsView = view === 'directory' ? 'directory' : 'mine';
  patientsSearchTerm = '';
  const search = document.getElementById('patients-search');
  if (search) search.value = '';
  renderPatientsScopeControls();
  await loadPatients(1);
}

async function changePatientsDoctorScope(doctorId) {
  selectedPatientsDoctorId = doctorId || '';
  window.activePatientDoctorId = selectedPatientsDoctorId;
  await loadPatients(1);
}

async function attachPatientToCurrentDoctor(patientId) {
  const result = await patientApi.attach({ patientId, doctorId: selectedPatientsDoctorId });
  if (!result.success) return showNotification(`Erreur: ${result.error}`, 'error');
  showNotification('Patient ajouté à la liste', 'success');
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
  const requestVersion = patientState.beginRequest();
  try {
    await ensurePatientsScope();
    const loader = patientsView === 'directory' ? patientApi.getDirectory : patientApi.getAll;
    const result = await loader({
      searchTerm: patientsSearchTerm,
      page,
      pageSize: PATIENTS_PAGE_SIZE,
      paginated: true,
      doctorId: selectedPatientsDoctorId
    });

    if (result.success && patientState.isCurrent(requestVersion)) {
      patientState.setPatients(result.data || [], result.pagination);
      setPatientsData(result.data || [], result.pagination);
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement des patients:', error);
    showNotification('Erreur lors du chargement des patients', 'error');
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
    // Don't load all patients when search is empty — show placeholder instead
    if (!patientsSearchTerm) {
      const tbody = document.querySelector('#patients-list tbody') || document.getElementById('patients-tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center empty-row" style="color:#94a3b8;padding:24px;font-style:italic;">🔍 Saisissez un nom pour rechercher un patient</td></tr>';
      }
      patientsFilteredData = [];
      patientsPagination = { page: 1, pageSize: PATIENTS_PAGE_SIZE, total: 0, totalPages: 1 };
      renderPatientsPagination();
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

  const modalTitle = document.querySelector('#modal-add-sickleave .modal-header h2');
  if (modalTitle) {
    modalTitle.textContent = documentKind === 'workstop' ? '🪪 Arrêt de travail' : '🪪 Certificat médical';
  }

  if (typeof updateSickLeaveSummary === 'function') {
    updateSickLeaveSummary();
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
    // The assistant already selected the working doctor above the patient list.
    // Avoid asking for the same choice a second time in the patient form.
    if (drContainer) drContainer.style.display = 'none';
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

          select.value = selectedPatientsDoctorId || patientsScope?.selectedDoctorId || '';
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

      // Cacher le sélecteur de médecin lors de la modification
      const drContainer = document.getElementById('patient-doctor-selector-container');
      if (drContainer) drContainer.style.display = 'none';

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

  // Ajout du champ médecin traitant si sélectionné par un assistant lors de la création
  if (!editingPatientId && currentUserRole === 'assistant') {
    const drVal = getValue('patient-primaryDoctorId') || selectedPatientsDoctorId;
    if (!drVal) {
      showNotification('❌ Veuillez sélectionner un médecin pour ce patient', 'error');
      return;
    }
    patientData.primaryDoctorId = drVal;
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
  changePatientsPage,
  deletePatient,
  editPatient,
  getDefaultPatientAvatarDataUri,
  getPatientPhotoUrl,
  loadPatients,
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

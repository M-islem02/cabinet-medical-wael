// ========== PATIENTS ==========
const PATIENTS_PAGE_SIZE = 15;
let patientsFilteredData = [];
let patientsSearchTerm = '';
let patientsMedecinFilter = '';

async function initPatientsMedecinFilter() {
  const select = document.getElementById('patients-medecin-filter');
  const doctorColumn = document.querySelector('#patients-table .patients-medecin-column');
  const isMultiple = typeof getCabinetType === 'function' && getCabinetType() === 'multiple';
  if (doctorColumn) doctorColumn.style.display = isMultiple ? '' : 'none';
  if (!select) return;
  select.style.display = isMultiple ? '' : 'none';
  if (!isMultiple || select.dataset.loaded) return;
  const result = await window.api.user.getAll({ requestingUserId: currentUserId });
  const doctors = (result.success ? result.data : []).filter(user => user.role === 'doctor' || user.role === 'dentist');
  select.innerHTML = '<option value="">Tous les médecins</option>' + doctors.map(user => `<option value="${user.id}">${user.fullName || user.username}</option>`).join('');
  select.addEventListener('change', () => { patientsMedecinFilter = select.value; loadPatients(1); });
  select.dataset.loaded = '1';
}
let patientsPagination = {
  page: 1,
  pageSize: PATIENTS_PAGE_SIZE,
  total: 0,
  totalPages: 1
};
let patientsCurrentPage = 1;

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

  tbody.innerHTML = '';

  if (!patients.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6" class="text-center">Aucun patient trouvé</td></tr>';
    return;
  }

  patients.forEach(patient => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.onclick = (e) => {
      if (!e.target.closest('button')) {
        if (isDirectorUser()) {
          return;
        }
        showPatientDetails(patient.id);
      }
    };
    row.innerHTML = `
      <td>${patient.lastName}</td>
      <td>${patient.firstName}</td>
      <td>${patient.dateOfBirth ? formatDateToDDMMYYYY(patient.dateOfBirth) : '-'}</td>
      <td>${patient.socialSecurityNumber || '-'}</td>
      <td>${patient.phone || '-'}</td>
      <td>${createPatientActionButtons(patient.id)}</td>
    `;
    tbody.appendChild(row);
  });
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
  try {
    await initPatientsMedecinFilter();
    const result = await window.api.patient.getAll({
      searchTerm: patientsSearchTerm,
      medecinId: patientsMedecinFilter,
      page,
      pageSize: PATIENTS_PAGE_SIZE,
      paginated: true
    });

    if (result.success) {
      setPatientsData(result.data || [], result.pagination);
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement des patients:', error);
    showNotification('Erreur lors du chargement des patients', 'error');
  }
}

function getActivePatientDetailsTabId() {
  return document.querySelector('#patient-details .tab-content.active')?.id || null;
}

async function searchPatients(term = '') {
  try {
    patientsSearchTerm = String(term || '').trim();
    await loadPatients(1);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error);
  }
}

window.changePatientsPage = changePatientsPage;
window.initPatientsMedecinFilter = initPatientsMedecinFilter;

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
    modalPhotoInput.addEventListener('change', (event) => handlePatientPhotoSelection(event, currentPatientId));
    modalPhotoInput.dataset.bound = '1';
  }

  const detailsPhotoInput = document.getElementById('patient-photo-details-input');
  if (detailsPhotoInput && !detailsPhotoInput.dataset.bound) {
    detailsPhotoInput.addEventListener('change', (event) => handlePatientPhotoSelection(event, currentPatientId));
    detailsPhotoInput.dataset.bound = '1';
  }
}

window.triggerPatientPhotoPicker = triggerPatientPhotoPicker;
window.getPatientPhotoUrl = getPatientPhotoUrl;
window.getDefaultPatientAvatarDataUri = getDefaultPatientAvatarDataUri;

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

window.showWorkStopForm = showWorkStopForm;

function showPatientForm() {
  if (isDirectorUser()) {
    showNotification('❌ Accès refusé: le directeur est en lecture seule sur les patients', 'error');
    return;
  }

  document.getElementById('modal-patient-title').textContent = 'Ajouter un Patient';
  document.getElementById('patient-submit-btn').textContent = 'Sauvegarder';
  document.getElementById('patient-form').reset();
  currentPatientId = null;
  
  if (currentUserRole === 'assistant') {
    const drContainer = document.getElementById('patient-doctor-selector-container');
    if (drContainer) drContainer.style.display = 'block';
    window.selectedDoctorSpecialty = '';
    if (typeof applyPackageRestrictionsFromCache === 'function') {
      applyPackageRestrictionsFromCache(window._packageConfig || null);
    }
    
    // Charger la liste des médecins pour l'assistant
    window.api.user.getAll({ requestingUserId: currentUserId }).then(res => {
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
    const result = await window.api.patient.getById(patientId);

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

      currentPatientId = patientId;
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
  const editingPatientId = currentPatientId;
  const activePatientTabId = getActivePatientDetailsTabId();
  const patientDetailsVisible = document.getElementById('patient-details')?.classList.contains('active') === true;

  const patientData = {
    firstName: getValue('patient-firstName'),
    lastName: getValue('patient-lastName'),
    dateOfBirth: document.getElementById('patient-dateOfBirth').value,
    gender: document.getElementById('patient-gender').value,
    socialSecurityNumber: getValue('patient-socialSecurityNumber') || null,
    email: getValue('patient-email'),
    phone: getValue('patient-phone'),
    address: getValue('patient-address'),
    city: getValue('patient-city'),
    zipCode: getValue('patient-zipCode'),
    bloodType: document.getElementById('patient-bloodType').value,
    allergies: getValue('patient-allergies'),
    medicalHistory: getValue('patient-medicalHistory'),
    emergencyContact: getValue('patient-emergencyContact'),
    emergencyPhone: getValue('patient-emergencyPhone')
  };

  // Ajout du champ médecin traitant si sélectionné par un assistant lors de la création
  if (!editingPatientId && currentUserRole === 'assistant') {
    const drVal = getValue('patient-primaryDoctorId');
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
      result = await window.api.patient.update(editingPatientId, patientData);
    } else {
      result = await window.api.patient.create(patientData);
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
      const result = await window.api.patient.delete(patientId);

      if (result.success) {
        localStorage.removeItem(getPatientPhotoStorageKey(patientId));
        showNotification('✅ Patient supprimé', 'success');
        loadPatients();
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

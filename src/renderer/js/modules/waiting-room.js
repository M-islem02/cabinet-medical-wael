// ===================== WAITING ROOM MODULE =====================
// Handles waiting room functionality with notifications between assistant and doctor

let waitingRoomData = [];
let waitingRoomRefreshInterval = null;
let lastWaitingSnapshot = {};
let waitingRoomDoctorIds = [];
const WAITING_ROOM_PAGE_SIZE = 8;
const waitingRoomPages = {
  waiting: 1,
  inConsultation: 1,
  completed: 1
};

/**
 * Initialize waiting room module
 */
async function initWaitingRoom() {
  console.log('🩺 Initializing Waiting Room module...');
  
  // Setup checkbox event for kiné selection
  const kineCheckbox = document.getElementById('act-kine');
  if (kineCheckbox) {
    kineCheckbox.addEventListener('change', toggleKineSelection);
  }
  
  // Setup unpaid checkbox
  const unpaidCheckbox = document.getElementById('consultation-unpaid');
  if (unpaidCheckbox) {
    unpaidCheckbox.addEventListener('change', toggleUnpaidDetails);
  }
  
  // Setup arrival time default
  const arrivalTimeInput = document.getElementById('waiting-arrival-time');
  if (arrivalTimeInput) {
    const now = new Date();
    arrivalTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  
  // Start auto-refresh for waiting room
  startWaitingRoomRefresh();
  
  console.log('✅ Waiting Room module initialized');
}

/**
 * Toggle kiné selection visibility
 */
function toggleKineSelection() {
  const kineSelection = document.getElementById('kine-selection');
  const kineCheckbox = document.getElementById('act-kine');
  if (kineSelection && kineCheckbox) {
    kineSelection.style.display = kineCheckbox.checked ? 'block' : 'none';
    if (kineCheckbox.checked) {
      loadKineOptions();
    }
  }
}

/**
 * Toggle unpaid details visibility
 */
function toggleUnpaidDetails() {
  const unpaidDetails = document.getElementById('unpaid-details');
  const unpaidCheckbox = document.getElementById('consultation-unpaid');
  if (unpaidDetails) {
    unpaidDetails.style.display = 'block';
  }
  if (unpaidCheckbox?.checked && typeof syncUnpaidAmountWithConsultationPrice === 'function') {
    syncUnpaidAmountWithConsultationPrice(true);
  }
  if (typeof updateConsultationPaymentRequestVisibility === 'function') {
    updateConsultationPaymentRequestVisibility();
  }
}

/**
 * Load kiné options into select
 */
async function loadKineOptions() {
  try {
    if (typeof loadKineSelectOptions === 'function') {
      await loadKineSelectOptions(true);
      return;
    }
    const kines = await window.api.kineStaff.getAll();
    const select = document.getElementById('consultation-kine');
    if (select) {
      const previousValue = select.value;
      select.innerHTML = '<option value="">-- Sélectionner un kiné --</option>';
      (kines || []).forEach(kine => {
        select.innerHTML += `<option value="${kine.id}">${kine.firstName} ${kine.lastName} - ${kine.sessionPrice || 0} DZD/séance</option>`;
      });
      if (previousValue) {
        select.value = previousValue;
      }
    }
  } catch (error) {
    console.error('Error loading kiné options:', error);
  }
}

/**
 * Open modal to add patient to waiting room
 */
async function openAddToWaitingRoomModal() {
  try {
    if (typeof window.initSearchablePatientSelect === 'function') {
      window.initSearchablePatientSelect(
        'waiting-patient-search',
        'waiting-patient-select',
        'waiting-patient-dropdown',
        {
          minChars: 1,
          placeholder: 'Tapez la premiere lettre du patient...',
          emptyMessage: 'Tapez la premiere lettre du patient',
          loadingMessage: 'Recherche des patients...',
          noResultsMessage: 'Aucun patient trouvé. Ajoutez-le d’abord dans la section Patients.',
          onSelect: selectWaitingDoctorForPatient
        }
      );
    }
    
    await loadWaitingDoctorOptions();

    // Set default arrival time
    const now = new Date();
    const arrivalInput = document.getElementById('waiting-arrival-time');
    if (arrivalInput) {
      arrivalInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    
    openModal('modal-waiting-room');
  } catch (error) {
    console.error('Error opening waiting room modal:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

function selectWaitingDoctorForPatient(patient) {
  const doctorSelect = document.getElementById('waiting-doctor-select');
  if (!doctorSelect || doctorSelect.disabled) return;

  const rawIds = patient?.assignedPractitionerIds;
  const assignedDoctorIds = (Array.isArray(rawIds) ? rawIds : String(rawIds || '').split(','))
    .map((id) => String(id || '').trim())
    .filter((id) => id && waitingRoomDoctorIds.includes(id));
  const primaryDoctorId = String(patient?.primaryDoctorId || '').trim();
  if (!assignedDoctorIds.length && primaryDoctorId && waitingRoomDoctorIds.includes(primaryDoctorId)) {
    assignedDoctorIds.push(primaryDoctorId);
  }
  if (!assignedDoctorIds.length) return;

  const randomIndex = Math.floor(Math.random() * assignedDoctorIds.length);
  doctorSelect.value = assignedDoctorIds[randomIndex];
}

async function loadWaitingDoctorOptions() {
  const doctorSelect = document.getElementById('waiting-doctor-select');
  if (!doctorSelect) return;

  waitingRoomDoctorIds = [];
  const isPractitioner = currentUserRole === 'doctor' || currentUserRole === 'dentist';
  if (isPractitioner) {
    waitingRoomDoctorIds = [String(currentUserId)];
    doctorSelect.innerHTML = `<option value="${currentUserId}">Moi (${currentUsername || 'Praticien'})</option>`;
    doctorSelect.value = currentUserId;
    doctorSelect.disabled = true;
    return;
  }

  doctorSelect.disabled = false;
  doctorSelect.innerHTML = '<option value="">Chargement...</option>';

  try {
    const usersResult = await window.api.user.getAll({ requestingUserId: currentUserId });
    const users = Array.isArray(usersResult?.data) ? usersResult.data : [];
    const doctors = users.filter((user) => {
      if (!user || user.isSuperAdmin || !user.isActive) return false;
      return user.role === 'doctor' || user.role === 'dentist';
    });
    waitingRoomDoctorIds = doctors.map((doctor) => String(doctor.id));

    if (!doctors.length) {
      doctorSelect.innerHTML = '<option value="">Aucun médecin disponible</option>';
      return;
    }

    if (doctors.length === 1) {
      const onlyDoctor = doctors[0];
      doctorSelect.innerHTML = `<option value="${onlyDoctor.id}">${onlyDoctor.fullName || onlyDoctor.username || 'Médecin'}</option>`;
      doctorSelect.value = onlyDoctor.id;
      doctorSelect.disabled = true;
      return;
    }

    doctorSelect.innerHTML = '<option value="">-- Choisir un médecin --</option>' + doctors
      .map((user) => `<option value="${user.id}">${user.fullName || user.username || 'Médecin'}</option>`)
      .join('');
    const activeDoctorId = String(window.activePatientDoctorId || '');
    if (doctors.some((doctor) => String(doctor.id) === activeDoctorId)) {
      doctorSelect.value = activeDoctorId;
    }
  } catch (error) {
    waitingRoomDoctorIds = [];
    console.error('Error loading doctors list for waiting room:', error);
    doctorSelect.innerHTML = '<option value="">Erreur chargement médecins</option>';
  }
}

/**
 * Add patient to waiting room
 */
async function addToWaitingRoom(event) {
  event.preventDefault();

  const patientId = document.getElementById('waiting-patient-select').value;
  const assignedTo = document.getElementById('waiting-doctor-select')?.value;
  const arrivalTime = document.getElementById('waiting-arrival-time').value;
  const reason = document.getElementById('waiting-reason').value;
  const notes = document.getElementById('waiting-notes').value;

  if (!patientId) {
    showNotification('Veuillez sélectionner un patient', 'error');
    return;
  }

  if (!assignedTo) {
    showNotification('Veuillez sélectionner le médecin responsable', 'error');
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const fullArrivalTime = `${today}T${arrivalTime || '09:00'}:00`;

    const result = await window.api.waitingRoom.add({
      patientId,
      assignedTo,
      arrivalTime: fullArrivalTime,
      reason,
      notes,
      createdBy: currentUserId || localStorage.getItem('currentUserId')
    });

    if (result && result.success === false) {
      showNotification(result.error || 'Ce patient est déjà dans la salle d\'attente', 'error');
      return;
    }
    
    closeModal('modal-waiting-room');
    loadWaitingRoom();
    updateWaitingRoomBadge();
    showNotification('Patient ajouté à la salle d\'attente', 'success');
    
    // Reset form
    document.getElementById('waiting-room-form').reset();
    
  } catch (error) {
    console.error('Error adding to waiting room:', error);
    showNotification('Erreur lors de l\'ajout', 'error');
  }
}

/**
 * Load waiting room data
 */
async function loadWaitingRoom() {
  try {
    const data = await window.api.waitingRoom.getToday();
    waitingRoomData = data || [];
    detectWaitingRoomChanges(waitingRoomData);
    renderWaitingRoom();
    updateWaitingRoomStats();
    updateWaitingRoomBadge();
    const stamp = document.getElementById('waiting-room-last-refresh');
    if (stamp) {
      stamp.textContent = `Auto ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (error) {
    console.error('Error loading waiting room:', error);
  }
}

// Detect changes (new patients, status changes) and notify
function detectWaitingRoomChanges(list) {
  const currentMap = {};
  list.forEach(item => currentMap[item.id] = item.status);

  // New entries
  list.forEach(item => {
    if (!lastWaitingSnapshot[item.id]) {
      showNotification(`Nouveau patient en salle d'attente: ${item.lastName || ''} ${item.firstName || ''}`.trim(), 'info');
    } else if (lastWaitingSnapshot[item.id] !== item.status) {
      const statusLabel = item.status === 'in-consultation' ? 'en consultation' : item.status === 'completed' ? 'terminé' : 'en attente';
      showNotification(`Statut mis à jour: ${item.lastName || ''} ${item.firstName || ''} → ${statusLabel}`.trim(), 'info');
    }
  });

  lastWaitingSnapshot = currentMap;
}

/**
 * Render waiting room list
 */
function renderWaitingRoom() {
  const container = document.getElementById('waiting-room-list');
  if (!container) return;
  
  const waiting = waitingRoomData.filter(w => w.status === 'waiting');
  const inConsultation = waitingRoomData.filter(w => w.status === 'in-consultation');
  const completed = waitingRoomData.filter(w => w.status === 'completed');
  
  if (waitingRoomData.length === 0) {
    container.innerHTML = `
      <div class="waiting-empty">
        <p>Aucun patient en salle d'attente</p>
      </div>
    `;
    return;
  }
  
  let html = '';

  const buildSection = (items, key, title, headerClass) => {
    if (!items.length) return '';

    const totalPages = Math.max(1, Math.ceil(items.length / WAITING_ROOM_PAGE_SIZE));
    if (waitingRoomPages[key] > totalPages) waitingRoomPages[key] = totalPages;
    if (waitingRoomPages[key] < 1) waitingRoomPages[key] = 1;

    const startIndex = (waitingRoomPages[key] - 1) * WAITING_ROOM_PAGE_SIZE;
    const pageRows = items.slice(startIndex, startIndex + WAITING_ROOM_PAGE_SIZE);

    let sectionHtml = `<div class="waiting-section">
      <div class="waiting-section-header ${headerClass}">
        <h4>${title}</h4>
        <span class="ant-tag">${items.length}</span>
      </div>`;

    pageRows.forEach((item, index) => {
      const position = key === 'waiting' ? (startIndex + index + 1) : null;
      const status = key === 'inConsultation' ? 'in-consultation' : key;
      sectionHtml += renderWaitingItem(item, status, position);
    });

    if (totalPages > 1) {
      sectionHtml += `
        <div class="list-pagination">
          <div class="list-pagination-info">${startIndex + 1}-${Math.min(startIndex + WAITING_ROOM_PAGE_SIZE, items.length)} / ${items.length}</div>
          <div class="list-pagination-actions pagination-controls">
            <button class="btn btn-small btn-secondary" aria-label="Page précédente" ${waitingRoomPages[key] <= 1 ? 'disabled' : ''} onclick="changeWaitingRoomPage('${key}', -1)">‹</button>
            <span class="list-pagination-info">${waitingRoomPages[key]}/${totalPages}</span>
            <button class="btn btn-small btn-secondary" aria-label="Page suivante" ${waitingRoomPages[key] >= totalPages ? 'disabled' : ''} onclick="changeWaitingRoomPage('${key}', 1)">›</button>
          </div>
        </div>
      `;
    }

    sectionHtml += '</div>';
    return sectionHtml;
  };
  
  // In consultation section
  html += buildSection(inConsultation, 'inConsultation', 'En consultation', 'waiting-section-header-live');
  
  // Waiting section
  html += buildSection(waiting, 'waiting', 'En attente', 'waiting-section-header-queue');
  
  // Completed section
  html += buildSection(completed, 'completed', 'Terminés', 'waiting-section-header-done');
  
  container.innerHTML = html;
}

function changeWaitingRoomPage(sectionKey, direction) {
  if (!Object.prototype.hasOwnProperty.call(waitingRoomPages, sectionKey)) return;
  waitingRoomPages[sectionKey] += direction;
  renderWaitingRoom();
}

/**
 * Render single waiting item
 */
function renderWaitingItem(item, status, position = null) {
  const arrivalTime = new Date(item.arrivalTime);
  const timeStr = `${String(arrivalTime.getHours()).padStart(2, '0')}:${String(arrivalTime.getMinutes()).padStart(2, '0')}`;
  const actions = getWaitingActions(item, status);
  const statusLabel = status === 'in-consultation'
    ? 'En consultation'
    : status === 'completed'
      ? 'Terminé'
      : 'En attente';
  
  // Calculate patients before this one
  const patientsBefore = position ? position - 1 : 0;
  const patientsBeforeText = patientsBefore === 0 
    ? 'Premier en file'
    : `${patientsBefore} patient${patientsBefore > 1 ? 's' : ''} avant`;
  
  return `
    <article class="waiting-item status-${status}">
      <div class="waiting-item-main">
        ${position ? `<div class="waiting-position">#${position}</div>` : '<div class="waiting-position waiting-position-status">•</div>'}
        <div class="waiting-patient-block">
          <div class="waiting-patient-row">
            <strong class="waiting-patient-name">${item.lastName} ${item.firstName}</strong>
            <span class="waiting-status-chip waiting-status-chip-${status}">${statusLabel}</span>
          </div>
          <div class="waiting-metadata">
            <span>Arrivée: ${timeStr}</span>
            <span>${item.reason || 'Consultation'}</span>
            ${item.assignedDoctorName ? `<span>Dr. ${item.assignedDoctorName}</span>` : ''}
          </div>
          ${status === 'waiting' && position ? `<div class="waiting-queue-note ${patientsBefore === 0 ? 'first' : ''}">${patientsBeforeText}</div>` : ''}
          ${item.notes ? `<div class="waiting-note">${item.notes}</div>` : ''}
        </div>
      </div>
      <div class="waiting-actions">
        ${actions}
      </div>
    </article>
  `;
}

/**
 * Get action buttons for waiting item based on user role
 * 
 * WORKFLOW:
 * - Assistant: Add patient only (no actions on waiting/in-consultation patients)
 * - Doctor: Consulter → Terminer (list stays as history for the day)
 */
function getWaitingActions(item, status) {
  // Get role from global or localStorage
  const role = typeof currentUserRole !== 'undefined' ? currentUserRole : (localStorage.getItem('currentUserRole') || 'doctor');
  const isDoctor = role === 'doctor' || role === 'dentist' || role === 'admin';
  const isAssistant = role === 'assistant';
  
  if (status === 'waiting') {
    if (isAssistant) {
      // Assistant: no actions on waiting patients (just adds them)
      return `<span class="waiting-inline-status waiting-inline-status-queue">En attente</span>`;
    }
    // Doctor: can start consultation
    return `
      <button class="btn btn-small btn-primary" onclick="startConsultation('${item.id}')" title="Commencer la consultation" style="background: #0d7377; border-color: #0d7377;">
        Consulter
      </button>
    `;
  }
  
  if (status === 'in-consultation') {
    if (isAssistant) {
      // Assistant: no action, just sees status
      return `<span class="waiting-inline-status waiting-inline-status-live">En consultation</span>`;
    }
    // Doctor: can terminate consultation
    return `
      <button class="btn btn-small btn-success" onclick="completeConsultation('${item.id}')" title="Terminer la consultation">
        Terminer
      </button>
    `;
  }
  
  if (status === 'completed') {
    // Both roles just see completed status (stays in history)
    return `<span class="waiting-inline-status waiting-inline-status-done">Terminé</span>`;
  }
  
  return '';
}

/**
 * Update waiting room statistics
 */
function updateWaitingRoomStats() {
  const waiting = waitingRoomData.filter(w => w.status === 'waiting').length;
  const inConsultation = waitingRoomData.filter(w => w.status === 'in-consultation').length;
  const completed = waitingRoomData.filter(w => w.status === 'completed').length;
  
  const waitingStat = document.getElementById('stat-waiting');
  const inConsultationStat = document.getElementById('stat-in-consultation');
  const completedStat = document.getElementById('stat-completed-today');
  
  if (waitingStat) waitingStat.textContent = waiting;
  if (inConsultationStat) inConsultationStat.textContent = inConsultation;
  if (completedStat) completedStat.textContent = completed;
}

/**
 * Update waiting room badge in sidebar
 */
function updateWaitingRoomBadge() {
  const badge = document.getElementById('waiting-count-badge');
  const count = waitingRoomData.filter(w => w.status === 'waiting').length;
  
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

/**
 * Notify doctor that patient is ready
 */
async function notifyDoctor(waitingId) {
  try {
    const item = waitingRoomData.find(w => w.id === waitingId);
    if (!item) return;
    
    // Send notification to doctor
    await window.api.notification.create({
      type: 'waiting-room',
      title: '🩺 Patient prêt',
      message: `${item.lastName} ${item.firstName} est prêt pour la consultation`,
      relatedType: 'waiting-room',
      relatedId: waitingId,
      userId: item.assignedTo || null
    });
    
    // Show visual notification
    showNotification(`🔔 Médecin notifié pour ${item.lastName} ${item.firstName}`, 'success');
    
  } catch (error) {
    console.error('Error notifying doctor:', error);
    showNotification('Erreur lors de la notification', 'error');
  }
}

/**
 * Notify doctor that patient will be ready in 2 minutes
 */
async function notifyDoctorIn2Min(waitingId) {
  try {
    const item = waitingRoomData.find(w => w.id === waitingId);
    if (!item) return;
    
    // Send notification to doctor
    await window.api.notification.create({
      type: 'waiting-room-2min',
      title: '⏱️ Arrivée patient',
      message: `${item.lastName} ${item.firstName} entrera dans 2 minutes`,
      relatedType: 'waiting-room',
      relatedId: waitingId,
      userId: item.assignedTo || null
    });
    
    // Show visual notification
    showNotification(`🔔 Médecin notifié (2 min) pour ${item.lastName} ${item.firstName}`, 'success');
    
  } catch (error) {
    console.error('Error notifying doctor:', error);
    showNotification('Erreur lors de la notification', 'error');
  }
}

/**
 * Start consultation (doctor action)
 * - Updates status to in-consultation
 * - Navigates to patient record
 * - Can send payment request to assistant when done
 */
async function startConsultation(waitingId) {
  try {
    const item = waitingRoomData.find(w => w.id === waitingId);
    if (!item?.patientId) {
      showNotification('Patient introuvable dans la salle d’attente', 'error');
      return;
    }

    const patient = typeof showPatientDetails === 'function'
      ? await showPatientDetails(item.patientId)
      : null;
    if (!patient) return;

    if (typeof setSelectedPatient === 'function') {
      await setSelectedPatient(item.patientId, { patient, source: 'waiting-room' });
    }
    if (typeof selectORLPatient === 'function') {
      await selectORLPatient(item.patientId, { patient, fromGlobalSync: false });
    }

    const statusResult = await window.api.waitingRoom.updateStatus(waitingId, 'in-consultation');
    if (statusResult?.success === false) {
      throw new Error(statusResult.error || 'Impossible de démarrer la consultation');
    }

    try {
      // Notify assistant that consultation started
      await window.api.notification.create({
        type: 'consultation-started',
        title: 'Consultation démarrée',
        message: `${item.lastName} ${item.firstName} est en consultation`,
        relatedType: 'waiting-room',
        relatedId: waitingId,
        userId: null
      });
    } catch (notificationError) {
      console.warn('Consultation started but notification failed:', notificationError);
    }

    await loadWaitingRoom();
    await openNewConsultationModal();

    const consultationForm = document.getElementById('consultation-form');
    if (consultationForm) consultationForm.dataset.waitingRoomId = waitingId;

    const reasonInput = document.getElementById('consultation-reason');
    if (reasonInput && item.reason) reasonInput.value = item.reason;
    reasonInput?.focus();
    showNotification('Consultation démarrée', 'success');
  } catch (error) {
    console.error('Error starting consultation:', error);
    showNotification(error.message || 'Erreur lors du démarrage de la consultation', 'error');
  }
}

/**
 * Send payment request (doctor action)
 * Doctor sends payment request to assistant when consultation is done
 */
async function sendPaymentRequest(waitingId, amount = null) {
  try {
    const item = waitingRoomData.find(w => w.id === waitingId);
    if (!item) {
      showNotification('Patient non trouvé', 'error');
      return;
    }
    
    // Create a payment request notification for the assistant
    const paymentInfo = amount ? `Montant: ${amount} DA` : 'Montant à déterminer';
    
    await window.api.notification.create({
      type: 'payment-request',
      title: '💰 Demande de paiement',
      message: `${item.lastName} ${item.firstName} - ${paymentInfo}. Veuillez collecter le paiement.`,
      relatedType: 'waiting-room',
      relatedId: waitingId,
      userId: null // Broadcast to all (assistant will see it)
    });
    
    // Create a payment request record if the API exists
    if (window.api.paymentRequest && typeof window.api.paymentRequest.create === 'function') {
      await window.api.paymentRequest.create({
        patientId: item.patientId,
        waitingRoomId: waitingId,
        amount: amount,
        status: 'pending',
        requestedBy: typeof currentUserId !== 'undefined' ? currentUserId : null
      });
    }
    
    showNotification(`💰 Demande de paiement envoyée pour ${item.lastName} ${item.firstName}`, 'success');
    
  } catch (error) {
    console.error('Error sending payment request:', error);
    showNotification('Erreur lors de l\'envoi de la demande', 'error');
  }
}

/**
 * Complete consultation (doctor action)
 * Marks as completed - patient stays in list as history for the day
 */
async function completeConsultation(waitingId) {
  try {
    const item = waitingRoomData.find(w => w.id === waitingId);
    if (!item) {
      showNotification('Patient non trouvé', 'error');
      return;
    }
    
    // Update status to completed
    await window.api.waitingRoom.updateStatus(waitingId, 'completed');
    
    loadWaitingRoom();
    showNotification(`✅ Consultation terminée - ${item.lastName} ${item.firstName}`, 'success');
    
  } catch (error) {
    console.error('Error completing consultation:', error);
    showNotification('Erreur', 'error');
  }
}

/**
 * Complete and Collect (assistant action)
 * Marks consultation as completed and opens payment modal
 */
async function completeAndCollect(waitingId, patientId, patientName) {
  try {
    // Update status to completed
    await window.api.waitingRoom.updateStatus(waitingId, 'completed');
    
    loadWaitingRoom();
    showNotification('Consultation terminée', 'success');
    
    // Open payment modal for this patient
    if (patientId) {
      if (typeof openPaymentModalForPatient === 'function') {
        openPaymentModalForPatient(patientId, patientName);
      } else if (typeof addPaymentForPatient === 'function') {
        addPaymentForPatient(patientId);
      } else {
        // Fallback: Navigate to patient details
        if (typeof showPatientDetails === 'function') {
          showPatientDetails(patientId);
        }
        showNotification('Ouvrez les paiements manuellement', 'info');
      }
    }
    
    // Ask if should remove from waiting list after payment
    setTimeout(() => {
      const removeFromList = confirm(`🗑️ Retirer ${patientName} de la liste d'attente ?`);
      if (removeFromList) {
        window.api.waitingRoom.delete(waitingId).then(() => {
          loadWaitingRoom();
          showNotification('Patient retiré de la liste', 'info');
        });
      }
    }, 500); // Small delay to let payment modal open first
    
  } catch (error) {
    console.error('Error in completeAndCollect:', error);
    showNotification('Erreur', 'error');
  }
}

/**
 * Remove patient from waiting room
 */
async function removeFromWaitingRoom(waitingId) {
  if (!confirm('Retirer ce patient de la salle d\'attente?')) return;
  
  try {
    await window.api.waitingRoom.delete(waitingId);
    loadWaitingRoom();
    showNotification('Patient retiré', 'success');
  } catch (error) {
    console.error('Error removing from waiting room:', error);
    showNotification('Erreur', 'error');
  }
}

/**
 * Refresh waiting room data
 */
function refreshWaitingRoom() {
  loadWaitingRoom();
  showNotification('Actualisé', 'info');
}

/**
 * Start auto-refresh for waiting room
 */
function startWaitingRoomRefresh() {
  if (waitingRoomRefreshInterval) return;
  // Refresh every 30 seconds
  waitingRoomRefreshInterval = setInterval(() => {
    if (document.getElementById('waiting-room').classList.contains('active')) {
      loadWaitingRoom();
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', () => {
  initWaitingRoom();
});

/**
 * Show notification toast
 */
function showNotificationToast(title, message) {
  const toast = document.getElementById('notification-toast');
  const titleEl = document.getElementById('notification-title');
  const messageEl = document.getElementById('notification-message');
  
  if (toast && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    toast.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      closeNotificationToast();
    }, 5000);
  }
}

/**
 * Close notification toast
 */
function closeNotificationToast() {
  const toast = document.getElementById('notification-toast');
  if (toast) {
    toast.style.display = 'none';
  }
}

// Make functions global
window.openAddToWaitingRoomModal = openAddToWaitingRoomModal;
window.addToWaitingRoom = addToWaitingRoom;
window.loadWaitingRoom = loadWaitingRoom;
window.refreshWaitingRoom = refreshWaitingRoom;
window.notifyDoctor = notifyDoctor;
window.notifyDoctorIn2Min = notifyDoctorIn2Min;
window.startConsultation = startConsultation;
window.completeConsultation = completeConsultation;
window.completeAndCollect = completeAndCollect;
window.sendPaymentRequest = sendPaymentRequest;
window.removeFromWaitingRoom = removeFromWaitingRoom;
window.closeNotificationToast = closeNotificationToast;
window.showNotificationToast = showNotificationToast;
window.toggleKineSelection = toggleKineSelection;
window.toggleUnpaidDetails = toggleUnpaidDetails;
window.initWaitingRoom = initWaitingRoom;
window.changeWaitingRoomPage = changeWaitingRoomPage;

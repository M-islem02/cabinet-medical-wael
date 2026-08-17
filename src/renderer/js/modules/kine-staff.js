// ===================== KINÉ STAFF MODULE =====================
// Manages kinésithérapeutes as staff records (not user accounts)

let kineStaffData = [];
let editingKineId = null;

/**
 * Initialize kiné staff module
 */
async function initKineStaff() {
  console.log('👨‍⚕️ Initializing Kiné Staff module...');
  await loadKineStaff();
  console.log('✅ Kiné Staff module initialized');
}

/**
 * Load kiné staff list
 */
async function loadKineStaff() {
  try {
    console.log('🔄 Loading kiné staff...');
    const data = await window.api.kineStaff.getAll();
    console.log('📊 Kiné staff data received:', data);
    kineStaffData = Array.isArray(data) ? data : [];
    console.log('📋 Kiné staff count:', kineStaffData.length);
    renderKineStaffTable();
    updateKineStaffStats();
  } catch (error) {
    console.error('❌ Error loading kiné staff:', error);
    kineStaffData = [];
    renderKineStaffTable();
  }
}

/**
 * Render kiné staff table - Shows session duration and count, no money
 */
function renderKineStaffTable() {
  const tbody = document.getElementById('kine-staff-tbody');
  console.log('🔄 renderKineStaffTable called, tbody found:', !!tbody);
  console.log('📊 kineStaffData:', kineStaffData);
  
  if (!tbody) {
    console.error('❌ kine-staff-tbody not found!');
    return;
  }
  
  if (kineStaffData.length === 0) {
    console.log('⚠️ No kiné data, showing empty message');
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6" class="text-center">Aucun kinésithérapeute enregistré</td>
      </tr>
    `;
    return;
  }
  
  console.log('✅ Rendering', kineStaffData.length, 'kinés with sessions:');
  kineStaffData.forEach(k => console.log(`  - ${k.firstName} ${k.lastName}: ${k.monthSessions} séances`));
  
  tbody.innerHTML = kineStaffData.map(kine => `
    <tr>
      <td><strong>${kine.lastName} ${kine.firstName}</strong></td>
      <td>${kine.phone || '-'}</td>
      <td>${kine.specialty || 'Général'}</td>
      <td><span style="color: #8b5cf6; font-weight: 600;">${kine.sessionDuration || 30} min</span></td>
      <td style="text-align: center;">
        <span style="display: inline-block; min-width: 40px; padding: 6px 12px; background: #3b82f6; color: white; border-radius: 20px; font-weight: bold; font-size: 14px;">
          ${kine.monthSessions || 0}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button class="btn btn-small btn-secondary" onclick="editKineStaff('${kine.id}')" title="Modifier">
            ✏️
          </button>
          <button class="btn btn-small btn-primary" onclick="viewKineSessions('${kine.id}')" title="Voir les séances">
            📋
          </button>
          <button class="btn btn-small btn-danger" onclick="deleteKineStaff('${kine.id}')" title="Supprimer">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Update kiné staff statistics - Only sessions, no money
 */
async function updateKineStaffStats() {
  try {
    const stats = await window.api.kineStaff.getStats();
    
    const totalKines = document.getElementById('stat-total-kines');
    const sessionsMonth = document.getElementById('stat-kine-sessions-month');
    const sessionDuration = document.getElementById('stat-kine-session-duration');
    
    if (totalKines) totalKines.textContent = stats.totalKines || kineStaffData.length;
    if (sessionsMonth) sessionsMonth.textContent = stats.monthSessions || 0;
    if (sessionDuration) sessionDuration.textContent = '30 min'; // Standard duration
    
  } catch (error) {
    console.error('Error updating kiné stats:', error);
  }
}

/**
 * Open kiné staff modal
 */
function openKineStaffModal() {
  editingKineId = null;
  document.getElementById('kine-modal-title').textContent = '👨‍⚕️ Nouveau Kinésithérapeute';
  document.getElementById('kine-staff-form').reset();
  document.getElementById('kine-id').value = '';
  openModal('modal-kine-staff');
}

/**
 * Edit kiné staff
 */
function editKineStaff(kineId) {
  const kine = kineStaffData.find(k => k.id === kineId);
  if (!kine) return;
  
  editingKineId = kineId;
  document.getElementById('kine-modal-title').textContent = '✏️ Modifier Kinésithérapeute';
  
  document.getElementById('kine-id').value = kine.id;
  document.getElementById('kine-firstName').value = kine.firstName || '';
  document.getElementById('kine-lastName').value = kine.lastName || '';
  document.getElementById('kine-phone').value = kine.phone || '';
  document.getElementById('kine-email').value = kine.email || '';
  document.getElementById('kine-specialty').value = kine.specialty || 'Général';
  document.getElementById('kine-session-price').value = kine.sessionPrice || 1500;
  document.getElementById('kine-notes').value = kine.notes || '';
  
  openModal('modal-kine-staff');
}

/**
 * Save kiné staff
 */
async function saveKineStaff(event) {
  if (event) event.preventDefault();
  
  const firstNameEl = document.getElementById('kine-firstName');
  const lastNameEl = document.getElementById('kine-lastName');
  
  if (!firstNameEl || !lastNameEl) {
    showNotification('Erreur: Formulaire non trouvé', 'error');
    return;
  }
  
  const firstName = firstNameEl.value.trim();
  const lastName = lastNameEl.value.trim();
  
  if (!firstName || !lastName) {
    showNotification('⚠️ Veuillez remplir le nom et prénom', 'warning');
    return;
  }
  
  const data = {
    firstName: firstName,
    lastName: lastName,
    phone: document.getElementById('kine-phone')?.value || '',
    email: document.getElementById('kine-email')?.value || '',
    specialty: document.getElementById('kine-specialty')?.value || 'Général',
    sessionPrice: parseFloat(document.getElementById('kine-session-price')?.value) || 1500,
    notes: document.getElementById('kine-notes')?.value || ''
  };
  
  console.log('💾 Saving kiné data:', data);
  
  try {
    let result;
    if (editingKineId) {
      result = await window.api.kineStaff.update(editingKineId, data);
      console.log('✏️ Update result:', result);
      showNotification('✅ Kinésithérapeute modifié', 'success');
    } else {
      result = await window.api.kineStaff.create(data);
      console.log('➕ Create result:', result);
      showNotification('✅ Kinésithérapeute ajouté', 'success');
    }
    
    closeModal('modal-kine-staff');
    editingKineId = null;
    
    // Immediately reload the kiné staff list
    await loadKineStaff();
    if (typeof loadKineSelectOptions === 'function') {
      await loadKineSelectOptions(true);
    }
    
  } catch (error) {
    console.error('❌ Error saving kiné:', error);
    showNotification('Erreur lors de l\'enregistrement: ' + error.message, 'error');
  }
}

/**
 * Delete kiné staff
 */
async function deleteKineStaff(kineId) {
  if (!confirm('Supprimer ce kinésithérapeute? Les séances associées seront conservées.')) return;
  
  try {
    await window.api.kineStaff.delete(kineId);
    await loadKineStaff();
    if (typeof loadKineSelectOptions === 'function') {
      await loadKineSelectOptions(true);
    }
    showNotification('Kinésithérapeute supprimé', 'success');
  } catch (error) {
    console.error('Error deleting kiné:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

/**
 * View kiné sessions - Shows comprehensive details
 */
async function viewKineSessions(kineId) {
  const kine = kineStaffData.find(k => k.id === kineId);
  if (!kine) return;
  
  try {
    const sessions = await window.api.kineStaff.getSessions(kineId);
    const totalSessions = sessions.length;
    
    // Calculate today's sessions
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = sessions.filter(s => s.sessionDate && s.sessionDate.startsWith(today));
    
    // Calculate this month's sessions
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthSessions = sessions.filter(s => s.sessionDate && s.sessionDate.startsWith(thisMonth));
    
    // Calculate total duration
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 30), 0);
    const avgDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    
    // Group sessions by patient for summary
    const patientStats = {};
    sessions.forEach(s => {
      const patientKey = s.patientId || 'unknown';
      if (!patientStats[patientKey]) {
        patientStats[patientKey] = {
          name: s.patientName || 'Inconnu',
          count: 0,
          totalDuration: 0
        };
      }
      patientStats[patientKey].count++;
      patientStats[patientKey].totalDuration += (s.duration || 30);
    });
    
    const uniquePatients = Object.keys(patientStats).length;
    
    let html = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 15px;">📋 Séances de ${kine.firstName} ${kine.lastName}</h3>
        
        <!-- Stats Summary -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: #dbeafe; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 700; color: #1e40af;">${todaySessions.length}</div>
            <div style="font-size: 11px; color: #3b82f6;">Aujourd'hui</div>
          </div>
          <div style="background: #dcfce7; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 700; color: #166534;">${monthSessions.length}</div>
            <div style="font-size: 11px; color: #16a34a;">Ce mois</div>
          </div>
          <div style="background: #fef3c7; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 700; color: #92400e;">${totalSessions}</div>
            <div style="font-size: 11px; color: #d97706;">Total</div>
          </div>
          <div style="background: #f3e8ff; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 700; color: #6b21a8;">${uniquePatients}</div>
            <div style="font-size: 11px; color: #8b5cf6;">Patients</div>
          </div>
        </div>
        
        <!-- Kiné Info -->
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #8b5cf6;">
          <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 13px;">
            <div><strong>📞 Tél:</strong> ${kine.phone || '-'}</div>
            <div><strong>🏥 Spécialité:</strong> ${kine.specialty || 'Général'}</div>
            <div><strong>⏱️ Durée standard:</strong> ${kine.sessionDuration || 30} min</div>
            <div><strong>📊 Durée moyenne:</strong> ${avgDuration} min</div>
          </div>
        </div>
    `;
    
    if (totalSessions === 0) {
      html += '<p style="text-align: center; color: #999; padding: 30px;">Aucune séance enregistrée</p>';
    } else {
      // Sessions Table
      html += `
        <h4 style="margin-bottom: 10px; color: #374151;">📅 Historique des séances</h4>
        <div style="max-height: 300px; overflow-y: auto;">
          <table class="table" style="font-size: 13px;">
            <thead>
              <tr>
                <th>Date</th>
                <th>Heure</th>
                <th>Patient</th>
                <th>Durée</th>
                <th>N° Séance</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      // Sessions are ordered DESC
      sessions.forEach((session, index) => {
        const dateObj = session.sessionDate ? new Date(session.sessionDate) : null;
        const date = formatDateDisplay(session.sessionDate);
        const time = dateObj ? dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-';
        const sessionNumber = session.sessionNum || session.sessionNumber || (totalSessions - index);
        const isToday = session.sessionDate && session.sessionDate.startsWith(today);
        const rowStyle = isToday ? 'background: #fef3c7;' : '';
        
        html += `
          <tr style="${rowStyle}">
            <td>${date} ${isToday ? '🔹' : ''}</td>
            <td>${time}</td>
            <td><strong>${session.patientName || '-'}</strong></td>
            <td><span style="color: #8b5cf6; font-weight: 600;">${session.duration || 30} min</span></td>
            <td><span class="badge" style="background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 12px; font-weight: 600;">#${sessionNumber}</span></td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${session.notes || '-'}</td>
          </tr>
        `;
      });
      
      html += '</tbody></table></div>';
      
      // Top Patients Summary
      if (uniquePatients > 0) {
        const sortedPatients = Object.values(patientStats).sort((a, b) => b.count - a.count).slice(0, 5);
        html += `
          <h4 style="margin-top: 20px; margin-bottom: 10px; color: #374151;">👥 Top Patients</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        `;
        sortedPatients.forEach(p => {
          html += `
            <div style="background: #f1f5f9; padding: 8px 12px; border-radius: 20px; font-size: 12px;">
              <strong>${p.name}</strong>: ${p.count} séance(s)
            </div>
          `;
        });
        html += '</div>';
      }
    }
    
    html += '</div>';
    
    // Show in a modal
    showInfoModal('Séances Kiné', html);
    
  } catch (error) {
    console.error('Error loading sessions:', error);
    showNotification('Erreur lors du chargement', 'error');
  }
}

/**
 * Format currency helper
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount) + ' DZD';
}

/**
 * Format date for display (dd/mm/yyyy)
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Show info modal with custom content
 */
function showInfoModal(title, content) {
  // Create temporary modal
  let modal = document.getElementById('modal-info');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-info';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2 id="modal-info-title"></h2>
          <button class="close-btn" onclick="closeModal('modal-info')">&times;</button>
        </div>
        <div class="modal-body" id="modal-info-content"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  document.getElementById('modal-info-title').textContent = title;
  document.getElementById('modal-info-content').innerHTML = content;
  openModal('modal-info');
}

// Make functions global
window.initKineStaff = initKineStaff;
window.loadKineStaff = loadKineStaff;
window.openKineStaffModal = openKineStaffModal;
window.editKineStaff = editKineStaff;
window.saveKineStaff = saveKineStaff;
window.deleteKineStaff = deleteKineStaff;
window.viewKineSessions = viewKineSessions;

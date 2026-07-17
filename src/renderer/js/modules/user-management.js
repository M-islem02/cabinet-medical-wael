// ========== USER MANAGEMENT ==========

function toggleUserManagementPanel(forceOpen = null) {
  const body = document.getElementById('user-management-body');
  const button = document.getElementById('user-management-toggle-btn');
  if (!body) return;

  body.style.display = 'block';
  if (button) {
    button.style.display = 'none';
  }
  loadUsersList();
}

function refreshUsersList() {
  loadUsersList();
}

function canCurrentUserCreateAccounts() {
  return currentUserIsAdmin === true
    || currentUserIsSuperAdmin === true
    || localStorage.getItem('currentUserIsAdmin') === 'true'
    || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
}

function getRequesterContext() {
  const requesterId = currentUserId || localStorage.getItem('currentUserId') || null;
  const requesterUsername = currentUsername || localStorage.getItem('currentUsername') || '';
  const requesterIsSuperAdmin = currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
  return {
    requestingUserId: requesterId,
    requestingUsername: requesterUsername,
    requestingUserIsSuperAdmin: requesterIsSuperAdmin
  };
}

function canManageAccounts() {
  return canCurrentUserCreateAccounts();
}

function isCurrentUserSuperAdmin() {
  return currentUserIsSuperAdmin === true || localStorage.getItem('currentUserIsSuperAdmin') === 'true';
}

function populateManagedRoleOptions(selectedRole = 'doctor') {
  const roleSelect = document.getElementById('new-user-role');
  if (!roleSelect) return;

  roleSelect.innerHTML = `
    <option value="doctor">👨‍⚕️ Médecin</option>
    <option value="assistant">🧑‍💼 Assistant(e)</option>
  `;

  roleSelect.value = selectedRole === 'assistant' ? 'assistant' : 'doctor';
}

function populateSpecialtyOptions(selectedSpecialty = '') {
  const specialtySelect = document.getElementById('new-user-specialty');
  if (!specialtySelect) return;

  const availableSpecialties = typeof getAvailablePracticeSpecialties === 'function'
    ? getAvailablePracticeSpecialties()
    : [];

  specialtySelect.innerHTML = availableSpecialties.length
    ? availableSpecialties
        .map((specialty) => `<option value="${specialty.key}">${specialty.label}</option>`)
        .join('')
    : '<option value="general">Médecin généraliste</option>';

  if (selectedSpecialty) {
    specialtySelect.value = selectedSpecialty;
  } else if (availableSpecialties.length === 1) {
    specialtySelect.value = availableSpecialties[0].key;
  }
}

function setUserFormMode(mode = 'create', user = null) {
  const title = document.getElementById('modal-user-title');
  const subtitle = document.querySelector('#modal-add-user .admin-account-modal-subtitle');
  const submitBtn = document.getElementById('user-form-submit-btn');
  const modeInput = document.getElementById('user-form-mode');
  const editingUserId = document.getElementById('editing-user-id');
  const passwordInput = document.getElementById('new-user-password');
  const confirmInput = document.getElementById('new-user-confirm-password');
  const passwordLabel = document.getElementById('new-user-password-label');
  const confirmLabel = document.getElementById('new-user-confirm-password-label');
  const passwordHint = document.getElementById('user-password-hint');

  const isEditMode = mode === 'edit';
  if (modeInput) modeInput.value = isEditMode ? 'edit' : 'create';
  if (editingUserId) editingUserId.value = isEditMode && user?.id ? user.id : '';

  if (title) title.textContent = isEditMode ? 'Modifier le compte' : 'Créer un compte';
  if (subtitle) {
    subtitle.textContent = isEditMode
      ? 'Modifiez le nom, le nom d’utilisateur, la spécialité ou le mot de passe du compte sélectionné.'
      : 'Ajoutez un médecin avec sa spécialité individuelle ou un assistant du cabinet, sans créer de second administrateur.';
  }
  if (submitBtn) submitBtn.textContent = isEditMode ? 'Enregistrer' : 'Créer le compte';
  if (passwordLabel) passwordLabel.textContent = isEditMode ? 'Nouveau mot de passe' : 'Mot de passe temporaire *';
  if (confirmLabel) confirmLabel.textContent = isEditMode ? 'Confirmer le nouveau mot de passe' : 'Confirmer le mot de passe *';
  if (passwordHint) {
    passwordHint.textContent = isEditMode
      ? 'Laissez les deux champs de mot de passe vides si vous ne souhaitez pas le modifier.'
      : 'Le mot de passe temporaire est requis lors de la création du compte.';
  }

  if (passwordInput) passwordInput.required = !isEditMode;
  if (confirmInput) confirmInput.required = !isEditMode;
}

function renderUserRoleBadge(user) {
  if (user.isSuperAdmin) {
    return '<span style="background: #111827; color: white; padding: 5px 12px; border-radius: 4px; font-size: 14px; font-weight: bold;">👑 SUPER ADMIN</span>';
  }

  if (user.role === 'admin') {
    return '<span style="background: #dc2626; color: white; padding: 5px 12px; border-radius: 4px; font-size: 14px; font-weight: bold;">🔑 ADMIN</span>';
  }

  if (user.role === 'assistant') {
    return '<span style="background: #16a34a; color: white; padding: 5px 12px; border-radius: 4px; font-size: 14px;">💼 ASSISTANT</span>';
  }

  const specialtyMeta = typeof getPracticeSpecialtyMeta === 'function'
    ? getPracticeSpecialtyMeta(user.specialty || user.role)
    : null;
  const roleLabel = specialtyMeta?.doctorBadgeLabel || (user.role === 'dentist' ? 'DENTISTE' : 'MÉDECIN');
  if (user.isAdmin) {
    return `<span style="background: #0f172a; color: white; padding: 5px 12px; border-radius: 4px; font-size: 14px;">👨‍⚕️ ${roleLabel} ADMIN</span>`;
  }
  return `<span style="background: #2563eb; color: white; padding: 5px 12px; border-radius: 4px; font-size: 14px;">👨‍⚕️ ${roleLabel}</span>`;
}

async function loadUsersList() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  try {
    const requesterContext = getRequesterContext();
    const result = await window.api.user.getAll(requesterContext);
    if (!result.success) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #f44336; font-size: 16px;">Erreur de chargement</td></tr>';
      return;
    }

    const users = (result.data || []).filter(user => isCurrentUserSuperAdmin() || !user.isSuperAdmin);
    
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999; font-size: 16px;">Aucun utilisateur</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(user => {
      const isOwnAccount = user.id === (currentUserId || localStorage.getItem('currentUserId'));
      const canManageUser = isCurrentUserSuperAdmin()
        ? !user.isSuperAdmin
        : (!user.isSuperAdmin && !user.isAdmin && !isOwnAccount);

      return `
      <tr style="border-bottom: 1px solid #dee2e6; ${!user.isActive ? 'background: #fee;' : ''}">
        <td style="padding: 15px; font-size: 16px; font-weight: 600;">
          ${user.username}
          ${!user.isActive ? '<span style="background: #f44336; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px;">DÉSACTIVÉ</span>' : ''}
        </td>
        <td style="padding: 15px; font-size: 15px; color: #666;">
          ${user.fullName || '<em style="color: #999;">Non renseigné</em>'}
        </td>
        <td style="padding: 15px; font-size: 15px;">
          ${renderUserRoleBadge(user)}
        </td>
        <td style="padding: 15px; text-align: center;">
          ${canManageAccounts() ? `
            <div style="display: flex; gap: 8px; justify-content: center;">
              ${canManageUser ? `
                <button class="btn btn-sm btn-primary" onclick="openEditUserModal('${user.id}')" style="padding: 8px 12px; font-size: 14px;">
                  ✏️ Modifier
                </button>
                <button class="btn btn-sm btn-warning" onclick="toggleUserStatus('${user.id}')" style="padding: 8px 12px; font-size: 14px;">
                  ${user.isActive ? '🚫 Désactiver' : '✅ Activer'}
                </button>
                <button class="btn btn-sm btn-info" onclick="resetAssistantPassword('${user.id}', '${user.username}')" style="padding: 8px 12px; font-size: 14px;">
                  🔑 Changer MDP
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')" style="padding: 8px 12px; font-size: 14px;">
                  🗑️ Supprimer
                </button>
              ` : `<span style="color: #64748b; font-size: 14px;">${isOwnAccount ? 'Mon compte' : 'Protégé'}</span>`}
            </div>
          ` : '<span style="color: #999; font-size: 14px;">—</span>'}
        </td>
      </tr>
    `;
    }).join('');
  } catch (error) {
    console.error('Error loading users:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #f44336; font-size: 16px;">Erreur de chargement</td></tr>';
  }
}

function showAddUserModal() {
  if (!canCurrentUserCreateAccounts()) {
    showNotification('❌ Création de comptes non autorisée', 'error');
    return;
  }
  
  document.getElementById('add-user-form').reset();
  setUserFormMode('create');
  populateManagedRoleOptions('doctor');
  populateSpecialtyOptions();
  if (typeof window.toggleSpecialtyField === 'function') {
    window.toggleSpecialtyField();
  }
  showModal('modal-add-user');
}

async function openEditUserModal(userId) {
  if (!canManageAccounts()) {
    showNotification('Acces refuse: modification de comptes non autorisée', 'error');
    return;
  }

  try {
    const result = await window.api.user.getById({ userId, ...getRequesterContext() });
    if (!result.success || !result.data) {
      showNotification(result.error || 'Utilisateur introuvable', 'error');
      return;
    }

    const user = result.data;
    const editableRole = user.role === 'assistant' ? 'assistant' : (user.isAdmin ? 'doctor_admin' : 'doctor');

    document.getElementById('add-user-form').reset();
    setUserFormMode('edit', user);
    populateManagedRoleOptions(editableRole);
    populateSpecialtyOptions(user.specialty || '');

    document.getElementById('new-user-role').value = editableRole;
    document.getElementById('new-user-fullname').value = user.fullName || '';
    document.getElementById('new-user-phone').value = user.phone || '';
    document.getElementById('new-username').value = user.username || '';

    if (typeof window.toggleSpecialtyField === 'function') {
      window.toggleSpecialtyField();
    }

    showModal('modal-add-user');
  } catch (error) {
    console.error('Error loading user for edit:', error);
    showNotification('Erreur lors du chargement du compte', 'error');
  }
}

function updateAddUserRolePresentation(role) {
  const badge = document.getElementById('new-user-role-badge');
  const heading = document.getElementById('new-user-role-heading');
  const summary = document.getElementById('new-user-role-summary');

  if (!badge || !heading || !summary) return;

  if (role === 'assistant') {
    badge.textContent = 'Compte assistant';
    heading.textContent = 'Accès assistant';
    summary.textContent = 'Le compte assistant crée des dossiers pour n’importe quel médecin du cabinet et adapte automatiquement le formulaire selon le docteur sélectionné.';
    return;
  }

  if (role === 'doctor_admin') {
    badge.textContent = 'Médecin admin';
    heading.textContent = 'Accès cabinet complet';
    summary.textContent = 'Le médecin admin voit les dossiers, rendez-vous, consultations et paiements de tout le cabinet.';
    return;
  }

  badge.textContent = 'Compte médecin';
  heading.textContent = 'Accès médecin';
  summary.textContent = 'Le compte médecin voit uniquement ses dossiers et ses paiements du jour.';
}

// Global function for form interactivity
window.toggleSpecialtyField = function() {
  const role = document.getElementById('new-user-role')?.value || 'doctor';
  const group = document.getElementById('doctor-specialty-group');
  const specialtySelect = document.getElementById('new-user-specialty');
  
  if (group) {
    if (role === 'doctor' || role === 'doctor_admin') {
      const availableSpecialties = typeof getAvailablePracticeSpecialties === 'function'
        ? getAvailablePracticeSpecialties()
        : [{ key: 'general', label: 'Médecin généraliste' }];
      const singleSpecialty = availableSpecialties.length <= 1;
      group.style.display = singleSpecialty ? 'none' : '';
      group.classList.toggle('is-visible', !singleSpecialty);
      if (specialtySelect) specialtySelect.required = true;
      if (singleSpecialty && specialtySelect) {
        specialtySelect.value = availableSpecialties[0]?.key || 'general';
      }
    } else {
      group.style.display = 'none';
      group.classList.remove('is-visible');
      if (specialtySelect) specialtySelect.required = false;
    }
  }

  updateAddUserRolePresentation(role);
};

async function addUser(event) {
  event.preventDefault();

  if (!canCurrentUserCreateAccounts()) {
    showNotification('❌ Création de comptes non autorisée', 'error');
    return;
  }

  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-user-password').value;
  const confirmPassword = document.getElementById('new-user-confirm-password').value;
  const fullName = document.getElementById('new-user-fullname').value.trim();
  const phone = document.getElementById('new-user-phone').value.trim();
  const formMode = document.getElementById('user-form-mode')?.value || 'create';
  const editingUserId = document.getElementById('editing-user-id')?.value || '';
  const roleSelect = document.getElementById('new-user-role');
  const selectedRole = roleSelect ? roleSelect.value : 'doctor';
  const role = selectedRole === 'doctor_admin' ? 'doctor' : selectedRole;
  const isDoctorAdmin = selectedRole === 'doctor_admin';
  const isEditMode = formMode === 'edit';

  // Validation
  if (password !== confirmPassword) {
    showNotification('❌ Les mots de passe ne correspondent pas', 'error');
    return;
  }

  if (!isEditMode && !password.length) {
    showNotification('❌ Le mot de passe ne peut pas être vide', 'error');
    return;
  }

  try {
    let specialty = '';
    const spSelect = document.getElementById('new-user-specialty');
    if (role === 'doctor' && spSelect) {
      const availableSpecialties = typeof getAvailablePracticeSpecialties === 'function'
        ? getAvailablePracticeSpecialties()
        : [{ key: 'general' }];
      specialty = availableSpecialties.length === 1
        ? availableSpecialties[0].key
        : spSelect.value;
    }

    const payload = {
      username,
      password,
      fullName,
      phone,
      isAdmin: isDoctorAdmin,
      ...getRequesterContext(),
      role,
      specialty
    };

    const result = isEditMode
      ? await window.api.user.update({
          ...payload,
          userId: editingUserId
        })
      : await window.api.user.add(payload);

    if (result.success) {
      closeModal('modal-add-user');
      await loadUsersList();
      
      if (!isEditMode) {
        // Show credentials in alert with better formatting
      alert(`✅ COMPTE CRÉÉ AVEC SUCCÈS!\n\n` +
            `═══════════════════════════════\n` +
            `📋 IDENTIFIANTS DE CONNEXION\n` +
            `═══════════════════════════════\n\n` +
            `👤 Nom d'utilisateur: ${username}\n` +
            `🔑 Mot de passe: ${password}\n\n` +
            `═══════════════════════════════\n\n` +
            `⚠️ IMPORTANT:\n` +
            `• Notez ces identifiants\n` +
            `• Transmettez-les au docteur de manière sécurisée\n` +
            `• Le docteur peut changer son mot de passe dans Paramètres\n\n` +
            `═══════════════════════════════`);
      
      }

      showNotification(isEditMode ? '✅ Compte modifié avec succès' : '✅ Compte créé avec succès', 'success');
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error adding user:', error);
    showNotification('❌ Erreur lors de la création', 'error');
  }
}

async function deleteUser(userId) {
  if (!canManageAccounts()) {
    showNotification('❌ Accès refusé: suppression non autorisée', 'error');
    return;
  }

  if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;

  try {
    const result = await window.api.user.delete({ userId, ...getRequesterContext() });
    if (result.success) {
      showNotification('✅ Utilisateur supprimé', 'success');
      await loadUsersList();
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    showNotification('❌ Erreur lors de la suppression', 'error');
  }
}

async function toggleUserStatus(userId) {
  if (!canManageAccounts()) {
    showNotification('❌ Accès refusé: modification non autorisée', 'error');
    return;
  }

  try {
    const result = await window.api.user.toggleActive({ userId, ...getRequesterContext() });
    if (result.success) {
      showNotification('✅ Statut modifié', 'success');
      await loadUsersList();
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error toggling user status:', error);
    showNotification('❌ Erreur', 'error');
  }
}

function generateTemporaryPassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function resetAssistantPassword(userId, username) {
  if (!canManageAccounts()) {
    showNotification('❌ Accès refusé: réinitialisation non autorisée', 'error');
    return;
  }

  const confirmed = confirm(`Changer le mot de passe du compte ${username} ?\n\nAucun ancien mot de passe n'est requis.`);
  if (!confirmed) return;

  const suggested = generateTemporaryPassword(10);
  const enteredPassword = prompt(`Nouveau mot de passe pour ${username} :`, suggested);
  if (enteredPassword === null) return;

  const newPassword = String(enteredPassword).trim();
  if (!newPassword.length) {
    showNotification('❌ Le mot de passe ne peut pas être vide', 'error');
    return;
  }

  try {
    const result = await window.api.user.managerResetPassword({
      userId,
      ...getRequesterContext(),
      newPassword
    });

    if (result.success) {
      alert(`✅ Mot de passe changé\n\n👤 Utilisateur: ${username}\n🔑 Nouveau mot de passe: ${newPassword}\n\n⚠️ Communiquez ce mot de passe à l’utilisateur en privé.`);
      showNotification('✅ Mot de passe utilisateur modifié', 'success');
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error resetting assistant password:', error);
    showNotification('❌ Erreur lors de la réinitialisation', 'error');
  }
}

async function changePassword(event) {
  event.preventDefault();

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  // Validation
  if (newPassword !== confirmPassword) {
    showNotification('❌ Les mots de passe ne correspondent pas', 'error');
    return;
  }

  if (!newPassword.length) {
    showNotification('❌ Le nouveau mot de passe ne peut pas être vide', 'error');
    return;
  }

  if (!currentUserId) {
    showNotification('❌ Erreur: utilisateur non identifié', 'error');
    return;
  }

  try {
    const result = await window.api.user.changePassword({
      userId: currentUserId,
      currentPassword,
      newPassword
    });

    if (result.success) {
      showNotification('✅ Mot de passe modifié avec succès', 'success');
      document.getElementById('change-password-form').reset();
    } else {
      showNotification('❌ Erreur: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error changing password:', error);
    showNotification('❌ Erreur lors du changement de mot de passe', 'error');
  }
}

window.openEditUserModal = openEditUserModal;

// Printing Functions

async function printPrescription(id) {
  if (typeof printPrescriptionDetails === 'function') {
    await printPrescriptionDetails(id);
    return;
  }
  showNotification('Impression ordonnance indisponible', 'error');
}

function printConsultation(id) { showNotification('Impression non implémentée', 'info'); }
function printSickLeave(id) { showNotification('Impression non implémentée', 'info'); }
function printAppointment(id) { showNotification('Impression non implémentée', 'info'); }

window.toggleUserManagementPanel = toggleUserManagementPanel;
window.refreshUsersList = refreshUsersList;
window.showAddUserModal = showAddUserModal;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;
window.resetAssistantPassword = resetAssistantPassword;
window.changePassword = changePassword;

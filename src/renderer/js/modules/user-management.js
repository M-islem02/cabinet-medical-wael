// ========== USER MANAGEMENT ==========

const USERS_PAGE_SIZE = 20;
let usersPagination = { page: 1, pageSize: USERS_PAGE_SIZE, total: 0, totalPages: 1 };
let usersSearchTerm = '';

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
  return currentUserRole === 'admin' || currentUserIsSuperAdmin === true;
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
  return currentUserIsAdmin === true || currentUserIsSuperAdmin === true;
}

function populateManagedRoleOptions(selectedRole = 'doctor') {
  const roleHidden = document.getElementById('new-user-role');
  const radios = document.querySelectorAll('input[name="new-user-role"]');
  const value = selectedRole === 'assistant' ? 'assistant' : 'doctor';

  if (roleHidden) roleHidden.value = value;
  radios.forEach((radio) => {
    radio.checked = radio.value === value;
  });
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

  if (title) title.textContent = isEditMode ? '✏️ Modifier le Compte' : '➕ Créer un Nouveau Compte';
  if (subtitle) {
    subtitle.textContent = isEditMode
      ? 'Modifiez le nom, le nom d’utilisateur, la spécialité ou le mot de passe du compte sélectionné.'
      : 'Ajoutez un médecin avec sa spécialité individuelle ou un assistant du cabinet, sans créer de second administrateur.';
  }
  if (submitBtn) submitBtn.textContent = isEditMode ? '💾 Enregistrer les modifications' : '➕ Créer le compte';
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
  return `<span style="background: #2563eb; color: white; padding: 5px 12px; border-radius: 4px; font-size: 14px;">👨‍⚕️ ${roleLabel}</span>`;
}

function renderUsersPagination() {
  const container = document.getElementById('users-pagination');
  if (!container) return;

  const total = Number(usersPagination.total || 0);
  const currentPage = Math.min(Math.max(1, Number(usersPagination.page || 1)), Math.max(1, Number(usersPagination.totalPages || 1)));
  const totalPages = Math.max(1, Number(usersPagination.totalPages || 1));

  if (total <= usersPagination.pageSize) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const start = total > 0 ? ((currentPage - 1) * usersPagination.pageSize) + 1 : 0;
  const end = total > 0 ? Math.min(currentPage * usersPagination.pageSize, total) : 0;

  container.style.display = 'flex';
  container.innerHTML = `
    <div class="patients-pagination-info">Affichage ${start}-${end} sur ${total} comptes</div>
    <div class="patients-pagination-actions">
      <button class="btn btn-small btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="changeUsersPage(-1)">◀ Précédent</button>
      <span class="patients-pagination-info">Page ${currentPage} / ${totalPages}</span>
      <button class="btn btn-small btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changeUsersPage(1)">Suivant ▶</button>
    </div>
  `;
}

async function changeUsersPage(direction) {
  const totalPages = Math.max(1, Number(usersPagination.totalPages || 1));
  const nextPage = Math.min(totalPages, Math.max(1, Number(usersPagination.page || 1) + direction));
  if (nextPage === usersPagination.page) return;
  await loadUsersList(nextPage);
}

async function loadUsersList(page = 1) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  try {
    const requesterContext = getRequesterContext();
    const result = await window.api.user.getAll({
      ...requesterContext,
      paginated: true,
      page,
      pageSize: USERS_PAGE_SIZE,
      searchTerm: usersSearchTerm
    });

    if (!result.success) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #f44336; font-size: 16px;">Erreur de chargement</td></tr>';
      renderUsersPagination();
      return;
    }

    const users = result.data || [];
    const pagination = result.pagination || { page, pageSize: USERS_PAGE_SIZE, total: users.length, totalPages: 1 };
    usersPagination = {
      page: Number(pagination.page || page),
      pageSize: Number(pagination.pageSize || USERS_PAGE_SIZE),
      total: Number(pagination.total || users.length),
      totalPages: Math.max(1, Number(pagination.totalPages || 1))
    };

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #999; font-size: 16px;">Aucun utilisateur</td></tr>';
      renderUsersPagination();
      return;
    }

    tbody.innerHTML = users.map(user => {
      const canManageUser =
        currentUserIsSuperAdmin
          ? !user.isSuperAdmin
          : (currentUserIsAdmin && !user.isSuperAdmin && user.role !== 'admin');

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
              ` : '<span style="color: #999; font-size: 14px;">Protégé</span>'}
            </div>
          ` : '<span style="color: #999; font-size: 14px;">—</span>'}
        </td>
      </tr>
    `;
    }).join('');

    renderUsersPagination();
  } catch (error) {
    console.error('Error loading users:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #f44336; font-size: 16px;">Erreur de chargement</td></tr>';
    renderUsersPagination();
  }
}

window.changeUsersPage = changeUsersPage;

function showAddUserModal() {
  if (!canCurrentUserCreateAccounts()) {
    showNotification('❌ Seuls les administrateurs peuvent ajouter des utilisateurs', 'error');
    return;
  }

  document.getElementById('add-user-form').reset();
  setUserFormMode('create');
  populateManagedRoleOptions('doctor');
  populateSpecialtyOptions();
  if (typeof window.toggleSpecialtyField === 'function') {
    window.toggleSpecialtyField();
  }
  regenerateAddUserPassword();
  showModal('modal-add-user');
}

async function openEditUserModal(userId) {
  if (!canManageAccounts()) {
    showNotification('Acces refuse: seuls les administrateurs peuvent modifier des comptes', 'error');
    return;
  }

  try {
    const result = await window.api.user.getById({ userId, ...getRequesterContext() });
    if (!result.success || !result.data) {
      showNotification(result.error || 'Utilisateur introuvable', 'error');
      return;
    }

    const user = result.data;
    const editableRole = user.role === 'assistant' ? 'assistant' : 'doctor';

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

  badge.textContent = 'Compte médecin';
  heading.textContent = 'Accès médecin';
  summary.textContent = 'Le compte médecin reçoit une spécialité individuelle qui pilote ses formulaires, ses champs et ses dossiers patients.';
}

function onAccountRoleChange(role) {
  const roleHidden = document.getElementById('new-user-role');
  if (roleHidden) roleHidden.value = role;

  const radios = document.querySelectorAll('input[name="new-user-role"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === role;
  });

  toggleSpecialtyField();
}

// Global function for form interactivity
window.toggleSpecialtyField = function() {
  const role = document.getElementById('new-user-role')?.value || 'doctor';
  const section = document.getElementById('doctor-specialty-section');
  const specialtySelect = document.getElementById('new-user-specialty');

  if (section) {
    section.classList.toggle('is-visible', role === 'doctor');
  }

  if (specialtySelect) {
    specialtySelect.required = role === 'doctor';
  }

  updateAddUserRolePresentation(role);
};

async function addUser(event) {
  event.preventDefault();

  if (!canCurrentUserCreateAccounts()) {
    showNotification('❌ Seuls les administrateurs peuvent ajouter des utilisateurs', 'error');
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
  const role = roleSelect ? roleSelect.value : 'doctor';
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
      specialty = spSelect.value;
    }

    const payload = {
      username,
      password,
      fullName,
      phone,
      isAdmin: false,
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
      invalidateUsersCache();
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
      invalidateUsersCache();
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
      invalidateUsersCache();
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

function setAddUserGeneratedPassword(value) {
  const passwordInput = document.getElementById('new-user-password');
  const confirmInput = document.getElementById('new-user-confirm-password');
  if (passwordInput) passwordInput.value = value;
  if (confirmInput) confirmInput.value = value;
}

function regenerateAddUserPassword() {
  setAddUserGeneratedPassword(generateTemporaryPassword(10));
}

async function copyAddUserPasswordToClipboard() {
  const passwordInput = document.getElementById('new-user-password');
  const password = passwordInput?.value || '';
  if (!password) return;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(password);
    } else {
      const tempInput = document.createElement('input');
      tempInput.value = password;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }
    showNotification('🔑 Mot de passe copié dans le presse-papiers', 'success');
  } catch (error) {
    console.error('Error copying password:', error);
    showNotification('Impossible de copier le mot de passe', 'error');
  }
}

const ACCOUNT_EYE_OPEN_PATH = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
const ACCOUNT_EYE_CLOSED_PATH = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

function toggleAddUserPasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;

  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  const icon = button.querySelector('svg');
  if (icon) icon.innerHTML = isHidden ? ACCOUNT_EYE_CLOSED_PATH : ACCOUNT_EYE_OPEN_PATH;
  button.setAttribute('aria-label', isHidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
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
window.onAccountRoleChange = onAccountRoleChange;
window.regenerateAddUserPassword = regenerateAddUserPassword;
window.copyAddUserPasswordToClipboard = copyAddUserPasswordToClipboard;
window.toggleAddUserPasswordVisibility = toggleAddUserPasswordVisibility;

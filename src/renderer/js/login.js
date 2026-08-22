/**
 * Script de connexion
 */

const SAVED_CREDENTIALS_KEY = 'medcareso_saved_credentials';
const SAVED_ACCOUNTS_KEY = 'medcareso_saved_accounts';
const CREDENTIALS_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSavedAccountsList() {
  const now = Date.now();
  let accounts = [];

  try {
    const rawList = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        accounts = parsed.filter(acc => acc && acc.username && acc.savedAt && (now - Number(acc.savedAt) < CREDENTIALS_VALIDITY_MS));
      }
    }
  } catch (e) {
    console.warn('Erreur lecture liste comptes:', e);
  }

  // Also include legacy single credentials if not already in list
  try {
    const rawSingle = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (rawSingle) {
      const single = JSON.parse(rawSingle);
      if (single && single.username && single.savedAt && (now - Number(single.savedAt) < CREDENTIALS_VALIDITY_MS)) {
        const existingIdx = accounts.findIndex(a => a.username.toLowerCase() === single.username.toLowerCase());
        if (existingIdx === -1) {
          accounts.unshift({
            username: single.username,
            password: single.password || '',
            savedAt: single.savedAt
          });
        }
      }
    }
  } catch (e) {
    console.warn('Erreur lecture identifiants simples:', e);
  }

  return accounts;
}

function renderSavedAccountsUI() {
  const section = document.getElementById('saved-accounts-section');
  const list = document.getElementById('saved-accounts-list');
  if (!section || !list) return;

  const accounts = getSavedAccountsList();
  if (!accounts || accounts.length === 0) {
    section.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  const currentUsername = (document.getElementById('username')?.value || '').trim().toLowerCase();

  list.innerHTML = accounts.map(acc => {
    const initial = (acc.username || 'U').charAt(0).toUpperCase();
    const isActive = acc.username.toLowerCase() === currentUsername;
    const safeUser = escapeHTML(acc.username);
    return `
      <div class="saved-account-item ${isActive ? 'active' : ''}" data-username="${safeUser}" onclick="selectSavedAccount('${safeUser}')" title="Cliquer pour se connecter avec ${safeUser}">
        <div class="saved-account-info">
          <div class="saved-account-avatar">${initial}</div>
          <div style="min-width: 0;">
            <div class="saved-account-name">${safeUser}</div>
            <div class="saved-account-role">Compte mémorisé</div>
          </div>
        </div>
        <div class="saved-account-actions">
          <button type="button" class="saved-account-btn-delete" title="Oublier ce compte" onclick="removeSavedAccount('${safeUser}', event)">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');

  section.classList.remove('hidden');
}

function selectSavedAccount(username) {
  const accounts = getSavedAccountsList();
  const acc = accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
  if (!acc) return;

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberCheckbox = document.getElementById('remember-credentials');
  const submitButton = document.querySelector('#login-form button[type="submit"]');

  if (usernameInput) usernameInput.value = acc.username;
  if (passwordInput) passwordInput.value = acc.password || '';
  if (rememberCheckbox) rememberCheckbox.checked = true;

  // Highlight active item
  document.querySelectorAll('.saved-account-item').forEach(item => {
    const itemUser = (item.dataset.username || '').toLowerCase();
    item.classList.toggle('active', itemUser === acc.username.toLowerCase());
  });

  if (submitButton) {
    submitButton.focus();
  }
}

function removeSavedAccount(username, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  let accounts = getSavedAccountsList();
  accounts = accounts.filter(a => a.username.toLowerCase() !== username.toLowerCase());
  localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));

  try {
    const rawSingle = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (rawSingle) {
      const single = JSON.parse(rawSingle);
      if (single && single.username && single.username.toLowerCase() === username.toLowerCase()) {
        localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      }
    }
  } catch (e) {}

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  if (usernameInput && usernameInput.value.trim().toLowerCase() === username.toLowerCase()) {
    if (accounts.length > 0) {
      selectSavedAccount(accounts[0].username);
    } else {
      usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      const rememberCheckbox = document.getElementById('remember-credentials');
      if (rememberCheckbox) rememberCheckbox.checked = false;
    }
  }

  renderSavedAccountsUI();
}

function loadSavedCredentials() {
  try {
    const accounts = getSavedAccountsList();
    if (accounts.length > 0) {
      const latest = accounts[0];
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const rememberCheckbox = document.getElementById('remember-credentials');
      const submitButton = document.querySelector('#login-form button[type="submit"]');

      if (usernameInput && latest.username) usernameInput.value = latest.username;
      if (passwordInput && latest.password) passwordInput.value = latest.password;
      if (rememberCheckbox) rememberCheckbox.checked = true;

      renderSavedAccountsUI();
      if (submitButton) {
        submitButton.focus();
      }
      return true;
    } else {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      localStorage.removeItem(SAVED_ACCOUNTS_KEY);
      renderSavedAccountsUI();
      return false;
    }
  } catch (e) {
    console.warn('Erreur lors de la lecture des identifiants mémorisés:', e);
    localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    localStorage.removeItem(SAVED_ACCOUNTS_KEY);
    return false;
  }
}

function persistCredentials(username, password, remember) {
  try {
    if (remember) {
      const now = Date.now();
      localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({
        username,
        password,
        savedAt: now
      }));

      let accounts = getSavedAccountsList();
      const existingIdx = accounts.findIndex(a => a.username.toLowerCase() === username.toLowerCase());
      if (existingIdx >= 0) {
        accounts[existingIdx] = { username, password, savedAt: now };
      } else {
        accounts.unshift({ username, password, savedAt: now });
      }
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
    } else {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      let accounts = getSavedAccountsList();
      accounts = accounts.filter(a => a.username.toLowerCase() !== username.toLowerCase());
      if (accounts.length > 0) {
        localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
      } else {
        localStorage.removeItem(SAVED_ACCOUNTS_KEY);
      }
    }
    renderSavedAccountsUI();
  } catch (e) {
    console.warn('Erreur lors de l\'enregistrement des identifiants:', e);
  }
}

// Charger le statut de la licence au démarrage
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const licenseStatus = await window.api.license.getStatus();
    
    if (licenseStatus) {
      const statusEl = document.getElementById('license-status');
      const textEl = document.getElementById('license-text');
      
      statusEl.className = 'license-info';
      statusEl.classList.remove('hidden');
      
      if (!licenseStatus.hasActiveLicense) {
        statusEl.classList.add('license-info');
        textEl.innerHTML = `
          <strong>🔑 Aucune licence active</strong><br>
          Seul le compte administrateur peut se connecter pour activer une clé d'essai 7 jours, une clé 1 an ou une clé illimitée.
        `;
      } else if (licenseStatus.expired) {
        statusEl.classList.add('expired');
        textEl.innerHTML = `
          <strong>⚠️ Licence expirée</strong><br>
          Votre licence a expiré le ${licenseStatus.expirationDate}.<br>
          Seul le compte administrateur peut se connecter pour la réactiver.
        `;
      } else if (licenseStatus.expirationDate === 'Illimitée' || licenseStatus.daysRemaining === null || licenseStatus.daysRemaining === undefined) {
        // Licence illimitée
        statusEl.classList.add('valid');
        textEl.innerHTML = `
          <strong>✅ Licence valide</strong><br>
          Licence permanente (sans expiration)
        `;
      } else if (licenseStatus.daysRemaining <= 30) {
        statusEl.classList.add('license-info');
        textEl.innerHTML = `
          <strong>⚠️ Licence expire bientôt</strong><br>
          ${licenseStatus.daysRemaining} jour(s) restant(s) jusqu'au ${licenseStatus.expirationDate}
        `;
      } else {
        statusEl.classList.add('valid');
        textEl.innerHTML = `
          <strong>✅ Licence valide</strong><br>
          Expire le ${licenseStatus.expirationDate} (${licenseStatus.daysRemaining} jours)
        `;
      }
    }
  } catch (error) {
    console.error('Erreur lors de la vérification de la licence:', error);
  }

  const togglePasswordBtn = document.getElementById('toggle-login-password');
  const passwordInput = document.getElementById('password');
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const shouldShow = passwordInput.type === 'password';
      passwordInput.type = shouldShow ? 'text' : 'password';
      togglePasswordBtn.textContent = shouldShow ? '🙈' : '👁';
      togglePasswordBtn.title = shouldShow ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
      togglePasswordBtn.setAttribute('aria-label', togglePasswordBtn.title);
    });
  }
  
  // Charger les identifiants enregistrés s'ils sont valides
  const hasSaved = loadSavedCredentials();
  if (!hasSaved) {
    document.getElementById('username')?.focus();
  }

  document.getElementById('username')?.addEventListener('input', (e) => {
    const current = (e.target.value || '').trim().toLowerCase();
    document.querySelectorAll('.saved-account-item').forEach(item => {
      const itemUser = (item.dataset.username || '').toLowerCase();
      item.classList.toggle('active', itemUser === current);
    });
  });
});

// Soumettre le formulaire de connexion
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const messageEl = document.getElementById('login-message');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberCheckbox = document.getElementById('remember-credentials');
  const submitButton = document.querySelector('#login-form button[type="submit"]');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  
  if (!username || !password) {
    showMessage(messageEl, '❌ Veuillez remplir tous les champs', 'error');
    return;
  }
  
  // Afficher le chargement
  setLoginButtonState(submitButton, true, 'Connexion...');
  showMessage(messageEl, '⏳ Connexion en cours...', 'loading');
  
  try {
    const result = await window.api.user.login({ username, password });
    if (result.success && !result.user) {
      throw new Error('Reponse de connexion invalide');
    }
    
    if (result.success) {
      // Sauvegarder ou effacer les identifiants selon l'option mémoriser (24h)
      persistCredentials(username, password, rememberCheckbox ? rememberCheckbox.checked : false);

      if (result.needsLicenseManagement) {
        showMessage(messageEl, '🔑 Connexion administrateur réussie. Ouvrir Paramètres > Licence pour activer une clé.', 'success');

        localStorage.setItem('currentUserId', result.user.id);
        localStorage.setItem('currentUsername', result.user.username);
        localStorage.setItem('currentUserIsAdmin', result.user.isAdmin ? 'true' : 'false');
        localStorage.setItem('currentUserIsSuperAdmin', result.user.isSuperAdmin ? 'true' : 'false');
        localStorage.setItem('currentUserRole', result.user.role || 'admin');
        localStorage.setItem('currentUserSpecialty', result.user.specialty || '');
      }
      
      if (!result.needsLicenseManagement) {
        showMessage(messageEl, '✅ Connexion réussie!', 'success');
      }
      
      localStorage.setItem('currentUserId', result.user.id);
      localStorage.setItem('currentUsername', result.user.username);
      localStorage.setItem('currentUserIsAdmin', result.user.isAdmin ? 'true' : 'false');
      localStorage.setItem('currentUserIsSuperAdmin', result.user.isSuperAdmin ? 'true' : 'false');
      localStorage.setItem('currentUserRole', result.user.role || 'doctor');
      localStorage.setItem('currentUserSpecialty', result.user.specialty || '');
      
      console.log('=== LOGIN DEBUG ===');
      console.log('User data from server:', result.user);
      console.log('  - id:', result.user.id);
      console.log('  - username:', result.user.username);
      console.log('  - isAdmin:', result.user.isAdmin);
      console.log('  - isSuperAdmin:', result.user.isSuperAdmin);
      console.log('  - role:', result.user.role);
      
      // Pass user data to main process to transfer to main window
      setLoginButtonState(submitButton, true, 'Ouverture...');
      setTimeout(async () => {
        try {
          await window.api.user.loginSuccess({
            id: result.user.id,
            username: result.user.username,
            isAdmin: result.user.isAdmin,
            isSuperAdmin: result.user.isSuperAdmin,
            role: result.user.role,
            specialty: result.user.specialty || ''
          });
        } catch (error) {
          console.error('Login session open error:', error);
          showMessage(messageEl, 'Impossible d\'ouvrir la session: ' + error.message, 'error');
          setLoginButtonState(submitButton, false);
        }
      }, 800);
    } else {
      showMessage(messageEl, '❌ ' + (result.error || 'Nom d\'utilisateur ou mot de passe incorrect'), 'error');
      
      // Effacer le mot de passe
      passwordInput.value = '';
      passwordInput.focus();
      setLoginButtonState(submitButton, false);
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    showMessage(messageEl, '❌ Erreur de connexion: ' + error.message, 'error');
  }
});

// Entrer = soumettre
// Note: Le formulaire gère déjà la soumission avec Enter nativement
// document.getElementById('password')?.addEventListener('keypress', (e) => {
//   if (e.key === 'Enter') {
//     document.getElementById('login-form').dispatchEvent(new Event('submit'));
//   }
// });

function showRecoveryInfo() {
  // Ne plus utiliser cette fonction - remplacée par le modal
  openResetModal();
}

function showMessage(element, message, type = 'info') {
  element.textContent = message;
  element.className = `message ${type}`;
  element.classList.remove('hidden');
}

function setLoginButtonState(button, isBusy, label = 'Se Connecter') {
  if (!button) return;
  button.disabled = isBusy;
  button.textContent = isBusy ? label : 'Se Connecter';
}

// ============================================
// PASSWORD RESET - CONTACT ADMIN MODAL
// ============================================

// Open the contact admin modal
function openResetModal() {
  const modal = document.getElementById('reset-password-modal');
  modal.classList.remove('hidden');
}

// Close the modal
function closeResetModal() {
  const modal = document.getElementById('reset-password-modal');
  modal.classList.add('hidden');
}

// Event listeners for modal
document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  openResetModal();
});

document.getElementById('close-reset-modal')?.addEventListener('click', closeResetModal);

// Close modal on overlay click
document.getElementById('reset-password-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'reset-password-modal') {
    closeResetModal();
  }
});

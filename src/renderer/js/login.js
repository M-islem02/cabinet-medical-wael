/**
 * Script de connexion
 */

const SAVED_CREDENTIALS_KEY = 'medcareso_saved_credentials';
const CREDENTIALS_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24 heures

function loadSavedCredentials() {
  try {
    const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && data.savedAt && (Date.now() - Number(data.savedAt) < CREDENTIALS_VALIDITY_MS)) {
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const rememberCheckbox = document.getElementById('remember-credentials');
      const submitButton = document.querySelector('#login-form button[type="submit"]');

      if (usernameInput && data.username) usernameInput.value = data.username;
      if (passwordInput && data.password) passwordInput.value = data.password;
      if (rememberCheckbox) rememberCheckbox.checked = true;
      if (submitButton) {
        submitButton.focus();
      }
      return true;
    } else {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      return false;
    }
  } catch (e) {
    console.warn('Erreur lors de la lecture des identifiants mémorisés:', e);
    localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    return false;
  }
}

function persistCredentials(username, password, remember) {
  try {
    if (remember) {
      localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify({
        username,
        password,
        savedAt: Date.now()
      }));
    } else {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    }
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
  
  // Charger les identifiants enregistrés s'ils ont moins de 24h
  const hasSaved = loadSavedCredentials();
  if (!hasSaved) {
    document.getElementById('username')?.focus();
  }
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

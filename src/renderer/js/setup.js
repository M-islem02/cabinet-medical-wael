/**
 * Script de configuration initiale
 */

// Vérifier la force du mot de passe
document.getElementById('password')?.addEventListener('input', (e) => {
  const password = e.target.value;
  const strengthEl = document.getElementById('password-strength');
  
  if (!password) {
    strengthEl.textContent = '';
    return;
  }
  
  let strength = 0;
  if (password.length >= 6) strength++;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  
  if (strength <= 2) {
    strengthEl.textContent = '⚠️ Faible';
    strengthEl.className = 'password-strength weak';
  } else if (strength <= 3) {
    strengthEl.textContent = '✓ Moyen';
    strengthEl.className = 'password-strength medium';
  } else {
    strengthEl.textContent = '✓✓ Fort';
    strengthEl.className = 'password-strength strong';
  }
});

// Soumettre le formulaire
document.getElementById('setup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const messageEl = document.getElementById('setup-message');
  
  // Récupérer les données
  const cabinetData = {
    cabinetName: document.getElementById('cabinet-name').value.trim(),
    cabinetAddress: '',
    cabinetPhone: '',
    cabinetEmail: '',
    doctorName: document.getElementById('doctor-name').value.trim(),
    doctorRPPS: '',
    doctorSpecialty: ''
  };
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const passwordConfirm = document.getElementById('password-confirm').value;
  
  // Validations
  if (password !== passwordConfirm) {
    showMessage(messageEl, '❌ Les mots de passe ne correspondent pas', 'error');
    return;
  }
  
  if (password.length < 6) {
    showMessage(messageEl, '❌ Le mot de passe doit contenir au moins 6 caractères', 'error');
    return;
  }
  
  // Validation RPPS supprimée pour compatibilité Algérie
  /*
  if (cabinetData.doctorRPPS.length !== 11 || !/^\d+$/.test(cabinetData.doctorRPPS)) {
    showMessage(messageEl, '❌ Le numéro RPPS doit contenir exactement 11 chiffres', 'error');
    return;
  }
  */
  
  // Afficher le chargement
  showMessage(messageEl, '⏳ Configuration en cours...', 'loading');
  
  try {
    // Sauvegarder les paramètres du cabinet
    const settingsResult = await window.api.settings.save(cabinetData);
    
    if (!settingsResult.success) {
      showMessage(messageEl, '❌ Erreur lors de la sauvegarde des paramètres', 'error');
      return;
    }
    
    // Créer le compte utilisateur
    const userResult = await window.api.user.create({ username, password });
    
    if (!userResult.success) {
      showMessage(messageEl, '❌ Erreur lors de la création du compte: ' + userResult.error, 'error');
      return;
    }
    
    // Succès!
    showMessage(messageEl, '✅ Configuration terminée avec succès!', 'success');
    
    // Rediriger vers l'écran de login après 2 secondes
    setTimeout(() => {
      window.api.setup.completed();
    }, 2000);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    showMessage(messageEl, '❌ Erreur: ' + error.message, 'error');
  }
});

function showMessage(element, message, type = 'info') {
  element.textContent = message;
  element.className = `message ${type}`;
  element.classList.remove('hidden');
}

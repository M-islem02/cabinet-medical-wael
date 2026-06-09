/**
 * Script de gestion de l'activation de licence
 */

/**
 * Valide et active la clé de licence
 */
function maskLicenseKey(licenseKey) {
  return licenseKey ? '*****' : '-';
}

function setLicenseKeyValue(licenseKey) {
  const input = document.getElementById('license-key');
  if (input) input.value = licenseKey;
}

function fillTrialLicenseKey() {
  setLicenseKeyValue('MEDPRO-TRIAL-7JOURS');
}

function fillAnnualLicenseKey() {
  setLicenseKeyValue('MEDPRO-ANNUELLE-1AN');
}

function fillUnlimitedLicenseKey() {
  setLicenseKeyValue('MEDPRO-ILLIMITEE-ACTIVE');
}

async function validateAndActivate() {
  const licenseKey = document.getElementById('license-key').value.trim().toUpperCase();
  const messageEl = document.getElementById('validation-message');

  if (!licenseKey) {
    showMessage(messageEl, '❌ Veuillez entrer la clé de licence', 'error');
    return;
  }

  // Vérifier le format général
  if (!licenseKey.startsWith('MEDPRO-')) {
    showMessage(messageEl, '❌ Format invalide. La clé doit commencer par MEDPRO-', 'error');
    return;
  }

  // Afficher le chargement
  showMessage(messageEl, '⏳ Vérification en cours...', 'loading');

  try {
    // Appeler le backend pour activer
    const result = await window.api.license.activate(licenseKey);

    if (result.success) {
      // Succès!
      document.getElementById('success-message').textContent = 
        `Votre licence a été activée avec succès!`;
      
      document.getElementById('license-info').innerHTML = `
        <strong>🔑 Clé :</strong> ${maskLicenseKey(licenseKey)}<br>
        <strong>💻 Status :</strong> Activé<br>
        <strong>📅 Validité :</strong> ${result.licenseType === 'trial' ? '7 jours' : (result.licenseType === 'annual' ? '1 an' : 'Illimitée')}
      `;

      const nextSteps = document.getElementById('license-next-steps');
      if (nextSteps) {
        nextSteps.innerHTML = `
          <strong>🧭 Prochaines étapes :</strong>
          <ol>
            <li>Cliquez sur "Continuer" ci-dessous.</li>
            <li>Connectez-vous avec le compte admin: <code>admin</code> / <code>admin2024</code></li>
            <li>Changez le mot de passe admin dans les paramètres.</li>
            <li>Créez des comptes Docteur et Assistant selon vos besoins.</li>
          </ol>
        `;
      }
      
      showStep('step-success');
    } else {
      // Use reason from backend if available
      const errorMsg = result.reason || result.error || 'Activation échouée';
      showMessage(messageEl, `❌ Erreur: ${errorMsg}`, 'error');
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    showMessage(messageEl, `❌ Erreur: ${error.message}`, 'error');
  }
}

function showStep(stepId) {
  document.querySelectorAll('.step').forEach(step => {
    step.classList.remove('active');
  });

  const step = document.getElementById(stepId);
  if (step) {
    step.classList.add('active');
    if (stepId === 'step-activation') {
      document.getElementById('license-key').focus();
    }
  }
}

function continueToApp() {
  console.log('🚀 Continuer vers l\'application...');
  try {
    window.api.license.activated();
    console.log('✅ Signal envoyé au processus principal');
  } catch (error) {
    console.error('❌ Erreur:', error);
    alert('Erreur: ' + error.message);
  }
}

function showMessage(element, message, type = 'info') {
  element.innerHTML = message;
  element.className = `message ${type}`;
  element.classList.remove('hidden');
}

window.fillTrialLicenseKey = fillTrialLicenseKey;
window.fillAnnualLicenseKey = fillAnnualLicenseKey;
window.fillUnlimitedLicenseKey = fillUnlimitedLicenseKey;

// Focus sur le champ de licence au chargement
document.addEventListener('DOMContentLoaded', () => {
  const licenseInput = document.getElementById('license-key');
  if (licenseInput) {
    licenseInput.value = '';
    licenseInput.focus();
  }
});

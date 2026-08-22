/**
 * Script de gestion de l'activation et génération de licence
 */

let selectedSignedLicenseContent = '';
let currentMachineId = '';
let lastGeneratedTokenResult = null;

function maskLicenseKey(licenseKey) {
  return licenseKey ? '*****' : '-';
}

function switchTab(tab) {
  const btnActivation = document.getElementById('tab-btn-activation');
  const btnGenerator = document.getElementById('tab-btn-generator');
  const stepActivation = document.getElementById('step-activation');
  const stepGenerator = document.getElementById('step-generator');

  if (tab === 'generator') {
    btnActivation.classList.remove('active');
    btnGenerator.classList.add('active');
    stepActivation.classList.remove('active');
    stepGenerator.classList.add('active');
    if (!document.getElementById('gen-expiry-date').value) {
      setPresetDuration(12); // Default 1 year
    }
  } else {
    btnGenerator.classList.remove('active');
    btnActivation.classList.add('active');
    stepGenerator.classList.remove('active');
    stepActivation.classList.add('active');
  }
}

function setPresetDays(days) {
  const dateInput = document.getElementById('gen-expiry-date');
  if (!dateInput) return;
  const now = new Date();
  now.setDate(now.getDate() + Number(days));
  dateInput.value = now.toISOString().split('T')[0];
}

function setPresetDuration(months) {
  const dateInput = document.getElementById('gen-expiry-date');
  if (months === 0) {
    dateInput.value = '';
    return;
  }
  const now = new Date();
  now.setMonth(now.getMonth() + months);
  dateInput.value = now.toISOString().split('T')[0];
}

async function useCurrentMachineId() {
  if (currentMachineId) {
    document.getElementById('gen-device-id').value = currentMachineId;
  } else {
    try {
      const res = await window.api.license.getMachineId();
      if (res?.success) {
        currentMachineId = res.machineId;
        document.getElementById('gen-device-id').value = currentMachineId;
      }
    } catch (_) {}
  }
}

async function generateClientToken() {
  const deviceId = document.getElementById('gen-device-id').value.trim();
  const clientName = document.getElementById('gen-client-name').value.trim();
  const expiryDate = document.getElementById('gen-expiry-date').value;
  const msgEl = document.getElementById('gen-message');
  const resultBox = document.getElementById('gen-result-box');
  const outputEl = document.getElementById('gen-token-output');

  if (!deviceId) {
    showMessage(msgEl, 'Veuillez saisir le Device ID (Machine ID) du client', 'error');
    return;
  }

  showMessage(msgEl, 'Génération du token signé en cours...', 'loading');

  try {
    const result = await window.api.license.generateClientToken({
      machineId: deviceId,
      cabinetName: clientName || 'Cabinet Médical',
      expiresAt: expiryDate || null
    });

    if (result && result.success) {
      lastGeneratedTokenResult = result;
      showMessage(msgEl, '✅ Token de licence généré avec succès!', 'success');
      outputEl.textContent = result.jsonContent;
      resultBox.style.display = 'block';
    } else {
      showMessage(msgEl, `❌ Erreur: ${result?.error || 'Génération échouée'}`, 'error');
    }
  } catch (err) {
    console.error('Erreur génération licence:', err);
    showMessage(msgEl, `❌ Erreur: ${err.message}`, 'error');
  }
}

async function copyGeneratedToken() {
  if (!lastGeneratedTokenResult?.jsonContent) return;
  try {
    await navigator.clipboard.writeText(lastGeneratedTokenResult.jsonContent);
    alert('📋 Fichier/Token de licence copié dans le presse-papier !');
  } catch (_) {
    alert('Faites Ctrl+C pour copier le contenu dans la zone de texte.');
  }
}

async function saveGeneratedFile() {
  if (!lastGeneratedTokenResult?.jsonContent) return;
  try {
    const filename = `licence_${(lastGeneratedTokenResult.cabinetName || 'client').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const res = await window.api.license.saveToFile({
      jsonContent: lastGeneratedTokenResult.jsonContent,
      defaultFilename: filename
    });
    if (res?.success) {
      alert(`💾 Fichier enregistré avec succès sous :\n${res.filePath}`);
    }
  } catch (err) {
    alert('Erreur lors de la sauvegarde : ' + err.message);
  }
}

async function activateGeneratedLocally() {
  if (!lastGeneratedTokenResult?.jsonContent) return;
  selectedSignedLicenseContent = lastGeneratedTokenResult.jsonContent;
  switchTab('activation');
  document.getElementById('license-key').value = 'Licence Générée (Prête à activer)';
  await validateAndActivate();
}

async function chooseLicenseFile() {
  const result = await window.api.license.chooseFile();
  if (result?.canceled) return;
  if (!result?.success) {
    showMessage(document.getElementById('validation-message'), result?.error || 'Licence illisible', 'error');
    return;
  }
  selectedSignedLicenseContent = result.content;
  const input = document.getElementById('license-key');
  if (input) input.value = result.fileName || 'Licence sélectionnée';
}

async function validateAndActivate() {
  const jsonInput = document.getElementById('license-json-input')?.value?.trim();
  const licenseKey = jsonInput || selectedSignedLicenseContent;
  const messageEl = document.getElementById('validation-message');

  if (!licenseKey) {
    showMessage(messageEl, 'Veuillez coller le JSON de la licence ou choisir un fichier .json', 'error');
    return;
  }

  showMessage(messageEl, 'Vérification cryptographique en cours...', 'loading');

  try {
    const result = await window.api.license.activate(licenseKey);

    if (result.success) {
      document.getElementById('success-message').textContent = 
        `Votre licence a été activée avec succès!`;
      
      document.getElementById('license-info').innerHTML = `
        <strong>Licence :</strong> ${maskLicenseKey(result.licenseId)}<br>
        <strong>Client :</strong> ${result.clientName || 'Cabinet'}<br>
        <strong>Statut :</strong> Signature vérifiée<br>
        <strong>Validité :</strong> ${result.expirationDate || 'Illimitée'}
      `;

      const nextSteps = document.getElementById('license-next-steps');
      if (nextSteps) {
        nextSteps.innerHTML = `
          <strong>🧭 Prochaines étapes :</strong>
          <ol>
            <li>Cliquez sur "Continuer" ci-dessous.</li>
            <li>Connectez-vous avec vos identifiants administrateur.</li>
          </ol>
        `;
      }
      
      showStep('step-success');
    } else {
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
  }
}

function continueToApp() {
  try {
    window.api.license.activated();
  } catch (error) {
    console.error('❌ Erreur:', error);
    alert('Erreur: ' + error.message);
  }
}

function showMessage(element, message, type = 'info') {
  if (!element) return;
  element.innerHTML = message;
  element.className = `message ${type}`;
  element.classList.remove('hidden');
}

window.chooseLicenseFile = chooseLicenseFile;
window.validateAndActivate = validateAndActivate;
window.switchTab = switchTab;
window.setPresetDays = setPresetDays;
window.setPresetDuration = setPresetDuration;
window.useCurrentMachineId = useCurrentMachineId;
window.generateClientToken = generateClientToken;
window.copyGeneratedToken = copyGeneratedToken;
window.saveGeneratedFile = saveGeneratedFile;
window.activateGeneratedLocally = activateGeneratedLocally;
window.continueToApp = continueToApp;

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash === '#generator' || window.location.search.includes('mode=generator')) {
    switchTab('generator');
    const tabsContainer = document.querySelector('.license-tabs');
    if (tabsContainer) {
      tabsContainer.style.display = 'none';
    }
    const subtitleEl = document.querySelector('.header .subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = '⚡ Outil Développeur — Génération de Licence Client (Ed25519)';
    }
  }

  window.api.license.getMachineId().then((result) => {
    if (result?.success) {
      currentMachineId = result.machineId;
      const target = document.getElementById('machine-id-value');
      if (target) target.textContent = currentMachineId;
    }
  }).catch(() => {});
});

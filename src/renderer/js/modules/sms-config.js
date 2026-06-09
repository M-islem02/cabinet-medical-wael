// ========== SMS CONFIG MODULE ==========
// UI for configuring SMS reminders via GSM modem or API

let currentSMSMode = 'modem';
const DEFAULT_CABINET_PHONE = '0542893268';
const DEFAULT_REMINDER_TEMPLATE = 'Rappel: Votre RDV au cabinet {cabinet} est prevu le {date} a {heure}. Merci de confirmer.';
const DEFAULT_APPOINTMENT_TEMPLATE = 'Bonjour {patient}, votre RDV au cabinet {cabinet} est enregistre pour le {date} a {heure} ({type}). Contact: {phone}.';

async function initSMSConfig() {
  await refreshSMSPorts();
  await loadSMSConfigUI();
  await loadSMSLog();
}

async function getPreferredCabinetPhone() {
  try {
    if (typeof ensureSettingsLoaded === 'function') {
      await ensureSettingsLoaded();
    }
  } catch (error) {
    console.warn('Unable to pre-load settings for SMS screen:', error);
  }

  return (cachedSettings?.cabinetPhone || DEFAULT_CABINET_PHONE).trim();
}

async function loadSMSConfigUI() {
  try {
    const result = await window.api.sms.getConfig();
    const preferredCabinetPhone = await getPreferredCabinetPhone();

    if (result.success && result.data) {
      const c = result.data;
      document.getElementById('sms-enabled').checked = c.enabled || false;
      currentSMSMode = c.mode || 'modem';
      setSMSMode(currentSMSMode);

      // Modem fields
      if (c.port) {
        const select = document.getElementById('sms-port');
        let found = false;
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].value === c.port) { select.selectedIndex = i; found = true; break; }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = c.port; opt.textContent = c.port;
          select.appendChild(opt); select.value = c.port;
        }
      }
      document.getElementById('sms-baud').value = c.baudRate || 9600;
      document.getElementById('sms-country-code').value = c.countryCode || '+213';

      // API fields
      document.getElementById('sms-api-provider').value = c.apiProvider || 'twilio';
      document.getElementById('sms-api-url').value = c.apiUrl || '';
      document.getElementById('sms-api-key').value = c.apiKey || '';
      document.getElementById('sms-api-sid').value = c.apiSid || '';
      document.getElementById('sms-api-token').value = c.apiToken || '';
      document.getElementById('sms-api-from').value = c.apiFrom || preferredCabinetPhone;

      // Reminder
      document.getElementById('sms-reminder-template').value = c.reminderTemplate || DEFAULT_REMINDER_TEMPLATE;
      document.getElementById('sms-appointment-template').value = c.appointmentTemplate || DEFAULT_APPOINTMENT_TEMPLATE;
      document.getElementById('sms-hours-before').value = c.reminderHoursBefore || 24;
      document.getElementById('sms-auto-send').checked = c.autoSendReminders || false;
      document.getElementById('sms-auto-send-create').checked = c.autoSendOnCreate !== false;
    }

    if (!document.getElementById('sms-test-phone').value) {
      document.getElementById('sms-test-phone').value = preferredCabinetPhone;
    }
  } catch (e) { console.error('Error loading SMS config:', e); }
}

function setSMSMode(mode) {
  currentSMSMode = mode;
  document.getElementById('sms-modem-config').style.display = mode === 'modem' ? 'block' : 'none';
  document.getElementById('sms-api-config').style.display = mode === 'api' ? 'block' : 'none';
  document.getElementById('sms-mode-modem').style.borderColor = mode === 'modem' ? '#3b82f6' : '#e5e7eb';
  document.getElementById('sms-mode-modem').style.background = mode === 'modem' ? '#eff6ff' : '#fff';
  document.getElementById('sms-mode-api').style.borderColor = mode === 'api' ? '#3b82f6' : '#e5e7eb';
  document.getElementById('sms-mode-api').style.background = mode === 'api' ? '#eff6ff' : '#fff';
}

function toggleSMSEnabled() {
  // Just toggles the checkbox; saved on saveSMSConfig
}

async function refreshSMSPorts() {
  try {
    const result = await window.api.sms.listPorts();
    const select = document.getElementById('sms-port');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Sélectionner --</option>';
    if (result.success && result.data) {
      result.data.forEach(function(p) {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = p.path + ' (' + p.manufacturer + ')';
        select.appendChild(opt);
      });
    }
    if (currentValue) {
      select.value = currentValue;
    }
  } catch (e) { console.error('Error listing ports:', e); }
}

async function saveSMSConfig() {
  try {
    const config = {
      enabled: document.getElementById('sms-enabled').checked,
      mode: currentSMSMode,
      port: document.getElementById('sms-port').value,
      baudRate: parseInt(document.getElementById('sms-baud').value) || 9600,
      countryCode: document.getElementById('sms-country-code').value || '+213',
      apiProvider: document.getElementById('sms-api-provider').value,
      apiUrl: document.getElementById('sms-api-url').value,
      apiKey: document.getElementById('sms-api-key').value,
      apiSid: document.getElementById('sms-api-sid').value,
      apiToken: document.getElementById('sms-api-token').value,
      apiFrom: document.getElementById('sms-api-from').value,
      reminderTemplate: document.getElementById('sms-reminder-template').value,
      appointmentTemplate: document.getElementById('sms-appointment-template').value,
      reminderHoursBefore: parseInt(document.getElementById('sms-hours-before').value) || 24,
      autoSendReminders: document.getElementById('sms-auto-send').checked,
      autoSendOnCreate: document.getElementById('sms-auto-send-create').checked
    };
    const result = await window.api.sms.saveConfig(config);
    if (result.success) {
      showNotification('Configuration SMS sauvegardée ✓', 'success');
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) {
    showNotification('Erreur lors de la sauvegarde', 'error');
  }
}

async function sendTestSMS() {
  const phone = document.getElementById('sms-test-phone').value;
  if (!phone) { showNotification('Entrez un numéro de test', 'error'); return; }
  const resultDiv = document.getElementById('sms-test-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span style="color:#f59e0b">⏳ Envoi en cours...</span>';
  try {
    const result = await window.api.sms.sendTest(phone, 'Test SMS MedCareSO ✓ - ' + new Date().toLocaleString());
    if (result.success) {
      resultDiv.innerHTML = '<span style="color:#16a34a">✅ SMS envoyé avec succès!</span>';
      showNotification('SMS test envoyé!', 'success');
    } else {
      resultDiv.innerHTML = '<span style="color:#ef4444">❌ Échec: ' + (result.error || 'Erreur inconnue') + '</span>';
    }
    await loadSMSLog();
  } catch (e) {
    resultDiv.innerHTML = '<span style="color:#ef4444">❌ Erreur: ' + e.message + '</span>';
  }
}

async function checkSMSReminders() {
  try {
    showNotification('Vérification des rappels...', 'info');
    await window.api.sms.checkReminders();
    showNotification('Vérification terminée', 'success');
    await loadSMSLog();
  } catch (e) {
    showNotification('Erreur: ' + e.message, 'error');
  }
}

async function loadSMSLog() {
  const container = document.getElementById('sms-log-container');
  if (!container) return;
  try {
    const result = await window.api.sms.getLog(30);
    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px">Aucun SMS envoyé</p>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f8fafc">' +
      '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Date</th>' +
      '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Téléphone</th>' +
      '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Message</th>' +
      '<th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb">Statut</th>' +
      '</tr></thead><tbody>';
    result.data.forEach(function(log) {
      const ok = log.status === 'sent';
      const errorText = log.errorMessage ? ` title="${String(log.errorMessage).replace(/"/g, '&quot;')}"` : '';
      html += '<tr style="border-bottom:1px solid #f3f4f6">' +
        '<td style="padding:8px;color:#6b7280">' + (log.sentAt || '—') + '</td>' +
        '<td style="padding:8px;font-weight:600">' + log.phoneNumber + '</td>' +
        '<td style="padding:8px;color:#374151;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (log.message || '') + '</td>' +
        '<td style="padding:8px;text-align:center"><span' + errorText + ' style="padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;background:' + (ok ? '#dcfce7' : '#fee2e2') + ';color:' + (ok ? '#166534' : '#991b1b') + '">' + (ok ? '✓ Envoyé' : '✕ Échoué') + '</span></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:red">Erreur de chargement</p>';
  }
}

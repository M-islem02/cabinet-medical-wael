// ========== CLOUD SYNC MODULE ==========
// UI for cloud synchronization and local backups

let currentSyncProvider = 'rest';

async function initCloudSync() {
  await loadSyncConfigUI();
  await loadSyncStorageInfo();
  await loadBackupsList();
  await loadSyncLog();
  await checkOnlineStatus();
}

async function loadSyncConfigUI() {
  try {
    const result = await window.api.cloudSync.getConfig();
    if (result.success && result.data) {
      const c = result.data;
      document.getElementById('sync-enabled').checked = c.enabled || false;
      currentSyncProvider = c.provider === 'mariadb' ? 'rest' : (c.provider || 'rest');
      setSyncProvider(currentSyncProvider);

      document.getElementById('sync-api-url').value = c.apiUrl || '';
      document.getElementById('sync-api-key').value = c.apiKey || '';
      document.getElementById('sync-remote-host').value = c.remoteHost || '';
      document.getElementById('sync-remote-port').value = c.remotePort || 5432;
      document.getElementById('sync-remote-user').value = c.remoteUser || '';
      document.getElementById('sync-remote-pass').value = c.remotePassword || '';
      document.getElementById('sync-remote-db').value = c.remoteDatabase || '';
      document.getElementById('sync-backup-dir').value = c.backupDirectory || '';
      document.getElementById('sync-interval').value = c.syncIntervalMinutes || 1440;
      document.getElementById('sync-auto').checked = c.autoSync !== false;

      const dailyEnabledEl = document.getElementById('sync-daily-backup-enabled');
      const dailyTimeEl = document.getElementById('sync-daily-backup-time');
      const dailyPushEl = document.getElementById('sync-daily-push');
      const telegramEnabledEl = document.getElementById('sync-telegram-enabled');
      const telegramTokenEl = document.getElementById('sync-telegram-token');
      const telegramChatEl = document.getElementById('sync-telegram-chat');

      if (dailyEnabledEl) dailyEnabledEl.checked = c.dailyBackupEnabled !== false;
      if (dailyTimeEl) dailyTimeEl.value = c.dailyBackupTime || '23:55';
      if (dailyPushEl) dailyPushEl.checked = c.autoPushEndOfDay || false;
      const encryptionEnabledEl = document.getElementById('sync-backup-encryption-enabled');
      const passphraseEl = document.getElementById('sync-backup-password');
      if (encryptionEnabledEl) encryptionEnabledEl.checked = !!c.backupEncryptionEnabled;
      if (passphraseEl) passphraseEl.value = c.backupPassphrase || '';
      if (telegramEnabledEl) telegramEnabledEl.checked = c.telegramEnabled || false;
      if (telegramTokenEl) telegramTokenEl.value = c.telegramBotToken || '';
      if (telegramChatEl) telegramChatEl.value = c.telegramChatId || '';

      if (c.lastSyncAt) {
        document.getElementById('sync-status-text').textContent = 'Dernière sync: ' + c.lastSyncAt;
      }
    }
  } catch (e) { console.error('Error loading sync config:', e); }
}

async function loadSyncStorageInfo() {
  try {
    const result = await window.api.cloudSync.getStorageInfo();
    const locationEl = document.getElementById('sync-storage-location');
    if (!locationEl) return;

    if (result.success && result.data) {
      const encryptionText = result.data.backupEncryptionEnabled ? 'Chiffrement activé' : 'Chiffrement désactivé';
      locationEl.textContent = `Emplacement backup local: ${result.data.backupDirectory} • ${encryptionText}`;
      const backupInput = document.getElementById('sync-backup-dir');
      if (backupInput && !backupInput.value) {
        backupInput.value = result.data.configuredBackupDirectory || result.data.backupDirectory || '';
      }
    } else {
      locationEl.textContent = 'Emplacement backup: indisponible';
    }
  } catch (error) {
    console.error('Error loading sync storage info:', error);
  }
}

function setSyncProvider(provider) {
  provider = provider === 'mariadb' ? 'rest' : provider;
  currentSyncProvider = provider;
  document.getElementById('sync-rest-config').style.display = provider === 'rest' ? 'grid' : 'none';
  document.getElementById('sync-mariadb-config').style.display = 'none';
  document.getElementById('sync-prov-rest').style.borderColor = provider === 'rest' ? '#3b82f6' : '#e5e7eb';
  document.getElementById('sync-prov-rest').style.background = provider === 'rest' ? '#eff6ff' : '#fff';
}

function toggleSyncEnabled() { /* saved on button click */ }

async function saveSyncConfig() {
  try {
    const dailyEnabledEl = document.getElementById('sync-daily-backup-enabled');
    const dailyTimeEl = document.getElementById('sync-daily-backup-time');
    const dailyPushEl = document.getElementById('sync-daily-push');
    const telegramEnabledEl = document.getElementById('sync-telegram-enabled');
    const telegramTokenEl = document.getElementById('sync-telegram-token');
    const telegramChatEl = document.getElementById('sync-telegram-chat');
    const encryptionEnabledEl = document.getElementById('sync-backup-encryption-enabled');
    const passphraseEl = document.getElementById('sync-backup-password');

    const config = {
      enabled: document.getElementById('sync-enabled').checked,
      provider: currentSyncProvider,
      apiUrl: document.getElementById('sync-api-url').value,
      apiKey: document.getElementById('sync-api-key').value,
      remoteHost: document.getElementById('sync-remote-host').value,
      remotePort: parseInt(document.getElementById('sync-remote-port').value) || 5432,
      remoteUser: document.getElementById('sync-remote-user').value,
      remotePassword: document.getElementById('sync-remote-pass').value,
      remoteDatabase: document.getElementById('sync-remote-db').value,
      syncIntervalMinutes: parseInt(document.getElementById('sync-interval').value) || 1440,
      autoSync: document.getElementById('sync-auto').checked,
      backupDirectory: (document.getElementById('sync-backup-dir')?.value || '').trim(),
      dailyBackupEnabled: dailyEnabledEl ? dailyEnabledEl.checked : true,
      dailyBackupTime: dailyTimeEl ? (dailyTimeEl.value || '23:55') : '23:55',
      autoPushEndOfDay: dailyPushEl ? dailyPushEl.checked : false,
      backupEncryptionEnabled: encryptionEnabledEl ? encryptionEnabledEl.checked : true,
      backupPassphrase: passphraseEl ? passphraseEl.value : '',
      telegramEnabled: telegramEnabledEl ? telegramEnabledEl.checked : false,
      telegramBotToken: telegramTokenEl ? telegramTokenEl.value : '',
      telegramChatId: telegramChatEl ? telegramChatEl.value : ''
    };

    if (config.backupEncryptionEnabled && !String(config.backupPassphrase || '').trim()) {
      showNotification('Veuillez renseigner un mot de passe pour les sauvegardes chiffrées', 'warning');
      return;
    }
    const result = await window.api.cloudSync.saveConfig(config);
    if (result.success) {
      showNotification('Configuration cloud sauvegardée ✓', 'success');
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) {
    showNotification('Erreur', 'error');
  }
}

async function chooseSyncBackupDirectory() {
  try {
    const result = await window.api.dialog.open({
      properties: ['openDirectory', 'createDirectory']
    });
    if (!result?.canceled && Array.isArray(result?.filePaths) && result.filePaths[0]) {
      const input = document.getElementById('sync-backup-dir');
      if (input) input.value = result.filePaths[0];
    }
  } catch (error) {
    showNotification('Erreur sélection dossier: ' + error.message, 'error');
  }
}

async function syncNow() {
  try {
    showNotification('⏳ Synchronisation en cours...', 'info');
    const result = await window.api.cloudSync.syncNow();
    if (result.success) {
      if (result.backupOnly) {
        showNotification('✅ ' + (result.message || 'Backup local créé'), 'success');
      } else {
        showNotification('✅ Synchronisation réussie + backup local créé', 'success');
      }
      document.getElementById('sync-status-text').textContent = 'Dernière sync: ' + new Date().toLocaleString('fr-FR');
    } else {
      showNotification('❌ ' + (result.error || 'Échec de synchronisation'), 'error');
    }
    await loadSyncLog();
  } catch (e) {
    showNotification('Erreur: ' + e.message, 'error');
  }
}

async function createLocalBackup() {
  try {
    showNotification('💾 Création du backup...', 'info');
    const result = await window.api.cloudSync.createBackup();
    if (result.success) {
      showNotification('✅ Sauvegarde créée: ' + result.fileName, 'success');
      await loadBackupsList();
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) {
    showNotification('Erreur: ' + e.message, 'error');
  }
}

function downloadBackupArtifact(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportDataBundle() {
  try {
    showNotification('📤 Export du bundle en cours...', 'info');
    const result = await window.api.cloudSync.exportBundle();
    if (result?.success) {
      showNotification('✅ Bundle exporté: ' + (result.fileName || ''), 'success');
    } else if (!result?.cancelled) {
      showNotification('❌ ' + (result?.error || 'Export impossible'), 'error');
    }
  } catch (e) {
    showNotification('Erreur: ' + e.message, 'error');
  }
}

async function importBackupBundle() {
  try {
    const selection = await window.api.dialog.open({
      properties: ['openFile'],
      filters: [
        { name: 'Bundles MedCareSO', extensions: ['zip', 'json'] },
        { name: 'Bundles chiffrés MedCareSO', extensions: ['medbackup'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    });

    if (selection?.canceled || !selection?.filePaths?.[0]) {
      return;
    }

    await restoreBackup(selection.filePaths[0]);
  } catch (error) {
    showNotification('Erreur import bundle: ' + error.message, 'error');
  }
}

async function checkOnlineStatus() {
  try {
    const result = await window.api.cloudSync.checkOnline();
    const badge = document.getElementById('sync-online-badge');
    if (badge) {
      if (result.success && result.online) {
        badge.innerHTML = '🟢 En ligne';
        badge.style.background = 'rgba(34,197,94,0.3)';
      } else {
        badge.innerHTML = '🔴 Hors ligne';
        badge.style.background = 'rgba(239,68,68,0.3)';
      }
    }
    return result;
  } catch (e) {
    const badge = document.getElementById('sync-online-badge');
    if (badge) { badge.innerHTML = '🔴 Hors ligne'; badge.style.background = 'rgba(239,68,68,0.3)'; }
    return { success: false, online: false };
  }
}

async function verifyCloudConnection() {
  const result = await checkOnlineStatus();
  if (result?.success && result.online) {
    showNotification('✅ Connexion internet disponible', 'success');
  } else {
    showNotification('⚠️ Connexion internet indisponible', 'warning');
  }
}

async function testTelegramBackup() {
  try {
    showNotification('📨 Test Telegram ZIP en cours...', 'info');
    const result = await window.api.cloudSync.testTelegram();
    if (result?.success) {
      showNotification('✅ ZIP envoyé sur Telegram: ' + (result.fileName || ''), 'success');
      await loadBackupsList();
      await loadSyncLog();
    } else {
      showNotification('❌ ' + (result?.error || 'Échec test Telegram'), 'error');
    }
  } catch (error) {
    showNotification('❌ Erreur test Telegram: ' + error.message, 'error');
  }
}

async function loadBackupsList() {
  const container = document.getElementById('backups-list-container');
  if (!container) return;
  try {
    const result = await window.api.cloudSync.listBackups();
    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px">Aucune sauvegarde locale</p>';
      return;
    }
    let html = '';
    result.data.forEach(function(b) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #f3f4f6">' +
        '<div>' +
        '<strong style="font-size:13px">' + b.baseName + '</strong>' +
        '<p style="margin:2px 0 0;color:#6b7280;font-size:12px">' + b.sizeHuman + ' • ' + (b.formatLabel || 'Sauvegarde') + ' • ' + new Date(b.createdAt).toLocaleString('fr-FR') + '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
        '<button onclick="restoreBackup(\'' + (b.encryptedPath || b.zipPath || b.path).replace(/'/g, "\\'") + '\')" class="btn btn-warning" style="font-size:11px;padding:5px 12px">🔄 Restaurer</button>' +
        '</div>' +
        '</div>';
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:red">Erreur de chargement</p>';
  }
}

async function openBackupFile(filePath, label) {
  if (!filePath) {
    showNotification('Fichier introuvable', 'error');
    return;
  }

  try {
    const result = await window.api.system.openFile(filePath);
    if (!result?.success) {
      showNotification('Impossible d\'ouvrir le ' + (label || 'fichier'), 'error');
    }
  } catch (error) {
    showNotification('Erreur ouverture ' + (label || 'fichier') + ': ' + error.message, 'error');
  }
}

async function restoreBackup(filePath) {
  if (!confirm('⚠️ Restaurer cette sauvegarde ?\nLes données existantes seront mises à jour.')) return;
  try {
    showNotification('🔄 Restauration en cours...', 'info');
    const passphrase = (document.getElementById('sync-backup-password')?.value || '').trim();
    const result = await window.api.cloudSync.restore({ filePath, passphrase });
    if (result.success) {
      showNotification('✅ Restauration terminée (' + result.restoredRows + ' lignes, ' + (result.restoredFiles || 0) + ' fichiers)', 'success');
    } else {
      showNotification('Erreur: ' + result.error, 'error');
    }
  } catch (e) {
    showNotification('Erreur: ' + e.message, 'error');
  }
}

async function loadSyncLog() {
  const container = document.getElementById('sync-log-container');
  if (!container) return;
  try {
    const result = await window.api.cloudSync.getLog(15);
    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:20px">Aucune synchronisation</p>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f8fafc">' +
      '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Date</th>' +
      '<th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Type</th>' +
      '<th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb">Statut</th>' +
      '</tr></thead><tbody>';
    result.data.forEach(function(log) {
      const ok = log.status === 'success';
      html += '<tr style="border-bottom:1px solid #f3f4f6">' +
        '<td style="padding:8px;color:#6b7280">' + (log.syncedAt || '—') + '</td>' +
        '<td style="padding:8px;font-weight:600">' + (log.syncType === 'push' ? '⬆️ Push' : '⬇️ Pull') + '</td>' +
        '<td style="padding:8px;text-align:center"><span style="padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;background:' + (ok ? '#dcfce7' : '#fee2e2') + ';color:' + (ok ? '#166534' : '#991b1b') + '">' + (ok ? '✓ Succès' : '✕ Échoué') + '</span></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:red">Erreur</p>';
  }
}

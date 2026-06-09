/**
 * Gestionnaire IPC pour les paramètres
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { syncPublicBookingServerWithSettings } from '../services/public-booking-service.js';
import { getCurrentSettingsOwnerUserId, getScopedSettings, getScopedSettingsId } from '../services/settings-scope-service.js';

function normalizeDocumentTypeColors(rawValue) {
  const fallback = {
    prescription: '#1a8c7e',
    certificate: '#0ea5e9',
    invoice: '#f59e0b',
    rapport: '#8b5cf6',
    consultation: '#ef4444',
    generic: '#1a8c7e'
  };

  const normalizeHex = (value, fallbackHex) => {
    const safe = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(safe) ? safe : fallbackHex;
  };

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    return JSON.stringify({
      prescription: normalizeHex(parsed?.prescription, fallback.prescription),
      certificate: normalizeHex(parsed?.certificate, fallback.certificate),
      invoice: normalizeHex(parsed?.invoice, fallback.invoice),
      rapport: normalizeHex(parsed?.rapport, fallback.rapport),
      consultation: normalizeHex(parsed?.consultation, fallback.consultation),
      generic: normalizeHex(parsed?.generic, fallback.generic)
    });
  } catch (_) {
    return JSON.stringify(fallback);
  }
}

export function handleSettingsEvents() {
  // Récupérer les paramètres
  ipcMain.handle('settings:get', async () => {
    try {
      const settings = await getScopedSettings();

      if (!settings) {
        return { success: true, data: {} };
      }

      return { success: true, data: settings };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des paramètres:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour les paramètres
  ipcMain.handle('settings:update', async (event, settingsData) => {
    console.log('⚙️ settings:update called', settingsData);
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const ownerUserId = getCurrentSettingsOwnerUserId();
      const existingSettings = await getScopedSettingsId(ownerUserId);

      if (existingSettings) {
        // Mettre à jour
        console.log('⚙️ Updating existing settings');
        await run(
          `UPDATE settings 
           SET cabinetName = ?, cabinetAddress = ?, cabinetPhone = ?, cabinetEmail = ?,
               doctorName = ?, doctorRPPS = ?, doctorSpecialty = ?, documentColorMode = ?, documentPrimaryColor = ?, documentTypeColors = ?, documentTextScale = ?, documentLogoScale = ?, documentStyleVariant = ?, documentWatermarkOpacity = ?, documentHideSignature = ?, preferredPrinter = ?, preferredScanner = ?, preferredThermalPrinter = ?,
               publicBookingEnabled = ?, publicBookingPort = ?, publicBookingPublicUrl = ?, publicBookingQrEnabled = ?, cabinetLogoDataUrl = ?, cabinetWatermarkLogoDataUrl = ?, updatedAt = ?
           WHERE id = ?`,
          [
            settingsData.cabinetName,
            settingsData.cabinetAddress,
            settingsData.cabinetPhone,
            settingsData.cabinetEmail,
            settingsData.doctorName,
            settingsData.doctorRPPS,
            settingsData.doctorSpecialty,
            settingsData.documentColorMode === 'bw' ? 'bw' : 'color',
            /^#[0-9a-fA-F]{6}$/.test(String(settingsData.documentPrimaryColor || '').trim()) ? String(settingsData.documentPrimaryColor).trim() : '#1a8c7e',
            normalizeDocumentTypeColors(settingsData.documentTypeColors),
            Math.min(120, Math.max(90, Number(settingsData.documentTextScale) || 100)),
            Math.min(200, Math.max(80, Number(settingsData.documentLogoScale) || 90)),
            settingsData.documentStyleVariant === 'modern' ? 'modern' : 'classic',
            Math.min(35, Math.max(2, Number(settingsData.documentWatermarkOpacity) || 5)),
            settingsData.documentHideSignature ? 1 : 0,
            settingsData.preferredPrinter || null,
            settingsData.preferredScanner || null,
            settingsData.preferredThermalPrinter || null,
            settingsData.publicBookingEnabled ? 1 : 0,
            settingsData.publicBookingPort || 4580,
            settingsData.publicBookingPublicUrl || null,
            settingsData.publicBookingQrEnabled === false ? 0 : 1,
            settingsData.cabinetLogoDataUrl || null,
            settingsData.cabinetWatermarkLogoDataUrl || null,
            now,
            existingSettings.id
          ]
        );
      } else {
        // Créer
        console.log('⚙️ Creating new settings');
        const id = uuidv4();
        await run(
          `INSERT INTO settings 
           (id, ownerUserId, cabinetName, cabinetAddress, cabinetPhone, cabinetEmail, doctorName, doctorRPPS, doctorSpecialty, documentColorMode, documentPrimaryColor, documentTypeColors, documentTextScale, documentLogoScale, documentStyleVariant, documentWatermarkOpacity, documentHideSignature,
            preferredPrinter, preferredScanner, preferredThermalPrinter, publicBookingEnabled, publicBookingPort,
            publicBookingPublicUrl, publicBookingQrEnabled, cabinetLogoDataUrl, cabinetWatermarkLogoDataUrl, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            ownerUserId,
            settingsData.cabinetName,
            settingsData.cabinetAddress,
            settingsData.cabinetPhone,
            settingsData.cabinetEmail,
            settingsData.doctorName,
            settingsData.doctorRPPS,
            settingsData.doctorSpecialty,
            settingsData.documentColorMode === 'bw' ? 'bw' : 'color',
            /^#[0-9a-fA-F]{6}$/.test(String(settingsData.documentPrimaryColor || '').trim()) ? String(settingsData.documentPrimaryColor).trim() : '#1a8c7e',
            normalizeDocumentTypeColors(settingsData.documentTypeColors),
            Math.min(120, Math.max(90, Number(settingsData.documentTextScale) || 100)),
            Math.min(200, Math.max(80, Number(settingsData.documentLogoScale) || 90)),
            settingsData.documentStyleVariant === 'modern' ? 'modern' : 'classic',
            Math.min(35, Math.max(2, Number(settingsData.documentWatermarkOpacity) || 5)),
            settingsData.documentHideSignature ? 1 : 0,
            settingsData.preferredPrinter || null,
            settingsData.preferredScanner || null,
            settingsData.preferredThermalPrinter || null,
            settingsData.publicBookingEnabled ? 1 : 0,
            settingsData.publicBookingPort || 4580,
            settingsData.publicBookingPublicUrl || null,
            settingsData.publicBookingQrEnabled === false ? 0 : 1,
            settingsData.cabinetLogoDataUrl || null,
            settingsData.cabinetWatermarkLogoDataUrl || null,
            now
          ]
        );
      }

      const bookingSyncResult = await syncPublicBookingServerWithSettings();
      console.log('✅ Settings saved successfully');
      return { success: true, warning: bookingSyncResult.success ? null : bookingSyncResult.error };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des paramètres:', error);
      return { success: false, error: error.message };
    }
  });

  // Alias pour save (même comportement que update)
  ipcMain.handle('settings:save', async (event, settingsData) => {
    console.log('⚙️ settings:save called', settingsData);
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const ownerUserId = getCurrentSettingsOwnerUserId();
      const existingSettings = await getScopedSettingsId(ownerUserId);

      if (existingSettings) {
        // Mettre à jour
        console.log('⚙️ Updating existing settings (save)');
        await run(
          `UPDATE settings 
           SET cabinetName = ?, cabinetAddress = ?, cabinetPhone = ?, cabinetEmail = ?,
               doctorName = ?, doctorRPPS = ?, doctorSpecialty = ?, documentColorMode = ?, documentPrimaryColor = ?, documentTypeColors = ?, documentTextScale = ?, documentLogoScale = ?, documentStyleVariant = ?, documentWatermarkOpacity = ?, documentHideSignature = ?, preferredPrinter = ?, preferredScanner = ?, preferredThermalPrinter = ?,
               publicBookingEnabled = ?, publicBookingPort = ?, publicBookingPublicUrl = ?, publicBookingQrEnabled = ?, cabinetLogoDataUrl = ?, cabinetWatermarkLogoDataUrl = ?, updatedAt = ?
           WHERE id = ?`,
          [
            settingsData.cabinetName,
            settingsData.cabinetAddress,
            settingsData.cabinetPhone,
            settingsData.cabinetEmail,
            settingsData.doctorName,
            settingsData.doctorRPPS,
            settingsData.doctorSpecialty,
            settingsData.documentColorMode === 'bw' ? 'bw' : 'color',
            /^#[0-9a-fA-F]{6}$/.test(String(settingsData.documentPrimaryColor || '').trim()) ? String(settingsData.documentPrimaryColor).trim() : '#1a8c7e',
            normalizeDocumentTypeColors(settingsData.documentTypeColors),
            Math.min(120, Math.max(90, Number(settingsData.documentTextScale) || 100)),
            Math.min(200, Math.max(80, Number(settingsData.documentLogoScale) || 90)),
            settingsData.documentStyleVariant === 'modern' ? 'modern' : 'classic',
            Math.min(35, Math.max(2, Number(settingsData.documentWatermarkOpacity) || 5)),
            settingsData.documentHideSignature ? 1 : 0,
            settingsData.preferredPrinter || null,
            settingsData.preferredScanner || null,
            settingsData.preferredThermalPrinter || null,
            settingsData.publicBookingEnabled ? 1 : 0,
            settingsData.publicBookingPort || 4580,
            settingsData.publicBookingPublicUrl || null,
            settingsData.publicBookingQrEnabled === false ? 0 : 1,
            settingsData.cabinetLogoDataUrl || null,
            settingsData.cabinetWatermarkLogoDataUrl || null,
            now,
            existingSettings.id
          ]
        );
      } else {
        // Créer
        console.log('⚙️ Creating new settings (save)');
        const id = uuidv4();
        await run(
          `INSERT INTO settings 
           (id, ownerUserId, cabinetName, cabinetAddress, cabinetPhone, cabinetEmail, doctorName, doctorRPPS, doctorSpecialty, documentColorMode, documentPrimaryColor, documentTypeColors, documentTextScale, documentLogoScale, documentStyleVariant, documentWatermarkOpacity, documentHideSignature,
            preferredPrinter, preferredScanner, preferredThermalPrinter, publicBookingEnabled, publicBookingPort,
            publicBookingPublicUrl, publicBookingQrEnabled, cabinetLogoDataUrl, cabinetWatermarkLogoDataUrl, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            ownerUserId,
            settingsData.cabinetName,
            settingsData.cabinetAddress,
            settingsData.cabinetPhone,
            settingsData.cabinetEmail,
            settingsData.doctorName,
            settingsData.doctorRPPS,
            settingsData.doctorSpecialty,
            settingsData.documentColorMode === 'bw' ? 'bw' : 'color',
            /^#[0-9a-fA-F]{6}$/.test(String(settingsData.documentPrimaryColor || '').trim()) ? String(settingsData.documentPrimaryColor).trim() : '#1a8c7e',
            normalizeDocumentTypeColors(settingsData.documentTypeColors),
            Math.min(120, Math.max(90, Number(settingsData.documentTextScale) || 100)),
            Math.min(200, Math.max(80, Number(settingsData.documentLogoScale) || 90)),
            settingsData.documentStyleVariant === 'modern' ? 'modern' : 'classic',
            Math.min(35, Math.max(2, Number(settingsData.documentWatermarkOpacity) || 5)),
            settingsData.documentHideSignature ? 1 : 0,
            settingsData.preferredPrinter || null,
            settingsData.preferredScanner || null,
            settingsData.preferredThermalPrinter || null,
            settingsData.publicBookingEnabled ? 1 : 0,
            settingsData.publicBookingPort || 4580,
            settingsData.publicBookingPublicUrl || null,
            settingsData.publicBookingQrEnabled === false ? 0 : 1,
            settingsData.cabinetLogoDataUrl || null,
            settingsData.cabinetWatermarkLogoDataUrl || null,
            now
          ]
        );
      }

      const bookingSyncResult = await syncPublicBookingServerWithSettings();
      console.log('✅ Settings saved successfully (save)');
      return { success: true, warning: bookingSyncResult.success ? null : bookingSyncResult.error };
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des paramètres:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:listPrinters', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win || !win.webContents) {
        return { success: true, data: [] };
      }
      const printers = await win.webContents.getPrintersAsync();
      return {
        success: true,
        data: (printers || []).map((p) => ({
          name: p.name,
          displayName: p.displayName || p.name,
          isDefault: !!p.isDefault,
          status: p.status || 0
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:listScanners', async () => {
    try {
      const scanners = await new Promise((resolve) => {
        exec('scanimage -L', { timeout: 8000 }, (error, stdout) => {
          if (error || !stdout) {
            resolve([]);
            return;
          }

          const parsed = stdout
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('device `'))
            .map((line) => {
              const match = line.match(/^device `([^`]+)' is (.+)$/i);
              if (!match) return null;
              return {
                id: match[1],
                label: match[2] || match[1]
              };
            })
            .filter(Boolean);

          resolve(parsed);
        });
      });

      return { success: true, data: scanners };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

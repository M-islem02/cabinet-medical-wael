/**
 * Gestionnaire IPC pour les paramètres
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { BrowserWindow, dialog } from 'electron';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
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

// Stocke une carte { typeDeDocument: valeur } en JSON (formats de page, tailles de texte…)
function normalizeDocumentTypeMap(rawValue) {
  try {
    const parsed = typeof rawValue === 'string' ? (rawValue.trim() ? JSON.parse(rawValue) : {}) : rawValue;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const clean = {};
    Object.entries(parsed).forEach(([key, val]) => {
      if (!key) return;
      if (typeof val === 'string' && val.trim()) clean[key] = val.trim();
      else if (Number.isFinite(Number(val))) clean[key] = Number(val);
    });
    return Object.keys(clean).length ? JSON.stringify(clean) : null;
  } catch (_) {
    return null;
  }
}

function normalizeDocumentStyleVariant(value) {
  const raw = String(value || '').trim();
  if (raw === 'modern') return 'gradient-header';
  return [
    'classic', 'sidebar', 'gradient-header', 'minimal',
    'letterhead', 'dental-letterhead', 'professional-center',
    'executive', 'clinical-grid', 'wave'
  ].includes(raw) ? raw : 'classic';
}

let settingsColumnsEnsured = false;
async function ensureSettingsColumns() {
  if (settingsColumnsEnsured) return;
  const columnsToAdd = [
    { name: 'documentDoctorNameScale', type: 'INTEGER DEFAULT 120' },
    { name: 'documentSpecialtyScale', type: 'INTEGER DEFAULT 100' },
    { name: 'documentMetaScale', type: 'INTEGER DEFAULT 100' },
    { name: 'defaultDocumentPageSize', type: "TEXT DEFAULT 'A5'" },
    { name: 'documentFontFamily', type: "TEXT DEFAULT 'segoe'" },
    { name: 'documentBonPourTitle', type: "TEXT DEFAULT 'Demande de Bilan'" },
    { name: 'documentFormats', type: 'TEXT' },
    { name: 'documentTextScales', type: 'TEXT' },
    { name: 'documentLogoScale', type: 'INTEGER DEFAULT 90' }
  ];

  for (const col of columnsToAdd) {
    try {
      await run(`ALTER TABLE settings ADD COLUMN ${col.name} ${col.type}`);
    } catch (_) {
      // Column already exists or table alteration not supported
    }
  }
  settingsColumnsEnsured = true;
}

export function handleSettingsEvents() {
  ipcMain.handle('settings:chooseAppLogo', async () => {
    try {
      const ownerWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(ownerWindow, {
        title: 'Choisir le logo de l’application',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
      });
      if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };

      const filePath = result.filePaths[0];
      const buffer = await fs.readFile(filePath);
      if (buffer.length > 5 * 1024 * 1024) {
        return { success: false, error: 'Logo trop lourd (maximum 5 Mo)' };
      }
      const extension = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.svg': 'image/svg+xml'
      };
      const mimeType = mimeTypes[extension];
      if (!mimeType) return { success: false, error: 'Format de logo non pris en charge' };
      return {
        success: true,
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        fileName: path.basename(filePath)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:claimPracticeAdmin', async () => {
    try {
      const current = global.currentUser || {};
      const practitionerRoles = [
        'doctor', 'dentist', 'kinesitherapeute', 'ergotherapeute',
        'orthophoniste', 'nurse'
      ];
      const roleAliases = {
        medecin: 'doctor', 'médecin': 'doctor', dentiste: 'dentist',
        kine: 'kinesitherapeute', 'kiné': 'kinesitherapeute',
        infirmier: 'nurse', infirmiere: 'nurse', 'infirmière': 'nurse'
      };
      const rawRole = String(current.role || '').trim().toLowerCase();
      const normalizedRole = roleAliases[rawRole] || rawRole;
      if (!current.id || !practitionerRoles.includes(normalizedRole)) {
        return { success: false, error: 'Seul un praticien actif peut administrer le cabinet' };
      }
      if (current.isSuperAdmin) {
        return { success: false, error: 'Le super administrateur ne peut pas devenir médecin administrateur' };
      }
      if (current.isAdmin) return { success: true, claimed: false };

      const existingAdmin = await queryOne(
        `SELECT id, fullName FROM users
         WHERE isActive = TRUE AND isAdmin = TRUE AND COALESCE(isSuperAdmin, FALSE) = FALSE
         LIMIT 1`
      );
      if (existingAdmin?.id) {
        return {
          success: false,
          error: `Accès réservé au médecin administrateur${existingAdmin.fullName ? ` (${existingAdmin.fullName})` : ''}`
        };
      }

      await run('UPDATE users SET isAdmin = TRUE, role = ? WHERE id = ? AND isActive = TRUE', [normalizedRole, current.id]);
      global.currentUser = { ...current, role: normalizedRole, isAdmin: true };
      return { success: true, claimed: true };
    } catch (error) {
      console.error('Erreur lors de la récupération du rôle administrateur:', error);
      return { success: false, error: error.message };
    }
  });

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

  async function saveOrUpdateSettings(settingsData) {
    await ensureSettingsColumns();
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const ownerUserId = getCurrentSettingsOwnerUserId();
    const existing = await getScopedSettings(ownerUserId);

    const merged = {
      cabinetName: settingsData.cabinetName !== undefined ? settingsData.cabinetName : (existing?.cabinetName || ''),
      cabinetAddress: settingsData.cabinetAddress !== undefined ? settingsData.cabinetAddress : (existing?.cabinetAddress || ''),
      cabinetPhone: settingsData.cabinetPhone !== undefined ? settingsData.cabinetPhone : (existing?.cabinetPhone || ''),
      cabinetEmail: settingsData.cabinetEmail !== undefined ? settingsData.cabinetEmail : (existing?.cabinetEmail || ''),
      doctorName: settingsData.doctorName !== undefined ? settingsData.doctorName : (existing?.doctorName || ''),
      doctorRPPS: settingsData.doctorRPPS !== undefined ? settingsData.doctorRPPS : (existing?.doctorRPPS || ''),
      doctorSpecialty: settingsData.doctorSpecialty !== undefined ? settingsData.doctorSpecialty : (existing?.doctorSpecialty || ''),
      documentColorMode: (settingsData.documentColorMode || existing?.documentColorMode) === 'bw' ? 'bw' : 'color',
      documentPrimaryColor: /^#[0-9a-fA-F]{6}$/.test(String(settingsData.documentPrimaryColor || '').trim())
        ? String(settingsData.documentPrimaryColor).trim()
        : (existing?.documentPrimaryColor || '#1a8c7e'),
      documentTypeColors: settingsData.documentTypeColors
        ? normalizeDocumentTypeColors(settingsData.documentTypeColors)
        : (existing?.documentTypeColors || normalizeDocumentTypeColors(null)),
      documentTextScale: Math.min(120, Math.max(90, Number(settingsData.documentTextScale || existing?.documentTextScale) || 100)),
      documentLogoScale: Math.min(200, Math.max(80, Number(settingsData.documentLogoScale || existing?.documentLogoScale) || 90)),
      documentStyleVariant: normalizeDocumentStyleVariant(settingsData.documentStyleVariant || existing?.documentStyleVariant),
      documentWatermarkOpacity: Math.min(35, Math.max(2, Number(settingsData.documentWatermarkOpacity || existing?.documentWatermarkOpacity) || 5)),
      documentHideSignature: settingsData.documentHideSignature !== undefined
        ? (settingsData.documentHideSignature ? 1 : 0)
        : (existing?.documentHideSignature ? 1 : 0),
      documentShowBarcode: settingsData.documentShowBarcode !== undefined
        ? (settingsData.documentShowBarcode === false ? 0 : 1)
        : (existing?.documentShowBarcode === 0 || existing?.documentShowBarcode === false ? 0 : 1),
      preferredPrinter: settingsData.preferredPrinter !== undefined ? settingsData.preferredPrinter : (existing?.preferredPrinter || null),
      preferredScanner: settingsData.preferredScanner !== undefined ? settingsData.preferredScanner : (existing?.preferredScanner || null),
      preferredThermalPrinter: settingsData.preferredThermalPrinter !== undefined ? settingsData.preferredThermalPrinter : (existing?.preferredThermalPrinter || null),
      autoPrintAppointmentTicket: settingsData.autoPrintAppointmentTicket !== undefined
        ? (settingsData.autoPrintAppointmentTicket ? 1 : 0)
        : (existing?.autoPrintAppointmentTicket ? 1 : 0),
      publicBookingEnabled: settingsData.publicBookingEnabled !== undefined
        ? (settingsData.publicBookingEnabled ? 1 : 0)
        : (existing?.publicBookingEnabled ? 1 : 0),
      publicBookingPort: settingsData.publicBookingPort || existing?.publicBookingPort || 4580,
      publicBookingPublicUrl: settingsData.publicBookingPublicUrl !== undefined ? settingsData.publicBookingPublicUrl : (existing?.publicBookingPublicUrl || null),
      publicBookingQrEnabled: settingsData.publicBookingQrEnabled !== undefined
        ? (settingsData.publicBookingQrEnabled === false ? 0 : 1)
        : (existing?.publicBookingQrEnabled === 0 ? 0 : 1),
      appLogoDataUrl: (settingsData.appLogoDataUrl && String(settingsData.appLogoDataUrl).trim())
        ? String(settingsData.appLogoDataUrl).trim()
        : (settingsData.clearAppLogo ? null : (existing?.appLogoDataUrl || null)),
      cabinetLogoDataUrl: (settingsData.cabinetLogoDataUrl && String(settingsData.cabinetLogoDataUrl).trim())
        ? String(settingsData.cabinetLogoDataUrl).trim()
        : (settingsData.clearCabinetLogo ? null : (existing?.cabinetLogoDataUrl || null)),
      cabinetWatermarkLogoDataUrl: (settingsData.cabinetWatermarkLogoDataUrl && String(settingsData.cabinetWatermarkLogoDataUrl).trim())
        ? String(settingsData.cabinetWatermarkLogoDataUrl).trim()
        : (settingsData.clearWatermarkLogo ? null : (existing?.cabinetWatermarkLogoDataUrl || null)),
      customTreatmentTypes: settingsData.customTreatmentTypes !== undefined ? settingsData.customTreatmentTypes : (existing?.customTreatmentTypes || null),
      documentFormats: settingsData.documentFormats !== undefined
        ? normalizeDocumentTypeMap(settingsData.documentFormats)
        : (existing?.documentFormats || null),
      documentTextScales: settingsData.documentTextScales !== undefined
        ? normalizeDocumentTypeMap(settingsData.documentTextScales)
        : (existing?.documentTextScales || null),
      defaultDocumentPageSize: String(settingsData.defaultDocumentPageSize || existing?.defaultDocumentPageSize || 'A5').toUpperCase() === 'A4' ? 'A4' : 'A5',
      documentFontFamily: String(settingsData.documentFontFamily || existing?.documentFontFamily || 'segoe').trim(),
      documentBonPourTitle: String(settingsData.documentBonPourTitle || existing?.documentBonPourTitle || 'Demande de Bilan').trim(),
      documentDoctorNameScale: Math.min(160, Math.max(70, Number(settingsData.documentDoctorNameScale || existing?.documentDoctorNameScale) || 120)),
      documentSpecialtyScale: Math.min(150, Math.max(70, Number(settingsData.documentSpecialtyScale || existing?.documentSpecialtyScale) || 100)),
      documentMetaScale: Math.min(150, Math.max(70, Number(settingsData.documentMetaScale || existing?.documentMetaScale) || 100))
    };

    if (existing?.id) {
      console.log('⚙️ Updating existing settings row:', existing.id);
      await run(
        `UPDATE settings 
         SET cabinetName = ?, cabinetAddress = ?, cabinetPhone = ?, cabinetEmail = ?,
             doctorName = ?, doctorRPPS = ?, doctorSpecialty = ?, documentColorMode = ?, documentPrimaryColor = ?, documentTypeColors = ?, documentTextScale = ?, documentLogoScale = ?, documentStyleVariant = ?, documentWatermarkOpacity = ?, documentHideSignature = ?, documentShowBarcode = ?, preferredPrinter = ?, preferredScanner = ?, preferredThermalPrinter = ?, autoPrintAppointmentTicket = ?,
             publicBookingEnabled = ?, publicBookingPort = ?, publicBookingPublicUrl = ?, publicBookingQrEnabled = ?, appLogoDataUrl = ?, cabinetLogoDataUrl = ?, cabinetWatermarkLogoDataUrl = ?, customTreatmentTypes = ?, documentFormats = ?, documentTextScales = ?, defaultDocumentPageSize = ?, documentFontFamily = ?, documentBonPourTitle = ?, documentDoctorNameScale = ?, documentSpecialtyScale = ?, documentMetaScale = ?, updatedAt = ?
           WHERE id = ?`,
        [
          merged.cabinetName, merged.cabinetAddress, merged.cabinetPhone, merged.cabinetEmail,
          merged.doctorName, merged.doctorRPPS, merged.doctorSpecialty, merged.documentColorMode,
          merged.documentPrimaryColor, merged.documentTypeColors, merged.documentTextScale,
          merged.documentLogoScale, merged.documentStyleVariant, merged.documentWatermarkOpacity,
          merged.documentHideSignature, merged.documentShowBarcode, merged.preferredPrinter,
          merged.preferredScanner, merged.preferredThermalPrinter, merged.autoPrintAppointmentTicket,
          merged.publicBookingEnabled, merged.publicBookingPort, merged.publicBookingPublicUrl,
          merged.publicBookingQrEnabled, merged.appLogoDataUrl, merged.cabinetLogoDataUrl,
          merged.cabinetWatermarkLogoDataUrl, merged.customTreatmentTypes, merged.documentFormats,
          merged.documentTextScales, merged.defaultDocumentPageSize, merged.documentFontFamily,
          merged.documentBonPourTitle, merged.documentDoctorNameScale, merged.documentSpecialtyScale,
          merged.documentMetaScale, now, existing.id
        ]
      );
    } else {
      console.log('⚙️ Creating new settings row');
      const id = uuidv4();
      await run(
        `INSERT INTO settings 
         (id, ownerUserId, cabinetName, cabinetAddress, cabinetPhone, cabinetEmail, doctorName, doctorRPPS, doctorSpecialty, documentColorMode, documentPrimaryColor, documentTypeColors, documentTextScale, documentLogoScale, documentStyleVariant, documentWatermarkOpacity, documentHideSignature, documentShowBarcode,
          preferredPrinter, preferredScanner, preferredThermalPrinter, autoPrintAppointmentTicket, publicBookingEnabled, publicBookingPort,
          publicBookingPublicUrl, publicBookingQrEnabled, appLogoDataUrl, cabinetLogoDataUrl, cabinetWatermarkLogoDataUrl, customTreatmentTypes, documentFormats, documentTextScales, defaultDocumentPageSize, documentFontFamily, documentBonPourTitle, documentDoctorNameScale, documentSpecialtyScale, documentMetaScale, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, ownerUserId, merged.cabinetName, merged.cabinetAddress, merged.cabinetPhone,
          merged.cabinetEmail, merged.doctorName, merged.doctorRPPS, merged.doctorSpecialty,
          merged.documentColorMode, merged.documentPrimaryColor, merged.documentTypeColors,
          merged.documentTextScale, merged.documentLogoScale, merged.documentStyleVariant,
          merged.documentWatermarkOpacity, merged.documentHideSignature, merged.documentShowBarcode,
          merged.preferredPrinter, merged.preferredScanner, merged.preferredThermalPrinter,
          merged.autoPrintAppointmentTicket, merged.publicBookingEnabled, merged.publicBookingPort,
          merged.publicBookingPublicUrl, merged.publicBookingQrEnabled, merged.appLogoDataUrl,
          merged.cabinetLogoDataUrl, merged.cabinetWatermarkLogoDataUrl, merged.customTreatmentTypes,
          merged.documentFormats, merged.documentTextScales, merged.defaultDocumentPageSize,
          merged.documentFontFamily, merged.documentBonPourTitle, merged.documentDoctorNameScale,
          merged.documentSpecialtyScale, merged.documentMetaScale, now
        ]
      );
    }

    const bookingSyncResult = await syncPublicBookingServerWithSettings();
    console.log('✅ Settings saved successfully');
    return { success: true, warning: bookingSyncResult.success ? null : bookingSyncResult.error };
  }

  // Mettre à jour les paramètres
  ipcMain.handle('settings:update', async (event, settingsData) => {
    console.log('⚙️ settings:update called', settingsData);
    try {
      return await saveOrUpdateSettings(settingsData);
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des paramètres:', error);
      return { success: false, error: error.message };
    }
  });

  // Alias pour save (même comportement que update)
  ipcMain.handle('settings:save', async (event, settingsData) => {
    console.log('⚙️ settings:save called', settingsData);
    try {
      return await saveOrUpdateSettings(settingsData);
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

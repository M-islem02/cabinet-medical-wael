/**
 * Processus principal Electron.js
 * PhysioCare - Gestion de Cabinet de MÃ©decine Physique et Fonctionnelle
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, closeDatabase, query, queryOne, getCurrentMode } from './database-unified.js';
import { seedTestData } from './database.js';
import {
  validateLicense, 
  activateLicense, 
  deactivateLicense,
  checkLicenseAtStartup,
  getLicenseStatus
} from './license-manager.js';
import {
  clearLoginSession,
  getCurrentBootTimeMs,
  isSameBoot,
  persistLoginSession,
  readLoginSession
} from './session-manager.js';
import { handlePatientEvents } from './handlers/patient-handler.js';
import { handleConsultationEvents } from './handlers/consultation-handler.js';
import { handlePrescriptionEvents } from './handlers/prescription-handler.js';
import { handleSickLeaveEvents } from './handlers/sick-leave-handler.js';
import { handleAppointmentEvents } from './handlers/appointment-handler.js';
import { handleSettingsEvents } from './handlers/settings-handler.js';
import { handleUserEvents } from './handlers/user-handler.js';
import { handlePaymentEvents } from './handlers/payment-handler.js';
import { handleFileEvents } from './handlers/file-handler.js';
import { setupPDFHandlers } from './handlers/pdf-handler.js';
import { handleDocumentEvents } from './handlers/document-handler.js';
import { handleExpenseEvents } from './handlers/expense-handler.js';
import { handleInventoryEvents } from './handlers/inventory-handler.js';
import { handleAnalysisEvents } from './handlers/analysis-handler.js';
import { handleDebtEvents } from './handlers/debt-handler.js';
import { handleMedicationEvents } from './handlers/medication-handler.js';
import { handleNotificationEvents } from './handlers/notification-handler.js';
import { handleRehabilitationEvents } from './handlers/rehabilitation-handler.js';
import { handleWaitingRoomEvents } from './handlers/waiting-room-handler.js';
import { handlePackageEvents } from './handlers/package-handler.js';
import { handleDentistEvents } from './handlers/dentist-handler.js';
import { handleSMSEvents } from './handlers/sms-handler.js';
import { handleCloudSyncEvents } from './handlers/cloud-sync-handler.js';
import { handlePrintEvents } from './handlers/print-handler.js';
import { setupOllamaHandlers, startOllamaServer } from './services/ollama-service.js';
import { setupDbConfigHandlers, createDbConfigWindow, isMariaDBMode, loadDatabaseConfig } from './handlers/db-config-handler.js';
import {
  handlePublicBookingEvents,
  initializePublicBookingServer,
  stopPublicBookingServer
} from './services/public-booking-service.js';
import { getResponsiveWindowBounds, applyWindowPresentation } from './window-utils.js';
import fs from 'fs';

function normalizeTerminalText(value) {
  let text = String(value ?? '');

  if (/[ÃÂâðÔ├]/.test(text)) {
    try {
      const repaired = Buffer.from(text, 'latin1').toString('utf8');
      if (repaired && !repaired.includes('\uFFFD')) {
        text = repaired;
      }
    } catch (_) {
      // Keep original text if repair fails.
    }
  }

  return text
    .replace(/[\u200D\uFE0F]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u2026/g, '...')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/['"`]{2,}/g, '')
    .replace(/\bKin(?=(?:\b|\s+(?:staff|tables|session|sessions)))/g, 'Kine')
    .split('\n')
    .map((line) => line
      .replace(/^[^A-Za-z0-9[(]+/g, '')
      .replace(/([A-Za-z0-9])[`'"|\\/.,;:~_-]{2,}([A-Za-z0-9])/g, '$1 $2')
      .replace(/[ \t]+$/g, '')
    )
    .join('\n');
}

function sanitizeConsoleArg(arg) {
  if (typeof arg === 'string') {
    return normalizeTerminalText(arg);
  }

  if (arg instanceof Error) {
    return normalizeTerminalText(arg.stack || arg.message || String(arg));
  }

  return arg;
}

function installTerminalConsoleSanitizer() {
  ['log', 'info', 'warn', 'error'].forEach((method) => {
    const original = console[method].bind(console);
    console[method] = (...args) => original(...args.map(sanitizeConsoleArg));
  });
}

installTerminalConsoleSanitizer();

function normalizeAppUserRole(role) {
  return role === 'director' ? 'doctor' : String(role || '').trim();
}

function getScopedUserContext() {
  const role = normalizeAppUserRole(global.currentUser?.role);
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin: !!(global.currentUser?.isAdmin || global.currentUser?.isSuperAdmin),
    isPractitioner: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant'
  };
}

function getScopedPatientFilter(userContext, patientAlias = 'patients') {
  if (userContext.isPractitioner && userContext.userId) {
    return { clause: `${patientAlias}.primaryDoctorId = ?`, params: [userContext.userId] };
  }

  if (userContext.isAssistant && userContext.userId) {
    return { clause: `${patientAlias}.createdByUserId = ?`, params: [userContext.userId] };
  }

  return { clause: '', params: [] };
}

function getScopedConsultationFilter(userContext, consultationAlias = 'consultations', patientAlias = 'patients') {
  if (userContext.isPractitioner && userContext.userId) {
    return { clause: `${consultationAlias}.doctorId = ?`, params: [userContext.userId] };
  }

  if (userContext.isAssistant && userContext.userId) {
    return { clause: `${patientAlias}.createdByUserId = ?`, params: [userContext.userId] };
  }

  return { clause: '', params: [] };
}

function getScopedPrescriptionFilter(userContext, prescriptionAlias = 'pr', patientAlias = 'p', consultationAlias = 'c') {
  if (userContext.isPractitioner && userContext.userId) {
    return {
      clause: `(${consultationAlias}.doctorId = ? OR (${consultationAlias}.doctorId IS NULL AND ${patientAlias}.primaryDoctorId = ?))`,
      params: [userContext.userId, userContext.userId]
    };
  }

  if (userContext.isAssistant && userContext.userId) {
    return { clause: `${patientAlias}.createdByUserId = ?`, params: [userContext.userId] };
  }

  return { clause: '', params: [] };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stableUserDataPath = path.join(app.getPath('appData'), 'physiocare');

// Keep packaged and dev builds on the same data directory so login and data stay consistent.
fs.mkdirSync(stableUserDataPath, { recursive: true });
app.setPath('userData', stableUserDataPath);

app.commandLine.appendSwitch('lang', 'fr-FR');
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-pinch');

// ===== PREVENT EPIPE CRASHES =====
// When stdout/stderr pipe breaks (e.g. piped to head), silently ignore
process.stdout?.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); });
process.stderr?.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); });
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.message?.includes('EPIPE')) return;
  console.error('Uncaught Exception:', err);
});

// ===== MULTI-INSTANCE AUTORISÃ‰E =====
// Permet de lancer plusieurs instances pour tester doctor/assistant simultanÃ©ment
// const gotTheLock = app.requestSingleInstanceLock();
// if (!gotTheLock) {
//   console.log('âš ï¸ Une instance de PhysioCare est dÃ©jÃ  en cours d\'exÃ©cution');
//   app.quit();
// }

let mainWindow = null;
let licenseWindow = null;
let setupWindow = null;
let loginWindow = null;
let shutdownCleanupStarted = false;

function getAppWindowTitle(section = '') {
  const baseTitle = `MedCareSO v${app.getVersion()}`;
  return section ? `${baseTitle} - ${section}` : baseTitle;
}

function performShutdownCleanup() {
  if (shutdownCleanupStarted) {
    return;
  }

  shutdownCleanupStarted = true;
  stopPublicBookingServer();
  closeDatabase();
}

// GÃ©rer la seconde instance (dÃ©sactivÃ© - multi-instance autorisÃ©e)
// app.on('second-instance', (event, commandLine, workingDirectory) => {
//   if (mainWindow) {
//     if (mainWindow.isMinimized()) mainWindow.restore();
//     mainWindow.focus();
//   } else if (loginWindow) {
//     if (loginWindow.isMinimized()) loginWindow.restore();
//     loginWindow.focus();
//   } else if (licenseWindow) {
//     if (licenseWindow.isMinimized()) licenseWindow.restore();
//     licenseWindow.focus();
//   }
// });

/**
 * CrÃ©e la fenÃªtre principale de l'application
 */
function createMainWindow() {
  // Ã‰viter la crÃ©ation multiple
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  const bounds = getResponsiveWindowBounds({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 680,
    marginX: 48,
    marginY: 48
  });

  mainWindow = new BrowserWindow({
    ...bounds,
    title: getAppWindowTitle(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(mainWindow, { maximizeOnShow: true });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * CrÃ©e la fenÃªtre d'activation de licence
 */
function createLicenseWindow() {
  const bounds = getResponsiveWindowBounds({
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 560,
    marginX: 88,
    marginY: 88
  });

  licenseWindow = new BrowserWindow({
    ...bounds,
    title: getAppWindowTitle('Licence'),
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(licenseWindow);
  licenseWindow.loadFile(path.join(__dirname, '..', 'renderer', 'license.html'));
  
  licenseWindow.on('closed', () => {
    // Si l'utilisateur ferme la fenÃªtre sans valider, montrer la fenÃªtre login
    if (!mainWindow && !setupWindow) {
      if (loginWindow) {
        loginWindow.show();
      } else {
        app.quit();
      }
    }
    licenseWindow = null;
  });
}

/**
 * CrÃ©e la fenÃªtre de setup initial
 */
function createSetupWindow() {
  const bounds = getResponsiveWindowBounds({
    width: 760,
    height: 900,
    minWidth: 620,
    minHeight: 680,
    marginX: 88,
    marginY: 88
  });

  setupWindow = new BrowserWindow({
    ...bounds,
    title: getAppWindowTitle('Configuration'),
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(setupWindow, { maximizeWhenTight: true });
  setupWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  
  setupWindow.on('closed', () => {
    if (!mainWindow && !loginWindow) {
      app.quit();
    }
    setupWindow = null;
  });
}

let clientConfigWindow = null;

/**
 * CrÃ©e la fenÃªtre de configuration client (packages)
 */
function createClientConfigWindow() {
  const bounds = getResponsiveWindowBounds({
    width: 1200,
    height: 900,
    minWidth: 880,
    minHeight: 680,
    marginX: 48,
    marginY: 48
  });

  clientConfigWindow = new BrowserWindow({
    ...bounds,
    title: getAppWindowTitle('Config Client'),
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(clientConfigWindow, { maximizeOnShow: true });
  clientConfigWindow.loadFile(path.join(__dirname, '..', 'renderer', 'client-config.html'));
  
  clientConfigWindow.on('closed', () => {
    // Si l'utilisateur ferme la fenÃªtre sans valider, montrer la fenÃªtre login
    if (!mainWindow) {
      if (loginWindow) {
        loginWindow.show();
      } else {
        app.quit();
      }
    }
    clientConfigWindow = null;
  });
}

/**
 * CrÃ©e la fenÃªtre de login
 */
function createLoginWindow() {
  const bounds = getResponsiveWindowBounds({
    width: 1340,
    height: 980,
    minWidth: 980,
    minHeight: 760,
    marginX: 56,
    marginY: 40
  });

  loginWindow = new BrowserWindow({
    ...bounds,
    title: getAppWindowTitle('Connexion'),
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(loginWindow, { maximizeWhenTight: true });
  loginWindow.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'));
  
  loginWindow.on('closed', () => {
    if (!mainWindow) {
      app.quit();
    }
    loginWindow = null;
  });
}

function openMainAppForUser(userData) {
  if (!userData || !userData.id) {
    return;
  }

  global.currentUser = userData;
  persistLoginSession(userData);

  createMainWindow();

  if (mainWindow) {
    const sendUserData = () => {
      try {
        mainWindow.webContents.send('user-data', userData);
      } catch (error) {
        console.warn('Unable to send user data to main window:', error?.message || error);
      }
    };

    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', sendUserData);
    } else {
      sendUserData();
    }
  }

  if (loginWindow) {
    loginWindow.close();
  }

  // Start non-critical services after the main app window is shown so login
  // remains fast. Failures are logged but do not block the UI.
  initializePublicBookingServer().then((result) => {
    if (result?.success && result.data?.enabled) {
      console.log(`RDV web portal ready on ${result.data.localUrl}`);
    } else if (result?.error) {
      console.warn('RDV web portal unavailable:', result.error);
    }
  }).catch((error) => {
    console.warn('RDV web portal unavailable:', error?.message || error);
  });
}

async function tryResumeLoginSession() {
  const stored = readLoginSession();
  if (!stored?.user?.id) {
    return null;
  }

  const currentBootTimeMs = getCurrentBootTimeMs();
  const savedAtMs = Date.parse(stored.savedAt || '');

  // If session was saved before current OS boot, force re-login.
  if (!Number.isFinite(savedAtMs) || savedAtMs < (currentBootTimeMs - 1000)) {
    clearLoginSession();
    return null;
  }

  if (!isSameBoot(stored.bootTimeMs, currentBootTimeMs)) {
    clearLoginSession();
    return null;
  }

  try {
    const userRow = await queryOne(
      'SELECT id, username, role, specialty, isAdmin, isSuperAdmin, isActive FROM users WHERE id = ?',
      [String(stored.user.id)]
    );

    if (!userRow || !userRow.id || !userRow.isActive) {
      clearLoginSession();
      return null;
    }

    const licenseCheck = await checkLicenseAtStartup();
    const isAdmin = !!(userRow.isAdmin || userRow.isSuperAdmin);

    // Same behavior as normal login: only admins can enter when no license is active.
    if (!licenseCheck?.hasActiveLicense && !isAdmin) {
      clearLoginSession();
      return null;
    }

    return {
      id: userRow.id,
      username: userRow.username,
      role: normalizeAppUserRole(userRow.role),
      specialty: userRow.specialty || '',
      isAdmin: !!userRow.isAdmin,
      isSuperAdmin: !!userRow.isSuperAdmin
    };
  } catch (error) {
    console.warn('Unable to resume login session:', error?.message || error);
    return null;
  }
}

/**
 * Initialise l'application
 */
async function initializeApp() {
  try {
    // Initialiser la base de donnÃ©es (crÃ©e l'admin par dÃ©faut + les licences systÃ¨me)
    await initializeDatabase();

    // NOUVELLE LOGIQUE:
    // 1. Toujours afficher l'Ã©cran de login d'abord
    // 2. L'admin peut activer la licence aprÃ¨s connexion
    // 3. Les autres utilisateurs ne peuvent pas se connecter si licence non activÃ©e

    const resumedUser = await tryResumeLoginSession();
    if (resumedUser) {
      openMainAppForUser(resumedUser);
      return;
    }

    createLoginWindow();

    // AI/Ollama, public booking, cloud sync and SMS are started on demand or after
    // the user logs in so that startup stays fast and responsive.
  } catch (error) {
    console.error('Application initialization error:', error);
    dialog.showErrorBox('Erreur', 'Erreur lors de l\'initialisation de l\'application');
    app.quit();
  }
}

/**
 * Initialise les gestionnaires IPC
 */
function setupIPCHandlers() {
  // ========== HANDLERS CONFIG DB ==========
  setupDbConfigHandlers();
  
  // Handlers de licence
  ipcMain.handle('license:validate', (event, licenseKey) => {
    return validateLicense(licenseKey);
  });

  ipcMain.handle('license:activate', (event, licenseKey) => {
    return activateLicense(licenseKey);
  });

  ipcMain.handle('license:deactivate', (event, licenseKey) => {
    return deactivateLicense(licenseKey);
  });

  // AprÃ¨s activation rÃ©ussie de la licence
  ipcMain.handle('license:activated', async () => {
    // Aller directement Ã  l'Ã©cran de connexion (admin existe par dÃ©faut)
    // Show existing login window or create new one
    if (loginWindow) {
      loginWindow.show();
    } else {
      createLoginWindow();
    }

    if (licenseWindow) {
      licenseWindow.close();
    }

    return { success: true };
  });

  // Obtenir le statut de la licence
  ipcMain.handle('license:getStatus', () => {
    return getLicenseStatus();
  });

  // Handle logout - close main window and show login window
  ipcMain.handle('user:showLoginWindow', () => {
    clearLoginSession();

    // Close main window if it exists
    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }

    // Create login window
    createLoginWindow();

    return { success: true };
  });

  // Afficher la fenÃªtre de licence (appelÃ© par login si super admin et licence non activÃ©e)
  ipcMain.handle('license:showLicenseWindow', () => {
    createLicenseWindow();
    // Don't close login window - just hide it so we can go back
    if (loginWindow) {
      loginWindow.hide();
    }
    return { success: true };
  });

  // Afficher la fenÃªtre de configuration client (appelÃ© par login si super admin et package non configurÃ©)
  ipcMain.handle('package:show-config-window', () => {
    createClientConfigWindow();
    // Don't close login window - just hide it so we can go back
    if (loginWindow) {
      loginWindow.hide();
    }
    return { success: true };
  });

  // AprÃ¨s configuration initiale terminÃ©e
  ipcMain.handle('setup:completed', () => {
    createLoginWindow();
    if (setupWindow) {
      setupWindow.close();
    }
  });

  // AprÃ¨s connexion rÃ©ussie
  ipcMain.handle('user:loginSuccess', (event, userData) => {
    if (!userData || !userData.id) {
      console.error('user:loginSuccess called without valid user data');
      return { success: false, error: 'INVALID_USER_DATA' };
    }

    openMainAppForUser(userData);

    return { success: true };
  });

  // Handlers d'utilisateurs
  handleUserEvents();

  // Handlers de patients
  handlePatientEvents();
  
  // Handlers de consultations
  handleConsultationEvents();
  
  // Handlers de prescriptions
  handlePrescriptionEvents();
  
  // Handlers d'arrÃªts de travail
  handleSickLeaveEvents();
  
  // Handlers de rendez-vous
  handleAppointmentEvents();
  
  // Handlers de paiements
  handlePaymentEvents();
  
  // Handlers de paramÃ¨tres
  handleSettingsEvents();

  // Handlers de fichiers
  handleFileEvents();

  // Handlers de documents
  handleDocumentEvents();

  // Handlers PDF
  setupPDFHandlers();

  // Nouveaux handlers
  handleExpenseEvents();
  handleInventoryEvents();
  handleAnalysisEvents();
  handleDebtEvents();
  handleMedicationEvents();
  handleNotificationEvents();
  handleRehabilitationEvents();
  handleWaitingRoomEvents();
  handlePackageEvents();
  handleDentistEvents();
  handleSMSEvents();
  handleCloudSyncEvents();
  handlePrintEvents();
  handlePublicBookingEvents();
  
  // AI Handlers (Ollama)
  setupOllamaHandlers();

  // Handler to seed test data (for development/testing)
  ipcMain.handle('dev:seed-test-data', async () => {
    try {
      console.log('Seeding test data...');
      const result = seedTestData();
      return result;
    } catch (error) {
      console.error('Error seeding test data:', error);
      return { success: false, error: error.message };
    }
  });

  // Auto-seed demo data once (background) when database is still light
  ipcMain.handle('dev:ensure-demo-data', async () => {
    try {
      const markerFile = path.join(app.getPath('userData'), 'demo-seeded-v2.flag');
      const countRow = await queryOne('SELECT COUNT(*) as count FROM patients');
      const patientsCount = Number(countRow?.count || 0);

      if (patientsCount >= 80) {
        return { success: true, skipped: true, patients: patientsCount };
      }

      const seedResult = seedTestData();
      fs.writeFileSync(markerFile, String(new Date().toISOString()), 'utf8');
      return { success: true, seeded: true, result: seedResult };
    } catch (error) {
      console.error('Error ensuring demo data:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler to clear all data (for development/testing)
  ipcMain.handle('dev:clear-all-data', async () => {
    try {
      console.log('Clearing all data...');
      const { clearAllData } = await import('./database.js');
      const result = clearAllData();
      return result;
    } catch (error) {
      console.error('Error clearing data:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler pour ouvrir des fichiers
  ipcMain.handle('dialog:open', async (event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
  });

  // Handler pour exporter PDF
  ipcMain.handle('file:save', async (event, { filename, content }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    });
    
    if (!result.canceled) {
      fs.writeFileSync(result.filePath, content);
      return { success: true, path: result.filePath };
    }
    return { success: false };
  });

  // Handlers systÃ¨me pour fichiers
  ipcMain.handle('system:openFile', async (event, filePath) => {
    try {
      const { shell } = await import('electron');
      const openResult = await shell.openPath(filePath);
      if (openResult) {
        // Linux fallback when no default app is associated
        if (process.platform === 'linux') {
          const { spawn } = await import('child_process');
          spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref();
        } else {
          return { success: false, error: openResult };
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('system:downloadFile', async (event, { filePath, fileName }) => {
    try {
      const { shell } = await import('electron');
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('system:openExternal', async (event, url) => {
    try {
      const { shell } = await import('electron');
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard:getQuickStats', async () => {
    try {
      const isSQLite = getCurrentMode() === 'sqlite';
      const userContext = getScopedUserContext();
      const monthStartExpression = isSQLite
        ? "date('now', 'start of month')"
        : "DATE_FORMAT(CURDATE(), '%Y-%m-01')";
      const patientScope = getScopedPatientFilter(userContext, 'patients');
      const consultationScope = getScopedConsultationFilter(userContext, 'c', 'p');
      const prescriptionScope = getScopedPrescriptionFilter(userContext, 'pr', 'p', 'c');

      const patientsRow = await queryOne(
        `SELECT COUNT(*) as count
         FROM patients
         ${patientScope.clause ? `WHERE ${patientScope.clause}` : ''}`,
        patientScope.params
      );
      const consultRow = await queryOne(
        `SELECT COUNT(*) as count
         FROM consultations c
         LEFT JOIN patients p ON p.id = c.patientId
         WHERE DATE(c.consultationDate) >= ${monthStartExpression}
           ${consultationScope.clause ? `AND ${consultationScope.clause}` : ''}`,
        consultationScope.params
      );
      const prescriptionRow = await queryOne(
        `SELECT COUNT(DISTINCT pr.id) as count
         FROM prescriptions pr
         LEFT JOIN patients p ON p.id = pr.patientId
         LEFT JOIN consultations c ON c.id = pr.consultationId
         WHERE DATE(COALESCE(pr.prescriptionDate, pr.createdAt)) >= ${monthStartExpression}
           ${prescriptionScope.clause ? `AND ${prescriptionScope.clause}` : ''}`,
        prescriptionScope.params
      );

      return {
        success: true,
        data: {
          patients: Number(patientsRow?.count || 0),
          consultationsMonth: Number(consultRow?.count || 0),
          prescriptionsMonth: Number(prescriptionRow?.count || 0)
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('statistics:getOverview', async () => {
    try {
      const userContext = getScopedUserContext();
      const patientScope = getScopedPatientFilter(userContext, 'p');
      const consultationScope = getScopedConsultationFilter(userContext, 'c', 'p');
      const prescriptionScope = getScopedPrescriptionFilter(userContext, 'pr', 'p', 'c');

      const [patientsRow, appointmentsRow, consultationsRow, prescriptionsRow, sickLeavesRow, revenueRow] = await Promise.all([
        queryOne(
          `SELECT COUNT(*) as count
           FROM patients p
           ${patientScope.clause ? `WHERE ${patientScope.clause}` : ''}`,
          patientScope.params
        ),
        queryOne(
          `SELECT COUNT(*) as count
           FROM appointments a
           JOIN patients p ON p.id = a.patientId
           ${patientScope.clause ? `WHERE ${patientScope.clause}` : ''}`,
          patientScope.params
        ),
        queryOne(
          `SELECT COUNT(*) as count
           FROM consultations c
           LEFT JOIN patients p ON p.id = c.patientId
           ${consultationScope.clause ? `WHERE ${consultationScope.clause}` : ''}`,
          consultationScope.params
        ),
        queryOne(
          `SELECT COUNT(DISTINCT pr.id) as count
           FROM prescriptions pr
           LEFT JOIN patients p ON p.id = pr.patientId
           LEFT JOIN consultations c ON c.id = pr.consultationId
           ${prescriptionScope.clause ? `WHERE ${prescriptionScope.clause}` : ''}`,
          prescriptionScope.params
        ),
        queryOne(
          `SELECT COUNT(*) as count
           FROM sick_leaves s
           JOIN patients p ON p.id = s.patientId
           ${patientScope.clause ? `WHERE ${patientScope.clause}` : ''}`,
          patientScope.params
        ),
        queryOne(
          `SELECT COALESCE(SUM(pay.amount), 0) as total
           FROM payments pay
           JOIN patients p ON p.id = pay.patientId
           ${patientScope.clause ? `WHERE ${patientScope.clause}` : ''}`,
          patientScope.params
        )
      ]);

      return {
        success: true,
        data: {
          patients: Number(patientsRow?.count || 0),
          appointments: Number(appointmentsRow?.count || 0),
          consultations: Number(consultationsRow?.count || 0),
          prescriptions: Number(prescriptionsRow?.count || 0),
          sickLeaves: Number(sickLeavesRow?.count || 0),
          revenue: Number(revenueRow?.total || 0)
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('statistics:getTopLists', async () => {
    try {
      const userContext = getScopedUserContext();
      const consultationScope = getScopedConsultationFilter(userContext, 'c', 'patients');
      const prescriptionScope = getScopedPrescriptionFilter(userContext, 'pr', 'p', 'c');

      const [topConsultations, prescriptionRows] = await Promise.all([
        query(
          `SELECT patients.firstName, patients.lastName, COUNT(*) as count
           FROM consultations c
           LEFT JOIN patients ON patients.id = c.patientId
           ${consultationScope.clause ? `WHERE ${consultationScope.clause}` : ''}
           GROUP BY c.patientId, patients.firstName, patients.lastName
           ORDER BY count DESC
           LIMIT 10`,
          consultationScope.params
        ),
        query(
          `SELECT pr.medications
           FROM prescriptions pr
           LEFT JOIN patients p ON p.id = pr.patientId
           LEFT JOIN consultations c ON c.id = pr.consultationId
           WHERE pr.medications IS NOT NULL AND pr.medications <> ''
             ${prescriptionScope.clause ? `AND ${prescriptionScope.clause}` : ''}
           ORDER BY COALESCE(pr.prescriptionDate, pr.createdAt) DESC
           LIMIT 5000`,
          prescriptionScope.params
        )
      ]);

      const medicationMap = new Map();
      (prescriptionRows || []).forEach((row) => {
        try {
          const medications = JSON.parse(row.medications || '[]');
          if (!Array.isArray(medications)) {
            return;
          }

          medications.forEach((medication) => {
            const name = String(medication?.name || '').trim();
            if (!name) {
              return;
            }
            medicationMap.set(name, (medicationMap.get(name) || 0) + 1);
          });
        } catch (_) {
          // Ignore malformed prescription payloads.
        }
      });

      const topMedications = Array.from(medicationMap.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      return {
        success: true,
        data: {
          consultations: (topConsultations || []).map((item) => ({
            name: `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Patient',
            count: Number(item.count || 0)
          })),
          medications: topMedications
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('statistics:getDoctorsLeaderboard', async () => {
    try {
      const doctorsStats = await query(
        `SELECT
          COALESCE(u.fullName, u.username, 'Medecin') as doctorName,
          COUNT(DISTINCT c.id) as consultationsCount,
          COUNT(DISTINCT pr.id) as prescriptionsCount
         FROM users u
         LEFT JOIN consultations c ON c.doctorId = u.id
         LEFT JOIN patients pt ON pt.primaryDoctorId = u.id
         LEFT JOIN prescriptions pr ON pr.patientId = pt.id
         WHERE u.role IN ('doctor', 'dentist')
         GROUP BY u.id, u.fullName, u.username
         ORDER BY consultationsCount DESC, prescriptionsCount DESC, doctorName ASC
         LIMIT 10`
      );

      return {
        success: true,
        data: (doctorsStats || []).map((item) => ({
          name: item.doctorName || 'Medecin',
          count: Number(item.consultationsCount || 0),
          prescriptionsCount: Number(item.prescriptionsCount || 0)
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// Ã‰vÃ©nements Electron
app.on('ready', async () => {
  setupIPCHandlers();
  await initializeApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    performShutdownCleanup();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

// Gestion de la sauvegarde automatique lors de la fermeture
app.on('before-quit', () => {
  performShutdownCleanup();
});

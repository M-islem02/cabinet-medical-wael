/**
 * Processus principal Electron.js
 * PhysioCare - Gestion de Cabinet de MÃ©decine Physique et Fonctionnelle
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';
import { initializeDatabase, closeDatabase, query, queryOne } from './database-unified.js';
import {
  validateLicense, 
  activateLicense, 
  deactivateLicense,
  checkLicenseAtStartup,
  generateLicenseKeys,
  getLicenseStatus,
  getMachineFingerprint,
  startLicenseMonitor,
  stopLicenseMonitor
} from './license-manager.js';
import { verifyApplicationIntegrity } from './security/integrity-service.js';
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
import { handleInventoryModuleEvents } from './handlers/inventory-module-handler.js';
import { handleEquipmentEvents } from './handlers/equipment-handler.js';
import { handleAnalysisEvents } from './handlers/analysis-handler.js';
import { handleDebtEvents } from './handlers/debt-handler.js';
import { handleMedicationEvents } from './handlers/medication-handler.js';
import { handleNotificationEvents } from './handlers/notification-handler.js';
import { handleRehabilitationEvents } from './handlers/rehabilitation-handler.js';
import { handleWaitingRoomEvents } from './handlers/waiting-room-handler.js';
import { handlePackageEvents } from './handlers/package-handler.js';
import { handleDentistEvents } from './handlers/dentist-handler.js';
import { handleTreatmentPlanEvents } from './handlers/treatment-plans-handler.js';
import { handleClinicalRehabilitationContractEvents } from './handlers/clinical-rehabilitation-ipc-handler.js';
import { handleSMSEvents } from './handlers/sms-handler.js';
import { handleCloudSyncEvents } from './handlers/cloud-sync-handler.js';
import { handlePrintEvents } from './handlers/print-handler.js'; // watcher test
import { setupDbConfigHandlers, createDbConfigWindow, loadDatabaseConfig } from './handlers/db-config-handler.js';
import {
  handlePublicBookingEvents,
  initializePublicBookingServer,
  stopPublicBookingServer
} from './services/public-booking-service.js';
import {
  getRealtimeConfig,
  startRealtimeServer,
  stopRealtimeServer
} from './realtime-server.js';
import { getResponsiveWindowBounds, applyWindowPresentation } from './window-utils.js';
import fs from 'fs';
import databaseConnectionTest from './test-database-connection.cjs';

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
  const isAdmin = !!global.currentUser?.isAdmin && !global.currentUser?.isSuperAdmin;
  const isSuperAdmin = !!global.currentUser?.isSuperAdmin;
  const isPractitioner = role === 'doctor' || role === 'dentist';
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin,
    isSuperAdmin,
    isPractitioner,
    isAssistant: role === 'assistant',
    // isDoctorAdmin = practitioner with cabinet-wide scope
    isDoctorAdmin: isPractitioner && isAdmin
  };
}

function getScopedPatientFilter(userContext, patientAlias = 'patients') {
  const practitionerId = userContext.isPractitioner
    ? userContext.userId
    : (userContext.isAssistant ? global.activePatientDoctorId : null);
  if (practitionerId) {
    return {
      clause: `EXISTS (SELECT 1 FROM patient_practitioners pp_scope WHERE pp_scope.patientId = ${patientAlias}.id AND pp_scope.practitionerId = ?)`,
      params: [practitionerId]
    };
  }
  return { clause: '', params: [] };
}

function getScopedConsultationFilter(userContext, consultationAlias = 'consultations', patientAlias = 'patients') {
  if (userContext.isPractitioner && !userContext.isDoctorAdmin && userContext.userId) {
    return {
      clause: `(${consultationAlias}.doctorId = ? OR ${patientAlias}.primaryDoctorId = ? OR (${consultationAlias}.doctorId IS NULL AND (${patientAlias}.primaryDoctorId IS NULL OR ${patientAlias}.primaryDoctorId = '')))`,
      params: [userContext.userId, userContext.userId]
    };
  }
  return { clause: '', params: [] };
}

function getScopedPrescriptionFilter(userContext, prescriptionAlias = 'pr', patientAlias = 'p', consultationAlias = 'c') {
  if (userContext.isPractitioner && !userContext.isDoctorAdmin && userContext.userId) {
    return {
      clause: `(${consultationAlias}.doctorId = ? OR ${patientAlias}.primaryDoctorId = ? OR (${consultationAlias}.doctorId IS NULL AND (${patientAlias}.primaryDoctorId IS NULL OR ${patientAlias}.primaryDoctorId = '')))`,
      params: [userContext.userId, userContext.userId]
    };
  }
  return { clause: '', params: [] };
}

function getScopedPaymentFilter(userContext, paymentAlias = 'pay', patientAlias = 'p') {
  // Normal practitioner: today-only financial visibility.
  if (userContext.isPractitioner && !userContext.isDoctorAdmin && userContext.userId) {
    const todayClause = `DATE(${paymentAlias}.paymentDate) = CURRENT_DATE`;
    return {
      clause: todayClause,
      params: []
    };
  }
  // Doctor-admin and assistant see all payments
  return { clause: '', params: [] };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stableUserDataPath = path.join(app.getPath('appData'), 'physiocare');

// Keep packaged and dev builds on the same data directory so login and data stay consistent.
fs.mkdirSync(stableUserDataPath, { recursive: true });
app.setPath('userData', stableUserDataPath);

app.commandLine.appendSwitch('lang', 'fr-FR');
app.commandLine.appendSwitch('high-dpi-support', '1');
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
const DEFAULT_APP_ZOOM = 0.9;

function clampAppZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return DEFAULT_APP_ZOOM;
  return Math.min(1.4, Math.max(0.75, zoom));
}

function setupHotReload(win) {
  if (app.isPackaged) return;

  const targetPath = path.join(__dirname, '..', 'renderer');
  const watchDirs = [
    targetPath,
    path.join(targetPath, 'js'),
    path.join(targetPath, 'js', 'modules'),
    path.join(targetPath, 'css')
  ];

  let reloadTimeout = null;
  const watchers = [];

  watchDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      try {
        const watcher = fs.watch(dir, (eventType, filename) => {
          if (filename && (filename.endsWith('.html') || filename.endsWith('.css') || filename.endsWith('.js'))) {
            clearTimeout(reloadTimeout);
            reloadTimeout = setTimeout(() => {
              if (win && !win.isDestroyed()) {
                console.log(`[Hot Reload] Renderer file changed: ${filename}. Reloading page...`);
                win.webContents.reloadIgnoringCache();
              }
            }, 200);
          }
        });
        watchers.push(watcher);
      } catch (err) {
        console.error(`[Hot Reload] Error watching directory ${dir}:`, err);
      }
    }
  });

  win.on('closed', () => {
    watchers.forEach(w => {
      try { w.close(); } catch (_) {}
    });
  });
}

function getAppWindowTitle(section = '') {
  const baseTitle = `MedCareSO v${app.getVersion()}`;
  return section ? `${baseTitle} - ${section}` : baseTitle;
}

function performShutdownCleanup() {
  if (shutdownCleanupStarted) {
    return;
  }

  shutdownCleanupStarted = true;
  stopLicenseMonitor();
  stopRealtimeServer();
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
      preload: path.join(__dirname, '..', 'preload', 'preload-bundled.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(mainWindow, { maximizeOnShow: true });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  setupHotReload(mainWindow);

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
      preload: path.join(__dirname, '..', 'preload', 'preload-bundled.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(licenseWindow);
  licenseWindow.loadFile(path.join(__dirname, '..', 'renderer', 'license.html'));
  setupHotReload(licenseWindow);
  
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
      preload: path.join(__dirname, '..', 'preload', 'preload-bundled.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(setupWindow, { maximizeWhenTight: true });
  setupWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  setupHotReload(setupWindow);
  
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
      preload: path.join(__dirname, '..', 'preload', 'preload-bundled.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(clientConfigWindow, { maximizeOnShow: true });
  clientConfigWindow.loadFile(path.join(__dirname, '..', 'renderer', 'client-config.html'));
  setupHotReload(clientConfigWindow);
  
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
      preload: path.join(__dirname, '..', 'preload', 'preload-bundled.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  applyWindowPresentation(loginWindow, { maximizeWhenTight: true });
  loginWindow.loadFile(path.join(__dirname, '..', 'renderer', 'login.html'));
  setupHotReload(loginWindow);
  
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

    const bookingServerResult = await initializePublicBookingServer();
    if (bookingServerResult?.success && bookingServerResult.data?.enabled) {
      console.log(`RDV web portal ready on ${bookingServerResult.data.localUrl}`);
    } else if (bookingServerResult?.error) {
      console.warn('RDV web portal unavailable:', bookingServerResult.error);
    }
    
    const resumedUser = await tryResumeLoginSession();
    if (resumedUser) {
      console.log('Resuming login session for:', resumedUser.username);
      openMainAppForUser(resumedUser);
      return;
    }

    console.log('Login screen displayed');
    createLoginWindow();
    
  } catch (error) {
    console.error('Application initialization error:', error);
    const details = error?.message || String(error || 'Erreur PostgreSQL inconnue');
    dialog.showErrorBox(
      'Configuration PostgreSQL requise',
      `MedCareSO ne peut pas se connecter à la base de données.\n\n${details}\n\n` +
      'Vérifiez le serveur, le port, la base, l\'utilisateur et le mot de passe.'
    );

    // Keep the application useful on a fresh workstation: the user can fix
    // the connection, test it, save it and restart without editing JSON files.
    try {
      createDbConfigWindow();
    } catch (configWindowError) {
      console.error('Unable to open PostgreSQL configuration window:', configWindowError);
      app.quit();
    }
  }
}

/**
 * Initialise les gestionnaires IPC
 */
function setupIPCHandlers() {
  startRealtimeServer();

  // ========== HANDLERS CONFIG DB ==========
  setupDbConfigHandlers();

  ipcMain.handle('realtime:get-config', () => getRealtimeConfig());

  ipcMain.handle('appZoom:get', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return senderWindow?.webContents?.getZoomFactor?.() || 1;
  });

  ipcMain.handle('appZoom:set', (event, value) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    const zoom = clampAppZoom(value);
    if (senderWindow?.webContents) {
      senderWindow.webContents.setZoomFactor(zoom);
    }
    return { success: true, zoom };
  });

  ipcMain.handle('appZoom:reset', (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow?.webContents) {
      senderWindow.webContents.setZoomFactor(DEFAULT_APP_ZOOM);
      senderWindow.webContents.setZoomLevel(0);
    }
    return { success: true, zoom: DEFAULT_APP_ZOOM };
  });
  
  // Handlers de licence
  ipcMain.handle('license:validate', (event, licenseKey) => {
    return validateLicense(licenseKey);
  });

  ipcMain.handle('license:get-machine-id', async () => ({
    success: true,
    machineId: await getMachineFingerprint()
  }));

  ipcMain.handle('license:activate', (event, licenseKey) => {
    return activateLicense(licenseKey);
  });

  ipcMain.handle('license:choose-file', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(owner || undefined, {
      title: 'Choisir une licence MedCareSO signée',
      properties: ['openFile'],
      filters: [{ name: 'Licence MedCareSO', extensions: ['json', 'medcareso'] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      JSON.parse(content);
      return { success: true, content, fileName: path.basename(result.filePaths[0]) };
    } catch (_) {
      return { success: false, error: 'Le fichier sélectionné n’est pas une licence JSON valide.' };
    }
  });

  ipcMain.handle('license:deactivate', (event, licenseKey) => {
    return deactivateLicense(licenseKey);
  });

  ipcMain.handle('license:generate-keys', (event, payload) => {
    return generateLicenseKeys(payload || {});
  });

  // AprÃ¨s activation rÃ©ussie de la licence
  ipcMain.handle('license:activated', async () => {
    // Aller directement Ã  l'Ã©cran de connexion (admin existe par dÃ©faut)
    console.log('License activated - showing login screen');
    
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
    console.log('Login screen displayed after logout');
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
    console.log('Opening license activation window');
    createLicenseWindow();
    // Don't close login window - just hide it so we can go back
    if (loginWindow) {
      loginWindow.hide();
    }
    return { success: true };
  });

  // Afficher la fenÃªtre de configuration client (appelÃ© par login si super admin et package non configurÃ©)
  ipcMain.handle('package:show-config-window', () => {
    console.log('Opening client configuration window');
    createClientConfigWindow();
    // Don't close login window - just hide it so we can go back
    if (loginWindow) {
      loginWindow.hide();
    }
    return { success: true };
  });

  // AprÃ¨s configuration initiale terminÃ©e
  ipcMain.handle('setup:completed', () => {
    console.log('setup:completed called - switching to login window');
    createLoginWindow();
    if (setupWindow) {
      console.log('Closing setup window');
      setupWindow.close();
    } else {
      console.log('Setup window was already null');
    }
  });

  // AprÃ¨s connexion rÃ©ussie
  ipcMain.handle('user:loginSuccess', (event, userData) => {
    console.log('Login successful - opening main application');
    console.log('User data received:', userData);

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
  handleInventoryModuleEvents();
  handleEquipmentEvents();
  handleAnalysisEvents();
  handleDebtEvents();
  handleMedicationEvents();
  handleNotificationEvents();
  handleRehabilitationEvents();
  handleWaitingRoomEvents();
  handlePackageEvents();
  handleDentistEvents();
  handleTreatmentPlanEvents();
  handleClinicalRehabilitationContractEvents();
  handleSMSEvents();
  handleCloudSyncEvents();
  handlePrintEvents();
  handlePublicBookingEvents();
  
  // Handler to seed test data (for development/testing)
  ipcMain.handle('dev:seed-test-data', async () => {
    return {
      success: false,
      error: 'Demo seeding is disabled in PostgreSQL-only runtime. Use the legacy migration kit to import data.'
    };
  });

  // Auto-seed demo data once (background) when database is still light
  ipcMain.handle('dev:ensure-demo-data', async () => {
    return {
      success: true,
      skipped: true,
      message: 'Demo seeding is disabled in PostgreSQL-only runtime.'
    };
  });

  // Handler to clear all data (for development/testing)
  ipcMain.handle('dev:clear-all-data', async () => {
    return {
      success: false,
      error: 'Bulk clearing is disabled in PostgreSQL-only runtime.'
    };
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
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'Fichier introuvable' };
      }

      const safeFileName = fileName || path.basename(filePath);
      const extension = path.extname(safeFileName).replace('.', '').toLowerCase() || '*';
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: safeFileName,
        filters: [
          { name: extension === 'json' ? 'JSON' : 'Fichier', extensions: [extension] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      fs.copyFileSync(filePath, result.filePath);
      return { success: true, path: result.filePath };
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
      const userContext = getScopedUserContext();
      const monthStartExpression = "DATE_TRUNC('month', CURRENT_DATE)";
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

  ipcMain.handle('statistics:getAdvancedOverview', async (event, filters = {}) => {
    try {
      const userContext = getScopedUserContext();

      if (userContext.isAssistant || (!userContext.isPractitioner && !userContext.isSuperAdmin)) {
        return { success: false, error: 'Accès non autorisé aux statistiques' };
      }
      
      // Resolve start and end dates
      let startDate = filters.startDate || '';
      let endDate = filters.endDate || '';
      const period = filters.period || 'month';

      if (!['day', 'month', 'year', 'custom'].includes(period)) {
        return { success: false, error: 'Période statistique invalide' };
      }

      if (period === 'custom') {
        const parsedStart = moment(startDate, 'YYYY-MM-DD', true);
        const parsedEnd = moment(endDate, 'YYYY-MM-DD', true);
        if (!parsedStart.isValid() || !parsedEnd.isValid()) {
          return { success: false, error: 'Sélectionnez une date de début et une date de fin valides' };
        }
        if (parsedStart.isAfter(parsedEnd, 'day')) {
          return { success: false, error: 'La date de début doit précéder la date de fin' };
        }
      }
      
      // Default dates if none provided
      if (!startDate) {
        if (period === 'day') {
          startDate = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
          endDate = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
        } else if (period === 'year') {
          startDate = moment().startOf('year').format('YYYY-MM-DD HH:mm:ss');
          endDate = moment().endOf('year').format('YYYY-MM-DD HH:mm:ss');
        } else {
          startDate = moment().startOf('month').format('YYYY-MM-DD HH:mm:ss');
          endDate = moment().endOf('month').format('YYYY-MM-DD HH:mm:ss');
        }
      } else {
        startDate = moment(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        endDate = moment(endDate || startDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');
      }
      
      const hasFinancialAccess = userContext.isSuperAdmin || userContext.isDoctorAdmin;
      const hasOperationalAccess = userContext.isSuperAdmin || userContext.isDoctorAdmin;
      
      const result = {
        role: userContext.role,
        isSuperAdmin: userContext.isSuperAdmin,
        isDoctorAdmin: userContext.isDoctorAdmin,
        isPractitioner: userContext.isPractitioner,
        isAssistant: userContext.isAssistant,
        financials: null,
        clinicals: null,
        operationals: null
      };
      const tableExists = async (tableName) => {
        const row = await queryOne('SELECT to_regclass(?) as table_name', [`public.${tableName}`]);
        return !!row?.table_name;
      };

      // 2. Fetch Financial Data
      if (hasFinancialAccess) {
        const [hasPosSales, hasInventoryLots] = await Promise.all([
          tableExists('pos_sales'),
          tableExists('inventory_lots')
        ]);

        // Consultation Revenues
        const consultationRevenues = await queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
           WHERE paymentDate BETWEEN ? AND ? 
             AND id NOT IN (SELECT DISTINCT paymentId FROM plan_payment_sessions WHERE paymentId IS NOT NULL)`,
          [startDate, endDate]
        );

        // Treatment Plan Revenues
        const planRevenues = await queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
           WHERE paymentDate BETWEEN ? AND ? 
             AND id IN (SELECT DISTINCT paymentId FROM plan_payment_sessions WHERE paymentId IS NOT NULL)`,
          [startDate, endDate]
        );

        // POS Revenues
        const posRevenues = hasPosSales ? await queryOne(
          `SELECT COALESCE(SUM(finalAmount), 0) as total FROM pos_sales 
           WHERE saleDate BETWEEN ? AND ?`,
          [startDate, endDate]
        ) : { total: 0 };

        // General Expenses (Excluding Salaires)
        const generalExpenses = await queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
           WHERE expenseDate BETWEEN ? AND ? AND (category IS NULL OR category != 'Salaires')`,
          [startDate, endDate]
        );

        // Salary Expenses
        const salaryExpenses = await queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
           WHERE expenseDate BETWEEN ? AND ? AND category = 'Salaires'`,
          [startDate, endDate]
        );

        // Inventory Lot Purchases
        const inventoryPurchases = hasInventoryLots ? await queryOne(
          `SELECT COALESCE(SUM(initialQuantity * unitPrice), 0) as total FROM inventory_lots 
           WHERE purchaseDate BETWEEN ? AND ?`,
          [startDate, endDate]
        ) : { total: 0 };

        // Pending payments (Active plans remaining balance)
        const pendingPayments = await queryOne(
          `SELECT COALESCE(SUM(totalCost - totalPaid), 0) as total FROM treatment_plans 
           WHERE status = 'active'`
        );

        const revConsultations = Number(consultationRevenues?.total || 0);
        const revPlans = Number(planRevenues?.total || 0);
        const revPOS = Number(posRevenues?.total || 0);
        const totalRev = revConsultations + revPlans + revPOS;

        const expGeneral = Number(generalExpenses?.total || 0);
        const expSalaries = Number(salaryExpenses?.total || 0);
        const expInventory = Number(inventoryPurchases?.total || 0);
        const totalExp = expGeneral + expSalaries + expInventory;

        // Grouped by period details (for trends table)
        const dateSubstrLen = period === 'day' ? 10 : (period === 'year' ? 4 : 7);

        const payGroup = await query(
          `SELECT SUBSTR(CAST(paymentDate AS VARCHAR), 1, ?) as period, 
                  SUM(CASE WHEN id IN (SELECT DISTINCT paymentId FROM plan_payment_sessions WHERE paymentId IS NOT NULL) THEN 0 ELSE amount END) as consultRev,
                  SUM(CASE WHEN id IN (SELECT DISTINCT paymentId FROM plan_payment_sessions WHERE paymentId IS NOT NULL) THEN amount ELSE 0 END) as planRev
           FROM payments 
           WHERE paymentDate BETWEEN ? AND ?
           GROUP BY 1`,
          [dateSubstrLen, startDate, endDate]
        );

        const posGroup = hasPosSales ? await query(
          `SELECT SUBSTR(CAST(saleDate AS VARCHAR), 1, ?) as period, SUM(finalAmount) as posRev 
           FROM pos_sales 
           WHERE saleDate BETWEEN ? AND ?
           GROUP BY 1`,
          [dateSubstrLen, startDate, endDate]
        ) : [];

        const expGroup = await query(
          `SELECT SUBSTR(CAST(expenseDate AS VARCHAR), 1, ?) as period, 
                  SUM(CASE WHEN category = 'Salaires' THEN amount ELSE 0 END) as salaryExp,
                  SUM(CASE WHEN category != 'Salaires' THEN amount ELSE 0 END) as generalExp
           FROM expenses 
           WHERE expenseDate BETWEEN ? AND ?
           GROUP BY 1`,
          [dateSubstrLen, startDate, endDate]
        );

        const invGroup = hasInventoryLots ? await query(
          `SELECT SUBSTR(CAST(purchaseDate AS VARCHAR), 1, ?) as period, SUM(initialQuantity * unitPrice) as invExp 
           FROM inventory_lots 
           WHERE purchaseDate BETWEEN ? AND ?
           GROUP BY 1`,
          [dateSubstrLen, startDate, endDate]
        ) : [];

        // Merge all groups in memory
        const periodMap = new Map();
        const addPeriodData = (p, data) => {
          if (!periodMap.has(p)) {
            periodMap.set(p, { period: p, revenue: 0, expenses: 0, consultRev: 0, planRev: 0, posRev: 0, generalExp: 0, salaryExp: 0, invExp: 0 });
          }
          const curr = periodMap.get(p);
          Object.assign(curr, { ...curr, ...data });
        };

        payGroup.forEach(row => addPeriodData(row.period, { consultRev: Number(row.consultRev || 0), planRev: Number(row.planRev || 0) }));
        posGroup.forEach(row => addPeriodData(row.period, { posRev: Number(row.posRev || 0) }));
        expGroup.forEach(row => addPeriodData(row.period, { salaryExp: Number(row.salaryExp || 0), generalExp: Number(row.generalExp || 0) }));
        invGroup.forEach(row => addPeriodData(row.period, { invExp: Number(row.invExp || 0) }));

        // Calculate total revenues & expenses per period
        const periodicalFinancials = Array.from(periodMap.values()).map(item => {
          const rev = item.consultRev + item.planRev + item.posRev;
          const exp = item.salaryExp + item.generalExp + item.invExp;
          return {
            period: item.period,
            revenue: rev,
            expenses: exp,
            margin: rev - exp
          };
        }).sort((a, b) => b.period.localeCompare(a.period));

        result.financials = {
          totalRevenue: totalRev,
          revenueBreakdown: {
            consultations: revConsultations,
            treatmentPlans: revPlans,
            posSales: revPOS
          },
          totalExpenses: totalExp,
          expenseBreakdown: {
            general: expGeneral,
            salaires: expSalaries,
            inventory: expInventory
          },
          netMargin: totalRev - totalExp,
          pendingPayments: Number(pendingPayments?.total || 0),
          periodicalFinancials
        };
      } else if (userContext.isPractitioner) {
        // Scoped Payments: Doctor Normal's payments collected TODAY
        const todayStrStart = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const todayStrEnd = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');

        const consultationPayments = await queryOne(
          `SELECT COALESCE(SUM(pay.amount), 0) as total FROM payments pay
           JOIN consultations c ON c.id = pay.consultationId
           WHERE pay.paymentDate BETWEEN ? AND ? AND c.doctorId = ?`,
          [todayStrStart, todayStrEnd, userContext.userId]
        );

        const planPayments = await queryOne(
          `SELECT COALESCE(SUM(pay.amount), 0) as total FROM payments pay
           JOIN plan_payment_sessions pps ON pps.paymentId = pay.id
           JOIN treatment_plans tp ON tp.id = pps.planId
           WHERE pay.paymentDate BETWEEN ? AND ? AND tp.createdBy = ?`,
          [todayStrStart, todayStrEnd, userContext.userId]
        );

        result.financials = {
          todayCollected: Number(consultationPayments?.total || 0) + Number(planPayments?.total || 0)
        };
      }

      // 3. Fetch Clinical Data
      let patientsSeenCount = 0;
      let acts = [];
      let plansCompletion = { active: 0, completed: 0, cancelled: 0, completionRate: 0 };
      
      const clinicalScopeParams = [];
      let clinicalConsultationClause = 'c.consultationDate BETWEEN ? AND ?';
      clinicalScopeParams.push(startDate, endDate);

      if (userContext.isPractitioner && !userContext.isDoctorAdmin) {
        clinicalConsultationClause += ' AND c.doctorId = ?';
        clinicalScopeParams.push(userContext.userId);
      }

      const patientsSeenRow = await queryOne(
        `SELECT COUNT(DISTINCT c.patientId) as count FROM consultations c
         WHERE ${clinicalConsultationClause}`,
        clinicalScopeParams
      );
      patientsSeenCount = Number(patientsSeenRow?.count || 0);

      // Dental treatments (acts)
      const actsParams = [startDate, endDate];
      let actsClause = 'treatmentDate BETWEEN ? AND ?';
      if (userContext.isPractitioner && !userContext.isDoctorAdmin) {
        actsClause += ' AND dentistId = ?';
        actsParams.push(userContext.userId);
      }
      acts = await query(
        `SELECT treatmentType as label, COUNT(*) as count FROM dental_treatments
         WHERE ${actsClause}
         GROUP BY treatmentType
         ORDER BY count DESC
         LIMIT 10`,
        actsParams
      );

      // Treatment plans completion
      const plansParams = [startDate, endDate];
      let plansClause = 'createdAt BETWEEN ? AND ?';
      if (userContext.isPractitioner && !userContext.isDoctorAdmin) {
        plansClause += ' AND createdBy = ?';
        plansParams.push(userContext.userId);
      }
      const plansCompletionRows = await query(
        `SELECT status, COUNT(*) as count FROM treatment_plans
         WHERE ${plansClause}
         GROUP BY status`,
        plansParams
      );
      plansCompletionRows.forEach(row => {
        if (row.status === 'active') plansCompletion.active = Number(row.count || 0);
        else if (row.status === 'completed') plansCompletion.completed = Number(row.count || 0);
        else if (row.status === 'cancelled') plansCompletion.cancelled = Number(row.count || 0);
      });
      const totalPlans = plansCompletion.active + plansCompletion.completed + plansCompletion.cancelled;
      plansCompletion.completionRate = totalPlans > 0 
        ? Math.round((plansCompletion.completed / totalPlans) * 100) 
        : 0;

      // Patients seen by doctor leaderboard (only for Superadmin/Doctor Admin)
      let patientsSeenByDoctor = [];
      if (hasFinancialAccess) {
        patientsSeenByDoctor = await query(
          `SELECT COALESCE(u.fullName, u.username, 'Médecin') as doctorName, COUNT(DISTINCT c.patientId) as count
           FROM consultations c
           JOIN users u ON u.id = c.doctorId
           WHERE c.consultationDate BETWEEN ? AND ?
           GROUP BY c.doctorId, u.fullName, u.username
           ORDER BY count DESC
           LIMIT 10`,
          [startDate, endDate]
        );
      }

      result.clinicals = {
        patientsSeen: patientsSeenCount,
        actsBreakdown: acts,
        plansCompletion,
        patientsSeenByDoctor: patientsSeenByDoctor.map(item => ({
          name: item.doctorName,
          count: Number(item.count)
        }))
      };

      // 4. Fetch Operational Data
      if (hasOperationalAccess) {
        // Chair occupancy rate
        const todayDateStr = moment().format('YYYY-MM-DD');
        const activeConsultingPatients = await queryOne(
          `SELECT COUNT(*) as count FROM waiting_room 
           WHERE status = 'in-consultation' AND DATE(arrivalTime) = ?`,
          [todayDateStr]
        );
        const totalCapacity = 3;
        const chairOccupancy = Math.min(100, Math.round((Number(activeConsultingPatients?.count || 0) / totalCapacity) * 100));

        // Equipment occupancy rate (real equipment module, not inventory articles)
        const totalEquipments = await queryOne(
          `SELECT COUNT(*) as count FROM equipment WHERE isActive = TRUE`
        );
        const equipmentsInUse = await queryOne(
          `SELECT COUNT(DISTINCT equipmentId) as count FROM plan_equipment_usage pe
           JOIN treatment_plans tp ON tp.id = pe.planId
           WHERE tp.status = 'active' AND pe.equipmentId IS NOT NULL`
        );
        const totalEquip = Number(totalEquipments?.count || 0);
        const inUseEquip = Number(equipmentsInUse?.count || 0);
        const equipmentOccupancy = totalEquip > 0 ? Math.min(100, Math.round((inUseEquip / totalEquip) * 100)) : 0;

        // Alerts
        // Low Stock
        const lowStock = await query(
          `SELECT id, name, quantity, minQuantity, unit FROM inventory
           WHERE quantity <= minQuantity AND isActive = TRUE`
        );

        // Expiring Soon (30 days)
        const thirtyDaysOut = moment().add(30, 'days').format('YYYY-MM-DD');
        const hasInventoryLots = await tableExists('inventory_lots');
        const expiringLots = hasInventoryLots ? await query(
          `SELECT l.id, i.name, l.lotNumber, l.expirationDate, l.remainingQuantity 
           FROM inventory_lots l
           JOIN inventory i ON i.id = l.inventoryId
           WHERE l.expirationDate <= ? AND l.remainingQuantity > 0 AND l.isActive = TRUE`,
          [thirtyDaysOut]
        ) : [];

        // Equipment maintenance needed
        const maintenanceLots = await query(
          `SELECT id, name, nextMaintenanceDate, status FROM equipment
           WHERE isActive = TRUE
             AND (status IN ('maintenance', 'out_of_service')
               OR nextMaintenanceDate IS NULL
               OR nextMaintenanceDate <= CURRENT_DATE)
           ORDER BY nextMaintenanceDate NULLS FIRST`
        );

        result.operationals = {
          chairOccupancy,
          equipmentOccupancy,
          alerts: {
            lowStock: lowStock.map(item => ({
              id: item.id,
              name: item.name,
              message: `Stock bas : ${item.quantity} ${item.unit} restant(s) (seuil ${item.minQuantity})`
            })),
            expiringLots: expiringLots.map(item => ({
              id: item.id,
              name: item.name,
              message: `Lot ${item.lotNumber || 'N/A'} expire le ${moment(item.expirationDate).format('DD/MM/YYYY')} (${item.remainingQuantity} restants)`
            })),
            maintenanceLots: maintenanceLots.map(item => ({
              id: item.id,
              name: item.name,
              message: item.nextMaintenanceDate
                ? `Maintenance prévue le ${moment(item.nextMaintenanceDate).format('DD/MM/YYYY')}.`
                : `Aucune maintenance n’est planifiée pour cet équipement.`
            }))
          }
        };
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error calculating advanced statistics:', error);
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

  ipcMain.handle('statistics:getTopLists', async (event, filters = {}) => {
    try {
      const userContext = getScopedUserContext();
      const consultationScope = getScopedConsultationFilter(userContext, 'c', 'patients');
      const prescriptionScope = getScopedPrescriptionFilter(userContext, 'pr', 'p', 'c');

      const start = moment(filters.startDate, 'YYYY-MM-DD', true);
      const end = moment(filters.endDate, 'YYYY-MM-DD', true);
      const hasDateRange = start.isValid() && end.isValid() && !start.isAfter(end, 'day');
      const consultationConditions = [];
      const consultationParams = [];
      const prescriptionConditions = ["pr.medications IS NOT NULL", "pr.medications <> ''"];
      const prescriptionParams = [];

      if (consultationScope.clause) {
        consultationConditions.push(consultationScope.clause);
        consultationParams.push(...consultationScope.params);
      }
      if (prescriptionScope.clause) {
        prescriptionConditions.push(prescriptionScope.clause);
        prescriptionParams.push(...prescriptionScope.params);
      }
      if (hasDateRange) {
        consultationConditions.push('c.consultationDate BETWEEN ? AND ?');
        consultationParams.push(start.startOf('day').format('YYYY-MM-DD HH:mm:ss'), end.endOf('day').format('YYYY-MM-DD HH:mm:ss'));
        prescriptionConditions.push('COALESCE(pr.prescriptionDate, pr.createdAt) BETWEEN ? AND ?');
        prescriptionParams.push(start.startOf('day').format('YYYY-MM-DD HH:mm:ss'), end.endOf('day').format('YYYY-MM-DD HH:mm:ss'));
      }

      const [topConsultations, prescriptionRows] = await Promise.all([
        query(
          `SELECT patients.firstName, patients.lastName, COUNT(*) as count
           FROM consultations c
           LEFT JOIN patients ON patients.id = c.patientId
            ${consultationConditions.length ? `WHERE ${consultationConditions.join(' AND ')}` : ''}
           GROUP BY c.patientId, patients.firstName, patients.lastName
           ORDER BY count DESC
           LIMIT 10`,
          consultationParams
        ),
        query(
          `SELECT pr.medications
           FROM prescriptions pr
           LEFT JOIN patients p ON p.id = pr.patientId
           LEFT JOIN consultations c ON c.id = pr.consultationId
           WHERE ${prescriptionConditions.join(' AND ')}
           ORDER BY COALESCE(pr.prescriptionDate, pr.createdAt) DESC
           LIMIT 5000`,
          prescriptionParams
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
  const databaseTestArgIndex = process.argv.indexOf('--test-database-connection');
  if (databaseTestArgIndex >= 0) {
    const result = await databaseConnectionTest.testDatabaseConnection(
      process.argv[databaseTestArgIndex + 1],
      process.argv[databaseTestArgIndex + 2]
    );
    app.exit(result.success ? 0 : 1);
    return;
  }

  const integrity = await verifyApplicationIntegrity();
  if (!integrity.valid) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'MedCareSO — contrôle de sécurité',
      message: 'L’intégrité de l’application ne peut pas être confirmée.',
      detail: integrity.reason || 'Installez une version officielle de MedCareSO.'
    });
    app.quit();
    return;
  }

  setupIPCHandlers();
  await initializeApp();
  startLicenseMonitor((result) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      try { window.webContents.send('license-warning', { reason: result.reason || 'Licence non valide' }); } catch (_) {}
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
      if (!loginWindow || loginWindow.isDestroyed()) createLoginWindow();
      else loginWindow.show();
    }
  });
});

app.on('web-contents-created', (_event, contents) => {
  if (app.isPackaged) {
    contents.on('devtools-opened', () => {
      try { contents.closeDevTools(); } catch (_) {}
    });
    contents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      if (key === 'f12' || ((input.control || input.meta) && input.shift && key === 'i')) {
        event.preventDefault();
      }
    });
  }
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, targetUrl) => {
    if (!/^(file:|data:|about:blank)/.test(String(targetUrl))) event.preventDefault();
  });
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

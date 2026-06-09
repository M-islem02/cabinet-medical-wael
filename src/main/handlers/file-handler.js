/**
 * Gestionnaire IPC pour les fichiers et pièces jointes
 */

import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../database-unified.js';
import { getScopedSettings } from '../services/settings-scope-service.js';

const ATTACHMENTS_DIR = path.join(app.getPath('userData'), 'attachments');
const execFileAsync = promisify(execFile);

function sanitizeAttachmentFileName(name) {
  return String(name || 'piece_jointe')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function getMimeTypeFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.tiff' || ext === '.tif') return 'image/tiff';
  if (ext === '.dcm' || ext === '.dicom') return 'application/dicom';
  if (ext === '.zip') return 'application/zip';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function isImagingFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.dcm', '.dicom', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.pdf', '.zip'].includes(ext);
}

function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPaginationMeta(total, page, pageSize) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 1);
  return {
    total: safeTotal,
    page,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(safeTotal / safePageSize))
  };
}

function normalizePatientAttachmentRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.patientId || payload.id || '',
      paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined,
      page: toPositiveInt(payload.page, 1),
      pageSize: Math.min(100, toPositiveInt(payload.pageSize, 12))
    };
  }

  return {
    patientId: payload,
    paginated: false,
    page: 1,
    pageSize: 12
  };
}

async function collectImagingFilesFromDirectory(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const collectedFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      collectedFiles.push(...await collectImagingFilesFromDirectory(entryPath));
      continue;
    }

    if (entry.isFile() && isImagingFile(entryPath)) {
      collectedFiles.push(entryPath);
    }
  }

  return collectedFiles;
}

async function listAvailableScanners() {
  try {
    const { stdout } = await execFileAsync('scanimage', ['-L'], {
      timeout: 8000,
      maxBuffer: 1024 * 1024
    });

    return String(stdout || '')
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
  } catch (_) {
    return [];
  }
}

async function copyAttachmentFromPath(sourcePath) {
  const sourceName = path.basename(sourcePath);
  const safeName = `${Date.now()}_${sanitizeAttachmentFileName(sourceName)}`;
  const targetPath = path.join(ATTACHMENTS_DIR, safeName);
  const stats = await fs.stat(sourcePath);

  await fs.copyFile(sourcePath, targetPath);

  return {
    success: true,
    path: targetPath,
    name: safeName,
    originalName: sourceName,
    type: getMimeTypeFromExtension(sourcePath),
    size: stats.size
  };
}

async function removeAttachmentFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_) {
    // Ignore missing or already-removed files
  }
}

async function resolveScanner(scannerId = '') {
  const scanners = await listAvailableScanners();
  if (!scanners.length) {
    throw new Error('Aucun scanner USB détecté');
  }

  if (scannerId) {
    const exactScanner = scanners.find((scanner) => scanner.id === scannerId);
    if (exactScanner) return exactScanner;
  }

  const settings = await getScopedSettings().catch(() => null);
  if (settings?.preferredScanner) {
    const preferredScanner = scanners.find((scanner) => scanner.id === settings.preferredScanner);
    if (preferredScanner) return preferredScanner;
  }

  const dedicatedScanner = scanners.find((scanner) => !String(scanner.id || '').startsWith('v4l:'));
  return dedicatedScanner || scanners[0];
}

async function scanDocumentToAttachment(options = {}) {
  await ensureAttachmentsDir();

  const scanner = await resolveScanner(options.scannerId);
  const resolution = parseInt(options.resolution, 10) || 200;
  const originalName = `scan_usb_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
  const safeName = `${Date.now()}_${sanitizeAttachmentFileName(originalName)}`;
  const filePath = path.join(ATTACHMENTS_DIR, safeName);

  const args = ['--format=png', '--resolution', String(resolution)];
  if (scanner?.id) {
    args.unshift(scanner.id);
    args.unshift('--device-name');
  }

  const { stdout } = await execFileAsync('scanimage', args, {
    timeout: 60000,
    encoding: 'buffer',
    maxBuffer: 30 * 1024 * 1024
  });

  const imageBuffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || []);
  if (!imageBuffer.length) {
    throw new Error('Le scanner n’a renvoyé aucune image');
  }

  await fs.writeFile(filePath, imageBuffer);

  return {
    success: true,
    path: filePath,
    name: safeName,
    originalName,
    type: 'image/png',
    size: imageBuffer.length,
    scanner
  };
}

// Ensure attachments directory exists
async function ensureAttachmentsDir() {
  try {
    await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating attachments directory:', error);
  }
}

export function handleFileEvents() {
  // Initialize attachments directory
  ensureAttachmentsDir();

  // Save an attachment file
  ipcMain.handle('file:saveAttachment', async (event, fileData) => {
    try {
      const { name, data, type } = fileData;
      const timestamp = Date.now();
      const safeName = `${timestamp}_${name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = path.join(ATTACHMENTS_DIR, safeName);

      // Convert base64 to buffer if needed
      let buffer;
      if (typeof data === 'string' && data.includes('base64')) {
        const base64Data = data.split('base64,')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else if (Buffer.isBuffer(data)) {
        buffer = data;
      } else {
        buffer = Buffer.from(data);
      }

      await fs.writeFile(filePath, buffer);

      return { 
        success: true, 
        path: filePath,
        name: safeName,
        originalName: name,
        type: type
      };
    } catch (error) {
      console.error('Error saving attachment:', error);
      return { success: false, error: error.message };
    }
  });

  // Open an attachment file
  ipcMain.handle('file:openAttachment', async (event, filePath) => {
    try {
      const result = await shell.openPath(filePath);
      if (result) {
        // Result is an error string if failed
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      console.error('Error opening attachment:', error);
      return { success: false, error: error.message };
    }
  });

  // Read file as data URL for preview
  ipcMain.handle('file:readAsDataURL', async (event, filePath) => {
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'application/octet-stream';
      
      // Determine MIME type
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.tiff' || ext === '.tif') mimeType = 'image/tiff';
      else if (ext === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const base64 = buffer.toString('base64');
      const dataURL = `data:${mimeType};base64,${base64}`;

      return { success: true, dataURL, mimeType };
    } catch (error) {
      console.error('Error reading file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('file:pickAttachments', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win, {
        title: 'Importer des pièces jointes',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents médicaux', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'docx'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePaths?.length) {
        return { success: true, data: [] };
      }

      const importedFiles = [];
      for (const sourcePath of result.filePaths) {
        importedFiles.push(await copyAttachmentFromPath(sourcePath));
      }

      return { success: true, data: importedFiles };
    } catch (error) {
      console.error('Error importing attachments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('file:pickImagingAttachments', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win, {
        title: 'Importer des examens d’imagerie',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Imagerie médicale', extensions: ['dcm', 'dicom', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'pdf', 'zip'] },
          { name: 'DICOM', extensions: ['dcm', 'dicom'] },
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'tiff', 'tif'] },
          { name: 'Documents', extensions: ['pdf', 'zip'] }
        ]
      });

      if (result.canceled || !result.filePaths?.length) {
        return { success: true, data: [] };
      }

      const importedFiles = [];
      for (const sourcePath of result.filePaths) {
        importedFiles.push(await copyAttachmentFromPath(sourcePath));
      }

      return { success: true, data: importedFiles };
    } catch (error) {
      console.error('Error importing imaging files:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('file:pickImagingFolder', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      const result = await dialog.showOpenDialog(win, {
        title: 'Sélectionner un dossier DICOM / imagerie',
        properties: ['openDirectory']
      });

      if (result.canceled || !result.filePaths?.length) {
        return { success: true, data: [], folderPath: null };
      }

      const folderPath = result.filePaths[0];
      const imagingFiles = await collectImagingFilesFromDirectory(folderPath);
      const importedFiles = [];

      for (const sourcePath of imagingFiles) {
        importedFiles.push(await copyAttachmentFromPath(sourcePath));
      }

      return {
        success: true,
        data: importedFiles,
        folderPath,
        importedCount: importedFiles.length
      };
    } catch (error) {
      console.error('Error importing imaging folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('file:listScanners', async () => {
    try {
      const scanners = await listAvailableScanners();
      return { success: true, data: scanners };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('file:scanDocument', async (event, options) => {
    try {
      const result = await scanDocumentToAttachment(options || {});
      return result;
    } catch (error) {
      console.error('Error scanning document:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patientAttachment:createBatch', async (event, payload) => {
    try {
      const patientId = payload?.patientId;
      const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

      if (!patientId) {
        return { success: false, error: 'Patient introuvable' };
      }

      if (!attachments.length) {
        return { success: true, data: [] };
      }

      const savedItems = [];

      for (const attachment of attachments) {
        const id = uuidv4();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        await run(
          `INSERT INTO patient_attachments
           (id, patientId, consultationId, fileName, filePath, mimeType, fileSize, examFamily, sourceType, sourceLabel, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            patientId,
            attachment.consultationId || null,
            attachment.fileName || attachment.originalName || attachment.name || 'Document patient',
            attachment.filePath || attachment.path,
            attachment.mimeType || attachment.type || null,
            parseInt(attachment.fileSize ?? attachment.size ?? 0, 10) || 0,
            attachment.examFamily || 'Document',
            attachment.sourceType || 'import',
            attachment.sourceLabel || null,
            attachment.notes || null,
            now,
            now
          ]
        );

        savedItems.push({ id, ...attachment });
      }

      return { success: true, data: savedItems };
    } catch (error) {
      console.error('Error creating patient attachments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patientAttachment:getByPatient', async (event, payload) => {
    try {
      const request = normalizePatientAttachmentRequest(payload);
      const baseSql = `FROM patient_attachments WHERE patientId = ?`;

      if (!request.paginated) {
        const rows = await query(
          `SELECT id, patientId, consultationId, fileName, filePath, mimeType, fileSize, examFamily, sourceType, sourceLabel, notes, createdAt, updatedAt
           ${baseSql}
           ORDER BY createdAt DESC`,
          [request.patientId]
        );
        return { success: true, data: rows };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total ${baseSql}`, [request.patientId]);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const rows = await query(
        `SELECT id, patientId, consultationId, fileName, filePath, mimeType, fileSize, examFamily, sourceType, sourceLabel, notes, createdAt, updatedAt
         ${baseSql}
         ORDER BY createdAt DESC
         LIMIT ? OFFSET ?`,
        [request.patientId, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: rows,
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error('Error loading patient attachments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patientAttachment:delete', async (event, attachmentId) => {
    try {
      const attachment = await queryOne(
        'SELECT id, filePath FROM patient_attachments WHERE id = ?',
        [attachmentId]
      );

      if (!attachment) {
        return { success: false, error: 'Pièce jointe introuvable' };
      }

      await run('DELETE FROM patient_attachments WHERE id = ?', [attachmentId]);
      await removeAttachmentFile(attachment.filePath);
      return { success: true };
    } catch (error) {
      console.error('Error deleting patient attachment:', error);
      return { success: false, error: error.message };
    }
  });
}

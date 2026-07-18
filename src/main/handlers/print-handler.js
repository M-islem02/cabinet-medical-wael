import { BrowserWindow, ipcMain, dialog } from 'electron';
import { getScopedSettings } from '../services/settings-scope-service.js';

function normalizePageSize(pageSize) {
  return String(pageSize || 'A5').toUpperCase() === 'A4' ? 'A4' : 'A5';
}

function getPrintViewport(pageSize) {
  return normalizePageSize(pageSize) === 'A4'
    ? { width: 794, height: 1123 }
    : { width: 559, height: 794 };
}

function normalizeDuplexMode(mode) {
  const raw = String(mode || '').trim();
  if (raw === 'longEdge' || raw === 'shortEdge' || raw === 'simplex') {
    return raw;
  }
  return undefined;
}

async function resolvePrinterName(event, payload = {}) {
  const requestedPrinterName = String(payload.printerName || '').trim();
  const printerType = String(payload.printerType || 'standard').trim().toLowerCase();
  const sourceWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getAllWindows()[0] || null;

  let printers = [];
  if (sourceWindow?.webContents?.getPrintersAsync) {
    try {
      printers = await sourceWindow.webContents.getPrintersAsync();
    } catch (error) {
      console.warn('Impossible de lire la liste des imprimantes:', error?.message || error);
    }
  }

  if (!Array.isArray(printers) || printers.length === 0) {
    return { printerName: requestedPrinterName || '', error: 'Aucune imprimante disponible sur ce poste' };
  }

  let savedSettings = null;
  try {
    savedSettings = await getScopedSettings();
  } catch (error) {
    console.warn('Impossible de lire les paramètres d\'impression:', error?.message || error);
  }

  const printerNames = new Set(printers.map((printer) => printer.name).filter(Boolean));
  const savedPreferredName = printerType === 'thermal'
    ? String(savedSettings?.preferredThermalPrinter || '').trim()
    : String(savedSettings?.preferredPrinter || '').trim();
  const preferredName = requestedPrinterName || savedPreferredName;

  if (preferredName && printerNames.has(preferredName)) {
    return { printerName: preferredName };
  }

  const fallbackPrinter = printers.find((printer) => printer.isDefault) || printers[0] || null;
  if (!fallbackPrinter?.name) {
    return { printerName: '', error: 'Aucune imprimante utilisable trouvée' };
  }

  return { printerName: fallbackPrinter.name };
}

export function handlePrintEvents() {
  ipcMain.handle('print:html', async (event, payload = {}) => {
    const html = String(payload.html || '');
    if (!html.trim()) {
      return { success: false, error: 'Document vide à imprimer' };
    }

    const pageSize = normalizePageSize(payload.pageSize);
    const { width, height } = getPrintViewport(pageSize);
    const { printerName, error: printerError } = await resolvePrinterName(event, payload);

    if (printerError && !printerName) {
      return { success: false, error: printerError };
    }

    const printWindow = new BrowserWindow({
      width,
      height,
      title: String(payload.documentTitle || 'Impression document'),
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    printWindow.setMenuBarVisibility(false);

    try {
      printWindow.webContents.setZoomFactor(1);
      printWindow.webContents.setZoomLevel(0);
    } catch (_) {}

    const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`;

    return await new Promise((resolve) => {
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        try {
          if (!printWindow.isDestroyed()) {
            printWindow.close();
          }
        } catch (_) {}
        resolve(result);
      };

      printWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
        finish({
          success: false,
          error: `Chargement du document impossible (${errorCode} - ${errorDescription})`
        });
      });

      printWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          try {
            printWindow.webContents.print({
              silent: true,
              printBackground: true,
              deviceName: printerName || undefined,
              color: true,
              margins: { marginType: 'none' },
              landscape: !!payload.landscape,
              copies: Math.max(1, Number(payload.copies) || 1),
              pageSize,
              duplexMode: normalizeDuplexMode(payload.duplexMode)
            }, (success, failureReason) => {
              if (!success) {
                finish({
                  success: false,
                  error: failureReason || 'Impression refusée par le système',
                  printerName
                });
                return;
              }

              finish({
                success: true,
                printerName
              });
            });
          } catch (error) {
            finish({
              success: false,
              error: error?.message || 'Erreur pendant l\'impression silencieuse',
              printerName
            });
          }
        }, 250);
      });

      printWindow.loadURL(dataUrl).catch((error) => {
        finish({
          success: false,
          error: error?.message || 'Chargement du document impossible'
        });
      });
    });
  });

  ipcMain.handle('print:save-pdf', async (event, payload = {}) => {
    const html = String(payload.html || '');
    if (!html.trim()) {
      return { success: false, error: 'Document vide à exporter' };
    }

    const pageSize = normalizePageSize(payload.pageSize);
    const { width, height } = getPrintViewport(pageSize);
    const sourceWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getAllWindows()[0] || null;
    const safeTitle = String(payload.documentTitle || 'document')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    const saveResult = await dialog.showSaveDialog(sourceWindow || undefined, {
      title: 'Enregistrer le document PDF',
      defaultPath: `${safeTitle || 'document'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const pdfWindow = new BrowserWindow({
      width,
      height,
      title: safeTitle || 'Export PDF',
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    pdfWindow.setMenuBarVisibility(false);

    try {
      pdfWindow.webContents.setZoomFactor(1);
      pdfWindow.webContents.setZoomLevel(0);
    } catch (_) {}

    const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`;

    return await new Promise((resolve) => {
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        try {
          if (!pdfWindow.isDestroyed()) {
            pdfWindow.close();
          }
        } catch (_) {}
        resolve(result);
      };

      pdfWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
        finish({
          success: false,
          error: `Chargement du document impossible (${errorCode} - ${errorDescription})`
        });
      });

      pdfWindow.webContents.once('did-finish-load', async () => {
        try {
          const pdfBuffer = await pdfWindow.webContents.printToPDF({
            pageSize,
            landscape: !!payload.landscape,
            printBackground: false,
            preferCSSPageSize: true,
            margins: { marginType: 'none' }
          });
          await import('fs').then((fs) => fs.promises.writeFile(saveResult.filePath, pdfBuffer));
          finish({ success: true, filePath: saveResult.filePath });
        } catch (error) {
          finish({
            success: false,
            error: error?.message || 'Export PDF impossible'
          });
        }
      });

      pdfWindow.loadURL(dataUrl).catch((error) => {
        finish({
          success: false,
          error: error?.message || 'Chargement du document impossible'
        });
      });
    });
  });
}

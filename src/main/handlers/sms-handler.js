/**
 * Gestionnaire SMS - confirmations RDV + rappels automatiques
 * Supporte les modems GSM/SIM USB via AT commands et les APIs HTTP
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { getScopedSettings } from '../services/settings-scope-service.js';

const DEFAULT_COUNTRY_CODE = '+213';
const DEFAULT_CABINET_PHONE = '0542893268';
const DEFAULT_REMINDER_TEMPLATE = 'Rappel: Votre RDV au cabinet {cabinet} est prevu le {date} a {heure}. Merci de confirmer.';
const DEFAULT_APPOINTMENT_TEMPLATE = 'Bonjour {patient}, votre RDV au cabinet {cabinet} est enregistre pour le {date} a {heure} ({type}). Contact: {phone}.';

let smsCheckInterval = null;
let serialPortInstance = null;
let smsConfig = null;

// ========== GENERIC HELPERS ==========

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhoneNumber(phoneNumber, countryCode = DEFAULT_COUNTRY_CODE) {
  const raw = String(phoneNumber || '').trim();
  if (!raw) {
    throw new Error('Numero de telephone manquant');
  }

  let normalized = raw.replace(/[^\d+]/g, '');

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith('0')) {
    normalized = `${countryCode}${normalized.slice(1)}`;
  } else if (!normalized.startsWith('+') && countryCode && normalized.startsWith(countryCode.replace('+', ''))) {
    normalized = `+${normalized}`;
  } else if (!normalized.startsWith('+') && normalized.length <= 10) {
    normalized = `${countryCode}${normalized}`;
  }

  const digitCount = normalized.replace(/\D/g, '').length;
  if (digitCount < 8) {
    throw new Error('Numero de telephone invalide');
  }

  return normalized;
}

function toModemSafeMessage(message) {
  return String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTemplateMessage(template, appointment, settings = {}) {
  const appointmentMoment = moment(appointment.appointmentDateTime || `${appointment.date} ${appointment.time}`);
  const patientName = [appointment.firstName, appointment.lastName].filter(Boolean).join(' ').trim() || 'Patient';
  const cabinetName = settings?.cabinetName?.trim() || 'le cabinet';
  const cabinetPhone = settings?.cabinetPhone?.trim() || DEFAULT_CABINET_PHONE;
  const replacements = {
    '{cabinet}': cabinetName,
    '{date}': appointmentMoment.isValid() ? appointmentMoment.format('DD/MM/YYYY') : '-',
    '{heure}': appointmentMoment.isValid() ? appointmentMoment.format('HH:mm') : '-',
    '{patient}': patientName,
    '{type}': appointment.appointmentType || appointment.type || 'Consultation',
    '{phone}': cabinetPhone,
    '{motif}': appointment.reason || '-'
  };

  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(token, value || ''),
    template || ''
  ).replace(/\s+/g, ' ').trim();
}

async function getCabinetSMSSettings() {
  const settings = await getScopedSettings();
  if (!settings) return {};
  return {
    cabinetName: settings.cabinetName,
    cabinetPhone: settings.cabinetPhone,
    doctorName: settings.doctorName
  };
}

// ========== AT COMMAND SMS ENGINE ==========

async function getSerialPort() {
  try {
    const { SerialPort } = await import('serialport');
    return SerialPort;
  } catch (e) {
    console.warn('âš ï¸ serialport not installed. SMS via modem not available.');
    return null;
  }
}

async function listAvailablePorts() {
  try {
    const SP = await getSerialPort();
    if (!SP) return [];
    const ports = await SP.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || 'Inconnu',
      vendorId: p.vendorId || '',
      productId: p.productId || '',
      serialNumber: p.serialNumber || ''
    }));
  } catch (e) {
    console.error('Error listing serial ports:', e);
    return [];
  }
}

async function closeExistingModem() {
  if (serialPortInstance && serialPortInstance.isOpen) {
    await new Promise((resolve) => {
      serialPortInstance.close(() => resolve());
    });
  }
}

async function openModem(config) {
  const SP = await getSerialPort();
  if (!SP) throw new Error('serialport non installe. Executez: npm install serialport');

  await closeExistingModem();

  return new Promise((resolve, reject) => {
    serialPortInstance = new SP({
      path: config.port,
      baudRate: parseInt(config.baudRate, 10) || 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: true
    });

    serialPortInstance.once('open', () => {
      console.log('ðŸ“± Modem GSM connecte sur', config.port);
      resolve(serialPortInstance);
    });

    serialPortInstance.once('error', (err) => {
      console.error('âŒ Erreur modem:', err);
      reject(err);
    });
  });
}

function waitForPortResponse(port, { timeout = 5000, isComplete }) {
  return new Promise((resolve, reject) => {
    let response = '';

    const cleanup = () => {
      clearTimeout(timer);
      port.off('data', onData);
      port.off('error', onError);
    };

    const onData = (data) => {
      response += data.toString();
      if (isComplete(response)) {
        cleanup();
        resolve(response.trim());
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`AT command timeout${response ? `: ${response.trim()}` : ''}`));
    }, timeout);

    port.on('data', onData);
    port.on('error', onError);
  });
}

function writeToPort(port, payload) {
  return new Promise((resolve, reject) => {
    port.write(payload, (error) => {
      if (error) {
        reject(error);
        return;
      }
      port.drain((drainError) => {
        if (drainError) {
          reject(drainError);
          return;
        }
        resolve();
      });
    });
  });
}

async function sendATCommand(port, command, timeout = 5000) {
  const responsePromise = waitForPortResponse(port, {
    timeout,
    isComplete: (response) => response.includes('OK') || response.includes('ERROR') || response.trim().endsWith('>')
  });
  await writeToPort(port, `${command}\r`);
  return responsePromise;
}

async function sendSMSBody(port, message, timeout = 20000) {
  const responsePromise = waitForPortResponse(port, {
    timeout,
    isComplete: (response) => response.includes('ERROR') || response.includes('OK') || response.includes('+CMGS')
  });
  await writeToPort(port, `${message}\x1A`);
  return responsePromise;
}

async function sendSMSviaModem(phoneNumber, message, config) {
  let port = null;
  try {
    if (!config.port) {
      return { success: false, error: 'Port du modem GSM non configure' };
    }

    const phone = normalizePhoneNumber(phoneNumber, config.countryCode || DEFAULT_COUNTRY_CODE);
    const modemMessage = toModemSafeMessage(message);
    port = await openModem(config);

    await delay(350);
    await sendATCommand(port, 'AT');
    await sendATCommand(port, 'ATE0');
    await sendATCommand(port, 'ATZ');
    await sendATCommand(port, 'AT+CMGF=1');
    await sendATCommand(port, 'AT+CSCS="GSM"').catch(() => 'OK');

    const prompt = await sendATCommand(port, `AT+CMGS="${phone}"`, 8000);
    if (!prompt.includes('>')) {
      throw new Error('Le modem n\'a pas accepte le destinataire SMS');
    }

    const result = await sendSMSBody(port, modemMessage, 20000);
    if (!result.includes('+CMGS') && !result.includes('OK')) {
      throw new Error('Le modem n\'a pas confirme l\'envoi du SMS');
    }

    console.log('âœ… SMS envoye a', phone);
    return { success: true, phone };
  } catch (err) {
    console.error('âŒ SMS modem error:', err.message);
    return { success: false, error: err.message };
  } finally {
    if (port && port.isOpen) {
      try {
        await new Promise((resolve) => port.close(() => resolve()));
      } catch (_) {
        // ignore close errors
      }
    }
  }
}

// ========== FALLBACK: HTTP SMS API ==========

async function parseHTTPResponse(res) {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return await res.text();
  } catch (_) {
    return null;
  }
}

async function sendSMSviaHTTP(phoneNumber, message, config) {
  try {
    const fetch = (await import('node-fetch')).default;
    const phone = normalizePhoneNumber(phoneNumber, config.countryCode || DEFAULT_COUNTRY_CODE);

    if (config.apiProvider === 'twilio') {
      if (!config.apiSid || !config.apiToken || !config.apiFrom) {
        return { success: false, error: 'Configuration Twilio incomplete (SID, token ou numero expÃ©diteur manquant)' };
      }

      const auth = Buffer.from(`${config.apiSid}:${config.apiToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.apiSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: phone,
          From: config.apiFrom,
          Body: message
        })
      });
      const data = await parseHTTPResponse(res);
      if (res.ok && data?.sid) {
        return { success: true, sid: data.sid };
      }
      return { success: false, error: data?.message || 'Echec Twilio' };
    }

    if (config.apiProvider === 'custom') {
      if (!config.apiUrl) {
        return { success: false, error: 'URL API SMS manquante' };
      }

      const headers = {
        'Content-Type': 'application/json'
      };

      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
        headers['X-API-Key'] = config.apiKey;
      }

      const res = await fetch(config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: phone,
          phoneNumber: phone,
          message,
          body: message,
          from: config.apiFrom || DEFAULT_CABINET_PHONE
        })
      });

      const data = await parseHTTPResponse(res);
      if (res.ok) {
        return { success: true, data };
      }

      return {
        success: false,
        error: typeof data === 'string' ? data : (data?.message || 'Echec API SMS')
      };
    }

    return { success: false, error: 'Fournisseur API non configure' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== UNIFIED SEND FUNCTION ==========

async function sendSMS(phoneNumber, message) {
  if (!smsConfig) {
    smsConfig = await loadSMSConfig();
  }
  if (!smsConfig || !smsConfig.enabled) {
    return { success: false, error: 'SMS non configure' };
  }

  let normalizedPhone = phoneNumber;
  try {
    normalizedPhone = normalizePhoneNumber(phoneNumber, smsConfig.countryCode || DEFAULT_COUNTRY_CODE);
  } catch (error) {
    return { success: false, error: error.message };
  }

  let result;
  if (smsConfig.mode === 'modem') {
    result = await sendSMSviaModem(normalizedPhone, message, smsConfig);
  } else if (smsConfig.mode === 'api') {
    result = await sendSMSviaHTTP(normalizedPhone, message, smsConfig);
  } else {
    return { success: false, error: 'Mode SMS invalide' };
  }

  try {
    await run(
      `INSERT INTO sms_log (id, phoneNumber, message, status, sentAt, provider, errorMessage)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        normalizedPhone,
        String(message || '').substring(0, 200),
        result.success ? 'sent' : 'failed',
        moment().format('YYYY-MM-DD HH:mm:ss'),
        smsConfig.mode === 'api' ? (smsConfig.apiProvider || 'api') : smsConfig.mode,
        result.error || null
      ]
    );
  } catch (_) {
    // ignore logging issues
  }

  return { ...result, phoneNumber: normalizedPhone };
}

// ========== SMS CONFIG PERSISTENCE ==========

async function loadSMSConfig() {
  try {
    const row = await queryOne('SELECT * FROM sms_config LIMIT 1');
    if (row) {
      smsConfig = {
        enabled: !!row.enabled,
        mode: row.mode || 'modem',
        port: row.port || '',
        baudRate: row.baudRate || 9600,
        countryCode: row.countryCode || DEFAULT_COUNTRY_CODE,
        apiProvider: row.apiProvider || '',
        apiUrl: row.apiUrl || '',
        apiKey: row.apiKey || '',
        apiSid: row.apiSid || '',
        apiToken: row.apiToken || '',
        apiFrom: row.apiFrom || '',
        reminderTemplate: row.reminderTemplate || DEFAULT_REMINDER_TEMPLATE,
        appointmentTemplate: row.appointmentTemplate || DEFAULT_APPOINTMENT_TEMPLATE,
        reminderHoursBefore: parseInt(row.reminderHoursBefore, 10) || 24,
        autoSendReminders: !!row.autoSendReminders,
        autoSendOnCreate: row.autoSendOnCreate === undefined ? true : !!row.autoSendOnCreate
      };
    }
    return smsConfig;
  } catch (e) {
    console.error('Error loading SMS config:', e);
    return null;
  }
}

async function saveSMSConfig(config) {
  try {
    const existing = await queryOne('SELECT id FROM sms_config LIMIT 1');
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const preparedConfig = {
      enabled: !!config.enabled,
      mode: config.mode || 'modem',
      port: config.port || '',
      baudRate: config.baudRate || 9600,
      countryCode: config.countryCode || DEFAULT_COUNTRY_CODE,
      apiProvider: config.apiProvider || '',
      apiUrl: config.apiUrl || '',
      apiKey: config.apiKey || '',
      apiSid: config.apiSid || '',
      apiToken: config.apiToken || '',
      apiFrom: config.apiFrom || '',
      reminderTemplate: config.reminderTemplate || DEFAULT_REMINDER_TEMPLATE,
      appointmentTemplate: config.appointmentTemplate || DEFAULT_APPOINTMENT_TEMPLATE,
      reminderHoursBefore: config.reminderHoursBefore || 24,
      autoSendReminders: !!config.autoSendReminders,
      autoSendOnCreate: config.autoSendOnCreate === undefined ? true : !!config.autoSendOnCreate
    };

    if (existing) {
      await run(
        `UPDATE sms_config SET
          enabled = ?, mode = ?, port = ?, baudRate = ?, countryCode = ?,
          apiProvider = ?, apiUrl = ?, apiKey = ?, apiSid = ?, apiToken = ?, apiFrom = ?,
          reminderTemplate = ?, appointmentTemplate = ?, reminderHoursBefore = ?,
          autoSendReminders = ?, autoSendOnCreate = ?, updatedAt = ?
        WHERE id = ?`,
        [
          preparedConfig.enabled ? 1 : 0,
          preparedConfig.mode,
          preparedConfig.port,
          preparedConfig.baudRate,
          preparedConfig.countryCode,
          preparedConfig.apiProvider,
          preparedConfig.apiUrl,
          preparedConfig.apiKey,
          preparedConfig.apiSid,
          preparedConfig.apiToken,
          preparedConfig.apiFrom,
          preparedConfig.reminderTemplate,
          preparedConfig.appointmentTemplate,
          preparedConfig.reminderHoursBefore,
          preparedConfig.autoSendReminders ? 1 : 0,
          preparedConfig.autoSendOnCreate ? 1 : 0,
          now,
          existing.id
        ]
      );
    } else {
      const id = uuidv4();
      await run(
        `INSERT INTO sms_config (
          id, enabled, mode, port, baudRate, countryCode,
          apiProvider, apiUrl, apiKey, apiSid, apiToken, apiFrom,
          reminderTemplate, appointmentTemplate, reminderHoursBefore,
          autoSendReminders, autoSendOnCreate, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          preparedConfig.enabled ? 1 : 0,
          preparedConfig.mode,
          preparedConfig.port,
          preparedConfig.baudRate,
          preparedConfig.countryCode,
          preparedConfig.apiProvider,
          preparedConfig.apiUrl,
          preparedConfig.apiKey,
          preparedConfig.apiSid,
          preparedConfig.apiToken,
          preparedConfig.apiFrom,
          preparedConfig.reminderTemplate,
          preparedConfig.appointmentTemplate,
          preparedConfig.reminderHoursBefore,
          preparedConfig.autoSendReminders ? 1 : 0,
          preparedConfig.autoSendOnCreate ? 1 : 0,
          now,
          now
        ]
      );
    }

    smsConfig = preparedConfig;
    return { success: true };
  } catch (e) {
    console.error('Error saving SMS config:', e);
    return { success: false, error: e.message };
  }
}

// ========== APPOINTMENT SMS HELPERS ==========

function getReminderQueryWindow(hoursAhead) {
  const reminderLead = Math.max(1, parseInt(hoursAhead, 10) || 24);

  if (reminderLead >= 18 && reminderLead <= 30) {
    return {
      type: 'date',
      start: moment().add(1, 'day').format('YYYY-MM-DD'),
      end: null
    };
  }

  return {
    type: 'range',
    start: moment().add(reminderLead - 1, 'hours').format('YYYY-MM-DD HH:mm:ss'),
    end: moment().add(reminderLead + 1, 'hours').format('YYYY-MM-DD HH:mm:ss')
  };
}

async function getPendingReminderAppointments(config) {
  const window = getReminderQueryWindow(config.reminderHoursBefore);

  if (window.type === 'date') {
    return query(
      `SELECT a.id, a.appointmentDateTime, a.appointmentType, a.reason, a.status,
              p.firstName, p.lastName, p.phone
       FROM appointments a
       JOIN patients p ON a.patientId = p.id
       WHERE DATE(a.appointmentDateTime) = ?
         AND a.status IN ('scheduled', 'confirmed')
         AND p.phone IS NOT NULL AND p.phone != ''
         AND a.id NOT IN (SELECT appointmentId FROM sms_reminders WHERE sent = 1)`,
      [window.start]
    );
  }

  return query(
    `SELECT a.id, a.appointmentDateTime, a.appointmentType, a.reason, a.status,
            p.firstName, p.lastName, p.phone
     FROM appointments a
     JOIN patients p ON a.patientId = p.id
     WHERE a.appointmentDateTime BETWEEN ? AND ?
       AND a.status IN ('scheduled', 'confirmed')
       AND p.phone IS NOT NULL AND p.phone != ''
       AND a.id NOT IN (SELECT appointmentId FROM sms_reminders WHERE sent = 1)`,
    [window.start, window.end]
  );
}

async function sendReminderForAppointment(appointment, config, settings) {
  const message = buildTemplateMessage(
    config.reminderTemplate || DEFAULT_REMINDER_TEMPLATE,
    appointment,
    settings
  );

  const result = await sendSMS(appointment.phone, message);

  try {
    await run(
      `INSERT INTO sms_reminders (id, appointmentId, patientPhone, message, sent, sentAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        appointment.id,
        appointment.phone,
        message,
        result.success ? 1 : 0,
        moment().format('YYYY-MM-DD HH:mm:ss')
      ]
    );
  } catch (_) {
    // ignore reminder history issues
  }

  return result;
}

export async function sendAppointmentCreatedSMS(appointment) {
  const config = await loadSMSConfig();

  if (!config || !config.enabled) {
    return { success: false, skipped: true, reason: 'SMS non configure' };
  }

  if (!config.autoSendOnCreate) {
    return { success: false, skipped: true, reason: 'SMS a la creation desactive' };
  }

  if (!appointment?.phone) {
    return { success: false, skipped: true, reason: 'Numero du patient manquant' };
  }

  const settings = await getCabinetSMSSettings();
  const message = buildTemplateMessage(
    config.appointmentTemplate || DEFAULT_APPOINTMENT_TEMPLATE,
    appointment,
    settings
  );

  const result = await sendSMS(appointment.phone, message);
  return {
    ...result,
    skipped: false,
    message
  };
}

// ========== APPOINTMENT REMINDER CHECKER ==========

async function checkAndSendReminders() {
  try {
    const config = await loadSMSConfig();
    if (!config || !config.enabled || !config.autoSendReminders) return;

    const appointments = await getPendingReminderAppointments(config);
    if (!appointments || appointments.length === 0) return;

    const settings = await getCabinetSMSSettings();
    let sentCount = 0;

    for (const appointment of appointments) {
      const result = await sendReminderForAppointment(appointment, config, settings);
      if (result.success) {
        sentCount += 1;
      }
      await delay(1200);
    }

    if (sentCount > 0) {
      console.log(`ðŸ“± ${sentCount} rappel(s) SMS envoye(s)`);
    }
  } catch (e) {
    console.error('Error in SMS reminder check:', e);
  }
}

function startSMSScheduler() {
  if (smsCheckInterval) clearInterval(smsCheckInterval);
  smsCheckInterval = setInterval(checkAndSendReminders, 30 * 60 * 1000);
  setTimeout(checkAndSendReminders, 10000);
  console.log('ðŸ“± SMS scheduler demarre (verification toutes les 30 min)');
}

function stopSMSScheduler() {
  if (smsCheckInterval) {
    clearInterval(smsCheckInterval);
    smsCheckInterval = null;
  }
}

// ========== IPC HANDLERS ==========

export function handleSMSEvents() {
  ipcMain.handle('sms:getConfig', async () => {
    try {
      const config = await loadSMSConfig();
      return { success: true, data: config || {} };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:saveConfig', async (event, config) => {
    try {
      const result = await saveSMSConfig(config);
      if (result.success && config.enabled && config.autoSendReminders) {
        startSMSScheduler();
      } else {
        stopSMSScheduler();
      }
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:listPorts', async () => {
    try {
      const ports = await listAvailablePorts();
      return { success: true, data: ports };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:sendTest', async (event, phoneNumber, message) => {
    try {
      const config = await loadSMSConfig();
      if (!config) return { success: false, error: 'SMS non configure' };
      return await sendSMS(phoneNumber, message || 'Test SMS MedCareSO');
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:send', async (event, phoneNumber, message) => {
    try {
      return await sendSMS(phoneNumber, message);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:getLog', async (event, limit) => {
    try {
      const logs = await query(
        'SELECT * FROM sms_log ORDER BY sentAt DESC LIMIT ?',
        [limit || 50]
      );
      return { success: true, data: logs || [] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:getReminders', async (event, limit) => {
    try {
      const reminders = await query(
        `SELECT sr.*, a.appointmentDateTime, p.firstName, p.lastName
         FROM sms_reminders sr
         JOIN appointments a ON sr.appointmentId = a.id
         JOIN patients p ON a.patientId = p.id
         ORDER BY sr.sentAt DESC LIMIT ?`,
        [limit || 50]
      );
      return { success: true, data: reminders || [] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sms:checkReminders', async () => {
    try {
      await checkAndSendReminders();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  setTimeout(async () => {
    try {
      const config = await loadSMSConfig();
      if (config && config.enabled && config.autoSendReminders) {
        startSMSScheduler();
      }
    } catch (e) {
      console.warn('âš ï¸ SMS config load deferred - DB not ready yet:', e.message);
    }
  }, 10000);

  console.log('SMS events registered');
}

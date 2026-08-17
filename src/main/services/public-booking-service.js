import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import moment from 'moment';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { app, ipcMain } from 'electron';
import { query, queryOne, run, withTransaction } from '../database-unified.js';
import { sendAppointmentCreatedSMS } from '../handlers/sms-handler.js';
import { broadcastRealtimeEvent } from '../realtime-server.js';
import { resolvePublicPractitioner } from './public-practitioner-selection.js';
import { renderMobileCabinetHtml } from './mobile-cabinet-html.js';

let bookingServer = null;
let publicBookingSchemaPromise = null;
let bookingServerState = {
  running: false,
  enabled: false,
  port: 4580,
  localUrl: '',
  publicUrl: '',
  token: '',
  lastError: null
};

const DEFAULT_PORT = 4580;
const DEFAULT_TYPES = ['Consultation', 'Contrôle', 'Rééducation', 'Kinésithérapie'];

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalNetworkAddress() {
  const interfaces = os.networkInterfaces() || {};
  for (const group of Object.values(interfaces)) {
    for (const iface of group || []) {
      if (iface && iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function normalizePhone(phone = '') {
  return String(phone || '').replace(/\D/g, '');
}

function parseFullName(fullName = '') {
  const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: 'Patient', lastName: 'Web' };
  }

  const parts = normalized.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(' ')
  };
}

function generateBookingCode() {
  return `WEB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function generateBookingToken() {
  return crypto.randomBytes(16).toString('hex');
}

async function ensurePublicBookingSchema() {
  if (!publicBookingSchemaPromise) {
    publicBookingSchemaPromise = (async () => {
      const statements = [
        'ALTER TABLE settings ADD COLUMN IF NOT EXISTS preferredThermalPrinter TEXT',
        'ALTER TABLE settings ADD COLUMN IF NOT EXISTS publicBookingEnabled INTEGER DEFAULT 0',
        'ALTER TABLE settings ADD COLUMN IF NOT EXISTS publicBookingPort INTEGER DEFAULT 4580',
        'ALTER TABLE settings ADD COLUMN IF NOT EXISTS publicBookingToken VARCHAR(255)',
        'ALTER TABLE settings ADD COLUMN IF NOT EXISTS publicBookingPublicUrl TEXT',
        'ALTER TABLE settings ADD COLUMN IF NOT EXISTS publicBookingQrEnabled INTEGER DEFAULT 1',
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS bookingSource VARCHAR(30) DEFAULT 'manual'",
        'ALTER TABLE appointments ADD COLUMN IF NOT EXISTS bookingCode VARCHAR(100)'
      ];

      for (const sql of statements) await run(sql);
    })().catch((error) => {
      publicBookingSchemaPromise = null;
      throw error;
    });
  }
  return publicBookingSchemaPromise;
}

async function ensureBookingToken(settingsRow) {
  if (!settingsRow) return '';
  if (settingsRow.publicBookingToken) {
    return settingsRow.publicBookingToken;
  }

  const token = generateBookingToken();
  await run(
    'UPDATE settings SET publicBookingToken = ?, updatedAt = ? WHERE id = ?',
    [token, moment().format('YYYY-MM-DD HH:mm:ss'), settingsRow.id]
  );
  settingsRow.publicBookingToken = token;
  return token;
}

async function getDistinctAppointmentTypes() {
  try {
    const rows = await query(
      `SELECT DISTINCT appointmentType
       FROM appointments
       WHERE appointmentType IS NOT NULL AND appointmentType != ''
       ORDER BY appointmentType ASC`
    );
    const found = (rows || []).map((row) => row.appointmentType).filter(Boolean);
    return Array.from(new Set([...DEFAULT_TYPES, ...found]));
  } catch (_) {
    return [...DEFAULT_TYPES];
  }
}

async function getBookingSettings() {
  await ensurePublicBookingSchema();
  let settings = await queryOne(
    `SELECT id, cabinetName, cabinetAddress, cabinetPhone, cabinetEmail,
            doctorName, doctorSpecialty, preferredPrinter, preferredScanner,
            preferredThermalPrinter, publicBookingEnabled, publicBookingPort,
            publicBookingToken, publicBookingPublicUrl, publicBookingQrEnabled
     FROM settings
     LIMIT 1`
  );

  if (!settings) {
    const id = uuidv4();
    const token = generateBookingToken();
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    try {
      await run(
        `INSERT INTO settings (id, cabinetName, publicBookingEnabled, publicBookingPort, publicBookingToken, publicBookingQrEnabled, createdAt, updatedAt)
         VALUES (?, ?, 1, ?, ?, 1, ?, ?)`,
        [id, 'Cabinet Médical', DEFAULT_PORT, token, now, now]
      );
      settings = await queryOne('SELECT * FROM settings WHERE id = ?', [id]);
    } catch (_) {
      settings = { id, cabinetName: 'Cabinet Médical', publicBookingPort: DEFAULT_PORT, publicBookingToken: token };
    }
  }

  await ensureBookingToken(settings);
  return settings;
}

async function buildShareData() {
  const settings = await getBookingSettings();
  const port = Number(settings?.publicBookingPort) || DEFAULT_PORT;
  const token = settings?.publicBookingToken || generateBookingToken();
  const localAddress = getLocalNetworkAddress();
  const localUrl = `http://${localAddress}:${port}/rdv/${token}`;
  const mobileUrl = `http://${localAddress}:${port}/mobile/${token}`;
  const publicUrl = String(settings?.publicBookingPublicUrl || '').trim() || localUrl;

  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(publicUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (_) {}

  let mobileQrDataUrl = null;
  try {
    mobileQrDataUrl = await QRCode.toDataURL(mobileUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: {
        dark: '#1677ff',
        light: '#ffffff'
      }
    });
  } catch (_) {}

  return {
    enabled: true,
    running: bookingServerState.running,
    port,
    token,
    localAddress,
    localUrl,
    mobileUrl,
    publicUrl,
    qrDataUrl,
    mobileQrDataUrl,
    cabinetName: settings?.cabinetName || 'Cabinet médical',
    doctorName: settings?.doctorName || '',
    lastError: bookingServerState.lastError
  };
}

async function handleMobileUploadPhoto(payload) {
  const { patientId, category = 'photo', notes = '', base64 } = payload || {};
  if (!patientId || !base64) {
    return { success: false, error: 'Patient ou image manquante' };
  }

  const matches = String(base64).match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  const ext = matches ? matches[1] : 'jpg';
  const data = matches ? matches[2] : base64;
  const buffer = Buffer.from(data, 'base64');

  const userDataDir = app?.getPath ? app.getPath('userData') : path.join(os.homedir(), '.config', 'physiocare');
  const attachmentsDir = path.join(userDataDir, 'attachments');
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  const safeName = `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const filePath = path.join(attachmentsDir, safeName);
  fs.writeFileSync(filePath, buffer);

  const attachmentId = uuidv4();
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  await run(
    `INSERT INTO patient_attachments (
      id, patientId, fileName, filePath, fileType, fileSize, category, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attachmentId,
      patientId,
      notes || `Photo Mobile ${moment().format('DD/MM/YYYY HH:mm')}`,
      filePath,
      `image/${ext}`,
      buffer.length,
      category || 'photo',
      now
    ]
  );

  broadcastRealtimeEvent({
    type: 'attachment:new',
    id: attachmentId,
    patientId,
    category,
    title: 'Nouvelle photo reçue depuis le mobile',
    message: `Photo ajoutée pour le patient #${patientId}`
  });

  return { success: true, data: { id: attachmentId, filePath } };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        reject(new Error('Payload trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(new Error('JSON invalide'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

function createSlotList(bookedTimes = []) {
  const bookedSet = new Set(bookedTimes);
  const slots = [];

  for (let hour = 8; hour < 18; hour += 1) {
    ['00', '30'].forEach((minutes) => {
      const time = `${String(hour).padStart(2, '0')}:${minutes}`;
      slots.push({
        time,
        available: !bookedSet.has(time)
      });
    });
  }

  return slots;
}

async function getSlotsForDate(dateValue, requestedPractitionerId = '') {
  const date = String(dateValue || '').slice(0, 10);
  if (!date) {
    return { slots: createSlotList([]) };
  }

  const startOfDay = moment(date).startOf('day').format('YYYY-MM-DD HH:mm:ss');
  const endOfDay = moment(date).endOf('day').format('YYYY-MM-DD HH:mm:ss');

  const practitioners = await getPublicPractitioners();
  const { selectedPractitioner, selectionRequired } = resolvePublicPractitioner(
    practitioners,
    requestedPractitionerId
  );
  if (selectionRequired) {
    return { slots: [], practitionerRequired: true };
  }

  const rows = await query(
    `SELECT appointmentDateTime
     FROM appointments
     WHERE appointmentDateTime BETWEEN ? AND ?
       AND status != 'cancelled'
       AND assignedTo IS NOT DISTINCT FROM ?
     ORDER BY appointmentDateTime ASC`,
    [startOfDay, endOfDay, selectedPractitioner?.id || null]
  );

  const bookedTimes = (rows || []).map((row) => {
    return moment(row.appointmentDateTime).format('HH:mm');
  }).filter(Boolean);

  return {
    slots: createSlotList(bookedTimes)
  };
}

async function findOrCreatePatientFromBooking(data) {
  const normalizedPhone = normalizePhone(data.phone);
  const normalizedEmail = String(data.email || '').trim().toLowerCase();
  const patients = await query(
    'SELECT id, firstName, lastName, phone, email FROM patients WHERE phone IS NOT NULL OR email IS NOT NULL'
  );

  const existing = (patients || []).find((patient) => {
    const patientPhone = normalizePhone(patient.phone);
    const patientEmail = String(patient.email || '').trim().toLowerCase();
    return (
      (normalizedPhone && patientPhone && patientPhone === normalizedPhone) ||
      (normalizedEmail && patientEmail && patientEmail === normalizedEmail)
    );
  });

  if (existing) {
    return existing.id;
  }

  const { firstName, lastName } = parseFullName(data.fullName);
  const patientId = uuidv4();
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  await run(
    `INSERT INTO patients (
      id, firstName, lastName, phone, email, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      patientId,
      firstName,
      lastName || 'Patient',
      data.phone || null,
      data.email || null,
      now,
      now
    ]
  );

  return patientId;
}

async function getAppointmentDetailsById(id) {
  const appointment = await queryOne(
    `SELECT a.*,
            p.firstName, p.lastName, p.phone, p.email
     FROM appointments a
     JOIN patients p ON a.patientId = p.id
     WHERE a.id = ?`,
    [id]
  );

  if (!appointment) return null;
  const momentDateTime = moment(appointment.appointmentDateTime);
  return {
    ...appointment,
    date: momentDateTime.format('YYYY-MM-DD'),
    time: momentDateTime.format('HH:mm'),
    type: appointment.appointmentType,
    patientName: `${appointment.firstName || ''} ${appointment.lastName || ''}`.trim()
  };
}

async function createAppointmentFromPublicBooking(payload) {
  const fullName = String(payload.fullName || '').trim();
  const phone = String(payload.phone || '').trim();
  const email = String(payload.email || '').trim();
  const date = String(payload.date || '').slice(0, 10);
  const time = String(payload.time || '').slice(0, 5);
  const type = String(payload.type || 'Consultation').trim() || 'Consultation';
  const reason = String(payload.reason || '').trim();
  const requestedPractitionerId = String(payload.practitionerId || '').trim();

  if (!fullName || !phone || !date || !time || !reason) {
    return { success: false, error: 'Merci de remplir les champs obligatoires.' };
  }

  const practitioners = await getPublicPractitioners();
  const { selectedPractitioner } = resolvePublicPractitioner(practitioners, requestedPractitionerId);
  if (!selectedPractitioner) {
    return {
      success: false,
      error: practitioners.length > 1
        ? 'Merci de choisir un médecin.'
        : 'Aucun médecin disponible pour ce rendez-vous.'
    };
  }

  const appointmentDateTime = `${date} ${time}`;
  const created = await withTransaction(async () => {
    await queryOne(
      'SELECT pg_advisory_xact_lock(hashtext(?))',
      [`public-slot:${selectedPractitioner.id}:${appointmentDateTime}`]
    );
    const conflict = await queryOne(
      `SELECT id FROM appointments
       WHERE appointmentDateTime = ?
         AND assignedTo = ?
         AND status != 'cancelled'
       FOR UPDATE`,
      [appointmentDateTime, selectedPractitioner.id]
    );

    if (conflict) {
      return { conflict: true };
    }

    const patientLockKey = normalizePhone(phone) || String(email || '').trim().toLowerCase();
    await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`public-patient:${patientLockKey}`]);
    const patientId = await findOrCreatePatientFromBooking({ fullName, phone, email });
    await run(
      `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
       VALUES (?, ?, ?)
       ON CONFLICT (patientId, practitionerId) DO NOTHING`,
      [patientId, selectedPractitioner.id, selectedPractitioner.id]
    );
    await run(
      'UPDATE patients SET primaryDoctorId = COALESCE(primaryDoctorId, ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [selectedPractitioner.id, patientId]
    );
    const appointmentId = uuidv4();
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const bookingCode = generateBookingCode();

    await run(
      `INSERT INTO appointments (
        id, patientId, assignedTo, appointmentDateTime, appointmentType, reason, status, notes,
        bookingSource, bookingCode, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appointmentId,
        patientId,
        selectedPractitioner.id,
        appointmentDateTime,
        type,
        reason,
        'scheduled',
        'RDV pris depuis le portail web du cabinet',
        'web',
        bookingCode,
        now,
        now
      ]
    );
    return { appointmentId, patientId, bookingCode };
  }, { isolationLevel: 'SERIALIZABLE' });

  if (created.conflict) {
    return { success: false, error: 'Ce créneau vient d’être réservé. Merci de choisir une autre heure.' };
  }

  const { appointmentId, patientId, bookingCode } = created;

  const createdAppointment = await getAppointmentDetailsById(appointmentId);
  let smsResult = { success: false, skipped: true };
  if (createdAppointment) {
    try {
      smsResult = await sendAppointmentCreatedSMS(createdAppointment);
    } catch (error) {
      smsResult = { success: false, skipped: false, error: error.message };
    }
  }

  return {
    success: true,
    data: {
      id: appointmentId,
      bookingCode,
      patientId,
      patientName: fullName,
      date,
      time,
      type,
      practitionerId: selectedPractitioner.id,
      practitionerName: selectedPractitioner.name,
      smsResult
    }
  };
}

async function getPublicPractitioners() {
  const rows = await query(
    `SELECT id, fullName, specialty
     FROM users
     WHERE isActive = 1
       AND isSuperAdmin = 0
       AND role IN ('doctor', 'dentist')
     ORDER BY fullName ASC`
  );
  return (rows || []).map((row) => ({
    id: row.id,
    name: row.fullName || 'Praticien',
    specialty: row.specialty || ''
  }));
}

async function getPublicQueue(trackingToken = '', requestedPractitionerId = '') {
  const today = moment().format('YYYY-MM-DD');
  const allRows = await query(
    `SELECT w.id, w.publicTicketCode, w.publicTrackingToken, w.status,
            w.priority, w.arrivalTime, w.declaredAppointment, w.appointmentId, w.assignedTo
     FROM waiting_room w
     WHERE DATE(w.arrivalTime) = ?
       AND w.status IN ('waiting', 'in-consultation')
     ORDER BY CASE WHEN w.status = 'in-consultation' THEN 0 ELSE 1 END,
              w.priority DESC, w.arrivalTime ASC`,
    [today]
  );

  const ownRow = trackingToken
    ? (allRows || []).find((row) => row.publicTrackingToken === trackingToken)
    : null;
  const practitionerId = ownRow?.assignedTo || String(requestedPractitionerId || '').trim();
  const rows = practitionerId
    ? (allRows || []).filter((row) => row.assignedTo === practitionerId)
    : (allRows || []);

  let waitingPosition = 0;
  const queue = (rows || []).map((row) => {
    const isWaiting = row.status === 'waiting';
    if (isWaiting) waitingPosition += 1;
    return {
      ticketCode: row.publicTicketCode || 'Accueil',
      status: row.status,
      position: isWaiting ? waitingPosition : 0
    };
  });

  const ownQueueEntry = ownRow
    ? queue[(rows || []).findIndex((row) => row.id === ownRow.id)]
    : null;

  return {
    queue,
    updatedAt: new Date().toISOString(),
    own: ownRow ? {
      ticketCode: ownRow.publicTicketCode,
      status: ownRow.status,
      position: ownQueueEntry?.position || 0,
      peopleAhead: ownQueueEntry?.position > 0 ? ownQueueEntry.position - 1 : 0,
      declaredAppointment: !!ownRow.declaredAppointment,
      appointmentMatched: !!ownRow.appointmentId
    } : null
  };
}

async function createPublicWaitingCheckIn(payload) {
  const fullName = String(payload.fullName || '').trim().replace(/\s+/g, ' ');
  const phone = String(payload.phone || '').trim();
  const reason = String(payload.reason || '').trim().slice(0, 255);
  const declaredAppointment = payload.hasAppointment === true || payload.hasAppointment === 'true';
  const requestedPractitionerId = String(payload.practitionerId || '').trim();

  if (!fullName || !phone) {
    return { success: false, error: 'Merci de saisir le nom complet et le numéro de téléphone.' };
  }

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 8) {
    return { success: false, error: 'Le numéro de téléphone est invalide.' };
  }

  const today = moment().format('YYYY-MM-DD');
  const practitioners = await getPublicPractitioners();
  const practitionerSelection = resolvePublicPractitioner(practitioners, requestedPractitionerId);
  const { selectedPractitioner } = practitionerSelection;

  if (!practitionerSelection.hasPractitioners) {
    return { success: false, error: 'Aucun médecin disponible pour cette arrivée.' };
  }
  if (practitionerSelection.requestedPractitionerUnavailable) {
    return { success: false, error: 'Le praticien sélectionné est indisponible.' };
  }
  if (practitionerSelection.selectionRequired) {
    return { success: false, error: 'Merci de choisir le praticien concerné.' };
  }

  const created = await withTransaction(async () => {
    await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`public-waiting:${today}`]);
    await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`public-arrival:${today}:${normalizedPhone}`]);

    const patientId = await findOrCreatePatientFromBooking({ fullName, phone, email: '' });
    if (selectedPractitioner) {
      await run(
        `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
         VALUES (?, ?, ?)
         ON CONFLICT (patientId, practitionerId) DO NOTHING`,
        [patientId, selectedPractitioner.id, selectedPractitioner.id]
      );
      await run(
        'UPDATE patients SET primaryDoctorId = COALESCE(primaryDoctorId, ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [selectedPractitioner.id, patientId]
      );
    }
    const existing = await queryOne(
      `SELECT id, appointmentId, publicTicketCode, publicTrackingToken
       FROM waiting_room
       WHERE patientId = ?
         AND DATE(arrivalTime) = ?
         AND status IN ('waiting', 'in-consultation')
       FOR UPDATE`,
      [patientId, today]
    );
    if (existing) {
      let ticketCode = existing.publicTicketCode;
      let trackingToken = existing.publicTrackingToken;
      if (!ticketCode || !trackingToken) {
        const existingCount = await queryOne(
          'SELECT COUNT(*) AS count FROM waiting_room WHERE DATE(arrivalTime) = ?',
          [today]
        );
        ticketCode = ticketCode || `A-${String(Number(existingCount?.count || 0)).padStart(3, '0')}`;
        trackingToken = trackingToken || crypto.randomBytes(24).toString('hex');
        await run(
          `UPDATE waiting_room
           SET publicTicketCode = ?, publicTrackingToken = ?, arrivalSource = 'public-web', updatedAt = ?
           WHERE id = ?`,
          [ticketCode, trackingToken, moment().format('YYYY-MM-DD HH:mm:ss'), existing.id]
        );
      }
      return {
        duplicate: true,
        ticketCode,
        trackingToken,
        appointmentId: existing.appointmentId || null
      };
    }

    let appointmentId = null;
    if (declaredAppointment) {
      const appointment = await queryOne(
        `SELECT id
         FROM appointments
         WHERE patientId = ?
           AND DATE(appointmentDateTime) = ?
           AND status != 'cancelled'
         ORDER BY ABS(EXTRACT(EPOCH FROM (appointmentDateTime - CURRENT_TIMESTAMP))) ASC
         LIMIT 1`,
        [patientId, today]
      );
      appointmentId = appointment?.id || null;
    }

    const countRow = await queryOne(
      'SELECT COUNT(*) AS count FROM waiting_room WHERE DATE(arrivalTime) = ?',
      [today]
    );
    const ticketCode = `A-${String(Number(countRow?.count || 0) + 1).padStart(3, '0')}`;
    const trackingToken = crypto.randomBytes(24).toString('hex');
    const id = uuidv4();
    const arrivalTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const defaultReason = declaredAppointment ? 'Arrivée avec rendez-vous' : 'Arrivée sans rendez-vous';

    await run(
      `INSERT INTO waiting_room (
         id, patientId, appointmentId, arrivalTime, reason, status, priority,
         assignedTo, notes, publicTicketCode, publicTrackingToken,
         arrivalSource, declaredAppointment, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, 'waiting', 0, ?, ?, ?, ?, 'public-web', ?, ?, ?)`,
      [
        id,
        patientId,
        appointmentId,
        arrivalTime,
        reason || defaultReason,
        selectedPractitioner?.id || null,
        declaredAppointment && !appointmentId ? 'Rendez-vous déclaré par le patient, non rapproché automatiquement' : null,
        ticketCode,
        trackingToken,
        declaredAppointment,
        arrivalTime,
        arrivalTime
      ]
    );

    return { id, patientId, ticketCode, trackingToken, appointmentId, duplicate: false };
  }, { isolationLevel: 'SERIALIZABLE' });

  if (!created.duplicate) {
    broadcastRealtimeEvent({
      type: 'waiting-room:new',
      id: created.id,
      patientId: created.patientId,
      assignedTo: selectedPractitioner?.id || null,
      title: 'Nouvelle arrivée depuis le QR code',
      message: `${created.ticketCode} vient de rejoindre la salle d’attente`
    });
  }

  const queueState = await getPublicQueue(created.trackingToken);
  return {
    success: true,
    data: {
      ticketCode: created.ticketCode,
      trackingToken: created.trackingToken,
      duplicate: created.duplicate,
      appointmentMatched: !!created.appointmentId,
      queue: queueState
    }
  };
}

function renderPortalHtml(shareData) {
  const title = escapeHtml(shareData.cabinetName || 'Prise de rendez-vous');
  const doctorName = escapeHtml(shareData.doctorName || 'Cabinet');
  const token = escapeHtml(shareData.token || '');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} • Rendez-vous</title>
  <style>
    :root {
      --bg: #edf3f8;
      --panel: rgba(255,255,255,0.96);
      --line: rgba(15, 23, 42, 0.08);
      --ink: #0f172a;
      --muted: #64748b;
      --brand: #0f5fa8;
      --brand-soft: #dbeafe;
      --success: #0f766e;
      --danger: #b91c1c;
      --shadow: 0 24px 60px rgba(15, 23, 42, 0.14);
      font-family: "Segoe UI", "Noto Sans", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 28%),
        radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.18), transparent 32%),
        linear-gradient(180deg, #f7fbff 0%, var(--bg) 100%);
      color: var(--ink);
    }
    .shell {
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 18px 40px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
      margin-bottom: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
      padding: 24px;
      backdrop-filter: blur(10px);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--brand-soft);
      color: var(--brand);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 16px 0 12px;
      font-size: clamp(34px, 4vw, 48px);
      line-height: 1.05;
      letter-spacing: -0.05em;
    }
    .lead {
      margin: 0;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.7;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 22px;
    }
    .meta-item {
      border-radius: 18px;
      background: #f8fbff;
      border: 1px solid rgba(15, 95, 168, 0.08);
      padding: 14px 16px;
    }
    .meta-label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .meta-value {
      font-weight: 700;
      font-size: 16px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .field,
    .field-full {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .field-full {
      grid-column: 1 / -1;
    }
    label {
      font-size: 13px;
      font-weight: 700;
      color: #334155;
    }
    input, select, textarea {
      width: 100%;
      border: 1px solid rgba(15, 95, 168, 0.16);
      border-radius: 16px;
      padding: 14px 15px;
      font: inherit;
      background: #f9fbfd;
      color: var(--ink);
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: rgba(15, 95, 168, 0.45);
      box-shadow: 0 0 0 4px rgba(15, 95, 168, 0.10);
      background: white;
    }
    textarea {
      min-height: 110px;
      resize: vertical;
    }
    .slots {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: 10px;
    }
    .slot {
      border: 1px solid rgba(15, 95, 168, 0.12);
      background: white;
      color: var(--ink);
      border-radius: 16px;
      padding: 12px 10px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .slot:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 14px 26px rgba(15, 23, 42, 0.10);
    }
    .slot.active {
      border-color: var(--brand);
      background: var(--brand);
      color: white;
    }
    .slot:disabled {
      cursor: not-allowed;
      opacity: 0.45;
      background: #f1f5f9;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-top: 18px;
      flex-wrap: wrap;
    }
    .submit-btn {
      border: 0;
      border-radius: 18px;
      padding: 14px 22px;
      font: inherit;
      font-weight: 800;
      background: linear-gradient(135deg, #0f5fa8, #1d4ed8);
      color: white;
      cursor: pointer;
      box-shadow: 0 18px 32px rgba(29, 78, 216, 0.22);
    }
    .hint {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .feedback {
      display: none;
      margin-top: 14px;
      padding: 14px 16px;
      border-radius: 18px;
      font-weight: 700;
    }
    .feedback.success {
      display: block;
      background: #ecfdf5;
      color: var(--success);
      border: 1px solid rgba(15, 118, 110, 0.14);
    }
    .feedback.error {
      display: block;
      background: #fef2f2;
      color: var(--danger);
      border: 1px solid rgba(185, 28, 28, 0.12);
    }
    .portal-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 0 0 18px;
    }
    .tab-btn {
      border: 1px solid rgba(15, 95, 168, 0.14);
      border-radius: 16px;
      padding: 14px 16px;
      background: white;
      color: var(--ink);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .tab-btn.active { background: var(--brand); color: white; }
    .portal-panel.hidden { display: none; }
    .choice-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .choice-card {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(15, 95, 168, 0.14);
      border-radius: 16px;
      padding: 14px;
      background: #f9fbfd;
      cursor: pointer;
    }
    .choice-card input { width: auto; }
    .queue-layout {
      display: grid;
      grid-template-columns: 0.9fr 1.1fr;
      gap: 18px;
      margin-top: 18px;
    }
    .queue-box {
      border: 1px solid rgba(15, 95, 168, 0.10);
      border-radius: 20px;
      background: #f8fbff;
      padding: 18px;
    }
    .queue-list { display: grid; gap: 9px; margin-top: 12px; }
    .queue-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 13px;
      border-radius: 14px;
      background: white;
      border: 1px solid rgba(15, 23, 42, 0.06);
      font-weight: 700;
    }
    .queue-row.own { border-color: var(--brand); background: #eff6ff; }
    .own-ticket { font-size: 30px; font-weight: 900; color: var(--brand); margin: 8px 0; }
    .privacy-note { color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 10px; }
    @media (max-width: 900px) {
      .hero, .form-grid, .meta, .queue-layout {
        grid-template-columns: 1fr;
      }
      .shell {
        padding: 18px 14px 30px;
      }
      .card {
        border-radius: 24px;
        padding: 20px;
      }
      .portal-tabs, .choice-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <section class="card">
        <span class="eyebrow">Accueil du cabinet</span>
        <h1>Signalez votre arrivée en quelques secondes.</h1>
        <p class="lead">
          Rejoignez la salle d’attente avec ou sans rendez-vous, puis suivez votre position depuis votre téléphone.
        </p>
        <div class="meta">
          <div class="meta-item">
            <span class="meta-label">Cabinet</span>
            <span class="meta-value">${title}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Praticien</span>
            <span class="meta-value">${doctorName || 'Médecin du cabinet'}</span>
          </div>
        </div>
      </section>
      <section class="card">
        <span class="eyebrow">File en direct</span>
        <h2 style="margin:16px 0 10px;font-size:28px;letter-spacing:-0.04em;">Votre ordre, sans afficher les noms</h2>
        <p class="lead" style="font-size:15px;">
          Un numéro de passage privé vous est attribué. La liste se met à jour automatiquement.
        </p>
      </section>
    </div>

    <nav class="portal-tabs" aria-label="Services du cabinet">
      <button type="button" class="tab-btn active" data-panel="checkin-panel">Je suis arrivé(e)</button>
      <button type="button" class="tab-btn" data-panel="booking-panel">Prendre un rendez-vous</button>
    </nav>

    <section class="card portal-panel" id="checkin-panel">
      <form id="public-checkin-form">
        <div class="form-grid">
          <div class="field">
            <label for="checkin-fullname">Nom complet *</label>
            <input id="checkin-fullname" required autocomplete="name" maxlength="160">
          </div>
          <div class="field">
            <label for="checkin-phone">Téléphone *</label>
            <input id="checkin-phone" required autocomplete="tel" inputmode="tel" maxlength="30">
          </div>
          <div class="field-full">
            <label>Avez-vous un rendez-vous aujourd’hui ? *</label>
            <div class="choice-grid">
              <label class="choice-card"><input type="radio" name="hasAppointment" value="true" required> Oui, j’ai un RDV</label>
              <label class="choice-card"><input type="radio" name="hasAppointment" value="false" required> Non, sans RDV</label>
            </div>
          </div>
          <div class="field-full" id="checkin-practitioner-field">
            <label for="checkin-practitioner">Médecin *</label>
            <select id="checkin-practitioner"></select>
          </div>
          <div class="field-full">
            <label for="checkin-reason">Motif de la visite (optionnel)</label>
            <textarea id="checkin-reason" maxlength="255" placeholder="Ex. consultation, contrôle, douleur..."></textarea>
          </div>
        </div>
        <div class="actions">
          <div class="hint">Votre arrivée sera visible immédiatement dans le logiciel du cabinet.</div>
          <button type="submit" class="submit-btn" id="checkin-submit">Rejoindre la file</button>
        </div>
      </form>
      <div id="checkin-feedback" class="feedback"></div>
      <div class="queue-layout">
        <div class="queue-box" id="own-status">
          <strong>Votre passage</strong>
          <p class="hint">Après votre inscription, votre numéro et votre position apparaîtront ici.</p>
        </div>
        <div class="queue-box">
          <strong>Ordre de passage actuel</strong>
          <div id="public-queue-list" class="queue-list"></div>
          <div class="privacy-note">Pour protéger les patients, seuls les numéros de passage sont affichés.</div>
        </div>
      </div>
    </section>

    <section class="card portal-panel hidden" id="booking-panel">
      <form id="public-booking-form">
        <div class="form-grid">
          <div class="field">
            <label for="booking-fullname">Nom complet *</label>
            <input id="booking-fullname" name="fullName" required autocomplete="name">
          </div>
          <div class="field">
            <label for="booking-phone">Téléphone *</label>
            <input id="booking-phone" name="phone" required autocomplete="tel" inputmode="tel">
          </div>
          <div class="field-full" id="booking-practitioner-field">
            <label for="booking-practitioner">Médecin *</label>
            <select id="booking-practitioner" name="practitionerId"></select>
          </div>
          <div class="field">
            <label for="booking-email">Email</label>
            <input id="booking-email" name="email" type="email" autocomplete="email">
          </div>
          <div class="field">
            <label for="booking-type">Type de RDV *</label>
            <select id="booking-type" name="type"></select>
          </div>
          <div class="field">
            <label for="booking-date">Date *</label>
            <input id="booking-date" name="date" type="date" required>
          </div>
          <div class="field">
            <label for="booking-time">Heure *</label>
            <input id="booking-time" name="time" type="hidden">
            <div id="booking-slots" class="slots"></div>
          </div>
          <div class="field-full">
            <label for="booking-reason">Motif *</label>
            <textarea id="booking-reason" name="reason" required placeholder="Expliquez brièvement la demande du patient"></textarea>
          </div>
        </div>
        <div class="actions">
          <div class="hint">
            En validant, le rendez-vous est ajouté à l’agenda principal du cabinet.
            Un SMS de confirmation peut être envoyé automatiquement si le module SMS est configuré.
          </div>
          <button type="submit" class="submit-btn">Confirmer le rendez-vous</button>
        </div>
      </form>
      <div id="booking-feedback" class="feedback"></div>
    </section>
  </div>
  <script>
    const token = ${JSON.stringify(token)};
    const form = document.getElementById('public-booking-form');
    const dateInput = document.getElementById('booking-date');
    const timeInput = document.getElementById('booking-time');
    const typeSelect = document.getElementById('booking-type');
    const slotsContainer = document.getElementById('booking-slots');
    const feedback = document.getElementById('booking-feedback');
    const checkinForm = document.getElementById('public-checkin-form');
    const checkinFeedback = document.getElementById('checkin-feedback');
    const practitionerField = document.getElementById('checkin-practitioner-field');
    const practitionerSelect = document.getElementById('checkin-practitioner');
    const bookingPractitionerField = document.getElementById('booking-practitioner-field');
    const bookingPractitionerSelect = document.getElementById('booking-practitioner');
    const queueList = document.getElementById('public-queue-list');
    const ownStatus = document.getElementById('own-status');
    const trackingStorageKey = 'medcareso-waiting-tracking-' + token;

    function showFeedback(type, message) {
      feedback.className = 'feedback ' + type;
      feedback.textContent = message;
    }

    function showCheckinFeedback(type, message) {
      checkinFeedback.className = 'feedback ' + type;
      checkinFeedback.textContent = message;
    }

    document.querySelectorAll('.tab-btn').forEach(function(button) {
      button.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(function(item) {
          item.classList.toggle('active', item === button);
        });
        document.querySelectorAll('.portal-panel').forEach(function(panel) {
          panel.classList.toggle('hidden', panel.id !== button.dataset.panel);
        });
      });
    });

    async function loadConfig() {
      const response = await fetch('/api/rdv/' + token + '/config');
      const result = await response.json();
      if (!result.success) return;

      typeSelect.replaceChildren();
      (result.data.types || []).forEach(function(type) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
      });

      const practitioners = result.data.practitioners || [];
      [practitionerSelect, bookingPractitionerSelect].forEach(function(select) {
        select.replaceChildren();
        if (practitioners.length !== 1) {
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = practitioners.length ? 'Choisir un médecin' : 'Aucun médecin disponible';
          select.appendChild(placeholder);
        }
        practitioners.forEach(function(practitioner) {
          const option = document.createElement('option');
          option.value = practitioner.id;
          option.textContent = practitioner.name + (practitioner.specialty ? ' • ' + practitioner.specialty : '');
          select.appendChild(option);
        });
        select.required = practitioners.length > 1;
        select.disabled = practitioners.length <= 1;
        if (practitioners.length === 1) select.value = practitioners[0].id;
      });
      practitionerField.style.display = 'flex';
      bookingPractitionerField.style.display = 'flex';
    }

    function statusLabel(status) {
      return status === 'in-consultation' ? 'Appelé / en consultation' : 'En attente';
    }

    function renderQueue(data) {
      const queue = data.queue || [];
      const own = data.own || null;
      queueList.replaceChildren();

      if (!queue.length) {
        const empty = document.createElement('div');
        empty.className = 'hint';
        empty.textContent = 'La file est vide pour le moment.';
        queueList.appendChild(empty);
      } else {
        queue.forEach(function(entry) {
          const row = document.createElement('div');
          row.className = 'queue-row' + (own && own.ticketCode === entry.ticketCode ? ' own' : '');
          const ticket = document.createElement('span');
          ticket.textContent = entry.ticketCode;
          const position = document.createElement('span');
          position.textContent = entry.status === 'in-consultation' ? 'En consultation' : '#' + entry.position;
          row.append(ticket, position);
          queueList.appendChild(row);
        });
      }

      if (own) {
        ownStatus.replaceChildren();
        const heading = document.createElement('strong');
        heading.textContent = 'Votre passage';
        const ticket = document.createElement('div');
        ticket.className = 'own-ticket';
        ticket.textContent = own.ticketCode;
        const detail = document.createElement('p');
        detail.className = 'hint';
        detail.textContent = own.status === 'in-consultation'
          ? 'Vous avez été appelé(e). Merci de vous présenter.'
          : 'Position ' + own.position + ' • ' + own.peopleAhead + ' personne(s) avant vous.';
        const appointment = document.createElement('p');
        appointment.className = 'privacy-note';
        appointment.textContent = own.declaredAppointment
          ? (own.appointmentMatched ? 'Rendez-vous retrouvé dans l’agenda.' : 'Rendez-vous déclaré, vérification par l’accueil.')
          : 'Arrivée sans rendez-vous.';
        ownStatus.append(heading, ticket, detail, appointment);
      }
    }

    async function loadQueue() {
      try {
        const tracking = localStorage.getItem(trackingStorageKey) || '';
        const response = await fetch(
          '/api/rdv/' + token + '/queue?tracking=' + encodeURIComponent(tracking)
          + '&practitioner=' + encodeURIComponent(practitionerSelect.value || ''),
          { cache: 'no-store' }
        );
        const result = await response.json();
        if (result.success) renderQueue(result.data || {});
      } catch (_) {
        // The next automatic refresh will retry.
      }
    }

    checkinForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      const submitButton = document.getElementById('checkin-submit');
      const appointmentChoice = checkinForm.querySelector('input[name="hasAppointment"]:checked');
      if (!appointmentChoice) {
        showCheckinFeedback('error', 'Merci d’indiquer si vous avez un rendez-vous.');
        return;
      }

      submitButton.disabled = true;
      try {
        const response = await fetch('/api/rdv/' + token + '/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: document.getElementById('checkin-fullname').value,
            phone: document.getElementById('checkin-phone').value,
            hasAppointment: appointmentChoice.value === 'true',
            practitionerId: practitionerSelect.value,
            reason: document.getElementById('checkin-reason').value
          })
        });
        const result = await response.json();
        if (!result.success) {
          showCheckinFeedback('error', result.error || 'Inscription impossible.');
          return;
        }
        const data = result.data || {};
        if (data.trackingToken) localStorage.setItem(trackingStorageKey, data.trackingToken);
        showCheckinFeedback(
          'success',
          data.duplicate
            ? 'Vous êtes déjà inscrit(e). Votre position a été retrouvée.'
            : 'Arrivée enregistrée. Votre numéro est ' + data.ticketCode + '.'
        );
        renderQueue(data.queue || {});
        checkinForm.reset();
      } catch (_) {
        showCheckinFeedback('error', 'Le portail ne répond pas. Vérifiez le Wi-Fi du cabinet.');
      } finally {
        submitButton.disabled = false;
      }
    });

    function renderSlots(slots) {
      slotsContainer.innerHTML = slots.map(function(slot) {
        return '<button type="button" class="slot' + (slot.available ? '' : ' is-disabled') + '"' +
          (slot.available ? '' : ' disabled') +
          ' data-time="' + slot.time + '">' + slot.time + '</button>';
      }).join('');
    }

    async function loadSlots(dateValue) {
      if (!dateValue) return;
      if (!bookingPractitionerSelect.value) {
        slotsContainer.innerHTML = '<span class="hint">Choisissez d’abord un médecin.</span>';
        timeInput.value = '';
        return;
      }
      const response = await fetch(
        '/api/rdv/' + token + '/slots?date=' + encodeURIComponent(dateValue)
        + '&practitioner=' + encodeURIComponent(bookingPractitionerSelect.value)
      );
      const result = await response.json();
      if (!result.success) {
        showFeedback('error', result.error || 'Impossible de charger les créneaux.');
        return;
      }
      renderSlots(result.data.slots || []);
      timeInput.value = '';
    }

    slotsContainer.addEventListener('click', function(event) {
      const button = event.target.closest('.slot');
      if (!button || button.disabled) return;
      slotsContainer.querySelectorAll('.slot').forEach(function(slotButton) {
        slotButton.classList.remove('active');
      });
      button.classList.add('active');
      timeInput.value = button.dataset.time || '';
    });

    dateInput.addEventListener('change', function() {
      loadSlots(dateInput.value);
    });

    bookingPractitionerSelect.addEventListener('change', function() {
      loadSlots(dateInput.value);
    });

    practitionerSelect.addEventListener('change', loadQueue);

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      if (!timeInput.value) {
        showFeedback('error', 'Merci de sélectionner une heure disponible.');
        return;
      }

      const payload = {
        fullName: document.getElementById('booking-fullname').value,
        phone: document.getElementById('booking-phone').value,
        email: document.getElementById('booking-email').value,
        practitionerId: bookingPractitionerSelect.value,
        type: document.getElementById('booking-type').value,
        date: document.getElementById('booking-date').value,
        time: document.getElementById('booking-time').value,
        reason: document.getElementById('booking-reason').value
      };

      const response = await fetch('/api/rdv/' + token + '/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!result.success) {
        showFeedback('error', result.error || 'Réservation impossible.');
        await loadSlots(dateInput.value);
        return;
      }

      const booking = result.data || {};
      showFeedback(
        'success',
        'Rendez-vous confirmé avec ' + (booking.practitionerName || 'le médecin')
          + ' pour le ' + booking.date + ' à ' + booking.time + ' • Référence ' + booking.bookingCode
      );
      form.reset();
      const today = new Date();
      const localIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      dateInput.value = localIso;
      await loadSlots(dateInput.value);
    });

    (function init() {
      const today = new Date();
      const localIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      dateInput.min = localIso;
      dateInput.value = localIso;
      loadConfig().then(function() {
        return Promise.all([loadSlots(localIso), loadQueue()]);
      });
      setInterval(loadQueue, 3000);
    }());
  </script>
</body>
</html>`;
}

async function requestHandler(req, res) {
  try {
    const settings = await getBookingSettings();
    if (!settings || !settings.publicBookingEnabled) {
      sendJson(res, 503, { success: false, error: 'Le portail RDV du cabinet est désactivé.' });
      return;
    }

    const token = settings.publicBookingToken;
    const url = new URL(req.url || '/', 'http://localhost');
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (url.pathname === '/health') {
      sendJson(res, 200, { success: true, running: true });
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(302, { Location: `/rdv/${token}` });
      res.end();
      return;
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathParts[0] === 'rdv' && pathParts[1] === token && req.method === 'GET') {
      const shareData = await buildShareData();
      sendHtml(res, renderPortalHtml(shareData));
      return;
    }

    if ((pathParts[0] === 'mobile' && (pathParts[1] === token || !pathParts[1])) && req.method === 'GET') {
      const shareData = await buildShareData();
      sendHtml(res, renderMobileCabinetHtml(shareData));
      return;
    }

    if (pathParts[0] === 'api' && pathParts[1] === 'mobile' && (pathParts[2] === token || pathParts[2] === 'token')) {
      const action = pathParts[3];

      if (action === 'config' && req.method === 'GET') {
        const [types, practitioners] = await Promise.all([
          getDistinctAppointmentTypes(),
          getPublicPractitioners()
        ]);
        sendJson(res, 200, {
          success: true,
          data: {
            cabinetName: settings.cabinetName || 'Cabinet médical',
            doctorName: settings.doctorName || '',
            types,
            practitioners,
            localIp: getLocalNetworkAddress()
          }
        });
        return;
      }

      if (action === 'network-info' && req.method === 'GET') {
        const shareData = await buildShareData();
        sendJson(res, 200, { success: true, data: shareData });
        return;
      }

      if (action === 'agenda' && req.method === 'GET') {
        const dateValue = url.searchParams.get('date') || moment().format('YYYY-MM-DD');
        const startOfDay = moment(dateValue).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const endOfDay = moment(dateValue).endOf('day').format('YYYY-MM-DD HH:mm:ss');
        const rows = await query(
          `SELECT a.*, p.firstName, p.lastName, p.phone
           FROM appointments a
           LEFT JOIN patients p ON a.patientId = p.id
           WHERE a.appointmentDateTime BETWEEN ? AND ?
           ORDER BY a.appointmentDateTime ASC`,
          [startOfDay, endOfDay]
        );
        sendJson(res, 200, { success: true, data: rows || [] });
        return;
      }

      if (action === 'agenda' && pathParts[4] === 'book' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await createAppointmentFromPublicBooking(body);
        sendJson(res, result.success ? 200 : 400, result);
        return;
      }

      if (action === 'waiting-room' && req.method === 'GET') {
        const today = moment().format('YYYY-MM-DD');
        const rows = await query(
          `SELECT w.*, p.firstName, p.lastName, p.phone
           FROM waiting_room w
           LEFT JOIN patients p ON w.patientId = p.id
           WHERE DATE(w.arrivalTime) = ?
             AND w.status IN ('waiting', 'in-consultation')
           ORDER BY CASE WHEN w.status = 'in-consultation' THEN 0 ELSE 1 END,
                    w.priority DESC, w.arrivalTime ASC`,
          [today]
        );

        const inConsultation = (rows || []).find((r) => r.status === 'in-consultation');
        const queue = (rows || []).filter((r) => r.status === 'waiting').map((r) => ({
          ...r,
          patientName: `${r.lastName || ''} ${r.firstName || ''}`.trim() || r.publicTicketCode || 'Patient'
        }));

        sendJson(res, 200, {
          success: true,
          data: {
            inConsultation: inConsultation ? {
              ...inConsultation,
              patientName: `${inConsultation.lastName || ''} ${inConsultation.firstName || ''}`.trim()
            } : null,
            queue
          }
        });
        return;
      }

      if (action === 'waiting-room' && pathParts[4] === 'call-next' && req.method === 'POST') {
        const today = moment().format('YYYY-MM-DD');
        const nextWaiting = await queryOne(
          `SELECT w.*, p.firstName, p.lastName
           FROM waiting_room w
           LEFT JOIN patients p ON w.patientId = p.id
           WHERE DATE(w.arrivalTime) = ? AND w.status = 'waiting'
           ORDER BY w.priority DESC, w.arrivalTime ASC
           LIMIT 1`,
          [today]
        );

        if (!nextWaiting) {
          sendJson(res, 400, { success: false, error: 'Aucun patient en attente' });
          return;
        }

        await run(
          `UPDATE waiting_room SET status = 'completed', updatedAt = CURRENT_TIMESTAMP
           WHERE DATE(arrivalTime) = ? AND status = 'in-consultation'`,
          [today]
        );

        await run(
          `UPDATE waiting_room SET status = 'in-consultation', updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nextWaiting.id]
        );

        const patientName = `${nextWaiting.lastName || ''} ${nextWaiting.firstName || ''}`.trim() || nextWaiting.publicTicketCode;
        broadcastRealtimeEvent({
          type: 'waiting-room:call',
          id: nextWaiting.id,
          patientId: nextWaiting.patientId,
          ticketCode: nextWaiting.publicTicketCode,
          patientName,
          title: `Appel patient : ${patientName}`,
          message: `Le patient ${patientName} est appelé en consultation`
        });

        sendJson(res, 200, { success: true, data: { id: nextWaiting.id, patientName } });
        return;
      }

      if (action === 'waiting-room' && pathParts[4] === 'status' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (body.id && body.status) {
          await run('UPDATE waiting_room SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [body.status, body.id]);
          broadcastRealtimeEvent({ type: 'waiting-room:update', id: body.id, status: body.status });
          sendJson(res, 200, { success: true });
        } else {
          sendJson(res, 400, { success: false, error: 'ID ou statut manquant' });
        }
        return;
      }

      if (action === 'waiting-room' && pathParts[4] === 'checkin' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await createPublicWaitingCheckIn(body);
        sendJson(res, result.success ? 200 : 400, result);
        return;
      }

      if (action === 'patients' && req.method === 'GET') {
        const q = String(url.searchParams.get('q') || '').trim();
        const limit = Number(url.searchParams.get('limit')) || 30;
        let rows = [];
        if (q) {
          rows = await query(
            `SELECT id, firstName, lastName, phone, birthDate, cin
             FROM patients
             WHERE LOWER(firstName) LIKE LOWER(?) OR LOWER(lastName) LIKE LOWER(?) OR phone LIKE ? OR cin LIKE ?
             ORDER BY lastName ASC LIMIT ?`,
            [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit]
          );
        } else {
          rows = await query(
            `SELECT id, firstName, lastName, phone, birthDate, cin
             FROM patients
             ORDER BY createdAt DESC LIMIT ?`,
            [limit]
          );
        }
        sendJson(res, 200, { success: true, data: rows || [] });
        return;
      }

      if (action === 'patients' && pathParts[4] === 'create' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const id = uuidv4();
        const now = moment().format('YYYY-MM-DD HH:mm:ss');
        await run(
          `INSERT INTO patients (id, firstName, lastName, phone, birthDate, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, body.firstName || '', body.lastName || 'Patient', body.phone || null, body.birthDate || null, now, now]
        );
        broadcastRealtimeEvent({ type: 'patient:new', id, firstName: body.firstName, lastName: body.lastName });
        sendJson(res, 200, { success: true, data: { id } });
        return;
      }

      if (action === 'upload-photo' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await handleMobileUploadPhoto(body);
        sendJson(res, result.success ? 200 : 400, result);
        return;
      }

      if (action === 'quick-note' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.patientId || !body.note) {
          sendJson(res, 400, { success: false, error: 'Données incomplètes' });
          return;
        }
        broadcastRealtimeEvent({
          type: 'consultation:note',
          patientId: body.patientId,
          note: body.note,
          title: 'Note mobile reçue',
          message: body.note
        });
        sendJson(res, 200, { success: true });
        return;
      }
    }

    if (pathParts[0] === 'api' && pathParts[1] === 'rdv' && pathParts[2] === token) {
      if (pathParts[3] === 'config' && req.method === 'GET') {
        const [types, practitioners] = await Promise.all([
          getDistinctAppointmentTypes(),
          getPublicPractitioners()
        ]);
        sendJson(res, 200, {
          success: true,
          data: {
            cabinetName: settings.cabinetName || 'Cabinet médical',
            doctorName: settings.doctorName || '',
            types,
            practitioners
          }
        });
        return;
      }

      if (pathParts[3] === 'queue' && req.method === 'GET') {
        const result = await getPublicQueue(
          String(url.searchParams.get('tracking') || ''),
          String(url.searchParams.get('practitioner') || '')
        );
        sendJson(res, 200, { success: true, data: result });
        return;
      }

      if (pathParts[3] === 'checkin' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await createPublicWaitingCheckIn(body);
        sendJson(res, result.success ? 200 : 400, result);
        return;
      }

      if (pathParts[3] === 'slots' && req.method === 'GET') {
        const result = await getSlotsForDate(
          url.searchParams.get('date'),
          url.searchParams.get('practitioner')
        );
        sendJson(res, 200, { success: true, data: result });
        return;
      }

      if (pathParts[3] === 'book' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await createAppointmentFromPublicBooking(body);
        sendJson(res, result.success ? 200 : 400, result);
        return;
      }
    }

    sendJson(res, 404, { success: false, error: 'Ressource introuvable' });
  } catch (error) {
    sendJson(res, 500, { success: false, error: error.message || 'Erreur serveur' });
  }
}

function closeServer() {
  if (bookingServer) {
    try {
      bookingServer.close();
    } catch (_) {
      // Ignore shutdown errors
    }
    bookingServer = null;
  }
  bookingServerState.running = false;
}

export async function syncPublicBookingServerWithSettings() {
  try {
    const shareData = await buildShareData();
    const previousState = { ...bookingServerState };
    bookingServerState = {
      ...bookingServerState,
      ...shareData,
      lastError: null
    };

    if (!shareData.enabled) {
      closeServer();
      bookingServerState.enabled = false;
      return { success: true, data: bookingServerState };
    }

    const needsRestart =
      !bookingServer ||
      previousState.port !== shareData.port ||
      previousState.token !== shareData.token;

    if (!needsRestart && bookingServerState.running) {
      return { success: true, data: bookingServerState };
    }

    closeServer();

    bookingServer = http.createServer((req, res) => {
      requestHandler(req, res);
    });

    await new Promise((resolve, reject) => {
      bookingServer.once('error', reject);
      bookingServer.listen(shareData.port, '0.0.0.0', resolve);
    });

    bookingServerState = {
      ...shareData,
      running: true,
      lastError: null
    };

    return { success: true, data: bookingServerState };
  } catch (error) {
    closeServer();
    bookingServerState = {
      ...bookingServerState,
      enabled: false,
      running: false,
      lastError: error.message
    };
    return { success: false, error: error.message };
  }
}

export async function initializePublicBookingServer() {
  return syncPublicBookingServerWithSettings();
}

export function stopPublicBookingServer() {
  closeServer();
}

export function handlePublicBookingEvents() {
  ipcMain.handle('publicBooking:getStatus', async () => {
    try {
      const result = await syncPublicBookingServerWithSettings();
      return result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error, data: bookingServerState };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('publicBooking:getShareData', async () => {
    try {
      const shareData = await buildShareData();
      return { success: true, data: { ...shareData, running: bookingServerState.running } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('publicBooking:refresh', async () => {
    return syncPublicBookingServerWithSettings();
  });
}

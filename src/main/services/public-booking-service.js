import http from 'http';
import os from 'os';
import crypto from 'crypto';
import moment from 'moment';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';
import { sendAppointmentCreatedSMS } from '../handlers/sms-handler.js';

let bookingServer = null;
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
  const statements = [
    'ALTER TABLE settings ADD COLUMN preferredThermalPrinter TEXT',
    'ALTER TABLE settings ADD COLUMN publicBookingEnabled INTEGER DEFAULT 0',
    'ALTER TABLE settings ADD COLUMN publicBookingPort INTEGER DEFAULT 4580',
    'ALTER TABLE settings ADD COLUMN publicBookingToken VARCHAR(255)',
    'ALTER TABLE settings ADD COLUMN publicBookingPublicUrl TEXT',
    'ALTER TABLE settings ADD COLUMN publicBookingQrEnabled INTEGER DEFAULT 1',
    "ALTER TABLE appointments ADD COLUMN bookingSource VARCHAR(30) DEFAULT 'manual'",
    'ALTER TABLE appointments ADD COLUMN bookingCode VARCHAR(100)'
  ];

  for (const sql of statements) {
    try {
      await run(sql);
    } catch (_) {
      // Column already exists
    }
  }
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
  const settings = await queryOne(
    `SELECT id, cabinetName, cabinetAddress, cabinetPhone, cabinetEmail,
            doctorName, doctorSpecialty, preferredPrinter, preferredScanner,
            preferredThermalPrinter, publicBookingEnabled, publicBookingPort,
            publicBookingToken, publicBookingPublicUrl, publicBookingQrEnabled
     FROM settings
     LIMIT 1`
  );

  if (!settings) {
    return null;
  }

  await ensureBookingToken(settings);
  return settings;
}

async function buildShareData() {
  const settings = await getBookingSettings();
  if (!settings) {
    return {
      enabled: false,
      running: false,
      port: DEFAULT_PORT,
      token: '',
      localUrl: '',
      publicUrl: '',
      localAddress: getLocalNetworkAddress(),
      qrDataUrl: null,
      cabinetName: '',
      doctorName: '',
      lastError: bookingServerState.lastError
    };
  }

  const port = Number(settings.publicBookingPort) || DEFAULT_PORT;
  const token = settings.publicBookingToken || '';
  const localAddress = getLocalNetworkAddress();
  const localUrl = token ? `http://${localAddress}:${port}/rdv/${token}` : '';
  const publicUrl = String(settings.publicBookingPublicUrl || '').trim() || localUrl;
  const qrDataUrl = !!settings.publicBookingEnabled && settings.publicBookingQrEnabled !== 0 && publicUrl
    ? await QRCode.toDataURL(publicUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 280,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
    : null;

  return {
    enabled: !!settings.publicBookingEnabled,
    running: bookingServerState.running,
    port,
    token,
    localAddress,
    localUrl,
    publicUrl,
    qrDataUrl,
    cabinetName: settings.cabinetName || 'Cabinet médical',
    doctorName: settings.doctorName || '',
    lastError: bookingServerState.lastError
  };
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

async function getSlotsForDate(dateValue) {
  const date = String(dateValue || '').slice(0, 10);
  if (!date) {
    return { slots: createSlotList([]) };
  }

  const startOfDay = moment(date).startOf('day').format('YYYY-MM-DD HH:mm:ss');
  const endOfDay = moment(date).endOf('day').format('YYYY-MM-DD HH:mm:ss');

  const rows = await query(
    `SELECT appointmentDateTime
     FROM appointments
     WHERE appointmentDateTime BETWEEN ? AND ? AND status != 'cancelled'
     ORDER BY appointmentDateTime ASC`,
    [startOfDay, endOfDay]
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

  if (!fullName || !phone || !date || !time || !reason) {
    return { success: false, error: 'Merci de remplir les champs obligatoires.' };
  }

  const appointmentDateTime = `${date} ${time}`;
  const conflict = await queryOne(
    `SELECT id FROM appointments
     WHERE appointmentDateTime = ? AND status != 'cancelled'`,
    [appointmentDateTime]
  );

  if (conflict) {
    return { success: false, error: 'Ce créneau vient d’être réservé. Merci de choisir une autre heure.' };
  }

  const patientId = await findOrCreatePatientFromBooking({ fullName, phone, email });
  const appointmentId = uuidv4();
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  const bookingCode = generateBookingCode();

  await run(
    `INSERT INTO appointments (
      id, patientId, appointmentDateTime, appointmentType, reason, status, notes,
      bookingSource, bookingCode, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      appointmentId,
      patientId,
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
      smsResult
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
    @media (max-width: 900px) {
      .hero, .form-grid, .meta {
        grid-template-columns: 1fr;
      }
      .shell {
        padding: 18px 14px 30px;
      }
      .card {
        border-radius: 24px;
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <section class="card">
        <span class="eyebrow">RDV en ligne</span>
        <h1>Prendre rendez-vous sans appel.</h1>
        <p class="lead">
          Choisissez une date, un créneau libre et envoyez votre demande directement au cabinet.
          Le rendez-vous est enregistré dans l’agenda principal dès validation.
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
        <span class="eyebrow">Créneaux disponibles</span>
        <h2 style="margin:16px 0 10px;font-size:28px;letter-spacing:-0.04em;">Agenda sécurisé du cabinet</h2>
        <p class="lead" style="font-size:15px;">
          Les créneaux occupés sont masqués automatiquement. Le lien partagé peut aussi être ouvert avec le QR code du cabinet.
        </p>
      </section>
    </div>

    <section class="card">
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

    function showFeedback(type, message) {
      feedback.className = 'feedback ' + type;
      feedback.textContent = message;
    }

    async function loadConfig() {
      const response = await fetch('/api/rdv/' + token + '/config');
      const result = await response.json();
      if (!result.success) return;

      typeSelect.innerHTML = result.data.types.map(function(type) {
        return '<option value="' + type + '">' + type + '</option>';
      }).join('');
    }

    function renderSlots(slots) {
      slotsContainer.innerHTML = slots.map(function(slot) {
        return '<button type="button" class="slot' + (slot.available ? '' : ' is-disabled') + '"' +
          (slot.available ? '' : ' disabled') +
          ' data-time="' + slot.time + '">' + slot.time + '</button>';
      }).join('');
    }

    async function loadSlots(dateValue) {
      if (!dateValue) return;
      const response = await fetch('/api/rdv/' + token + '/slots?date=' + encodeURIComponent(dateValue));
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
      showFeedback('success', 'Rendez-vous confirmé pour le ' + booking.date + ' à ' + booking.time + ' • Référence ' + booking.bookingCode);
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
        return loadSlots(localIso);
      });
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

    if (pathParts[0] === 'api' && pathParts[1] === 'rdv' && pathParts[2] === token) {
      if (pathParts[3] === 'config' && req.method === 'GET') {
        const types = await getDistinctAppointmentTypes();
        sendJson(res, 200, {
          success: true,
          data: {
            cabinetName: settings.cabinetName || 'Cabinet médical',
            doctorName: settings.doctorName || '',
            types
          }
        });
        return;
      }

      if (pathParts[3] === 'slots' && req.method === 'GET') {
        const result = await getSlotsForDate(url.searchParams.get('date'));
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

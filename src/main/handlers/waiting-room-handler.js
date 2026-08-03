/**
 * Waiting Room Handler
 * Handles IPC events for waiting room, kinÃ© staff, and daily summary
 */

import { ipcMain } from 'electron';
import { query, run, queryOne, withTransaction } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { broadcastRealtimeEvent } from '../realtime-server.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;
const buildFullName = (firstName, lastName) => `${firstName || ''} ${lastName || ''}`.trim();
const kineSessionLocks = new Map();
const PRACTITIONER_ROLES = new Set(['doctor', 'dentist', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse']);

async function withKineSessionLock(lockKey, task) {
  const previousTask = kineSessionLocks.get(lockKey) || Promise.resolve();
  let releaseLock = () => { };
  const waitForCompletion = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const chainedTask = previousTask.finally(() => waitForCompletion);
  kineSessionLocks.set(lockKey, chainedTask);

  try {
    await previousTask;
    return await task();
  } finally {
    releaseLock();
    chainedTask.finally(() => {
      if (kineSessionLocks.get(lockKey) === chainedTask) {
        kineSessionLocks.delete(lockKey);
      }
    });
  }
}

export function handleWaitingRoomEvents() {
  // ==================== WAITING ROOM ====================

  // Add patient to waiting room (with duplicate prevention)
  ipcMain.handle('waiting-room:add', async (event, data) => {
    try {
      const currentUser = global.currentUser || null;
      const isCurrentPractitioner = !!(
        currentUser?.id
        && ['doctor', 'dentist'].includes(String(currentUser.role || '').trim())
      );
      const doctors = await query(
        `SELECT id FROM users
         WHERE isActive = 1 AND isSuperAdmin = 0 AND role IN ('doctor', 'dentist')
         ORDER BY fullName, username`
      );
      const activeDoctorIds = (doctors || []).map((doctor) => String(doctor.id)).filter(Boolean);
      const assignedDoctors = await query(
        `SELECT pp.practitionerId
         FROM patient_practitioners pp
         JOIN users u ON u.id = pp.practitionerId
         WHERE pp.patientId = ?
           AND u.isActive = 1
           AND u.isSuperAdmin = 0
           AND u.role IN ('doctor', 'dentist')
         ORDER BY pp.practitionerId`,
        [data?.patientId]
      );
      const attachedDoctorIds = (assignedDoctors || [])
        .map((assignment) => String(assignment.practitionerId || '').trim())
        .filter((doctorId) => activeDoctorIds.includes(doctorId));
      const requestedDoctorId = String(data?.assignedTo || '').trim();
      let selectedDoctorId = '';

      if (isCurrentPractitioner) {
        selectedDoctorId = String(currentUser.id);
      } else if (requestedDoctorId && activeDoctorIds.includes(requestedDoctorId)) {
        selectedDoctorId = requestedDoctorId;
      } else if (!requestedDoctorId && attachedDoctorIds.length) {
        selectedDoctorId = attachedDoctorIds[Math.floor(Math.random() * attachedDoctorIds.length)];
      } else if (!requestedDoctorId && activeDoctorIds.length === 1) {
        selectedDoctorId = activeDoctorIds[0];
      }

      if (!selectedDoctorId) {
        return { success: false, error: 'Veuillez choisir le médecin/praticien responsable' };
      }

      const targetDoctorIds = [selectedDoctorId];

      const today = new Date().toISOString().split('T')[0];
      const result = await withTransaction(async () => {
      const sortedDoctorIds = [...targetDoctorIds].sort();
      for (const doctorId of sortedDoctorIds) {
        await queryOne(
          'SELECT pg_advisory_xact_lock(hashtext(?))',
          [`waiting-room:${today}:${data.patientId}:${doctorId}`]
        );
      }

      // Check if patient is already in waiting room today (not completed)
      const existing = await queryOne(`
        SELECT id FROM waiting_room 
        WHERE patientId = ? 
        AND DATE(arrivalTime) = ? 
        AND status IN ('waiting', 'in-consultation')
        AND (${targetDoctorIds.map(() => 'assignedTo = ?').join(' OR ')})
      `, [data.patientId, today, ...targetDoctorIds]);

      if (existing) {
        return { success: false, error: 'Ce patient est dÃ©jÃ  dans la salle d\'attente aujourd\'hui' };
      }

      const insertedIds = [];
      const realtimeEvents = [];
      for (const doctorId of sortedDoctorIds) {
        const id = uuidv4();
        await run(`
          INSERT INTO waiting_room (id, patientId, arrivalTime, reason, notes, createdBy, assignedTo, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')
        `, [id, data.patientId, data.arrivalTime, toNullIfEmpty(data.reason), toNullIfEmpty(data.notes), toNullIfEmpty(data.createdBy), toNullIfEmpty(doctorId)]);
        insertedIds.push(id);
        realtimeEvents.push({
          type: 'waiting-room:new',
          id,
          patientId: data.patientId,
          assignedTo: doctorId,
          title: 'Nouveau patient en salle d’attente',
          message: data.reason || 'Patient ajouté à la salle d’attente',
          targetUserId: doctorId
        });
      }
      return { success: true, id: insertedIds[0], ids: insertedIds, realtimeEvents };
      });
      for (const realtimeEvent of result.realtimeEvents || []) {
        const { targetUserId, ...payload } = realtimeEvent;
        broadcastRealtimeEvent(payload, { userId: targetUserId });
      }
      const { realtimeEvents, ...response } = result;
      return response;
    } catch (error) {
      console.error('Error adding to waiting room:', error);
      throw error;
    }
  });

  // Get today's waiting room
  ipcMain.handle('waiting-room:get-today', async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentUser = global.currentUser || null;
      const isRestrictedPractitioner = !!(
        currentUser?.id
        && PRACTITIONER_ROLES.has(String(currentUser.role || '').trim())
      );

      const params = [today];
      let practitionerFilter = '';
      if (isRestrictedPractitioner) {
        practitionerFilter = ' AND w.assignedTo = ?';
        params.push(String(currentUser.id));
      }

      const results = await query(`
        SELECT w.*, p.firstName, p.lastName, p.phone
             , u.fullName AS assignedDoctorName
        FROM waiting_room w
        JOIN patients p ON w.patientId = p.id
        LEFT JOIN users u ON w.assignedTo = u.id
        WHERE DATE(w.arrivalTime) = ?
        ${practitionerFilter}
        ORDER BY w.priority DESC, w.arrivalTime ASC
      `, params);
      return results;
    } catch (error) {
      console.error('Error getting waiting room:', error);
      throw error;
    }
  });

  // Update waiting room status
  ipcMain.handle('waiting-room:update-status', async (event, id, status) => {
    try {
      return await withTransaction(async () => {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const currentUser = global.currentUser || null;
      const restrictedDoctorId = currentUser?.id
        && PRACTITIONER_ROLES.has(String(currentUser.role || '').trim())
        ? String(currentUser.id)
        : '';
      const existing = await queryOne(
        `SELECT id FROM waiting_room
         WHERE id = ?${restrictedDoctorId ? ' AND assignedTo = ?' : ''}
         FOR UPDATE`,
        restrictedDoctorId ? [id, restrictedDoctorId] : [id]
      );
      if (!existing) return { success: false, error: 'Entrée de salle d’attente introuvable' };

      if (status === 'in-consultation') {
        await run(`UPDATE waiting_room SET status = ?, calledAt = ? WHERE id = ?`, [status, now, id]);
      } else if (status === 'completed') {
        await run(`UPDATE waiting_room SET status = ?, completedAt = ? WHERE id = ?`, [status, now, id]);
      } else {
        await run(`UPDATE waiting_room SET status = ? WHERE id = ?`, [status, id]);
      }

      return { success: true };
      });
    } catch (error) {
      console.error('Error updating waiting room status:', error);
      throw error;
    }
  });

  // Delete from waiting room
  ipcMain.handle('waiting-room:delete', async (event, id) => {
    try {
      const currentUser = global.currentUser || null;
      const restrictedDoctorId = currentUser?.id
        && PRACTITIONER_ROLES.has(String(currentUser.role || '').trim())
        ? String(currentUser.id)
        : '';
      await run(
        `DELETE FROM waiting_room WHERE id = ?${restrictedDoctorId ? ' AND assignedTo = ?' : ''}`,
        restrictedDoctorId ? [id, restrictedDoctorId] : [id]
      );
      return { success: true };
    } catch (error) {
      console.error('Error deleting from waiting room:', error);
      throw error;
    }
  });

  // ==================== KINÃ‰ STAFF ====================

  // Get all kinÃ© staff
  ipcMain.handle('kine-staff:get-all', async () => {
    try {
      const kinesResult = await query('SELECT * FROM kine_staff WHERE isActive = 1 ORDER BY lastName, firstName');
      const kines = Array.isArray(kinesResult) ? kinesResult : [];

      console.log('Kine staff loaded from DB:', kines.length, 'records');

      // Get first day of current month (local time) - Format YYYY-MM-DD manually
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const startDateStr = `${year}-${month}-01`;

      console.log('Counting kine sessions since:', startDateStr);

      for (const kine of kines) {
        try {
          // Count all sessions for this kinÃ© this month
          const stats = await queryOne(`
            SELECT COUNT(*) as sessions
            FROM kine_sessions
            WHERE kineId = ? AND DATE(sessionDate) >= ?
          `, [kine.id, startDateStr]);

          kine.monthSessions = stats?.sessions || 0;
          kine.sessionDuration = kine.sessionDuration || 30;

          console.log(`  - ${kine.firstName} ${kine.lastName}: ${kine.monthSessions} sessions this month`);
        } catch (statsError) {
          console.warn('Could not get stats for kine:', kine.id, statsError.message);
          kine.monthSessions = 0;
          kine.sessionDuration = 30;
        }
      }

      // Also log total sessions in DB
      try {
        const totalSessions = await queryOne('SELECT COUNT(*) as total FROM kine_sessions');
        console.log('Total kine sessions in DB:', totalSessions?.total || 0);
      } catch (e) { }

      return kines;
    } catch (error) {
      console.error('Error getting kine staff:', error);
      return [];
    }
  });

  // Create kinÃ© staff
  ipcMain.handle('kine-staff:create', async (event, data) => {
    try {
      const id = uuidv4();
      console.log('Creating kine staff:', data.firstName, data.lastName, 'with ID:', id);
      await run(`
        INSERT INTO kine_staff (id, firstName, lastName, phone, email, specialty, sessionPrice, notes, isActive)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [id, data.firstName, data.lastName, data.phone || '', data.email || '', data.specialty || '', data.sessionPrice || 0, data.notes || '']);
      console.log('Kine staff created and committed to DB');
      return { success: true, id };
    } catch (error) {
      console.error('Error creating kine:', error);
      throw error;
    }
  });

  // Update kinÃ© staff
  ipcMain.handle('kine-staff:update', async (event, id, data) => {
    try {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await run(`
        UPDATE kine_staff SET
          firstName = ?, lastName = ?, phone = ?, email = ?,
          specialty = ?, sessionPrice = ?, notes = ?, updatedAt = ?
        WHERE id = ?
      `, [data.firstName, data.lastName, data.phone || '', data.email || '', data.specialty || '', data.sessionPrice || 0, data.notes || '', now, id]);
      return { success: true };
    } catch (error) {
      console.error('Error updating kine:', error);
      throw error;
    }
  });

  // Delete kinÃ© staff
  ipcMain.handle('kine-staff:delete', async (event, id) => {
    try {
      await run('UPDATE kine_staff SET isActive = 0 WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting kine:', error);
      throw error;
    }
  });

  // Create kinÃ© session (when consultation with kinÃ© act is completed)
  ipcMain.handle('kine-session:create', async (event, data) => {
    try {
      const lockKey = `${data.patientId || ''}:${data.kineId || ''}`;
      return await withKineSessionLock(lockKey, async () => {
        return withTransaction(async () => {
        await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`kine-session:${lockKey}`]);
        const { v4: createUuid } = await import('uuid');
        const id = createUuid();

        // Get kinÃ©'s session price if not provided
        let price = data.price;
        if (!price && data.kineId) {
          const kine = await queryOne('SELECT sessionPrice FROM kine_staff WHERE id = ?', [data.kineId]);
          price = kine?.sessionPrice || 0;
        }

        // Get the next session number for this patient-kine pair
        const lastSession = await queryOne(`
        SELECT MAX(sessionNumber) as maxSession 
        FROM kine_sessions 
        WHERE patientId = ? AND kineId = ?
      `, [data.patientId, data.kineId]);
        const sessionNumber = (lastSession?.maxSession || 0) + 1;

        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await run(`
        INSERT INTO kine_sessions (id, patientId, kineId, consultationId, sessionDate, sessionNumber, duration, price, paymentStatus, notes, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
          id,
          data.patientId,
          data.kineId,
          data.consultationId || null,
          data.sessionDate || new Date().toISOString().slice(0, 19).replace('T', ' '),
          sessionNumber,
          data.duration || 30,
          price,
          data.paymentStatus || 'unpaid',
          data.notes || '',
          now
        ]);

        console.log(`Kine session created: ${id}, session #${sessionNumber}, price: ${price} DZD`);

        return { success: true, id, sessionNumber, price };
        });
      });
    } catch (error) {
      console.error('Error creating kine session:', error);
      return { success: false, error: error.message };
    }
  });

  // Update kinÃ© session payment status
  ipcMain.handle('kine-session:update-payment', async (event, sessionId, paymentStatus) => {
    try {
      await run('UPDATE kine_sessions SET paymentStatus = ? WHERE id = ?', [paymentStatus, sessionId]);
      return { success: true };
    } catch (error) {
      console.error('Error updating session payment:', error);
      return { success: false, error: error.message };
    }
  });

  // Get kinÃ© sessions
  ipcMain.handle('kine-staff:get-sessions', async (event, kineId) => {
    try {
      const sessions = await query(`
        SELECT ks.*, 
               p.firstName,
               p.lastName,
               ROW_NUMBER() OVER (ORDER BY ks.sessionDate ASC) as sessionNum
        FROM kine_sessions ks
        JOIN patients p ON ks.patientId = p.id
        WHERE ks.kineId = ?
        ORDER BY ks.sessionDate DESC
        LIMIT 50
      `, [kineId]);
      return (sessions || []).map((session) => ({
        ...session,
        patientName: buildFullName(session.firstName, session.lastName)
      }));
    } catch (error) {
      console.error('Error getting kine sessions:', error);
      throw error;
    }
  });

  // Get kinÃ© stats
  ipcMain.handle('kine-staff:get-stats', async () => {
    try {
      const totalKines = await queryOne('SELECT COUNT(*) as count FROM kine_staff WHERE isActive = 1');

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthStats = await queryOne(`
        SELECT COUNT(*) as sessions, SUM(price) as revenue
        FROM kine_sessions
        WHERE DATE(sessionDate) >= DATE(?)
      `, [startOfMonth.toISOString()]);

      return {
        totalKines: totalKines?.count || 0,
        monthSessions: monthStats?.sessions || 0,
        monthRevenue: monthStats?.revenue || 0
      };
    } catch (error) {
      console.error('Error getting kine stats:', error);
      throw error;
    }
  });

  // Get daily kinÃ© summary
  ipcMain.handle('kine-staff:get-daily-summary', async (event, date) => {
    try {
      const results = await query(`
        SELECT 
          k.firstName,
          k.lastName,
          COUNT(*) as sessions,
          SUM(ks.price) as revenue
        FROM kine_sessions ks
        JOIN kine_staff k ON ks.kineId = k.id
        WHERE DATE(ks.sessionDate) = DATE(?)
        GROUP BY ks.kineId
      `, [date]);

      // Ensure numeric values are properly parsed (MariaDB may return strings)
      return (results || []).map(r => ({
        ...r,
        kineName: buildFullName(r.firstName, r.lastName),
        sessions: parseInt(r.sessions) || 0,
        revenue: parseFloat(r.revenue) || 0
      }));
    } catch (error) {
      console.error('Error getting daily kine summary:', error);
      throw error;
    }
  });

  // ==================== DAILY SUMMARY ====================

  // Get daily summary
  ipcMain.handle('daily-summary:get', async (event, date) => {
    try {
      // Format date for SQL comparison
      const targetDate = date || new Date().toISOString().split('T')[0];

      // Get consultations for the date - use DATE() for MariaDB compatibility
      const consultations = await query(`
        SELECT * FROM consultations WHERE DATE(consultationDate) = DATE(?)
      `, [targetDate]) || [];

      // Get payments for the date
      const payments = await queryOne(`
        SELECT SUM(amount) as total FROM payments WHERE DATE(paymentDate) = DATE(?)
      `, [targetDate]);

      const paymentsByService = await query(`
        SELECT
          COALESCE(NULLIF(TRIM(description), ''), 'Autre acte') as description,
          COUNT(*) as quantity,
          SUM(amount) as total
        FROM payments
        WHERE DATE(paymentDate) = DATE(?)
        GROUP BY COALESCE(NULLIF(TRIM(description), ''), 'Autre acte')
      `, [targetDate]) || [];

      // Get kinÃ© sessions for the date
      const kineSess = await query(`
        SELECT ks.*, k.firstName, k.lastName
        FROM kine_sessions ks
        LEFT JOIN kine_staff k ON ks.kineId = k.id
        WHERE DATE(ks.sessionDate) = DATE(?)
      `, [targetDate]) || [];

      // Count acts from consultations
      let visits = Array.isArray(consultations) ? consultations.length : 0;
      let echoes = 0;
      let kineSessions = Array.isArray(kineSess) ? kineSess.length : 0;
      let reductions = 0;
      const actsCounts = {};

      if (Array.isArray(consultations)) {
        consultations.forEach(c => {
          if (c.acts) {
            try {
              const acts = JSON.parse(c.acts);
              acts.forEach(act => {
                actsCounts[act] = (actsCounts[act] || 0) + 1;
                if (act === 'echo') echoes++;
                if (act === 'reduction') reductions++;
              });
            } catch (e) { }
          }
        });
      }

      // Build kinÃ© summary by staff
      const kineSummary = {};
      if (Array.isArray(kineSess)) {
        kineSess.forEach(s => {
          const kineKey = s.kineId || 'unknown';
          if (!kineSummary[kineKey]) {
            kineSummary[kineKey] = {
              name: `${s.lastName || 'Inconnu'} ${s.firstName || ''}`.trim(),
              sessions: 0,
              revenue: 0
            };
          }
          kineSummary[kineKey].sessions++;
          // Ensure price is parsed as float (MariaDB may return string)
          const priceValue = parseFloat(s.price);
          kineSummary[kineKey].revenue += Number.isFinite(priceValue) ? priceValue : 0;
        });
      }

      // Get consultation details with patient names
      const consultationDetails = await query(`
        SELECT 
          c.id,
          c.consultationDate,
          c.createdAt,
          c.consultationType as type,
          c.reason,
          c.diagnosis,
          p.firstName,
          p.lastName
        FROM consultations c
        LEFT JOIN patients p ON c.patientId = p.id
        WHERE DATE(c.consultationDate) = DATE(?)
        ORDER BY c.createdAt DESC
      `, [targetDate]) || [];

      const actsSummary = {};
      if (Array.isArray(paymentsByService)) {
        paymentsByService.forEach((row) => {
          const label = row.description || 'Autre acte';
          actsSummary[label] = {
            quantity: parseInt(row.quantity, 10) || 0,
            total: parseFloat(row.total) || 0
          };
        });
      }

      return {
        visits,
        echoes,
        kineSessions,
        reductions,
        revenue: payments?.total || 0,
        actsCounts,
        actsSummary,
        kineSummary,
        consultations: consultationDetails
      };
    } catch (error) {
      console.error('Error getting daily summary:', error);
      throw error;
    }
  });

  // ==================== USER NOTIFICATIONS ====================

  // Create notification
  ipcMain.handle('notifications:create', async (event, data) => {
    try {
      if (global.currentUser?.role === 'assistant' && String(data.type || '').toLowerCase() === 'message') {
        return { success: false, error: 'L’assistant ne peut pas envoyer de message au médecin' };
      }

      const id = uuidv4();
      await run(`
        INSERT INTO user_notifications (id, type, title, message, relatedType, relatedId)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, data.type, data.title, data.message, data.relatedType || '', data.relatedId || '']);
      broadcastRealtimeEvent({
        type: 'notification:new',
        id,
        notificationType: data.type,
        title: data.title,
        message: data.message,
        relatedType: data.relatedType || '',
        relatedId: data.relatedId || ''
      });
      return { success: true, id };
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  });

  // Get unread notifications
  ipcMain.handle('notifications:get-unread', async (event, userId) => {
    try {
      const notifications = await query(`
        SELECT * FROM user_notifications
        WHERE (toUserId = ? OR toUserId IS NULL) AND isRead = 0
        ORDER BY createdAt DESC
        LIMIT 20
      `, [userId]);
      return notifications;
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw error;
    }
  });

  // Mark notification as read
  ipcMain.handle('notifications:mark-read', async (event, id) => {
    try {
      await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  });

  // ==================== CONSULTATIONS BY DATE ====================

  ipcMain.handle('consultations:get-by-date', async (event, date) => {
    try {
      const consultations = await query(`
        SELECT c.*, p.firstName, p.lastName
        FROM consultations c
        JOIN patients p ON c.patientId = p.id
        WHERE DATE(c.consultationDate) = DATE(?)
        ORDER BY c.consultationDate
      `, [date]);
      return consultations;
    } catch (error) {
      console.error('Error getting consultations by date:', error);
      throw error;
    }
  });

  // ==================== PAYMENTS BY DATE ====================

  ipcMain.handle('payments:get-by-date', async (event, date) => {
    try {
      const payments = await query(`
        SELECT * FROM payments WHERE DATE(paymentDate) = DATE(?)
      `, [date]);
      return payments;
    } catch (error) {
      console.error('Error getting payments by date:', error);
      throw error;
    }
  });

  // ==================== PAYMENT REQUESTS (Doctor -> Assistant) ====================

  // Doctor creates a payment request for assistant to collect
  ipcMain.handle('payment-request:create', async (event, data) => {
    try {
      const result = await withTransaction(async () => {
      const requestLockKey = `${data.consultationId || ''}:${data.patientId || ''}:${Number(data.amount || 0)}`;
      await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`payment-request:${requestLockKey}`]);
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const patientName = data.patientName || 'Patient';
      const serviceLabel = data.service ? ` • ${data.service}` : '';
      const pendingRequests = await query(`
        SELECT id, data
        FROM user_notifications
        WHERE type = 'payment_request' AND isRead = 0
      `);
      const duplicate = (pendingRequests || []).find((request) => {
        try {
          const payload = JSON.parse(request.data || '{}');
          const sameConsultation = String(payload.consultationId || '') === String(data.consultationId || '');
          const samePatient = String(payload.patientId || '') === String(data.patientId || '');
          const sameAmount = Number(payload.amount || 0) === Number(data.amount || 0);
          return samePatient && sameAmount && (sameConsultation || (!payload.consultationId && !data.consultationId));
        } catch (_) {
          return false;
        }
      });

      if (duplicate?.id) {
        return { success: true, id: duplicate.id, duplicate: true };
      }

      // Create payment request in notifications
      await run(`
        INSERT INTO user_notifications (id, type, title, message, patientId, fromUserId, toRole, data, createdAt)
        VALUES (?, 'payment_request', ?, ?, ?, ?, 'assistant', ?, ?)
      `, [
        id,
        `ðŸ’° Paiement Ã  collecter`,
        `${patientName}${serviceLabel} - ${data.amount} DZD`,
        data.patientId || null,
        data.doctorId || null,
        JSON.stringify({
          amount: data.amount,
          patientId: data.patientId,
          patientName,
          consultationId: data.consultationId,
          service: data.service || '',
          notes: data.notes,
          selectedActs: Array.isArray(data.selectedActs) ? data.selectedActs : []
        }),
        now
      ]);

      console.log(`Payment request created: ${data.amount} DZD for ${patientName}`);
      return { success: true, id, patientName, serviceLabel };
      });
      if (result?.success && !result.duplicate) {
        broadcastRealtimeEvent({
          type: 'payment-request:new',
          id: result.id,
          title: 'Paiement à collecter',
          message: `${result.patientName}${result.serviceLabel} - ${data.amount} DZD`,
          patientId: data.patientId || null,
          data: {
            amount: data.amount,
            patientId: data.patientId,
            patientName: result.patientName,
            consultationId: data.consultationId,
            service: data.service || ''
          }
        }, { role: 'assistant' });
      }
      return result;
    } catch (error) {
      console.error('Error creating payment request:', error);
      return { success: false, error: error.message };
    }
  });

  // Get pending payment requests for assistant
  ipcMain.handle('payment-request:get-pending', async () => {
    try {
      const requests = await query(`
        SELECT * FROM user_notifications
        WHERE type = 'payment_request' AND isRead = 0
        ORDER BY createdAt DESC
      `);
      return requests || [];
    } catch (error) {
      console.error('Error getting payment requests:', error);
      return [];
    }
  });

  // Mark payment request as completed
  ipcMain.handle('payment-request:complete', async (event, id) => {
    try {
      await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [id]);
      broadcastRealtimeEvent({ type: 'payment-request:updated', id });
      return { success: true };
    } catch (error) {
      console.error('Error completing payment request:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment-request:dismiss', async (event, id) => {
    try {
      if (global.currentUser?.role === 'assistant') {
        return { success: false, error: 'ClÃ´ture non autorisÃ©e pour l\'assistant' };
      }

      const request = await queryOne('SELECT data FROM user_notifications WHERE id = ?', [id]);
      let requestData = {};
      try {
        requestData = JSON.parse(request?.data || '{}');
      } catch (_) {
        requestData = {};
      }

      await withTransaction(async () => {
        await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [id]);
        if (requestData.planId && requestData.sessionId) {
          await run(
            `UPDATE plan_payment_sessions
             SET status = 'pending', paymentRequestId = NULL
             WHERE id = ? AND planId = ? AND paymentRequestId = ? AND status = 'requested'`,
            [requestData.sessionId, requestData.planId, id]
          );
        }
      });
      broadcastRealtimeEvent({ type: 'payment-request:updated', id });
      if (requestData.planId) {
        broadcastRealtimeEvent({ type: 'plan:updated', planId: requestData.planId, patientId: requestData.patientId || null });
      }
      return { success: true };
    } catch (error) {
      console.error('Error dismissing payment request:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('Waiting Room events registered');
}

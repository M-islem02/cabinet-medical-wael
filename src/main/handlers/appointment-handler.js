/**
 * Gestionnaire IPC pour les rendez-vous
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { sendAppointmentCreatedSMS } from './sms-handler.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;
const buildPatientName = (firstName, lastName) => `${firstName || ''} ${lastName || ''}`.trim();

function normalizeUserRole(role) {
  return role === 'director' ? 'doctor' : String(role || '').trim();
}

function getCurrentUserContext() {
  const role = normalizeUserRole(global.currentUser?.role);
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin: !!global.currentUser?.isAdmin && !global.currentUser?.isSuperAdmin,
    isSuperAdmin: !!global.currentUser?.isSuperAdmin,
    isPractitioner: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant'
  };
}

function getAppointmentScope(userContext, patientAlias = 'p') {
  if (userContext.isPractitioner && !userContext.isAdmin && userContext.userId) {
    return {
      clause: `${patientAlias}.primaryDoctorId = ?`,
      params: [userContext.userId]
    };
  }

  if (userContext.isAssistant && userContext.userId) {
    return {
      clause: '',
      params: []
    };
  }

  return {
    clause: '',
    params: []
  };
}

async function getAppointmentDailyTicketNumber(appointment) {
  if (!appointment?.appointmentDateTime) return 0;

  const startOfDay = moment(appointment.appointmentDateTime).startOf('day').format('YYYY-MM-DD HH:mm:ss');
  const endOfDay = moment(appointment.appointmentDateTime).endOf('day').format('YYYY-MM-DD HH:mm:ss');

  const rows = await query(
    `SELECT id
     FROM appointments
     WHERE appointmentDateTime BETWEEN ? AND ?
     ORDER BY appointmentDateTime ASC, createdAt ASC, id ASC`,
    [startOfDay, endOfDay]
  );

  const index = (rows || []).findIndex((row) => row.id === appointment.id);
  return index >= 0 ? index : 0;
}

async function getAppointmentDetailsById(id) {
  const appointment = await queryOne(
    `SELECT a.*,
     p.firstName, p.lastName, p.phone, p.email, p.dateOfBirth
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
    patientName: buildPatientName(appointment.firstName, appointment.lastName),
    dailyTicketNumber: await getAppointmentDailyTicketNumber(appointment)
  };
}

export function handleAppointmentEvents() {
  // Verifier les conflits de rendez-vous
  ipcMain.handle('appointment:checkConflict', async (event, date, time, excludeId = null) => {
    try {
      const appointmentDateTime = `${date} ${time}`;
      let conflictQuery = `
        SELECT a.*, p.firstName, p.lastName
        FROM appointments a
        JOIN patients p ON a.patientId = p.id
        WHERE a.appointmentDateTime = ? AND a.status != 'cancelled'
      `;
      const params = [appointmentDateTime];

      if (excludeId) {
        conflictQuery += ' AND a.id != ?';
        params.push(excludeId);
      }

      const conflicts = await query(conflictQuery, params);
      const mappedConflicts = (conflicts || []).map((item) => ({
        ...item,
        patientName: buildPatientName(item.firstName, item.lastName)
      }));

      return {
        success: true,
        hasConflict: mappedConflicts.length > 0,
        conflicts: mappedConflicts
      };
    } catch (error) {
      console.error('Erreur lors de la verification des conflits:', error);
      return { success: false, error: error.message };
    }
  });

  // Creer un rendez-vous
  ipcMain.handle('appointment:create', async (event, appointmentData) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const appointmentDateTime = `${appointmentData.date} ${appointmentData.time}`;

      const existingAppointment = await queryOne(
        `SELECT id FROM appointments
         WHERE appointmentDateTime = ? AND status != 'cancelled'`,
        [appointmentDateTime]
      );

      if (existingAppointment && !appointmentData.forceCreate) {
        return {
          success: false,
          error: 'Un rendez-vous existe deja a cette date et heure',
          conflictType: 'duplicate'
        };
      }

      await run(
        `INSERT INTO appointments
         (id, patientId, appointmentDateTime, appointmentType, reason, status, notes, bookingSource, bookingCode, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          appointmentData.patientId,
          appointmentDateTime,
          appointmentData.type || 'Consultation',
          toNullIfEmpty(appointmentData.reason),
          appointmentData.status || 'scheduled',
          toNullIfEmpty(appointmentData.notes),
          appointmentData.source || 'manual',
          appointmentData.bookingCode || null,
          now,
          now
        ]
      );

      const createdAppointment = await getAppointmentDetailsById(id);
      let smsResult = { success: false, skipped: true, reason: 'Rendez-vous cree sans details complementaires' };

      if (createdAppointment) {
        try {
          smsResult = await sendAppointmentCreatedSMS(createdAppointment);
        } catch (smsError) {
          console.error('Erreur SMS creation RDV:', smsError);
          smsResult = { success: false, skipped: false, error: smsError.message };
        }
      }

      return {
        success: true,
        id,
        data: createdAppointment,
        smsResult
      };
    } catch (error) {
      console.error('Erreur lors de la creation du rendez-vous:', error);
      return { success: false, error: error.message };
    }
  });

  // Recuperer les rendez-vous d'un patient
  ipcMain.handle('appointment:getByPatient', async (event, patientId) => {
    try {
      const appointments = await query(
        `SELECT a.*,
         p.firstName, p.lastName, p.phone, p.email
         FROM appointments a
         JOIN patients p ON a.patientId = p.id
         WHERE a.patientId = ?
         ORDER BY a.appointmentDateTime DESC`,
        [patientId]
      );

      return {
        success: true,
        data: (appointments || []).map((appointment) => {
          const momentDateTime = moment(appointment.appointmentDateTime);
          return {
            ...appointment,
            date: momentDateTime.format('YYYY-MM-DD'),
            time: momentDateTime.format('HH:mm'),
            type: appointment.appointmentType,
            patientName: buildPatientName(appointment.firstName, appointment.lastName)
          };
        })
      };
    } catch (error) {
      console.error('Erreur lors de la recuperation des rendez-vous:', error);
      return { success: false, error: error.message };
    }
  });

  // Recuperer les rendez-vous d'aujourd'hui
  ipcMain.handle('appointment:getToday', async () => {
    try {
      const todayStart = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const todayEnd = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
      const scope = getAppointmentScope(getCurrentUserContext(), 'p');
      const whereParts = ['a.appointmentDateTime BETWEEN ? AND ?'];
      const params = [todayStart, todayEnd];

      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }

      const appointments = await query(
        `SELECT a.*, p.firstName, p.lastName, p.phone, p.email
         FROM appointments a
         JOIN patients p ON a.patientId = p.id
         WHERE ${whereParts.join(' AND ')}
         ORDER BY a.appointmentDateTime ASC`,
        params
      );

      return {
        success: true,
        data: (appointments || []).map((appointment) => {
          const momentDateTime = moment(appointment.appointmentDateTime);
          return {
            ...appointment,
            date: momentDateTime.format('YYYY-MM-DD'),
            time: momentDateTime.format('HH:mm'),
            type: appointment.appointmentType,
            patientName: buildPatientName(appointment.firstName, appointment.lastName)
          };
        })
      };
    } catch (error) {
      console.error('Erreur lors de la recuperation des rendez-vous du jour:', error);
      return { success: false, error: error.message };
    }
  });

  // Recuperer un rendez-vous par ID
  ipcMain.handle('appointment:getById', async (event, id) => {
    try {
      const appointment = await getAppointmentDetailsById(id);

      if (!appointment) {
        return { success: false, error: 'Rendez-vous non trouve' };
      }

      return { success: true, data: appointment };
    } catch (error) {
      console.error('Erreur lors de la recuperation du rendez-vous:', error);
      return { success: false, error: error.message };
    }
  });

  // Recuperer tous les rendez-vous
  ipcMain.handle('appointment:getAll', async () => {
    try {
      const scope = getAppointmentScope(getCurrentUserContext(), 'p');
      const appointments = await query(
        `SELECT a.*, p.firstName, p.lastName, p.phone, p.email
         FROM appointments a
         JOIN patients p ON a.patientId = p.id
         ${scope.clause ? `WHERE ${scope.clause}` : ''}
         ORDER BY a.appointmentDateTime DESC`,
        scope.params
      );

      return {
        success: true,
        data: (appointments || []).map((appointment) => {
          const momentDateTime = moment(appointment.appointmentDateTime);
          return {
            ...appointment,
            date: momentDateTime.format('YYYY-MM-DD'),
            time: momentDateTime.format('HH:mm'),
            type: appointment.appointmentType,
            patientName: buildPatientName(appointment.firstName, appointment.lastName)
          };
        })
      };
    } catch (error) {
      console.error('Erreur lors de la recuperation de tous les rendez-vous:', error);
      return { success: false, error: error.message };
    }
  });

  // Recuperer les rendez-vous par plage de dates
  ipcMain.handle('appointment:getByDateRange', async (event, startDate, endDate) => {
    try {
      console.log('appointment:getByDateRange called:', startDate, 'to', endDate);
      const startOfDay = moment(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const endOfDay = moment(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');
      const scope = getAppointmentScope(getCurrentUserContext(), 'p');
      const whereParts = ['a.appointmentDateTime BETWEEN ? AND ?'];
      const params = [startOfDay, endOfDay];

      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }

      const appointments = await query(
        `SELECT a.*, p.firstName, p.lastName, p.phone, p.email
         FROM appointments a
         JOIN patients p ON a.patientId = p.id
         WHERE ${whereParts.join(' AND ')}
         ORDER BY a.appointmentDateTime ASC`,
        params
      );

      const data = (appointments || []).map((appointment) => {
        const momentDateTime = moment(appointment.appointmentDateTime);
        return {
          ...appointment,
          date: momentDateTime.format('YYYY-MM-DD'),
          time: momentDateTime.format('HH:mm'),
          type: appointment.appointmentType,
          patientName: buildPatientName(appointment.firstName, appointment.lastName)
        };
      });

      console.log('appointment:getByDateRange found:', data?.length || 0);
      return { success: true, data };
    } catch (error) {
      console.error('Erreur lors de la recuperation des rendez-vous par plage de dates:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre a jour un rendez-vous
  ipcMain.handle('appointment:update', async (event, id, data) => {
    try {
      const appointmentDateTime = `${data.date} ${data.time}`;
      await run(
        `UPDATE appointments
         SET appointmentDateTime = ?, reason = ?, status = ?, notes = ?, bookingSource = ?, updatedAt = ?
         WHERE id = ?`,
        [
          appointmentDateTime,
          toNullIfEmpty(data.reason),
          data.status,
          toNullIfEmpty(data.notes),
          data.source || 'manual',
          moment().format('YYYY-MM-DD HH:mm:ss'),
          id
        ]
      );
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la mise a jour du rendez-vous:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un rendez-vous
  ipcMain.handle('appointment:delete', async (event, id) => {
    try {
      await run('DELETE FROM appointments WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression du rendez-vous:', error);
      return { success: false, error: error.message };
    }
  });
}

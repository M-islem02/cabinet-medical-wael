/**
 * Gestionnaire IPC pour les consultations
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;
const toNumberOrNull = (val) => {
  if (val === '' || val === undefined || val === null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
};

function normalizeUserRole(role) {
  return role === 'director' ? 'doctor' : String(role || '').trim();
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

function normalizeConsultationListRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.patientId || '',
      page: toPositiveInt(payload.page, 1),
      pageSize: Math.min(100, toPositiveInt(payload.pageSize, 10)),
      startDate: String(payload.startDate || '').trim(),
      endDate: String(payload.endDate || '').trim(),
      attachmentsOnly: payload.attachmentsOnly === true,
      paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.startDate !== undefined || payload.endDate !== undefined
    };
  }

  return {
    patientId: payload,
    page: 1,
    pageSize: 10,
    startDate: '',
    endDate: '',
    attachmentsOnly: false,
    paginated: false
  };
}

function isCurrentUserDirector() {
  return normalizeUserRole(global.currentUser?.role) === 'director';
}

function denyDirectorMedicalAccess() {
  return { success: false, error: 'Accès refusé: le directeur ne peut pas accéder aux données médicales détaillées' };
}

function getCurrentUserContext() {
  const role = normalizeUserRole(global.currentUser?.role);
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin: !!global.currentUser?.isAdmin,
    isPractitioner: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant'
  };
}

function denyAssistantMedicalWriteAccess() {
  return { success: false, error: 'Accès refusé: le compte assistant ne peut pas créer ou modifier des consultations' };
}

export function handleConsultationEvents() {
  // Créer une consultation
  ipcMain.handle('consultation:create', async (event, consultationData) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const userContext = getCurrentUserContext();
      if (userContext.isAssistant) {
        return denyAssistantMedicalWriteAccess();
      }

      const patient = await queryOne('SELECT id, primaryDoctorId FROM patients WHERE id = ?', [consultationData.patientId]);
      if (!patient?.id) {
        return { success: false, error: 'Patient introuvable' };
      }

      if (userContext.isPractitioner && userContext.userId) {
        const assignment = await queryOne(
          'SELECT patientId FROM patient_practitioners WHERE patientId = ? AND practitionerId = ?',
          [consultationData.patientId, userContext.userId]
        );
        if (!assignment) {
          return { success: false, error: 'Accès refusé: ajoutez d’abord ce patient à votre liste' };
        }
      }

      const doctorId = userContext.isPractitioner ? userContext.userId : (patient.primaryDoctorId || null);

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const normalizedDate = consultationData.date
        ? moment(consultationData.date).format('YYYY-MM-DD HH:mm:ss')
        : now;
      
      // Calculer l'IMC si poids et taille fournis
      let imc = null;
      const weight = toNumberOrNull(consultationData.weight);
      const height = toNumberOrNull(consultationData.height);
      if (weight && height) {
        const heightInMeters = height / 100;
        imc = (weight / (heightInMeters * heightInMeters)).toFixed(2);
      }

      // Prepare attachments JSON
      const attachmentsJson = consultationData.attachments ? JSON.stringify(consultationData.attachments) : null;
      const actsJson = Array.isArray(consultationData.acts)
        ? JSON.stringify(consultationData.acts)
        : toNullIfEmpty(consultationData.acts);

      await run(
        `INSERT INTO consultations 
         (id, patientId, doctorId, consultationDate, consultationType, reason, weight, height, bloodPressure, temperature, clinicalExamination, diagnosis, treatment, notes, acts, kineId, isUnpaid, unpaidAmount, unpaidDueDate, attachments, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          consultationData.patientId,
          doctorId,
          normalizedDate,
          toNullIfEmpty(consultationData.type),
          toNullIfEmpty(consultationData.reason),
          weight,
          height,
          toNullIfEmpty(consultationData.bloodPressure),
          toNumberOrNull(consultationData.temperature),
          toNullIfEmpty(consultationData.clinicalExamination),
          toNullIfEmpty(consultationData.diagnosis),
          toNullIfEmpty(consultationData.treatment),
          toNullIfEmpty(consultationData.notes),
          actsJson,
          toNullIfEmpty(consultationData.kineId),
          consultationData.isUnpaid ? 1 : 0,
          toNumberOrNull(consultationData.unpaidAmount) || 0,
          toNullIfEmpty(consultationData.unpaidDueDate),
          attachmentsJson,
          now
        ]
      );

      return { success: true, id: id };
    } catch (error) {
      console.error('❌ Erreur lors de la création de la consultation:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer les consultations d'un patient
  ipcMain.handle('consultation:getByPatient', async (event, payload) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const userContext = getCurrentUserContext();
      if (userContext.isAssistant) {
        return denyDirectorMedicalAccess();
      }

      const request = normalizeConsultationListRequest(payload);
      const whereParts = ['patientId = ?'];
      const params = [request.patientId];

      if (!userContext.isAdmin && userContext.isPractitioner && userContext.userId) {
        whereParts.push('doctorId = ?');
        params.push(userContext.userId);
      }

      if (request.startDate) {
        whereParts.push('DATE(consultationDate) >= DATE(?)');
        params.push(request.startDate);
      }

      if (request.endDate) {
        whereParts.push('DATE(consultationDate) <= DATE(?)');
        params.push(request.endDate);
      }

      if (request.attachmentsOnly) {
        whereParts.push('attachments IS NOT NULL');
        whereParts.push("TRIM(COALESCE(attachments, '')) <> ''");
      }

      const whereClause = whereParts.join(' AND ');
      const selectClause = request.attachmentsOnly
        ? `SELECT id, patientId, consultationDate, consultationType, reason, attachments, createdAt,
                  consultationDate as date, consultationType as type
           FROM consultations`
        : `SELECT *, consultationDate as date, consultationType as type
           FROM consultations`;

      if (!request.paginated) {
        const consultations = await query(
          `${selectClause}
           WHERE ${whereClause}
           ORDER BY consultationDate DESC`,
          params
        );
        return { success: true, data: consultations };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM consultations WHERE ${whereClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const consultations = await query(
        `${selectClause}
         WHERE ${whereClause}
         ORDER BY consultationDate DESC
         LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: consultations,
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des consultations:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer une consultation par ID
  ipcMain.handle('consultation:getById', async (event, consultationId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const userContext = getCurrentUserContext();
      if (userContext.isAssistant) {
        return denyDirectorMedicalAccess();
      }

      const lookupSql = (!userContext.isAdmin && userContext.isPractitioner && userContext.userId)
        ? 'SELECT *, consultationDate as date, consultationType as type FROM consultations WHERE id = ? AND doctorId = ?'
        : 'SELECT *, consultationDate as date, consultationType as type FROM consultations WHERE id = ?';
      const lookupParams = (!userContext.isAdmin && userContext.isPractitioner && userContext.userId)
        ? [consultationId, userContext.userId]
        : [consultationId];

      const consultation = await queryOne(lookupSql, lookupParams);

      if (!consultation) {
        return { success: false, error: 'Consultation non trouvée' };
      }

      return { success: true, data: consultation };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de la consultation:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour une consultation
  ipcMain.handle('consultation:update', async (event, consultationId, consultationData) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const userContext = getCurrentUserContext();
      if (userContext.isAssistant) {
        return denyAssistantMedicalWriteAccess();
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      // Convertir les valeurs numériques
      const weight = toNumberOrNull(consultationData.weight);
      const height = toNumberOrNull(consultationData.height);
      const temperature = toNumberOrNull(consultationData.temperature);
      
      // Calculer l'IMC si poids et taille fournis
      let imc = null;
      if (weight && height) {
        const heightInMeters = height / 100;
        imc = (weight / (heightInMeters * heightInMeters)).toFixed(2);
      }

      const existingLookupSql = (!userContext.isAdmin && userContext.isPractitioner && userContext.userId)
        ? 'SELECT consultationDate, attachments FROM consultations WHERE id = ? AND doctorId = ?'
        : 'SELECT consultationDate, attachments FROM consultations WHERE id = ?';
      const existingLookupParams = (!userContext.isAdmin && userContext.isPractitioner && userContext.userId)
        ? [consultationId, userContext.userId]
        : [consultationId];
      const existingConsultation = await queryOne(existingLookupSql, existingLookupParams);
      if (!existingConsultation) {
        return { success: false, error: 'Consultation non trouvée' };
      }

      const normalizedDate = consultationData.date
        ? moment(consultationData.date).format('YYYY-MM-DD HH:mm:ss')
        : existingConsultation.consultationDate || now;

      // Get existing attachments if not provided in update
      let attachmentsJson = null;
      if (consultationData.attachments) {
        attachmentsJson = JSON.stringify(consultationData.attachments);
      } else {
        attachmentsJson = existingConsultation?.attachments || null;
      }
      const actsJson = Array.isArray(consultationData.acts)
        ? JSON.stringify(consultationData.acts)
        : toNullIfEmpty(consultationData.acts);

      await run(
        `UPDATE consultations 
         SET consultationDate = ?, consultationType = ?, reason = ?, clinicalExamination = ?,
             bloodPressure = ?, temperature = ?, weight = ?, height = ?,
             diagnosis = ?, treatment = ?, notes = ?, acts = ?, kineId = ?, isUnpaid = ?, unpaidAmount = ?, unpaidDueDate = ?, attachments = ?, updatedAt = ?
         WHERE id = ?`,
        [
          normalizedDate,
          toNullIfEmpty(consultationData.type),
          toNullIfEmpty(consultationData.reason),
          toNullIfEmpty(consultationData.clinicalExamination),
          toNullIfEmpty(consultationData.bloodPressure),
          temperature,
          weight,
          height,
          toNullIfEmpty(consultationData.diagnosis),
          toNullIfEmpty(consultationData.treatment),
          toNullIfEmpty(consultationData.notes),
          actsJson,
          toNullIfEmpty(consultationData.kineId),
          consultationData.isUnpaid ? 1 : 0,
          toNumberOrNull(consultationData.unpaidAmount) || 0,
          toNullIfEmpty(consultationData.unpaidDueDate),
          attachmentsJson,
          now,
          consultationId
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de la consultation:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer une consultation
  ipcMain.handle('consultation:delete', async (event, consultationId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const userContext = getCurrentUserContext();
      if (userContext.isAssistant) {
        return denyAssistantMedicalWriteAccess();
      }

      if (!userContext.isAdmin && userContext.isPractitioner && userContext.userId) {
        const existingConsultation = await queryOne('SELECT id FROM consultations WHERE id = ? AND doctorId = ?', [consultationId, userContext.userId]);
        if (!existingConsultation) {
          return { success: false, error: 'Consultation non trouvée' };
        }
      }

      await run('DELETE FROM consultations WHERE id = ?', [consultationId]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de la consultation:', error);
      return { success: false, error: error.message };
    }
  });
}

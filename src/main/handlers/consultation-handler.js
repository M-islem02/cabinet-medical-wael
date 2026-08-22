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
      patientid: payload.patientId || payload.patientid || '',
      page: toPositiveInt(payload.page, 1),
      pageSize: Math.min(100, toPositiveInt(payload.pageSize, 10)),
      startDate: String(payload.startDate || '').trim(),
      endDate: String(payload.endDate || '').trim(),
      attachmentsOnly: payload.attachmentsOnly === true,
      paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.startDate !== undefined || payload.endDate !== undefined
    };
  }

  return {
    patientid: payload,
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

function normalizeConsultationPayload(data = {}) {
  const patientId = String(data.patientId || data.patientid || '').trim();
  const type = data.type !== undefined ? data.type : (data.consultationType || data.consultationtype);
  const bloodPressure = data.bloodPressure !== undefined ? data.bloodPressure : data.bloodpressure;
  const clinicalExamination = data.clinicalExamination !== undefined ? data.clinicalExamination : data.clinicalexamination;
  const kineId = data.kineId !== undefined ? data.kineId : data.kineid;
  const isUnpaid = data.isUnpaid !== undefined ? data.isUnpaid : data.isunpaid;
  const unpaidAmount = data.unpaidAmount !== undefined ? data.unpaidAmount : data.unpaidamount;
  const unpaidDueDate = data.unpaidDueDate !== undefined ? data.unpaidDueDate : data.unpaidduedate;
  const date = data.date || data.consultationDate || data.consultationdate;

  return {
    patientId,
    date,
    type,
    reason: data.reason,
    weight: data.weight,
    height: data.height,
    bloodPressure,
    temperature: data.temperature,
    clinicalExamination,
    diagnosis: data.diagnosis,
    treatment: data.treatment,
    notes: data.notes,
    acts: data.acts,
    kineId,
    isUnpaid: Boolean(isUnpaid),
    unpaidAmount: toNumberOrNull(unpaidAmount) || 0,
    unpaidDueDate: toNullIfEmpty(unpaidDueDate),
    attachments: data.attachments
  };
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

      const normalized = normalizeConsultationPayload(consultationData);
      if (!normalized.patientId) {
        return { success: false, error: 'Patient introuvable' };
      }

      const patient = await queryOne('SELECT id, primaryDoctorId FROM patients WHERE id = ?', [normalized.patientId]);
      if (!patient?.id) {
        return { success: false, error: 'Patient introuvable' };
      }

      if (userContext.isPractitioner && userContext.userId) {
        const assignment = await queryOne(
          'SELECT patientid FROM patient_practitioners WHERE patientid = ? AND practitionerId = ?',
          [normalized.patientId, userContext.userId]
        );
        if (!assignment) {
          return { success: false, error: 'Accès refusé: ajoutez d’abord ce patient à votre liste' };
        }
      }

      const doctorid = userContext.isPractitioner ? userContext.userId : (patient.primaryDoctorId || null);

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      let normalizedDate = now;
      if (normalized.date) {
        const strDate = String(normalized.date).trim();
        if (strDate.length === 10) {
          normalizedDate = `${strDate} ${moment().format('HH:mm:ss')}`;
        } else if (moment(strDate).isValid()) {
          normalizedDate = moment(strDate).format('YYYY-MM-DD HH:mm:ss');
        }
      }
      
      // Calculer l'IMC si poids et taille fournis
      let imc = null;
      const weight = toNumberOrNull(normalized.weight);
      const height = toNumberOrNull(normalized.height);
      if (weight && height) {
        const heightInMeters = height / 100;
        imc = (weight / (heightInMeters * heightInMeters)).toFixed(2);
      }

      // Prepare attachments JSON
      const attachmentsJson = normalized.attachments ? JSON.stringify(normalized.attachments) : null;
      const actsJson = Array.isArray(normalized.acts)
        ? JSON.stringify(normalized.acts)
        : toNullIfEmpty(normalized.acts);

      await run(
        `INSERT INTO consultations 
         (id, patientid, doctorid, consultationdate, consultationtype, reason, weight, height, bloodpressure, temperature, clinicalexamination, diagnosis, treatment, notes, acts, kineid, isunpaid, unpaidamount, unpaidduedate, attachments, createdat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          normalized.patientId,
          doctorid,
          normalizedDate,
          toNullIfEmpty(normalized.type),
          toNullIfEmpty(normalized.reason),
          weight,
          height,
          toNullIfEmpty(normalized.bloodPressure),
          toNumberOrNull(normalized.temperature),
          toNullIfEmpty(normalized.clinicalExamination),
          toNullIfEmpty(normalized.diagnosis),
          toNullIfEmpty(normalized.treatment),
          toNullIfEmpty(normalized.notes),
          actsJson,
          toNullIfEmpty(normalized.kineId),
          normalized.isUnpaid ? 1 : 0,
          toNumberOrNull(normalized.unpaidAmount) || 0,
          toNullIfEmpty(normalized.unpaidDueDate),
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
      const whereParts = ['patientid = ?'];
      const params = [request.patientid];

      if (!userContext.isAdmin && userContext.isPractitioner && userContext.userId) {
        whereParts.push('doctorid = ?');
        params.push(userContext.userId);
      }

      if (request.startDate) {
        whereParts.push('DATE(consultationdate) >= DATE(?)');
        params.push(request.startDate);
      }

      if (request.endDate) {
        whereParts.push('DATE(consultationdate) <= DATE(?)');
        params.push(request.endDate);
      }

      if (request.attachmentsOnly) {
        whereParts.push('attachments IS NOT NULL');
        whereParts.push("TRIM(COALESCE(attachments, '')) <> ''");
      }

      const whereClause = whereParts.join(' AND ');
      const selectClause = request.attachmentsOnly
        ? `SELECT id, patientid, consultationdate, consultationtype, reason, attachments, createdat,
                  consultationdate as date, consultationtype as type
           FROM consultations`
        : `SELECT *, consultationdate as date, consultationtype as type
           FROM consultations`;

      if (!request.paginated) {
        const consultations = await query(
          `${selectClause}
           WHERE ${whereClause}
           ORDER BY consultationdate DESC`,
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
         ORDER BY consultationdate DESC
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
        ? 'SELECT *, consultationdate as date, consultationtype as type FROM consultations WHERE id = ? AND doctorid = ?'
        : 'SELECT *, consultationdate as date, consultationtype as type FROM consultations WHERE id = ?';
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

      const normalized = normalizeConsultationPayload(consultationData);
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      // Convertir les valeurs numériques
      const weight = toNumberOrNull(normalized.weight);
      const height = toNumberOrNull(normalized.height);
      const temperature = toNumberOrNull(normalized.temperature);
      
      // Calculer l'IMC si poids et taille fournis
      let imc = null;
      if (weight && height) {
        const heightInMeters = height / 100;
        imc = (weight / (heightInMeters * heightInMeters)).toFixed(2);
      }

      const existingLookupSql = (!userContext.isAdmin && userContext.isPractitioner && userContext.userId)
        ? 'SELECT consultationdate, attachments FROM consultations WHERE id = ? AND doctorid = ?'
        : 'SELECT consultationdate, attachments FROM consultations WHERE id = ?';
      const existingLookupParams = (!userContext.isAdmin && userContext.isPractitioner && userContext.userId)
        ? [consultationId, userContext.userId]
        : [consultationId];
      const existingConsultation = await queryOne(existingLookupSql, existingLookupParams);
      if (!existingConsultation) {
        return { success: false, error: 'Consultation non trouvée' };
      }

      const normalizedDate = normalized.date
        ? moment(normalized.date).format('YYYY-MM-DD HH:mm:ss')
        : existingConsultation.consultationdate || now;

      // Get existing attachments if not provided in update
      let attachmentsJson = null;
      if (normalized.attachments) {
        attachmentsJson = JSON.stringify(normalized.attachments);
      } else {
        attachmentsJson = existingConsultation?.attachments || null;
      }
      const actsJson = Array.isArray(normalized.acts)
        ? JSON.stringify(normalized.acts)
        : toNullIfEmpty(normalized.acts);

      await run(
        `UPDATE consultations 
         SET consultationdate = ?, consultationtype = ?, reason = ?, clinicalexamination = ?,
             bloodpressure = ?, temperature = ?, weight = ?, height = ?,
             diagnosis = ?, treatment = ?, notes = ?, acts = ?, kineid = ?, isunpaid = ?, unpaidamount = ?, unpaidduedate = ?, attachments = ?, updatedat = ?
         WHERE id = ?`,
        [
          normalizedDate,
          toNullIfEmpty(normalized.type),
          toNullIfEmpty(normalized.reason),
          toNullIfEmpty(normalized.clinicalExamination),
          toNullIfEmpty(normalized.bloodPressure),
          temperature,
          weight,
          height,
          toNullIfEmpty(normalized.diagnosis),
          toNullIfEmpty(normalized.treatment),
          toNullIfEmpty(normalized.notes),
          actsJson,
          toNullIfEmpty(normalized.kineId),
          normalized.isUnpaid ? 1 : 0,
          toNumberOrNull(normalized.unpaidAmount) || 0,
          toNullIfEmpty(normalized.unpaidDueDate),
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
        const existingConsultation = await queryOne('SELECT id FROM consultations WHERE id = ? AND doctorid = ?', [consultationId, userContext.userId]);
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

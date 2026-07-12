/**
 * Gestionnaire IPC pour les ordonnances
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

const toNullIfEmpty = (val) => (val === '' || val === undefined ? null : val);

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

function normalizePrescriptionListRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.patientId || '',
      page: toPositiveInt(payload.page, 1),
      pageSize: Math.min(100, toPositiveInt(payload.pageSize, 10)),
      startDate: String(payload.startDate || '').trim(),
      endDate: String(payload.endDate || '').trim(),
      paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.startDate !== undefined || payload.endDate !== undefined
    };
  }

  return {
    patientId: payload,
    page: 1,
    pageSize: 10,
    startDate: '',
    endDate: '',
    paginated: false
  };
}

function parsePrescriptionRow(row) {
  return {
    ...row,
    medications: row?.medications ? JSON.parse(row.medications) : []
  };
}

function isCurrentUserDirector() {
  return String(global.currentUser?.role || '').trim() === 'director';
}

function denyDirectorMedicalAccess() {
  return { success: false, error: 'Accès refusé: le directeur ne peut pas accéder aux données médicales détaillées' };
}

function isCurrentUserAssistant() {
  return normalizeUserRole(global.currentUser?.role) === 'assistant';
}

function denyAssistantPrescriptionWrite() {
  return { success: false, error: 'Accès refusé: le compte assistant ne peut pas créer, signer ou modifier une ordonnance' };
}

export function handlePrescriptionEvents() {
  ipcMain.handle('prescription:create', async (event, prescriptionData) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }
      if (isCurrentUserAssistant()) {
        return denyAssistantPrescriptionWrite();
      }

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const prescriptionDate = prescriptionData.prescriptionDate || moment().format('YYYY-MM-DD');

      await run(
        `INSERT INTO prescriptions
         (id, patientId, consultationId, prescriptionDate, medications, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          prescriptionData.patientId,
          toNullIfEmpty(prescriptionData.consultationId),
          prescriptionDate,
          JSON.stringify(prescriptionData.medications || []),
          toNullIfEmpty(prescriptionData.notes),
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error("Erreur lors de la creation de l'ordonnance:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('prescription:getByPatient', async (event, payload) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const request = normalizePrescriptionListRequest(payload);
      const whereParts = ['patientId = ?'];
      const params = [request.patientId];

      if (request.startDate) {
        whereParts.push('DATE(prescriptionDate) >= DATE(?)');
        params.push(request.startDate);
      }

      if (request.endDate) {
        whereParts.push('DATE(prescriptionDate) <= DATE(?)');
        params.push(request.endDate);
      }

      const whereClause = whereParts.join(' AND ');

      if (!request.paginated) {
        const prescriptions = await query(
          `SELECT *, prescriptionDate as date
           FROM prescriptions
           WHERE ${whereClause}
           ORDER BY prescriptionDate DESC`,
          params
        );
        return { success: true, data: prescriptions.map(parsePrescriptionRow) };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM prescriptions WHERE ${whereClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const prescriptions = await query(
        `SELECT *, prescriptionDate as date
         FROM prescriptions
         WHERE ${whereClause}
         ORDER BY prescriptionDate DESC
         LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: prescriptions.map(parsePrescriptionRow),
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error("Erreur lors de la recuperation des ordonnances:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('prescription:getByConsultation', async (event, consultationId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      if (!consultationId) {
        return { success: true, data: [] };
      }

      const prescriptions = await query(
        `SELECT *, prescriptionDate as date
         FROM prescriptions
         WHERE consultationId = ?
         ORDER BY prescriptionDate DESC`,
        [consultationId]
      );

      return { success: true, data: prescriptions.map(parsePrescriptionRow) };
    } catch (error) {
      console.error("Erreur lors de la recuperation des ordonnances par consultation:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('prescription:getById', async (event, prescriptionId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const prescription = await queryOne(
        'SELECT *, prescriptionDate as date FROM prescriptions WHERE id = ?',
        [prescriptionId]
      );

      if (!prescription) {
        return { success: false, error: 'Ordonnance non trouvee' };
      }

      return {
        success: true,
        data: parsePrescriptionRow(prescription)
      };
    } catch (error) {
      console.error("Erreur lors de la recuperation de l'ordonnance:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('prescription:update', async (event, prescriptionId, prescriptionData) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }
      if (isCurrentUserAssistant()) {
        return denyAssistantPrescriptionWrite();
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE prescriptions
         SET medications = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [
          JSON.stringify(prescriptionData.medications || []),
          prescriptionData.notes,
          now,
          prescriptionId
        ]
      );

      return { success: true };
    } catch (error) {
      console.error("Erreur lors de la mise a jour de l'ordonnance:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('prescription:delete', async (event, prescriptionId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }
      if (isCurrentUserAssistant()) {
        return denyAssistantPrescriptionWrite();
      }

      await run('DELETE FROM prescriptions WHERE id = ?', [prescriptionId]);
      return { success: true };
    } catch (error) {
      console.error("Erreur lors de la suppression de l'ordonnance:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('prescription:getMedicationsHistory', async () => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const rows = await query(
        `SELECT medications, prescriptionDate, updatedAt
         FROM prescriptions
         WHERE medications IS NOT NULL AND TRIM(medications) <> ''`
      );

      const map = new Map();

      rows.forEach((row) => {
        let meds = [];
        try {
          meds = JSON.parse(row.medications || '[]');
        } catch (error) {
          meds = [];
        }

        meds.forEach((med) => {
          if (!med || !med.name) {
            return;
          }

          const key = med.name.trim().toLowerCase();
          const entry = map.get(key) || {
            name: med.name.trim(),
            dosage: med.dosage || '',
            intake: med.intake || med.dose || '',
            duration: med.duration || '',
            boxes: med.boxes || '',
            instructions: med.instructions || med.notes || '',
            usageCount: 0,
            lastUsed: null
          };

          if (!entry.dosage && med.dosage) entry.dosage = med.dosage;
          entry.usageCount = (entry.usageCount || 0) + 1;
          if (!entry.intake && med.intake) entry.intake = med.intake;
          if (!entry.duration && med.duration) entry.duration = med.duration;
          if (!entry.boxes && med.boxes) entry.boxes = med.boxes;
          if (!entry.instructions && (med.instructions || med.notes)) entry.instructions = med.instructions || med.notes;
          const rowDate = row.updatedAt || row.prescriptionDate;
          if (rowDate) {
            const formatted = moment(rowDate).format('YYYY-MM-DD HH:mm:ss');
            if (!entry.lastUsed || moment(formatted).isAfter(entry.lastUsed)) {
              entry.lastUsed = formatted;
            }
          }

          map.set(key, entry);
        });
      });

      const data = Array.from(map.values()).sort((a, b) => {
        if ((b.usageCount || 0) === (a.usageCount || 0)) {
          return (b.lastUsed || '').localeCompare(a.lastUsed || '');
        }
        return (b.usageCount || 0) - (a.usageCount || 0);
      });

      return { success: true, data };
    } catch (error) {
      console.error("Erreur lors de la recuperation de l'historique des medicaments:", error);
      return { success: false, error: error.message };
    }
  });
}

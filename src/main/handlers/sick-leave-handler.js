/**
 * Gestionnaire IPC pour les arrets de travail
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

const toNullIfEmpty = (val) => (val === '' || val === undefined ? null : val);

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

function normalizeSickLeaveListRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.patientId || '',
      page: toPositiveInt(payload.page, 1),
      pageSize: Math.min(100, toPositiveInt(payload.pageSize, 10)),
      startDate: String(payload.startDate || '').trim(),
      endDate: String(payload.endDate || '').trim(),
      documentKind: payload.documentKind === 'workstop' ? 'workstop' : payload.documentKind === 'certificate' ? 'certificate' : '',
      paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.startDate !== undefined || payload.endDate !== undefined || payload.documentKind !== undefined
    };
  }

  return {
    patientId: payload,
    page: 1,
    pageSize: 10,
    startDate: '',
    endDate: '',
    documentKind: '',
    paginated: false
  };
}

function isCurrentUserDirector() {
  return global.currentUser?.role === 'director';
}

function denyDirectorMedicalAccess() {
  return { success: false, error: 'Accès refusé: le directeur ne peut pas accéder aux données médicales détaillées' };
}

export function handleSickLeaveEvents() {
  ipcMain.handle('sickleave:create', async (event, sickLeaveData) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const startDate = moment(sickLeaveData.startDate);
      const endDate = moment(sickLeaveData.endDate);
      const numberOfDays = endDate.diff(startDate, 'days') + 1;

      await run(
        `INSERT INTO sick_leaves
         (id, patientId, consultationId, startDate, endDate, numberOfDays, diagnosis, cim10Code, allowedOutings, documentKind, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sickLeaveData.patientId,
          toNullIfEmpty(sickLeaveData.consultationId),
          sickLeaveData.startDate,
          sickLeaveData.endDate,
          numberOfDays,
          toNullIfEmpty(sickLeaveData.diagnosis),
          toNullIfEmpty(sickLeaveData.cim10Code),
          sickLeaveData.allowedOutings ? 1 : 0,
          sickLeaveData.documentKind === 'workstop' ? 'workstop' : 'certificate',
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error("Erreur lors de la creation de l'arret de travail:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sickleave:getByPatient', async (event, payload) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const request = normalizeSickLeaveListRequest(payload);
      const whereParts = ['patientId = ?'];
      const params = [request.patientId];

      if (request.documentKind === 'workstop' || request.documentKind === 'certificate') {
        whereParts.push('documentKind = ?');
        params.push(request.documentKind);
      }

      if (request.startDate) {
        whereParts.push('DATE(startDate) >= DATE(?)');
        params.push(request.startDate);
      }

      if (request.endDate) {
        whereParts.push('DATE(startDate) <= DATE(?)');
        params.push(request.endDate);
      }

      const whereClause = whereParts.join(' AND ');

      if (!request.paginated) {
        const sickLeaves = await query(
          `SELECT *
           FROM sick_leaves
           WHERE ${whereClause}
           ORDER BY startDate DESC`,
          params
        );
        return { success: true, data: sickLeaves };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM sick_leaves WHERE ${whereClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const sickLeaves = await query(
        `SELECT *
         FROM sick_leaves
         WHERE ${whereClause}
         ORDER BY startDate DESC
         LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: sickLeaves,
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error("Erreur lors de la recuperation des arrets de travail:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sickleave:getByConsultation', async (event, consultationId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      if (!consultationId) {
        return { success: true, data: [] };
      }

      const sickLeaves = await query(
        `SELECT *
         FROM sick_leaves
         WHERE consultationId = ?
         ORDER BY startDate DESC`,
        [consultationId]
      );

      return { success: true, data: sickLeaves };
    } catch (error) {
      console.error("Erreur lors de la recuperation des arrets par consultation:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sickleave:getById', async (event, sickLeaveId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const sickLeave = await queryOne(
        `SELECT sl.*, p.firstName AS patientFirstName, p.lastName AS patientLastName,
                p.dateOfBirth AS patientDateOfBirth
         FROM sick_leaves sl
         LEFT JOIN patients p ON p.id = sl.patientId
         WHERE sl.id = ?`,
        [sickLeaveId]
      );

      if (!sickLeave) {
        return { success: false, error: 'Arret de travail non trouve' };
      }

      return { success: true, data: sickLeave };
    } catch (error) {
      console.error("Erreur lors de la recuperation de l'arret de travail:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sickleave:update', async (event, sickLeaveId, sickLeaveData) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const startDate = moment(sickLeaveData.startDate);
      const endDate = moment(sickLeaveData.endDate);
      const numberOfDays = endDate.diff(startDate, 'days') + 1;

      await run(
        `UPDATE sick_leaves
         SET startDate = ?, endDate = ?, numberOfDays = ?, diagnosis = ?, cim10Code = ?, allowedOutings = ?, documentKind = ?, updatedAt = ?
         WHERE id = ?`,
        [
          sickLeaveData.startDate,
          sickLeaveData.endDate,
          numberOfDays,
          toNullIfEmpty(sickLeaveData.diagnosis),
          toNullIfEmpty(sickLeaveData.cim10Code),
          sickLeaveData.allowedOutings ? 1 : 0,
          sickLeaveData.documentKind === 'workstop' ? 'workstop' : 'certificate',
          now,
          sickLeaveId
        ]
      );

      return { success: true };
    } catch (error) {
      console.error("Erreur lors de la mise a jour de l'arret de travail:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sickleave:delete', async (event, sickLeaveId) => {
    try {
      if (isCurrentUserDirector()) {
        return denyDirectorMedicalAccess();
      }

      await run('DELETE FROM sick_leaves WHERE id = ?', [sickLeaveId]);
      return { success: true };
    } catch (error) {
      console.error("Erreur lors de la suppression de l'arret de travail:", error);
      return { success: false, error: error.message };
    }
  });
}

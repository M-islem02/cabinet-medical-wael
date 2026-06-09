import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';

function sanitizePayload(data = {}) {
  try {
    return JSON.stringify(data ?? {});
  } catch (error) {
    console.error('Erreur lors de la serialisation du document:', error);
    return JSON.stringify({});
  }
}

function formatDateForDB(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === 'string' && dateValue.includes('T')) {
    return moment(dateValue).format('YYYY-MM-DD HH:mm:ss');
  }
  return dateValue;
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

function normalizeDocumentListRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.patientId || '',
      documentType: String(payload.documentType || '').trim().toLowerCase(),
      page: toPositiveInt(payload.page, 1),
      pageSize: Math.min(100, toPositiveInt(payload.pageSize, 10)),
      startDate: String(payload.startDate || '').trim(),
      endDate: String(payload.endDate || '').trim(),
      paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.documentType !== undefined || payload.startDate !== undefined || payload.endDate !== undefined
    };
  }

  return {
    patientId: payload,
    documentType: '',
    page: 1,
    pageSize: 10,
    startDate: '',
    endDate: '',
    paginated: false
  };
}

export function handleDocumentEvents() {
  ipcMain.handle('document:save', async (event, payload = {}) => {
    try {
      const {
        id,
        patientId,
        consultationId,
        documentType,
        title = '',
        data = {},
        lastPrintedAt
      } = payload;

      if (!patientId || !documentType) {
        return { success: false, error: 'Informations document manquantes' };
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const serializedData = sanitizePayload(data);
      const normalizedType = documentType.toLowerCase();
      const formattedLastPrintedAt = formatDateForDB(lastPrintedAt);

      if (id) {
        await run(
          `UPDATE documents
           SET patientId = ?, consultationId = ?, documentType = ?, title = ?, payload = ?, updatedAt = ?, lastPrintedAt = COALESCE(?, lastPrintedAt)
           WHERE id = ?`,
          [patientId, consultationId || null, normalizedType, title, serializedData, now, formattedLastPrintedAt, id]
        );
        return { success: true, id };
      }

      let existing = null;
      if (consultationId) {
        existing = await queryOne(
          'SELECT id FROM documents WHERE consultationId = ? AND documentType = ?',
          [consultationId, normalizedType]
        );
      }

      if (existing) {
        await run(
          `UPDATE documents
           SET patientId = ?, title = ?, payload = ?, updatedAt = ?, lastPrintedAt = COALESCE(?, lastPrintedAt)
           WHERE id = ?`,
          [patientId, title, serializedData, now, formattedLastPrintedAt, existing.id]
        );
        return { success: true, id: existing.id };
      }

      const newId = uuidv4();
      await run(
        `INSERT INTO documents (id, patientId, consultationId, documentType, title, payload, createdAt, updatedAt, lastPrintedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, patientId, consultationId || null, normalizedType, title, serializedData, now, now, formattedLastPrintedAt]
      );

      return { success: true, id: newId };
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du document:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('document:getByType', async (event, { patientId, consultationId, documentType }) => {
    try {
      if (!documentType) {
        return { success: false, error: 'Parametres invalides' };
      }

      const normalizedType = documentType.toLowerCase();
      let doc = null;

      if (patientId) {
        doc = await queryOne(
          'SELECT * FROM documents WHERE patientId = ? AND documentType = ?',
          [patientId, normalizedType]
        );
      }

      if (!doc && consultationId) {
        doc = await queryOne(
          'SELECT * FROM documents WHERE consultationId = ? AND documentType = ?',
          [consultationId, normalizedType]
        );
      }

      if (doc && !doc.patientId && patientId) {
        await run('UPDATE documents SET patientId = ? WHERE id = ?', [patientId, doc.id]);
        doc.patientId = patientId;
      }

      return { success: true, data: doc };
    } catch (error) {
      console.error('Erreur lors de la recuperation du document:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('document:listByConsultation', async (event, consultationId) => {
    try {
      if (!consultationId) {
        return { success: false, error: 'Consultation manquante' };
      }

      const docs = await query(
        'SELECT * FROM documents WHERE consultationId = ? ORDER BY updatedAt DESC',
        [consultationId]
      );

      return { success: true, data: docs };
    } catch (error) {
      console.error('Erreur lors de la liste des documents:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('document:listByPatient', async (event, payload) => {
    try {
      const request = normalizeDocumentListRequest(payload);
      if (!request.patientId) {
        return { success: false, error: 'Patient manquant' };
      }

      const whereParts = ['patientId = ?'];
      const params = [request.patientId];

      if (request.documentType) {
        whereParts.push('documentType = ?');
        params.push(request.documentType);
      }

      if (request.startDate) {
        whereParts.push('DATE(COALESCE(updatedAt, createdAt)) >= DATE(?)');
        params.push(request.startDate);
      }

      if (request.endDate) {
        whereParts.push('DATE(COALESCE(updatedAt, createdAt)) <= DATE(?)');
        params.push(request.endDate);
      }

      const whereClause = whereParts.join(' AND ');

      if (!request.paginated) {
        const docs = await query(
          `SELECT *
           FROM documents
           WHERE ${whereClause}
           ORDER BY updatedAt DESC, createdAt DESC`,
          params
        );
        return { success: true, data: docs };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM documents WHERE ${whereClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const docs = await query(
        `SELECT *
         FROM documents
         WHERE ${whereClause}
         ORDER BY updatedAt DESC, createdAt DESC
         LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: docs,
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error('Erreur lors de la liste des documents patient:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('document:getById', async (event, documentId) => {
    try {
      if (!documentId) {
        return { success: false, error: 'ID document manquant' };
      }

      const doc = await queryOne('SELECT * FROM documents WHERE id = ?', [documentId]);
      return { success: true, data: doc };
    } catch (error) {
      console.error('Erreur lors de la recuperation du document:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('document:delete', async (event, documentId) => {
    try {
      if (!documentId) {
        return { success: false, error: 'ID document manquant' };
      }

      await run('DELETE FROM documents WHERE id = ?', [documentId]);
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression du document:', error);
      return { success: false, error: error.message };
    }
  });
}

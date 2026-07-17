/**
 * Gestionnaire IPC pour les paiements
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

const toNullIfEmpty = (val) => (val === '' || val === undefined ? null : val);
const toNumberOrNull = (val) => {
  if (val === '' || val === undefined || val === null) return null;
  const num = parseFloat(val);
  return Number.isNaN(num) ? null : num;
};

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

function normalizePaymentListRequest(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {
      startDate: '',
      endDate: '',
      paymentMethod: '',
      paginated: false,
      page: 1,
      pageSize: 25
    };
  }

  return {
    startDate: String(filters.startDate || '').trim(),
    endDate: String(filters.endDate || '').trim(),
    paymentMethod: String(filters.paymentMethod || '').trim(),
    paginated: filters.paginated === true || filters.page !== undefined || filters.pageSize !== undefined,
    page: toPositiveInt(filters.page, 1),
    pageSize: Math.min(100, toPositiveInt(filters.pageSize, 25))
  };
}

function isAssistantUser() {
  return global.currentUser?.role === 'assistant';
}

function normalizeUserRole(role) {
  return role === 'director' ? 'doctor' : String(role || '').trim();
}

function getPaymentUserContext() {
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

function getTodayPaymentDateClause(paymentAlias = 'payments') {
  return `DATE(${paymentAlias}.paymentDate) = CURRENT_DATE`;
}

function getPaymentAccessScope(paymentAlias = 'payments', patientAlias = 'patients') {
  return { clause: '', params: [] };
}

function buildPaymentSelect() {
  return `
    SELECT payments.*,
           patients.firstName AS patientFirstName,
           patients.lastName AS patientLastName
    FROM payments
    LEFT JOIN patients ON patients.id = payments.patientId
  `;
}

function applyPaymentVisibility(payment) {
  if (!isAssistantUser()) {
    return payment;
  }

  return {
    ...payment,
    notes: null
  };
}

export function handlePaymentEvents() {
  ipcMain.handle('payment:create', async (event, paymentData) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const consultationId = toNullIfEmpty(paymentData.consultationId);

      if (consultationId) {
        const existing = await queryOne(
          'SELECT id FROM payments WHERE consultationId = ? ORDER BY createdAt DESC LIMIT 1',
          [consultationId]
        );
        if (existing?.id) {
          return { success: true, id: existing.id, duplicate: true };
        }
      }

      await run(
        `INSERT INTO payments
         (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          paymentData.patientId,
          consultationId,
          toNumberOrNull(paymentData.amount) || 0,
          paymentData.paymentDate || now,
          paymentData.paymentMethod || 'Especes',
          toNullIfEmpty(paymentData.description),
          toNullIfEmpty(paymentData.notes),
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('Erreur lors de la creation du paiement:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:getByPatient', async (event, patientId) => {
    try {
      const scope = getPaymentAccessScope('payments', 'patients');
      const whereParts = ['payments.patientId = ?'];
      const params = [patientId];

      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }

      const payments = await query(
        `SELECT payments.*
         FROM payments
         LEFT JOIN patients ON patients.id = payments.patientId
         WHERE ${whereParts.join(' AND ')}
         ORDER BY paymentDate DESC`,
        params
      );

      return { success: true, data: payments.map(applyPaymentVisibility) };
    } catch (error) {
      console.error('Erreur lors de la recuperation des paiements:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:getByConsultation', async (event, consultationId) => {
    try {
      if (!consultationId) {
        return { success: true, data: null };
      }

      const scope = getPaymentAccessScope('payments', 'patients');
      const whereParts = ['payments.consultationId = ?'];
      const params = [consultationId];

      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }

      const payment = await queryOne(
        `SELECT payments.*,
                patients.firstName AS patientFirstName,
                patients.lastName AS patientLastName
         FROM payments
         LEFT JOIN patients ON patients.id = payments.patientId
         WHERE ${whereParts.join(' AND ')}
         ORDER BY payments.paymentDate DESC
         LIMIT 1`,
        params
      );

      return { success: true, data: payment ? applyPaymentVisibility(payment) : null };
    } catch (error) {
      console.error('Erreur lors de la recuperation du paiement par consultation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:getById', async (event, paymentId) => {
    try {
      if (isAssistantUser()) {
        return { success: false, error: 'Acces refuse' };
      }

      const scope = getPaymentAccessScope('payments', 'patients');
      const whereParts = ['payments.id = ?'];
      const params = [paymentId];

      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }

      const payment = await queryOne(
        `SELECT payments.*
         FROM payments
         LEFT JOIN patients ON patients.id = payments.patientId
         WHERE ${whereParts.join(' AND ')}`,
        params
      );
      if (!payment) {
        return { success: false, error: 'Paiement non trouve' };
      }

      return { success: true, data: payment };
    } catch (error) {
      console.error('Erreur lors de la recuperation du paiement:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:getAll', async (event, filters = {}) => {
    try {
      const request = normalizePaymentListRequest(filters);
      const whereParts = ['1=1'];
      const params = [];

      if (request.startDate) {
        whereParts.push('payments.paymentDate >= ?');
        params.push(request.startDate);
      }

      if (request.endDate) {
        whereParts.push('payments.paymentDate <= ?');
        params.push(request.endDate);
      }

      if (request.paymentMethod) {
        whereParts.push('payments.paymentMethod = ?');
        params.push(request.paymentMethod);
      }

      const scope = getPaymentAccessScope('payments', 'patients');
      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }

      const whereClause = whereParts.join(' AND ');

      if (!request.paginated) {
        const payments = await query(
          `${buildPaymentSelect()}
           WHERE ${whereClause}
           ORDER BY payments.paymentDate DESC`,
          params
        );

        return { success: true, data: (payments || []).map(applyPaymentVisibility) };
      }

      const totalRow = await queryOne(
        `SELECT COUNT(*) as total
         FROM payments
         LEFT JOIN patients ON patients.id = payments.patientId
         WHERE ${whereClause}`,
        params
      );
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const payments = await query(
        `${buildPaymentSelect()}
         WHERE ${whereClause}
         ORDER BY payments.paymentDate DESC
         LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: (payments || []).map(applyPaymentVisibility),
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error('Erreur lors de la recuperation des paiements:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:getTotalIncome', async (event, filters = {}) => {
    try {
      let sql = `
        SELECT SUM(payments.amount) as total
        FROM payments
        LEFT JOIN patients ON patients.id = payments.patientId
        WHERE 1=1
      `;
      const params = [];

      if (filters.startDate) {
        sql += ' AND payments.paymentDate >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        sql += ' AND payments.paymentDate <= ?';
        params.push(filters.endDate);
      }

      const scope = getPaymentAccessScope('payments', 'patients');
      if (scope.clause) {
        sql += ` AND ${scope.clause}`;
        params.push(...scope.params);
      }

      const result = await queryOne(sql, params);
      return {
        success: true,
        total: result?.total || 0
      };
    } catch (error) {
      console.error('Erreur lors du calcul des revenus:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:getIncomeByPeriod', async (event, options = {}) => {
    try {
      const { period = 'month', startDate, endDate } = options;

      let groupBy = '';
      let whereClause = '';
      const params = [];

      if (period === 'day') {
        groupBy = 'DATE(payments.paymentDate)';
      } else if (period === 'week') {
        groupBy = "TO_CHAR(payments.paymentDate::timestamp, 'IYYY-\"W\"IW')";
      } else if (period === 'year') {
        groupBy = "TO_CHAR(payments.paymentDate::timestamp, 'YYYY')";
      } else {
        groupBy = "TO_CHAR(payments.paymentDate::timestamp, 'YYYY-MM')";
      }

      if (startDate && endDate) {
        whereClause = 'WHERE payments.paymentDate BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        whereClause = 'WHERE payments.paymentDate >= ?';
        params.push(startDate);
      } else if (endDate) {
        whereClause = 'WHERE payments.paymentDate <= ?';
        params.push(endDate);
      }

      const whereParts = whereClause ? [whereClause.replace(/^WHERE\s+/i, '')] : [];
      const scope = getPaymentAccessScope('payments', 'patients');
      if (scope.clause) {
        whereParts.push(scope.clause);
        params.push(...scope.params);
      }
      whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      const results = await query(
        `SELECT
           ${groupBy} as period,
           SUM(payments.amount) as income
         FROM payments
         LEFT JOIN patients ON patients.id = payments.patientId
         ${whereClause}
         GROUP BY ${groupBy}
         ORDER BY ${groupBy} DESC
         LIMIT 12`,
        params
      );

      return { success: true, data: results };
    } catch (error) {
      console.error('Erreur lors de la recuperation des statistiques:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:update', async (event, paymentId, paymentData) => {
    try {
      if (isAssistantUser()) {
        return { success: false, error: 'Modification non autorisee' };
      }

      const scope = getPaymentAccessScope('payments', 'patients');
      if (scope.clause) {
        const allowed = await queryOne(
          `SELECT payments.id
           FROM payments
           LEFT JOIN patients ON patients.id = payments.patientId
           WHERE payments.id = ? AND ${scope.clause}`,
          [paymentId, ...scope.params]
        );
        if (!allowed) {
          return { success: false, error: 'Modification non autorisee' };
        }
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE payments
         SET amount = ?, paymentDate = ?, paymentMethod = ?, description = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [
          toNumberOrNull(paymentData.amount) || 0,
          paymentData.paymentDate,
          paymentData.paymentMethod,
          toNullIfEmpty(paymentData.description),
          toNullIfEmpty(paymentData.notes),
          now,
          paymentId
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la mise a jour du paiement:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('payment:delete', async (event, paymentId) => {
    try {
      if (isAssistantUser()) {
        return { success: false, error: 'Suppression non autorisee' };
      }

      const scope = getPaymentAccessScope('payments', 'patients');
      if (scope.clause) {
        const allowed = await queryOne(
          `SELECT payments.id
           FROM payments
           LEFT JOIN patients ON patients.id = payments.patientId
           WHERE payments.id = ? AND ${scope.clause}`,
          [paymentId, ...scope.params]
        );
        if (!allowed) {
          return { success: false, error: 'Suppression non autorisee' };
        }
      }

      await run('DELETE FROM payments WHERE id = ?', [paymentId]);
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression du paiement:', error);
      return { success: false, error: error.message };
    }
  });
}

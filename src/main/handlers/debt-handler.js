/**
 * Gestionnaire IPC pour les dettes et impayés
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

export function handleDebtEvents() {
  // ========== DETTES / IMPAYÉS ==========

  // Créer une dette
  ipcMain.handle('debt:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const amount = toNumberOrNull(data.amount) || 0;
      const paidAmount = toNumberOrNull(data.paidAmount) || 0;
      const remainingAmount = amount - paidAmount;

      await run(
        `INSERT INTO debts 
         (id, patientId, consultationId, invoiceId, amount, paidAmount, remainingAmount, 
          dueDate, status, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.patientId,
          toNullIfEmpty(data.consultationId),
          toNullIfEmpty(data.invoiceId),
          amount,
          paidAmount,
          remainingAmount,
          data.dueDate,
          remainingAmount > 0 ? 'unpaid' : 'paid',
          toNullIfEmpty(data.notes),
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création dette:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer toutes les dettes
  ipcMain.handle('debt:getAll', async (event, filters = {}) => {
    try {
      let sql = `
        SELECT d.*, p.firstName, p.lastName, p.phone
        FROM debts d
        LEFT JOIN patients p ON d.patientId = p.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.patientId) {
        sql += ' AND d.patientId = ?';
        params.push(filters.patientId);
      }
      if (filters.status) {
        sql += ' AND d.status = ?';
        params.push(filters.status);
      }
      if (filters.startDate) {
        sql += ' AND d.createdAt >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        sql += ' AND d.createdAt <= ?';
        params.push(filters.endDate);
      }

      sql += ' ORDER BY d.createdAt DESC';

      const debts = await query(sql, params);
      return { success: true, data: debts };
    } catch (error) {
      console.error('❌ Erreur récupération dettes:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer les dettes d'un patient
  ipcMain.handle('debt:getByPatient', async (event, patientId) => {
    try {
      const debts = await query(
        `SELECT * FROM debts WHERE patientId = ? ORDER BY createdAt DESC`,
        [patientId]
      );
      return { success: true, data: debts };
    } catch (error) {
      console.error('❌ Erreur récupération dettes patient:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer une dette par ID
  ipcMain.handle('debt:getById', async (event, id) => {
    try {
      const debt = await queryOne(
        `SELECT d.*, p.firstName, p.lastName 
         FROM debts d
         LEFT JOIN patients p ON d.patientId = p.id
         WHERE d.id = ?`,
        [id]
      );
      return { success: true, data: debt };
    } catch (error) {
      console.error('❌ Erreur récupération dette:', error);
      return { success: false, error: error.message };
    }
  });

  // Effectuer un paiement partiel
  ipcMain.handle('debt:makePayment', async (event, debtId, paymentAmount) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      // Récupérer la dette actuelle
      const debt = await queryOne('SELECT * FROM debts WHERE id = ?', [debtId]);
      if (!debt) {
        return { success: false, error: 'Dette non trouvée' };
      }

      const newPaidAmount = (debt.paidAmount || 0) + paymentAmount;
      const newRemaining = debt.amount - newPaidAmount;
      const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

      await run(
        `UPDATE debts 
         SET paidAmount = ?, remainingAmount = ?, status = ?, updatedAt = ?
         WHERE id = ?`,
        [newPaidAmount, Math.max(0, newRemaining), newStatus, now, debtId]
      );

      // Créer un enregistrement de paiement
      await run(
        `INSERT INTO payments (id, patientId, consultationId, amount, paymentDate, paymentMethod, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'Espèces', ?, ?, ?)`,
        [uuidv4(), debt.patientId, debt.consultationId, paymentAmount, now, `Paiement dette #${debtId.substring(0, 8)}`, now, now]
      );

      return { success: true, newRemaining: Math.max(0, newRemaining), status: newStatus };
    } catch (error) {
      console.error('❌ Erreur paiement dette:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour une dette
  ipcMain.handle('debt:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const amount = toNumberOrNull(data.amount) || 0;
      const paidAmount = toNumberOrNull(data.paidAmount) || 0;
      const remainingAmount = amount - paidAmount;

      await run(
        `UPDATE debts 
         SET amount = ?, paidAmount = ?, remainingAmount = ?, dueDate = ?, 
             status = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [
          amount,
          paidAmount,
          remainingAmount,
          data.dueDate,
          remainingAmount > 0 ? (paidAmount > 0 ? 'partial' : 'unpaid') : 'paid',
          toNullIfEmpty(data.notes),
          now,
          id
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour dette:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer une dette
  ipcMain.handle('debt:delete', async (event, id) => {
    try {
      await run('DELETE FROM debts WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression dette:', error);
      return { success: false, error: error.message };
    }
  });

  // Statistiques des dettes
  ipcMain.handle('debt:getStats', async (event, filters = {}) => {
    try {
      let whereClause = '1=1';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND createdAt >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND createdAt <= ?';
        params.push(filters.endDate);
      }

      // Total des dettes
      const totalResult = await queryOne(
        `SELECT SUM(amount) as totalAmount, SUM(paidAmount) as totalPaid, SUM(remainingAmount) as totalRemaining
         FROM debts WHERE ${whereClause}`,
        params
      );

      // Par statut
      const byStatus = await query(
        `SELECT status, COUNT(*) as count, SUM(remainingAmount) as total 
         FROM debts WHERE ${whereClause}
         GROUP BY status`,
        params
      );

      // Top débiteurs
      const topDebtors = await query(
        `SELECT d.patientId, p.firstName, p.lastName, SUM(d.remainingAmount) as totalDebt
         FROM debts d
         LEFT JOIN patients p ON d.patientId = p.id
         WHERE d.status != 'paid' AND ${whereClause.replace(/createdAt/g, 'd.createdAt')}
         GROUP BY d.patientId
         ORDER BY totalDebt DESC
         LIMIT 10`,
        params
      );

      return {
        success: true,
        data: {
          totalAmount: totalResult?.totalAmount || 0,
          totalPaid: totalResult?.totalPaid || 0,
          totalRemaining: totalResult?.totalRemaining || 0,
          byStatus,
          topDebtors
        }
      };
    } catch (error) {
      console.error('❌ Erreur stats dettes:', error);
      return { success: false, error: error.message };
    }
  });

  // Dettes en retard
  ipcMain.handle('debt:getOverdue', async () => {
    try {
      const today = moment().format('YYYY-MM-DD');
      const debts = await query(
        `SELECT d.*, p.firstName, p.lastName, p.phone
         FROM debts d
         LEFT JOIN patients p ON d.patientId = p.id
         WHERE d.status != 'paid' AND d.dueDate < ?
         ORDER BY d.dueDate ASC`,
        [today]
      );
      return { success: true, data: debts };
    } catch (error) {
      console.error('❌ Erreur récupération dettes en retard:', error);
      return { success: false, error: error.message };
    }
  });
}

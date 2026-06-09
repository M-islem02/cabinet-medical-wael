/**
 * Gestionnaire IPC pour les dépenses du cabinet
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

export function handleExpenseEvents() {
  // ========== DÉPENSES ==========
  
  // Créer une dépense
  ipcMain.handle('expense:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `INSERT INTO expenses 
         (id, expenseDate, category, description, amount, paymentMethod, vendor, receiptNumber, notes, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.expenseDate,
          toNullIfEmpty(data.category),
          toNullIfEmpty(data.description),
          toNumberOrNull(data.amount) || 0,
          data.paymentMethod || 'Espèces',
          toNullIfEmpty(data.vendor),
          toNullIfEmpty(data.receiptNumber),
          toNullIfEmpty(data.notes),
          toNullIfEmpty(data.createdBy),
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création dépense:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer toutes les dépenses
  ipcMain.handle('expense:getAll', async (event, filters = {}) => {
    try {
      let sql = 'SELECT * FROM expenses WHERE 1=1';
      const params = [];

      if (filters.startDate) {
        sql += ' AND expenseDate >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        sql += ' AND expenseDate <= ?';
        params.push(filters.endDate);
      }
      if (filters.category) {
        sql += ' AND category = ?';
        params.push(filters.category);
      }

      sql += ' ORDER BY expenseDate DESC';

      const expenses = await query(sql, params);
      return { success: true, data: expenses };
    } catch (error) {
      console.error('❌ Erreur récupération dépenses:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer une dépense par ID
  ipcMain.handle('expense:getById', async (event, id) => {
    try {
      const expense = await queryOne('SELECT * FROM expenses WHERE id = ?', [id]);
      return { success: true, data: expense };
    } catch (error) {
      console.error('❌ Erreur récupération dépense:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour une dépense
  ipcMain.handle('expense:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE expenses 
         SET expenseDate = ?, category = ?, description = ?, amount = ?, 
             paymentMethod = ?, vendor = ?, receiptNumber = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [
          data.expenseDate,
          toNullIfEmpty(data.category),
          toNullIfEmpty(data.description),
          toNumberOrNull(data.amount) || 0,
          data.paymentMethod,
          toNullIfEmpty(data.vendor),
          toNullIfEmpty(data.receiptNumber),
          toNullIfEmpty(data.notes),
          now,
          id
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour dépense:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer une dépense
  ipcMain.handle('expense:delete', async (event, id) => {
    try {
      await run('DELETE FROM expenses WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression dépense:', error);
      return { success: false, error: error.message };
    }
  });

  // Statistiques des dépenses
  ipcMain.handle('expense:getStats', async (event, filters = {}) => {
    try {
      let whereClause = '1=1';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND expenseDate >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND expenseDate <= ?';
        params.push(filters.endDate);
      }

      // Total des dépenses
      const totalResult = await queryOne(
        `SELECT SUM(amount) as total FROM expenses WHERE ${whereClause}`,
        params
      );

      // Par catégorie
      const byCategory = await query(
        `SELECT category, SUM(amount) as total, COUNT(*) as count 
         FROM expenses WHERE ${whereClause}
         GROUP BY category ORDER BY total DESC`,
        params
      );

      // Par mois (compatible MariaDB)
      const byMonth = await query(
        `SELECT SUBSTR(expenseDate, 1, 7) as month, SUM(amount) as total 
         FROM expenses WHERE ${whereClause}
         GROUP BY SUBSTR(expenseDate, 1, 7) ORDER BY month DESC LIMIT 12`,
        params
      );

      return {
        success: true,
        data: {
          total: totalResult?.total || 0,
          byCategory,
          byMonth
        }
      };
    } catch (error) {
      console.error('❌ Erreur stats dépenses:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== CATÉGORIES DE DÉPENSES ==========

  ipcMain.handle('expenseCategory:getAll', async () => {
    try {
      const categories = await query('SELECT * FROM expense_categories WHERE isActive = 1 ORDER BY name');
      return { success: true, data: categories };
    } catch (error) {
      console.error('❌ Erreur récupération catégories:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('expenseCategory:create', async (event, data) => {
    try {
      const id = uuidv4();
      await run(
        'INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)',
        [id, data.name, data.description]
      );
      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création catégorie:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Gestionnaire IPC pour l'inventaire / stock
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined ? null : val);
const toNumberOrNull = (val) => {
  if (val === '' || val === undefined || val === null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
};
const toIntOrDefault = (val, defaultVal = 0) => {
  if (val === '' || val === undefined || val === null) return defaultVal;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultVal : num;
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

function normalizeInventoryRequest(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return {
      category: '',
      lowStock: false,
      expiring: false,
      search: '',
      isActive: true,
      paginated: false,
      page: 1,
      pageSize: 20
    };
  }

  return {
    category: String(filters.category || '').trim(),
    lowStock: filters.lowStock === true,
    expiring: filters.expiring === true,
    search: String(filters.search || '').trim(),
    isActive: filters.isActive === undefined ? true : filters.isActive === true,
    paginated: filters.paginated === true || filters.page !== undefined || filters.pageSize !== undefined,
    page: toPositiveInt(filters.page, 1),
    pageSize: Math.min(100, toPositiveInt(filters.pageSize, 20))
  };
}

export function handleInventoryEvents() {
  // ========== INVENTAIRE ==========

  // Créer un article
  ipcMain.handle('inventory:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const quantity = toIntOrDefault(data.quantity, 0);

      await run(
        `INSERT INTO inventory
         (id, name, category, description, quantity, minQuantity, unit, purchasePrice, sellingPrice,
          supplier, supplierId, expirationDate, location, photoPath, notes, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          data.name,
          toNullIfEmpty(data.category) || 'Général',
          toNullIfEmpty(data.description),
          quantity,
          toIntOrDefault(data.minQuantity, 5),
          toNullIfEmpty(data.unit) || 'unité',
          toNumberOrNull(data.purchasePrice) || 0,
          toNumberOrNull(data.sellingPrice) || 0,
          toNullIfEmpty(data.supplier),
          toNullIfEmpty(data.supplierId),
          toNullIfEmpty(data.expirationDate),
          toNullIfEmpty(data.location),
          toNullIfEmpty(data.photoPath),
          toNullIfEmpty(data.notes),
          now,
          now
        ]
      );

      if (quantity > 0) {
        // Create a lot for traceability
        const lotId = uuidv4();
        await run(
          `INSERT INTO inventory_lots
           (id, inventoryId, supplierId, lotNumber, purchaseDate, expirationDate, initialQuantity, remainingQuantity, unitPrice, notes, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [lotId, id, toNullIfEmpty(data.supplierId), toNullIfEmpty(data.lotNumber) || 'INIT',
            now.slice(0, 10), toNullIfEmpty(data.expirationDate), quantity, quantity,
            toNumberOrNull(data.purchasePrice) || 0, 'Stock initial', now]
        );
        await run(
          `INSERT INTO inventory_movements
           (id, inventoryId, lotId, movementType, quantity, previousQuantity, newQuantity, reason, createdBy, createdAt)
           VALUES (?, ?, ?, 'in', ?, 0, ?, 'Stock initial', ?, ?)`,
          [uuidv4(), id, lotId, quantity, quantity, toNullIfEmpty(data.createdBy), now]
        );
      }

      return { success: true, id };
    } catch (error) {
      console.error('Erreur création article:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer tous les articles
  ipcMain.handle('inventory:getAll', async (event, filters = {}) => {
    try {
      const request = normalizeInventoryRequest(filters);
      let sql = `SELECT i.*, s.name as supplierName
                 FROM inventory i
                 LEFT JOIN suppliers s ON s.id = i.supplierId
                 WHERE 1=1`;
      const params = [];

      if (request.category) {
        sql += ' AND i.category = ?';
        params.push(request.category);
      }
      if (request.lowStock) {
        sql += ' AND i.quantity <= i.minQuantity';
      }
      if (request.expiring) {
        sql += " AND i.expirationDate IS NOT NULL AND i.expirationDate <= DATE('now', '+30 day')";
      }
      if (request.search) {
        const searchPattern = `%${request.search}%`;
        sql += ' AND (i.name LIKE ? OR i.category LIKE ? OR i.supplier LIKE ? OR i.location LIKE ? OR s.name LIKE ?)';
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }
      if (filters && filters.isActive !== undefined) {
        sql += ' AND i.isActive = ?';
        params.push(request.isActive ? 1 : 0);
      } else {
        sql += ' AND i.isActive = 1';
      }

      const orderByClause = ' ORDER BY i.name';

      if (!request.paginated) {
        const items = await query(`${sql}${orderByClause}`, params);
        return { success: true, data: items };
      }

      const totalRow = await queryOne(sql.replace('SELECT i.*, s.name as supplierName', 'SELECT COUNT(*) as total'), params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const items = await query(
        `${sql}${orderByClause} LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: items,
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error('Erreur récupération inventaire:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer un article par ID
  ipcMain.handle('inventory:getById', async (event, id) => {
    try {
      const item = await queryOne('SELECT * FROM inventory WHERE id = ?', [id]);
      return { success: true, data: item };
    } catch (error) {
      console.error('Erreur récupération article:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour un article
  ipcMain.handle('inventory:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE inventory
         SET name = ?, category = ?, description = ?, minQuantity = ?, unit = ?,
             purchasePrice = ?, sellingPrice = ?, supplier = ?, supplierId = ?,
             expirationDate = ?, location = ?, photoPath = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [
          data.name,
          data.category,
          data.description,
          data.minQuantity,
          data.unit,
          data.purchasePrice,
          data.sellingPrice,
          data.supplier,
          toNullIfEmpty(data.supplierId),
          data.expirationDate,
          data.location,
          toNullIfEmpty(data.photoPath),
          data.notes,
          now,
          id
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('Erreur mise à jour article:', error);
      return { success: false, error: error.message };
    }
  });

  // Ajuster le stock (entrée/sortie) — utilise les lots FEFO
  ipcMain.handle('inventory:adjustStock', async (event, inventoryId, quantity, movementType, reason = '', reference = '', createdBy = null) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const item = await queryOne('SELECT quantity, purchasePrice FROM inventory WHERE id = ?', [inventoryId]);
      if (!item) {
        return { success: false, error: 'Article non trouvé' };
      }

      const previousQuantity = item.quantity;
      let newQuantity;
      let lotId = null;

      if (movementType === 'in') {
        newQuantity = previousQuantity + quantity;
        // Créer un lot pour cette entrée manuelle
        lotId = uuidv4();
        await run(
          `INSERT INTO inventory_lots
           (id, inventoryId, lotNumber, purchaseDate, expirationDate, initialQuantity, remainingQuantity, unitPrice, notes, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [lotId, inventoryId, 'AJUST', now.slice(0, 10), null, quantity, quantity,
            item.purchasePrice || 0, reason || 'Ajustement stock', now]
        );
      } else if (movementType === 'out') {
        // Déduire selon FEFO
        const lots = await query(
          `SELECT * FROM inventory_lots
           WHERE inventoryId = ? AND remainingQuantity > 0 AND isActive = 1
           ORDER BY CASE WHEN expirationDate IS NULL THEN 1 ELSE 0 END, expirationDate ASC, createdAt ASC`,
          [inventoryId]
        );
        let remaining = quantity;
        let totalAvailable = (lots || []).reduce((sum, l) => sum + (l.remainingQuantity || 0), 0);
        if (totalAvailable < remaining) {
          return { success: false, error: 'Stock insuffisant' };
        }
        for (const lot of lots) {
          if (remaining <= 0) break;
          const fromLot = Math.min(remaining, lot.remainingQuantity);
          await run(
            `UPDATE inventory_lots SET remainingQuantity = remainingQuantity - ? WHERE id = ?`,
            [fromLot, lot.id]
          );
          remaining -= fromLot;
          if (!lotId) lotId = lot.id;
        }
        newQuantity = previousQuantity - quantity;
      } else {
        newQuantity = quantity;
      }

      await run(
        'UPDATE inventory SET quantity = ?, updatedAt = ? WHERE id = ?',
        [newQuantity, now, inventoryId]
      );

      await run(
        `INSERT INTO inventory_movements
         (id, inventoryId, lotId, movementType, quantity, previousQuantity, newQuantity, reason, reference, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), inventoryId, lotId, movementType, quantity, previousQuantity, newQuantity, reason, reference, createdBy, now]
      );

      return { success: true, newQuantity };
    } catch (error) {
      console.error('Erreur ajustement stock:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un article (soft delete)
  ipcMain.handle('inventory:delete', async (event, id) => {
    try {
      await run(
        'UPDATE inventory SET isActive = 0, updatedAt = ? WHERE id = ?',
        [moment().format('YYYY-MM-DD HH:mm:ss'), id]
      );
      return { success: true };
    } catch (error) {
      console.error('Erreur suppression article:', error);
      return { success: false, error: error.message };
    }
  });

  // Historique des mouvements
  ipcMain.handle('inventory:getMovements', async (event, inventoryId) => {
    try {
      const movements = await query(
        `SELECT m.*, i.name as itemName, u.fullName as userName
         FROM inventory_movements m
         LEFT JOIN inventory i ON m.inventoryId = i.id
         LEFT JOIN users u ON m.createdBy = u.id
         WHERE m.inventoryId = ?
         ORDER BY m.createdAt DESC`,
        [inventoryId]
      );
      return { success: true, data: movements };
    } catch (error) {
      console.error('Erreur récupération mouvements:', error);
      return { success: false, error: error.message };
    }
  });

  // Articles en stock bas
  ipcMain.handle('inventory:getLowStock', async () => {
    try {
      const items = await query(
        'SELECT * FROM inventory WHERE quantity <= minQuantity AND isActive = 1 ORDER BY name'
      );
      return { success: true, data: items };
    } catch (error) {
      console.error('Erreur récupération stock bas:', error);
      return { success: false, error: error.message };
    }
  });

  // Articles proches de l'expiration
  ipcMain.handle('inventory:getExpiringSoon', async (event, days = 30) => {
    try {
      const futureDate = moment().add(days, 'days').format('YYYY-MM-DD');
      const today = moment().format('YYYY-MM-DD');
      const items = await query(
        `SELECT * FROM inventory
         WHERE expirationDate IS NOT NULL
         AND expirationDate <= ?
         AND expirationDate >= ?
         AND isActive = 1
         ORDER BY expirationDate`,
        [futureDate, today]
      );
      return { success: true, data: items };
    } catch (error) {
      console.error('Erreur récupération articles expirants:', error);
      return { success: false, error: error.message };
    }
  });

  // Statistiques inventaire
  ipcMain.handle('inventory:getStats', async () => {
    try {
      const totalItems = await queryOne('SELECT COUNT(*) as count FROM inventory WHERE isActive = 1');
      const totalValue = await queryOne('SELECT SUM(quantity * purchasePrice) as value FROM inventory WHERE isActive = 1');
      const lowStockCount = await queryOne('SELECT COUNT(*) as count FROM inventory WHERE quantity <= minQuantity AND isActive = 1');

      const byCategory = await query(
        `SELECT category, COUNT(*) as count, SUM(quantity) as totalQuantity
         FROM inventory WHERE isActive = 1 GROUP BY category ORDER BY count DESC`
      );

      return {
        success: true,
        data: {
          totalItems: totalItems?.count || 0,
          totalValue: totalValue?.value || 0,
          lowStockCount: lowStockCount?.count || 0,
          byCategory
        }
      };
    } catch (error) {
      console.error('Erreur stats inventaire:', error);
      return { success: false, error: error.message };
    }
  });
}

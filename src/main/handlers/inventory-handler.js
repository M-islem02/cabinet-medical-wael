/**
 * Gestionnaire IPC pour l'inventaire / stock
 */

import { ipcMain } from 'electron';
import { query, run, queryOne, withTransaction } from '../database-unified.js';
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

function isAssistantInventoryUser() {
  return String(global.currentUser?.role || '').trim() === 'assistant';
}

function sanitizeInventoryItemForAssistant(item) {
  if (!item) return item;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    sellingPrice: item.sellingPrice,
    isActive: item.isActive
  };
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

async function tableExists(tableName) {
  try {
    const row = await queryOne('SELECT to_regclass(?) IS NOT NULL as exists', [tableName]);
    return row?.exists === true;
  } catch (_) {
    return false;
  }
}

export function handleInventoryEvents() {
  // ========== INVENTAIRE ==========

  // Créer un article
  ipcMain.handle('inventory:create', async (event, data) => {
    try {
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const quantity = toIntOrDefault(data.quantity, 0);
      const isPerishable = data.isPerishable === true;
      if (isPerishable && quantity > 0 && !data.expirationDate) {
        return { success: false, error: 'La date d’expiration est obligatoire pour le stock initial périssable' };
      }

      await run(
        `INSERT INTO inventory
         (id, name, category, description, quantity, minQuantity, unit, purchasePrice, sellingPrice,
          supplier, supplierId, expirationDate, location, photoPath, notes, isPerishable, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
          isPerishable,
          now,
          now
        ]
      );

      if (quantity > 0 && isPerishable) {
        // Perishable stock is tracked by an expiring lot.
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
      } else if (quantity > 0) {
        await run(
          `INSERT INTO inventory_movements
           (id, inventoryId, lotId, movementType, quantity, previousQuantity, newQuantity, reason, createdBy, createdAt)
           VALUES (?, ?, NULL, 'in', ?, 0, ?, 'Stock initial', ?, ?)`,
          [uuidv4(), id, quantity, quantity, toNullIfEmpty(data.createdBy), now]
        );
      }

      return { success: true, id };
      });
    } catch (error) {
      console.error('Erreur création article:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer tous les articles
  ipcMain.handle('inventory:getAll', async (event, filters = {}) => {
    try {
      const request = normalizeInventoryRequest(filters);
      const hasSuppliers = await tableExists('suppliers');
      let sql = hasSuppliers
        ? `SELECT i.*, s.name as supplierName
                 FROM inventory i
                 LEFT JOIN suppliers s ON s.id = i.supplierId
                 WHERE 1=1`
        : `SELECT i.*, i.supplier as supplierName
                 FROM inventory i
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
        sql += " AND i.expirationDate IS NOT NULL AND i.expirationDate <= CURRENT_DATE + INTERVAL '30 days'";
      }
      if (request.search) {
        const searchPattern = `%${request.search}%`;
        sql += hasSuppliers
          ? ' AND (i.name ILIKE ? OR i.category ILIKE ? OR i.supplier ILIKE ? OR i.location ILIKE ? OR s.name ILIKE ?)'
          : ' AND (i.name ILIKE ? OR i.category ILIKE ? OR i.supplier ILIKE ? OR i.location ILIKE ?)';
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        if (hasSuppliers) params.push(searchPattern);
      }
      if (filters && filters.isActive !== undefined) {
        sql += ' AND i.isActive = ?';
        params.push(Boolean(request.isActive));
      } else {
        sql += ' AND i.isActive = TRUE';
      }

      const orderByClause = ' ORDER BY i.name';

      if (!request.paginated) {
        const items = await query(`${sql}${orderByClause}`, params);
        return { success: true, data: isAssistantInventoryUser() ? (items || []).map(sanitizeInventoryItemForAssistant) : items };
      }

      const countSql = hasSuppliers
        ? sql.replace('SELECT i.*, s.name as supplierName', 'SELECT COUNT(*) as total')
        : sql.replace('SELECT i.*, i.supplier as supplierName', 'SELECT COUNT(*) as total');
      const totalRow = await queryOne(countSql, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const items = await query(
        `${sql}${orderByClause} LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      const responseItems = isAssistantInventoryUser()
        ? (items || []).map(sanitizeInventoryItemForAssistant)
        : items;
      return {
        success: true,
        data: responseItems,
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
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
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
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const current = await queryOne('SELECT * FROM inventory WHERE id = ? FOR UPDATE', [id]);
      if (!current) return { success: false, error: 'Article non trouvé' };
      const isPerishable = data.isPerishable === true;

      if (!current.isPerishable && isPerishable && Number(current.quantity || 0) > 0) {
        if (!data.expirationDate) {
          return { success: false, error: 'Indiquez une date d’expiration pour convertir le stock actuel en lot' };
        }
        await run(
          `INSERT INTO inventory_lots
           (id, inventoryId, supplierId, lotNumber, purchaseDate, expirationDate, initialQuantity, remainingQuantity, unitPrice, notes, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), id, toNullIfEmpty(data.supplierId), 'CONVERSION', now.slice(0, 10), data.expirationDate,
            current.quantity, current.quantity, toNumberOrNull(data.purchasePrice) || current.purchasePrice || 0,
            'Conversion en article périssable', now]
        );
      } else if (current.isPerishable && !isPerishable) {
        // Keep historical batches but stop using them for stock computation.
        await run('UPDATE inventory_lots SET isActive = FALSE, updatedAt = ? WHERE inventoryId = ? AND isActive = TRUE', [now, id]);
      }

      await run(
        `UPDATE inventory
         SET name = ?, category = ?, description = ?, minQuantity = ?, unit = ?,
             purchasePrice = ?, sellingPrice = ?, supplier = ?, supplierId = ?,
             expirationDate = ?, location = ?, photoPath = ?, notes = ?, isPerishable = ?, updatedAt = ?
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
          isPerishable,
          now,
          id
        ]
      );

      return { success: true };
      });
    } catch (error) {
      console.error('Erreur mise à jour article:', error);
      return { success: false, error: error.message };
    }
  });

  // Ajuster le stock (entrée/sortie) — utilise les lots FEFO
  ipcMain.handle('inventory:adjustStock', async (event, inventoryId, quantity, movementType, reason = '', reference = '', createdBy = null) => {
    try {
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const item = await queryOne('SELECT quantity, purchasePrice, isPerishable FROM inventory WHERE id = ? FOR UPDATE', [inventoryId]);
      if (!item) {
        return { success: false, error: 'Article non trouvé' };
      }

      const previousQuantity = item.quantity;
      let newQuantity;
      let lotId = null;

      if (movementType === 'in') {
        if (item.isPerishable) {
          return { success: false, error: 'Ajoutez un lot avec une date d’expiration pour cet article périssable' };
        }
        newQuantity = previousQuantity + quantity;
      } else if (movementType === 'out') {
        if (!item.isPerishable) {
          if (previousQuantity < quantity) return { success: false, error: 'Stock insuffisant' };
          newQuantity = previousQuantity - quantity;
        } else {
        // Déduire selon FEFO
        const lots = await query(
          `SELECT * FROM inventory_lots
           WHERE inventoryId = ? AND remainingQuantity > 0 AND isActive = TRUE
             AND expirationDate >= CURRENT_DATE
           ORDER BY CASE WHEN expirationDate IS NULL THEN 1 ELSE 0 END, expirationDate ASC, createdAt ASC
           FOR UPDATE`,
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
        }
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
      });
    } catch (error) {
      console.error('Erreur ajustement stock:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un article (soft delete)
  ipcMain.handle('inventory:delete', async (event, id) => {
    try {
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      await run(
        'UPDATE inventory SET isActive = FALSE, updatedAt = ? WHERE id = ?',
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
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
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
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      const items = await query(
        'SELECT * FROM inventory WHERE quantity <= minQuantity AND isActive = TRUE ORDER BY name'
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
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      const futureDate = moment().add(days, 'days').format('YYYY-MM-DD');
      const today = moment().format('YYYY-MM-DD');
      const items = await query(
        `SELECT * FROM inventory
         WHERE expirationDate IS NOT NULL
         AND expirationDate <= ?
         AND expirationDate >= ?
         AND isActive = TRUE
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
      if (isAssistantInventoryUser()) return { success: false, error: 'Accès refusé' };
      const totalItems = await queryOne('SELECT COUNT(*) as count FROM inventory WHERE isActive = TRUE');
      const totalValue = await queryOne('SELECT SUM(quantity * purchasePrice) as value FROM inventory WHERE isActive = TRUE');
      const lowStockCount = await queryOne('SELECT COUNT(*) as count FROM inventory WHERE quantity <= minQuantity AND isActive = TRUE');

      const byCategory = await query(
        `SELECT category, COUNT(*) as count, SUM(quantity) as totalQuantity
         FROM inventory WHERE isActive = TRUE GROUP BY category ORDER BY count DESC`
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

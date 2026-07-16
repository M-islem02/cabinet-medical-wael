/**
 * Gestionnaire IPC — Module Inventaire & Point de Vente (Sous-plan F)
 * Fournisseurs, lots FEFO, commandes, historique d'achats, POS.
 */

import { ipcMain } from 'electron';
import { query, queryOne, run, withTransaction, getCurrentMode } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

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

function getScopedInventoryContext() {
  const role = String(global.currentUser?.role || '').trim();
  const isSuperAdmin = !!global.currentUser?.isSuperAdmin;
  const isAdmin = !!global.currentUser?.isAdmin && !isSuperAdmin;
  return {
    userId: global.currentUser?.id || null,
    role,
    isSuperAdmin,
    isAdmin,
    isDoctorAdmin: (role === 'doctor' || role === 'dentist') && isAdmin,
    isPractitioner: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant',
    canSeePurchasePrices: isSuperAdmin || isAdmin,
    canManageSuppliers: isSuperAdmin || isAdmin,
    canManageLots: isSuperAdmin || isAdmin || role === 'doctor' || role === 'dentist',
    canSell: true
  };
}

function nowSql() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function dateOnlySql(value) {
  if (!value) return null;
  const d = moment(value);
  return d.isValid() ? d.format('YYYY-MM-DD') : null;
}

async function recalculateInventoryQuantity(inventoryId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(remainingQuantity), 0) as total FROM inventory_lots WHERE inventoryId = ? AND isActive = TRUE`,
    [inventoryId]
  );
  const total = toIntOrDefault(row?.total, 0);
  await run(
    `UPDATE inventory SET quantity = ?, updatedAt = ? WHERE id = ?`,
    [total, nowSql(), inventoryId]
  );
  return total;
}

async function getLotsFEFO(inventoryId, excludeExpired = true, lockRows = false) {
  const today = moment().format('YYYY-MM-DD');
  let sql = `SELECT * FROM inventory_lots WHERE inventoryId = ? AND remainingQuantity > 0 AND isActive = TRUE`;
  const params = [inventoryId];
  if (excludeExpired) {
    sql += ` AND (expirationDate IS NULL OR expirationDate >= ?)`;
    params.push(today);
  }
  sql += ` ORDER BY
    CASE WHEN expirationDate IS NULL THEN 1 ELSE 0 END,
    expirationDate ASC,
    purchaseDate ASC,
    createdAt ASC`;
  if (lockRows) sql += ` FOR UPDATE`;
  return query(sql, params);
}

async function deductFEFO(inventoryId, quantityRequested, meta = {}) {
  const lots = await getLotsFEFO(inventoryId, true, true);
  let remaining = toIntOrDefault(quantityRequested, 0);
  if (remaining <= 0) return { success: true, deductions: [] };

  const totalAvailable = lots.reduce((sum, l) => sum + (l.remainingQuantity || 0), 0);
  if (totalAvailable < remaining) {
    return { success: false, error: `Stock insuffisant (disponible ${totalAvailable})`, available: totalAvailable };
  }

  const deductions = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const fromLot = Math.min(remaining, lot.remainingQuantity);
    await run(
      `UPDATE inventory_lots SET remainingQuantity = remainingQuantity - ?, updatedAt = ? WHERE id = ?`,
      [fromLot, nowSql(), lot.id]
    );
    deductions.push({ lotId: lot.id, quantity: fromLot, unitPrice: lot.unitPrice });
    remaining -= fromLot;
  }

  const newQuantity = await recalculateInventoryQuantity(inventoryId);
  return { success: true, deductions, newQuantity };
}

async function recordMovement({ inventoryId, lotId, movementType, quantity, previousQuantity, newQuantity, reason, reference, createdBy, posSaleId, purchaseOrderId }) {
  await run(
    `INSERT INTO inventory_movements
     (id, inventoryId, lotId, movementType, quantity, previousQuantity, newQuantity, reason, reference, createdBy, posSaleId, purchaseOrderId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), inventoryId, lotId || null, movementType, quantity, previousQuantity, newQuantity, reason || null, reference || null, createdBy || null, posSaleId || null, purchaseOrderId || null, nowSql()]
  );
}

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────

export function handleInventoryModuleEvents() {
  // ── SUPPLIERS CRUD ────────────────────────────────────────────────────────
  ipcMain.handle('supplier:create', async (event, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageSuppliers) return { success: false, error: 'Accès refusé' };
      const id = uuidv4();
      await run(
        `INSERT INTO suppliers (id, name, contactName, phone, email, address, specialty, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.name, toNullIfEmpty(data.contactName), toNullIfEmpty(data.phone), toNullIfEmpty(data.email),
          toNullIfEmpty(data.address), toNullIfEmpty(data.specialty), toNullIfEmpty(data.notes), nowSql(), nowSql()]
      );
      return { success: true, id };
    } catch (error) {
      console.error('Erreur création fournisseur:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('supplier:getAll', async (event, filters = {}) => {
    try {
      let sql = `SELECT * FROM suppliers WHERE 1=1`;
      const params = [];
      if (filters.isActive !== undefined) {
        sql += ` AND isActive = ?`;
        params.push(Boolean(filters.isActive));
      } else {
        sql += ` AND isActive = TRUE`;
      }
      if (filters.search) {
        sql += ` AND (name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR specialty ILIKE ?)`;
        const p = `%${filters.search}%`;
        params.push(p, p, p, p);
      }
      sql += ` ORDER BY name`;
      const items = await query(sql, params);
      return { success: true, data: items || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('supplier:getById', async (event, id) => {
    try {
      const supplier = await queryOne(`SELECT * FROM suppliers WHERE id = ?`, [id]);
      if (!supplier) return { success: false, error: 'Fournisseur introuvable' };
      const purchases = await query(
        `SELECT l.*, i.name as itemName
         FROM inventory_lots l
         LEFT JOIN inventory i ON i.id = l.inventoryId
         WHERE l.supplierId = ?
         ORDER BY l.purchaseDate DESC`,
        [id]
      );
      const totalSpent = purchases.reduce((sum, p) => sum + ((p.initialQuantity || 0) * (p.unitPrice || 0)), 0);
      return { success: true, data: { ...supplier, purchases: purchases || [], totalSpent } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('supplier:update', async (event, id, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageSuppliers) return { success: false, error: 'Accès refusé' };
      await run(
        `UPDATE suppliers SET name = ?, contactName = ?, phone = ?, email = ?, address = ?, specialty = ?, notes = ?, updatedAt = ? WHERE id = ?`,
        [data.name, toNullIfEmpty(data.contactName), toNullIfEmpty(data.phone), toNullIfEmpty(data.email),
          toNullIfEmpty(data.address), toNullIfEmpty(data.specialty), toNullIfEmpty(data.notes), nowSql(), id]
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('supplier:delete', async (event, id) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageSuppliers) return { success: false, error: 'Accès refusé' };
      await run(`UPDATE suppliers SET isActive = FALSE, updatedAt = ? WHERE id = ?`, [nowSql(), id]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── LOTS / TRACABILITY ────────────────────────────────────────────────────
  ipcMain.handle('inventoryLot:create', async (event, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageLots) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const id = uuidv4();
      const initialQuantity = toIntOrDefault(data.initialQuantity, 0);
      const unitPrice = toNumberOrNull(data.unitPrice) || 0;
      const prev = await queryOne(`SELECT quantity FROM inventory WHERE id = ? FOR UPDATE`, [data.inventoryId]);
      if (!prev) throw new Error('Article introuvable');
      await run(
        `INSERT INTO inventory_lots (id, inventoryId, supplierId, lotNumber, purchaseDate, expirationDate, initialQuantity, remainingQuantity, unitPrice, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.inventoryId, toNullIfEmpty(data.supplierId), toNullIfEmpty(data.lotNumber),
          dateOnlySql(data.purchaseDate) || nowSql().slice(0, 10), dateOnlySql(data.expirationDate),
          initialQuantity, initialQuantity, unitPrice, toNullIfEmpty(data.notes), nowSql()]
      );
      const newQuantity = await recalculateInventoryQuantity(data.inventoryId);
      await recordMovement({
        inventoryId: data.inventoryId,
        lotId: id,
        movementType: 'in',
        quantity: initialQuantity,
        previousQuantity: prev?.quantity || 0,
        newQuantity,
        reason: `Réception lot ${data.lotNumber || id}`,
        reference: data.purchaseOrderId || null,
        createdBy: ctx.userId,
        purchaseOrderId: data.purchaseOrderId || null
      });
      return { success: true, id, newQuantity };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('inventoryLot:getByInventory', async (event, inventoryId, filters = {}) => {
    try {
      let sql = `SELECT l.*, s.name as supplierName FROM inventory_lots l LEFT JOIN suppliers s ON s.id = l.supplierId WHERE l.inventoryId = ?`;
      const params = [inventoryId];
      if (filters.activeOnly !== false) {
        sql += ` AND l.isActive = TRUE`;
      }
      sql += ` ORDER BY l.createdAt DESC`;
      const items = await query(sql, params);
      return { success: true, data: items || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('inventoryLot:getExpiringSoon', async (event, days = 30) => {
    try {
      const future = moment().add(days, 'days').format('YYYY-MM-DD');
      const today = moment().format('YYYY-MM-DD');
      const items = await query(
        `SELECT l.*, i.name as itemName, i.unit, s.name as supplierName
         FROM inventory_lots l
         JOIN inventory i ON i.id = l.inventoryId
         LEFT JOIN suppliers s ON s.id = l.supplierId
         WHERE l.expirationDate IS NOT NULL
           AND l.expirationDate <= ?
           AND l.expirationDate >= ?
           AND l.remainingQuantity > 0
           AND l.isActive = TRUE
         ORDER BY l.expirationDate`,
        [future, today]
      );
      return { success: true, data: items || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('inventoryLot:adjust', async (event, id, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageLots) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const lot = await queryOne(`SELECT * FROM inventory_lots WHERE id = ? FOR UPDATE`, [id]);
      if (!lot) return { success: false, error: 'Lot introuvable' };
      const newRemaining = toIntOrDefault(data.remainingQuantity, lot.remainingQuantity);
      await run(
        `UPDATE inventory_lots SET remainingQuantity = ?, notes = ?, updatedAt = ? WHERE id = ?`,
        [newRemaining, toNullIfEmpty(data.notes) || lot.notes, nowSql(), id]
      );
      const prev = await queryOne(`SELECT quantity FROM inventory WHERE id = ? FOR UPDATE`, [lot.inventoryId]);
      const newQuantity = await recalculateInventoryQuantity(lot.inventoryId);
      await recordMovement({
        inventoryId: lot.inventoryId,
        lotId: id,
        movementType: 'adjust',
        quantity: newRemaining - (lot.remainingQuantity || 0),
        previousQuantity: prev?.quantity || 0,
        newQuantity,
        reason: data.reason || 'Ajustement lot',
        createdBy: ctx.userId
      });
      return { success: true, newQuantity };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── INVENTORY EXTENDED STATS ──────────────────────────────────────────────
  ipcMain.handle('inventory:getFullStats', async () => {
    try {
      const totalItems = await queryOne(`SELECT COUNT(*) as count FROM inventory WHERE isActive = TRUE`);
      const lowStock = await queryOne(
        `SELECT COUNT(*) as count FROM inventory WHERE isActive = TRUE AND quantity <= minQuantity`
      );
      const valueRow = await queryOne(
        `SELECT COALESCE(SUM(l.remainingQuantity * l.unitPrice), 0) as value
         FROM inventory_lots l
         JOIN inventory i ON i.id = l.inventoryId
         WHERE i.isActive = TRUE AND l.isActive = TRUE`
      );
      const expiring = await query(
        `SELECT l.*, i.name as itemName, i.unit, s.name as supplierName
         FROM inventory_lots l
         JOIN inventory i ON i.id = l.inventoryId
         LEFT JOIN suppliers s ON s.id = l.supplierId
         WHERE l.expirationDate IS NOT NULL
           AND l.expirationDate <= CURRENT_DATE + INTERVAL '30 days'
           AND l.expirationDate >= CURRENT_DATE
           AND l.remainingQuantity > 0
           AND l.isActive = TRUE
         ORDER BY l.expirationDate`
      );
      return {
        success: true,
        data: {
          totalItems: totalItems?.count || 0,
          lowStockCount: lowStock?.count || 0,
          totalValue: valueRow?.value || 0,
          expiringCount: expiring?.length || 0,
          expiring: expiring || []
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── PURCHASE ORDERS ───────────────────────────────────────────────────────
  ipcMain.handle('purchaseOrder:create', async (event, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageSuppliers) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const id = uuidv4();
      const items = Array.isArray(data.items) ? data.items : [];
      const totalAmount = items.reduce((sum, it) => sum + (toIntOrDefault(it.orderedQuantity, 0) * (toNumberOrNull(it.unitPrice) || 0)), 0);
      await run(
        `INSERT INTO purchase_orders (id, supplierId, orderDate, expectedDeliveryDate, status, totalAmount, notes, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, toNullIfEmpty(data.supplierId), dateOnlySql(data.orderDate) || nowSql().slice(0, 10),
          dateOnlySql(data.expectedDeliveryDate), 'draft', totalAmount, toNullIfEmpty(data.notes),
          ctx.userId, nowSql(), nowSql()]
      );
      for (const it of items) {
        await run(
          `INSERT INTO purchase_order_items (id, purchaseOrderId, inventoryId, orderedQuantity, receivedQuantity, unitPrice, notes)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [uuidv4(), id, it.inventoryId, toIntOrDefault(it.orderedQuantity, 0), toNumberOrNull(it.unitPrice) || 0, toNullIfEmpty(it.notes)]
        );
      }
      return { success: true, id };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('purchaseOrder:getAll', async (event, filters = {}) => {
    try {
      let sql = `SELECT po.*, s.name as supplierName FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplierId WHERE 1=1`;
      const params = [];
      if (filters.status) { sql += ` AND po.status = ?`; params.push(filters.status); }
      if (filters.supplierId) { sql += ` AND po.supplierId = ?`; params.push(filters.supplierId); }
      sql += ` ORDER BY po.createdAt DESC`;
      const orders = await query(sql, params);
      const enriched = await Promise.all((orders || []).map(async (po) => {
        const items = await query(
          `SELECT poi.*, i.name as itemName, i.unit FROM purchase_order_items poi JOIN inventory i ON i.id = poi.inventoryId WHERE poi.purchaseOrderId = ?`,
          [po.id]
        );
        return { ...po, items: items || [] };
      }));
      return { success: true, data: enriched };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('purchaseOrder:update', async (event, id, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageSuppliers) return { success: false, error: 'Accès refusé' };
      const po = await queryOne(`SELECT * FROM purchase_orders WHERE id = ?`, [id]);
      if (!po) return { success: false, error: 'Commande introuvable' };
      await run(
        `UPDATE purchase_orders SET supplierId = ?, expectedDeliveryDate = ?, status = ?, notes = ?, updatedAt = ? WHERE id = ?`,
        [toNullIfEmpty(data.supplierId) || po.supplierId, dateOnlySql(data.expectedDeliveryDate) || po.expectedDeliveryDate,
          data.status || po.status, toNullIfEmpty(data.notes) || po.notes, nowSql(), id]
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('purchaseOrder:receive', async (event, id, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageLots) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      const po = await queryOne(`SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE`, [id]);
      if (!po) return { success: false, error: 'Commande introuvable' };
      const items = await query(`SELECT * FROM purchase_order_items WHERE purchaseOrderId = ? ORDER BY id FOR UPDATE`, [id]);
      const received = data.items || [];
      const invoiceNumber = toNullIfEmpty(data.invoiceNumber);
      const invoiceAmount = toNumberOrNull(data.invoiceAmount);

      for (const it of items) {
        const rcv = received.find(r => r.id === it.id) || {};
        const qty = toIntOrDefault(rcv.receivedQuantity, it.receivedQuantity || 0);
        const addQty = qty - (it.receivedQuantity || 0);
        if (addQty > 0) {
          const lotId = uuidv4();
          await run(
            `INSERT INTO inventory_lots (id, inventoryId, supplierId, lotNumber, purchaseDate, expirationDate, initialQuantity, remainingQuantity, unitPrice, notes, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [lotId, it.inventoryId, po.supplierId, `PO-${id.slice(-6)}`, nowSql().slice(0, 10),
              dateOnlySql(rcv.expirationDate), addQty, addQty, it.unitPrice || 0, `Réception commande ${id}`, nowSql()]
          );
          const prev = await queryOne(`SELECT quantity FROM inventory WHERE id = ? FOR UPDATE`, [it.inventoryId]);
          const newQuantity = await recalculateInventoryQuantity(it.inventoryId);
          await recordMovement({
            inventoryId: it.inventoryId,
            lotId,
            movementType: 'in',
            quantity: addQty,
            previousQuantity: prev?.quantity || 0,
            newQuantity,
            reason: `Réception commande ${id}`,
            reference: invoiceNumber || null,
            createdBy: ctx.userId,
            purchaseOrderId: id
          });
        }
        await run(
          `UPDATE purchase_order_items SET receivedQuantity = ?, notes = ? WHERE id = ?`,
          [qty, toNullIfEmpty(rcv.notes) || it.notes, it.id]
        );
      }

      const allItems = await query(`SELECT * FROM purchase_order_items WHERE purchaseOrderId = ?`, [id]);
      const fullyReceived = allItems.every(it => (it.receivedQuantity || 0) >= (it.orderedQuantity || 0));
      const newStatus = fullyReceived ? 'received' : 'partial';
      await run(
        `UPDATE purchase_orders SET status = ?, invoiceNumber = ?, invoiceAmount = ?, updatedAt = ? WHERE id = ?`,
        [newStatus, invoiceNumber || po.invoiceNumber, invoiceAmount !== null ? invoiceAmount : po.invoiceAmount, nowSql(), id]
      );
      return { success: true, status: newStatus };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('purchaseOrder:delete', async (event, id) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canManageSuppliers) return { success: false, error: 'Accès refusé' };
      return await withTransaction(async () => {
      await run(`DELETE FROM purchase_order_items WHERE purchaseOrderId = ?`, [id]);
      await run(`DELETE FROM purchase_orders WHERE id = ?`, [id]);
      return { success: true };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── PURCHASE HISTORY / REPORTS ────────────────────────────────────────────
  ipcMain.handle('inventory:getPurchaseHistory', async (event, filters = {}) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canSeePurchasePrices) return { success: false, error: 'Accès refusé' };
      let sql = `SELECT l.*, i.name as itemName, i.category, i.unit, s.name as supplierName
                 FROM inventory_lots l
                 JOIN inventory i ON i.id = l.inventoryId
                 LEFT JOIN suppliers s ON s.id = l.supplierId
                 WHERE 1=1`;
      const params = [];
      if (filters.supplierId) { sql += ` AND l.supplierId = ?`; params.push(filters.supplierId); }
      if (filters.category) { sql += ` AND i.category = ?`; params.push(filters.category); }
      if (filters.startDate) { sql += ` AND l.purchaseDate >= ?`; params.push(filters.startDate); }
      if (filters.endDate) { sql += ` AND l.purchaseDate <= ?`; params.push(filters.endDate); }
      sql += ` ORDER BY l.purchaseDate DESC`;
      const items = await query(sql, params);
      return { success: true, data: items || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('inventory:getPurchaseReports', async (event, filters = {}) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canSeePurchasePrices) return { success: false, error: 'Accès refusé' };
      const start = filters.startDate || '1970-01-01';
      const end = filters.endDate || '9999-12-31';
      const bySupplier = await query(
        `SELECT s.name as label, COALESCE(SUM(l.initialQuantity * l.unitPrice), 0) as total
         FROM inventory_lots l
         LEFT JOIN suppliers s ON s.id = l.supplierId
         WHERE l.purchaseDate BETWEEN ? AND ?
         GROUP BY l.supplierId, s.name
         ORDER BY total DESC`,
        [start, end]
      );
      const byCategory = await query(
        `SELECT i.category as label, COALESCE(SUM(l.initialQuantity * l.unitPrice), 0) as total
         FROM inventory_lots l
         JOIN inventory i ON i.id = l.inventoryId
         WHERE l.purchaseDate BETWEEN ? AND ?
         GROUP BY i.category
         ORDER BY total DESC`,
        [start, end]
      );
      const byMonth = await query(
        `SELECT TO_CHAR(l.purchaseDate, 'YYYY-MM') as label, COALESCE(SUM(l.initialQuantity * l.unitPrice), 0) as total
         FROM inventory_lots l
         WHERE l.purchaseDate BETWEEN ? AND ?
         GROUP BY 1
         ORDER BY label`,
        [start, end]
      );
      return { success: true, data: { bySupplier, byCategory, byMonth } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── PRICE COMPARISON ──────────────────────────────────────────────────────
  ipcMain.handle('inventory:getPriceComparison', async (event, inventoryId) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canSeePurchasePrices) return { success: false, error: 'Accès refusé' };
      const rows = await query(
        `SELECT l.unitPrice, l.purchaseDate, s.name as supplierName
         FROM inventory_lots l
         LEFT JOIN suppliers s ON s.id = l.supplierId
         WHERE l.inventoryId = ? AND l.unitPrice > 0
         ORDER BY l.purchaseDate DESC`,
        [inventoryId]
      );
      const cheapest = rows.length ? rows.reduce((min, r) => r.unitPrice < min.unitPrice ? r : min, rows[0]) : null;
      return { success: true, data: { history: rows || [], cheapest } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── ACT CONSUMABLES (F5) ──────────────────────────────────────────────────
  ipcMain.handle('actConsumable:getByActType', async (event, actType, specialty = 'dentistry') => {
    try {
      const rows = await query(
        `SELECT ac.*, i.name as itemName, i.unit
         FROM act_consumables ac
         JOIN inventory i ON i.id = ac.inventoryId
         WHERE ac.actType = ? AND ac.specialty = ? AND ac.isActive = TRUE`,
        [actType, specialty]
      );
      return { success: true, data: rows || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actConsumable:save', async (event, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.isPractitioner && !ctx.isAdmin && !ctx.isSuperAdmin) return { success: false, error: 'Accès refusé' };
      await run(
        `INSERT INTO act_consumables (id, actType, inventoryId, quantity, specialty, isActive, createdAt)
         VALUES (?, ?, ?, ?, ?, TRUE, ?)
         ON CONFLICT (actType, inventoryId, specialty)
         DO UPDATE SET quantity = EXCLUDED.quantity, isActive = TRUE`,
        [uuidv4(), data.actType, data.inventoryId, toNumberOrNull(data.quantity) || 1,
          data.specialty || 'dentistry', nowSql()]
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actConsumable:delete', async (event, id) => {
    try {
      await run(`DELETE FROM act_consumables WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('actConsumable:apply', async (event, actType, specialty = 'dentistry', meta = {}) => {
    try {
      const ctx = getScopedInventoryContext();
      return await withTransaction(async () => {
      const items = await query(
        `SELECT ac.*, i.name as itemName, i.quantity as currentStock
         FROM act_consumables ac
         JOIN inventory i ON i.id = ac.inventoryId
         WHERE ac.actType = ? AND ac.specialty = ? AND ac.isActive = TRUE`,
        [actType, specialty]
      );
      const results = [];
      for (const it of [...(items || [])].sort((left, right) => left.inventoryId.localeCompare(right.inventoryId))) {
        const qty = toIntOrDefault(it.quantity, 1);
        const check = await deductFEFO(it.inventoryId, qty);
        if (!check.success) {
          throw new Error(`${it.itemName}: ${check.error}`);
        }
        await recordMovement({
          inventoryId: it.inventoryId,
          movementType: 'out',
          quantity: qty,
          previousQuantity: check.newQuantity + qty,
          newQuantity: check.newQuantity,
          reason: `Consommation acte ${actType}`,
          reference: meta.reference || null,
          createdBy: ctx.userId
        });
        results.push({ inventoryId: it.inventoryId, itemName: it.itemName, quantity: qty, deductions: check.deductions });
      }
      return { success: true, data: results };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ── POINT OF SALE ─────────────────────────────────────────────────────────
  ipcMain.handle('pos:createSale', async (event, data) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canSell) return { success: false, error: 'Accès refusé' };
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return { success: false, error: 'Aucun article dans le panier' };
      return await withTransaction(async () => {

      // Validate stock and compute totals
      let subtotal = 0;
      const preparedItems = [];
      for (const it of [...items].sort((left, right) => String(left.inventoryId).localeCompare(String(right.inventoryId)))) {
        const article = await queryOne(`SELECT * FROM inventory WHERE id = ? FOR UPDATE`, [it.inventoryId]);
        if (!article) throw new Error('Article introuvable');
        const qty = toIntOrDefault(it.quantity, 1);
        const unitPrice = toNumberOrNull(it.unitPrice) || article.sellingPrice || 0;
        const check = await deductFEFO(article.id, qty);
        if (!check.success) {
          throw new Error(`${article.name}: ${check.error}`);
        }
        subtotal += qty * unitPrice;
        preparedItems.push({ ...it, article, qty, unitPrice, deductions: check.deductions });
      }

      const discountAmount = toNumberOrNull(data.discountAmount) || 0;
      const discountPercent = toNumberOrNull(data.discountPercent) || 0;
      let finalAmount = subtotal;
      if (discountPercent > 0) finalAmount -= (finalAmount * discountPercent / 100);
      finalAmount -= discountAmount;
      finalAmount = Math.max(0, finalAmount);

      const saleId = uuidv4();
      const paymentId = uuidv4();
      const patientId = toNullIfEmpty(data.patientId);
      const customerName = toNullIfEmpty(data.customerName);

      // Create financial payment record (reuses existing payments table)
      if (patientId) {
        await run(
          `INSERT INTO payments (id, patientId, amount, paymentDate, paymentMethod, description, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [paymentId, patientId, finalAmount, nowSql().slice(0, 10), data.paymentMethod || 'Espèces',
            'Vente produit (POS)', toNullIfEmpty(data.notes) || `Vente POS #${saleId.slice(-6)}`, nowSql(), nowSql()]
        );
      }

      await run(
        `INSERT INTO pos_sales (id, patientId, customerName, saleDate, totalAmount, discountAmount, discountPercent, finalAmount, paymentMethod, paymentId, notes, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, patientId, customerName, nowSql(), subtotal,
          discountAmount, discountPercent, finalAmount, data.paymentMethod || 'Espèces',
          patientId ? paymentId : null, toNullIfEmpty(data.notes), ctx.userId, nowSql()]
      );

      for (const it of preparedItems) {
        const totalPrice = it.qty * it.unitPrice;
        await run(
          `INSERT INTO pos_sale_items (id, posSaleId, inventoryId, lotId, quantity, unitPrice, purchasePrice, totalPrice)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), saleId, it.inventoryId, it.deductions?.[0]?.lotId || null, it.qty, it.unitPrice,
            it.deductions?.[0]?.unitPrice || it.article.purchasePrice || 0, totalPrice]
        );
        for (const d of it.deductions || []) {
          await recordMovement({
            inventoryId: it.inventoryId,
            lotId: d.lotId,
            movementType: 'sale',
            quantity: d.quantity,
            previousQuantity: (it.article.quantity || 0) + d.quantity,
            newQuantity: it.article.quantity || 0,
            reason: `Vente POS #${saleId.slice(-6)}`,
            reference: saleId,
            createdBy: ctx.userId,
            posSaleId: saleId
          });
        }
      }

      return { success: true, id: saleId, finalAmount };
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pos:getSales', async (event, filters = {}) => {
    try {
      const ctx = getScopedInventoryContext();
      let sql = `SELECT ps.*, p.firstName, p.lastName FROM pos_sales ps LEFT JOIN patients p ON p.id = ps.patientId WHERE 1=1`;
      const params = [];
      if (filters.startDate) { sql += ` AND CAST(ps.saleDate AS DATE) >= ?`; params.push(filters.startDate); }
      if (filters.endDate) { sql += ` AND CAST(ps.saleDate AS DATE) <= ?`; params.push(filters.endDate); }
      if (filters.patientId) { sql += ` AND ps.patientId = ?`; params.push(filters.patientId); }
      if (ctx.isAssistant) {
        sql += ` AND CAST(ps.saleDate AS DATE) = CURRENT_DATE`;
      }
      sql += ` ORDER BY ps.saleDate DESC`;
      const sales = await query(sql, params);
      const enriched = await Promise.all((sales || []).map(async (sale) => {
        const items = await query(
          `SELECT psi.*, i.name as itemName FROM pos_sale_items psi JOIN inventory i ON i.id = psi.inventoryId WHERE psi.posSaleId = ?`,
          [sale.id]
        );
        return { ...sale, items: items || [] };
      }));
      return { success: true, data: enriched };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pos:getSaleById', async (event, id) => {
    try {
      const sale = await queryOne(
        `SELECT ps.*, p.firstName, p.lastName FROM pos_sales ps LEFT JOIN patients p ON p.id = ps.patientId WHERE ps.id = ?`,
        [id]
      );
      if (!sale) return { success: false, error: 'Vente introuvable' };
      const items = await query(
        `SELECT psi.*, i.name as itemName FROM pos_sale_items psi JOIN inventory i ON i.id = psi.inventoryId WHERE psi.posSaleId = ?`,
        [id]
      );
      return { success: true, data: { ...sale, items: items || [] } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pos:getSalesReports', async (event, filters = {}) => {
    try {
      const ctx = getScopedInventoryContext();
      if (!ctx.canSeePurchasePrices) return { success: false, error: 'Accès refusé' };
      const start = filters.startDate || '1970-01-01';
      const end = filters.endDate || '9999-12-31';
      const period = filters.period || 'day'; // day, week, month
      let periodExpr;
      if (period === 'month') periodExpr = `TO_CHAR(ps.saleDate, 'YYYY-MM')`;
      else if (period === 'week') periodExpr = `TO_CHAR(ps.saleDate, 'IYYY-"W"IW')`;
      else periodExpr = `CAST(ps.saleDate AS DATE)`;

      const byPeriod = await query(
        `SELECT ${periodExpr} as label, COALESCE(SUM(ps.finalAmount), 0) as total, COUNT(*) as count
         FROM pos_sales ps
         WHERE CAST(ps.saleDate AS DATE) BETWEEN ? AND ?
         GROUP BY 1
         ORDER BY label`,
        [start, end]
      );
      const topItems = await query(
        `SELECT psi.inventoryId, i.name as label, SUM(psi.quantity) as qty, SUM(psi.totalPrice) as revenue,
                SUM(psi.quantity * psi.purchasePrice) as cost
         FROM pos_sale_items psi
         JOIN pos_sales ps ON ps.id = psi.posSaleId
         JOIN inventory i ON i.id = psi.inventoryId
         WHERE CAST(ps.saleDate AS DATE) BETWEEN ? AND ?
         GROUP BY psi.inventoryId, i.name
         ORDER BY qty DESC
         LIMIT 20`,
        [start, end]
      );
      const marginByItem = (topItems || []).map(it => ({
        ...it,
        margin: (it.revenue || 0) - (it.cost || 0)
      }));
      return { success: true, data: { byPeriod: byPeriod || [], topItems: marginByItem } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  console.log('Inventory module events registered');
}

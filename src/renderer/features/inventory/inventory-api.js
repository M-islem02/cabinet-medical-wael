import { invokeLegacyApi } from '../../core/api/api-client.js';
import { eventBus } from '../../core/state/event-bus.js';

const call = (name, operation) => invokeLegacyApi(`inventory.${name}`, operation);
const write = async (name, operation) => {
  const response = await call(name, operation);
  if (response?.success !== false) eventBus.emit('inventory:changed', { operation: name });
  return response;
};

export const inventoryApi = Object.freeze({
  getAll: (filters) => call('getAll', () => window.api.inventory.getAll(filters)),
  getFullStats: () => call('getFullStats', () => window.api.inventory.getFullStats()),
  create: (data) => write('create', () => window.api.inventory.create(data)),
  update: (id, data) => write('update', () => window.api.inventory.update(id, data)),
  delete: (id) => write('delete', () => window.api.inventory.delete(id)),
  adjustStock: (id, quantity, type, reason) => write('adjustStock', () => window.api.inventory.adjustStock(id, quantity, type, reason)),
  getPurchaseHistory: (filters) => call('getPurchaseHistory', () => window.api.inventory.getPurchaseHistory(filters)),
  getPurchaseReports: (filters) => call('getPurchaseReports', () => window.api.inventory.getPurchaseReports(filters)),
  getSuppliers: (filters) => call('suppliers.getAll', () => window.api.supplier.getAll(filters)),
  getSupplier: (id) => call('suppliers.getById', () => window.api.supplier.getById(id)),
  createSupplier: (data) => write('suppliers.create', () => window.api.supplier.create(data)),
  updateSupplier: (id, data) => write('suppliers.update', () => window.api.supplier.update(id, data)),
  deleteSupplier: (id) => write('suppliers.delete', () => window.api.supplier.delete(id)),
  getLots: (inventoryId, filters) => call('lots.getByInventory', () => window.api.inventoryLot.getByInventory(inventoryId, filters)),
  createLot: (data) => write('lots.create', () => window.api.inventoryLot.create(data)),
  adjustLot: (id, data) => write('lots.adjust', () => window.api.inventoryLot.adjust(id, data)),
  getPurchaseOrders: (filters) => call('orders.getAll', () => window.api.purchaseOrder.getAll(filters)),
  createPurchaseOrder: (data) => write('orders.create', () => window.api.purchaseOrder.create(data)),
  receivePurchaseOrder: (id, data) => write('orders.receive', () => window.api.purchaseOrder.receive(id, data)),
  deletePurchaseOrder: (id) => write('orders.delete', () => window.api.purchaseOrder.delete(id)),
  createSale: (data) => write('pos.createSale', () => window.api.pos.createSale(data)),
  getSales: (filters) => call('pos.getSales', () => window.api.pos.getSales(filters)),
  getSale: (id) => call('pos.getSaleById', () => window.api.pos.getSaleById(id)),
  getPatients: (filters) => call('patients.getAll', () => window.api.patient.getAll(filters)),
  printHtml: (payload) => call('print.html', () => window.api.print.html(payload))
});

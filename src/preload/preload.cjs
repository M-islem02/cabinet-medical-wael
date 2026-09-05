/**
 * Préload script - Expose les API IPC de manière sécurisée
 */

const { contextBridge, ipcRenderer } = require('electron');
const { buildPreloadModules } = require('../shared/ipc-contracts.cjs');
const contractApi = buildPreloadModules(ipcRenderer);

contextBridge.exposeInMainWorld('api', {
  // API de Licence
  license: {
    validate: (licenseKey) => ipcRenderer.invoke('license:validate', licenseKey),
    activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
    deactivate: (licenseKey) => ipcRenderer.invoke('license:deactivate', licenseKey),
    chooseFile: () => ipcRenderer.invoke('license:choose-file'),
    generateKeys: (payload) => ipcRenderer.invoke('license:generate-keys', payload),
    generateClientToken: (payload) => ipcRenderer.invoke('license:generateClientToken', payload),
    saveToFile: (payload) => ipcRenderer.invoke('license:saveToFile', payload),
    activated: () => ipcRenderer.invoke('license:activated'),
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
    getMachineId: () => ipcRenderer.invoke('license:get-machine-id'),
    showLicenseWindow: () => ipcRenderer.invoke('license:showLicenseWindow')
  },

  // API Utilisateur (Login + Administration)
  user: {
    create: (data) => ipcRenderer.invoke('user:create', data),
    login: (credentials) => ipcRenderer.invoke('user:login', credentials),
    loginSuccess: (userData) => ipcRenderer.invoke('user:loginSuccess', userData),
    logout: () => ipcRenderer.invoke('user:logout'),
    showLoginWindow: () => ipcRenderer.invoke('user:showLoginWindow'),
    getAll: (payload) => ipcRenderer.invoke('user:getAll', payload),
    getById: (data) => ipcRenderer.invoke('user:getById', data),
    add: (userData) => ipcRenderer.invoke('user:add', userData),
    update: (data) => ipcRenderer.invoke('user:update', data),
    delete: (data) => ipcRenderer.invoke('user:delete', data),
    changePassword: (data) => ipcRenderer.invoke('user:changePassword', data),
    managerResetPassword: (data) => ipcRenderer.invoke('user:managerResetPassword', data),
    toggleActive: (data) => ipcRenderer.invoke('user:toggleActive', data),
    exists: () => ipcRenderer.invoke('user:exists'),
    onUserData: (callback) => ipcRenderer.on('user-data', (event, data) => callback(data))
  },

  document: {
    save: (data) => ipcRenderer.invoke('document:save', data),
    getByType: (params) => ipcRenderer.invoke('document:getByType', params),
    listByConsultation: (consultationId) => ipcRenderer.invoke('document:listByConsultation', consultationId),
    listByPatient: (payload) => ipcRenderer.invoke('document:listByPatient', payload),
    getById: (documentId) => ipcRenderer.invoke('document:getById', documentId),
    delete: (documentId) => ipcRenderer.invoke('document:delete', documentId)
  },

  // API Setup Initial
  setup: {
    completed: () => ipcRenderer.invoke('setup:completed')
  },

  // API Patients
  patient: {
    create: (data) => ipcRenderer.invoke('patient:create', data),
    getAll: (payload) => ipcRenderer.invoke('patient:getAll', payload),
    getCount: (payload) => ipcRenderer.invoke('patient:getCount', payload),
    getScope: (payload) => ipcRenderer.invoke('patient:getScope', payload),
    getDirectory: (payload) => ipcRenderer.invoke('patient:getDirectory', payload),
    attach: (payload) => ipcRenderer.invoke('patient:attach', payload),
    detach: (payload) => ipcRenderer.invoke('patient:detach', payload),
    getById: (id) => ipcRenderer.invoke('patient:getById', id),
    search: (term) => ipcRenderer.invoke('patient:search', term),
    update: (id, data) => ipcRenderer.invoke('patient:update', id, data),
    delete: (id) => ipcRenderer.invoke('patient:delete', id),
    getMedecins: (patientId) => ipcRenderer.invoke('patient:getMedecins', patientId),
    assignMedecin: (payload) => ipcRenderer.invoke('patient:assignMedecin', payload),
    unassignMedecin: (payload) => ipcRenderer.invoke('patient:unassignMedecin', payload)
  },

  // API Consultations
  consultation: {
    create: (data) => ipcRenderer.invoke('consultation:create', data),
    getByPatient: (payload) => ipcRenderer.invoke('consultation:getByPatient', payload),
    getById: (id) => ipcRenderer.invoke('consultation:getById', id),
    update: (id, data) => ipcRenderer.invoke('consultation:update', id, data),
    delete: (id) => ipcRenderer.invoke('consultation:delete', id)
  },

  // API Ordonnances
  prescription: {
    create: (data) => ipcRenderer.invoke('prescription:create', data),
    getByPatient: (payload) => ipcRenderer.invoke('prescription:getByPatient', payload),
    getByConsultation: (consultationId) => ipcRenderer.invoke('prescription:getByConsultation', consultationId),
    getById: (id) => ipcRenderer.invoke('prescription:getById', id),
    update: (id, data) => ipcRenderer.invoke('prescription:update', id, data),
    delete: (id) => ipcRenderer.invoke('prescription:delete', id),
    getMedicationsHistory: () => ipcRenderer.invoke('prescription:getMedicationsHistory')
  },

  // API Arrêts de travail
  sickleave: {
    create: (data) => ipcRenderer.invoke('sickleave:create', data),
    getByPatient: (payload) => ipcRenderer.invoke('sickleave:getByPatient', payload),
    getByConsultation: (consultationId) => ipcRenderer.invoke('sickleave:getByConsultation', consultationId),
    getById: (id) => ipcRenderer.invoke('sickleave:getById', id),
    update: (id, data) => ipcRenderer.invoke('sickleave:update', id, data),
    delete: (id) => ipcRenderer.invoke('sickleave:delete', id)
  },

  // API Actes personnalisés (Actes Réalisés)
  customActs: {
    list: () => ipcRenderer.invoke('customacts:list'),
    upsert: (payload) => ipcRenderer.invoke('customacts:upsert', payload),
    remove: (id) => ipcRenderer.invoke('customacts:delete', id)
  },

  // API Rendez-vous
  appointment: {
    create: (data) => ipcRenderer.invoke('appointment:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('appointment:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('appointment:getById', id),
    getAll: () => ipcRenderer.invoke('appointment:getAll'),
    getToday: () => ipcRenderer.invoke('appointment:getToday'),
    getByDateRange: (startDate, endDate) => ipcRenderer.invoke('appointment:getByDateRange', startDate, endDate),
    update: (id, data) => ipcRenderer.invoke('appointment:update', id, data),
    delete: (id) => ipcRenderer.invoke('appointment:delete', id),
    checkConflict: (date, time, excludeId) => ipcRenderer.invoke('appointment:checkConflict', date, time, excludeId)
  },

  // API Paiements
  payment: {
    create: (data) => ipcRenderer.invoke('payment:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('payment:getByPatient', patientId),
    getByConsultation: (consultationId) => ipcRenderer.invoke('payment:getByConsultation', consultationId),
    getById: (id) => ipcRenderer.invoke('payment:getById', id),
    getAll: (filters) => ipcRenderer.invoke('payment:getAll', filters),
    getTotalIncome: () => ipcRenderer.invoke('payment:getTotalIncome'),
    getIncomeByPeriod: (period, startDate, endDate) => ipcRenderer.invoke('payment:getIncomeByPeriod', { period, startDate, endDate }),
    update: (id, data) => ipcRenderer.invoke('payment:update', id, data),
    delete: (id) => ipcRenderer.invoke('payment:delete', id)
  },

  // API Paramètres
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    chooseAppLogo: () => ipcRenderer.invoke('settings:chooseAppLogo'),
    claimPracticeAdmin: () => ipcRenderer.invoke('settings:claimPracticeAdmin'),
    save: (data) => ipcRenderer.invoke('settings:save', data),
    update: (data) => ipcRenderer.invoke('settings:update', data),
    listPrinters: () => ipcRenderer.invoke('settings:listPrinters'),
    listScanners: () => ipcRenderer.invoke('settings:listScanners'),
    getDisplayInfo: () => ipcRenderer.invoke('settings:getDisplayInfo')
  },

  // API Fichiers
  file: {
    save: (filename, content) => ipcRenderer.invoke('file:save', { filename, content }),
    saveAttachment: (fileData) => ipcRenderer.invoke('file:saveAttachment', fileData),
    pickAttachments: () => ipcRenderer.invoke('file:pickAttachments'),
    pickImagingAttachments: () => ipcRenderer.invoke('file:pickImagingAttachments'),
    pickImagingFolder: () => ipcRenderer.invoke('file:pickImagingFolder'),
    selectFolder: () => ipcRenderer.invoke('file:selectFolder'),
    listRadioExportFiles: (customPath) => ipcRenderer.invoke('file:listRadioExportFiles', customPath),
    importRadioFiles: (payload) => ipcRenderer.invoke('file:importRadioFiles', payload),
    openAttachment: (filePath) => ipcRenderer.invoke('file:openAttachment', filePath),
    readAsDataURL: (filePath) => ipcRenderer.invoke('file:readAsDataURL', filePath),
    listScanners: () => ipcRenderer.invoke('file:listScanners'),
    scanDocument: (options) => ipcRenderer.invoke('file:scanDocument', options)
  },

  patientAttachment: {
    createBatch: (payload) => ipcRenderer.invoke('patientAttachment:createBatch', payload),
    getByPatient: (patientId) => ipcRenderer.invoke('patientAttachment:getByPatient', patientId),
    delete: (attachmentId) => ipcRenderer.invoke('patientAttachment:delete', attachmentId)
  },

  // API PDF
  pdf: {
    generateInvoice: (data) => ipcRenderer.invoke('pdf:generate-invoice', data),
    generateReport: (data) => ipcRenderer.invoke('pdf:generate-report', data),
    generateCertificate: (data) => ipcRenderer.invoke('pdf:generate-certificate', data)
  },

  print: {
    html: (payload) => ipcRenderer.invoke('print:html', payload),
    savePdf: (payload) => ipcRenderer.invoke('print:save-pdf', payload)
  },

  appZoom: {
    get: () => ipcRenderer.invoke('appZoom:get'),
    set: (value) => ipcRenderer.invoke('appZoom:set', value),
    reset: () => ipcRenderer.invoke('appZoom:reset')
  },

  dialog: {
    open: (options) => ipcRenderer.invoke('dialog:open', options)
  },

  app: {
    getDisplayInfo: () => ipcRenderer.invoke('app:getDisplayInfo')
  },

  // API System
  system: {
    openFile: (filePath) => ipcRenderer.invoke('system:openFile', filePath),
    downloadFile: (filePath, fileName) => ipcRenderer.invoke('system:downloadFile', { filePath, fileName }),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url)
  },

  realtime: {
    getConfig: () => ipcRenderer.invoke('realtime:get-config')
  },

  // ========== NOUVELLES APIs ==========

  // API Dépenses
  expense: {
    create: (data) => ipcRenderer.invoke('expense:create', data),
    getAll: (filters) => ipcRenderer.invoke('expense:getAll', filters),
    getById: (id) => ipcRenderer.invoke('expense:getById', id),
    update: (id, data) => ipcRenderer.invoke('expense:update', id, data),
    delete: (id) => ipcRenderer.invoke('expense:delete', id),
    getStats: (filters) => ipcRenderer.invoke('expense:getStats', filters)
  },

  // API Catégories de dépenses
  expenseCategory: {
    getAll: () => ipcRenderer.invoke('expenseCategory:getAll'),
    create: (data) => ipcRenderer.invoke('expenseCategory:create', data)
  },

  // API Inventaire
  inventory: {
    create: (data) => ipcRenderer.invoke('inventory:create', data),
    getAll: (filters) => ipcRenderer.invoke('inventory:getAll', filters),
    getById: (id) => ipcRenderer.invoke('inventory:getById', id),
    update: (id, data) => ipcRenderer.invoke('inventory:update', id, data),
    adjustStock: (id, quantity, type, reason) => ipcRenderer.invoke('inventory:adjustStock', id, quantity, type, reason),
    delete: (id) => ipcRenderer.invoke('inventory:delete', id),
    getMovements: (id) => ipcRenderer.invoke('inventory:getMovements', id),
    getLowStock: () => ipcRenderer.invoke('inventory:getLowStock'),
    getExpiringSoon: (days) => ipcRenderer.invoke('inventory:getExpiringSoon', days),
    getStats: () => ipcRenderer.invoke('inventory:getStats'),
    getFullStats: () => ipcRenderer.invoke('inventory:getFullStats'),
    getPurchaseHistory: (filters) => ipcRenderer.invoke('inventory:getPurchaseHistory', filters),
    getPurchaseReports: (filters) => ipcRenderer.invoke('inventory:getPurchaseReports', filters),
    getPriceComparison: (inventoryId) => ipcRenderer.invoke('inventory:getPriceComparison', inventoryId)
  },

  supplier: {
    create: (data) => ipcRenderer.invoke('supplier:create', data),
    getAll: (filters) => ipcRenderer.invoke('supplier:getAll', filters),
    getById: (id) => ipcRenderer.invoke('supplier:getById', id),
    update: (id, data) => ipcRenderer.invoke('supplier:update', id, data),
    delete: (id) => ipcRenderer.invoke('supplier:delete', id)
  },

  inventoryLot: {
    create: (data) => ipcRenderer.invoke('inventoryLot:create', data),
    getByInventory: (inventoryId, filters) => ipcRenderer.invoke('inventoryLot:getByInventory', inventoryId, filters),
    getExpiringSoon: (days) => ipcRenderer.invoke('inventoryLot:getExpiringSoon', days),
    adjust: (id, data) => ipcRenderer.invoke('inventoryLot:adjust', id, data)
  },

  purchaseOrder: {
    create: (data) => ipcRenderer.invoke('purchaseOrder:create', data),
    getAll: (filters) => ipcRenderer.invoke('purchaseOrder:getAll', filters),
    update: (id, data) => ipcRenderer.invoke('purchaseOrder:update', id, data),
    receive: (id, data) => ipcRenderer.invoke('purchaseOrder:receive', id, data),
    delete: (id) => ipcRenderer.invoke('purchaseOrder:delete', id)
  },

  actConsumable: {
    getByActType: (actType, specialty) => ipcRenderer.invoke('actConsumable:getByActType', actType, specialty),
    save: (data) => ipcRenderer.invoke('actConsumable:save', data),
    delete: (id) => ipcRenderer.invoke('actConsumable:delete', id),
    apply: (actType, specialty, meta) => ipcRenderer.invoke('actConsumable:apply', actType, specialty, meta)
  },

  pos: {
    createSale: (data) => ipcRenderer.invoke('pos:createSale', data),
    getSales: (filters) => ipcRenderer.invoke('pos:getSales', filters),
    getSaleById: (id) => ipcRenderer.invoke('pos:getSaleById', id),
    updateSale: (id, data) => ipcRenderer.invoke('pos:updateSale', id, data),
    finalizeSale: (id) => ipcRenderer.invoke('pos:finalizeSale', id),
    returnSale: (id, reason) => ipcRenderer.invoke('pos:returnSale', id, reason),
    getSalesReports: (filters) => ipcRenderer.invoke('pos:getSalesReports', filters)
  },

  equipment: {
    getCategories: () => ipcRenderer.invoke('equipment:getCategories'),
    create: (data) => ipcRenderer.invoke('equipment:create', data),
    getAll: (filters) => ipcRenderer.invoke('equipment:getAll', filters),
    getById: (id) => ipcRenderer.invoke('equipment:getById', id),
    update: (id, data) => ipcRenderer.invoke('equipment:update', id, data),
    delete: (id) => ipcRenderer.invoke('equipment:delete', id),
    addMaintenance: (data) => ipcRenderer.invoke('equipment:addMaintenance', data),
    getAlerts: (days) => ipcRenderer.invoke('equipment:getAlerts', days),
    requestMaintenance: (id, reason) => ipcRenderer.invoke('equipment:requestMaintenance', id, reason),
    clearMaintenanceRequest: (id) => ipcRenderer.invoke('equipment:clearMaintenanceRequest', id),
    linkToPlan: (data) => ipcRenderer.invoke('equipment:linkToPlan', data),
    getForConsultation: (consultationId) => ipcRenderer.invoke('equipment:getForConsultation', consultationId),
    syncConsultation: (consultationId, equipmentIds) => ipcRenderer.invoke('equipment:syncConsultation', consultationId, equipmentIds)
  },

  // API Opérations & Interventions (Module Transversal)
  operation: {
    create: (data) => ipcRenderer.invoke('operation:create', data),
    getAll: (filters) => ipcRenderer.invoke('operation:getAll', filters),
    getByPatient: (patientId) => ipcRenderer.invoke('operation:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('operation:getById', id),
    update: (id, data) => ipcRenderer.invoke('operation:update', id, data),
    delete: (id) => ipcRenderer.invoke('operation:delete', id),
    getTypesCatalog: (specialty) => ipcRenderer.invoke('operation:getTypesCatalog', specialty),
    saveTypeCatalog: (data) => ipcRenderer.invoke('operation:saveTypeCatalog', data),
    deleteTypeCatalog: (id) => ipcRenderer.invoke('operation:deleteTypeCatalog', id),
    checkStockAvailability: (consumables) => ipcRenderer.invoke('operation:checkStockAvailability', consumables),
    recordPayment: (data) => ipcRenderer.invoke('operation:recordPayment', data),
    getStats: (filters) => ipcRenderer.invoke('operation:getStats', filters)
  },

  // API Analyses médicales
  analysis: {
    create: (data) => ipcRenderer.invoke('analysis:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('analysis:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('analysis:getById', id),
    update: (id, data) => ipcRenderer.invoke('analysis:update', id, data),
    complete: (id, results) => ipcRenderer.invoke('analysis:complete', id, results),
    delete: (id) => ipcRenderer.invoke('analysis:delete', id),
    getPending: () => ipcRenderer.invoke('analysis:getPending')
  },

  // API Types d'analyses
  analysisType: {
    getAll: () => ipcRenderer.invoke('analysisType:getAll'),
    create: (data) => ipcRenderer.invoke('analysisType:create', data),
    update: (id, data) => ipcRenderer.invoke('analysisType:update', id, data),
    delete: (id) => ipcRenderer.invoke('analysisType:delete', id)
  },

  // API Dettes
  debt: {
    create: (data) => ipcRenderer.invoke('debt:create', data),
    getAll: (filters) => ipcRenderer.invoke('debt:getAll', filters),
    getByPatient: (patientId) => ipcRenderer.invoke('debt:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('debt:getById', id),
    makePayment: (id, amount) => ipcRenderer.invoke('debt:makePayment', id, amount),
    update: (id, data) => ipcRenderer.invoke('debt:update', id, data),
    delete: (id) => ipcRenderer.invoke('debt:delete', id),
    getStats: (filters) => ipcRenderer.invoke('debt:getStats', filters),
    getOverdue: () => ipcRenderer.invoke('debt:getOverdue')
  },

  // API Modèles d'ordonnances
  prescriptionTemplate: {
    create: (data) => ipcRenderer.invoke('prescriptionTemplate:create', data),
    getAll: () => ipcRenderer.invoke('prescriptionTemplate:getAll'),
    getById: (id) => ipcRenderer.invoke('prescriptionTemplate:getById', id),
    use: (id) => ipcRenderer.invoke('prescriptionTemplate:use', id),
    update: (id, data) => ipcRenderer.invoke('prescriptionTemplate:update', id, data),
    delete: (id) => ipcRenderer.invoke('prescriptionTemplate:delete', id)
  },

  // API Médicaments
  medication: {
    create: (data) => ipcRenderer.invoke('medication:create', data),
    addToSpecialtyJson: (payload) => ipcRenderer.invoke('medication:add-to-specialty-json', payload),
    getAll: () => ipcRenderer.invoke('medication:getAll'),
    search: (term) => ipcRenderer.invoke('medication:search', term),
    searchSpecialtyJson: (payload) => ipcRenderer.invoke('medication:search-specialty-json', payload),
    getById: (id) => ipcRenderer.invoke('medication:getById', id),
    incrementUsage: (name) => ipcRenderer.invoke('medication:incrementUsage', name),
    update: (id, data) => ipcRenderer.invoke('medication:update', id, data),
    delete: (id) => ipcRenderer.invoke('medication:delete', id),
    getCategories: () => ipcRenderer.invoke('medication:getCategories')
  },

  // API Notifications
  notification: {
    create: (data) => ipcRenderer.invoke('notification:create', data),
    getByUser: (userId) => ipcRenderer.invoke('notification:getByUser', userId),
    getUnread: (userId) => ipcRenderer.invoke('notification:getUnread', userId),
    markAsRead: (id) => ipcRenderer.invoke('notification:markAsRead', id),
    markAllAsRead: (userId) => ipcRenderer.invoke('notification:markAllAsRead', userId),
    delete: (id) => ipcRenderer.invoke('notification:delete', id),
    getTodayAppointments: () => ipcRenderer.invoke('notification:getTodayAppointments')
  },

  // API Examens Cliniques
  clinicalExam: contractApi.clinicalExam,



  // API Progression Patient
  patientProgress: contractApi.patientProgress,

  // API Équipements Patient
  patientEquipment: contractApi.patientEquipment,

  // API Rééducation (wrapper)
  // ========== API DENTISTERIE ==========
  dental: {
    getRecord: (patientId) => ipcRenderer.invoke('dental:getRecord', patientId),
    saveRecord: (data) => ipcRenderer.invoke('dental:saveRecord', data),
    getTeeth: (patientId) => ipcRenderer.invoke('dental:getTeeth', patientId),
    getSchemaAtDate: (patientId, date) => ipcRenderer.invoke('dental:getSchemaAtDate', patientId, date),
    saveTooth: (data) => ipcRenderer.invoke('dental:saveTooth', data),
    saveMultipleTeeth: (patientId, teeth) => ipcRenderer.invoke('dental:saveMultipleTeeth', patientId, teeth),
    getTreatmentsByPatient: (patientId) => ipcRenderer.invoke('dental:getTreatmentsByPatient', patientId),
    createTreatment: (data) => ipcRenderer.invoke('dental:createTreatment', data),
    getTreatments: (patientId) => ipcRenderer.invoke('dental:getTreatments', patientId),
    getAllTreatments: (filters) => ipcRenderer.invoke('dental:getAllTreatments', filters),
    updateTreatment: (id, data) => ipcRenderer.invoke('dental:updateTreatment', id, data),
    deleteTreatment: (id) => ipcRenderer.invoke('dental:deleteTreatment', id),
    createPlan: (data) => ipcRenderer.invoke('dental:createPlan', data),
    getPlans: (patientId) => ipcRenderer.invoke('dental:getPlans', patientId),
    updatePlan: (id, data) => ipcRenderer.invoke('dental:updatePlan', id, data),
    deletePlan: (id) => ipcRenderer.invoke('dental:deletePlan', id),
    createXray: (data) => ipcRenderer.invoke('dental:createXray', data),
    getXrays: (patientId) => ipcRenderer.invoke('dental:getXrays', patientId),
    deleteXray: (id) => ipcRenderer.invoke('dental:deleteXray', id),
    getStats: (patientId) => ipcRenderer.invoke('dental:getStats', patientId),
    getToothHistory: (patientId, toothNumber) => ipcRenderer.invoke('dental:getToothHistory', patientId, toothNumber)
  },

  // ========== API PLANS DE TRAITEMENT ==========
  plans: contractApi.plans,

  // ========== API SMS ==========
  sms: {
    getConfig: () => ipcRenderer.invoke('sms:getConfig'),
    saveConfig: (config) => ipcRenderer.invoke('sms:saveConfig', config),
    listPorts: () => ipcRenderer.invoke('sms:listPorts'),
    sendTest: (phone, message) => ipcRenderer.invoke('sms:sendTest', phone, message),
    send: (phone, message) => ipcRenderer.invoke('sms:send', phone, message),
    getLog: (limit) => ipcRenderer.invoke('sms:getLog', limit),
    getReminders: (limit) => ipcRenderer.invoke('sms:getReminders', limit),
    checkReminders: () => ipcRenderer.invoke('sms:checkReminders')
  },

  // ========== API CLOUD SYNC ==========
  cloudSync: {
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    saveConfig: (config) => ipcRenderer.invoke('sync:saveConfig', config),
    syncNow: () => ipcRenderer.invoke('sync:now'),
    testTelegram: () => ipcRenderer.invoke('sync:testTelegram'),
    createBackup: () => ipcRenderer.invoke('sync:createBackup'),
    listBackups: () => ipcRenderer.invoke('sync:listBackups'),
    restore: (filePath) => ipcRenderer.invoke('sync:restore', filePath),
    exportBundle: () => ipcRenderer.invoke('sync:exportBundle'),
    export: () => ipcRenderer.invoke('sync:export'),
    checkOnline: () => ipcRenderer.invoke('sync:checkOnline'),
    getLog: (limit) => ipcRenderer.invoke('sync:getLog', limit),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    getStorageInfo: () => ipcRenderer.invoke('sync:getStorageInfo')
  },

  publicBooking: {
    getStatus: () => ipcRenderer.invoke('publicBooking:getStatus'),
    getShareData: () => ipcRenderer.invoke('publicBooking:getShareData'),
    refresh: () => ipcRenderer.invoke('publicBooking:refresh')
  },

  // ========== API SALLE D'ATTENTE ==========
  waitingRoom: {
    add: (data) => ipcRenderer.invoke('waiting-room:add', data),
    getToday: () => ipcRenderer.invoke('waiting-room:get-today'),
    updateStatus: (id, status) => ipcRenderer.invoke('waiting-room:update-status', id, status),
    togglePriority: (id) => ipcRenderer.invoke('waiting-room:toggle-priority', id),
    delete: (id) => ipcRenderer.invoke('waiting-room:delete', id)
  },



  // ========== API RÉSUMÉ JOURNALIER ==========
  dailySummary: {
    get: (date) => ipcRenderer.invoke('daily-summary:get', date)
  },

  // ========== API NOTIFICATIONS ==========
  notifications: {
    create: (data) => ipcRenderer.invoke('notifications:create', data),
    getUnread: (userId) => ipcRenderer.invoke('notifications:get-unread', userId),
    markRead: (id) => ipcRenderer.invoke('notifications:mark-read', id)
  },

  // ========== API PAYMENT REQUESTS (Doctor -> Assistant) ==========
  paymentRequest: {
    create: (data) => ipcRenderer.invoke('payment-request:create', data),
    getPending: () => ipcRenderer.invoke('payment-request:get-pending'),
    complete: (id) => ipcRenderer.invoke('payment-request:complete', id),
    dismiss: (id) => ipcRenderer.invoke('payment-request:dismiss', id)
  },

  // ========== API CONSULTATIONS PAR DATE ==========
  consultations: {
    getByDate: (date) => ipcRenderer.invoke('consultations:get-by-date', date)
  },

  // ========== API PATIENTS (alias) ==========
  patients: {
    getAll: () => ipcRenderer.invoke('patient:getAll')
  },

  // ========== API PAYMENTS PAR DATE ==========
  payments: {
    getByDate: (date) => ipcRenderer.invoke('payments:get-by-date', date)
  },

  // ========== API PACKAGE CONFIGURATION ==========
  package: {
    getConfig: () => ipcRenderer.invoke('package:get-config'),
    getSpecialtyConfig: () => ipcRenderer.invoke('package:get-specialty-config'),
    getLoadedBases: () => ipcRenderer.invoke('package:get-loaded-bases'),
    refreshSpecialtyBase: (specialtyKey) => ipcRenderer.invoke('package:refresh-specialty-base', specialtyKey),
    exportMedicationsJson: (specialtyKey) => ipcRenderer.invoke('package:export-medications-json', specialtyKey),
    getDefinitions: () => ipcRenderer.invoke('package:get-definitions'),
    saveConfig: (config) => ipcRenderer.invoke('package:save-config', config),
    checkFeature: (featureName) => ipcRenderer.invoke('package:check-feature', featureName),
    checkUserLimit: (role) => ipcRenderer.invoke('package:check-user-limit', role),
    isConfigured: () => ipcRenderer.invoke('package:is-configured'),
    showConfigWindow: () => ipcRenderer.invoke('package:show-config-window')
  },

  // ========== API DEV/TEST ==========
  dev: {
    seedTestData: () => ipcRenderer.invoke('dev:seed-test-data'),
    ensureDemoData: () => ipcRenderer.invoke('dev:ensure-demo-data'),
    clearAllData: () => ipcRenderer.invoke('dev:clear-all-data')
  },

  dashboard: {
    getQuickStats: () => ipcRenderer.invoke('dashboard:getQuickStats')
  },

  statistics: contractApi.statistics,

  // ========== API CONFIGURATION BASE DE DONNÉES ==========
  dbConfig: {
    get: () => ipcRenderer.invoke('dbConfig:get'),
    getStatus: () => ipcRenderer.invoke('dbConfig:getStatus'),
    save: (config) => ipcRenderer.invoke('dbConfig:save', config),
    testConnection: (config) => ipcRenderer.invoke('dbConfig:testConnection', config),
    restart: () => ipcRenderer.invoke('dbConfig:restart'),
    cancel: () => ipcRenderer.invoke('dbConfig:cancel'),
    showWindow: () => ipcRenderer.invoke('dbConfig:showWindow')
  },

  // Listeners pour événements du main process
  onLicenseWarning: (callback) => ipcRenderer.on('license-warning', (event, data) => callback(data))
});

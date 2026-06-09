/**
 * Préload script - Expose les API IPC de manière sécurisée
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // API de Licence
  license: {
    validate: (licenseKey) => ipcRenderer.invoke('license:validate', licenseKey),
    activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
    deactivate: (licenseKey) => ipcRenderer.invoke('license:deactivate', licenseKey),
    activated: () => ipcRenderer.invoke('license:activated'),
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
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
    getCount: () => ipcRenderer.invoke('patient:getCount'),
    getById: (id) => ipcRenderer.invoke('patient:getById', id),
    search: (term) => ipcRenderer.invoke('patient:search', term),
    update: (id, data) => ipcRenderer.invoke('patient:update', id, data),
    delete: (id) => ipcRenderer.invoke('patient:delete', id)
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
    save: (data) => ipcRenderer.invoke('settings:save', data),
    update: (data) => ipcRenderer.invoke('settings:update', data),
    listPrinters: () => ipcRenderer.invoke('settings:listPrinters'),
    listScanners: () => ipcRenderer.invoke('settings:listScanners')
  },

  // API Fichiers
  file: {
    save: (filename, content) => ipcRenderer.invoke('file:save', { filename, content }),
    saveAttachment: (fileData) => ipcRenderer.invoke('file:saveAttachment', fileData),
    pickAttachments: () => ipcRenderer.invoke('file:pickAttachments'),
    pickImagingAttachments: () => ipcRenderer.invoke('file:pickImagingAttachments'),
    pickImagingFolder: () => ipcRenderer.invoke('file:pickImagingFolder'),
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
    html: (payload) => ipcRenderer.invoke('print:html', payload)
  },

  dialog: {
    open: (options) => ipcRenderer.invoke('dialog:open', options)
  },

  // API System
  system: {
    openFile: (filePath) => ipcRenderer.invoke('system:openFile', filePath),
    downloadFile: (filePath, fileName) => ipcRenderer.invoke('system:downloadFile', { filePath, fileName }),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url)
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
    getStats: () => ipcRenderer.invoke('inventory:getStats')
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
    getAll: () => ipcRenderer.invoke('medication:getAll'),
    search: (term) => ipcRenderer.invoke('medication:search', term),
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

  // API Plans de traitement
  treatmentPlan: {
    create: (data) => ipcRenderer.invoke('treatmentPlan:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('treatmentPlan:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('treatmentPlan:getById', id),
    update: (id, data) => ipcRenderer.invoke('treatmentPlan:update', id, data),
    delete: (id) => ipcRenderer.invoke('treatmentPlan:delete', id),
    getActive: () => ipcRenderer.invoke('treatmentPlan:getActive')
  },

  // API Séances de traitement
  treatmentSession: {
    complete: (id, notes) => ipcRenderer.invoke('treatmentSession:complete', id, notes),
    cancel: (id, reason) => ipcRenderer.invoke('treatmentSession:cancel', id, reason),
    getUpcoming: (days) => ipcRenderer.invoke('treatmentSession:getUpcoming', days)
  },

  // ========== API RÉÉDUCATION MPR ==========
  
  // API Bilans Fonctionnels
  functionalEvaluation: {
    create: (data) => ipcRenderer.invoke('functionalEvaluation:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('functionalEvaluation:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('functionalEvaluation:getById', id),
    update: (id, data) => ipcRenderer.invoke('functionalEvaluation:update', id, data),
    delete: (id) => ipcRenderer.invoke('functionalEvaluation:delete', id),
    getLatest: (patientId) => ipcRenderer.invoke('functionalEvaluation:getLatest', patientId)
  },

  // API Examens Cliniques
  clinicalExam: {
    create: (data) => ipcRenderer.invoke('clinicalExam:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('clinicalExam:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('clinicalExam:getById', id),
    update: (id, data) => ipcRenderer.invoke('clinicalExam:update', id, data),
    delete: (id) => ipcRenderer.invoke('clinicalExam:delete', id)
  },

  // API Échelles Médicales
  medicalScale: {
    getAll: () => ipcRenderer.invoke('medicalScale:getAll'),
    getByCategory: (category) => ipcRenderer.invoke('medicalScale:getByCategory', category),
    saveScore: (data) => ipcRenderer.invoke('medicalScale:saveScore', data),
    getPatientScores: (patientId) => ipcRenderer.invoke('medicalScale:getPatientScores', patientId),
    getScoreHistory: (patientId, scaleType) => ipcRenderer.invoke('medicalScale:getScoreHistory', patientId, scaleType)
  },

  // API Plans de Rééducation
  rehabilitationPlan: {
    create: (data) => ipcRenderer.invoke('rehabilitationPlan:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('rehabilitationPlan:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('rehabilitationPlan:getById', id),
    getActive: (patientId) => ipcRenderer.invoke('rehabilitationPlan:getActive', patientId),
    update: (id, data) => ipcRenderer.invoke('rehabilitationPlan:update', id, data),
    updateStatus: (id, status) => ipcRenderer.invoke('rehabilitationPlan:updateStatus', id, status),
    delete: (id) => ipcRenderer.invoke('rehabilitationPlan:delete', id)
  },

  // API Séances de Rééducation
  rehabilitationSession: {
    create: (data) => ipcRenderer.invoke('rehabilitationSession:create', data),
    getByPlan: (planId) => ipcRenderer.invoke('rehabilitationSession:getByPlan', planId),
    getByPatient: (patientId) => ipcRenderer.invoke('rehabilitationSession:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('rehabilitationSession:getById', id),
    complete: (id, data) => ipcRenderer.invoke('rehabilitationSession:complete', id, data),
    cancel: (id, reason) => ipcRenderer.invoke('rehabilitationSession:cancel', id, reason),
    getByTherapist: (therapistId) => ipcRenderer.invoke('rehabilitationSession:getByTherapist', therapistId),
    getTodaySessions: () => ipcRenderer.invoke('rehabilitationSession:getTodaySessions')
  },

  // API Progression Patient
  patientProgress: {
    create: (data) => ipcRenderer.invoke('patientProgress:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('patientProgress:getByPatient', patientId),
    getLatest: (patientId) => ipcRenderer.invoke('patientProgress:getLatest', patientId),
    getEvolution: (patientId, startDate, endDate) => ipcRenderer.invoke('patientProgress:getEvolution', { patientId, startDate, endDate })
  },

  // API Équipements Patient
  patientEquipment: {
    create: (data) => ipcRenderer.invoke('patientEquipment:create', data),
    getByPatient: (patientId) => ipcRenderer.invoke('patientEquipment:getByPatient', patientId),
    getById: (id) => ipcRenderer.invoke('patientEquipment:getById', id),
    update: (id, data) => ipcRenderer.invoke('patientEquipment:update', id, data),
    delete: (id) => ipcRenderer.invoke('patientEquipment:delete', id)
  },

  // API Rééducation (wrapper)
  rehabilitation: {
    // Evaluations
    saveEvaluation: (data) => ipcRenderer.invoke('functionalEvaluation:create', data),
    getEvaluations: (patientId) => ipcRenderer.invoke('functionalEvaluation:getByPatient', patientId),
    // Plans
    savePlan: (data) => ipcRenderer.invoke('rehabilitationPlan:create', data),
    getPlans: (patientId) => ipcRenderer.invoke('rehabilitationPlan:getByPatient', patientId),
    // Scales
    getScales: () => ipcRenderer.invoke('medicalScale:getAll')
  },

  // ========== API DENTISTERIE ==========
  dental: {
    getRecord: (patientId) => ipcRenderer.invoke('dental:getRecord', patientId),
    saveRecord: (data) => ipcRenderer.invoke('dental:saveRecord', data),
    getTeeth: (patientId) => ipcRenderer.invoke('dental:getTeeth', patientId),
    saveTooth: (data) => ipcRenderer.invoke('dental:saveTooth', data),
    saveMultipleTeeth: (patientId, teeth) => ipcRenderer.invoke('dental:saveMultipleTeeth', patientId, teeth),
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
    delete: (id) => ipcRenderer.invoke('waiting-room:delete', id)
  },

  // ========== API KINÉ STAFF ==========
  kineStaff: {
    getAll: () => ipcRenderer.invoke('kine-staff:get-all'),
    create: (data) => ipcRenderer.invoke('kine-staff:create', data),
    update: (id, data) => ipcRenderer.invoke('kine-staff:update', id, data),
    delete: (id) => ipcRenderer.invoke('kine-staff:delete', id),
    getSessions: (kineId) => ipcRenderer.invoke('kine-staff:get-sessions', kineId),
    getStats: () => ipcRenderer.invoke('kine-staff:get-stats'),
    getDailySummary: (date) => ipcRenderer.invoke('kine-staff:get-daily-summary', date)
  },

  // ========== API KINÉ SESSIONS ==========
  kineSession: {
    create: (data) => ipcRenderer.invoke('kine-session:create', data),
    updatePayment: (sessionId, status) => ipcRenderer.invoke('kine-session:update-payment', sessionId, status)
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
    getDefinitions: () => ipcRenderer.invoke('package:get-definitions'),
    saveConfig: (config) => ipcRenderer.invoke('package:save-config', config),
    checkFeature: (featureName) => ipcRenderer.invoke('package:check-feature', featureName),
    checkUserLimit: (role) => ipcRenderer.invoke('package:check-user-limit', role),
    isConfigured: () => ipcRenderer.invoke('package:is-configured'),
    showConfigWindow: () => ipcRenderer.invoke('package:show-config-window')
  },

  // ========== API INTELLIGENCE ARTIFICIELLE (Ollama) ==========
  ai: {
    checkStatus: () => ipcRenderer.invoke('ai:check-status'),
    generateReport: (data) => ipcRenderer.invoke('ai:generate-report', data),
    chat: (data) => ipcRenderer.invoke('ai:chat', data),
    generateConclusion: (consultationData) => ipcRenderer.invoke('ai:generate-conclusion', consultationData)
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

  statistics: {
    getOverview: () => ipcRenderer.invoke('statistics:getOverview'),
    getTopLists: () => ipcRenderer.invoke('statistics:getTopLists'),
    getDoctorsLeaderboard: () => ipcRenderer.invoke('statistics:getDoctorsLeaderboard')
  },

  // ========== API CONFIGURATION BASE DE DONNÉES ==========
  dbConfig: {
    get: () => ipcRenderer.invoke('dbConfig:get'),
    save: (config) => ipcRenderer.invoke('dbConfig:save', config),
    testConnection: (config) => ipcRenderer.invoke('dbConfig:testConnection', config),
    restart: () => ipcRenderer.invoke('dbConfig:restart'),
    cancel: () => ipcRenderer.invoke('dbConfig:cancel'),
    showWindow: () => ipcRenderer.invoke('dbConfig:showWindow')
  },

  // Listeners pour événements du main process
  onLicenseWarning: (callback) => ipcRenderer.on('license-warning', (event, data) => callback(data))
});

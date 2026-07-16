'use strict';

const id = (name, optional = false) => ({ name, type: 'id', optional });
const object = (name, required = [], optional = false) => ({ name, type: 'object', required, optional });
const string = (name, optional = false) => ({ name, type: 'string', optional });
const array = (name, optional = false) => ({ name, type: 'array', optional });
const enumeration = (name, values) => ({ name, type: 'enum', values });

const IPC_CONTRACTS = Object.freeze({
  clinicalExam: {
    create: { channel: 'clinicalExam:create', params: [object('data', ['patientId'])] },
    getByPatient: { channel: 'clinicalExam:getByPatient', params: [id('patientId')] },
    getById: { channel: 'clinicalExam:getById', params: [id('id')] },
    update: { channel: 'clinicalExam:update', params: [id('id'), object('data')] },
    delete: { channel: 'clinicalExam:delete', params: [id('id')] }
  },
  rehabilitationPlan: {
    create: { channel: 'rehabilitationPlan:create', params: [object('data', ['patientId', 'startDate'])] },
    getByPatient: { channel: 'rehabilitationPlan:getByPatient', params: [id('patientId')] },
    getById: { channel: 'rehabilitationPlan:getById', params: [id('id')] },
    getActive: { channel: 'rehabilitationPlan:getActive', params: [id('patientId')] },
    update: { channel: 'rehabilitationPlan:update', params: [id('id'), object('data')] },
    updateStatus: {
      channel: 'rehabilitationPlan:updateStatus',
      params: [id('id'), enumeration('status', ['active', 'completed', 'cancelled', 'archived'])]
    },
    delete: { channel: 'rehabilitationPlan:delete', params: [id('id')] }
  },
  rehabilitationSession: {
    create: { channel: 'rehabilitationSession:create', params: [object('data', ['patientId', 'planId', 'date'])] },
    getByPlan: { channel: 'rehabilitationSession:getByPlan', params: [id('planId')] },
    getByPatient: { channel: 'rehabilitationSession:getByPatient', params: [id('patientId')] },
    getById: { channel: 'rehabilitationSession:getById', params: [id('id')] },
    complete: { channel: 'rehabilitationSession:complete', params: [id('id'), object('data', [], true)] },
    cancel: { channel: 'rehabilitationSession:cancel', params: [id('id'), string('reason', true)] },
    getByTherapist: { channel: 'rehabilitationSession:getByTherapist', params: [id('therapistId')] },
    getTodaySessions: { channel: 'rehabilitationSession:getTodaySessions', params: [] }
  },
  patientProgress: {
    create: { channel: 'patientProgress:create', params: [object('data', ['patientId'])] },
    getByPatient: { channel: 'patientProgress:getByPatient', params: [id('patientId')] },
    getLatest: { channel: 'patientProgress:getLatest', params: [id('patientId')] },
    getEvolution: {
      channel: 'patientProgress:getEvolution',
      params: [id('patientId'), string('startDate', true), string('endDate', true)]
    }
  },
  patientEquipment: {
    create: {
      channel: 'patientEquipment:create',
      params: [object('data', ['patientId', 'equipmentType', 'equipmentName'])]
    },
    getByPatient: { channel: 'patientEquipment:getByPatient', params: [id('patientId')] },
    getById: { channel: 'patientEquipment:getById', params: [id('id')] },
    update: { channel: 'patientEquipment:update', params: [id('id'), object('data')] },
    delete: { channel: 'patientEquipment:delete', params: [id('id')] }
  },
  statistics: {
    getAdvancedOverview: {
      channel: 'statistics:getAdvancedOverview',
      params: [object('filters', [], true)]
    },
    getOverview: { channel: 'statistics:getOverview', params: [] },
    getTopLists: { channel: 'statistics:getTopLists', params: [] },
    getDoctorsLeaderboard: { channel: 'statistics:getDoctorsLeaderboard', params: [] }
  },
  plans: {
    create: { channel: 'plans:create', params: [object('data', ['patientId', 'title'])] },
    getAll: { channel: 'plans:getAll', params: [object('filters', [], true)] },
    getByPatient: { channel: 'plans:getByPatient', params: [id('patientId')] },
    getById: { channel: 'plans:getById', params: [id('id')] },
    update: { channel: 'plans:update', params: [id('id'), object('data')] },
    archive: { channel: 'plans:archive', params: [id('id')] },
    delete: { channel: 'plans:delete', params: [id('id')] },
    addPaymentSession: { channel: 'plans:addPaymentSession', params: [object('data', ['planId'])] },
    updateSessionPayment: { channel: 'plans:updateSessionPayment', params: [object('data', ['planId', 'sessionId'])] },
    getSessions: { channel: 'plans:getSessions', params: [id('planId')] },
    updateSessions: { channel: 'plans:updateSessions', params: [id('planId'), array('sessions')] },
    recalculate: { channel: 'plans:recalculate', params: [id('planId')] },
    requestPayment: { channel: 'plans:requestPayment', params: [object('data', ['planId'])] },
    getPendingBalances: { channel: 'plans:getPendingBalances', params: [] },
    getOrCreateDefault: { channel: 'plans:getOrCreateDefault', params: [object('data', ['patientId'])] },
    getFinancialStats: { channel: 'plans:getFinancialStats', params: [object('filters', [], true)] },
    updateSessionStatus: {
      channel: 'plans:updateSessionStatus',
      params: [id('sessionId'), enumeration('status', ['pending', 'paid', 'cancelled'])]
    }
  }
});

function buildPreloadModules(ipcRenderer) {
  const modules = {};
  for (const [namespace, methods] of Object.entries(IPC_CONTRACTS)) {
    modules[namespace] = {};
    for (const [methodName, definition] of Object.entries(methods)) {
      modules[namespace][methodName] = (...args) => {
        const validation = validateContractArgs(definition, args);
        if (!validation.valid) {
          return Promise.resolve({ success: false, error: validation.error });
        }
        return ipcRenderer.invoke(definition.channel, ...args);
      };
    }
  }
  return modules;
}

function validateContractArgs(definition, args) {
  const params = definition.params || [];
  for (let index = 0; index < params.length; index += 1) {
    const rule = params[index];
    const value = args[index];
    if ((value === undefined || value === null || value === '') && rule.optional) continue;

    let valid = true;
    if (rule.type === 'id' || rule.type === 'string') {
      valid = typeof value === 'string' && value.trim().length > 0;
    } else if (rule.type === 'object') {
      valid = !!value && typeof value === 'object' && !Array.isArray(value);
      if (valid) valid = (rule.required || []).every((field) => value[field] !== undefined && value[field] !== null && value[field] !== '');
    } else if (rule.type === 'array') {
      valid = Array.isArray(value);
    } else if (rule.type === 'enum') {
      valid = rule.values.includes(value);
    }

    if (!valid) {
      return {
        valid: false,
        error: {
          code: 'INVALID_ARGUMENT',
          message: `Invalid argument: ${rule.name}`,
          field: rule.name
        }
      };
    }
  }
  return { valid: true };
}

function getContract(namespace, methodName) {
  return IPC_CONTRACTS[namespace]?.[methodName] || null;
}

module.exports = { IPC_CONTRACTS, buildPreloadModules, getContract, validateContractArgs };

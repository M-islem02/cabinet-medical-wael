import { invokeLegacyApi } from '../../core/api/api-client.js';

const call = (name, operation) => invokeLegacyApi(`patients.${name}`, operation);

export const patientApi = Object.freeze({
  getAll(filters = {}) { return call('getAll', () => window.api.patient.getAll(filters)); },
  getScope(filters = {}) { return call('getScope', () => window.api.patient.getScope(filters)); },
  getDirectory(filters = {}) { return call('getDirectory', () => window.api.patient.getDirectory(filters)); },
  attach(data) { return call('attach', () => window.api.patient.attach(data)); },
  detach(data) { return call('detach', () => window.api.patient.detach(data)); },
  getById(id) { return call('getById', () => window.api.patient.getById(id)); },
  search(term) { return call('search', () => window.api.patient.search(term)); },
  create(data) { return call('create', () => window.api.patient.create(data)); },
  update(id, data) { return call('update', () => window.api.patient.update(id, data)); },
  delete(id) { return call('delete', () => window.api.patient.delete(id)); },
  getAppointments(patientId) { return call('appointments.getByPatient', () => window.api.appointment.getByPatient(patientId)); },
  getUsers(filters = {}) { return call('users.getAll', () => window.api.user.getAll(filters)); }
});

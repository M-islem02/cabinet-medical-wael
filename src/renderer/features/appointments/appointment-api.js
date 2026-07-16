import { invokeLegacyApi } from '../../core/api/api-client.js';

const call = (name, operation) => invokeLegacyApi(`appointments.${name}`, operation);
export const appointmentApi = Object.freeze({
  getByDateRange(start, end) { return call('getByDateRange', () => window.api.appointment.getByDateRange(start, end)); },
  getById(id) { return call('getById', () => window.api.appointment.getById(id)); },
  checkConflict(date, time, excludeId) { return call('checkConflict', () => window.api.appointment.checkConflict(date, time, excludeId)); },
  update(id, data) { return call('update', () => window.api.appointment.update(id, data)); },
  searchPatients(term) { return call('patients.search', () => window.api.patient.search(term)); },
  getPatient(id) { return call('patients.getById', () => window.api.patient.getById(id)); },
  getUsers(filters = {}) { return call('users.getAll', () => window.api.user.getAll(filters)); },
  getWaitingRoomToday() { return call('waitingRoom.getToday', () => window.api.waitingRoom.getToday()); }
});

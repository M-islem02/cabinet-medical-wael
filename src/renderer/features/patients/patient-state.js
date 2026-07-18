const state = { patients: [], filters: {}, currentPage: 1, totalPages: 1, loading: false, requestVersion: 0 };

export const patientState = Object.freeze({
  beginRequest() { state.loading = true; return ++state.requestVersion; },
  isCurrent(version) { return version === state.requestVersion; },
  finishRequest(version) { if (this.isCurrent(version)) state.loading = false; },
  setPatients(patients, pagination = {}) {
    state.patients = Array.isArray(patients) ? [...patients] : [];
    state.currentPage = Number(pagination.page || 1);
    state.totalPages = Number(pagination.totalPages || 1);
  },
  snapshot() { return Object.freeze({ ...state, patients: Object.freeze([...state.patients]), filters: Object.freeze({ ...state.filters }) }); }
});

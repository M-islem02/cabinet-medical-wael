const state = { initialized: false, active: false, range: null, requestVersion: 0 };
export const appointmentState = Object.freeze({
  initialize() { if (state.initialized) return false; state.initialized = true; return true; },
  activate() { state.active = true; },
  deactivate() { state.active = false; },
  nextRequest() { return ++state.requestVersion; },
  isCurrent(version) { return version === state.requestVersion; },
  snapshot() { return Object.freeze({ ...state }); },
  reset() { state.initialized = false; state.active = false; state.range = null; state.requestVersion += 1; }
});

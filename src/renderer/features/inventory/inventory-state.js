const state = { initialized: false, active: false, currentPage: 1, totalPages: 1 };
export const inventoryState = Object.freeze({
  initialize() { if (state.initialized) return false; state.initialized = true; return true; },
  activate() { state.active = true; }, deactivate() { state.active = false; },
  snapshot() { return Object.freeze({ ...state }); }, reset() { state.initialized = false; state.active = false; }
});

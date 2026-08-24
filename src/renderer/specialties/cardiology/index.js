let initialized = false;
export async function initialize() {
  if (initialized) return;
  await import('../../js/modules/cardiology.js');
  initialized = true;
}
export function activate() { return window.initCardiology?.(); }
export function destroy() {
  initialized = false;
  ['initCardiology', 'refreshCardiologyPatientList', 'selectCardiologyPatient', 'saveCardiologyProfile',
    'resetCardiologyProfile', 'openCardiologyReportWorkspace', 'switchCardiologyTab', 'viewCardiologyProfile',
    'openViewedCardiologyProfileInWorkspace'].forEach((name) => delete window[name]);
}

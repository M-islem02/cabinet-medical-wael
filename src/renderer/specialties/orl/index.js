let initialized = false;

export async function initialize() {
  if (initialized) return;
  await import('../../js/modules/orl.js');
  initialized = true;
}

export function activate() {
  return window.initORL?.();
}

export function destroy() {
  initialized = false;
  [
    'initORL',
    'refreshORLPatientList',
    'selectORLPatient',
    'switchORLTab',
    'saveORLProfile',
    'resetORLProfile',
    'openORLReportWorkspace',
    'showORLEmptyView',
    'showORLHistoryView',
    'showORLWizardView',
    'renderORLHistoryList',
    'syncORLIncludeToggles',
    'updateORLToolbar',
    'hasORLReportContent'
  ].forEach((name) => delete window[name]);
}

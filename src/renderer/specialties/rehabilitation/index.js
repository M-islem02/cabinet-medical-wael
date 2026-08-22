let initialized = false;
export async function initialize() {
  if (initialized) return;
  await Promise.all([
    import('../../js/modules/rehabilitation.js'),
    import('../../js/modules/kine-staff.js'),
    import('../../js/modules/daily-summary.js')
  ]);
  initialized = true;
}
export function activate() { return window.initRehabilitation?.(); }
export function destroy() {
  initialized = false;
  ['initRehabilitation', 'refreshRehabPatientList', 'selectRehabPatient', 'switchRehabTab', 'switchRehabMainTab',
    'saveRehabProfile', 'resetRehabProfile', 'resetRehabilitationProfile', 'openRehabReportWorkspace',
    'openRehabPrintPreview', 'closeRehabPrintPreview', 'triggerRehabDirectPrint', 'setRehabReportFormat',
    'regenerateRehabReportContent', 'renderRehabWysiwygReport', 'updateRehabSectionStepStatus',
    'openRehabReportHistoryModal', 'closeRehabReportHistoryModal', 'loadRehabHistoricalReport',
    'previewRehabHistoricalReport', 'deleteRehabHistoricalReport', 'createNewRehabReport',
    'toggleRehabSubject', 'isRehabSubjectIncluded', 'goToNextRehabTab', 'goToPrevRehabTab', 'goToRehabStep',
    'addCurrentRehabTabToReport', 'switchRehabSubTab', 'editRehabHistoricalReport', 'formatRehabDossierNumber',
    'loadRehabDataForPatient', 'openEvaluationModal', 'openRehabPlanModal', 'saveEvaluation', 'saveRehabPlan',
    'viewEvaluation', 'viewRehabPlan', 'printEvaluation', 'printRehabPlan', 'deleteEvaluation', 'deleteRehabPlan',
    'changeRehabBilansPage', 'changeRehabPlansPage', 'loadKineStaff',
    'openKineStaffModal', 'loadDailySummary', 'printDailySummary'].forEach((name) => delete window[name]);
}

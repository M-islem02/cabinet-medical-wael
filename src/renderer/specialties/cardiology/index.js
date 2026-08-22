let initialized = false;
export async function initialize() {
  if (initialized) return;
  await import('../../js/modules/cardiology.js');
  initialized = true;
}
export function activate() { return window.initCardiology?.(); }
export function destroy() {
  initialized = false;
  ['initCardiology', 'refreshCardiologyPatientList', 'selectCardiologyPatient', 'selectCardioPatient',
    'saveCardiologyProfile', 'resetCardiologyProfile', 'openCardiologyReportWorkspace', 'switchCardiologyTab',
    'switchCardioTab', 'viewCardiologyProfile', 'openViewedCardiologyProfileInWorkspace', 'createNewCardioReport',
    'openCardioReportHistoryModal', 'closeCardioReportHistoryModal', 'loadCardioHistoricalReport',
    'previewCardioHistoricalReport', 'deleteCardioHistoricalReport', 'editCardioHistoricalReport',
    'openCardioPrintPreview', 'closeCardioPrintPreview', 'triggerCardioDirectPrint', 'setCardioReportFormat',
    'regenerateCardioReportContent', 'renderCardioWysiwygReport', 'updateCardioSectionStepStatus',
    'toggleCardioSubject', 'isCardioSubjectIncluded', 'goToNextCardioTab', 'goToPrevCardioTab', 'goToCardioStep',
    'addCurrentCardioTabToReport', 'switchCardioSubTab', 'toggleCardioCardCollapse', 'toggleAllCardioSections',
    'formatCardioDossierNumber'].forEach((name) => delete window[name]);
}

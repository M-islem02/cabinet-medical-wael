const state = {
  currentUser: null,
  packageConfig: null,
  activeSection: 'dashboard',
  initializedFeatures: new Set()
};
const subscribers = new Set();

function notify(changedKey) {
  const snapshot = getAppState();
  subscribers.forEach((subscriber) => subscriber(snapshot, changedKey));
}

export function configureApplicationState({ currentUser, packageConfig } = {}) {
  if (currentUser !== undefined) state.currentUser = currentUser;
  if (packageConfig !== undefined) state.packageConfig = packageConfig;
  notify('configuration');
}

export function getAppState() {
  return Object.freeze({
    currentUser: state.currentUser,
    packageConfig: state.packageConfig,
    activeSection: state.activeSection,
    initializedFeatures: Object.freeze([...state.initializedFeatures])
  });
}

export const getCurrentUser = () => state.currentUser;
export const getPackageConfig = () => state.packageConfig;
export const getActiveSection = () => state.activeSection;

export function setActiveSection(sectionId) {
  state.activeSection = sectionId;
  notify('activeSection');
}

export function markFeatureInitialized(featureId) {
  state.initializedFeatures.add(featureId);
  notify('initializedFeatures');
}

export function subscribe(subscriber) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

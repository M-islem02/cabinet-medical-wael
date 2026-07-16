import '../../js/modules/calendar.js';
import { appointmentState } from './appointment-state.js';
import { registerFeatureLifecycle } from '../../core/router/section-router.js';
import { markFeatureInitialized } from '../../core/state/app-state.js';

export async function initialize() {
  if (!appointmentState.initialize()) return;
  registerFeatureLifecycle({ id: 'appointments', sectionId: 'appointments-calendar', activate, deactivate });
  markFeatureInitialized('appointments');
}
export async function activate() { appointmentState.activate(); await window.initCalendar?.(); }
export function deactivate() { appointmentState.deactivate(); }
export function destroy() { appointmentState.reset(); }

import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderAppointmentPatientOptions({ dropdown, patients, onSelect, emptyMessage = 'Aucun patient commence par cette recherche' }) {
  clearChildren(dropdown);
  if (!patients.length) {
    dropdown.appendChild(createElement('div', { className: 'searchable-select-no-results', text: emptyMessage }));
    return;
  }
  patients.forEach((patient) => {
    const label = `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim() || 'Patient';
    const option = createElement('div', { className: 'searchable-select-option', text: label });
    option.dataset.patientId = String(patient?.id || '');
    option.dataset.patientName = label;
    option.addEventListener('click', () => onSelect(patient, label));
    dropdown.appendChild(option);
  });
}

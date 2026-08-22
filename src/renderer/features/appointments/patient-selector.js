import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderAppointmentPatientOptions({ dropdown, patients, onSelect, emptyMessage = 'Aucun patient commence par cette recherche' }) {
  clearChildren(dropdown);
  const list = Array.isArray(patients) ? patients.slice(0, 10) : [];
  if (!list.length) {
    dropdown.appendChild(createElement('div', { className: 'searchable-select-no-results', text: emptyMessage }));
    return;
  }
  list.forEach((patient) => {
    const label = `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim() || 'Patient';
    const option = createElement('div', { className: 'searchable-select-option', text: label });
    option.dataset.patientId = String(patient?.id || '');
    option.dataset.patientName = label;
    const handleSelect = (event) => {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      onSelect(patient, label);
    };
    option.addEventListener('mousedown', handleSelect);
    option.addEventListener('click', handleSelect);
    dropdown.appendChild(option);
  });
}

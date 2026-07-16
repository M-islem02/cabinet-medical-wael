import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderPatientRows({ tbody, patients, onOpen, onEdit, onDelete, readOnly = false }) {
  clearChildren(tbody);
  if (!patients.length) {
    const row = createElement('tr', { className: 'empty-row' });
    const cell = createElement('td', { className: 'text-center', text: 'Aucun patient trouvé', attributes: { colspan: 6 } });
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const patient of patients) {
    const row = createElement('tr');
    row.style.cursor = readOnly ? 'default' : 'pointer';
    const values = [
      patient.lastName || '', patient.firstName || '',
      patient.dateOfBirth ? window.formatDateToDDMMYYYY(patient.dateOfBirth) : '-',
      patient.socialSecurityNumber || '-', patient.phone || '-'
    ];
    values.forEach((value) => row.appendChild(createElement('td', { text: value })));
    const actions = createElement('td');
    if (readOnly) {
      actions.appendChild(createElement('span', { text: 'Lecture seule' }));
    } else {
      const wrapper = createElement('div', { className: 'patients-table-actions' });
      const edit = createElement('button', { className: 'btn btn-small btn-primary patient-table-action', text: 'Modifier' });
      const remove = createElement('button', { className: 'btn btn-small btn-danger patient-table-action', text: 'Supprimer' });
      edit.addEventListener('click', (event) => { event.stopPropagation(); onEdit(patient.id); });
      remove.addEventListener('click', (event) => { event.stopPropagation(); onDelete(patient.id); });
      wrapper.append(edit, remove);
      actions.appendChild(wrapper);
      row.addEventListener('click', () => onOpen(patient.id));
    }
    row.appendChild(actions);
    tbody.appendChild(row);
  }
}

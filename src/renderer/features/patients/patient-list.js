import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderPatientRows({
  tbody,
  patients,
  onOpen,
  onEdit,
  onDelete,
  onAttach,
  onDetach,
  readOnly = false,
  directory = false,
  multiPractitioner = false
}) {
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
    row.style.cursor = readOnly || directory ? 'default' : 'pointer';
    const values = directory
      ? [
          patient.lastName || '', patient.firstName || '',
          patient.dateOfBirth ? window.formatDateToDDMMYYYY(patient.dateOfBirth) : '-',
          patient.assignedDoctors || 'Non rattaché', patient.phone || '-'
        ]
      : [
          patient.lastName || '', patient.firstName || '',
          patient.dateOfBirth ? window.formatDateToDDMMYYYY(patient.dateOfBirth) : '-',
          patient.socialSecurityNumber || '-', patient.phone || '-'
        ];
    values.forEach((value) => row.appendChild(createElement('td', { text: value })));
    const actions = createElement('td');
    if (directory) {
      const action = createElement('button', {
        className: `btn btn-small patient-table-action ${patient.isAssigned ? 'btn-secondary' : 'btn-primary'}`,
        text: patient.isAssigned ? 'Déjà ajouté' : 'Ajouter à ma liste',
        attributes: patient.isAssigned ? { disabled: 'disabled' } : {}
      });
      if (!patient.isAssigned) action.addEventListener('click', () => onAttach?.(patient.id));
      actions.appendChild(action);
    } else if (readOnly) {
      actions.appendChild(createElement('span', { text: 'Lecture seule' }));
    } else {
      const wrapper = createElement('div', { className: 'patients-table-actions' });
      const edit = createElement('button', { className: 'btn btn-small btn-primary patient-table-action', text: 'Modifier' });
      const remove = createElement('button', {
        className: 'btn btn-small btn-danger patient-table-action',
        text: multiPractitioner ? 'Retirer de ma liste' : 'Supprimer'
      });
      edit.addEventListener('click', (event) => { event.stopPropagation(); onEdit(patient.id); });
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        (multiPractitioner ? onDetach : onDelete)?.(patient.id);
      });
      wrapper.append(edit, remove);
      actions.appendChild(wrapper);
      row.addEventListener('click', () => onOpen(patient.id));
    }
    row.appendChild(actions);
    tbody.appendChild(row);
  }
}

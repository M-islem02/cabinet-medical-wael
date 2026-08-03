import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderPatientRows({
  tbody,
  patients,
  onOpen,
  onEdit,
  onDelete,
  onAttach,
  onDetach,
  onToggleSelection,
  onAppointment,
  onAppointmentsHistory,
  readOnly = false,
  directory = false,
  multiPractitioner = false,
  selectable = false,
  assistantActions = false,
  selectedPatientIds = new Set()
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
      const wrapper = createElement('div', { className: 'patients-table-actions' });
      if (selectable && !patient.isAssigned) {
        const label = createElement('label', { className: 'patient-assignment-checkbox' });
        const checkbox = createElement('input', {
          attributes: { type: 'checkbox', 'aria-label': `Ajouter ${patient.firstName || ''} ${patient.lastName || ''} à la liste du médecin` }
        });
        checkbox.checked = selectedPatientIds.has(patient.id);
        checkbox.addEventListener('change', () => onToggleSelection?.(patient.id, checkbox.checked));
        label.append(checkbox, createElement('span', { text: 'Sélectionner' }));
        wrapper.appendChild(label);
      } else {
        const action = createElement('button', {
          className: `btn btn-small patient-table-action ${patient.isAssigned ? 'btn-secondary' : 'btn-primary'}`,
          text: patient.isAssigned ? 'Déjà ajouté' : 'Ajouter à ma liste',
          attributes: patient.isAssigned ? { disabled: 'disabled' } : {}
        });
        if (!patient.isAssigned) action.addEventListener('click', () => onAttach?.(patient.id));
        wrapper.appendChild(action);
      }
      if (assistantActions) {
        const edit = createElement('button', { className: 'btn btn-small btn-primary patient-table-action', text: 'Modifier' });
        const appointment = createElement('button', { className: 'btn btn-small btn-secondary patient-table-action', text: 'RDV' });
        const history = createElement('button', { className: 'btn btn-small btn-secondary patient-table-action', text: 'Historique RDV' });
        edit.addEventListener('click', () => onEdit?.(patient.id));
        appointment.addEventListener('click', () => onAppointment?.(patient.id));
        history.addEventListener('click', () => onAppointmentsHistory?.(patient.id));
        wrapper.append(edit, appointment, history);
      }
      actions.appendChild(wrapper);
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

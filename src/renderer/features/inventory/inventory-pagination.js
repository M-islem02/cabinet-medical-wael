import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderInventoryPaginationView({ container, pagination, onPageChange }) {
  clearChildren(container);
  const { page = 1, pageSize = 12, total = 0, totalPages = 1 } = pagination || {};
  if (total <= pageSize && totalPages <= 1) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  container.style.justifyContent = 'space-between';
  container.style.alignItems = 'center';
  container.style.width = '100%';

  const start = ((page - 1) * pageSize) + 1;
  const end = Math.min(page * pageSize, total);

  const info = createElement('div', {
    className: 'patients-pagination-info',
    text: `Affichage de ${start} à ${end} sur ${total} articles`
  });
  info.style.fontSize = '13px';
  info.style.fontWeight = '500';
  info.style.color = '#64748b';

  const actions = createElement('div', { className: 'patients-pagination-actions' });
  actions.style.display = 'flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '8px';

  const previous = createElement('button', {
    className: 'btn btn-small btn-secondary',
    text: '◀ Précédent'
  });
  previous.style.height = '32px';
  previous.style.padding = '0 12px';
  previous.style.fontSize = '12.5px';
  previous.disabled = page <= 1;
  previous.addEventListener('click', () => onPageChange(-1));

  const label = createElement('span', {
    className: 'patients-pagination-info',
    text: `Page ${page} / ${totalPages}`
  });
  label.style.fontSize = '12.5px';
  label.style.fontWeight = '600';
  label.style.color = '#334155';
  label.style.padding = '0 6px';

  const next = createElement('button', {
    className: 'btn btn-small btn-secondary',
    text: 'Suivant ▶'
  });
  next.style.height = '32px';
  next.style.padding = '0 12px';
  next.style.fontSize = '12.5px';
  next.disabled = page >= totalPages;
  next.addEventListener('click', () => onPageChange(1));

  actions.append(previous, label, next);
  container.append(info, actions);
}

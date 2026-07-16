import { clearChildren, createElement } from '../../shared/utils/dom.js';

export function renderInventoryPaginationView({ container, pagination, onPageChange }) {
  clearChildren(container);
  const { page = 1, pageSize = 20, total = 0, totalPages = 1 } = pagination || {};
  if (total <= pageSize) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  const start = ((page - 1) * pageSize) + 1;
  const end = Math.min(page * pageSize, total);
  container.appendChild(createElement('div', { className: 'patients-pagination-info', text: `Affichage ${start}-${end} sur ${total} articles` }));
  const actions = createElement('div', { className: 'patients-pagination-actions' });
  const previous = createElement('button', { className: 'btn btn-small btn-secondary', text: 'Précédent' });
  previous.disabled = page <= 1;
  previous.addEventListener('click', () => onPageChange(-1));
  const label = createElement('span', { className: 'patients-pagination-info', text: `Page ${page} / ${totalPages}` });
  const next = createElement('button', { className: 'btn btn-small btn-secondary', text: 'Suivant' });
  next.disabled = page >= totalPages;
  next.addEventListener('click', () => onPageChange(1));
  actions.append(previous, label, next);
  container.appendChild(actions);
}
